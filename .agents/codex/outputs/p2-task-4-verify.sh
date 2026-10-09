#!/usr/bin/env bash
# ============================================================================
# P2-T4 自动化验收：food 评价 / 优惠券 / 商家后台
#
# 依赖运行中的容器：gri-postgres / gri-auth-center / gri-api。
# 宿主映射：api=3008, auth-center=3004（见 docker-compose.yml）。
#
# 前置纪律：改了 services/api/src/migrate/018_*.sql 后必须先
#   `cd services/api && npm run build && npm run migrate`（runner 读 dist/migrate/*.sql）。
# 本脚本第 0 步会显式校验迁移已落地，否则直接中止。
#
# 用法： bash .agents/codex/outputs/p2-task-4-verify.sh
# 通过： 末行打印「全绿：PASS=X FAIL=0」，FAIL>0 则非零退出。
# ============================================================================
set -uo pipefail

API_BASE="${API_BASE:-http://localhost:3008/api}"     # docker compose 宿主映射
AUTH_BASE="${AUTH_BASE:-http://localhost:3004/auth}"
API_HEALTH="${API_HEALTH:-http://localhost:3008/health}"
AUTH_HEALTH="${AUTH_HEALTH:-http://localhost:3004/health}"
PG_CONTAINER="${PG_CONTAINER:-gri-postgres}"
PG_DB="${PG_DB:-gri}"
PG_USER="${PG_USER:-postgres}"

PASS=0
FAIL=0
pass() { PASS=$((PASS+1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL+1)); echo "  ❌ $1"; }

# 断言 HTTP 状态码：assert_status <desc> <expected> <got>
assert_status() {
  local desc="$1" expected="$2" got="$3"
  if [ "$got" = "$expected" ]; then pass "$desc（HTTP $got）"; else fail "$desc（期望 $expected，实得 $got）"; fi
}

# 断言 2xx（NestJS POST 默认 201）：assert_2xx <desc> <got>
assert_2xx() {
  local desc="$1" got="$2"
  case "$got" in 2??) pass "$desc（HTTP $got）" ;; *) fail "$desc（期望 2xx，实得 $got）" ;; esac
}

# ---------------------------------------------------------------- psql 直连
psql_val() { docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAc "$1" 2>/dev/null; }
psql_run() { docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 -c "$1" >/dev/null 2>&1; }
# psql -tAc 会附带一行命令状态标签（如 INSERT 0 1），只取首行 UUID。
uuid() { head -n1 | tr -d '[:space:]'; }

# mkcoupon <code> <total> <claimed> <per_user_limit> <start_expr> <end_expr> <mutex|none>
# start_expr/end_expr 必须是合法 SQL 表达式（如 "NOW() - interval '1 day'" 或 NULL）。
mkcoupon() {
  local code="$1" total="$2" claimed="$3" limit="$4" start="$5" end="$6" mutex="$7"
  local mval; if [ "$mutex" = "none" ]; then mval="NULL"; else mval="'$mutex'"; fi
  psql_val "
    INSERT INTO public.coupons
      (code, name, discount_type, discount_value, min_amount,
       total_quantity, claimed_quantity, per_user_limit, start_at, end_at, mutex_group, status)
    VALUES
      ('$code', '验收券$code', 'fixed', 10, 0,
       $total, $claimed, $limit, $start, $end, $mval, 'active')
    RETURNING id" | uuid
}

# --------------------------------------------------------------- HTTP 助手
# req <METHOD> <URL> <TOKEN|-> <JSON|->
# 结果写全局：RESP_CODE / RESP_BODY
RESP_CODE=""
RESP_BODY=""
req() {
  local method="$1" url="$2" token="$3" data="$4"
  local args=(-s -w $'\n%{http_code}' -X "$method" "$url" -H 'Content-Type: application/json')
  [ "$token" != "-" ] && args+=(-H "Authorization: Bearer $token")
  [ "$data" != "-" ] && args+=(-d "$data")
  local out; out="$(curl "${args[@]}")"
  RESP_CODE="$(printf '%s' "$out" | tail -n1)"
  RESP_BODY="$(printf '%s' "$out" | sed '$d')"
}
jbody() { printf '%s' "$RESP_BODY" | jq -r "$1" 2>/dev/null; }

