#!/usr/bin/env bash
# ============================================================================
# W2.5 验收：外部**非教育**插件 E2E —— 「按组件组装」这条命题的唯一硬证据
# 依据：docs/AGENT_SKILL_PLUGIN_CONTRACT.md §一/§四；plan W2.5 卡（干净检出→放目录+重启→可列可调；卸载即消失）
#
# 结构：
#   §1 干净检出       —— 默认 plugins/ 里**没有** weather.lookup（不装即不在）
#   §2 放目录         —— 把示例插件拷进一份 plugins 副本 → 重装 → weather 激活且 weather.lookup 可列
#   §3 可调           —— 经**真实 ToolRegistry**（生产同一路径）真调 weather.lookup → 返回真实结果
#   §4 卸载即消失     —— 移除该目录 → 重装 → weather.lookup 消失，且出厂工具仍在（P5 不退化）
#   §5 契约自检       —— 对**本样例源码文本**的自指断言（非通用守卫）：仅 require @gri/agent-core、无 env/密钥字面量、名非保留名
#   §6 零回归         —— plugin-host node --test + agent-core node --test + api tsc=0 + jest 全绿
# 末行打印「PASS=<n> FAIL=<m> VERIFY_EXIT=0」。
#
# 说明：为避免污染检出树，§2–§4 复制一份 plugins 到 services/api 下的临时目录（**同一 PATH 前缀**，
#       使插件内的 `require('@gri/agent-core')` 仍能向上解析到 api 的 node_modules），装入副本、跑完删除。
#
# 依赖：node ≥20；§1–§4 需 services/api 已构建 dist（脚本默认先 `nest build`）。
# 用法： bash .agents/claude/outputs/w2.5-verify.sh
#       W25_SKIP_BUILD=1       跳过 §0 构建（用现有 dist）
#       W25_SKIP_REGRESSION=1  跳过 §6 全量回归（离线/求快）
# ============================================================================
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
API_DIR="$ROOT_DIR/services/api"
CORE_DIR="$ROOT_DIR/packages/agent-core"
PH_DIR="$ROOT_DIR/packages/plugin-host"
EX="$API_DIR/plugins-examples/weather"

HELPER="$(mktemp /tmp/w25-helper.XXXXXX.cjs)"
trap 'rm -f "$HELPER" 2>/dev/null; rm -rf "$API_DIR"/.w25-e2e-* 2>/dev/null' EXIT

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); printf 'PASS  %s\n' "$1"; }
fail() { FAIL=$((FAIL + 1)); printf 'FAIL  %s\n' "$1"; }

# ---------------------------------------------------------------------------
echo "== §0 构建 dist（W25_SKIP_BUILD=1 跳过）=="
if [ "${W25_SKIP_BUILD:-0}" = "1" ]; then
  echo "   （跳过构建）"
elif [ -d "$API_DIR/node_modules" ]; then
  if ( cd "$API_DIR" && npx nest build >/tmp/w25-build.log 2>&1 ); then pass "§0 services/api nest build = 0"; else fail "§0 构建失败；见 /tmp/w25-build.log"; fi
else
  fail "§0 services/api 未装依赖（node_modules 缺失）"
fi

# ---------------------------------------------------------------------------
echo "== §1–§4 外部插件 E2E（真实 dist 路径 + 真实 ToolRegistry）=="
cat > "$HELPER" <<'CJS'
const fs = require('node:fs');
const path = require('node:path');
const API = '__API_DIR__';
const CORE = require('__CORE_ENTRY__');

const { agentPlugins, agentPluginsDir, resetAgentPlugins } = require(path.join(API, 'dist/modules/agent/agent-plugins.js'));
const { AgentTeachingTools } = require(path.join(API, 'dist/modules/agent/teaching-tools.js'));
const { ToolRegistry } = CORE;

let p = 0;
let f = 0;
const ok = (c, m, d = '') => { if (c) { p++; console.log('PASS  ' + m); } else { f++; console.log('FAIL  ' + m + (d ? ' — ' + d : '')); } };

const WEATHER = path.join(API, 'plugins-examples/weather');
const realDir = agentPluginsDir();
console.log('       pluginsDir(default) = ' + realDir);

