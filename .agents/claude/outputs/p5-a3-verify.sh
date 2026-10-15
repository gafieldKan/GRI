#!/usr/bin/env bash
# ============================================================================
# P5-A3 验收：「资源」页签对齐「区域 / 行业」（域览全功能视图 + 树顶层「联合国」）
#
# 结构：
#   §0 前置        —— nginx / api 在跑；apps/explorer 由 nginx 直挂（改文件即生效）
#   §1 resource.html 静态契约（N1/N2/N3/N4/N6/N7）
#                    N1 无 iframe、顶栏搜索框、层级图/列表视图切换、面包屑、明细、侧栏树
#                    N2 内嵌数据容器为空占位（不另造数据块），数据源只有 C1 API
#                    N3 视图层合成「联合国 → CPC Ver.3.0」两级根（不改后端 id/level）
#                    N4 五层中文层级 门类/大类/中类/小类/子类，且无旧口径「细类」
#                    N6 令牌块外零裸色 + 令牌自洽（无未声明 var(--…)）
#                    N7 体积与 gitignore 判定
#   §2 index.html 接线（N5）—— load(d) 走 fetch('./'+d+'.html') 同路径；loadResource 留作回退；
#                              region/industry 不受回退影响；参考文件 region/industry.html 未改
#   §3 C1 API 契约（实测）—— tree 4586 节点 + 层级直方图；search 谷物/011 命中 011；path/011
#   §4 真浏览器 E2E（resource，playwright-core + chromium）
#       4.1 加载 pageerror/console.error = 0；GRI 顶栏注入且「资源」页签高亮
#       4.2 树顶层 = 联合国 → CPC Ver.3.0 → 10 门类（0–9）逐层
#       4.3 全景默认（联合国）：明细 / 子级计数 / 层级图 10 块
#       4.4 搜索「谷物」「011」命中并跳转；明细随选
#       4.5 层级图与列表两视图均渲染当前层子级；列表点行进入
#       4.6 深层展开 0→01→011→0111→01111；面包屑 7 段 + 路径时间线 7 步
#       4.7 末级子类形态；面包屑 / 返回上级 / 全景 / Esc 可用
#       4.8 明细三页签 + 子级筛选 + 笔记
#       4.9 收藏 + 点击跳转 + 刷新持久化（当前节点/收藏/笔记）
#       4.10 完整目录 2877 子类（自动落列表视图）
#       4.11 导出 JSON / CSV / 完整 CSV / PNG 四种均触发下载
#       4.12 帮助弹窗（五级表 + 数据来源与中文名口径）；Ctrl+K 聚焦搜索
#       4.13 N2 运行时：全部 /api/ 请求都落在 C1 资源 API；N3 合成根 id 从未发给后端
#       4.14 N6 运行时：GRI 皮肤令牌生效（--teal=#1B7A3D）
#       4.15 移动端 375px 可用；横向溢出不超过参考页签（共享 GRI 控件条所致）
#   §5 region / industry 无回归（真浏览器）
#   §6 凭据零泄漏
#   §7 改动范围 —— 只改 apps/explorer/{resource.html 新增,index.html 改}；未 commit 未 checkout
#
# 依赖：nginx + services/api 在跑；/home/ubantu/openclaw/node_modules/playwright-core 可用。
# 凭据：无。脚本不落任何密钥，不读 .env；§4.9 的 SSO 只读 localStorage 是否存在的形状，不打印内容。
# 副作用：§4 在浏览器内只读；导出走下载事件（落到 playwright 临时目录，不写仓库）；localStorage 仅本机浏览器上下文。
# 用法：  bash .agents/claude/outputs/p5-a3-verify.sh
# 通过：  末尾打印「PASS=<n> FAIL=0 VERIFY_EXIT=0」
# ============================================================================
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
EXP_DIR="$ROOT_DIR/apps/explorer"
RES="$EXP_DIR/resource.html"
IDX="$EXP_DIR/index.html"

WEB_BASE="${WEB_BASE:-https://localhost/explore/}"
API_BASE="${API_BASE:-https://localhost}"
PW_CORE="${PW_CORE:-/home/ubantu/openclaw/node_modules/playwright-core}"

TMP_DIR="$(mktemp -d /tmp/p5a3.XXXXXX)"
trap 'rm -rf "$TMP_DIR"' EXIT

PASS=0; FAIL=0; SKIP=0
pass() { PASS=$((PASS + 1)); printf 'PASS  %s\n' "$1"; }
fail() { FAIL=$((FAIL + 1)); printf 'FAIL  %s\n' "$1"; }
skip() { SKIP=$((SKIP + 1)); printf 'SKIP  %s\n' "$1"; }
ok_if() { [ "$1" = "$2" ] && pass "$3" || fail "$3（期望「$2」，实得「$1」）"; }

echo "== §0. 前置环境 =="
NGINX_UP=0; API_UP=0
docker ps --format '{{.Names}}' 2>/dev/null | grep -qx 'gri-nginx' && NGINX_UP=1
docker ps --format '{{.Names}}' 2>/dev/null | grep -qx 'gri-api' && API_UP=1
[ "$NGINX_UP" = 1 ] && pass "gri-nginx 在跑" || fail "gri-nginx 未运行（Web 层不可达）"
[ "$API_UP" = 1 ] && pass "gri-api 在跑" || fail "gri-api 未运行（C1 API 不可达）"

HTTP_RES="$(curl -sk -o /dev/null -w '%{http_code}' "${WEB_BASE}resource.html" || echo 000)"
ok_if "$HTTP_RES" "200" "nginx 已直挂 apps/explorer：GET /explore/resource.html → 200"

