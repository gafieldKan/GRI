#!/usr/bin/env bash
# W2.4b card-strategy 插件 —— **活体 E2E**（真实 Nest 进程 · 真 plugin-host 装载 · 真登录链路）
#
# 为什么单写一份：等价性证明已有三层（spec 断言不变 / 真 plugin-host 解析实测 / 行为抽测），
# 但「端到端那一下」此前缺位 —— 本脚本补上：真起容器、真登录、真打端点。
#
# 口径（与 socratic 那轮复验同源）：
#   - 端点形状**逐字节不变**（前端在用）：{state,update} 双层返回、stage/intent/hintCount/attemptCount 四字段。
#   - 判错按 name → 400（非 500）：这一步是「跨插件边界 instanceof 失效」坑的活体证明。
#   - 能力未装配 → 503（P5 不崩、可诊断）由 spec 专测覆盖；活体只验「装上了真好使」。
#
# 前置：docker compose up -d（api 已重建、card-strategy 已在镜像里）；testuser 凭据。
set -uo pipefail

API="${API:-http://localhost:3008}"
IDENT="${TEST_IDENTIFIER:-testuser}"
PASS="${TEST_PASSWORD:-test1234}"
PASS_CNT=0; FAIL_CNT=0

ok()   { PASS_CNT=$((PASS_CNT+1)); echo "  PASS $1"; }
bad()  { FAIL_CNT=$((FAIL_CNT+1)); echo "  FAIL $1"; }
# ok_has <名称> <文本> < needles ... >：文本须含**每一个** needle
ok_has(){ local n="$1" t="$2"; shift 2; local m; for m in "$@"; do
  case "$t" in *"$m"*) ok "$n（含 $m）";; *) bad "$n（缺 $m）:: $t";; esac; done; }
# jget <json> <jq 表达式>
jget(){ node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const v=eval("("+s+")");console.log(eval(process.argv[1]))}catch(e){console.log("PARSE_ERR:"+e.message)}})' "$1" 2>/dev/null; }

echo "== 0. 登录取 token（真实鉴权链路，card 端点非公开白名单）=="
LOGIN=$(curl -s -X POST "$API/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"identifier\":\"$IDENT\",\"password\":\"$PASS\"}")
TOKEN=$(printf '%s' "$LOGIN" | jget 'v.accessToken||v.token||v.data?.accessToken||""')
if [ -z "${TOKEN:-}" ] || [ "${TOKEN:0:9}" = "PARSE_ERR" ]; then
  echo "  登录失败，无法继续：$(printf '%s' "$LOGIN" | head -c 300)"; exit 1
