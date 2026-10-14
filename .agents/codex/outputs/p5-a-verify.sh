#!/usr/bin/env bash
# P5-A verification: UN CPC resource ontology, migration, import, taxonomy API and Explorer.
set -uo pipefail

ROOT="${GRI_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
cd "$ROOT"

PASS=0
FAIL=0
SKIP=0
TMP_DIR="$(mktemp -d)"
RUN_ID="$$_$(date +%s)"
WEB_TMP_DIR="$ROOT/apps/explorer/_p5a_tmp/verify-$RUN_ID"

API_CONTAINER="${GRI_API_CONTAINER:-gri-api}"
DB_CONTAINER="${GRI_DB_CONTAINER:-gri-postgres}"
DB_NAME="${GRI_DB_NAME:-gri}"
API_PORT="${P5A_API_PORT:-3021}"
P5A_FILE_BASE="${P5A_FILE_BASE:-https://nginx}"

REMOTE_ROOT="/tmp/p5a-verify-$RUN_ID"
REMOTE_API_DIR="$REMOTE_ROOT/api"
REMOTE_IMPORT_DIR="$REMOTE_ROOT/import"
REMOTE_API_TGZ="$REMOTE_ROOT/api-dist.tgz"
REMOTE_IMPORT_TGZ="$REMOTE_ROOT/import-bundle.tgz"
REMOTE_API_LOG="$REMOTE_ROOT/api.log"
REMOTE_API_PID="$REMOTE_ROOT/api.pid"

pass() { PASS=$((PASS + 1)); echo "  PASS  $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  FAIL  $1"; }
skip() { SKIP=$((SKIP + 1)); echo "  SKIP  $1"; }

docker_exec() {
  local attempt
  for attempt in 1 2 3; do
    if docker exec "$@"; then
      return 0
    fi
    sleep 1
  done
  return 1
}

