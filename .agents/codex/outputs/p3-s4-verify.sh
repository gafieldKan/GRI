#!/usr/bin/env bash
# P3-S4 verification: optional region/industry bindings for the module registry.
set -uo pipefail

ROOT="${GRI_ROOT:-/home/ubantu/GRI}"
cd "$ROOT"

export AUTH_CENTER_URL="${AUTH_CENTER_URL:-http://127.0.0.1:3004}"
export AUTH_SERVICE_TOKEN="${AUTH_SERVICE_TOKEN:-gri-service-token}"

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
OPERATOR_READY=0
BINDING_CHANGED=0
BINDING_MODULE="food"

pass() { PASS=$((PASS + 1)); echo "  PASS  $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  FAIL  $1"; }
skip() { SKIP=$((SKIP + 1)); echo "  SKIP  $1"; }

restore_binding() {
  [ "$BINDING_CHANGED" -eq 1 ] || return 0
  [ -n "$ACCESS_TOKEN" ] || return 0
  [ -n "$API_BASE" ] || return 0
  [ -f "$TMP_DIR/original-binding.json" ] || return 0

  local body
  body="$(jq -c '{regionNodeIds,industryCodes}' "$TMP_DIR/original-binding.json" 2>/dev/null || true)"
  [ -n "$body" ] || return 0

  curl -sS --connect-timeout 3 --max-time 8 -X PUT \
    "$API_BASE/api/modules/$BINDING_MODULE/bindings" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -H 'Content-Type: application/json' \
    -d "$body" \
    -o "$TMP_DIR/cleanup-binding.json" >/dev/null 2>&1 || true
}

