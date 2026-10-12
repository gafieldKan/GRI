#!/usr/bin/env bash
# P3-S3 verification: user plugin opt-in on the ontology-driven module registry.
set -uo pipefail

ROOT="${GRI_ROOT:-/home/ubantu/GRI}"
cd "$ROOT"

export AUTH_CENTER_URL="${AUTH_CENTER_URL:-http://127.0.0.1:3004}"

PASS=0
FAIL=0
SKIP=0
TMP_DIR="$(mktemp -d)"
API_PID=""
API_BASE=""
ACCESS_TOKEN=""
TEST_USER_ID=""
DB_HELPER=""
DB_OK=0

pass() { PASS=$((PASS + 1)); echo "  PASS  $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  FAIL  $1"; }
skip() { SKIP=$((SKIP + 1)); echo "  SKIP  $1"; }

cleanup() {
  if [ -n "$ACCESS_TOKEN" ] && [ -n "$API_BASE" ]; then
    curl -sS --connect-timeout 3 --max-time 8 -X DELETE \
      "$API_BASE/api/identity/me" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      -o /dev/null 2>/dev/null || true
  fi
  if [ "$DB_OK" -eq 1 ] && [ -n "$DB_HELPER" ] && [ -n "$TEST_USER_ID" ]; then
    node "$DB_HELPER" delete-selections "$TEST_USER_ID" >/dev/null 2>&1 || true
  fi
  if [ -n "$API_PID" ]; then
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

assert_file() {
  local description="$1"
  local file="$2"
  if [ -f "$file" ]; then
    pass "$description"
  else
    fail "$description (missing $file)"
  fi
}

assert_not_file() {
  local description="$1"
  local file="$2"
  if [ ! -e "$file" ]; then
    pass "$description"
  else
    fail "$description (unexpected $file)"
  fi
}

assert_contains() {
  local description="$1"
  local file="$2"
  local pattern="$3"
  if grep -Fq -- "$pattern" "$file" 2>/dev/null; then
    pass "$description"
  else
    fail "$description (missing '$pattern' in $file)"
  fi
}

assert_not_contains() {
  local description="$1"
  local file="$2"
  local pattern="$3"
  if grep -Fq -- "$pattern" "$file" 2>/dev/null; then
    fail "$description (unexpected '$pattern' in $file)"
  else
    pass "$description"
  fi
}

extract_block() {
  local file="$1"
  local start="$2"
  local end="$3"
  awk -v start="$start" -v end="$end" '
    index($0, start) == 1 { printing = 1 }
    printing { print }
    printing && index($0, end) == 1 { exit }
  ' "$file"
}

echo "== P3-S3 verification =="

echo "== 1. static contract =="
ONTOLOGY="packages/ontology/ontologies/app-module.ontology.yaml"
APP_MIGRATION="services/api/src/migrate/023_app_module.sql"
USER_MIGRATION="services/api/src/migrate/024_user_module.sql"
MODULE_DIR="services/api/src/modules/module-registry"
CONTROLLER="$MODULE_DIR/module-registry.controller.ts"
SERVICE="$MODULE_DIR/module-registry.service.ts"
MODULE_TYPES="$MODULE_DIR/module-registry.types.ts"
APP_MODULE="services/api/src/app.module.ts"
PUBLIC_ROUTE_SPEC="services/api/src/auth/public-routes.spec.ts"
PORTAL_API="apps/portal/src/api/index.js"
WORKBENCH="apps/portal/src/pages/workbench/index.vue"

assert_file "AppModule ontology exists" "$ONTOLOGY"
assert_file "023 AppModule migration exists" "$APP_MIGRATION"
assert_file "024 UserModule migration exists" "$USER_MIGRATION"
assert_file "module registry controller exists" "$CONTROLLER"
assert_file "module registry service exists" "$SERVICE"
assert_file "module registry types exist" "$MODULE_TYPES"
assert_file "module registry module exists" "$MODULE_DIR/module-registry.module.ts"
assert_file "module registry service spec exists" "$MODULE_DIR/module-registry.service.spec.ts"
assert_file "module registry controller spec exists" "$MODULE_DIR/module-registry.controller.spec.ts"
assert_not_file "S1 local catalog was removed" "apps/portal/src/config/modules.js"

assert_contains "ontology declares AppModule object" "$ONTOLOGY" "name: AppModule"
assert_contains "ontology owns ontology.app_module" "$ONTOLOGY" "table: ontology.app_module"
assert_contains "ontology declares UserModule object" "$ONTOLOGY" "name: UserModule"
assert_contains "ontology owns ontology.user_module" "$ONTOLOGY" "table: ontology.user_module"
for field in code name short description icon entryUrl category allowedRoles isCore status sortOrder; do
  assert_contains "AppModule ontology field '$field' is declared" "$ONTOLOGY" "- name: $field"
done
assert_contains "ontology declares status sort index" "$ONTOLOGY" "name: idx_app_module_status_sort"
for field in userId moduleCode; do
  assert_contains "UserModule ontology field '$field' is declared" "$ONTOLOGY" "- name: $field"
done
assert_contains "ontology declares user/module unique constraint" "$ONTOLOGY" "- [userId, moduleCode]"

assert_contains "023 records its ontology source" "$APP_MIGRATION" "packages/ontology/ontologies/app-module.ontology.yaml"
assert_contains "023 uses codegen DDL" "$APP_MIGRATION" "CREATE TABLE IF NOT EXISTS ontology.app_module"
assert_contains "023 is seed-idempotent" "$APP_MIGRATION" "ON CONFLICT (code) DO UPDATE"
assert_not_contains "023 never drops the module table" "$APP_MIGRATION" "DROP TABLE"
for code in food tutor org-admin ontology-stats identity curriculum dashboard agent twin; do
  assert_contains "seed '$code' is registered" "$APP_MIGRATION" "('$code',"
done
assert_contains "024 records its ontology source" "$USER_MIGRATION" "packages/ontology/ontologies/app-module.ontology.yaml"
assert_contains "024 uses codegen DDL" "$USER_MIGRATION" "CREATE TABLE IF NOT EXISTS ontology.user_module"
assert_contains "024 declares the composite unique key" "$USER_MIGRATION" "UNIQUE (user_id, module_code)"
assert_not_contains "024 never drops the preference table" "$USER_MIGRATION" "DROP TABLE"
assert_not_contains "024 does not rebuild AppModule" "$USER_MIGRATION" "CREATE TABLE IF NOT EXISTS ontology.app_module"

assert_contains "root module imports registry" "$APP_MODULE" "ModuleRegistryModule"
assert_contains "controller path is modules" "$CONTROLLER" "@Controller('modules')"
assert_contains "controller reads req.auth.externalId" "$CONTROLLER" "req.auth"
assert_contains "controller resolves externalId" "$CONTROLLER" "externalId"
assert_not_contains "controller never trusts token roles" "$CONTROLLER" "req.auth.roles"
assert_contains "controller exposes enable" "$CONTROLLER" "@Post(':code/enable')"
assert_contains "controller exposes disable" "$CONTROLLER" "@Post(':code/disable')"
assert_contains "service resolves DB profile by externalId" "$SERVICE" "getProfileByExternalId(externalId)"
assert_contains "service filters active modules" "$SERVICE" "status = 'active'"
assert_contains "service supports all-role modules" "$SERVICE" "jsonb_array_length(allowed_roles) = 0"
assert_contains "service filters by DB role" "$SERVICE" "allowed_roles ? \$1"
assert_contains "service orders by sort_order" "$SERVICE" "ORDER BY sort_order ASC NULLS LAST, code ASC"
assert_contains "service projects selected from user_module" "$SERVICE" "(um.user_id IS NOT NULL) AS selected"
assert_contains "service enable validates availability before insert" "$SERVICE" "WITH available AS"
assert_contains "service enable is idempotent" "$SERVICE" "ON CONFLICT (user_id, module_code) DO NOTHING"
assert_contains "service disable validates availability before delete" "$SERVICE" "DELETE FROM ontology.user_module"
assert_not_contains "service never reads token roles" "$SERVICE" "req.auth.roles"
assert_contains "API contract includes selected" "$MODULE_TYPES" "selected: boolean"

assert_contains "public route regression covers GET /modules" "$PUBLIC_ROUTE_SPEC" "isPublicRoute('GET', '/modules')"
assert_not_contains "public route allowlist omits /modules" "services/api/src/auth/public-routes.ts" "/modules"
assert_contains "portal API calls GET /api/modules" "$PORTAL_API" "api.get('/api/modules')"
assert_contains "portal API calls enable endpoint" "$PORTAL_API" "/api/modules/\${encodeURIComponent(code)}/enable"
assert_contains "portal API calls disable endpoint" "$PORTAL_API" "/api/modules/\${encodeURIComponent(code)}/disable"
assert_contains "workbench consumes listModules" "$WORKBENCH" "listModules()"
assert_contains "workbench imports both preference mutations" "$WORKBENCH" "disableModule, enableModule"
assert_contains "workbench keeps core modules visible" "$WORKBENCH" "module.isCore || module.selected"
assert_contains "workbench lists optional modules" "$WORKBENCH" "module => !module.isCore"
assert_contains "workbench exposes opt-in switch" "$WORKBENCH" "@change=\"toggleModule(module, \$event)\""
assert_contains "workbench rolls back failed toggles" "$WORKBENCH" "setModuleSelected(module.code, previous)"
assert_not_contains "workbench no longer imports deleted catalog" "$WORKBENCH" "@/config/modules"
assert_not_contains "workbench no longer uses local role filter" "$WORKBENCH" "modulesForRole"

echo "== 2. ontology + codegen =="
if node --input-type=module -e "
  import { readFileSync } from 'node:fs';
  import { load as yamlLoad } from 'js-yaml';
  import { validateOntologySchema, validateOntologySemantics } from '@gri/ontology';

  const source = './packages/ontology/ontologies/app-module.ontology.yaml';
  const schema = validateOntologySchema(yamlLoad(readFileSync(source, 'utf8')));
  const semantics = validateOntologySemantics(schema);
  if (!semantics.ok) {
    throw new Error(semantics.errors.map((item) => item.path + ': ' + item.message).join('; '));
  }

  const object = schema.objects.find((item) => item.name === 'AppModule');
  if (!object) throw new Error('AppModule object is missing');
  if (object.table !== 'ontology.app_module') throw new Error('unexpected physical table');

  const expected = ['code', 'name', 'short', 'description', 'icon', 'entryUrl', 'category', 'allowedRoles', 'isCore', 'status', 'sortOrder'];
  const actual = object.fields.map((field) => field.name);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('field contract mismatch: ' + actual.join(','));
  }
