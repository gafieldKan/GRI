#!/usr/bin/env bash
# W1 verification for the human-world kernel.
#
# This script intentionally keeps credentials out of stdout and command lines:
# - API/DB/Redis values inherited from the environment are not echoed.
# - The temporary smoke account is removed through its normal API path.
# - Redis is restored in the EXIT trap even when a check fails.
set -uo pipefail

ROOT="${GRI_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
cd "$ROOT" || exit 1

API_PORT="${W1_API_PORT:-3022}"
API_BASE="http://127.0.0.1:${API_PORT}/api"
API_CONTAINER="${GRI_API_CONTAINER:-gri-api}"
DB_CONTAINER="${GRI_DB_CONTAINER:-gri-postgres}"
REDIS_CONTAINER="${GRI_REDIS_CONTAINER:-gri-redis}"
DB_NAME="${GRI_DB_NAME:-gri}"
EXPECTED_SUITES=46
EXPECTED_TESTS=619

REDIS_PASSWORD="${REDIS_PASSWORD:-}"
export REDIS_PASSWORD

PASS=0
FAIL=0
SKIP=0
TMP_DIR="$(mktemp -d)"
RUN_ID="$(date +%s)_$$"
RUN_USER="w1verify_${RUN_ID}"
RUN_PASS="W1-Verify-${RUN_ID}-Pass"
TOKEN=""
ORG_ID=""
ORG_ID_2=""
USER_ID=""
API_PID=""
REDIS_STOPPED=0

pass() { PASS=$((PASS + 1)); echo "  PASS  $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  FAIL  $1"; }
skip() { SKIP=$((SKIP + 1)); echo "  SKIP  $1"; }

docker_exec() {
  docker exec "$@"
}

redis_cli() {
  docker exec "$REDIS_CONTAINER" sh -c '
    if [ -n "${REDIS_PASSWORD:-}" ]; then
      export REDISCLI_AUTH="$REDIS_PASSWORD"
    else
      unset REDISCLI_AUTH
    fi
    exec redis-cli "$@"
  ' sh "$@"
}

wait_redis() {
  local i
  for i in $(seq 1 20); do
    if redis_cli ping 2>/dev/null | grep -q '^PONG$'; then
      return 0
    fi
    sleep 1
  done
  return 1
}

