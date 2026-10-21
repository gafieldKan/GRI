#!/usr/bin/env bash
# ============================================================================
# W6-a 验收：学科登峰 v5「学科城区 · 逛一座会长大的城」（apps/web-ai-tutor 学习世界）
#
# v5 相对 v4 推翻的是**宏观导航的「山/登顶」隐喻**；v4 的三条体验机制整体搬到「城区」：
#   M1 晨雾即未知 → 雾罩住未开门街区（城区沿用，判据不变）
#   M2 光脉传导（魂）→ **道路 = 前置链**：未掌握的点门前仍是连续一条路，只是灯没亮；
#                            打通 → 光顺路流向下一栋楼门（本卡最核心的一条）
#   M3 洞窟即闭环 → **楼门 = 知识点洞口**：点门直达楼内学科书房（主 surface）跑同一条
#                            智学慧眼闭环（讲解→练→判→错题/复习→掌握≥80）→ 出洞亮灯 + 奖励；
#                            岩洞降为楼内**可选地下室**（同一闭环，掌握度真源不变）
#   双维度一根竖轴 → **横 = 年级大道（K12）；纵 = 街区（学科完整体系）**（两个正交方向）
#
# 结构：
#   §0 前置        —— docker 四件套在跑；node/playwright-core/chromium；§0 起工作区后端（W5-a 读面只在工作树）
#   §1 构建        —— build:h5 通过；产物带 v5 令牌 / 几何类 / 数据钩子
#   §2 数据面      —— 只读既有 API：learning-chain（节/知识点/三类边/summary）与 kp-cave（洞内聚合）
#   §3 N2 一份画法 —— v5 画法只在 packages/world-art 一份；共享件零色值；零孤儿类
#   §4 N1 无回归   —— 三维度默认「学科知识体系」；W4-b 多峰/延续性/册章 全在册；19 页全在册
#   §5 M1 晨雾     —— 雾三层 + 雾中轮廓微光 + 曙光；雾只被相邻的光驱散（前沿读数）
#   §6 M2 光脉     —— 大道里程碑 + 店面橱窗三态 + 楼门三态 + 楼间路/楼前街连续（光顺链走）
#   §7 M3 楼门闭环 —— 点楼门 → 楼内书房 → 讲解→练→判 → 掌握≥80 亮灯 → 出洞后链上该节亮、已亮 +1
#   §8 N6 引导四件套 —— ①雾只被相邻光驱散 ②每入口有「下一个最佳目标」呼吸提示 ③洞门/楼门三态 ④答错不罚
#   §9 N9 信息密度 —— 首屏读数 + 城区图例的诚实口径（顺序≠难度 / 半亮≠会了一半 / 地下室同闭环）
#   §10 N5 软边    —— 引导路径虚且淡，且有可读注记「非精确前置」，不画成必修
#   §11 零裸色     —— 改动面三重 grep 空；var(--) 无「用了没声明」
#   §12 凭据零泄漏
#   §13 改动范围   —— HEAD 未变、未 checkout、暂存区空、改动全在白名单内
#   §14 未覆盖项（明示，不计 FAIL）
#
# 依赖：docker（gri-nginx / gri-api / gri-postgres / gri-redis）；前端已 npm install；
#       node + playwright-core + chromium；auth-center 在 3004（令牌校验走 JWKS）。
# 为什么 §0 要自己起后端：W5-a 的 learning-chain / kp-cave 只存在于**工作树源码**，
#   gri-api 容器镜像早于 W5-a（同路径 401/404），故本脚本在 3011 起一份工作区后端给 E2E 用。
# 凭据：仅 dev 测试账号（E2E_IDENTIFIER / E2E_PASSWORD 可覆盖）；脚本不落任何密钥、不打印 token/密码
#       （后端口令只从容器 env 读入变量并注入子进程，绝不出现在输出里）。
# 副作用：§1 写前端 dist（gitignore）；§5–§9 浏览器只读 + **会真实作答**（学生 testuser 的答对记录
#       会写进 edu.answer_records / mastery_snapshots —— 这正是要验的闭环）；截图落 /tmp/w6a-shots。
# 用法：  bash .agents/claude/outputs/w6a-verify.sh
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
TOKENS="$ROOT_DIR/styles/tokens/themes/persona-world.css"
WORLD_CSS="$ROOT_DIR/styles/world.css"
API_DIR="$ROOT_DIR/services/api"
SHOTS="${SHOTS_DIR:-/tmp/w6a-shots}"

E2E_IDENTIFIER="${E2E_IDENTIFIER:-testuser}"
E2E_PASSWORD="${E2E_PASSWORD:-test1234}"
PW_CORE="${PW_CORE:-/home/ubantu/openclaw/node_modules/playwright-core}"
TEST_PORT="${TEST_PORT:-5302}"
API_PORT="${API_PORT:-3011}"

TMP_DIR="${W6A_TMP:-$(mktemp -d /tmp/w6a.XXXXXX)}"   # W6A_TMP=1 → 固定目录，便于排障取证
[ -n "${W6A_TMP:-}" ] && mkdir -p "$TMP_DIR"
# §13 用「开跑时 vs 收尾时」的 HEAD 比对，而不是钉死一个 SHA：
# 钉死的 SHA 每次父分支有新提交就误报（W5-b 提交后本项就红过一次），而真正要守的只是
# **本卡这条验收链路自己没有 commit / checkout**。
HEAD_AT_START="$(cd "$ROOT_DIR" && git rev-parse HEAD)"
SERVER_PID=""
API_PID=""
mkdir -p "$SHOTS"
cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null
  [ -n "$API_PID" ] && kill "$API_PID" 2>/dev/null
  [ -z "${W6A_TMP:-}" ] && rm -rf "$TMP_DIR"
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
res_ge() { ok_ge "$(rget "$1" "$2")" "$3" "$4"; }
res_le() { ok_le "$(rget "$1" "$2")" "$3" "$4"; }
res_ne() { local v; v="$(rget "$1" "$2")"; [ "$v" != "$3" ] && pass "$4" || fail "$4" "（期望「非 $3」，实得「$v」）"; }
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
for t in --world-fog-near --world-fog-far --world-fog-veil --world-dawn-glow --world-light-pulse --world-light-trail --world-light-hint --world-dim-node --world-ridge-glow --world-node-lit --world-node-half --world-node-dim --world-edge-explicit --world-edge-seq --world-edge-soft --world-cave-rock --world-cave-glow-lit; do
  ok_has "$TUTOR_CSS" "$t" "产物已带 v4 令牌：$t"
done
for c in .w-fog-near .w-fog-far .w-fog-veil .w-ridge-glow .w-dawn-glow .w-light-trail .w-light-pulse .w-light-hint .w-node-lit .w-node-half .w-node-dim .w-node-halo-lit .w-edge-explicit .w-edge-seq .w-edge-soft .w-cave-rock .w-cave-glow-lit; do
  ok_has "$TUTOR_CSS" "$c" "产物已带 v4 几何类映射：$c"
done
for h in data-v4-strip data-lit-count data-next-target data-frontier data-grade-door data-band-door data-band-sub data-cave-state data-cave-next data-cave-scene data-cave-lit; do
  ok_has "$TUTOR_JS" "$h" "产物已带 v4 数据钩子：$h"
done
# W4-b 既有分片不许掉（N1 无回归）
for h in data-dim-toggle data-branch-depth data-book data-camp-detail data-detail-clc; do
  ok_has "$TUTOR_JS" "$h" "产物仍带 W4-b 钩子（无回归）：$h"
done

# ---------------------------------------------------------------------------
echo
echo "== §2. 数据面（只读既有 API，未改后端）=="
if [ "$API_UP" = 1 ]; then
  CH="$TMP_DIR/chain.json"
  curl -s "http://127.0.0.1:$API_PORT/api/curriculum/learning-chain?subject=MATH&branch=math.num" -o "$CH"
  ok_has "$(head -c 60 "$CH")" '"nodes"' "learning-chain 公开可读（匿名出结构）"
  ok_ge "$(jq_n "$CH" nodes)" "100" "一分支的节规模（整支返回，端上按年级分段；N11）"
  ok_if "$(jq_n "$CH" summary.total)" "$(jq_n "$CH" nodes)" "summary.total = 节数（读数与列表同真源）"
  ok_if "$(jq_n "$CH" summary.lit)" "0" "匿名读无个人掌握度（lit=0，不臆造）"
  ok_has "$(jq_n "$CH" summary.next)" "math." "summary.next 给出「下一个最佳目标」（N6② 的真源）"
  ok_ge "$(node -e 'const d=require(process.argv[1]);console.log((((d.nodes||[])[0]||{}).kps||[]).length)' "$CH" 2>/dev/null)" "2" "节含知识点（洞内闭环的灯位）"
  ok_has "$(node -e 'const d=require(process.argv[1]);const s=new Set(d.edges.map(e=>e.kind));console.log([...s].sort().join(","))' "$CH")" "explicit" "边含显式前置（kind=explicit）"
  ok_has "$(node -e 'const d=require(process.argv[1]);const s=new Set(d.edges.map(e=>e.kind));console.log([...s].sort().join(","))' "$CH")" "seq" "边含课程序列（kind=seq）"
  ok_has "$(node -e 'const d=require(process.argv[1]);const s=new Set(d.edges.map(e=>e.kind));console.log([...s].sort().join(","))' "$CH")" "soft" "边含引导路径（kind=soft；N5 要把它画淡且注明）"
  ok_if "$(node -e 'const d=require(process.argv[1]);const m=new Map();for(const x of d.nodes||[]){for(const k of x.kps||[])m.set(k.code,x.code)}let c=0;for(const e of d.edges||[]){const a=m.get(e.from),b=m.get(e.to);if(a&&b&&a!==b&&e.kind==="explicit")c+=1}console.log(c)' "$CH" 2>/dev/null)" "0" "显式前置全部落在同一节内（跨节 0：节级不叠三线，避免把一节课的前后关系画成必修链）"
  ok_if "$(node -e 'const d=require(process.argv[1]);const m=new Map(),g=new Map();for(const x of d.nodes||[]){g.set(x.code,x.grade);for(const k of x.kps||[])m.set(k.code,x.code)}let all=0,cross=0;for(const e of d.edges||[]){if(e.kind!=="soft")continue;const a=m.get(e.from),b=m.get(e.to);if(!a||!b||a===b)continue;all+=1;if(g.get(a)!==g.get(b))cross+=1}console.log(all>0&&all===cross?"yes":"no")' "$CH" 2>/dev/null)" "yes" "引导路径全部跨年级（节带单年级内画不出 → 端上另以最淡虚线旁支露出，N5）"
  CG="$TMP_DIR/chain.g1.json"
  curl -s "http://127.0.0.1:$API_PORT/api/curriculum/learning-chain?subject=MATH&grade=G1" -o "$CG"
  ok_ge "$(jq_n "$CG" nodes)" "10" "learning-chain 支持按年级收窄（端上分段取数的回退路径）"
  KPL="$TMP_DIR/kp.json"
  curl -s "http://127.0.0.1:$API_PORT/api/curriculum/knowledge-points?subject=MATH&gradeLevel=1" -o "$KPL"
  KPID="$(node -e 'const d=require(process.argv[1]);const a=Array.isArray(d)?d:(d.items||[]);console.log(a[1]&&a[1].id||"")' "$KPL" 2>/dev/null)"
  ok_has "$KPID" "-" "知识点列表可取（洞内灯位映射 code→id 的真源）"
  if [ -n "$KPID" ]; then
    CV="$TMP_DIR/cave.json"
    curl -s "http://127.0.0.1:$API_PORT/api/curriculum/kp-cave?kpId=$KPID" -o "$CV"
    ok_has "$(cat "$CV")" '"questions"' "kp-cave 公开可读（洞内聚合：题入口）"
    for k in kp state prerequisites questions next; do
      ok_has "$(cat "$CV")" "\"$k\"" "kp-cave 含字段：$k"
    done
    ok_ge "$(jq_n "$CV" questions.total)" "1" "kp-cave 给出该知识点的题量（洞内练一练有题可出）"
    ok_not_has "$(cat "$CV")" '"mastery"' "匿名读不臆造掌握度（登录后才叠加）"
    ok_if "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$API_PORT/api/curriculum/kp-cave?kpId=00000000-0000-0000-0000-000000000000")" "404" "kp-cave 对不存在的知识点 404（不兜假数据）"
  fi
  ok_if "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$API_PORT/api/curriculum/summit-branches?subject=MATH")" "200" "W4-a 读面仍可用（N1 无回归）"
