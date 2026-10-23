#!/usr/bin/env bash
# ============================================================================
# B-3b 验收：provider='cli' 路由分支 —— 把外部 agent 接进 ModelRouter（按用户可选、默认关闭）
# 依据：docs/EXTERNAL_AGENT_HARNESS.md §四①/§五（灵魂）+ .agents/claude/tasks/b3b-cli-route.md
#
# 结构：
#   §1 默认零回归        —— 无 cli 行 → resolve 快照（含新字段 cliBackend:null）逐字段一致
#   §2 cli 信号          —— provider=cli,model=<id> → cliBackend=<id> + source=route:cli；disabled 不算数
#   §3 CLI 分支走桩      —— 注入桩 registry → content=res.text，**未发 HTTP**；runOpts 无密钥字段（C4）
#   §4 isRealKey         —— cli 路由 → LlmClient/ModelRouter 均视为真（不落 mock）；无 key 非 cli 仍假
#   §5 失败明确上抛(C5)  —— run 抛错 / timedOut / 未注入 registry → chat 明确抛错（不静默返回空）
#   §6 真跑（可选）      —— provider=cli,model=claude-code 只读问答得非空文本（B3B_SKIP_REAL=1 跳过）
#   §7 零回归（C7）      —— packages/agent-core node --test 全绿 + services/api tsc=0 + jest 全绿
#   §8 底座合规/零明文(C3/C4/C6)—— 底座不读 env/不 import 业务、无密钥拼 argv、类型已同步、装配已注入
# 末行打印「PASS=<n> FAIL=<m> VERIFY_EXIT=0」。
#
# 依赖：node ≥18；§6 需本机已装 claude；§7 需 services/api 已 npm i。
# 用法： bash .agents/claude/outputs/b3b-verify.sh
#       B3B_SKIP_REAL=1        跳过 §6 真跑（离线环境）
#       B3B_REAL_TIMEOUT_MS=…  覆盖 §6 超时（默认 180000）
# ============================================================================
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CORE_DIR="$ROOT_DIR/packages/agent-core"
API_DIR="$ROOT_DIR/services/api"
MR="$CORE_DIR/src/model-router.js"
LLM="$CORE_DIR/src/llm-client.js"
DTS="$CORE_DIR/index.d.ts"
MOD="$API_DIR/src/modules/agent/agent.module.ts"
SVC="$API_DIR/src/modules/agent/agent.service.ts"
TEST_CLI="$CORE_DIR/tests/llm-client-cli.test.js"
REAL_TIMEOUT_MS="${B3B_REAL_TIMEOUT_MS:-180000}"

HELPER="$(mktemp /tmp/b3b-helper.XXXXXX.mjs)"
trap 'rm -f "$HELPER" 2>/dev/null' EXIT

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); printf 'PASS  %s\n' "$1"; }
fail() { FAIL=$((FAIL + 1)); printf 'FAIL  %s\n' "$1"; }

# ---------------------------------------------------------------------------
# 离线 helper：直接 import 底座真源码（不复制实现），跑静态断言 / 真跑。
# 打印 "PASS <label>" / "FAIL <label> :: <detail>"，由 bash 归并计数。
# ---------------------------------------------------------------------------
cat > "$HELPER" <<'MJS'
import { ModelRouter, LlmClient, cliBackends, storeFrom } from 'AGENT_CORE_SRC/index.js';

let p = 0, f = 0;
const pass = (l) => { p++; console.log(`PASS ${l}`); };
const fail = (l, d) => { f++; console.log(`FAIL ${l} :: ${d}`); };
const eq = (l, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  a === b ? pass(l) : fail(l, `got=${a} want=${b}`);
};
const truthy = (l, v, d) => (v ? pass(l) : fail(l, d ?? `got=${v}`));
const rejects = async (fn, re) => {
  try { await fn(); return false; } catch (e) { return re ? re.test(String((e && e.message) || e)) : true; }
};

/** 内存 fake store：模拟 agent.llm_routes（SELECT * …周 WHERE route_key = $1）。 */
function storeWith(routes) {
  const byKey = new Map(routes.map((r) => [r.route_key, r]));
  return storeFrom(async (text, params = []) => {
    if (/SELECT \* FROM agent\.llm_routes WHERE route_key = \$1/.test(text)) {
      const r = byKey.get(params[0]);
      return { rows: r ? [r] : [] };
    }
    return { rows: [] };
  });
}