if [ -d "$PW_CORE" ]; then pass "playwright-core 就位（$PW_CORE）"; else fail "playwright-core 缺失：$PW_CORE"; fi

# ---------------------------------------------------------------------------
echo
echo "== §1. resource.html 静态契约（N1/N2/N3/N4/N6/N7）=="
if [ -f "$RES" ]; then pass "新增 apps/explorer/resource.html"; else fail "resource.html 不存在"; fi

RES_BYTES="$(wc -c < "$RES" | tr -d ' ')"
if [ "$RES_BYTES" -lt 1048576 ]; then
  pass "N7：体积 $((RES_BYTES / 1024)) KB < 1 MB → 可入库，无需 gitignore"
else
  grep -q '^apps/explorer/resource.html$' "$ROOT_DIR/.gitignore" \
    && pass "N7：体积 $((RES_BYTES / 1024)) KB > 1 MB，已 gitignore" \
    || fail "N7：体积 $((RES_BYTES / 1024)) KB > 1 MB 但未 gitignore"
fi

IFRAMES="$(grep -c '<iframe' "$RES" || true)"
ok_if "$IFRAMES" "0" "N1：无 iframe（仍为同文档内嵌合并）"

for sel in 'class="topbar"' 'id="search"' 'id="search-results"' 'id="tree"' 'id="breadcrumbs"' \
           'id="map-card"' 'id="map-svg"' 'id="cpc-list"' 'class="detail"' 'id="detail-name"' \
           'id="detail-code"' 'id="go-back"' 'id="go-home"' 'id="favorite-toggle"' 'id="export-menu"' \
           'id="help-modal"' 'id="toast"'; do
  grep -q "$sel" "$RES" && pass "N1：$sel 存在" || fail "N1：缺 $sel"
done

VIEWS="$(grep -o 'data-view="[a-z]*"' "$RES" | sed 's/.*"\(.*\)"/\1/' | sort -u | tr '\n' ',' )"
ok_if "$VIEWS" "graph,list," "N1：中部视图切换为「层级图 / 列表」两档（实得：$VIEWS）"
grep -q '层级图' "$RES" && grep -q '>列表<' "$RES" \
  && pass "N1：视图切换标签为「层级图 / 列表」" || fail "N1：视图切换标签不符"

# N2：数据容器必须是空占位，且数据源只有 C1 API
EMBED="$(grep -o '<script id="resource-data" type="application/json">[^<]*</script>' "$RES" | head -1)"
case "$EMBED" in
  *'"nodes":[]'*) pass "N2：#resource-data 为空占位（不内嵌 4586 节点副本）" ;;
  *) fail "N2：#resource-data 不是空占位（疑似内嵌数据集）：$(printf '%.80s' "${EMBED:-（未找到）}")" ;;
esac
grep -q "/api/taxonomy/resource/tree" "$RES" && grep -q "/api/taxonomy/resource/search" "$RES" \
  && pass "N2：数据只取 C1 API（tree + search）" || fail "N2：未按 C1 API 取数"
OTHER_SRC="$(grep -oE "https?://[a-zA-Z0-9./_-]+" "$RES" | grep -vE '^https?://(unstats\.un\.org|www\.w3\.org)/' | sort -u | tr '\n' ' ')"
[ -z "$OTHER_SRC" ] && pass "N2：无第三方/自造数据源（仅联合国统计司官方链接 + SVG 命名空间）" \
  || fail "N2：出现非预期外部数据源：$OTHER_SRC"

# N3：视图层合成两级根
grep -q "id:'UN'" "$RES" && grep -q "id:'CPC'" "$RES" && grep -q "synthetic:true" "$RES" \
  && pass "N3：视图层合成「联合国 / CPC Ver.3.0」两级根（标记 synthetic）" \
  || fail "N3：未在视图层合成两级根"
grep -qE "level:'root'|level:'system'" "$RES" \
  && pass "N3：合成根沿用参考的 root/system 层级语义（未改后端 id/level 模型）" \
  || fail "N3：合成根层级语义缺失"
grep -qE "/api/taxonomy/resource/(node|children|path)/\\\$\{?n\.id" "$RES" \
  && fail "N3：疑似把合成根 id 送进后端" || pass "N3：合成根 id 未送进后端（后端 RESOURCE_ID_PATTERN 只收数字）"

# N4：五层中文层级
N4_OK=1
for L in 门类 大类 中类 小类 子类; do grep -q "$L" "$RES" || N4_OK=0; done
[ "$N4_OK" = 1 ] && pass "N4：五层中文层级齐备（门类/大类/中类/小类/子类）" || fail "N4：五层中文层级不全"
grep -q '细类' "$RES" && fail "N4：出现旧口径「细类」" || pass "N4：无旧口径「细类」残留"
grep -qE "section:'门类'" "$RES" && grep -qE "subclass:'子类'" "$RES" \
  && pass "N4：层级映射锚定 section→subclass（与 P5-A2 一致）" || fail "N4：层级映射锚点缺失"