cleanup() {
  if [ "$REDIS_STOPPED" = "1" ]; then
    docker start "$REDIS_CONTAINER" >/dev/null 2>&1 || true
    wait_redis >/dev/null 2>&1 || true
    REDIS_STOPPED=0
  fi
  if [ -n "$ORG_ID" ] && [ -n "$TOKEN" ]; then
    curl -sS --max-time 15 -X DELETE \
      -H "Authorization: Bearer $TOKEN" \
      "$API_BASE/organizations/$ORG_ID" >/dev/null 2>&1 || true
  fi
  if [ -n "$ORG_ID_2" ] && [ -n "$TOKEN" ]; then
    curl -sS --max-time 15 -X DELETE \
      -H "Authorization: Bearer $TOKEN" \
      "$API_BASE/organizations/$ORG_ID_2" >/dev/null 2>&1 || true
  fi
  if [ -n "$TOKEN" ]; then
    curl -sS --max-time 15 -X DELETE \
      -H "Authorization: Bearer $TOKEN" \
      "$API_BASE/identity/me" >/dev/null 2>&1 || true
  fi
  if [ -n "$API_PID" ] && kill -0 "$API_PID" 2>/dev/null; then
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

assert_file() {
  local label="$1"
  local file="$2"
  if [ -f "$file" ]; then
    pass "$label"
  else
    fail "$label (missing $file)"
  fi
}

assert_contains() {
  local label="$1"
  local file="$2"
  local pattern="$3"
  if grep -Fq -- "$pattern" "$file" 2>/dev/null; then
    pass "$label"
  else
    fail "$label (missing '$pattern' in $file)"
  fi
}

assert_not_contains() {
  local label="$1"
  local file="$2"
  local pattern="$3"
  if grep -Fq -- "$pattern" "$file" 2>/dev/null; then
    fail "$label (unexpected '$pattern' in $file)"
  else
    pass "$label"
  fi
}

run_step() {
  local label="$1"
  local log="$2"
  shift 2
  if "$@" >"$log" 2>&1; then
    pass "$label"
    return 0
  fi
  fail "$label"
  tail -n 80 "$log" | sed 's/^/        /'
  return 1
}

check_db_eq() {
  local label="$1"
  local sql="$2"
  local expected="$3"
  local actual
  actual="$(docker_exec "$DB_CONTAINER" psql -U postgres -d "$DB_NAME" -Atqc "$sql" 2>/dev/null | tr -d '[:space:]')"
  if [ "$actual" = "$expected" ]; then
    pass "$label"
  else
    fail "$label (expected $expected, got ${actual:-<empty>})"
  fi
}

db_count() {
  docker_exec "$DB_CONTAINER" psql -U postgres -d "$DB_NAME" -Atqc "$1" 2>/dev/null | tr -d '[:space:]'
}

echo "== W1 verification =="
echo "== 1. static contract =="

ORG_YAML="packages/ontology/ontologies/organization.ontology.yaml"
LIFE_YAML="packages/ontology/ontologies/life-scene.ontology.yaml"
ORG_MIGRATION="services/api/src/migrate/029_organization.sql"
LIFE_MIGRATION="services/api/src/migrate/030_life_scene.sql"
WORLD_DIR="services/api/src/modules/world"
PUBLIC_ROUTES="services/api/src/auth/public-routes.ts"
COMPOSE="docker-compose.yml"
ENV_EXAMPLE=".env.example"

assert_file "organization ontology exists" "$ORG_YAML"
assert_file "life-scene ontology exists" "$LIFE_YAML"
assert_file "organization migration 029 exists" "$ORG_MIGRATION"
assert_file "life-scene migration 030 exists" "$LIFE_MIGRATION"
assert_file "world activation service exists" "$WORLD_DIR/activation-context.service.ts"
assert_file "world Redis module exists" "$WORLD_DIR/redis.module.ts"
assert_file "world controller exists" "$WORLD_DIR/world.controller.ts"
assert_file "world service exists" "$WORLD_DIR/world.service.ts"
assert_file "W1 codegen contract test exists" "packages/codegen/tests/w1-persona-world.test.js"

assert_contains "organization ontology declares OrganizationType" "$ORG_YAML" "name: OrganizationType"
assert_contains "organization ontology declares Organization" "$ORG_YAML" "name: Organization"
assert_contains "organization ontology declares OrgMember" "$ORG_YAML" "name: OrgMember"
assert_contains "organization ontology declares Person abstract anchor" "$ORG_YAML" "name: Person"
assert_contains "organization ontology targets ontology.organization" "$ORG_YAML" "table: ontology.organization"
assert_contains "organization ontology targets ontology.org_member" "$ORG_YAML" "table: ontology.org_member"
assert_contains "organization ontology has self relation" "$ORG_YAML" "source: Organization"
assert_contains "organization ontology has parentId" "$ORG_YAML" "name: parentId"
assert_contains "life-scene ontology declares LifeScene" "$LIFE_YAML" "name: LifeScene"
assert_contains "life-scene ontology declares LifeIntent" "$LIFE_YAML" "name: LifeIntent"
assert_contains "life-scene ontology declares SceneModuleLink" "$LIFE_YAML" "name: SceneModuleLink"
assert_contains "life-scene ontology targets ontology.life_scene" "$LIFE_YAML" "table: ontology.life_scene"
assert_contains "life-scene ontology has scene linkage" "$LIFE_YAML" "source: SceneModuleLink"

assert_contains "029 creates ontology organization type" "$ORG_MIGRATION" "CREATE TABLE IF NOT EXISTS ontology.organization_type"
assert_contains "029 creates ontology organization" "$ORG_MIGRATION" "CREATE TABLE IF NOT EXISTS ontology.organization"
assert_contains "029 creates ontology member" "$ORG_MIGRATION" "CREATE TABLE IF NOT EXISTS ontology.org_member"
assert_contains "029 seeds organization types" "$ORG_MIGRATION" "('family', '家庭'"
assert_contains "029 backfills legacy organizations" "$ORG_MIGRATION" "FROM tenant.organizations o"
assert_contains "029 backfills legacy members" "$ORG_MIGRATION" "FROM tenant.organization_members m"
assert_not_contains "029 does not ALTER legacy tenant tables" "$ORG_MIGRATION" "ALTER TABLE tenant."
assert_not_contains "030 does not ALTER legacy tenant tables" "$LIFE_MIGRATION" "ALTER TABLE tenant."
assert_contains "030 creates life scene" "$LIFE_MIGRATION" "CREATE TABLE IF NOT EXISTS ontology.life_scene"
assert_contains "030 creates life intent" "$LIFE_MIGRATION" "CREATE TABLE IF NOT EXISTS ontology.life_intent"
assert_contains "030 creates scene module link" "$LIFE_MIGRATION" "CREATE TABLE IF NOT EXISTS ontology.scene_module_link"
assert_contains "030 seeds seven scene codes anchor" "$LIFE_MIGRATION" "('home', '居所'"
assert_contains "030 maps dining to food" "$LIFE_MIGRATION" "('dining', 'hungry', 'food'"
assert_contains "030 maps academy to tutor" "$LIFE_MIGRATION" "('academy', 'learn', 'tutor'"
assert_contains "030 maps work to org-admin" "$LIFE_MIGRATION" "('work', 'work', 'org-admin'"
assert_contains "030 uses idempotent scene upsert" "$LIFE_MIGRATION" "ON CONFLICT (code) DO UPDATE"
assert_contains "030 uses idempotent link upsert" "$LIFE_MIGRATION" "ON CONFLICT (scene_code, intent_code, module_code) DO UPDATE"

assert_contains "public routes allow anonymous world" "$PUBLIC_ROUTES" "get('GET', /^\\/world\\/?$/)"
assert_contains "context endpoint uses externalId" "$WORLD_DIR/world.controller.ts" "req.auth"
assert_contains "activation cache key is user scoped" "$WORLD_DIR/activation-context.service.ts" "ctx:user:"
assert_contains "activation publishes invalidation" "$WORLD_DIR/activation-context.service.ts" "ctx:invalidate"
assert_contains "activation reads DB conditional on Redis failure" "$WORLD_DIR/activation-context.service.ts" "activation context redis get failed"
assert_contains "world reads life_scene" "$WORLD_DIR/world.service.ts" "ontology.life_scene"
assert_contains "world reads org membership" "$WORLD_DIR/world.service.ts" "ontology.org_member"
assert_contains "twin exposes human world" "services/api/src/modules/twin/twin.service.ts" "humanWorld"
assert_contains "api env exposes Redis host" "$COMPOSE" "REDIS_HOST: redis"
assert_contains "api env exposes Redis password from environment" "$COMPOSE" "REDIS_PASSWORD: \${REDIS_PASSWORD:-}"
assert_contains "env example documents Redis password" "$ENV_EXAMPLE" "REDIS_PASSWORD="

if grep -Eq '@(Post|Put|Patch|Delete)' "$WORLD_DIR/world.controller.ts"; then
  fail "world controller has no write endpoint"
else
  pass "world controller has no write endpoint"
fi

if [ -z "$(git diff --name-only --diff-filter=M -- services/api/src/migrate)" ]; then
  pass "no existing migration file modified"
else
  fail "existing migration file modified unexpectedly"
fi

echo "== 2. ontology validation and codegen parity =="

mkdir -p "$TMP_DIR/gen-org" "$TMP_DIR/gen-life"
if run_step "organization ontology schema + semantic validation + SQL codegen" \
  "$TMP_DIR/gen-org.log" \
  node "$ROOT/packages/codegen/src/cli.js" "$ORG_YAML" --tracks sql --out-dir "$TMP_DIR/gen-org"; then
  GEN_ORG_SQL="$(find "$TMP_DIR/gen-org" -maxdepth 1 -type f -name 'generated.*sql' -print -quit)"
  if [ -n "$GEN_ORG_SQL" ] &&
    node - "$GEN_ORG_SQL" "$ORG_MIGRATION" <<'NODE'
const fs = require('fs');
const generated = fs.readFileSync(process.argv[2], 'utf8');
const migration = fs.readFileSync(process.argv[3], 'utf8');
if (!migration.includes(generated)) {
  console.error('organization generated SQL is not embedded in 029_organization.sql');
  process.exit(1);
}
if (/ALTER\s+TABLE\s+tenant\./i.test(migration)) {
  console.error('029_organization.sql must not ALTER legacy tenant tables');
  process.exit(1);
}
NODE
  then
    pass "organization generated SQL matches migration 029"
  else
    fail "organization generated SQL matches migration 029"
  fi
fi

if run_step "life-scene ontology schema + semantic validation + SQL codegen" \
  "$TMP_DIR/gen-life.log" \
  node "$ROOT/packages/codegen/src/cli.js" "$LIFE_YAML" --tracks sql --out-dir "$TMP_DIR/gen-life"; then
  GEN_LIFE_SQL="$(find "$TMP_DIR/gen-life" -maxdepth 1 -type f -name 'generated.*sql' -print -quit)"
  if [ -n "$GEN_LIFE_SQL" ] &&
    node - "$GEN_LIFE_SQL" "$LIFE_MIGRATION" <<'NODE'
const fs = require('fs');
const generated = fs.readFileSync(process.argv[2], 'utf8');
const migration = fs.readFileSync(process.argv[3], 'utf8');
if (!migration.includes(generated)) {
  console.error('life-scene generated SQL is not embedded in 030_life_scene.sql');
  process.exit(1);
}
if (/ALTER\s+TABLE\s+tenant\./i.test(migration)) {
  console.error('030_life_scene.sql must not ALTER legacy tenant tables');
  process.exit(1);
}
NODE
  then
    pass "life-scene generated SQL matches migration 030"
  else
    fail "life-scene generated SQL matches migration 030"
  fi
fi

run_step "git diff whitespace check" "$TMP_DIR/git-diff-check.log" git diff --check

echo "== 3. tests, typecheck, and build =="
run_step "codegen test suite" "$TMP_DIR/codegen-tests.log" npm run test:codegen
run_step "ontology test suite" "$TMP_DIR/ontology-tests.log" npm run test:ontology
run_step "services/api TypeScript" "$TMP_DIR/tsc.log" \
  bash -lc "cd '$ROOT/services/api' && npx tsc --noEmit"

if npm test --workspace=services/api -- --runInBand --colors=false >"$TMP_DIR/full-jest.log" 2>&1; then
  SUITES="$(sed -n 's/^Test Suites:[[:space:]]*\([0-9][0-9]*\) passed,.*/\1/p' "$TMP_DIR/full-jest.log" | tail -n 1)"
  TESTS="$(sed -n 's/^Tests:[[:space:]]*\([0-9][0-9]*\) passed,.*/\1/p' "$TMP_DIR/full-jest.log" | tail -n 1)"
  if [ "${SUITES:-0}" -ge "$EXPECTED_SUITES" ] && [ "${TESTS:-0}" -ge "$EXPECTED_TESTS" ]; then
    pass "services/api full Jest ($SUITES suites / $TESTS tests; baseline ${EXPECTED_SUITES}/${EXPECTED_TESTS})"
  else
    fail "services/api full Jest count below baseline (suites=${SUITES:-<empty>} tests=${TESTS:-<empty>})"
    tail -n 50 "$TMP_DIR/full-jest.log" | sed 's/^/        /'
  fi
else
  fail "services/api full Jest regressed"
  tail -n 80 "$TMP_DIR/full-jest.log" | sed 's/^/        /'
fi

run_step "services/api build" "$TMP_DIR/build.log" npm run build --workspace=services/api

echo "== 4. migration and DB assertions =="

if ! command -v docker >/dev/null 2>&1 || ! docker_exec "$DB_CONTAINER" true >/dev/null 2>&1; then
  fail "PostgreSQL container is reachable for DB checks"
else
  pass "PostgreSQL container is reachable for DB checks"
fi

if ! command -v docker >/dev/null 2>&1 || ! docker_exec "$REDIS_CONTAINER" true >/dev/null 2>&1; then
  fail "Redis container is reachable for cache checks"
else
  pass "Redis container is reachable for cache checks"
fi

if [ -z "$REDIS_PASSWORD" ] && command -v docker >/dev/null 2>&1; then
  REDIS_PASSWORD="$(
    docker inspect "$REDIS_CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null |
      sed -n 's/^REDIS_PASSWORD=//p' |
      head -n 1
  )"
  export REDIS_PASSWORD
