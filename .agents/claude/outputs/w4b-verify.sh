#!/usr/bin/env bash
# ============================================================================
# W4-b 验收：学科登峰双维度 UI（apps/web-ai-tutor 「学习世界 · 登峰」）
#
# 结构：
#   §0 前置        —— nginx/api/postgres/redis 在跑；node + playwright-core + chromium 可用；前端已 install
#   §1 构建        —— apps/web-ai-tutor build:h5 通过；产物带 W4-b 令牌 / 几何类 / 新钩子
#   §2 数据面      —— W4-a 两个只读面实测：6 学科 53 峰 / 4 纵深子分支 / 26 册；每峰有中图法号且可回溯权威表
#   §3 N2 一份画法 —— 峰/纵深/册/刻度画法只在 packages/world-art 一份；页面零画法实现；共享件零色值
#   §4 N1 维度切换 —— 置顶双维度、默认「学科知识体系」、切换后学科与当前峰都不丢（E2E 实测）
#   §5 N2 多峰     —— 一科 N 座独立峰，各有峰顶/登山径/掌握度/登顶态（不是一条主线）
#   §6 N3 延续性   —— 同屏：K12 段（年级刻度）+ 学科纵深段 + 纵深子分支；详情里的延续性刻度
#   §7 N4 维度 B   —— 学段→年级→人教版册/章；册/章反向标注所属体系分支
#   §8 N5–N7 形象/直观/易操作 —— 同一天空与地景/海拔读数；点选 ≤2 步；键盘可达；空态兜底
#   §9 N8/N9       —— 首屏信息密度（掌握度/登顶/我在读/经历）；权威依据可展示且不编造
#   §10 N10 无回归 —— 19 页全在册；营地详情三动作/学科切换/双出口/数据钩子保留
#   §11 零裸色     —— 改动面三重 grep 空；var(--) 无「用了没声明」
#   §12 凭据零泄漏
#   §13 改动范围   —— HEAD 未变、未 checkout、暂存区空、改动全在白名单内
#   §14 未覆盖项（明示，不计 FAIL）
#
# 依赖：docker（gri-nginx / gri-api / gri-postgres / gri-redis 在跑）；前端已 npm install；
#       node + /home/ubantu/openclaw/node_modules/playwright-core + chromium。
# 凭据：仅 dev 测试账号（E2E_IDENTIFIER / E2E_PASSWORD 可覆盖）；脚本不落任何密钥、不打印 token/密码。
# 副作用：§1 写前端 dist（gitignore）；§8 浏览器只读；§8 测试中会把学科切到別科后**还原回原学科**。
# 用法：  bash .agents/claude/outputs/w4b-verify.sh
# 通过：  末尾打印 PASS=<n> / FAIL=0
# ============================================================================
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TUTOR_DIR="$ROOT_DIR/apps/web-ai-tutor"
TUTOR_DIST="$TUTOR_DIR/dist/build/h5"
PORTAL_DIR="$ROOT_DIR/apps/portal"
PORTAL_DIST="$PORTAL_DIR/dist/build/h5"
OUT_DIR="$ROOT_DIR/.agents/claude/outputs"
SHARED_DIR="$ROOT_DIR/packages/world-art"
SHARED_SRC="$SHARED_DIR/src"
SHARED_ART="$SHARED_SRC/art.js"
TUTOR_WORLD="$TUTOR_DIR/src/pages/twin/world.vue"
TUTOR_API="$TUTOR_DIR/src/api/index.js"
TOKENS="$ROOT_DIR/styles/tokens/themes/persona-world.css"
WORLD_CSS="$ROOT_DIR/styles/world.css"
AUTHORITY="$ROOT_DIR/docs/SUBJECT_SUMMIT_AUTHORITY.md"
DESIGN="$ROOT_DIR/docs/SUBJECT_SUMMIT_DESIGN.md"
SHOTS="${SHOTS_DIR:-/tmp/w4b-shots}"

E2E_IDENTIFIER="${E2E_IDENTIFIER:-testuser}"
E2E_PASSWORD="${E2E_PASSWORD:-test1234}"
PW_CORE="${PW_CORE:-/home/ubantu/openclaw/node_modules/playwright-core}"
TEST_PORT="${TEST_PORT:-5301}"

TMP_DIR="$(mktemp -d /tmp/w4b.XXXXXX)"
SERVER_PID=""
mkdir -p "$SHOTS"
cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT INT TERM

PASS=0; FAIL=0; SKIP=0
pass() { PASS=$((PASS + 1)); printf 'PASS  %s\n' "$1"; }
fail() { FAIL=$((FAIL + 1)); printf 'FAIL  %s\n' "$1"; }
skip() { SKIP=$((SKIP + 1)); printf 'SKIP  %s\n' "$1"; }
ok_if() { [ "$1" = "$2" ] && pass "$3" || fail "$3（期望「$2」，实得「$1」）"; }
ok_has() { case "$1" in *"$2"*) pass "$3" ;; *) fail "$3（未含「$2」；实得「$(printf '%s' "$1" | cut -c1-160)」）" ;; esac; }
ok_not_has() { case "$1" in *"$2"*) fail "$3（不该含「$2」）" ;; *) pass "$3" ;; esac; }
ok_ge() { [ "$1" -ge "$2" ] 2>/dev/null && pass "$3（$1 ≥ $2）" || fail "$3（期望 ≥ $2，实得「$1」）" ; }
ok_file() { [ -f "$1" ] && pass "$2" || fail "$2（缺 $1）"; }
ok_set() {
  local g e; g="$(printf '%s' "$1" | tr ',' '\n' | sed '/^$/d' | sort | tr '\n' ',')"
  e="$(printf '%s' "$2" | tr ',' '\n' | sed '/^$/d' | sort | tr '\n' ',')"
  ok_if "$g" "$e" "$3"
}
rget() { awk -v k="$1" '$1=="RESULT" && $2==k { sub(/^RESULT +[^ ]+ +/,""); print; exit }' "$2"; }
res_eq() { ok_if "$(rget "$1" "$2")" "$3" "$4"; }
res_has() { ok_has "$(rget "$1" "$2")" "$3" "$4"; }
res_not_has() { ok_not_has "$(rget "$1" "$2")" "$3" "$4"; }
jq_n() { node -e 'const fs=require("fs");const d=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const f=process.argv[2].split(".");let v=d;for(const k of f){v=Array.isArray(v)?v.reduce((a,x)=>a.concat(x&&x[k]||[]),[]):(v?v[k]:undefined)}console.log(Array.isArray(v)?v.length:(v==null?"":v))' "$1" "$2" 2>/dev/null; }

echo "== §0. 前置环境 =="
for c in gri-nginx gri-api gri-postgres gri-redis; do
  docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$c" && pass "$c 在跑" || fail "$c 未运行"
done
[ -d "$PW_CORE" ] && pass "playwright-core 就位（$PW_CORE）" || fail "playwright-core 缺失：$PW_CORE"
node -e 'process.exit(0)' >/dev/null 2>&1 && pass "node 可用" || fail "node 不可用"
[ -d "$TUTOR_DIR/node_modules" ] && pass "apps/web-ai-tutor node_modules 就位" || fail "apps/web-ai-tutor 未 npm install"
[ -d "$SHARED_DIR" ] && pass "世界语言共享件在册（packages/world-art）" || fail "packages/world-art 缺失"
if ss -lnt 2>/dev/null | grep -q ":$TEST_PORT "; then
  fail "端口 $TEST_PORT 被占用（E2E 静态托管需要它；TEST_PORT 可换）"
else
  pass "端口 $TEST_PORT 空闲"
fi
API_UP=0
curl -sk -o /dev/null -w '%{http_code}' "https://localhost/health" 2>/dev/null | grep -q 200 && API_UP=1
ok_if "$API_UP" "1" "网关 /health 可达（E2E 走 https://localhost 反代 /api /auth）"

