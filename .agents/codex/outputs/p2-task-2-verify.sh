#!/usr/bin/env bash
# ============================================================================
# P2-T2 identity operator management e2e verification.
#
# Covers authorization, self-protection, validation, status linkage, list
# semantics, cascade/no-side-effect checks, and T1 regression.
#
# Usage: bash .agents/codex/outputs/p2-task-2-verify.sh
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
AUTH_CONTAINER="${AUTH_CONTAINER:-gri-auth-center}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
T1_SCRIPT="$ROOT_DIR/.agents/codex/outputs/p2-task-1-verify.sh"
PUBLIC_ROUTES="$ROOT_DIR/services/api/src/auth/public-routes.ts"

OP_IDENTIFIER="${TEST_IDENTIFIER:-testuser}"
OP_PASSWORD="${TEST_PASSWORD:-test1234}"

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); printf 'PASS  %s\n' "$1"; }
fail() { FAIL=$((FAIL + 1)); printf 'FAIL  %s\n' "$1"; }

assert_status() {
  local desc="$1" expected="$2" got="$3"
  if [ "$got" = "$expected" ]; then
    pass "$desc (HTTP $got)"
  else
    fail "$desc (expected $expected, got $got)"
  fi
}

assert_2xx() {
  local desc="$1" got="$2"
  case "$got" in
    2??) pass "$desc (HTTP $got)" ;;
    *) fail "$desc (expected 2xx, got $got)" ;;
  esac
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

jbody() {
  printf '%s' "$RESP_BODY" | jq -r "$1" 2>/dev/null
}

jwt_field() {
  local payload b64
  payload="$(printf '%s' "$1" | cut -d. -f2)"
  b64="$(printf '%s' "$payload" | tr '_-' '/+')"
  case $((${#b64} % 4)) in
    2) b64="${b64}==" ;;
    3) b64="${b64}=" ;;
  esac
  printf '%s' "$b64" | base64 -d 2>/dev/null \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('$2',''))" 2>/dev/null
}

psql_val() {
  docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tAc "$1" 2>/dev/null
}
psql_run() {
  docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 -c "$1" >/dev/null 2>&1
}
psql_must_fail() {
  ! docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1 -c "$1" >/dev/null 2>&1
}
auth_psql_val() {
  docker exec "$AUTH_PG_CONTAINER" psql -U "$PG_USER" -d "$AUTH_PG_DB" -tAc "$1" 2>/dev/null
}
uuid() {
  head -n1 | tr -d '[:space:]'
}

reg() {
  local username="$1" name="$2"
  req POST "$API_BASE/auth/register" - \
    "$(jq -nc --arg u "$username" --arg e "${username}@example.com" --arg p 'password123' --arg n "$name" \
      '{username:$u,email:$e,password:$p,name:$n}')"
  jbody '.id // empty'
}

auth_login() {
  local identifier="$1" password="$2"
  req POST "$AUTH_BASE/login" - \
    "$(jq -nc --arg i "$identifier" --arg p "$password" '{identifier:$i,password:$p}')"
  LOGIN_CODE="$RESP_CODE"
  LOGIN_TOKEN="$(jbody '.accessToken // empty')"
}

