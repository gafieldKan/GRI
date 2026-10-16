#!/usr/bin/env bash
# ============================================================================
# W2 验收：门户「工作台」→「人本世界」（登录即人物激活 · 2D/SVG 生活全景 · 场景/意向驱动）
#
# 结构：
#   §0 前置        —— nginx / api / postgres 在跑；node + playwright-core + chromium 可用
#   §1 构建        —— apps/portal `npm run build:h5` 通过；产物含 world / org-twin，不含 workbench；
#                     产物 CSS 已带世界令牌（--world-*）
#   §2 N1 登录落点 —— pages.json 首页 = pages/world/index；守卫/登录/注册三处落 world；workbench 已删且零引用；
#                     身份与退出保留；运营后台独立入口在世界之外
#   §3 N2 SVG 拟真 —— 7 个场景结构 + 未知码兜底；SVG 内不出现 uni-app 组件标签；无 3D 依赖
#   §4 N3 场景/意向 —— 场景热区 + 意向→模块解析（走进/开通/即将接入三态）；无应用图标墙
#   §5 N4 单真源   —— 四个读面全部指向 W1；场景清单只从 /api/world 取；四来源分别降级
#   §6 N5 组织卡   —— 组织入口卡（名/类型/角色）→ 组织孪生占位页（单真源、口径声明）
#   §7 N6 工作台并入 —— 「常去的地方 / 世界扩展」承载原模块卡；开通/收起仍走 enable/disable
#   §8 N7 零裸色   —— hex / rgb / 具名色 三重 grep 空（W2 表层）+ 无「用了没声明」的 var(--)
#   §9 真浏览器 E2E（学生身份）
#       9.1 登录 → 世界（非卡片列表）；9.2 未见未授权模块
#       9.3 SVG 全景 / 7 场景 / 人物卡字段；9.4 组织卡；9.5 常去的地方 / 世界扩展
#       9.6 餐饮 → 意向 → food（SSO 免二登，打桩不真跳）；9.7 学习 → tutor（打桩）
#       9.8 未开放场景「建设中」；9.9 降级态（/api/world + /api/twin/me 打 500）
#       9.10 pageerror / console.error = 0
#   §10 移动端 390px 单列可用
#   §11 运营后台独立入口（operator 身份：临时提权 + trap 还原）
#       11.1 独立入口可达进组织管理台；11.2 工作场景给「世界之外的出口」
#       11.3 世界之内不出现运营/工具模块；11.4 组织孪生占位页；11.5 世界扩展 开通 → 持久 → 收起
#   §12 凭据零泄漏
#   §13 改动范围 —— HEAD 未变、未 checkout、改动文件在白名单内
#
# 依赖：docker（gri-api / gri-nginx / gri-postgres 在跑）；apps/portal 已 npm install；
#       node + /home/ubantu/openclaw/node_modules/playwright-core + chromium。
# 凭据：仅 dev 测试账号（E2E_IDENTIFIER / E2E_PASSWORD 可覆盖）；脚本不落任何密钥、不打印 token/密码。
# 副作用：§1 写 apps/portal/dist（gitignore）；§9 浏览器只读；
#         §11 临时把测试账号 role 提为 operator 以取运营侧读面，**trap 退出即还原**（含 Redis 缓存失效）；
#         §11.5 开通/收起走一遍 enable/disable 并还原到原状态。
# 用法：  bash .agents/claude/outputs/w2-verify.sh
# 通过：  末尾打印「PASS=<n> FAIL=0 VERIFY_EXIT=0」
# ============================================================================
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PORTAL_DIR="$ROOT_DIR/apps/portal"
SRC_DIR="$PORTAL_DIR/src"
DIST_DIR="$PORTAL_DIR/dist/build/h5"
OUT_DIR="$ROOT_DIR/.agents/claude/outputs"

E2E_IDENTIFIER="${E2E_IDENTIFIER:-testuser}"
E2E_PASSWORD="${E2E_PASSWORD:-test1234}"
PG_CT="${PG_CT:-gri-postgres}"
REDIS_CT="${REDIS_CT:-gri-redis}"
PW_CORE="${PW_CORE:-/home/ubantu/openclaw/node_modules/playwright-core}"
TEST_PORT="${TEST_PORT:-5199}"

TMP_DIR="$(mktemp -d /tmp/w2.XXXXXX)"
SERVER_PID=""
ORIG_ROLE=""
ROLE_TOUCHED=0

cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null
  # 提权还原（无论脚本怎么退出）
  if [ "$ROLE_TOUCHED" = 1 ] && [ -n "$ORIG_ROLE" ]; then
    docker exec "$PG_CT" psql -U postgres -d gri -q -c \
      "update public.users set role='$ORIG_ROLE', updated_at=now() where username='$E2E_IDENTIFIER'" >/dev/null 2>&1
    EX_ID="$(docker exec "$PG_CT" psql -U postgres -d gri -tAc \
      "select id from public.users where username='$E2E_IDENTIFIER'" 2>/dev/null | tr -d ' ')"
    [ -n "$EX_ID" ] && docker exec "$REDIS_CT" env -u REDISCLI_AUTH redis-cli del "ctx:user:$EX_ID" >/dev/null 2>&1
    echo "（已还原 $E2E_IDENTIFIER 的角色为 $ORIG_ROLE）"
  fi
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
ok_set() { # 逗号集合按集合比较（与顺序无关）
  local g e; g="$(printf '%s' "$1" | tr ',' '\n' | sed '/^$/d' | sort | tr '\n' ',')"
  e="$(printf '%s' "$2" | tr ',' '\n' | sed '/^$/d' | sort | tr '\n' ',')"
  ok_if "$g" "$e" "$3"
}

# RESULT 取值（E2E 段用）
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
echo "== §1. 构建（apps/portal build:h5）=="
BUILD_LOG="$TMP_DIR/build.log"
( cd "$PORTAL_DIR" && npm run build:h5 ) >"$BUILD_LOG" 2>&1
BUILD_RC=$?
ok_if "$BUILD_RC" "0" "npm run build:h5 通过（exit 0）"
[ "$BUILD_RC" != 0 ] && tail -5 "$BUILD_LOG" | sed 's/^/      /'

IDX_HTML="$DIST_DIR/index.html"
ok_file "$IDX_HTML" "构建产物 index.html 存在"
JS_LIST="$(ls "$DIST_DIR/assets" 2>/dev/null | tr '\n' ' ')"
ok_has "$JS_LIST" "pages-world-index" "产物含人本世界分片（pages-world-index）"
ok_has "$JS_LIST" "pages-org-twin-index" "产物含组织孪生占位页分片（pages-org-twin-index）"
ok_not_has "$JS_LIST" "workbench" "产物不再含工作台分片（workbench 已并表）"
CSS_ALL="$(cat "$DIST_DIR"/assets/*.css 2>/dev/null)"
ok_has "$CSS_ALL" "--world-sky-mid" "产物 CSS 已带世界令牌（--world-sky-mid）"
ok_has "$CSS_ALL" ".w-ground-left" "产物 CSS 已带世界几何类映射（.w-ground-left）"

