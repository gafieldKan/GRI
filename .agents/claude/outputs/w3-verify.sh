#!/usr/bin/env bash
# ============================================================================
# W3 验收：模块内容世界外壳（统一世界语言）+ 智学慧眼「学习世界」接入
#
# 结构：
#   §0 前置        —— nginx/api/postgres/redis 在跑；node + playwright-core + chromium 可用；两前端已 install
#   §1 构建        —— apps/web-ai-tutor 与 apps/portal `npm run build:h5` 均通过；产物带世界令牌与学科山几何类
#   §2 N2 一份画法 —— packages/world-art 在册（画法 + 外壳 + 过场）；零色值；两前端各配 @world-art 且都真的引了；
#                     旧路径已删、全仓只有一份 personMarker/structureFor/buildPortrait（无第二套画法）
#   §3 N1 世界语言 —— tutor 引 persona-world.css（世界色唯一真源）+ styles/world.css（几何类单份）；
#                     两 App 用同一批几何类名与同一批 --world-* 令牌；共享件无自造色
#   §4 N3 外壳     —— WorldShell 顶栏（模块名 + 返回人本世界 + 回功能导航 + 模块动作槽）+ 共用的过关之门；
#                     无 iframe、不改后端契约（只读 W1 读面 + 既有 tutor 面）
#   §5 N4 学习世界 —— world.vue 套壳；HEAD 版 128 个标识符全部保留（功能无损，脚本自动比对）；
#                     登峰地图/营地选中/登顶三态/学科切换/详情三动作 全部在；世界数据钩子齐备
#   §6 N5 进入体验 —— 门户「学习」→ 学习世界（hash 路由 + from=world，后端 entry_url 不动）；
#                     双出口（返回人本世界 / 回智学慧眼），不把用户困在单页
#   §7 零裸色      —— 改动面 hex/rgb/具名色 三重 grep 空；var(--) 无「用了没声明」
#   §8 真浏览器 E2E（学生身份，同源双 App 托管）
#       8.1 登录→人本世界；8.2 学习意向；8.3 门户半程过场；8.4 落点=学习世界+from=world；
#       8.5 模块半程承接过场（同一道门）；8.6 世界顶栏；8.7 跨世界同一人（外观类相等）；
#       8.8 登峰版图渲染；8.9 登顶三态+已登顶；8.10 世界状态；8.11 营地详情三动作；
#       8.12 攀爬生长；8.13 学科切换（并还原）；8.14 返回人本世界（免二登）；
#       8.15 回功能导航；8.16 其余 9 页 pageerror=0；8.17 全链路 pageerror/console.error=0
#   §9 无回归      —— 19 页全注册且全部产出分片；世界页仍走同一批 store/读面；构建产物同名分片仍在
#   §10 凭据零泄漏
#   §11 改动范围   —— HEAD 未变、未 checkout、暂存区空、改动全在白名单内
#   §12 未覆盖项（明示，不计 FAIL）
#
# 依赖：docker（gri-nginx / gri-api / gri-postgres / gri-redis 在跑）；两前端已 npm install；
#       node + /home/ubantu/openclaw/node_modules/playwright-core + chromium。
# 凭据：仅 dev 测试账号（E2E_IDENTIFIER / E2E_PASSWORD 可覆盖）；脚本不落任何密钥、不打印 token/密码。
# 副作用：§1 写两前端 dist（gitignore）；§8 浏览器只读 + §8.13 切一次学科后**还原原学科**；§8 不改任何账号数据。
# 用法：  bash .agents/claude/outputs/w3-verify.sh
# 通过：  末尾打印「PASS=<n> FAIL=0 VERIFY_EXIT=0」
# ============================================================================
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PORTAL_DIR="$ROOT_DIR/apps/portal"
TUTOR_DIR="$ROOT_DIR/apps/web-ai-tutor"
PORTAL_DIST="$PORTAL_DIR/dist/build/h5"
TUTOR_DIST="$TUTOR_DIR/dist/build/h5"
OUT_DIR="$ROOT_DIR/.agents/claude/outputs"
SHARED_DIR="$ROOT_DIR/packages/world-art"
SHARED_SRC="$SHARED_DIR/src"
PORTAL_WORLD="$PORTAL_DIR/src/pages/world/index.vue"
TUTOR_WORLD="$TUTOR_DIR/src/pages/twin/world.vue"
PORTAL_MAIN="$PORTAL_DIR/src/main.js"
TUTOR_MAIN="$TUTOR_DIR/src/main.js"

E2E_IDENTIFIER="${E2E_IDENTIFIER:-testuser}"
E2E_PASSWORD="${E2E_PASSWORD:-test1234}"
PW_CORE="${PW_CORE:-/home/ubantu/openclaw/node_modules/playwright-core}"
TEST_PORT="${TEST_PORT:-5299}"

TMP_DIR="$(mktemp -d /tmp/w3.XXXXXX)"
SERVER_PID=""

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
ok_ge() { [ "$1" -ge "$2" ] 2>/dev/null && pass "$3（$1 ≥ $2）" || fail "$3（期望 ≥ $2，实得「$1」）"; }
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

echo "== §0. 前置环境 =="
for c in gri-nginx gri-api gri-postgres gri-redis; do
  docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$c" && pass "$c 在跑" || fail "$c 未运行"
done
[ -d "$PW_CORE" ] && pass "playwright-core 就位（$PW_CORE）" || fail "playwright-core 缺失：$PW_CORE"
node -e 'process.exit(0)' >/dev/null 2>&1 && pass "node 可用" || fail "node 不可用"
[ -d "$PORTAL_DIR/node_modules" ] && pass "apps/portal node_modules 就位" || fail "apps/portal 未 npm install"
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
echo "== §1. 构建（两个前端 build:h5）=="
for pair in "门户:$PORTAL_DIR:$PORTAL_DIST:pages-world-index" "智学慧眼:$TUTOR_DIR:$TUTOR_DIST:pages-twin-world"; do
  NAME="${pair%%:*}"; REST="${pair#*:}"; DIR="${REST%%:*}"; REST="${REST#*:}"; DIST="${REST%%:*}"; CHUNK="${REST##*:}"
  LOG="$TMP_DIR/build-$CHUNK.log"
  ( cd "$DIR" && npm run build:h5 ) >"$LOG" 2>&1
  RC=$?
  ok_if "$RC" "0" "$NAME npm run build:h5 通过（exit 0）"
  [ "$RC" != 0 ] && tail -6 "$LOG" | sed 's/^/      /'
  ok_file "$DIST/index.html" "$NAME 构建产物 index.html 存在"
  ok_has "$(ls "$DIST/assets" 2>/dev/null | tr '\n' ' ')" "$CHUNK" "$NAME 产物含世界分片（$CHUNK）"
done

