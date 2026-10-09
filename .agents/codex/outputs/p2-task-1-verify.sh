#!/usr/bin/env bash
# ============================================================================
# P2-T1 自动化验收：注册编排 → 登录 → external_id 映射校验 → 改密 → 注销
#
# 依赖运行中的容器：postgres / postgres-auth / auth-center / api。
# 宿主映射：api=3008, auth-center=3004（见 docker-compose.yml）。
#
# 用法： bash .agents/codex/outputs/p2-task-1-verify.sh
# 通过： 末尾打印「全绿：PASS=X FAIL=0」
# ============================================================================
set -uo pipefail

API_BASE="${API_BASE:-http://localhost:3008/api}"   # docker compose 宿主映射
AUTH_BASE="${AUTH_BASE:-http://localhost:3004/auth}"
API_HEALTH="${API_HEALTH:-http://localhost:3008/health}"
AUTH_HEALTH="${AUTH_HEALTH:-http://localhost:3004/health}"

PASS=0
FAIL=0
pass() { PASS=$((PASS+1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL+1)); echo "  ❌ $1"; }

# 断言 HTTP 状态码：assert_status <desc> <expected> <got>
assert_status() {
  local desc="$1" expected="$2" got="$3"
  if [ "$got" = "$expected" ]; then pass "$desc（HTTP $got）"; else fail "$desc（期望 $expected，实得 $got）"; fi
}

# 断言 2xx（NestJS POST 默认返回 201，故登录/改密按成功域断言）：assert_2xx <desc> <got>
assert_2xx() {
  local desc="$1" got="$2"
  case "$got" in 2??) pass "$desc（HTTP $got）" ;; *) fail "$desc（期望 2xx，实得 $got）" ;; esac
}

