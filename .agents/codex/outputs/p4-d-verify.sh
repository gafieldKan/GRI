#!/usr/bin/env bash
# P4-D verification: tuition T6/T7 controller wiring, question_type normalization, DI + HTTP smoke.
set -uo pipefail

ROOT="${GRI_ROOT:-/home/ubantu/GRI}"
cd "$ROOT"

PASS=0
FAIL=0
SKIP=0
TMP_DIR="$(mktemp -d)"
CONTAINER=""

pass() { PASS=$((PASS + 1)); echo "  PASS  $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  FAIL  $1"; }
skip() { SKIP=$((SKIP + 1)); echo "  SKIP  $1"; }

cleanup() {
  if [ -n "$CONTAINER" ]; then
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
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

assert_count() {
  local description="$1"
  local file="$2"
  local pattern="$3"
  local expected="$4"
  local actual
  actual="$(grep -Fc -- "$pattern" "$file" 2>/dev/null || true)"
  if [ "$actual" = "$expected" ]; then
    pass "$description"
  else
    fail "$description (expected $expected, got $actual)"
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
  tail -n 60 "$log" | sed 's/^/        /'
  return 1
}

echo "== P4-D verification =="

echo "== 1. static contract =="
CONTROLLER="services/api/src/modules/tuition/tuition.controller.ts"
MODULE="services/api/src/modules/tuition/tuition.module.ts"
TUTOR="services/api/src/modules/tuition/agents/tutor-agent.ts"
INTENT="services/api/src/modules/tuition/agents/intent-classifier.ts"
VARIANT="services/api/src/modules/tuition/agents/variant-generator.ts"
CONTROLLER_SPEC="services/api/src/modules/tuition/tuition.controller.spec.ts"
TUTOR_SPEC="services/api/src/modules/tuition/agents/tutor-agent.spec.ts"
PUBLIC_ROUTES="services/api/src/auth/public-routes.ts"

assert_file "P4-D file list exists" ".agents/codex/outputs/p4-d-file-list.md"
assert_file "P4-D verify script exists" ".agents/codex/outputs/p4-d-verify.sh"
assert_file "controller exists" "$CONTROLLER"
assert_file "controller spec exists" "$CONTROLLER_SPEC"
assert_file "TutorAgent exists" "$TUTOR"
assert_file "TutorAgent spec exists" "$TUTOR_SPEC"
assert_file "existing tuition module exists" "$MODULE"

assert_contains "controller exposes classify-intent" "$CONTROLLER" "@Post('agent/classify-intent')"
assert_contains "controller exposes card advance" "$CONTROLLER" "@Post('agent/card/advance')"
assert_contains "controller exposes socratic render" "$CONTROLLER" "@Post('agent/socratic/render')"
assert_contains "controller exposes exam scan" "$CONTROLLER" "@Post('exam/scan')"
assert_contains "controller exposes exam variants" "$CONTROLLER" "@Post('exam/variants')"
assert_count "five new endpoints explicitly return 200" "$CONTROLLER" "@HttpCode(HttpStatus.OK)" "5"

for injection in \
  "IntentClassifier:intentClassifier" \
  "TeachingCardFsm:teachingCardFsm" \
  "SocraticTemplates:socraticTemplates" \
  "ExamScannerAgent:examScanner" \
  "VariantGenerator:variantGenerator"; do
  provider="${injection%%:*}"
  field="${injection#*:}"
  assert_contains "controller injects $provider" "$CONTROLLER" "private readonly $field"
done
assert_contains "existing module registers IntentClassifier" "$MODULE" "IntentClassifier"
assert_contains "existing module registers TeachingCardFsm" "$MODULE" "TeachingCardFsm"
assert_contains "existing module registers SocraticTemplates" "$MODULE" "SocraticTemplates"
assert_contains "existing module registers ExamScannerAgent" "$MODULE" "ExamScannerAgent"
assert_contains "existing module registers VariantGenerator" "$MODULE" "VariantGenerator"

assert_contains "IntentClassifier value-imports LlmService" "$INTENT" "import { LlmService } from './llm.service';"
assert_not_contains "IntentClassifier does not type-only import LlmService" "$INTENT" "import type { LlmService }"
assert_contains "VariantGenerator value-imports LlmService" "$VARIANT" "import { LlmService } from './llm.service';"
assert_not_contains "VariantGenerator does not type-only import LlmService" "$VARIANT" "import type { LlmService }"

assert_contains "TutorAgent defines normalization boundary" "$TUTOR" "normalizeTutorQuestionType"
assert_contains "normalization maps single_choice" "$TUTOR" "case 'single_choice':"
assert_contains "normalization maps multiple_choice" "$TUTOR" "case 'multiple_choice':"
assert_contains "normalization maps fill_blank" "$TUTOR" "case 'fill_blank':"
assert_contains "normalization maps solution" "$TUTOR" "case 'solution':"
assert_contains "TutorAgent consumes normalized answer checking" "$TUTOR" "const type = normalizeTutorQuestionType(question?.type);"
assert_contains "TutorAgent consumes normalized byType buckets" "$TUTOR" "if (type && analysis.byType[type])"
assert_contains "TutorAgent spec covers single_choice" "$TUTOR_SPEC" "['single_choice', 'choice'"
assert_contains "TutorAgent spec covers multiple_choice" "$TUTOR_SPEC" "['multiple_choice', 'choice'"
assert_contains "TutorAgent spec covers fill_blank" "$TUTOR_SPEC" "['fill_blank', 'fill'"
assert_contains "TutorAgent spec covers solution" "$TUTOR_SPEC" "['solution', 'solution'"

assert_contains "existing sessions endpoint remains" "$CONTROLLER" "@Post('sessions')"
assert_contains "existing practice answer endpoint remains" "$CONTROLLER" "@Post('practice/answer')"
assert_contains "existing exam upload endpoint remains" "$CONTROLLER" "@Post('exam/upload')"
assert_contains "existing exam analyze endpoint remains" "$CONTROLLER" "@Post('exam/analyze')"
assert_not_contains "new classify route is not public" "$PUBLIC_ROUTES" "agent/classify-intent"
assert_not_contains "new scan route is not public" "$PUBLIC_ROUTES" "exam/scan"
assert_not_contains "new variants route is not public" "$PUBLIC_ROUTES" "exam/variants"

if [ -z "$(git diff --name-only -- services/api/src/migrate; git ls-files --others --exclude-standard services/api/src/migrate)" ]; then
  pass "no migration changes"
else
  fail "migration files changed unexpectedly"
fi

run_step "git diff whitespace check" "$TMP_DIR/diff-check.log" git diff --check

echo "== 2. typecheck, focused tests, full regression, build =="
run_step "services/api TypeScript" "$TMP_DIR/tsc.log" \
  bash -lc "cd '$ROOT/services/api' && npx tsc --noEmit"
run_step "T6/T7 focused Jest" "$TMP_DIR/focused-jest.log" \
  bash -lc "cd '$ROOT/services/api' && npx jest src/modules/tuition/tuition.controller.spec.ts src/modules/tuition/agents/tutor-agent.spec.ts --runInBand --colors=false"

if (cd services/api && npx jest --runInBand --colors=false) >"$TMP_DIR/full-jest.log" 2>&1; then
  if grep -Eq 'Test Suites:[[:space:]]+42 passed, 42 total' "$TMP_DIR/full-jest.log" \
    && grep -Eq 'Tests:[[:space:]]+595 passed, 595 total' "$TMP_DIR/full-jest.log"; then
    pass "services/api full Jest (42 suites / 595 tests)"
  else
    fail "services/api full Jest count changed"
    tail -n 40 "$TMP_DIR/full-jest.log" | sed 's/^/        /'
  fi
else
  fail "services/api full Jest regressed"
  tail -n 80 "$TMP_DIR/full-jest.log" | sed 's/^/        /'
fi

run_step "services/api build" "$TMP_DIR/build.log" \
  bash -lc "cd '$ROOT/services/api' && npm run build"

echo "== 3. live startup, DI, and HTTP contract =="
if ! command -v docker >/dev/null 2>&1; then
  fail "docker is required for the live startup smoke"
elif ! docker info >/dev/null 2>&1; then
  fail "docker daemon is not reachable"
else
  NETWORK="${GRI_DOCKER_NETWORK:-gri_default}"
  AUTH_CONTAINER="${GRI_AUTH_CONTAINER:-gri-auth-center}"
  API_IMAGE="${GRI_API_IMAGE:-gri-api}"

  if ! docker inspect "$AUTH_CONTAINER" >/dev/null 2>&1; then
    fail "auth-center container $AUTH_CONTAINER is unavailable"
  else
    SERVICE_TOKEN="$(docker exec "$AUTH_CONTAINER" printenv SERVICE_TOKEN 2>/dev/null || true)"
    if [ -z "$SERVICE_TOKEN" ]; then
      fail "auth-center SERVICE_TOKEN is unavailable"
    else
      CONTAINER="gri-api-p4d-verify-$$"
      if AUTH_SERVICE_TOKEN="$SERVICE_TOKEN" docker run --rm -d \
        --name "$CONTAINER" \
        --network "$NETWORK" \
        -e PORT=3010 \
        -e NODE_ENV=production \
        -e DB_HOST=postgres \
        -e DB_PORT=5432 \
        -e DB_NAME=gri \
        -e DB_USER=postgres \
        -e DB_PASSWORD=postgres \
        -e LLM_API_KEY= \
        -e AUTH_JWKS_URL=http://auth-center:3004/auth/jwks \
        -e AUTH_CENTER_URL=http://auth-center:3004 \
        -e AUTH_SERVICE_TOKEN \
        -v "$ROOT/services/api/dist:/app/services/api/dist:ro" \
        "$API_IMAGE" node dist/main.js >"$TMP_DIR/container-id.log" 2>&1
      then
        READY=0
        for _ in $(seq 1 40); do
          if docker exec "$CONTAINER" node -e \
            'fetch("http://localhost:3010/health").then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))' \
            >/dev/null 2>&1; then
            READY=1
            break
          fi
          sleep 1
        done

        if [ "$READY" -eq 1 ]; then
          pass "temporary API started and DI-constructed successfully"
          docker logs "$CONTAINER" >"$TMP_DIR/container.log" 2>&1 || true
          assert_contains "Nest application startup completed" "$TMP_DIR/container.log" "Nest application successfully started"
          assert_contains "runtime mapped classify-intent" "$TMP_DIR/container.log" "/api/tuition/agent/classify-intent"
          assert_contains "runtime mapped card advance" "$TMP_DIR/container.log" "/api/tuition/agent/card/advance"
          assert_contains "runtime mapped socratic render" "$TMP_DIR/container.log" "/api/tuition/agent/socratic/render"
          assert_contains "runtime mapped exam scan" "$TMP_DIR/container.log" "/api/tuition/exam/scan"
          assert_contains "runtime mapped exam variants" "$TMP_DIR/container.log" "/api/tuition/exam/variants"

          LIVE_JS="$TMP_DIR/p4d-live-check.mjs"
          cat >"$LIVE_JS" <<'NODE'
import { createRequire } from 'node:module';

const require = createRequire('/app/package.json');
const { Client } = require('/app/node_modules/pg');

const BASE = 'http://localhost:3010/api';
const AUTH_BASE = 'http://auth-center:3004';
const routes = [
  '/tuition/agent/classify-intent',
  '/tuition/agent/card/advance',
  '/tuition/agent/socratic/render',
  '/tuition/exam/scan',
  '/tuition/exam/variants',
];
const validPayloads = {
  '/tuition/agent/classify-intent': { input: '给我一点提示' },
  '/tuition/agent/card/advance': { intent: 'ASK_HINT' },
  '/tuition/agent/socratic/render': {
    key: { subject: 'math', type: 'single-choice', difficulty: 'easy', stage: 'hint' },
    context: { knowledgePoint: '勾股定理' },
  },
  '/tuition/exam/scan': {
    rawText: '1. 已知 x=2，求 2x。',
    subject: 'math',
    gradeLevel: '7',
  },
  '/tuition/exam/variants': {
    seed: {
      id: 'p4d-seed',
      type: 'solution',
      content: '已知 x=2，求 2x。',
      answer: '4',
    },
    count: 1,
    strategy: 'numeric',
    subject: 'math',
    gradeLevel: '7',
  },
};

let passed = 0;
let failed = 0;
let userId = null;
let db = null;

function check(ok, description, detail) {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${description}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${description}${detail ? ` (${detail})` : ''}`);
  }
}

async function request(path, options = {}) {
  const headers = {};
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.serviceToken) headers['x-service-token'] = options.serviceToken;
  const response = await fetch(`${BASE}${path}`, {
    method: options.method ?? 'POST',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

async function cleanupUser(serviceToken) {
  if (!userId) return;
  try {
    const response = await fetch(`${AUTH_BASE}/auth/admin/identities/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: { 'x-service-token': serviceToken },
    });
    check(response.ok, 'temporary auth identity disabled', `HTTP ${response.status}`);
  } catch (error) {
    check(false, 'temporary auth identity disabled', String(error));
  }
  if (db) {
    try {
      const result = await db.query('DELETE FROM public.users WHERE id = $1', [userId]);
      check(result.rowCount === 1, 'temporary business user deleted', `rowCount=${result.rowCount}`);
    } catch (error) {
      check(false, 'temporary business user deleted', String(error));
    }
  }
}

