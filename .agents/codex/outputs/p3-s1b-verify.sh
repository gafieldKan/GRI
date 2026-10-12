#!/usr/bin/env bash
# P3-S1b verification: cross-app SSO for food + AI tutor.
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

echo "== P3-S1b verification =="

echo "== 1. static contract =="
WEB_SESSION="apps/web/src/store/session.js"
WEB_AUTH="apps/web/src/store/auth.js"
WEB_APP="apps/web/src/App.vue"
WEB_LOGIN="apps/web/src/pages/login/login.vue"
TUTOR_APP="apps/web-ai-tutor/src/App.vue"
TUTOR_PAGES="apps/web-ai-tutor/src/pages.json"
MINI_APP="apps/mini-program-ai-tutor/App.vue"
MINI_PAGES="apps/mini-program-ai-tutor/pages.json"
MINI_AUTH="apps/mini-program-ai-tutor/store/auth.js"

assert_file "web shared-session bridge exists" "$WEB_SESSION"
assert_file "web auth store exists" "$WEB_AUTH"
assert_file "tutor app guard exists" "$TUTOR_APP"
assert_file "tutor pages manifest exists" "$TUTOR_PAGES"

assert_contains "web declares auth-client dependency" "apps/web/package.json" '"@gri/auth-client"'
assert_contains "root lock records auth-client dependency" "package-lock.json" '"@gri/auth-client"'
assert_contains "web bridge uses auth-client storage" "$WEB_SESSION" "createStorage"
assert_contains "web bridge uses the shared auth key" "$WEB_SESSION" "SHARED_AUTH_KEY = 'gri-auth-token'"
assert_contains "web bridge maps externalId to domain user id" "$WEB_SESSION" "saved.user.externalId || saved.user.id"
assert_contains "web auth store hydrates from shared session" "$WEB_AUTH" "syncFromSharedSession()"
assert_contains "web auth store writes shared session" "$WEB_AUTH" "writeSharedSession({"
assert_contains "web auth store clears shared session" "$WEB_AUTH" "clearSharedSession()"
assert_contains "web refresh writes rotated token pair back" "$WEB_AUTH" "writeSharedSession({"
assert_contains "web logout uses portal entry" "$WEB_AUTH" "redirectToPortal()"
assert_contains "web app listens to shared-session changes" "$WEB_APP" "_listenSharedSession()"
assert_contains "web app reacts to shared-session changes" "$WEB_APP" "window.addEventListener('storage'"
assert_not_contains "web store no longer sends users to its own login page" "$WEB_AUTH" "uni.reLaunch({ url: '/pages/login/login' })"
assert_contains "web login exits to the portal entry" "$WEB_LOGIN" "redirectToPortal()"
assert_contains "tutor uses auth-client store" "$TUTOR_APP" "useAuthStore"
assert_contains "tutor uses portal as the login entry" "$TUTOR_APP" "PORTAL_ENTRY = '/'"
assert_contains "tutor redirects H5 to the gateway root" "$TUTOR_APP" "window.location.replace(PORTAL_ENTRY)"
assert_contains "tutor listens to shared-session changes" "$TUTOR_APP" "window.addEventListener('storage'"
assert_contains "tutor resets memory before restoring a shared login" "$TUTOR_APP" "auth.\$reset()"
assert_contains "tutor restores from the shared key" "$TUTOR_APP" "auth.restore()"
assert_not_contains "tutor no longer sends users to its own login page" "$TUTOR_APP" "uni.reLaunch({ url: '/pages/login/login' })"
assert_file "mini-program app remains present for review" "$MINI_APP"
assert_file "mini-program pages manifest remains present" "$MINI_PAGES"
assert_contains "mini-program remains on auth-client" "$MINI_AUTH" "createAuthStore"

if node -e "const p=require('./apps/web-ai-tutor/src/pages.json'); process.exit(p.pages?.[0]?.path === 'pages/index/index' ? 0 : 1)"; then
  pass "tutor default route is the business home"
else
  fail "tutor default route must be pages/index/index"
fi

if node -e "const p=require('./apps/mini-program-ai-tutor/pages.json'); process.exit(p.pages?.[0]?.path === 'pages/login/login' ? 0 : 1)"; then
  pass "mini-program remains platform-specific with its own login first route"
else
  fail "mini-program first route review expected pages/login/login"
fi

echo "== 2. build assertion =="
WEB_BUILD_LOG="$TMP_DIR/web-build.log"
if (cd apps/web && npm run build:h5) >"$WEB_BUILD_LOG" 2>&1; then
  pass "apps/web npm run build:h5"
  assert_file "food H5 build output exists" "apps/web/dist/build/h5/index.html"
