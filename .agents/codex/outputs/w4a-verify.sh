#!/usr/bin/env bash
# W4-a verification: CLC-anchored branch tree, K12 mappings, two read APIs, PEP audit.
set -uo pipefail

ROOT="${GRI_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
cd "$ROOT"

PASS=0
FAIL=0
SKIP=0
TMP_DIR="$(mktemp -d)"
DB_CONTAINER="${GRI_DB_CONTAINER:-gri-postgres}"
DB_NAME="${GRI_DB_NAME:-gri}"
AUTH_CENTER_BASE="${W4A_AUTH_CENTER_BASE:-http://127.0.0.1:3004}"
API_PID=""
API_PORT=""
API_LOG="$TMP_DIR/api.log"
TEMP_USER_ID=""
TEMP_USERNAME=""
TEMP_EMAIL=""
TEMP_PASSWORD=""
TEMP_TOKEN=""
TEMP_KP_ID=""

pass() { PASS=$((PASS + 1)); echo "  PASS  $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  FAIL  $1"; }
skip() { SKIP=$((SKIP + 1)); echo "  SKIP  $1"; }

psql_scalar() {
  docker exec "$DB_CONTAINER" psql -U postgres -d "$DB_NAME" -Atc "$1" 2>/dev/null | tr -d '[:space:]'
}

db_eq() {
  local description="$1"
  local sql="$2"
  local expected="$3"
  local actual
  actual="$(psql_scalar "$sql")"
  if [ "$actual" = "$expected" ]; then
    pass "$description"
  else
    fail "$description (expected $expected, got ${actual:-<empty>})"
  fi
}

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

