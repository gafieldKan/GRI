#!/usr/bin/env bash
# P2-T12 verification: deployment health check + CI hardening.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

HEALTH_SCRIPT="$ROOT/scripts/health-check.sh"
CI_WORKFLOW="$ROOT/.github/workflows/ci-cd.yml"
MONOREPO_WORKFLOW="$ROOT/.github/workflows/monorepo-ci.yml"

PASS=0
FAIL=0
SKIP=0

pass() { PASS=$((PASS + 1)); echo "  PASS  $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  FAIL  $1"; }
skip() { SKIP=$((SKIP + 1)); echo "  SKIP  $1"; }

assert_contains() {
  local description="$1"
  local file="$2"
  local pattern="$3"
  if grep -Eq "$pattern" "$file" 2>/dev/null; then
    pass "$description"
  else
    fail "$description (missing /$pattern/ in $file)"
  fi
}

http_probe() {
  local path="$1"
  local body_file
  body_file="$(mktemp)"
  HTTP_CODE="$(curl -sS -k -L --connect-timeout 3 --max-time 8 \
    -o "$body_file" -w '%{http_code}' "http://localhost${path}" 2>/dev/null || true)"
  HTTP_CODE="${HTTP_CODE:-000}"
  HTTP_BODY="$(cat "$body_file" 2>/dev/null || true)"
  rm -f "$body_file"
}

echo "== P2-T12 verification =="

echo "== 1. health-check.sh static checks =="
if [ -f "$HEALTH_SCRIPT" ]; then
  pass "scripts/health-check.sh exists"
else
  fail "scripts/health-check.sh is missing"
fi
if [ -x "$HEALTH_SCRIPT" ]; then
  pass "scripts/health-check.sh is executable"
else
  fail "scripts/health-check.sh is not executable"
fi
if bash -n "$HEALTH_SCRIPT" 2>/dev/null; then
  pass "bash -n scripts/health-check.sh"
else
  fail "bash -n scripts/health-check.sh"
fi
if grep -Eq '(^|[[:space:]])(-X|--request)[[:space:]]+(POST|PUT|PATCH|DELETE)' "$HEALTH_SCRIPT" ||
  grep -Eq '(^|[[:space:]])--data(-raw|-binary|-urlencode)?([[:space:]]|=)' "$HEALTH_SCRIPT"; then
  fail "health check must not contain mutating HTTP requests"
else
  pass "health check is GET-only (no POST/PUT/PATCH/DELETE/data flags)"
fi

echo "== 2. live read-only health check =="
HC_OUTPUT="$(bash "$HEALTH_SCRIPT" 2>&1)"
HC_RC=$?
printf '%s\n' "$HC_OUTPUT"
HC_SUMMARY="$(printf '%s\n' "$HC_OUTPUT" | grep -E '^PASS=[0-9]+ FAIL=[0-9]+ SKIP=[0-9]+ WARN=[0-9]+$' | tail -n1 || true)"
HC_PASS="$(printf '%s' "$HC_SUMMARY" | sed -n 's/^PASS=\([0-9]*\).*/\1/p')"
HC_FAIL="$(printf '%s' "$HC_SUMMARY" | sed -n 's/.*FAIL=\([0-9]*\).*/\1/p')"
if [ "$HC_RC" -eq 0 ] && [ -n "$HC_PASS" ] && [ "$HC_PASS" -gt 0 ] && [ "$HC_FAIL" = "0" ]; then
  pass "health check PASS=$HC_PASS FAIL=0 exit=0"
else
  fail "health check expected PASS>0 FAIL=0 exit=0; got rc=$HC_RC summary=${HC_SUMMARY:-<missing>}"
fi

NEG_OUTPUT="$(GATEWAY_BASE_URL=http://127.0.0.1:1 CURL_CONNECT_TIMEOUT=1 CURL_MAX_TIME=1 bash "$HEALTH_SCRIPT" 2>&1)"
NEG_RC=$?
NEG_SUMMARY="$(printf '%s\n' "$NEG_OUTPUT" | grep -E '^PASS=[0-9]+ FAIL=[0-9]+ SKIP=[0-9]+ WARN=[0-9]+$' | tail -n1 || true)"
NEG_FAIL="$(printf '%s' "$NEG_SUMMARY" | sed -n 's/.*FAIL=\([0-9]*\).*/\1/p')"
if [ "$NEG_RC" -ne 0 ] && [ -n "$NEG_FAIL" ] && [ "$NEG_FAIL" -gt 0 ]; then
  pass "health check exits nonzero when gateway is unreachable"
else
  fail "health check should exit nonzero when gateway is unreachable; got rc=$NEG_RC summary=${NEG_SUMMARY:-<missing>}"