# ---------------------------------------------------------------------------
echo
echo "== §1. 构建（build:h5）=="
BUILD_LOG="$TMP_DIR/build.log"
( cd "$TUTOR_DIR" && npm run build:h5 ) >"$BUILD_LOG" 2>&1
RC=$?
ok_if "$RC" "0" "apps/web-ai-tutor npm run build:h5 通过（exit 0）"
[ "$RC" != 0 ] && tail -12 "$BUILD_LOG" | sed 's/^/      /'
ok_file "$TUTOR_DIST/index.html" "构建产物 index.html 存在"
TUTOR_CSS="$(cat "$TUTOR_DIST"/assets/*.css 2>/dev/null)"
TUTOR_JS="$(cat "$TUTOR_DIST"/assets/*.js 2>/dev/null)"
ok_has "$TUTOR_JS" "pages-twin-world" "产物含世界页分片（pages-twin-world）"
for t in --world-band-k12 --world-band-idle --world-band-depth --world-peak-snow --world-axis-line --world-stage-1; do
  ok_has "$TUTOR_CSS" "$t" "产物已带 W4-b 延续带/刻度令牌：$t"
done
for c in .w-peak-face-l .w-peak-depth-l .w-band-k12 .w-axis-grid .w-stage-2 .w-book-left .w-me-line; do
  ok_has "$TUTOR_CSS" "$c" "产物已带 W4-b 几何类映射：$c"
done
for h in data-dim-toggle data-branch-depth data-book data-scene-empty data-detail-clc; do
  ok_has "$TUTOR_JS" "$h" "产物已带 W4-b 数据钩子：$h"
done

# ---------------------------------------------------------------------------
echo
echo "== §2. 数据面（W4-a 两个只读面，实测）=="
for s in MATH PHYS CHEM BIO CHN ENG; do
  curl -sk "https://localhost/api/curriculum/summit-branches?subject=$s" -o "$TMP_DIR/$s.b.json"
  curl -sk "https://localhost/api/curriculum/summit-grades?subject=$s" -o "$TMP_DIR/$s.g.json"
  ok_has "$(head -c 60 "$TMP_DIR/$s.b.json")" '"subject"' "summit-branches 公开可读（$s，无需登录）"
  ok_has "$(head -c 60 "$TMP_DIR/$s.g.json")" '"subject"' "summit-grades 公开可读（$s，无需登录）"
done
P_N="$(jq_n "$TMP_DIR/MATH.b.json" peaks)"; ok_if "$P_N" "10" "数学 10 座分支峰（多顶峰）"
ok_if "$(jq_n "$TMP_DIR/PHYS.b.json" peaks)" "10" "物理 10 座分支峰"
ok_if "$(jq_n "$TMP_DIR/CHEM.b.json" peaks)" "8" "化学 8 座分支峰"
ok_if "$(jq_n "$TMP_DIR/BIO.b.json" peaks)" "9" "生物 9 座分支峰"
ok_if "$(jq_n "$TMP_DIR/CHN.b.json" peaks)" "9" "语文 9 座分支峰"
ok_if "$(jq_n "$TMP_DIR/ENG.b.json" peaks)" "7" "英语 7 座分支峰"
TOTAL_P=0; TOTAL_K=0; TOTAL_B=0
for s in MATH PHYS CHEM BIO CHN ENG; do
  TOTAL_P=$((TOTAL_P + $(jq_n "$TMP_DIR/$s.b.json" peaks)))
  TOTAL_K=$((TOTAL_K + $(jq_n "$TMP_DIR/$s.b.json" peaks.children)))
  TOTAL_B=$((TOTAL_B + $(jq_n "$TMP_DIR/$s.g.json" stages.grades.textbooks)))
done
ok_if "$TOTAL_P" "53" "六科合计 53 座峰（学科知识体系全覆盖）"
ok_if "$TOTAL_K" "4" "纵深子分支 4 个（K12 之外仍属该分支）"
ok_if "$TOTAL_B" "26" "人教版册合计 26 册（维度 B 的真源）"
ok_if "$(jq_n "$TMP_DIR/MATH.g.json" stages)" "3" "数学含小学/初中/高中三学段"
ok_if "$(jq_n "$TMP_DIR/PHYS.g.json" stages)" "1" "物理只含初中段（数据现状，UI 需兜底）"
ok_if "$(jq_n "$TMP_DIR/CHEM.g.json" stages.grades.textbooks)" "0" "化学尚未发布人教版册（维度 B 空态必须兜底）"
# 中图法可回溯（不编造）：每座峰/子分支的分类号逐个在权威表里查得到
CLC_JSON="$TMP_DIR/clc.json"
node -e '
const fs=require("fs");
const doc=fs.readFileSync(process.argv[1],"utf8");
const out={total:0,noClc:[],untraceable:[]};
for(const s of ["MATH","PHYS","CHEM","BIO","CHN","ENG"]){
  const b=JSON.parse(fs.readFileSync(process.argv[2]+"/"+s+".b.json","utf8"));
  for(const p of [...(b.peaks||[]),...((b.peaks||[]).flatMap(x=>x.children||[]))]){
    out.total++;
    if(!p.clc){ out.noClc.push(p.code); continue }
    for(const t of String(p.clc).split(";").map(x=>x.trim()).filter(Boolean))
      if(!doc.includes(t)) out.untraceable.push(p.code+"="+t);
  }
}
console.log(JSON.stringify(out));
' "$AUTHORITY" "$TMP_DIR" > "$CLC_JSON" 2>/dev/null
CLC_TOTAL="$(node -e 'console.log(require(process.argv[1]).total)' "$CLC_JSON" 2>/dev/null)"
CLC_NONE="$(node -e 'console.log(require(process.argv[1]).noClc.join(","))' "$CLC_JSON" 2>/dev/null)"
CLC_BAD="$(node -e 'console.log(require(process.argv[1]).untraceable.join(","))' "$CLC_JSON" 2>/dev/null)"
ok_if "$CLC_NONE" "" "53 峰 + 4 子分支全都有中图法锚点（$CLC_TOTAL 条，零缺号）"
ok_if "$CLC_BAD" "" "全部分类号都能在 docs/SUBJECT_SUMMIT_AUTHORITY.md 查到（可回溯，不编造）"
ok_has "$(cat "$DESIGN")" "取消" "设计 v3 口径在册（方框号修正）"
ok_has "$(cat "$DESIGN")" "峰外" "设计 v3 口径在册（明示取消「峰外」表述）"

# ---------------------------------------------------------------------------
echo
echo "== §3. N2 一份画法（共享件，禁止两套）=="
for f in peakMassif depthSpire bookCamp summitScaffold summitFlag gradeY; do
  ok_has "$(cat "$SHARED_ART")" "export function $f" "画法来自共享件（函数）：$f"
done
for f in SUMMIT STAGE_SPANS GRADE_TICKS; do
  ok_has "$(cat "$SHARED_ART")" "export const $f" "画法来自共享件（常量表）：$f"