cleanup() {
  if [ -n "$TEMP_USER_ID" ]; then
    if [ -n "$TEMP_TOKEN" ] && [ -n "$API_PORT" ]; then
      curl -sS --connect-timeout 2 --max-time 5 -X DELETE \
        "http://127.0.0.1:$API_PORT/api/identity/me" \
        -H "Authorization: Bearer $TEMP_TOKEN" \
        -o /dev/null >/dev/null 2>&1 || true
    fi
    {
      docker exec -i "$DB_CONTAINER" psql -U postgres -d "$DB_NAME" \
        -v uid="$TEMP_USER_ID" -f - <<'SQL'
DELETE FROM edu.mastery_snapshots WHERE user_id = :'uid'::uuid;
DELETE FROM public.users WHERE id = :'uid'::uuid;
SQL
    } >/dev/null 2>&1 || true
  fi
  if [ -n "$API_PID" ]; then
    kill "$API_PID" >/dev/null 2>&1 || true
    wait "$API_PID" >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

pick_api_port() {
  local candidate
  for candidate in 3019 3020 3021 3022 3023 3024 3025; do
    if ! curl -sS --connect-timeout 1 --max-time 2 \
      "http://127.0.0.1:$candidate/health" -o /dev/null >/dev/null 2>&1; then
      printf '%s' "$candidate"
      return 0
    fi
  done
  return 1
}

echo "== W4-a verification =="
echo "== 1. source and structure contract =="

BRANCH_YAML="packages/ontology/ontologies/knowledge-branch.ontology.yaml"
K12_YAML="packages/ontology/ontologies/k12-curriculum.ontology.yaml"
MIGRATION="services/api/src/migrate/031_knowledge_branch.sql"
CONTROLLER="services/api/src/modules/curriculum/curriculum.controller.ts"
SERVICE="services/api/src/modules/curriculum/curriculum.service.ts"
TYPES="services/api/src/modules/curriculum/curriculum.types.ts"
PUBLIC_ROUTES="services/api/src/auth/public-routes.ts"
PEP_AUDIT=".agents/codex/outputs/w4a-pep-audit.md"
FILE_LIST=".agents/codex/outputs/w4a-file-list.md"

assert_file "W4-a file list exists" "$FILE_LIST"
assert_file "W4-a verify script exists" "$0"
assert_file "knowledge branch ontology exists" "$BRANCH_YAML"
assert_file "migration 031 exists" "$MIGRATION"
assert_file "PEP audit exists" "$PEP_AUDIT"

assert_contains "branch ontology declares KnowledgeBranch" "$BRANCH_YAML" "name: KnowledgeBranch"
assert_contains "branch ontology targets ontology.knowledge_branch" "$BRANCH_YAML" "table: ontology.knowledge_branch"
assert_contains "branch ontology requires CLC" "$BRANCH_YAML" "name: clc"
assert_contains "branch ontology stores curriculum anchor" "$BRANCH_YAML" "name: curriculum"
assert_contains "branch ontology stores K12 minimum" "$BRANCH_YAML" "name: k12GradeMin"
assert_contains "branch ontology stores K12 maximum" "$BRANCH_YAML" "name: k12GradeMax"
assert_contains "branch ontology has self reference" "$BRANCH_YAML" "name: parentBranch"
assert_not_contains "branch ontology does not reintroduce frontier scope" "$BRANCH_YAML" "frontier"

assert_contains "K12 ontology references branch from chapter" "$K12_YAML" "name: branchOfChapter"
assert_contains "K12 ontology references branch from area" "$K12_YAML" "name: branchOfArea"
assert_contains "K12 ontology declares branch table anchor" "$K12_YAML" "table: ontology.knowledge_branch"
assert_contains "K12 ontology indexes chapter branch" "$K12_YAML" "idx_textbook_chapter_branch"
assert_contains "K12 ontology indexes area branch" "$K12_YAML" "idx_knowledge_area_branch"

assert_contains "031 creates branch table" "$MIGRATION" "CREATE TABLE IF NOT EXISTS ontology.knowledge_branch"
assert_contains "031 adds chapter branch column" "$MIGRATION" "ALTER TABLE ontology.textbook_chapter ADD COLUMN IF NOT EXISTS branch_id UUID"
assert_contains "031 adds area branch column" "$MIGRATION" "ALTER TABLE ontology.knowledge_area ADD COLUMN IF NOT EXISTS branch_id UUID"
assert_contains "031 declares chapter exception seed" "$MIGRATION" "w4a_chapter_branch_seed"
assert_contains "031 declares area exception seed" "$MIGRATION" "w4a_area_branch_seed"
assert_not_contains "031 does not use fuzzy LIKE matching" "$MIGRATION" "LIKE"
assert_not_contains "031 does not use ILIKE matching" "$MIGRATION" "ILIKE"
assert_contains "031 derives K12 spans from area placement" "$MIGRATION" "MIN(a.grade_level)"
assert_contains "031 derives K12 spans from recursive branch data" "$MIGRATION" "WITH RECURSIVE branch_tree"
assert_contains "031 has CLC whitelist assertion" "$MIGRATION" "not traceable"
assert_contains "031 has peak count assertion" "$MIGRATION" "expected % peaks"
assert_contains "031 has null chapter assertion" "$MIGRATION" "rows without branch_id"

assert_contains "controller exposes summit branches as GET" "$CONTROLLER" "@Get('summit-branches')"
assert_contains "controller exposes summit grades as GET" "$CONTROLLER" "@Get('summit-grades')"
assert_contains "controller uses externalId identity" "$CONTROLLER" "this.auth(req)?.externalId"
assert_contains "service has branch tree endpoint" "$SERVICE" "async summitBranches"
assert_contains "service has grade tree endpoint" "$SERVICE" "async summitGrades"
assert_contains "service uses mastery snapshots as source" "$SERVICE" "edu.mastery_snapshots"
assert_contains "service threshold is 80 for branches" "$SERVICE" "threshold: 80,"
assert_contains "service reaches at >= 80" "$SERVICE" "mastery >= 80"
assert_contains "types define branch peaks" "$TYPES" "interface KnowledgeBranchNode"
assert_contains "types define grade stages" "$TYPES" "interface SummitStage"
assert_not_contains "curriculum controller does not consult req.auth.roles" "$CONTROLLER" "req.auth.roles"
assert_contains "summit branch route is OptionalAuth public read" "$PUBLIC_ROUTES" "summit-branches"
assert_contains "summit grades route is OptionalAuth public read" "$PUBLIC_ROUTES" "summit-grades"

run_step "git diff whitespace check" "$TMP_DIR/diff-check.log" git diff --check

echo "== 2. codegen parity =="
mkdir -p "$TMP_DIR/codegen-branch" "$TMP_DIR/codegen-k12"
if node packages/codegen/src/cli.js "$BRANCH_YAML" --tracks sql --out-dir "$TMP_DIR/codegen-branch" \
  >"$TMP_DIR/codegen-branch.log" 2>&1; then
  GEN_BRANCH="$(find "$TMP_DIR/codegen-branch" -maxdepth 1 -type f -name '*.sql' | head -n 1)"
  if [ -n "$GEN_BRANCH" ] && node - "$GEN_BRANCH" "$MIGRATION" <<'NODE'
const fs = require('fs');
const generated = fs.readFileSync(process.argv[2], 'utf8')
  .split(/\r?\n/)
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n')
  .trim();
const migration = fs.readFileSync(process.argv[3], 'utf8');
if (!migration.includes(generated)) {
  console.error('generated knowledge_branch DDL is not the migration structure block');
  process.exit(1);
}
NODE
  then
    pass "codegen branch SQL matches migration 031 structure block"
  else
    fail "codegen branch SQL matches migration 031 structure block"
  fi
else
  fail "codegen validates knowledge-branch ontology"
  tail -n 60 "$TMP_DIR/codegen-branch.log" | sed 's/^/        /'
fi

if node packages/codegen/src/cli.js "$K12_YAML" --tracks sql --out-dir "$TMP_DIR/codegen-k12" \
  >"$TMP_DIR/codegen-k12.log" 2>&1; then
  GEN_K12="$(find "$TMP_DIR/codegen-k12" -maxdepth 1 -type f -name '*.sql' | head -n 1)"
  if [ -n "$GEN_K12" ] && grep -Fq "branch_id UUID" "$GEN_K12" \
    && grep -Fq "FOREIGN KEY (branch_id) REFERENCES ontology.knowledge_branch(id)" "$GEN_K12" \
    && grep -Fq "idx_textbook_chapter_branch" "$GEN_K12" \
    && grep -Fq "idx_knowledge_area_branch" "$GEN_K12"; then
    pass "codegen K12 SQL carries both branch FK mappings"
  else
    fail "codegen K12 SQL carries both branch FK mappings"
  fi
else
  fail "codegen validates K12 ontology"
  tail -n 60 "$TMP_DIR/codegen-k12.log" | sed 's/^/        /'
fi

echo "== 3. typecheck, build, codegen tests, full API Jest =="
run_step "services/api TypeScript" "$TMP_DIR/tsc.log" \
  npx tsc --noEmit -p services/api/tsconfig.json
run_step "services/api build" "$TMP_DIR/build.log" \
  npm run build --workspace=services/api
run_step "codegen tests" "$TMP_DIR/codegen-tests.log" \
  npm run test:codegen

JEST_LOG="$TMP_DIR/api-jest.log"
if (cd services/api && npx jest --runInBand --colors=false) >"$JEST_LOG" 2>&1; then
  JEST_SUITES="$(sed -n 's/^Test Suites:[[:space:]]*\([0-9][0-9]*\) passed,.*/\1/p' "$JEST_LOG" | tail -n 1)"
  JEST_TESTS="$(sed -n 's/^Tests:[[:space:]]*\([0-9][0-9]*\) passed,.*/\1/p' "$JEST_LOG" | tail -n 1)"
  if [ -n "$JEST_SUITES" ] && [ -n "$JEST_TESTS" ] \
    && [ "$JEST_SUITES" -ge 46 ] && [ "$JEST_TESTS" -ge 624 ]; then
    pass "services/api full Jest ($JEST_SUITES suites / $JEST_TESTS tests)"
  else
    fail "services/api full Jest baseline lowered (suites=${JEST_SUITES:-<empty>} tests=${JEST_TESTS:-<empty>})"
    tail -n 60 "$JEST_LOG" | sed 's/^/        /'
  fi
else
  fail "services/api full Jest regressed"
  tail -n 100 "$JEST_LOG" | sed 's/^/        /'
fi

echo "== 4. migration registration, idempotence, and data invariants =="
db_eq "migration 031 is registered" \
  "SELECT COUNT(*) FROM public._api_migrations WHERE name = '031_knowledge_branch.sql';" "1"

if docker exec -i "$DB_CONTAINER" psql -U postgres -d "$DB_NAME" -v ON_ERROR_STOP=1 -f - \
  <"$MIGRATION" >"$TMP_DIR/migration-rerun.log" 2>&1; then
  pass "migration 031 reruns idempotently"
else
  fail "migration 031 reruns idempotently"
  tail -n 80 "$TMP_DIR/migration-rerun.log" | sed 's/^/        /'
fi

PEAKS="$(psql_scalar "
  SELECT string_agg(s.code || '=' || counts.n, ',' ORDER BY s.code)
    FROM ontology.subject s
    JOIN LATERAL (
      SELECT COUNT(*)::text AS n
        FROM ontology.knowledge_branch b
       WHERE b.subject_id = s.id AND b.parent_id IS NULL
    ) counts ON TRUE
   WHERE s.code IN ('MATH','PHYS','CHEM','BIO','CHN','ENG');")"
if [ "$PEAKS" = "BIO=9,CHEM=8,CHN=9,ENG=7,MATH=10,PHYS=10" ]; then
  pass "top-level peak counts match the seed specification"
else
  fail "top-level peak counts match the seed specification (got ${PEAKS:-<empty>})"
fi

db_eq "branch tree has 53 peaks and 4 deep nodes" \
  "SELECT COUNT(*) || ':' || COUNT(*) FILTER (WHERE parent_id IS NULL) || ':' || COUNT(*) FILTER (WHERE parent_id IS NOT NULL) FROM ontology.knowledge_branch;" "57:53:4"
db_eq "all branch CLC fields are non-empty" \
  "SELECT COUNT(*) FROM ontology.knowledge_branch WHERE clc IS NULL OR btrim(clc) = '';" "0"
db_eq "textbook chapters have 100% branch placement" \
  "SELECT COUNT(*) FROM ontology.textbook_chapter WHERE branch_id IS NULL;" "0"
db_eq "knowledge areas have 100% branch placement" \
  "SELECT COUNT(*) FROM ontology.knowledge_area WHERE branch_id IS NULL;" "0"
db_eq "chapter seed covers the live chapter count" \
  "SELECT COUNT(*) FROM ontology.textbook_chapter;" "622"
db_eq "area seed covers the live area count" \
  "SELECT COUNT(*) FROM ontology.knowledge_area;" "331"
db_eq "K12 spans match recursively derived mapped-area spans" \
  "WITH RECURSIVE branch_tree AS (SELECT b.id AS root_id, b.id AS branch_id FROM ontology.knowledge_branch b UNION ALL SELECT bt.root_id, child.id FROM branch_tree bt JOIN ontology.knowledge_branch child ON child.parent_id = bt.branch_id), expected AS (SELECT bt.root_id, MIN(a.grade_level)::int AS grade_min, MAX(a.grade_level)::int AS grade_max FROM branch_tree bt JOIN ontology.knowledge_area a ON a.branch_id = bt.branch_id WHERE a.grade_level BETWEEN 1 AND 12 GROUP BY bt.root_id) SELECT COUNT(*) FROM ontology.knowledge_branch b LEFT JOIN expected e ON e.root_id = b.id WHERE b.k12_grade_min IS DISTINCT FROM e.grade_min OR b.k12_grade_max IS DISTINCT FROM e.grade_max;" "0"
db_eq "math.analysis K12 span is derived as 10-12" \
  "SELECT k12_grade_min || '-' || k12_grade_max FROM ontology.knowledge_branch WHERE code = 'math.analysis';" "10-12"
db_eq "pure deep-integral branches keep NULL K12 spans" \
  "SELECT COUNT(*) FROM ontology.knowledge_branch WHERE code IN ('math.ds','math.classic','phys.exp','bio.micro','chem.inorg') AND k12_grade_min IS NULL AND k12_grade_max IS NULL;" "5"

psql_scalar "SELECT json_agg(json_build_object('code', code, 'clc', clc) ORDER BY code) FROM ontology.knowledge_branch;" \
  >"$TMP_DIR/branch-clc.json"
if node - "$TMP_DIR/branch-clc.json" "docs/SUBJECT_SUMMIT_AUTHORITY.md" <<'NODE'
const fs = require('fs');
const rows = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const authority = fs.readFileSync(process.argv[3], 'utf8');
const tokens = new Set(
  (authority.match(/\[Q89\]|\b(?:O|Q|H|I|K)(?:[0-9]+(?:\.[0-9]+)?(?:\/[0-9]+)?(?:-[0-9]+)?|-[0-9]+)?\b/g) || [])
    .map((value) => value.trim()),
);
const bad = [];
for (const row of rows) {
  for (const token of String(row.clc || '').split(/\s*;\s*/).filter(Boolean)) {
    if (!tokens.has(token)) bad.push(`${row.code}:${token}`);
  }
}
if (bad.length) {
  console.error(`CLC anchors not traceable to authority doc: ${bad.join(', ')}`);
  process.exit(1);
}
NODE
then
  pass "every branch CLC anchor is traceable to the authority doc"
else
  fail "every branch CLC anchor is traceable to the authority doc"
fi

echo "== 5. PEP audit =="
db_eq "PEP audit total knowledge points match" \
  "SELECT COUNT(*) FROM edu.knowledge_points;" "2908"
db_eq "PEP audit comparable rows match" \
  "SELECT COUNT(*) FROM edu.knowledge_points WHERE code IS NOT NULL AND chapter_id IS NOT NULL;" "2873"
db_eq "PEP audit blank-code/chapter deviations match" \
  "SELECT COUNT(*) FROM edu.knowledge_points WHERE code IS NULL OR chapter_id IS NULL;" "35"
db_eq "PEP code/grade/chapter consistency mismatches are zero" \
  "SELECT COUNT(*) FROM edu.knowledge_points kp LEFT JOIN ontology.textbook_chapter c ON c.id = kp.chapter_id LEFT JOIN ontology.textbook t ON t.id = c.textbook_id LEFT JOIN ontology.grade g ON g.id = t.grade_id WHERE kp.code IS NOT NULL AND kp.chapter_id IS NOT NULL AND (split_part(kp.code, '.', 3) <> 'pep' OR substring(kp.code from 'g([0-9]+)')::int IS DISTINCT FROM kp.grade_level OR g.code IS DISTINCT FROM 'G' || substring(kp.code from 'g([0-9]+)') OR regexp_replace(kp.code, '\\.kp[0-9]+$', '') IS DISTINCT FROM c.code);" "0"
assert_contains "PEP audit reports the comparable consistency rate" "$PEP_AUDIT" "2873 / 2873"
assert_contains "PEP audit reports 100 percent" "$PEP_AUDIT" "100.00%"
assert_contains "PEP audit contains the deviation section" "$PEP_AUDIT" "偏差清单"
assert_contains "PEP audit reports the blank-code count" "$PEP_AUDIT" "35"

echo "== 6. isolated API: anonymous structure and authenticated mastery =="
API_PORT="$(pick_api_port || true)"
if [ -z "$API_PORT" ]; then
  fail "found a free isolated API port"
else
  pass "isolated API port selected ($API_PORT)"
  env \
    PORT="$API_PORT" \
    DB_HOST=127.0.0.1 \
    DB_PORT=5432 \
    DB_NAME="$DB_NAME" \
    DB_USER=postgres \
    DB_PASSWORD=postgres \
    AUTH_JWKS_URL="$AUTH_CENTER_BASE/auth/jwks" \
    AUTH_CENTER_URL="$AUTH_CENTER_BASE" \
    node services/api/dist/main.js >"$API_LOG" 2>&1 &
  API_PID=$!

  API_READY=0
  for _ in $(seq 1 50); do
    if curl -sS --connect-timeout 1 --max-time 2 \
      "http://127.0.0.1:$API_PORT/health" -o /dev/null >/dev/null 2>&1; then
      API_READY=1
      break
    fi
    sleep 0.2
  done
  if [ "$API_READY" = "1" ]; then
    pass "isolated API is healthy"
  else
    fail "isolated API is healthy"
    tail -n 80 "$API_LOG" | sed 's/^/        /'
  fi
fi

API_BASE="http://127.0.0.1:${API_PORT:-3019}"
if [ "$API_READY" = "1" ]; then
  ANON_BRANCH_CODE="$(curl -sS --max-time 15 -o "$TMP_DIR/anon-branches-math.json" -w '%{http_code}' \
    "$API_BASE/api/curriculum/summit-branches?subject=MATH" || true)"
  if [ "$ANON_BRANCH_CODE" = "200" ]; then
    pass "anonymous summit-branches MATH returns 200"
  else
    fail "anonymous summit-branches MATH returns 200 (got ${ANON_BRANCH_CODE:-000})"
  fi
  if node - "$TMP_DIR/anon-branches-math.json" <<'NODE'
const fs = require('fs');
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (data.subject.code !== 'MATH' || data.threshold !== 80 || data.peaks.length !== 10) {
  throw new Error(`bad branch root shape: subject=${data.subject?.code} threshold=${data.threshold} peaks=${data.peaks?.length}`);
}
const flat = [];
const walk = (node) => {
  flat.push(node);
  if (Object.prototype.hasOwnProperty.call(node, 'mastery')) {
    throw new Error(`anonymous node leaked mastery: ${node.code}`);
  }
  if (!Number.isInteger(node.kpCount) || node.reached !== false) {
    throw new Error(`anonymous node shape invalid: ${node.code}`);
  }
  if (node.k12GradeMin != null && node.k12GradeMax != null && node.k12GradeMin > node.k12GradeMax) {
    throw new Error(`invalid K12 span: ${node.code}`);
  }
  for (const child of node.children || []) walk(child);
};
for (const peak of data.peaks) walk(peak);
const analysis = flat.find((node) => node.code === 'math.analysis');
if (!analysis || analysis.k12GradeMin !== 10 || analysis.k12GradeMax !== 12) {
  throw new Error('math.analysis span is not 10-12');
}
const deep = flat.find((node) => node.code === 'math.ds');
if (!deep || deep.k12GradeMin != null || deep.k12GradeMax != null) {
  throw new Error('math.ds must remain a NULL-span deep node');
}
NODE
  then
    pass "anonymous MATH branch tree has 10 peaks, spans, and no mastery leak"
  else
    fail "anonymous MATH branch tree has 10 peaks, spans, and no mastery leak"
  fi

  ANON_PHYS_CODE="$(curl -sS --max-time 15 -o "$TMP_DIR/anon-branches-phys.json" -w '%{http_code}' \
    "$API_BASE/api/curriculum/summit-branches?subject=PHYS" || true)"
  if [ "$ANON_PHYS_CODE" = "200" ] \
    && node -e "const d=require(process.argv[1]); process.exit(d.peaks?.length===10 && d.threshold===80 ? 0 : 1)" \
      "$TMP_DIR/anon-branches-phys.json"; then
    pass "anonymous summit-branches PHYS returns 10 peaks"
  else
    fail "anonymous summit-branches PHYS returns 10 peaks (HTTP ${ANON_PHYS_CODE:-000})"
  fi

  ANON_GRADES_CODE="$(curl -sS --max-time 15 -o "$TMP_DIR/anon-grades-math.json" -w '%{http_code}' \
    "$API_BASE/api/curriculum/summit-grades?subject=MATH" || true)"
  if [ "$ANON_GRADES_CODE" = "200" ]; then
    pass "anonymous summit-grades MATH returns 200"
  else
    fail "anonymous summit-grades MATH returns 200 (got ${ANON_GRADES_CODE:-000})"
  fi
  if node - "$TMP_DIR/anon-grades-math.json" <<'NODE'
const fs = require('fs');
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const stages = data.stages || [];
if (data.subject.code !== 'MATH' || data.threshold !== 80) throw new Error('bad grade root shape');
const stageCodes = stages.map((stage) => stage.code);
if (JSON.stringify(stageCodes) !== JSON.stringify(['PRIMARY', 'JUNIOR', 'SENIOR'])) {
  throw new Error(`bad stages: ${stageCodes.join(',')}`);
}
const grades = stages.flatMap((stage) => stage.grades || []);
const gradeCodes = grades.map((grade) => grade.code);
for (let grade = 1; grade <= 12; grade += 1) {
  if (!gradeCodes.includes(`G${grade}`)) throw new Error(`missing G${grade}`);
}
if (grades.some((grade) => !grade.textbooks?.length)) throw new Error('grade without textbook');
const chapters = grades.flatMap((grade) => grade.textbooks.flatMap((book) => book.chapters || []));
if (!chapters.length) throw new Error('no chapters returned');
const walkChapters = (nodes, seen = []) => {
  for (const node of nodes) {
    seen.push(node);
    if (!node.branch || !node.branch.code) throw new Error(`chapter without branch: ${node.code}`);
    if (Object.prototype.hasOwnProperty.call(node, 'mastery')) throw new Error(`anonymous chapter leaked mastery: ${node.code}`);
    if (node.reached !== false) throw new Error(`anonymous chapter reached: ${node.code}`);
    walkChapters(node.children || [], seen);
  }
  return seen;
};
walkChapters(chapters);
if (grades.some((grade) => Object.prototype.hasOwnProperty.call(grade, 'mastery'))) {
  throw new Error('anonymous grade leaked mastery');
}
NODE
  then
    pass "anonymous grades expose PRIMARY/JUNIOR/SENIOR, G1-G12, PEP books/chapters, and branch refs"
  else
    fail "anonymous grades expose PRIMARY/JUNIOR/SENIOR, G1-G12, PEP books/chapters, and branch refs"
  fi

  RUN_ID="$$_$(date +%s)_$RANDOM"
  TEMP_USERNAME="w4a_verify_${RUN_ID}"
  TEMP_EMAIL="${TEMP_USERNAME}@example.com"
  TEMP_PASSWORD="W4aVerify-${RUN_ID}-Aa"
  REGISTER_BODY="$(jq -nc --arg username "$TEMP_USERNAME" --arg email "$TEMP_EMAIL" \
    --arg password "$TEMP_PASSWORD" '{username:$username,email:$email,password:$password,name:"W4-a Verify"}')"
  REGISTER_CODE="$(curl -sS --max-time 15 -X POST "$API_BASE/api/auth/register" \
    -H 'Content-Type: application/json' -d "$REGISTER_BODY" \
    -o "$TMP_DIR/register.json" -w '%{http_code}' || true)"
  TEMP_USER_ID="$(jq -r '.id // empty' "$TMP_DIR/register.json" 2>/dev/null || true)"
  if [ "$REGISTER_CODE" = "201" ] && [ -n "$TEMP_USER_ID" ]; then
    pass "temporary verification identity registered"
  else
    fail "temporary verification identity registered (HTTP ${REGISTER_CODE:-000})"
  fi

  if [ -n "$TEMP_USER_ID" ]; then
    TEMP_KP_ID="$(psql_scalar "SELECT kp.id FROM edu.knowledge_points kp JOIN ontology.textbook_chapter c ON c.id = kp.chapter_id JOIN ontology.knowledge_branch b ON b.id = c.branch_id WHERE b.code = 'math.num' AND (kp.status = 'published' OR kp.status IS NULL) ORDER BY kp.code LIMIT 1;")"
    if [ -n "$TEMP_KP_ID" ]; then
      if docker exec -i "$DB_CONTAINER" psql -U postgres -d "$DB_NAME" -v ON_ERROR_STOP=1 \
        -v uid="$TEMP_USER_ID" -v kp="$TEMP_KP_ID" -f - >/dev/null 2>&1 <<'SQL'
INSERT INTO edu.mastery_snapshots (user_id, knowledge_point_id, mastery_score, confidence_level)
VALUES (:'uid'::uuid, :'kp'::uuid, 100, 1.0)
ON CONFLICT (user_id, knowledge_point_id) DO UPDATE
SET mastery_score = EXCLUDED.mastery_score,
    confidence_level = EXCLUDED.confidence_level,
    calculated_at = NOW();
SQL
      then
        pass "temporary mastery snapshot prepared"
      else
        fail "temporary mastery snapshot prepared"
      fi
    else
      fail "temporary mastery snapshot prepared (no math.num knowledge point)"
    fi
  fi

  LOGIN_BODY="$(jq -nc --arg identifier "$TEMP_EMAIL" --arg password "$TEMP_PASSWORD" \
    '{identifier:$identifier,password:$password}')"
  LOGIN_CODE="$(curl -sS --max-time 15 -X POST "$API_BASE/api/auth/login" \
    -H 'Content-Type: application/json' -d "$LOGIN_BODY" \
    -o "$TMP_DIR/login.json" -w '%{http_code}' || true)"
  TEMP_TOKEN="$(jq -r '.accessToken // .token // empty' "$TMP_DIR/login.json" 2>/dev/null || true)"
  if [[ "$LOGIN_CODE" =~ ^2[0-9][0-9]$ ]] && [ -n "$TEMP_TOKEN" ]; then
    pass "temporary verification identity logged in"
  else
    fail "temporary verification identity logged in (HTTP ${LOGIN_CODE:-000})"
  fi

  if [ -n "$TEMP_TOKEN" ]; then
    AUTH_BRANCH_CODE="$(curl -sS --max-time 15 \
      "$API_BASE/api/curriculum/summit-branches?subject=MATH" \
      -H "Authorization: Bearer $TEMP_TOKEN" \
      -o "$TMP_DIR/auth-branches-math.json" -w '%{http_code}' || true)"
    if [ "$AUTH_BRANCH_CODE" = "200" ]; then
      pass "authenticated summit-branches MATH returns 200"
    else
      fail "authenticated summit-branches MATH returns 200 (got ${AUTH_BRANCH_CODE:-000})"
    fi
    if node - "$TMP_DIR/auth-branches-math.json" <<'NODE'
const fs = require('fs');
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (data.peaks.length !== 10 || data.threshold !== 80) throw new Error('bad authenticated branch root');
const flat = [];
const walk = (node) => {
  flat.push(node);
  if (node.mastery != null && node.reached !== (node.mastery >= 80)) {
    throw new Error(`reached mismatch: ${node.code}`);
  }
  if (node.mastery == null && node.reached !== false) {
    throw new Error(`reached without mastery: ${node.code}`);
  }
  for (const child of node.children || []) walk(child);
};
for (const peak of data.peaks) walk(peak);
const num = flat.find((node) => node.code === 'math.num');
if (!num || num.mastery !== 100 || num.reached !== true) {
  throw new Error(`math.num did not receive mastery: ${JSON.stringify(num)}`);
}
NODE
    then
      pass "authenticated branch tree overlays mastery and keeps reached >= 80"
    else
      fail "authenticated branch tree overlays mastery and keeps reached >= 80"
    fi

    AUTH_GRADES_CODE="$(curl -sS --max-time 15 \
      "$API_BASE/api/curriculum/summit-grades?subject=MATH" \
      -H "Authorization: Bearer $TEMP_TOKEN" \
      -o "$TMP_DIR/auth-grades-math.json" -w '%{http_code}' || true)"
    if [ "$AUTH_GRADES_CODE" = "200" ]; then
      pass "authenticated summit-grades MATH returns 200"
    else
      fail "authenticated summit-grades MATH returns 200 (got ${AUTH_GRADES_CODE:-000})"
    fi
    if node - "$TMP_DIR/auth-grades-math.json" <<'NODE'
const fs = require('fs');
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (data.threshold !== 80) throw new Error('bad authenticated grade threshold');
let masteryNodes = 0;
let reachedNodes = 0;
const walk = (node) => {
  if (node.mastery != null) {
    masteryNodes += 1;
    if (node.reached !== (node.mastery >= 80)) throw new Error(`reached mismatch in grade tree`);
  } else if (node.reached !== false) {
    throw new Error('grade tree reached without mastery');
  }
  if (node.reached) reachedNodes += 1;
  for (const grade of node.grades || []) walk(grade);
  for (const book of node.textbooks || []) walk(book);
  for (const chapter of node.chapters || []) walk(chapter);
  for (const child of node.children || []) walk(child);
};
for (const stage of data.stages || []) walk(stage);
if (masteryNodes === 0 || reachedNodes === 0) throw new Error('no mastery overlay in grade tree');
NODE
    then
      pass "authenticated grade tree overlays mastery with consistent reached state"
    else
      fail "authenticated grade tree overlays mastery with consistent reached state"
    fi
  fi
else
  skip "HTTP checks skipped because isolated API was not healthy"
fi

echo "== W4-a verification summary =="
echo "PASS=$PASS FAIL=$FAIL SKIP=$SKIP"
echo "FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
