#!/usr/bin/env bash
# ============================================================================
# B-3c 验收：agent.delegate 委派工具 —— 把外部 agent 当"派活儿"工人（接入点②）
# 依据：docs/EXTERNAL_AGENT_HARNESS.md §四②/§六/§八（灵魂）+ .agents/claude/tasks/b3c-cli-delegate.md
#
# 结构：
#   §1 工具注册        —— agent.delegate 出现在工具表（ToolRegistry.list() 含之），契约（name/required）正确
#   §2 cwd 白名单(C2)  —— 白名单内放行（子路径/相对）；越界明确拒绝且**不 spawn**
#   §3 正常委派        —— 桩 run 回 {text} → ok:true，父只拿摘要（无 child 中间产物/stderr）
#   §4 失败不静默(C5)  —— 桩抛错 / timedOut / 空文本 / 缺参 / 未注入 registry → ok:false（不返回空成功）
#   §5 续接 argv       —— claude-code 含 --resume <id>；codex 形如 exec resume <id> <prompt>；hermes/openclaw 忽略
#   §6 默认只读(C1)    —— 委派 argv 不含任何 DENYLIST 旗标；从不向 run 传 allowDangerous
#   §7 审计(C6)        —— 委派调用经 onRun 记录 tool_name=agent.delegate + latency_ms
#   §8 真跑（可选）    —— 委派"读文件总结"只读子任务给 claude-code，父拿到非空摘要（B3C_SKIP_REAL=1 跳过）
#   §9 零回归(C8)      —— packages/agent-core node --test 全绿 + services/api tsc=0 + jest 全绿
#   §10 底座合规/零明文 —— 底座不读 env / 不 import 业务；类型已同步；装配已注册；无密钥明文
# 末行打印「PASS=<n> FAIL=<m> VERIFY_EXIT=0」。
#
# 依赖：node ≥18；§8 需本机已装 claude；§9 需 services/api 已 npm i。
# 用法： bash .agents/claude/outputs/b3c-verify.sh
#       B3C_SKIP_REAL=1         跳过 §8 真跑（离线环境）
#       B3C_REAL_TIMEOUT_MS=…   覆盖 §8 超时（默认 180000）
# ============================================================================
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CORE_DIR="$ROOT_DIR/packages/agent-core"
API_DIR="$ROOT_DIR/services/api"
DEL="$CORE_DIR/src/cli-delegate.js"
CB="$CORE_DIR/src/cli-backend.js"
IDX="$CORE_DIR/src/index.js"
DTS="$CORE_DIR/index.d.ts"
SVC="$API_DIR/src/modules/agent/agent.service.ts"
TEST_DEL="$CORE_DIR/tests/cli-delegate.test.js"
REAL_TIMEOUT_MS="${B3C_REAL_TIMEOUT_MS:-180000}"

HELPER="$(mktemp /tmp/b3c-helper.XXXXXX.mjs)"
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
import {
  createDelegateTool, resolveDelegateCwd, DEFAULT_DELEGATE_CWD_ALLOWLIST,
  ToolRegistry, CliBackendRegistry,
  claudeCodeBackend, codexBackend, openclawBackend, hermesBackend, findDeniedArg,
} from 'AGENT_CORE_SRC/index.js';

let p = 0, f = 0;
const pass = (l) => { p++; console.log(`PASS ${l}`); };
const fail = (l, d) => { f++; console.log(`FAIL ${l} :: ${d}`); };
const eq = (l, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  a === b ? pass(l) : fail(l, `got=${a} want=${b}`);
};
const truthy = (l, v, d) => (v ? pass(l) : fail(l, d ?? `got=${v}`));

/** 桩 registry：记下 run 调用，回注结果（函数则按入参产出）。 */
function stub(result) {
  const calls = [];
  return {
    calls,
    async run(id, opts) { calls.push({ id, opts }); return typeof result === 'function' ? result(id, opts) : result; },
  };
}
const okResult = (over = {}) => ({
  text: '摘要：A、B、C。', sessionId: 's-1', exitCode: 0, stderr: '', pid: 42, timedOut: false, error: null, ...over,
});
const tmpRoot = '/tmp/b3c-root';
const toolWith = (result, opts = {}) => {
  const reg = stub(result);
  return { reg, tool: createDelegateTool({ cliBackends: reg, cwdAllowlist: [tmpRoot], ...opts }) };
};

