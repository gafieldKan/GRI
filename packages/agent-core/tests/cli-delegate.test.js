/**
 * cli-delegate 单测（B-3c）—— 「派活儿」接入点②。
 *
 * 覆盖：工具形状/契约 · cwd 白名单拒/放（含相对越界）· 桩 run 调用与「父只拿摘要」·
 *       缺参/未注入 registry/抛错/timedOut/空文本 一律明确失败（不静默）· 默认只读（C1）·
 *       resumeKey 续接 argv（claude-code/codex 追加、openclaw/hermes 忽略）· 零明文。
 * 不依赖本机 CLI 真跑：真跑验收在 `.agents/claude/outputs/b3c-verify.sh`。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDelegateTool,
  resolveDelegateCwd,
  DEFAULT_DELEGATE_CWD_ALLOWLIST,
  ToolRegistry,
  CliBackendRegistry,
  claudeCodeBackend,
  codexBackend,
  openclawBackend,
  hermesBackend,
  findDeniedArg,
} from '../src/index.js';

// ── 测试替身 ────────────────────────────────────────────────────────────────

/** 桩 registry：记下 run 调用，回注结果（函数则按入参产出）。 */
function stubRegistry(result) {
  const calls = [];
  return {
    calls,
    async run(id, opts) {
      calls.push({ id, opts });
      return typeof result === 'function' ? result(id, opts) : result;
    },
  };
}

/** 正常后端返回体。 */
const okResult = (over = {}) => ({
  text: '摘要：文件里讲了 A、B、C。',
  sessionId: 'sess-1',
  exitCode: 0,
  stderr: '',
  pid: 1234,
  timedOut: false,
  error: null,
  ...over,
});

/** 取工具（默认白名单 = 测试用临时根，避免依赖真实工作树）。 */
function toolWith(result, opts = {}) {
  const reg = stubRegistry(result);
  const tool = createDelegateTool({ cliBackends: reg, cwdAllowlist: ['/tmp/b3c-root'], ...opts });
  return { tool, reg };
}

// ── 1. 工具形状/契约 ────────────────────────────────────────────────────────

test('delegate: 工具名/分类/必填参数符合契约（§四②）', () => {
  const tool = createDelegateTool({ cliBackends: stubRegistry(okResult()) });
  assert.equal(tool.name, 'agent.delegate');
  assert.equal(tool.category, 'delegate');
  assert.deepEqual(tool.inputSchema.required, ['backend', 'goal']);
  assert.deepEqual(
    Object.keys(tool.inputSchema.properties).sort(),
    ['backend', 'cwd', 'goal', 'resumeKey', 'timeoutMs'],
  );
  assert.equal(typeof tool.execute, 'function');
});

test('delegate: 经 ToolRegistry.register 后 list() 含 agent.delegate（装配面）', () => {
  const reg = new ToolRegistry();
  reg.register(createDelegateTool({ cliBackends: stubRegistry(okResult()) }));
  assert.ok(reg.list().some((t) => t.name === 'agent.delegate'));
});

// ── 2. cwd 白名单（C2）─────────────────────────────────────────────────────

test('delegate: cwd 缺省 → 落白名单首根', () => {
  const r = resolveDelegateCwd(undefined, ['/tmp/b3c-root', '/tmp/other']);
  assert.deepEqual(r, { ok: true, cwd: '/tmp/b3c-root' });
});

test('delegate: cwd 子路径放行（前缀判定）', () => {
  const r = resolveDelegateCwd('/tmp/b3c-root/packages/agent-core', ['/tmp/b3c-root']);
  assert.deepEqual(r, { ok: true, cwd: '/tmp/b3c-root/packages/agent-core' });
});

test('delegate: 相对 cwd 相对白名单首根解析并放行', () => {
  const r = resolveDelegateCwd('packages/agent-core', ['/tmp/b3c-root']);
  assert.deepEqual(r, { ok: true, cwd: '/tmp/b3c-root/packages/agent-core' });
});

test('delegate: cwd 越界（/tmp 之外绝对路径）→ 明确拒绝', () => {
  const r = resolveDelegateCwd('/etc', ['/tmp/b3c-root']);
  assert.equal(r.ok, false);
  assert.match(r.error, /越界/);
});

test('delegate: 相对 `../` 越界 → 明确拒绝', () => {
  const r = resolveDelegateCwd('../../etc', ['/tmp/b3c-root']);
  assert.equal(r.ok, false);
});

test('delegate: 同名前缀兄弟目录不误放（/tmp/b3c-root-evil 越界）', () => {
  const r = resolveDelegateCwd('/tmp/b3c-root-evil', ['/tmp/b3c-root']);
  assert.equal(r.ok, false);
});