else
  fail "apps/web npm run build:h5"
  tail -n 40 "$WEB_BUILD_LOG" | sed 's/^/        /'
fi

TUTOR_BUILD_LOG="$TMP_DIR/tutor-build.log"
if (cd apps/web-ai-tutor && npm run build:h5) >"$TUTOR_BUILD_LOG" 2>&1; then
  pass "apps/web-ai-tutor npm run build:h5"
  assert_file "tutor H5 build output exists" "apps/web-ai-tutor/dist/build/h5/index.html"
else
  fail "apps/web-ai-tutor npm run build:h5"
  tail -n 40 "$TUTOR_BUILD_LOG" | sed 's/^/        /'
fi

echo "== 3. live E2E =="
BASE="${GRI_BASE_URL:-http://localhost}"
BASE="${BASE%/}"

REDIRECT_URL="$(curl -k -sS -I --connect-timeout 3 --max-time 8 "$BASE/" 2>/dev/null \
  | awk 'tolower($1) == "location:" { print $2 }' \
  | tail -n 1 \
  | tr -d '\r')"
if [[ "$REDIRECT_URL" == https://* ]]; then
  BASE="${REDIRECT_URL%/}"
fi

PORTAL_CODE="$(curl -k -sS -L --connect-timeout 3 --max-time 10 -o "$TMP_DIR/portal.html" -w '%{http_code}' "$BASE/portal/" 2>/dev/null || true)"
PORTAL_CODE="${PORTAL_CODE:-000}"
FOOD_CODE="$(curl -k -sS --connect-timeout 3 --max-time 10 -o /dev/null -w '%{http_code}' "$BASE/food/" 2>/dev/null || true)"
TUTOR_CODE="$(curl -k -sS --connect-timeout 3 --max-time 10 -o /dev/null -w '%{http_code}' "$BASE/tutor/" 2>/dev/null || true)"
AUTH_CODE="$(curl -k -sS --connect-timeout 3 --max-time 8 -o /dev/null -w '%{http_code}' "$BASE/auth/jwks" 2>/dev/null || true)"

CHROME="${GRI_CHROME:-}"
if [ -z "$CHROME" ]; then
  for candidate in \
    "$HOME"/.cache/ms-playwright/*/chrome-linux*/chrome \
    "$HOME"/.cache/ms-playwright/*/chrome-headless-shell-linux*/chrome-headless-shell \
    /usr/bin/google-chrome \
    /usr/bin/chromium \
    /usr/bin/chromium-browser; do
    if [ -x "$candidate" ]; then
      CHROME="$candidate"
      break
    fi
  done
fi

if [ "$PORTAL_CODE" = "000" ] || [ "$PORTAL_CODE" = "404" ] || [ "$PORTAL_CODE" = "502" ] || [ "$PORTAL_CODE" = "503" ] || [ "$PORTAL_CODE" = "504" ]; then
  skip "portal gateway unreachable at $BASE (HTTP $PORTAL_CODE)"
elif [ "$PORTAL_CODE" != "200" ] || ! grep -Fq 'id="app"' "$TMP_DIR/portal.html"; then
  fail "GET /portal/ expected the portal uni-app shell, got HTTP $PORTAL_CODE"
elif [ "$FOOD_CODE" != "200" ] || [ "$TUTOR_CODE" != "200" ]; then
  fail "module shells must be reachable (/food/=$FOOD_CODE /tutor/=$TUTOR_CODE)"
elif [ "$AUTH_CODE" = "000" ] || [ "$AUTH_CODE" = "404" ] || [ "$AUTH_CODE" = "502" ] || [ "$AUTH_CODE" = "503" ]; then
  skip "auth-center unreachable through gateway (HTTP $AUTH_CODE); credential flow skipped"
elif [ -z "$CHROME" ] || [ ! -x "$CHROME" ]; then
  skip "Chrome executable unavailable for browser SSO E2E"
else
  cat >"$TMP_DIR/p3-s1b-e2e.mjs" <<'NODE'
// Live cross-app SSO checks. Uses the real portal login/logout UI and three tabs
// sharing one same-origin localStorage. Never prints credentials or token values.
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const BASE = (process.env.GRI_E2E_BASE || '').replace(/\/$/, '')
const CHROME = process.env.GRI_E2E_CHROME
const KEY = 'gri-auth-token'
const PORT = 9400 + Math.floor(Math.random() * 500)
const PROFILE = process.env.GRI_E2E_PROFILE

let pass = 0
let fail = 0
let account = null
let portalSession = null
const ok = (message) => { pass += 1; console.log(`  PASS  ${message}`) }
const bad = (message) => { fail += 1; console.log(`  FAIL  ${message}`) }

async function httpJson(url, options = {}) {
  const response = await fetch(url, options)
  const text = await response.text()
  let json = null
  try { json = JSON.parse(text) } catch {}
  return { status: response.status, json }
}

async function registerAccount() {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 100000)}`
  const username = `p3s1b_${suffix}`
  const email = `${username}@example.com`
  const password = `P3s1b-${suffix}-Aa`
  const result = await httpJson(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password, name: 'P3-S1b SSO Verify' }),
  })
  if (![200, 201].includes(result.status) || !result.json?.id) {
    throw new Error(`register failed with HTTP ${result.status}`)
  }
  return { id: result.json.id, email, password, accessToken: null }
}

async function apiLogin(item) {
  const result = await httpJson(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: item.email, password: item.password }),
  })
  if (![200, 201].includes(result.status) || !result.json?.accessToken) {
    throw new Error(`login failed with HTTP ${result.status}`)
  }
  return result.json
}

async function cleanupAccount() {
  if (!account) return
  try {
    let token = account.accessToken
    if (!token) token = (await apiLogin(account)).accessToken
    const result = await httpJson(`${BASE}/api/identity/me`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if ([200, 202, 204].includes(result.status)) {
      console.log(`  cleanup: test account ${account.id} deleted`)
    }
  } catch {
    console.log(`  cleanup: test account ${account.id} could not be removed`)
  }
}

async function main() {
  const chrome = spawn(CHROME, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--ignore-certificate-errors',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    'about:blank',
  ], { stdio: 'ignore' })

  let wsUrl = null
  for (let i = 0; i < 40; i += 1) {
    try {
      const version = await httpJson(`http://127.0.0.1:${PORT}/json/version`)
      wsUrl = version.json?.webSocketDebuggerUrl
      if (wsUrl) break
    } catch {}
    await sleep(250)
  }
  if (!wsUrl) {
    chrome.kill('SIGKILL')
    throw new Error('Chrome CDP was not reachable')
  }

  const ws = new WebSocket(wsUrl)
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = reject
  })

  let idCounter = 0
  const pending = new Map()
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message)
      pending.delete(message.id)
    }
  }
  const send = (method, params = {}, sessionId) => new Promise((resolve) => {
    const id = ++idCounter
    pending.set(id, resolve)
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
  })

  async function openTab() {
    const created = await send('Target.createTarget', { url: 'about:blank' })
    const attached = await send('Target.attachToTarget', {
      targetId: created.result.targetId,
      flatten: true,
    })
    const sessionId = attached.result.sessionId
    await send('Page.enable', {}, sessionId)
    await send('Runtime.enable', {}, sessionId)
    return sessionId
  }

  async function evaluate(sessionId, expression) {
    const response = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    }, sessionId)
    if (response.result?.exceptionDetails) {
      throw new Error('browser evaluation failed')
    }
    return response.result?.result?.value
  }

  async function waitFor(sessionId, expression, timeout = 10000) {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      try {
        if (await evaluate(sessionId, expression)) return true
      } catch {}
      await sleep(250)
    }
    return false
  }

  async function goto(sessionId, url, waitMs = 2500) {
    await send('Page.navigate', { url }, sessionId)
    await sleep(waitMs)
    await evaluate(sessionId, 'document.readyState')
  }

  async function state(sessionId) {
    return evaluate(sessionId, `(() => ({
      url: location.href,
      text: (document.body ? document.body.innerText : '').slice(0, 5000),
      hasToken: !!localStorage.getItem(${JSON.stringify(KEY)})
    }))()`)
  }

  async function readSharedSession(sessionId) {
    const raw = await evaluate(sessionId, `localStorage.getItem(${JSON.stringify(KEY)})`)
    if (!raw) return null
    try { return JSON.parse(raw) } catch { return null }
  }

  const portalLoginVisible = (snapshot) => (
    snapshot.text.includes('GRI 组织管理台') && snapshot.text.includes('登录')
  )
  const foodLoginVisible = (snapshot) => (
    snapshot.text.includes('欢迎回来') ||
    snapshot.text.includes('登录您的 GRI') ||
    snapshot.text.includes('请输入账号和密码')
  )
  const tutorLoginVisible = (snapshot) => (
    snapshot.text.includes('智学慧眼') && snapshot.text.includes('请输入账号和密码')
  )

  let chromeClosed = false
  try {
    account = await registerAccount()
    console.log(`  session user id=${account.id}`)

    const portalTab = await openTab()
    await goto(portalTab, `${BASE}/portal/`)
    await evaluate(portalTab, `localStorage.removeItem(${JSON.stringify(KEY)})`)

    await goto(portalTab, `${BASE}/food/`)
    let snapshot = await state(portalTab)
    if (!snapshot.url.startsWith(`${BASE}/food/`) && portalLoginVisible(snapshot)) {
      ok(`unauth /food/ redirects to portal login (url=${snapshot.url})`)
    } else {
      bad(`unauth /food/ did not redirect to portal login (url=${snapshot.url})`)
    }

    await goto(portalTab, `${BASE}/tutor/`)
    snapshot = await state(portalTab)
    if (!snapshot.url.startsWith(`${BASE}/tutor/`) && portalLoginVisible(snapshot)) {
      ok(`unauth /tutor/ redirects to portal login (url=${snapshot.url})`)
    } else {
      bad(`unauth /tutor/ did not redirect to portal login (url=${snapshot.url})`)
    }

    await goto(portalTab, `${BASE}/portal/`)
    if (!await waitFor(portalTab, "document.querySelectorAll('input').length >= 2 && !!document.querySelector('.login-btn')")) {
      throw new Error('portal login form did not render')
    }
    await evaluate(portalTab, `(() => {
      const inputs = document.querySelectorAll('input')
      const setValue = (element, value) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
        setter.call(element, value)
        element.dispatchEvent(new Event('input', { bubbles: true }))
        element.dispatchEvent(new Event('change', { bubbles: true }))
      }
      setValue(inputs[0], ${JSON.stringify(account.email)})
      setValue(inputs[1], ${JSON.stringify(account.password)})
      return true
    })()`)
    await evaluate(portalTab, "document.querySelector('.login-btn').click(); true")

    if (!await waitFor(
      portalTab,
      `!!localStorage.getItem(${JSON.stringify(KEY)}) && document.body.innerText.includes('退出登录')`,
      12000,
    )) {
      throw new Error('portal login UI did not create a shared session')
    }
    portalSession = await readSharedSession(portalTab)
    if (portalSession?.accessToken && portalSession?.user) {
      account.accessToken = portalSession.accessToken
      ok('portal login UI writes the shared auth-client session')
    } else {
      bad('portal login UI did not write a complete shared session')
    }

    const foodTab = await openTab()
    await goto(foodTab, `${BASE}/food/`)
    snapshot = await state(foodTab)
    if (snapshot.url.startsWith(`${BASE}/food/`) && !foodLoginVisible(snapshot)) {
      ok(`portal login grants /food/ without a second login (url=${snapshot.url})`)
    } else {
      bad(`/food/ still required login after portal SSO (url=${snapshot.url})`)
    }

    const rotatedMarker = 'invalid-access-token-for-p3s1b-refresh'
    await evaluate(portalTab, `localStorage.setItem(${JSON.stringify(KEY)}, JSON.stringify({
      accessToken: ${JSON.stringify(rotatedMarker)},
      refreshToken: ${JSON.stringify(portalSession?.refreshToken || '')},
      user: ${JSON.stringify(portalSession?.user || null)}
    }))`)
    await goto(foodTab, `${BASE}/food/`)
    const refreshWorked = await waitFor(foodTab, `(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(${JSON.stringify(KEY)}) || 'null')
        return !!saved?.accessToken && saved.accessToken !== ${JSON.stringify(rotatedMarker)}
      } catch {
        return false
      }
    })()`, 12000)
    portalSession = await readSharedSession(portalTab)
    if (portalSession?.accessToken) account.accessToken = portalSession.accessToken
    if (refreshWorked && portalSession?.accessToken !== rotatedMarker) {
      ok('food refresh rotates and writes the token pair back to the shared session')
    } else {
      bad('food refresh did not update the shared session token')
    }

    const tutorTab = await openTab()
    await goto(tutorTab, `${BASE}/tutor/`)
    snapshot = await state(tutorTab)
    if (snapshot.url.startsWith(`${BASE}/tutor/`) && !tutorLoginVisible(snapshot)) {
      ok(`portal login grants /tutor/ without a second login (url=${snapshot.url})`)
    } else {
      bad(`/tutor/ still required login after portal SSO (url=${snapshot.url})`)
    }

    const crossTabSession = { ...(portalSession || {}), ssoProbe: `p3s1b-${Date.now()}` }
    await evaluate(portalTab, `localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(JSON.stringify(crossTabSession))})`)
    await sleep(1800)
    const foodAfterLoginEvent = await state(foodTab)
    const tutorAfterLoginEvent = await state(tutorTab)
    if (
      foodAfterLoginEvent.hasToken &&
      tutorAfterLoginEvent.hasToken &&
      foodAfterLoginEvent.url.startsWith(`${BASE}/food/`) &&
      tutorAfterLoginEvent.url.startsWith(`${BASE}/tutor/`)
    ) {
      ok('cross-tab portal login event hydrates both modules without deleting the shared key')
    } else {
      bad('cross-tab portal login event broke one of the module sessions')
    }

    await goto(portalTab, `${BASE}/portal/`)
    if (!await waitFor(portalTab, "!!document.querySelector('.logout-btn') && document.body.innerText.includes('退出登录')")) {
      throw new Error('portal logout control did not render')
    }
    await evaluate(portalTab, "document.querySelector('.logout-btn').click(); true")
    const portalLoggedOut = await waitFor(
      portalTab,
      `!localStorage.getItem(${JSON.stringify(KEY)}) && document.body.innerText.includes('GRI 组织管理台')`,
      12000,
    )
    await sleep(1800)
    const foodAfterLogout = await state(foodTab)
    const tutorAfterLogout = await state(tutorTab)
    if (portalLoggedOut) {
      ok('portal logout UI removes the shared auth-client session')
    } else {
      bad('portal logout UI did not clear the shared session')
    }
    if (
      !foodAfterLogout.hasToken &&
      !tutorAfterLogout.hasToken &&
      !foodAfterLogout.url.startsWith(`${BASE}/food/`) &&
      !tutorAfterLogout.url.startsWith(`${BASE}/tutor/`) &&
      portalLoginVisible(foodAfterLogout) &&
      portalLoginVisible(tutorAfterLogout)
    ) {
      ok('portal logout invalidates both open module sessions')
    } else {
      bad('portal logout did not invalidate both open module sessions')
    }

    await goto(foodTab, `${BASE}/food/`)
    snapshot = await state(foodTab)
    if (!snapshot.url.startsWith(`${BASE}/food/`) && portalLoginVisible(snapshot)) {
      ok('fresh /food/ navigation after logout returns to portal login')
    } else {
      bad('fresh /food/ navigation after logout stayed authenticated')
    }
  } finally {
    await cleanupAccount()
    ws.close()
    if (!chromeClosed) {
      chrome.kill('SIGKILL')
      chromeClosed = true
    }
  }
}

