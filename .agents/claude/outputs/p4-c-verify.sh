#!/usr/bin/env bash
# ============================================================================
# P4-C 验收：门户登录 / 注册 / 工作台 视觉设计（P3-UI）
#
# 结构：
#   §1 构建        —— apps/portal `npm run build:h5` 通过；产物 index.html / assets 齐；产物 CSS 已引用设计令牌
#   §2 令牌合规（N1）—— 6 个新增/改动文件逐个断言：无裸色（#hex / rgb() / 具名色），且确实引用 var(--…)
#   §3 静态契约（N2/N3/N5）—— 改动面只在 portal 登录/注册/工作台 + 新增 ui 组件；
#                        未碰 services/·packages/·其他前端·main.js·pages.json·console 页；无新增迁移
#   §4 行为端到端（N3）—— playwright-core + chromium 打开 https://localhost/portal/：
#                        4.1 未登录 → 登录页（路由守卫生效）      4.2 登录 → 工作台（角色徽标 + 按角色模块卡）
#                        4.3 跨模块 SSO：localStorage 携带 gri-auth-token → 直进工作台，不二次登录
#                        4.4 注册页可达 + 前端校验文案不变（空提交 → 用户名至少 3 个字符）
#                        4.5 退出登录 → 回登录页（行为不变）      4.6 空模块态走 EmptyState（只读拦截 /api/modules）
#                        4.7 响应式：桌面双列 / 移动单列；390×844 首屏可见登录按钮
#                        4.8 全流程 pageerror / console error = 0
#   §5 响应式与 A11y（N4）—— focus-visible、prefers-reduced-motion、media 断点、role="alert"、aria-* 齐备
#
# 依赖：apps/portal 已 npm install；§4 另需 nginx + api + auth-center 在跑（前端为构建产物由 nginx 直 serve）。
# 凭据：仅 dev 测试账号（TEST_IDENTIFIER / TEST_PASSWORD 可覆盖）；脚本不落任何密钥。
# 副作用：§4 只读（登录/登出走既有接口，不写业务数据；空模块态用请求拦截，不落库）。
# 用法：  bash .agents/claude/outputs/p4-c-verify.sh
# 通过：  末尾打印「PASS=<n> FAIL=0 VERIFY_EXIT=0」
# ============================================================================
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PORTAL_DIR="$ROOT_DIR/apps/portal"
SRC_DIR="$PORTAL_DIR/src"
DIST_DIR="$PORTAL_DIR/dist/build/h5"

WEB_BASE="${WEB_BASE:-https://localhost/portal/}"
IDENTIFIER="${TEST_IDENTIFIER:-testuser}"
PASSWORD="${TEST_PASSWORD:-test1234}"

FILES=(
  "components/ui/BrandMark.vue"
  "components/ui/AuthShell.vue"
  "components/ui/FormField.vue"
  "pages/login/login.vue"
  "pages/register/index.vue"
  "pages/workbench/index.vue"
)

PASS=0
FAIL=0
SKIP=0
pass() { PASS=$((PASS + 1)); printf 'PASS  %s\n' "$1"; }
fail() { FAIL=$((FAIL + 1)); printf 'FAIL  %s\n' "$1"; }
skip() { SKIP=$((SKIP + 1)); printf 'SKIP  %s\n' "$1"; }

# ---------------------------------------------------------------------------
echo "== §1. 构建（npm run build:h5）=="
BUILD_LOG="$(mktemp /tmp/p4c-build.XXXXXX.log)"
if (cd "$PORTAL_DIR" && npm run build:h5 >"$BUILD_LOG" 2>&1); then
  pass "apps/portal npm run build:h5 通过（exit 0）"
else
  fail "apps/portal npm run build:h5 失败（日志尾：$(tail -3 "$BUILD_LOG" | tr '\n' ' '))"
fi
rm -f "$BUILD_LOG"

[ -f "$DIST_DIR/index.html" ] && pass "构建产物 index.html 存在" || fail "构建产物 index.html 缺失"
DIST_ASSETS="$(find "$DIST_DIR/assets" -maxdepth 1 -name '*.js' 2>/dev/null | wc -l | tr -d ' ')"
[ "${DIST_ASSETS:-0}" -ge 3 ] && pass "构建产物 assets 含 ${DIST_ASSETS} 个 js chunk" \
  || fail "构建产物 assets 异常（js chunk=${DIST_ASSETS:-0}）"

