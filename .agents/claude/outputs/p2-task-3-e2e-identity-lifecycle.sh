#!/usr/bin/env bash
# ============================================================================
# P2-T3 统一端到端脚本：身份全生命周期 + `external_id ≡ users.id` 契约（T1 + T2 整合）
#
# 结构（增量整合，非重写）：
#   §0 可达性/迁移预检
#   §T3 身份全生命周期 + 契约锚（本卡新增，逐条覆盖 6 条硬性契约断言）
#   §T1 复用 .agents/codex/outputs/p2-task-1-verify.sh（注册→登录→external_id映射→改密→注销）
#   §T2 复用 .agents/codex/outputs/p2-task-2-verify.sh（运营面 role/status/列表 + 越权边界）
#
# 说明：T2 脚本的 G3 会再跑一次 T1（回归保险），故 T1 覆盖为「显式 + 隐式」双份，无害。
#
# 依赖运行中的容器：gri-postgres / gri-postgres-auth / gri-auth-center / gri-api。
# 宿主映射：api=3008, auth-center=3004。
#
# 用法： bash .agents/claude/outputs/p2-task-3-e2e-identity-lifecycle.sh
# 通过： 末尾打印「PASS=<n> FAIL=0 VERIFY_EXIT=0」
# ============================================================================
set -uo pipefail

API_BASE="${API_BASE:-http://localhost:3008/api}"
AUTH_BASE="${AUTH_BASE:-http://localhost:3004/auth}"
API_HEALTH="${API_HEALTH:-http://localhost:3008/health}"
AUTH_HEALTH="${AUTH_HEALTH:-http://localhost:3004/health}"

PG_CONTAINER="${PG_CONTAINER:-gri-postgres}"
PG_DB="${PG_DB:-gri}"
PG_USER="${PG_USER:-postgres}"
AUTH_PG_CONTAINER="${AUTH_PG_CONTAINER:-gri-postgres-auth}"
AUTH_PG_DB="${AUTH_PG_DB:-gri_auth}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
T1_SCRIPT="$ROOT_DIR/.agents/codex/outputs/p2-task-1-verify.sh"
T2_SCRIPT="$ROOT_DIR/.agents/codex/outputs/p2-task-2-verify.sh"

OP_IDENTIFIER="${TEST_IDENTIFIER:-testuser}"
OP_PASSWORD="${TEST_PASSWORD:-test1234}"

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); printf 'PASS  %s\n' "$1"; }
fail() { FAIL=$((FAIL + 1)); printf 'FAIL  %s\n' "$1"; }

assert_status() {
  local desc="$1" expected="$2" got="$3"
  if [ "$got" = "$expected" ]; then pass "$desc (HTTP $got)"; else fail "$desc (expected $expected, got $got)"; fi
}
assert_2xx() {
  local desc="$1" got="$2"
  case "$got" in 2??) pass "$desc (HTTP $got)" ;; *) fail "$desc (expected 2xx, got $got)" ;; esac
}
assert_http_in() { # assert_http_in <desc> <"a b c"> <got>
  local desc="$1" allow="$2" got="$3" a
  for a in $allow; do [ "$got" = "$a" ] && { pass "$desc (HTTP $got)"; return; }; done
  fail "$desc (expected one of [$allow], got $got)"
}

RESP_CODE=""
RESP_BODY=""
req() {
  local method="$1" url="$2" token="$3" data="$4"
  local args=(-sS -w $'\n%{http_code}' -X "$method" "$url" -H 'Content-Type: application/json')
  [ "$token" != "-" ] && args+=(-H "Authorization: Bearer $token")
  [ "$data" != "-" ] && args+=(-d "$data")
  local out
  out="$(curl "${args[@]}" 2>/dev/null)"
  RESP_CODE="$(printf '%s' "$out" | tail -n1)"
  RESP_BODY="$(printf '%s' "$out" | sed '$d')"
}
jbody() { printf '%s' "$RESP_BODY" | jq -r "$1" 2>/dev/null; }

