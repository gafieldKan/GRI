#!/usr/bin/env bash
# ============================================================================
# W6-c 验收：学习世界 v6「三维度分页分离」（apps/web-ai-tutor 学习世界）
#
# v6 修的是 v5 的**表现面结构性错误**（用户 2026-10-21 裁决：按助手建议彻底分页分离）：
#   根因①：三个维度共用同一块 1200×820 画布 + 同一根海拔轴，切维度只换叠加层
#           → 山体/海拔轴/峰在 K12 页与城区页**始终在场**（「K12 界面被错误放进城区页面」不是错觉）
#   根因②：城区缺独立布局网格 → 76 店挤在 y≈444 一排 + 12 里程碑 y≈532 + 6 门，105 个 HTML 叠层糊在一起
#   根因③：`map-scene{width:100%; min-width:560px; aspect-ratio:1200/820}` 把 1200 宽硬压进 838px（缩放 0.70）
#
# v6 的做法：**三个维度 = 三块自洽场景，各自一张画布、各有一套坐标；切维度 = 换世界。**
#   A 学科知识体系：沿用 SUMMIT 1200×820 群峰（W4-b/v5 已验收，本卡只做无回归对拍）
#   B K12 阶段   ：新 STAIR 画布 1600×760 —— 升学阶梯（横向 12 年级列 × 每列 ≤2 张人教版册卡，三级学段台阶）
#   C 学科城区   ：新 CITY 画布 1600×900 —— 街区网格（行=街区/分支，列=楼栋/章，门=知识点）
#
# 结构：
#   §0 前置        —— docker 四件套在跑；node/playwright-core/chromium；§0 起工作区后端（W5-a 读面只在工作树）
#   §1 构建        —— build:h5 通过；产物带 v6 令牌 / 几何类 / 数据钩子
#   §2 数据面      —— 只读既有 API：learning-chain（节/知识点/三类边/summary）
#   §3 N2 一份画法 —— v6 画法只在 packages/world-art 一份；共享件零色值；零孤儿类；非 3D
#   §4 ★N1 场景物理分离（本卡核心）—— 三块画布各有 viewBox/底图类族/叠层，同一时刻只挂一张；
#                     K12 页内城区元素与峰元素 = 0；城区页内年级大道与 K12 册热区 = 0
#   §5 ★N5 不重叠  —— 同级元素包围盒交集面积 = 0（K12 册卡两两 / 城区楼栋两两）
#   §6 ★N6/N10 可读性 —— K12 每列 ≥1 卡且列距 ≥ 卡宽；城区每行楼栋间距 ≥ 步道宽；
#                     两画布横向可滚（scrollWidth > clientWidth，min-width 不硬缩）
#   §7 K12 升学阶梯 —— 12 列 / 三级学段台阶 / ≤2 册每列 / 「我在读」标记 / 空态话术
#   §8 城区街区网格 —— 楼栋行数 = 分支数、楼门三态、楼间街道 + 施工围挡/晨雾、图例口径逐字
#   §9 N8 动画      —— 光脉传导 dim→half→lit；prefers-reduced-motion 下静态降级
#   §10 N9 无回归   —— 维度 A 群峰/延续性/册章详情对拍 v4/v5 验收点；楼内闭环同一条
#   §11 零裸色      —— 改动面三重 grep 空；var(--world-*) 无「用了没声明」
#   §12 凭据零泄漏
#   §13 改动范围    —— HEAD 未变、未 checkout、暂存区空、改动全在白名单内
#   §14 未覆盖项（明示，不计 FAIL）
#
# 依赖：docker（gri-nginx / gri-api / gri-postgres / gri-redis）；前端已 npm install；
#       node + playwright-core + chromium；auth-center 在 3004（令牌校验走 JWKS）。
# 为什么 §0 要自己起后端：W5-a 的 learning-chain / kp-cave 只存在于**工作树源码**，
#   gri-api 容器镜像早于 W5-a（同路径 401/404），故本脚本在 3011 起一份工作区后端给 E2E 用。
# 凭据：仅 dev 测试账号（E2E_IDENTIFIER / E2E_PASSWORD 可覆盖）；脚本不落任何密钥、不打印 token/密码
#       （后端口令只从容器 env 读入变量并注入子进程，绝不出现在输出里）。
# 副作用：§1 写前端 dist（gitignore）；§8–§10 浏览器只读 + **会真实作答**（学生 testuser 的答对记录
#       会写进 edu.answer_records / mastery_snapshots —— 这正是要验的闭环）；截图落 /tmp/w6c-shots。
# 用法：  bash .agents/claude/outputs/w6c-verify.sh
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
TUTOR_CAVE="$TUTOR_DIR/src/components/world/CaveScene.vue"
TUTOR_API="$TUTOR_DIR/src/api/index.js"
TUTOR_PRACTICE="$TUTOR_DIR/src/store/practice.js"
DESIGN_V6="$ROOT_DIR/docs/SUBJECT_SUMMIT_DESIGN_V6.md"
TOKENS="$ROOT_DIR/styles/tokens/themes/persona-world.css"
WORLD_CSS="$ROOT_DIR/styles/world.css"
API_DIR="$ROOT_DIR/services/api"
SHOTS="${SHOTS_DIR:-/tmp/w6c-shots}"

E2E_IDENTIFIER="${E2E_IDENTIFIER:-testuser}"
E2E_PASSWORD="${E2E_PASSWORD:-test1234}"
PW_CORE="${PW_CORE:-/home/ubantu/openclaw/node_modules/playwright-core}"
TEST_PORT="${TEST_PORT:-5303}"
API_PORT="${API_PORT:-3012}"

TMP_DIR="${W6C_TMP:-$(mktemp -d /tmp/w6c.XXXXXX)}"   # W6C_TMP=1 → 固定目录，便于排障取证
[ -n "${W6C_TMP:-}" ] && mkdir -p "$TMP_DIR"
# §13 用「开跑时 vs 收尾时」的 HEAD 比对，而不是钉死一个 SHA：
# 钉死的 SHA 每次父分支有新提交就误报，而真正要守的只是**本卡这条验收链路自己没有 commit / checkout**。
HEAD_AT_START="$(cd "$ROOT_DIR" && git rev-parse HEAD)"
SERVER_PID=""
API_PID=""
mkdir -p "$SHOTS"
cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null
  [ -n "$API_PID" ] && kill "$API_PID" 2>/dev/null
  [ -z "${W6C_TMP:-}" ] && rm -rf "$TMP_DIR"
}
trap cleanup EXIT INT TERM

PASS=0; FAIL=0; SKIP=0
pass() { PASS=$((PASS + 1)); printf 'PASS  %s\n' "$1"; }
fail() { FAIL=$((FAIL + 1)); printf 'FAIL  %s\n' "$1"; }
skip() { SKIP=$((SKIP + 1)); printf 'SKIP  %s\n' "$1"; }
ok_if() { [ "$1" = "$2" ] && pass "$3" || fail "$3（期望「$2」，实得「$1」）"; }
ok_has() { case "$1" in *"$2"*) pass "$3" ;; *) fail "$3（未含「$2」；实得「$(printf '%s' "$1" | cut -c1-200)」）" ;; esac; }
ok_not_has() { case "$1" in *"$2"*) fail "$3（不该含「$2」）" ;; *) pass "$3" ;; esac; }
ok_ge() { [ "$1" -ge "$2" ] 2>/dev/null && pass "$3（$1 ≥ $2）" || fail "$3（期望 ≥ $2，实得「$1」）" ; }
ok_le() { [ "$1" -le "$2" ] 2>/dev/null && pass "$3（$1 ≤ $2）" || fail "$3（期望 ≤ $2，实得「$1」）" ; }
ok_match() { printf '%s' "$1" | grep -qE "$2" && pass "$3" || fail "$3（不匹配「$2」；实得「$(printf '%s' "$1" | cut -c1-200)」）"; }
ok_file() { [ -f "$1" ] && pass "$2" || fail "$2（缺 $1）"; }
rget() { awk -v k="$1" '$1=="RESULT" && $2==k { sub(/^RESULT +[^ ]+ +/,""); print; exit }' "$2"; }
res_eq() { ok_if "$(rget "$1" "$2")" "$3" "$4"; }
res_has() { ok_has "$(rget "$1" "$2")" "$3" "$4"; }
res_not_has() { ok_not_has "$(rget "$1" "$2")" "$3" "$4"; }
res_ge() { ok_ge "$(rget "$1" "$2")" "$3" "$4"; }
res_le() { ok_le "$(rget "$1" "$2")" "$3" "$4"; }
res_ne() { local v; v="$(rget "$1" "$2")"; [ "$v" != "$3" ] && pass "$4" || fail "$4（期望「非 $3」，实得「$v」）"; }

echo "== §0. 前置环境 =="
for c in gri-nginx gri-api gri-postgres gri-redis; do
  docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$c" && pass "$c 在跑" || fail "$c 未运行"
done
[ -d "$PW_CORE" ] && pass "playwright-core 就位（$PW_CORE）" || fail "playwright-core 缺失：$PW_CORE"
node -e 'process.exit(0)' >/dev/null 2>&1 && pass "node 可用" || fail "node 不可用"
[ -d "$TUTOR_DIR/node_modules" ] && pass "apps/web-ai-tutor node_modules 就位" || fail "apps/web-ai-tutor 未 npm install"
[ -d "$SHARED_DIR" ] && pass "世界语言共享件在册（packages/world-art）" || fail "packages/world-art 缺失"
ok_file "$DESIGN_V6" "设计文档 v6 在册（docs/SUBJECT_SUMMIT_DESIGN_V6.md）"
if ss -lnt 2>/dev/null | grep -q ":$TEST_PORT "; then
  fail "端口 $TEST_PORT 被占用（E2E 静态托管需要它；TEST_PORT 可换）"
else
  pass "端口 $TEST_PORT 空闲"
fi
ok_file "$API_DIR/dist/main.js" "工作区后端已构建（services/api/dist/main.js）"

# 工作区后端：W5-a 的两个读面只在工作树源码里，容器镜像早于 W5-a
API_UP=0
curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$API_PORT/health" 2>/dev/null | grep -q 200 && API_UP=1
if [ "$API_UP" != 1 ] && [ -f "$API_DIR/dist/main.js" ]; then
  DB_PW="$(docker inspect gri-postgres --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | sed -n 's/^POSTGRES_PASSWORD=//p' | head -1)"
  ( cd "$API_DIR" && PORT="$API_PORT" DB_HOST=127.0.0.1 DB_PORT=5432 DB_USER=postgres DB_NAME=gri \
      DB_PASSWORD="$DB_PW" NODE_ENV=production \
      AUTH_JWKS_URL="http://127.0.0.1:3004/auth/jwks" AUTH_CENTER_URL="http://127.0.0.1:3004" \
      node dist/main.js ) >"$TMP_DIR/api.log" 2>&1 &
  API_PID=$!
  for _ in $(seq 1 40); do
    curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$API_PORT/health" 2>/dev/null | grep -q 200 && { API_UP=1; break; }
    sleep 0.5
  done
  [ "$API_UP" = 1 ] && pass "工作区后端已起（:$API_PORT，PID 已记；脚本退出时回收）" \
    || { fail "工作区后端起不来（:$API_PORT）"; sed -n 's/:[^:@/]*@/:***@/g;s/password[^ ]*/password=***/I p' "$TMP_DIR/api.log" 2>/dev/null | head -6 | sed 's/^/      /'; }
else
  [ "$API_UP" = 1 ] && pass "工作区后端已在跑（:$API_PORT，沿用现有进程）"