fi

run_step "migration run 1" "$TMP_DIR/migrate-1.log" npm run migrate --workspace=services/api
run_step "migration run 2" "$TMP_DIR/migrate-2.log" npm run migrate --workspace=services/api
assert_contains "migration run 1 sees 029" "$TMP_DIR/migrate-1.log" "029_organization.sql"
assert_contains "migration run 1 sees 030" "$TMP_DIR/migrate-1.log" "030_life_scene.sql"
assert_contains "migration run 2 sees 029" "$TMP_DIR/migrate-2.log" "029_organization.sql"
assert_contains "migration run 2 sees 030" "$TMP_DIR/migrate-2.log" "030_life_scene.sql"

check_db_eq "migration 029 registered once" \
  "SELECT count(*)::text FROM public._api_migrations WHERE name='029_organization.sql';" "1"
check_db_eq "migration 030 registered once" \
  "SELECT count(*)::text FROM public._api_migrations WHERE name='030_life_scene.sql';" "1"
check_db_eq "organization type seed count" \
  "SELECT count(*)::text FROM ontology.organization_type;" "7"
check_db_eq "life scene seed count" \
  "SELECT count(*)::text FROM ontology.life_scene;" "7"
check_db_eq "life intent seed count" \
  "SELECT count(*)::text FROM ontology.life_intent;" "7"