fi

echo "== 3. workflow YAML and CI gates =="
for workflow in "$CI_WORKFLOW" "$MONOREPO_WORKFLOW"; do
  if python3 - "$workflow" <<'PY'
import sys
import yaml

with open(sys.argv[1], encoding="utf-8") as stream:
    document = yaml.safe_load(stream)
if not isinstance(document, dict):
    raise SystemExit(1)
PY
  then
    pass "YAML valid: ${workflow#$ROOT/}"
  else
    fail "YAML invalid: ${workflow#$ROOT/}"
  fi
done

assert_contains "ci-cd delegates to monorepo workflow" "$CI_WORKFLOW" 'uses: \./\.github/workflows/monorepo-ci\.yml'
assert_contains "monorepo workflow has tsc gate" "$MONOREPO_WORKFLOW" 'npx tsc --noEmit -p'
assert_contains "monorepo workflow has API Jest gate" "$MONOREPO_WORKFLOW" 'npm run test --workspace=gri-api'
assert_contains "monorepo workflow has auth-center Jest gate" "$MONOREPO_WORKFLOW" 'npm run test --workspace=gri-auth-center'
assert_contains "monorepo workflow has Docker API build gate" "$MONOREPO_WORKFLOW" 'docker build -f services/api/Dockerfile'
assert_contains "monorepo workflow has Docker auth-center build gate" "$MONOREPO_WORKFLOW" 'docker build -f services/auth-center/Dockerfile'
assert_contains "monorepo workflow has migration bootstrap gate" "$MONOREPO_WORKFLOW" 'run-migrations\.js'
if grep -Eqi 'auth-center.*(down|remove|disable|stop)' "$CI_WORKFLOW" "$MONOREPO_WORKFLOW"; then
  fail "workflow contains an auth-center shutdown/removal instruction"
else
  pass "auth-center remains enabled in workflows"
fi

workflow_count="$(find .github/workflows -maxdepth 1 -type f \( -name '*.yml' -o -name '*.yaml' \) | wc -l | tr -d '[:space:]')"
if [ "$workflow_count" = "2" ]; then
  pass "only the two existing workflow files are present"
else
  fail "unexpected workflow file count: $workflow_count"
fi

echo "== 4. scope and topology checks =="
hardcoded_count="$(grep -RIlE 'localhost:300[458]' apps/*/src 2>/dev/null | wc -l | tr -d '[:space:]')"
if [ "$hardcoded_count" = "0" ]; then
  pass "no frontend localhost:300[458] hardcoding"
else
  fail "frontend localhost:300[458] hardcoding count=$hardcoded_count"
fi

compose_services="$(python3 - <<'PY'
import yaml

with open("docker-compose.yml", encoding="utf-8") as stream:
    document = yaml.safe_load(stream)
print(" ".join(sorted(document.get("services", {}).keys())))
PY
)"
expected_services="api auth-center nginx portal postgres postgres-auth redis web web-ai-tutor"
if [ "$compose_services" = "$expected_services" ]; then
  pass "docker-compose service set is unchanged (9 services)"
else
  fail "docker-compose service set mismatch: $compose_services"
fi

if command -v docker >/dev/null 2>&1; then
  COMPOSE_PS="$(docker compose ps --format json 2>&1 || true)"
  if printf '%s' "$COMPOSE_PS" | grep -q 'permission denied'; then
    skip "docker socket unavailable; container presence check skipped"
  else
    for service in api auth-center nginx postgres postgres-auth redis; do
      if printf '%s' "$COMPOSE_PS" | grep -q "\"Service\":\"${service}\""; then
        pass "docker compose contains ${service}"
      else
        fail "docker compose is missing ${service}"
      fi
    done
  fi
else
  skip "docker CLI unavailable; container presence check skipped"
fi

echo "== 5. API health contract compatibility =="
http_probe "/api/health"
if [ "$HTTP_CODE" = "200" ] && printf '%s' "$HTTP_BODY" | grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"'; then
  pass "GET /api/health -> 200 status=ok"
else
  api_alias_code="$HTTP_CODE"
  http_probe "/health"
  if [ "$HTTP_CODE" = "200" ] && printf '%s' "$HTTP_BODY" | grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"'; then
    pass "GET /health -> 200 status=ok (canonical API contract; /api/health returned ${api_alias_code})"
  else
    fail "GET /api/health and GET /health did not return status=ok"
  fi
fi

echo
if [ "$FAIL" -eq 0 ]; then
  echo "全绿：PASS=$PASS FAIL=$FAIL SKIP=$SKIP"
  exit 0
fi

echo "未全绿：PASS=$PASS FAIL=$FAIL SKIP=$SKIP"
exit 1