" >"$TMP_DIR/ontology.log" 2>&1; then
  pass "ontology passes schema + semantic validation with the exact field contract"
else
  fail "ontology schema + semantic validation failed"
  sed 's/^/        /' "$TMP_DIR/ontology.log"
fi

CODEGEN_DIR="$TMP_DIR/codegen"
if node packages/codegen/src/cli.js "$ONTOLOGY" --tracks sql --out-dir "$CODEGEN_DIR" \
  >"$TMP_DIR/codegen.log" 2>&1; then
  pass "@gri/codegen validates the ontology and emits SQL"
  GENERATED_SQL="$(find "$CODEGEN_DIR" -maxdepth 1 -type f -name 'generated*sql' -print -quit 2>/dev/null || true)"
  if [ -n "$GENERATED_SQL" ] && [ -f "$GENERATED_SQL" ]; then
    extract_block "$GENERATED_SQL" "CREATE TABLE IF NOT EXISTS ontology.app_module" \
      "CREATE INDEX IF NOT EXISTS idx_app_module_status_sort" \
      | grep -v '^--' | sed '/^[[:space:]]*$/d' > "$TMP_DIR/generated-app.body"
    extract_block "$APP_MIGRATION" "CREATE TABLE IF NOT EXISTS ontology.app_module" \
      "CREATE INDEX IF NOT EXISTS idx_app_module_status_sort" \
      | grep -v '^--' | sed '/^[[:space:]]*$/d' > "$TMP_DIR/migration-app.body"
    if [ -s "$TMP_DIR/generated-app.body" ] \
      && diff -u "$TMP_DIR/generated-app.body" "$TMP_DIR/migration-app.body" >"$TMP_DIR/ddl-app.diff" 2>&1; then
      pass "023 structural DDL is byte-for-byte codegen output"
    else
      fail "023 structural DDL drifted from codegen output"
      sed 's/^/        /' "$TMP_DIR/ddl-app.diff"
    fi

    extract_block "$GENERATED_SQL" "CREATE TABLE IF NOT EXISTS ontology.user_module" ");" \
      | grep -v '^--' | sed '/^[[:space:]]*$/d' > "$TMP_DIR/generated-user.body"
    extract_block "$USER_MIGRATION" "CREATE TABLE IF NOT EXISTS ontology.user_module" ");" \
      | grep -v '^--' | sed '/^[[:space:]]*$/d' > "$TMP_DIR/migration-user.body"
    if [ -s "$TMP_DIR/generated-user.body" ] \
      && diff -u "$TMP_DIR/generated-user.body" "$TMP_DIR/migration-user.body" >"$TMP_DIR/ddl-user.diff" 2>&1; then
      pass "024 structural DDL is byte-for-byte codegen output"
    else
      fail "024 structural DDL drifted from codegen output"
      sed 's/^/        /' "$TMP_DIR/ddl-user.diff"
    fi
  else
    fail "codegen did not emit a SQL file"
  fi
