#!/usr/bin/env bash
# ============================================================================
# P2-T8 自动化验收：tuition 错题本「due 到期队列 + 复习闭环 + 统计」
#
# 三层校验（缺失基础设施自动降级为 SKIP，不产生假 FAIL）：
#   A. 静态源码断言（始终执行）—— 端点/路由顺序/服务方法/DTO/N1-N6 硬约束。
#   B. DB 事实断言 —— 优先 docker exec psql，退化为 node+pg；都不可用则 SKIP。
#   C. HTTP E2E —— api 可达时跑全链路（答错 → due → review → due 收敛 → stats → detail →
#      跨用户 403 / 不存在 404 / 空态 []）；不可达则 SKIP。
#
# 依赖（E2E 全跑时）：gri-postgres / gri-auth-center / gri-api（宿主 api=3008, auth=3004）。
# 本卡 N4：无 DB 迁移（sr_queue 已有 idx_sr_next），故不校验迁移文件。
#
# 用法： bash .agents/codex/outputs/p2-task-8-verify.sh
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
MIG_DIR="$API_DIR/src/migrate"
SPEC="$API_DIR/src/modules/tuition/tuition.service.spec.ts"

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
assert_contains "controller 声明 GET wrong-questions/due" "$CTL" "Get\('wrong-questions/due'\)"
assert_contains "controller 声明 GET wrong-questions/stats/:studentId" "$CTL" "Get\('wrong-questions/stats/:studentId'\)"
assert_contains "controller 声明 GET wrong-questions/:id" "$CTL" "Get\('wrong-questions/:id'\)"
assert_contains "service 实现 getDueWrongQuestions" "$SVC" "async getDueWrongQuestions"
assert_contains "service 实现 getWrongQuestionStats" "$SVC" "async getWrongQuestionStats"
assert_contains "service 实现 getWrongQuestionById" "$SVC" "async getWrongQuestionById"
assert_contains "types 定义 DueWrongQuestionDto" "$TYP" "interface DueWrongQuestionDto"
assert_contains "types 定义 WrongQuestionStatsDto" "$TYP" "interface WrongQuestionStatsDto"
assert_contains "types 定义 WrongQuestionDetailDto" "$TYP" "interface WrongQuestionDetailDto"
assert_contains "types 定义 SrParams" "$TYP" "interface SrParams"

# 路由顺序：due / stats 必须声明在 :id 之前（否则被 :id 吞）
DUE_LINE="$(grep -n "wrong-questions/due" "$CTL" | head -n1 | cut -d: -f1)"
STATS_LINE="$(grep -n "wrong-questions/stats/:studentId" "$CTL" | head -n1 | cut -d: -f1)"
ID_LINE="$(grep -n "Get('wrong-questions/:id')" "$CTL" | head -n1 | cut -d: -f1)"
if [ -n "$DUE_LINE" ] && [ -n "$ID_LINE" ] && [ "$DUE_LINE" -lt "$ID_LINE" ]; then
  pass "路由顺序：due(L$DUE_LINE) 在 :id(L$ID_LINE) 之前"
else
  fail "路由顺序错误：due=$DUE_LINE :id=$ID_LINE"
fi
if [ -n "$STATS_LINE" ] && [ -n "$ID_LINE" ] && [ "$STATS_LINE" -lt "$ID_LINE" ]; then
  pass "路由顺序：stats(L$STATS_LINE) 在 :id(L$ID_LINE) 之前"
else
  fail "路由顺序错误：stats=$STATS_LINE :id=$ID_LINE"
fi

# due 数据源 = sr_queue.next_review ≤ now（升序），非 wrong_questions
assert_contains "due 源自 edu.sr_queue（join questions）" "$SVC" "FROM edu\.sr_queue sq"
assert_contains "due 过滤 next_review <= NOW()" "$SVC" "sq\.next_review <= NOW\(\)"
assert_contains "due 按 next_review 升序" "$SVC" "ORDER BY sq\.next_review ASC"
assert_contains "stats 按 knowledge_point 聚合" "$SVC" "COALESCE\(wq\.knowledge_point, kp\.name\)"