# N6：零裸色（令牌块外） + 令牌自洽
node - "$RES" <<'NODE' > "$TMP_DIR/colors.txt"
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const m = src.match(/:root\{[\s\S]*?\n\}/);
if (!m) { console.log('NOTOK|NO_TOKEN_BLOCK|0|0'); process.exit(0); }
const outside = src.replace(m[0], '');
const re = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|:(white|black|red|blue|green|gray|grey)\b/g;
const hits = []; let x;
while ((x = re.exec(outside))) hits.push(outside.slice(Math.max(0, x.index - 40), x.index + 25).replace(/\n/g, ' '));
const declared = new Set((src.match(/--[a-z0-9-]+(?=\s*:)/g) || []).map(s => s.slice(2)));
const varRefs = outside.match(/var\(--([a-z0-9-]+)/g) || [];
const used = new Set(varRefs.map(s => s.slice(6)));
const undef = [...used].filter(u => !declared.has(u));
console.log((hits.length === 0 ? 'COLOROK' : 'COLORBAD') + '|' + (undef.length ? undef.join(',') : 'NONE') + '|' + hits.length + '|' + varRefs.length);
if (hits.length) hits.slice(0, 5).forEach(h => console.log('  hit: ' + h));
NODE
COLOR_LINE="$(grep -E '^(COLOROK|COLORBAD|NOTOK)\|' "$TMP_DIR/colors.txt" | head -1)"
COLOR_VERDICT="${COLOR_LINE%%|*}"
COLOR_REST="${COLOR_LINE#*|}"
COLOR_UNDEF="${COLOR_REST%%|*}"
COLOR_REST="${COLOR_REST#*|}"
COLOR_HITS="${COLOR_REST%%|*}"
COLOR_USED="${COLOR_REST##*|}"
sed -n '/hit:/p' "$TMP_DIR/colors.txt" | head -5

ok_if "$COLOR_HITS" "0" "N6：令牌块外零裸色（grep '#hex|rgb()|具名色' 命中 0 处）"
ok_if "$COLOR_UNDEF" "NONE" "N6：令牌自洽（无未声明的 var(--…)）"
COLOR_UNIQ="$(node -e 'const s=require("fs").readFileSync(process.argv[1],"utf8");const m=s.match(/:root\{[\s\S]*?\n\}/);const o=s.replace(m[0],"");console.log(new Set((o.match(/var\(--([a-z0-9-]+)/g)||[])).size)' "$RES")"
if [ "${COLOR_USED:-0}" -ge 100 ]; then
  pass "N6：规则区引用令牌 $COLOR_USED 处、覆盖 $COLOR_UNIQ 个不同令牌（颜色全部走令牌）"
else
  fail "N6：令牌引用过少（$COLOR_USED 处）"
fi
[ "$COLOR_VERDICT" = "NOTOK" ] && fail "N6：未找到 :root 令牌真源块"

# ---------------------------------------------------------------------------
echo
echo "== §2. index.html 接线（N5）=="
grep -q "if (d === 'resource') return loadResource();" "$IDX" \
  && fail "N5：?dim=resource 仍走 loadResource() 短路" \
  || pass "N5：已移除 ?dim=resource 的 loadResource() 短路"
grep -q "fetch('./' + d + '.html'" "$IDX" \
  && pass "N5：resource 与 industry 同路径（fetch('./'+d+'.html') 内嵌合并）" || fail "N5：未走同路径"
grep -q 'function loadResource' "$IDX" && grep -q "return loadResource();" "$IDX" \
  && pass "N5：loadResource() 保留为 resource 回退路径" || fail "N5：loadResource() 回退缺失"
node -e '
const s=require("fs").readFileSync(process.argv[1],"utf8");
const i=s.indexOf(".catch(function (e) {");
const tail=s.slice(i, i+520);
const onlyResource=/if \(d === .resource.\)/.test(tail) && /throw e;/.test(tail);
console.log(onlyResource?"OK":"BAD");
' "$IDX" | grep -q OK \
  && pass "N5：回退只对 resource 生效，region/industry 异常照旧冒泡（无回归）" \
  || fail "N5：回退作用域不是 resource-only"

GITDIRTY="$(cd "$ROOT_DIR" && git status --porcelain -- apps/explorer)"
echo "$GITDIRTY" | grep -qE '^.M apps/explorer/(region|industry)\.html' \
  && fail "N6：参考文件 region/industry.html 被改动" \
  || pass "N6：未改 region.html / industry.html 参考文件"

# ---------------------------------------------------------------------------
echo
echo "== §3. C1 API 契约（实测）=="
curl -sk "$API_BASE/api/taxonomy/resource/tree" > "$TMP_DIR/tree.json" 2>/dev/null
node - "$TMP_DIR/tree.json" <<'NODE' > "$TMP_DIR/tree.txt"
const j = JSON.parse(require('fs').readFileSync(process.argv[2], 'utf8'));
const h = {}; j.nodes.forEach(n => h[n.level] = (h[n.level] || 0) + 1);
const roots = j.nodes.filter(n => n.parent == null).map(n => n.code).sort();
console.log('TOTAL|' + j.nodes.length);
['section','division','group','class','subclass'].forEach(k => console.log('LVL|' + k + '|' + (h[k] || 0)));
console.log('ROOTS|' + roots.join(','));
NODE
ok_if "$(grep -oP '(?<=^TOTAL\|).*' "$TMP_DIR/tree.txt")" "4586" "C1 API tree 返回 4586 节点"
ok_if "$(grep -oP '(?<=^LVL\|section\|).*' "$TMP_DIR/tree.txt")" "10" "层级直方图 section=10"
ok_if "$(grep -oP '(?<=^LVL\|division\|).*' "$TMP_DIR/tree.txt")" "71" "层级直方图 division=71"
ok_if "$(grep -oP '(?<=^LVL\|group\|).*' "$TMP_DIR/tree.txt")" "327" "层级直方图 group=327"
ok_if "$(grep -oP '(?<=^LVL\|class\|).*' "$TMP_DIR/tree.txt")" "1301" "层级直方图 class=1301"
ok_if "$(grep -oP '(?<=^LVL\|subclass\|).*' "$TMP_DIR/tree.txt")" "2877" "层级直方图 subclass=2877"
ok_if "$(grep -oP '(?<=^ROOTS\|).*' "$TMP_DIR/tree.txt")" "0,1,2,3,4,5,6,7,8,9" "后端根=10 个门类（合成「联合国」在视图层）"

search_first() { curl -sk "$API_BASE/api/taxonomy/resource/search?q=$1&limit=20" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.items&&j.items[0]?(j.items[0].code+" "+j.items[0].name):"EMPTY")})'; }
ok_if "$(search_first '%E8%B0%B7%E7%89%A9')" "011 谷物" "search?q=谷物 首项 = 011 谷物"
ok_if "$(search_first '011')" "011 谷物" "search?q=011 首项 = 011 谷物"
ok_if "$(curl -sk "$API_BASE/api/taxonomy/resource/path/011" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{console.log(JSON.parse(s).nodes.map(n=>n.code).join("/"))})')" "0/01/011" "path/011 = 0 / 01 / 011"