(async () => {
  // §1 干净检出：默认 plugins/（memory/tutor）里没有 weather
  delete process.env.AGENT_PLUGINS_DIR;
  resetAgentPlugins();
  let api = agentPlugins();
  let names = api.tools.map((t) => t.name);
  ok(!names.includes('weather.lookup'), '§1 干净检出：默认 plugins/ 无 weather.lookup', names.join(','));
  ok(api.diagnostics.errors.length === 0, '§1 出厂插件零诊断', JSON.stringify(api.diagnostics.errors));
  // 默认目录确为「活的」：doc 命令（cp -r ... plugins/weather）落的就是这个目录，它本就产出出厂工具。
  ok(names.includes('memory.recall'), '§1 默认 plugins/ 出厂工具在位（doc 命令的默认目录确为活目录）', names.join(','));

  // §2 放目录：副本 = plugins/ + weather（副本在 services/api 下，使 @gri/agent-core 可解析）
  const tmpRoot = fs.mkdtempSync(path.join(API, '.w25-e2e-'));
  const tmpPlugins = path.join(tmpRoot, 'plugins');
  fs.cpSync(realDir, tmpPlugins, { recursive: true });
  fs.cpSync(WEATHER, path.join(tmpPlugins, 'weather'), { recursive: true });
  process.env.AGENT_PLUGINS_DIR = tmpPlugins;
  resetAgentPlugins();
  api = agentPlugins();
  ok(api.diagnostics.activated.includes('weather'), '§2 放入后 weather 已激活（必要条件；可列性由下一条承担）', api.diagnostics.activated.join(','));
  names = api.tools.map((t) => t.name);
  ok(names.includes('weather.lookup'), '§2 weather.lookup 出现在插件工具表（可列）', names.join(','));

  // §3 可列（拼进 agent 工具表）+ 可调（经真实 ToolRegistry）
  const teach = new AgentTeachingTools({ query: async () => ({ rows: [] }) });
  const defs = teach.toolDefs(api.tools);
  ok(defs.map((t) => t.name).includes('weather.lookup'), '§3 weather.lookup 进入 agent 工具表（可列）');
  const reg = new ToolRegistry().registerAll(defs);
  const call = await reg.call({ entityId: 'e2e-w25' }, 'weather.lookup', { city: '北京' });
  ok(call.ok === true && call.result && call.result.city === '北京' && typeof call.result.temp === 'number',
    '§3 weather.lookup 可调且返回真实结果', JSON.stringify(call.result || call.error));

  // §4 卸载即消失（且出厂工具不退化，P5）
  fs.rmSync(path.join(tmpPlugins, 'weather'), { recursive: true, force: true });
  resetAgentPlugins();
  api = agentPlugins();
  names = api.tools.map((t) => t.name);
  ok(!names.includes('weather.lookup'), '§4 移除目录后 weather.lookup 消失');
  ok(names.includes('memory.recall'), '§4 卸载不退化：出厂 memory 工具仍在（P5）');

  fs.rmSync(tmpRoot, { recursive: true, force: true });
  console.log('HELPER_PASS=' + p + ' HELPER_FAIL=' + f);
  process.exit(f ? 1 : 0);
})().catch((e) => {
  console.log('FAIL  helper 抛错：' + ((e && e.stack) || e));
  console.log('HELPER_PASS=0 HELPER_FAIL=1');
  process.exit(1);
});
CJS
sed -i "s#__API_DIR__#$API_DIR#g; s#__CORE_ENTRY__#$CORE_DIR/src/index.js#g" "$HELPER"

OUT="$(node "$HELPER" 2>&1)"
printf '%s\n' "$OUT" | grep -vE '^HELPER_PASS='
SUM="$(printf '%s\n' "$OUT" | grep -E '^HELPER_PASS=' | tail -1)"
HP="$(printf '%s' "$SUM" | sed -E 's/.*PASS=([0-9]+).*/\1/')"
HF="$(printf '%s' "$SUM" | sed -E 's/.*FAIL=([0-9]+).*/\1/')"
PASS=$((PASS + ${HP:-0}))
FAIL=$((FAIL + ${HF:-0}))
if [ -z "$SUM" ]; then fail "§1–§4 helper 未产出计数行（可能崩了）"; fi