# N2：复用 SpacedRepetitionService，禁新造 calculateNextReview / updateEaseFactor
assert_contains "N2 复用 this.sr.updateSRQueue" "$SVC" "this\.sr\.updateSRQueue"
if grep -Eq "calculateNextReview|updateEaseFactor" "$SVC" "$CTL" "$TYP" 2>/dev/null; then
  fail "N2 违规：新造了 calculateNextReview/updateEaseFactor"
else
  pass "N2 合规：未新造 calculateNextReview/updateEaseFactor"
fi

# N1：禁引不存在的 k12/wrong-questions.yaml
if grep -REq "(from|require\(|readFileSync?\()[^\n]*k12/wrong-questions\.yaml" "$SVC" "$CTL" "$TYP" 2>/dev/null; then
  fail "N1 违规：引用了不存在的 k12/wrong-questions.yaml"
else
  pass "N1 合规：未引用不存在的 k12/wrong-questions.yaml"
fi

# N3：SM-2 参数只存 sr_queue，不得给 wrong_questions 加 SR 列
if grep -REq "ALTER TABLE edu\.wrong_questions[^;]*(ease_factor|next_review|interval)" "$MIG_DIR" 2>/dev/null; then
  fail "N3 违规：迁移给 edu.wrong_questions 加了 SR 列"
else
  pass "N3 合规：未给 edu.wrong_questions 加 SR 列"
fi
if grep -Eq '\b(wq|wrong_questions)\.(next_review_at|next_review|ease_factor|interval|repetitions)\b' "$SVC" 2>/dev/null; then
  fail "N3 违规：service 从 wrong_questions 读 SR 列"
else
  pass "N3 合规：service 的 SR 列只来自 sr_queue"
fi

# N5：身份契约 req.auth.externalId；stats 走 assertOwner
assert_contains "N5 身份取 req.auth.externalId" "$CTL" "auth\.externalId"
assert_contains "N5 stats 经 assertOwner 越权校验" "$CTL" "assertOwner\(req, studentId\)"

# N6：错误类型沿用库内中文值，禁改英文枚举
assert_contains "N6 沿用中文错误类型（计算错误）" "$SVC" "计算错误"
if grep -Eq "'(conceptual|procedural|careless|knowledge_gap|silly_mistake)'" "$SVC" "$CTL" "$TYP" 2>/dev/null; then
  fail "N6 违规：引入了英文错误类型枚举"
else
  pass "N6 合规：未引入英文错误类型枚举"
fi