fi
if [ "$API_UP" = 1 ]; then
  ok_if "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$API_PORT/api/curriculum/learning-chain?subject=MATH&branch=math.num")" "200" \
    "learning-chain 读面在跑（$API_PORT；W5-a 数据面可用）"
fi
curl -sk -o /dev/null -w '%{http_code}' "https://localhost/health" 2>/dev/null | grep -q 200 && pass "网关 /health 可达（E2E 走同源反代）" || fail "网关 /health 不可达"
curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:3004/auth/jwks" 2>/dev/null | grep -q 200 && pass "auth-center JWKS 可达（令牌校验真源）" || fail "auth-center JWKS 不可达（令牌会校验失败）"

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
ok_has "$TUTOR_JS" "cave-mask" "产物含洞内组件（CaveScene 样式已入包）"
# v6 三块画布的锚（打包器会把 `data-scene":"city"` 这种形式带出来，故按此形态断言）
for h in 'data-scene":"summit' 'data-scene":"stair' 'data-scene":"city' 'data-map":"stair"' 'data-map":"city"'; do
  ok_has "$TUTOR_JS" "$h" "产物已带 v6 画布锚：$h"
done
# v6 新钩子（楼栋 / 楼门 / 阶梯册卡 / 图例诚实口径 / 城区读数 / 空态）
for h in data-dim-current data-building data-kp-door data-book data-legend-order data-legend-half data-legend-basement data-legend-stair data-district-count data-district-empty data-scene-empty data-map-scroll; do
  ok_has "$TUTOR_JS" "$h" "产物已带 v6 数据钩子：$h"
done
# v6 新令牌（STAIR 台阶/册卡 + CITY 街区/街牌 + 楼门三态沿用 storefront-*）
for t in --world-stair-tread --world-stair-riser --world-stair-edge --world-stair-slope --world-stair-card-left --world-stair-card-right --world-stair-card-top --world-stair-card-spine --world-stair-card-notch --world-stair-card-empty --world-city-street --world-city-street-dash --world-city-curb --world-city-skyline-far --world-city-sign-board --world-city-sign-post --world-city-sign-cap --world-lamp-pole --world-sign-warm --world-sign-soft; do
  ok_has "$TUTOR_CSS" "$t" "产物已带 v6 令牌：$t"
done
# v6 新几何类（STAIR / CITY 底图类族）
for c in .w-stair-tread .w-stair-riser .w-stair-edge .w-stair-slope .w-city-street .w-city-street-dash .w-city-curb .w-city-skyline-far .w-city-sign-board .w-city-sign-post; do
  ok_has "$TUTOR_CSS" "$c" "产物已带 v6 几何类映射：$c"
done
# W4-b/W5-b/W6-a 既有钩子不许掉（N9 无回归）
for h in data-v4-strip data-lit-count data-next-target data-frontier data-grade-door data-band data-cave data-dim-toggle data-branch-depth data-book data-camp-detail data-detail-clc; do
  ok_has "$TUTOR_JS" "$h" "产物仍带既有钩子（无回归）：$h"
done
ok_not_has "$TUTOR_JS" 'data-avenue-mark' "产物已无「年级大道」里程碑钩子（v6 核心裁决：整条移除）"
ok_not_has "$TUTOR_JS" 'data-storefront' "产物已无 v5 城区「一间店」散点钩子（v6 换成楼栋网格）"

# ---------------------------------------------------------------------------
echo
echo "== §2. 数据面（只读既有 API，未改后端）=="
if [ "$API_UP" = 1 ]; then
  CH="$TMP_DIR/chain.json"
  curl -s -H 'content-type: application/json' "http://127.0.0.1:$API_PORT/api/curriculum/learning-chain?subject=math&branch=math.num" >"$CH"
  ok_ge "$(node -e 'const d=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log((d.nodes||[]).length)' "$CH" 2>/dev/null)" "50" "学习链节数在（城区楼栋与阶梯册卡的章数真源）"
  ok_ge "$(node -e 'const d=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log((((d.nodes||[])[0]||{}).kps||[]).length)' "$CH" 2>/dev/null)" "2" "节含知识点（楼门的灯位）"
  ok_has "$(node -e 'const d=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const s=new Set(d.edges.map(e=>e.kind));console.log([...s].sort().join(","))' "$CH")" "explicit" "边含显式前置（kind=explicit）"
  ok_has "$(node -e 'const d=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const s=new Set(d.edges.map(e=>e.kind));console.log([...s].sort().join(","))' "$CH")" "seq" "边含课程序列（kind=seq）"
  ok_has "$(node -e 'const d=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const s=new Set(d.edges.map(e=>e.kind));console.log([...s].sort().join(","))' "$CH")" "soft" "边含引导路径（kind=soft；N5 要把它画淡且注明）"
  ok_if "$(node -e 'const d=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const m=new Map();for(const x of d.nodes||[]){for(const k of x.kps||[])m.set(k.code,x.code)}let c=0;for(const e of d.edges||[]){const a=m.get(e.from),b=m.get(e.to);if(a&&b&&a!==b&&e.kind==="explicit")c+=1}console.log(c)' "$CH" 2>/dev/null)" "0" "显式前置全部落在同一节内（跨节 0：节级不叠三线）"
  ok_if "$(node -e 'const d=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const m=new Map(),g=new Map();for(const x of d.nodes||[]){g.set(x.code,x.grade);for(const k of x.kps||[])m.set(k.code,x.code)}let all=0,cross=0;for(const e of d.edges||[]){if(e.kind!=="soft")continue;const a=m.get(e.from),b=m.get(e.to);if(!a||!b||a===b)continue;all+=1;if(g.get(a)!==g.get(b))cross+=1}console.log(all>0&&all===cross?"yes":"no")' "$CH" 2>/dev/null)" "yes" "引导路径全部跨年级（N5 视觉弱化的落点）"
fi