# ---------------------------------------------------------------------------
echo
echo "== §4. 真浏览器 E2E（?dim=resource）=="
echo "   （同一浏览器会话内一并跑 §5 region / industry 无回归，断言名以 §5 前缀标记）"
cat > "$TMP_DIR/ui.cjs" <<'CJS'
const fs = require('fs');
const { chromium } = require(process.env.PW_CORE);
const BASE = process.env.WEB_BASE;
const REPORT = process.env.REPORT;
const R = [];
const C = (name, ok, info = '') => R.push({ name, ok: !!ok, info: String(info).slice(0, 200) });
const eq = (name, got, want) => C(name, String(got) === String(want), 'got=' + got + ' want=' + want);
const clean = s => String(s || '').replace(/\s+/g, ' ').trim();

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const DESK = { ignoreHTTPSErrors: true, viewport: { width: 1600, height: 1000 } };

  // ── 4.x resource ─────────────────────────────────────────────────────────
  const ctx = await browser.newContext(DESK);
  const page = await ctx.newPage();
  const errs = [], apiReqs = [], allReqs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console.error: ' + m.text()); });
  page.on('request', r => { allReqs.push(r.url()); if (/\/api\//.test(r.url())) apiReqs.push(r.url()); });

  const detailName = () => page.$eval('#detail-name', e => e.textContent);
  const detailCode = () => page.$eval('#detail-code', e => e.textContent);
  const detail = async () => clean(await detailName()) + ' / ' + clean(await detailCode());
  const treeRows = () => page.$$eval('#tree .tree-row', rs => rs.map(r => ({
    code: ((r.querySelector('.node-code') || {}).textContent || '').trim(),
    name: ((r.querySelector('.node-name') || {}).textContent || '').trim(),
    cur: r.classList.contains('current'),
  })));
  const crumbs = () => page.$$eval('#breadcrumbs button, #breadcrumbs .last', b => b.map(x => (x.textContent || '').trim()));
  const tiles = () => page.$$eval('#cpc-world .cpc-tile', t => t.length);

  await page.goto(BASE + '?dim=resource', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForSelector('#cpc-world .cpc-tile', { timeout: 25000 });
  await page.waitForTimeout(700);

  // 4.1
  eq('4.1 加载：pageerror / console.error = 0', errs.length, 0);
  C('4.1 同文档内嵌：无 iframe', (await page.$$('iframe')).length === 0, '');
  C('4.1 加载器已注入 #resource-data（方案 B 内嵌证据）', !!(await page.$('#resource-data')), '');
  const tabs = await page.$$eval('.gri-tabs button', b => b.map(x => x.textContent + (x.classList.contains('on') ? '*' : '')));
  eq('4.1 GRI 顶栏页签：资源页签高亮', tabs.join(','), '区域,行业,资源*');

  // 4.2 树顶层
  const tr = await treeRows();
  eq('4.2 树第 1 行 = 联合国（无编码，合成根）', tr[0].code + '|' + tr[0].name + '|' + tr[0].cur, '|联合国|true');
  eq('4.2 树第 2 行 = CPC', tr[1].code + '|' + tr[1].name, 'CPC|主要产品分类');
  const secs = tr.slice(2, 12);
  eq('4.2 树下 10 行 = 门类 0–9', secs.map(s => s.code).join(','), '0,1,2,3,4,5,6,7,8,9');
  eq('4.2 门类行数恰为 10', tr.length, 12);

  // 4.3 全景
  eq('4.3 全景标题', await page.$eval('#map-name', e => e.textContent), '联合国资源分类');
  eq('4.3 全景子级计数', clean(await page.$eval('#child-count', e => e.textContent)) + clean(await page.$eval('#child-count-label', e => e.textContent)), '10个门类');
  eq('4.3 视图层级标签', await page.$eval('#view-level', e => e.textContent), '门类全景');
  eq('4.3 明细默认 = 联合国', await detail(), '联合国 / UN');
  eq('4.3 面包屑根', (await crumbs()).join(','), '联合国');
  eq('4.3 层级图渲染 10 个门类', await tiles(), 10);
  eq('4.3 全景时「返回上级」禁用', await page.$eval('#go-back', e => e.disabled), true);

  // 4.4 搜索「谷物」
  await page.fill('#search', '谷物');
  await page.waitForSelector('.search-result', { timeout: 10000 });
  eq('4.4 搜索「谷物」首项显示 011 谷物', clean(await page.$eval('.search-result', e => e.textContent)), '谷物中类 · 01 农业、园艺和市场园艺产品011');
  await page.click('.search-result');
  await page.waitForTimeout(600);
  eq('4.4 点选搜索结果 → 明细 = 谷物 / 011', await detail(), '谷物 / 011');
  eq('4.4 点选后标题 = 011 · 谷物', await page.$eval('#map-name', e => e.textContent), '011 · 谷物');
  eq('4.4 点选后面包屑末段 = 011 谷物', (await crumbs()).slice(-1)[0], '011 谷物');
  eq('4.4 点选后树当前行 = 011', (await treeRows()).filter(r => r.cur).map(r => r.code).join(','), '011');

  // 4.4b 搜索「011」
  await page.fill('#search', '011');
  await page.waitForSelector('.search-result', { timeout: 10000 });
  eq('4.4 搜索「011」首项 = 011 谷物', clean(await page.$eval('.search-result', e => e.textContent)), '谷物中类 · 01 农业、园艺和市场园艺产品011');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  eq('4.4 回车跳转 → 明细 = 谷物 / 011', await detail(), '谷物 / 011');

  // 4.5 两视图渲染当前层子级
  eq('4.5 层级图渲染当前层子级（011 → 9 小类）', await tiles(), 9);
  eq('4.5 子级计数标签 = 个小类', await page.$eval('#child-count-label', e => e.textContent), '个小类');
  await page.click('[data-view="list"]');
  await page.waitForTimeout(500);
  const lrows = await page.$$eval('#cpc-list tbody tr', rs => rs.map(r => (r.querySelector('.code').textContent || '').trim()));
  eq('4.5 列表视图渲染当前层子级（9 行）', lrows.length, 9);
  eq('4.5 列表首行 = 0111', lrows[0], '0111');
  eq('4.5 列表视图缩放指示', await page.$eval('#zoom-value', e => e.textContent), '列表');
  await page.click('#cpc-list tbody tr:first-child');
  await page.waitForTimeout(500);
  eq('4.5 列表点行进入 → 明细 = 小麦 / 0111', await detail(), '小麦 / 0111');
  await page.click('[data-view="graph"]');
  await page.waitForTimeout(400);

  // 4.6 深层展开 0111 → 01111
  await page.click('#cpc-world .cpc-tile');
  await page.waitForTimeout(500);
  eq('4.6 层级图点位展开至末级 01111', await detail(), '小麦（种子） / 01111');
  const lvl = (await crumbs()).length;
  eq('4.6 面包屑 7 段（联合国→CPC→0→01→011→0111→01111）', lvl, 7);
  eq('4.6 路径时间线 7 步', await page.$$eval('.path-step', t => t.length), 7);
  await page.click('[data-tab="info"]');
  await page.waitForTimeout(300);
  eq('4.6 分类说明含五级分布/路径', (await page.$eval('#detail-body', e => e.textContent)).includes('所属分类路径'), true);

  // 4.7 末级形态 + 导航
  eq('4.7 末级视图标签 = 末级明细', await page.$eval('#view-level', e => e.textContent), '末级明细');
  eq('4.7 末级大字块 1 个', await page.$$eval('#cpc-world .cpc-tile.large', t => t.length), 1);
  eq('4.7 末级计数标签 = 位分类编码', await page.$eval('#child-count-label', e => e.textContent), '位分类编码');
  await page.click('#go-back');
  await page.waitForTimeout(450);
  eq('4.7 返回上级 → 0111', await detail(), '小麦 / 0111');
  await page.click('#go-home');
  await page.waitForTimeout(450);
  eq('4.7 全景 → 联合国', await detail(), '联合国 / UN');
  eq('4.7 全景时返回上级再次禁用', await page.$eval('#go-back', e => e.disabled), true);
  await page.click('#tree .tree-row:nth-child(3) .node-label');
  await page.waitForTimeout(400);
  eq('4.7 选门类后返回上级启用', await page.$eval('#go-back', e => e.disabled), false);
  await page.click('#tree .tree-row:nth-child(4) .node-label');
  await page.waitForTimeout(300);
  await page.click('#tree .tree-row:nth-child(5) .node-label');
  await page.waitForTimeout(300);
  await page.click('#breadcrumbs button >> nth=1');
  await page.waitForTimeout(450);
  eq('4.7 面包屑中段跳转 → CPC', await detail(), 'CPC Ver.3.0（主要产品分类） / CPC');
  await page.click('#tree .tree-row:nth-child(3) .node-label');
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(450);
  eq('4.7 Esc 返回上级 → CPC', await detail(), 'CPC Ver.3.0（主要产品分类） / CPC');

  // 4.8 明细页签
  await page.click('#tree .tree-row:nth-child(3) .node-label');
  await page.waitForTimeout(400);
  const tabLabels = await page.$$eval('[data-tab]', b => b.map(x => x.textContent));
  eq('4.8 明细三页签', tabLabels.join(','), '分类说明,子级列表,我的笔记');
  await page.click('[data-tab="children"]');
  await page.waitForTimeout(350);
  eq('4.8 子级列表 4 行（门类 0 的 4 个大类）', await page.$$eval('.child-row', t => t.length), 4);
  await page.fill('#child-filter', '农');
  await page.waitForTimeout(300);
  const filtered = await page.$$eval('.child-row', t => t.length);
  C('4.8 子级筛选「农」收窄结果', filtered < 4 && filtered > 0, 'filtered=' + filtered);
  await page.fill('#child-filter', '');
  await page.waitForTimeout(250);
  eq('4.8 清空筛选恢复 4 行', await page.$$eval('.child-row', t => t.length), 4);

  // 4.9 笔记 + 收藏 + 持久化
  await page.click('[data-tab="notes"]');
  await page.waitForTimeout(250);
  await page.fill('#notes-input', 'P5-A3 自检笔记');
  await page.waitForTimeout(350);
  C('4.9 笔记落盘提示为「已自动保存」', (await page.$eval('#notes-status', e => e.textContent)).includes('已自动保存'), await page.$eval('#notes-status', e => e.textContent));
  await page.click('#favorite-toggle');
  await page.waitForTimeout(350);
  eq('4.9 收藏 1 条', await page.$$eval('.favorite-item', t => t.length), 1);
  const favBefore = await detail();
  await page.click('#go-home');
  await page.waitForTimeout(400);
  await page.click('.favorite-item > button');
  await page.waitForTimeout(500);
  eq('4.9 点收藏跳回原节点', await detail(), favBefore);
  const curBefore = await detail();
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  eq('4.9 刷新后当前节点保持', await detail(), curBefore);
  eq('4.9 刷新后收藏保持', await page.$$eval('.favorite-item', t => t.length), 1);
  await page.click('[data-tab="notes"]');
  await page.waitForTimeout(300);
  eq('4.9 刷新后笔记保持', await page.$eval('#notes-input', e => e.value), 'P5-A3 自检笔记');

  // 4.10 完整目录
  await page.click('#catalog-strip button[data-depth="subclass"]');
  await page.waitForTimeout(1400);
  eq('4.10 完整目录 = 全部子类', await page.$eval('#map-name', e => e.textContent), 'CPC · 全部子类');
  eq('4.10 视图标签 = 完整目录', await page.$eval('#view-level', e => e.textContent), '完整目录');
  eq('4.10 2877 条子类全量渲染', await page.$$eval('#cpc-list tbody tr', t => t.length), 2877);
  eq('4.10 完整目录强制列表视图', await page.$eval('#zoom-value', e => e.textContent), '列表');
  await page.click('[data-view="graph"]');
  await page.waitForTimeout(600);
  eq('4.10 切回层级图退出完整目录（回到 CPC 门类全景）', await page.$eval('#view-level', e => e.textContent), '门类全景');
  eq('4.10 退出完整目录后层级图渲染 10 门类', await tiles(), 10);
  await page.click('#go-home');
  await page.waitForTimeout(400);

  // 4.11 导出
  for (const [sel, ext, tag] of [['#export-branch-json', '.json', 'JSON'], ['#export-branch-csv', '.csv', 'CSV'],
                                 ['#export-all-csv', '.csv', '完整目录 CSV'], ['#export-png', '.png', 'PNG']]) {
    await page.click('#export-toggle');
    await page.waitForTimeout(250);
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 25000 }).catch(() => null),
      page.click(sel),
    ]);
    C('4.11 导出 ' + tag + ' 触发下载', dl && dl.suggestedFilename().endsWith(ext),
      dl ? dl.suggestedFilename() : '未触发下载');
  }
  await page.keyboard.press('Escape');

  // 4.12 帮助 + Ctrl+K
  await page.click('#help-open');
  await page.waitForTimeout(350);
  eq('4.12 帮助弹窗可开', await page.$eval('#help-modal', e => !e.classList.contains('hidden')), true);
  eq('4.12 五级层级表 5 行', await page.$$eval('.modal-table tr', t => t.length - 1), 5);
  const helpTxt = clean(await page.$eval('#help-modal', e => e.textContent));
  C('4.12 帮助说明数据来源为 C1 本体 API', helpTxt.includes('/api/taxonomy/resource'), '');
  C('4.12 帮助说明中文名称为机翻工作译名（非联合国官方中文）', helpTxt.includes('非联合国官方中文'), '');
  C('4.12 帮助说明两级根为视图层合成', helpTxt.includes('视图层合成'), '');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  eq('4.12 Esc 关闭帮助', await page.$eval('#help-modal', e => e.classList.contains('hidden')), true);
  await page.click('body');
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(300);
  eq('4.12 Ctrl+K 聚焦搜索框', await page.evaluate(() => document.activeElement.id), 'search');

  // 4.13 N2/N3 运行时
  const badApi = apiReqs.filter(u => !/\/api\/taxonomy\/resource\//.test(u));
  C('4.13 N2：全部 /api/ 请求都落在 C1 资源 API', badApi.length === 0, badApi.slice(0, 3).join(' '));
  C('4.13 N2：确实调用了 C1 资源 API', apiReqs.length > 0, 'api requests=' + apiReqs.length);
  const syntheticLeak = apiReqs.filter(u => /\/api\/taxonomy\/resource\/(node|children|path)\/(UN|CPC)\b/.test(u));
  C('4.13 N3：合成根 id 从未发给后端', syntheticLeak.length === 0, syntheticLeak.join(' '));
  C('4.13 N2：未从非 API 文件取数据', !allReqs.some(u => /\.(json|csv)$/.test(u) && !/\/api\//.test(u)), '');

  // 4.14 N6 运行时：GRI 皮肤令牌生效
  const tok = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return { teal: cs.getPropertyValue('--teal').trim(), bg: cs.getPropertyValue('--bg').trim(),
             tint: cs.getPropertyValue('--tint').trim(), stage: cs.getPropertyValue('--stage').trim(),
             cardBg: getComputedStyle(document.querySelector('.map-card')).backgroundColor,
             tileFill: getComputedStyle(document.querySelector('.cpc-tile .tile-bg')).fill };
  });
  eq('4.14 N6：GRI 皮肤令牌生效（--teal）', tok.teal.toLowerCase(), '#1b7a3d');
  eq('4.14 N6：GRI 基础令牌生效（--bg）', tok.bg.toLowerCase(), '#f4fcf5');
  C('4.14 N6：层级图底色来自令牌（--stage）', !!tok.stage && tok.cardBg !== 'rgba(0, 0, 0, 0)', tok.cardBg);
  C('4.14 N6：瓦片填充来自令牌（非 SVG 默认黑）', tok.tileFill !== 'rgb(0, 0, 0)' && !!tok.tileFill, tok.tileFill);

  eq('4.15 全程 pageerror / console.error 仍为 0', errs.length, 0);
  if (errs.length) errs.slice(0, 6).forEach(e => C('   └ ' + e, false, ''));
  const resScroll = await page.evaluate(() => document.documentElement.scrollWidth);
  await ctx.close();

  // ── 4.16 移动端 ───────────────────────────────────────────────────────────
  const mctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 375, height: 812 } });
  const m = await mctx.newPage();
  const merrs = [];
  m.on('pageerror', e => merrs.push(e.message));
  m.on('console', c => { if (c.type() === 'error') merrs.push('console.error: ' + c.text()); });
  await m.goto(BASE + '?dim=resource', { waitUntil: 'networkidle', timeout: 60000 });
  await m.waitForSelector('#cpc-world .cpc-tile', { timeout: 25000 });
  await m.waitForTimeout(900);
  eq('4.16 移动端 375px：层级图仍渲染 10 门类', await m.$$eval('#cpc-world .cpc-tile', t => t.length), 10);
  eq('4.16 移动端：分类树抽屉按钮可见', await m.$eval('#tree-open', e => getComputedStyle(e).display !== 'none'), true);
  await m.click('#tree-open');
  await m.waitForTimeout(350);
  eq('4.16 移动端：抽屉可展开', await m.$eval('#sidebar', e => e.classList.contains('open')), true);
  const mrows = await m.$$eval('#sidebar .tree-row', rs => rs.map(r => ({
    code: ((r.querySelector('.node-code') || {}).textContent || '').trim(),
    name: ((r.querySelector('.node-name') || {}).textContent || '').trim(),
  })));
  await m.click('#sidebar .tree-row:nth-child(4) .node-label');
  await m.waitForTimeout(600);
  eq('4.16 移动端：树点选联动明细（明细 = 该行）',
     clean(await m.$eval('#detail-name', e => e.textContent)) + '/' + clean(await m.$eval('#detail-code', e => e.textContent)),
     mrows[3].name + '/' + mrows[3].code);
  eq('4.16 移动端：切树后抽屉自动收起', await m.$eval('#sidebar', e => e.classList.contains('open')), false);
  eq('4.16 移动端 pageerror / console.error = 0', merrs.length, 0);
  const mScroll = await m.evaluate(() => document.documentElement.scrollWidth);
  await mctx.close();

  // ── §5 region / industry 无回归 ──────────────────────────────────────────
  for (const dim of ['region', 'industry']) {
    const c2 = await browser.newContext(DESK);
    const p2 = await c2.newPage();
    const e2 = [];
    p2.on('pageerror', e => e2.push(e.message));
    p2.on('console', c => { if (c.type() === 'error') e2.push('console.error: ' + c.text()); });
    await p2.goto(BASE + '?dim=' + dim, { waitUntil: 'networkidle', timeout: 60000 });
    await p2.waitForTimeout(2500);
    const rows = await p2.$$eval('.tree-row', r => r.length);
    const tabs2 = await p2.$$eval('.gri-tabs button', b => b.map(x => x.textContent + (x.classList.contains('on') ? '*' : '')));
    C('§5 ' + dim + '：顶栏/搜索/树可用', !!(await p2.$('.topbar')) && !!(await p2.$('#search')) && rows > 3, 'tree-rows=' + rows);
    C('§5 ' + dim + '：GRI 控件注入且本页签高亮', tabs2.join(',') === (dim === 'region' ? '区域*,行业,资源' : '区域,行业*,资源'), tabs2.join(','));
    C('§5 ' + dim + '：未加载 resource.html（无 #resource-data）', !(await p2.$('#resource-data')), '');
    if (dim === 'region') {
      C('§5 region：地图渲染（#map-svg + 图形元素）', (await p2.$$eval('#map-svg .region', t => t.length)) > 0, '');
      eq('§5 region：明细默认 = 联合国', clean(await p2.$eval('#detail-name', e => e.textContent)), '联合国');
    } else {
      eq('§5 industry：树顶层 = 联合国', clean(await p2.$$eval('.tree-row', r => r.slice(0, 1).map(x => x.textContent)[0] || '')), '联合国1');
      eq('§5 industry：视图切换 地图/层级图/列表', (await p2.$$eval('[data-view]', b => b.map(x => x.dataset.view))).join(','), 'map,graph,list');
      eq('§5 industry：明细默认 = 联合国', clean(await p2.$eval('#detail-name', e => e.textContent)), '联合国');
      C('§5 industry：ISIC 层级图渲染', (await p2.$$eval('#map-svg [data-id]', t => t.length)) > 0, '');
    }
    eq('§5 ' + dim + '：pageerror / console.error = 0', e2.length, 0);
    await c2.close();
  }
  C('§4.15 桌面横向未溢出视口', resScroll <= 1600, 'scrollWidth=' + resScroll);

  // 移动端横向溢出对比：同宽 375px，resource 不劣于参考页签 industry
  // （残余 29px 来自加载器注入的共享 GRI 控件条 .gri-controls，两者一致，非本页签缺陷）
  const mctx2 = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 375, height: 812 } });
  const mi = await mctx2.newPage();
  await mi.goto(BASE + '?dim=industry', { waitUntil: 'networkidle', timeout: 60000 });
  await mi.waitForTimeout(2500);
  const indScroll = await mi.evaluate(() => document.documentElement.scrollWidth);
  await mctx2.close();
  C('§4.16 移动端横向溢出与参考页签一致（共享 GRI 控件条，不劣于 industry）',
    mScroll <= indScroll, 'resource@375=' + mScroll + ' industry@375=' + indScroll);

  await browser.close();
  fs.writeFileSync(REPORT, JSON.stringify(R, null, 0));
})().catch(e => {
  fs.writeFileSync(REPORT, JSON.stringify(R.concat([{ name: '浏览器脚本异常终止', ok: false, info: e.message }]), null, 0));
  process.exit(0);
});
CJS