# 测试规模：T8 新增单测 ≥ 12（按 P2-T8 段落统计，避免被历史用例数误判）
NTESTS="$(grep -cE "^\s*it\(" "$SPEC" 2>/dev/null || echo 0)"
T8_TESTS="$(awk '/P2-T8/{flag=1} flag' "$SPEC" 2>/dev/null | grep -cE "^\s*it\(" || true)"
echo "  ℹ️  tuition.service.spec.ts 用例总数 = $NTESTS，其中 T8 新增 = $T8_TESTS"
[ "$T8_TESTS" -ge 12 ] && pass "T8 新增单测 ≥12（实际 $T8_TESTS）" || fail "T8 新增单测不足（实际 $T8_TESTS）"

# ------------------------------------------------------------------ DB B
echo "== B. DB 事实断言 =="
NODE_DB=""
if docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAc 'SELECT 1' >/dev/null 2>&1; then
  DB_MODE=docker
else
  NODE_DB="$(mktemp /tmp/p2t8-db.XXXXXX.mjs)"
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
  skip "DB 不可达（docker/psql/node-pg 均失败）——跳过 schema 校验"
else
  IDX="$(db_val "SELECT 1 FROM pg_indexes WHERE schemaname='edu' AND indexname='idx_sr_next'")"
  [ "$IDX" = "1" ] && pass "索引 edu.idx_sr_next 存在（due 查询可走索引）" || fail "缺索引 idx_sr_next"
  SRCOL="$(db_val "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='edu' AND table_name='wrong_questions' AND column_name IN ('next_review_at','ease_factor','interval','repetitions')")"
  [ "$SRCOL" = "0" ] && pass "N3：edu.wrong_questions 无 SR 列" || fail "edu.wrong_questions 出现 SR 列（count=$SRCOL）"
  SQCOL="$(db_val "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='edu' AND table_name='sr_queue' AND column_name IN ('interval','ease_factor','repetitions','next_review')")"
  [ "$SQCOL" = "4" ] && pass "edu.sr_queue 含全部 4 个 SM-2 列" || fail "edu.sr_queue SM-2 列缺失（count=$SQCOL）"
fi

# ------------------------------------------------------------------ HTTP C
echo "== C. HTTP E2E（due 队列 / 复习闭环 / 统计） =="
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
jwt_ext() { # <token> → externalId（业务主体）
  local p="${1#*.}"; p="${p%%.*}"; p="${p//-/+}"; p="${p//_//}"
  case $(( ${#p} % 4 )) in 2) p="$p==" ;; 3) p="$p=" ;; esac
  printf '%s' "$p" | base64 -d 2>/dev/null | jq -r '.externalId // .external_id // empty'
}

if ! curl -sf -m 5 "$API_HEALTH" >/dev/null 2>&1; then
  skip "api 不可达 $API_HEALTH —— 跳过 HTTP E2E（静态/DB 层已校验）"
else
  TS="$(date +%s)"
  UA="p2t8a_${TS}"; UB="p2t8b_${TS}"
  register "$UA" >/dev/null; register "$UB" >/dev/null
  A_TOKEN="$(login "$UA")"; B_TOKEN="$(login "$UB")"
  EXT_A="$(jwt_ext "$A_TOKEN")"
  [ -n "$A_TOKEN" ] && pass "A 登录取 token" || fail "A 登录失败"
  [ -n "$B_TOKEN" ] && pass "B 登录取 token" || fail "B 登录失败"
  [ -n "$EXT_A" ] && pass "A externalId=$EXT_A" || fail "A token 无 externalId"

  # 1. 答错 3 题 → wrong_questions 入库 + sr_queue 建行（next_review ≤ now）
  req GET "$API_BASE/tuition/questions?limit=3" - -
  QIDS="$(printf '%s' "$RESP_BODY" | jq -r '.[0:3][].id' 2>/dev/null)"
  QN="$(printf '%s' "$QIDS" | grep -c . || true)"
  [ "$QN" -ge 3 ] && pass "题库取到 $QN 道题" || fail "题库题目不足（$QN）"

  N=0
  while IFS= read -r qid; do
    [ -z "$qid" ] && continue
    req POST "$API_BASE/tuition/practice/answer" "$A_TOKEN" "$(jq -nc --arg q "$qid" '{questionId:$q,answer:"__t8_wrong__",isCorrect:false}')"
    case "$RESP_CODE" in 2??) N=$((N+1)) ;; esac
  done <<< "$QIDS"
  [ "$N" -eq 3 ] && pass "A 答错 3 题（自动入库 + SR 建行）" || fail "答题成功数=$N（期望 3）"

  # 2. GET /wrong-questions/due → 3 条，按 next_review 升序
  req GET "$API_BASE/tuition/wrong-questions/due" "$A_TOKEN" -
  assert_status "GET wrong-questions/due" "200" "$RESP_CODE"
  DUE_N="$(jbody 'length')"
  [ "$DUE_N" = "3" ] && pass "due 到期卡片 3 条" || fail "due 条数=$DUE_N（期望 3）"
  SORTED="$(printf '%s' "$RESP_BODY" | jq -r '[.[].sr.nextReview] | . == (sort)' 2>/dev/null)"
  [ "$SORTED" = "true" ] && pass "due 按 next_review 升序" || fail "due 未按 next_review 升序（$SORTED）"
  RID="$(jbody '.[0].id')"; RQID="$(jbody '.[0].questionId')"
  { [ -n "$RID" ] && [ "$RID" != "null" ]; } && pass "due 首卡含 wrong_questions id" || fail "due 首卡 id 缺失"
  printf '%s' "$RESP_BODY" | jq -e '.[0].sr | has("interval") and has("easeFactor") and has("repetitions")' >/dev/null 2>&1 \
    && pass "due 卡片含 SR 参数" || fail "due 卡片缺 SR 参数"

  # 3. POST /wrong-questions/:id/review {mastery:0.9} → 200；sr_queue interval=1,next_review→+1d
  req POST "$API_BASE/tuition/wrong-questions/$RID/review" "$A_TOKEN" '{"mastery":0.9}'
  case "$RESP_CODE" in
    200|201) pass "POST review(mastery=0.9)（HTTP $RESP_CODE）" ;;
    *) fail "POST review(mastery=0.9)（期望 200/201，实得 $RESP_CODE）" ;;
  esac
  if [ "$DB_MODE" != none ]; then
    IV="$(db_val "SELECT interval FROM edu.sr_queue WHERE user_id='$EXT_A' AND question_id='$RQID'")"
    [ "$IV" = "1" ] && pass "sr_queue.interval=1（SM-2 联动）" || fail "sr_queue.interval=$IV（期望 1）"
    NR="$(db_val "SELECT (next_review > NOW())::text FROM edu.sr_queue WHERE user_id='$EXT_A' AND question_id='$RQID'")"
    { [ "$NR" = "t" ] || [ "$NR" = "true" ]; } && pass "sr_queue.next_review 推后至未来" || fail "next_review 未推后（$NR）"
  else
    skip "DB 不可达 —— 跳过 interval/next_review 直查"
  fi

  # 4. 再 GET due → 已复习题（+1d）消失，条数减少
  req GET "$API_BASE/tuition/wrong-questions/due" "$A_TOKEN" -
  DUE2="$(jbody 'length')"
  { [ -n "$DUE2" ] && [ "$DUE2" -le 2 ]; } && pass "复习后 due 收敛（$DUE_N → $DUE2）" || fail "复习后 due 未收敛（$DUE2）"

  # 5. GET /wrong-questions/stats/:studentId → masteryBuckets + topErrorKnowledgePoints + reviewProgress
  req GET "$API_BASE/tuition/wrong-questions/stats/$EXT_A" "$A_TOKEN" -
  assert_status "GET wrong-questions/stats/:studentId" "200" "$RESP_CODE"
  for k in masteryBuckets topErrorKnowledgePoints reviewProgress; do
    printf '%s' "$RESP_BODY" | jq -e ".$k != null" >/dev/null 2>&1 && pass "stats.$k 存在" || fail "stats.$k 缺失"
  done
  TOT="$(jbody '.reviewProgress.total')"
  { [ -n "$TOT" ] && [ "$TOT" -ge 3 ]; } && pass "stats.reviewProgress.total=$TOT ≥3" || fail "stats.reviewProgress.total=$TOT 异常"
  printf '%s' "$RESP_BODY" | jq -e '.masteryBuckets | type == "array" and length >= 3' >/dev/null 2>&1 \
    && pass "stats.masteryBuckets 为 ≥3 档分布" || fail "stats.masteryBuckets 形态异常"

  # 6. GET /wrong-questions/:id → 单条详情含 SR 参数
  req GET "$API_BASE/tuition/wrong-questions/$RID" "$A_TOKEN" -
  assert_status "GET wrong-questions/:id 详情" "200" "$RESP_CODE"
  [ "$(jbody '.id')" = "$RID" ] && pass "详情 id 一致" || fail "详情 id=$(jbody '.id') ≠ $RID"
  printf '%s' "$RESP_BODY" | jq -e '.sr != null and (.sr|has("nextReview"))' >/dev/null 2>&1 \
    && pass "详情含 SR 参数" || fail "详情缺 SR 参数"

  # 7. 越权 403 / 不存在 404 / 空态 []
  req GET "$API_BASE/tuition/wrong-questions/stats/$EXT_A" "$B_TOKEN" -
  assert_status "B 访问 A 的 stats → 403" "403" "$RESP_CODE"
  req GET "$API_BASE/tuition/wrong-questions/$RID" "$B_TOKEN" -
  assert_status "B 访问 A 的错题详情 → 403" "403" "$RESP_CODE"
  req GET "$API_BASE/tuition/wrong-questions/00000000-0000-0000-0000-000000000000" "$A_TOKEN" -
  assert_status "不存在的错题 → 404" "404" "$RESP_CODE"
  req GET "$API_BASE/tuition/wrong-questions/due" "$B_TOKEN" -
  BEN="$(jbody 'length')"
  [ "$BEN" = "0" ] && pass "B 无 SR 记录 → due 返回空数组（不报错）" || fail "B 的 due 条数=$BEN（期望 0）"
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
