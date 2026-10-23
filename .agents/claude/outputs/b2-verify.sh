#!/usr/bin/env bash
# ============================================================================
# B-2 验收：对外契约 + 发布面 —— 让底座/业务 agent 真正「可被其他项目调用与使用」
# 依据：docs/AI_PRODUCTIZATION_OPTIONS.md §〇（缺口①/②）§七（裁决）+ .agents/claude/tasks/b2-public-contract.md
#
# 结构：
#   §1 v1 面可用         —— @Controller('v1/agent') 四条路由声明 + 已注册 + spec 真 HTTP 8/8
#   §2 旧面零回归(C1/C3) —— /api/agent/* 源文件 git diff 空（逐字节未改）+ 路由声明仍在
#   §3 SDK 契约(C5)      —— node --test：Bearer 头 / /api/v1/agent 基址 / 2xx 解析 / 非 2xx 结构化抛错 / 超时
#   §4 SDK 不依赖底座(C5) —— dependencies 无 @gri/agent-core；src 无 import 底座 / 无 env / 无明文
#   §5 发布面(目标3)     —— 两包 files+publishConfig 齐备；根包仍 private:true
#   §6 无远端副作用(C2)  —— 无 publish 脚本 / 无 .npmrc authToken / 无 .tgz 产物
#   §7 零回归(C1/验收7)  —— packages/agent-core node --test 全绿 + services/api tsc=0 + jest 全绿
#   §8 零明文(C7)        —— 变更文件无 nvapi-*/token 明文
# 末行打印「PASS=<n> FAIL=<m> VERIFY_EXIT=0」。
#
# 依赖：node ≥18；services/api 已 `npm i`（jest/tsc）。
# 用法： bash .agents/claude/outputs/b2-verify.sh
# ============================================================================
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
API_DIR="$ROOT_DIR/services/api"
CORE_DIR="$ROOT_DIR/packages/agent-core"
SDK_DIR="$ROOT_DIR/packages/agent-sdk"
AGENT_DIR="$API_DIR/src/modules/agent"
V1="$AGENT_DIR/agent-v1.controller.ts"
V1SPEC="$AGENT_DIR/agent-v1.controller.spec.ts"
OLDC="$AGENT_DIR/agent.controller.ts"
MOD="$AGENT_DIR/agent.module.ts"
DOC="$ROOT_DIR/docs/AGENT_PUBLIC_CONTRACT.md"

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); printf 'PASS  %s\n' "$1"; }
fail() { FAIL=$((FAIL + 1)); printf 'FAIL  %s\n' "$1"; }
has() { grep -qF "$2" "$1" 2>/dev/null; }

HELPER="$(mktemp /tmp/b2-helper.XXXXXX.mjs)"
trap 'rm -f "$HELPER" 2>/dev/null' EXIT
export B2_ROOT="$ROOT_DIR"

# ---------------------------------------------------------------------------
echo "== §1 v1 对外契约面可用（目标 1 / 验收 1）=="
[ -f "$V1" ] && pass "§1.0 agent-v1.controller.ts 存在" || fail "§1.0 缺 agent-v1.controller.ts"
has "$V1" "@Controller('v1/agent')" && pass "§1.1 控制器路径 v1/agent" || fail "§1.1 控制器路径不是 v1/agent"
has "$V1" "@Get('me')" && pass "§1.2 GET me" || fail "§1.2 缺 GET me"
has "$V1" "@Post('me/message')" && pass "§1.3 POST me/message" || fail "§1.3 缺 POST me/message"
has "$V1" "@Get('me/diagnosis')" && pass "§1.4 GET me/diagnosis" || fail "§1.4 缺 GET me/diagnosis"
has "$V1" "@Get('delegate/backends')" && pass "§1.5 GET delegate/backends" || fail "§1.5 缺 GET delegate/backends"
has "$V1" "req.auth.externalId" && pass "§1.6 所有权真源=req.auth.externalId（C4）" || fail "§1.6 未以 externalId 为真源"
has "$V1" "AGENT_CLI_BACKENDS" && has "$V1" "cliBackends?.list?.()" && pass "§1.7 backends 走 cliBackends.list()，无注册表回 []" || fail "§1.7 backends 未接 cliBackends.list()"
has "$MOD" "AgentV1Controller" && pass "§1.8 已注册进 AgentModule" || fail "§1.8 未注册进 AgentModule"
[ -f "$V1SPEC" ] && pass "§1.9 v1 契约 spec 存在" || fail "§1.9 缺 v1 契约 spec"

