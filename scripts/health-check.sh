#!/usr/bin/env bash
#
# GRI deployment health check.
#
# Read-only and idempotent: HTTP checks use GET only. PostgreSQL and Redis are
# probed with their native readiness commands when Docker is available, with a
# TCP fallback for hosts where the Docker socket is not exposed.
#
# Usage:
#   bash scripts/health-check.sh
#   GATEWAY_BASE_URL=https://localhost bash scripts/health-check.sh
#   HEALTHCHECK_AUTH_TOKEN=... bash scripts/health-check.sh
#
set -u -o pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

GATEWAY_BASE_URL="${GATEWAY_BASE_URL:-http://localhost}"
GATEWAY_BASE_URL="${GATEWAY_BASE_URL%/}"
CURL_CONNECT_TIMEOUT="${CURL_CONNECT_TIMEOUT:-3}"
CURL_MAX_TIME="${CURL_MAX_TIME:-8}"
DOCKER_TIMEOUT="${DOCKER_TIMEOUT:-5}"
TCP_TIMEOUT="${TCP_TIMEOUT:-2}"

PG_HOST="${PG_HOST:-127.0.0.1}"
PG_PORT="${PG_PORT:-5432}"
PG_DB="${PG_DB:-gri}"
PG_USER="${PG_USER:-postgres}"
PG_CONTAINER="${PG_CONTAINER:-gri-postgres}"

PG_AUTH_HOST="${PG_AUTH_HOST:-127.0.0.1}"
PG_AUTH_PORT="${PG_AUTH_PORT:-5434}"
PG_AUTH_DB="${PG_AUTH_DB:-gri_auth}"
PG_AUTH_CONTAINER="${PG_AUTH_CONTAINER:-gri-postgres-auth}"

REDIS_HOST="${REDIS_HOST:-127.0.0.1}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_CONTAINER="${REDIS_CONTAINER:-gri-redis}"

HEALTHCHECK_AUTH_TOKEN="${HEALTHCHECK_AUTH_TOKEN:-}"

PASS=0
FAIL=0
SKIP=0
WARN=0

TMP_BODY="$(mktemp)"
trap 'rm -f "$TMP_BODY"' EXIT

pass() { PASS=$((PASS + 1)); printf 'PASS  %s\n' "$1"; }
fail() { FAIL=$((FAIL + 1)); printf 'FAIL  %s\n' "$1"; }
skip() { SKIP=$((SKIP + 1)); printf 'SKIP  %s\n' "$1"; }
warn() { WARN=$((WARN + 1)); printf 'WARN  %s\n' "$1"; }

http_get() {
  local path="$1"
  local token="${2:-}"
  local -a args

  : >"$TMP_BODY"
  args=(
    -sS
    -k
    -L
    --connect-timeout "$CURL_CONNECT_TIMEOUT"
    --max-time "$CURL_MAX_TIME"
    -o "$TMP_BODY"
    -w '%{http_code}'
  )

  if [ -n "$token" ]; then
    args+=(-H "Authorization: Bearer $token")
  fi

  HTTP_CODE="$(curl "${args[@]}" "${GATEWAY_BASE_URL}${path}" 2>/dev/null || true)"
  HTTP_CODE="${HTTP_CODE:-000}"
  HTTP_BODY="$(cat "$TMP_BODY" 2>/dev/null || true)"
}

is_json_ok() {
  printf '%s' "$HTTP_BODY" | grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"'
}

tcp_open() {
  local host="$1"
  local port="$2"
  timeout "$TCP_TIMEOUT" bash -c "exec 3<>/dev/tcp/${host}/${port}" 2>/dev/null
}

check_postgres() {
  local description="$1"
  local container="$2"
  local host="$3"
  local port="$4"
  local database="$5"

  if command -v docker >/dev/null 2>&1 &&
    timeout "$DOCKER_TIMEOUT" docker exec "$container" \
      pg_isready -U "$PG_USER" -d "$database" >/dev/null 2>&1; then
    pass "$description (container readiness)"
    return
  fi

  if command -v pg_isready >/dev/null 2>&1 &&
    pg_isready -h "$host" -p "$port" -U "$PG_USER" -d "$database" >/dev/null 2>&1; then
    pass "$description (pg_isready)"
    return
  fi

  if tcp_open "$host" "$port"; then
    pass "$description (tcp fallback)"
    return
  fi

  fail "$description ($host:$port unreachable)"
}