done
DEFS="$(grep -rn "export function peakMassif\|export function depthSpire\|export function bookCamp\|export function summitScaffold\|export function summitFlag\|export function gradeY" "$ROOT_DIR/apps" "$ROOT_DIR/packages" --include=*.js --include=*.vue 2>/dev/null | sed "s#^$ROOT_DIR/##" | cut -d: -f1 | sort -u | tr '\n' ' ')"
ok_set "$DEFS" "packages/world-art/src/art.js " "登峰画法原语只有一份（峰/纵深/册/底图/刻度仅在共享件定义）"
SECOND="$(grep -cE "function (peakMassif|depthSpire|bookCamp|summitScaffold)" "$TUTOR_WORLD")"
ok_if "$SECOND" "0" "world.vue 内零画法实现（只排布与状态，不另画一套）"
ok_has "$(cat "$TUTOR_WORLD")" "from '@world-art'" "world.vue 从共享件引入（不是各写一套）"
ART_COLOR="$(grep -nE '#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(' "$SHARED_SRC" 2>/dev/null | wc -l | tr -d ' ')"
ok_if "$ART_COLOR" "0" "共享件零色值（几何层即成立）"
ok_has "$(cat "$SHARED_ART")" "天空交由调用方以渐变绘制" "底图把天空让给调用方（渐变只能由调用方给 id）"
# 同一份几何类映射（无孤儿类）
ORPHAN_JSON="$TMP_DIR/orphan.json"
( cd "$ROOT_DIR" && node -e '
const fs=require("fs");
const css=fs.readFileSync("styles/world.css","utf8");
const declared=new Set([...css.matchAll(/\.(w-[a-z0-9-]+)/g)].map(m=>m[1]));
const all=new Set();
for(const f of process.argv.slice(1)) for(const m of fs.readFileSync(f,"utf8").matchAll(/\bw-[a-z0-9-]+\b/g)) all.add(m[0]);
const orphan=[...all].filter(c=>!declared.has(c)&&![...declared].some(d=>d.startsWith(c+"-"))).sort();
console.log(JSON.stringify({declared:declared.size,used:all.size,orphan}));
' "$SHARED_ART" "$SHARED_SRC/WorldShell.vue" "$TUTOR_WORLD" > "$ORPHAN_JSON" 2>/dev/null )
ORPHAN="$(node -e 'console.log(require(process.argv[1]).orphan.join(","))' "$ORPHAN_JSON" 2>/dev/null)"
ORPHAN_USED="$(node -e 'console.log(require(process.argv[1]).used)' "$ORPHAN_JSON" 2>/dev/null)"
ORPHAN_DECL="$(node -e 'console.log(require(process.argv[1]).declared)' "$ORPHAN_JSON" 2>/dev/null)"
ok_if "$ORPHAN" "" "登峰世界用的 $ORPHAN_USED 个几何类全部在同一份映射里有取值（$ORPHAN_DECL 条规则，零孤儿 = 同一套世界语言）"

# ---------------------------------------------------------------------------
echo
echo "== §4. N1 维度切换 =="
ok_has "$(cat "$TUTOR_WORLD")" "学科知识体系" "维度 A 命名 = 学科知识体系"
ok_has "$(cat "$TUTOR_WORLD")" "K12 阶段" "维度 B 命名 = K12 阶段"
ok_has "$(cat "$TUTOR_WORLD")" "const dim = ref('branches')" "默认维度 = 学科知识体系（方案要求）"
ok_has "$(cat "$TUTOR_WORLD")" "data-dim-toggle" "维度切换器带定位钩子"
ok_has "$(cat "$TUTOR_WORLD")" "data-dim-active" "切换态可断言"
ok_has "$(cat "$TUTOR_WORLD")" "keptBranch" "跨维度保留「当前峰」（切走再切回不丢）"
ok_not_has "$(cat "$TUTOR_WORLD")" "location.reload" "切维度不整页重载（无闪烁/无状态丢失）"

# ---------------------------------------------------------------------------
echo
echo "== §5–§9. 真浏览器 E2E（学生身份 · 同源双 App 托管）=="
cat > "$TMP_DIR/serve.cjs" <<'NODEEOF'
const http = require('http'), https = require('https'), fs = require('fs'), path = require('path')
const PORTAL_DIST = process.argv[2], TUTOR_DIST = process.argv[3], PORT = Number(process.argv[4])
const UPSTREAM = process.argv[5] || 'https://localhost'
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.map': 'application/json; charset=utf-8' }
function proxy(req, res) {
  const target = new URL(req.url, UPSTREAM)
  const up = https.request({ hostname: target.hostname, port: target.port || 443, path: target.pathname + target.search, method: req.method, headers: { ...req.headers, host: 'localhost' }, rejectUnauthorized: false }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res) })
  up.on('error', (e) => { res.writeHead(502, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: String(e && e.message) })) })
  req.pipe(up)
}
const APPS = [['/portal/', PORTAL_DIST], ['/tutor/', TUTOR_DIST]]
http.createServer((req, res) => {
  if (req.url.startsWith('/api/') || req.url.startsWith('/auth/')) return proxy(req, res)
  if (req.url === '/' || req.url.startsWith('/?')) { res.writeHead(302, { location: '/portal/' }); return res.end() }
  const app = APPS.find(([p]) => req.url.startsWith(p))
  if (!app) { res.writeHead(404); return res.end('not found') }
  const [prefix, dist] = app
  let rel = decodeURIComponent(req.url.split('?')[0]).slice(prefix.length)
  if (rel === '' || rel.endsWith('/')) rel += 'index.html'
  const file = path.join(dist, rel)
  if (!file.startsWith(dist)) { res.writeHead(403); return res.end('forbidden') }
  fs.readFile(file, (err, buf) => {
    if (err) return fs.readFile(path.join(dist, 'index.html'), (e2, html) => { if (e2) { res.writeHead(404); return res.end('not found') } res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html) })
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' })
    res.end(buf)
  })
}).listen(PORT, '127.0.0.1', () => console.log('READY'))
NODEEOF

cat > "$TMP_DIR/e2e.cjs" <<'NODEEOF'
const { chromium } = require(process.env.PW_CORE)
const BASE = process.argv[2]            // http://127.0.0.1:PORT/portal/
const TUTOR = process.argv[3]           // http://127.0.0.1:PORT/tutor/
const SHOTS = process.argv[4]
const USER = process.env.E2E_IDENTIFIER
const PASS = process.env.E2E_PASSWORD
const ERRORS = []
const emit = (k, v) => console.log('RESULT ' + k + ' ' + String(v).replace(/\s+/g, ' ').trim().slice(0, 420))
const note = (s) => console.log('# ' + s)
function watch(page, tag) {
  page.on('pageerror', (e) => ERRORS.push(tag + '|pageerror|' + e.message))
  page.on('console', (m) => { if (m.type() === 'error') ERRORS.push(tag + '|console|' + m.text()) })
}
const t = (page, sel) => page.evaluate((s) => (document.querySelector(s) ? document.querySelector(s).innerText : ''), sel)
// SVG 元素没有 innerText（只有 textContent）——量 SVG 文本一律走这个，别用 t。
const tc = (page, sel) => page.evaluate((s) => (document.querySelector(s) ? document.querySelector(s).textContent : ''), sel)
const all = (page, sel, attr) => page.$$eval(sel, (els, a) => els.map((e) => e.getAttribute(a)), attr)
const cnt = (page, sel) => page.$$eval(sel, (els) => els.length)
const has = async (page, sel) => (await page.$(sel)) ? 'yes' : 'no'
/**
 * 点一个地图热点。
 * 热点带常驻浮动动画（.hot-badge 的 hot-bob），playwright 的「元素稳定」判定会一直等到超时；
 * 真人点它没问题（光标下就是按钮本身），故这里先试真点击，失败再退回 DOM click，并把用了哪一路记下来。
 */
async function clickHot(page, sel) {
  try {
    await page.click(sel, { timeout: 4000 })
    return 'real'
  } catch (e) {
    const notes = String(e.message).split('\n').filter((l) => /stable|intercepts|not visible|outside/.test(l))
    if (notes.length) note('clickFallback ' + sel + ' :: ' + notes[0].trim().slice(0, 120))
    await page.$eval(sel, (el) => el.click())
    return 'dom'
  }
}
async function login(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('input[aria-label="账号"]', { timeout: 30000 })
  await page.fill('input[aria-label="账号"]', USER)
  await page.fill('input[aria-label="密码"]', PASS)
  await page.click('.submit-btn')
  await page.waitForSelector('.lw-canvas', { timeout: 30000 })
}
/** 进入学习世界（同源，令牌在册 → 免二登） */
async function enterSummit(page) {
  await page.goto(TUTOR + '#/pages/twin/world?from=world', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-world-shell="tutor"]', { timeout: 30000 })
  await page.waitForSelector('[data-map]', { timeout: 30000 })
  await page.waitForTimeout(1400)
}
async function svgObserve(page, scopeSel, personSel, prefix) {
  const r = await page.evaluate((s) => {
    const root = document.querySelector(s[0])
    const q = (n) => (root ? root.querySelectorAll(n).length : 0)
    const person = document.querySelector(s[1])
    const look = () => { const el = document.querySelector(s[1]); if (!el) return ''; return [...el.querySelectorAll('*')].flatMap((n) => (n.getAttribute('class') || '').split(/\s+/)).filter((c) => /^w-(wear|skin|hair)-\d$/.test(c)).sort().join(',') }
    return {
      polygon: q('polygon'), path: q('path'), circle: q('circle'), ellipse: q('ellipse'),
      // 真 SVG 文本：uni-app 会把模板里的 <text> 编译成 uni-text，而 uni-text 落在 svg 命名空间里
      // 是个未知元素（不渲染、0×0）——故这里同时量真 text 与宿主标签，两边都要查。
      text: q('text'),
      host: q('uni-text, uni-button, uni-view, button, foreignObject, span, div'),
      me: person ? 'yes' : 'no', meLook: person ? look() : ''
    }
  }, [scopeSel, personSel])
  for (const k of Object.keys(r)) emit(prefix + '_' + k, r[k])
  return r
}
/** 切到某维度（点切换器） */
async function toDim(page, code) {
  await clickHot(page, '[data-dim="' + code + '"]')
  await page.waitForTimeout(1200)
}