TUTOR_CSS="$(cat "$TUTOR_DIST"/assets/*.css 2>/dev/null)"
ok_has "$TUTOR_CSS" "--world-terrace-current" "学习世界产物已带学科山令牌（--world-terrace-current）"
ok_has "$TUTOR_CSS" ".w-terrace-current" "学习世界产物已带几何类映射（.w-terrace-current）"
ok_has "$TUTOR_CSS" "--world-sky-mid" "学习世界产物已带世界天光令牌（--world-sky-mid）"
ok_has "$TUTOR_CSS" ".w-marker-halo" "学习世界产物已带人物画法类（.w-marker-halo）"
PORTAL_CSS="$(cat "$PORTAL_DIST"/assets/*.css 2>/dev/null)"
ok_has "$PORTAL_CSS" "--world-terrace-current" "门户产物已带同一批学科山令牌（同一份色源）"
ok_has "$PORTAL_CSS" ".w-terrace-current" "门户产物已带同一批几何类（同一份映射）"

# ---------------------------------------------------------------------------
echo
echo "== §2. N2 一份画法（共享件，禁止两套）=="
for f in package.json src/index.js src/art.js src/WorldShell.vue src/WorldTransition.vue; do
  ok_file "$SHARED_SRC/../$f" "共享件在册：packages/world-art/$f"
done
ok_has "$(cat "$SHARED_DIR/package.json")" '"@gri/world-art"' "共享件有包名（workspace 成员）"
LOCK_HAS="$(grep -c '"packages/world-art"' "$ROOT_DIR/package-lock.json" 2>/dev/null)"
ok_ge "$LOCK_HAS" 1 "package-lock.json 已登记共享件（npm ci 不因新 workspace 失败）"
LOCK_LINK="$(grep -c '"node_modules/@gri/world-art"' "$ROOT_DIR/package-lock.json" 2>/dev/null)"
ok_if "$LOCK_LINK" "1" "package-lock.json 已登记 @gri/world-art 软链"

DEFS="$(grep -rn "export function personMarker\|export function structureFor\|export function buildPortrait\|export function buildWorldScenes\|export function personaLook" "$ROOT_DIR/apps" "$ROOT_DIR/packages" --include=*.js --include=*.vue 2>/dev/null | sed "s#^$ROOT_DIR/##" | cut -d: -f1 | sort -u | tr '\n' ' ')"
ok_set "$DEFS" "packages/world-art/src/art.js " "画法原语只有一份（personMarker/structureFor/buildPortrait/buildWorldScenes/personaLook 仅在共享件定义）"

STALE="$(ls "$PORTAL_DIR/src/utils/world-art.js" "$PORTAL_DIR/src/styles/world.css" "$PORTAL_DIR/src/components/world/WorldTransition.vue" 2>/dev/null | wc -l | tr -d ' ')"
ok_if "$STALE" "0" "旧路径三件已删（portal 不再自持画法/样式/过场）"
WORLD_CSS_N="$(ls "$ROOT_DIR"/styles/world.css "$ROOT_DIR"/apps/*/src/styles/world.css 2>/dev/null | wc -l | tr -d ' ')"
ok_if "$WORLD_CSS_N" "1" "几何类映射只有一份（styles/world.css，全仓唯一）"

for pair in "portal:$PORTAL_DIR/vite.config.js" "web-ai-tutor:$TUTOR_DIR/vite.config.js"; do
  NAME="${pair%%:*}"; CFG="${pair#*:}"
  ok_has "$(cat "$CFG")" "'@world-art': path.resolve(__dirname, '../../packages/world-art/src')" "$NAME 配了 @world-art 别名（指向同一路径）"
  ok_has "$(cat "$CFG")" "packages/world-art" "$NAME dev server fs.allow 放行共享件"
done
PORTAL_IMPORTS="$(grep -rl "@world-art" "$PORTAL_DIR/src" 2>/dev/null | sed "s#^$ROOT_DIR/##" | tr '\n' ' ')"
TUTOR_IMPORTS="$(grep -rl "@world-art" "$TUTOR_DIR/src" 2>/dev/null | sed "s#^$ROOT_DIR/##" | tr '\n' ' ')"
ok_has "$PORTAL_IMPORTS" "pages/world/index.vue" "门户人本世界真的引共享件（不是各写一套）"
ok_has "$PORTAL_IMPORTS" "components/world/LifeWorld.vue" "门户生活全景真的引共享件"
ok_has "$TUTOR_IMPORTS" "pages/twin/world.vue" "智学慧眼学习世界真的引共享件"
SECOND_ART="$(grep -rlE "^(const|function|export) .*(isoBox|TERRAIN|STRUCTURES)" "$TUTOR_DIR/src" "$PORTAL_DIR/src" 2>/dev/null | wc -l | tr -d ' ')"
ok_if "$SECOND_ART" "0" "两个前端源码内零画法实现（只有引用，无第二套）"

echo
echo "== §3. N1 统一世界语言（同令牌 + 同几何类）=="
ok_has "$(cat "$TUTOR_MAIN")" "@styles/tokens/themes/persona-world.css" "智学慧眼引世界色唯一真源（persona-world.css）"
ok_has "$(cat "$TUTOR_MAIN")" "@styles/world.css" "智学慧眼引几何类映射（styles/world.css）"
ok_has "$(cat "$PORTAL_MAIN")" "@styles/tokens/themes/persona-world.css" "门户引同一份世界色真源"
ok_has "$(cat "$PORTAL_MAIN")" "@styles/world.css" "门户引同一份几何类映射（路径同一处）"
ok_not_has "$(cat "$PORTAL_MAIN")" "./styles/world.css" "门户不再引本地私有副本"
TOKENS="$ROOT_DIR/styles/tokens/themes/persona-world.css"
ok_has "$(cat "$TOKENS")" "学习世界" "世界色源注明模块内容世界消费方（口径一致）"
for t in world-hill-body world-terrace-passed world-terrace-current world-trail wold-nope; do
  [ "$t" = "wold-nope" ] && continue
  ok_has "$(cat "$TOKENS")" "--$t:" "学科山令牌在册：--$t"