wait_for_auth() {
  local i
  for i in $(seq 1 30); do
    if curl -sf "$AUTH_HEALTH" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

AUTH_STOPPED=0
restore_auth_center() {
  if [ "$AUTH_STOPPED" -eq 1 ]; then
    docker start "$AUTH_CONTAINER" >/dev/null 2>&1 || true
    wait_for_auth >/dev/null 2>&1 || true
    AUTH_STOPPED=0
  fi
}
trap restore_auth_center EXIT INT TERM

echo "== 0. availability and migration preflight =="
curl -sf "$API_HEALTH" >/dev/null 2>&1 && pass "api reachable" || fail "api unreachable: $API_HEALTH"
curl -sf "$AUTH_HEALTH" >/dev/null 2>&1 && pass "auth-center reachable" || fail "auth-center unreachable: $AUTH_HEALTH"
CK_ROLE="$(psql_val "SELECT 1 FROM pg_constraint WHERE conname='ck_users_role'" | uuid)"
[ "$CK_ROLE" = "1" ] && pass "ck_users_role constraint exists" || fail "ck_users_role missing; run build+migrate first"
if [ "$FAIL" -gt 0 ]; then
  VERIFY_EXIT=1
  echo "PASS=$PASS FAIL=$FAIL VERIFY_EXIT=$VERIFY_EXIT"
  exit "$VERIFY_EXIT"
fi

echo "== 1. prepare operator and disposable identities =="
auth_login "$OP_IDENTIFIER" "$OP_PASSWORD"
assert_2xx "operator login" "$LOGIN_CODE"
OP_TOKEN="$LOGIN_TOKEN"
OP_UID="$(jwt_field "$OP_TOKEN" external_id)"
[ -n "$OP_UID" ] && pass "operator external_id resolved" || fail "operator external_id missing"

TS="$(date +%s)"
N_USER="p2t2_n_${TS}"
T_USER="p2t2_t_${TS}"
D_USER="p2t2_d_${TS}"
E_USER="p2t2_e_${TS}"
S_USER="p2t2_s_${TS}"
ST_USER="p2t2_st_${TS}"
Q_USER="p2t2_q_${TS}"
Q_NAME="P2 Query Name ${TS}"

N_UID="$(reg "$N_USER" 'P2 Normal')"
T_UID="$(reg "$T_USER" 'P2 Target')"
D_UID="$(reg "$D_USER" 'P2 Deleted')"
E_UID="$(reg "$E_USER" 'P2 Failure')"
S_UID="$(reg "$S_USER" 'P2 Suspended')"
ST_UID="$(reg "$ST_USER" 'P2 Student')"
Q_UID="$(reg "$Q_USER" "$Q_NAME")"
for pair in "normal:$N_UID" "target:$T_UID" "deleted:$D_UID" "failure:$E_UID" "suspended:$S_UID" "student:$ST_UID" "query:$Q_UID"; do
  [ -n "${pair#*:}" ] && pass "registered ${pair%%:*}" || fail "register ${pair%%:*} failed"
done

auth_login "$N_USER" 'password123'
assert_2xx "normal user login" "$LOGIN_CODE"
N_TOKEN="$LOGIN_TOKEN"

auth_login "$D_USER" 'password123'
assert_2xx "delete target login" "$LOGIN_CODE"
D_TOKEN="$LOGIN_TOKEN"

auth_login "$ST_USER" 'password123'
assert_2xx "student target login" "$LOGIN_CODE"
ST_TOKEN="$LOGIN_TOKEN"

echo "== 2. authorization A1-A7 =="
req GET "$API_BASE/identity" - -
assert_status "A1 list without token" "401" "$RESP_CODE"

req GET "$API_BASE/identity" "$N_TOKEN" -
assert_status "A2 list as non-operator" "403" "$RESP_CODE"
if printf '%s' "$RESP_BODY" | jq -e 'has("items")' >/dev/null 2>&1; then
  fail "A2 non-operator response leaked items"
else
  pass "A2 non-operator response has no items"
fi

req GET "$API_BASE/identity?pageSize=1" "$OP_TOKEN" -
assert_status "A3 list as operator" "200" "$RESP_CODE"

ROLES_CLAIM="$(jwt_field "$OP_TOKEN" roles)"
[ "$ROLES_CLAIM" = "[]" ] && pass "A4 JWT roles stays empty" || fail "A4 JWT roles non-empty: $ROLES_CLAIM"

req PATCH "$API_BASE/identity/$T_UID/role" "$N_TOKEN" '{"role":"merchant"}'
assert_status "A5 non-operator role update" "403" "$RESP_CODE"
req PATCH "$API_BASE/identity/$T_UID/status" "$N_TOKEN" '{"status":"suspended"}'
assert_status "A5 non-operator status update" "403" "$RESP_CODE"
T_STATE="$(psql_val "SELECT role || '|' || status FROM public.users WHERE id='$T_UID'" | uuid)"
[ "$T_STATE" = "consumer|active" ] && pass "A5 non-operator produced no side effect" || fail "A5 target changed: $T_STATE"

req PATCH "$API_BASE/identity/$T_UID/role?actorId=actor-fake&externalId=actor-fake" "$OP_TOKEN" \
  '{"role":"merchant","actorId":"actor-fake","externalId":"actor-fake"}'
assert_status "A6 forged actor cannot replace req.auth.externalId" "200" "$RESP_CODE"
T_ROLE="$(psql_val "SELECT role FROM public.users WHERE id='$T_UID'" | uuid)"
[ "$T_ROLE" = "merchant" ] && pass "A6 operator action used real token actor" || fail "A6 target role: $T_ROLE"

req GET "$API_BASE/identity/$OP_UID" "$OP_TOKEN" -
assert_status "A7 operator reads self" "200" "$RESP_CODE"
req GET "$API_BASE/identity/$T_UID" "$N_TOKEN" -
assert_status "A7 non-operator reads other" "403" "$RESP_CODE"
req GET "$API_BASE/identity/$T_UID" "$OP_TOKEN" -
assert_status "A7 operator reads other" "200" "$RESP_CODE"

echo "== 3. self-protection B1-B3 =="
req PATCH "$API_BASE/identity/$OP_UID/role" "$OP_TOKEN" '{"role":"consumer"}'
assert_status "B1 operator changes own role" "403" "$RESP_CODE"
OP_ROLE="$(psql_val "SELECT role FROM public.users WHERE id='$OP_UID'" | uuid)"
[ "$OP_ROLE" != "consumer" ] && pass "B1 operator role unchanged" || fail "B1 operator role changed"

req PATCH "$API_BASE/identity/$OP_UID/status" "$OP_TOKEN" '{"status":"suspended"}'
assert_status "B2 operator changes own status" "403" "$RESP_CODE"
OP_STATUS="$(psql_val "SELECT status FROM public.users WHERE id='$OP_UID'" | uuid)"
[ "$OP_STATUS" = "active" ] && pass "B2 operator status unchanged" || fail "B2 operator status: $OP_STATUS"

req PATCH "$API_BASE/identity/$T_UID/role" "$OP_TOKEN" '{"role":"student"}'
assert_status "B3 operator changes other role" "200" "$RESP_CODE"

echo "== 4. validation C1-C5 =="
req PATCH "$API_BASE/identity/$T_UID/role" "$OP_TOKEN" '{}'
assert_status "C1 missing role" "400" "$RESP_CODE"
req PATCH "$API_BASE/identity/$T_UID/role" "$OP_TOKEN" '{"role":"superadmin"}'
assert_status "C1 invalid role" "400" "$RESP_CODE"
req PATCH "$API_BASE/identity/$T_UID/status" "$OP_TOKEN" '{}'
assert_status "C2 missing status" "400" "$RESP_CODE"
req PATCH "$API_BASE/identity/$T_UID/status" "$OP_TOKEN" '{"status":"banned"}'
assert_status "C2 invalid status" "400" "$RESP_CODE"
req PATCH "$API_BASE/identity/not-a-uuid/role" "$OP_TOKEN" '{"role":"student"}'
assert_status "C3 non UUID target" "400" "$RESP_CODE"
req GET "$API_BASE/identity?pageSize=101" "$OP_TOKEN" -
assert_status "C4 pageSize 101" "400" "$RESP_CODE"
req GET "$API_BASE/identity?page=0" "$OP_TOKEN" -
assert_status "C4 page 0" "400" "$RESP_CODE"
req GET "$API_BASE/identity?pageSize=abc" "$OP_TOKEN" -
assert_status "C4 non-integer pageSize" "400" "$RESP_CODE"
if psql_must_fail "UPDATE public.users SET role='superadmin' WHERE id='$T_UID'"; then
  pass "C5 database rejects invalid role"
else
  fail "C5 database accepted invalid role"
fi
T_ROLE_AFTER_C5="$(psql_val "SELECT role FROM public.users WHERE id='$T_UID'" | uuid)"
[ "$T_ROLE_AFTER_C5" = "student" ] && pass "C5 failed update left role unchanged" || fail "C5 role changed: $T_ROLE_AFTER_C5"

echo "== 5. status linkage D1-D7 =="
REFRESH_BEFORE="$(auth_psql_val "SELECT count(*) FROM refresh_tokens rt JOIN identities i ON i.id=rt.identity_id WHERE i.external_id='$D_UID'" | uuid)"
[ "${REFRESH_BEFORE:-0}" -gt 0 ] && pass "D1 delete target has refresh token before disable" || fail "D1 refresh token setup missing"
req PATCH "$API_BASE/identity/$D_UID/status" "$OP_TOKEN" '{"status":"deleted"}'
assert_status "D1 operator deletes target" "200" "$RESP_CODE"
D_DB="$(psql_val "SELECT status || '|' || COALESCE(deleted_at::text,'') FROM public.users WHERE id='$D_UID'" | uuid)"
case "$D_DB" in deleted\|*) pass "D1 public.users soft-deleted" ;; *) fail "D1 public.users state: $D_DB" ;; esac
D_AUTH="$(auth_psql_val "SELECT status FROM identities WHERE external_id='$D_UID'" | uuid)"
[ "$D_AUTH" = "disabled" ] && pass "D1 auth-center identity disabled" || fail "D1 auth-center status: $D_AUTH"
D_REFRESH_AFTER="$(auth_psql_val "SELECT count(*) FROM refresh_tokens rt JOIN identities i ON i.id=rt.identity_id WHERE i.external_id='$D_UID'" | uuid)"
[ "${D_REFRESH_AFTER:-0}" = "0" ] && pass "D1 refresh tokens revoked" || fail "D1 refresh tokens remain: $D_REFRESH_AFTER"