check_db_eq "scene module link seed count" \
  "SELECT count(*)::text FROM ontology.scene_module_link;" "6"
check_db_eq "organization backfill count" \
  "SELECT count(*)::text FROM ontology.organization;" "4"
check_db_eq "organization member backfill count" \
  "SELECT count(*)::text FROM ontology.org_member;" "10"
check_db_eq "legacy organization count unchanged" \
  "SELECT count(*)::text FROM tenant.organizations;" "4"
check_db_eq "legacy organization member count unchanged" \
  "SELECT count(*)::text FROM tenant.organization_members;" "10"
check_db_eq "all expected module links are present" \
  "SELECT count(*)::text FROM ontology.scene_module_link WHERE (scene_code, module_code) IN (('dining','food'),('academy','tutor'),('academy','curriculum'),('academy','agent'),('work','org-admin'),('work','dashboard'));" "6"
check_db_eq "no scene-module link points at an unknown module" \
  "SELECT count(*)::text FROM ontology.scene_module_link l LEFT JOIN ontology.app_module m ON m.code=l.module_code WHERE m.code IS NULL;" "0"

if [ "$(db_count 'SELECT count(*)::text FROM ontology.organization;')" = "4" ] &&
  [ "$(db_count 'SELECT count(*)::text FROM ontology.org_member;')" = "10" ]; then
  pass "ontology backfill counts stay stable across repeated migrations"