// --- §1 工具注册 ---
async function s1() {
  const tool = createDelegateTool({ cliBackends: stub(okResult()) });
  eq('§1.1 工具名=agent.delegate', tool.name, 'agent.delegate');
  eq('§1.2 必填参数=[backend,goal]', tool.inputSchema.required, ['backend', 'goal']);
  const reg = new ToolRegistry();
  reg.register(createDelegateTool({ cliBackends: stub(okResult()) }));
  truthy('§1.3 ToolRegistry.list() 含 agent.delegate', reg.list().some((t) => t.name === 'agent.delegate'), 'list 无 agent.delegate');
}

// --- §2 cwd 白名单（C2）---
async function s2() {
  eq('§2.1 cwd 缺省 → 白名单首根', resolveDelegateCwd(undefined, [tmpRoot, '/tmp/other']), { ok: true, cwd: tmpRoot });
  eq('§2.2 cwd 子路径放行', resolveDelegateCwd(`${tmpRoot}/packages`, [tmpRoot]), { ok: true, cwd: `${tmpRoot}/packages` });
  eq('§2.3 相对 cwd 相对首根解析', resolveDelegateCwd('packages', [tmpRoot]), { ok: true, cwd: `${tmpRoot}/packages` });
  truthy('§2.4 越界绝对路径 /etc → 拒绝', resolveDelegateCwd('/etc', [tmpRoot]).ok === false);
  truthy('§2.5 相对 `../` 越界 → 拒绝', resolveDelegateCwd('../../etc', [tmpRoot]).ok === false);
  truthy('§2.6 前缀兄弟目录不误放', resolveDelegateCwd(`${tmpRoot}-evil`, [tmpRoot]).ok === false);
  eq('§2.7 默认白名单=GRI 工作树', [...DEFAULT_DELEGATE_CWD_ALLOWLIST], ['/home/ubantu/GRI']);
  const { tool, reg } = toolWith(okResult());
  const out = await tool.execute({}, { backend: 'claude-code', goal: 'g', cwd: '/etc' });
  truthy('§2.8 越界 cwd → ok:false（明确拒绝）', out.ok === false && /越界/.test(out.error || ''));
  truthy('§2.9 越界**不 spawn**（run 未被调用）', reg.calls.length === 0, `calls=${reg.calls.length}`);
}

// --- §3 正常委派：父只拿摘要 ---
async function s3() {
  const { tool, reg } = toolWith(okResult());
  const out = await tool.execute({}, { backend: 'claude-code', goal: '读某文件并总结' });
  truthy('§3.1 ok:true 且 summary=摘要文本', out.ok === true && out.summary === '摘要：A、B、C。');
  eq('§3.2 run 收到 {prompt:goal, cwd:白名单内}', [reg.calls[0].opts.prompt, reg.calls[0].opts.cwd], ['读某文件并总结', tmpRoot]);
  truthy('§3.3 父只拿摘要：返回体不含 stderr/pid', !('stderr' in out) && !('pid' in out));
  eq('§3.4 返回体字段白名单', Object.keys(out).sort(), ['backend', 'error', 'exitCode', 'ok', 'sessionId', 'summary', 'timedOut']);
}