else
  fail "@gri/codegen failed"
  sed 's/^/        /' "$TMP_DIR/codegen.log"
fi

echo "== 3. API build, migration, and typing =="
API_BUILD_LOG="$TMP_DIR/api-build.log"
if (cd services/api && npm run build) >"$API_BUILD_LOG" 2>&1; then
  pass "services/api npm run build"
  assert_file "built 023 migration is present" "services/api/dist/migrate/023_app_module.sql"
  assert_file "built 024 migration is present" "services/api/dist/migrate/024_user_module.sql"
else
  fail "services/api npm run build"
  tail -n 50 "$API_BUILD_LOG" | sed 's/^/        /'
fi

DB_HELPER="$TMP_DIR/db-helper.mjs"
cat >"$DB_HELPER" <<'NODE'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(process.cwd() + '/services/api/package.json')
const { Pool } = require('pg')
const { loadConfig } = await import(
  pathToFileURL(process.cwd() + '/services/api/dist/config/config.js').href
)

const db = loadConfig().db
const pool = new Pool({
  host: db.host,
  port: db.port,
  database: db.database,
  user: db.user,
  password: db.password,
})

const [command, ...args] = process.argv.slice(2)

try {
  if (command === 'reachable') {
    await pool.query('SELECT 1')
    console.log('ok')
  } else if (command === 'migration') {
    const result = await pool.query(
      `SELECT
         EXISTS (
           SELECT 1 FROM public._api_migrations
            WHERE name = '023_app_module.sql'
         ) AS app_registered,
         EXISTS (
           SELECT 1 FROM public._api_migrations
            WHERE name = '024_user_module.sql'
         ) AS user_registered,
         count(*)::int AS total_count,
         count(*) FILTER (WHERE status = 'active')::int AS active_count,
         (SELECT count(*)::int FROM ontology.user_module) AS selection_count
       FROM ontology.app_module`,
    )
    console.log(JSON.stringify(result.rows[0]))
  } else if (command === 'schema') {
    const result = await pool.query(
      `SELECT
         to_regclass('ontology.user_module') IS NOT NULL AS table_exists,
         EXISTS (
           SELECT 1
             FROM pg_constraint c
             JOIN pg_class t ON t.oid = c.conrelid
             JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE n.nspname = 'ontology'
              AND t.relname = 'user_module'
              AND c.contype = 'u'
              AND pg_get_constraintdef(c.oid) LIKE '%(user_id, module_code)%'
         ) AS unique_key_exists`,
    )
    console.log(JSON.stringify(result.rows[0]))
  } else if (command === 'selection-count') {
    const [externalId, moduleCode] = args
    const result = await pool.query(
      `SELECT count(*)::int AS count
         FROM ontology.user_module
        WHERE user_id = $1 AND module_code = $2`,
      [externalId, moduleCode],
    )
    console.log(JSON.stringify(result.rows[0]))
  } else if (command === 'delete-selections') {
    const [externalId] = args
    await pool.query('DELETE FROM ontology.user_module WHERE user_id = $1', [externalId])
    console.log('ok')
  } else if (command === 'set-role') {
    const [externalId, role] = args
    const result = await pool.query(
      `UPDATE public.users
          SET role = $2, updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING id`,
      [externalId, role],
    )
    if (result.rowCount !== 1) throw new Error('temporary user role update missed')
  } else {
    throw new Error(`unknown command: ${command}`)
  }
} catch (error) {
  const code = error?.code || error?.message || 'DB_ERROR'
  console.error(`[db-helper] ${code}`)
  process.exitCode = 2
} finally {
  await pool.end().catch(() => undefined)
}
NODE