cleanup() {
  if command -v docker >/dev/null 2>&1; then
    docker_exec "$API_CONTAINER" sh -lc \
      "if [ -f '$REMOTE_API_PID' ]; then kill \$(cat '$REMOTE_API_PID') 2>/dev/null || true; fi; rm -rf '$REMOTE_ROOT'" \
      >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP_DIR" "$WEB_TMP_DIR"
  rmdir "$(dirname "$WEB_TMP_DIR")" 2>/dev/null || true
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

run_step() {
  local description="$1"
  local log="$2"
  shift 2
  if "$@" >"$log" 2>&1; then
    pass "$description"
    return 0
  fi
  fail "$description"
  tail -n 80 "$log" | sed 's/^/        /'
  return 1
}

check_db_eq() {
  local description="$1"
  local sql="$2"
  local expected="$3"
  local actual
  actual="$(docker_exec "$DB_CONTAINER" psql -U postgres -d "$DB_NAME" -Atc "$sql" 2>/dev/null | tr -d '[:space:]')"
  if [ "$actual" = "$expected" ]; then
    pass "$description"
  else
    fail "$description (expected $expected, got ${actual:-<empty>})"
  fi
}

echo "== P5-A verification =="
echo "== 1. static contract =="

YAML="packages/ontology/ontologies/un-cpc.ontology.yaml"
MIGRATION="services/api/src/migrate/028_un_cpc.sql"
CODEGEN_TEST="packages/codegen/tests/constraints.test.js"
IMPORT="scripts/reference-data/import.mjs"
IMPORT_DATA="scripts/reference-data/data/un-cpc.json"
TAXONOMY_TYPES="services/api/src/modules/taxonomy/taxonomy.types.ts"
TAXONOMY_SERVICE="services/api/src/modules/taxonomy/taxonomy.service.ts"
TAXONOMY_SPEC="services/api/src/modules/taxonomy/taxonomy.service.spec.ts"
PUBLIC_SPEC="services/api/src/auth/public-routes.spec.ts"
EXPLORER="apps/explorer/index.html"

assert_file "P5-A file list exists" "p5-a-file-list.md"
assert_file "P5-A verify script exists" "p5-a-verify.sh"
assert_file "UN CPC ontology exists" "$YAML"
assert_file "migration 028 exists" "$MIGRATION"
assert_file "codegen constraint test exists" "$CODEGEN_TEST"
assert_file "CPC import dataset exists" "$IMPORT_DATA"

assert_contains "ontology declares un-cpc" "$YAML" "name: un-cpc"
assert_contains "ontology declares Resource" "$YAML" "name: Resource"
assert_contains "ontology targets ontology.resource" "$YAML" "table: ontology.resource"
assert_contains "ontology declares unique code" "$YAML" "unique: true"
assert_contains "ontology declares self-link" "$YAML" "source: Resource"
assert_contains "ontology declares parentResource" "$YAML" "name: parentResource"
assert_contains "ontology declares section level" "$YAML" "values: [section, division, group, class, subclass]"
assert_contains "ontology declares lifecycle states" "$YAML" "states: [draft, active, archived]"
assert_contains "ontology declares twinActive" "$YAML" "name: twinActive"
assert_contains "ontology opts level into dbCheck" "$YAML" "dbCheck: true"

assert_contains "028 creates resource table" "$MIGRATION" "CREATE TABLE IF NOT EXISTS ontology.resource"
assert_contains "028 makes code unique" "$MIGRATION" "code VARCHAR(255) NOT NULL UNIQUE"
assert_contains "028 creates parent FK" "$MIGRATION" "FOREIGN KEY (parent_id) REFERENCES ontology.resource(id)"
assert_contains "028 creates self-index" "$MIGRATION" "idx_resource_parent_id"
assert_contains "028 has level CHECK" "$MIGRATION" "CHECK (level IN ('section', 'division', 'group', 'class', 'subclass'))"
assert_contains "028 has status CHECK" "$MIGRATION" "CHECK (status IN ('draft', 'active', 'archived'))"
assert_contains "028 reserves twin_active" "$MIGRATION" "twin_active BOOLEAN DEFAULT FALSE"

assert_contains "codegen test verifies dbCheck" "$CODEGEN_TEST" "dbCheck"
assert_contains "codegen test verifies 028 parity" "$CODEGEN_TEST" "028_un_cpc.sql"
assert_contains "import declares un-cpc dataset" "$IMPORT" "file: 'un-cpc.json'"
assert_contains "import targets ontology.resource" "$IMPORT" "table: 'ontology.resource'"
assert_contains "import uses code anchor" "$IMPORT" "anchor: 'code'"
assert_contains "import wires source parent" "$IMPORT" "parentKey: (n)"

assert_contains "taxonomy type includes resource" "$TAXONOMY_TYPES" "export type TaxonomyName = 'region' | 'industry' | 'resource';"
assert_contains "taxonomy service has resource select" "$TAXONOMY_SERVICE" "RESOURCE_NODE_SELECT"
assert_contains "taxonomy service branches resource" "$TAXONOMY_SERVICE" "kind === 'resource'"
assert_contains "taxonomy service searches resource" "$TAXONOMY_SERVICE" "private async searchResources"
assert_contains "taxonomy service paths resource" "$TAXONOMY_SERVICE" "private async pathResources"
assert_contains "taxonomy service maps resource" "$TAXONOMY_SERVICE" "private mapResource"
assert_contains "taxonomy spec covers resource children" "$TAXONOMY_SPEC" "resource children 默认从 section 根开始"
assert_contains "taxonomy spec covers resource search/path/tree" "$TAXONOMY_SPEC" "resource search/path/fullTree"
assert_contains "taxonomy spec covers resource 400/404" "$TAXONOMY_SPEC" "resource 非法编码"
assert_contains "public routes spec covers resource tree" "$PUBLIC_SPEC" "isPublicRoute('GET', '/taxonomy/resource/tree')"
assert_contains "public routes spec covers resource write gate" "$PUBLIC_SPEC" "isPublicRoute('POST', '/taxonomy/resource/node')"

assert_contains "Explorer has resource tab" "$EXPLORER" 'data-dim="resource"'
assert_contains "Explorer accepts resource query" "$EXPLORER" "requestedDim === 'resource'"
assert_contains "Explorer loads resource tree" "$EXPLORER" "fetch('/api/taxonomy/resource/tree'"
assert_contains "Explorer has resource shell" "$EXPLORER" "gri-resource-shell"
assert_contains "Explorer renders CPC tree rows" "$EXPLORER" "tree-row"

if [ -z "$(git diff --name-only -- services/api/src/migrate)" ] && [ -f "$MIGRATION" ]; then
  pass "no existing migration files modified"
else
  fail "existing migration files changed unexpectedly"
fi

run_step "git diff whitespace check" "$TMP_DIR/diff-check.log" git diff --check

echo "== 2. codegen parity =="
mkdir -p "$TMP_DIR/codegen"
if node packages/codegen/src/cli.js "$YAML" --tracks sql --out-dir "$TMP_DIR/codegen" >"$TMP_DIR/codegen-cli.log" 2>&1; then
  GEN_SQL="$(find "$TMP_DIR/codegen" -maxdepth 1 -type f -name '*.sql' | head -n 1)"
  if [ -z "$GEN_SQL" ]; then
    fail "codegen produced SQL output"
  else
    if node - "$GEN_SQL" "$MIGRATION" <<'NODE'
const fs = require('fs');
const strip = (sql) => sql
  .split(/\r?\n/)
  .filter((line) => {
    const trimmed = line.trim();
    return trimmed && !trimmed.startsWith('--') && trimmed !== 'BEGIN;' && trimmed !== 'COMMIT;';
  })
  .join('\n');
const generated = strip(fs.readFileSync(process.argv[2], 'utf8'));
const committed = strip(fs.readFileSync(process.argv[3], 'utf8'));
if (generated !== committed) {
  console.error('codegen SQL differs from 028_un_cpc.sql');
  process.exit(1);
}
NODE
    then
      pass "codegen SQL matches migration 028"
    else
      fail "codegen SQL matches migration 028"
    fi
  fi
else
  fail "codegen CLI validates un-cpc ontology"
  tail -n 60 "$TMP_DIR/codegen-cli.log" | sed 's/^/        /'
fi

echo "== 3. package tests, typecheck, and full regression =="
run_step "ontology tests" "$TMP_DIR/ontology-tests.log" npm run test:ontology
run_step "codegen tests" "$TMP_DIR/codegen-tests.log" npm run test:codegen
run_step "services/api TypeScript" "$TMP_DIR/tsc.log" \
  bash -lc "cd '$ROOT/services/api' && npx tsc --noEmit"

if (cd "$ROOT/services/api" && npx jest --runInBand --colors=false) >"$TMP_DIR/full-jest.log" 2>&1; then
  SUITES="$(sed -n 's/^Test Suites:[[:space:]]*\([0-9][0-9]*\) passed,.*/\1/p' "$TMP_DIR/full-jest.log" | tail -n 1)"
  TESTS="$(sed -n 's/^Tests:[[:space:]]*\([0-9][0-9]*\) passed,.*/\1/p' "$TMP_DIR/full-jest.log" | tail -n 1)"
  if [ "$SUITES" = "42" ] && [ -n "$TESTS" ] && [ "$TESTS" -ge 595 ]; then
    pass "services/api full Jest (42 suites / ${TESTS} tests, baseline 595)"
  else
    fail "services/api full Jest count changed (suites=${SUITES:-<empty>} tests=${TESTS:-<empty>})"
    tail -n 40 "$TMP_DIR/full-jest.log" | sed 's/^/        /'
  fi
else
  fail "services/api full Jest regressed"
  tail -n 80 "$TMP_DIR/full-jest.log" | sed 's/^/        /'
fi

run_step "services/api build" "$TMP_DIR/build.log" \
  npm run build --workspace=services/api

cat >"$TMP_DIR/di-smoke.cjs" <<'NODE'
const path = require('path');
const root = process.env.GRI_ROOT;

process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'gri';
process.env.DB_USER = 'postgres';
process.env.DB_PASSWORD = 'postgres';
process.env.AUTH_JWKS_URL = 'http://127.0.0.1:1/auth/jwks';
process.env.AUTH_CENTER_URL = 'http://127.0.0.1:1';

const { NestFactory } = require('@nestjs/core');
const { AppModule } = require(path.join(root, 'services/api/dist/app.module.js'));
const { LlmService } = require(path.join(root, 'services/api/dist/modules/tuition/agents/llm.service.js'));
const { TeachingCardFsm } = require(path.join(root, 'services/api/dist/modules/tuition/agents/teaching-card-fsm.js'));
const { IntentClassifier } = require(path.join(root, 'services/api/dist/modules/tuition/agents/intent-classifier.js'));
const { SocraticTemplates } = require(path.join(root, 'services/api/dist/modules/tuition/agents/socratic-templates.js'));
const { OcrProcessor } = require(path.join(root, 'services/api/dist/modules/tuition/agents/ocr-processor.js'));
const { QuestionParser } = require(path.join(root, 'services/api/dist/modules/tuition/agents/question-parser.js'));
const { VariantGenerator } = require(path.join(root, 'services/api/dist/modules/tuition/agents/variant-generator.js'));
const { TaxonomyService } = require(path.join(root, 'services/api/dist/modules/taxonomy/taxonomy.service.js'));

(async () => {
  const app = await NestFactory.create(AppModule, { logger: false });
  await app.init();
  const tokens = [
    LlmService,
    TeachingCardFsm,
    IntentClassifier,
    SocraticTemplates,
    OcrProcessor,
    QuestionParser,
    VariantGenerator,
    TaxonomyService,
  ];
  const instances = tokens.map((token) => app.get(token));
  if (instances.some((instance) => !instance)) throw new Error('missing provider instance');
  console.log(`DI_OK providers=${instances.length} llm=${instances[0].constructor.name} taxonomy=${instances[7].constructor.name}`);
  await app.close();
})().catch((error) => {
  console.error('DI_FAIL', error.stack || error.message);
  process.exit(1);
});
NODE

run_step "services/api Nest DI construction (no listen)" "$TMP_DIR/di.log" \
  env GRI_ROOT="$ROOT" NODE_PATH="$ROOT/node_modules" node "$TMP_DIR/di-smoke.cjs"

echo "== 4. migration, idempotent import, and DB assertions =="
DOCKER_OK=0
if command -v docker >/dev/null 2>&1 && docker_exec "$API_CONTAINER" true >/dev/null 2>&1; then
  DOCKER_OK=1
  pass "docker api container is reachable"
else
  skip "docker api container is reachable (sandbox/daemon unavailable)"
fi

if [ "$DOCKER_OK" = 1 ]; then
  mkdir -p "$WEB_TMP_DIR"
  tar -czf "$WEB_TMP_DIR/api-dist.tgz" -C "$ROOT/services/api" dist
  tar -czf "$WEB_TMP_DIR/import-bundle.tgz" -C "$ROOT/scripts/reference-data" \
    import.mjs data/un-regions.json data/isic-rev5.json data/un-cpc.json

  if docker_exec "$API_CONTAINER" sh -lc "
    set -eu
    mkdir -p '$REMOTE_ROOT' '$REMOTE_API_DIR' '$REMOTE_IMPORT_DIR'
    wget --no-check-certificate -qO '$REMOTE_API_TGZ' '$P5A_FILE_BASE/explore/_p5a_tmp/verify-$RUN_ID/api-dist.tgz'
    wget --no-check-certificate -qO '$REMOTE_IMPORT_TGZ' '$P5A_FILE_BASE/explore/_p5a_tmp/verify-$RUN_ID/import-bundle.tgz'
    tar -xzf '$REMOTE_API_TGZ' -C '$REMOTE_API_DIR' --strip-components=1
    tar -xzf '$REMOTE_IMPORT_TGZ' -C '$REMOTE_IMPORT_DIR'
    ln -sfn /app/node_modules /tmp/node_modules
  " >"$TMP_DIR/stage.log" 2>&1; then
    pass "build and import bundles staged into $API_CONTAINER"
  else
    fail "build and import bundles staged into $API_CONTAINER"
    tail -n 80 "$TMP_DIR/stage.log" | sed 's/^/        /'
  fi

  run_step "migration runner includes 028" "$TMP_DIR/migrate.log" \
    docker_exec -e DB_HOST=postgres -e DB_PORT=5432 -e DB_NAME="$DB_NAME" \
      -e DB_USER=postgres -e DB_PASSWORD=postgres \
      "$API_CONTAINER" node "$REMOTE_API_DIR/migrate/run-migrations.js"
  assert_contains "migration 028 is recorded" "$TMP_DIR/migrate.log" "028_un_cpc.sql"

  for run in 1 2; do
    if docker_exec -e DB_HOST=postgres -e DB_PORT=5432 -e DB_NAME="$DB_NAME" \
      -e DB_USER=postgres -e DB_PASSWORD=postgres \
      "$API_CONTAINER" node "$REMOTE_IMPORT_DIR/import.mjs" >"$TMP_DIR/import-$run.log" 2>&1; then
      pass "reference-data import run $run"
    else
      fail "reference-data import run $run"
      tail -n 80 "$TMP_DIR/import-$run.log" | sed 's/^/        /'
    fi
    assert_contains "import run $run upserts 4586 CPC nodes" "$TMP_DIR/import-$run.log" \
      "ontology.resource: upsert 4586, parent 回填 4576, 悬空 0"
  done

  check_db_eq "migration 028 registered once" \
    "SELECT count(*)::text FROM public._api_migrations WHERE name='028_un_cpc.sql';" "1"
  check_db_eq "ontology.resource has 4586 rows" \
    "SELECT count(*)::text FROM ontology.resource;" "4586"
  check_db_eq "ontology.resource code is unique" \
    "SELECT count(*)::text FROM (SELECT code FROM ontology.resource GROUP BY code HAVING count(*) > 1) duplicated;" "0"
  check_db_eq "ontology.resource has 10 roots" \
    "SELECT count(*)::text FROM ontology.resource WHERE parent_id IS NULL;" "10"
  check_db_eq "ontology.resource backfills 4576 parents" \
    "SELECT count(*)::text FROM ontology.resource WHERE parent_id IS NOT NULL;" "4576"
  check_db_eq "ontology.resource has no dangling parents" \
    "SELECT count(*)::text FROM ontology.resource c LEFT JOIN ontology.resource p ON p.id = c.parent_id WHERE c.parent_id IS NOT NULL AND p.id IS NULL;" "0"
  check_db_eq "ontology.resource level section count" \
    "SELECT count(*)::text FROM ontology.resource WHERE level='section';" "10"
  check_db_eq "ontology.resource level division count" \
    "SELECT count(*)::text FROM ontology.resource WHERE level='division';" "71"
  check_db_eq "ontology.resource level group count" \
    "SELECT count(*)::text FROM ontology.resource WHERE level='group';" "327"
  check_db_eq "ontology.resource level class count" \
    "SELECT count(*)::text FROM ontology.resource WHERE level='class';" "1301"
  check_db_eq "ontology.resource level subclass count" \
    "SELECT count(*)::text FROM ontology.resource WHERE level='subclass';" "2877"

  echo "== 5. live startup, DI, and HTTP smoke =="
  if docker_exec -e PORT="$API_PORT" -e NODE_ENV=production -e DB_HOST=postgres -e DB_PORT=5432 \
    -e DB_NAME="$DB_NAME" -e DB_USER=postgres -e DB_PASSWORD=postgres \
    -e AUTH_JWKS_URL=http://auth-center:3004/auth/jwks -e AUTH_CENTER_URL=http://auth-center:3004 \
    "$API_CONTAINER" sh -lc "cd '$REMOTE_API_DIR' && nohup node main.js >'$REMOTE_API_LOG' 2>&1 & echo \$! >'$REMOTE_API_PID'" \
    >"$TMP_DIR/start.log" 2>&1; then
    READY=0
    for _ in $(seq 1 45); do
      if docker_exec "$API_CONTAINER" node -e \
        "fetch('http://127.0.0.1:$API_PORT/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))" \
        >/dev/null 2>&1; then
        READY=1
        break
      fi
      sleep 1
    done

    if [ "$READY" = 1 ]; then
      pass "temporary API started and DI-constructed successfully"
      docker_exec "$API_CONTAINER" sh -lc "cat '$REMOTE_API_LOG'" >"$TMP_DIR/api.log" 2>&1 || true
      assert_contains "Nest application startup completed" "$TMP_DIR/api.log" "Nest application successfully started"
      assert_contains "runtime maps taxonomy children" "$TMP_DIR/api.log" "Mapped {/api/taxonomy/:name/children, GET} route"
      assert_contains "runtime maps taxonomy node" "$TMP_DIR/api.log" "Mapped {/api/taxonomy/:name/node/:id, GET} route"
      assert_contains "runtime maps taxonomy search" "$TMP_DIR/api.log" "Mapped {/api/taxonomy/:name/search, GET} route"
      assert_contains "runtime maps taxonomy path" "$TMP_DIR/api.log" "Mapped {/api/taxonomy/:name/path/:id, GET} route"
      assert_contains "runtime maps taxonomy tree" "$TMP_DIR/api.log" "Mapped {/api/taxonomy/:name/tree, GET} route"
    else
      fail "temporary API did not become ready"
      docker_exec "$API_CONTAINER" sh -lc "cat '$REMOTE_API_LOG'" 2>&1 | tail -n 80 | sed 's/^/        /' || true
    fi
  else
    fail "temporary API failed to start"
    tail -n 80 "$TMP_DIR/start.log" | sed 's/^/        /' || true
  fi

  cat >"$TMP_DIR/p5a-live-smoke.mjs" <<'NODE'
const PORT = process.env.P5A_API_PORT || '3021';
const BASE = `http://127.0.0.1:${PORT}/api`;

let pass = 0;
let fail = 0;

function check(ok, label, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`  PASS  ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${label}${detail ? ` (${detail})` : ''}`);
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, options);
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