// --- §4 失败不静默（C5）---
async function s4() {
  const a = await toolWith(okResult()).tool.execute({}, { backend: 'claude-code', goal: 'g' , cwd: tmpRoot });
  truthy('§4.1 正常路径 ok:true（对照）', a.ok === true);
  truthy('§4.2 缺 backend → ok:false', (await toolWith(okResult()).tool.execute({}, { goal: 'g' })).ok === false);
  truthy('§4.3 缺 goal → ok:false', (await toolWith(okResult()).tool.execute({}, { backend: 'x' })).ok === false);
  const noReg = createDelegateTool({ cliBackends: null, cwdAllowlist: [tmpRoot] });
  const r = await noReg.execute({}, { backend: 'claude-code', goal: 'g' });
  truthy('§4.4 未注入 registry → ok:false（不静默降级）', r.ok === false && /未注入/.test(r.error || ''));
  const thr = await toolWith(() => { throw new Error('boom'); }).tool.execute({}, { backend: 'codex', goal: 'g' });
  truthy('§4.5 桩 run 抛错 → ok:false 含原因', thr.ok === false && /boom/.test(thr.error || ''));
  const to = await toolWith(okResult({ text: '', timedOut: true, exitCode: 124, error: '超时已杀进程组' })).tool.execute({}, { backend: 'hermes', goal: 'g' });
  truthy('§4.6 timedOut → ok:false 且 timedOut=true', to.ok === false && to.timedOut === true);
  const emp = await toolWith(okResult({ text: '   ' })).tool.execute({}, { backend: 'openclaw', goal: 'g' });
  truthy('§4.7 空文本 → ok:false（拒绝静默返回空）', emp.ok === false && /空文本/.test(emp.error || ''));
}

// --- §5 续接 argv；§6 默认只读 ---
async function s56() {
  eq('§5.1 claude-code 续接含 --resume <id>', claudeCodeBackend.buildArgs({ prompt: 'p', resumeKey: 'S1' }),
    ['-p', 'p', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'default', '--resume', 'S1']);
  eq('§5.2 claude-code 无 resumeKey → 与既有 argv 逐字一致（零回归）', claudeCodeBackend.buildArgs({ prompt: 'p' }),
    ['-p', 'p', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'default']);
  eq('§5.3 codex 续接形如 exec resume <id> <prompt>', codexBackend.buildArgs({ prompt: 'p', resumeKey: 'T1' }),
    ['exec', 'resume', 'T1', 'p', '--json', '--skip-git-repo-check']);
  eq('§5.4 codex 无 resumeKey → 零回归', codexBackend.buildArgs({ prompt: 'p' }), ['exec', 'p', '--json', '--skip-git-repo-check']);
  eq('§5.5 openclaw 忽略 resumeKey', openclawBackend.buildArgs({ prompt: 'p', cwd: tmpRoot, resumeKey: 'x' }),
    openclawBackend.buildArgs({ prompt: 'p', cwd: tmpRoot }));
  eq('§5.6 hermes 忽略 resumeKey', hermesBackend.buildArgs({ prompt: 'p', resumeKey: 'x' }), ['-z', 'p']);
  // registry.run 端到端透传 resumeKey → buildArgs
  const captured = [];
  const be = { id: 'cap', label: 'Cap', bin: 'echo', timeoutMs: 5000,
    buildArgs(i) { captured.push(i); return ['ok']; }, parseLine: (l) => ({ text: String(l).trim() }) };
  await new CliBackendRegistry([be]).run('cap', { prompt: 'h', cwd: process.cwd(), timeoutMs: 5000, resumeKey: 'S9' });
  eq('§5.7 run 透传 resumeKey → buildArgs', captured[0].resumeKey, 'S9');

  const { tool, reg } = toolWith(okResult());
  await tool.execute({}, { backend: 'claude-code', goal: 'g' });
  truthy('§6.1 从不向 run 传 allowDangerous（C1）', !('allowDangerous' in reg.calls[0].opts));
  eq('§6.2 委派 runOpts 仅白名单字段', Object.keys(reg.calls[0].opts).sort(), ['cwd', 'prompt']);
  let clean = true, bad = '';
  for (const b of [claudeCodeBackend, codexBackend, openclawBackend, hermesBackend]) {
    const hit = findDeniedArg(b.buildArgs({ prompt: 'hi', cwd: tmpRoot, resumeKey: 'sid' }));
    if (hit) { clean = false; bad = `${b.id}:${hit}`; }
  }
  truthy('§6.3 四后端委派 argv 不含 DENYLIST 旗标', clean, bad);
  truthy('§6.4 恶意 resumeKey 仍被 DENYLIST 识别', findDeniedArg(claudeCodeBackend.buildArgs({ prompt: 'x', resumeKey: '--yolo' })) === '--yolo');
}