# ---------------------------------------------------------------------------
echo
echo "== §3. N2 一份画法 / N3 非 3D =="
# 画法原语的唯一真源：STAIR / CITY 的排布函数必须只在 world-art 一份
for fn in stairScaffold stairCardSlot stairCard cityGridLayout cityScaffold cityBuilding cityDoor cityDoorRow cityRoad; do
  # 精确匹配函数名边界：`stairCardSlot` / `cityDoorRow` 都含 `stairCard` / `cityDoor`，
  # 不收紧会让「唯一真源 = 1」这条判成 2（假红）。
  N_ART="$(grep -cE "^export function $fn\\(" "$SHARED_ART")"
  N_ART="${N_ART:-0}"
  N_VUE="$(grep -cE "^(export )?function $fn\\(" "$TUTOR_WORLD")"
  N_VUE="${N_VUE:-0}"
  ok_if "$N_ART" "1" "画法原语 $fn 在共享件 packages/world-art（唯一真源）"
  ok_if "$N_VUE" "0" "画法原语 $fn 未在 world.vue 另写一份（N2 禁第二套画法）"
done
for k in STAIR CITY; do
  N_ART="$(grep -c "export const $k = {" "$SHARED_ART")"
  N_ART="${N_ART:-0}"
  N_VUE="$(grep -c "const $k = {" "$TUTOR_WORLD")"
  N_VUE="${N_VUE:-0}"
  ok_if "$N_ART" "1" "布局常量 $k 在共享件（坐标真源单点）"
  ok_if "$N_VUE" "0" "布局常量 $k 未在 world.vue 复制一份（两个真源必然漂移）"
done
# 共享件零色值（三重 grep）
ART_HEX="$(grep -nE '#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(' "$SHARED_ART" 2>/dev/null | wc -l | tr -d ' ')"
ok_if "$ART_HEX" "0" "packages/world-art/src/art.js 零色值字面量（N2）"
NAMED_RE=':(white|black|red|blue|green|yellow|gray|grey|orange|purple|pink|brown|cyan|magenta|silver|navy|teal|olive|maroon|lime|aqua|fuchsia)[;,]'
ART_NAMED="$(grep -nE "\s*$NAMED_RE" "$SHARED_ART" 2>/dev/null | wc -l | tr -d ' ')"
ok_if "$ART_NAMED" "0" "packages/world-art/src/art.js 零具名色（N2）"
# N3 非 3D：画法层不许出现 3D 变换/透视
THREE_D="$(grep -nE 'perspective|rotate3d|translate3d|translateZ|matrix3d|transform-style:\s*preserve-3d|backface-visibility' "$SHARED_ART" "$TUTOR_WORLD" 2>/dev/null | wc -l | tr -d ' ')"
ok_if "$THREE_D" "0" "非 3D：画法层零 3D 变换（纵深靠分层/退晕，N3）"
# 画布 `<svg>` 里零裸 <text>（uni-app H5 老坑：SVG text 编译成 uni-text 落进 SVG 命名空间 = 未知元素，
# 不渲染、量出来 0×0）。文本全走 SvgText 组件或 HTML 叠层。
# ★ 只数**画布 svg 子树内**的 <text>：模板里还有一堆 HTML 的 <text>（uni-app 文本组件，
# 那是正常 HTML），把它们一起数进去这条断言永远红——正则 [\s>] 在不同 grep shim（ugrep/GNU）
# 下还会给出不同答案（实测 1 vs 140），故用 awk 按 svg 块切，口径唯一。
# 状态机：`class="map-svg"` 那一行进（在 <svg 的下一行，故不匹配 <svg> 行），`</svg>` 出。
# awk 程序单独赋值（不含在 "$( ... )" 的双引号里）：`"$(awk '...含双引号...' f)"` 这种
# 「双引号里再单引号再双引号」的嵌套会让 bash 的 $() 解析错乱（实测整脚本从本行起不再解析）。
SVG_TEXT_AWK='{ if ($0 ~ /class="map-svg"/) insvg = 1; if ($0 ~ /<\/svg>/) insvg = 0; if (insvg && $0 ~ /<text[\s>]/) c += 1 } END { print c + 0 }'
SVG_TEXT="$(awk "$SVG_TEXT_AWK" "$TUTOR_WORLD")"
ok_if "$SVG_TEXT" "0" "画布 SVG 内零裸 <text>（文本走 SvgText 组件）"
# 数**开标签出现次数**（grep -c 数的是行，一处标签的属性换行就会被少算）
# 实测 8 处：维度 A 海拔刻度/学段名/纵深/我在这 + 维度 B 学段名/我在读 + 维度 C 街牌 + 图注。
ok_ge "$(grep -oE '<SvgText' "$TUTOR_WORLD" | wc -l | tr -d ' ')" "8" "SVG 文本统一走 SvgText 组件（8 处在用，无裸 SVG <text>）"
# 孤儿类对账：art.js 产的类必须在 world.css 有映射
ORPHAN_JSON="$TMP_DIR/orphan.json"
node -e '
const fs = require("fs")
const art = fs.readFileSync(process.argv[1], "utf8")
const css = fs.readFileSync(process.argv[2], "utf8")
const vue = fs.readFileSync(process.argv[3], "utf8")
const decl = new Set([...css.matchAll(/\.(w-[a-z0-9-]+)/g)].map((m) => m[1]))
const vueCls = new Set([...vue.matchAll(/[\x27"]([a-z0-9-]*w-[a-z0-9- ]*)[\x27"]/g)].flatMap((m) => m[1].split(/\s+/)))
const used = new Set([...art.matchAll(/c:\s*[\x27"](w-[a-z0-9-]+)[\x27"]/g)].map((m) => m[1]))
const orphan = [...used].filter((c) => !decl.has(c))
fs.writeFileSync(process.argv[4], JSON.stringify({ used: used.size, declared: decl.size, orphan }, null, 1))
' "$SHARED_ART" "$WORLD_CSS" "$TUTOR_WORLD" "$ORPHAN_JSON" 2>"$TMP_DIR/orphan.err"
ok_if "$(node -e 'console.log((require(process.argv[1]).orphan||[]).length)' "$ORPHAN_JSON" 2>/dev/null)" "0" "art.js 产出的几何类在 world.css 全部有映射（零孤儿类）"
ok_ge "$(node -e 'console.log(require(process.argv[1]).used||0)' "$ORPHAN_JSON" 2>/dev/null)" "40" "世界语言几何类在用（art.js 产出类数）"
# 模板里手写的 w-* 类也要有映射（否则是死样式或漏映射）
TMPL_ORPHAN="$(node -e '
const fs = require("fs")
const css = fs.readFileSync(process.argv[2], "utf8")
const vue = fs.readFileSync(process.argv[3], "utf8")
const decl = new Set([...css.matchAll(/\.(w-[a-z0-9-]+)/g)].map((m) => m[1]))
const scoped = new Set([...vue.matchAll(/^\s*\.(w-[a-z0-9-]+)/gm)].map((m) => m[1]))
const used = new Set()
for (const m of vue.matchAll(/class="([^"]*)"/g)) for (const c of m[1].split(/\s+/)) if (c.startsWith("w-")) used.add(c)
for (const m of vue.matchAll(/[\x27"]w-[a-z0-9-]*(?:\s+w-[a-z0-9-]*)*[\x27"]/g)) for (const c of m[0].slice(1, -1).split(/\s+/)) if (c.startsWith("w-")) used.add(c)
const orphan = [...used].filter((c) => !decl.has(c) && !scoped.has(c))
console.log(orphan.join(","))
' _ "$WORLD_CSS" "$TUTOR_WORLD" 2>/dev/null)"
ok_if "${TMPL_ORPHAN:-}" "" "模板用到的 w-* 类在 world.css / 局部样式全部有声明（${TMPL_ORPHAN:-零缺失}）"

# ---------------------------------------------------------------------------
echo
echo "== §4–§10. 真浏览器 E2E（学生身份 · 同源双 App 托管 · 三维度几何探针）=="
cat > "$TMP_DIR/serve.cjs" <<'NODEEOF'
const http = require('http'), https = require('https'), fs = require('fs'), path = require('path')
const PORTAL_DIST = process.argv[2], TUTOR_DIST = process.argv[3], PORT = Number(process.argv[4])
const API_UP = process.argv[5] || 'http://127.0.0.1:3012'
const AUTH_UP = process.argv[6] || 'https://localhost'
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.map': 'application/json; charset=utf-8' }
function proxy(req, res, base) {
  const target = new URL(req.url, base)
  const mod = target.protocol === 'https:' ? https : http
  const up = mod.request({ hostname: target.hostname, port: target.port || (target.protocol === 'https:' ? 443 : 80), path: target.pathname + target.search, method: req.method, headers: { ...req.headers, host: target.host, 'accept-encoding': 'identity' }, rejectUnauthorized: false }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res) })
  up.on('error', (e) => { res.writeHead(502, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: String(e && e.message) })) })
  req.pipe(up)
}
const APPS = [['/portal/', PORTAL_DIST], ['/tutor/', TUTOR_DIST]]
http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) return proxy(req, res, API_UP)
  if (req.url.startsWith('/auth/')) return proxy(req, res, AUTH_UP)
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
const PORTAL = process.argv[2], TUTOR = process.argv[3], SHOTS = process.argv[4]
const USER = process.env.E2E_IDENTIFIER, PASS = process.env.E2E_PASSWORD
const ERRORS = []
const emit = (k, v) => console.log('RESULT ' + k + ' ' + String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, 420))
const note = (s) => console.log('# ' + s)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
function watch(page, tag) {
  page.on('pageerror', (e) => ERRORS.push(tag + '|pageerror|' + e.message))
  page.on('console', (m) => { if (m.type() === 'error') ERRORS.push(tag + '|console|' + m.text()) })
}
const t = (page, sel) => page.evaluate((s) => (document.querySelector(s) ? document.querySelector(s).innerText : ''), sel)
const tc = (page, sel) => page.evaluate((s) => (document.querySelector(s) ? document.querySelector(s).textContent : ''), sel)
const all = (page, sel, attr) => page.$$eval(sel, (els, a) => els.map((e) => e.getAttribute(a)), attr)
const cnt = (page, sel) => page.$$eval(sel, (els) => els.length)
const has = async (page, sel) => (await page.$(sel)) ? 'yes' : 'no'
/** 点一个带常驻动画的热点：先真点击，失败退回 DOM click（真人点得动，playwright 的稳定判定会等超时）。 */
async function clickHot(page, sel) {
  try { await page.click(sel, { timeout: 4000 }); return 'real' }
  catch (e) { const n = String(e.message).split('\n').filter((l) => /stable|intercepts|not visible|outside/.test(l)); if (n.length) note('clickFallback ' + sel); await page.$eval(sel, (el) => el.click()); return 'dom' }
}
async function login(page) {
  await page.goto(PORTAL, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('input[aria-label="账号"]', { timeout: 30000 })
  await page.fill('input[aria-label="账号"]', USER)
  await page.fill('input[aria-label="密码"]', PASS)
  await page.click('.submit-btn')
  await page.waitForSelector('.lw-canvas', { timeout: 30000 })
}
/** 页面上下文里带鉴权的 JSON 取数（学习链的掌握度只在登录态出现） */
const INJECT = () => {
  if (window.__j) return
  const raw = localStorage.getItem('gri-auth-token') || ''
  let tok = ''; try { const o = JSON.parse(raw); tok = o.accessToken || o.token || '' } catch (e) { tok = raw }
  const H = { 'content-type': 'application/json' }; if (tok) H.Authorization = 'Bearer ' + tok
  window.__j = async (u, o) => { const r = await fetch(u, Object.assign({ headers: H }, o)); let j = null; try { j = await r.json() } catch (e) {}; return j }
}
async function enterSummit(page) {
  await page.goto(TUTOR + '#/pages/twin/world?from=world', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-world-shell="tutor"]', { timeout: 30000 })
  await page.waitForSelector('[data-map]', { timeout: 30000 })
  await page.waitForTimeout(1400)
}
/** 切到某个维度，等它真的挂上（data-dim-active 与场景锚同时到位）才算切完。 */
async function switchDim(page, code) {
  await clickHot(page, '[data-dim="' + code + '"]')
  await page.waitForFunction((c) => {
    const a = document.querySelector('[data-dim-active="yes"]')
    return !!a && a.getAttribute('data-dim') === c && !!document.querySelector('[data-dim-current="' + c + '"]')
  }, code, { timeout: 20000 })
  await page.waitForTimeout(1500)
}
/** ★N1 场景互斥探针：当前维度画布内，属别的维度的元素必须一个都不在。 */
const SCENE_PROBE = () => {
  const scene = document.querySelector('.map-scene[data-dim-current]')
  if (!scene) return { error: 'no-scene' }
  const n = (s) => scene.querySelectorAll(s).length
  return {
    dim: scene.getAttribute('data-dim-current'),
    // 维度 A（群峰）的元素
    peak: n('[data-branch]'), depth: n('[data-branch-depth]'), gradeDoor: n('[data-grade-door]'),
    band: n('[data-band]'), camp: n('[data-camp-detail]'), bookDrill: n('[data-detail-clc]'),
    axis: scene.querySelectorAll('[data-map] .w-axis-label').length,
    meLine: scene.querySelectorAll('[data-map] .w-me-line').length,
    // 维度 B（K12 阶梯）的元素
    stairCard: n('[data-book]'),
    // 维度 C（城区）的元素 —— 含 v5 遗留（必须 0）
    avenue: n('[data-avenue-mark]'), storefront: n('[data-storefront]'),
    building: n('[data-building]'), kpDoor: n('[data-kp-door]'),
    // v6 结构锚
    scenes: document.querySelectorAll('.map-scene[data-dim-current]').length,
    maps: scene.querySelectorAll('[data-map]').length,
    viewBox: (scene.querySelector('[data-map]') || {}).getAttribute ? (scene.querySelector('[data-map]').getAttribute('viewBox') || '') : '',
    svgNum: scene.querySelectorAll('[data-map]').length,
    // N1 红线：维度的「主体语汇」必须只属于自己的画布。
    // 必须区分「地平线」与「峰」：K12/城区允许天边远山一线（w-ridge-far）与天光，
    // 那是地平线不是峰；峰 = peakMassif 的 w-peak-* 画法 + depthSpire 的 w-band-depth* 画法。
    haveridge: scene.querySelectorAll('[data-map] .w-ridge-far').length,
    hasPeakArt: scene.querySelectorAll('[data-map] .w-peak-ridge, [data-map] .w-peak-edge, [data-map] .w-peak-snow').length,
    hasSpireArt: scene.querySelectorAll('[data-map] .w-band-depth, [data-map] .w-band-depth-edge, [data-map] .w-band-depth-light').length,
    hasClimber: scene.querySelectorAll('[data-map] .climber-fig').length,
    // 只禁 **v5 散点店面/旧楼门的旧锚点**（data-storefront），不禁共享门洞画法：
    // 「店门 = 知识点洞口」且楼门三态真源 deriveLightState 沿用 v4/v5（§4 保留），
    // 城区的楼门本就复用同一个 w-door 原语。禁原语 = 禁设计条款。
    hasDoorArt: scene.querySelectorAll('[data-storefront]').length,
    hasBarricade: scene.querySelectorAll('[data-map] .w-barricade-lamp').length,
  }
}
/** ★N5 不重叠探针：给定选择器，两两求包围盒交集面积，返回最大交集与对儿。 */
const OVERLAP_PROBE = (sel) => {
  const els = [...document.querySelectorAll(sel)]
  const rects = els.map((e) => e.getBoundingClientRect())
  let maxArea = 0, worst = ''
  for (let i = 0; i < rects.length; i += 1) for (let j = i + 1; j < rects.length; j += 1) {
    const a = rects[i], b = rects[j]
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left)
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
    if (w > 0 && h > 0) { const ar = w * h; if (ar > maxArea) { maxArea = Math.round(ar); worst = els[i].getAttribute(els[i].dataset ? Object.keys(els[i].dataset)[0] : 'class') + '/' + els[j].getAttribute(els[j].dataset ? Object.keys(els[j].dataset)[0] : 'class') } }
  }
  return { n: els.length, maxArea, worst }
}
/** K12 阶梯几何：12 列 + 每列卡数 + 列距 + 踏面三级 + 「我在读」 */
const STAIR_PROBE = () => {
  const cards = [...document.querySelectorAll('[data-book]')]
  const byCol = {}
  for (const c of cards) { const g = c.getAttribute('data-book-grade'); (byCol[g] = byCol[g] || []).push(c) }
  const cols = Object.keys(byCol).map(Number).sort((a, b) => a - b)
  // 同列两卡纵向分开（不重叠由 §5 统一断言）；列中心距 = 列宽
  const centers = cols.map((g) => { const r = byCol[g][0].getBoundingClientRect(); return Math.round(r.left + r.width / 2) })
  const gaps = centers.slice(1).map((x, i) => x - centers[i])
  // 踏面三级：按 rectum 的 top 聚类（台阶抬升）
  const treads = [...document.querySelectorAll('[data-map] .w-stair-tread')].map((e) => Math.round(e.getBoundingClientRect().top))
  const treadGroups = [...new Set(treads)].sort((a, b) => b - a)
  const meBtn = document.querySelector('[data-book-grade="' + (document.querySelector('[data-map] .w-me-label') ? '' : '') + '"]')
  return {
    cards: cards.length, cols: cols.length, colList: cols.join(','),
    perCol: Object.values(byCol).map((v) => v.length).join(','),
    maxPerCol: Math.max(0, ...Object.values(byCol).map((v) => v.length)),
    gaps: gaps.join(','), gapN: gaps.length,
    treadGroups: treadGroups.length, treadTops: treadGroups.slice(0, 6).join(','),
    meLabel: String(document.querySelector('[data-map] .w-me-label') ? document.querySelector('[data-map] .w-me-label').textContent : '').trim(),
    meMark: !!meBtn,
  }
}
/** 城区网格几何：行数 = 分支数 / 每行楼数 / 楼距（步道）/ 楼门三态 */
const CITY_PROBE = () => {
  const blds = [...document.querySelectorAll('[data-building]')]
  const rows = {}
  for (const b of blds) { const k = b.getAttribute('data-building-branch'); (rows[k] = rows[k] || []).push(b) }
  const rowKeys = Object.keys(rows)
  const signBoards = document.querySelectorAll('[data-map] .w-city-sign-board').length
  // 每行楼距 = 相邻楼中心 x 差（≥ 步道宽 CITY.colW - CITY.buildingW = 36）
  // 只统计**有 ≥2 栋楼的街**的楼距：单栋街（如 math.seq 只有一章）没有「相邻」可量，
  // 把它算成 -1 会让整城的最小间距判红——那是数据形态，不是排布缺陷。
  const rowGaps = rowKeys.map((k) => {
    const c = rows[k].map((e) => { const r = e.getBoundingClientRect(); return Math.round(r.left + r.width / 2) }).sort((a, b) => a - b)
    const g = c.slice(1).map((x, i) => x - c[i])
    return { n: c.length, min: g.length ? Math.min(...g) : null }
  })
  const doors = [...document.querySelectorAll('[data-kp-door]')]
  const streetN = document.querySelectorAll('[data-map] .w-city-street').length
  const barricadeN = document.querySelectorAll('[data-map] .w-barricade-lamp, [data-map] .w-gg-fog').length
  return {
    rows: rowKeys.length, blds: blds.length,
    perRow: rowKeys.map((k) => rows[k].length).join(','),
    rowList: rowKeys.join(','),
    minRowGap: (rowGaps.filter((r) => r.min != null).length ? Math.min(...rowGaps.filter((r) => r.min != null).map((r) => r.min)) : -1),
    singleRows: rowGaps.filter((r) => r.n < 2).length,
    signBoards, streetN, barricadeN,
    doors: doors.length,
    doorStates: [...new Set(doors.map((d) => d.getAttribute('data-kp-state')))].sort().join(','),
    bldStates: [...new Set(blds.map((b) => b.getAttribute('data-building-state')))].sort().join(','),
    count: String(document.querySelector('[data-district-count]') ? document.querySelector('[data-district-count]').textContent : '').replace(/\s+/g, ' ').trim().slice(0, 160),
  }
}
/** 画布不硬缩探针：scrollWidth > clientWidth（min-width 撑住，非硬压） */
const SCROLL_PROBE = () => {
  const sc = document.querySelector('[data-map-scroll]')
  if (!sc) return { err: 'no-scroll' }
  const scene = document.querySelector('.map-scene[data-dim-current]')
  const svg = scene ? scene.querySelector('[data-map]') : null
  return {
    scrollW: sc.scrollWidth, clientW: sc.clientWidth,
    scrollable: sc.scrollWidth > sc.clientWidth ? 'yes' : 'no',
    sceneW: scene ? Math.round(scene.getBoundingClientRect().width) : 0,
    sceneMin: scene ? getComputedStyle(scene).minWidth : '',
    svgW: svg ? Math.round(svg.getBoundingClientRect().width) : 0,
    viewBox: svg ? svg.getAttribute('viewBox') : '',
    par: svg ? svg.getAttribute('preserveAspectRatio') : '',
  }
}
/** 门排连续性（v5 口径沿用，v6 楼前一条街）：相邻门中心等距 */
async function doorGeom(page) {
  return page.evaluate(() => {
    const els = [...document.querySelectorAll('[data-kp-door]')]
    const rects = els.map((e) => e.getBoundingClientRect())
    const centers = rects.map((r) => r.left + r.width / 2).sort((a, b) => a - b)
    const gaps = centers.slice(1).map((x, i) => Math.round(x - centers[i]))
    // 门排宿主 = 当前选中的楼栋（`.hot.selected[data-building]`）。
    // 带上它，断言才能比「同一栋楼的门数」：楼门数随选中楼变，拿别栋楼的门数比 = 假红。
    const host = document.querySelector('.hot.selected[data-building]')
    return {
      n: els.length, codes: els.map((e) => e.getAttribute('data-kp-door')), gaps,
      host: host ? host.getAttribute('data-building') : '',
      states: [...new Set(els.map((e) => e.getAttribute('data-kp-state')))].sort().join(',')
    }
  })
}

