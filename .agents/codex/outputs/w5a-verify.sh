#!/usr/bin/env bash
# W5-a verification: derived learning chain, bounded read APIs, privacy, regression.
set -uo pipefail

ROOT="${GRI_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)}"
cd "$ROOT"

PASS=0
FAIL=0
SKIP=0
TMP_DIR="$(mktemp -d)"
API_PID=""
API_PORT=""
API_LOG="$TMP_DIR/api.log"
DB_CONTAINER="${GRI_DB_CONTAINER:-gri-postgres}"
DB_NAME="${GRI_DB_NAME:-gri}"
DB_USER="${GRI_DB_USER:-postgres}"
DB_PASSWORD="${GRI_DB_PASSWORD:-postgres}"
DB_HOST="${GRI_DB_HOST:-127.0.0.1}"
DB_PORT="${GRI_DB_PORT:-5432}"
HEAD_BEFORE="$(git rev-parse HEAD 2>/dev/null || true)"

CONTROLLER="services/api/src/modules/curriculum/curriculum.controller.ts"
SERVICE="services/api/src/modules/curriculum/curriculum.service.ts"
TYPES="services/api/src/modules/curriculum/curriculum.types.ts"
CHAIN="services/api/src/modules/curriculum/learning-chain.ts"
CHAIN_SPEC="services/api/src/modules/curriculum/learning-chain.spec.ts"
PUBLIC_ROUTES="services/api/src/auth/public-routes.ts"
FILE_LIST=".agents/codex/outputs/w5a-file-list.md"
AUDIT=".agents/codex/outputs/w5a-chain-audit.md"

pass() { PASS=$((PASS + 1)); echo "  PASS  $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  FAIL  $1"; }
skip() { SKIP=$((SKIP + 1)); echo "  SKIP  $1"; }

run_step() {
  local description="$1"
  local log="$2"
  shift 2
  if "$@" >"$log" 2>&1; then
    pass "$description"
    return 0
  fi
  fail "$description"
  tail -n 80 "$log" | sed 's/^/        /' || true
  return 1
}