// --- §7 审计（C6）---
async function s7() {
  const reg = new ToolRegistry();
  reg.register(createDelegateTool({ cliBackends: stub(okResult()), cwdAllowlist: [tmpRoot] }));
  const seen = [];
  await reg.call({}, 'agent.delegate', { backend: 'claude-code', goal: 'g', cwd: tmpRoot }, { onRun: (a) => seen.push(a) });
  truthy('§7.1 onRun 记录 tool_name=agent.delegate', seen.some((a) => a.tool_name === 'agent.delegate'), JSON.stringify(seen));
  truthy('§7.2 审计含 latency_ms（耗时）', seen.length > 0 && typeof seen[0].latency_ms === 'number');
  truthy('§7.3 审计结果=摘要（无 child 中间产物）', seen.length > 0 && typeof seen[0].result === 'object' && 'summary' in seen[0].result);
}

// --- 真跑 ---
async function real() {
  // 用进程级真注册表（B-3a 四内置后端）
  const mod = await import('AGENT_CORE_SRC/index.js');
  const tool2 = mod.createDelegateTool({ cliBackends: mod.cliBackends, cwdAllowlist: ['/home/ubantu/GRI'] });
  const out = await tool2.execute({}, {
    backend: 'claude-code',
    goal: '读 packages/agent-core/package.json，用一句话中文说明这个包是什么。',
    cwd: '/home/ubantu/GRI',
    timeoutMs: Number(process.env.B3C_REAL_TIMEOUT_MS || 150000),
  });
  truthy('§8.1 claude-code 真跑 → ok:true 且摘要非空', out.ok === true && typeof out.summary === 'string' && out.summary.trim().length > 0,
    `ok=${out.ok} err=${out.error}`);
  truthy('§8.2 真跑退出码=0', out.exitCode === 0, `exit=${out.exitCode}`);
  console.log(`INFO  §8 摘要前 120 字：${String(out.summary || out.error || '').slice(0, 120)}`);
}

const mode = process.argv[2] || 'static';
if (mode === 'real') await real();
else { await s1(); await s2(); await s3(); await s4(); await s56(); await s7(); }

console.log(`HELPER_PASS=${p} HELPER_FAIL=${f}`);
process.exit(f === 0 ? 0 : 1);
MJS

sed -i "s#AGENT_CORE_SRC#$CORE_DIR/src#g" "$HELPER"

# ---------------------------------------------------------------------------
echo "== §1–§7 静态断言（工具注册 / cwd 白名单 / 摘要 / 失败不静默 / 续接 / 只读 / 审计）=="
OUT="$(node "$HELPER" static 2>&1)"; RC=$?
printf '%s\n' "$OUT"
HP="$(grep -c '^PASS ' <<<"$OUT" || true)"; HF="$(grep -c '^FAIL ' <<<"$OUT" || true)"
PASS=$((PASS + HP)); FAIL=$((FAIL + HF))
[ "$RC" != "0" ] && fail "helper(static) 非零退出 rc=$RC"

# ---------------------------------------------------------------------------
echo "== §8 真跑（可选）：委派只读子任务给 claude-code =="
if [ "${B3C_SKIP_REAL:-0}" = "1" ]; then
  printf 'SKIP  §8 真跑（B3C_SKIP_REAL=1）\n'
elif command -v claude >/dev/null 2>&1; then
  ROUT="$(B3C_REAL_TIMEOUT_MS="$REAL_TIMEOUT_MS" node "$HELPER" real 2>&1)"; RRC=$?
  printf '%s\n' "$ROUT"
  RP="$(grep -c '^PASS ' <<<"$ROUT" || true)"; RF="$(grep -c '^FAIL ' <<<"$ROUT" || true)"
  PASS=$((PASS + RP)); FAIL=$((FAIL + RF))
  [ "$RRC" != "0" ] && [ "$RF" = "0" ] && printf 'WARN  §8 真跑异常（rc=%s，已记为 WARN，可选）\n' "$RRC"
else
  printf 'SKIP  §8 真跑（本机无 claude CLI）\n'
fi