;(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] })
  const ctx = await browser.newContext({ viewport: { width: 1480, height: 1060 }, ignoreHTTPSErrors: true })
  const page = await ctx.newPage()
  watch(page, 'flow')
  await login(page)
  await enterSummit(page)
  await page.evaluate(INJECT)

  // ── §4 N1 维度切换器：三档在，默认仍是 A ──
  emit('dim_opts', (await all(page, '[data-dim]', 'data-dim')).join(','))
  emit('dim_default', await page.$eval('[data-dim-active="yes"]', (e) => e.getAttribute('data-dim')).catch(() => ''))
  emit('subject_active', await page.$eval('[data-subject-active="yes"]', (e) => e.getAttribute('data-subject')).catch(() => ''))

  // ── §4 ★N1：维度 A（默认）——群峰在，城区元素 = 0 ──
  emit('probe_branches', JSON.stringify(await page.evaluate(SCENE_PROBE)))
  await page.screenshot({ path: SHOTS + '/01-a-branches.png' })

  // ── §4 ★N1 + §7：切到 K12 升学阶梯 ──
  await switchDim(page, 'grades')
  emit('probe_grades', JSON.stringify(await page.evaluate(SCENE_PROBE)))
  emit('stair_scroll', JSON.stringify(await page.evaluate(SCROLL_PROBE)))
  emit('stair_geom', JSON.stringify(await page.evaluate(STAIR_PROBE)))
  emit('stair_overlap', JSON.stringify(await page.evaluate(OVERLAP_PROBE, '[data-book]')))
  emit('stair_legend', String(await t(page, '.map-legend')).replace(/\n/g, ' · ').slice(0, 460))
  await page.screenshot({ path: SHOTS + '/02-b-stair.png' })

  // ── §4 ★N1 + §8：切到城区街区网格 ──
  await switchDim(page, 'district')
  emit('probe_district', JSON.stringify(await page.evaluate(SCENE_PROBE)))
  emit('city_scroll', JSON.stringify(await page.evaluate(SCROLL_PROBE)))
  emit('city_geom', JSON.stringify(await page.evaluate(CITY_PROBE)))
  emit('city_overlap', JSON.stringify(await page.evaluate(OVERLAP_PROBE, '[data-building]')))
  // 楼门三态要**三种都见过**才算不回归：默认选中的是「第一栋未亮楼」，它的门只有 lit/half；
  // dim（未明）要点一栋 dim 楼才出现在楼前。故这里按状态各点一栋，汇总三态并集。
  emit('city_door_states', String(await page.evaluate(async () => {
    const out = new Set()
    for (const want of ['lit', 'half', 'dim']) {
      const b = [...document.querySelectorAll('[data-building]')].find((e) => e.getAttribute('data-building-state') === want)
      if (!b) continue
      b.click()
      await new Promise((r) => setTimeout(r, 900))
      for (const d of document.querySelectorAll('[data-kp-door]')) out.add(d.getAttribute('data-kp-state'))
      for (const m of document.querySelectorAll('.detail-mask')) m.remove()
    }
    return [...out].sort().join(',')
  })))
  emit('city_empty', await page.$eval('[data-district-empty]', (e) => e.getAttribute('data-district-empty')).catch(() => 'no'))
  emit('city_legend', String(await t(page, '.map-legend')).replace(/\n/g, ' · ').slice(0, 460))
  emit('city_mapnote', String(await tc(page, '[data-map] .w-map-note')).trim().slice(0, 120))
  await page.screenshot({ path: SHOTS + '/03-c-city.png' })

  // 楼门一条街的连续性（v5 口径：等距 = 同一排布函数同一常量）
  const dg = await doorGeom(page)
  emit('city_door_n', dg.n)
  emit('city_door_host', dg.host)
  emit('city_door_states_again', dg.states)
  emit('city_door_codes', dg.codes.join(','))
  emit('city_door_gaps', dg.gaps.join(','))
  emit('city_door_contig', dg.gaps.length && dg.gaps.every((g) => Math.abs(g - dg.gaps[0]) <= 2) ? 'yes' : 'no')
  // ★DOM 与几何同源：在**同一栋选中楼**下再取一次几何门数。
  // 早先 city_geom 是在「点遍三态楼」之前取的（默认选中的第一栋未亮楼 → 6 门），
  // 而 doorGeom 是在点过 dim 楼之后取的（→ 12 门）。两者本就不是同一栋楼，
  // 拿它们比「相等」是假红——门数本来就随选中楼变。
  // 现在同源比：同一时刻、同一栋楼，DOM 门数 = CITY_PROBE 门数。
  emit('city_geom_same', JSON.stringify(await page.evaluate(CITY_PROBE)))

  // ── §10 N9 无回归：切回 A 仍在同一座峰；册章详情在 ──
  await switchDim(page, 'branches')
  emit('probe_branches_again', JSON.stringify(await page.evaluate(SCENE_PROBE)))
  emit('branches_n_again', await cnt(page, '[data-branch]'))
  emit('kept_peak', await page.$eval('.hot.selected[data-branch]', (e) => e.getAttribute('data-branch')).catch(() => ''))
  await page.screenshot({ path: SHOTS + '/04-a-back.png' })

  // ── §10 楼内闭环同一条（维度 C 楼门 → 洞内：主讲台/地下室同一闭环）──
  await switchDim(page, 'district')
  // 优先点一扇 **dim（未明）门**：默认悬在楼前的是「第一栋未亮楼」的门（lit/half），
  // 点它进洞只会看到已作答过的灯位；洞内灯位三态是否不回归，必须让一个没作答过的灯位在场。
  const loopTarget = await page.evaluate(() => {
    const ds = [...document.querySelectorAll('[data-kp-door]')]
    if (!ds.length) return ''
    const dim = ds.find((d) => d.getAttribute('data-kp-state') === 'dim') || ds.find((d) => d.getAttribute('data-kp-state') === 'half') || ds[0]
    return dim.getAttribute('data-kp-door')
  })
  emit('city_loop_door', loopTarget)
  if (loopTarget) {
    await clickHot(page, '[data-kp-door="' + loopTarget + '"]')
    await page.waitForSelector('[data-cave-scene]', { timeout: 20000 })
    await page.waitForTimeout(1200)
    emit('loop_open', 'yes')
    emit('loop_surface', await page.$eval('[data-cave-surface]', (e) => e.getAttribute('data-cave-surface-state')).catch(() => ''))
    emit('loop_stage', await page.$eval('[data-cave-loop]', (e) => e.getAttribute('data-cave-stage')).catch(() => ''))
    emit('loop_seeds', await cnt(page, '[data-cave-kp]'))
    emit('loop_seed_states', [...new Set(await all(page, '[data-cave-kp]', 'data-cave-kp-state'))].sort().join(','))
    emit('loop_node', String(await tc(page, '[data-cave-node]')).trim())
    emit('loop_honest', String(await tc(page, '.cs-honest')).trim().slice(0, 120))
    await page.screenshot({ path: SHOTS + '/05-city-cave.png' })
  }

  // ── §9 N8 prefers-reduced-motion 降级：新开一个 reduce 上下文，光脉仍是静态可读 ──
  const rmCtx = await browser.newContext({ viewport: { width: 1480, height: 1060 }, ignoreHTTPSErrors: true, reducedMotion: 'reduce' })
  const rmPage = await rmCtx.newPage()
  watch(rmPage, 'reduce')
  await login(rmPage)
  await enterSummit(rmPage)
  await switchDim(rmPage, 'district')
  await rmPage.waitForTimeout(1200)
  emit('rm_city_geom', JSON.stringify(await rmPage.evaluate(CITY_PROBE)))
  emit('rm_anim', await rmPage.evaluate(() => {
    const el = document.querySelector('[data-map] .w-light-pulse, [data-map] .w-light-trail, [data-map] .w-light-hint')
    if (!el) return 'none'
    const cs = getComputedStyle(el)
    return cs.animationName + '|' + cs.animationDuration
  }))
  emit('rm_pageerrors', ERRORS.filter((e) => e.startsWith('reduce|')).length)
  await rmCtx.close()

  // ── §9 光脉传导：locate 一格 dim/half/lit 的楼门 → 进楼 → 读出该 KP 的三态（不靠截图目测）──
  await switchDim(page, 'branches')
  emit('pageerrors', ERRORS.filter((e) => e.startsWith('flow|')).length)
  emit('pageerror_sample', ERRORS.slice(0, 3).join(' ; ').slice(0, 200))

  await browser.close()
})().catch((e) => { console.log('FATAL ' + (e && e.stack ? e.stack : e)); process.exit(1) })
NODEEOF