docker stop "$AUTH_CONTAINER" >/dev/null 2>&1 && AUTH_STOPPED=1
if [ "$AUTH_STOPPED" -eq 1 ]; then
  pass "D2 auth-center stopped for compensation test"
  req PATCH "$API_BASE/identity/$E_UID/status" "$OP_TOKEN" '{"status":"deleted"}'
  assert_status "D2 auth-center unavailable" "502" "$RESP_CODE"
  E_DB="$(psql_val "SELECT status || '|' || COALESCE(deleted_at::text,'') FROM public.users WHERE id='$E_UID'" | uuid)"
  [ "$E_DB" = "active|" ] && pass "D2 failure produced no business row write" || fail "D2 business row changed: $E_DB"
  docker start "$AUTH_CONTAINER" >/dev/null 2>&1
  AUTH_STOPPED=0
  if wait_for_auth; then
    pass "D2 auth-center restored"
  else
    fail "D2 auth-center restore timeout"
  fi
else
  fail "D2 auth-center stop failed"
fi

req PATCH "$API_BASE/identity/$S_UID/status" "$OP_TOKEN" '{"status":"suspended"}'
assert_status "D3 operator suspends target" "200" "$RESP_CODE"
S_DB="$(psql_val "SELECT status || '|' || COALESCE(deleted_at::text,'') FROM public.users WHERE id='$S_UID'" | uuid)"
[ "$S_DB" = "suspended|" ] && pass "D3 public.users suspended without deleted_at" || fail "D3 public.users state: $S_DB"
S_AUTH="$(auth_psql_val "SELECT status FROM identities WHERE external_id='$S_UID'" | uuid)"
[ "$S_AUTH" = "disabled" ] && pass "D3 auth-center identity disabled" || fail "D3 auth-center status: $S_AUTH"

