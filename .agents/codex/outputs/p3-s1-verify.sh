#!/usr/bin/env bash
# P3-S1 verification: portal SSO workbench.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT"

PASS=0
FAIL=0
SKIP=0
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

pass() { PASS=$((PASS + 1)); echo "  PASS  $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  FAIL  $1"; }
skip() { SKIP=$((SKIP + 1)); echo "  SKIP  $1"; }

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

echo "== P3-S1 verification =="

echo "== 1. static contract =="
MODULES="apps/portal/src/config/modules.js"
WORKBENCH="apps/portal/src/pages/workbench/index.vue"
REGISTER="apps/portal/src/pages/register/index.vue"
LOGIN="apps/portal/src/pages/login/login.vue"
PAGES="apps/portal/src/pages.json"
APP="apps/portal/src/App.vue"
NGINX_DEV="nginx/conf.d/default.conf"
NGINX_PROD="nginx/conf.d.prod/default.conf"

assert_file "modules catalog exists" "$MODULES"
assert_file "workbench page exists" "$WORKBENCH"
assert_file "register page exists" "$REGISTER"
assert_file "login page exists" "$LOGIN"
assert_file "pages manifest exists" "$PAGES"
assert_file "dev nginx config exists" "$NGINX_DEV"
assert_file "prod nginx config exists" "$NGINX_PROD"

for code in food tutor org-admin ontology-stats identity curriculum dashboard agent twin; do
  assert_contains "module code '$code' is registered" "$MODULES" "code: '$code'"
done
assert_contains "role filter comment marks frontend hiding as non-security" "$MODULES" "前端仅礼貌隐藏，安全由服务端"
assert_contains "role filter is exported for workbench" "$MODULES" "export function modulesForRole"
assert_contains "workbench consumes local module catalog" "$WORKBENCH" "modulesForRole"
assert_contains "workbench uses auth-client session" "$WORKBENCH" "useAuthStore"
assert_contains "workbench logs out through auth-client" "$WORKBENCH" "auth.logout()"
assert_contains "workbench reads role from business profile" "$WORKBENCH" "currentIdentity"
assert_contains "register uses auth-client business register endpoint" "$REGISTER" "auth.register"
assert_contains "register logs in after successful registration" "$REGISTER" "auth.login"
assert_contains "login redirects to workbench" "$LOGIN" "/pages/workbench/index"
assert_contains "login links to register page" "$LOGIN" "/pages/register/index"
assert_contains "pages manifest registers register page" "$PAGES" '"path": "pages/register/index"'
assert_contains "pages manifest registers workbench page" "$PAGES" '"path": "pages/workbench/index"'
assert_contains "app guard treats register as public" "$APP" "pages/register/index"
assert_contains "dev nginx root redirects to portal workbench" "$NGINX_DEV" "return 302 /portal/;"
assert_contains "prod nginx root redirects to portal workbench" "$NGINX_PROD" "return 302 /portal/;"
assert_not_contains "portal does not hand-roll auth token storage" "$WORKBENCH" "gri-auth-token"
assert_not_contains "register does not hand-roll auth token storage" "$REGISTER" "gri-auth-token"

if node -e "const p=require('./apps/portal/src/pages.json'); process.exit(p.pages?.[0]?.path === 'pages/workbench/index' ? 0 : 1)"; then
  pass "workbench is the default route"
else
  fail "workbench must be the first/default page in pages.json"
fi

mod_count="$(grep -c "code: '" "$MODULES" 2>/dev/null || true)"
if [ "$mod_count" = "9" ]; then
  pass "module catalog contains exactly 9 modules"
else
  fail "module catalog expected 9 modules, found ${mod_count:-0}"
fi

if node --no-warnings --input-type=module -e "
  const { modulesForRole } = await import('./apps/portal/src/config/modules.js');
  const consumer = modulesForRole('consumer').map((item) => item.code);
  const operator = modulesForRole('operator').map((item) => item.code);
  const student = modulesForRole('student').map((item) => item.code);
  if (!consumer.includes('food')) throw new Error('consumer must see food');
  if (consumer.includes('org-admin')) throw new Error('consumer must not see org-admin');
  if (student.includes('org-admin')) throw new Error('student must not see org-admin');
  if (operator.length !== 9) throw new Error('operator must see all modules');
  if (modulesForRole('unknown').length !== 0) throw new Error('unknown role must not see modules');
"; then
  pass "module visibility follows the closed role set"