node "$TMP_DIR/serve.cjs" "$PORTAL_DIST" "$TUTOR_DIST" "$TEST_PORT" "http://127.0.0.1:$API_PORT" "https://localhost" >"$TMP_DIR/serve.log" 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 40); do grep -q READY "$TMP_DIR/serve.log" 2>/dev/null && break; sleep 0.3; done
grep -q READY "$TMP_DIR/serve.log" && pass "静态托管已起（:$TEST_PORT，同源双 App + /api 反代）" || fail "静态托管没起来（$TMP_DIR/serve.log）"

E2E_LOG="$TMP_DIR/e2e.log"
PW_CORE="$PW_CORE" E2E_IDENTIFIER="$E2E_IDENTIFIER" E2E_PASSWORD="$E2E_PASSWORD" \
  node "$TMP_DIR/e2e.cjs" "http://127.0.0.1:$TEST_PORT/portal/" "http://127.0.0.1:$TEST_PORT/tutor/" "$SHOTS" >"$E2E_LOG" 2>&1
ok_if "$?" "0" "E2E 脚本跑完（无致命错）"
grep '^#' "$E2E_LOG" | sed 's/^/      /' | head -12
grep '^FATAL' "$E2E_LOG" | sed 's/^/      /'
for f in 01-a-branches 02-b-stair 03-c-city 04-a-back; do ok_file "$SHOTS/$f.png" "截图在册（$f.png）"; done

# ---------------------------------------------------------------------------
echo
echo "== §4. ★N1 场景物理分离（本卡核心：切维度 = 换世界，不再换叠加层）=="
jget() { node -e 'const fs=require("fs");const d=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));const k=process.argv[1].split(".");let v=d;for(const x of k){if(v==null)break;v=v[x]}console.log(v==null?"":(typeof v==="object"?JSON.stringify(v):v))' "$1" "$2" 2>/dev/null; }
jnum() { node -e 'const fs=require("fs");const d=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));const k=process.argv[1].split(".");let v=d;for(const x of k){if(v==null)break;v=v[x]}console.log(typeof v==="number"?v:-1)' "$1" "$2" 2>/dev/null; }
# E2E 里 emit 的是 JSON 串，落成文件供断言（emit 会把整行压成一行，直接当 JSON 读即可）
for d in branches grades district branches_again; do
  RAW="$(rget "probe_$d" "$E2E_LOG")"
  printf '%s' "$RAW" >"$TMP_DIR/probe_$d.json"
  node -e 'require("fs").writeFileSync(process.argv[1], JSON.stringify(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))))' "$TMP_DIR/probe_$d.json" 2>"$TMP_DIR/probe_$d.err" || fail "维度 $d 的探针 JSON 解析失败（$(head -c 120 "$TMP_DIR/probe_$d.err" 2>/dev/null)）"
done
for pair in "branches branches" "grades grades" "district district"; do
  set -- $pair
  ok_if "$(jget dim "$TMP_DIR/probe_$1.json")" "$2" "维度 $1 的画布锚在场（data-dim-current=$2）"
  ok_if "$(jnum scenes "$TMP_DIR/probe_$1.json")" "1" "维度 $1：同一时刻只挂一块画布（v-if 顶层收口，不是叠层）"
  ok_if "$(jnum svgNum "$TMP_DIR/probe_$1.json")" "1" "维度 $1：画布内只有一张 SVG（分页不是把三块 SVG 叠在一起）"
done
# ★N1 画法语汇互斥（不只是「元素 = 0」）：峰的画法不许出现在 B/C 画布上。
# 区分「地平线」与「峰」——B/C 可以有天边远山一线（那是地平线，不是峰的主体语汇）。
for d in grades district; do
  ok_if "$(jnum hasPeakArt "$TMP_DIR/probe_$d.json")" "0" "维度 $d 画布内峰的画法（w-peak-*）= 0（N1：峰属维度 A，不是留一线轮廓）"
  ok_if "$(jnum hasSpireArt "$TMP_DIR/probe_$d.json")" "0" "维度 $d 画布内纵深尖塔画法（w-band-depth*）= 0（N1：学科纵深属维度 A）"
  ok_if "$(jnum hasClimber "$TMP_DIR/probe_$d.json")" "0" "维度 $d 画布内攀登人物 = 0（N1：登峰人物属维度 A）"
  ok_if "$(jnum hasDoorArt "$TMP_DIR/probe_$d.json")" "0" "维度 $d 画布内 v5 旧洞门/店面画法（w-door/w-storefront）= 0（N1：城区改楼门，K12 改册卡）"
done
# 维度 A 反过来：楼栋/街牌/台阶的画法不许渗回群峰
ok_if "$(jnum hasDoorArt "$TMP_DIR/probe_branches.json")" "0" "维度 A 画布内城区楼门/旧店面画法 = 0（城区元素不渗回群峰）"
ok_ge "$(jnum hasPeakArt "$TMP_DIR/probe_branches.json")" "1" "维度 A 画布内峰的画法在（群峰是它在的证明）"
# 城区自己的因果负面态（施工围挡）与楼门三态：M2 口径在城区页内
ok_ge "$(jnum hasBarricade "$TMP_DIR/probe_district.json")" "1" "城区画布内施工围挡在（M2：前置未满足的路段 = 围挡 + 晨雾）"
# ★N1 硬断言：K12 页内城区元素与峰元素 = 0
for sel in storefront avenue kpDoor building; do
  ok_if "$(jnum "$sel" "$TMP_DIR/probe_grades.json")" "0" "K12 阶升维度内「$sel」= 0（N1：K12 页不掺城区元素）"
done
for sel in peak depth gradeDoor band; do
  ok_if "$(jnum "$sel" "$TMP_DIR/probe_grades.json")" "0" "K12 阶升维度内「$sel」= 0（N1：K12 页不掺维度 A 峰元素）"
done
ok_if "$(jnum "axis" "$TMP_DIR/probe_grades.json")" "0" "K12 阶升维度内海拔轴刻度 = 0（N1：年级海拔轴属维度 A）"
ok_if "$(jnum "meLine" "$TMP_DIR/probe_grades.json")" "0" "K12 阶升维度内「我在这」海拔线 = 0（v6 换成阶梯「我在读」标记）"
ok_if "$(jnum "camp" "$TMP_DIR/probe_grades.json")" "0" "K12 阶升维度内册章营地详情 = 0（N1：K12 册自身一栏，不借峰下的营）"
# ★N1 硬断言：城区页内年级大道与 K12 册热区 = 0
for sel in avenue storefront; do
  ok_if "$(jnum "$sel" "$TMP_DIR/probe_district.json")" "0" "城区维度内「$sel」= 0（v6 核心裁决：整条删除年级大道 / v5 散点店）"
done
ok_if "$(jnum "stairCard" "$TMP_DIR/probe_district.json")" "0" "城区维度内 K12 册热区 = 0（N1：K12 册只属于维度 B）"
for sel in peak depth gradeDoor band; do
  ok_if "$(jnum "$sel" "$TMP_DIR/probe_district.json")" "0" "城区维度内「$sel」= 0（N1：城区页不掺峰/海拔轴）"
done
ok_if "$(jnum "axis" "$TMP_DIR/probe_district.json")" "0" "城区维度内海拔轴刻度 = 0（N1：城区自有街牌，不借海拔轴）"
ok_if "$(jnum "meLine" "$TMP_DIR/probe_district.json")" "0" "城区维度内「我在这」海拔线 = 0"
# 维度 A 自身：群峰在 + 城区新元素 = 0（城区元素不该渗回 A）
ok_ge "$(jnum "peak" "$TMP_DIR/probe_branches.json")" "5" "维度 A 群峰在（[data-branch] ≥ 5）"
ok_ge "$(jnum "gradeDoor" "$TMP_DIR/probe_branches.json")" "2" "维度 A 年级洞门在（进洞入口）"
ok_if "$(jnum "building" "$TMP_DIR/probe_branches.json")" "0" "维度 A 内城区楼栋 = 0（城区元素不渗回群峰）"
ok_if "$(jnum "kpDoor" "$TMP_DIR/probe_branches.json")" "0" "维度 A 内城区楼门 = 0"
ok_if "$(jnum "stairCard" "$TMP_DIR/probe_branches.json")" "0" "维度 A 内 K12 册热区 = 0"
# 三块画布各自的 viewBox（分页分离的物理基础）
VB_A="$(jget "viewBox" "$TMP_DIR/probe_branches.json")"; VB_B="$(jget "viewBox" "$TMP_DIR/probe_grades.json")"; VB_C="$(jget "viewBox" "$TMP_DIR/probe_district.json")"
ok_if "$VB_A" "0 0 1200 820" "维度 A 画布沿用 SUMMIT 1200×820（W4-b 原样不回归）"
ok_if "$VB_B" "0 0 1600 760" "维度 B 画布 = 新 STAIR 1600×760（独立坐标）"
# 维度 C 画布：**基尺寸 1600×900，宽由楼栋列数真实算出**（一支跨 G1–G12 的分支 ~50 章
# → 画布真的 ~8600px 宽）。设计 §4 写的 1600×900 是「一块街的最小画布」，不是硬上限——
# 断言写死 1600×900 会把「按数据变宽」这条正确行为判成 FAIL。
# 宽/高**先取整再比**：`[ x -ge y ]` 是整数比较，而画布宽是楼栋 x + 半个楼宽算出来的
# 真分数（8615.2 这种），直接喂进 -ge 会「实得 8615.2」假 FAIL——值是对的，比较器不认小数。
# 进一（int + 有小数就 +1）而不是截断：截断在 `1600.4` 这种贴边情形会少 1px 判成 < 1600。
VB_C_W="$(printf '%s' "$VB_C" | awk '{w=$3+0; printf "%d", (w==int(w)?w:int(w)+1)}')"
VB_C_H="$(printf '%s' "$VB_C" | awk '{h=$4+0; printf "%d", (h==int(h)?h:int(h)+1)}')"
case "$VB_C" in
  "0 0 1600 900") pass "维度 C 画布 = CITY 基尺寸 1600×900（该分支恰好不宽于基画布）" ;;
  "0 0 "*) ok_ge "$VB_C_W" "1600" "维度 C 画布宽 ≥ 1600 且**随楼栋列数真实变宽**（$VB_C：不是硬编码 1600）" ;;
  *) fail "维度 C 画布 viewBox 形状不认识（实得「$VB_C」）" ;;