WORLD_VUE="$SRC_DIR/pages/world/index.vue"
ORG_TWIN_VUE="$SRC_DIR/pages/org-twin/index.vue"
LW="$SRC_DIR/components/world/LifeWorld.vue"
PC="$SRC_DIR/components/world/PersonaCard.vue"
OC="$SRC_DIR/components/world/OrgCard.vue"
IS="$SRC_DIR/components/world/IntentSheet.vue"
WT="$SRC_DIR/components/world/WorldTransition.vue"
ART="$SRC_DIR/utils/world-art.js"
PERSONA_UTIL="$SRC_DIR/utils/persona.js"
WORLD_CSS="$SRC_DIR/styles/world.css"
PAGES_JSON="$SRC_DIR/pages.json"
API_JS="$SRC_DIR/api/index.js"
APP_VUE="$SRC_DIR/App.vue"
LOGIN_VUE="$SRC_DIR/pages/login/login.vue"
REG_VUE="$SRC_DIR/pages/register/index.vue"
TOKENS="$ROOT_DIR/styles/tokens/themes/persona-world.css"

for f in "$WORLD_VUE" "$ORG_TWIN_VUE" "$LW" "$PC" "$OC" "$IS" "$WT" "$ART" "$PERSONA_UTIL" "$WORLD_CSS"; do
  ok_file "$f" "源码在册：${f#$ROOT_DIR/}"
done

# ---------------------------------------------------------------------------
echo
echo "== §2. N1 登录落点 = 人本世界 =="
FIRST_PAGE="$(node -e 'const p=require(process.argv[1]);console.log(p.pages[0].path)' "$PAGES_JSON" 2>/dev/null)"
ok_if "$FIRST_PAGE" "pages/world/index" "pages.json 首页 = pages/world/index（启动即世界）"
ok_not_has "$(cat "$PAGES_JSON")" "workbench" "pages.json 不再注册工作台页"
ok_has "$(cat "$PAGES_JSON")" "pages/org-twin/index" "pages.json 注册组织孪生占位页"
[ -e "$SRC_DIR/pages/workbench" ] && fail "pages/workbench 目录仍在" || pass "pages/workbench 目录已删（工作台并表）"

ok_has "$(cat "$APP_VUE")" "/pages/world/index" "App.vue 守卫：已登录 → 世界"
ok_has "$(cat "$APP_VUE")" "publicRoutes" "App.vue 守卫：公开路由白名单仍在（登录/注册）"
ok_has "$(cat "$LOGIN_VUE")" "/pages/world/index" "登录成功 → 世界（login.vue）"
ok_has "$(cat "$REG_VUE")" "/pages/world/index" "注册成功 → 世界（register/index.vue）"

LEAK_REF="$(grep -rn "pages/workbench" "$SRC_DIR" 2>/dev/null | wc -l | tr -d ' ')"
ok_if "$LEAK_REF" "0" "全 src 零 workbench 引用（旧落点无残留）"

ok_has "$(cat "$WORLD_VUE")" "退出登录" "世界里保留退出登录（身份动作）"
ok_has "$(cat "$WORLD_VUE")" 'data-console' "世界里保留运营后台独立入口（世界之外）"
ok_has "$(cat "$WORLD_VUE")" "运营后台：独立入口，留在世界之外" "源码注明「运营后台留在世界之外」的口径"