else
  fail "module visibility must give consumer food, operator all, unknown none"
fi

echo "== 2. build assertion =="
BUILD_LOG="$TMP_DIR/portal-build.log"
if (cd apps/portal && npm run build:h5) >"$BUILD_LOG" 2>&1; then
  pass "apps/portal npm run build:h5"
  assert_file "H5 build output exists" "apps/portal/dist/build/h5/index.html"
else
  fail "apps/portal npm run build:h5"
  tail -n 40 "$BUILD_LOG" | sed 's/^/        /'
fi

echo "== 3. live E2E =="
BASE="${GRI_BASE_URL:-http://localhost}"
BASE="${BASE%/}"

# 本地生产 nginx 常见 80 → 443；自签证书允许 -k，API 请求也必须切到 HTTPS 基址。
REDIRECT_URL="$(curl -k -sS -I --connect-timeout 3 --max-time 8 "$BASE/" 2>/dev/null \
  | awk 'tolower($1) == "location:" { print $2 }' \
  | tail -n 1 \
  | tr -d '\r')"
if [[ "$REDIRECT_URL" == https://* ]]; then
  BASE="${REDIRECT_URL%/}"
fi

ROOT_CODE="$(curl -k -sS -L --connect-timeout 3 --max-time 10 -o "$TMP_DIR/root.html" -w '%{http_code}' "$BASE/" 2>/dev/null || true)"
ROOT_CODE="${ROOT_CODE:-000}"

if [ "$ROOT_CODE" = "000" ] || [ "$ROOT_CODE" = "404" ] || [ "$ROOT_CODE" = "502" ] || [ "$ROOT_CODE" = "503" ] || [ "$ROOT_CODE" = "504" ]; then
  skip "portal gateway unreachable at $BASE (HTTP $ROOT_CODE)"
else
  if [ "$ROOT_CODE" = "200" ] && grep -Fq 'id="app"' "$TMP_DIR/root.html"; then
    pass "GET / follows the redirect into the portal uni-app shell"
  else
    fail "GET / expected portal app shell HTML, got HTTP $ROOT_CODE"
  fi

  AUTH_JWKS_CODE="$(curl -k -sS --connect-timeout 3 --max-time 8 -o /dev/null -w '%{http_code}' "$BASE/auth/jwks" 2>/dev/null || true)"
  if [ "$AUTH_JWKS_CODE" = "000" ] || [ "$AUTH_JWKS_CODE" = "404" ] || [ "$AUTH_JWKS_CODE" = "502" ]; then
    skip "auth-center/api unreachable through gateway; credential flow skipped"
  else
    TS="$(date +%s)"
    SUFFIX="${TS}_${RANDOM}"
    USERNAME="p3s1_${SUFFIX}"
    EMAIL="${USERNAME}@example.com"
    PASSWORD="P3s1-${SUFFIX}-Aa"
    ACCESS_TOKEN=""
    REFRESH_TOKEN=""
    USER_ID=""

    cleanup_user() {
      if [ -n "$ACCESS_TOKEN" ] && [ -n "$USER_ID" ]; then
        curl -k -sS --connect-timeout 3 --max-time 8 -X DELETE \
          "$BASE/api/identity/me" \
          -H "Authorization: Bearer $ACCESS_TOKEN" \
          -o /dev/null 2>/dev/null || true
      fi
    }
    trap 'cleanup_user; rm -rf "$TMP_DIR"' EXIT

    REGISTER_BODY="$(jq -nc \
      --arg username "$USERNAME" \
      --arg email "$EMAIL" \
      --arg password "$PASSWORD" \
      '{username:$username,email:$email,password:$password,name:"P3-S1 Verify"}')"
    REGISTER_CODE="$(curl -k -sS --connect-timeout 3 --max-time 10 \
      -X POST "$BASE/api/auth/register" \
      -H 'Content-Type: application/json' \
      -d "$REGISTER_BODY" \
      -o "$TMP_DIR/register.json" \
      -w '%{http_code}' 2>/dev/null || true)"
    REGISTER_CODE="${REGISTER_CODE:-000}"
    USER_ID="$(jq -r '.id // empty' "$TMP_DIR/register.json" 2>/dev/null || true)"

    if [ "$REGISTER_CODE" = "201" ] && [ -n "$USER_ID" ]; then
      pass "POST /api/auth/register creates a consumer"
    else
      fail "POST /api/auth/register expected 201 with user id, got HTTP $REGISTER_CODE"
    fi

    LOGIN_BODY="$(jq -nc --arg identifier "$EMAIL" --arg password "$PASSWORD" \
      '{identifier:$identifier,password:$password}')"
    LOGIN_CODE="$(curl -k -sS --connect-timeout 3 --max-time 10 \
      -X POST "$BASE/auth/login" \
      -H 'Content-Type: application/json' \
      -d "$LOGIN_BODY" \
      -o "$TMP_DIR/login.json" \
      -w '%{http_code}' 2>/dev/null || true)"
    LOGIN_CODE="${LOGIN_CODE:-000}"
    ACCESS_TOKEN="$(jq -r '.accessToken // empty' "$TMP_DIR/login.json" 2>/dev/null || true)"
    REFRESH_TOKEN="$(jq -r '.refreshToken // empty' "$TMP_DIR/login.json" 2>/dev/null || true)"

    if [[ "$LOGIN_CODE" =~ ^2[0-9][0-9]$ ]] && [ -n "$ACCESS_TOKEN" ]; then
      pass "POST /auth/login returns the shared auth-client token pair"
    else
      fail "POST /auth/login expected 2xx with accessToken, got HTTP $LOGIN_CODE"
    fi

    IDENTITY_CODE="$(curl -k -sS --connect-timeout 3 --max-time 8 \
      "$BASE/api/identity/me" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      -o "$TMP_DIR/identity.json" \
      -w '%{http_code}' 2>/dev/null || true)"
    IDENTITY_CODE="${IDENTITY_CODE:-000}"
    IDENTITY_ROLE="$(jq -r '.user.role // empty' "$TMP_DIR/identity.json" 2>/dev/null || true)"
    IDENTITY_ID="$(jq -r '.user.id // empty' "$TMP_DIR/identity.json" 2>/dev/null || true)"

    if [ "$IDENTITY_CODE" = "200" ] && [ "$IDENTITY_ROLE" = "consumer" ] && [ "$IDENTITY_ID" = "$USER_ID" ]; then
      pass "GET /api/identity/me resolves the registered role and external id"
    else
      fail "GET /api/identity/me expected consumer user $USER_ID, got HTTP $IDENTITY_CODE role=${IDENTITY_ROLE:-<empty>}"
    fi

    ME_CODE="$(curl -k -sS --connect-timeout 3 --max-time 8 \
      "$BASE/auth/me" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      -o "$TMP_DIR/auth-me.json" \
      -w '%{http_code}' 2>/dev/null || true)"
    ME_CODE="${ME_CODE:-000}"
    ME_EXTERNAL_ID="$(jq -r '.externalId // empty' "$TMP_DIR/auth-me.json" 2>/dev/null || true)"
    if [ "$ME_CODE" = "200" ] && [ "$ME_EXTERNAL_ID" = "$USER_ID" ]; then
      pass "GET /auth/me agrees with the shared external identity"
    else
      fail "GET /auth/me expected externalId $USER_ID, got HTTP $ME_CODE"
    fi

    if [ -n "$REFRESH_TOKEN" ]; then
      LOGOUT_BODY="$(jq -nc --arg refreshToken "$REFRESH_TOKEN" '{refreshToken:$refreshToken}')"
      LOGOUT_CODE="$(curl -k -sS --connect-timeout 3 --max-time 8 \
        -X POST "$BASE/auth/logout" \
        -H 'Content-Type: application/json' \
        -H "Authorization: Bearer $ACCESS_TOKEN" \
        -d "$LOGOUT_BODY" \
        -o "$TMP_DIR/logout.json" \
        -w '%{http_code}' 2>/dev/null || true)"
      LOGOUT_CODE="${LOGOUT_CODE:-000}"
      if [[ "$LOGOUT_CODE" =~ ^2[0-9][0-9]$ ]]; then
        pass "POST /auth/logout revokes the shared refresh token"
      else
        fail "POST /auth/logout expected 2xx, got HTTP $LOGOUT_CODE"
      fi
    else
      fail "login did not return a refresh token"
    fi

    cleanup_user
    ACCESS_TOKEN=""
    USER_ID=""
  fi
fi

echo
if [ "$FAIL" -eq 0 ]; then
  echo "全绿：PASS=$PASS FAIL=$FAIL SKIP=$SKIP"
  exit 0
fi

echo "未全绿：PASS=$PASS FAIL=$FAIL SKIP=$SKIP"
exit 1