else
  skip "数据面：工作区后端未起，跳过（§0 已 FAIL）"
fi

# ---------------------------------------------------------------------------
echo
echo "== §3. N2 一份画法（共享件，禁止两套）=="
for f in fogPuff fogBank ridgeGlow lightBeam lightHint caveDoor caveNode caveEdge caveScene caveSeed deriveLightState edgeToneClass edgeKindWord lightProgress doorStateWord caveTrailLayout; do
  ok_has "$(cat "$SHARED_ART")" "export function $f" "v4 画法来自共享件（函数）：$f"
done
for f in LIGHT_STATES CAVE_BAND; do
  ok_has "$(cat "$SHARED_ART")" "export const $f" "v4 画法来自共享件（常量表）：$f"
done
DEFS="$(grep -rn "export function fogPuff\|export function fogBank\|export function ridgeGlow\|export function lightBeam\|export function caveScene\|export function caveDoor\|export function caveSeed" "$ROOT_DIR/apps" "$ROOT_DIR/packages" --include=*.js --include=*.vue 2>/dev/null | sed "s#^$ROOT_DIR/##" | cut -d: -f1 | sort -u | tr '\n' ' ')"
ok_set "$DEFS" "packages/world-art/src/art.js " "v4 画法原语只有一份（雾/光/洞 仅在共享件定义）"
SECOND="$(grep -cE "function (fogPuff|fogBank|ridgeGlow|lightBeam|caveScene|caveDoor|caveSeed)" "$TUTOR_WORLD" "$TUTOR_CAVE" 2>/dev/null | awk -F: '{s+=$2} END{print s+0}')"
ok_if "$SECOND" "0" "页面与洞内组件零画法实现（只排布与状态，不另画一套）"
ok_has "$(cat "$TUTOR_WORLD")" "from '@world-art'" "world.vue 从共享件引入（不是各写一套）"
ok_has "$(cat "$TUTOR_CAVE")" "from '@world-art'" "CaveScene 从共享件引入（洞内同一套画法）"
ART_COLOR="$(grep -nE '#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(' "$SHARED_SRC" 2>/dev/null | wc -l | tr -d ' ')"
ok_if "$ART_COLOR" "0" "共享件零色值（几何层即成立；N2）"
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
' "$SHARED_ART" "$SHARED_SRC/WorldShell.vue" "$TUTOR_WORLD" "$TUTOR_CAVE" > "$ORPHAN_JSON" 2>/dev/null )
ORPHAN="$(node -e 'console.log(require(process.argv[1]).orphan.join(","))' "$ORPHAN_JSON" 2>/dev/null)"
ORPHAN_USED="$(node -e 'console.log(require(process.argv[1]).used)' "$ORPHAN_JSON" 2>/dev/null)"
ORPHAN_DECL="$(node -e 'console.log(require(process.argv[1]).declared)' "$ORPHAN_JSON" 2>/dev/null)"
ok_if "$ORPHAN" "" "登峰+洞内用的 $ORPHAN_USED 个几何类全部在同一份映射里有取值（$ORPHAN_DECL 条规则，零孤儿 = 同一套世界语言）"

# 上面两条 grep 都看不见**模板字符串**里的类名：art.js 的 block(x,y,w,d,h,tone) 是
# `c: `${tone}-left`` 这种拼法，`storefront()` 传 'w-storefront' 进去，静态扫描既看不到 left/right，
# 也就查不出「声明了却没人发」。故补一条**运行时**腿：真调画法函数，把它实际 emit 的类收集起来，
# 与 world.css 对账。这一腿同时兜住两个方向（发了没声明 / 声明了没发），
# 也是唯一能证明「店面的三面墙真的画出来了」的办法（不数 DOM，数几何源）。
RUNTIME_CLS="$TMP_DIR/runtime-classes.json"
cat > "$TMP_DIR/runtime-classes.mjs" <<'JSEOF'
import { readFileSync, writeFileSync } from "node:fs"
// argv 序（host: `node script.mjs "$RUNTIME_CLS" "$ROOT_DIR"`）：
//   argv[1]=脚本自身、argv[2]=输出 json 路径、argv[3]=仓库根。
// 写成 argv[1] 收 / argv[2] 读会把 **json 写到 .mjs 自己头上**、拿 json 路径当根目录，
// 表象是「ENOENT: <json路径>//packages/...」——一眼看以为是路径少斜杠，其实是下标反了。
const OUT = process.argv[2] || ""
const ROOT = (process.argv[3] || "").replace(/\/?$/, "/")
const { storefront, gradeAvenue, lifeScene, caveScene, basementHatch, roadSegment, barricade } =
  await import(ROOT + "/packages/world-art/src/art.js")
const seen = new Map()
const add = (prims, from) => {
  const list = Array.isArray(prims) ? prims : (prims && typeof prims === 'object' ? Object.values(prims) : [])
  for (const p of list) if (p && p.c) seen.set(from + "|" + p.c, true)
}
let n = 0
const A = { x: 120, y: 200 }, B = { x: 300, y: 200 }
for (const st of ["dim", "half", "lit"]) {
  add(storefront(120, 160, 132, 108, st), "storefront:" + st); n++
  // roadSegment(a, b, kind) 收 {x,y} 两点、回 {wide, core}（不是数组）——add() 两种都吃
  for (const k of ["seq", "explicit", "soft"]) { add(roadSegment(A, B, k), "road:" + k); n++ }
}
add(lifeScene(900, 520, "study"), "lifeScene"); n++
add(caveScene(900, 520), "caveScene"); n++
add(basementHatch(60, 60), "basementHatch"); n++
// barricade（施工围挡）按施工计划属 **P2**（道路通断的负面态），本卡 P1 只立骨架：
// 页面还没接它，但它已在 art.js 与世界 CSS 里就位。这里仍调一次，证明它自己画得出来。
add(barricade(120, 200, 132), "barricade"); n++
// marks 形状与 world.vue 的 avenueMarks 同源：{g, x, short}
add(gradeAvenue(0, 1480, 430, [{ g: 1, x: 100, short: "G1" }, { g: 7, x: 900, short: "G7" }]), "gradeAvenue"); n++
const css = readFileSync(ROOT + "styles/world.css", "utf8")
const declared = new Set([...css.matchAll(/\.(w-[a-z0-9-]+)/g)].map((m) => m[1]))
const emitted = new Set()
for (const k of seen.keys()) emitted.add(k.split("|")[1])
const undeclared = [...emitted].filter((c) => !declared.has(c) && ![...declared].some((d) => d.startsWith(c + "-"))).sort()
// 本卡新增的类必须真的被发出来（否则就是白声明；block() 的模板拼法 grep 看不见）
// 注意：barricade-* 三个类是 P2 的（页面还没接），单独一条断言说明「画法在、接线在 P2」，
// 不混进「每个都接入页面」那条里充数。
const mine = ["w-storefront-left", "w-storefront-right", "w-storefront-top", "w-storefront-lit", "w-storefront-dark",
  "w-road", "w-road-dash", "w-road-edge", "w-curb", "w-room-wall-1", "w-room-wall-2", "w-room-wall-3",
  "w-room-floor", "w-room-rug", "w-room-window", "w-room-rug-plain"]
const p2only = ["w-barricade-a", "w-barricade-b", "w-barricade-lamp"]
const dead = mine.filter((c) => !emitted.has(c)).sort()
const p2dead = p2only.filter((c) => !emitted.has(c)).sort()
writeFileSync(OUT, JSON.stringify({ calls: n, emitted: [...emitted].sort(), undeclared, dead, p2dead }))
JSEOF
( cd "$ROOT_DIR" && node "$TMP_DIR/runtime-classes.mjs" "$RUNTIME_CLS" "$ROOT_DIR" ) >"$TMP_DIR/runtime-classes.log" 2>&1
# 上面这段若崩了（语法错 / require 在 ESM 里不可用 / 路径错），json 不会生成，
# 而 rget 读空 = 空字符串 = 「零 undeclared / 零 dead」= 两条断言**假绿**。
# 所以先断「json 真的生成且非空」，再读它的字段。
ok_file "$RUNTIME_CLS" "运行时几何类对账真的跑出了 json（没跑出来时下面两条会是假绿）"
RT_CALLS="$(node -e 'console.log(require(process.argv[1]).calls||0)' "$RUNTIME_CLS" 2>/dev/null)"
ok_ge "$RT_CALLS" "17" "运行时几何类对账真的调用了画法函数（$RT_CALLS 次 ≥ 17：店面三态 ×3 + 三类路 ×3 + 书房 + 岩洞 + 地下室 + 围挡 + 大道）"
RT_UNDECL="$(node -e 'console.log((require(process.argv[1]).undeclared||[]).join(","))' "$RUNTIME_CLS" 2>/dev/null)"
RT_DEAD="$(node -e 'console.log((require(process.argv[1]).dead||[]).join(","))' "$RUNTIME_CLS" 2>/dev/null)"
RT_P2DEAD="$(node -e 'console.log((require(process.argv[1]).p2dead||[]).join(","))' "$RUNTIME_CLS" 2>/dev/null)"
ok_if "$RT_UNDECL" "" "运行时实测：本卡画法函数 emit 的几何类全部在同一份映射里有取值（含 block() 模板拼出来的类）"
ok_if "$RT_DEAD" "" "运行时实测：本卡新增的 16 个类**每一个都真的被发出来**（店面三面墙 / 路 / 书房，零白声明）"
# P2 的施工围档：画法与映射都已就位，页面接线按施工计划排在下一期。这里只证明「画得出来」，
# 不断言「页面上在画」——否则就是把未交付说成已交付。
ok_if "$RT_P2DEAD" "" "P2 的施工围挡画法已就位并画得出来（页面接线在下一期，本卡不断言它已上路）"

# ---------------------------------------------------------------------------
echo
echo "== §4. N1 无回归（双维度与 W4-b 全部在册）=="
W="$(cat "$TUTOR_WORLD")"
ok_has "$W" "学科知识体系" "维度 A 命名 = 学科知识体系"
ok_has "$W" "K12 阶段" "维度 B 命名 = K12 阶段"
ok_has "$W" "const dim = ref('branches')" "默认维度 = 学科知识体系（N1 不许回归）"
ok_has "$W" "data-dim-toggle" "维度切换器带定位钩子"
ok_has "$W" "keptBranch" "跨维度保留「当前峰」（切走再切回不丢）"
ok_not_has "$W" "location.reload" "切维度不整页重载"
ok_has "$W" "data-branch-depth" "W4-b 纵深子分支仍在"
ok_has "$W" "data-book" "W4-b 人教版册仍在"
ok_has "$W" "data-cross-book" "W4-b 跨册延续仍在"
ok_has "$W" "data-detail-clc" "W4-b 中图法权威展示仍在"
ok_not_has "$W" "加成前置" "不新增「加成前置」这类易误导的边名"
PAGES=$(find "$TUTOR_DIR/src/pages" -name '*.vue' | wc -l | tr -d ' ')
ok_ge "$PAGES" "19" "19 个页面仍全在册（$PAGES 个，无删页）"
ok_has "$(cat "$TUTOR_PRACTICE")" "export function checkAnswer" "判题口径提成模块级可复用（洞内与练一练同一条判定）"