# ---------------------------------------------------------------------------
echo
echo "== §3. N2 SVG 拟真（7 场景 + 生活全景 + 人物）=="
STRUCTS="$(node -e '
const fs=require("fs");const t=fs.readFileSync(process.argv[1],"utf8");
const m=t.match(/const STRUCTURES\s*=\s*\{([\s\S]*?)\n\}/);
const keys=m?[...m[1].matchAll(/^\s{2}([a-zA-Z]+)\s*\(/gm)].map(x=>x[1]):[];
console.log(keys.join(","))' "$ART" 2>/dev/null)"
ok_if "$STRUCTS" "home,dining,academy,work,social,travel,wellness" "场景结构 7 个（居所/餐饮/学习/工作/社交/出行/健康）"
ok_has "$(cat "$ART")" "export function structureFor" "按场景码取画法（structureFor）"
ok_has "$(cat "$ART")" "营地" "未知场景码有兜底画法（不因新码空白）"
ok_has "$(cat "$ART")" "export function scenePoint" "场景坐标由 posX/posY 百分比映射（不写死像素）"
ok_has "$(cat "$ART")" "export function personMarker" "人物标记（世界里的位置）"
ok_has "$(cat "$ART")" "export function buildPortrait" "人物肖像（写实描摹）"
ok_has "$(cat "$LW")" "点场景 → 选意向 → 走进模块" "全景图例写明交互口径"

NODE_TAGS="$(node -e '
const fs=require("fs");
const files=process.argv.slice(1);
const DENY=/<\/?(text|image|button|foreignObject|use|tspan|textPath|iframe|canvas|video|audio|input)\b/;
let bad=[];
for(const f of files){
  const src=fs.readFileSync(f,"utf8");
  for(const m of src.matchAll(/<svg[\s\S]*?<\/svg>/g)){
    const hit=m[0].match(DENY);
    if(hit) bad.push(f.split("/").pop()+":"+hit[1]);
  }
}
console.log(bad.join(","));' "$LW" "$PC" "$WT" 2>/dev/null)"
ok_if "$NODE_TAGS" "" "SVG 内只用几何 primitive（无 text/image/foreignObject 等组件标签）"

THREE_REF="$(grep -rniE "three|babylon|webgl|canvas3d" "$SRC_DIR/components/world" "$SRC_DIR/pages/world" "$ART" 2>/dev/null | wc -l | tr -d ' ')"
ok_if "$THREE_REF" "0" "无 3D 依赖（2D/SVG 拟真，不做 3D）"
ok_has "$(cat "$LW")" 'aspect-ratio' "全景画布按 viewBox 比例自适（瓷砖对齐）"
ok_has "$(cat "$WORLD_CSS")" "prefers-reduced-motion" "过场/动效尊重减少动效偏好"

# ---------------------------------------------------------------------------
echo
echo "== §4. N3 场景 / 意向驱动 =="
ok_has "$(cat "$LW")" ':data-scene=' "场景热区带 data-scene（可点）"
ok_has "$(cat "$IS")" "const isOutside" "意向面板排除世界之外的类别（运营/工具）"
ok_has "$(cat "$IS")" "state: 'open'" "意向可「走进」（已接通）"
ok_has "$(cat "$IS")" "state: 'optin'" "意向可「开通」（需选用）"
ok_has "$(cat "$IS")" "state: 'gated'" "意向可为「即将接入」（入口未接通）"
ok_has "$(cat "$IS")" "这一处还在建设中" "未开放场景有「建设中」空态"
ok_has "$(cat "$WORLD_VUE")" "activeSceneCode" "点场景 → 记录当前场景 → 意图面板"
ok_has "$(cat "$WORLD_VUE")" "@open=\"openModule\"" "意向 → 打开模块"
ok_has "$(cat "$WORLD_VUE")" "@apply=\"toggleModule\"" "意向 → 申请/开通模块"
GRID_REF="$(grep -rniE "module-grid|icon-wall|应用图标墙|app-grid" "$SRC_DIR/pages/world" "$SRC_DIR/components/world" 2>/dev/null | wc -l | tr -d ' ')"
ok_if "$GRID_REF" "0" "无应用图标墙（模块以「常去的地方/世界扩展」形态出现）"
ok_has "$(cat "$WORLD_VUE")" "m.entryUrl" "场景「N 个去处」只数入口已接通的业务类模块（不谎报去处）"
ok_has "$(cat "$WORLD_VUE")" "personScene" "人物随场景移动（纯视图态）"

# ---------------------------------------------------------------------------
echo
echo "== §5. N4 单一真源 + 降级 =="
API_SRC="$(cat "$API_JS")"
for ep in "/api/context/me" "/api/world" "/api/organizations/mine" "/api/twin/me"; do
  ok_has "$API_SRC" "$ep" "读面只用 W1：$ep"
done
ok_has "$API_SRC" "export async function activationContext" "api 导出 activationContext"
ok_has "$API_SRC" "export async function worldScenes" "api 导出 worldScenes"
ok_has "$API_SRC" "export async function myOrganizations" "api 导出 myOrganizations"
ok_has "$API_SRC" "export async function twinMe" "api 导出 twinMe"
SCENE_LIT="$(grep -cE "'(home|dining|academy|work|social|travel|wellness)'" "$WORLD_VUE" "$LW" "$IS" 2>/dev/null | awk -F: '{s+=$2}END{print s+0}')"
ok_if "$SCENE_LIT" "0" "场景清单不写死在页面/组件（一律取 /api/world 下发）"
ok_has "$(cat "$WORLD_VUE")" "worldFailed" "生活场景来源可降级"
ok_has "$(cat "$WORLD_VUE")" "modulesFailed" "模块目录来源可降级"
ok_has "$(cat "$WORLD_VUE")" "orgsFailed" "组织归属来源可降级"
ok_has "$(cat "$WORLD_VUE")" "twinsFailed" "孪生状态来源可降级"
ok_has "$(cat "$WORLD_VUE")" "部分数据未取到" "降级有可见告警（不静默空世界）"
ok_has "$(cat "$WORLD_VUE")" "context.value.orgs" "组织归属有同真源降级路径（context/me 也带 orgs）"
ok_not_has "$(cat "$WORLD_VUE")" "energy" "不臆造「精力」等 W1 未暴露字段"

# ---------------------------------------------------------------------------
echo
echo "== §6. N5 组织入口卡 → 组织孪生占位页 =="
ok_has "$(cat "$OC")" ':data-org=' "组织卡带 data-org"
ok_has "$(cat "$OC")" "我的角色" "组织卡显示角色"
ok_has "$(cat "$PERSONA_UTIL")" "orgTypeLabel" "组织类型走展示字典"
ok_has "$(cat "$WORLD_VUE")" "openOrgTwin" "组织卡 → 组织孪生"
ok_has "$(cat "$WORLD_VUE")" "/pages/org-twin/index?id=" "跳转带 org id"
ok_has "$(cat "$ORG_TWIN_VUE")" "myOrganizations()" "占位页同取 organizations/mine（不造第二真源）"
ok_has "$(cat "$ORG_TWIN_VUE")" "组织孪生不是组织树" "占位页写明口径（≠组织树 / ≠人的孪生镜像）"
ok_has "$(cat "$ORG_TWIN_VUE")" "待建" "孪生六面标为待建"

# ---------------------------------------------------------------------------
echo
echo "== §7. N6 工作台并入 =="
ok_has "$(cat "$WORLD_VUE")" "常去的地方" "原模块卡 → 「常去的地方」"
ok_has "$(cat "$WORLD_VUE")" "世界扩展" "原插件/开通区 → 「世界扩展」"
ok_has "$(cat "$WORLD_VUE")" "enableModule" "开通仍走 /api/modules/:code/enable"
ok_has "$(cat "$WORLD_VUE")" "disableModule" "收起仍走 /api/modules/:code/disable"
ok_has "$(cat "$WORLD_VUE")" "listModuleDimensions" "区域/行业维度选择器保留"
ok_has "$(cat "$WORLD_VUE")" "WORLD_CATEGORIES = ['business']" "世界只收生活/经营类模块"

# ---------------------------------------------------------------------------
echo
echo "== §8. N7 零裸色（W2 表层三重 grep）+ 令牌自洽 =="
# 令牌层是色彩真源（styles/tokens/**），允许字面量；W2 表层（世界页面/组件/样式）必须零字面量。
W2_FILES="$WORLD_VUE $ORG_TWIN_VUE $LW $PC $OC $IS $WT $WORLD_CSS $ART $PERSONA_UTIL"
HEX_HITS="$(grep -nE '#[0-9a-fA-F]{3,8}\b' $W2_FILES 2>/dev/null | wc -l | tr -d ' ')"
ok_if "$HEX_HITS" "0" "hex 裸色 0 处（W2 表层）"
RGB_HITS="$(grep -nE '\brgba?\(' $W2_FILES 2>/dev/null | wc -l | tr -d ' ')"
ok_if "$RGB_HITS" "0" "rgb/rgba 裸色 0 处（W2 表层）"
NAMED_HITS="$(grep -nE ':[[:space:]]*(white|black|red|blue|green|gray|grey|orange|yellow|purple)[[:space:]]*[;!}]' $W2_FILES 2>/dev/null | wc -l | tr -d ' ')"
ok_if "$NAMED_HITS" "0" "具名色 0 处（W2 表层）"
ok_has "$(cat "$WORLD_CSS")" 'var(--world-' "几何类取值全部走世界令牌"

VAR_JSON="$TMP_DIR/vars.json"
node -e '
const fs=require("fs"),path=require("path");
const W2=process.argv.slice(1);
const strip=(t)=>t.replace(/\/\*[\s\S]*?\*\//g,"").replace(/(^|[^:])\/\/.*$/gm,"$1");
const glob=(d)=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?glob(path.join(d,e.name)):[path.join(d,e.name)]);
const cssAll=[...glob("styles"),...W2].filter(f=>f.endsWith(".css"));
const declared=new Set();
for(const f of cssAll) for(const m of strip(fs.readFileSync(f,"utf8")).matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) declared.add(m[1]);
const missing=new Map();
for(const f of W2){
  for(const m of strip(fs.readFileSync(f,"utf8")).matchAll(/var\((--[a-zA-Z0-9-]+)/g)){
    if(!declared.has(m[1])) missing.set(m[1], path.basename(f));
  }
}
console.log(JSON.stringify({ declared: declared.size, missing: [...missing].map(([k,v])=>k+"@"+v) }));
' $W2_FILES > "$VAR_JSON" 2>/dev/null
MISSING="$(node -e 'const j=require(process.argv[1]);console.log(j.missing.join(","))' "$VAR_JSON" 2>/dev/null)"
ok_if "$MISSING" "" "无「用了但没声明」的 var(--…)（W2 表层 × styles/tokens）"

# ---------------------------------------------------------------------------
echo
echo "== §9. 真浏览器 E2E（学生身份）=="
E2E_JS="$TMP_DIR/e2e.cjs"
cat > "$E2E_JS" <<'NODEEOF'
const { chromium } = require(process.env.PW_CORE)
const BASE = process.argv[2]
const MODE = process.argv[3] || 'student'
const USER = process.env.E2E_IDENTIFIER
const PASS = process.env.E2E_PASSWORD
const ERRORS = []
const emit = (k, v) => console.log('RESULT ' + k + ' ' + String(v).replace(/\s+/g, ' ').trim().slice(0, 380))
const note = (s) => console.log('# ' + s)

function watch(page, tag, consoleToo) {
  page.on('pageerror', (e) => ERRORS.push(tag + '|pageerror|' + e.message))
  if (consoleToo === false) return
  page.on('console', (m) => { if (m.type() === 'error') ERRORS.push(tag + '|console|' + m.text()) })
}
async function open(browser, viewport) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1280, height: 900 }, ignoreHTTPSErrors: true })
  const page = await ctx.newPage()
  return { ctx, page }
}
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
const t = (page, sel) => page.evaluate((s) => (document.querySelector(s) ? document.querySelector(s).innerText : ''), sel)
const all = (page, sel, attr) => page.$$eval(sel, (els, a) => els.map((e) => e.getAttribute(a)), attr)
async function sheet(page, code) {
  await page.click('[data-scene="' + code + '"]')
  await page.waitForSelector('.intent-sheet', { timeout: 12000 })
  const text = await t(page, '.intent-sheet')
  const mods = await all(page, '.intent-sheet [data-module]', 'data-module')
  return { text, mods }
}
async function closeSheet(page) {
  await page.click('.is-close')
  await page.waitForTimeout(300)
}
/** 从外部模块返回世界后，把仍开着的意向面板收起来（否则它盖住世界，后续点击会被拦截）。 */
async function backToWorld(page) {
  await page.goBack()
  await page.waitForSelector('.lw-canvas', { timeout: 20000 })
  if (await page.$('.intent-sheet')) await closeSheet(page)
  await page.waitForTimeout(300)
}
async function waitUrl(page, part, ms) {
  const until = Date.now() + (ms || 15000)
  while (Date.now() < until) {
    if (page.url().includes(part)) return true
    await page.waitForTimeout(150)
  }
  return false
}
/** 世界表层共用的观察点（场景/人物/组织/常去的地方 + 越权泄漏面）。 */
async function observe(page, prefix) {
  const svg = await page.evaluate(() => {
    const s = document.querySelector('.lw-svg')
    const q = (n) => (s ? s.querySelectorAll(n).length : 0)
    return { polygon: q('polygon'), path: q('path'), circle: q('circle'), ellipse: q('ellipse'), rect: q('rect') }
  })
  for (const k of Object.keys(svg)) emit(prefix + '_' + k, svg[k])
  emit(prefix + '_hot', (await all(page, '[data-scene]', 'data-scene')).length)
  emit(prefix + '_chips', (await all(page, '[data-scene-chip]', 'data-scene-chip')).length)
  emit(prefix + '_chips_soon', (await page.$$eval('[data-scene-chip]', (els) => els.filter((e) => /建设中/.test(e.innerText)).length)))
  emit(prefix + '_me', (await t(page, '.lw-me')).trim())
  emit(prefix + '_legend', (await t(page, '.lw-legend')).replace(/\n/g, ' '))
  emit(prefix + '_persona', (await t(page, '.persona-card')).replace(/\n/g, ' · '))
  emit(prefix + '_portrait', (await page.$$eval('.pc-portrait *', (els) => els.length)))
  emit(prefix + '_orgs', (await all(page, '[data-org]', 'data-org')).length)
  emit(prefix + '_org_first', (await t(page, '.org-card')).replace(/\n/g, ' · '))
  emit(prefix + '_places', (await all(page, '[data-place]', 'data-place')).join(','))
  emit(prefix + '_exts', (await all(page, '[data-ext]', 'data-ext')).join(','))
  emit(prefix + '_console_btns', (await all(page, '[data-console]', 'data-console')).join(','))
  // 类别边界（从同一真源 /api/modules 现算）：世界之内只许 business；顶栏独立入口只许 admin/tool
  const inv = await page.evaluate(async () => {
    let tok = ''
    try { tok = JSON.parse(localStorage.getItem('gri-auth-token') || '{}').accessToken || '' } catch (e) { tok = '' }
    const mods = await (await fetch('/api/modules', { headers: tok ? { Authorization: 'Bearer ' + tok } : {} })).json()
    const cat = new Map(mods.map((m) => [m.code, m.category]))
    const worldCodes = [...document.querySelectorAll('[data-place],[data-ext]')].map((e) => e.getAttribute('data-place') || e.getAttribute('data-ext'))
    const consoleCodes = [...document.querySelectorAll('[data-console]')].map((e) => e.getAttribute('data-console'))
    return {
      world: worldCodes.join(','),
      console: consoleCodes.join(','),
      worldNonBiz: worldCodes.filter((c) => cat.get(c) && cat.get(c) !== 'business').join(','),
      consoleNotAdminTool: consoleCodes.filter((c) => cat.get(c) && !['admin', 'tool'].includes(cat.get(c))).join(','),
      nonBiz: [...cat].filter(([, v]) => v !== 'business').map(([k]) => k).join(',')
    }
  })
  emit(prefix + '_world_codes', inv.world)
  emit(prefix + '_world_nonbiz', inv.worldNonBiz)
  emit(prefix + '_console_notadmintool', inv.consoleNotAdminTool)
  emit(prefix + '_nonbiz_codes', inv.nonBiz)
  // 世界之内（全景 + 我的组织 + 常去的地方）不得出现运营模块文案
  const inWorld = await page.evaluate(() => {
    const parts = ['.lw-frame', '.wp-orgs', '.wp-places', '.wp-exts']
    return parts.map((s) => (document.querySelector(s) ? document.querySelector(s).innerText : '')).join(' | ')
  })
  emit(prefix + '_inworld_admin', /组织管理台|运营后台|开发全流程统计/.test(inWorld) ? 'yes' : 'no')
  emit(prefix + '_workbench_gone', (await page.$$eval('.workbench-page, .module-grid, .apps-grid', (e) => e.length)) === 0 ? 'yes' : 'no')
}