/** 临时接管 global.fetch，断言「未发 HTTP」。 */
function spyFetch() {
  const orig = globalThis.fetch;
  const hits = [];
  globalThis.fetch = async (...a) => { hits.push(a); throw new Error('unexpected fetch（cli 路由不该发 HTTP）'); };
  return { hits, restore: () => { globalThis.fetch = orig; } };
}

/** resolveConfig 桩：provider='cli' + cliBackend=backend id。 */
const cliCfg = (backend = 'claude-code') => async () => ({
  provider: 'cli', cliBackend: backend, model: backend, apiKey: '', baseUrl: 'http://should-not-be-called',
});

// --- §1 默认零回归（快照）---
async function s1() {
  const env = {
    LLM_PROVIDER: 'nvidia', LLM_MODEL: 'deepseek-ai/deepseek-v4.1-flash',
    LLM_MULTIMODAL_MODEL: 'nvidia/neva-22b', LLM_API_URL: 'https://x/v1/chat/completions',
    LLM_API_KEY: 'nvapi-testkey1234',
  };
  const c = await new ModelRouter(storeWith([]), env).resolve('default');
  eq('§1.1 无 cli 行 resolve 快照（仅多出 cliBackend:null）', c, {
    provider: 'nvidia', model: 'deepseek-ai/deepseek-v4.1-flash', multimodalModel: 'nvidia/neva-22b',
    baseUrl: 'https://x/v1/chat/completions', apiKey: 'nvapi-testkey1234', cliBackend: null, source: 'env',
  });
  const rc = await new ModelRouter(storeWith([{ route_key: 'entity=abc', model: 'route-model', enabled: true }]), env).resolve('entity=abc');
  truthy('§1.2 非 cli 路由行 → cliBackend=null 且 source=route', rc.cliBackend === null && rc.source === 'route', `cliBackend=${JSON.stringify(rc.cliBackend)} source=${rc.source}`);
}

// --- §2 cli 信号 ---
async function s2() {
  const r = new ModelRouter(storeWith([{ route_key: 'entity=abc', provider: 'cli', model: 'claude-code', enabled: true }]), {});
  const c = await r.resolve('entity=abc');
  eq('§2.1 provider=cli,model=claude-code → cliBackend=claude-code', c.cliBackend, 'claude-code');
  eq('§2.2 cli 行 source=route:cli', c.source, 'route:cli');
  eq('§2.3 cli 行 provider=cli', c.provider, 'cli');
  truthy('§2.4 ModelRouter.isRealKey(cli)=true', (await r.isRealKey('entity=abc')) === true);
  const dis = await new ModelRouter(storeWith([{ route_key: 'entity=new', provider: 'cli', model: 'codex', enabled: false }]), {}).resolve('entity=new');
  truthy('§2.5 disabled cli 行不算数 → cliBackend=null', dis.cliBackend === null);
  const viaDefault = await new ModelRouter(storeWith([{ route_key: 'default', provider: 'cli', model: 'openclaw', enabled: true }]), {}).resolve('entity=zzz');
  eq('§2.6 default 的 cli 行 → 该 routeKey 也走 CLI', viaDefault.cliBackend, 'openclaw');
}