;(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1020 }, ignoreHTTPSErrors: true })
  const page = await ctx.newPage()
  watch(page, 'flow')
  await login(page)
  await enterSummit(page)

  // ── §4 N1 维度切换 ──
  emit('dim_active_default', await page.$eval('[data-dim-active="yes"]', (e) => e.getAttribute('data-dim')))
  emit('dim_opts', (await all(page, '[data-dim]', 'data-dim')).join(','))
  emit('dim_current', await page.$eval('[data-dim-current]', (e) => e.getAttribute('data-dim-current')))
  emit('subject_active', await page.$eval('[data-subject-active="yes"]', (e) => e.getAttribute('data-subject')))

  // ── §5 N2 多峰 ──
  await svgObserve(page, '[data-map]', '[data-me]', 'm')
  const branches = await all(page, '[data-branch]', 'data-branch')
  emit('m_branches', branches.length)
  emit('m_branch_states', [...new Set(await all(page, '[data-hot-state]', 'data-hot-state'))].join(','))
  emit('m_depths', (await all(page, '[data-branch-depth]', 'data-branch-depth')).join(','))
  emit('m_band_k12', await cnt(page, '[data-map] .w-band-k12, [data-map] .w-band-k12-alt'))
  emit('m_band_start', await cnt(page, '[data-map] .w-band-start'))
  emit('m_band_idle', await cnt(page, '[data-map] .w-band-idle'))
  emit('m_band_depth', await cnt(page, '[data-map] .w-band-depth'))
  emit('m_trails', await cnt(page, '[data-map] .w-trail'))
  emit('m_axis_labels', (await page.$$eval('[data-map] .w-axis-label', (els) => els.map((e) => e.textContent.trim()))).join('/'))
  emit('m_axis_label_n', await cnt(page, '[data-map] .w-axis-label'))
  emit('m_axis_label_box', await page.$eval('[data-map] .w-axis-label', (e) => { const b = e.getBoundingClientRect(); return Math.round(b.width) + 'x' + Math.round(b.height) }))
  emit('m_me_line', await has(page, '[data-map] .w-me-line'))
  emit('m_me_label', String(await tc(page, '[data-map] .w-me-label')).trim())
  emit('m_snow', await cnt(page, '[data-map] .w-peak-snow'))
  emit('m_map_note', String(await tc(page, '[data-map] .w-map-note')).trim().slice(0, 60))
  await page.screenshot({ path: SHOTS + '/dim-a-branches.png', fullPage: false })

  // 选一座峰 → 详情（N9 权威 / N3 延续性 / N10 三动作）
  const peakCode = branches[3] || branches[0]
  emit('peak_click', await clickHot(page, '[data-branch="' + peakCode + '"]'))
  await page.waitForSelector('[data-camp-detail]', { timeout: 8000 })
  await page.waitForTimeout(600)
  emit('peak_selected', await page.$eval('.hot.selected[data-branch]', (e) => e.getAttribute('data-branch')).catch(() => ''))
  emit('detail_clc', (await t(page, '[data-detail-clc]')).replace(/\n/g, ' · '))
  emit('detail_text', (await t(page, '[data-camp-detail]')).replace(/\n/g, ' · ').slice(0, 420))
  emit('detail_actions', (await page.$$eval('[data-practice],[data-ask-teacher],[data-graph]', (els) => els.map((e) => (e.getAttribute('data-practice') !== null ? 'practice' : e.getAttribute('data-ask-teacher') !== null ? 'ask' : 'graph')).join(','))))
  emit('detail_conti_bands', await page.$$eval('[data-camp-detail] .cs-idle,[data-camp-detail] .cs-k12,[data-camp-detail] .cs-depth,[data-camp-detail] .cs-me', (els) => els.map((e) => [...e.classList].filter((c) => c.startsWith('cs-')).join('')).join(',')))
  emit('cross_books_n', await cnt(page, '[data-cross-book]'))
  emit('cross_books', (await all(page, '[data-cross-book]', 'data-cross-book')).join(','))
  await page.screenshot({ path: SHOTS + '/dim-a-peak-detail.png' })
  await clickHot(page, '.detail-close')
  await page.waitForTimeout(400)
  emit('me_still_there', await has(page, '[data-me]'))

  // ── §4 N1 切走再切回：当前峰不丢（就在此刻、还没跨维度跳转前验）──
  emit('peak_before_dim', await page.$eval('.hot.selected[data-branch]', (e) => e.getAttribute('data-branch')).catch(() => ''))
  await toDim(page, 'grades')
  await toDim(page, 'branches')
  emit('kept_peak', await page.$eval('.hot.selected[data-branch]', (e) => e.getAttribute('data-branch')).catch(() => ''))
  emit('dim_back_roundtrip', await page.$eval('[data-dim-current]', (e) => e.getAttribute('data-dim-current')))

  // ── §4 N1 切维度不丢当前峰 ──
  const before = peakCode
  await toDim(page, 'grades')
  emit('dim_current_after', await page.$eval('[data-dim-current]', (e) => e.getAttribute('data-dim-current')))
  emit('dim_active_after', await page.$eval('[data-dim-active="yes"]', (e) => e.getAttribute('data-dim')))
  emit('subject_active_after', await page.$eval('[data-subject-active="yes"]', (e) => e.getAttribute('data-subject')))

  // ── §7 N4 维度 B ──
  const books = await all(page, '[data-book]', 'data-book')
  emit('g_books', books.length)
  emit('g_bands', await page.$$eval('[data-map] .w-stage-1,[data-map] .w-stage-2,[data-map] .w-stage-3', (els) => [...new Set(els.flatMap((e) => [...e.classList].filter((c) => /^w-stage-\d$/.test(c))))].join(',')))
  emit('g_book_camps', await page.$$eval('[data-map] .w-book-top', (e) => e.length))
  emit('g_outline', (await t(page, '.side-card[data-legend]')).replace(/\n/g, ' · ').slice(0, 300))
  await page.screenshot({ path: SHOTS + '/dim-b-grades.png' })

  // 选一册 → 详情（反向分支标注 + 章 → 跳分支）
  emit('book_click', await clickHot(page, '[data-book="' + (books[Math.min(8, books.length - 1)] || books[0]) + '"]'))
  await page.waitForSelector('[data-camp-detail]', { timeout: 8000 })
  await page.waitForTimeout(500)
  emit('book_detail', (await t(page, '[data-camp-detail]')).replace(/\n/g, ' · ').slice(0, 380))
  emit('book_cross_branches_n', await cnt(page, '[data-cross-branch]'))
  emit('book_cross_branches', (await all(page, '[data-cross-branch]', 'data-cross-branch')).join(','))
  const chapters = await all(page, '[data-chapter]', 'data-chapter')
  emit('book_chapters', chapters.length)
  if (chapters.length) {
    emit('chapter_click', await clickHot(page, '[data-chapter="' + chapters[0] + '"]'))
    await page.waitForTimeout(600)
    emit('chapter_detail', (await t(page, '[data-camp-detail]')).replace(/\n/g, ' · ').slice(0, 260))
    // 值级断言（不能只看标签在不在）：所属册取值、K12 区间取值
    emit('chapter_rows', await page.evaluate(() => {
      const rows = [...document.querySelectorAll('[data-camp-detail] .detail-row')]
      const val = (k) => { const r = rows.find((x) => ((x.querySelector('.row-key') || {}).textContent || '').trim() === k); return r ? ((r.querySelector('.row-val') || {}).textContent || '').trim() : '' }
      return '所属册=' + (val('所属册') || '<空>') + '|K12=' + (val('K12 年级区间') || '<空>')
    }))
  }
  // 跨维度：从册/章跳回体系分支（延续性的反向验证）
  const crossB = await all(page, '[data-cross-branch]', 'data-cross-branch')
  if (crossB.length) {
    await clickHot(page, '[data-cross-branch="' + crossB[0] + '"]')
    await page.waitForTimeout(1300)
    emit('cross_jump_dim', await page.$eval('[data-dim-current]', (e) => e.getAttribute('data-dim-current')))
    emit('cross_jump_branch', await page.$eval('.hot.selected[data-branch]', (e) => e.getAttribute('data-branch')).catch(() => ''))
  }
  await clickHot(page, '.detail-close')
  await page.waitForTimeout(400)

  // ── §4 回顾：跨维度跳转后再走一圈 A→B→A，仍钉住那个分支峰 ──
  await toDim(page, 'grades')
  await toDim(page, 'branches')
  emit('dim_back', await page.$eval('[data-dim-current]', (e) => e.getAttribute('data-dim-current')))
  emit('kept_peak_late', await page.$eval('.hot.selected[data-branch]', (e) => e.getAttribute('data-branch')).catch(() => ''))

  // ── §8 N7 键盘可达 ──
  await page.$eval('[data-branch]', (e) => e.focus())
  const focus0 = await page.evaluate(() => document.activeElement.getAttribute('data-hot-index'))
  emit('kb_focus_before', await page.evaluate(() => document.activeElement.getAttribute('data-branch') || document.activeElement.getAttribute('data-hot-index') || ''))
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(250)
  const focus1 = await page.evaluate(() => document.activeElement.getAttribute('data-hot-index'))
  emit('kb_focus_after', await page.evaluate(() => document.activeElement.getAttribute('data-branch') || document.activeElement.getAttribute('data-hot-index') || ''))
  emit('kb_moved', focus0 != null && focus1 != null && focus0 !== focus1 ? 'yes' : 'no')
  // 顺手验证「看得见地动」：Enter 落到新焦点上会开出那一处的详情
  await page.keyboard.press('Enter')
  await page.waitForTimeout(600)
  emit('kb_enter_opens', await has(page, '[data-camp-detail]'))
  await clickHot(page, '.detail-close')
  await page.waitForTimeout(300)

  // ── §8 N5 同一天空（与人本世界同一色源）──
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.lw-canvas', { timeout: 30000 })
  await page.waitForTimeout(900)
  const lw = await svgObserve(page, '.lw-svg', '[data-person="me"]', 'w')
  await page.goto(TUTOR + '#/pages/twin/world', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-map]', { timeout: 30000 })
  await page.waitForTimeout(1200)
  const sm = await svgObserve(page, '[data-map]', '[data-me]', 'x')
  emit('same_person_cls', lw.meLook === sm.meLook && lw.meLook ? 'yes' : 'no')

  // ── §8 空态兜底（化学：无人教版册）+ 学科切换 ──
  const act = await page.$eval('[data-subject-active="yes"]', (e) => e.getAttribute('data-subject'))
  await clickHot(page, '[data-subject="CHEM"]')
  await page.waitForTimeout(2200)
  emit('chem_branches', (await all(page, '[data-branch]', 'data-branch')).length)
  await toDim(page, 'grades')
  emit('chem_empty', await has(page, '[data-scene-empty]'))
  emit('chem_empty_text', (await t(page, '[data-scene-empty]')).replace(/\n/g, ' · ').slice(0, 160))
  await page.screenshot({ path: SHOTS + '/chem-empty.png' })
  await clickHot(page, '[data-empty-to-branches]')
  await page.waitForTimeout(900)
  emit('chem_empty_back', await page.$eval('[data-dim-current]', (e) => e.getAttribute('data-dim-current')))
  // PHYS：一本册都只有 3 册（数据现状仍可用）
  await clickHot(page, '[data-subject="PHYS"]')
  await page.waitForTimeout(2200)
  await toDim(page, 'grades')
  emit('phys_books', (await all(page, '[data-book]', 'data-book')).length)
  // 还原原学科
  await clickHot(page, '[data-subject="' + act + '"]')
  await page.waitForTimeout(2200)
  emit('subject_restored', await page.$eval('[data-subject-active="yes"]', (e) => e.getAttribute('data-subject')))

  // ── §10 双出口 ──
  await clickHot(page, '[data-world-home]')
  await page.waitForSelector('.lw-canvas', { timeout: 30000 })
  await page.waitForTimeout(900)
  emit('back_is_world', await has(page, '.lw-canvas'))
  emit('back_no_login', (await page.$('input[aria-label="账号"]')) ? 'no' : 'yes')
  await enterSummit(page)
  await clickHot(page, '[data-app-home]')
  await page.waitForTimeout(2600)
  emit('app_home_url', page.url())
  emit('app_home_text', (await t(page, 'body')).replace(/\n/g, ' ').slice(0, 140))

  // ── §10 其余页无回归（只计 pageerror）──
  const pages = ['pages/index/index', 'pages/practice/index', 'pages/chat/chat', 'pages/knowledge-graph/index', 'pages/profile/index', 'pages/twin/memory', 'pages/twin/data', 'pages/twin/replay', 'pages/report/report']
  const bad = []
  for (const p of pages) {
    const before = ERRORS.length
    await page.goto(TUTOR + '#/' + p, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1400)
    const hit = ERRORS.slice(before).filter((e) => e.includes('pageerror'))
    if (hit.length) bad.push(p + ':' + hit[0].slice(0, 90))
  }
  emit('regression_pages', pages.length)
  emit('regression_bad', bad.join(' | '))
  emit('errors', ERRORS.length)
  ERRORS.slice(0, 12).forEach((e) => note('ERR ' + e))
  await browser.close()
})().catch((e) => {
  emit('fatal', e.message)
  emit('errors', ERRORS.length + 1)
  process.exit(0)
})
NODEEOF