# ---------------------------------------------------------------------------
echo
echo "== §5–§9. 真浏览器 E2E（学生身份 · 同源双 App 托管 · 真作答）=="
cat > "$TMP_DIR/serve.cjs" <<'NODEEOF'
const http = require('http'), https = require('https'), fs = require('fs'), path = require('path')
const PORTAL_DIST = process.argv[2], TUTOR_DIST = process.argv[3], PORT = Number(process.argv[4])
const API_UP = process.argv[5] || 'http://127.0.0.1:3011'
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
const PORTAL = process.argv[2]
const TUTOR = process.argv[3]
const SHOTS = process.argv[4]
const USER = process.env.E2E_IDENTIFIER
const PASS = process.env.E2E_PASSWORD
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

;(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] })
  const ctx = await browser.newContext({ viewport: { width: 1480, height: 1060 }, ignoreHTTPSErrors: true })
  const page = await ctx.newPage()
  watch(page, 'flow')
  await login(page)
  await enterSummit(page)
  await page.evaluate(INJECT)

  // ── §4 N1 维度（E2E 侧）──
  emit('dim_opts', (await all(page, '[data-dim]', 'data-dim')).join(','))
  emit('dim_default', await page.$eval('[data-dim-active="yes"]', (e) => e.getAttribute('data-dim')).catch(() => ''))
  emit('subject_active', await page.$eval('[data-subject-active="yes"]', (e) => e.getAttribute('data-subject')).catch(() => ''))
  emit('branches', await cnt(page, '[data-branch]'))

  // ── §9 N9 首屏信息密度：一排 v4 读数 ──
  emit('strip', await has(page, '[data-v4-strip]'))
  emit('strip_text', (await t(page, '[data-v4-strip]')).replace(/\n/g, ' · '))
  emit('lit_text', (await t(page, '[data-lit-count]')).replace(/\n/g, ' '))
  emit('next_text', (await t(page, '[data-next-target]')).replace(/\n/g, ' '))
  emit('frontier_text', (await t(page, '[data-frontier]')).replace(/\n/g, ' '))
  emit('door_text', (await t(page, '[data-door-word]')).replace(/\n/g, ' '))
  emit('map_axis_n', await cnt(page, '[data-map] .w-axis-label'))
  emit('map_note', String(await tc(page, '[data-map] .w-map-note')).trim().slice(0, 80))
  emit('me_line', await has(page, '[data-map] .w-me-line'))
  emit('me_label', String(await tc(page, '[data-map] .w-me-label')).trim())

  // ── §5 M1 晨雾：三层雾 + 雾中轮廓微光 + 曙光；雾只被相邻的光驱散（前沿读数）──
  emit('fog_near', await cnt(page, '[data-map] .w-fog-near'))
  emit('fog_far', await cnt(page, '[data-map] .w-fog-far'))
  emit('fog_veil', await cnt(page, '[data-map] .w-fog-veil, [data-map] .w-gg-fog'))
  emit('ridge_glow', await cnt(page, '[data-map] .w-ridge-glow'))
  emit('dawn_glow', await cnt(page, '[data-map] .w-dawn-glow, [data-map] .w-gg-dawn'))

  // ── §6 M2 光脉：行进束 + 下一目标呼吸光（骨架层）──
  emit('light_pulse', await cnt(page, '[data-map] .w-light-pulse'))
  emit('light_hint', await cnt(page, '[data-map] .w-light-hint'))
  emit('light_trail', await cnt(page, '[data-map] .w-light-trail'))
  await page.screenshot({ path: SHOTS + '/01-world-strip.png' })

  // ── 洞门（年级海拔上的洞门三态）──
  emit('grade_doors', await cnt(page, '[data-grade-door]'))
  emit('grade_door_states', [...new Set(await all(page, '[data-grade-door]', 'data-door-state'))].sort().join(','))

  // ── §6 M2 光脉：洞位三态与三类边（都画在「节洞带」里）──
  await clickHot(page, '[data-grade-door]')
  await page.waitForSelector('[data-band]', { timeout: 20000 })
  await page.waitForTimeout(600)
  emit('band_node_lit', await cnt(page, '[data-band] .w-node-lit'))
  emit('band_node_half', await cnt(page, '[data-band] .w-node-half'))
  emit('band_node_dim', await cnt(page, '[data-band] .w-node-dim'))
  emit('band_halo_lit', await cnt(page, '[data-band] .w-node-halo-lit'))
  emit('band_edge_explicit', await cnt(page, '[data-band] .w-edge-explicit'))
  emit('band_edge_seq', await cnt(page, '[data-band] .w-edge-seq'))
  emit('band_edge_soft', await cnt(page, '[data-band] .w-edge-soft'))
  emit('band_light_pulse', await cnt(page, '[data-band] .w-light-pulse'))
  emit('band_nodes', await cnt(page, '[data-band] [data-cave]'))
  emit('band_node_states', [...new Set(await all(page, '[data-band] [data-cave]', 'data-cave-state'))].sort().join(','))
  await page.screenshot({ path: SHOTS + '/02-band.png' })

  // ── §6 v5 学科城区：切第三维度 → 大道 / 一间店 / 楼门一条街 ──
  await clickHot(page, '[data-dim="district"]')
  await page.waitForFunction(() => document.querySelector('[data-dim-active="yes"]') && document.querySelector('[data-dim-active="yes"]').getAttribute('data-dim') === 'district', { timeout: 20000 })
  await page.waitForTimeout(1800)
  emit('dim_district_on', await page.$eval('[data-dim-active="yes"]', (e) => e.getAttribute('data-dim')).catch(() => ''))
  // data-dim-current 挂在 .map-scene 外层（world.vue:126），不在 [data-map] 自身上
  emit('district_map', await page.$eval('.map-scene', (e) => e.getAttribute('data-dim-current')).catch(() => ''))
  emit('district_blocked', await page.$eval('[data-district-empty]', (e) => e.getAttribute('data-district-empty')).catch(() => 'no'))
  emit('avenue_marks', await cnt(page, '[data-avenue-mark]'))
  emit('avenue_mark_list', (await all(page, '[data-avenue-mark]', 'data-avenue-mark')).join(','))
  emit('shops', await cnt(page, '[data-storefront]'))
  emit('shop_states', [...new Set(await all(page, '[data-storefront]', 'data-storefront-state'))].sort().join(','))
  emit('road_wide', await cnt(page, '[data-map] .w-edge-seq'))
  emit('road_dash', await cnt(page, '[data-map] .w-road-dash'))
  emit('kp_doors', await cnt(page, '[data-kp-door]'))
  emit('kp_door_states', [...new Set(await all(page, '[data-kp-door]', 'data-kp-state'))].sort().join(','))
  emit('legend_text', String((await t(page, '.map-legend')).replace(/\n/g, ' · ')).slice(0, 460))
  emit('legend_order', await has(page, '[data-legend-order]'))
  emit('legend_half', await has(page, '[data-legend-half]'))
  emit('legend_basement', await has(page, '[data-legend-basement]'))
  await page.screenshot({ path: SHOTS + '/01-avenue.png' })

  // —— 楼前一条街的连续性：相邻门「锚点」间距一致（= CAVE_BAND.nodeW，同一排布函数同一常量）——
  // 量的是门中心而不是 left：门盒定宽但 .hot 是 translate(-50%,-50%，left = 中心 − 宽/2，
  // 而门上 label 有截断（ellipsis）会让整盒宽度仍然 92px —— 取中心就完全绕开宽度噪声。
  const kpGeom = await page.evaluate(() => {
    const els = [...document.querySelectorAll('[data-kp-door]')].map((e) => e.getBoundingClientRect())
    const centers = els.map((r) => r.left + r.width / 2).sort((a, b) => a - b)
    const gaps = centers.slice(1).map((x, i) => Math.round(x - centers[i]))
    const order = [...document.querySelectorAll('[data-kp-door]')].map((e) => e.getAttribute('data-kp-door'))
    return { n: els.length, codes: order, gaps }
  })
  emit('kp_path_n', kpGeom.n)
  emit('kp_path_codes', kpGeom.codes.join(','))
  emit('kp_path_gaps', kpGeom.gaps.join(','))
  emit('kp_path_contiguous', kpGeom.gaps.length && kpGeom.gaps.every((g) => Math.abs(g - kpGeom.gaps[0]) <= 2) ? 'yes' : 'no')

  // ── §5–§9 主链路之前，先把维度切回「学科知识体系」取房型闭环的目标节（默认维度不许回归）──
  await clickHot(page, '[data-dim="branches"]')
  await page.waitForTimeout(900)

  // ── 选一个「从未作答」的节：答完整节必亮（掌握度真源 = mastery_snapshots）──
  const plan = await page.evaluate(async () => {
    const j = window.__j
    const chain = await j('/api/curriculum/learning-chain?subject=math&branch=math.num')
    const before = chain.summary
    const diag = await j('/api/agent/me/diagnosis')
    const dirty = new Set(((diag || {}).knowledgePoints || []).filter((k) => (k.attempts || 0) > 0).map((k) => k.kpId))
    for (const n of (chain.nodes || []).filter((x) => x.state !== 'lit' && (x.kps || []).length > 1).slice(0, 60)) {
      const gl = Number(String(n.grade).replace('G', ''))
      const list = await j('/api/curriculum/knowledge-points?subject=math&gradeLevel=' + gl)
      const arr = Array.isArray(list) ? list : (list.items || [])
      const kps = n.kps.map((k) => ({ code: k.code, name: k.name, id: (arr.find((x) => x.code === k.code) || {}).id }))
      if (kps.some((k) => !k.id || dirty.has(k.id))) continue
      // 每个灯位都要有题可练——否则整节闭环走不完整（题空态是产品兜底，不是本用例要验的）
      let allHaveQ = true
      for (const k of kps) {
        const ql = await j('/api/curriculum/knowledge-points/' + k.id + '/questions?limit=1')
        const qa = Array.isArray(ql) ? ql : (ql && ql.items) || []
        if (!qa.length) { allHaveQ = false; break }
      }
      if (!allHaveQ) continue
      return { before, target: n.code, grade: n.grade, kps }
    }
    return { before, none: true }
  })
  emit('cave_plan_ok', plan.none ? 'no' : 'yes')
  emit('cave_target', plan.target || '')
  emit('lit_before', plan.before ? plan.before.lit : '')
  if (plan.none) { note('没有「全干净」的节可选 —— 洞内闭环用例跳过'); emit('cave_skipped', 'yes') }
  else {
    emit('cave_skipped', 'no')
    // ── 旧维度零回归（V5-N1）：同一套 §6/§10 判据在「节洞带」上仍逐字成立 ──
    await clickHot(page, '[data-dim="branches"]')
    await page.waitForTimeout(900)
    await clickHot(page, '[data-grade-door="' + plan.grade + '"]')
    await page.waitForSelector('[data-band]', { timeout: 20000 })
    await page.waitForSelector('[data-cave="' + plan.target + '"]', { timeout: 20000 })
    // §9 册章归属 + 洞带读数（信息密度）
    emit('band_text', (await t(page, '[data-band-sub]')).replace(/\n/g, ' · '))
    emit('band_nodes', await cnt(page, '[data-band] .band-node, [data-band] [data-cave]'))
    emit('cave_nodes_states', [...new Set(await all(page, '[data-band] [data-cave]', 'data-cave-state'))].sort().join(','))
    emit('band_legend', (await t(page, '.band-legend')).replace(/\n/g, ' · '))
    emit('legend_soft_line', await has(page, '.band-legend .bl-line.is-soft'))
    // N5：三档线的「视觉强弱」是可断言的——显式/序列实线，引导路径虚线（更弱）
    const toneOf = (sel) => page.$eval(sel, (e) => {
      const s = getComputedStyle(e)
      return 'style=' + s.borderTopStyle + ';w=' + s.borderTopWidth
    }).catch(() => '')
    emit('legend_tone_explicit', await toneOf('.band-legend .bl-line.is-explicit'))
    emit('legend_tone_seq', await toneOf('.band-legend .bl-line.is-seq'))
    emit('legend_tone_soft', await toneOf('.band-legend .bl-line.is-soft'))
    emit('node_before_state', await page.getAttribute('[data-cave="' + plan.target + '"]', 'data-cave-state'))
    // 「未亮」= dim|half（半亮是光脉已流到的后继，正是 M2 传导的证据）
    emit('node_before_notlit', ['dim', 'half'].includes(await page.getAttribute('[data-cave="' + plan.target + '"]', 'data-cave-state')) ? 'yes' : 'no')
    await page.screenshot({ path: SHOTS + '/02-band.png' })

    // ── §7 v5 入口：切到「学科城区」→ 点一间店 → 点楼门（= 知识点洞口）进楼（≤2 步）──
    await clickHot(page, '[data-dim="district"]')
    await page.waitForTimeout(1600)
    emit('district_open_again', await page.$eval('[data-dim-active="yes"]', (e) => e.getAttribute('data-dim')).catch(() => ''))
    emit('district_shop_for_target', await has(page, '[data-storefront="' + plan.target + '"]'))
    await clickHot(page, '[data-storefront="' + plan.target + '"]')
    await page.waitForTimeout(900)
    emit('kp_door_for_kp', await has(page, '[data-kp-door="' + plan.kps[0].code + '"]'))
    emit('legacy_band_selector', await has(page, '[data-cave="' + plan.target + '"]'))
    emit('legacy_grade_door', await has(page, '[data-grade-door]'))
    await page.screenshot({ path: SHOTS + '/02-kp-path.png' })

    // ── §7 进楼（楼门 = 知识点洞口）：直接进，无「年级洞门 / 节洞带」两层中转 ──
    await clickHot(page, '[data-kp-door="' + plan.kps[0].code + '"]')
    await page.waitForSelector('[data-cave-scene]', { timeout: 20000 })
    await page.evaluate(INJECT)
    emit('cave_open', 'yes')
    emit('cave_svg', await has(page, '[data-cave-scene-svg]'))
    emit('room_scene', await page.$eval('[data-cave-surface]', (e) => e.getAttribute('data-cave-surface-state')).catch(() => ''))
    emit('room_floor', await cnt(page, '[data-cave-scene-svg] .w-room-floor'))
    emit('room_wall', await cnt(page, '[data-cave-scene-svg] .w-room-wall-1, [data-cave-scene-svg] .w-room-wall-2, [data-cave-scene-svg] .w-room-wall-3'))
    emit('basement_btn', await has(page, '[data-cave-basement]'))
    emit('basement_note', String((await t(page, '.cs-honest')).trim()))
    // §9 城区图例的诚实口径（逐字，设计文档 §4）
    emit('legend_text2', String((await t(page, '.map-legend')).replace(/\n/g, ' · ')).slice(0, 460))
    emit('legend_order2', await has(page, '[data-legend-order]'))
    emit('legend_half2', await has(page, '[data-legend-half]'))
    emit('legend_basement2', await has(page, '[data-legend-basement]'))
    emit('cave_door0', await page.getAttribute('[data-cave-door-state]', 'data-cave-door-state'))
    emit('cave_door0_notlit', (await page.getAttribute('[data-cave-door-state]', 'data-cave-door-state')) === 'lit' ? 'no' : 'yes')
    emit('cave_seeds', await cnt(page, '.kp-seed'))
    emit('cave_seed_states', [...new Set(await all(page, '.kp-seed', 'data-cave-kp-state'))].sort().join(','))
    emit('cave_stage0', await page.getAttribute('[data-cave-loop]', 'data-cave-stage'))
    await page.screenshot({ path: SHOTS + '/03-room-idle.png' })

    // ── §7 地下室（可选 surface）：同一闭环，只换观感 ──
    await clickHot(page, '[data-cave-basement]')
    // 等 data-cave-surface-state 真的变成 cave 再数画法：scenePrims 是 computed，
    // 点完下一帧才重算；早数会拿到书房那批类（上一轮就是这样误判成 1 的）。
    await page.waitForFunction(() => { const e = document.querySelector('[data-cave-surface]'); return e && e.getAttribute('data-cave-surface-state') === 'cave' }, { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(1200)
    emit('basement_open', await page.$eval('[data-cave-surface]', (e) => e.getAttribute('data-cave-surface-state')).catch(() => ''))
    // 地下室是不是岩洞画法：caveScene 的岩壁三环（w-cave-wall-1/2/3，art.js:912–914）
    // 计数按 caveScene 真实词汇，不猜；并同时证明「真的换了表面」——书房的三面退晕墙与地板消失。
    emit('basement_rock', await cnt(page, '[data-cave-scene-svg] .w-cave-wall-1, [data-cave-scene-svg] .w-cave-wall-2, [data-cave-scene-svg] .w-cave-wall-3'))
    emit('basement_room_gone', await cnt(page, '[data-cave-scene-svg] .w-room-wall-1, [data-cave-scene-svg] .w-room-wall-2, [data-cave-scene-svg] .w-room-wall-3') === 0 ? 'yes' : 'no')
    await page.screenshot({ path: SHOTS + '/04-basement.png' })
    // 回楼上：闭环继续（掌握度真源不变）
    await clickHot(page, '[data-cave-basement]')
    await page.waitForTimeout(1000)
    emit('basement_back', await page.$eval('[data-cave-surface]', (e) => e.getAttribute('data-cave-surface-state')).catch(() => ''))

    // ── §7/§6 逐灯位跑闭环：讲解 → 练一练 → 答对（干净知识点答对即 100 → 亮）──
    let allCorrect = 'yes', allReached = 'yes'
    for (let i = 0; i < plan.kps.length; i++) {
      const kp = plan.kps[i]
      await clickHot(page, '[data-cave-kp="' + kp.code + '"]')
      await page.waitForTimeout(700)
      await clickHot(page, '[data-cave-start]')
      await page.waitForSelector('[data-cave-stage="teach"]', { timeout: 20000 })
      emit('cave_teach_' + i, (await t(page, '[data-cave-teach]')).replace(/\n/g, ' · ').slice(0, 120))
      await clickHot(page, '[data-cave-drill]')
      await page.waitForSelector('[data-cave-stage="drill"]', { timeout: 20000 })
      emit('cave_q_' + i, String(await tc(page, '[data-cave-question]')).trim().slice(0, 80))
      emit('cave_opt_' + i, (await all(page, '[data-cave-opt]', 'data-cave-opt')).join(','))
      // 从题库取正确答案（与练一练同一题库，公开读），按渲染题面匹配
      const picked = await page.evaluate(async (kpId) => {
        const j = window.__j
        const qs = await j('/api/curriculum/knowledge-points/' + kpId + '/questions?limit=10')
        const arr = Array.isArray(qs) ? qs : (qs && qs.items) || []
        const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, '')
        const shown = norm(document.querySelector('[data-cave-question]') && document.querySelector('[data-cave-question]').textContent)
        const hit = arr.find((q) => norm(q.content) === shown) ||
          arr.find((q) => shown && norm(q.content).indexOf(shown.slice(0, 12)) >= 0) || null
        const optLabels = [...document.querySelectorAll('[data-cave-opt]')].map((e) => e.getAttribute('data-cave-opt'))
        // 题库的 answer 可能是字母、也可能是选项正文——两种都归一到字母（对齐 normalizeQuestion 的口径）
        let ans = hit ? String(hit.answer || '').trim().toUpperCase() : ''
        if (hit && ans && !/^[A-Z]$/.test(ans)) {
          const texts = (hit.options || []).map((o) => (typeof o === 'string' ? o : (o && o.text) || '').toUpperCase().trim())
          const ix = texts.findIndex((o) => o && (o === ans || o.indexOf(ans) >= 0 || ans.indexOf(o) >= 0))
          if (ix >= 0) ans = String.fromCharCode(65 + ix)
        }
        return {
          matched: !!hit,
          answer: ans,
          type: (hit || {}).type || '',
          n: arr.length,
          opts: optLabels.join(''),
          shown: shown.slice(0, 36)
        }
      }, kp.id)
      emit('cave_pick_' + i, JSON.stringify(picked).replace(/"/g, "'"))
      let clicked = 'no'
      if (picked.answer && (await page.$('[data-cave-opt="' + picked.answer + '"]'))) { await clickHot(page, '[data-cave-opt="' + picked.answer + '"]'); clicked = 'yes' }
      else if (picked.answer && (await page.$('[data-cave-fill]'))) { await page.fill('[data-cave-fill]', picked.answer); await clickHot(page, '[data-cave-submit-fill]'); clicked = 'yes' }
      if (clicked === 'no' && (await page.$('[data-cave-opt="A"]'))) { await clickHot(page, '[data-cave-opt="A"]'); clicked = 'yes' }
      if (clicked === 'no' && (await page.$('[data-cave-fill]'))) { await page.fill('[data-cave-fill]', picked.answer || '1'); await clickHot(page, '[data-cave-submit-fill]'); clicked = 'yes' }
      emit('cave_answerable_' + i, clicked)
      if (clicked === 'no') { emit('cave_unanswerable', kp.code); allCorrect = 'no'; allReached = 'no'; break }
      await page.waitForFunction(() => ['correct', 'wrong'].includes(document.querySelector('[data-cave-loop]') && document.querySelector('[data-cave-loop]').getAttribute('data-cave-stage')), { timeout: 30000 })
      const stage = await page.getAttribute('[data-cave-loop]', 'data-cave-stage')
      const litNow = await has(page, '[data-cave-lit="yes"]')
      emit('cave_kp_' + i, kp.code + '|' + picked.type + '|t=' + (typeof picked.type === 'string') + '|stage=' + stage + '|lit=' + litNow + '|' + String((await t(page, '[data-cave-mastery], [data-cave-progress]')).replace(/\n/g, ' ')).slice(0, 90))
      if (stage !== 'correct') allCorrect = 'no'
      if (litNow !== 'yes') allReached = 'no'
      if (i === 0) await page.screenshot({ path: SHOTS + '/04-cave-loop.png' })
      if (i < plan.kps.length - 1) {
        const nx = await page.$('[data-cave-next-kp]')
        if (!nx) { allReached = 'no'; const s = await page.$('[data-cave-exit-soft]'); if (s) await s.click(); await page.waitForTimeout(600); break }
        // 走 clickHot（先真点击，失败回落 DOM click）：这里原为 elementHandle.click()，
        // 元素带常驻呼吸动画，真点击 30s 都不 stable，会把整条 §7 用例 FATAL 掉。
        await clickHot(page, '[data-cave-next-kp]')
        await page.waitForTimeout(900)
      }
    }
    emit('cave_all_correct', allCorrect)
    emit('cave_all_reached', allReached)
    emit('cave_last_lit', await has(page, '[data-cave-lit="yes"]'))
    emit('cave_reward_note', String((await t(page, '[data-cave-reward-note]')).replace(/\n/g, ' ')).slice(0, 140))
    emit('cave_reward', await has(page, '[data-cave-reward]'))
    // ── 整合智学慧眼（V5-N7）：闭环面板上四个出口全在（错题/复习在洞内期，计划/监督为本次补接线）。
    // 注意：错题/复习两个列表**只在该知识点有错答史时渲染**（干净知识点一路答对不会有列表），
    // 所以这两个出口的断言放在下面「答错」用例里做，那里它们必然在场；
    // 这里只验两个与历史无关的常驻出口（计划 / 监督）。
    emit('loop_plan_entry', await has(page, '[data-cave-plan]'))
    emit('loop_supervise_entry', await has(page, '[data-cave-supervise]'))

    // ── §7 出洞：链上该节亮、已亮 +1（真源回落，鉴权读）──
    const ex = await page.$('[data-cave-exit]')
    if (ex) await clickHot(page, '[data-cave-exit]')
    // 出洞是带动画的，等两拍让 overlay 真的退场再读世界（早读会拿到 overlay 上的旧态或空）
    await page.waitForTimeout(2600)
    await page.waitForFunction(() => !document.querySelector('[data-cave-scene]'), { timeout: 15000 }).catch(() => {})
    await page.evaluate(INJECT)
    const after = await page.evaluate(async () => {
      const j = window.__j
      const c = await j('/api/curriculum/learning-chain?subject=math&branch=math.num')
      return { summary: c.summary, nodes: (c.nodes || []).map((n) => ({ code: n.code, state: n.state, mastery: n.mastery })) }
    })
    const tn = after.nodes.find((n) => n.code === plan.target) || {}
    emit('node_after_state', tn.state)
    emit('node_after_mastery', tn.mastery)
    emit('lit_after', after.summary.lit)
    // 出洞后「世界上的那一格同步为亮」：城区那间店在窗内就断言店面，
    // 不在窗内（城区窗口只铺当前年级前后的店面）就断言节洞带上的同一个 code —— 同一个 chain 节点，
    // 两个维度只是画法不同，同步为亮这件事本身必须在其中一个面上看得见（N2 一份画法、一份真源）。
    const shopLit = await page.getAttribute('[data-storefront="' + plan.target + '"]', 'data-storefront-state').catch(() => '')
    const bandLit = shopLit ? '' : await page.getAttribute('[data-band] [data-cave="' + plan.target + '"]', 'data-cave-state').catch(() => '')
    emit('band_node_after', shopLit || bandLit)
    emit('band_node_where', shopLit ? 'storefront' : (bandLit ? 'band' : 'none'))
    // 排障取证书：上面两项取空时，先看清「此刻到底是哪个维度、band 在不在、洞里还在不在」，
    // 免得下一轮又只能猜（上一轮 band_node_after 空，就是缺这三行才来回跑）
    emit('after_dim', await page.$eval('[data-dim-active="yes"]', (e) => e.getAttribute('data-dim')).catch(() => 'NONE'))
    emit('after_band_n', await cnt(page, '[data-band]'))
    emit('after_cave_n', await cnt(page, '[data-cave-scene]'))
    emit('after_band_codes', (await all(page, '[data-band] [data-cave]', 'data-cave')).slice(0, 8).join(','))
    emit('after_shop_n', await cnt(page, '[data-storefront]'))
    emit('after_shop_has_target', await has(page, '[data-storefront="' + plan.target + '"]'))
    emit('after_shop_target_state', await page.getAttribute('[data-storefront="' + plan.target + '"]', 'data-storefront-state').catch(() => ''))
    emit('lit_text_after', String((await t(page, '[data-lit-count]')).trim()))
    await page.screenshot({ path: SHOTS + '/05-world-lit.png' })

    // ── §8④ N6 答错不罚：暗摆 + 错题/复习入口 + 给正确答案与解析，且灯不亮、已亮数不变 ──
    // 两条硬约束，都是上一轮实测撞出来的：
    // ① 入口必须从**当前真渲染出来的楼门**里挑。按链另挑一节 = 那扇门不在 DOM 里，
    //    [data-cave-kp="…"] 也查无此灯 → 兜底成 [data-cave-kp]（第一个兄弟），恰好是 lit。
    // ② §7 刚把那一节的 KP **全部点亮**，所以「当前窗」这时候通常全是 lit 门，练不出答错
    //    （实测 dbg：6 扇门 unlitInDoors=0）。故先显式走到一家「暗窗」店，再在它楼前挑灯位。
    //    库里 915 个 KP 有 779 个真 dim，一定走得到；走不到就老实 SKIP，不拿已亮灯位冒充答错。
    const dimShop = await page.evaluate(() => {
      const e = [...document.querySelectorAll('[data-storefront]')].find((x) => x.getAttribute('data-storefront-state') === 'dim')
      return e ? e.getAttribute('data-storefront') : null
    })
    emit('wrong_dim_shop', dimShop || 'none')
    if (dimShop) {
      await clickHot(page, '[data-storefront="' + dimShop + '"]')
      await page.waitForTimeout(1800)
      // 楼门三态词汇：这家店还没学过，它楼前那条街就是「暗门」态的实证
      emit('wrong_dim_shop_doors', await cnt(page, '[data-kp-door]'))
      emit('kp_door_states_dim_shop', [...new Set(await all(page, '[data-kp-door]', 'data-kp-state'))].sort().join(','))
      emit('kp_door_dark_mark', await cnt(page, '[data-kp-door][data-kp-state="dim"]'))
    }
    const wt = await page.evaluate(async () => {
      const j = window.__j
      const doors = [...document.querySelectorAll('[data-kp-door]')].map((e) => ({
        code: e.getAttribute('data-kp-door'),
        state: e.getAttribute('data-kp-state') || 'dim',
      }))
      if (!doors.length) return { none: true, why: 'no-door' }
      const chain = await j('/api/curriculum/learning-chain?subject=math&branch=math.num')
      const byKp = new Map()
      for (const n of (chain.nodes || [])) for (const k of (n.kps || [])) byKp.set(k.code, { kp: k, node: n })
      // 门可不止一个节的：楼门那一排就是当前选中店的 KP，整排同属一节，取第一个门所属的节即可
      const firstHit = byKp.get(doors[0].code)
      const cand = firstHit ? firstHit.node : (chain.nodes || []).find((n) => n.state !== 'lit' && (n.kps || []).length > 1)
      if (!cand) return { none: true, why: 'no-section' }
      const doorCodes = new Set(doors.map((d) => d.code))
      const doorState = new Map(doors.map((d) => [d.code, d.state]))
      const gl = Number(String(cand.grade).replace('G', ''))
      const list = await j('/api/curriculum/knowledge-points?subject=math&gradeLevel=' + gl)
      const arr = Array.isArray(list) ? list : (list.items || [])
      // 挑灯位四道关，按优先级：① 是当前渲染出来的门 ② 没亮（dim/half）③ 题库里有题 ④ 有 id
      // ③④ 是「题空态不属本用例」——门上 aria 只说「未落题」，点进去也没有作答控件。
      let chosen = null
      for (const k of (cand.kps || [])) {
        if (!doorCodes.has(k.code)) continue
        if (doorState.get(k.code) === 'lit') continue
        const id = (arr.find((x) => x.code === k.code) || {}).id
        if (!id) continue
        const ql = await j('/api/curriculum/knowledge-points/' + id + '/questions?limit=1')
        const qa = Array.isArray(ql) ? ql : (ql && ql.items) || []
        if (!qa.length) continue
        chosen = { code: k.code, id }
        break
      }
      if (!chosen) return { none: true, why: 'no-answerable-dim-door', dbg: {
        nDoors: doors.length, doorStates: [...new Set(doors.map((d) => d.state))].join(','),
        firstDoor: doors[0] ? doors[0].code : null, candCode: cand ? cand.code : null,
        candState: cand ? cand.state : null, nKps: cand ? (cand.kps || []).length : 0,
        kpsInDoors: cand ? (cand.kps || []).filter((k) => doorCodes.has(k.code)).length : 0,
        unlitInDoors: cand ? (cand.kps || []).filter((k) => doorCodes.has(k.code) && doorState.get(k.code) !== 'lit').length : 0,
        kpListN: arr.length,
      } }
      return { target: cand.code, grade: cand.grade, kp: chosen, lit: chain.summary.lit }
    })
    if (wt.none) { emit('wrong_skipped', 'yes'); emit('wrong_none_why', wt.why || '?'); emit('wrong_none_dbg', JSON.stringify(wt.dbg || {})) }
    else {
      emit('wrong_skipped', 'no')
      // §8④ 入口也走 v5 楼门。挑门的顺序是「真的能练出错」优先，而不是「第一个」：
      // ① 目标灯位的楼门在 → 点它；② 否则在当前**已渲染**的楼门里挑一盏未亮的（dim/half）；
      // ③ 全窗都亮了才退回第一扇。
      // 为什么不能退回第一扇就完事：城区窗口被钉在「刚上过课的那一间」（loadChain 的 districtPick 钉法），
      // 那一间的 KP 可能已被 §7 全部点亮 → 点第一扇进去全是 lit 灯位，练不出「答错」。
      let kpSel = (await page.$('[data-kp-door="' + wt.kp.code + '"]')) ? '[data-kp-door="' + wt.kp.code + '"]' : null
      if (!kpSel) {
        const litDoor = await page.evaluate(() => {
          const els = [...document.querySelectorAll('[data-kp-door]')]
          const pick = els.find((e) => { const s = e.getAttribute('data-kp-state'); return s === 'dim' || s === 'half' }) || null
          return pick ? pick.getAttribute('data-kp-door') : null
        })
        if (litDoor) { kpSel = '[data-kp-door="' + litDoor + '"]'; wt.kp.code = litDoor }
      }
      if (!kpSel) { kpSel = '[data-kp-door]'; note('答错用例：当前窗内楼门全亮，退回第一扇楼门') }
      else note('答错用例入口楼门 = ' + kpSel.replace(/"/g, ''))
      await clickHot(page, kpSel)
      await page.waitForSelector('[data-cave-scene]', { timeout: 20000 })
      await page.evaluate(INJECT)
      // 楼内灯位：优先目标 KP；若换了门则**明确挑一盏还没亮的灯位**，绝不落在 [data-cave-kp]
      // （§7 刚把目标节整节点亮，兜底取第一个灯位会拿到已掌握的那个 → cave 直接是 mastered 态，
      //  没有 [data-cave-opt]，答错用例会 FATAL）。挑 dim/half 灯位，才是「真的会答错」的入口。
      let kpIn = (await page.$('[data-cave-kp="' + wt.kp.code + '"]'))
        ? '[data-cave-kp="' + wt.kp.code + '"]'
        : null
      if (!kpIn) {
        const doorForDimKp = await page.evaluate(() => {
          const els = [...document.querySelectorAll('[data-cave-kp]')]
          const pick = els.find((e) => { const s = e.getAttribute('data-cave-kp-state'); return s === 'dim' || s === 'half' }) || null
          if (!pick) return null
          const code = pick.getAttribute('data-cave-kp')
          return { code, sel: '[data-cave-kp="' + code + '"]' }
        })
        kpIn = doorForDimKp ? doorForDimKp.sel : null
        if (doorForDimKp) {
          wt.kp.code = doorForDimKp.code
          const d = (await page.$('[data-kp-door="' + doorForDimKp.code + '"]')) ? doorForDimKp.code : null
          if (d) note('答错用例改点未掌握的楼门 ' + doorForDimKp.code)
        }
      }
      if (!kpIn) kpIn = '[data-cave-kp]'
      await page.waitForTimeout(300)
      emit('wrong_kp_sel', kpIn.replace(/"/g, ''))
      emit('wrong_kp_state', await page.$eval(kpIn, (e) => e.getAttribute('data-cave-kp-state')).catch(() => ''))
      await clickHot(page, kpIn)
      await page.waitForTimeout(700)
      await clickHot(page, '[data-cave-start]')
      await clickHot(page, '[data-cave-drill]')
      await page.waitForSelector('[data-cave-stage="drill"]', { timeout: 20000 })
      // 取不到真题（题库空 / activeKp 无 id）时面板走「换个知识点」兜底，没有任何作答控件。
      // 这种情形不属于「答错不罚」用例，故显式标记后短路，而不是让 clickHot 去点一个不存在的选项 FATAL。
      emit('wrong_drill_q0', String((await tc(page, '[data-cave-question]')).trim().slice(0, 60)))
      emit('wrong_drill_opts0', (await all(page, '[data-cave-opt]', 'data-cave-opt')).join(',') + '|' + (await has(page, '[data-cave-fill]')))
      // 键名分工（rget 取**首个**匹配）：`wrong_drill_q0` = 重试前的快照，纯诊断；
      // 断言读的 `wrong_drill_q` 只在下面**分支走完之后统一发一次**——所以无论题库一上来就有题、
      // 还是要重试换灯位，断言读到的都是最终那份题干。（早先只在 retry 里发它，导致题库本就好
      // 的情形一次都没发，res_ne "" 恒 FAIL——像产品坏了，其实是漏发。）
      if (!(await page.$('[data-cave-opt]')) && !(await page.$('[data-cave-fill]'))) {
        emit('wrong_retried', 'yes')
        note('答错用例短路：当前知识点在楼内取不到真题（题库空态），改点下一盏未亮灯位')
        const nextDim = await page.evaluate(() => {
          const els = [...document.querySelectorAll('[data-cave-kp]')]
          const pick = els.find((e) => { const s = e.getAttribute('data-cave-kp-state'); return (s === 'dim' || s === 'half') && e.getAttribute('data-cave-kp') !== document.querySelector('[data-cave-loop]').getAttribute('data-cave-active-code') }) || null
          return pick ? pick.getAttribute('data-cave-kp') : null
        })
        if (nextDim) { await clickHot(page, '[data-cave-kp="' + nextDim + '"]'); await page.waitForTimeout(800) }
        await clickHot(page, '[data-cave-start]')
        await clickHot(page, '[data-cave-drill]')
        await page.waitForSelector('[data-cave-stage="drill"]', { timeout: 20000 })
      }
      emit('wrong_drill_q', String((await tc(page, '[data-cave-question]')).trim().slice(0, 60)))
      emit('wrong_answerable', (await page.$('[data-cave-opt]') || await page.$('[data-cave-fill]')) ? 'yes' : 'no')
      const wl = await page.evaluate(async () => {
        const j = window.__j
        // 取**楼内当前这个**知识点的题库（data-cave-active-kp，CaveScene.vue:97）：
        // 换过灯位/楼门后 wt.kp 已不是渲染中的那个，拿旧 id 查题库匹配不上题面 → 只能蒙 'A'。
        const loop = document.querySelector('[data-cave-loop]')
        const kpId = loop ? loop.getAttribute('data-cave-active-kp') : ''
        let arr = []
        if (kpId) {
          const qs = await j('/api/curriculum/knowledge-points/' + kpId + '/questions?limit=10')
          arr = Array.isArray(qs) ? qs : (qs && qs.items) || []
        }
        const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, '')
        const shown = norm(document.querySelector('[data-cave-question]') && document.querySelector('[data-cave-question]').textContent)
        const m = arr.find((q) => norm(q.content) === shown) ||
          arr.find((q) => shown && norm(q.content).indexOf(shown.slice(0, 12)) >= 0) || null
        if (!m) return 'A'
        // 题库 answer 可能是字母、也可能是选项正文——两种都归一到字母（与 §7 同一口径）
        let right = String(m.answer || '').trim().toUpperCase()
        if (right && !/^[A-Z]$/.test(right)) {
          const texts = (m.options || []).map((o) => (typeof o === 'string' ? o : (o && o.text) || '').toUpperCase().trim())
          const ix = texts.findIndex((o) => o && (o === right || o.indexOf(right) >= 0 || right.indexOf(o) >= 0))
          if (ix >= 0) right = String.fromCharCode(65 + ix)
        }
        if (!/^[A-Z]$/.test(right)) return 'A'
        const letters = 'ABCDEFG'.slice(0, (m.options || []).length).split('')
        return letters.find((l) => l !== right) || 'A'
      })
      const sel = '[data-cave-opt="' + wl + '"]'
      if (await page.$(sel)) await clickHot(page, sel)
      else if (await page.$('[data-cave-fill]')) { await page.fill('[data-cave-fill]', wl); await clickHot(page, '[data-cave-submit-fill]') }
      // 选择题但题库答案归一到字母失败（兜底 'A' 恰好是正确项也算命中，不会走到这里）；
      // 走到这里说明这一 KnowledgePoint 的题确实点不动作答 —— 明记而不是让 clickHot FATAL 全脚本。
      else { note('答错用例：该知识点渲染出的题没有 ABCD 选项，且无填空框'); emit('wrong_no_option', 'yes') }
      await page.waitForFunction(() => ['correct', 'wrong'].includes(document.querySelector('[data-cave-loop]') && document.querySelector('[data-cave-loop]').getAttribute('data-cave-stage')), { timeout: 30000 })
      emit('wrong_stage', await page.getAttribute('[data-cave-loop]', 'data-cave-stage'))
      emit('wrong_sway', await has(page, '[data-cave-sway="yes"]'))
      emit('wrong_lit', await has(page, '[data-cave-lit="yes"]'))
      emit('wrong_answer_shown', await has(page, '[data-cave-correct-answer]'))
      emit('wrong_analysis', await has(page, '[data-cave-analysis]'))
      // 智学慧眼整合（V5-N7）的四个出口：错题/复习随这一次错答必然在场（上面 §7 干净答对的场景拿不到它们）
      emit('loop_wrong_entry', await has(page, '[data-cave-wrong-list]'))
      emit('loop_review_entry', await has(page, '[data-cave-review-list]'))
      emit('loop_plan_entry2', await has(page, '[data-cave-plan]'))
      emit('loop_supervise_entry2', await has(page, '[data-cave-supervise]'))
      emit('wrong_entry', ((await has(page, '[data-cave-wrong-list]')) === 'yes' || (await has(page, '[data-cave-review-list]')) === 'yes') ? 'yes' : 'no')
      emit('wrong_text', String((await t(page, '[data-cave-wrong]')).replace(/\n/g, ' · ')).slice(0, 200))
      await page.screenshot({ path: SHOTS + '/06-cave-wrong.png' })
      await page.evaluate(INJECT)
      // 「该节为半亮」必须挂在**实际作答的那一节**上：§7 已把目标节点亮，这里可能换了灯位/楼门，
      // 拿 wt.target 去读状态就会读到 lit 而非 half（上一轮就是这么误判的）。
      const aw = await page.evaluate(async (code) => {
        const j = window.__j
        const c = await j('/api/curriculum/learning-chain?subject=math&branch=math.num')
        // 节 code = KP code 去掉末段 .kpNN（实测 math.g1.pep.ch07.s01.kp01 → math.g1.pep.ch07.s01）
        const codeOf = (kpCode) => String(kpCode || '').replace(/\.[^.]+$/, '')
        const sec = codeOf(code)
        const n = (c.nodes || []).find((x) => x.code === sec)
        return { lit: c.summary.lit, state: n && n.state, sec }
      }, wt.kp.code)
      emit('wrong_lit_after', aw.lit)
      emit('wrong_state_after', aw.state)
      emit('wrong_section_after', aw.sec)
      emit('wrong_lit_before', wt.lit)
    }
  }

  // ── §10 N5 软边不误导（DOM 可读注记）──
  emit('legend_text', String((await t(page, '.band-legend')).replace(/\n/g, ' · ')).slice(0, 260))

  emit('pageerrors', ERRORS.length)
  for (const e of ERRORS.slice(0, 6)) note('ERR ' + e)
  await browser.close()
})().catch((e) => { console.log('FATAL ' + e.message + '\n' + e.stack); process.exit(1) })
NODEEOF

node "$TMP_DIR/serve.cjs" "$PORTAL_DIST" "$TUTOR_DIST" "$TEST_PORT" "http://127.0.0.1:$API_PORT" "https://localhost" >"$TMP_DIR/serve.log" 2>&1 &
SERVER_PID=$!
for _ in $(seq 1 30); do grep -q READY "$TMP_DIR/serve.log" 2>/dev/null && break; sleep 0.3; done
ok_if "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$TEST_PORT/portal/")" "200" "E2E 托管可达：门户（http://127.0.0.1:$TEST_PORT/portal/）"
ok_if "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$TEST_PORT/tutor/")" "200" "E2E 托管可达：智学慧眼（同源 /tutor/，令牌因此同在册）"

E2E_LOG="$TMP_DIR/e2e.log"
PW_CORE="$PW_CORE" E2E_IDENTIFIER="$E2E_IDENTIFIER" E2E_PASSWORD="$E2E_PASSWORD" \
  node "$TMP_DIR/e2e.cjs" "http://127.0.0.1:$TEST_PORT/portal/" "http://127.0.0.1:$TEST_PORT/tutor/" "$SHOTS" >"$E2E_LOG" 2>&1
ok_if "$?" "0" "E2E 脚本跑完（无致命错）"
grep '^#' "$E2E_LOG" | sed 's/^/      /' | head -12
grep '^FATAL' "$E2E_LOG" | sed 's/^/      /'

# ── §4 N1（E2E 侧）
res_has "dim_opts" "$E2E_LOG" "branches" "维度切换器含「学科知识体系」"
res_has "dim_opts" "$E2E_LOG" "grades" "维度切换器含「K12 阶段」"
res_eq "dim_default" "$E2E_LOG" "branches" "默认落在「学科知识体系」（N1：切维度不许回归）"
res_ge "branches" "$E2E_LOG" "5" "多峰群山在渲染（[data-branch] 热点数）"
# ── §9 N9 首屏信息密度
res_eq "strip" "$E2E_LOG" "yes" "首屏 v4 读数条在（数据钩子 data-v4-strip）"
res_has "strip_text" "$E2E_LOG" "光脉点亮" "首屏有「已亮 / 总节数」读数"
res_has "lit_text" "$E2E_LOG" "/" "已亮读数形如「N / M 节」（诚实分母）"
res_has "strip_text" "$E2E_LOG" "下一个最佳目标" "首屏有「下一个最佳目标」（N6②）"
res_has "strip_text" "$E2E_LOG" "光脉前沿" "首屏有「光脉前沿」（我在哪 / 雾退到哪）"
res_has "strip_text" "$E2E_LOG" "当前洞门" "首屏有「当前洞门」（所在 K12 段）"
res_has "frontier_text" "$E2E_LOG" "雾退到此" "前沿读数写明「雾退到此」（M1 与 M2 的衔接）"
res_has "next_text" "$E2E_LOG" "（" "下一目标带年级注记（如「1. 数一数（小一）」）"
res_ge "map_axis_n" "$E2E_LOG" "10" "海拔刻度（年级轴）在首屏（K12 范围可见）"
res_eq "me_line" "$E2E_LOG" "yes" "「我在这」海拔线在（当前所处 K12 位置）"
# ── §5 M1 晨雾
res_ge "fog_near" "$E2E_LOG" "1" "晨雾（近）在"
res_ge "fog_far" "$E2E_LOG" "1" "晨雾（远）在（近实远虚）"
res_ge "fog_veil" "$E2E_LOG" "1" "雾幕 / 雾渐变在（未明处整层罩住）"
res_ge "ridge_glow" "$E2E_LOG" "1" "雾中轮廓微光在（未知但有形）"
# ── §6 M2 光脉（节点/边都画在「节洞带」里，故按 [data-band] 计数）
res_ge "band_node_dim" "$E2E_LOG" "1" "洞位三态：未明（w-node-dim）"
# 半亮这条原来是 `res_ge … 0` —— `>= 0` 对任何值恒真，等于没断：半亮一个都不画也照样 PASS。
# 改为 ≥1 才真的盯住「有作答未到 80」这个态在画（discovered by 独立复验代理）。
# 取向说明：宁可将来它变成**假 FAIL**（testuser 全学完就没有半亮了，届时报错让人去造点半亮数据），
# 也不要假绿——假 FAIL 会逼人看，假绿会让人以为这条一直有人在守。
res_ge "band_node_half" "$E2E_LOG" "1" "洞位三态：半亮（w-node-half，光流到的后继）"
res_eq "band_edge_explicit" "$E2E_LOG" "0" "显式前置边不在节带上重复叠线（实测显式前置全部落在同一节内，节级已收拢，避免三线压一路）"
res_ge "band_edge_seq" "$E2E_LOG" "1" "课程序列边在画（seq，节与节之间）"
res_ge "band_edge_soft" "$E2E_LOG" "1" "引导路径边在画（soft，跨年级衔接，节带内以最淡虚线旁支露出）"
res_ge "light_pulse" "$E2E_LOG" "1" "光脉行进亮束在（w-light-pulse，CSS 动画，非 3D）"
res_ge "light_hint" "$E2E_LOG" "1" "下一目标呼吸光在（w-light-hint，N6② 的视觉）"
res_ge "light_trail" "$E2E_LOG" "1" "已亮相邻节之间有光迹（w-light-trail）"
# ── §4/§8③ 洞门三态
res_ge "grade_doors" "$E2E_LOG" "2" "年级洞门热点在（进洞入口 ≤2 步）"
res_has "grade_door_states" "$E2E_LOG" "dim" "洞门有「暗门」态"
# ── §8④ / §7 洞内闭环
if [ "$(rget cave_skipped "$E2E_LOG")" = "yes" ]; then
  skip "洞内闭环：本机学生已无「全干净」的节可选，M3 用例跳过（数据态所致，非实现问题）"
else
  res_eq "cave_open" "$E2E_LOG" "yes" "点洞即进（洞口 1 步）"
  res_eq "cave_svg" "$E2E_LOG" "yes" "洞内是平铺 SVG 生活场景（非 3D）"
  res_eq "cave_stage0" "$E2E_LOG" "idle" "洞内闭环起始态 = idle（等一键推进）"
  res_ge "cave_seeds" "$E2E_LOG" "2" "洞内灯位 = 该节知识点数"
  res_eq "cave_door0_notlit" "$E2E_LOG" "yes" "进洞时该节是「暗门」（未掌握，非亮灯）"
  res_has "band_text" "$E2E_LOG" "已亮" "洞带读数含「已亮」（册章归属与进度同屏）"
  res_has "band_text" "$E2E_LOG" "微光" "洞带读数含「微光」（够得着但未掌握）"
  res_has "band_legend" "$E2E_LOG" "引导路径" "洞带图例含「引导路径」"
  res_has "legend_soft_line" "$E2E_LOG" "yes" "软边有可辨的虚线样例（N5：弱化为引导）"
  res_has "legend_tone_explicit" "$E2E_LOG" "style=solid" "图例：显式前置＝实线（重的一档）"
  res_has "legend_tone_seq" "$E2E_LOG" "style=solid" "图例：课程序列＝实线"
  res_has "legend_tone_soft" "$E2E_LOG" "style=dashed" "图例：引导路径＝虚线（N5：明显弱于实线，不画成必修）"
  res_has "band_legend" "$E2E_LOG" "非精确前置" "软边注明「非精确前置，仅供引导」（N5 不许画成必修）"
  res_eq "node_before_notlit" "$E2E_LOG" "yes" "进洞前该节未亮（dim/half；half 即光脉已流到的后继）"
  res_eq "cave_all_correct" "$E2E_LOG" "yes" "整节逐灯位答对（走智学慧眼闭环：讲解→练→判）"
  res_eq "cave_all_reached" "$E2E_LOG" "yes" "每个灯位答对后掌握 ≥80 → 洞内亮灯（M3 的闭环出口）"
  res_eq "cave_last_lit" "$E2E_LOG" "yes" "末个灯位亮灯（出洞条件的门）"
  res_eq "cave_reward" "$E2E_LOG" "yes" "出洞亮灯时给奖励卡（成就在册则记，不在册则降级为视觉+文案）"
  res_has "cave_reward_note" "$E2E_LOG" "洞" "奖励文案可读（不伪造计数）"
  # ── 整合智学慧眼（V5-N7）：闭环面板六个环节的出口全在，不新增假功能 ──
  #  ① 错题 / ② 复习只在该知识点有错答史时渲染 → 在下面「答错」用例里断言（那里必然在场）
  #  ③ 计划 / ④ 监督与历史无关 → 这里断言（干净知识点一路答对也必须在场）
  res_eq "loop_plan_entry" "$E2E_LOG" "yes" "闭环出口③按评估水平排计划（本次补接线 → 学习计划页）"
  res_eq "loop_supervise_entry" "$E2E_LOG" "yes" "闭环出口④去看计划执行 / 监督（本次补接线）"
  res_eq "node_after_state" "$E2E_LOG" "lit" "出洞后链上该节 = 已亮（真源回落 mastery_snapshots）"
  res_has "band_node_after" "$E2E_LOG" "lit" "世界上的那一格同步为亮灯（出洞那一间的橱窗 / 洞带上的同一个节点）"
  case "$(rget band_node_where "$E2E_LOG")" in storefront|band) pass "同步亮灯的格子确实在某个面上看得见（storefront 或 band，不是 none）";; *) fail "同步亮灯的格子没在任何面上看得见（实得「$(rget band_node_where "$E2E_LOG")」）";; esac
  res_eq "lit_text_after" "$E2E_LOG" "$(rget lit_after "$E2E_LOG")" "城区读数条上的「已亮」与真源一致（M2：作答后读数 = mastery_snapshots 已亮数）"
  ok_if "$(( $(rget lit_after "$E2E_LOG") - $(rget lit_before "$E2E_LOG") ))" "1" "已亮数恰好 +1（M2 光脉前移一格）"
  res_has "node_after_mastery" "$E2E_LOG" "100" "该节掌握度 = 100（干净知识点的诚实读数）"
  # §8④ 答错不罚
  if [ "$(rget wrong_skipped "$E2E_LOG")" = "no" ]; then
    res_eq "wrong_stage" "$E2E_LOG" "wrong" "答错进入「差一点」态（不是罚站）"
    res_eq "wrong_sway" "$E2E_LOG" "yes" "答错只有暗摆（dim sway），不扣分不掉级"
    res_eq "wrong_lit" "$E2E_LOG" "no" "答错不亮灯（光脉不撒谎）"
    res_eq "wrong_answer_shown" "$E2E_LOG" "yes" "答错给出正确答案（可学）"
    res_eq "wrong_analysis" "$E2E_LOG" "yes" "答错给出解析（可学）"
    res_eq "wrong_entry" "$E2E_LOG" "yes" "答错自动接上错题本 / 复习（N6④ 自动连线）"
    res_eq "loop_wrong_entry" "$E2E_LOG" "yes" "闭环出口①错题本：答错后当场接上（有错答史才渲染，故此处置信）"
    res_eq "loop_review_entry" "$E2E_LOG" "yes" "闭环出口②间隔复习：答错后当场接上（同上）"
    res_eq "loop_plan_entry2" "$E2E_LOG" "yes" "闭环出口③排计划在答错态仍在场（四个出口不随对错消失）"
    res_eq "loop_supervise_entry2" "$E2E_LOG" "yes" "闭环出口④监督在答错态仍在场（同上）"
    res_has "wrong_text" "$E2E_LOG" "错题" "答错文案明说「记进错题，回头再来」"
    res_eq "wrong_state_after" "$E2E_LOG" "half" "答错后该节为半亮（有作答但未到 80）——不是「未明」，也不是「已亮」"
    res_has "wrong_kp_state" "$E2E_LOG" "dim" "答错用例进的是未掌握的灯位（不拿已亮的灯位做答错，否则练不出「答错」）"
    res_eq "wrong_answerable" "$E2E_LOG" "yes" "答错用例拿到的是真能作答的题（选择题或填空；题库空态不算「答错」用例）"
    res_ne "wrong_drill_q" "$E2E_LOG" "" "答错用例的题干真的渲染出来了（不是「取不到真题」兜底）"
    res_has "wrong_section_after" "$E2E_LOG" "ch" "答错读到的节挂在 KP code 推得的真节上（math.g1.pep.ch07.s01，不是目标节）"
    ok_if "$(rget wrong_lit_after "$E2E_LOG")" "$(rget wrong_lit_before "$E2E_LOG")" "答错不改变已亮总数"
  else
    skip "答错不罚：无可用节（数据态）"
  fi