// --- §3 CLI 分支走桩（不发 HTTP）+ §4 isRealKey + §5 失败上抛 ---
async function s345() {
  const reg = { calls: [], async run(id, opts) { this.calls.push({ id, opts }); return { text: 'OK', error: null, timedOut: false }; } };
  const llm = new LlmClient(cliCfg('claude-code'), reg);
  const spy = spyFetch();
  try {
    const out = await llm.chat([{ role: 'system', content: 's' }, { role: 'user', content: '你好' }], 'entity=abc', { tools: [{ type: 'function', function: { name: 'x' } }] });
    eq('§3.1 CLI 分支返回 content=res.text', out.content, 'OK');
    truthy('§3.2 usage/toolCalls 均为 null', out.usage === null && out.toolCalls === null);
    truthy('§3.3 未发 HTTP（fetch 命中 0）', spy.hits.length === 0, `hits=${spy.hits.length}`);
    eq('§3.4 run 收到后端 id', reg.calls[0].id, 'claude-code');
    eq('§3.5 prompt=本轮 user message（不含 system）', reg.calls[0].opts.prompt, '你好');
    const keys = Object.keys(reg.calls[0].opts).sort();
    truthy('§3.6 runOpts 无密钥字段（C4）', !('apiKey' in reg.calls[0].opts) && !('token' in reg.calls[0].opts) && !('env' in reg.calls[0].opts), keys.join(','));
  } finally { spy.restore(); }

  truthy('§4.1 LlmClient.isRealKey(cli)=true', (await llm.isRealKey('entity=abc')) === true);
  truthy('§4.2 无 key 非 cli 仍 false（mock gate 不变）', (await new LlmClient(async () => ({ apiKey: '' })).isRealKey('default')) === false);

  const throwing = new LlmClient(cliCfg('codex'), { async run() { throw new Error('boom'); } });
  truthy('§5.1 registry.run 抛错 → chat 上抛', await rejects(() => throwing.chat([{ role: 'user', content: 'q' }])));
  const timed = new LlmClient(cliCfg('hermes'), { async run() { return { text: '', timedOut: true, error: '超时（>1ms）已杀进程组' }; } });
  truthy('§5.2 timedOut → chat 上抛', await rejects(() => timed.chat([{ role: 'user', content: 'q' }]), /调用失败/));
  const empty = new LlmClient(cliCfg('claude-code'), { async run() { return { text: '   ', error: null, timedOut: false }; } });
  truthy('§5.3 正常退出但空文本 → 明确上抛（不静默返回空）', await rejects(() => empty.chat([{ role: 'user', content: 'q' }]), /空文本/));
  const notInj = new LlmClient(cliCfg('claude-code'));
  truthy('§5.4 未注入 registry → 明确抛错（不静默降级）', await rejects(() => notInj.chat([{ role: 'user', content: 'q' }]), /未注入 CliBackendRegistry/));
}

// --- §6 真跑（可选）：provider=cli,model=claude-code 端到端只读问答 ---
async function real() {
  const r = new ModelRouter(storeWith([{ route_key: 'entity=e2e', provider: 'cli', model: 'claude-code', enabled: true }]), {});
  const llm = new LlmClient((rk) => r.resolve(rk), cliBackends);
  if (!(await llm.isRealKey('entity=e2e'))) { fail('§6.1 isRealKey(cli)=true', 'false'); return; }
  try {
    const out = await llm.chat([{ role: 'user', content: '请只回答一个数字：1+1 等于几？' }], 'entity=e2e', { cwd: '/tmp', timeoutMs: Number(process.env.B3B_REAL_TIMEOUT_MS || 180000) });
    truthy('§6.1 claude-code 端到端得非空文本', typeof out.content === 'string' && out.content.trim().length > 0, `content=${JSON.stringify(out.content)}`);
  } catch (e) {
    fail('§6.1 claude-code 端到端', String((e && e.message) || e));
  }
}

const cmd = process.argv[2] || 'static';
if (cmd === 'static') { await s1(); await s2(); await s345(); }
else if (cmd === 'real') { await real(); }
console.log(`HELPER_PASS=${p} HELPER_FAIL=${f}`);
process.exit(f === 0 ? 0 : 1);
MJS

# 注入真源码路径
sed -i "s#AGENT_CORE_SRC#$CORE_DIR/src#g" "$HELPER"

# ---------------------------------------------------------------------------
echo "== §1-§5 底座静态断言（真源码 import）=="
OUT="$(node "$HELPER" static 2>&1)"; RC=$?
printf '%s\n' "$OUT"
HP="$(grep -c '^PASS ' <<<"$OUT" || true)"; HF="$(grep -c '^FAIL ' <<<"$OUT" || true)"
PASS=$((PASS + HP)); FAIL=$((FAIL + HF))
[ "$RC" != "0" ] && fail "helper(static) 非零退出 rc=$RC"

# ---------------------------------------------------------------------------
echo "== §6 真跑（可选）：claude-code 端到端 =="
if [ "${B3B_SKIP_REAL:-0}" = "1" ]; then
  printf 'SKIP  §6 真跑（B3B_SKIP_REAL=1）\n'
elif command -v claude >/dev/null 2>&1; then
  ROUT="$(B3B_REAL_TIMEOUT_MS="$REAL_TIMEOUT_MS" node "$HELPER" real 2>&1)"; RRC=$?
  printf '%s\n' "$ROUT"
  RP="$(grep -c '^PASS ' <<<"$ROUT" || true)"; RF="$(grep -c '^FAIL ' <<<"$ROUT" || true)"
  PASS=$((PASS + RP)); FAIL=$((FAIL + RF))
  [ "$RRC" != "0" ] && [ "$RF" = "0" ] && printf 'WARN  §6 真跑异常（rc=%s，已记为 WARN，可选）\n' "$RRC"