fi
ok "登录取到 token"
AUTH=(-H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json')

card() { curl -s -X POST "$API/api/tuition/agent/card/advance" "${AUTH[@]}" -d "$1" -w '\n%{http_code}'; }
soc()  { curl -s -X POST "$API/api/tuition/agent/socratic/render" "${AUTH[@]}" -d "$1" -w '\n%{http_code}'; }

echo "== 1. 端点契约形状逐字节不变（前端在用）=="
R=$(card '{"intent":"ASK_SOLUTION"}')
BODY=$(printf '%s' "$R" | head -n1); CODE=$(printf '%s' "$R" | tail -n1)
[ "$CODE" = "200" ] && ok "ASK_SOLUTION → 200" || bad "ASK_SOLUTION → $CODE :: $BODY"
ok_has "返回体含 state+update 双层" "$BODY" '"state"' '"update"'
ok_has "update 四字段（stage/intent/hintCount/attemptCount）" "$BODY" '"stage":"Solution"' '"intent":"ASK_SOLUTION"' '"hintCount":0' '"attemptCount":0'
ok_has "state 三字段（不可变推进产物）" "$BODY" '"stage"' '"hintCount"' '"attemptCount"'

echo "== 2. Guard1 Hint 上限：第 3 次强制 Scaffold 且 hintCount 停在 2 =="
# 注意：须先答错一次拿 attemptCount≥1，否则 Guard2 会拦住 Scaffold（这正是原 FSM 的 Guard2）。
S1=$(card '{"state":{"stage":"Hint","hintCount":2,"attemptCount":1},"intent":"ASK_HINT"}' | head -n1)
ok_has "hintCount=2 再要提示 → 强制 Scaffold（不再发第 3 条）" "$S1" '"stage":"Scaffold"' '"hintCount":2'
S2=$(card '{"state":{"stage":"Question","hintCount":0,"attemptCount":1},"intent":"ASK_HINT"}' | head -n1)
ok_has "Question + 已作答 → Hint，hintCount=1" "$S2" '"stage":"Hint"' '"hintCount":1' '"attemptCount":1'

echo "== 3. Guard2 Scaffold 前置：未作答即 Scaffold → 400（活体验证「按 name 判」）=="
R=$(card '{"state":{"stage":"Question","hintCount":0,"attemptCount":0},"intent":"ASK_HINT"}')
BODY=$(printf '%s' "$R" | head -n1); CODE=$(printf '%s' "$R" | tail -n1)
# Question→ASK_HINT 且未达上限 → 目标 Hint 而非 Scaffold，故合法；要触发 Guard2 须让目标=Scaffold 且 attemptCount=0
# → 构造 hintCount 已达上限但 attemptCount=0（spec 里的 Guard2 用例同形）
R=$(card '{"state":{"stage":"Question","hintCount":2,"attemptCount":0},"intent":"ASK_HINT"}')
BODY=$(printf '%s' "$R" | head -n1); CODE=$(printf '%s' "$R" | tail -n1)
[ "$CODE" = "400" ] && ok "Guard2：未作答即强制 Scaffold → 400（非 500 = 跨边界判错正确）" || bad "Guard2 → $CODE :: $BODY"
ok_has "400 文案来自插件错误 message（含 Scaffold 前置理由）" "$BODY" 'Scaffold'
ok_has "且带 name 语义的原文（转移不在表中/需先尝试作答）" "$BODY" '需先尝试作答'

echo "== 4. Guard3 Solution 直达 + 非法转移 400 =="
R=$(card '{"state":{"stage":"Reflection","hintCount":0,"attemptCount":1},"intent":"ASK_SOLUTION"}')
CODE=$(printf '%s' "$R" | tail -n1); BODY=$(printf '%s' "$R" | head -n1)
[ "$CODE" = "400" ] && ok "Reflection 再要答案 → 400（转移不在表内）" || bad "Reflection→ASK_SOLUTION → $CODE :: $BODY"
R=$(card '{"state":{"stage":"Question","hintCount":1,"attemptCount":1},"intent":"GIVE_UP"}')
CODE=$(printf '%s' "$R" | tail -n1); BODY=$(printf '%s' "$R" | head -n1)
[ "$CODE" = "200" ] && ok "GIVE_UP → 200 直达 Solution" || bad "GIVE_UP → $CODE :: $BODY"
ok_has "GIVE_UP 落 Solution" "$BODY" '"stage":"Solution"'

echo "== 5. NEXT_QUESTION 重置计数（Reflection → Question，计数归零）=="
R=$(card '{"state":{"stage":"Reflection","hintCount":2,"attemptCount":3},"intent":"NEXT_QUESTION"}')
BODY=$(printf '%s' "$R" | head -n1); CODE=$(printf '%s' "$R" | tail -n1)
[ "$CODE" = "200" ] && ok "NEXT_QUESTION → 200" || bad "NEXT_QUESTION → $CODE :: $BODY"
ok_has "重置为 Question 且 hint/attempt 归零" "$BODY" '"stage":"Question"' '"hintCount":0' '"attemptCount":0'

echo "== 6. 自转移（ASK_CLARIFICATION / OFF_TOPIC 不改态）=="
# ⚠️ 口径（活体实测 + 与原版对拍确认）：自转移只保证 **stage 不变**；但当**当前态是 Hint** 时，
# `target === state.stage === 'Hint'` 会命中 `if (target === 'Hint') next.hintCount++` —— 这是**原版既有怪癖**，
# 非本片引入（已用 `git show pre-w2.4b-card-fsm` 的原版逐字节对拍确认：h=1→2 / h=5→6 完全一致）。
#  spec 的自转移用例取 `stage:'Question'`（默认态），正好绕开该怪癖——本活体用例同此取态，才落在**确定无歧义**的形状上。
R=$(card '{"state":{"stage":"Question","hintCount":1,"attemptCount":2},"intent":"OFF_TOPIC"}')
BODY=$(printf '%s' "$R" | head -n1); CODE=$(printf '%s' "$R" | tail -n1)
[ "$CODE" = "200" ] && ok "OFF_TOPIC 自转移（Question）→ 200" || bad "OFF_TOPIC → $CODE :: $BODY"
ok_has "stage 与计数俱不变（Question 态下无怪癖）" "$BODY" '"stage":"Question"' '"hintCount":1' '"attemptCount":2'
R=$(card '{"state":{"stage":"Question","hintCount":3,"attemptCount":9},"intent":"ASK_CLARIFICATION"}')
ok_has "ASK_CLARIFICATION 同为自转移、不改计数" "$(printf '%s' "$R" | head -n1)" '"stage":"Question"' '"hintCount":3' '"attemptCount":9'
echo "  （附注：Hint 态下 OFF_TOPIC 会 +1 hintCount —— 原版既有怪癖，逐字保真未动，见上注）"

echo "== 7. 输入校验 400（缺 intent / 非法卡片态）=="
CODE=$(card '{}' | tail -n1)
[ "$CODE" = "400" ] && ok "缺 intent → 400" || bad "缺 intent → $CODE"
CODE=$(card '{"intent":"ASK_HINT","state":{"stage":"Nope","hintCount":0,"attemptCount":0}}' | tail -n1)
[ "$CODE" = "400" ] && ok "非法卡片态 stage → 400" || bad "非法 stage → $CODE"
CODE=$(card '{"intent":"NOT_AN_INTENT"}' | tail -n1)
[ "$CODE" = "400" ] && ok "非法 intent → 400" || bad "非法 intent → $CODE"

echo "== 8. 邻居能力未被本片波及（socratic.render 仍走插件、逐字保真）=="
R=$(soc '{"key":{"subject":"math","type":"fill","difficulty":"easy","stage":"hint"},"context":{"knowledgePoint":"勾股定理","studentLevel":"初二","attemptCount":1}}')
BODY=$(printf '%s' "$R" | head -n1); CODE=$(printf '%s' "$R" | tail -n1)
[ "$CODE" = "200" ] && ok "socratic/render → 200" || bad "socratic/render → $CODE :: $BODY"
ok_has "命中 math|fill 题型特化模板（填空题话术）" "$BODY" '填空题' '勾股定理'
R=$(soc '{"key":{"subject":"math","type":"fill","difficulty":"easy","stage":"hint"},"context":{"knowledgePoint":"勾股定理"}}')
CODE=$(printf '%s' "$R" | tail -n1); BODY=$(printf '%s' "$R" | head -n1)
# 口径订正：math|fill|hint 模板只引用 {knowledgePoint}（不缺变量）→ **200 是正确行为**（首轮我把这条写错了）。
[ "$CODE" = "200" ] && ok "fill/hint 模板只依赖 knowledgePoint → 缺 studentLevel 亦 200（模板本不引用它）" || bad "fill/hint → $CODE :: $BODY"
# 真·缺变量用例：切到**引用 {studentLevel}** 的 scaffold 模板，缺它才该报错。
R=$(soc '{"key":{"subject":"math","type":"fill","difficulty":"easy","stage":"scaffold"},"context":{"knowledgePoint":"勾股定理"}}')
CODE=$(printf '%s' "$R" | tail -n1); BODY=$(printf '%s' "$R" | head -n1)
[ "$CODE" = "400" ] && ok "缺变量（scaffold 模板引用了 studentLevel）→ 400（跨边界 name 判错，非 500）" || bad "缺变量 → $CODE :: $BODY"
ok_has "400 文案指向缺失变量 studentLevel" "$BODY" 'studentLevel'

echo "== 9. 未登录 → 401（端点仍受全局鉴权，未因迁移漏白名单）=="
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/api/tuition/agent/card/advance" \
  -H 'Content-Type: application/json' -d '{"intent":"ASK_SOLUTION"}')
[ "$CODE" = "401" ] && ok "无 token → 401（白名单未被意外放开）" || bad "无 token → $CODE"

echo
echo "活体 E2E：PASS=$PASS_CNT · FAIL=$FAIL_CNT"
[ "$FAIL_CNT" -eq 0 ]