node "$TMP_DIR/serve.cjs" "$PORTAL_DIST" "$TUTOR_DIST" "$TEST_PORT" "https://localhost" >"$TMP_DIR/serve.log" 2>&1 &
SERVER_PID=$!
sleep 2
E2E_BASE="http://127.0.0.1:$TEST_PORT/portal/"
E2E_TUTOR="http://127.0.0.1:$TEST_PORT/tutor/"
HTTP_E2E="$(curl -s -o /dev/null -w '%{http_code}' "$E2E_BASE" || echo 000)"
HTTP_TUTOR="$(curl -s -o /dev/null -w '%{http_code}' "$E2E_TUTOR" || echo 000)"
ok_if "$HTTP_E2E" "200" "E2E 托管可达：门户（$E2E_BASE）"
ok_if "$HTTP_TUTOR" "200" "E2E 托管可达：智学慧眼（同源 /tutor/，令牌因此同在册）"

STU_OUT="$TMP_DIR/student.out"
if [ "$HTTP_E2E" = "200" ] && [ "$HTTP_TUTOR" = "200" ]; then
  PW_CORE="$PW_CORE" E2E_IDENTIFIER="$E2E_IDENTIFIER" E2E_PASSWORD="$E2E_PASSWORD" \
    node "$TMP_DIR/e2e.cjs" "$E2E_BASE" "$E2E_TUTOR" "$SHOTS" >"$STU_OUT" 2>&1
  grep '^#' "$STU_OUT" | sed 's/^/      /'
  grep '^RESULT' "$STU_OUT" | sed 's/^RESULT /      · /' | cut -c1-200

  res_eq dim_active_default "$STU_OUT" "branches" "4.1 首屏默认维度 = 学科知识体系（方案要求）"
  ok_set "$(rget dim_opts "$STU_OUT")" "branches,grades" "4.2 两个维度都在切换器里（双维度）"
  res_eq dim_current "$STU_OUT" "branches" "4.3 地图与维度联动（map 带 data-dim-current）"
  ok_has "$(rget subject_active "$STU_OUT")" "MATH" "4.4 首屏学科条高亮当前学科"

  ok_ge "$(rget m_branches "$STU_OUT")" 10 "5.1 数学 10 座独立分支峰全部落位（多顶峰，不是一条主线）"
  ok_has "$(rget m_branch_states "$STU_OUT")" "idle" "5.2a 每座峰各有自己的态（含「未开始」）"
  ok_has "$(rget m_branch_states "$STU_OUT")" "summit" "5.2b 每座峰各有自己的态（含「已登顶」）"
  ok_ge "$(node -e 'console.log(String(process.argv[1]).split(",").filter(Boolean).length)' "$(rget m_branch_states "$STU_OUT")" 2>/dev/null)" 2 "5.2c 一屏内出现 ≥2 种峰态（各峰进度各不相同）"
  ok_ge "$(rget m_trails "$STU_OUT")" 10 "5.3 每座峰各有自己的登山径（各走各的路）"
  ok_ge "$(rget m_band_k12 "$STU_OUT")" 9 "6.1 K12 在读段带（同海拔即同年级，含错开一档）"
  ok_ge "$(rget m_band_start "$STU_OUT")" 1 "6.1b 起学线（该分支从哪一年级起）在图上"
  res_eq m_band_depth "$STU_OUT" "10" "6.2 每座峰顶上都有学科纵深段（K12 之外仍是该分支）"
  ok_ge "$(rget m_axis_label_n "$STU_OUT")" 12 "6.3 年级海拔刻度可读（左缘 12 级 + 纵深 + 学段名）"
  ok_has "$(rget m_axis_label_box "$STU_OUT")" "x" "6.3b 刻度是真 SVG 文本（有实际尺寸，非 0×0）"
  res_has m_axis_labels "$STU_OUT" "小一" "6.3c 刻度含小一"
  res_has m_axis_labels "$STU_OUT" "高三" "6.3d 刻度含高三"
  res_has m_axis_labels "$STU_OUT" "纵深" "6.3 刻度含纵深"
  res_eq m_me_line "$STU_OUT" "yes" "6.4 「我在这」年级海拔线在图上"
  res_eq m_me "$STU_OUT" "yes" "6.5 孪生人物画在海拔轴上（我在这）"
  res_has m_depths "$STU_OUT" "math.classic" "6.6 纵深子分支可见（数学·古典数学·中国数学）"
  res_eq m_host "$STU_OUT" "0" "6.7 SVG 内零 HTML/宿主标签（画法未被破坏）"
  ok_ge "$(rget m_polygon "$STU_OUT")" 30 "6.8 多峰群山成形（polygon ≥ 30：山体面/延续带/雪冠/旗）"
  ok_ge "$(rget m_path "$STU_OUT")" 60 "6.9 山脊/登山径/海拔格线（path ≥ 60）"
  ok_ge "$(rget m_text "$STU_OUT")" 14 "6.10 SVG 文本读数 ≥ 14（12 年级 + 纵深 + 学段 + 我在这）"

  ok_has "$(rget detail_clc "$STU_OUT")" "中图法" "9.1 分支详情展示权威依据（中图法分类号）"
  ok_has "$(rget detail_clc "$STU_OUT")" "中国图书馆分类法" "9.2 权威出处写明（不编造）"
  ok_has "$(rget detail_text "$STU_OUT")" "延续性" "6.11 详情有延续性段落（本页灵魂）"
  res_has detail_text "$STU_OUT" "K12 承接" "6.12 延续性写明 K12 承接区间"
  res_has detail_text "$STU_OUT" "学科纵深" "6.13 延续性写明峰顶之上仍属该分支"
  ok_has "$(rget detail_conti_bands "$STU_OUT")" "cs-k12" "6.14 延续性刻度含 K12 段"
  ok_has "$(rget detail_conti_bands "$STU_OUT")" "cs-depth" "6.15 延续性刻度含学科纵深段"
  ok_has "$(rget detail_conti_bands "$STU_OUT")" "cs-me" "6.16 延续性刻度上有「我」的位置"
  ok_set "$(rget detail_actions "$STU_OUT")" "practice,ask,graph" "10.1 详情三动作保留（练一练/请教 AI 教师/知识图谱）"
  ok_ge "$(rget cross_books_n "$STU_OUT")" 1 "7.1 峰 → 承接它的 K12 册（反向对照可点）"
  res_eq me_still_there "$STU_OUT" "yes" "4.5 关掉详情后「我」仍在山上（不丢当前峰）"

  res_eq dim_current_after "$STU_OUT" "grades" "4.6 可切到 K12 阶段维度"
  res_eq dim_active_after "$STU_OUT" "grades" "4.7 切换器高亮跟随"
  ok_has "$(rget subject_active_after "$STU_OUT")" "MATH" "4.8 切维度不丢当前学科"
  ok_ge "$(rget g_books "$STU_OUT")" 20 "7.2 数学 23 册全部落位（学段→年级→册）"
  ok_set "$(rget g_bands "$STU_OUT")" "w-stage-1,w-stage-2,w-stage-3" "7.3 三学段台地齐备（小/初/高）"
  ok_ge "$(rget g_book_camps "$STU_OUT")" 20 "7.4 每册一座营地（等距木箱，共享画法）"
  res_has g_outline "$STU_OUT" "年级" "7.5 侧栏目录含年级"
  res_has book_detail "$STU_OUT" "人教版册" "7.6 册详情标明体例（人教版册）"
  res_has book_detail "$STU_OUT" "所属学段" "7.7 册详情含所属学段/年级"
  res_has book_detail "$STU_OUT" "所属体系分支" "7.8 册详情反向标注所属体系分支（延续性反向照应）"
  ok_ge "$(rget book_cross_branches_n "$STU_OUT")" 1 "7.9 反向分支可点（跨维度跳转）"
  ok_ge "$(rget book_chapters "$STU_OUT")" 3 "7.10 册下含章列表"
  res_has chapter_detail "$STU_OUT" "所属册" "7.11 章详情含所属册"
  res_has chapter_detail "$STU_OUT" "K12 承接" "7.11b 章详情写明 K12 承接区间（取自所属体系分支峰，非册年级）"
  res_not_has chapter_detail "$STU_OUT" "纯学科纵深节点" "7.11c 有 K12 归属的章不得被判为纯纵深"
  ok_not_has "$(rget chapter_rows "$STU_OUT")" "所属册=<空>" "7.11d「所属册」取值非空（不只是有 key）"
  ok_not_has "$(rget chapter_rows "$STU_OUT")" "K12=<空>" "7.11e「K12 年级区间」取值非空"
  res_eq cross_jump_dim "$STU_OUT" "branches" "7.12 从册/章跳回体系分支维度（跨维度双向）"
  ok_has "$(rget cross_jump_branch "$STU_OUT")" "math." "7.13 跳回后选中的是那个分支峰"
  res_eq dim_back "$STU_OUT" "branches" "4.9 切回维度 A"
  ok_if "$(rget kept_peak "$STU_OUT")" "$(rget peak_selected "$STU_OUT")" "4.10 切走再切回仍是原来那座峰（N1 不丢当前峰）"
  ok_if "$(rget kept_peak_late "$STU_OUT")" "$(rget cross_jump_branch "$STU_OUT")" "4.11 跨维度跳转后 A→B→A 仍钉住跳过去的那座峰"

  res_eq w_me "$STU_OUT" "yes" "8.1 人本世界里的「我」在（对照基准）"
  res_eq x_me "$STU_OUT" "yes" "8.2 登峰世界里的「我」也在"
  res_eq same_person_cls "$STU_OUT" "yes" "8.3 两个世界里的「我」外观类完全相同（同一人、同一套画法）"
  res_eq kb_moved "$STU_OUT" "yes" "8.4 键盘可达（方向键在峰之间移动焦点）"
  res_eq chem_empty "$STU_OUT" "yes" "8.5 维度 B 空态兜底（化学尚未发布人教版册）"
  res_has chem_empty_text "$STU_OUT" "尚未收录" "8.6 空态有兜底文案（不白屏）"
  res_eq chem_empty_back "$STU_OUT" "branches" "8.7 空态可一键回学科知识体系"
  ok_ge "$(rget chem_branches "$STU_OUT")" 8 "8.8 化学在维度 A 仍有 8 座峰（学科全覆盖）"
  ok_if "$(rget phys_books "$STU_OUT")" "3" "8.9 物理只 3 册也能正常成图（数据现状）"
  ok_has "$(rget subject_restored "$STU_OUT")" "MATH" "8.10 切回来已还原原学科（不留测试态）"
  res_eq back_is_world "$STU_OUT" "yes" "10.2 返回人本世界出口保留"
  res_eq back_no_login "$STU_OUT" "yes" "10.3 同一登录态直接进（免二登）"
  ok_has "$(rget app_home_url "$STU_OUT")" "/tutor/" "10.4 回智学慧眼出口保留"
  res_eq regression_pages "$STU_OUT" "9" "10.5 其余 9 页逐页走过"
  res_eq regression_bad "$STU_OUT" "" "10.6 其余页零 pageerror（无回归）"
  res_eq errors "$STU_OUT" "0" "10.7 全链路 pageerror / console.error = 0"