const children = await request('/taxonomy/resource/children?parent=0');
check(children.status === 200, 'resource children?parent=0 -> 200', `HTTP ${children.status}`);
check(
  Array.isArray(children.body?.children) && children.body.children.length === 4,
  'resource root 0 has four divisions',
);
check(
  children.body?.children?.every((node) => node.level === 'division' && node.parentId === '0'),
  'resource root children are divisions parented to 0',
);

const node = await request('/taxonomy/resource/node/0');
check(node.status === 200, 'resource node/0 -> 200', `HTTP ${node.status}`);
check(node.body?.code === '0' && node.body?.level === 'section', 'resource node/0 returns CPC section');

const search = await request('/taxonomy/resource/search?q=agriculture&limit=10');
check(search.status === 200, 'resource search -> 200', `HTTP ${search.status}`);
check(Array.isArray(search.body?.items) && search.body.items.length > 0, 'resource search returns matches');

const path = await request('/taxonomy/resource/path/011');
check(path.status === 200, 'resource path/011 -> 200', `HTTP ${path.status}`);
check(
  JSON.stringify((path.body?.nodes ?? []).map((entry) => String(entry.code ?? entry.id))) === JSON.stringify(['0', '01', '011']),
  'resource path/011 returns root-to-node ancestry',
);