else
  printf 'SKIP  §6 真跑（本机无 claude CLI）\n'
fi

# ---------------------------------------------------------------------------
echo "== §7 零回归（C7）=="
( cd "$CORE_DIR" && node --test --test-force-exit "tests/**/*.test.js" >/tmp/b3b-core-test.log 2>&1 )
CORE_RC=$?
if [ "$CORE_RC" = "0" ]; then
  CT="$(grep -E '^ℹ (tests|pass|fail) ' /tmp/b3b-core-test.log | tr '\n' ' ')"
  pass "§7.1 packages/agent-core node --test 全绿（$CT）"
else
  fail "§7.1 packages/agent-core 测试未全绿（rc=$CORE_RC）；见 /tmp/b3b-core-test.log"
fi
if [ -d "$API_DIR/node_modules" ]; then
  ( cd "$API_DIR" && npx tsc --noEmit >/tmp/b3b-tsc.log 2>&1 )
  [ "$?" = "0" ] && pass "§7.2 services/api npx tsc --noEmit = 0" || fail "§7.2 api tsc 报错；见 /tmp/b3b-tsc.log"
  ( cd "$API_DIR" && npx jest >/tmp/b3b-jest.log 2>&1 )
  JRC=$?
  if [ "$JRC" = "0" ]; then
    JT="$(grep -E '^Tests: ' /tmp/b3b-jest.log | tr -s ' ' | tr '\n' ' ')"
    pass "§7.3 services/api npx jest 全绿（$JT）"
  else
    fail "§7.3 api jest 未全绿（rc=$JRC）；见 /tmp/b3b-jest.log"
  fi
else
  fail "§7.2/7.3 services/api 未装依赖（node_modules 缺失）"
fi

# ---------------------------------------------------------------------------
echo "== §8 底座合规 / 零明文（C3/C4/C6）=="
[ "$(grep -cE 'process\.env' "$LLM" || true)" = "0" ] && pass "§8.1 llm-client.js 不读 env（C3）" || fail "§8.1 llm-client.js 读 env"
[ "$(grep -cE '^\s*import\b' "$MR" "$LLM" | grep -vc ':0$' || true)" = "0" ] && pass "§8.2 路由/客户端无 import 业务依赖（C3）" || fail "§8.2 出现 import 依赖"
grep -q 'const prompt = this._promptFromMessages(messages)' "$LLM" && pass "§8.3 prompt 仅取消息文本（不拼密钥，C4）" || fail "§8.3 prompt 组装异常"
grep -q '_chatViaCli' "$LLM" && pass "§8.4 LlmClient 有 CLI 分支（_chatViaCli）" || fail "§8.4 缺 _chatViaCli"
grep -q 'cliBackend' "$MR" && grep -q "route:cli" "$MR" && pass "§8.5 model-router 增 cliBackend 信号 + source=route:cli" || fail "§8.5 model-router 未接信号"
grep -q 'cliBackend' "$DTS" && grep -q "route:cli" "$DTS" && pass "§8.6 index.d.ts 已同步类型（C6）" || fail "§8.6 index.d.ts 缺类型"
grep -q 'CliBackendRegistry' "$DTS" && grep -q 'cliBackends' "$DTS" && pass "§8.7 index.d.ts 声明 cliBackends 注入点" || fail "§8.7 index.d.ts 缺注入点声明"
grep -q 'AGENT_CLI_BACKENDS' "$MOD" && grep -q 'cliBackends' "$MOD" && pass "§8.8 agent.module.ts 已注入共享 cliBackends" || fail "§8.8 agent.module.ts 未注入"
grep -q 'AGENT_CLI_BACKENDS' "$SVC" && grep -q 'this.cliBackends ?? null' "$SVC" && pass "§8.9 agent.service.ts 令牌 + 默认 null 透传" || fail "§8.9 agent.service.ts 透传异常"
[ -f "$TEST_CLI" ] && pass "§8.10 单测文件存在（llm-client-cli.test.js）" || fail "§8.10 缺 tests/llm-client-cli.test.js"

# ---------------------------------------------------------------------------
echo "------------------------------------------------------------------"
printf 'PASS=%d FAIL=%d VERIFY_EXIT=%d\n' "$PASS" "$FAIL" "$([ "$FAIL" = "0" ] && echo 0 || echo 1)"
[ "$FAIL" = "0" ]