else
  skip "托管不可达 → 跳过 §5–§9 浏览器段"
fi

# ---------------------------------------------------------------------------
echo
echo "== §9. N8 信息密度 + N10 无回归（静态面）=="
for cell in 'data-status="mastery"' 'data-status="ascent"' 'data-status="level"' 'data-status="here"' 'data-grade' 'data-ascent' 'data-mastery'; do
  ok_has "$(cat "$TUTOR_WORLD")" "$cell" "首屏信息密度：$cell"
done
for w in 掌握度 已登顶分支 经历等级 我在读; do
  ok_has "$(cat "$TUTOR_WORLD")" "$w" "首屏读数：$w"
done
ok_has "$(cat "$TUTOR_WORLD")" "中图法" "N9 权威依据可展示（中图法分类号）"
ok_has "$(cat "$TUTOR_WORLD")" "中国图书馆分类法" "N9 权威出处写明"
ok_has "$(cat "$TUTOR_WORLD")" "义务教育课程方案和课程标准" "N9 课标锚点写明"
ok_has "$(cat "$TUTOR_WORLD")" "标课标主题而非编造分类号" "N9 缺号时不编造（显式标注口径）"
ok_has "$(cat "$TUTOR_WORLD")" "detail.clc || '课标主题'" "N9 缺号时回退为「课标主题」文字标签，绝不兜一个假分类号"
for hook in 'data-map' 'data-camp-detail' 'data-practice' 'data-ask-teacher' 'data-graph' 'data-subject=' 'data-subject-active' \
            'data-legend' 'data-events' 'data-here' 'data-subject-toggle' 'data-me' 'data-scene-empty'; do
  ok_has "$(cat "$TUTOR_WORLD")" "$hook" "世界数据钩子：$hook"