test('delegate: 越界 cwd → execute 拒绝且**不 spawn**（run 未被调）', async () => {
  const { tool, reg } = toolWith(okResult());
  const out = await tool.execute({}, { backend: 'claude-code', goal: '读文件', cwd: '/etc' });
  assert.equal(out.ok, false);
  assert.match(out.error, /越界/);
  assert.equal(reg.calls.length, 0, '越界不得 spawn（run 未被调用）');
});

test('delegate: 默认白名单 = GRI 工作树（不写死在业务，工厂默认值）', () => {
  assert.deepEqual([...DEFAULT_DELEGATE_CWD_ALLOWLIST], ['/home/ubantu/GRI']);
  const r = resolveDelegateCwd(undefined, DEFAULT_DELEGATE_CWD_ALLOWLIST);
  assert.deepEqual(r, { ok: true, cwd: '/home/ubantu/GRI' });
});

// ── 3. 正常委派：父只拿摘要 ─────────────────────────────────────────────────

test('delegate: 桩 run 正常 → ok:true 且返回摘要（含 sessionId/exitCode）', async () => {
  const { tool, reg } = toolWith(okResult());
  const out = await tool.execute({}, { backend: 'claude-code', goal: '读某文件并总结' });
  assert.equal(out.ok, true);
  assert.equal(out.backend, 'claude-code');
  assert.equal(out.summary, '摘要：文件里讲了 A、B、C。');
  assert.equal(out.sessionId, 'sess-1');
  assert.equal(out.exitCode, 0);
  assert.equal(out.error, null);
  // prompt 走 argv 数组语义：run 收到 {prompt: goal, cwd: <白名单内>}
  assert.equal(reg.calls.length, 1);
  assert.equal(reg.calls[0].id, 'claude-code');
  assert.equal(reg.calls[0].opts.prompt, '读某文件并总结');
  assert.equal(reg.calls[0].opts.cwd, '/tmp/b3c-root');
});

test('delegate: 父只拿摘要 —— 返回体不含 child 中间产物/stderr/pid', async () => {
  const { tool } = toolWith(okResult({ stderr: 'noise', pid: 999 }));
  const out = await tool.execute({}, { backend: 'codex', goal: 'g' });
  assert.equal(out.ok, true);
  assert.equal('stderr' in out, false);
  assert.equal('pid' in out, false);
  assert.deepEqual(Object.keys(out).sort(), ['backend', 'error', 'exitCode', 'ok', 'sessionId', 'summary', 'timedOut']);
});

// ── 4. 失败一律明确（不静默）────────────────────────────────────────────────

test('delegate: 缺 backend → ok:false（不 spawn）', async () => {
  const { tool, reg } = toolWith(okResult());
  const out = await tool.execute({}, { goal: 'g' });
  assert.equal(out.ok, false);
  assert.match(out.error, /缺少 backend/);
  assert.equal(reg.calls.length, 0);
});

test('delegate: 缺 goal → ok:false（不 spawn）', async () => {
  const { tool, reg } = toolWith(okResult());
  const out = await tool.execute({}, { backend: 'claude-code' });
  assert.equal(out.ok, false);
  assert.match(out.error, /缺少 goal/);
  assert.equal(reg.calls.length, 0);
});

test('delegate: 未注入 CliBackendRegistry → ok:false（拒绝静默降级）', async () => {
  const tool = createDelegateTool({ cliBackends: null, cwdAllowlist: ['/tmp/b3c-root'] });
  const out = await tool.execute({}, { backend: 'claude-code', goal: 'g' });
  assert.equal(out.ok, false);
  assert.match(out.error, /未注入 CliBackendRegistry/);
});

test('delegate: 桩 run 抛错 → ok:false 含原因（不静默返回空成功）', async () => {
  const { tool } = toolWith(() => {
    throw new Error('spawn 失败：boom');
  });
  const out = await tool.execute({}, { backend: 'codex', goal: 'g' });
  assert.equal(out.ok, false);
  assert.match(out.error, /boom/);
});

test('delegate: 桩 run timedOut:true → ok:false 且 timedOut=true（不静默）', async () => {
  const { tool } = toolWith(okResult({ text: '', timedOut: true, exitCode: 124, error: '超时已杀进程组' }));
  const out = await tool.execute({}, { backend: 'hermes', goal: 'g' });
  assert.equal(out.ok, false);
  assert.equal(out.timedOut, true);
  assert.match(out.error, /委派失败/);
});