done
# 画法层用到的每个 w-* 类都必须在同一份映射里有取值（无孤儿类 = 真的是同一套语言）
ORPHAN_JSON="$TMP_DIR/orphan.json"
(cd "$ROOT_DIR" && node -e '
const fs=require("fs");
const css=fs.readFileSync("styles/world.css","utf8");
const declared=new Set([...css.matchAll(/\.(w-[a-z0-9-]+)/g)].map(m=>m[1]));
const FILES=process.argv.slice(1);
const all=new Set();
for(const f of FILES){ for(const m of fs.readFileSync(f,"utf8").matchAll(/\bw-[a-z0-9-]+\b/g)) all.add(m[0]); }
// 画法里 block(...,"w-wall") 这类是前缀（真实类名是 w-wall-left/right/top），前缀不算孤儿。
const orphan=[...all].filter(c=>!declared.has(c)&&![...declared].some(d=>d.startsWith(c+"-"))).sort();
console.log(JSON.stringify({declared:declared.size,used:all.size,orphan}));
' "$SHARED_SRC/art.js" "$SHARED_SRC/WorldShell.vue" "$SHARED_SRC/WorldTransition.vue" \
  "$TUTOR_DIR/src/pages/twin/world.vue" "$PORTAL_DIR/src/components/world/LifeWorld.vue" \
  "$PORTAL_DIR/src/components/world/PersonaCard.vue" "$PORTAL_DIR/src/components/world/OrgCard.vue" \
  "$PORTAL_WORLD" > "$ORPHAN_JSON" 2>/dev/null)
ORPHAN="$(node -e 'console.log(require(process.argv[1]).orphan.join(","))' "$ORPHAN_JSON" 2>/dev/null)"
ORPHAN_USED="$(node -e 'console.log(require(process.argv[1]).used)' "$ORPHAN_JSON" 2>/dev/null)"
ORPHAN_DECL="$(node -e 'console.log(require(process.argv[1]).declared)' "$ORPHAN_JSON" 2>/dev/null)"
ok_if "$ORPHAN" "" "两个世界用的 $ORPHAN_USED 个几何类全部在同一份映射里有取值（$ORPHAN_DECL 条规则，零孤儿 = 同一套世界语言）"
for c in w-terrace w-terrace-passed w-terrace-current w-terrace-ahead w-marker-halo w-marker w-sky w-cloud w-snow w-trail w-leaf-2; do
  ok_has "$(cat "$ROOT_DIR/styles/world.css")" ".$c " "共有几何类在册：$c"
done
SHARED_COLOR="$(grep -rnE '#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(' "$SHARED_SRC" 2>/dev/null | wc -l | tr -d ' ')"
ok_if "$SHARED_COLOR" "0" "共享件零色值（画法层不含任何字面量颜色）"

# ---------------------------------------------------------------------------
echo
echo "== §4. N3 模块内容世界外壳 =="
SHELL="$SHARED_SRC/WorldShell.vue"
WT="$SHARED_SRC/WorldTransition.vue"
ok_has "$(cat "$SHELL")" "data-world-shell" "外壳带定位钩子（data-world-shell=模块码）"
ok_has "$(cat "$SHELL")" "data-world-home" "外壳有「返回人本世界」出口"
ok_has "$(cat "$SHELL")" "data-app-home" "外壳有「回本模块功能导航」出口（不困在单页）"
ok_has "$(cat "$SHELL")" "worldHomeLabel: { type: String, default: '返回人本世界' }" "返回人本世界是默认出口（每个世界都天然有）"
ok_has "$(cat "$SHELL")" 'slot name="actions"' "外壳顶栏留模块自己的动作槽（学科切换等）"
ok_has "$(cat "$SHELL")" "ws-body" "外壳给内容世界留插槽容器"
ok_has "$(cat "$SHELL")" "<WorldTransition" "外壳内置过关之门（模块半程承接）"
ok_has "$(cat "$SHELL")" "props.entering" "由 entering 驱动承接过场（门户带 from=world 走来）"
ok_has "$(cat "$SHELL")" "window.location.assign(url)" "返回人本世界走同源整页跳转（令牌在册 → 免二登）"
ok_has "$(cat "$SHELL")" "uni.switchTab" "回功能导航优先 switchTab（tabBar 页可得）"
ok_has "$(cat "$WT")" "从 \${props.from} 出发" "过场文案取当趟出发地（每次走进都重算）"
ok_has "$(cat "$WT")" "走进 \${props.label}" "过场文案取当趟目的地（不念第一趟的词）"
ok_not_has "$(cat "$WT")" "const sceneLabel = props.from" "过场文案不是 setup 常量（连走两趟会念旧词的那版已修）"
IFRAME="$(grep -rn "<iframe\|foreignObject" "$SHELL" "$WT" "$TUTOR_WORLD" 2>/dev/null | wc -l | tr -d ' ')"
ok_if "$IFRAME" "0" "无 iframe / foreignObject（同一页面内套壳，不嵌套宿主）"
ok_has "$(cat "$SHARED_DIR/package.json")" "WorldShell.vue" "外壳与过场经包导出面暴露（消费方按名引入）"

echo
echo "== §5. N4 学习世界（套壳 + 功能无损）=="
ok_has "$(cat "$TUTOR_WORLD")" "WorldShell" "学习世界套入统一外壳"
ok_has "$(cat "$TUTOR_WORLD")" 'module-code="tutor"' "外壳挂模块码 tutor（与模块注册表同码）"
ok_has "$(cat "$TUTOR_WORLD")" 'app-home-url="/pages/index/index"' "外壳给出回本模块功能导航的目的地"
ok_has "$(cat "$TUTOR_WORLD")" ':entering="entering"' "外壳接住 from=world 的承接过场"
ok_has "$(cat "$TUTOR_WORLD")" "personMarker" "世界里的「我」用共享画法（与人本世界同一套）"
ok_has "$(cat "$TUTOR_WORLD")" "getActivationContext" "身份真源取 W1 context/me（与人本世界同一人）"
ok_has "$(cat "$TUTOR_WORLD")" "auth.restore()" "身份取不到时退化为本地登录态（不卡住页面）"

# 功能无损：HEAD 版的标识符必须一个不少（脚本自动比对，不靠人眼）
ID_CMP="$TMP_DIR/ids.json"
( cd "$ROOT_DIR" && git show "HEAD:apps/web-ai-tutor/src/pages/twin/world.vue" > "$TMP_DIR/world.head.vue" ) 2>/dev/null
node -e '
const fs=require("fs");
const ids=(t)=>{const s=t.slice(t.indexOf("<script setup>"),t.indexOf("</script>"));const out=new Set();
 for(const m of s.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)/g)) out.add(m[1]);
 for(const m of s.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=/g)) out.add(m[1]);
 return out};
const a=ids(fs.readFileSync(process.argv[1],"utf8"));
const b=ids(fs.readFileSync(process.argv[2],"utf8"));
console.log(JSON.stringify({head:a.size, now:b.size, gone:[...a].filter(x=>!b.has(x))}));
' "$TMP_DIR/world.head.vue" "$TUTOR_WORLD" > "$ID_CMP" 2>/dev/null
ID_GONE="$(node -e 'console.log(require(process.argv[1]).gone.join(","))' "$ID_CMP" 2>/dev/null)"
ID_NOW="$(node -e 'console.log(require(process.argv[1]).now)' "$ID_CMP" 2>/dev/null)"
ID_HEAD="$(node -e 'console.log(require(process.argv[1]).head)' "$ID_CMP" 2>/dev/null)"
ok_if "$ID_GONE" "" "登峰页 HEAD 版 $ID_HEAD 个标识符一个不少（功能无损，现 $ID_NOW 个）"

for sym in ridgePath snowCap contours terraces flora trailPoints climbedPoints climber MAP_W BASE_Y APEX \
           buildTrailPoints pathSamples pointAtF animateClimb layerState masteryWord \
           pick selectFrontier openArea switchSubject practiceHere askTeacher goGraph goMemory loadMap \
           frontierAreas masteredCount routeSteps createRipple relTime handleKeyDown; do
  ok_has "$(cat "$TUTOR_WORLD")" "$sym" "登峰功能保留：$sym"