DB_OK=0
if node "$DB_HELPER" reachable >"$TMP_DIR/db-reachable.log" 2>&1; then
  DB_OK=1
  pass "local PostgreSQL is reachable for migration verification"
else
  skip "local PostgreSQL unreachable; migration registration/body seed count skipped"
fi

if [ "$DB_OK" -eq 1 ]; then
  MIGRATE_LOG="$TMP_DIR/migrate.log"
  if (cd services/api && node dist/migrate/run-migrations.js) >"$MIGRATE_LOG" 2>&1; then
    pass "migration runner executes against dist/migrate"
    if node "$DB_HELPER" migration >"$TMP_DIR/migration.json" 2>"$TMP_DIR/migration.err"; then
      if jq -e '.app_registered == true and .user_registered == true and .total_count == 9 and .active_count == 9' \
        "$TMP_DIR/migration.json" >/dev/null 2>&1; then
        pass "public._api_migrations registers 023 and 024, and exactly 9 modules are active"
      else
        fail "023 registration or active module count is incorrect"
        cat "$TMP_DIR/migration.json" | sed 's/^/        /'
      fi
    else
      fail "could not query migration registration"
      sed 's/^/        /' "$TMP_DIR/migration.err"
    fi
    if node "$DB_HELPER" schema >"$TMP_DIR/schema.json" 2>"$TMP_DIR/schema.err"; then
      if jq -e '.table_exists == true and .unique_key_exists == true' \
        "$TMP_DIR/schema.json" >/dev/null 2>&1; then
        pass "ontology.user_module and its (user_id, module_code) unique key exist"
      else
        fail "ontology.user_module schema contract is incomplete"
        cat "$TMP_DIR/schema.json" | sed 's/^/        /'
      fi
    else
      fail "could not query ontology.user_module schema"
      sed 's/^/        /' "$TMP_DIR/schema.err"
    fi
  else
    fail "migration runner failed"
    tail -n 50 "$MIGRATE_LOG" | sed 's/^/        /'
  fi