else
  fail "ontology backfill counts changed across repeated migrations"
fi

echo "== 5. temporary API + HTTP smoke =="

: >"$TMP_DIR/api.log"
if [ ! -f "$ROOT/services/api/dist/main.js" ]; then
  fail "built API main.js exists"
else
  env \
    PORT="$API_PORT" \
    NODE_ENV=production \
    DB_HOST=127.0.0.1 \
    DB_PORT=5432 \
    DB_NAME="$DB_NAME" \
    AUTH_JWKS_URL=http://127.0.0.1:3004/auth/jwks \
    AUTH_CENTER_URL=http://127.0.0.1:3004 \
    REDIS_HOST=127.0.0.1 \
    REDIS_PORT=6379 \
    REDIS_DB=0 \
    node "$ROOT/services/api/dist/main.js" >"$TMP_DIR/api.log" 2>&1 &
  API_PID=$!
fi

API_READY=0
for _ in $(seq 1 45); do
  if [ -n "$API_PID" ] && kill -0 "$API_PID" 2>/dev/null; then
    code="$(curl -sS --max-time 2 -o /dev/null -w '%{http_code}' "$API_BASE/world" 2>/dev/null || true)"
    if [ "$code" = "200" ]; then
      API_READY=1
      break
    fi
  fi
  sleep 1