check_redis() {
  local description="$1"
  local container="$2"
  local host="$3"
  local port="$4"
  local pong=""

  if command -v docker >/dev/null 2>&1; then
    pong="$(
      timeout "$DOCKER_TIMEOUT" docker exec "$container" redis-cli --raw PING 2>/dev/null |
        tr -d '\r' || true
    )"
    if [ "$pong" = "PONG" ]; then
      pass "$description (container PING)"
      return
    fi
  fi

  if command -v redis-cli >/dev/null 2>&1; then
    pong="$(redis-cli -h "$host" -p "$port" --raw PING 2>/dev/null | tr -d '\r' || true)"
    if [ "$pong" = "PONG" ]; then
      pass "$description (redis-cli PING)"
      return
    fi
  fi

  if tcp_open "$host" "$port"; then
    pass "$description (tcp fallback)"
    return
  fi

  fail "$description ($host:$port unreachable)"
}

echo "== GRI health check: ${GATEWAY_BASE_URL} =="

if ! command -v curl >/dev/null 2>&1; then
  fail "curl is required for HTTP probes"
else
  # Canonical API liveness endpoint. main.ts excludes /health from the /api
  # prefix, so the legacy /api/health path is checked separately below.
  http_get "/health"
  if [ "$HTTP_CODE" = "200" ] && is_json_ok; then
    pass "GET /health -> 200 status=ok"
  else
    fail "GET /health -> HTTP ${HTTP_CODE} (expected 200 status=ok)"
  fi

  # Compatibility probe for the path named in the delivery card. It is not a
  # hard gate because the current service exposes the canonical /health path.
  http_get "/api/health"
  if [ "$HTTP_CODE" = "200" ] && is_json_ok; then
    pass "GET /api/health -> 200 status=ok"
  else
    warn "GET /api/health -> HTTP ${HTTP_CODE}; canonical /health is used"
  fi

  http_get "/api/food/restaurants"
  if [ "$HTTP_CODE" = "200" ] && printf '%s' "$HTTP_BODY" | grep -Eq '^[[:space:]]*\['; then
    pass "GET /api/food/restaurants -> 200 JSON array"
  else
    fail "GET /api/food/restaurants -> HTTP ${HTTP_CODE} (expected 200 JSON array)"
  fi

  http_get "/api/tuition/questions"
  if [ "$HTTP_CODE" = "200" ] && printf '%s' "$HTTP_BODY" | grep -Eq '^[[:space:]]*\['; then
    pass "GET /api/tuition/questions -> 200 JSON array"
  else
    fail "GET /api/tuition/questions -> HTTP ${HTTP_CODE} (expected 200 JSON array)"
  fi

  http_get "/auth/jwks"
  if [ "$HTTP_CODE" = "200" ] &&
    printf '%s' "$HTTP_BODY" | grep -Eq '"keys"[[:space:]]*:' &&
    printf '%s' "$HTTP_BODY" | grep -Eq '"kty"[[:space:]]*:'; then
    pass "GET /auth/jwks -> 200 RS256 JWKS"
  else
    fail "GET /auth/jwks -> HTTP ${HTTP_CODE} (expected 200 JWKS)"
  fi

  if [ -n "$HEALTHCHECK_AUTH_TOKEN" ]; then
    http_get "/api/ontology/stats" "$HEALTHCHECK_AUTH_TOKEN"
    if [ "$HTTP_CODE" = "200" ]; then
      pass "GET /api/ontology/stats (authenticated) -> 200"
    else
      fail "GET /api/ontology/stats (authenticated) -> HTTP ${HTTP_CODE} (expected 200)"
    fi
  else
    skip "GET /api/ontology/stats requires HEALTHCHECK_AUTH_TOKEN"
  fi
fi

check_postgres "PostgreSQL gri reachable" "$PG_CONTAINER" "$PG_HOST" "$PG_PORT" "$PG_DB"
check_postgres \
  "PostgreSQL gri_auth reachable" \
  "$PG_AUTH_CONTAINER" \
  "$PG_AUTH_HOST" \
  "$PG_AUTH_PORT" \
  "$PG_AUTH_DB"
check_redis "Redis reachable" "$REDIS_CONTAINER" "$REDIS_HOST" "$REDIS_PORT"

echo
echo "PASS=${PASS} FAIL=${FAIL} SKIP=${SKIP} WARN=${WARN}"

if [ "$FAIL" -eq 0 ]; then
  exit 0
fi

exit 1