auth_login "$S_USER" 'password123'
assert_status "D4 suspended login rejected" "401" "$LOGIN_CODE"

req PATCH "$API_BASE/identity/$S_UID/status" "$OP_TOKEN" '{"status":"active"}'
assert_status "D5 operator restores target" "200" "$RESP_CODE"
S_AUTH_ACTIVE="$(auth_psql_val "SELECT status FROM identities WHERE external_id='$S_UID'" | uuid)"
[ "$S_AUTH_ACTIVE" = "active" ] && pass "D5 auth-center identity enabled" || fail "D5 auth-center status: $S_AUTH_ACTIVE"
auth_login "$S_USER" 'password123'
assert_2xx "D5 restored login succeeds" "$LOGIN_CODE"

req PATCH "$API_BASE/identity/$D_UID/status" "$OP_TOKEN" '{"status":"active"}'
assert_status "D6 deleted target cannot be revived" "404" "$RESP_CODE"
req PATCH "$API_BASE/identity/11111111-1111-1111-1111-111111111111/status" "$OP_TOKEN" '{"status":"active"}'
assert_status "D7 missing target short-circuits" "404" "$RESP_CODE"

echo "== 6. list semantics E1-E6 =="
req GET "$API_BASE/identity?q=$D_USER" "$OP_TOKEN" -
assert_status "E1 default list query" "200" "$RESP_CODE"
E1_TOTAL="$(jbody '.total // -1')"
[ "$E1_TOTAL" = "0" ] && pass "E1 default list excludes deleted" || fail "E1 deleted row in default list: total=$E1_TOTAL"