# 注册（经 api 编排）→ 返回 public.users.id；登录（经 auth-center）→ 返回 accessToken
reg() { req POST "$API_BASE/auth/register" - "$(jq -nc --arg u "$1" --arg e "$1@example.com" --arg p "password123" '{username:$u,email:$e,password:$p,name:$u}')"; jbody '.id // empty'; }
login() { req POST "$AUTH_BASE/login" - "$(jq -nc --arg i "$1" --arg p "password123" '{identifier:$i,password:$p}')"; jbody '.accessToken // empty'; }

echo "== 0. 依赖可达性 + 迁移落地校验 =="
curl -sf "$API_HEALTH" >/dev/null 2>&1 && pass "api 可达 $API_HEALTH" || fail "api 不可达 $API_HEALTH（先 docker compose up -d）"
curl -sf "$AUTH_HEALTH" >/dev/null 2>&1 && pass "auth-center 可达 $AUTH_HEALTH" || fail "auth-center 不可达 $AUTH_HEALTH"
if ! docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAc 'SELECT 1' >/dev/null 2>&1; then
  fail "无法连接 $PG_CONTAINER（docker exec psql 失败）"
fi

COL="$(psql_val "SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='restaurants' AND column_name='merchant_id'")"
[ "$COL" = "1" ] && pass "public.restaurants.merchant_id 列存在" || fail "缺列 restaurants.merchant_id（先 build+migrate）"

for t in reviews coupons coupon_claims; do
  EX="$(psql_val "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='$t'")"
  [ "$EX" = "1" ] && pass "public.$t 表存在" || fail "缺表 public.$t（先 build+migrate）"
done

if [ "$FAIL" -gt 0 ]; then
  echo
  echo "❌ 前置不满足（迁移未落地或依赖不可达），中止。"
  echo "未全绿：PASS=$PASS FAIL=$FAIL"
  exit 1
fi

# ---------------------------------------------------------------- 数据准备
TS="$(date +%s)"
U_A="p2t4_a_${TS}"; U_B="p2t4_b_${TS}"; U_M="p2t4_m_${TS}"; U_O="p2t4_o_${TS}"

echo "== 1. 注册 / 登录 4 个动态用户（A 普通 / B 普通 / M 商家 / O 运营）=="
A_UID="$(reg "$U_A")"; B_UID="$(reg "$U_B")"; M_UID="$(reg "$U_M")"; O_UID="$(reg "$U_O")"
A_TOKEN="$(login "$U_A")"; B_TOKEN="$(login "$U_B")"; M_TOKEN="$(login "$U_M")"; O_TOKEN="$(login "$U_O")"
for pair in "A:$A_UID" "B:$B_UID" "M:$M_UID" "O:$O_UID"; do
  [ -n "${pair#*:}" ] && pass "注册 ${pair%%:*} .id=${pair#*:}" || fail "注册 ${pair%%:*} 失败"
done
for pair in "A:$A_TOKEN" "B:$B_TOKEN" "M:$M_TOKEN" "O:$O_TOKEN"; do
  [ -n "${pair#*:}" ] && pass "登录 ${pair%%:*} 拿到 accessToken" || fail "登录 ${pair%%:*} 失败"
done
if [ -z "$A_TOKEN" ] || [ -z "$M_TOKEN" ]; then
  echo; echo "❌ 核心 token 缺失，中止。"; echo "未全绿：PASS=$PASS FAIL=$FAIL"; exit 1
fi

echo "== 2. 商家 M 建店 + 批量 upsert 菜品（自动挂 merchant_id=本人 externalId）=="
req POST "$API_BASE/food/merchant/restaurants" "$M_TOKEN" "$(jq -nc --arg n "验收餐厅${TS}" '{name:$n,address:"验收路 1 号"}')"
assert_2xx "M 创建餐厅" "$RESP_CODE"
RID="$(jbody '.id // empty')"
[ -n "$RID" ] && pass "餐厅 id=$RID" || fail "创建餐厅未返回 id"
[ "$(jbody '.merchant_id // empty')" = "$M_UID" ] && pass "餐厅 merchant_id 自动 = M.externalId" || fail "merchant_id 未自动归属"

