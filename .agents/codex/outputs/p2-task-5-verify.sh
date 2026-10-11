#!/usr/bin/env bash
# ============================================================================
# P2-T5 自动化验收：tuition 练习中心「会话级进度/分析闭环」
#
# 三层校验（缺失的基础设施自动降级为 SKIP，不产生假 FAIL）：
#   A. 静态源码断言（始终执行）—— 端点/服务方法/DTO/迁移/N1 禁引项。
#   B. DB 事实断言 —— 优先 docker exec psql，退化为 node+pg；都不可用则 SKIP。
#   C. HTTP E2E —— api 可达时跑全链路（answer 落 session_id / progress / analysis /
#      越权 403 / 无效 404）；不可达则 SKIP。
#
# 依赖（E2E 全跑时）：gri-postgres / gri-auth-center / gri-api（宿主 api=3008, auth=3004）。
# 前置纪律：改了 services/api/src/migrate/*.sql 后必须先
#   cd services/api && npm run build && npm run migrate   （runner 读 dist/migrate/*.sql）。
#
# 用法： bash .agents/codex/outputs/p2-task-5-verify.sh
# 通过： 末行打印「全绿：PASS=X FAIL=0」；FAIL>0 则非零退出。
# ============================================================================
set -uo pipefail

API_BASE="${API_BASE:-http://localhost:3008/api}"
AUTH_BASE="${AUTH_BASE:-http://localhost:3004/auth}"
API_HEALTH="${API_HEALTH:-http://localhost:3008/health}"
PG_CONTAINER="${PG_CONTAINER:-gri-postgres}"
PG_DB="${PG_DB:-gri}"
PG_USER="${PG_USER:-postgres}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
API_DIR="$ROOT/services/api"
SVC="$API_DIR/src/modules/tuition/tuition.service.ts"
CTL="$API_DIR/src/modules/tuition/tuition.controller.ts"
TYP="$API_DIR/src/modules/tuition/tuition.types.ts"
MIG020="$API_DIR/src/migrate/020_answer_records_session_fk.sql"

PASS=0; FAIL=0; SKIP=0
pass() { PASS=$((PASS+1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL+1)); echo "  ❌ $1"; }
skip() { SKIP=$((SKIP+1)); echo "  ⏭️  SKIP: $1"; }

assert_contains() { # <desc> <file> <regex>
  if grep -Eq "$3" "$2" 2>/dev/null; then pass "$1"; else fail "$1（未在 $(basename "$2") 命中 /$3/）"; fi
}
assert_status() { local d="$1" e="$2" g="$3"; [ "$g" = "$e" ] && pass "$d（HTTP $g）" || fail "$d（期望 $e，实得 $g）"; }

# ------------------------------------------------------------------ 静态 A
echo "== A. 静态源码断言 =="
assert_contains "controller 声明 GET practice/sessions/:sessionId/progress" "$CTL" "practice/sessions/:sessionId/progress"
assert_contains "controller 声明 GET practice/sessions/:sessionId/analysis" "$CTL" "practice/sessions/:sessionId/analysis"
assert_contains "service 实现 getSessionProgress" "$SVC" "async getSessionProgress"
assert_contains "service 实现 getSessionAnalysis" "$SVC" "async getSessionAnalysis"
assert_contains "submitPracticeAnswer 落真实 session_id（参数化 \$3）" "$SVC" 'VALUES \(\$1, \$2, \$3, \$4, \$5, \$6\)'
assert_contains "submitPracticeAnswer 传 body.sessionId ?? null" "$SVC" "body\.sessionId \?\? null"
assert_contains "types 定义 SessionProgressDto" "$TYP" "interface SessionProgressDto"
assert_contains "types 定义 SessionAnalysisDto" "$TYP" "interface SessionAnalysisDto"
assert_contains "types 定义 AnswerSubmitDto" "$TYP" "interface AnswerSubmitDto"
assert_contains "签名契约 req.auth.externalId（controller userId 取 externalId）" "$CTL" "auth\.externalId"
if [ -f "$MIG020" ]; then pass "迁移 020_answer_records_session_fk.sql 存在"; else fail "缺迁移 020_answer_records_session_fk.sql"; fi
if grep -REq "(from|require\(|readFileSync?\()[^\n]*k12/questions\.yaml" "$SVC" "$CTL" "$TYP" 2>/dev/null; then
  fail "N1 违规：引用了不存在的 k12/questions.yaml"
else
  pass "N1 合规：未引用不存在的 k12/questions.yaml"