;(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] })

  if (MODE === 'student') {
    const { page } = await open(browser)
    watch(page, 'student')
    await login(page)
    emit('landing_url', page.url())
    emit('landing_is_world', (await page.$('.lw-canvas')) ? 'yes' : 'no')
    note('登录后落点：' + page.url())
    await observe(page, 's')

    // 餐饮 → 意向 → food（打桩，不真跳站点）
    await page.route('**/food/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>FOOD-STUB</body></html>' }))
    const dining = await sheet(page, 'dining')
    emit('dining_sheet', dining.text)
    emit('dining_mods', dining.mods.join(','))
    const tokenShape = await page.evaluate(() => {
      const v = localStorage.getItem('gri-auth-token')
      return v && v.length > 10 ? 'present' : 'absent'
    })
    emit('sso_token', tokenShape)
    await page.click('.intent-sheet [data-module="food"]')
    emit('food_nav', (await waitUrl(page, '/food/')) ? 'yes' : 'no')
    emit('food_stub', (await t(page, 'body')).includes('FOOD-STUB') ? 'yes' : 'no')

    // 学习 → tutor（打桩）
    await login(page)
    await page.route('**/tutor/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>TUTOR-STUB</body></html>' }))
    const academy = await sheet(page, 'academy')
    emit('academy_sheet', academy.text)
    emit('academy_mods', academy.mods.join(','))
    await page.click('.intent-sheet [data-module="tutor"]')
    emit('tutor_nav', (await waitUrl(page, '/tutor/')) ? 'yes' : 'no')

    // 未开放场景：出行（无任何去处）
    await login(page)
    const travel = await sheet(page, 'travel')
    emit('travel_sheet', travel.text)
    emit('travel_mods', travel.mods.join(','))
    await closeSheet(page)

    // 工作场景（学生身份）：世界内不出现运营模块
    const work = await sheet(page, 'work')
    emit('s_work_sheet', work.text)
    emit('s_work_mods', work.mods.join(','))
    await closeSheet(page)

    // 降级：/api/world 与 /api/twin/me 打 500
    const { page: dp } = await open(browser)
    watch(dp, 'degrade', false) // 本段故意打 500，控制台的 "Failed to load resource" 是预期噪音；pageerror 仍计
    await dp.route('**/api/world', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }))
    await dp.route('**/api/twin/me', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' }))
    await login(dp)
    emit('degrade_alert', (await t(dp, '.wp-alert')).replace(/\n/g, ' · '))
    emit('degrade_veil', (await t(dp, '.lw-veil')).replace(/\n/g, ' · '))
    emit('degrade_world_kept', (await dp.$('.lw-canvas')) ? 'yes' : 'no')
    emit('degrade_persona_kept', (await dp.$('.persona-card')) ? 'yes' : 'no')

    // 移动端单列
    const { page: mp } = await open(browser, { width: 390, height: 844 })
    watch(mp, 'mobile')
    await login(mp)
    const mobile = await mp.evaluate(() => {
      const cols = document.querySelector('.wp-cols')
      const scroll = document.querySelector('.lw-scroll')
      const cv = document.querySelector('.lw-canvas')
      return {
        cols: cols ? getComputedStyle(cols).gridTemplateColumns : '',
        overflowX: scroll ? getComputedStyle(scroll).overflowX : '',
        canvasW: cv ? Math.round(cv.getBoundingClientRect().width) : 0,
        docOverflow: Math.round(document.documentElement.scrollWidth - document.documentElement.clientWidth)
      }
    })
    emit('m_cols', mobile.cols.split(' ').length)
    emit('m_overflowX', mobile.overflowX)
    emit('m_canvas_w', mobile.canvasW)
    emit('m_doc_overflow', mobile.docOverflow)
    const mText = await t(mp, '.wp-header')
    emit('m_header', mText.replace(/\n/g, ' · '))
    const mSheet = await sheet(mp, 'dining')
    emit('m_sheet_ok', mSheet.mods.join(','))
  }

  if (MODE === 'operator') {
    const { page } = await open(browser)
    watch(page, 'operator')
    await login(page)
    await observe(page, 'o')

    // 运营后台独立入口（世界之外）
    await page.click('[data-console="org-admin"]')
    emit('console_nav', (await waitUrl(page, '/pages/console/index')) ? 'yes' : 'no')
    await page.waitForTimeout(1200)
    emit('console_text', (await t(page, 'body')).slice(0, 120))
    await backToWorld(page)

    // 工作场景：世界之外的出口
    const work = await sheet(page, 'work')
    emit('o_work_sheet', work.text)
    emit('o_work_mods', work.mods.join(','))
    const outside = await page.$('.is-outside-btn')
    if (outside) {
      await outside.click()
      emit('o_work_console_nav', (await waitUrl(page, '/pages/console/index')) ? 'yes' : 'no')
      await backToWorld(page)
    } else {
      emit('o_work_console_nav', 'no-button')
    }

    // 组织孪生占位页
    const orgId = (await all(page, '[data-org]', 'data-org'))[0]
    await page.click('[data-org="' + orgId + '"]')
    await page.waitForSelector('.org-twin-page', { timeout: 15000 })
    await page.waitForTimeout(700)
    emit('org_twin_text', (await t(page, '.org-twin-page')).replace(/\n/g, ' · '))
    emit('org_twin_id', orgId)
    await page.click('.ot-back')
    await page.waitForSelector('.lw-canvas', { timeout: 15000 })

    // 世界扩展：开通 → 持久 → 收起（还原）
    const extCode = await page.evaluate(() => {
      const el = document.querySelector('[data-ext="curriculum"]') || document.querySelector('[data-ext]')
      return el ? el.getAttribute('data-ext') : ''
    })
    emit('optin_code', extCode)
    if (extCode) {
      const btn = '[data-ext="' + extCode + '"]'
      await page.click(btn)
      await page.waitForTimeout(1500)
      emit('optin_after', (await t(page, btn)).trim())
      emit('optin_places', (await all(page, '[data-place]', 'data-place')).join(','))
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForSelector('.lw-canvas', { timeout: 25000 })
      await page.waitForTimeout(1200)
      emit('optin_persisted', (await t(page, btn)).trim())
      await page.click(btn)
      await page.waitForTimeout(1500)
      emit('optin_restored', (await t(page, btn)).trim())
    }
  }

  emit('errors', ERRORS.length)
  ERRORS.slice(0, 12).forEach((e) => note('ERR ' + e))
  await browser.close()
})().catch((e) => {
  emit('fatal', e.message)
  emit('errors', ERRORS.length + 1)
  process.exit(0)
})
NODEEOF