# 从 JWT 取 payload 某字段（base64url 解码；无 jq 依赖）
jwt_field() { # jwt_field <token> <field>
  local payload b64
  payload="$(printf '%s' "$1" | cut -d. -f2)"
  b64="$(printf '%s' "$payload" | tr '_-' '/+')"
  # 补齐 padding
  case $((${#b64} % 4)) in 2) b64="${b64}==" ;; 3) b64="${b64}=" ;; esac
  printf '%s' "$b64" | base64 -d 2>/dev/null | python3 -c "import sys,json;print(json.load(sys.stdin).get('$2',''))" 2>/dev/null
}

echo "== 0. 可达性探测 =="
curl -sf "$API_HEALTH" >/dev/null 2>&1 && pass "api 可达 $API_HEALTH" || { fail "api 不可达 $API_HEALTH（先 docker compose up -d）"; }
curl -sf "$AUTH_HEALTH" >/dev/null 2>&1 && pass "auth-center 可达 $AUTH_HEALTH" || fail "auth-center 不可达 $AUTH_HEALTH"
if [ "$FAIL" -gt 0 ]; then echo; echo "❌ 依赖不可达，中止。"; exit 1; fi

TS="$(date +%s)"
USER="p2t1_${TS}"
EMAIL="${USER}@example.com"
PASS1="password123"
PASS2="password456"

echo "== 1. 注册唯一新用户（期望 201）=="
REG_BODY="$(jq -nc --arg u "$USER" --arg e "$EMAIL" --arg p "$PASS1" '{username:$u,email:$e,password:$p,name:"P2 验收"}')"
REG_OUT="$(curl -s -w '\n%{http_code}' -X POST "$API_BASE/auth/register" -H 'Content-Type: application/json' -d "$REG_BODY")"
REG_CODE="$(printf '%s' "$REG_OUT" | tail -1)"
REG_JSON="$(printf '%s' "$REG_OUT" | sed '$d')"
assert_status "注册" "201" "$REG_CODE"
REG_UID="$(printf '%s' "$REG_JSON" | jq -r '.id // empty')"
[ -n "$REG_UID" ] && pass "注册返回 public.users.id=$REG_UID" || fail "注册未返回 users.id"

echo "== 2. 登录拿 accessToken（期望 200）=="
LOGIN_BODY="$(jq -nc --arg i "$EMAIL" --arg p "$PASS1" '{identifier:$i,password:$p}')"
LOGIN_OUT="$(curl -s -w '\n%{http_code}' -X POST "$AUTH_BASE/login" -H 'Content-Type: application/json' -d "$LOGIN_BODY")"
LOGIN_CODE="$(printf '%s' "$LOGIN_OUT" | tail -1)"
LOGIN_JSON="$(printf '%s' "$LOGIN_OUT" | sed '$d')"
assert_2xx "登录" "$LOGIN_CODE"
TOKEN="$(printf '%s' "$LOGIN_JSON" | jq -r '.accessToken // empty')"
[ -n "$TOKEN" ] && pass "拿到 accessToken" || fail "登录未返回 accessToken"

echo "== 3. 【关键】external_id 映射校验 =="
SUB="$(jwt_field "$TOKEN" sub)"
EXT="$(jwt_field "$TOKEN" external_id)"
echo "     sub=$SUB  external_id=$EXT  users.id=$REG_UID"
[ -n "$EXT" ] && pass "JWT external_id 非空" || fail "JWT external_id 落空（退化 sub）"
[ "$EXT" != "$SUB" ] && pass "external_id != sub" || fail "external_id 退化为 sub"
[ "$EXT" = "$REG_UID" ] && pass "external_id == public.users.id" || fail "external_id 与 users.id 不一致"

echo "== 4. GET /api/identity/me 带 token（期望 200，返回本人档案）=="
ME_OUT="$(curl -s -w '\n%{http_code}' "$API_BASE/identity/me" -H "Authorization: Bearer $TOKEN")"
ME_CODE="$(printf '%s' "$ME_OUT" | tail -1)"
ME_JSON="$(printf '%s' "$ME_OUT" | sed '$d')"
assert_status "读本人档案" "200" "$ME_CODE"
ME_UID="$(printf '%s' "$ME_JSON" | jq -r '.user.id // empty')"
[ "$ME_UID" = "$REG_UID" ] && pass "档案 user.id == external_id" || fail "档案 user.id($ME_UID) != external_id($REG_UID)"

echo "== 5. 改密（旧→新，期望 200）=="
PW_BODY="$(jq -nc --arg o "$PASS1" --arg n "$PASS2" '{oldPassword:$o,newPassword:$n}')"
PW_OUT="$(curl -s -w '\n%{http_code}' -X POST "$API_BASE/auth/password" -H 'Content-Type: application/json' -H "Authorization: Bearer $TOKEN" -d "$PW_BODY")"
PW_CODE="$(printf '%s' "$PW_OUT" | tail -1)"
assert_2xx "改密" "$PW_CODE"

echo "== 6. 新密登录 2xx / 旧密登录 401 =="
NEW_OUT="$(curl -s -w '\n%{http_code}' -X POST "$AUTH_BASE/login" -H 'Content-Type: application/json' -d "$(jq -nc --arg i "$EMAIL" --arg p "$PASS2" '{identifier:$i,password:$p}')")"
assert_2xx "新密登录" "$(printf '%s' "$NEW_OUT" | tail -1)"
OLD_OUT="$(curl -s -w '\n%{http_code}' -X POST "$AUTH_BASE/login" -H 'Content-Type: application/json' -d "$(jq -nc --arg i "$EMAIL" --arg p "$PASS1" '{identifier:$i,password:$p}')")"
assert_status "旧密登录（应拒）" "401" "$(printf '%s' "$OLD_OUT" | tail -1)"

echo "== 7. DELETE /api/identity/me（期望 200）=="
DEL_OUT="$(curl -s -w '\n%{http_code}' -X DELETE "$API_BASE/identity/me" -H "Authorization: Bearer $TOKEN")"
assert_status "注销" "200" "$(printf '%s' "$DEL_OUT" | tail -1)"

echo "== 8. 注销后再登录（期望 401）=="
AGAIN_OUT="$(curl -s -w '\n%{http_code}' -X POST "$AUTH_BASE/login" -H 'Content-Type: application/json' -d "$(jq -nc --arg i "$EMAIL" --arg p "$PASS2" '{identifier:$i,password:$p}')")"
assert_status "注销后再登录（应拒）" "401" "$(printf '%s' "$AGAIN_OUT" | tail -1)"

echo "== 9. 公开路由断言 =="
# register 无 token：合法新用户 → 201；缺参 → 400
R1_body="$(jq -nc --arg u "p2pub_${TS}" --arg e "p2pub_${TS}@example.com" --arg p "$PASS1" '{username:$u,email:$e,password:$p}')"
R1="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API_BASE/auth/register" -H 'Content-Type: application/json' -d "$R1_body")"
if [ "$R1" = "201" ] || [ "$R1" = "400" ]; then pass "register 公开（HTTP $R1）"; else fail "register 应公开可访问（实得 $R1）"; fi
R2="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API_BASE/auth/register" -H 'Content-Type: application/json' -d '{}')"
assert_status "register 缺参" "400" "$R2"
# password / me 无 token → 401
P1="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API_BASE/auth/password" -H 'Content-Type: application/json' -d '{"oldPassword":"x","newPassword":"yyyyyyyy"}')"
assert_status "password 无 token（应拒）" "401" "$P1"
M1="$(curl -s -o /dev/null -w '%{http_code}' "$API_BASE/identity/me")"
assert_status "identity/me 无 token（应拒）" "401" "$M1"

echo
if [ "$FAIL" -eq 0 ]; then
  echo "全绿：PASS=$PASS FAIL=0"
  exit 0
else
  echo "未全绿：PASS=$PASS FAIL=$FAIL"
  exit 1
fi