fi
# ── v5 学科城区：宏观铺开度（维度切换 / 年级大道 / 一间店一节 / 楼门即知识点）──
res_has "dim_opts" "$E2E_LOG" "district" "维度切换器含第三档「学科城区」"
res_eq "dim_district_on" "$E2E_LOG" "district" "城区可切为当前维度（V5-N1 第三维度，默认仍 branches）"
res_eq "district_map" "$E2E_LOG" "district" "地图画布锚到城区（data-dim-current）"
res_eq "district_blocked" "$E2E_LOG" "no" "数学支城区不是空态（有链、有 code → 铺；N10 不造假楼）"
res_ge "avenue_marks" "$E2E_LOG" "12" "年级大道有 12 枚里程碑（1–12 全在；marks 由 GRADE_TICKS 同源派生）"
res_has "avenue_mark_list" "$E2E_LOG" "1," "里程碑从一年级起（K12 体系整条可见）"
res_has "avenue_mark_list" "$E2E_LOG" ",12" "里程碑到高三止（K12 体系整条可见）"
res_ge "shops" "$E2E_LOG" "1" "一间店 = 一节：城区有店（[data-storefront] ≥ 1）"
res_has "shop_states" "$E2E_LOG" "dim" "店面有「暗窗」态（未明：橱窗仍是世界语言的三态）"
res_ge "road_dash" "$E2E_LOG" "1" "年级大道中线在（一条连续的路，即便那段未学 —— 用户诉求①）"
res_ge "road_wide" "$E2E_LOG" "1" "楼间路在画（因果物理化为路通不通）"
res_ge "kp_doors" "$E2E_LOG" "2" "楼门 = 知识点洞口：章内一排门（实测 math.num 单节 6–8 个，真实可点）"
# 三态词汇的实证：默认窗开在「最前沿」，那里全是 half/lit（实测默认窗 6 扇门全 half），
# 拿默认窗断言 dim 是拿运气当真凭。故断言改看 §8④ 走过的那家「暗窗」店楼前的门。
# 顺带这条也证明了一件真事：§7 点亮的那家店里全是亮门，所以答错用例必须另找一家店。
res_ne "wrong_dim_shop" "$E2E_LOG" "none" "城区里真有一家「暗窗」店，答错用例因此有处可去（不造假楼，也不拿已亮门冒充答错）"
res_has "wrong_dim_shop" "$E2E_LOG" "." "走到了一家具体的暗窗店（有节 code，不是空）"
res_has "kp_door_states_dim_shop" "$E2E_LOG" "dim" "楼门有「暗门」态（走到一家未学的店，楼前有未明的门 — 世界语言三态）"
res_ge "kp_door_dark_mark" "$E2E_LOG" "1" "未学的店里真有未亮的楼门（不是只有店暗、门全亮的假三态）"
res_eq "kp_door_dark_mark" "$E2E_LOG" "$(rget wrong_dim_shop_doors "$E2E_LOG")" "未学的店里整排门都是暗门（这一节一个都没学过 — 三态里 dim 是整排的，不是点缀）"
res_eq "kp_path_contiguous" "$E2E_LOG" "yes" "楼前一条街等距连续（相邻门中心距一致 = CAVE_BAND.nodeW，证明是一条连续路径）"
res_ge "kp_path_n" "$E2E_LOG" "6" "章内知识点数 ≥ 6（实测 learning-chain math.num 144 节为 6–8 个 KP；§3 粒度裁决：一门 2354 KP 不铺，一节 6–8 个正好是一排门）"
res_le "kp_path_n" "$E2E_LOG" "12" "章内知识点数 ≤ 12（实测上界 8；留 12 作回归余量，单节仍是「一排门」的量级）"
res_eq "legacy_band_selector" "$E2E_LOG" "no" "城区维度不再渲染旧的节洞带（[data-cave]）——宏观入口已从「节洞带」换成楼门"
res_eq "legacy_grade_door" "$E2E_LOG" "no" "城区维度不再渲染旧的年级洞门（[data-grade-door]）——少一层中转"
# ── v5 主 surface（楼内书房）与可选地下室 ──
res_eq "room_scene" "$E2E_LOG" "study" "点楼门直接进楼内书房（主 surface，flat 平面而非 3D）"
res_ge "room_floor" "$E2E_LOG" "1" "书房有木地板（lifeScene 楼内生活场景）"
res_ge "room_wall" "$E2E_LOG" "3" "书房三层墙面退晕（平面退晕即纵深，非 3D）"
res_eq "basement_btn" "$E2E_LOG" "yes" "地下室开关在（v5 第二 surface 可选去）"
res_eq "basement_open" "$E2E_LOG" "cave" "下地下室 = 岩洞探索室（同一条闭环，只换观感）"
res_ge "basement_rock" "$E2E_LOG" "2" "地下室是岩洞画法（caveScene 岩壁三环 w-cave-wall-1/2/3 都在，不是另起一套画法）"
res_eq "basement_room_gone" "$E2E_LOG" "yes" "下地下室后书房的三面退晕墙真的消失（同一 SVG 位真的换了画法，不是叠了一层）"
res_eq "basement_back" "$E2E_LOG" "study" "可回楼上（两个 surface 都能跑同一条闭环）"
res_has "basement_note" "$E2E_LOG" "同一条闭环" "地下室旁明写「走的是同一条闭环；楼上楼下不改变掌握度真源」"
# ── v5 图例诚实口径（逐字，设计文档 §4：顺序≠难度 / 半亮≠会了一半 / 地下室不改真源）──
res_eq "legend_order2" "$E2E_LOG" "yes" "图例含 [data-legend-order]（诚实口径一分栏一条）"
res_has "legend_text2" "$E2E_LOG" "顺序" "图例写明「路的先后是课程序列（先学后学的顺序），不是难度高低」"
res_eq "legend_half2" "$E2E_LOG" "yes" "图例含 [data-legend-half]"
res_has "legend_text2" "$E2E_LOG" "半亮 = 有作答且未到 80" "图例写明「半亮 = 有作答且未到 80，不是「会了一半」」"
res_eq "legend_basement2" "$E2E_LOG" "yes" "图例含 [data-legend-basement]"
res_has "legend_text2" "$E2E_LOG" "同一条闭环" "图例写明「地下室走的是同一条闭环；楼上楼下不改变掌握度真源」"
# ── §10 N5（DOM 侧）：城区维度下的同一条红线——引导语不许被读成必修 / 难度 ──
res_has "legend_text" "$E2E_LOG" "不是难度高低" "城区图例写明「路的先后是课程序列…不是难度高低」（N5 不许画成必修）"
res_has "legend_text" "$E2E_LOG" "同一条闭环" "城区图例写明地下室走同一条闭环（N5 诚实口径）"
# ── N10 真浏览器零错
res_eq "pageerrors" "$E2E_LOG" "0" "全链路 pageerror / console.error = 0（真实浏览器）"