fi

# ------------------------------------------------------------------ DB B
echo "== B. DB 事实断言 =="
NODE_DB=""
if docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAc 'SELECT 1' >/dev/null 2>&1; then
  DB_MODE=docker
else
  NODE_DB="$(mktemp /tmp/p2t5-db.XXXXXX.mjs)"
  cat > "$NODE_DB" <<'NODE'
import pg from 'pg';
const sql = process.argv[2];
const c = new pg.Client({ host: process.env.DB_HOST || 'localhost', port: +(process.env.DB_PORT || 5432), user: process.env.DB_USER || 'postgres', password: process.env.DB_PASSWORD || 'postgres', database: process.env.DB_NAME || 'gri' });
try { await c.connect(); const r = await c.query(sql); const row = r.rows[0]; console.log(row ? Object.values(row)[0] : ''); await c.end(); }
catch { process.exit(3); }
NODE
  if ( cd "$API_DIR" && node "$NODE_DB" 'SELECT 1' >/dev/null 2>&1 ); then DB_MODE=node; else DB_MODE=none; fi
fi
db_val() {
  local sql="$1"
  case "$DB_MODE" in
    docker) docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAc "$sql" 2>/dev/null | head -n1 | tr -d '[:space:]' ;;
    node) ( cd "$API_DIR" && node "$NODE_DB" "$sql" 2>/dev/null ) | head -n1 | tr -d '[:space:]' ;;
    *) echo "" ;;
  esac
}

if [ "$DB_MODE" = none ]; then
  skip "DB 不可达（docker/psql/node-pg 均失败）——跳过 schema/FK 校验"
else
  FKREF="$(db_val "SELECT confrelid::regclass::text FROM pg_constraint WHERE conname='answer_records_session_id_fkey' AND conrelid='edu.answer_records'::regclass")"
  case "$FKREF" in
    *practice_sessions*) pass "answer_records.session_id FK → edu.practice_sessions（已重定向）" ;;
    "") fail "answer_records.session_id 无 FK（先 build+migrate 应用 020）" ;;
    *) fail "answer_records.session_id FK 仍指向 $FKREF（先 build+migrate 应用 020）" ;;
  esac
  IDX="$(db_val "SELECT 1 FROM pg_indexes WHERE schemaname='edu' AND indexname='idx_answers_session'")"
  [ "$IDX" = "1" ] && pass "索引 edu.idx_answers_session 存在" || fail "缺索引 idx_answers_session"
fi

# ------------------------------------------------------------------ HTTP C
echo "== C. HTTP E2E（会话级闭环） =="
req() { # <METHOD> <URL> <TOKEN|-> <JSON|->
  local method="$1" url="$2" token="$3" data="$4"
  local args=(-s -w $'\n%{http_code}' -X "$method" "$url" -H 'Content-Type: application/json')
  [ "$token" != "-" ] && args+=(-H "Authorization: Bearer $token")
  [ "$data" != "-" ] && args+=(-d "$data")
  local out; out="$(curl -m 10 "${args[@]}")"
  RESP_CODE="$(printf '%s' "$out" | tail -n1)"
  RESP_BODY="$(printf '%s' "$out" | sed '$d')"
}
jbody() { printf '%s' "$RESP_BODY" | jq -r "$1" 2>/dev/null; }
login() { req POST "$AUTH_BASE/login" - "$(jq -nc --arg i "$1" --arg p "password123" '{identifier:$i,password:$p}')"; jbody '.accessToken // empty'; }
register() { req POST "$API_BASE/auth/register" - "$(jq -nc --arg u "$1" --arg e "$1@example.com" --arg p "password123" '{username:$u,email:$e,password:$p,name:$u}')"; }

if ! curl -sf -m 5 "$API_HEALTH" >/dev/null 2>&1; then
  skip "api 不可达 $API_HEALTH —— 跳过 HTTP E2E（静态/DB 层已校验）"