main()
  .catch((error) => {
    bad(`exception: ${error.message}`)
  })
  .finally(() => {
    console.log(`LIVE_PASS=${pass}`)
    console.log(`LIVE_FAIL=${fail}`)
    process.exitCode = fail === 0 ? 0 : 1
  })
NODE

  LIVE_LOG="$TMP_DIR/live-e2e.log"
  GRI_E2E_BASE="$BASE" \
    GRI_E2E_CHROME="$CHROME" \
    GRI_E2E_PROFILE="$TMP_DIR/chrome-profile" \
    node --no-warnings "$TMP_DIR/p3-s1b-e2e.mjs" >"$LIVE_LOG" 2>&1
  LIVE_CODE=$?
  sed 's/^/  /' "$LIVE_LOG"
  LIVE_PASS="$(sed -n 's/^LIVE_PASS=//p' "$LIVE_LOG" | tail -n 1)"
  LIVE_FAIL="$(sed -n 's/^LIVE_FAIL=//p' "$LIVE_LOG" | tail -n 1)"
  LIVE_PASS="${LIVE_PASS:-0}"
  LIVE_FAIL="${LIVE_FAIL:-0}"
  PASS=$((PASS + LIVE_PASS))
  FAIL=$((FAIL + LIVE_FAIL))
  if [ "$LIVE_CODE" -ne 0 ] || [ "$LIVE_FAIL" -ne 0 ]; then
    if [ "$LIVE_FAIL" -eq 0 ]; then
      FAIL=$((FAIL + 1))
    fi
  fi
fi

echo
if [ "$FAIL" -eq 0 ]; then
  echo "全绿：PASS=$PASS FAIL=$FAIL SKIP=$SKIP"
  exit 0
fi

echo "未全绿：PASS=$PASS FAIL=$FAIL SKIP=$SKIP"
exit 1