if [ -d "$API_DIR/node_modules" ]; then
  JEST_V1="$(cd "$API_DIR" && npx jest src/modules/agent/agent-v1.controller.spec.ts 2>&1)"
  if echo "$JEST_V1" | grep -qE 'Tests:.*8 passed'; then
    pass "§1.10 v1 spec 真 HTTP 路由注册 8/8（/api/v1/agent/* 可达）"
  else
    fail "§1.10 v1 spec 未全绿 :: $(echo "$JEST_V1" | grep -E 'Tests:' | tail -1)"
  fi
else
  fail "§1.10 services/api 未装依赖（node_modules 缺失）"
fi

# ---------------------------------------------------------------------------
echo "== §2 旧面零回归（C1/C3：/api/agent/* 路径与行为逐字节不变）=="
if git -C "$ROOT_DIR" diff --quiet HEAD -- services/api/src/modules/agent/agent.controller.ts; then
  pass "§2.1 agent.controller.ts 逐字节未改（git diff 空）"
else
  fail "§2.1 旧面 agent.controller.ts 被改动"
fi
has "$OLDC" "@Controller('agent')" && has "$OLDC" "@Post('me/message')" && has "$OLDC" "@Get('me')" \
  && pass "§2.2 旧面路由声明仍在（agent / me / me/message）" || fail "§2.2 旧面路由声明缺失"
# v1 面不得反向改旧面：新控制器文件不含 '@Controller('agent')'
if has "$V1" "@Controller('agent')"; then fail "§2.3 v1 文件重复声明旧控制器路径"; else pass "§2.3 v1 面只新增、不复制旧控制器路径"; fi
# 旧面业务逻辑复用而非复制：v1 只注入 AgentService
has "$V1" "private readonly agentService: AgentService" && pass "§2.4 v1 复用 AgentService（不复制业务逻辑）" || fail "§2.4 v1 未复用 AgentService"

# ---------------------------------------------------------------------------
echo "== §3 SDK 契约（目标 2 / 验收 3/4）=="
[ -f "$SDK_DIR/src/index.js" ] && pass "§3.0 agent-sdk src/index.js 存在" || fail "§3.0 缺 agent-sdk/src/index.js"
[ -f "$SDK_DIR/index.d.ts" ] && pass "§3.1 agent-sdk index.d.ts 存在（C10 类型同步）" || fail "§3.1 缺 index.d.ts"
[ -f "$SDK_DIR/tests/agent-sdk.test.js" ] && pass "§3.2 agent-sdk 测试存在" || fail "§3.2 缺 tests/agent-sdk.test.js"
has "$SDK_DIR/src/index.js" "Authorization: \`Bearer \${token}\`" && pass "§3.3 注入 Authorization: Bearer" || fail "§3.3 未注入 Bearer 头"
has "$SDK_DIR/src/index.js" "AGENT_API_PREFIX = '/api/v1/agent'" && pass "§3.4 基址前缀 /api/v1/agent" || fail "§3.4 基址前缀不对"
has "$SDK_DIR/src/index.js" "class AgentSdkError" && pass "§3.5 结构化错误 AgentSdkError" || fail "§3.5 缺结构化错误"
SDK_OUT="$(cd "$SDK_DIR" && npm test --silent 2>&1)"
SDK_SUM="$(echo "$SDK_OUT" | grep -oE '^(#|ℹ) ?(pass|fail) [0-9]+$' | tr '\n' ' ')"
if echo "$SDK_OUT" | grep -qE '^(#|ℹ) ?fail 0$'; then
  pass "§3.6 SDK node --test 全绿（$SDK_SUM）"
else
  fail "§3.6 SDK 测试未全绿 :: $SDK_SUM"
fi