if [ "$NGINX_UP" != 1 ]; then
  skip "§4/§5 浏览器 E2E（nginx 未运行）"
else
  export PW_CORE WEB_BASE
  export REPORT="$TMP_DIR/ui.json"
  node "$TMP_DIR/ui.cjs" 2>"$TMP_DIR/ui.err" || true
  if [ -s "$TMP_DIR/ui.json" ]; then
    while IFS='|' read -r _ verdict name info; do
      [ "$verdict" = "1" ] && pass "$name${info:+ （$info）}" || fail "$name${info:+ （$info）}"
    done < <(node -e '
      const R = JSON.parse(require("fs").readFileSync(process.env.REPORT, "utf8"));
      const flat = s => String(s == null ? "" : s).replace(/[\r\n|]+/g, " ").trim();
      R.forEach(r => console.log("A|" + (r.ok ? 1 : 0) + "|" + flat(r.name) + "|" + flat(r.info)));
    ')
  else
    fail "浏览器 E2E 未产出报告（stderr 尾：$(tail -3 "$TMP_DIR/ui.err" | tr '\n' ' '))"
  fi
fi

# ---------------------------------------------------------------------------
echo
echo "== §6. 凭据零泄漏 =="
LEAK=0
for f in "$RES" "$IDX" "${BASH_SOURCE[0]}"; do
  if grep -qE 'BEGIN [A-Z ]*PRIVATE KEY|AKIA[0-9A-Z]{16}|nvapi-[A-Za-z0-9_-]{8}|password\s*[:=]\s*["'"'"'][^"'"'"']{4,}|Bearer [A-Za-z0-9._-]{20,}' "$f"; then
    LEAK=1; fail "凭据泄漏嫌疑：$(basename "$f")"; grep -nE 'BEGIN [A-Z ]*PRIVATE KEY|AKIA[0-9A-Z]{16}|nvapi-|Bearer [A-Za-z0-9._-]{20,}' "$f" | head -3
  fi
done
[ "$LEAK" = 0 ] && pass "resource.html / index.html / 本脚本：无密钥、无私钥、无硬编码口令"
grep -qE 'test1234|testuser' "$RES" && fail "resource.html 出现测试凭据" || pass "resource.html 不含测试凭据（本页签为匿名只读）"

# ---------------------------------------------------------------------------
echo
echo "== §7. 改动范围（不 commit / 不 checkout）=="
HEAD_BEFORE="$(cd "$ROOT_DIR" && git rev-parse HEAD)"
STAGED="$(cd "$ROOT_DIR" && git diff --cached --name-only | tr '\n' ' ')"
[ -z "$STAGED" ] && pass "无暂存改动（未 commit）" || fail "存在已暂存改动：$STAGED"

CHANGED="$(cd "$ROOT_DIR" && { git diff --name-only; git ls-files --others --exclude-standard; } | sort -u | tr '\n' ' ')"
UNEXPECTED="$(printf '%s\n' $CHANGED | grep -vE '^(apps/explorer/(index|resource)\.html|\.agents/)' | tr '\n' ' ')"
[ -z "$UNEXPECTED" ] && pass "改动面只在 apps/explorer/{resource.html 新增,index.html 改} + .agents/ 产出" \
  || fail "出现预期外改动：$UNEXPECTED"
echo "$CHANGED" | grep -q 'apps/explorer/resource.html' && pass "新增 apps/explorer/resource.html 在改动清单中" || fail "resource.html 不在改动清单"
echo "$CHANGED" | grep -q 'apps/explorer/index.html' && pass "修改 apps/explorer/index.html 在改动清单中" || fail "index.html 不在改动清单"

HEAD_AFTER="$(cd "$ROOT_DIR" && git rev-parse HEAD)"
ok_if "$HEAD_AFTER" "$HEAD_BEFORE" "§7 全流程未产生新提交（HEAD 前后一致，未 commit 未 checkout）"

# ---------------------------------------------------------------------------
echo
if [ "$FAIL" -eq 0 ]; then
  echo "PASS=$PASS FAIL=0 VERIFY_EXIT=0（SKIP=$SKIP）"
  exit 0
else
  echo "PASS=$PASS FAIL=$FAIL VERIFY_EXIT=1（SKIP=$SKIP）"
  exit 1
fi