req GET "$API_BASE/identity?status=deleted&q=$D_USER" "$OP_TOKEN" -
assert_status "E2 deleted status query" "200" "$RESP_CODE"
printf '%s' "$RESP_BODY" | jq -e --arg id "$D_UID" 'any(.items[]?; .id == $id)' >/dev/null 2>&1 \
  && pass "E2 explicit deleted query includes deleted row" \
  || fail "E2 explicit deleted query missing row"

req GET "$API_BASE/identity?role=student&q=$T_USER&pageSize=100" "$OP_TOKEN" -
assert_status "E3 role filter query" "200" "$RESP_CODE"
printf '%s' "$RESP_BODY" | jq -e --arg id "$T_UID" '.total >= 1 and any(.items[]?; .id == $id) and all(.items[]?; .role == "student")' >/dev/null 2>&1 \
  && pass "E3 role filter returns only students" \
  || fail "E3 role filter mismatch"

req GET "$API_BASE/identity?q=$Q_USER" "$OP_TOKEN" -
printf '%s' "$RESP_BODY" | jq -e --arg id "$Q_UID" 'any(.items[]?; .id == $id)' >/dev/null 2>&1 \
  && pass "E4 q matches username" || fail "E4 q username mismatch"
req GET "$API_BASE/identity?q=${Q_USER}@example.com" "$OP_TOKEN" -
printf '%s' "$RESP_BODY" | jq -e --arg id "$Q_UID" 'any(.items[]?; .id == $id)' >/dev/null 2>&1 \
  && pass "E4 q matches email" || fail "E4 q email mismatch"
req GET "$API_BASE/identity?q=P2%20Query%20Name%20${TS}" "$OP_TOKEN" -
printf '%s' "$RESP_BODY" | jq -e --arg id "$Q_UID" 'any(.items[]?; .id == $id)' >/dev/null 2>&1 \
  && pass "E4 q matches name" || fail "E4 q name mismatch"

req GET "$API_BASE/identity?page=1&pageSize=2" "$OP_TOKEN" -
PAGE1_CODE="$RESP_CODE"
PAGE1_TOTAL="$(jbody '.total // -1')"
PAGE1_IDS="$(jbody '.items[]?.id' | sort -u)"
PAGE1_LEN="$(printf '%s\n' "$PAGE1_IDS" | sed '/^$/d' | wc -l | tr -d '[:space:]')"
req GET "$API_BASE/identity?page=2&pageSize=2" "$OP_TOKEN" -
PAGE2_CODE="$RESP_CODE"
PAGE2_TOTAL="$(jbody '.total // -1')"
PAGE2_IDS="$(jbody '.items[]?.id' | sort -u)"
PAGE2_LEN="$(printf '%s\n' "$PAGE2_IDS" | sed '/^$/d' | wc -l | tr -d '[:space:]')"
[ "$PAGE1_CODE" = "200" ] && [ "$PAGE2_CODE" = "200" ] && pass "E5 pagination requests succeed" || fail "E5 pagination HTTP: $PAGE1_CODE/$PAGE2_CODE"
[ "$PAGE1_TOTAL" = "$PAGE2_TOTAL" ] && pass "E5 total stable across pages" || fail "E5 totals differ: $PAGE1_TOTAL/$PAGE2_TOTAL"
[ "$PAGE1_LEN" -le 2 ] && [ "$PAGE2_LEN" -le 2 ] && pass "E5 page size honored" || fail "E5 page size exceeded: $PAGE1_LEN/$PAGE2_LEN"
if [ -z "$PAGE1_IDS" ] || [ -z "$PAGE2_IDS" ]; then
  pass "E5 page overlap not applicable"