# 静态托管 + /api /auth 反代（同源，避免跨域）
cat > "$TMP_DIR/serve.cjs" <<'NODEEOF'
const http = require('http'), https = require('https'), fs = require('fs'), path = require('path')
const DIST = process.argv[2], PORT = Number(process.argv[3]), UPSTREAM = process.argv[4] || 'https://localhost'
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.map': 'application/json; charset=utf-8' }
function proxy(req, res) {
  const target = new URL(req.url, UPSTREAM)
  const up = https.request({ hostname: target.hostname, port: target.port || 443, path: target.pathname + target.search, method: req.method, headers: { ...req.headers, host: 'localhost' }, rejectUnauthorized: false }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res) })
  up.on('error', (e) => { res.writeHead(502, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: String(e && e.message) })) })
  req.pipe(up)
}
http.createServer((req, res) => {
  if (req.url.startsWith('/api/') || req.url.startsWith('/auth/')) return proxy(req, res)
  let rel = decodeURIComponent(req.url.split('?')[0])
  if (!rel.startsWith('/portal/')) { res.writeHead(404); return res.end('not found') }
  rel = rel.slice('/portal/'.length)
  if (rel === '' || rel.endsWith('/')) rel += 'index.html'
  const file = path.join(DIST, rel)
  if (!file.startsWith(DIST)) { res.writeHead(403); return res.end('forbidden') }
  fs.readFile(file, (err, buf) => {
    if (err) return fs.readFile(path.join(DIST, 'index.html'), (e2, html) => { if (e2) { res.writeHead(404); return res.end('not found') } res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html) })
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' })
    res.end(buf)
  })
}).listen(PORT, '127.0.0.1', () => console.log('READY'))
NODEEOF