# ---------------------------------------------------------------------------
echo "== §4 SDK 不依赖底座 / 零密钥（C5/C6）=="
if node -e 'const p=require(process.env.B2_ROOT+"/packages/agent-sdk/package.json");const d={...p.dependencies,...p.peerDependencies,...p.optionalDependencies};process.exit(Object.keys(d).includes("@gri/agent-core")?1:0)'; then
  pass "§4.1 agent-sdk dependencies 不含 @gri/agent-core"
else
  fail "§4.1 agent-sdk 依赖了 @gri/agent-core"
fi
if grep -qE "^[[:space:]]*(import|export)[^;]*['\"]@gri/agent-core['\"]" "$SDK_DIR/src/index.js"; then
  fail "§4.2 SDK src import 了底座"
else
  pass "§4.2 SDK src 不 import 底座"
fi
[ "$(grep -c 'process\.env' "$SDK_DIR/src/index.js" || true)" = "0" ] && pass "§4.3 SDK 不读 env（C6）" || fail "§4.3 SDK 读了 env"

# ---------------------------------------------------------------------------
echo "== §5 发布面（目标 3 / 验收 5）=="
cat > "$HELPER" <<'MJS'
import { readFileSync } from 'node:fs';
const root = process.env.B2_ROOT;
let p = 0, f = 0;
const pass = (l) => { p++; console.log(`PASS ${l}`); };
const fail = (l, d) => { f++; console.log(`FAIL ${l} :: ${d}`); };
const read = (rel) => JSON.parse(readFileSync(`${root}/${rel}`, 'utf8'));

for (const [label, rel, wantsFiles] of [
  ['agent-core', 'packages/agent-core/package.json', ['src', 'index.d.ts', 'README.md']],
  ['agent-sdk', 'packages/agent-sdk/package.json', ['src', 'index.d.ts', 'README.md']],
]) {
  const pkg = read(rel);
  const files = Array.isArray(pkg.files) ? pkg.files : [];
  const missing = wantsFiles.filter((x) => !files.includes(x));
  missing.length === 0
    ? pass(`§5 ${label} files 覆盖 ${wantsFiles.join('/')}`)
    : fail(`§5 ${label} files 缺 ${missing.join(',')}`);
  const cfg = pkg.publishConfig || {};
  cfg.registry && cfg.access === 'restricted'
    ? pass(`§5 ${label} publishConfig.registry+access=restricted`)
    : fail(`§5 ${label} publishConfig 不全 :: ${JSON.stringify(cfg)}`);
  // 不把 tests 发出去（只发必要面）
  files.includes('tests') ? fail(`§5 ${label} files 含 tests（不该发）`) : pass(`§5 ${label} files 不含 tests`);
}
const rootPkg = read('package.json');
rootPkg.private === true ? pass('§5 根 package.json 仍 private:true（C8）') : fail('§5 根包 private 被放开');
const sdk = read('packages/agent-sdk/package.json');
sdk.type === 'module' && typeof sdk.scripts?.test === 'string' && sdk.scripts.test.includes('node --test')
  ? pass('§5 agent-sdk type:module + scripts.test=node --test（照 auth-client 风格）')
  : fail('§5 agent-sdk 包约定不符');
console.log(`HELPER_DONE ${p} ${f}`);
MJS
HELPER_OUT="$(node "$HELPER" 2>&1)"
echo "$HELPER_OUT" | grep -E '^(PASS|FAIL) '
while IFS= read -r line; do
  case "$line" in
    "PASS "*) PASS=$((PASS + 1)) ;;
    "FAIL "*) FAIL=$((FAIL + 1)) ;;
  esac
done < <(echo "$HELPER_OUT" | grep -E '^(PASS|FAIL) ')

# ---------------------------------------------------------------------------
echo "== §6 无远端副作用（C2 / 验收 6）=="
if node -e 'const fs=require("fs");const ps=["package.json","packages/agent-core/package.json","packages/agent-sdk/package.json"];const bad=ps.filter(r=>{const s=JSON.parse(fs.readFileSync(process.env.B2_ROOT+"/"+r,"utf8")).scripts||{};return s.publish||s.prepublish||s.prepublishOnly||s.postpublish});process.exit(bad.length?1:0)'; then
  pass "§6.1 相关包无 publish/prepublish 脚本（不自动发远端）"