# ---------------------------------------------------------------------------
echo "== §5 契约自检：示例**源码文本**不含被禁字面量（对**本文件**的自指断言，非通用守卫）=="
# 诚实边界：§5 断言的是「**这个已交付样例**自身干净」，**不是**对任意插件的强制。文本 grep 可被
# `process['env']`、相对路径 require 业务包等绕过 —— 契约 §一 的红线是**约定**，执行靠评审。
# 真正的强制面在装配期行为（§1–§4）：无名/撞名 → TOOL_NAME_*，撞保留名 → 装配期拒。
[ -f "$EX/index.js" ] && [ -f "$EX/plugin.json" ] && pass "§5.1 示例插件齐备（index.js + plugin.json）" || fail "§5.1 示例插件缺文件"
# 红线1（自指）：本样例源码只出现 @gri/agent-core 一个 @gri/* 包
BIZ="$(grep -oE '@gri/[a-z-]+' "$EX/index.js" | sort -u | grep -v '^@gri/agent-core$' | wc -l | tr -d ' ')"
[ "$BIZ" = "0" ] && pass "§5.2 样例源码仅 require @gri/agent-core（对其文本的自指断言）" || fail "§5.2 出现业务包 import（$BIZ 个）"
# 红线1（自指）：本样例源码文本不含 env/密钥字面量（大小写不敏感；含 env['..']/['env'] 括号访问写法）
[ "$(grep -ciE "process\.env|env\[|\[['\"]env['\"]\]|api[-_]?key|baseurl|secretrefs" "$EX/index.js" || true)" = "0" ] && pass "§5.3 样例源码文本无 env/密钥字面量（自指，非守卫）" || fail "§5.3 样例源码出现 env/密钥字面量"
# 红线2：工具名非保留名 —— §2 能激活即证明（撞保留名会被**装配期**拒），此处显式点名工具名本身
grep -q "name: 'weather.lookup'" "$EX/index.js" && pass "§5.4 工具名 weather.lookup 显式声明（§2 激活成功 ⇒ 非保留名）" || fail "§5.4 未见 weather.lookup 工具名"
grep -q '"id": "weather"' "$EX/plugin.json" && pass "§5.5 清单 id=weather（kebab 小写、唯一）" || fail "§5.5 清单 id 缺失/非法"
grep -q '"kind": "agent.skill"' "$EX/plugin.json" && pass "§5.6 清单 kind=agent.skill（契约指定类，与出厂插件一致）" || fail "§5.6 清单 kind 不是 agent.skill"

# ---------------------------------------------------------------------------
echo "== §6 零回归（W25_SKIP_REGRESSION=1 跳过）=="
if [ "${W25_SKIP_REGRESSION:-0}" = "1" ]; then
  echo "   （跳过回归）"
else
  ( cd "$PH_DIR" && npm test >/tmp/w25-ph.log 2>&1 )
  if [ "$?" = "0" ]; then
    PT="$(grep -E '^ℹ pass ' /tmp/w25-ph.log | tr -s ' ')"; pass "§6.1 plugin-host node --test 全绿（$PT）"
  else fail "§6.1 plugin-host 未全绿；见 /tmp/w25-ph.log"; fi

  ( cd "$CORE_DIR" && npm test >/tmp/w25-core.log 2>&1 )
  if [ "$?" = "0" ]; then
    CT="$(grep -E '^ℹ pass ' /tmp/w25-core.log | tr -s ' ')"; pass "§6.2 agent-core node --test 全绿（$CT）"
  else fail "§6.2 agent-core 未全绿；见 /tmp/w25-core.log"; fi

  if [ -d "$API_DIR/node_modules" ]; then
    ( cd "$API_DIR" && npx tsc -p tsconfig.json --noEmit >/tmp/w25-tsc.log 2>&1 )
    [ "$?" = "0" ] && pass "§6.3 services/api npx tsc --noEmit = 0" || fail "§6.3 api tsc 报错；见 /tmp/w25-tsc.log"
    ( cd "$API_DIR" && npx jest --silent >/tmp/w25-jest.log 2>&1 )
    JRC=$?
    if [ "$JRC" = "0" ]; then
      JT="$(grep -E '^Tests: ' /tmp/w25-jest.log | tr -s ' ' | tr '\n' ' ')"; pass "§6.4 services/api npx jest 全绿（$JT）"
    else fail "§6.4 api jest 未全绿（rc=$JRC）；见 /tmp/w25-jest.log"; fi
  else
    fail "§6.3/6.4 services/api 未装依赖（node_modules 缺失）"
  fi
fi

# ---------------------------------------------------------------------------
echo "------------------------------------------------------------------"
printf 'PASS=%d FAIL=%d VERIFY_EXIT=%d\n' "$PASS" "$FAIL" "$([ "$FAIL" = "0" ] && echo 0 || echo 1)"
[ "$FAIL" = "0" ]