done

if [ "$API_READY" = "1" ]; then
  pass "temporary API started and /api/world is ready"
else
  fail "temporary API started"
  tail -n 80 "$TMP_DIR/api.log" | sed 's/^/        /' || true
fi

if [ "$API_READY" = "1" ]; then
  if [ "$(curl -sS --max-time 15 -o "$TMP_DIR/world.json" -w '%{http_code}' "$API_BASE/world")" = "200" ] &&
    jq -e '
      (.scenes | length) == 7 and
      ([.scenes[].code] | sort) == ["academy","dining","home","social","travel","wellness","work"] and
      ([.scenes[].intents | length] | add) == 7 and
      ([.scenes[] | select(.code == "dining") | .intents[0].modules[] | select(.moduleCode == "food")] | length) == 1 and
      ([.scenes[] | select(.code == "academy") | .intents[0].modules | map(.moduleCode) | sort] | .[0]) == ["agent","curriculum","tutor"] and
      ([.scenes[] | select(.code == "work") | .intents[0].modules | map(.moduleCode) | sort] | .[0]) == ["dashboard","org-admin"]
    ' "$TMP_DIR/world.json" >/dev/null; then
    pass "anonymous /api/world returns 7 scenes, intents, and required module links"
  else
    fail "anonymous /api/world contract"
  fi

  for endpoint in "context/me" "organizations/mine"; do
    code="$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' "$API_BASE/$endpoint")"
    if [ "$code" = "401" ]; then
      pass "anonymous /api/$endpoint is 401"
    else
      fail "anonymous /api/$endpoint expected 401, got $code"
    fi
  done

  register_body="$(jq -nc --arg username "$RUN_USER" --arg email "$RUN_USER@example.com" --arg password "$RUN_PASS" --arg name "W1 Verify" '{username:$username,email:$email,password:$password,name:$name}')"
  register_code="$(curl -sS --max-time 15 -o "$TMP_DIR/register.json" -w '%{http_code}' \
    -X POST -H 'Content-Type: application/json' --data "$register_body" "$API_BASE/auth/register")"
  if [ "$register_code" = "201" ] || [ "$register_code" = "200" ]; then
    USER_ID="$(jq -r '.id // .user.id // empty' "$TMP_DIR/register.json")"
    if [ -n "$USER_ID" ]; then
      pass "temporary account registered"
    else
      fail "temporary register returned no user id"
    fi
  else
    fail "temporary register HTTP $register_code"
  fi

  if [ -n "$USER_ID" ]; then
    login_body="$(jq -nc --arg identifier "$RUN_USER" --arg password "$RUN_PASS" '{identifier:$identifier,password:$password}')"
    login_code="$(curl -sS --max-time 15 -o "$TMP_DIR/login.json" -w '%{http_code}' \
      -X POST -H 'Content-Type: application/json' --data "$login_body" "$API_BASE/auth/login")"
    if [ "$login_code" = "200" ] || [ "$login_code" = "201" ]; then
      TOKEN="$(jq -r '.accessToken // .token // empty' "$TMP_DIR/login.json")"
    fi
    if [ -n "$TOKEN" ]; then
      pass "temporary login returned an access token"
    else
      fail "temporary login returned no access token (HTTP $login_code)"
    fi
  fi

  if [ -n "$TOKEN" ]; then
    context_code="$(curl -sS --max-time 20 -o "$TMP_DIR/context-0.json" -w '%{http_code}' \
      -H "Authorization: Bearer $TOKEN" "$API_BASE/context/me")"
    if [ "$context_code" = "200" ] &&
      jq -e '.version and .profile and (.orgs|type=="array") and .permissions and .twin' "$TMP_DIR/context-0.json" >/dev/null; then
      pass "activation context has required shape"
    else
      fail "activation context shape (HTTP $context_code)"
    fi
    VERSION0="$(jq -r '.version // empty' "$TMP_DIR/context-0.json")"

    if redis_cli EXISTS "ctx:user:$USER_ID" 2>/dev/null | grep -q '^1$'; then
      pass "activation context materialized at ctx:user:<userId>"
    else
      fail "activation context Redis key missing"
    fi

    org_body="$(jq -nc --arg name "W1 Verify $RUN_ID" '{name:$name,type:"other",description:"temporary W1 acceptance organization"}')"
    org_code="$(curl -sS --max-time 20 -o "$TMP_DIR/org.json" -w '%{http_code}' \
      -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
      --data "$org_body" "$API_BASE/organizations")"
    if [ "$org_code" = "201" ] || [ "$org_code" = "200" ]; then
      ORG_ID="$(jq -r '.id // empty' "$TMP_DIR/org.json")"
    fi
    if [ -n "$ORG_ID" ]; then
      pass "temporary organization created"
    else
      fail "temporary organization creation (HTTP $org_code)"
    fi

    org_body_2="$(jq -nc --arg name "W1 Verify 2 $RUN_ID" '{name:$name,type:"social-group",description:"temporary W1 multi-org acceptance organization"}')"
    org_code_2="$(curl -sS --max-time 20 -o "$TMP_DIR/org-2.json" -w '%{http_code}' \
      -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
      --data "$org_body_2" "$API_BASE/organizations")"
    if [ "$org_code_2" = "201" ] || [ "$org_code_2" = "200" ]; then
      ORG_ID_2="$(jq -r '.id // empty' "$TMP_DIR/org-2.json")"
    fi
    if [ -n "$ORG_ID_2" ]; then
      pass "second temporary organization created"
    else
      fail "second temporary organization creation (HTTP $org_code_2)"
    fi

    if [ -n "$ORG_ID" ]; then
      context_code="$(curl -sS --max-time 20 -o "$TMP_DIR/context-1.json" -w '%{http_code}' \
        -H "Authorization: Bearer $TOKEN" "$API_BASE/context/me")"
      VERSION1="$(jq -r '.version // empty' "$TMP_DIR/context-1.json")"
      if [ "$context_code" = "200" ] && [ -n "$VERSION1" ] && [ "$VERSION1" != "$VERSION0" ]; then
        pass "organization membership change changes activation context version"
      else
        fail "activation context version did not change after membership write"
      fi
      if jq -e --arg id "$ORG_ID" 'any(.orgs[]; .id == $id and .role == "owner")' "$TMP_DIR/context-1.json" >/dev/null; then
        pass "new owner membership appears in activation context"
      else
        fail "new owner membership missing from activation context"
      fi

      mine_code="$(curl -sS --max-time 20 -o "$TMP_DIR/orgs.json" -w '%{http_code}' \
        -H "Authorization: Bearer $TOKEN" "$API_BASE/organizations/mine")"
      if [ "$mine_code" = "200" ] &&
        jq -e --arg id "$ORG_ID" --arg id2 "$ORG_ID_2" 'type=="array" and any(.[]; .id == $id and .role == "owner") and any(.[]; .id == $id2 and .role == "owner")' "$TMP_DIR/orgs.json" >/dev/null; then
        pass "authenticated /api/organizations/mine returns multi-org membership"
      else
        fail "/api/organizations/mine contract (HTTP $mine_code)"
      fi

      twin_code="$(curl -sS --max-time 30 -o "$TMP_DIR/twin.json" -w '%{http_code}' \
        -H "Authorization: Bearer $TOKEN" "$API_BASE/twin/me")"
      if [ "$twin_code" = "200" ] &&
        jq -e '(.world.scenes|length)==7 and (.humanWorld.scenes|length)==7 and (.world|has("subject") and has("areas") and has("stats"))' "$TMP_DIR/twin.json" >/dev/null; then
        pass "twin exposes human world while preserving subject world semantics"
      else
        fail "/api/twin/me human-world contract (HTTP $twin_code)"
      fi

      if docker stop "$REDIS_CONTAINER" >/dev/null 2>&1; then
        REDIS_STOPPED=1
        sleep 1
        degraded_code="$(curl -sS --max-time 30 -o "$TMP_DIR/context-degraded.json" -w '%{http_code}' \
          -H "Authorization: Bearer $TOKEN" "$API_BASE/context/me")"
        if [ "$degraded_code" = "200" ] &&
          jq -e '.version and .profile and (.orgs|type=="array") and .permissions and .twin' "$TMP_DIR/context-degraded.json" >/dev/null; then
          pass "activation context falls back to DB while Redis is unavailable"
        else
          fail "activation context did not degrade cleanly (HTTP $degraded_code)"
        fi
        docker start "$REDIS_CONTAINER" >/dev/null 2>&1 || true
        if wait_redis; then
          REDIS_STOPPED=0
          pass "Redis restored after degradation check"
        else
          fail "Redis did not recover after degradation check"
        fi
      else
        fail "could not stop Redis for degradation check"
      fi

      delete_code="$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' \
        -X DELETE -H "Authorization: Bearer $TOKEN" "$API_BASE/organizations/$ORG_ID")"
      if [ "$delete_code" = "200" ] || [ "$delete_code" = "204" ]; then
        pass "temporary organization cleaned up"
        ORG_ID=""
      else
        fail "temporary organization cleanup HTTP $delete_code"
      fi

      if [ -n "$ORG_ID_2" ]; then
        delete_code_2="$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' \
          -X DELETE -H "Authorization: Bearer $TOKEN" "$API_BASE/organizations/$ORG_ID_2")"
        if [ "$delete_code_2" = "200" ] || [ "$delete_code_2" = "204" ]; then
          pass "second temporary organization cleaned up"
          ORG_ID_2=""
        else
          fail "second temporary organization cleanup HTTP $delete_code_2"
        fi
      fi

      account_delete_code="$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' \
        -X DELETE -H "Authorization: Bearer $TOKEN" "$API_BASE/identity/me")"
      if [ "$account_delete_code" = "200" ] || [ "$account_delete_code" = "204" ]; then
        pass "temporary account cleaned up"
        TOKEN=""
      else
        fail "temporary account cleanup HTTP $account_delete_code"
      fi
    fi
  fi
fi

echo "== 6. post-smoke DB checks =="
check_db_eq "ontology organization count after smoke" \
  "SELECT count(*)::text FROM ontology.organization;" "4"
check_db_eq "ontology member count after smoke" \
  "SELECT count(*)::text FROM ontology.org_member;" "10"
check_db_eq "legacy organization count after smoke" \
  "SELECT count(*)::text FROM tenant.organizations;" "4"
check_db_eq "legacy member count after smoke" \
  "SELECT count(*)::text FROM tenant.organization_members;" "10"

echo "== summary =="
echo "PASS=$PASS FAIL=$FAIL SKIP=$SKIP"
echo "FAIL=$FAIL"
if [ "$FAIL" -ne 0 ]; then
  exit 1
fi
exit 0