else
  fail "§6.1 存在 publish 系脚本"
fi
if git -C "$ROOT_DIR" ls-files | grep -qE '(^|/)\.npmrc$'; then
  NPMRC="$(git -C "$ROOT_DIR" ls-files | grep -E '(^|/)\.npmrc$')"
  if grep -qE '_authToken|_password' $NPMRC 2>/dev/null; then fail "§6.2 .npmrc 含 authToken 明文"; else pass "§6.2 .npmrc 无 authToken（若存在）"; fi
else
  pass "§6.2 仓库无纳管的 .npmrc"
fi
TGZ="$(find "$ROOT_DIR/packages" -maxdepth 2 -name '*.tgz' 2>/dev/null | head -3)"
[ -z "$TGZ" ] && pass "§6.3 无 npm pack 产物（*.tgz）" || fail "§6.3 存在 tarball：$TGZ"

# ---------------------------------------------------------------------------
echo "== §7 零回归（验收 7）=="
if [ -d "$CORE_DIR/node_modules" ] || [ -d "$ROOT_DIR/node_modules" ]; then
  CORE_OUT="$(cd "$CORE_DIR" && npm test --silent 2>&1)"
  CORE_OK="$(echo "$CORE_OUT" | grep -oE '^(#|ℹ) ?(pass|fail) [0-9]+$' | tr '\n' ' ')"
  if echo "$CORE_OUT" | grep -qE '^(#|ℹ) ?fail 0$'; then
    pass "§7.1 packages/agent-core node --test 全绿（$CORE_OK）"
  else
    fail "§7.1 agent-core 测试未全绿 :: $CORE_OK"
  fi
else
  fail "§7.1 依赖未安装，无法跑 agent-core 测试"
fi

if [ -d "$API_DIR/node_modules" ]; then
  if (cd "$API_DIR" && npx tsc --noEmit >/tmp/b2-tsc.log 2>&1); then
    pass "§7.2 services/api tsc --noEmit = 0"
  else
    fail "§7.2 services/api tsc 报错 :: $(head -3 /tmp/b2-tsc.log | tr '\n' ' ')"
  fi
  JEST_ALL="$(cd "$API_DIR" && npx jest 2>&1)"
  JEST_SUM="$(echo "$JEST_ALL" | grep -E '^Tests:' | tail -1)"
  if echo "$JEST_SUM" | grep -qE 'failed' || ! echo "$JEST_SUM" | grep -qE 'passed'; then
    fail "§7.3 services/api jest 有失败 :: $JEST_SUM"
  else
    pass "§7.3 services/api jest 全绿（$JEST_SUM）"
  fi
else
  fail "§7.2/7.3 services/api 未装依赖"
fi

# ---------------------------------------------------------------------------
echo "== §8 零明文（C7）=="
SCAN="$V1 $V1SPEC $MOD $SDK_DIR/src/index.js $SDK_DIR/index.d.ts $SDK_DIR/README.md $CORE_DIR/package.json $CORE_DIR/README.md $DOC"
if [ "$(grep -lE 'nvapi-[A-Za-z0-9]{6}|sk-[A-Za-z0-9]{20}' $SCAN 2>/dev/null | wc -l)" = "0" ]; then
  pass "§8.1 变更文件无密钥/token 明文"
else
  fail "§8.1 变更文件含疑似密钥明文"
fi
has "$DOC" "/api/v1/agent/me" && has "$DOC" "不兼容变更" && pass "§8.2 docs/AGENT_PUBLIC_CONTRACT.md 落地（v1 契约+版本策略）" || fail "§8.2 契约文档缺失或不全"

# ---------------------------------------------------------------------------
echo "------------------------------------------------------------------"
printf 'PASS=%d FAIL=%d VERIFY_EXIT=%d\n' "$PASS" "$FAIL" "$([ "$FAIL" = "0" ] && echo 0 || echo 1)"
[ "$FAIL" = "0" ]