test('delegate: 桩 run 空文本 → ok:false（拒绝静默返回空）', async () => {
  const { tool } = toolWith(okResult({ text: '   ' }));
  const out = await tool.execute({}, { backend: 'openclaw', goal: 'g' });
  assert.equal(out.ok, false);
  assert.match(out.error, /空文本/);
});

// ── 5. 默认只读（C1）/ 零明文（C4）─────────────────────────────────────────

test('delegate: 默认只读 —— 从不向 run 传 allowDangerous（C1）', async () => {
  const { tool, reg } = toolWith(okResult());
  await tool.execute({}, { backend: 'claude-code', goal: 'g' });
  const opts = reg.calls[0].opts;
  assert.equal('allowDangerous' in opts, false);
  assert.equal(opts.allowDangerous, undefined);
  // runOpts 只含白名单字段，不夹带密钥
  assert.deepEqual(Object.keys(opts).sort(), ['cwd', 'prompt']);
});

test('delegate: 委派 argv 不含任何 DENYLIST 危险旗标（C1）', () => {
  for (const b of [claudeCodeBackend, codexBackend, openclawBackend, hermesBackend]) {
    const args = b.buildArgs({ prompt: 'hi', cwd: '/tmp/b3c-root', resumeKey: 'sid' });
    assert.equal(findDeniedArg(args), null, `${b.id} argv 命中 DENYLIST`);
  }
  // 即便 resumeKey 恶意塞危险旗标 → 仍被 DENYLIST 识别（run 会据此拒绝）
  assert.equal(findDeniedArg(claudeCodeBackend.buildArgs({ prompt: 'x', resumeKey: '--yolo' })), '--yolo');
});

// ── 6. resumeKey 续接 argv（§承重事实实测）─────────────────────────────────

test('delegate: claude-code 续接 argv 含 `--resume <id>`（追加于固定 argv 后）', () => {
  assert.deepEqual(claudeCodeBackend.buildArgs({ prompt: 'p', resumeKey: 'sess-9' }), [
    '-p', 'p', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'default', '--resume', 'sess-9',
  ]);
  // 不带 resumeKey → 与既有 argv 逐字一致（零回归）
  assert.deepEqual(claudeCodeBackend.buildArgs({ prompt: 'p' }), [
    '-p', 'p', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'default',
  ]);
});

test('delegate: codex 续接 argv 形如 `exec resume <id> <prompt> …`', () => {
  assert.deepEqual(codexBackend.buildArgs({ prompt: 'p', resumeKey: 'thr-9' }), [
    'exec', 'resume', 'thr-9', 'p', '--json', '--skip-git-repo-check',
  ]);
  assert.deepEqual(codexBackend.buildArgs({ prompt: 'p' }), ['exec', 'p', '--json', '--skip-git-repo-check']);
});

test('delegate: openclaw/hermes 无续接能力 → 忽略 resumeKey（不报错，argv 与不带时一致）', () => {
  assert.deepEqual(
    openclawBackend.buildArgs({ prompt: 'p', cwd: '/tmp/b3c-root', resumeKey: 'sid' }),
    openclawBackend.buildArgs({ prompt: 'p', cwd: '/tmp/b3c-root' }),
  );
  assert.deepEqual(hermesBackend.buildArgs({ prompt: 'p', resumeKey: 'sid' }), ['-z', 'p']);
});

test('delegate: resumeKey 透传到 run → buildArgs（经 registry.run 端到端）', async () => {
  const captured = [];
  const backend = {
    id: 'echo-cap',
    label: 'Echo Capture',
    bin: 'echo', // 只需存在于 PATH；本测目的是断言 run 把 opts.resumeKey 透传给 buildArgs
    timeoutMs: 5000,
    buildArgs(input) {
      captured.push(input);
      return ['ok'];
    },
    parseLine: (line) => ({ text: String(line).trim() }),
  };
  const registry = new CliBackendRegistry([backend]);
  const res = await registry.run('echo-cap', { prompt: 'hello', cwd: process.cwd(), timeoutMs: 5000, resumeKey: 'sid-7' });
  assert.equal(res.exitCode, 0);
  assert.equal(captured[0].resumeKey, 'sid-7');
});

test('delegate: runOpts 透传 resumeKey/timeoutMs（白名单字段）', async () => {
  const { tool, reg } = toolWith(okResult());
  await tool.execute({}, { backend: 'claude-code', goal: 'g', resumeKey: 'sess-3', timeoutMs: 1200 });
  const opts = reg.calls[0].opts;
  assert.equal(opts.resumeKey, 'sess-3');
  assert.equal(opts.timeoutMs, 1200);
});