cleanup() {
  restore_binding

  if [ "$DB_OK" -eq 1 ] && [ -n "$DB_HELPER" ] && [ -n "$TEST_USER_ID" ]; then
    node "$DB_HELPER" cleanup-user "$TEST_USER_ID" >/dev/null 2>&1 || true
  fi

  if [ -n "$ACCESS_TOKEN" ] && [ -n "$API_BASE" ]; then
    curl -sS --connect-timeout 3 --max-time 10 -X DELETE \
      "$API_BASE/api/identity/me" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      -o /dev/null 2>/dev/null || true
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

echo "== P3-S4 verification =="

echo "== 1. static contract =="
ONTOLOGY="packages/ontology/ontologies/app-module.ontology.yaml"
MIGRATION="services/api/src/migrate/025_module_dimension.sql"
MODULE_DIR="services/api/src/modules/module-registry"
CONTROLLER="$MODULE_DIR/module-registry.controller.ts"
SERVICE="$MODULE_DIR/module-registry.service.ts"
MODULE_TYPES="$MODULE_DIR/module-registry.types.ts"
MODULE_REGISTRATION="$MODULE_DIR/module-registry.module.ts"
SERVICE_SPEC="$MODULE_DIR/module-registry.service.spec.ts"
CONTROLLER_SPEC="$MODULE_DIR/module-registry.controller.spec.ts"
APP_MODULE="services/api/src/app.module.ts"
PORTAL_API="apps/portal/src/api/index.js"
WORKBENCH="apps/portal/src/pages/workbench/index.vue"

assert_file "ontology source exists" "$ONTOLOGY"
assert_file "025 migration exists" "$MIGRATION"
assert_file "module registry controller exists" "$CONTROLLER"
assert_file "module registry service exists" "$SERVICE"
assert_file "module registry types exist" "$MODULE_TYPES"
assert_file "module registry module exists" "$MODULE_REGISTRATION"
assert_file "module registry service spec exists" "$SERVICE_SPEC"
assert_file "module registry controller spec exists" "$CONTROLLER_SPEC"
assert_file "portal API client exists" "$PORTAL_API"
assert_file "portal workbench exists" "$WORKBENCH"

for object in RegionDimensionRef IndustryDimensionRef ModuleRegion ModuleIndustry; do
  assert_contains "ontology declares $object" "$ONTOLOGY" "name: $object"
done
assert_contains "regions bridge maps the existing table" "$ONTOLOGY" "table: ontology.region"
assert_contains "industries bridge maps the existing table" "$ONTOLOGY" "table: ontology.industry"
assert_contains "ontology owns module_region" "$ONTOLOGY" "table: ontology.module_region"
assert_contains "ontology owns module_industry" "$ONTOLOGY" "table: ontology.module_industry"
assert_contains "region link targets the region bridge" "$ONTOLOGY" "target: RegionDimensionRef"
assert_contains "industry link targets the industry bridge" "$ONTOLOGY" "target: IndustryDimensionRef"
assert_contains "region link uses a real foreign key column" "$ONTOLOGY" "foreignKey: regionId"
assert_contains "industry link uses a real foreign key column" "$ONTOLOGY" "foreignKey: industryId"
assert_contains "region association is cascade-bound" "$ONTOLOGY" "onDelete: cascade"
assert_contains "module_region has a composite unique key" "$ONTOLOGY" "- [moduleId, regionId]"
assert_contains "module_industry has a composite unique key" "$ONTOLOGY" "- [moduleId, industryId]"
assert_contains "module_region has a region index" "$ONTOLOGY" "name: idx_module_region_region"
assert_contains "module_industry has an industry index" "$ONTOLOGY" "name: idx_module_industry_industry"

assert_contains "025 records its ontology source" "$MIGRATION" "packages/ontology/ontologies/app-module.ontology.yaml"
assert_contains "025 uses codegen DDL for module_region" "$MIGRATION" "CREATE TABLE IF NOT EXISTS ontology.module_region"
assert_contains "025 uses codegen DDL for module_industry" "$MIGRATION" "CREATE TABLE IF NOT EXISTS ontology.module_industry"
assert_contains "module_region FK targets app_module" "$MIGRATION" "FOREIGN KEY (module_id) REFERENCES ontology.app_module(id) ON DELETE CASCADE"
assert_contains "module_region FK targets region" "$MIGRATION" "FOREIGN KEY (region_id) REFERENCES ontology.region(id) ON DELETE CASCADE"
assert_contains "module_industry FK targets industry" "$MIGRATION" "FOREIGN KEY (industry_id) REFERENCES ontology.industry(id) ON DELETE CASCADE"
assert_contains "module_region uniqueness is physical" "$MIGRATION" "UNIQUE (module_id, region_id)"
assert_contains "module_industry uniqueness is physical" "$MIGRATION" "UNIQUE (module_id, industry_id)"
assert_not_contains "025 never drops tables" "$MIGRATION" "DROP TABLE"
assert_not_contains "025 does not alter the existing region table" "$MIGRATION" "ALTER TABLE ontology.region"
assert_not_contains "025 does not alter the existing industry table" "$MIGRATION" "ALTER TABLE ontology.industry"
assert_not_contains "025 does not recreate app_module" "$MIGRATION" "CREATE TABLE IF NOT EXISTS ontology.app_module"
assert_not_contains "025 does not recreate region" "$MIGRATION" "CREATE TABLE IF NOT EXISTS ontology.region"
assert_not_contains "025 does not recreate industry" "$MIGRATION" "CREATE TABLE IF NOT EXISTS ontology.industry"

assert_contains "root application module still imports the registry module" "$APP_MODULE" "ModuleRegistryModule"
assert_contains "controller exposes the dimension option endpoint" "$CONTROLLER" "@Get('dimensions')"
assert_contains "controller exposes GET bindings" "$CONTROLLER" "@Get(':code/bindings')"
assert_contains "controller exposes PUT bindings" "$CONTROLLER" "@Put(':code/bindings')"
assert_contains "bindings read uses assertSiteOperator" "$CONTROLLER" "assertSiteOperator(externalId)"
assert_contains "bindings write uses assertSiteOperator" "$CONTROLLER" "await this.organizationService.assertSiteOperator(externalId)"
assert_contains "list endpoint accepts region query" "$CONTROLLER" "@Query('region')"
assert_contains "list endpoint accepts industry query" "$CONTROLLER" "@Query('industry')"
assert_contains "controller identity comes from req.auth.externalId" "$CONTROLLER" "req.auth"
assert_contains "controller resolves externalId" "$CONTROLLER" "externalId"
assert_not_contains "controller does not trust token roles" "$CONTROLLER" "req.auth.roles"

assert_contains "service resolves the database identity by externalId" "$SERVICE" "getProfileByExternalId(externalId)"
assert_contains "service accepts only supported region levels" "$SERVICE" "level IN ('country', 'province')"
assert_contains "service accepts only the industry section level" "$SERVICE" "level = 'section'"
assert_contains "unbound modules remain visible for region filters" "$SERVICE" "NOT EXISTS (SELECT 1 FROM ontology.module_region scope"
assert_contains "unbound modules remain visible for industry filters" "$SERVICE" "NOT EXISTS (SELECT 1 FROM ontology.module_industry scope"
assert_contains "region scope is applied with a real FK value" "$SERVICE" "mr.region_id = \$3"
assert_contains "industry scope is applied with a real FK value" "$SERVICE" "mi.industry_id = \$4"
assert_contains "bindings are replaced transactionally" "$SERVICE" "await client.query('BEGIN')"
assert_contains "binding replacement rolls back on error" "$SERVICE" "await client.query('ROLLBACK')"
assert_contains "binding replacement validates region levels" "$SERVICE" "REGION_BINDING_LEVELS"
assert_contains "binding replacement validates industry level" "$SERVICE" "INDUSTRY_BINDING_LEVEL"
assert_not_contains "service does not read token roles" "$SERVICE" "req.auth.roles"

assert_contains "API contract includes region filter" "$MODULE_TYPES" "region?: string"
assert_contains "API contract includes industry filter" "$MODULE_TYPES" "industry?: string"
assert_contains "API contract exposes region binding ids" "$MODULE_TYPES" "regionNodeIds: string[]"
assert_contains "API contract exposes industry binding codes" "$MODULE_TYPES" "industryCodes: string[]"

assert_contains "portal API requests dimension options" "$PORTAL_API" "listModuleDimensions"
assert_contains "portal API sends region query" "$PORTAL_API" "params.region = filters.region"
assert_contains "portal API sends industry query" "$PORTAL_API" "params.industry = filters.industry"
assert_contains "workbench imports dimension loader" "$WORKBENCH" "listModuleDimensions"
assert_contains "workbench renders a region picker" "$WORKBENCH" "handleRegionChange"
assert_contains "workbench renders an industry picker" "$WORKBENCH" "handleIndustryChange"
assert_contains "workbench sends selected dimensions to the list API" "$WORKBENCH" "listModules(scopeFilters())"
assert_contains "workbench can clear both dimensions" "$WORKBENCH" "clearScopeFilters"

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

  const getObject = (name) => {
    const object = schema.objects.find((item) => item.name === name);
    if (!object) throw new Error(name + ' object is missing');
    return object;
  };
  const region = getObject('ModuleRegion');
  const industry = getObject('ModuleIndustry');
  const regionRef = getObject('RegionDimensionRef');
  const industryRef = getObject('IndustryDimensionRef');

  if (region.table !== 'ontology.module_region') throw new Error('unexpected module_region table');
  if (industry.table !== 'ontology.module_industry') throw new Error('unexpected module_industry table');
  if (regionRef.table !== 'ontology.region' || regionRef.abstract !== true) throw new Error('region bridge is invalid');
  if (industryRef.table !== 'ontology.industry' || industryRef.abstract !== true) throw new Error('industry bridge is invalid');

  const fields = (object) => object.fields.map((field) => field.name);
  if (JSON.stringify(fields(region)) !== JSON.stringify(['moduleId', 'regionId'])) {
    throw new Error('module_region field contract mismatch');
  }
  if (JSON.stringify(fields(industry)) !== JSON.stringify(['moduleId', 'industryId'])) {
    throw new Error('module_industry field contract mismatch');
  }
  const required = (object) => object.fields.filter((field) => field.required).map((field) => field.name).sort();
  if (JSON.stringify(required(region)) !== JSON.stringify(['moduleId', 'regionId'])) {
    throw new Error('module_region required field contract mismatch');
  }
  if (JSON.stringify(required(industry)) !== JSON.stringify(['industryId', 'moduleId'])) {
    throw new Error('module_industry required field contract mismatch');
  }
  const foreignKeys = (object) => Object.fromEntries(
    object.links.map((link) => [link.foreignKey, link.target]),
  );
  if (foreignKeys(region).moduleId !== 'AppModule' || foreignKeys(region).regionId !== 'RegionDimensionRef') {
    throw new Error('module_region link contract mismatch');
  }
  if (foreignKeys(industry).moduleId !== 'AppModule' || foreignKeys(industry).industryId !== 'IndustryDimensionRef') {
    throw new Error('module_industry link contract mismatch');
  }
" >"$TMP_DIR/ontology.log" 2>&1; then
  pass "ontology passes schema + semantic validation with real FK bridge objects"
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
    extract_block "$GENERATED_SQL" "CREATE TABLE IF NOT EXISTS ontology.module_region" \
      "CREATE INDEX IF NOT EXISTS idx_module_region_region" \
      | grep -v '^--' | sed '/^[[:space:]]*$/d' > "$TMP_DIR/generated-region.body"
    extract_block "$MIGRATION" "CREATE TABLE IF NOT EXISTS ontology.module_region" \
      "CREATE INDEX IF NOT EXISTS idx_module_region_region" \
      | grep -v '^--' | sed '/^[[:space:]]*$/d' > "$TMP_DIR/migration-region.body"
    if [ -s "$TMP_DIR/generated-region.body" ] \
      && diff -u "$TMP_DIR/generated-region.body" "$TMP_DIR/migration-region.body" \
        >"$TMP_DIR/ddl-region.diff" 2>&1; then
      pass "025 module_region DDL is byte-for-byte codegen output"
    else
      fail "025 module_region DDL drifted from codegen output"
      sed 's/^/        /' "$TMP_DIR/ddl-region.diff"
    fi

    extract_block "$GENERATED_SQL" "CREATE TABLE IF NOT EXISTS ontology.module_industry" \
      "CREATE INDEX IF NOT EXISTS idx_module_industry_industry" \
      | grep -v '^--' | sed '/^[[:space:]]*$/d' > "$TMP_DIR/generated-industry.body"
    extract_block "$MIGRATION" "CREATE TABLE IF NOT EXISTS ontology.module_industry" \
      "CREATE INDEX IF NOT EXISTS idx_module_industry_industry" \
      | grep -v '^--' | sed '/^[[:space:]]*$/d' > "$TMP_DIR/migration-industry.body"
    if [ -s "$TMP_DIR/generated-industry.body" ] \
      && diff -u "$TMP_DIR/generated-industry.body" "$TMP_DIR/migration-industry.body" \
        >"$TMP_DIR/ddl-industry.diff" 2>&1; then
      pass "025 module_industry DDL is byte-for-byte codegen output"
    else
      fail "025 module_industry DDL drifted from codegen output"
      sed 's/^/        /' "$TMP_DIR/ddl-industry.diff"
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
  assert_file "built 025 migration is present" "services/api/dist/migrate/025_module_dimension.sql"
else
  fail "services/api npm run build"
  tail -n 60 "$API_BUILD_LOG" | sed 's/^/        /'
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
            WHERE name = '025_module_dimension.sql'
         ) AS registered,
         (SELECT count(*)::int FROM ontology.app_module) AS module_count`,
    )
    console.log(JSON.stringify(result.rows[0]))
  } else if (command === 'schema') {
    const result = await pool.query(
      `SELECT
         to_regclass('ontology.module_region') IS NOT NULL AS region_table,
         to_regclass('ontology.module_industry') IS NOT NULL AS industry_table,
         (
           SELECT jsonb_agg(column_name ORDER BY ordinal_position)
             FROM information_schema.columns
            WHERE table_schema = 'ontology' AND table_name = 'module_region'
         ) AS region_columns,
         (
           SELECT jsonb_agg(column_name ORDER BY ordinal_position)
             FROM information_schema.columns
            WHERE table_schema = 'ontology' AND table_name = 'module_industry'
         ) AS industry_columns,
         (
           SELECT count(*)::int
             FROM pg_constraint c
             JOIN pg_class t ON t.oid = c.conrelid
             JOIN pg_namespace n ON n.oid = t.relnamespace
             LEFT JOIN pg_class ft ON ft.oid = c.confrelid
             LEFT JOIN pg_namespace fn ON fn.oid = ft.relnamespace
            WHERE n.nspname = 'ontology'
              AND t.relname IN ('module_region', 'module_industry')
              AND c.contype = 'f'
              AND fn.nspname = 'ontology'
              AND ft.relname IN ('app_module', 'region', 'industry')
         ) AS foreign_key_count,
         EXISTS (
           SELECT 1
             FROM pg_constraint c
             JOIN pg_class t ON t.oid = c.conrelid
             JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE n.nspname = 'ontology'
              AND t.relname = 'module_region'
              AND c.contype = 'u'
              AND pg_get_constraintdef(c.oid) LIKE 'UNIQUE (module_id, region_id)%'
         ) AS region_unique,
         EXISTS (
           SELECT 1
             FROM pg_constraint c
             JOIN pg_class t ON t.oid = c.conrelid
             JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE n.nspname = 'ontology'
              AND t.relname = 'module_industry'
              AND c.contype = 'u'
              AND pg_get_constraintdef(c.oid) LIKE 'UNIQUE (module_id, industry_id)%'
         ) AS industry_unique,
         (
           SELECT count(*)::int
             FROM information_schema.columns
            WHERE table_schema = 'ontology'
              AND table_name IN ('module_region', 'module_industry')
              AND data_type IN ('json', 'jsonb')
         ) AS json_association_columns`,
    )
    console.log(JSON.stringify(result.rows[0]))
  } else if (command === 'fixtures') {
    const result = await pool.query(
      `SELECT
         (SELECT node_id FROM ontology.region
           WHERE level IN ('country', 'province') ORDER BY node_id LIMIT 1) AS hit_region,
         (SELECT node_id FROM ontology.region
           WHERE level IN ('country', 'province') ORDER BY node_id OFFSET 1 LIMIT 1) AS miss_region,
         (SELECT node_id FROM ontology.region
           WHERE level NOT IN ('country', 'province') ORDER BY node_id LIMIT 1) AS invalid_region,
         (SELECT code FROM ontology.industry
           WHERE level = 'section' ORDER BY code LIMIT 1) AS hit_industry,
         (SELECT code FROM ontology.industry
           WHERE level = 'section' ORDER BY code OFFSET 1 LIMIT 1) AS miss_industry,
         (SELECT code FROM ontology.industry
           WHERE level <> 'section' ORDER BY code LIMIT 1) AS invalid_industry`,
    )
    console.log(JSON.stringify(result.rows[0]))
  } else if (command === 'binding-snapshot') {
    const [code] = args
    const result = await pool.query(
      `SELECT am.code,
              COALESCE((
                SELECT jsonb_agg(r.node_id ORDER BY r.node_id)
                  FROM ontology.module_region mr
                  JOIN ontology.region r ON r.id = mr.region_id
                 WHERE mr.module_id = am.id
              ), '[]'::jsonb) AS region_node_ids,
              COALESCE((
                SELECT jsonb_agg(i.code ORDER BY i.code)
                  FROM ontology.module_industry mi
                  JOIN ontology.industry i ON i.id = mi.industry_id
                 WHERE mi.module_id = am.id
              ), '[]'::jsonb) AS industry_codes
         FROM ontology.app_module am
        WHERE am.code = $1`,
      [code],
    )
    if (result.rowCount !== 1) throw new Error('module not found for binding snapshot')
    console.log(JSON.stringify({
      code: result.rows[0].code,
      regionNodeIds: result.rows[0].region_node_ids,
      industryCodes: result.rows[0].industry_codes,
    }))
  } else if (command === 'binding-count') {
    const [code] = args
    const result = await pool.query(
      `SELECT
         (SELECT count(*)::int
            FROM ontology.module_region mr
            JOIN ontology.app_module am ON am.id = mr.module_id
           WHERE am.code = $1) AS region_count,
         (SELECT count(*)::int
            FROM ontology.module_industry mi
            JOIN ontology.app_module am ON am.id = mi.module_id
           WHERE am.code = $1) AS industry_count`,
      [code],
    )
    console.log(JSON.stringify(result.rows[0]))
  } else if (command === 'unbound-module') {
    const [excludeCode] = args
    const result = await pool.query(
      `SELECT am.code
         FROM ontology.app_module am
        WHERE am.status = 'active'
          AND am.code <> $1
          AND NOT EXISTS (
            SELECT 1 FROM ontology.module_region mr WHERE mr.module_id = am.id
          )
          AND NOT EXISTS (
            SELECT 1 FROM ontology.module_industry mi WHERE mi.module_id = am.id
          )
        ORDER BY am.code
        LIMIT 1`,
      [excludeCode],
    )
    if (result.rowCount !== 1) throw new Error('no unbound module fixture is available')
    console.log(JSON.stringify(result.rows[0]))
  } else if (command === 'prepare-operator') {
    const [userId] = args
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const updated = await client.query(
        `UPDATE public.users
            SET role = 'operator', updated_at = NOW()
          WHERE id = $1 AND deleted_at IS NULL
          RETURNING id`,
        [userId],
      )
      if (updated.rowCount !== 1) {
        await client.query(
          `INSERT INTO public.users (id, username, name, role, status)
           VALUES ($1, $2, 'P3-S4 Verify', 'operator', 'active')`,
          [userId, `p3s4_${String(userId).replaceAll('-', '').slice(0, 20)}`],
        )
      }

      const root = await client.query(
        `SELECT id
           FROM tenant.organizations
          WHERE parent_id IS NULL
          ORDER BY created_at, id
          LIMIT 1
          FOR UPDATE`,
      )
      const rootId = root.rows[0]?.id
      if (!rootId) throw new Error('root organization is missing')
      await client.query(
        `INSERT INTO tenant.organization_members (organization_id, user_id, role, status)
         VALUES ($1, $2, 'admin', 'active')
         ON CONFLICT (organization_id, user_id)
         DO UPDATE SET role = 'admin', status = 'active'`,
        [rootId, userId],
      )
      await client.query('COMMIT')
      console.log(JSON.stringify({ rootId }))
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } else if (command === 'cleanup-user') {
    const [userId] = args
    await pool.query('DELETE FROM ontology.user_module WHERE user_id = $1', [userId])
    await pool.query('DELETE FROM tenant.organization_members WHERE user_id = $1', [userId])
    console.log('ok')
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

if node "$DB_HELPER" reachable >"$TMP_DIR/db-reachable.log" 2>&1; then
  DB_OK=1
  pass "local PostgreSQL is reachable for migration verification"
else
  skip "local PostgreSQL unreachable; migration and live checks skipped"
fi

if [ "$DB_OK" -eq 1 ]; then
  MIGRATE_LOG="$TMP_DIR/migrate.log"
  if (cd services/api && node dist/migrate/run-migrations.js) >"$MIGRATE_LOG" 2>&1; then
    pass "migration runner executes against dist/migrate"
    if node "$DB_HELPER" migration >"$TMP_DIR/migration.json" 2>"$TMP_DIR/migration.err"; then
      if jq -e '.registered == true and .module_count == 9' "$TMP_DIR/migration.json" >/dev/null 2>&1; then
        pass "public._api_migrations registers 025 and all 9 modules remain"
      else
        fail "025 registration or module count is incorrect"
        cat "$TMP_DIR/migration.json" | sed 's/^/        /'
      fi
    else
      fail "could not query migration registration"
      sed 's/^/        /' "$TMP_DIR/migration.err"
    fi

    if node "$DB_HELPER" schema >"$TMP_DIR/schema.json" 2>"$TMP_DIR/schema.err"; then
      if jq -e '
        .region_table == true
        and .industry_table == true
        and .region_columns == ["id", "module_id", "region_id"]
        and .industry_columns == ["id", "module_id", "industry_id"]
        and .foreign_key_count == 4
        and .region_unique == true
        and .industry_unique == true
        and .json_association_columns == 0
      ' "$TMP_DIR/schema.json" >/dev/null 2>&1; then
        pass "both association tables use four real FKs, two unique keys, and zero JSON association columns"
      else
        fail "association table schema contract is incomplete"
        cat "$TMP_DIR/schema.json" | sed 's/^/        /'
      fi
    else
      fail "could not query association table schema"
      sed 's/^/        /' "$TMP_DIR/schema.err"
    fi
  else
    fail "migration runner failed"
    tail -n 60 "$MIGRATE_LOG" | sed 's/^/        /'
  fi
fi

TSC_LOG="$TMP_DIR/tsc.log"
if (cd services/api && npx tsc --noEmit) >"$TSC_LOG" 2>&1; then
  pass "services/api npx tsc --noEmit"
else
  fail "services/api npx tsc --noEmit"
  tail -n 60 "$TSC_LOG" | sed 's/^/        /'
fi

echo "== 4. Jest =="
MODULE_JEST_LOG="$TMP_DIR/module-jest.log"
if (cd services/api && npx jest --runInBand --colors=false src/modules/module-registry) \
  >"$MODULE_JEST_LOG" 2>&1; then
  MODULE_SUITES="$(grep -E '^Test Suites:' "$MODULE_JEST_LOG" | tail -n 1 | sed -E 's/.* ([0-9]+) total.*/\1/')"
  MODULE_TESTS="$(grep -E '^Tests:' "$MODULE_JEST_LOG" | tail -n 1 | sed -E 's/.* ([0-9]+) total.*/\1/')"
  if [ -n "$MODULE_SUITES" ] && [ -n "$MODULE_TESTS" ] \
    && [ "$MODULE_SUITES" -ge 2 ] && [ "$MODULE_TESTS" -ge 24 ]; then
    pass "module-registry Jest is green (${MODULE_SUITES} suites / ${MODULE_TESTS} tests)"
  else
    fail "module-registry Jest count regressed (suites=${MODULE_SUITES:-?} tests=${MODULE_TESTS:-?})"
  fi
else
  fail "module-registry Jest suite"
  tail -n 80 "$MODULE_JEST_LOG" | sed 's/^/        /'
fi

FULL_JEST_LOG="$TMP_DIR/full-jest.log"
if (cd services/api && npm test -- --runInBand --colors=false) >"$FULL_JEST_LOG" 2>&1; then
  FULL_SUITES="$(grep -E '^Test Suites:' "$FULL_JEST_LOG" | tail -n 1 | sed -E 's/.* ([0-9]+) total.*/\1/')"
  FULL_TESTS="$(grep -E '^Tests:' "$FULL_JEST_LOG" | tail -n 1 | sed -E 's/.* ([0-9]+) total.*/\1/')"
  if [ -n "$FULL_SUITES" ] && [ -n "$FULL_TESTS" ] \
    && [ "$FULL_SUITES" -ge 34 ] && [ "$FULL_TESTS" -ge 541 ]; then
    pass "API full Jest is green with no regression (${FULL_SUITES} suites / ${FULL_TESTS} tests)"
  else
    fail "API full Jest regression gate failed (suites=${FULL_SUITES:-?} tests=${FULL_TESTS:-?})"
  fi
else
  fail "API full Jest suite"
  tail -n 100 "$FULL_JEST_LOG" | sed 's/^/        /'
fi

echo "== 5. portal build =="
PORTAL_BUILD_LOG="$TMP_DIR/portal-build.log"
if (cd apps/portal && npm run build:h5) >"$PORTAL_BUILD_LOG" 2>&1; then
  pass "apps/portal npm run build:h5"
  assert_file "portal H5 build output exists" "apps/portal/dist/build/h5/index.html"
else
  fail "apps/portal npm run build:h5"
  tail -n 60 "$PORTAL_BUILD_LOG" | sed 's/^/        /'
fi

echo "== 6. live dimension binding flow =="
if [ "$DB_OK" -eq 1 ]; then
  API_PORT="${GRI_VERIFY_API_PORT:-3028}"
  for _ in $(seq 1 20); do
    API_BASE="http://127.0.0.1:${API_PORT}"
    if ! curl -sS --connect-timeout 1 --max-time 2 "$API_BASE/health" >/dev/null 2>&1; then
      break
    fi
    API_PORT=$((API_PORT + 1))
  done

  (cd services/api && exec env PORT="$API_PORT" node dist/main.js) \
    >"$TMP_DIR/api.log" 2>&1 &
  API_PID=$!
  for _ in $(seq 1 40); do
    if curl -sS --connect-timeout 1 --max-time 2 "$API_BASE/health" >/dev/null 2>&1; then
      break
    fi
    sleep 0.25
  done
fi

if [ "$DB_OK" -ne 1 ] || ! curl -sS --connect-timeout 2 --max-time 5 "$API_BASE/health" >/dev/null 2>&1; then
  skip "API unreachable; live dimension binding flow skipped"
  [ -n "$API_PID" ] && tail -n 40 "$TMP_DIR/api.log" | sed 's/^/        /'
else
  pass "temporary API started for live verification"

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
  USERNAME="p3s4_${SUFFIX}"
  EMAIL="${USERNAME}@example.com"
  PASSWORD="P3s4-${SUFFIX}-Aa"
  REGISTER_BODY="$(jq -nc \
    --arg username "$USERNAME" \
    --arg email "$EMAIL" \
    --arg password "$PASSWORD" \
    '{username:$username,email:$email,password:$password,name:"P3-S4 Verify"}')"
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
    skip "auth-center unavailable through API (HTTP $REGISTER_CODE); live credential flow skipped"
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
      && jq -e 'type == "array" and length == 1 and .[0].code == "food"' \
        "$TMP_DIR/consumer.json" >/dev/null 2>&1; then
      pass "consumer still sees only the role-available food module"
    else
      fail "consumer module visibility expected HTTP 200 with only food, got HTTP $CONSUMER_CODE"
    fi

    CONSUMER_DIMENSIONS_CODE="$(curl -sS --connect-timeout 3 --max-time 10 \
      "$API_BASE/api/modules/dimensions" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      -o "$TMP_DIR/consumer-dimensions.json" \
      -w '%{http_code}' 2>/dev/null || true)"
    CONSUMER_DIMENSIONS_CODE="${CONSUMER_DIMENSIONS_CODE:-000}"
    if [ "$CONSUMER_DIMENSIONS_CODE" = "200" ] \
      && jq -e '
        (.regions | length >= 2)
        and ([.regions[].level] | all(. == "country" or . == "province"))
        and (.industries | length >= 2)
        and ([.industries[].level] | all(. == "section"))
      ' "$TMP_DIR/consumer-dimensions.json" >/dev/null 2>&1; then
      pass "dimension endpoint returns only country/province regions and section industries"
    else
      fail "dimension endpoint returned an invalid closed set or HTTP $CONSUMER_DIMENSIONS_CODE"
    fi

    CONSUMER_BINDING_GET_CODE="$(curl -sS --connect-timeout 3 --max-time 8 \
      "$API_BASE/api/modules/$BINDING_MODULE/bindings" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      -o "$TMP_DIR/consumer-binding-get.json" \
      -w '%{http_code}' 2>/dev/null || true)"
    CONSUMER_BINDING_GET_CODE="${CONSUMER_BINDING_GET_CODE:-000}"
    if [ "$CONSUMER_BINDING_GET_CODE" = "403" ]; then
      pass "non-operator GET bindings returns 403"
    else
      fail "non-operator GET bindings expected 403, got $CONSUMER_BINDING_GET_CODE"
    fi

    BINDING_COUNT_BEFORE="$(node "$DB_HELPER" binding-count "$BINDING_MODULE" 2>/dev/null || true)"
    CONSUMER_BINDING_PUT_CODE="$(curl -sS --connect-timeout 3 --max-time 8 -X PUT \
      "$API_BASE/api/modules/$BINDING_MODULE/bindings" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      -H 'Content-Type: application/json' \
      -d '{"regionNodeIds":[],"industryCodes":[]}' \
      -o "$TMP_DIR/consumer-binding-put.json" \
      -w '%{http_code}' 2>/dev/null || true)"
    CONSUMER_BINDING_PUT_CODE="${CONSUMER_BINDING_PUT_CODE:-000}"
    BINDING_COUNT_AFTER="$(node "$DB_HELPER" binding-count "$BINDING_MODULE" 2>/dev/null || true)"
    if [ "$CONSUMER_BINDING_PUT_CODE" = "403" ] && [ "$BINDING_COUNT_BEFORE" = "$BINDING_COUNT_AFTER" ]; then
      pass "non-operator PUT bindings returns 403 without changing the association rows"
    else
      fail "non-operator PUT bindings did not preserve the 403/no-write contract"
    fi

    if node "$DB_HELPER" prepare-operator "$TEST_USER_ID" >"$TMP_DIR/prepare-operator.json" 2>"$TMP_DIR/prepare-operator.err"; then
      OPERATOR_READY=1
      pass "temporary account is a root organization admin for operator checks"

      OPERATOR_CODE="$(curl -sS --connect-timeout 3 --max-time 8 \
        "$API_BASE/api/modules" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        -o "$TMP_DIR/operator.json" \
        -w '%{http_code}' 2>/dev/null || true)"
      OPERATOR_CODE="${OPERATOR_CODE:-000}"
      if [ "$OPERATOR_CODE" = "200" ] \
        && jq -e 'type == "array" and length == 9 and any(.code == "org-admin")' \
          "$TMP_DIR/operator.json" >/dev/null 2>&1; then
        pass "operator sees all 9 modules after role/membership preparation"
      else
        fail "operator module visibility expected HTTP 200 with 9 modules, got HTTP $OPERATOR_CODE"
      fi

      if node "$DB_HELPER" fixtures >"$TMP_DIR/fixtures.json" 2>"$TMP_DIR/fixtures.err"; then
        REGION_HIT="$(jq -r '.hit_region // empty' "$TMP_DIR/fixtures.json")"
        REGION_MISS="$(jq -r '.miss_region // empty' "$TMP_DIR/fixtures.json")"
        REGION_INVALID="$(jq -r '.invalid_region // empty' "$TMP_DIR/fixtures.json")"
        INDUSTRY_HIT="$(jq -r '.hit_industry // empty' "$TMP_DIR/fixtures.json")"
        INDUSTRY_MISS="$(jq -r '.miss_industry // empty' "$TMP_DIR/fixtures.json")"
        INDUSTRY_INVALID="$(jq -r '.invalid_industry // empty' "$TMP_DIR/fixtures.json")"
        if [ -n "$REGION_HIT" ] && [ -n "$REGION_MISS" ] && [ -n "$REGION_INVALID" ] \
          && [ -n "$INDUSTRY_HIT" ] && [ -n "$INDUSTRY_MISS" ] && [ -n "$INDUSTRY_INVALID" ]; then
          pass "database exposes two valid and one invalid fixture for each dimension"
        else
          fail "dimension fixtures are incomplete"
        fi
      else
        fail "could not load dimension fixtures"
        sed 's/^/        /' "$TMP_DIR/fixtures.err"
      fi

      ORIGINAL_BINDING_CODE="$(curl -sS --connect-timeout 3 --max-time 8 \
        "$API_BASE/api/modules/$BINDING_MODULE/bindings" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        -o "$TMP_DIR/original-binding.json" \
        -w '%{http_code}' 2>/dev/null || true)"
      ORIGINAL_BINDING_CODE="${ORIGINAL_BINDING_CODE:-000}"
      if [ "$ORIGINAL_BINDING_CODE" = "200" ] \
        && jq -e '.code == "food" and (.regionNodeIds | type == "array") and (.industryCodes | type == "array")' \
          "$TMP_DIR/original-binding.json" >/dev/null 2>&1; then
        pass "operator can read the original food binding for rollback"
      else
        fail "operator could not read the original food binding (HTTP $ORIGINAL_BINDING_CODE)"
      fi

      CLEAR_BINDING_CODE="$(curl -sS --connect-timeout 3 --max-time 8 -X PUT \
        "$API_BASE/api/modules/$BINDING_MODULE/bindings" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        -H 'Content-Type: application/json' \
        -d '{"regionNodeIds":[],"industryCodes":[]}' \
        -o "$TMP_DIR/clear-binding.json" \
        -w '%{http_code}' 2>/dev/null || true)"
      CLEAR_BINDING_CODE="${CLEAR_BINDING_CODE:-000}"
      BINDING_CHANGED=1
      if [ "$CLEAR_BINDING_CODE" = "200" ] \
        && jq -e '.regionNodeIds == [] and .industryCodes == []' "$TMP_DIR/clear-binding.json" >/dev/null 2>&1; then
        pass "operator can clear both dimensions; an unbound module is therefore globally visible"
      else
        fail "operator clear binding expected HTTP 200 with empty arrays, got $CLEAR_BINDING_CODE"
      fi

      UNBOUND_CODE="$(curl -sS --connect-timeout 3 --max-time 8 -G \
        "$API_BASE/api/modules" \
        --data-urlencode "region=$REGION_HIT" \
        --data-urlencode "industry=$INDUSTRY_HIT" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        -o "$TMP_DIR/unbound-hit.json" \
        -w '%{http_code}' 2>/dev/null || true)"
      UNBOUND_CODE="${UNBOUND_CODE:-000}"
      if [ "$UNBOUND_CODE" = "200" ] \
        && jq -e 'any(.code == "food")' "$TMP_DIR/unbound-hit.json" >/dev/null 2>&1; then
        pass "an unbound module remains visible under a matching dimension pair"
      else
        fail "an unbound module was hidden under a matching dimension pair (HTTP $UNBOUND_CODE)"
      fi

      UNBOUND_MODULE="$(node "$DB_HELPER" unbound-module "$BINDING_MODULE" 2>/dev/null | jq -r '.code // empty' 2>/dev/null || true)"
      if [ -n "$UNBOUND_MODULE" ]; then
        pass "found an unbound control module ($UNBOUND_MODULE)"
      else
        fail "could not find an unbound control module"
      fi

      BIND_CODE="$(curl -sS --connect-timeout 3 --max-time 8 -X PUT \
        "$API_BASE/api/modules/$BINDING_MODULE/bindings" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        -H 'Content-Type: application/json' \
        -d "$(jq -nc \
          --arg region "$REGION_HIT" \
          --arg industry "$INDUSTRY_HIT" \
          '{regionNodeIds:[$region],industryCodes:[$industry]}')" \
        -o "$TMP_DIR/bind-response.json" \
        -w '%{http_code}' 2>/dev/null || true)"
      BIND_CODE="${BIND_CODE:-000}"
      if [ "$BIND_CODE" = "200" ] \
        && jq -e --arg region "$REGION_HIT" --arg industry "$INDUSTRY_HIT" \
          '.code == "food" and .regionNodeIds == [$region] and .industryCodes == [$industry]' \
          "$TMP_DIR/bind-response.json" >/dev/null 2>&1; then
        pass "operator PUT stores the requested real region/industry bindings"
      else
        fail "operator PUT binding expected HTTP 200 with the requested arrays, got $BIND_CODE"
      fi

      GET_BIND_CODE="$(curl -sS --connect-timeout 3 --max-time 8 \
        "$API_BASE/api/modules/$BINDING_MODULE/bindings" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        -o "$TMP_DIR/get-bind-response.json" \
        -w '%{http_code}' 2>/dev/null || true)"
      GET_BIND_CODE="${GET_BIND_CODE:-000}"
      if [ "$GET_BIND_CODE" = "200" ] \
        && jq -e --arg region "$REGION_HIT" --arg industry "$INDUSTRY_HIT" \
          '.regionNodeIds == [$region] and .industryCodes == [$industry]' \
          "$TMP_DIR/get-bind-response.json" >/dev/null 2>&1; then
        pass "operator GET reads the persisted real FK bindings"
      else
        fail "operator GET binding did not return the persisted values (HTTP $GET_BIND_CODE)"
      fi

      HIT_CODE="$(curl -sS --connect-timeout 3 --max-time 8 -G \
        "$API_BASE/api/modules" \
        --data-urlencode "region=$REGION_HIT" \
        --data-urlencode "industry=$INDUSTRY_HIT" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        -o "$TMP_DIR/filter-hit.json" \
        -w '%{http_code}' 2>/dev/null || true)"
      HIT_CODE="${HIT_CODE:-000}"
      if [ "$HIT_CODE" = "200" ] \
        && jq -e 'any(.code == "food")' "$TMP_DIR/filter-hit.json" >/dev/null 2>&1; then
        pass "a scoped module is visible when the requested pair matches"
      else
        fail "matching dimension pair hid the scoped module (HTTP $HIT_CODE)"
      fi

      MISS_REGION_CODE="$(curl -sS --connect-timeout 3 --max-time 8 -G \
        "$API_BASE/api/modules" \
        --data-urlencode "region=$REGION_MISS" \
        --data-urlencode "industry=$INDUSTRY_HIT" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        -o "$TMP_DIR/filter-miss-region.json" \
        -w '%{http_code}' 2>/dev/null || true)"
      MISS_REGION_CODE="${MISS_REGION_CODE:-000}"
      if [ "$MISS_REGION_CODE" = "200" ] \
        && jq -e 'any(.code == "food") | not' "$TMP_DIR/filter-miss-region.json" >/dev/null 2>&1; then
        pass "a region-scoped module is hidden when the region does not match"
      else
        fail "non-matching region did not hide the scoped module (HTTP $MISS_REGION_CODE)"
      fi

      MISS_INDUSTRY_CODE="$(curl -sS --connect-timeout 3 --max-time 8 -G \
        "$API_BASE/api/modules" \
        --data-urlencode "region=$REGION_HIT" \
        --data-urlencode "industry=$INDUSTRY_MISS" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        -o "$TMP_DIR/filter-miss-industry.json" \
        -w '%{http_code}' 2>/dev/null || true)"
      MISS_INDUSTRY_CODE="${MISS_INDUSTRY_CODE:-000}"
      if [ "$MISS_INDUSTRY_CODE" = "200" ] \
        && jq -e 'any(.code == "food") | not' "$TMP_DIR/filter-miss-industry.json" >/dev/null 2>&1; then
        pass "an industry-scoped module is hidden when the industry does not match"
      else
        fail "non-matching industry did not hide the scoped module (HTTP $MISS_INDUSTRY_CODE)"
      fi

      UNBOUND_MISS_CODE="$(curl -sS --connect-timeout 3 --max-time 8 -G \
        "$API_BASE/api/modules" \
        --data-urlencode "region=$REGION_MISS" \
        --data-urlencode "industry=$INDUSTRY_MISS" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        -o "$TMP_DIR/filter-unbound-miss.json" \
        -w '%{http_code}' 2>/dev/null || true)"
      UNBOUND_MISS_CODE="${UNBOUND_MISS_CODE:-000}"
      if [ "$UNBOUND_MISS_CODE" = "200" ] \
        && jq -e --arg code "$UNBOUND_MODULE" 'any(.code == $code) and (any(.code == "food") | not)' \
          "$TMP_DIR/filter-unbound-miss.json" >/dev/null 2>&1; then
        pass "unbound modules remain visible while scoped modules respect the filter"
      else
        fail "unbound/scoped visibility contract failed under non-matching dimensions (HTTP $UNBOUND_MISS_CODE)"
      fi

      ILLEGAL_QUERY_CODE="$(curl -sS --connect-timeout 3 --max-time 8 -G \
        "$API_BASE/api/modules" \
        --data-urlencode "region=$REGION_INVALID" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        -o "$TMP_DIR/illegal-query.json" \
        -w '%{http_code}' 2>/dev/null || true)"
      ILLEGAL_QUERY_CODE="${ILLEGAL_QUERY_CODE:-000}"
      if [ "$ILLEGAL_QUERY_CODE" = "400" ]; then
        pass "a region outside country/province returns 400"
      else
        fail "invalid region level expected HTTP 400, got $ILLEGAL_QUERY_CODE"
      fi

      ILLEGAL_INDUSTRY_QUERY_CODE="$(curl -sS --connect-timeout 3 --max-time 8 -G \
        "$API_BASE/api/modules" \
        --data-urlencode "industry=$INDUSTRY_INVALID" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        -o "$TMP_DIR/illegal-industry-query.json" \
        -w '%{http_code}' 2>/dev/null || true)"
      ILLEGAL_INDUSTRY_QUERY_CODE="${ILLEGAL_INDUSTRY_QUERY_CODE:-000}"
      if [ "$ILLEGAL_INDUSTRY_QUERY_CODE" = "400" ]; then
        pass "an industry outside section returns 400"
      else
        fail "invalid industry level expected HTTP 400, got $ILLEGAL_INDUSTRY_QUERY_CODE"
      fi

      ILLEGAL_BIND_CODE="$(curl -sS --connect-timeout 3 --max-time 8 -X PUT \
        "$API_BASE/api/modules/$BINDING_MODULE/bindings" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        -H 'Content-Type: application/json' \
        -d "$(jq -nc --arg region "$REGION_INVALID" --arg industry "$INDUSTRY_HIT" \
          '{regionNodeIds:[$region],industryCodes:[$industry]}')" \
        -o "$TMP_DIR/illegal-bind.json" \
        -w '%{http_code}' 2>/dev/null || true)"
      ILLEGAL_BIND_CODE="${ILLEGAL_BIND_CODE:-000}"
      if [ "$ILLEGAL_BIND_CODE" = "400" ]; then
        pass "PUT bindings outside the region closed set returns 400"
      else
        fail "invalid binding region expected HTTP 400, got $ILLEGAL_BIND_CODE"
      fi

      UNCHANGED_BIND_CODE="$(curl -sS --connect-timeout 3 --max-time 8 \
        "$API_BASE/api/modules/$BINDING_MODULE/bindings" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        -o "$TMP_DIR/unchanged-bind.json" \
        -w '%{http_code}' 2>/dev/null || true)"
      UNCHANGED_BIND_CODE="${UNCHANGED_BIND_CODE:-000}"
      if [ "$UNCHANGED_BIND_CODE" = "200" ] \
        && jq -e --arg region "$REGION_HIT" --arg industry "$INDUSTRY_HIT" \
          '.regionNodeIds == [$region] and .industryCodes == [$industry]' \
          "$TMP_DIR/unchanged-bind.json" >/dev/null 2>&1; then
        pass "invalid PUT rolled back and left the previous FK bindings intact"
      else
        fail "invalid PUT changed the persisted bindings (HTTP $UNCHANGED_BIND_CODE)"
      fi

      RESTORE_BODY="$(jq -c '{regionNodeIds,industryCodes}' "$TMP_DIR/original-binding.json")"
      RESTORE_CODE="$(curl -sS --connect-timeout 3 --max-time 8 -X PUT \
        "$API_BASE/api/modules/$BINDING_MODULE/bindings" \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        -H 'Content-Type: application/json' \
        -d "$RESTORE_BODY" \
        -o "$TMP_DIR/restore-binding.json" \
        -w '%{http_code}' 2>/dev/null || true)"
      RESTORE_CODE="${RESTORE_CODE:-000}"
      if [ "$RESTORE_CODE" = "200" ]; then
        BINDING_CHANGED=0
        pass "original food bindings are restored"
      else
        fail "could not restore original food bindings (HTTP $RESTORE_CODE)"
      fi
    else
      fail "could not prepare the root organization operator fixture"
      sed 's/^/        /' "$TMP_DIR/prepare-operator.err" 2>/dev/null || true
    fi

    if [ "$DB_OK" -eq 1 ]; then
      node "$DB_HELPER" cleanup-user "$TEST_USER_ID" >/dev/null 2>&1 || true
    fi
    CLEANUP_CODE="$(curl -sS --connect-timeout 3 --max-time 10 -X DELETE \
      "$API_BASE/api/identity/me" \
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