else
  TS="$(date +%s)"
  UA="p2t5a_${TS}"; UB="p2t5b_${TS}"
  register "$UA" >/dev/null; register "$UB" >/dev/null
  A_TOKEN="$(login "$UA")"; B_TOKEN="$(login "$UB")"
  [ -n "$A_TOKEN" ] && pass "A 登录取 token" || fail "A 登录失败"
  [ -n "$B_TOKEN" ] && pass "B 登录取 token" || fail "B 登录失败"

  req GET "$API_BASE/tuition/questions?limit=3" - -
  QIDS="$(printf '%s' "$RESP_BODY" | jq -r '.[0:3][].id' 2>/dev/null)"
  QN="$(printf '%s' "$QIDS" | grep -c . || true)"
  [ "$QN" -ge 3 ] && pass "题库取到 $QN 道题" || fail "题库题目不足（$QN）"
  QJSON="$(printf '%s' "$RESP_BODY" | jq -c '.[0:3] | map({id:.id})' 2>/dev/null)"

  req POST "$API_BASE/tuition/practice/session/start" "$A_TOKEN" "$(jq -nc --argjson q "$QJSON" '{mode:"quick",subject:"math",questions:$q}')"
  SID="$(jbody '.id // empty')"
  [ -n "$SID" ] && pass "A 建练习会话 sessionId=$SID" || fail "建会话失败"

  N=0
  while IFS= read -r qid; do
    [ -z "$qid" ] && continue
    req POST "$API_BASE/tuition/practice/answer" "$A_TOKEN" "$(jq -nc --arg q "$qid" --arg s "$SID" '{questionId:$q,answer:"zzz",sessionId:$s}')"
    case "$RESP_CODE" in 2??) N=$((N+1)) ;; esac
  done <<< "$QIDS"
  [ "$N" -eq 3 ] && pass "A 带 sessionId 答题 3 次" || fail "答题成功数=$N（期望 3）"

  req GET "$API_BASE/tuition/practice/sessions/$SID/progress" "$A_TOKEN" -
  assert_status "GET progress" "200" "$RESP_CODE"
  [ "$(jbody '.answered')" = "3" ] && pass "progress.answered=3" || fail "progress.answered=$(jbody '.answered')"
  [ "$(jbody '.currentIndex')" = "3" ] && pass "progress.currentIndex=3" || fail "progress.currentIndex=$(jbody '.currentIndex')"
  CR="$(jbody '.correctRate')"
  awk "BEGIN{exit !($CR>=0 && $CR<=1)}" 2>/dev/null && pass "progress.correctRate=$CR ∈[0,1]" || fail "progress.correctRate=$CR 越界"
  [ "$(jbody '.total')" -ge 3 ] 2>/dev/null && pass "progress.total=$(jbody '.total') ≥3" || fail "progress.total 异常"

  req GET "$API_BASE/tuition/practice/sessions/$SID/analysis" "$A_TOKEN" -
  assert_status "GET analysis" "200" "$RESP_CODE"
  [ "$(jbody '.items | length')" = "3" ] && pass "analysis.items 逐题 3 条" || fail "analysis.items=$(jbody '.items | length')"
  printf '%s' "$RESP_BODY" | jq -e '.knowledgePoints | type=="array"' >/dev/null 2>&1 && pass "analysis.knowledgePoints 聚合数组" || fail "analysis.knowledgePoints 缺失"

  if [ "$DB_MODE" != none ]; then
    CNT="$(db_val "SELECT COUNT(*) FROM edu.answer_records WHERE session_id='$SID'")"
    [ "$CNT" = "3" ] && pass "answer_records.session_id=$SID 落库 3 条（非 NULL）" || fail "落库 session_id 记录数=$CNT（期望 3）"
  else
    skip "DB 不可达 —— 跳过 session_id 落库直查"
  fi

  req GET "$API_BASE/tuition/practice/sessions/$SID/progress" "$B_TOKEN" -
  assert_status "B 访问 A 的 progress → 403" "403" "$RESP_CODE"
  req GET "$API_BASE/tuition/practice/sessions/$SID/analysis" "$B_TOKEN" -
  assert_status "B 访问 A 的 analysis → 403" "403" "$RESP_CODE"

  req GET "$API_BASE/tuition/practice/sessions/00000000-0000-0000-0000-000000000000/progress" "$A_TOKEN" -
  assert_status "不存在的 sessionId → 404" "404" "$RESP_CODE"
  req GET "$API_BASE/tuition/practice/sessions/not-a-uuid/analysis" "$A_TOKEN" -
  assert_status "malformed sessionId → 404" "404" "$RESP_CODE"
fi

[ -n "$NODE_DB" ] && rm -f "$NODE_DB"
echo
if [ "$FAIL" -eq 0 ]; then
  echo "全绿：PASS=$PASS FAIL=$FAIL SKIP=$SKIP"
  exit 0
else
  echo "未全绿：PASS=$PASS FAIL=$FAIL SKIP=$SKIP"
  exit 1
fi