req POST "$API_BASE/food/merchant/restaurants/$RID/dishes" "$M_TOKEN" \
  "$(jq -nc '{dishes:[{name:"宫保鸡丁",price:38.5,category:"热菜"},{name:"米饭",price:3,category:"主食"}]}')"
assert_2xx "M 批量 upsert 菜品" "$RESP_CODE"
DISH_ID="$(jbody '.[0].id // empty')"
[ -n "$DISH_ID" ] && pass "菜品 id=$DISH_ID" || fail "upsert 菜品未返回 id"
DISH_CNT_BEFORE="$(psql_val "SELECT COUNT(*) FROM public.dishes WHERE restaurant_id='$RID'")"

echo "== 3. 用户 A 下单 → 支付(mock) → 置 completed（评价前置语义）=="
req POST "$API_BASE/food/orders" "$A_TOKEN" \
  "$(jq -nc --arg r "$RID" --arg d "$DISH_ID" '{restaurantId:$r,items:[{dishId:$d,quantity:1}]}')"
assert_2xx "A 下单" "$RESP_CODE"
OID="$(jbody '.id // empty')"
[ "$(jbody '.status // empty')" = "pending" ] && pass "订单初始 status=pending" || fail "订单初始状态非 pending"

req POST "$API_BASE/food/payments/process" "$A_TOKEN" "$(jq -nc --arg o "$OID" '{orderId:$o,method:"mock"}')"
assert_2xx "A 支付（mock 即时收单）" "$RESP_CODE"

req POST "$API_BASE/food/orders/$OID/complete" "$A_TOKEN" -
assert_2xx "A 完成订单" "$RESP_CODE"
[ "$(jbody '.status // empty')" = "completed" ] && pass "订单 status=completed" || fail "订单未置 completed"

echo "== 4. 评价：本人已完成订单 → 201；重复 → 409；他人订单 → 403 =="
req POST "$API_BASE/food/orders/$OID/review" "$A_TOKEN" '{"rating":5,"content":"很好吃，配送快"}'
assert_2xx "A 评价自己已完成订单" "$RESP_CODE"
[ "$(jbody '.rating // empty')" = "5" ] && pass "评价落库 rating=5" || fail "评价未返回 rating=5"

req POST "$API_BASE/food/orders/$OID/review" "$A_TOKEN" '{"rating":4,"content":"重复"}'
assert_status "A 重复评价同单（一单一评）" "409" "$RESP_CODE"

req POST "$API_BASE/food/orders/$OID/review" "$B_TOKEN" '{"rating":1,"content":"越权"}'
assert_status "B 评价 A 的订单（越权）" "403" "$RESP_CODE"

echo "== 5. 评价校验：rating 越界 → 400；订单未 completed → 409 =="
req POST "$API_BASE/food/orders" "$A_TOKEN" \
  "$(jq -nc --arg r "$RID" --arg d "$DISH_ID" '{restaurantId:$r,items:[{dishId:$d,quantity:1}]}')"
OID2="$(jbody '.id // empty')"
req POST "$API_BASE/food/orders/$OID2/review" "$A_TOKEN" '{"rating":6,"content":"越界"}'
assert_status "rating=6 越界" "400" "$RESP_CODE"
req POST "$API_BASE/food/orders/$OID2/review" "$A_TOKEN" '{"rating":3,"content":"未完成"}'
assert_status "未 completed 订单评价" "409" "$RESP_CODE"

echo "== 6. 匿名读：GET 评价列表 / GET 优惠券列表 → 200 =="
req GET "$API_BASE/food/restaurants/$RID/reviews" - -
assert_status "匿名 GET 餐厅评价" "200" "$RESP_CODE"
printf '%s' "$RESP_BODY" | jq -e 'length > 0' >/dev/null 2>&1 \
  && pass "评价列表非空" || fail "评价列表为空（应含 A 的评价）"
printf '%s' "$RESP_BODY" | jq -e 'any(.[]; .content=="很好吃，配送快")' >/dev/null 2>&1 \
  && pass "评价列表含 A 的评价内容" || fail "评价列表未含 A 的评价内容"

req GET "$API_BASE/food/coupons" - -
assert_status "匿名 GET 优惠券列表" "200" "$RESP_CODE"