const tree = await request('/taxonomy/resource/tree');
check(tree.status === 200, 'resource tree -> 200', `HTTP ${tree.status}`);
const treeNodes = Array.isArray(tree.body?.nodes) ? tree.body.nodes : [];
check(treeNodes.length === 4586, 'resource tree contains 4586 nodes', `count=${treeNodes.length}`);
check(treeNodes.filter((entry) => entry.parent != null).length === 4576, 'resource tree has 4576 non-root nodes');
const codes = new Set(treeNodes.map((entry) => String(entry.id ?? entry.code)));
check(
  treeNodes.every((entry) => entry.parent == null || codes.has(String(entry.parent))),
  'resource tree has no dangling parents',
);

const missing = await request('/taxonomy/resource/node/99999');
check(missing.status === 404, 'unknown resource node -> 404', `HTTP ${missing.status}`);
const invalid = await request('/taxonomy/resource/node/999999');
check(invalid.status === 400, 'invalid resource id -> 400', `HTTP ${invalid.status}`);
const missingParent = await request('/taxonomy/resource/children?parent=99999');
check(missingParent.status === 404, 'unknown resource parent -> 404', `HTTP ${missingParent.status}`);
const missingSearch = await request('/taxonomy/resource/search?q=');
check(missingSearch.status === 400, 'empty resource search -> 400', `HTTP ${missingSearch.status}`);