const serviceToken = process.env.AUTH_SERVICE_TOKEN ?? '';
try {
  if (!serviceToken) throw new Error('AUTH_SERVICE_TOKEN is missing');

  db = new Client({
    host: process.env.DB_HOST ?? 'postgres',
    port: Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME ?? 'gri',
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
  });
  await db.connect();

  const suffix = `${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
  const username = `p4d_${suffix}`;
  const email = `${username}@p4d.local`;
  const password = `P4d-${suffix}-Aa`;

  const register = await request('/auth/register', {
    body: { username, email, password, name: 'P4-D Verify' },
  });
  userId = register.body && register.body.id;
  check(
    (register.status === 200 || register.status === 201) && typeof userId === 'string',
    'temporary registration succeeds',
    `HTTP ${register.status}`,
  );
  if (!userId) throw new Error('registration did not return a user id');

  const login = await request('/auth/login', {
    body: { identifier: email, password },
  });
  const token = login.body && login.body.accessToken;
  check(
    (login.status === 200 || login.status === 201) && typeof token === 'string',
    'temporary login issues a bearer token',
    `HTTP ${login.status}`,
  );
  if (!token) throw new Error('login did not issue an access token');

  for (const path of routes) {
    const noAuth = await request(path, { body: validPayloads[path] });
    const missing = await request(path, { token, body: {} });
    const ok = await request(path, { token, body: validPayloads[path] });
    check(noAuth.status === 401, `${path} without token -> 401`, `HTTP ${noAuth.status}`);
    check(missing.status === 400, `${path} with missing params -> 400`, `HTTP ${missing.status}`);
    check(ok.status === 200, `${path} with valid payload -> 200`, `HTTP ${ok.status}`);

    if (path === '/tuition/agent/classify-intent') {
      check(ok.body?.intent === 'ASK_HINT', 'classify-intent returns normalized intent');
    }
    if (path === '/tuition/agent/card/advance') {
      check(ok.body?.state?.stage === 'Hint' && ok.body?.update?.stage === 'Hint', 'card advance returns the next FSM state');
    }
    if (path === '/tuition/agent/socratic/render') {
      check(typeof ok.body?.message === 'string' && ok.body.message.length > 0, 'socratic render returns a template message');
    }
    if (path === '/tuition/exam/scan') {
      check(
        ok.body?.success === true && Array.isArray(ok.body?.parsedQuestions) && ok.body.parsedQuestions.length === 1,
        'exam scan parses the supplied raw text',
      );
    }
    if (path === '/tuition/exam/variants') {
      check(
        Array.isArray(ok.body?.variants)
          && ok.body.variants.length === 1
          && ok.body.variants[0]?.type === 'solution',
        'exam variants preserve the normalized question type',
      );
    }
  }
} catch (error) {
  check(false, 'live HTTP smoke completed', String(error));
} finally {
  await cleanupUser(serviceToken).catch(() => undefined);
  if (db) await db.end().catch(() => undefined);
}

console.log(`LIVE_PASS=${passed}`);
console.log(`LIVE_FAIL=${failed}`);
if (failed > 0) process.exit(1);
NODE

          if docker exec -i "$CONTAINER" node --input-type=module <"$LIVE_JS" >"$TMP_DIR/live.log" 2>&1; then
            grep -E '^  (PASS|FAIL)|^LIVE_' "$TMP_DIR/live.log" | sed 's/^/  /'
            LIVE_PASS="$(sed -n 's/^LIVE_PASS=//p' "$TMP_DIR/live.log" | tail -n 1)"
            LIVE_FAIL="$(sed -n 's/^LIVE_FAIL=//p' "$TMP_DIR/live.log" | tail -n 1)"
            PASS=$((PASS + ${LIVE_PASS:-0}))
            FAIL=$((FAIL + ${LIVE_FAIL:-0}))
          else
            fail "live HTTP contract check"
            tail -n 80 "$TMP_DIR/live.log" | sed 's/^/        /'
          fi
        else
          fail "temporary API container did not become ready"
          docker logs --tail 80 "$CONTAINER" 2>&1 | sed 's/^/        /' || true
        fi
      else
        fail "temporary API container failed to start"
        cat "$TMP_DIR/container-id.log" | sed 's/^/        /' || true
      fi
    fi
  fi
fi

echo "== summary =="
if [ "$FAIL" -eq 0 ]; then
  echo "全绿：PASS=$PASS FAIL=$FAIL SKIP=$SKIP"
  exit 0
fi
echo "未全绿：PASS=$PASS FAIL=$FAIL SKIP=$SKIP"
exit 1