esac
# 基高 900 是**下限**不是定值：一支一行，10 支就 10 行（行高 194）→ 2028。
# 写 =900 等于要求「城区只能有一支分支」，与「一街一支」的模型直接冲突（N1）。
ok_ge "$VB_C_H" "900" "维度 C 画布基高 ≥ 900（街区行高 194 × N 行：多分支时向下增高，$VB_C）"

res_ne "probe_branches_again" "$E2E_LOG" "" "切回维度 A 时探针复跑成功（分页不是一次性）"
ok_if "$(jnum peak "$TMP_DIR/probe_branches_again.json")" "$(jnum peak "$TMP_DIR/probe_branches.json")" "维度 A 切出去再切回：群峰数不变（不丢状态）"

# ---------------------------------------------------------------------------
echo
echo "== §5. ★N5 不重叠（同级元素包围盒交集面积 = 0）=="
SB="$(rget stair_overlap "$E2E_LOG")"; [ -n "$SB" ] && printf '%s' "$SB" >"$TMP_DIR/stair_overlap.json"
CB="$(rget city_overlap "$E2E_LOG")"; [ -n "$CB" ] && printf '%s' "$CB" >"$TMP_DIR/city_overlap.json"
ok_ge "$(jnum n "$TMP_DIR/stair_overlap.json")" "8" "K12 册卡热点在渲染（≥8 张，供不重叠断言）"
ok_if "$(jnum maxArea "$TMP_DIR/stair_overlap.json")" "0" "K12 册卡两两交集面积 = 0（N5：v5 的「23 册全叠在一角」已消除）"
ok_ge "$(jnum n "$TMP_DIR/city_overlap.json")" "8" "城区楼栋热点在渲染（≥8 栋，供不重叠断言）"
ok_if "$(jnum maxArea "$TMP_DIR/city_overlap.json")" "0" "城区楼栋两两交集面积 = 0（N5：v5 的「76 店挤在一排」已消除）"
ok_if "$(rget city_door_contig "$E2E_LOG")" "yes" "楼前一条街等距连续（相邻门中心距一致 = 一条连续路径）"

# ---------------------------------------------------------------------------
echo
echo "== §6. ★N6/N10 可读性与不硬缩（min-width，非硬压）=="
SS="$(rget stair_scroll "$E2E_LOG")"; [ -n "$SS" ] && printf '%s' "$SS" >"$TMP_DIR/stair_scroll.json"
CS="$(rget city_scroll "$E2E_LOG")"; [ -n "$CS" ] && printf '%s' "$CS" >"$TMP_DIR/city_scroll.json"
ok_if "$(jget scrollable "$TMP_DIR/stair_scroll.json")" "yes" "K12 阶梯画布横向可滚（scrollWidth > clientWidth；v5 硬缩根因已除）"
ok_if "$(jget scrollable "$TMP_DIR/city_scroll.json")" "yes" "城区网格画布横向可滚（scrollWidth > clientWidth）"
# K12 画布同样是**定宽数据驱动**（STAIR.w=1600 内联），不是 CSS 的 900px 兜底——
# 900px 那一版会把 1600 的 viewBox 硬缩到 900（缩放 0.5625），而册卡热点是**按百分比定位、
# 按 px 排大小**的：标签 68px 挤进 63px 的缩放列距 → 每对相邻列交 5px（N5 真回归）。
ok_if "$(printf '%s' "$(jget sceneW "$TMP_DIR/stair_scroll.json")" | cut -d. -f1)" "$(printf '%s' "$(jget scrollW "$TMP_DIR/stair_scroll.json")" | cut -d. -f1)" "K12 画布内联宽 = 1600（与 STAIR.w 同源：1:1 不硬缩，热点与几何同一比例）"
ok_if "$(printf '%s' "$(jget sceneW "$TMP_DIR/stair_scroll.json")" | cut -d. -f1)" "1600" "K12 画布宽 = STAIR.w 1600（列距 112 / 卡宽 92 在 1:1 下不重叠）"
# 城区画布的 width/minWidth 是**数据驱动内联**（`cityLayout.w + 'px'`）——
# 它比 CSS `.map-scene.is-city{min-width:900px}` 更具体，所以内联赢、computed 拿到真实布局宽。
# 要断言的是「画布按数据给宽、且可滚」：内联宽 = scrollWidth，且 CSS 兜底仍在样式表里在册。
ok_if "$(printf '%s' "$(jget sceneW "$TMP_DIR/city_scroll.json")" | cut -d. -f1)" "$(printf '%s' "$(jget scrollW "$TMP_DIR/city_scroll.json")" | cut -d. -f1)" "城区画布内联宽 = 真实 scrollWidth（宽由楼栋列数算出，不是硬缩到容器）"
# 直接读变量（$TUTOR_CSS 是**已 cat 进来的样式文本**，不是路径——
# 写成 `cat "$TUTOR_CSS"` 会把 259KB 文本当文件名，cat 失败 → 空串 → 断言假红）。
ok_has "$TUTOR_CSS" "min-width:900px" "城区 CSS 仍有 900px 兜底（数据为空时仍可滚）"
ok_has "$(jget par "$TMP_DIR/stair_scroll.json")" "meet" "K12 画布 preserveAspectRatio=meet（等比，不拉伸）"
ok_has "$(jget par "$TMP_DIR/city_scroll.json")" "meet" "城区画布 preserveAspectRatio=meet"
# K12 每列 ≥1 卡且列距 ≥ 卡宽（92px）
SG="$(rget stair_geom "$E2E_LOG")"; [ -n "$SG" ] && printf '%s' "$SG" >"$TMP_DIR/stair_geom.json"
CG="$(rget city_geom "$E2E_LOG")"; [ -n "$CG" ] && printf '%s' "$CG" >"$TMP_DIR/city_geom.json"
CGS="$(rget city_geom_same "$E2E_LOG")"; [ -n "$CGS" ] && printf '%s' "$CGS" >"$TMP_DIR/city_geom_same.json"
ok_ge "$(jnum cols "$TMP_DIR/stair_geom.json")" "12" "K12 阶梯有 12 个年级列（横向 12 年级，设计 §3）"
ok_ge "$(jnum cards "$TMP_DIR/stair_geom.json")" "20" "K12 册卡在渲染（≥20 张：MATH 实测 23 册 = 12 年级 × 上/下册，G12 一册）"
ok_le "$(jnum maxPerCol "$TMP_DIR/stair_geom.json")" "2" "K12 每列册卡 ≤ 2 张（上/下册，设计 §3）"
ok_ge "$(jnum treadGroups "$TMP_DIR/stair_geom.json")" "3" "三级学段台阶在（小学/初中/高中逐级抬升）"
# 年级列距 ≥ 卡宽 92（列宽 112）：取实测最小列距，允许 ±2px 取整噪声
# gaps 在探针里是 join 过的字符串（"63,63,..."）；直接 Math.min(...gaps) 会把字符串
# 逐个字符传进去 → NaN。这里按字符串拆回数字，空串给 -1 让断言如实红。
MINGAP="$(node -e 'const fs=require("fs");const raw=JSON.parse(fs.readFileSync(process.argv[1],"utf8")).gaps;const a=Array.isArray(raw)?raw:String(raw||"").split(",").filter((x)=>x!=="").map(Number);console.log(a.length?Math.min(...a):-1)' "$TMP_DIR/stair_geom.json" 2>/dev/null)"
ok_ge "$MINGAP" "92" "K12 年级列距 ≥ 册卡宽 92（列距 ≥ 卡宽，N6：不叠卡）"
ok_has "$(rget stair_legend "$E2E_LOG")" "学段踏面" "K12 图例在（首屏可见，N6）"
ok_has "$(rget stair_legend "$E2E_LOG")" "不是难度高低" "K12 图例诚实口径：「台阶向上 = 升学，不是难度高低」"
# 城区每行楼距 ≥ 步道宽（colW 168 - buildingW 132 = 36）
ok_ge "$(jnum rows "$TMP_DIR/city_geom.json")" "5" "城区楼栋行数 ≥ 5（行 = 街区 = 分支；math 实测 10 条）"
ok_ge "$(jnum minRowGap "$TMP_DIR/city_geom.json")" "30" "城区每行楼栋间距 ≥ 步道宽（实测 ≥30px，设计列宽 168-楼 132=36）"
ok_ge "$(jnum signBoards "$TMP_DIR/city_geom.json")" "5" "街区名牌在（一条街一个竖牌，N6 可读性）"
ok_ge "$(jnum streetN "$TMP_DIR/city_geom.json")" "5" "楼间街道在画（路 = 学习顺序，M2 沿用）"

# ---------------------------------------------------------------------------
echo
echo "== §7. K12 升学阶梯结构 =="
ok_ge "$(jnum cols "$TMP_DIR/stair_geom.json")" "12" "12 个年级列（横向不叠字）"
COLS_N="$(node -e 'const fs=require("fs");const c=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const l=(c.colList||"").split(",").filter(Boolean).map(Number);const need=[];for(let g=1;g<=12;g++)if(!l.includes(g))need.push(g);console.log(need.join(","))' "$TMP_DIR/stair_geom.json" 2>/dev/null)"
ok_if "$COLS_N" "" "年级列覆盖 1–12 全覆盖（缺失年级：${COLS_N:-无}）"
ok_le "$(jnum maxPerCol "$TMP_DIR/stair_geom.json")" "2" "每列 ≤ 2 册（不缺册时上/下册，缺册则 1 张）"
ok_has "$(rget stair_legend "$E2E_LOG")" "我在读" "K12 图例含「我在读」标记说明"
ok_has "$(rget stair_geom "$E2E_LOG")" "我在读" "「我在读」标记在阶梯上（与维度 A 同一 meGrade 口径）"
# 「我在读」要标**具体年级**（小一…高三），不是「初中」这种学段糊话。
# 账号年级不固定（testuser 是初一），故按正则收口——写死「小一」会把初一账号判红。
# 年级简称的真源是 art.js GRADE_TICKS：**学段字在前、序号在后**（小一/初一/高一），
# 不是「序号 + 学段字」。这个顺序写反过：`[零一二三四五六七八九十]+[初高]?` 匹配不到
# 「初一」——类里没有「初」，而正确形态是「初」开头。12 个简称逐一代入学段字表：
#   小 → 一…六 | 初 → 一…三 | 高 → 一…三（共 12，与 12 个年级列一一对应）
ok_has "$(rget stair_geom "$E2E_LOG")" "我在读 · " "「我在读」标了具体年级前缀（不是空年级）"
ok_match "$(rget stair_geom "$E2E_LOG")" '我在读 · (小[一二三四五六]|初[一二三]|高[一二三])' "「我在读」标为具体年级（小一…高三，学段字在前序号在后；正则收口，不写死账号年级）"
# 空态话术（不造假册）
ok_has "$(cat "$TUTOR_WORLD")" "该学科的 K12 册尚未收录" "K12 空态话术在册（不造假册）"
ok_has "$(rget stair_legend "$E2E_LOG")" "空位" "K12 图例说明「空位 = 该年级还没收录这一科」"
ok_has "$(cat "$TUTOR_WORLD")" "data-scene-empty" "K12 空态有 data-scene-empty 钩子（探针可判）"
ok_has "$(cat "$TUTOR_WORLD")" "data-empty-to-branches" "K12 空态有「回到学科知识体系」按钮（N7 不造假楼）"