fi

TSC_LOG="$TMP_DIR/tsc.log"
if (cd services/api && npx tsc --noEmit) >"$TSC_LOG" 2>&1; then
  pass "services/api npx tsc --noEmit"
else
  fail "services/api npx tsc --noEmit"
  tail -n 50 "$TSC_LOG" | sed 's/^/        /'
fi

echo "== 4. Jest =="
MODULE_JEST_LOG="$TMP_DIR/module-jest.log"
if (cd services/api && npx jest --runInBand --colors=false src/modules/module-registry) \
  >"$MODULE_JEST_LOG" 2>&1; then
  pass "module-registry Jest suite"
else
  fail "module-registry Jest suite"
  tail -n 60 "$MODULE_JEST_LOG" | sed 's/^/        /'
fi

FULL_JEST_LOG="$TMP_DIR/full-jest.log"
if (cd services/api && npm test -- --runInBand --colors=false) >"$FULL_JEST_LOG" 2>&1; then
  FULL_SUITES="$(grep -E '^Test Suites:' "$FULL_JEST_LOG" | tail -n 1 | sed -E 's/.* ([0-9]+) total.*/\1/')"
  FULL_TESTS="$(grep -E '^Tests:' "$FULL_JEST_LOG" | tail -n 1 | sed -E 's/.* ([0-9]+) total.*/\1/')"
  if [ -n "$FULL_SUITES" ] && [ -n "$FULL_TESTS" ] \
    && [ "$FULL_SUITES" -ge 34 ] && [ "$FULL_TESTS" -ge 528 ]; then
    pass "API full Jest is green with no regression (${FULL_SUITES} suites / ${FULL_TESTS} tests)"
  else
    fail "API full Jest regression gate failed (suites=${FULL_SUITES:-?} tests=${FULL_TESTS:-?})"
  fi
else
  fail "API full Jest suite"
  tail -n 80 "$FULL_JEST_LOG" | sed 's/^/        /'
fi

echo "== 5. portal build =="
PORTAL_BUILD_LOG="$TMP_DIR/portal-build.log"
if (cd apps/portal && npm run build:h5) >"$PORTAL_BUILD_LOG" 2>&1; then
  pass "apps/portal npm run build:h5"
  assert_file "portal H5 build output exists" "apps/portal/dist/build/h5/index.html"
else
  fail "apps/portal npm run build:h5"
  tail -n 50 "$PORTAL_BUILD_LOG" | sed 's/^/        /'
fi

echo "== 6. live module opt-in =="
API_BASE="${GRI_API_BASE_URL:-}"
STARTED_API=0
if [ -z "$API_BASE" ]; then
  API_PORT="${GRI_VERIFY_API_PORT:-3027}"
  for _ in $(seq 1 20); do
    API_BASE="http://127.0.0.1:${API_PORT}"
    if ! curl -sS --connect-timeout 1 --max-time 2 "$API_BASE/health" >/dev/null 2>&1; then
      break
    fi
    API_PORT=$((API_PORT + 1))
  done

  if [ "$DB_OK" -eq 1 ]; then
    (cd services/api && exec env PORT="$API_PORT" node dist/main.js) \
      >"$TMP_DIR/api.log" 2>&1 &
    API_PID=$!
    STARTED_API=1
    for _ in $(seq 1 40); do
      if curl -sS --connect-timeout 1 --max-time 2 "$API_BASE/health" >/dev/null 2>&1; then
        break
      fi
      sleep 0.25
    done
  fi
fi

if ! curl -sS --connect-timeout 2 --max-time 5 "$API_BASE/health" >/dev/null 2>&1; then
  skip "API unreachable at $API_BASE; live module opt-in flow skipped"
  [ "$STARTED_API" -eq 1 ] && tail -n 30 "$TMP_DIR/api.log" | sed 's/^/        /'