assert_file() {
  local description="$1"
  local file="$2"
  if [ -f "$file" ]; then pass "$description"; else fail "$description (missing $file)"; fi
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

psql_row() {
  docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -AtF '|' -c "$1" 2>/dev/null
}

psql_scalar() {
  psql_row "$1" | head -n 1
}

db_eq() {
  local description="$1"
  local sql="$2"
  local expected="$3"
  local actual
  actual="$(psql_scalar "$sql" | tr -d '[:space:]')"
  if [ "$actual" = "$expected" ]; then
    pass "$description"
  else
    fail "$description (expected $expected, got ${actual:-<empty>})"
  fi
}

pick_api_port() {
  local candidate
  for candidate in 3102 3103 3104 3105 3106 3107 3108 3109; do
    if ! curl -fsS --connect-timeout 1 --max-time 2 \
      "http://127.0.0.1:$candidate/health" >/dev/null 2>&1; then
      printf '%s' "$candidate"
      return 0
    fi
  done
  return 1
}

wait_for_api() {
  local i
  for i in $(seq 1 40); do
    if curl -fsS --connect-timeout 1 --max-time 2 \
      "http://127.0.0.1:$API_PORT/health" >/dev/null 2>&1; then
      return 0
    fi
    if [ -n "$API_PID" ] && ! kill -0 "$API_PID" >/dev/null 2>&1; then
      return 1
    fi
    sleep 1
  done
  return 1
}

http_code() {
  curl -sS --connect-timeout 2 --max-time 30 -o /dev/null -w '%{http_code}' "$1"
}

cleanup() {
  if [ -n "$API_PID" ]; then
    kill "$API_PID" >/dev/null 2>&1 || true
    wait "$API_PID" >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

echo "== W5-a verification =="
echo "== 1. source and contract =="

assert_file "W5-a file list exists" "$FILE_LIST"
assert_file "W5-a chain audit exists" "$AUDIT"
assert_file "learning-chain pure function exists" "$CHAIN"
assert_file "learning-chain spec exists" "$CHAIN_SPEC"
assert_contains "controller exposes learning-chain GET" "$CONTROLLER" "@Get('learning-chain')"
assert_contains "controller exposes kp-cave GET" "$CONTROLLER" "@Get('kp-cave')"
assert_contains "controller uses externalId identity" "$CONTROLLER" "this.auth(req)?.externalId"
assert_not_contains "controller does not consult req.auth.roles" "$CONTROLLER" "req.auth.roles"
assert_contains "service uses canonical prerequisite table" "$SERVICE" "ontology.kp_prerequisite"
assert_contains "service uses mastery snapshots as source" "$SERVICE" "edu.mastery_snapshots"
assert_contains "service enforces branch-or-grade bound" "$SERVICE" "branch 或 grade 至少提供一个限定条件"
assert_contains "service uses >=80 threshold" "$CHAIN" "mastery >= 80"
assert_contains "soft edges build only cross-grade neighbors" "$CHAIN" "跨年级引导性衔接"
assert_contains "soft edge reason says non-exact" "$CHAIN" "非精确前置"
assert_contains "public route admits learning-chain" "$PUBLIC_ROUTES" "learning-chain"
assert_contains "public route admits kp-cave" "$PUBLIC_ROUTES" "kp-cave"
assert_contains "types define learning-chain result" "$TYPES" "interface LearningChainResult"
assert_contains "types define kp-cave result" "$TYPES" "interface KpCaveResult"

if find services/api/src/migrate -maxdepth 1 -type f -name '032*.sql' | grep -q .; then
  fail "migration 032 must be N/A for pure service derivation"
else
  pass "migration 032 is N/A (pure service derivation)"
fi
assert_not_contains "no materialized learning_edge DDL" "$SERVICE" "CREATE TABLE IF NOT EXISTS ontology.learning_edge"

run_step "git diff whitespace check" "$TMP_DIR/diff-check.log" git diff --check

echo "== 2. data truth and derivation invariants =="
db_eq "knowledge point total is 2908" "SELECT count(*) FROM edu.knowledge_points;" "2908"
db_eq "canonical prerequisite total is 3377" "SELECT count(*) FROM ontology.kp_prerequisite;" "3377"
db_eq "JSONB prerequisite rows total is 22" \
  "SELECT count(*) FROM edu.knowledge_points WHERE prerequisites IS NOT NULL AND prerequisites <> '[]'::jsonb;" "22"
db_eq "JSONB exact string references resolve to 17 targets" \
  "WITH refs AS (
     SELECT kp.id AS learner_id, ref.value #>> '{}' AS ref
       FROM edu.knowledge_points kp
       CROSS JOIN LATERAL jsonb_array_elements(COALESCE(kp.prerequisites, '[]'::jsonb)) AS ref(value)
      WHERE jsonb_typeof(ref.value) = 'string'
   )
   SELECT count(*)
     FROM refs r
     JOIN LATERAL (
       SELECT count(*) AS match_count
         FROM edu.knowledge_points target
        WHERE target.legacy_id = r.ref OR target.code = r.ref
     ) match ON match.match_count = 1;" "17"
db_eq "mastery source is edu.mastery_snapshots" \
  "SELECT count(*) >= 1 FROM edu.mastery_snapshots;" "t"
db_eq "no persisted learning edge table" \
  "SELECT to_regclass('ontology.learning_edge') IS NULL;" "t"

CHAIN_KIND_COUNT="$(psql_scalar "SELECT count(*) FROM edu.knowledge_points WHERE code IS NOT NULL AND chapter_id IS NOT NULL;")"
if [ "${CHAIN_KIND_COUNT:-0}" -ge 2000 ]; then
  pass "curriculum chain has enough code+chapter knowledge points ($CHAIN_KIND_COUNT)"
else
  fail "curriculum chain has enough code+chapter knowledge points (${CHAIN_KIND_COUNT:-<empty>})"
fi

echo "== 3. typecheck, focused tests, build, full Jest =="
run_step "services/api TypeScript" "$TMP_DIR/tsc.log" \
  npx tsc --noEmit -p services/api/tsconfig.json
run_step "focused W5-a Jest" "$TMP_DIR/focused-jest.log" \
  npm --prefix services/api test -- learning-chain.spec.ts curriculum.service.spec.ts public-routes.spec.ts --runInBand
run_step "services/api build" "$TMP_DIR/build.log" npm --prefix services/api run build

FULL_JEST_LOG="$TMP_DIR/full-jest.log"
if run_step "full services/api Jest" "$FULL_JEST_LOG" npm --prefix services/api test -- --runInBand; then
  JEST_SUITES="$(grep -Eo 'Test Suites:.*' "$FULL_JEST_LOG" | tail -n 1 | grep -Eo '[0-9]+' | head -n 1)"
  JEST_TESTS="$(grep -Eo 'Tests:.*' "$FULL_JEST_LOG" | tail -n 1 | grep -Eo '[0-9]+' | head -n 1)"
  if [ "${JEST_SUITES:-0}" -ge 47 ] && [ "${JEST_TESTS:-0}" -ge 624 ]; then
    pass "full Jest baseline retained (${JEST_SUITES} suites / ${JEST_TESTS} tests)"
  else
    fail "full Jest baseline lowered (${JEST_SUITES:-<empty>} suites / ${JEST_TESTS:-<empty>} tests)"
  fi
fi

echo "== 4. bounded HTTP surface =="
API_PORT="$(pick_api_port || true)"
if [ -z "$API_PORT" ]; then
  fail "no temporary API port available"
else
  env PORT="$API_PORT" DB_HOST="$DB_HOST" DB_PORT="$DB_PORT" DB_NAME="$DB_NAME" \
    DB_USER="$DB_USER" DB_PASSWORD="$DB_PASSWORD" node services/api/dist/main.js \
    >"$API_LOG" 2>&1 &
  API_PID=$!
  if wait_for_api; then
    pass "temporary API health on :$API_PORT"
    CHAIN_URL="http://127.0.0.1:$API_PORT/api/curriculum/learning-chain?subject=MATH&branch=math.num"
    CAVE_URL="http://127.0.0.1:$API_PORT/api/curriculum/kp-cave?kpId=5888414b-26d6-49bb-986f-d6955aececa5"
    JSONB_CAVE_ID="$(psql_scalar "WITH refs AS (
       SELECT kp.id AS learner_id, ref.value #>> '{}' AS ref
         FROM edu.knowledge_points kp
         CROSS JOIN LATERAL jsonb_array_elements(COALESCE(kp.prerequisites, '[]'::jsonb)) AS ref(value)
        WHERE jsonb_typeof(ref.value) = 'string'
     )
     SELECT r.learner_id
       FROM refs r
       JOIN LATERAL (
         SELECT count(*) AS match_count
           FROM edu.knowledge_points target
          WHERE target.legacy_id = r.ref OR target.code = r.ref
       ) match ON match.match_count = 1
      ORDER BY r.learner_id
      LIMIT 1;")"
    JSONB_CAVE_URL="http://127.0.0.1:$API_PORT/api/curriculum/kp-cave?kpId=$JSONB_CAVE_ID"
    UNBOUNDED_URL="http://127.0.0.1:$API_PORT/api/curriculum/learning-chain?subject=MATH"
    GRADE_URL="http://127.0.0.1:$API_PORT/api/curriculum/learning-chain?subject=MATH&grade=G1"

    if curl -fsS --connect-timeout 2 --max-time 30 "$CHAIN_URL" >"$TMP_DIR/chain.json"; then
      pass "anonymous bounded learning-chain returns 200"
    else
      fail "anonymous bounded learning-chain returns 200"
    fi

    if [ "$(http_code "$UNBOUNDED_URL")" = "400" ]; then
      pass "unbounded learning-chain is rejected with 400"
    else
      fail "unbounded learning-chain is rejected with 400"
    fi

    if curl -fsS --connect-timeout 2 --max-time 30 "$GRADE_URL" >"$TMP_DIR/grade-chain.json"; then
      pass "grade-bounded learning-chain returns 200"
    else
      fail "grade-bounded learning-chain returns 200"
    fi

    if curl -fsS --connect-timeout 2 --max-time 30 "$CAVE_URL" >"$TMP_DIR/cave-anon.json"; then
      pass "anonymous kp-cave returns 200"
    else
      fail "anonymous kp-cave returns 200"
    fi

    if [ -n "$JSONB_CAVE_ID" ] &&
      curl -fsS --connect-timeout 2 --max-time 30 "$JSONB_CAVE_URL" >"$TMP_DIR/cave-jsonb.json" &&
      node - "$TMP_DIR/cave-jsonb.json" <<'NODE'
const fs = require('fs');
const cave = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (!Array.isArray(cave.prerequisites) || cave.prerequisites.length < 1) {
  console.error('JSONB cave has no exact prerequisite');
  process.exit(1);
}
if (cave.prerequisites.some((edge) => edge.kind !== 'explicit' || !edge.reason)) {
  console.error('JSONB cave prerequisite is not explicit/reasoned');
  process.exit(1);
}
NODE
    then
      pass "legacy JSONB prerequisite is consumed by kp-cave"
    else
      fail "legacy JSONB prerequisite is consumed by kp-cave"
    fi

    if node - "$TMP_DIR/chain.json" "$TMP_DIR/grade-chain.json" "$TMP_DIR/cave-anon.json" <<'NODE'
const fs = require('fs');

const [chainPath, gradePath, cavePath] = process.argv.slice(2);
const chain = JSON.parse(fs.readFileSync(chainPath, 'utf8'));
const grade = JSON.parse(fs.readFileSync(gradePath, 'utf8'));
const cave = JSON.parse(fs.readFileSync(cavePath, 'utf8'));

const allKps = (result) => result.nodes.flatMap((node) => node.kps);
const edgeKey = (edge) => `${edge.from}\u0000${edge.to}`;
const edgeByKey = new Map(chain.edges.map((edge) => [edgeKey(edge), edge]));
const failures = [];

if (chain.subject !== 'MATH' || chain.branch !== 'math.num') failures.push('chain subject/branch mismatch');
if (!Array.isArray(chain.nodes) || chain.nodes.length < 100) failures.push('chain node count unexpectedly low');
if (!Array.isArray(chain.edges) || chain.edges.length < 100) failures.push('chain edge count unexpectedly low');
if (chain.branch !== 'math.num') failures.push('chain is not bounded to math.num');
if (grade.branch !== null) failures.push('grade-bound response must not report a branch');
if (!Array.isArray(grade.nodes) || grade.nodes.length < 1) failures.push('grade-bound response has no nodes');
if (grade.nodes.some((node) => node.grade !== 'G1')) failures.push('grade-bound response escaped G1');

const recursiveHasKey = (value, key) => {
  if (value == null || typeof value !== 'object') return false;
  if (Object.prototype.hasOwnProperty.call(value, key)) return true;
  return Object.values(value).some((child) => recursiveHasKey(child, key));
};

if (recursiveHasKey(chain, 'mastery')) failures.push('anonymous chain leaked mastery');
if (recursiveHasKey(grade, 'mastery')) failures.push('anonymous grade chain leaked mastery');
if (recursiveHasKey(cave, 'mastery')) failures.push('anonymous cave leaked mastery');

const nodeCodes = new Set();
const kpCodes = new Set();
let adjacentBreak = 0;
let softBad = 0;
for (let i = 0; i < chain.nodes.length; i++) {
  const node = chain.nodes[i];
  if (!node.code || nodeCodes.has(node.code)) failures.push(`duplicate/invalid node ${node.code}`);
  nodeCodes.add(node.code);
  if (!Array.isArray(node.kps) || node.kps.length === 0) failures.push(`node ${node.code} has no kps`);
  for (let j = 0; j < node.kps.length; j++) {
    const kp = node.kps[j];
    if (!kp.code || kpCodes.has(kp.code)) failures.push(`duplicate/invalid kp ${kp.code}`);
    kpCodes.add(kp.code);
    if (!['dim', 'half', 'lit'].includes(kp.state)) failures.push(`invalid kp state ${kp.code}`);
    if (j > 0) {
      const prev = Number(node.kps[j - 1].code.match(/kp(\d+)$/i)?.[1] ?? NaN);
      const curr = Number(kp.code.match(/kp(\d+)$/i)?.[1] ?? NaN);
      if (Number.isFinite(prev) && Number.isFinite(curr) && curr <= prev) {
        failures.push(`kp order violation in ${node.code}`);
      }
    }
  }
  const gradeNumber = Number(node.grade?.match(/\d+/)?.[0] ?? NaN);
  if (!Number.isFinite(gradeNumber)) failures.push(`invalid grade ${node.grade} on ${node.code}`);
  if (i > 0) {
    const previous = chain.nodes[i - 1];
    const previousGrade = Number(previous.grade?.match(/\d+/)?.[0] ?? NaN);
    if (gradeNumber < previousGrade) failures.push(`grade order violation ${previous.grade} -> ${node.grade}`);
    const from = previous.kps.at(-1)?.code;
    const to = node.kps[0]?.code;
    if (!from || !to || !edgeByKey.has(`${from}\u0000${to}`)) {
      adjacentBreak += 1;
      failures.push(`adjacent node link missing ${previous.code} -> ${node.code}`);
    }
  }
}

for (const edge of chain.edges) {
  if (!edge.from || !edge.to || !edge.reason || !edge.reason.trim()) failures.push('edge has empty endpoint/reason');
  if (!['explicit', 'seq', 'soft'].includes(edge.kind)) failures.push(`unknown edge kind ${edge.kind}`);
  if (edge.kind === 'soft') {
    if (!edge.reason.includes('引导') || !edge.reason.includes('非精确前置')) softBad += 1;
    const fromNode = chain.nodes.find((node) => node.kps.some((kp) => kp.code === edge.from));
    const toNode = chain.nodes.find((node) => node.kps.some((kp) => kp.code === edge.to));
    const fromGrade = Number(fromNode?.grade?.match(/\d+/)?.[0] ?? NaN);
    const toGrade = Number(toNode?.grade?.match(/\d+/)?.[0] ?? NaN);
    if (!Number.isFinite(fromGrade) || !Number.isFinite(toGrade) || toGrade <= fromGrade) softBad += 1;
  }
}

const kinds = { explicit: 0, seq: 0, soft: 0 };
for (const edge of chain.edges) kinds[edge.kind]++;
if (kinds.explicit < 1 || kinds.seq < 1 || kinds.soft < 1) failures.push('edge kinds are incomplete');
if (kinds.soft / chain.edges.length > 0.02) failures.push('soft edge ratio exceeds 2%');

const caveKeys = new Set(Object.keys(cave));
if (!caveKeys.has('kp') || !caveKeys.has('state') || !caveKeys.has('questions') ||
    !caveKeys.has('prerequisites') || !caveKeys.has('next')) {
  failures.push('anonymous cave missing public fields');
}
if (caveKeys.has('wrongQuestions') || caveKeys.has('reviews') || caveKeys.has('achievements')) {
  failures.push('anonymous cave leaked personal aggregates');
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(JSON.stringify({
  nodes: chain.nodes.length,
  kps: allKps(chain).length,
  edges: chain.edges.length,
  kinds,
  softRatio: Number((kinds.soft / chain.edges.length * 100).toFixed(2)),
  adjacentBreak,
  softBad,
  grades: [...new Set(chain.nodes.map((node) => node.grade))],
}));
NODE
    then
      pass "anonymous chain/cave structural, continuity and privacy checks"
    else
      fail "anonymous chain/cave structural, continuity and privacy checks"
    fi

    echo "== 5. logged-in service call and legacy endpoint parity =="
    MASTERY_ROW="$(psql_row "SELECT ms.user_id, ms.knowledge_point_id, s.code, b.code FROM edu.mastery_snapshots ms JOIN edu.knowledge_points kp ON kp.id = ms.knowledge_point_id JOIN ontology.subject s ON lower(s.code) = lower(kp.subject) JOIN ontology.textbook_chapter c ON c.id = kp.chapter_id JOIN ontology.knowledge_branch b ON b.id = c.branch_id WHERE kp.status = 'published' ORDER BY ms.user_id, kp.code LIMIT 1;")"
    IFS='|' read -r LOGIN_USER_ID LOGIN_KP_ID LOGIN_SUBJECT LOGIN_BRANCH <<<"$MASTERY_ROW"
    if [ -n "${LOGIN_USER_ID:-}" ] && [ -n "${LOGIN_KP_ID:-}" ] && [ -n "${LOGIN_SUBJECT:-}" ] && [ -n "${LOGIN_BRANCH:-}" ]; then
      if LOGIN_USER_ID="$LOGIN_USER_ID" LOGIN_KP_ID="$LOGIN_KP_ID" LOGIN_SUBJECT="$LOGIN_SUBJECT" \
        LOGIN_BRANCH="$LOGIN_BRANCH" node - "$TMP_DIR/logged-in.json" <<'NODE'
const fs = require('fs');
const { DatabaseService } = require('./services/api/dist/database/database.service.js');
const { CurriculumService } = require('./services/api/dist/modules/curriculum/curriculum.service.js');

const outPath = process.argv[2];
const userId = process.env.LOGIN_USER_ID;
const kpId = process.env.LOGIN_KP_ID;
const subject = process.env.LOGIN_SUBJECT;
const branch = process.env.LOGIN_BRANCH;

const recursiveHasKey = (value, key) => {
  if (value == null || typeof value !== 'object') return false;
  if (Object.prototype.hasOwnProperty.call(value, key)) return true;
  return Object.values(value).some((child) => recursiveHasKey(child, key));
};

(async () => {
  const db = new DatabaseService();
  try {
    const service = new CurriculumService(db);
    const chain = await service.learningChain(subject, branch, undefined, userId);
    const cave = await service.kpCave(kpId, userId);
    const failures = [];
    if (!recursiveHasKey(chain, 'mastery')) failures.push('logged-in chain has no mastery');
    if (!recursiveHasKey(cave, 'mastery')) failures.push('logged-in cave has no mastery');
    if (!cave.wrongQuestions || !cave.reviews || !cave.achievements) {
      failures.push('logged-in cave is missing personal aggregates');
    }
    if (failures.length) {
      console.error(failures.join('\n'));
      process.exitCode = 1;
      return;
    }
    fs.writeFileSync(outPath, JSON.stringify({ chain, cave }));
  } finally {
    await db.onModuleDestroy();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
NODE
      then
        pass "logged-in direct service call exposes mastery and personal aggregates"
      else
        fail "logged-in direct service call exposes mastery and personal aggregates"
      fi
    else
      fail "no mastery snapshot available for logged-in verification"
    fi

    LEGACY_BASE="${GRI_W5A_LEGACY_API_BASE:-http://127.0.0.1:3008}"
    if curl -fsS --connect-timeout 2 --max-time 10 "$LEGACY_BASE/health" >/dev/null 2>&1; then
      parity_ok=1
      for endpoint in \
        "curriculum/summit-branches?subject=MATH" \
        "curriculum/summit-grades?subject=MATH"; do
        OLD_FILE="$TMP_DIR/old-$(printf '%s' "$endpoint" | tr '/?=&' '____').json"
        NEW_FILE="$TMP_DIR/new-$(printf '%s' "$endpoint" | tr '/?=&' '____').json"
        if curl -fsS --connect-timeout 2 --max-time 30 "$LEGACY_BASE/api/$endpoint" >"$OLD_FILE" &&
          curl -fsS --connect-timeout 2 --max-time 30 "http://127.0.0.1:$API_PORT/api/$endpoint" >"$NEW_FILE" &&
          cmp -s "$OLD_FILE" "$NEW_FILE"; then
          :
        else
          parity_ok=0
        fi
      done
      if [ "$parity_ok" -eq 1 ]; then
        pass "legacy summit endpoint responses remain byte-identical"
      else
        fail "legacy summit endpoint responses remain byte-identical"
      fi
    else
      skip "legacy API :3008 unavailable; endpoint parity not evaluated"
    fi
  else
    fail "temporary API did not become healthy on :$API_PORT"
    tail -n 80 "$API_LOG" | sed 's/^/        /' || true
  fi
fi

echo "== 6. repository and credential hygiene =="
if [ -n "$HEAD_BEFORE" ] && [ "$(git rev-parse HEAD 2>/dev/null || true)" = "$HEAD_BEFORE" ]; then
  pass "HEAD unchanged by verification"
else
  fail "HEAD changed during verification"
fi
if git diff --name-only | grep -Eq '(^|/)\.env($|\.)'; then
  fail "verification or implementation touched an env file"
else
  pass "no env file in git diff"
fi
if grep -RInE 'LLM_API_KEY=|AUTH_SERVICE_TOKEN=|BEGIN (RSA )?PRIVATE KEY' \
  .agents/codex/outputs/w5a-*.md 2>/dev/null | grep -q .; then
  fail "credential-like value found in W5-a output artifacts"
else
  pass "no credential-like value in W5-a output artifacts"
fi

echo "PASS=$PASS FAIL=$FAIL SKIP=$SKIP"
echo "FAIL=$FAIL"