# ---------------------------------------------------------------------------
echo
echo "== §8. 城区街区网格结构 =="
ok_ge "$(jnum rows "$TMP_DIR/city_geom.json")" "5" "城区楼栋行数 ≥ 5（行 = 街区 = 分支；math 10 条分支全铺）"
ok_ge "$(jnum blds "$TMP_DIR/city_geom.json")" "8" "城区楼栋在渲染（≥8 栋，列 = 章）"
ok_ge "$(jnum blds "$TMP_DIR/city_geom.json")" "20" "城区楼栋数 ≥ 20（math.num 144 节收成章，实测量级）"
ok_has "$(rget city_door_states "$E2E_LOG")" "dim" "楼门三态含「暗门」（dim：未明）"
ok_has "$(rget city_door_states "$E2E_LOG")" "lit" "楼门三态含「亮门」（≥80% 掌握）"
ok_has "$(rget city_door_states "$E2E_LOG")" "half" "楼门三态含「半亮门」（有作答未到 80）"
ok_if "$(rget city_door_states "$E2E_LOG")" "dim,half,lit" "楼门三态全见（点遍 lit/half/dim 楼后并集 = 三态；不是只在默认选中楼门前看）"
ok_has "$(jget bldStates "$TMP_DIR/city_geom.json")" "lit" "楼栋三态含「已通」（该章知识点 ≥80% 亮）"
ok_has "$(rget city_geom "$E2E_LOG")" "已亮" "城区读数条在（N9 信息密度：一城走了多深）"
ok_has "$(rget city_geom "$E2E_LOG")" "街区有楼" "城区读数含街区数（诚实的分母）"
ok_has "$(rget city_empty "$E2E_LOG")" "no" "数学支城区不是空态（有链、有 code → 铺；N7 不造假楼）"
# 楼门数 = 同一栋选中楼下的 DOM 门数与几何门数（同源，不是恒等：门数随选中楼变）
ok_if "$(rget city_door_n "$E2E_LOG")" "$(jnum doors "$TMP_DIR/city_geom_same.json")" "楼门数与探针一致（DOM 与几何同源：同一栋选中楼下两次取值相等）"
ok_ne "$(rget city_door_host "$E2E_LOG")" "" "楼门宿主楼在场（门排挂在选中楼前，不是孤儿）"
ok_ge "$(rget city_door_n "$E2E_LOG")" "6" "选中楼前排门 ≥ 6 个（一节 6–8 个 KP，一排门）"
ok_le "$(rget city_door_n "$E2E_LOG")" "12" "选中楼前排门 ≤ 12（单节仍是「一排门」的量级）"
# 图例诚实口径（逐字，设计 §4 / 任务卡 N6-N7）
ok_has "$(rget city_legend "$E2E_LOG")" "路的先后是课程序列" "城区图例写明「路的先后是课程序列（先学后学的顺序）」"
ok_has "$(rget city_legend "$E2E_LOG")" "不是难度高低" "城区图例写明「不是难度高低」（N5 不许画成必修）"
ok_has "$(rget city_legend "$E2E_LOG")" "半亮 = 有作答且未到 80" "城区图例写明「半亮 = 有作答且未到 80」"
ok_has "$(rget city_legend "$E2E_LOG")" "不是「会了一半」" "城区图例写明「不是「会了一半」」（N7 诚实口径不回归）"
ok_has "$(rget city_legend "$E2E_LOG")" "同一条闭环" "城区图例写明「地下室走的是同一条闭环；楼上楼下不改变掌握度真源」"
ok_has "$(rget city_legend "$E2E_LOG")" "施工围挡" "城区图例写明「施工围挡 + 晨雾（前置未满足）」"
# M2 因果口径：未掌握前置前的路段 = 施工围挡（v5 沿用，v6 楼间街道同一口径）
# 括号要转义：未转义的 `(` 在双引号里仍会被 bash 当命令替换边界，整脚本在本行之后不再执行
# （这就是「跑出来一堆 FAIL 但尾部 PASS=/FAIL= 行不出来」的真因——不是断言红，是脚本断了）。
ok_has "$(cat "$TUTOR_WORLD")" 'barricade(' "楼下 / 楼间未通路段画施工围挡（M2 负面态在册）"
ok_has "$(cat "$TUTOR_WORLD")" 'lightBeam(' "打通的楼间有光脉传导（M2 正面态在册）"

# ---------------------------------------------------------------------------
echo
echo "== §9. N8 动画与 prefers-reduced-motion 降级 =="
RMG="$(rget rm_city_geom "$E2E_LOG")"; [ -n "$RMG" ] && printf '%s' "$RMG" >"$TMP_DIR/rm_city_geom.json"
ok_ge "$(jnum rows "$TMP_DIR/rm_city_geom.json")" "5" "reduce 下城区照样铺得开（静态降级 = 仍可读，不是空白）"
ok_ge "$(jnum blds "$TMP_DIR/rm_city_geom.json")" "8" "reduce 下城区楼栋照样在（静态降级不丢内容）"
ok_ge "$(jnum doors "$TMP_DIR/rm_city_geom.json")" "1" "reduce 下楼门照样在（可点可达）"
RM_ANIM="$(rget rm_anim "$E2E_LOG")"
case "$RM_ANIM" in
  none) pass "reduce 下无动画元素在跑（光脉未挂 CSS 动画 = 静态降级）" ;;
  *'|0s'|*'|0.000') pass "reduce 下动画时长为 0（静态降级，$RM_ANIM）" ;;
  *none*|*'none|'*) pass "reduce 下 animation-name=none（静态降级，$RM_ANIM）" ;;
  *) fail "reduce 下仍有动画在跑（$RM_ANIM；N8 要求静态降级）" ;;
esac
ok_if "$(rget rm_pageerrors "$E2E_LOG")" "0" "reduce 上下文零 pageerror / console.error"
ok_has "$(cat "$TUTOR_WORLD")" "prefers-reduced-motion" "世界页含 prefers-reduced-motion 降级段（N8）"
ok_has "$(cat "$WORLD_CSS")" "prefers-reduced-motion" "world.css 含 prefers-reduced-motion 降级段（N8）"
# N8 不逐帧重建 DOM：维度切换是 v-if（挂/摘），不是逐帧改 style
ok_has "$(cat "$TUTOR_WORLD")" 'v-if="dim === ' "三块画布按 v-if 分页（切维度 = 换挂载，非逐帧重建 DOM）"
ok_has "$(cat "$TUTOR_WORLD")" 'v-else-if="dim === ' "分页用 v-if/v-else-if 链收口（同一时刻只挂一张的物理保证）"

# ---------------------------------------------------------------------------
echo
echo "== §10. N9 无回归（维度 A 群峰 / 楼内闭环同一条）=="
ok_ge "$(rget branches_n_again "$E2E_LOG")" "5" "切回维度 A：多峰群山仍在（[data-branch] ≥ 5）"
res_ne "kept_peak" "$E2E_LOG" "" "切回维度 A 仍站在同一座峰上（跨维度不丢当前峰）"
ok_has "$(cat "$TUTOR_WORLD")" "data-branch-depth" "维度 A 纵深子分支热区在册（延续性）"
ok_has "$(cat "$TUTOR_WORLD")" "data-detail-clc" "维度 A 中图法权威展示仍在（W4-b 口径）"
ok_has "$(cat "$TUTOR_PRACTICE")" "export function checkAnswer" "判题口径提成模块级可复用（楼内与练一练同一条判定）"
# 楼内闭环（维度 C 楼门 → 洞内，同一条智学慧眼闭环）
res_ne "city_loop_door" "$E2E_LOG" "" "城区有点得动的楼门（闭环入口）"
if [ "$(rget loop_open "$E2E_LOG")" = "yes" ]; then
  res_eq "loop_open" "$E2E_LOG" "yes" "点楼门即进洞（1 步；≤2 步硬约束）"
  ok_has "$(rget loop_surface "$E2E_LOG")" "study" "楼内主 surface = 学科书房（平面 SVG 而非 3D）"
  ok_has "$(rget loop_stage "$E2E_LOG")" "idle" "洞内闭环起始态 = idle（等一键推进）"
  ok_ge "$(rget loop_seeds "$E2E_LOG")" "1" "洞内灯位 = 该节知识点数（闭环出口）"
  # 洞内灯位三态真源不回归。这里比的是**同一个口径**，不是「恰好碰上有个 dim」——
  # 洞内灯位取的是 `mastery == null ? 'dim' : >= 80 ? 'lit' : 'half'`（CaveScene.vue:326，
  # 与 world.vue 的 kpLightOf、后端 stateFor 逐字对齐），dim 只在**该 KP 从未作答**时出现。
  # 测试账号历年打卡下来，被点开的这一节常常每个 KP 都有作答史 → 实得 half/lit 而无 dim，
  # 那是数据形态，不是实现退化；写死要求 dim 会用账号历史把断言判红。
  # 故断言分两层：
  #   ① 词表收口（不会冒出第四态 / 空态）——这才是「三态真源」四个字的可验部分；
  #   ② dim 的可达性在**房门那层**验（city_door_states 已断言三态全见）：
  #      门与灯位同一口径，门见 dim 即证灯位算得出 dim。
  ok_match "$(rget loop_seed_states "$E2E_LOG")" '^(dim|half|lit)(,(dim|half|lit))*$' "洞内灯位只用三态词表（dim/half/lit；无第四态、无空态）（实得：$(rget loop_seed_states "$E2E_LOG")）"
  ok_has "$(rget city_door_states "$E2E_LOG")" "dim" "楼门三态含「暗门」（dim：未明）"
  res_ne "loop_node" "$E2E_LOG" "" "洞内标题读了真实节点名（不是空）"
  res_has "loop_honest" "$E2E_LOG" "同一条闭环" "洞内诚实口径明写「走的是同一条闭环；楼上楼下不改变掌握度真源」"
else
  skip "楼内闭环：本机无点得动的楼门（数据态所致，非实现问题）"
fi
PAGES=$(find "$TUTOR_DIR/src/pages" -name '*.vue' | wc -l | tr -d ' ')
ok_ge "$PAGES" "19" "19 个页面仍全在册（$PAGES 个，无删页）"

# ---------------------------------------------------------------------------
echo
echo "== §11. 零裸色（改动面三重 grep）=="
COLOR_SCAN="$(grep -nE '#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(' "$TUTOR_WORLD" "$TUTOR_CAVE" "$TUTOR_API" "$SHARED_SRC/art.js" "$WORLD_CSS" 2>/dev/null | grep -vE 'world.css:[0-9]+:\s*\*' | wc -l | tr -d ' ')"
ok_if "$COLOR_SCAN" "0" "world.vue / CaveScene.vue / api / world-art / world.css 无任何色值字面量（N2 零裸色）"
NAMED="$(grep -nE "\s*$NAMED_RE" "$TUTOR_WORLD" "$TUTOR_CAVE" "$WORLD_CSS" 2>/dev/null | wc -l | tr -d ' ')"
NAMED_TOKEN="$(grep -nE "\s*$NAMED_RE" "$TUTOR_WORLD" "$TUTOR_CAVE" "$WORLD_CSS" 2>/dev/null | wc -l | tr -d ' ')"
ok_if "$NAMED" "0" "无具名色（CSS 关键字色 0 处）"
# var(--world-*) 无「用了没声明」
USED_VARS="$(grep -ohE 'var\(--world-[a-z0-9-]+' "$WORLD_CSS" "$TUTOR_WORLD" "$TUTOR_CAVE" "$SHARED_SRC/art.js" 2>/dev/null | sed 's/var(//' | sort -u)"
DECL_VARS="$(grep -oE '^\s*--world-[a-z0-9-]+' "$TOKENS" | tr -d ' ' | sort -u)"
MISSING=""
for v in $USED_VARS; do printf '%s\n' "$DECL_VARS" | grep -qxF -e "$v" || MISSING="$MISSING $v"; done
ok_if "${MISSING:-}" "" "用到的 --world-* 全部在 persona-world.css 有声明（${MISSING:-零缺失}）"
ok_ge "$(printf '%s\n' "$DECL_VARS" | wc -l | tr -d ' ')" "80" "世界令牌仍有完整色源（declared 数）"
EDGE_TONES="$(grep -ohE '^[[:space:]]*--world-edge-(explicit|seq|soft):[^;]*' "$TOKENS" | sed 's/.*://' | tr -d ' ' | sort -u | wc -l | tr -d ' ')"
ok_ge "$EDGE_TONES" "3" "三类边各有独立色值（引导路径不借用显式/序列的色，N5 视觉弱化落到色上）"
# v6 新令牌必须真在令牌文件里（不是散落在 .vue 局部样式里的私有色）
for t in --world-stair-tread --world-stair-riser --world-city-street --world-city-skyline-far --world-city-sign-board; do
  ok_has "$(cat "$TOKENS")" "$t:" "v6 新令牌 $t 在令牌唯一真源 persona-world.css"