jwt_field() { # jwt_field <token> <field>
  local payload b64
  payload="$(printf '%s' "$1" | cut -d. -f2)"
  b64="$(printf '%s' "$payload" | tr '_-' '/+')"
  case $((${#b64} % 4)) in 2) b64="${b64}==" ;; 3) b64="${b64}=" ;; esac
  printf '%s' "$b64" | base64 -d 2>/dev/null \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('$2',''))" 2>/dev/null
}

psql_val()      { docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAc "$1" 2>/dev/null; }
psql_run()      { docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 -c "$1" >/dev/null 2>&1; }
auth_psql_val() { docker exec "$AUTH_PG_CONTAINER" psql -U "$PG_USER" -d "$AUTH_PG_DB" -tAc "$1" 2>/dev/null; }
uuid()          { head -n1 | tr -d '[:space:]'; }          # UUID 卫生：必清洗换行/空白（T4 教训）
rand_uuid()     { cat /proc/sys/kernel/random/uuid; }

reg() { # reg <username> <name> → 打印 public.users.id
  local username="$1" name="$2"
  req POST "$API_BASE/auth/register" - \
    "$(jq -nc --arg u "$username" --arg e "${username}@example.com" --arg p 'password123' --arg n "$name" \
      '{username:$u,email:$e,password:$p,name:$n}')"
  jbody '.id // empty'
}
LOGIN_CODE=""
LOGIN_TOKEN=""
auth_login() {
  local identifier="$1" password="$2"
  req POST "$AUTH_BASE/login" - \
    "$(jq -nc --arg i "$identifier" --arg p "$password" '{identifier:$i,password:$p}')"
  LOGIN_CODE="$RESP_CODE"
  LOGIN_TOKEN="$(jbody '.accessToken // empty')"
}

run_suite() { # run_suite <name> <script> —— 复用既有 e2e，聚合其 PASS/FAIL
  local name="$1" script="$2" out rc sp sf
  if [ ! -f "$script" ]; then fail "$name suite missing: $script"; return; fi
  out="$(bash "$script" 2>&1)"; rc=$?
  sp="$(printf '%s' "$out" | grep -oE 'PASS=[0-9]+' | tail -n1 | cut -d= -f2)"; sp="${sp:-0}"
  sf="$(printf '%s' "$out" | grep -oE 'FAIL=[0-9]+' | tail -n1 | cut -d= -f2)"; sf="${sf:-0}"
  PASS=$((PASS + sp)); FAIL=$((FAIL + sf))
  if [ "$rc" -eq 0 ] && [ "$sf" -eq 0 ]; then
    printf 'SUITE  %s: %s assertions merged (rc=0)\n' "$name" "$sp"
  else
    fail "$name suite failed (rc=$rc PASS=$sp FAIL=$sf)"
    printf '%s\n' "$out" | grep -E '^(FAIL|  ❌|❌)' | head -n 10 || true
  fi
}

# ---------------------------------------------------------------------------
echo "== §0. 可达性 + 迁移预检 =="
curl -sf "$API_HEALTH"  >/dev/null 2>&1 && pass "api reachable $API_HEALTH"  || fail "api unreachable: $API_HEALTH"
curl -sf "$AUTH_HEALTH" >/dev/null 2>&1 && pass "auth-center reachable"      || fail "auth-center unreachable: $AUTH_HEALTH"
CK_ROLE="$(psql_val "SELECT 1 FROM pg_constraint WHERE conname='ck_users_role'" | uuid)"
[ "$CK_ROLE" = "1" ] && pass "ck_users_role constraint present" || fail "ck_users_role missing (build+migrate first)"
if [ "$FAIL" -gt 0 ]; then echo; echo "❌ 依赖不可达，中止。"; echo "PASS=$PASS FAIL=$FAIL VERIFY_EXIT=1"; exit 1; fi

# ---------------------------------------------------------------------------
echo "== §T3. 身份全生命周期 + 契约锚（external_id ≡ users.id ≡ students.user_id）=="
NONCE="$(date +%s)_${RANDOM}${RANDOM}"
L_USER="p2t3_life_${NONCE}"
L_PASS='password123'

# --- 契约断言 1：注册 → public.users 建行；identities.external_id == users.id ---
L_UID="$(reg "$L_USER" 'P2 T3 Lifecycle')"
if [ -n "$L_UID" ]; then pass "T3.1 register returns public.users.id=$L_UID"; else fail "T3.1 register returned no users.id"; fi
USERS_ROW="$(psql_val "SELECT id FROM public.users WHERE id='$L_UID'" | uuid)"
[ "$USERS_ROW" = "$L_UID" ] && pass "T3.1 public.users row persisted" || fail "T3.1 users row not found for $L_UID"
L_EXT_DB="$(auth_psql_val "SELECT external_id FROM identities WHERE external_id='$L_UID'" | uuid)"
[ "$L_EXT_DB" = "$L_UID" ] && pass "T3.1 identities.external_id == users.id (cross-db)" || fail "T3.1 identities.external_id=$L_EXT_DB != users.id=$L_UID"

# --- 契约断言 2：登录 JWT：sub = identity.id；externalId = users.id；且 externalId != sub ---
auth_login "$L_USER" "$L_PASS"
assert_2xx "T3.2 login issues token" "$LOGIN_CODE"
L_TOKEN="$LOGIN_TOKEN"
SUB="$(jwt_field "$L_TOKEN" sub)"
EXT="$(jwt_field "$L_TOKEN" external_id)"
IDENT_ID="$(auth_psql_val "SELECT id FROM identities WHERE external_id='$L_UID'" | uuid)"
echo "     sub=$SUB  external_id=$EXT  identities.id=$IDENT_ID  users.id=$L_UID"
[ -n "$SUB" ] && pass "T3.2 JWT.sub present" || fail "T3.2 JWT.sub empty"
[ -n "$EXT" ] && pass "T3.2 JWT.external_id present" || fail "T3.2 JWT.external_id empty (degraded to sub)"
[ "$SUB" = "$IDENT_ID" ] && pass "T3.2 JWT.sub == identities.id" || fail "T3.2 JWT.sub($SUB) != identities.id($IDENT_ID)"
[ "$EXT" = "$L_UID" ] && pass "T3.2 JWT.external_id == public.users.id" || fail "T3.2 external_id($EXT) != users.id($L_UID)"
# --- 契约断言 6（反例锚点）：external_id 不得等于 sub ---
if [ -n "$SUB" ] && [ -n "$EXT" ] && [ "$EXT" != "$SUB" ]; then
  pass "T3.6 ANCHOR: external_id != sub (未退化为 identity.id)"
else
  fail "T3.6 ANCHOR VIOLATION: external_id == sub（旧 bug 回潮：身份退化为 identity.id）"
fi
ROLES_CLAIM="$(jwt_field "$L_TOKEN" roles)"
[ "$ROLES_CLAIM" = "[]" ] && pass "T3.2 JWT.roles stays [] (授权不依赖 roles)" || fail "T3.2 JWT.roles non-empty: $ROLES_CLAIM"

# --- 契约断言 3：GET /api/identity/me 返回 user.id == externalId ---
req GET "$API_BASE/identity/me" "$L_TOKEN" -
assert_status "T3.3 /me with token" "200" "$RESP_CODE"
ME_UID="$(jbody '.user.id // empty')"
[ "$ME_UID" = "$EXT" ] && pass "T3.3 /me user.id == external_id" || fail "T3.3 /me user.id($ME_UID) != external_id($EXT)"
req GET "$API_BASE/identity/me" - -
assert_status "T3.3 /me without token rejected" "401" "$RESP_CODE"
req GET "$API_BASE/identity/me" "not.a.valid.jwt" -
assert_status "T3.3 /me with bad token rejected" "401" "$RESP_CODE"

# --- 契约断言 4：student 时 edu.students.user_id == 同一 externalId（三表贯通）---
auth_login "$OP_IDENTIFIER" "$OP_PASSWORD"
assert_2xx "T3.4 operator login (testuser)" "$LOGIN_CODE"
OP_TOKEN="$LOGIN_TOKEN"
req PATCH "$API_BASE/identity/$L_UID/role" "$OP_TOKEN" '{"role":"student"}'
assert_status "T3.4 operator sets target role=student" "200" "$RESP_CODE"
psql_run "INSERT INTO edu.students (user_id, name, grade) VALUES ('$L_UID', 'P2 T3 Student', 7)
          ON CONFLICT (user_id) DO UPDATE SET name=EXCLUDED.name, grade=EXCLUDED.grade" \
  && pass "T3.4 edu.students extension seeded" || fail "T3.4 edu.students seed failed"
req GET "$API_BASE/identity/me" "$L_TOKEN" -
assert_status "T3.4 /me returns student profile" "200" "$RESP_CODE"
ST_UID="$(jbody '.student.user_id // empty')"
[ "$ST_UID" = "$EXT" ] && pass "T3.4 /me student.user_id == external_id" || fail "T3.4 student.user_id($ST_UID) != external_id($EXT)"
ST_DB="$(psql_val "SELECT user_id FROM edu.students WHERE user_id='$L_UID'" | uuid)"
[ "$ST_DB" = "$EXT" ] && pass "T3.4 three-table linkage: users.id == students.user_id" || fail "T3.4 students.user_id($ST_DB) != users.id($L_UID)"

# --- 契约断言 5：伪造 externalId / 读他人档案 → 403（IDOR 防护）---
A_USER="p2t3_atk_${NONCE}"
A_UID="$(reg "$A_USER" 'P2 T3 Attacker')"
[ -n "$A_UID" ] && pass "T3.5 attacker registered" || fail "T3.5 attacker registration failed"
auth_login "$A_USER" "$L_PASS"
assert_2xx "T3.5 attacker login" "$LOGIN_CODE"
A_TOKEN="$LOGIN_TOKEN"
req GET "$API_BASE/identity/$L_UID" "$A_TOKEN" -
assert_http_in "T3.5 non-operator reads other's profile blocked" "403 404" "$RESP_CODE"
req GET "$API_BASE/identity/$(rand_uuid)" "$A_TOKEN" -
assert_http_in "T3.5 non-operator reads random externalId blocked" "403 404" "$RESP_CODE"
req GET "$API_BASE/identity/$L_UID" - -
assert_status "T3.5 anonymous reads other's profile blocked" "401" "$RESP_CODE"
# 攻击者读自己 → 允许（本人恒放行，证明 403 来自他人判定而非一律拒绝）
req GET "$API_BASE/identity/$A_UID" "$A_TOKEN" -
assert_status "T3.5 self profile still readable (sanity)" "200" "$RESP_CODE"

# ---------------------------------------------------------------------------
echo "== §T1. 复用 T1 端到端（注册→登录→映射→改密→注销）=="
run_suite "p2-task-1" "$T1_SCRIPT"

echo "== §T2. 复用 T2 端到端（运营面 role/status/列表 + 越权边界）=="
run_suite "p2-task-2" "$T2_SCRIPT"

# ---------------------------------------------------------------------------
echo
if [ "$FAIL" -eq 0 ]; then
  echo "PASS=$PASS FAIL=0 VERIFY_EXIT=0"
  exit 0
else
  echo "PASS=$PASS FAIL=$FAIL VERIFY_EXIT=1"
  exit 1
fi