echo "== 7. 领券：A 领券 201 → 再领 409（per_user_limit）=="
C1="$(mkcoupon "p2t4c1_${TS}" 100 0 1 "NOW() - interval '1 day'" "NOW() + interval '30 day'" none)"
[ -n "$C1" ] && pass "种有效券 id=$C1" || fail "种有效券失败"
req POST "$API_BASE/food/coupons/claim" "$A_TOKEN" "$(jq -nc --arg c "$C1" '{couponId:$c}')"
assert_2xx "A 首次领券" "$RESP_CODE"
req POST "$API_BASE/food/coupons/claim" "$A_TOKEN" "$(jq -nc --arg c "$C1" '{couponId:$c}')"
assert_status "A 超 per_user_limit 再领" "409" "$RESP_CODE"

echo "== 8. 券规则：耗尽券 / 过期券 → 400|404；互斥组 → 409 =="
C_EXH="$(mkcoupon "p2t4exh_${TS}" 1 1 1 "NOW() - interval '1 day'" "NOW() + interval '30 day'" none)"
req POST "$API_BASE/food/coupons/claim" "$A_TOKEN" "$(jq -nc --arg c "$C_EXH" '{couponId:$c}')"
case "$RESP_CODE" in 400|404) pass "耗尽券被拒（HTTP $RESP_CODE）" ;; *) fail "耗尽券应 400/404，实得 $RESP_CODE" ;; esac

C_EXP="$(mkcoupon "p2t4exp_${TS}" 100 0 1 "NOW() - interval '10 day'" "NOW() - interval '1 day'" none)"
req POST "$API_BASE/food/coupons/claim" "$A_TOKEN" "$(jq -nc --arg c "$C_EXP" '{couponId:$c}')"
case "$RESP_CODE" in 400|404) pass "过期券被拒（HTTP $RESP_CODE）" ;; *) fail "过期券应 400/404，实得 $RESP_CODE" ;; esac

MG="p2t4mx_${TS}"
C_M1="$(mkcoupon "p2t4m1_${TS}" 100 0 1 "NOW() - interval '1 day'" "NOW() + interval '30 day'" "$MG")"
C_M2="$(mkcoupon "p2t4m2_${TS}" 100 0 1 "NOW() - interval '1 day'" "NOW() + interval '30 day'" "$MG")"
req POST "$API_BASE/food/coupons/claim" "$B_TOKEN" "$(jq -nc --arg c "$C_M1" '{couponId:$c}')"
assert_2xx "B 领互斥组第一张" "$RESP_CODE"
req POST "$API_BASE/food/coupons/claim" "$B_TOKEN" "$(jq -nc --arg c "$C_M2" '{couponId:$c}')"
assert_status "B 领同互斥组第二张（应拒）" "409" "$RESP_CODE"

echo "== 9. 商家归属：M 列表仅见名下；操作他店 → 403 =="
req POST "$API_BASE/food/merchant/restaurants" "$B_TOKEN" "$(jq -nc --arg n "B餐厅${TS}" '{name:$n,address:"B路 2 号"}')"
RB="$(jbody '.id // empty')"
[ -n "$RB" ] && pass "B 建第二家餐厅 id=$RB" || fail "B 建店失败"
req POST "$API_BASE/food/merchant/restaurants/$RB/dishes" "$B_TOKEN" \
  "$(jq -nc '{dishes:[{name:"B招牌菜",price:20}]}')"
RB_DISH="$(jbody '.[0].id // empty')"
[ -n "$RB_DISH" ] && pass "B 餐厅菜品 id=$RB_DISH" || fail "B 建菜品失败"

req GET "$API_BASE/food/merchant/restaurants" "$M_TOKEN" -
assert_status "M 列名下餐厅" "200" "$RESP_CODE"
printf '%s' "$RESP_BODY" | jq -e --arg r "$RID" 'any(.[]; .id==$r)' >/dev/null 2>&1 \
  && pass "M 列表含名下餐厅" || fail "M 列表缺名下餐厅"
printf '%s' "$RESP_BODY" | jq -e --arg r "$RB" 'all(.[]; .id!=$r)' >/dev/null 2>&1 \
  && pass "M 列表不含他人餐厅" || fail "M 列表泄漏他人餐厅"

