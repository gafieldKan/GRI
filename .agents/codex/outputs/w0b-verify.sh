#!/usr/bin/env bash
# W0-b verification: deploy freshness guard and learning-chain health probe.
set -u -o pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT_DIR"

FRESHNESS="$ROOT_DIR/scripts/deploy-freshness.sh"
HEALTH="$ROOT_DIR/scripts/health-check.sh"
PROBE="$ROOT_DIR/services/api/.w0b-freshness-probe.$$"
TMP_DIR="$(mktemp -d /tmp/w0b-verify.XXXXXX)"
FAKE_PID=""
HEAD_START="$(git rev-parse HEAD)"
BRANCH_START="$(git branch --show-current)"

PASS=0
FAIL=0

pass() { PASS=$((PASS + 1)); printf 'PASS  %s\n' "$1"; }
fail() { FAIL=$((FAIL + 1)); printf 'FAIL  %s\n' "$1"; }

cleanup() {
  rm -f "$PROBE"
  if [ -n "$FAKE_PID" ]; then
    kill "$FAKE_PID" 2>/dev/null || true
    wait "$FAKE_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT INT TERM

summary() {
  local output="$1"
  printf '%s\n' "$output" | sed -n 's/^STALE=\([0-9][0-9]*\) FRESH=\([0-9][0-9]*\)$/\1 \2/p' | tail -1
}

check_summary() {
  local output="$1"
  local expected="$2"
  local label="$3"
  local actual
  actual="$(summary "$output")"
  if [ "$actual" = "$expected" ]; then
    pass "$label"
  else
    fail "$label (expected '$expected', got '${actual:-missing}')"
  fi
}

echo "== W0-b deploy freshness guard =="

if [ -f "$FRESHNESS" ]; then
  pass "scripts/deploy-freshness.sh exists"
else
  fail "scripts/deploy-freshness.sh is missing"
fi

if [ -f "$HEALTH" ]; then
  pass "scripts/health-check.sh exists"
else
  fail "scripts/health-check.sh is missing"
fi

if [ -f "$FRESHNESS" ]; then
  image_before="$(docker inspect gri-api --format '{{.Image}}' 2>/dev/null || true)"
  container_before="$(docker inspect gri-api --format '{{.Id}}' 2>/dev/null || true)"

  set +e
  base_out="$(bash "$FRESHNESS" 2>&1)"
  base_rc=$?
  set -e
  check_summary "$base_out" "0 5" "baseline reports STALE=0 FRESH=5"
  if [ "$base_rc" -eq 0 ]; then
    pass "baseline exits 0"
  else
    fail "baseline exits 0 (got $base_rc)"
  fi
  if printf '%s\n' "$base_out" | grep -Eq '^STALE=[0-9]+ FRESH=[0-9]+$'; then
    pass "baseline summary is machine-readable"
  else
    fail "baseline summary is machine-readable"
  fi
  status_lines="$(printf '%s\n' "$base_out" | grep -Ec '^(STALE|FRESH) ' || true)"
  if [ "$status_lines" -eq 5 ]; then
    pass "baseline reports exactly five services"
  else
    fail "baseline reports exactly five services (got $status_lines)"
  fi

  image_after="$(docker inspect gri-api --format '{{.Image}}' 2>/dev/null || true)"
  container_after="$(docker inspect gri-api --format '{{.Id}}' 2>/dev/null || true)"
  if [ "$image_before" = "$image_after" ] && [ "$container_before" = "$container_after" ]; then
    pass "default run does not mutate the api container"
  else
    fail "default run does not mutate the api container"
  fi

  : >"$PROBE"
  set +e
  stale_out="$(bash "$FRESHNESS" 2>&1)"
  stale_rc=$?
  set -e
  if [ "$stale_rc" -eq 1 ] && printf '%s\n' "$stale_out" | grep -Eq '^STALE api .+'; then
    pass "uncommitted api change is detected as STALE"
  else
    fail "uncommitted api change is detected as STALE"
  fi
  if printf '%s\n' "$stale_out" | grep -Fxq 'FIX docker compose -f docker-compose.yml build --no-cache api && docker compose -f docker-compose.yml up -d --no-deps api'; then
    pass "STALE api prints a copyable repair command"
  else
    fail "STALE api prints a copyable repair command"
  fi

  image_created_before="$(
    docker inspect "$(docker inspect gri-api --format '{{.Image}}')" \
      --format '{{.Created}}' 2>/dev/null || true
  )"
  set +e
  fixed_out="$(bash "$FRESHNESS" --fix 2>&1)"
  fixed_rc=$?
  set -e
  image_created_after="$(
    docker inspect "$(docker inspect gri-api --format '{{.Image}}')" \
      --format '{{.Created}}' 2>/dev/null || true
  )"

  if [ "$fixed_rc" -eq 1 ] &&
    printf '%s\n' "$fixed_out" | grep -Eq '^STALE api uncommitted changes'; then
    pass "--fix preserves the uncommitted-change STALE gate and exits 1"
  else
    fail "--fix preserves the uncommitted-change STALE gate and exits 1 (got $fixed_rc)"
  fi
  if [ -n "$image_created_before" ] &&
    [ -n "$image_created_after" ] &&
    [ "$image_created_before" != "$image_created_after" ]; then
    pass "--fix rebuilds the stale api image"
  else
    fail "--fix rebuilds the stale api image"
  fi

  rm -f "$PROBE"
  set +e
  repaired_out="$(bash "$FRESHNESS" 2>&1)"
  repaired_rc=$?
  set -e
  check_summary "$repaired_out" "0 5" "post-repair scan returns to STALE=0 FRESH=5"
  if [ "$repaired_rc" -eq 0 ]; then
    pass "post-repair scan exits 0"
  else
    fail "post-repair scan exits 0 (got $repaired_rc)"
  fi