node "$TMP_DIR/serve.cjs" "$DIST_DIR" "$TEST_PORT" "https://localhost" >"$TMP_DIR/serve.log" 2>&1 &
SERVER_PID=$!
sleep 2
E2E_BASE="http://127.0.0.1:$TEST_PORT/portal/"
HTTP_E2E="$(curl -s -o /dev/null -w '%{http_code}' "$E2E_BASE" || echo 000)"
ok_if "$HTTP_E2E" "200" "E2E 静态托管可达（$E2E_BASE）"

STU_OUT="$TMP_DIR/student.out"
if [ "$HTTP_E2E" = "200" ]; then
  PW_CORE="$PW_CORE" E2E_IDENTIFIER="$E2E_IDENTIFIER" E2E_PASSWORD="$E2E_PASSWORD" \
    node "$E2E_JS" "$E2E_BASE" student >"$STU_OUT" 2>&1
  grep '^#' "$STU_OUT" | sed 's/^/      /'
  grep '^RESULT' "$STU_OUT" | sed 's/^RESULT /      · /' | cut -c1-200
  res_eq landing_is_world "$STU_OUT" "yes" "9.1 登录成功 → 人本世界（非模块卡列表）"
  res_eq s_workbench_gone "$STU_OUT" "yes" "9.1 世界页不含工作台卡片墙"
  ok_has "$(rget landing_url "$STU_OUT")" "/portal/" "9.1 落点在门户内（未跳外站）"
  res_has s_persona "$STU_OUT" "掌握度" "9.3 人物卡显示状态（掌握度）"
  res_has s_persona "$STU_OUT" "LV." "9.3 人物卡显示档位（LV.n，按掌握度分档）"
  res_has s_persona "$STU_OUT" "经历" "9.3 人物卡显示经历"
  res_has s_persona "$STU_OUT" "组织" "9.3 人物卡显示组织数"
  res_has s_persona "$STU_OUT" "改名测试" "9.3 人物卡取 context/me 的姓名"
  res_has s_persona "$STU_OUT" "学生" "9.3 人物卡取 context/me 的角色"
  res_has s_persona "$STU_OUT" "掌握档位" "9.3 档位口径写明「按掌握度分档」"
  ok_ge "$(rget s_polygon "$STU_OUT")" 60 "9.3 生活全景：等距体块（polygon ≥ 60）"
  ok_ge "$(rget s_path "$STU_OUT")" 60 "9.3 生活全景：描摹线与路网（path ≥ 60）"
  ok_ge "$(rget s_ellipse "$STU_OUT")" 80 "9.3 生活全景：植被/光晕（ellipse ≥ 80）"
  res_eq s_hot "$STU_OUT" "7" "9.3 七个生活场景热区"
  res_eq s_chips "$STU_OUT" "7" "9.3 七个场景标签"
  ok_ge "$(rget s_chips_soon "$STU_OUT")" 4 "9.3 未开放场景标「建设中」"
  res_has s_me "$STU_OUT" "我在这里" "9.3 全景里有人物位置"
  ok_ge "$(rget s_portrait "$STU_OUT")" 20 "9.3 人物肖像为手绘描摹（portrait prims ≥ 20）"
  res_eq s_orgs "$STU_OUT" "3" "9.4 组织卡列出 organizations/mine 全部组织（3）"
  res_has s_org_first "$STU_OUT" "示例学校" "9.4 组织卡显示名称"
  res_has s_org_first "$STU_OUT" "学校" "9.4 组织卡显示类型"
  res_has s_org_first "$STU_OUT" "我的角色" "9.4 组织卡显示我的角色"
  res_eq s_places "$STU_OUT" "food,tutor" "9.5 常去的地方 = 登录身份的核心模块（food,tutor）"
  ok_has "$(rget s_exts "$STU_OUT")" "curriculum" "9.5 世界扩展列出可选模块"
  ok_set "$(rget s_world_codes "$STU_OUT")" "food,tutor,curriculum,agent,twin" "9.5 世界之内 = 该身份的全部 business 模块"
  res_eq s_world_nonbiz "$STU_OUT" "" "9.2 未见未授权/越界模块（世界之内零 admin/tool）"
  res_eq s_console_btns "$STU_OUT" "" "9.2 学生身份世界内无运营入口"
  res_eq s_console_notadmintool "$STU_OUT" "" "9.2 独立入口只收 admin/tool（此处空 = 无越界）"
  res_eq s_inworld_admin "$STU_OUT" "no" "9.2 世界之内不出现运营模块文案"
  res_has dining_sheet "$STU_OUT" "我想吃饭" "9.6 点「餐饮」→ 意向（我饿了/订午饭同一处）"
  res_has dining_sheet "$STU_OUT" "订餐平台" "9.6 意向指向订餐平台"
  res_eq dining_mods "$STU_OUT" "food" "9.6 餐饮意向只给 food（未授权不进）"
  res_eq sso_token "$STU_OUT" "present" "9.6 令牌在本地存储（过了过场即免二登）"
  res_eq food_nav "$STU_OUT" "yes" "9.6 走进 → 打开 food 模块"
  res_eq food_stub "$STU_OUT" "yes" "9.6 SSO 直达 food 入口页"
  res_has academy_sheet "$STU_OUT" "智学慧眼" "9.7 学习意向指向 tutor"
  ok_has "$(rget academy_mods "$STU_OUT")" "tutor" "9.7 学习场景含 tutor"
  res_eq tutor_nav "$STU_OUT" "yes" "9.7 走进 → 打开 tutor 模块"
  res_has travel_sheet "$STU_OUT" "建设中" "9.8 未开放场景（出行）显示「建设中」"
  res_eq travel_mods "$STU_OUT" "" "9.8 未开放场景无去处可点"
  res_has s_work_sheet "$STU_OUT" "建设中" "9.8 工作场景在学生身份下不给运营去处"
  res_not_has s_work_sheet "$STU_OUT" "org-admin" "9.8 工作场景不泄漏 org-admin"
  res_has degrade_alert "$STU_OUT" "生活场景" "9.9 降级：/api/world 断→告警点名该来源"
  res_has degrade_alert "$STU_OUT" "孪生状态" "9.9 降级：/api/twin/me 断→告警点名该来源"
  res_eq degrade_world_kept "$STU_OUT" "yes" "9.9 降级：全景仍在（空世界可见，不白屏）"
  ok_has "$(rget degrade_veil "$STU_OUT")" "暂不可用" "9.9 降级：世界提示文案（veil）"
  res_eq degrade_persona_kept "$STU_OUT" "yes" "9.9 降级：人物卡仍在（身份不因孪生断而消失）"
  res_eq m_cols "$STU_OUT" "1" "§10 移动端 390px：两栏收为单列"
  res_eq m_overflowX "$STU_OUT" "auto" "§10 移动端：全景可横向平移（不裁切）"
  ok_ge "$(rget m_canvas_w "$STU_OUT")" 600 "§10 移动端：全景保持可辨识宽度"
  [ "$(rget m_doc_overflow "$STU_OUT")" -le 2 ] 2>/dev/null && pass "§10 移动端：页面无横向溢出（≤2px）" || fail "§10 移动端横向溢出「$(rget m_doc_overflow "$STU_OUT")」px"
  res_has m_header "$STU_OUT" "改名测试" "§10 移动端顶栏显示身份"
  ok_has "$(rget m_sheet_ok "$STU_OUT")" "food" "§10 移动端场景→意向可用"
  res_eq errors "$STU_OUT" "0" "9.10 学生链路 pageerror / console.error = 0"