req PUT "$API_BASE/food/merchant/restaurants/$RB" "$M_TOKEN" '{"name":"越权改名"}'
assert_status "M 改他店（归属校验）" "403" "$RESP_CODE"
req PUT "$API_BASE/food/merchant/restaurants/$RID" "$M_TOKEN" '{"name":"我店改名"}'
assert_2xx "M 改自己店" "$RESP_CODE"

echo "== 10. 批量 upsert 事务：非法归属 → 400 且回滚（原数据不变）=="
req POST "$API_BASE/food/merchant/restaurants/$RID/dishes" "$M_TOKEN" \
  "$(jq -nc --arg d "$RB_DISH" '{dishes:[{name:"应被回滚的新菜",price:9},{id:$d,name:"偷菜",price:9}]}')"
case "$RESP_CODE" in 400|403) pass "非法归属菜品被拒（HTTP $RESP_CODE）" ;; *) fail "非法归属菜品应 400/403，实得 $RESP_CODE" ;; esac
DISH_CNT_AFTER="$(psql_val "SELECT COUNT(*) FROM public.dishes WHERE restaurant_id='$RID'")"
[ "$DISH_CNT_AFTER" = "$DISH_CNT_BEFORE" ] && pass "事务回滚：菜品数不变（$DISH_CNT_AFTER）" || fail "事务未回滚：$DISH_CNT_BEFORE → $DISH_CNT_AFTER"
LEFT="$(psql_val "SELECT COUNT(*) FROM public.dishes WHERE name='应被回滚的新菜'")"
[ "$LEFT" = "0" ] && pass "回滚后无残留新菜" || fail "回滚失败：残留新菜 $LEFT 行"

echo "== 11. 商家订单管理：M 订单列表/统计按归属过滤 =="
req GET "$API_BASE/food/merchant/orders" "$M_TOKEN" -
assert_status "M 列名下订单" "200" "$RESP_CODE"
printf '%s' "$RESP_BODY" | jq -e --arg o "$OID" 'any(.[]; .id==$o)' >/dev/null 2>&1 \
  && pass "M 订单列表含本店订单" || fail "M 订单列表缺本店订单"
req GET "$API_BASE/food/merchant/orders/stats" "$M_TOKEN" -
assert_status "M 订单统计" "200" "$RESP_CODE"
[ "$(jbody '.total // empty')" != "" ] && pass "统计含 total=$(jbody '.total')" || fail "统计无 total"

echo "== 12. 运营 O（根组织 owner）跨店读/管 → 200 =="
ROOT_ID="$(psql_val "SELECT id FROM tenant.organizations WHERE parent_id IS NULL ORDER BY created_at, id LIMIT 1" | uuid)"
if [ -z "$ROOT_ID" ]; then
  fail "无根组织（tenant.organizations 空，先跑 seed）"
else
  psql_run "INSERT INTO tenant.organization_members (organization_id, user_id, role, status)
            VALUES ('$ROOT_ID','$O_UID','owner','active')
            ON CONFLICT (organization_id, user_id) DO UPDATE SET role='owner', status='active'" \
    && pass "O 挂根组织 owner" || fail "O 挂根组织失败"
fi

req GET "$API_BASE/food/merchant/restaurants" "$O_TOKEN" -
assert_status "O 列全部餐厅" "200" "$RESP_CODE"
printf '%s' "$RESP_BODY" | jq -e --arg a "$RID" --arg b "$RB" 'any(.[]; .id==$a) and any(.[]; .id==$b)' >/dev/null 2>&1 \
  && pass "O 可见跨店（含 M 店与 B 店）" || fail "O 未看到全部餐厅"

req GET "$API_BASE/food/merchant/orders" "$O_TOKEN" -
assert_status "O 列全部订单" "200" "$RESP_CODE"
req PUT "$API_BASE/food/merchant/restaurants/$RB" "$O_TOKEN" '{"name":"运营改名"}'
assert_2xx "O 跨店管理（改 B 店）" "$RESP_CODE"

echo
if [ "$FAIL" -eq 0 ]; then
  echo "全绿：PASS=$PASS FAIL=0"
  exit 0
else
  echo "未全绿：PASS=$PASS FAIL=$FAIL"
  exit 1
fi