fi

echo
echo "== W0-b health-check learning-chain probe =="

if [ -f "$HEALTH" ]; then
  node -e '
    const http = require("http");
    const server = http.createServer((req, res) => {
      res.statusCode = 404;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ statusCode: 404, message: "Cannot GET " + req.url }));
    });
    server.listen(0, "127.0.0.1", () => console.log(server.address().port));
  ' >"$TMP_DIR/fake.port" 2>"$TMP_DIR/fake.log" &
  FAKE_PID=$!

  for _ in $(seq 1 40); do
    [ -s "$TMP_DIR/fake.port" ] && break
    sleep 0.1
  done
  fake_port="$(head -1 "$TMP_DIR/fake.port" 2>/dev/null || true)"

  if [ -n "$fake_port" ]; then
    set +e
    fake_out="$(GATEWAY_BASE_URL="http://127.0.0.1:$fake_port" bash "$HEALTH" 2>&1)"
    fake_rc=$?
    set -e
    if [ "$fake_rc" -ne 0 ] &&
      printf '%s\n' "$fake_out" |
        grep -Eq '^FAIL  GET /api/curriculum/learning-chain.*HTTP 404.*(stale|missing)'; then
      pass "old-api 404 makes the learning-chain probe FAIL"
    else
      fail "old-api 404 makes the learning-chain probe FAIL"
    fi
  else
    fail "fake old-api server starts"
  fi

  live_ready=0
  for _ in $(seq 1 40); do
    if curl -fsSkL --max-time 3 \
      "${GATEWAY_BASE_URL:-http://localhost}/health" >/dev/null 2>&1; then
      live_ready=1
      break
    fi
    sleep 1
  done
  if [ "$live_ready" -eq 1 ]; then
    pass "live api is ready after repair"
  else
    fail "live api is ready after repair"
  fi

  set +e
  live_out="$(GATEWAY_BASE_URL="${GATEWAY_BASE_URL:-http://localhost}" bash "$HEALTH" 2>&1)"
  live_rc=$?
  set -e
  if [ "$live_rc" -eq 0 ] &&
    printf '%s\n' "$live_out" |
      grep -Eq '^PASS  GET /api/curriculum/learning-chain.*-> HTTP (200|401)'; then
    pass "live api reports learning-chain probe PASS"
  else
    fail "live api reports learning-chain probe PASS"
    printf '%s\n' "$live_out" | tail -8 | sed 's/^/      /'
  fi
fi

echo
echo "== W0-b constraints =="

if rg -n -g 'deploy-freshness.sh' -g 'health-check.sh' -g 'w0b-verify.sh' \
  'Bearer [A-Za-z0-9][A-Za-z0-9._-]+' scripts .agents/codex/outputs >/dev/null 2>&1; then
  fail "no token literal is present"
else
  pass "no token literal is present"
fi

if rg -n 'git (commit|checkout|push)' "$FRESHNESS" "$HEALTH" >/dev/null 2>&1; then
  fail "guard scripts contain no commit/checkout/push commands"
else
  pass "guard scripts contain no commit/checkout/push commands"
fi

head_end="$(git rev-parse HEAD)"
branch_end="$(git branch --show-current)"
if [ "$HEAD_START" = "$head_end" ] && [ "$BRANCH_START" = "$branch_end" ]; then
  pass "verification did not commit or checkout"
else
  fail "verification did not commit or checkout"
fi

echo
echo "PASS=${PASS}"
echo "FAIL=${FAIL}"
exit "$FAIL"