else
  skip "门户不可达 → 跳过 §9/§10 浏览器段"
fi

# ---------------------------------------------------------------------------
echo
echo "== §11. 运营后台独立入口 + 世界内无运营模块（operator 身份）=="
if [ "$HTTP_E2E" != "200" ]; then
  skip "门户不可达 → 跳过 §11"
else
  ORIG_ROLE="$(docker exec "$PG_CT" psql -U postgres -d gri -tAc "select role from public.users where username='$E2E_IDENTIFIER'" 2>/dev/null | tr -d ' ')"
  if [ -z "$ORIG_ROLE" ]; then
    fail "取不到 $E2E_IDENTIFIER 的当前角色（无法做运营侧验证）"
  else
    echo "      （$E2E_IDENTIFIER 原角色 = $ORIG_ROLE；本节临时提为 operator，退出即还原）"
    export E2E_IDENTIFIER E2E_PASSWORD
    docker exec "$PG_CT" psql -U postgres -d gri -q -c "update public.users set role='operator', updated_at=now() where username='$E2E_IDENTIFIER'" >/dev/null 2>&1
    ROLE_TOUCHED=1
    EX_ID="$(docker exec "$PG_CT" psql -U postgres -d gri -tAc "select id from public.users where username='$E2E_IDENTIFIER'" 2>/dev/null | tr -d ' ')"
    [ -n "$EX_ID" ] && docker exec "$REDIS_CT" env -u REDISCLI_AUTH redis-cli del "ctx:user:$EX_ID" >/dev/null 2>&1
    ROLE_NOW="$(docker exec "$PG_CT" psql -U postgres -d gri -tAc "select role from public.users where username='$E2E_IDENTIFIER'" 2>/dev/null | tr -d ' ')"
    ok_if "$ROLE_NOW" "operator" "测试账号临时具备运营侧读面（trap 还原）"

    OP_OUT="$TMP_DIR/operator.out"
    PW_CORE="$PW_CORE" E2E_IDENTIFIER="$E2E_IDENTIFIER" E2E_PASSWORD="$E2E_PASSWORD" \
      node "$E2E_JS" "$E2E_BASE" operator >"$OP_OUT" 2>&1
    grep '^#' "$OP_OUT" | sed 's/^/      /'
    grep '^RESULT' "$OP_OUT" | sed 's/^RESULT /      · /' | cut -c1-200
    ok_has "$(rget o_console_btns "$OP_OUT")" "org-admin" "11.1 运营后台在顶栏有独立入口（data-console=org-admin）"
    ok_has "$(rget o_console_btns "$OP_OUT")" "ontology-stats" "11.1 工具类也走独立入口（不在世界之内）"
    res_eq console_nav "$OP_OUT" "yes" "11.1 点入口 → 进组织管理台（世界之外）"
    res_has console_text "$OP_OUT" "组织管理台" "11.1 组织管理台渲染成功"
    res_has o_work_sheet "$OP_OUT" "去运营后台" "11.2 工作场景给「世界之外的出口」"
    res_has o_work_sheet "$OP_OUT" "不在人本世界里" "11.2 出口文案写明运营去处不在世界内"
    res_eq o_work_console_nav "$OP_OUT" "yes" "11.2 出口可直接进运营后台"
    res_has o_work_mods "$OP_OUT" "dashboard" "11.2 工作场景含经营类去处（dashboard）"
    res_not_has o_work_mods "$OP_OUT" "org-admin" "11.2 运营去处不在世界的意向里（只在世界之外）"
    res_eq o_world_nonbiz "$OP_OUT" "" "11.3 世界之内不出现运营/工具模块（类别边界现算）"
    res_eq o_console_notadmintool "$OP_OUT" "" "11.3 独立入口只收 admin/tool"
    ok_set "$(rget o_console_btns "$OP_OUT")" "org-admin,ontology-stats" "11.3 独立入口 = 该身份的 admin/tool 有入口者"
    res_eq o_inworld_admin "$OP_OUT" "no" "11.3 世界之内无运营模块文案"
    res_has org_twin_text "$OP_OUT" "组织孪生 · 建设中" "11.4 组织卡 → 组织孪生占位页"
    res_has org_twin_text "$OP_OUT" "待建" "11.4 孪生六面标为待建"
    res_has org_twin_text "$OP_OUT" "不是组织树" "11.4 口径写明 ≠组织树"
    res_has org_twin_text "$OP_OUT" "示例学校" "11.4 占位页显示组织名（同真源）"
    res_has org_twin_text "$OP_OUT" "我的角色：创建者" "11.4 占位页显示我的角色"
    res_eq optin_after "$OP_OUT" "已开通" "11.5 世界扩展「开通」生效"
    ok_has "$(rget optin_places "$OP_OUT")" "curriculum" "11.5 开通后进入「常去的地方」"
    res_eq optin_persisted "$OP_OUT" "已开通" "11.5 开通可持久（刷新仍在）"
    res_eq optin_restored "$OP_OUT" "开通" "11.5 收起已还原（不残留测试状态）"
    res_eq errors "$OP_OUT" "0" "11.6 运营链路 pageerror / console.error = 0"

    # 现场还原（不是等 trap）：让 §12/§13 跑在原始角色上
    docker exec "$PG_CT" psql -U postgres -d gri -q -c "update public.users set role='$ORIG_ROLE', updated_at=now() where username='$E2E_IDENTIFIER'" >/dev/null 2>&1
    [ -n "$EX_ID" ] && docker exec "$REDIS_CT" env -u REDISCLI_AUTH redis-cli del "ctx:user:$EX_ID" >/dev/null 2>&1
    ROLE_TOUCHED=0
    ROLE_BACK="$(docker exec "$PG_CT" psql -U postgres -d gri -tAc "select role from public.users where username='$E2E_IDENTIFIER'" 2>/dev/null | tr -d ' ')"
    ok_if "$ROLE_BACK" "$ORIG_ROLE" "测试账号角色已还原为 $ORIG_ROLE"
  fi