else
  if [ "$STARTED_API" -eq 1 ]; then
    pass "temporary API started from dist/migrate for live verification"
  else
    pass "existing API is reachable for live verification"
  fi

  NO_TOKEN_CODE="$(curl -sS --connect-timeout 3 --max-time 8 \
    "$API_BASE/api/modules" \
    -o "$TMP_DIR/no-token.json" \
    -w '%{http_code}' 2>/dev/null || true)"
  NO_TOKEN_CODE="${NO_TOKEN_CODE:-000}"
  if [ "$NO_TOKEN_CODE" = "401" ]; then
    pass "GET /api/modules without a token returns 401"
  else
    fail "GET /api/modules expected HTTP 401 without a token, got $NO_TOKEN_CODE"
  fi

  TS="$(date +%s)"
  SUFFIX="${TS}_${RANDOM}"
  USERNAME="p3s3_${SUFFIX}"
  EMAIL="${USERNAME}@example.com"
  PASSWORD="P3s3-${SUFFIX}-Aa"
  REGISTER_BODY="$(jq -nc \
    --arg username "$USERNAME" \
    --arg email "$EMAIL" \
    --arg password "$PASSWORD" \
    '{username:$username,email:$email,password:$password,name:"P3-S3 Verify"}')"
  REGISTER_CODE="$(curl -sS --connect-timeout 3 --max-time 12 \
    -X POST "$API_BASE/api/auth/register" \
    -H 'Content-Type: application/json' \
    -d "$REGISTER_BODY" \
    -o "$TMP_DIR/register.json" \
    -w '%{http_code}' 2>/dev/null || true)"
  REGISTER_CODE="${REGISTER_CODE:-000}"
  TEST_USER_ID="$(jq -r '.id // empty' "$TMP_DIR/register.json" 2>/dev/null || true)"

  if [[ "$REGISTER_CODE" =~ ^2[0-9][0-9]$ ]] && [ -n "$TEST_USER_ID" ]; then
    pass "temporary consumer account is registered"
  elif [ "$REGISTER_CODE" = "000" ] || [ "$REGISTER_CODE" = "502" ] || [ "$REGISTER_CODE" = "503" ] || [ "$REGISTER_CODE" = "504" ]; then
    skip "auth-center unavailable through API (HTTP $REGISTER_CODE); credential flow skipped"
  else
    fail "registration failed with HTTP $REGISTER_CODE"
  fi

  if [ -n "$TEST_USER_ID" ]; then
    LOGIN_BODY="$(jq -nc --arg identifier "$EMAIL" --arg password "$PASSWORD" \
      '{identifier:$identifier,password:$password}')"
    LOGIN_CODE="$(curl -sS --connect-timeout 3 --max-time 12 \
      -X POST "$API_BASE/api/auth/login" \
      -H 'Content-Type: application/json' \
      -d "$LOGIN_BODY" \
      -o "$TMP_DIR/login.json" \
      -w '%{http_code}' 2>/dev/null || true)"
    LOGIN_CODE="${LOGIN_CODE:-000}"
    ACCESS_TOKEN="$(jq -r '.accessToken // .token // empty' "$TMP_DIR/login.json" 2>/dev/null || true)"

    if [[ "$LOGIN_CODE" =~ ^2[0-9][0-9]$ ]] && [ -n "$ACCESS_TOKEN" ]; then
      pass "temporary consumer login returns an access token"
    else
      fail "consumer login expected 2xx with accessToken, got HTTP $LOGIN_CODE"
    fi
  fi

  if [ -n "$ACCESS_TOKEN" ]; then
    CONSUMER_CODE="$(curl -sS --connect-timeout 3 --max-time 8 \
      "$API_BASE/api/modules" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      -o "$TMP_DIR/consumer.json" \
      -w '%{http_code}' 2>/dev/null || true)"
    CONSUMER_CODE="${CONSUMER_CODE:-000}"
    if [ "$CONSUMER_CODE" = "200" ] \
      && jq -e 'type == "array" and length == 1 and .[0].code == "food" and .[0].selected == false' \
        "$TMP_DIR/consumer.json" >/dev/null 2>&1; then
      pass "consumer sees only food with selected=false and never org-admin"
    else
      fail "consumer module visibility expected HTTP 200 with only food and selected=false, got HTTP $CONSUMER_CODE"
    fi

    DENIED_CODE="$(curl -sS --connect-timeout 3 --max-time 8 \
      -X POST "$API_BASE/api/modules/org-admin/enable" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      -o "$TMP_DIR/denied.json" \
      -w '%{http_code}' 2>/dev/null || true)"
    DENIED_CODE="${DENIED_CODE:-000}"
    if [ "$DENIED_CODE" = "403" ]; then
      pass "consumer enable org-admin returns 403"
    else
      fail "consumer enable org-admin expected HTTP 403, got $DENIED_CODE"
    fi
    if [ "$DB_OK" -eq 1 ]; then
      if node "$DB_HELPER" selection-count "$TEST_USER_ID" org-admin \
        >"$TMP_DIR/denied-count.json" 2>"$TMP_DIR/denied-count.err" \
        && jq -e '.count == 0' "$TMP_DIR/denied-count.json" >/dev/null 2>&1; then
        pass "forbidden enable wrote no user_module row"
      else
        fail "forbidden enable wrote a user_module row or count could not be read"
        sed 's/^/        /' "$TMP_DIR/denied-count.err" 2>/dev/null || true
      fi
    fi

    if [ "$DB_OK" -eq 1 ] \
      && node "$DB_HELPER" set-role "$TEST_USER_ID" student \
        >"$TMP_DIR/set-student.log" 2>&1; then
      STUDENT_CODE="$(curl -sS --connect-timeout 3 --max-time 8 \
        "$API_BASE/api/modules" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        -o "$TMP_DIR/student.json" \
        -w '%{http_code}' 2>/dev/null || true)"
      STUDENT_CODE="${STUDENT_CODE:-000}"
      if [ "$STUDENT_CODE" = "200" ] \
        && jq -e 'type == "array" and length == 5 and ([.[].code] | sort == ["agent","curriculum","food","tutor","twin"]) and ([.[].selected] | all(. == false))' \
          "$TMP_DIR/student.json" >/dev/null 2>&1; then
        pass "student sees exactly the five role-available modules before opt-in"
      else
        fail "student module visibility/count was not the expected five, got HTTP $STUDENT_CODE"
      fi

      ENABLE_ONE_CODE="$(curl -sS --connect-timeout 3 --max-time 8 \
        -X POST "$API_BASE/api/modules/curriculum/enable" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        -o "$TMP_DIR/enable-one.json" \
        -w '%{http_code}' 2>/dev/null || true)"
      ENABLE_ONE_CODE="${ENABLE_ONE_CODE:-000}"
      if [ "$ENABLE_ONE_CODE" = "200" ] \
        && jq -e '.code == "curriculum" and .selected == true' "$TMP_DIR/enable-one.json" >/dev/null 2>&1; then
        pass "student can enable an available optional module"
      else
        fail "student enable curriculum expected HTTP 200/selected=true, got HTTP $ENABLE_ONE_CODE"
      fi

      ENABLE_TWO_CODE="$(curl -sS --connect-timeout 3 --max-time 8 \
        -X POST "$API_BASE/api/modules/curriculum/enable" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        -o "$TMP_DIR/enable-two.json" \
        -w '%{http_code}' 2>/dev/null || true)"
      ENABLE_TWO_CODE="${ENABLE_TWO_CODE:-000}"
      if [ "$ENABLE_TWO_CODE" = "200" ] \
        && jq -e '.code == "curriculum" and .selected == true' "$TMP_DIR/enable-two.json" >/dev/null 2>&1; then
        pass "repeated enable is idempotent"
      else
        fail "repeated enable expected HTTP 200/selected=true, got HTTP $ENABLE_TWO_CODE"
      fi
      if node "$DB_HELPER" selection-count "$TEST_USER_ID" curriculum \
        >"$TMP_DIR/enabled-count.json" 2>"$TMP_DIR/enabled-count.err" \
        && jq -e '.count == 1' "$TMP_DIR/enabled-count.json" >/dev/null 2>&1; then
        pass "repeated enable leaves exactly one user_module row"
      else
        fail "repeated enable did not leave exactly one user_module row"
        sed 's/^/        /' "$TMP_DIR/enabled-count.err" 2>/dev/null || true
      fi

      REFRESH_ENABLED_CODE="$(curl -sS --connect-timeout 3 --max-time 8 \
        "$API_BASE/api/modules" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        -o "$TMP_DIR/refresh-enabled.json" \
        -w '%{http_code}' 2>/dev/null || true)"
      REFRESH_ENABLED_CODE="${REFRESH_ENABLED_CODE:-000}"
      if [ "$REFRESH_ENABLED_CODE" = "200" ] \
        && jq -e 'map(select(.code == "curriculum")) | length == 1 and .[0].selected == true' \
          "$TMP_DIR/refresh-enabled.json" >/dev/null 2>&1; then
        pass "refresh GET reflects selected=true"
      else
        fail "refresh after enable did not reflect selected=true, got HTTP $REFRESH_ENABLED_CODE"
      fi

      DISABLE_ONE_CODE="$(curl -sS --connect-timeout 3 --max-time 8 \
        -X POST "$API_BASE/api/modules/curriculum/disable" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        -o "$TMP_DIR/disable-one.json" \
        -w '%{http_code}' 2>/dev/null || true)"
      DISABLE_ONE_CODE="${DISABLE_ONE_CODE:-000}"
      if [ "$DISABLE_ONE_CODE" = "200" ] \
        && jq -e '.code == "curriculum" and .selected == false' "$TMP_DIR/disable-one.json" >/dev/null 2>&1; then
        pass "student can disable an available optional module"
      else
        fail "student disable curriculum expected HTTP 200/selected=false, got HTTP $DISABLE_ONE_CODE"
      fi

      DISABLE_TWO_CODE="$(curl -sS --connect-timeout 3 --max-time 8 \
        -X POST "$API_BASE/api/modules/curriculum/disable" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        -o "$TMP_DIR/disable-two.json" \
        -w '%{http_code}' 2>/dev/null || true)"
      DISABLE_TWO_CODE="${DISABLE_TWO_CODE:-000}"
      if [ "$DISABLE_TWO_CODE" = "200" ] \
        && jq -e '.code == "curriculum" and .selected == false' "$TMP_DIR/disable-two.json" >/dev/null 2>&1; then
        pass "repeated disable is idempotent"
      else
        fail "repeated disable expected HTTP 200/selected=false, got HTTP $DISABLE_TWO_CODE"
      fi
      if node "$DB_HELPER" selection-count "$TEST_USER_ID" curriculum \
        >"$TMP_DIR/disabled-count.json" 2>"$TMP_DIR/disabled-count.err" \
        && jq -e '.count == 0' "$TMP_DIR/disabled-count.json" >/dev/null 2>&1; then
        pass "repeated disable leaves zero user_module rows"
      else
        fail "repeated disable did not leave zero user_module rows"
        sed 's/^/        /' "$TMP_DIR/disabled-count.err" 2>/dev/null || true
      fi

      REFRESH_DISABLED_CODE="$(curl -sS --connect-timeout 3 --max-time 8 \
        "$API_BASE/api/modules" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        -o "$TMP_DIR/refresh-disabled.json" \
        -w '%{http_code}' 2>/dev/null || true)"
      REFRESH_DISABLED_CODE="${REFRESH_DISABLED_CODE:-000}"
      if [ "$REFRESH_DISABLED_CODE" = "200" ] \
        && jq -e 'map(select(.code == "curriculum")) | length == 1 and .[0].selected == false' \
          "$TMP_DIR/refresh-disabled.json" >/dev/null 2>&1; then
        pass "refresh GET reflects selected=false"
      else
        fail "refresh after disable did not reflect selected=false, got HTTP $REFRESH_DISABLED_CODE"
      fi
    else
      fail "could not promote the temporary verification account to student"
      sed 's/^/        /' "$TMP_DIR/set-student.log" 2>/dev/null || true
    fi

    if [ "$DB_OK" -eq 1 ] \
      && node "$DB_HELPER" set-role "$TEST_USER_ID" operator \
        >"$TMP_DIR/set-operator.log" 2>&1; then
      OPERATOR_CODE="$(curl -sS --connect-timeout 3 --max-time 8 \
        "$API_BASE/api/modules" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        -o "$TMP_DIR/operator.json" \
        -w '%{http_code}' 2>/dev/null || true)"
      OPERATOR_CODE="${OPERATOR_CODE:-000}"
      if [ "$OPERATOR_CODE" = "200" ] \
        && jq -e 'type == "array" and length == 9 and any(.code == "org-admin") and any(.code == "identity")' \
          "$TMP_DIR/operator.json" >/dev/null 2>&1; then
        pass "operator sees all 9 modules including org-admin and identity"
      else
        fail "operator module visibility expected HTTP 200 with 9 modules, got HTTP $OPERATOR_CODE"
      fi
    else
      fail "could not promote the temporary verification account to operator"
      sed 's/^/        /' "$TMP_DIR/set-operator.log" 2>/dev/null || true
    fi

    if [ "$DB_OK" -eq 1 ]; then
      node "$DB_HELPER" delete-selections "$TEST_USER_ID" >/dev/null 2>&1 || true
    fi
    CLEANUP_CODE="$(curl -sS --connect-timeout 3 --max-time 10 \
      -X DELETE "$API_BASE/api/identity/me" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      -o "$TMP_DIR/delete.json" \
      -w '%{http_code}' 2>/dev/null || true)"
    CLEANUP_CODE="${CLEANUP_CODE:-000}"
    if [[ "$CLEANUP_CODE" =~ ^2[0-9][0-9]$ ]]; then
      pass "temporary verification account is deleted"
      ACCESS_TOKEN=""
      TEST_USER_ID=""
    else
      fail "temporary verification account cleanup failed with HTTP $CLEANUP_CODE"
    fi
  fi
fi

echo
if [ "$FAIL" -eq 0 ]; then
  echo "全绿：PASS=$PASS FAIL=$FAIL SKIP=$SKIP"
  exit 0
fi

echo "未全绿：PASS=$PASS FAIL=$FAIL SKIP=$SKIP"
exit 1