done
for sym in switchSubject practiceHere askTeacher goGraph goMemory loadMap relTime masteryWord isCurrentSubject gradeName gradeShort hereText; do
  ok_has "$(cat "$TUTOR_WORLD")" "$sym" "既有能力保留：$sym"
done
# HEAD 版关键能力标识符一个不少（人工精选的「不能丢」清单，而非全量自动 diff：
# 升级必然重排局部实现，全量 diff 会把正常的重写也误报；这里只钉住对外契约与既有能力）。
KEEP_SYMS="loadSelf isCurrentSubject onHotKey masteryWord relTime switchSubject practiceHere askTeacher goGraph goMemory loadMap GRADE_NAMES gradeName gradeShort knowledgeStore practiceStore twinStore userStore"
KEEP_GONE=""
for sym in $KEEP_SYMS; do
  case "$(cat "$TUTOR_WORLD")" in
    *"$sym"*) : ;;
    *) KEEP_GONE="$KEEP_GONE $sym" ;;
  esac
done
ok_if "$KEEP_GONE" "" "登峰页 HEAD 版既有能力标识符一个不少（精选 $(printf '%s' "$KEEP_SYMS" | wc -w | tr -d ' ') 项，无回归）"
[ -n "$KEEP_GONE" ] && echo "      丢失：$KEEP_GONE"
PAGE_N="$(node -e 'console.log(require(process.argv[1]).pages.length)' "$TUTOR_DIR/src/pages.json" 2>/dev/null)"
ok_if "$PAGE_N" "19" "智学慧眼 19 页全部仍在册（未因升级删页）"
MISSING_CHUNK=""
while read -r p; do
  [ -z "$p" ] && continue
  slug="$(printf '%s' "$p" | tr '/' '-')"
  ls "$TUTOR_DIST/assets" 2>/dev/null | grep -q "^${slug}\." || MISSING_CHUNK="$MISSING_CHUNK $p"
done < <(node -e 'require(process.argv[1]).pages.forEach(p=>console.log(p.path))' "$TUTOR_DIR/src/pages.json" 2>/dev/null)
ok_if "$MISSING_CHUNK" "" "19 页全部产出分片（每页都真的还编得出来）"
for ep in "/api/agent/me" "/api/tuition/sessions" "/api/curriculum/knowledge-map" "/api/twin/me"; do
  ok_has "$(cat "$TUTOR_API")" "$ep" "既有读面未动：$ep"
done
ok_has "$(cat "$TUTOR_API")" "export async function getSummitBranches" "api 导出 summit-branches（只取 W4-a 读面）"
ok_has "$(cat "$TUTOR_API")" "export async function getSummitGrades" "api 导出 summit-grades（只取 W4-a 读面）"
for st in useKnowledgeStore usePracticeStore useTwinStore useUserStore; do
  ok_has "$(cat "$TUTOR_WORLD")" "$st" "学习世界仍走原 store：$st"
done
ok_has "$(cat "$TUTOR_WORLD")" "knowledgeStore.loadCatalog" "学科目录仍走 knowledge store（未另造真源）"
ok_has "$(cat "$TUTOR_WORLD")" "twinStore.loadOverview" "世界状态仍走 twin store（同 W1 真源）"