# ---------------------------------------------------------------------------
echo "== §9 零回归（C8）=="
( cd "$CORE_DIR" && node --test --test-force-exit "tests/**/*.test.js" >/tmp/b3c-core-test.log 2>&1 )
CORE_RC=$?
if [ "$CORE_RC" = "0" ]; then
  CT="$(grep -E '^ℹ (tests|pass|fail) ' /tmp/b3c-core-test.log | tr '\n' ' ')"
  pass "§9.1 packages/agent-core node --test 全绿（$CT）"
else
  fail "§9.1 packages/agent-core 测试未全绿（rc=$CORE_RC）；见 /tmp/b3c-core-test.log"
fi
if [ -d "$API_DIR/node_modules" ]; then
  ( cd "$API_DIR" && npx tsc --noEmit >/tmp/b3c-tsc.log 2>&1 )
  [ "$?" = "0" ] && pass "§9.2 services/api npx tsc --noEmit = 0" || fail "§9.2 api tsc 报错；见 /tmp/b3c-tsc.log"
  ( cd "$API_DIR" && npx jest >/tmp/b3c-jest.log 2>&1 )
  JRC=$?
  if [ "$JRC" = "0" ]; then
    JT="$(grep -E '^Tests: ' /tmp/b3c-jest.log | tr -s ' ' | tr '\n' ' ')"
    pass "§9.3 services/api npx jest 全绿（$JT）"
  else
    fail "§9.3 api jest 未全绿（rc=$JRC）；见 /tmp/b3c-jest.log"
  fi
else
  fail "§9.2/9.3 services/api 未装依赖（node_modules 缺失）"
fi

# ---------------------------------------------------------------------------
echo "== §10 底座合规 / 零明文（C3/C4/C6）=="
[ "$(grep -cE 'process\.env' "$DEL" || true)" = "0" ] && pass "§10.1 cli-delegate.js 不读 env（C3）" || fail "§10.1 cli-delegate.js 读 env"
[ "$(grep -E '^import' "$DEL" | grep -vcE "node:path|\./tool\.js" || true)" = "0" ] && pass "§10.2 cli-delegate.js 不 import 业务依赖（C3）" || fail "§10.2 cli-delegate.js 出现业务 import"
[ "$(grep -cE 'allowDangerous[[:space:]]*[:=]' "$DEL" || true)" = "0" ] && pass "§10.3 cli-delegate 从不把 allowDangerous 写进 runOpts（C1）" || fail "§10.3 cli-delegate 给 run 传了 allowDangerous"
grep -q 'resumeKey' "$CB" && pass "§10.4 cli-backend.js 增 resumeKey 续接（claude-code/codex）" || fail "§10.4 cli-backend.js 缺 resumeKey"
grep -q 'createDelegateTool' "$IDX" && pass "§10.5 index.js 已导出 createDelegateTool" || fail "§10.5 index.js 未导出"
grep -q 'createDelegateTool' "$DTS" && grep -q 'resumeKey?: string' "$DTS" && pass "§10.6 index.d.ts 已同步类型（createDelegateTool + resumeKey）" || fail "§10.6 index.d.ts 类型未同步"
grep -q 'createDelegateTool' "$SVC" && grep -q '_delegateCwdAllowlist' "$SVC" && pass "§10.7 agent.service.ts 已注册委派工具 + cwd 白名单配置面" || fail "§10.7 agent.service.ts 未装配"
[ -f "$TEST_DEL" ] && pass "§10.8 单测文件存在（tests/cli-delegate.test.js）" || fail "§10.8 缺 tests/cli-delegate.test.js"
[ "$(grep -cE 'nvapi-|sk-[A-Za-z0-9]{20}' "$DEL" "$CB" "$IDX" "$DTS" "$SVC" | grep -vc ':0$' || true)" = "0" ] && pass "§10.9 变更文件零密钥明文" || fail "§10.9 变更文件出现疑似密钥明文"

# ---------------------------------------------------------------------------
echo "------------------------------------------------------------------"
printf 'PASS=%d FAIL=%d VERIFY_EXIT=%d\n' "$PASS" "$FAIL" "$([ "$FAIL" = "0" ] && echo 0 || echo 1)"
[ "$FAIL" = "0" ]