fi

# ---------------------------------------------------------------------------
echo
echo "== §12. 凭据零泄漏 =="
# 产出物里不得出现口令/私钥字面量；脚本里口令只允许出现在 env 默认值一处。
LIST_CRED="$(grep -nE "test1234|BEGIN [A-Z ]*PRIVATE KEY|jwt_secret" "$OUT_DIR/w2-file-list.md" 2>/dev/null | wc -l | tr -d ' ')"
ok_if "$LIST_CRED" "0" "产出说明内无口令/私钥字面量"
SCRIPT_CRED="$(grep -nE "test1234|BEGIN [A-Z ]*PRIVATE KEY|jwt_secret" "$OUT_DIR/w2-verify.sh" 2>/dev/null \
  | grep -vE 'E2E_PASSWORD:-|TEST_PASSWORD|CRED_HIT=|LIST_CRED=|SCRIPT_CRED=' | wc -l | tr -d ' ')"
ok_if "$SCRIPT_CRED" "0" "验收脚本内口令只出现在 env 默认值一处（无硬编码凭据）"
ok_has "$(cat "$OUT_DIR/w2-verify.sh")" 'E2E_PASSWORD="${E2E_PASSWORD:-' "口令经环境变量注入（可覆盖）"
TOKEN_HIT="$(grep -rnE 'eyJ[A-Za-z0-9_-]{10,}\.' "$SRC_DIR/pages/world" "$SRC_DIR/components/world" "$SRC_DIR/utils/world-art.js" "$SRC_DIR/utils/persona.js" 2>/dev/null | wc -l | tr -d ' ')"
ok_if "$TOKEN_HIT" "0" "源码内无任何 JWT/令牌字面量"
ENV_IN_SRC="$(grep -rn "\.env" "$SRC_DIR/pages/world" "$SRC_DIR/components/world" 2>/dev/null | wc -l | tr -d ' ')"
ok_if "$ENV_IN_SRC" "0" "世界源码不读 .env（凭据只经统一客户端）"

# ---------------------------------------------------------------------------
echo
echo "== §13. 改动范围（不 commit / 不 checkout）=="
BRANCH_NOW="$(cd "$ROOT_DIR" && git rev-parse --abbrev-ref HEAD)"
ok_if "$BRANCH_NOW" "feat/stage-c-unified-auth-shell" "仍在原分支（未 checkout 别处）"
HEAD_SUBJECT="$(cd "$ROOT_DIR" && git log -1 --format='%s')"
ok_has "$HEAD_SUBJECT" "feat(persona-world): W1" "HEAD 仍是 W1 内核提交（W2 未 commit）"
STAGED="$(cd "$ROOT_DIR" && git diff --cached --name-only | wc -l | tr -d ' ')"
ok_if "$STAGED" "0" "暂存区为空（未 git add）"
ALLOW='^( M| D|\?\?) (apps/portal/src/(App\.vue|api/index\.js|main\.js|pages\.json|pages/login/login\.vue|pages/register/index\.vue|pages/workbench/index\.vue|pages/world/|pages/org-twin/|components/world/|styles/|utils/(persona|world-art)\.js)|styles/tokens/themes/persona-world\.css|\.agents/claude/outputs/w2-)'
OUT_OF_SCOPE="$(cd "$ROOT_DIR" && git status --porcelain | grep -vE "$ALLOW" | grep -vE '^\?\? (apps/portal/(dist|node_modules)/|\.agents/claude/tasks/)' || true)"
ok_if "$OUT_OF_SCOPE" "" "改动全部落在白名单内（无越界文件）"
[ -n "$OUT_OF_SCOPE" ] && echo "$OUT_OF_SCOPE" | sed 's/^/      /'
CHANGED_N="$(cd "$ROOT_DIR" && git status --porcelain | wc -l | tr -d ' ')"
echo "      改动条目：$CHANGED_N（详见 w2-file-list.md）"
ok_file "$OUT_DIR/w2-file-list.md" "产出物在册：.agents/claude/outputs/w2-file-list.md"

# ---------------------------------------------------------------------------
echo
echo "== §14. 未覆盖项（明示，不计 FAIL）=="
skip "「精力」：W1 任何读面（context/me、twin/me）都未暴露精力字段；按 N4「不造第二真源」不臆造，人物卡改以真状态环（掌握/学习中/薄弱）+ 掌握档位 LV.n 呈现"
skip "工作场景 → org-admin：按 N1（运营后台独立入口留在世界之外）+ 验收 5（世界内不出现运营模块），org-admin 从顶栏独立入口进；工作场景内的意向面板给「世界之外的出口」一跳，不把运营模块摆进世界"
skip "dashboard：模块注册表 entry_url 为空（未接通），世界里如实显示「即将接入」，不伪造入口"

echo
if [ "$FAIL" = 0 ]; then
  echo "PASS=$PASS FAIL=0 VERIFY_EXIT=0"
else
  echo "PASS=$PASS FAIL=$FAIL VERIFY_EXIT=1"
fi