done
for hook in 'data-map' 'data-camp=' 'data-camp-state' 'data-camp-mastered' 'data-camp-detail' 'data-subject=' 'data-subject-active' \
            'data-legend' 'data-practice' 'data-ask-teacher' 'data-graph' 'data-status' 'data-climber' 'data-here' 'data-subject-toggle'; do
  ok_has "$(cat "$TUTOR_WORLD")" "$hook" "世界数据钩子：$hook"
done
ok_has "$(cat "$TUTOR_DIR/src/pages.json")" '"navigationBarTitleText": "学习世界"' "世界页导航栏标题 = 学习世界（与人本世界同制：默认导航栏）"
ok_has "$(cat "$TUTOR_WORLD")" "isCurrentSubject" "学科条当前项按码归一比较（原严格全等在两制学科码下永不亮）"
ok_has "$(cat "$TUTOR_DIR/src/api/index.js")" "export async function getActivationContext" "api 导出 getActivationContext（只读 W1 读面）"
ok_has "$(cat "$TUTOR_DIR/src/api/index.js")" "catch (e) { return null }" "W1 读面失败不抛错（世界不因身份面断而白屏）"

# ---------------------------------------------------------------------------
echo
echo "== §6. N5 进入体验（门户 → 学习世界 + 双出口）=="
ok_has "$(cat "$PORTAL_WORLD")" "MODULE_WORLD_ROUTES" "门户登记「走进模块 = 走进该模块的世界」的路由"
ok_has "$(cat "$PORTAL_WORLD")" "tutor: '/pages/twin/world'" "学习意向 → 学习世界的 app 内路由"
ok_has "$(cat "$PORTAL_WORLD")" 'from=world' "带 from=world 让模块侧承接开场过场"
ok_has "$(cat "$PORTAL_WORLD")" "const entry = moduleEntry(module)" "走进动作改走模块世界路由"
ok_has "$(cat "$PORTAL_WORLD")" "entryUrl" "仍以后端注册表 entry_url 为基底（不改后端契约）"
ok_has "$(cat "$TUTOR_WORLD")" "options.from === 'world'" "模块侧识别 from=world"
ok_has "$(cat "$TUTOR_WORLD")" "onLoad" "承接走 onLoad（首屏即接住）"

# ---------------------------------------------------------------------------
echo
echo "== §7. 零裸色（改动面三重 grep）+ 令牌自洽 =="
# 注意：pages.json 是 uni 清单（tabBar 色由编译器读，不能写 var()），故不在裸色面内——
# 改为断言它的色字面量与 HEAD 逐行相同（即 W3 未新增任何裸色）。
CHANGED_FILES="$TUTOR_WORLD $TUTOR_MAIN $SHARED_SRC/WorldShell.vue $SHARED_SRC/WorldTransition.vue \
$ROOT_DIR/styles/world.css $PORTAL_WORLD $PORTAL_MAIN $PORTAL_DIR/src/components/world/LifeWorld.vue \
$PORTAL_DIR/src/components/world/PersonaCard.vue $PORTAL_DIR/src/components/world/OrgCard.vue $PORTAL_DIR/src/pages/org-twin/index.vue"
HEX_HITS="$(grep -nE '#[0-9a-fA-F]{3,8}\b' $CHANGED_FILES 2>/dev/null | wc -l | tr -d ' ')"
ok_if "$HEX_HITS" "0" "hex 裸色 0 处（W3 改动面）"
RGB_HITS="$(grep -nE '\brgba?\(' $CHANGED_FILES 2>/dev/null | wc -l | tr -d ' ')"
ok_if "$RGB_HITS" "0" "rgb/rgba 裸色 0 处（W3 改动面）"
Hsl_HITS="$(grep -nE '\bhsla?\(' $CHANGED_FILES 2>/dev/null | wc -l | tr -d ' ')"
ok_if "$Hsl_HITS" "0" "hsl 裸色 0 处（W3 改动面）"
NAMED_HITS="$(grep -nE ':[[:space:]]*(white|black|red|blue|green|gray|grey|orange|yellow|purple)[[:space:]]*[;!}]' $CHANGED_FILES 2>/dev/null | wc -l | tr -d ' ')"
ok_if "$NAMED_HITS" "0" "具名色 0 处（W3 改动面）"
ART_HITS="$(grep -nE '#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(' "$SHARED_SRC" 2>/dev/null | wc -l | tr -d ' ')"
ok_if "$ART_HITS" "0" "共享件（画法+外壳+过场）零色值（几何层即成立）"
(cd "$ROOT_DIR" && git show "HEAD:apps/web-ai-tutor/src/pages.json" > "$TMP_DIR/pages.head.json") 2>/dev/null
PJ_NEW="$(grep -E '#[0-9a-fA-F]{3,8}\b' "$TUTOR_DIR/src/pages.json" 2>/dev/null)"
PJ_OLD="$(grep -E '#[0-9a-fA-F]{3,8}\b' "$TMP_DIR/pages.head.json" 2>/dev/null)"
ok_if "$PJ_NEW" "$PJ_OLD" "uni 清单的色字面量与 HEAD 逐行相同（tabBar 色非 CSS 面，W3 未新增裸色）"

VAR_JSON="$TMP_DIR/vars.json"
node -e '
const fs=require("fs"),path=require("path");
const ROOT=process.argv[1], FILES=process.argv.slice(2);
const strip=(t)=>t.replace(/<!--[\s\S]*?-->/g,"").replace(/\/\*[\s\S]*?\*\//g,"").replace(/(^|[^:])\/\/.*$/gm,"$1");
const glob=(d)=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?glob(path.join(d,e.name)):[path.join(d,e.name)]);
const declared=new Set();
for(const f of glob(path.join(ROOT,"styles")))
  for(const m of strip(fs.readFileSync(f,"utf8")).matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) declared.add(m[1]);
// 组件里就地赋值的自定义属性（:style="{ \x27--x\x27: ... }"）也算已声明
for(const f of FILES)
  for(const m of strip(fs.readFileSync(f,"utf8")).matchAll(/[\x27"](--[a-zA-Z0-9-]+)[\x27"]\s*:|(--[a-zA-Z0-9-]+)\s*:/g)) declared.add(m[1]||m[2]);