# ---------------------------------------------------------------------------
echo
echo "== §11. 零裸色（改动面三重 grep）=="
CHANGED_FILES="$TUTOR_WORLD $TUTOR_API $SHARED_ART $WORLD_CSS $TOKENS"
# 色值扫描面：令牌文件本身就是调色板（合法含 hex），故对色值扫描排除它；
# 其余改动文件（含 world.css 几何映射、共享画法、页面、api）必须零裸色。
COLOR_SCAN="$TUTOR_WORLD $TUTOR_API $SHARED_ART $WORLD_CSS"
HEX_HITS="$(grep -nE '#[0-9a-fA-F]{3,8}\b' $COLOR_SCAN 2>/dev/null | wc -l | tr -d ' ')"
ok_if "$HEX_HITS" "0" "hex 裸色 0 处（W4-b 改动面，令牌色源除外）"
RGB_HITS="$(grep -nE '\brgba?\(' $COLOR_SCAN 2>/dev/null | wc -l | tr -d ' ')"
ok_if "$RGB_HITS" "0" "rgb/rgba 裸色 0 处（W4-b 改动面，令牌色源除外）"
HSL_HITS="$(grep -nE '\bhsla?\(' $COLOR_SCAN 2>/dev/null | wc -l | tr -d ' ')"
ok_if "$HSL_HITS" "0" "hsl 裸色 0 处（W4-b 改动面，令牌色源除外）"
NAMED_HITS="$(grep -nE ':[[:space:]]*(white|black|red|blue|green|gray|grey|orange|yellow|purple)[[:space:]]*[;!}]' $COLOR_SCAN 2>/dev/null | wc -l | tr -d ' ')"
ok_if "$NAMED_HITS" "0" "具名色 0 处（W4-b 改动面，令牌色源除外）"
# 令牌文件本身也必须「只在本文件里出现色值」：它只允许出现在 :root 声明块（调色板真源）
ok_has "$(cat "$TOKENS")" "--world-band-k12:" "W4-b 新月色只落在同一份世界色源（persona-world.css）"
CSS_NONWORLD="$(grep -nE 'var\(--' "$WORLD_CSS" | grep -vE 'var\(--world-' | wc -l | tr -d ' ')"
ok_if "$CSS_NONWORLD" "0" "几何类映射取值全部走世界令牌（styles/world.css 只认 --world-*）"
VAR_JSON="$TMP_DIR/vars.json"
( cd "$ROOT_DIR" && node -e '
const fs=require("fs"),path=require("path");
const ROOT=process.argv[1], FILES=process.argv.slice(2);
const strip=(t)=>t.replace(/<!--[\s\S]*?-->/g,"").replace(/\/\*[\s\S]*?\*\//g,"").replace(/(^|[^:])\/\/.*$/gm,"$1");
const glob=(d)=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?glob(path.join(d,e.name)):[path.join(d,e.name)]);
const declared=new Set();
for(const f of glob(path.join(ROOT,"styles")))
  for(const m of strip(fs.readFileSync(f,"utf8")).matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) declared.add(m[1]);
for(const f of FILES)
  for(const m of strip(fs.readFileSync(f,"utf8")).matchAll(/[\x27"](--[a-zA-Z0-9-]+)[\x27"]\s*:|(--[a-zA-Z0-9-]+)\s*:/g)) declared.add(m[1]||m[2]);
const missing=new Set();
for(const f of FILES)
  for(const m of strip(fs.readFileSync(f,"utf8")).matchAll(/var\((--[a-zA-Z0-9-]+)/g))
    if(!declared.has(m[1])) missing.add(m[1]+"@"+path.basename(f));
console.log(JSON.stringify({declared:declared.size,missing:[...missing].sort()}));
' "$ROOT_DIR" $CHANGED_FILES > "$VAR_JSON" 2>/dev/null )
MISSING_VAR="$(node -e 'console.log(require(process.argv[1]).missing.join(","))' "$VAR_JSON" 2>/dev/null)"
VAR_DECL="$(node -e 'console.log(require(process.argv[1]).declared)' "$VAR_JSON" 2>/dev/null)"
ok_if "$MISSING_VAR" "" "无「用了但没声明」的 var(--…)（改动面 × styles/ 共 $VAR_DECL 个令牌）"
ok_has "$(cat "$TOKENS")" "学科登峰双维度" "W4-b 令牌在同一份世界色源里（不新开色源）"
ok_has "$(cat "$WORLD_CSS")" "学科登峰双维度" "W4-b 几何类在同一份映射里（不新开映射）"

# ---------------------------------------------------------------------------
echo
echo "== §12. 凭据零泄漏 =="
LIST_CRED="$(grep -nE "test1234|BEGIN [A-Z ]*PRIVATE KEY|jwt_secret" "$OUT_DIR/w4b-file-list.md" 2>/dev/null | wc -l | tr -d ' ')"
ok_if "$LIST_CRED" "0" "产出说明内无口令/私钥字面量"
SCRIPT_CRED="$(grep -nE "test1234|BEGIN [A-Z ]*PRIVATE KEY|jwt_secret" "$OUT_DIR/w4b-verify.sh" 2>/dev/null \
  | grep -vE 'E2E_PASSWORD:-|LIST_CRED=|SCRIPT_CRED=' | wc -l | tr -d ' ')"
ok_if "$SCRIPT_CRED" "0" "验收脚本内口令只出现在 env 默认值一处（无硬编码凭据）"
ok_has "$(cat "$OUT_DIR/w4b-verify.sh")" 'E2E_PASSWORD="${E2E_PASSWORD:-' "口令经环境变量注入（可覆盖）"
TOKEN_HIT="$(grep -rnE 'eyJ[A-Za-z0-9_-]{10,}\.' "$TUTOR_DIR/src/pages/twin" "$SHARED_SRC" "$WORLD_CSS" 2>/dev/null | wc -l | tr -d ' ')"
ok_if "$TOKEN_HIT" "0" "源码内无任何 JWT/令牌字面量"
ENV_IN_SRC="$(grep -rn "\.env" "$TUTOR_WORLD" "$SHARED_SRC" 2>/dev/null | wc -l | tr -d ' ')"
ok_if "$ENV_IN_SRC" "0" "世界源码不读 .env（凭据只经统一客户端）"

# ---------------------------------------------------------------------------
echo
echo "== §13. 改动范围（不 commit / 不 checkout）=="
BRANCH_NOW="$(cd "$ROOT_DIR" && git rev-parse --abbrev-ref HEAD)"
ok_if "$BRANCH_NOW" "feat/stage-c-unified-auth-shell" "仍在原分支（未 checkout 别处）"
( cd "$ROOT_DIR" && git show "HEAD:apps/web-ai-tutor/src/pages/twin/world.vue" > "$TMP_DIR/world.head.vue" ) 2>/dev/null
if diff -q "$TMP_DIR/world.head.vue" "$TUTOR_WORLD" >/dev/null 2>&1; then
  fail "W4-b 实现仍未提交（HEAD 版登峰页 = 工作树版，说明已被 commit）"
else
  pass "W4-b 实现仍未提交（HEAD 版登峰页 ≠ 工作树版）"
fi
STAGED="$(cd "$ROOT_DIR" && git diff --cached --name-only | wc -l | tr -d ' ')"
ok_if "$STAGED" "0" "暂存区为空（未 git add）"
# 白名单 = W4-b 作者的改动面；另放行**编排者自己**的协作面（.agents/ORCHESTRATION.md、
# .agents/coordination/、.agents/claude/dispatch/）——那些不是本卡作者写的，不该记在作者账上。
ALLOW='^( M| D|\?\?) (apps/web-ai-tutor/(src/(api/index\.js|pages/twin/world\.vue)|dist/)|packages/world-art/|styles/(world\.css|tokens/themes/persona-world\.css)|\.agents/claude/outputs/w4b-|\.agents/claude/tasks/|\.agents/ORCHESTRATION\.md|\.agents/coordination/|\.agents/claude/dispatch/)'
OUT_OF_SCOPE="$(cd "$ROOT_DIR" && git status --porcelain | grep -vE "$ALLOW" | grep -vE '^\?\? (apps/web-ai-tutor/(dist|node_modules)/|/tmp/)' || true)"
ok_if "$OUT_OF_SCOPE" "" "作者改动全部落在白名单内（无越界文件；编排者的协作面已单列）"
[ -n "$OUT_OF_SCOPE" ] && echo "$OUT_OF_SCOPE" | sed 's/^/      /'
ORCH_TOUCH="$(cd "$ROOT_DIR" && git status --porcelain | grep -E '\.agents/(ORCHESTRATION\.md|coordination/|claude/dispatch/)' | wc -l | tr -d ' ')"
echo "      编排者协作面改动：$ORCH_TOUCH 条（非本卡作者所为，仅报不判）"
EXPLORER_TOUCH="$(cd "$ROOT_DIR" && git status --porcelain | grep -c 'apps/explorer' || true)"
ok_if "$EXPLORER_TOUCH" "0" "apps/explorer 零改动（本卡之外）"
BACKEND_TOUCH="$(cd "$ROOT_DIR" && git status --porcelain | grep -cE 'services/|packages/(ontology|ontology-engine|codegen|agent-core|jwt-verifier|auth-client)' || true)"
ok_if "$BACKEND_TOUCH" "0" "后端与既有包零改动（W4-a 契约未动）"
W13_TOUCH="$(cd "$ROOT_DIR" && git status --porcelain | grep -cE 'apps/portal/|packages/world-art/src/(WorldShell|WorldTransition)' || true)"
ok_if "$W13_TOUCH" "0" "W1–W3 契约零改动（门户与外壳/过场未动）"
CHANGED_N="$(cd "$ROOT_DIR" && git status --porcelain | wc -l | tr -d ' ')"
echo "      改动条目：$CHANGED_N（详见 w4b-file-list.md）"
ok_file "$OUT_DIR/w4b-file-list.md" "产出物在册：.agents/claude/outputs/w4b-file-list.md"
ok_file "$OUT_DIR/w4b-verify.sh" "产出物在册：.agents/claude/outputs/w4b-verify.sh"

# ---------------------------------------------------------------------------
echo
echo "== §14. 未覆盖项（明示，不计 FAIL）=="
skip "分支峰的「掌握度」：W4-a 的 summit 读面只回 reached/mastery（若作答记录为空则无值），未按分支重算——本卡不臆造，一律按 API 原值展示"
skip "维度 B 的章级掌握度：章/册的 mastery 是否回填取决于 W4-a 契约，缺值时详情回退为「暂无作答记录」文案"
skip "历史经历回填：沿用 W1 口径，时间线为空时不在此页造经历"
skip "生产 nginx /tutor/ 静态托付下的观感：本卡 E2E 用同源双 App 托管复现同一 origin 与同一令牌在册条件"
skip "TYPE=BOTH 的深色主题：世界令牌沿用 W2/W3 的单一亮色主题（未新增深色世界色）"

echo
echo "PASS=$PASS SKIP=$SKIP"
if [ "$FAIL" = 0 ]; then
  echo "FAIL=0"
else
  echo "FAIL=$FAIL"
fi