else
  OVERLAP="$(comm -12 <(printf '%s\n' "$PAGE1_IDS") <(printf '%s\n' "$PAGE2_IDS"))"
  [ -z "$OVERLAP" ] && pass "E5 adjacent pages have no overlap" || fail "E5 pages overlap: $OVERLAP"
fi

req GET "$API_BASE/identity?q=_____nomatch_____" "$OP_TOKEN" -
assert_status "E6 empty result query" "200" "$RESP_CODE"
printf '%s' "$RESP_BODY" | jq -e '.total == 0 and (.items | length) == 0' >/dev/null 2>&1 \
  && pass "E6 empty result shape" || fail "E6 empty result mismatch"

echo "== 7. cascade and JWT no-side-effect F1-F3 =="
req PATCH "$API_BASE/identity/$ST_UID/role" "$OP_TOKEN" '{"role":"student"}'
assert_status "F1 target becomes student" "200" "$RESP_CODE"
psql_run "INSERT INTO edu.students (user_id, name, grade) VALUES ('$ST_UID', 'P2 Student', 7)
          ON CONFLICT (user_id) DO UPDATE SET name=EXCLUDED.name, grade=EXCLUDED.grade" \
  && pass "F1 student extension seeded" || fail "F1 student extension seed failed"
ST_EXT_BEFORE="$(psql_val "SELECT count(*) FROM edu.students WHERE user_id='$ST_UID'" | uuid)"
[ "$ST_EXT_BEFORE" = "1" ] && pass "F1 student extension exists before role change" || fail "F1 student extension missing"
req PATCH "$API_BASE/identity/$ST_UID/role" "$OP_TOKEN" '{"role":"merchant"}'
assert_status "F1 student changed to merchant" "200" "$RESP_CODE"
ST_EXT_AFTER="$(psql_val "SELECT count(*) FROM edu.students WHERE user_id='$ST_UID'" | uuid)"
[ "$ST_EXT_AFTER" = "1" ] && pass "F1 edu.students row retained" || fail "F1 edu.students row lost"

req GET "$API_BASE/identity/me" "$ST_TOKEN" -
assert_status "F2 pre-change token remains usable" "200" "$RESP_CODE"
F2_ROLE="$(jbody '.user.role // empty')"
[ "$F2_ROLE" = "merchant" ] && pass "F2 token observes new DB role" || fail "F2 role in profile: $F2_ROLE"

req PUT "$API_BASE/identity/me" "$ST_TOKEN" '{"name":"P2 Self Update","role":"operator","status":"suspended"}'
assert_status "F3 self-update remains whitelist-only" "200" "$RESP_CODE"
F3_ROLE="$(jbody '.role // empty')"
F3_STATUS="$(jbody '.status // empty')"
[ "$F3_ROLE" = "merchant" ] && [ "$F3_STATUS" = "active" ] \
  && pass "F3 role/status cannot be self-updated" \
  || fail "F3 self-update leaked role/status: $F3_ROLE/$F3_STATUS"

echo "== 8. whitelist and regression G1-G3 =="
if grep -Eq "get\\('(GET|POST|PUT|DELETE|PATCH)', /.*identity" "$PUBLIC_ROUTES"; then
  fail "G1 identity route was added to public-routes"
else
  pass "G1 identity routes stay out of public-routes"
fi
req GET "$API_BASE/identity/me" "$N_TOKEN" -
assert_status "G2 identity/me route remains reachable" "200" "$RESP_CODE"

if T1_OUTPUT="$(bash "$T1_SCRIPT" 2>&1)"; then
  pass "G3 p2-task-1 regression script passed"
else
  fail "G3 p2-task-1 regression failed"
  printf '%s\n' "$T1_OUTPUT" | tail -n 8
fi

VERIFY_EXIT=0
[ "$FAIL" -gt 0 ] && VERIFY_EXIT=1
echo "PASS=$PASS FAIL=$FAIL VERIFY_EXIT=$VERIFY_EXIT"
exit "$VERIFY_EXIT"