const unknownTaxonomyResponse = await fetch(`http://127.0.0.1:${PORT}/api/taxonomy/does-not-exist/tree`);
check(unknownTaxonomyResponse.status === 404, 'unknown taxonomy -> 404', `HTTP ${unknownTaxonomyResponse.status}`);

const write = await request('/taxonomy/resource/node', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ code: 'X1', name: 'x', parentId: '0' }),
});
check(write.status === 401, 'resource write without token -> 401', `HTTP ${write.status}`);
const patch = await request('/taxonomy/resource/node/01', {
  method: 'PATCH',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name: 'x' }),
});
check(patch.status === 401, 'resource update without token -> 401', `HTTP ${patch.status}`);
const command = await request('/taxonomy/command', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ text: '归档 01' }),
});
check(command.status === 401, 'taxonomy command without token -> 401', `HTTP ${command.status}`);

console.log(`LIVE_PASS=${pass}`);
console.log(`LIVE_FAIL=${fail}`);
if (fail > 0) process.exit(1);
NODE

  if docker_exec -i -e P5A_API_PORT="$API_PORT" "$API_CONTAINER" node --input-type=module \
    <"$TMP_DIR/p5a-live-smoke.mjs" >"$TMP_DIR/live.log" 2>&1; then
    grep -E '^  (PASS|FAIL)|^LIVE_' "$TMP_DIR/live.log" | sed 's/^/  /'
    LIVE_PASS="$(sed -n 's/^LIVE_PASS=//p' "$TMP_DIR/live.log" | tail -n 1)"
    LIVE_FAIL="$(sed -n 's/^LIVE_FAIL=//p' "$TMP_DIR/live.log" | tail -n 1)"
    PASS=$((PASS + ${LIVE_PASS:-0}))
    FAIL=$((FAIL + ${LIVE_FAIL:-0}))
  else
    fail "live HTTP contract smoke"
    tail -n 100 "$TMP_DIR/live.log" | sed 's/^/        /'
  fi