const missing=new Set();
for(const f of FILES)
  for(const m of strip(fs.readFileSync(f,"utf8")).matchAll(/var\((--[a-zA-Z0-9-]+)/g))
    if(!declared.has(m[1])) missing.add(m[1]+"@"+path.basename(f));
console.log(JSON.stringify({declared:declared.size,missing:[...missing].sort()}));
' "$ROOT_DIR" $CHANGED_FILES > "$VAR_JSON" 2>/dev/null
MISSING_VAR="$(node -e 'console.log(require(process.argv[1]).missing.join(","))' "$VAR_JSON" 2>/dev/null)"
VAR_DECL="$(node -e 'console.log(require(process.argv[1]).declared)' "$VAR_JSON" 2>/dev/null)"
ok_if "$MISSING_VAR" "" "无「用了但没声明」的 var(--…)（改动面 × styles/ 共 $VAR_DECL 个令牌）"
ok_has "$(cat "$ROOT_DIR/styles/world.css")" 'var(--world-' "几何类取值全部走世界令牌"

# ---------------------------------------------------------------------------
echo
echo "== §8. 真浏览器 E2E（学生身份 · 同源双 App）=="
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
const BASE = process.argv[2]
const USER = process.env.E2E_IDENTIFIER
const PASS = process.env.E2E_PASSWORD
const ERRORS = []
const emit = (k, v) => console.log('RESULT ' + k + ' ' + String(v).replace(/\s+/g, ' ').trim().slice(0, 380))
const note = (s) => console.log('# ' + s)
function watch(page, tag) {
  page.on('pageerror', (e) => ERRORS.push(tag + '|pageerror|' + e.message))
  page.on('console', (m) => { if (m.type() === 'error') ERRORS.push(tag + '|console|' + m.text()) })
}
const t = (page, sel) => page.evaluate((s) => (document.querySelector(s) ? document.querySelector(s).innerText : ''), sel)
const all = (page, sel, attr) => page.$$eval(sel, (els, a) => els.map((e) => e.getAttribute(a)), attr)
async function login(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await Promise.race([
    page.waitForSelector('input[aria-label="账号"]', { timeout: 30000 }),
    page.waitForSelector('.lw-canvas', { timeout: 30000 })
  ]).catch(() => {})
  if (await page.$('input[aria-label="账号"]')) {
    await page.fill('input[aria-label="账号"]', USER)
    await page.fill('input[aria-label="密码"]', PASS)
    await page.click('.submit-btn')
  }
  await page.waitForSelector('.lw-canvas', { timeout: 30000 })
}
async function waitUrl(page, part, ms) {
  const until = Date.now() + (ms || 20000)
  while (Date.now() < until) { if (page.url().includes(part)) return true; await page.waitForTimeout(120) }
  return false
}
/** 过境一圈：学习场景 → 意向 → 走进 tutor。两半程过场都要接住。 */
async function walkIn(page, sceneCode, moduleCode) {
  await page.click('[data-scene="' + sceneCode + '"]')
  await page.waitForSelector('.intent-sheet', { timeout: 12000 })
  const transP = page.waitForSelector('.world-transition', { timeout: 25000 }).catch(() => null)
  await page.click('.intent-sheet [data-module="' + moduleCode + '"]')
  const trans = await transP
  let srcTitle = '', srcScene = ''
  if (trans) {
    try {
      srcTitle = (await page.$eval('.wt-title', (e) => e.innerText)) || ''
      srcScene = (await page.$eval('.wt-scene', (e) => e.innerText)) || ''
    } catch (e) { /* 窗口极短时读不到文本，不影响结构断言 */ }
  }
  const arrived = await waitUrl(page, '/' + moduleCode + '/', 25000)
  const dst = arrived ? await page.waitForSelector('.world-transition', { timeout: 4000 }).catch(() => null) : null
  let dstTitle = '', dstScene = ''
  if (dst) {
    try {
      dstTitle = (await page.$eval('.wt-title', (e) => e.innerText)) || ''
      dstScene = (await page.$eval('.wt-scene', (e) => e.innerText)) || ''
    } catch (e) { /* 同上 */ }
  }
  await page.waitForSelector('[data-world-shell="' + moduleCode + '"]', { timeout: 30000 })
  await page.waitForTimeout(1300)
  return { had: trans ? 'yes' : 'no', title: srcTitle, scene: srcScene, dstHad: dst ? 'yes' : 'no', dstTitle, dstScene }
}
/** SVG 原语计数 + 人物外观类（跨 app 同一人 / 同一画法的判据）。 */
async function svgObserve(page, scopeSel, personSel, prefix) {
  const r = await page.evaluate((s) => {
    const root = document.querySelector(s[0])
    const q = (n) => (root ? root.querySelectorAll(n).length : 0)
    const person = document.querySelector(s[1])
    const look = (sel) => { const el = document.querySelector(sel); if (!el) return ''; return [...el.querySelectorAll('*')].flatMap((n) => (n.getAttribute('class') || '').split(/\s+/)).filter((c) => /^w-(wear|skin|hair)-\d$/.test(c)).sort().join(',') }
    const tokens = person ? [...person.querySelectorAll('*')].flatMap((el) => (el.getAttribute('class') || '').split(/\s+/)).filter((c) => c.startsWith('w-')).length : 0
    return { polygon: q('polygon'), path: q('path'), circle: q('circle'), ellipse: q('ellipse'), text: q('text'), me: person ? 'yes' : 'no', meLook: person ? look(s[1]) : '', meTokens: tokens }
  }, [scopeSel, personSel])
  for (const k of Object.keys(r)) emit(prefix + '_' + k, r[k])
  return r
}

;(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] })
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 950 }, ignoreHTTPSErrors: true })
  const page = await ctx.newPage()
  watch(page, 'flow')
  await login(page)
  emit('landing_is_world', (await page.$('.lw-canvas')) ? 'yes' : 'no')

  // 人本世界里的「我」（外观类）
  await svgObserve(page, '.lw-svg', '[data-person="me"]', 'w')

  // 学习意向 → 走进
  await page.click('[data-scene="academy"]')
  await page.waitForSelector('.intent-sheet', { timeout: 12000 })
  emit('academy_sheet', (await t(page, '.intent-sheet')).replace(/\n/g, ' · '))
  emit('academy_mods', (await all(page, '.intent-sheet [data-module]', 'data-module')).join(','))
  await page.click('.is-close')
  await page.waitForTimeout(250)
  const walk = await walkIn(page, 'academy', 'tutor')
  emit('wt_had', walk.had); emit('wt_title', walk.title); emit('wt_scene', walk.scene)
  emit('wt_dst_had', walk.dstHad); emit('wt_dst_title', walk.dstTitle); emit('wt_dst_scene', walk.dstScene)
  emit('nav_url', page.url())
  emit('nav_from_world', page.url().includes('from=world') ? 'yes' : 'no')

  // 世界顶栏
  emit('shell_kicker', (await t(page, '.ws-kicker')).trim())
  emit('shell_title', (await t(page, '.ws-title')).trim())
  emit('shell_world_home', (await page.$eval('[data-world-home]', (e) => e.innerText)).trim())
  emit('shell_app_home', (await page.$eval('[data-app-home]', (e) => e.innerText)).trim())
  emit('shell_transition_gone', (await page.$('.world-transition')) ? 'no' : 'yes')
  emit('nav_bar_title', (await page.evaluate(() => {
    const h = document.querySelector('.uni-page-head') || document.querySelector('uni-page-head')
    if (!h) return 'no-head'
    const tl = h.querySelector('.uni-page-head-title') || h.querySelector('[class*=title]')
    return (tl ? tl.innerText : h.innerText).replace(/\n/g, ' ').trim().slice(0, 60)
  })))

  // 登峰版图
  await svgObserve(page, '[data-map]', '[data-climber]', 'm')
  emit('m_camps', (await all(page, '[data-camp]', 'data-camp')).length)
  emit('m_camp_states', [...new Set(await all(page, '[data-camp-state]', 'data-camp-state'))].join(','))
  emit('m_camp_mastered', (await page.$$eval('[data-camp]', (els) => els.filter((e) => e.getAttribute('data-camp-mastered') === 'yes').length)))
  emit('m_terraces', (await page.$$eval('[data-map] .w-terrace', (els) => els.length)))
  emit('m_terrace_states', (await page.$$eval('[data-map] .w-terrace', (els) => [...new Set(els.flatMap((e) => (e.getAttribute('class') || '').split(/\s+/).filter((c) => c.startsWith('w-terrace-'))))].join(','))))
  emit('m_status', (await t(page, '.world-status')).replace(/\n/g, ' · '))
  emit('m_legend', (await t(page, '[data-legend]')).replace(/\n/g, ' · '))
  emit('m_subjects', (await all(page, '[data-subject]', 'data-subject')).join(','))
  emit('m_subject_active', (await page.$eval('[data-subject-active="yes"]', (e) => e.getAttribute('data-subject'))))

  // 营地选中 → 详情三动作
  const camps = await all(page, '[data-camp]', 'data-camp')
  await page.click('[data-camp="' + camps[Math.min(5, camps.length - 1)] + '"]')
  await page.waitForSelector('[data-camp-detail]', { timeout: 8000 })
  await page.waitForTimeout(700)
  emit('camp_detail', (await t(page, '[data-camp-detail]')).replace(/\n/g, ' · ').slice(0, 300))
  emit('camp_actions', (await page.$$eval('[data-practice],[data-ask-teacher],[data-graph]', (els) => els.map((e) => (e.getAttribute('data-practice') !== null ? 'practice' : e.getAttribute('data-ask-teacher') !== null ? 'ask' : 'graph')).join(','))))
  emit('climb_grown', (await page.$eval('[data-map] .w-climb', (e) => (e.getAttribute('points') || '').split(' ').length)))
  await page.click('.detail-close')
  await page.waitForTimeout(400)

  // 学科切换（并还原）
  const activeNow = await page.$eval('[data-subject-active="yes"]', (e) => e.getAttribute('data-subject'))
  const other = (await all(page, '[data-subject]', 'data-subject')).find((s) => s !== activeNow)
  if (other) {
    await page.click('[data-subject="' + other + '"]')
    await page.waitForTimeout(2600)
    emit('switch_active', (await page.$eval('[data-subject-active="yes"]', (e) => e.getAttribute('data-subject'))))
    emit('switch_camps', (await all(page, '[data-camp]', 'data-camp')).length)
    await page.click('[data-subject="' + activeNow + '"]')
    await page.waitForTimeout(2200)
    emit('switch_restored', (await page.$eval('[data-subject-active="yes"]', (e) => e.getAttribute('data-subject'))))
  } else { emit('switch_active', 'none') }

  // 返回人本世界（免二登）
  await page.click('[data-world-home]')
  await page.waitForSelector('.lw-canvas', { timeout: 30000 })
  await page.waitForTimeout(1200)
  emit('back_url', page.url())
  emit('back_is_world', (await page.$('.lw-canvas')) ? 'yes' : 'no')
  emit('back_no_login', (await page.$('input[aria-label="账号"]')) ? 'no' : 'yes')

  // 再进一次 → 回功能导航
  const walk2 = await walkIn(page, 'academy', 'tutor')
  emit('wt2_dst_had', walk2.dstHad)
  await page.click('[data-app-home]')
  await page.waitForTimeout(2500)
  emit('app_home_url', page.url())
  emit('app_home_text', (await t(page, 'body')).replace(/\n/g, ' ').slice(0, 160))
  emit('app_home_landed', (await page.$('.world-shell')) ? 'no' : 'yes')

  // 其余页无回归（只计 pageerror）
  const pages = ['pages/index/index', 'pages/practice/index', 'pages/chat/chat', 'pages/knowledge-graph/index', 'pages/profile/index', 'pages/twin/memory', 'pages/twin/data', 'pages/twin/replay', 'pages/report/report']
  const bad = []
  for (const p of pages) {
    const before = ERRORS.length
    await page.goto(BASE + '#/' + p, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
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
HTTP_E2E="$(curl -s -o /dev/null -w '%{http_code}' "$E2E_BASE" || echo 000)"
HTTP_TUTOR="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$TEST_PORT/tutor/" || echo 000)"
ok_if "$HTTP_E2E" "200" "E2E 托管可达：门户（$E2E_BASE）"
ok_if "$HTTP_TUTOR" "200" "E2E 托管可达：智学慧眼（同源 /tutor/，令牌因此同在册）"

STU_OUT="$TMP_DIR/student.out"
if [ "$HTTP_E2E" = "200" ] && [ "$HTTP_TUTOR" = "200" ]; then
  PW_CORE="$PW_CORE" E2E_IDENTIFIER="$E2E_IDENTIFIER" E2E_PASSWORD="$E2E_PASSWORD" \
    node "$TMP_DIR/e2e.cjs" "$E2E_BASE" >"$STU_OUT" 2>&1
  grep '^#' "$STU_OUT" | sed 's/^/      /'
  grep '^RESULT' "$STU_OUT" | sed 's/^RESULT /      · /' | cut -c1-190

  res_eq landing_is_world "$STU_OUT" "yes" "8.1 登录成功 → 人本世界（前置）"
  ok_has "$(rget academy_mods "$STU_OUT")" "tutor" "8.2 学习意向含智学慧眼（tutor）"
  res_eq wt_had "$STU_OUT" "yes" "8.3 门户半程：点「走进」演过关之门"
  res_has wt_title "$STU_OUT" "走进 智学慧眼" "8.3 门户半程过场写明走进谁"
  ok_has "$(rget nav_url "$STU_OUT")" "/tutor/#/pages/twin/world" "8.4 落点 = 智学慧眼学习世界（app 内路由）"
  res_eq nav_from_world "$STU_OUT" "yes" "8.4 带 from=world（后端 entry_url 不动，路由由前端约定）"
  res_eq wt_dst_had "$STU_OUT" "yes" "8.5 模块半程：页面起来接着演同一道门（过关式不中断）"
  res_has wt_dst_title "$STU_OUT" "走进 学习世界 · 登峰" "8.5 承接过场写明走进的是学习世界"
  res_has wt_dst_scene "$STU_OUT" "从 人本世界 出发" "8.5 承接过场写明从人本世界走来"
  res_eq wt2_dst_had "$STU_OUT" "yes" "8.5 第二次走进同样承接（不是只演一次）"
  res_eq shell_kicker "$STU_OUT" "学习世界" "8.6 世界顶栏抬头 = 学习世界（模块内容世界命名）"
  res_has shell_title "$STU_OUT" "学习世界 · 登峰" "8.6 世界顶栏标题 = 模块名（世界即模块）"
  res_eq shell_world_home "$STU_OUT" "返回人本世界" "8.6 有返回人本世界的出口"
  res_eq shell_app_home "$STU_OUT" "回智学慧眼" "8.6 有回本模块功能导航的出口"
  res_eq nav_bar_title "$STU_OUT" "学习世界" "8.6 模块导航栏标题也换了世界名（默认导航栏，与人本世界同制）"
  res_eq shell_transition_gone "$STU_OUT" "yes" "8.6 过场演完自动卸下（不挡世界）"
  res_eq w_me "$STU_OUT" "yes" "8.7 人本世界里画出了「我」"
  res_eq m_me "$STU_OUT" "yes" "8.7 学习世界里也画出了「我」（孪生人物）"
  ok_if "$(rget w_meLook "$STU_OUT")" "$(rget m_meLook "$STU_OUT")" "8.7 两个世界里的「我」外观类完全相同（同一人、同一套画法与色）"
  [ -n "$(rget w_meLook "$STU_OUT")" ] && pass "8.7 外观类非空（衣/肤/发三色真的取到了）" || fail "8.7 外观类为空（画法没生效）"
  ok_ge "$(rget m_polygon "$STU_OUT")" 20 "8.8 登峰版图：山体面/台地/植被（polygon ≥ 20）"
  ok_ge "$(rget m_path "$STU_OUT")" 30 "8.8 登峰版图：山脊/等高线/登山路（path ≥ 30）"
  ok_ge "$(rget m_circle "$STU_OUT")" 5 "8.8 登峰版图：点阵/光晕/旗杆（circle ≥ 5）"
  ok_ge "$(rget m_ellipse "$STU_OUT")" 20 "8.8 登峰版图：落影/植被（ellipse ≥ 20）"
  res_eq m_text "$STU_OUT" "0" "8.8 SVG 内零 HTML 命名空间标签（画法未被破坏）"
  ok_ge "$(rget m_camps "$STU_OUT")" 40 "8.8 知识域营地全部落位（≥ 40 个热点）"
  res_eq m_terraces "$STU_OUT" "12" "8.8 十二级台地全渲染（K12 十二年级）"
  ok_set "$(rget m_camp_states "$STU_OUT")" "passed,current,ahead" "8.9 营地三态齐备（已翻越/当前/待抵达）"
  ok_set "$(rget m_terrace_states "$STU_OUT")" "w-terrace-passed,w-terrace-current,w-terrace-ahead" "8.9 台地三态色齐备（世界令牌映射）"
  ok_ge "$(rget m_camp_mastered "$STU_OUT")" 1 "8.9 已登顶营地态可见"
  res_has m_status "$STU_OUT" "掌握度" "8.10 世界状态：掌握度"
  res_has m_status "$STU_OUT" "经历等级" "8.10 世界状态：经历等级"
  res_has m_status "$STU_OUT" "已登顶营地" "8.10 世界状态：已登顶营地"
  res_has m_legend "$STU_OUT" "攀爬轨迹" "8.10 图例保留（攀爬轨迹/已登顶/未至）"
  ok_has "$(rget camp_detail "$STU_OUT")" "航线（前置依赖）" "8.11 营地详情：航线（前置依赖）"
  ok_set "$(rget camp_actions "$STU_OUT")" "practice,ask,graph" "8.11 营地详情三动作保留（练一练/请教 AI 教师/知识图谱）"
  ok_ge "$(rget climb_grown "$STU_OUT")" 20 "8.12 点营地后攀爬轨迹生长（折点数 ≥ 20）"
  ok_has "$(rget m_subjects "$STU_OUT")" "MATH" "8.13 学科清单取自课程注册表"
  ok_if "$(rget m_subject_active "$STU_OUT")" "MATH" "8.13 学科条当前项高亮（码归一比较）"
  res_not_has switch_active "$STU_OUT" "none" "8.13 学科可切换"
  res_eq switch_restored "$STU_OUT" "MATH" "8.13 切换后已还原原学科（不留测试态）"
  ok_ge "$(rget switch_camps "$STU_OUT")" 1 "8.13 切换后新版图仍有营地"
  ok_has "$(rget back_url "$STU_OUT")" "/portal/" "8.14 返回人本世界真的回到门户（世界之间互通）"
  res_eq back_is_world "$STU_OUT" "yes" "8.14 回到的是人本世界"
  res_eq back_no_login "$STU_OUT" "yes" "8.14 同一登录态直接进（令牌在册，免二登）"
  ok_has "$(rget app_home_url "$STU_OUT")" "/tutor/" "8.15 回功能导航落在智学慧眼内"
  res_eq app_home_landed "$STU_OUT" "yes" "8.15 已离开世界页（不把用户困在单页）"
  res_has app_home_text "$STU_OUT" "人物孪生总览" "8.15 落在智学慧眼的功能页（首页/孪生总览）"
  res_eq regression_pages "$STU_OUT" "9" "8.16 其余 9 页逐页走过"
  res_eq regression_bad "$STU_OUT" "" "8.16 其余页零 pageerror（无回归）"
  res_eq errors "$STU_OUT" "0" "8.17 全链路 pageerror / console.error = 0"
else
  skip "托管不可达 → 跳过 §8 浏览器段"
fi

# ---------------------------------------------------------------------------
echo
echo "== §9. 无回归（静态面）=="
TUTOR_PAGES_JSON="$TUTOR_DIR/src/pages.json"
PAGE_N="$(node -e 'console.log(require(process.argv[1]).pages.length)' "$TUTOR_PAGES_JSON" 2>/dev/null)"
ok_if "$PAGE_N" "19" "智学慧眼 19 页全部仍在册（未因套壳删页）"
MISSING_CHUNK=""
while read -r p; do
  [ -z "$p" ] && continue
  slug="$(printf '%s' "$p" | tr '/' '-')"
  ls "$TUTOR_DIST/assets" 2>/dev/null | grep -q "^${slug}\." || MISSING_CHUNK="$MISSING_CHUNK $p"
done < <(node -e 'require(process.argv[1]).pages.forEach(p=>console.log(p.path))' "$TUTOR_PAGES_JSON" 2>/dev/null)
ok_if "$MISSING_CHUNK" "" "19 页全部产出分片（每页都真的还编得出来）"
for ep in "/api/agent/me" "/api/tuition/sessions" "/api/curriculum/knowledge-map" "/api/twin/me"; do
  ok_has "$(cat "$TUTOR_DIR/src/api/index.js")" "$ep" "既有读面未动：$ep"
done
for st in useKnowledgeStore usePracticeStore useTwinStore useUserStore; do
  ok_has "$(cat "$TUTOR_WORLD")" "$st" "学习世界仍走原 store：$st"
done
ok_has "$(cat "$TUTOR_WORLD")" "knowledgeStore.loadCatalog" "学科目录仍走 knowledge store（未另造真源）"
ok_has "$(cat "$TUTOR_WORLD")" "twinStore.loadOverview" "世界状态仍走 twin store（同 W1 真源）"
PORTAL_PAGES_JSON="$PORTAL_DIR/src/pages.json"
ok_if "$(node -e 'console.log(require(process.argv[1]).pages[0].path)' "$PORTAL_PAGES_JSON" 2>/dev/null)" "pages/world/index" "门户首页仍是人本世界（W2 落点未动）"
ok_not_has "$(cat "$PORTAL_PAGES_JSON")" "workbench" "门户未回退工作台页"

# ---------------------------------------------------------------------------
echo
echo "== §10. 凭据零泄漏 =="
LIST_CRED="$(grep -nE "test1234|BEGIN [A-Z ]*PRIVATE KEY|jwt_secret" "$OUT_DIR/w3-file-list.md" 2>/dev/null | wc -l | tr -d ' ')"
ok_if "$LIST_CRED" "0" "产出说明内无口令/私钥字面量"
SCRIPT_CRED="$(grep -nE "test1234|BEGIN [A-Z ]*PRIVATE KEY|jwt_secret" "$OUT_DIR/w3-verify.sh" 2>/dev/null \
  | grep -vE 'E2E_PASSWORD:-|TEST_PASSWORD|CRED_HIT=|LIST_CRED=|SCRIPT_CRED=' | wc -l | tr -d ' ')"
ok_if "$SCRIPT_CRED" "0" "验收脚本内口令只出现在 env 默认值一处（无硬编码凭据）"
ok_has "$(cat "$OUT_DIR/w3-verify.sh")" 'E2E_PASSWORD="${E2E_PASSWORD:-' "口令经环境变量注入（可覆盖）"
TOKEN_HIT="$(grep -rnE 'eyJ[A-Za-z0-9_-]{10,}\.' "$TUTOR_DIR/src/pages/twin" "$SHARED_SRC" "$ROOT_DIR/styles/world.css" 2>/dev/null | wc -l | tr -d ' ')"
ok_if "$TOKEN_HIT" "0" "源码内无任何 JWT/令牌字面量"
ENV_IN_SRC="$(grep -rn "\.env" "$TUTOR_DIR/src/pages/twin/world.vue" "$SHARED_SRC" 2>/dev/null | wc -l | tr -d ' ')"
ok_if "$ENV_IN_SRC" "0" "世界源码不读 .env（凭据只经统一客户端）"

# ---------------------------------------------------------------------------
echo
echo "== §11. 改动范围（不 commit / 不 checkout）=="
BRANCH_NOW="$(cd "$ROOT_DIR" && git rev-parse --abbrev-ref HEAD)"
ok_if "$BRANCH_NOW" "feat/stage-c-unified-auth-shell" "仍在原分支（未 checkout 别处）"
(cd "$ROOT_DIR" && git show "HEAD:apps/web-ai-tutor/src/pages/twin/world.vue" > "$TMP_DIR/world.head.vue") 2>/dev/null
if diff -q "$TMP_DIR/world.head.vue" "$TUTOR_WORLD" >/dev/null 2>&1; then
  fail "W3 实现仍未提交（HEAD 版登峰页 = 工作树版，说明已被 commit）"
else
  pass "W3 实现仍未提交（HEAD 版登峰页 ≠ 工作树版）"
fi
if (cd "$ROOT_DIR" && git cat-file -e HEAD:packages/world-art/src/art.js) 2>/dev/null; then
  fail "共享件仍未提交（HEAD 里已有 packages/world-art/src/art.js）"
else
  pass "共享件是新增未提交（HEAD 里没有，符合「改动留工作树」）"
fi
STAGED="$(cd "$ROOT_DIR" && git diff --cached --name-only | wc -l | tr -d ' ')"
ok_if "$STAGED" "0" "暂存区为空（未 git add）"
ALLOW='^( M| D|\?\?) (apps/portal/src/(components/world/|pages/(world/|org-twin/)|main\.js|utils/world-art\.js|styles/world\.css)|apps/portal/vite\.config\.js|apps/web-ai-tutor/(src/(api/index\.js|main\.js|pages\.json|pages/twin/world\.vue)|vite\.config\.js)|package-lock\.json|styles/(world\.css|tokens/themes/persona-world\.css)|packages/world-art/|\.agents/claude/outputs/w[23]-)'
OUT_OF_SCOPE="$(cd "$ROOT_DIR" && git status --porcelain | grep -vE "$ALLOW" | grep -vE '^\?\? (apps/(portal|web-ai-tutor)/(dist|node_modules)/|\.agents/claude/tasks/)' || true)"
ok_if "$OUT_OF_SCOPE" "" "改动全部落在白名单内（无越界文件：不动 explorer / 不动后端）"
[ -n "$OUT_OF_SCOPE" ] && echo "$OUT_OF_SCOPE" | sed 's/^/      /'
EXPLORER_TOUCH="$(cd "$ROOT_DIR" && git status --porcelain | grep -c 'apps/explorer' || true)"
ok_if "$EXPLORER_TOUCH" "0" "apps/explorer 零改动（本卡之外）"
BACKEND_TOUCH="$(cd "$ROOT_DIR" && git status --porcelain | grep -cE 'services/|packages/(ontology|ontology-engine|codegen|agent-core|jwt-verifier|auth-client)' || true)"
ok_if "$BACKEND_TOUCH" "0" "后端与既有包零改动（后端契约未动）"
CHANGED_N="$(cd "$ROOT_DIR" && git status --porcelain | wc -l | tr -d ' ')"
echo "      改动条目：$CHANGED_N（详见 w3-file-list.md）"
ok_file "$OUT_DIR/w3-file-list.md" "产出物在册：.agents/claude/outputs/w3-file-list.md"

# ---------------------------------------------------------------------------
echo
echo "== §12. 未覆盖项（明示，不计 FAIL）=="
skip "登顶 UX 重做（交互/版式再设计）：按任务卡 N4 明确属 W4，本卡只换世界语言、不动登顶交互"
skip "「当前」标签显示的是后端 twin 状态里的最近营地码（W1 twin.service 的口径：找不到营地名时回落原码）；测试账号的历史动作留下的是 UUID，故显示为 UUID——后端契约不在本卡范围，前端保持原样不臆造替换"
skip "门户/模块的过场动画在 prefers-reduced-motion 下不演（沿用 W2 的可访问性取舍）"
skip "真实生产链路（nginx /tutor/ 静态托付）的观感：本卡 E2E 用同源双 App 托管复现同一 origin 与同一令牌在册条件，未走 nginx 构建产物上线"

echo
if [ "$FAIL" = 0 ]; then
  echo "PASS=$PASS FAIL=0 VERIFY_EXIT=0"
else
  echo "PASS=$PASS FAIL=$FAIL VERIFY_EXIT=1"
fi