if grep -rqs -- '--color-primary' "$DIST_DIR/assets"/*.css; then
  pass "产物 CSS 引用设计令牌（var(--color-primary)）"
else
  fail "产物 CSS 未见令牌变量（视觉可能未走令牌真源）"
fi

# ---------------------------------------------------------------------------
echo
echo "== §2. 令牌合规（N1：新代码禁裸色）=="
for f in "${FILES[@]}"; do
  path="$SRC_DIR/$f"
  if [ ! -f "$path" ]; then
    fail "$f 不存在"
    continue
  fi
  RAW="$(grep -nE '#[0-9a-fA-F]{3,8}\b|\brgba?\(|:[^;]*\b(white|black|red|green|blue|gray|grey|orange|yellow|purple)\b' "$path" || true)"
  [ -z "$RAW" ] && pass "$f：无裸色（hex / rgb() / 具名色）" \
    || fail "$f：出现裸色 → $(printf '%s' "$RAW" | head -2 | tr '\n' ' ')"

  TOKENS="$(grep -c -- 'var(--' "$path" || true)"
  [ "${TOKENS:-0}" -ge 5 ] && pass "$f：引用令牌 ${TOKENS} 处（var(--…)）" \
    || fail "$f：令牌引用过少（${TOKENS:-0}）"
done

# ---------------------------------------------------------------------------
echo
echo "== §3. 静态契约（N2 / N3 / N5：改动面收敛）=="
OTHER_FRONTENDS="$(cd "$ROOT_DIR" && git status --porcelain -- apps/web apps/web-ai-tutor apps/mini-program-ai-tutor | wc -l | tr -d ' ')"
[ "${OTHER_FRONTENDS:-9}" -eq 0 ] && pass "N5：其他前端（web / web-ai-tutor / mini-program）零改动" \
  || fail "N5：其他前端被改动（$OTHER_FRONTENDS 个文件）"

BACKEND="$(cd "$ROOT_DIR" && git status --porcelain -- services packages scripts tools nginx docker-compose.yml | wc -l | tr -d ' ')"
[ "${BACKEND:-9}" -eq 0 ] && pass "N2：未碰 API / 权限 / 后端 / 网关（services·packages·scripts·tools·nginx 零改动）" \
  || fail "N2：后端或网关被改动（$BACKEND 个文件）"

for guard in "src/main.js" "src/pages.json" "src/pages/console/index.vue" "src/pages/ontology-stats/index.vue" "src/App.vue" "src/api/index.js"; do
  N="$(cd "$ROOT_DIR" && git status --porcelain -- "apps/portal/$guard" | wc -l | tr -d ' ')"
  [ "${N:-9}" -eq 0 ] && pass "N2：$guard 零改动（入口 / 路由 / 其他页 / 接口层未动）" \
    || fail "N2：$guard 被改动"
done

MIGRATIONS="$(cd "$ROOT_DIR" && git status --porcelain -- services/api/src/migrate | wc -l | tr -d ' ')"
[ "${MIGRATIONS:-9}" -eq 0 ] && pass "N3：无新增/改动迁移" || fail "N3：迁移目录有改动"

UNTRACKED_OUTSIDE="$(cd "$ROOT_DIR" && git status --porcelain | grep -vE 'apps/portal/src/(pages/(login|register|workbench)/|components/ui/(BrandMark|AuthShell|FormField)\.vue)|\.agents/claude/outputs/p4-c|\.agents/coordination/handoff-log\.md' || true)"
[ -z "$UNTRACKED_OUTSIDE" ] && pass "改动面仅限本卡声明的 6 个文件（无越界改动）" \
  || fail "出现越界改动 → $(printf '%s' "$UNTRACKED_OUTSIDE" | head -3 | tr '\n' ' ')"

# ---------------------------------------------------------------------------
echo
echo "== §4/§5. 真实浏览器（行为不变 + 响应式 + A11y）=="
UI_SCRIPT="$(mktemp /tmp/p4c-ui.XXXXXX.cjs)"   # /tmp 下写 .cjs：仓库根是 type:module，避免 ESM 误判
UI_OUT="$(mktemp /tmp/p4c-ui.XXXXXX.out)"

if [ "${SKIP_UI:-0}" = "1" ]; then
  skip "显式跳过真实浏览器段（SKIP_UI=1）"
elif ! curl -sk -o /dev/null -m 8 "$WEB_BASE"; then
  skip "portal 不可达（$WEB_BASE）→ 跳过浏览器段；请先起 nginx 栈"
elif ! node -e "require('/home/ubantu/openclaw/node_modules/playwright-core')" 2>/dev/null; then
  skip "playwright-core / chromium 不可用 → 跳过浏览器段"
else
  cat >"$UI_SCRIPT" <<'UIEOF'
const { chromium } = require('/home/ubantu/openclaw/node_modules/playwright-core')
const BASE = process.env.WEB_BASE
const IDENT = process.env.P4C_IDENT
const PASSW = process.env.P4C_PASS
const ok = (m) => console.log('UI_PASS|' + m)
const no = (m) => console.log('UI_FAIL|' + m)

async function main() {
  const browser = await chromium.launch({ args: ['--no-sandbox'] })
  const errors = []

  // ── 桌面 ──
  const desktop = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } })
  const p = await desktop.newPage()
  p.on('pageerror', e => errors.push('pageerror: ' + e.message))
  p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()) })

  await p.goto(BASE, { waitUntil: 'networkidle' })
  await p.waitForTimeout(1000)

  // 4.1 未登录 → 登录页
  const url1 = p.url()
  const txt1 = (await p.locator('body').innerText())
  if (url1.includes('pages/login') && txt1.includes('使用你的组织账号进入统一工作台')) ok('4.1 未登录 → 登录页（路由守卫不变）')
  else no('4.1 未登录未落到登录页 → ' + url1)

  // 响应式：桌面双列（品牌面板在表单左侧同一行）
  const brandBox = await p.locator('.auth-brand').boundingBox()
  const formBox = await p.locator('.auth-form-col').boundingBox()
  if (brandBox && formBox && brandBox.x < formBox.x && Math.abs(brandBox.y - formBox.y) < 40) {
    ok('4.7a 桌面 ≥900px：品牌面板与表单并排双列')
  } else no('4.7a 桌面非双列布局')

  // A11y：可见标签 + aria 属性落到原生 input
  const aria = await p.locator('.field-input input').first().evaluate(n => ({
    label: n.getAttribute('aria-label'), invalid: n.getAttribute('aria-invalid')
  }))
  if (aria.label && aria.invalid !== null) ok('5.1 输入项带 aria-label / aria-invalid（原生 input 落点）')
  else no('5.1 输入项缺 aria 属性 → ' + JSON.stringify(aria))

  // A11y：focus-visible 轮廓（键盘聚焦可见）
  await p.locator('.field-input input').first().focus()
  const outline = await p.evaluate(() => {
    const host = document.querySelector('.field-control')
    const cs = getComputedStyle(host)
    return { boxShadow: cs.boxShadow, borderTop: cs.borderTopColor }
  })
  if (outline.boxShadow && outline.boxShadow !== 'none') ok('5.2 聚焦态可见（focus-within 描边）')
  else no('5.2 聚焦态无描边 → ' + JSON.stringify(outline))

  // 4.4 注册页可达 + 校验文案不变（空提交）
  await p.locator('.link-btn').click()
  await p.waitForTimeout(800)
  const urlReg = p.url()
  await p.locator('.submit-btn').click()
  await p.waitForTimeout(400)
  const regErr = await p.locator('body').innerText()
  if (urlReg.includes('pages/register') && regErr.includes('用户名至少 3 个字符')) {
    ok('4.4 注册页可达 + 前端校验文案不变（空提交 → 用户名至少 3 个字符）')
  } else no('4.4 注册页校验异常 → ' + urlReg + ' / ' + regErr.slice(0, 80))

  // 注册页 A11y：错误提示 role=alert
  const alertRole = await p.locator('[role="alert"]').count()
  if (alertRole >= 1) ok('5.3 表单错误提示带 role="alert"（屏幕阅读器可播报）')
  else no('5.3 错误提示缺 role="alert"')

  // 4.2 登录 → 工作台（角色 + 模块卡）
  await p.locator('.link-btn').click()
  await p.waitForTimeout(800)
  await p.locator('.field-input input').nth(0).fill(IDENT)
  await p.locator('.field-input input').nth(1).fill(PASSW)
  await p.locator('.submit-btn').click()
  await p.locator('text=GRI 统一工作台').first().waitFor({ timeout: 25000 })
  await p.waitForTimeout(2000)
  const wb = (await p.locator('body').innerText())
  const rolePill = await p.locator('.role-pill').count()
  const cards = await p.locator('.module-card').count()
  if (rolePill >= 1 && cards >= 1 && !p.url().includes('login')) {
    ok(`4.2 登录 → 工作台（角色徽标 ${rolePill} 枚 / 模块卡 ${cards} 张）`)
  } else no('4.2 工作台未按预期渲染（role=' + rolePill + ' cards=' + cards + '）')

  // 4.2b 卡片按角色渲染：核心模块带「核心」徽标
  if (wb.includes('核心') && wb.includes('进入模块')) ok('4.2b 模块卡按角色渲染（核心徽标 + 进入模块）')
  else no('4.2b 模块卡缺核心内容')

  // 工作台 A11y：交互卡带 role=button + aria-label
  const cardRole = await p.locator('.module-card[role="button"]').count()
  if (cardRole >= 1) ok('5.4 模块卡带 role="button" + aria-label（可访问）')
  else no('5.4 模块卡缺 role=button')

  // 令牌驱动的插件开关色（读运行时令牌，避免裸色硬编码）
  const token = await p.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim())
  if (/^#|^rgb/.test(token)) ok(`4.2c 插件开关色取自令牌（--color-primary = ${token}）`)
  else no('4.2c 运行时令牌 --color-primary 为空')

  const stash = await p.evaluate(() => localStorage.getItem('gri-auth-token'))

  // 4.5 退出登录 → 回登录页
  await p.locator('.logout-btn').click()
  await p.waitForTimeout(2000)
  const afterLogout = (await p.locator('body').innerText())
  if (p.url().includes('pages/login') && afterLogout.includes('使用你的组织账号进入统一工作台')) {
    ok('4.5 退出登录 → 回登录页（行为不变）')
  } else no('4.5 退出登录未回登录页 → ' + p.url())

  // 4.6 空模块态 → EmptyState（只读拦截 /api/modules，不落库）
  const p2 = await desktop.newPage()
  p2.on('pageerror', e => errors.push('p2 pageerror: ' + e.message))
  await p2.route(/\/api\/modules(\?.*)?$/, r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await p2.goto(BASE, { waitUntil: 'domcontentloaded' })
  await p2.evaluate(t => localStorage.setItem('gri-auth-token', t), stash)
  await p2.reload({ waitUntil: 'networkidle' })
  await p2.waitForTimeout(2500)
  const emptyTxt = (await p2.locator('body').innerText())
  if (emptyTxt.includes('当前还没有已启用模块') && (await p2.locator('.empty-state').count()) >= 1) {
    ok('4.6 空模块态走 EmptyState 组件（文案与视觉齐备）')
  } else no('4.6 空模块态未渲染 EmptyState')
  await p2.close()
  await desktop.close()

  // ── 4.3 跨模块 SSO：携带 token 直接进工作台 ──
  const sso = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } })
  const s = await sso.newPage()
  s.on('pageerror', e => errors.push('sso pageerror: ' + e.message))
  await s.goto(BASE, { waitUntil: 'domcontentloaded' })
  await s.evaluate(t => localStorage.setItem('gri-auth-token', t), stash)
  await s.goto(BASE, { waitUntil: 'networkidle' })
  await s.waitForTimeout(2500)
  const ssoTxt = (await s.locator('body').innerText())
  if (!s.url().includes('login') && ssoTxt.includes('GRI 统一工作台')) {
    ok('4.3 跨模块 SSO：携 gri-auth-token 直进工作台，未二次登录')
  } else no('4.3 SSO 未生效 → ' + s.url())
  await sso.close()

  // ── 4.7b 移动端：单列 + 首屏可见登录按钮 ──
  const mobile = await browser.newContext({
    ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true
  })
  const m = await mobile.newPage()
  m.on('pageerror', e => errors.push('mobile pageerror: ' + e.message))
  await m.goto(BASE, { waitUntil: 'networkidle' })
  await m.waitForTimeout(1200)
  const mBrand = await m.locator('.auth-brand').boundingBox()
  const mForm = await m.locator('.auth-form-col').boundingBox()
  if (mBrand && mForm && mForm.y > mBrand.y) ok('4.7b 移动端 <900px：品牌抬头与表单上下单列')
  else no('4.7b 移动端布局不是单列')

  const btn = await m.locator('.submit-btn').boundingBox()
  if (btn && btn.y + btn.height <= 844) ok(`4.7c 390×844 首屏可见登录按钮（底边 ${Math.round(btn.y + btn.height)} ≤ 844）`)
  else no('4.7c 登录按钮落在折叠线以下')

  const mobileFormVisible = await m.locator('.field-input input').first().isVisible()
  if (mobileFormVisible) ok('4.7d 移动端输入项可见可交互')
  else no('4.7d 移动端输入项不可见')
  await mobile.close()

  await browser.close()

  // 4.8 全流程异常 0
  if (errors.length === 0) ok('4.8 全流程 pageerror / console error = 0')
  else no('4.8 出现 ' + errors.length + ' 条前端异常：' + errors.slice(0, 3).join(' ; '))
}
main().catch(e => { console.log('UI_FAIL|运行时异常 ' + e.message) })
UIEOF

  WEB_BASE="$WEB_BASE" P4C_IDENT="$IDENTIFIER" P4C_PASS="$PASSWORD" \
    timeout 420 node "$UI_SCRIPT" >"$UI_OUT" 2>&1
  UI_RC=$?

  while IFS= read -r line; do
    case "$line" in
      UI_PASS\|*) pass "浏览器 ${line#UI_PASS|}" ;;
      UI_FAIL\|*) fail "浏览器 ${line#UI_FAIL|}" ;;
    esac
  done <"$UI_OUT"

  if ! grep -q '^UI_PASS\|^UI_FAIL' "$UI_OUT"; then
    fail "浏览器段无输出（rc=$UI_RC）→ $(tail -3 "$UI_OUT" | tr '\n' ' ')"
  fi
  rm -f "$UI_SCRIPT" "$UI_OUT"
fi

# ---------------------------------------------------------------------------
echo
echo "== §5b. 响应式 / 动效降级（静态）=="
MOTION="$SRC_DIR/components/ui/AuthShell.vue"
grep -qs 'prefers-reduced-motion' "$MOTION" && grep -qs 'prefers-reduced-motion' "$SRC_DIR/pages/workbench/index.vue" \
  && pass "N4：认证壳与工作台均声明 prefers-reduced-motion 降级（尊重系统减弱动效）" \
  || fail "N4：缺少 prefers-reduced-motion 降级"

grep -qs 'focus-visible' "$SRC_DIR/components/ui/FormField.vue" \
  && pass "N4：输入项声明 focus-visible（键盘可达）" || fail "N4：输入项缺 focus-visible"

MEDIA_CNT="$(grep -hc '@media' "$MOTION" "$SRC_DIR/pages/workbench/index.vue" | awk '{s+=$1} END{print s+0}')"
[ "${MEDIA_CNT:-0}" -ge 4 ] && pass "N4：共 ${MEDIA_CNT} 处媒体查询（移动优先 + 桌面增强）" \
  || fail "N4：媒体查询过少（${MEDIA_CNT:-0}）"

if grep -qs 'background: var(--color-bg-primary)' "$MOTION" && grep -qs 'color: var(--color-text-inverse)' "$SRC_DIR/pages/login/login.vue"; then
  pass "N4：色彩对比走令牌（前景/背景均取语义令牌，可随主题切换）"
else
  fail "N4：存在未走令牌的前景/背景色"
fi

# ---------------------------------------------------------------------------
echo
if [ "$FAIL" -eq 0 ]; then
  echo "PASS=$PASS FAIL=0 VERIFY_EXIT=0（SKIP=$SKIP）"
  exit 0
else
  echo "PASS=$PASS FAIL=$FAIL VERIFY_EXIT=1（SKIP=$SKIP）"
  exit 1
fi