# ---------------------------------------------------------------------------
echo
echo "== §11. 零裸色（改动面三重 grep）=="
COLOR_SCAN="$(grep -nE '#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(' "$TUTOR_WORLD" "$TUTOR_CAVE" "$TUTOR_API" "$SHARED_SRC/art.js" "$WORLD_CSS" 2>/dev/null | grep -vE 'world.css:[0-9]+:\s*\*' | wc -l | tr -d ' ')"
ok_if "$COLOR_SCAN" "0" "world.vue / CaveScene.vue / api / world-art / world.css 无任何色值字面量（N2 零裸色）"
NAMED="$(grep -nE ':\s*(white|black|red|blue|green|yellow|gray|grey|orange|purple|pink|brown|cyan|magenta|silver|navy|teal|olive|maroon|lime|aqua|fuchsia)\s*[;}]' "$TUTOR_WORLD" "$TUTOR_CAVE" "$WORLD_CSS" 2>/dev/null | wc -l | tr -d ' ')"
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

# ---------------------------------------------------------------------------
echo
echo "== §12. 凭据零泄漏 =="
# 说明：本节自身的检测模式里必然出现「nvapi-」等字样，故扫描时把自己这段（§12→§13）剔掉，
# 只扫「交付实现面」有没有真的把凭据写进去。POSTGRES_PASSWORD= 是容器 env 的「变量名」（非值），
# 脚本只从 `docker inspect` 的 env 里读进变量、从不打印，故不算凭据字面量。
BODY="$(awk '/^echo "== §12\. 凭据零泄漏/{s=1} /^echo "== §13\. 改动范围/{s=0} !s{print}' "$OUT_DIR/w6a-verify.sh")"
LIST_CRED="$(printf '%s\n' "$BODY" | grep -cE '(nvapi-[A-Za-z0-9]{8,}|Bearer [A-Za-z0-9._-]{20,})' | tr -d ' ')"
ok_if "$LIST_CRED" "0" "验收脚本里零凭据字面量（密钥/令牌只引用 env 或容器 env）"
# 交付说明（w6a-file-list.md）由独立复验那一步落盘，本脚本跑时它可能还没生成：
# 缺文件时 grep 输出是空串而非「0」，会让下面两条误红，所以显式给空默认。
FILE_LIST="$OUT_DIR/w6a-file-list.md"
FL_BODY="$([ -f "$FILE_LIST" ] && cat "$FILE_LIST" || true)"
LIST_CRED_MD="$(printf '%s\n' "$FL_BODY" | grep -cE '(nvapi-[A-Za-z0-9]{8,}|Bearer [A-Za-z0-9._-]{20,})')"
LIST_CRED_MD="${LIST_CRED_MD:-0}"
ok_if "$LIST_CRED_MD" "0" "交付说明里零凭据字面量（交付说明未生成时按 0 计：文字面量为零）"
SCRIPT_CRED="$(printf '%s\n' "$BODY" | grep -cE '(nvapi-|AUTH_SERVICE_TOKEN=[^ "$])' | tr -d ' ')"
ok_if "$SCRIPT_CRED" "0" "脚本不内联任何密钥（口令只从容器 env 读入变量）"
ok_not_has "$(cat "$TUTOR_CAVE")" "nvapi-" "洞内组件不含密钥字面量"
ok_has "$(cat "$OUT_DIR/w6a-verify.sh")" 'E2E_IDENTIFIER:-testuser' "仅用 dev 测试账号，且可被 env 覆盖"
ok_has "$(cat "$OUT_DIR/w6a-verify.sh")" 'E2E_PASSWORD:-test1234' "只用 dev 测试账号口令，且尾部唯一默认值可被 env 覆盖（不打印）"
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
CHANGED="$(printf '%s\n' "$STATUS" | awk '{print $2}' | sort | tr '\n' ',')"
# 白名单按 glob 逐项匹配（前缀写法是错的：'*"$f"*' 要求整串出现在清单里）
OUT_OF="$(printf '%s' "$CHANGED" | tr ',' '\n' | sed '/^$/d' | while read -r f; do
  case "$f" in
    apps/web-ai-tutor/src/pages/twin/world.vue|apps/web-ai-tutor/src/components/world/*|apps/web-ai-tutor/src/api/index.js|apps/web-ai-tutor/src/store/practice.js|packages/world-art/src/art.js|styles/world.css|styles/tokens/themes/persona-world.css|docs/SUBJECT_SUMMIT_DESIGN_V5.md|.agents/claude/outputs/w6a-verify.sh|.agents/claude/outputs/w6a-file-list.md) continue ;;
    .agents/codex/outputs/*|services/api/src/modules/curriculum/learning-chain.ts|services/api/src/modules/curriculum/learning-chain.spec.ts) continue ;;
  esac
  printf '%s\n' "$f"
done | tr '\n' ' ')"
ok_if "$OUT_OF" "" "作者改动全部落在白名单内（越界文件：${OUT_OF:-无}）"
ok_has "$CHANGED" "apps/web-ai-tutor/src/components/world/CaveScene.vue" "洞内组件在册（CaveScene.vue）"
ok_has "$CHANGED" "docs/SUBJECT_SUMMIT_DESIGN_V5.md" "设计文档在册（取消山峰登顶为宏观呈现的那张卡）"
ok_has "$(cat "$TUTOR_API")" "getLearningChain" "只读客户端：getLearningChain"
ok_has "$(cat "$TUTOR_API")" "getKpCave" "只读客户端：getKpCave"

# ---------------------------------------------------------------------------
echo
echo "== §14. 未覆盖项（明示，不计 FAIL）=="
skip "运营台侧的洞窟数据看板：本卡只做学生面（W5-a 数据面不新增运营读面）"
skip "生产 nginx /tutor/ 静态托付下的观感：本卡 E2E 用同源双 App 托管复现同一 origin 与同一令牌在册条件"
skip "TYPE=BOTH 的深色主题：世界令牌沿用单一亮色黎明色域（未新增深色世界色）"
skip "小程序端洞窟闭环：本卡面为 H5（build:h5）；小程序同源构建未在本卡验收范围"
skip "真人触屏手势（双指缩放雾界）：本卡只验点击/键盘可达（触控等价性未自动化）"

echo
echo "PASS=$PASS SKIP=$SKIP"
echo "FAIL=$FAIL"
[ "$FAIL" = "0" ] || exit 1