done
ok_not_has "$(grep -nE '^\s*--world-[a-z0-9-]+:' "$TUTOR_WORLD" 2>/dev/null | sed 's/:.*//')" "--world-" "world.vue 不私有声明 --world-* 令牌（令牌只在一处真源）"

# ---------------------------------------------------------------------------
echo
echo "== §12. 凭据零泄漏 =="
# 说明：本节自身的检测模式里必然出现「nvapi-」等字样，故扫描时把自己这段（§12→§13）剔掉，
# 只扫「交付实现面」有没有真的把凭据写进去。POSTGRES_PASSWORD= 是容器 env 的「变量名」（非值），
# 脚本只从 `docker inspect` 的 env 里读进变量、从不打印，故不算凭据字面量。
BODY="$(awk '/^echo "== §12\. 凭据零泄漏/{s=1} /^echo "== §13\. 改动范围/{s=0} !s{print}' "$OUT_DIR/w6c-verify.sh")"
LIST_CRED="$(printf '%s\n' "$BODY" | grep -cE '(nvapi-[A-Za-z0-9]{8,}|Bearer [A-Za-z0-9._-]{20,})' | tr -d ' ')"
ok_if "$LIST_CRED" "0" "验收脚本里零凭据字面量（密钥/令牌只引用 env 或容器 env）"
# 交付说明（w6c-file-list.md）由独立复验那一步落盘，本脚本跑时它可能还没生成：
# 缺文件时 grep 输出是空串而非「0」，会让下面两条误红，所以显式给空默认。
FILE_LIST="$OUT_DIR/w6c-file-list.md"
FL_BODY="$([ -f "$FILE_LIST" ] && cat "$FILE_LIST" || true)"
LIST_CRED_MD="$(printf '%s\n' "$FL_BODY" | grep -cE '(nvapi-[A-Za-z0-9]{8,}|Bearer [A-Za-z0-9._-]{20,})')"
LIST_CRED_MD="${LIST_CRED_MD:-0}"
ok_if "$LIST_CRED_MD" "0" "交付说明里零凭据字面量（交付说明未生成时按 0 计：文字面量为零）"
# 正则需要排掉字符串里的空格与双引号。双引号用 \x22 转义而不是字面 "：字面 " 会提前把外层
# "$( ... )" 的双引号闭合掉，整脚本在本行之后不再解析（「跑不到尾部 PASS=/FAIL=」的真因之一）。
CRED_RE='(nvapi-|AUTH_SERVICE_TOKEN=[^ \x22])'
SCRIPT_CRED="$(printf '%s\n' "$BODY" | grep -cE "$CRED_RE" | tr -d ' ')"
ok_if "$SCRIPT_CRED" "0" "脚本不内联任何密钥（口令只从容器 env 读入变量）"
ok_not_has "$(cat "$TUTOR_CAVE")" "nvapi-" "洞内组件不含密钥字面量"
ok_has "$(cat "$OUT_DIR/w6c-verify.sh")" 'E2E_IDENTIFIER:-testuser' "仅用 dev 测试账号，且可被 env 覆盖"
ok_has "$(cat "$OUT_DIR/w6c-verify.sh")" 'E2E_PASSWORD:-test1234' "只用 dev 测试账号口令，且尾部唯一默认值可被 env 覆盖（不打印）"
PW_N="$(printf '%s\n' "$BODY" | grep -cF 'test1234' | tr -d ' ')"
ok_if "$PW_N" "1" "dev 口令字面量全脚本仅一处（只在 env 默认值处，不硬编码进用例）"
PW_MD="$(printf '%s\n' "$FL_BODY" | grep -cF 'test1234')"
PW_MD="${PW_MD:-0}"
ok_if "$PW_MD" "0" "交付说明不落任何口令字面量"

# ---------------------------------------------------------------------------
echo
echo "== §13. 改动范围 =="
STATUS="$(cd "$ROOT_DIR" && git status --porcelain -uall)"
HEAD_NOW="$(cd "$ROOT_DIR" && git rev-parse HEAD)"
ok_if "$HEAD_NOW" "$HEAD_AT_START" "HEAD 未变（本卡零提交：不 commit / 不 checkout；比对脚本启动时记录的 HEAD）"
ok_not_has "$(printf '%s\n' "$STATUS" | awk '{print $2}' | tr '\n' ' ')" "apps/explorer" "apps/explorer 零改动（N4）"
ok_if "$(printf '%s\n' "$STATUS" | awk '$1=="M" && $2 ~ /^services\//{c++} END{print c+0}')" "0" "后端既有文件零修改（N4：只新增只读面，不改既有契约）"
ok_if "$(printf '%s\n' "$STATUS" | awk '$1=="M" && $2 ~ /^packages\// && $2 != "packages/world-art/src/art.js"{c++} END{print c+0}')" "0" "既有包只动了共享画法 art.js（白名单内的世界语言唯一真源，N2 一份画法）"
ok_if "$(cd "$ROOT_DIR" && git diff --cached --name-only | wc -l | tr -d ' ')" "0" "暂存区为空（未 add）"
# 「在册」看的是**本卡的改动集**。它必须跟 `git status` 与「最近一次提交」取并集：
#   工作区有改动时（卡未提交）→ status 就是全集，照旧；
#   已提交后（卡收口、独立复验时）→ status 是空的，只靠它会让这五条**全数假红**
#   （真踩过：提交后复验 FAIL=5，五条都是「未含 xxx；实得『,』」，产品一行没坏）。
# 故这里把 `git show --name-only` 的最近提交文件并进来；提交未含的文件仍由 status 兜住。
# 只并一次（不是全历史）：一旦把全历史都算进来，「越界文件」就永远为空，那条断言会失效。
CHANGED_STATUS="$(printf '%s\n' "$STATUS" | awk '{print $2}' | sort)"
CHANGED_HEAD="$(cd "$ROOT_DIR" && git show --name-only --pretty=format: HEAD 2>/dev/null | sed '/^$/d' | sort)"
CHANGED="$(printf '%s\n%s\n' "$CHANGED_STATUS" "$CHANGED_HEAD" | sed '/^$/d' | sort -u | tr '\n' ',')"
ok_ne "$CHANGED" "" "改动集非空（本卡确实动了文件；status 空且 HEAD 无文件 = 找错仓库/基线）"
# 越界检查仍只看**工作区**（作者这一轮真正在改的），不看 HEAD 并集：
# 越界判的是「有没有动手动到不该动的地方」，并进 HEAD 只会把历史文件也算成越界候选。
# 两条断言的真源不同：在册 = status ∪ HEAD，越界 = status。
CHANGED_WT="$(printf '%s\n' "$CHANGED_STATUS" | sed '/^$/d' | tr '\n' ',')"
# 白名单按 glob 逐项匹配（前缀写法是错的：'*"$f"*' 要求整串出现在清单里）
OUT_OF="$(printf '%s' "$CHANGED_WT" | tr ',' '\n' | sed '/^$/d' | while read -r f; do
  case "$f" in
    apps/web-ai-tutor/src/pages/twin/world.vue|apps/web-ai-tutor/src/components/world/*|apps/web-ai-tutor/src/api/index.js|apps/web-ai-tutor/src/store/practice.js|packages/world-art/src/art.js|styles/world.css|styles/tokens/themes/persona-world.css|docs/SUBJECT_SUMMIT_DESIGN_V6.md|apps/web-ai-tutor/src/__tests__/world-art-city.test.js|apps/web-ai-tutor/vitest.config.ts|.agents/claude/outputs/w6c-verify.sh|.agents/claude/outputs/w6c-file-list.md) continue ;;
    .agents/codex/outputs/*) continue ;;
  esac
  printf '%s\n' "$f"
done | tr '\n' ' ')"
ok_if "$OUT_OF" "" "作者改动全部落在白名单内（越界文件：${OUT_OF:-无}）"
# CaveScene.vue 与 DESIGN_V6 本卡**不修改**（前者是 v5 已验收件，后者已提交）——
# 故这里查「在册」而不是「在改动清单里」：写进 $CHANGED 会让这条永远红。
ok_file "$TUTOR_CAVE" "洞内组件在册（CaveScene.vue；本卡不改它，只经它复跑同一条闭环）"
ok_file "$DESIGN_V6" "设计文档 v6 在册（docs/SUBJECT_SUMMIT_DESIGN_V6.md；本卡前已提交）"
ok_has "$CHANGED" "packages/world-art/src/art.js" "共享画法 art.js 在册（STAIR/CITY 画法原语）"
ok_has "$CHANGED" "styles/tokens/themes/persona-world.css" "令牌真源在册（v6 新令牌）"
ok_has "$CHANGED" "apps/web-ai-tutor/src/pages/twin/world.vue" "世界页在册（本卡主改动面）"
ok_has "$CHANGED" "apps/web-ai-tutor/src/__tests__/world-art-city.test.js" "城区几何回归测试在册（W6-c 两个真崩缺陷的锁）"
ok_has "$CHANGED" "apps/web-ai-tutor/vitest.config.ts" "vitest 别名在册（@world-art → packages/world-art/src，测试解析用）"
ok_has "$(cat "$TUTOR_API")" "getLearningChain" "只读客户端：getLearningChain"
ok_has "$(cat "$TUTOR_API")" "getKpCave" "只读客户端：getKpCave"

# ---------------------------------------------------------------------------
echo
echo "== §14. 未覆盖项（明示，不计 FAIL）=="
skip "运营台侧的城区数据看板：本卡只做学生面（W5-a 数据面不新增运营读面）"
skip "生产 nginx /tutor/ 静态托付下的观感：本卡 E2E 用同源双 App 托管复现同一 origin 与同一令牌在册条件"
skip "TYPE=BOTH 的深色主题：世界令牌沿用单一亮色黎明色域（未新增深色世界色）"
skip "小程序端学习世界：本卡面为 H5（build:h5）；小程序同源构建未在本卡验收范围"
skip "真人触屏手势（双指缩放/横滑画布）：本卡只验点击/键盘可达与 CSS 可滚判定（触控等价性未自动化）"
skip "<use href> 符号复用与 rAF 补间的性能收益：N8 只验「不逐帧重建 DOM」与 reduce 降级（未做帧率采样）"
skip "维度 B「章下钻进卡内层/右侧抽屉」：v6 册卡章展开沿用既有册章详情面（不新做抽屉）"

echo
echo "PASS=$PASS SKIP=$SKIP"
echo "FAIL=$FAIL"
[ "$FAIL" = "0" ] || exit 1