else
  skip "migration/import/DB/API smoke (docker unavailable)"
fi

echo "== 6. Explorer jsdom smoke =="
cat >"$TMP_DIR/explorer-smoke.cjs" <<'NODE'
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = process.cwd();
const html = fs.readFileSync(path.join(root, 'apps/explorer/index.html'), 'utf8');
const cpc = JSON.parse(fs.readFileSync(path.join(root, 'scripts/reference-data/data/un-cpc.json'), 'utf8'));
const errors = [];
const requests = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (error) => errors.push(error.stack || error.message));
virtualConsole.on('error', (message) => errors.push(String(message)));

const dom = new JSDOM(html, {
  url: 'https://172.23.0.9/explore/?dim=resource',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole,
  beforeParse(window) {
    window.fetch = async (url) => {
      requests.push(String(url));
      if (String(url) === '/api/taxonomy/resource/tree') {
        return { ok: true, status: 200, json: async () => ({ nodes: cpc.nodes }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    };
    window.alert = () => {};
    window.confirm = () => true;
    window.addEventListener('error', (event) => {
      errors.push(event.error ? (event.error.stack || event.error.message) : event.message);
    });
  },
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  for (let i = 0; i < 200; i += 1) {
    if (dom.window.document.querySelector('.gri-resource-shell')) break;
    await wait(10);
  }
  const document = dom.window.document;
  const activeTab = document.querySelector('.gri-tabs button.on');
  const brand = document.querySelector('.gri-resource-brand span');
  const detail = document.querySelector('.gri-resource-detail h1');
  const checks = [
    [!!document.querySelector('.gri-resource-shell'), 'resource shell rendered'],
    [document.querySelectorAll('.gri-tabs button').length === 3, 'three Explorer tabs rendered'],
    [activeTab?.textContent === '资源', 'resource tab is active'],
    [document.querySelectorAll('.tree-row').length >= 81, 'CPC tree rows rendered'],
    [brand?.textContent?.includes('4586'), 'CPC node count rendered'],
    [detail?.textContent === cpc.nodes[0].name, 'resource detail renders first CPC section'],
    [requests.length === 1 && requests[0] === '/api/taxonomy/resource/tree', 'resource tree request is canonical'],
    [errors.length === 0, 'resource view has zero script errors'],
  ];
  for (const [ok, label] of checks) {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
    if (!ok) errors.push(label);
  }
  dom.window.close();
  if (errors.length) process.exit(1);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
NODE

if NODE_PATH="$ROOT/node_modules" node "$TMP_DIR/explorer-smoke.cjs" >"$TMP_DIR/explorer.log" 2>&1; then
  grep -E '^  (PASS|FAIL)' "$TMP_DIR/explorer.log" | sed 's/^/  /'
  EXPLORER_PASS="$(grep -c '^  PASS' "$TMP_DIR/explorer.log" || true)"
  EXPLORER_FAIL="$(grep -c '^  FAIL' "$TMP_DIR/explorer.log" || true)"
  PASS=$((PASS + EXPLORER_PASS))
  FAIL=$((FAIL + EXPLORER_FAIL))
else
  fail "Explorer jsdom smoke"
  tail -n 100 "$TMP_DIR/explorer.log" | sed 's/^/        /'
fi

echo "== summary =="
if [ "$FAIL" -eq 0 ]; then
  echo "全绿：PASS=$PASS FAIL=$FAIL SKIP=$SKIP"
  exit 0
fi
echo "未全绿：PASS=$PASS FAIL=$FAIL SKIP=$SKIP"
exit 1
