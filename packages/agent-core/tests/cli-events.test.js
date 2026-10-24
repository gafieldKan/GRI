/**
 * onEvent 事件冒泡单测（B-4 反馈回路）—— 外部 agent 运行期不再只回终态。
 *
 * 覆盖：四类事件按序冒泡（started/assistant_delta/tool_use/result）· 生命周期终态唯一 ·
 *       死后端/超时 → error 事件带机器码 · 回调抛错被吞（不阻断执行）· delegate onEvent 透传
 *       （event={kind,data,backend} + ctx；不含 argv/prompt/密钥）· 未注入 onEvent 零变化。
 * 不依赖本机 CLI 真跑：用 node execPath 打印桩行端到端观测。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CliBackendRegistry, CLI_EVENT_KINDS, claudeCodeBackend, createDelegateTool } from '../src/index.js';

/** 桩后端：用 node execPath 打印给定行（逐行 → stdout）。 */
function printerBackend(id, lines, over = {}) {
  const script = `for (const l of ${JSON.stringify(lines)}) console.log(l);`;
  return {
    id,
    label: id,
    bin: process.execPath,
    timeoutMs: 5000,
    buildArgs: () => ['-e', script],
    parseLine: () => null,
    ...over,
  };
}

/** 采集事件。 */
function collector() {
  const events = [];
  return { events, onEvent: (kind, data) => events.push({ kind, data }) };
}

// ── 1. 四类事件按序冒泡 ─────────────────────────────────────────────────────
test('onEvent: claude-code stream-json → started/assistant_delta/tool_use/result 按序冒泡', async () => {
  const lines = [
    JSON.stringify({ type: 'system', subtype: 'init', session_id: 's1' }),
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: '思考中' }, { type: 'tool_use', name: 'Read' }] }, session_id: 's1' }),
    JSON.stringify({ type: 'result', subtype: 'success', result: '最终答复', session_id: 's1' }),
  ];
  // 用真 claude-code 解析器，但换 bin/argv 为 node 桩打印
  const backend = { ...claudeCodeBackend, bin: process.execPath, buildArgs: () => ['-e', `for (const l of ${JSON.stringify(lines)}) console.log(l);`] };
  const reg = new CliBackendRegistry([backend]);
  const { events, onEvent } = collector();
  const res = await reg.run('claude-code', { prompt: 'x', onEvent });
  assert.deepEqual(events.map((e) => e.kind), ['started', 'assistant_delta', 'tool_use', 'result']);
  assert.equal(events[1].data.text, '思考中');
  assert.equal(events[2].data.name, 'Read');
  assert.equal(events[3].data.text, '最终答复');
  assert.equal(events[3].data.sessionId, 's1'); // 终态 result 带 sessionId
  // 新路径不改汇总语义（零回归）：text/sessionId 仍正确
  assert.equal(res.text, '最终答复');
  assert.equal(res.sessionId, 's1');
  assert.equal(res.error, null);
});

test('onEvent: 事件 kind 恒落在 CLI_EVENT_KINDS 闭集内', async () => {
  const reg = new CliBackendRegistry([printerBackend('p1', ['a', 'b'], { parseLine: (l) => ({ text: l, events: [{ kind: 'assistant_delta', data: { text: l } }] }) })]);
  const { events, onEvent } = collector();
  await reg.run('p1', { prompt: 'x', onEvent });
  assert.ok(events.length >= 2);
  for (const e of events) assert.ok(CLI_EVENT_KINDS.includes(e.kind), `非法 kind: ${e.kind}`);
});

// ── 2. 生命周期：started 首、终态唯一 ───────────────────────────────────────
test('onEvent: started 恰一次且在最前；终态 result/error 恰一次且在最后', async () => {
  const reg = new CliBackendRegistry([printerBackend('p2', ['l1', 'l2', 'l3'], { parseLine: (l) => ({ text: l, events: [{ kind: 'assistant_delta', data: { text: l } }] }) })]);
  const { events, onEvent } = collector();
  await reg.run('p2', { prompt: 'x', onEvent });
  assert.equal(events.filter((e) => e.kind === 'started').length, 1);
  assert.equal(events[0].kind, 'started');
  assert.equal(events.filter((e) => e.kind === 'result' || e.kind === 'error').length, 1);
  assert.equal(events[events.length - 1].kind, 'result');
  // 三行 assistant_delta 全冒泡（中间行不丢）
  assert.equal(events.filter((e) => e.kind === 'assistant_delta').length, 3);
});

// ── 3. 死后端 / 超时 → error 事件带机器码 ───────────────────────────────────
test('onEvent: 后端不存在（ENOENT）→ started 后补 error(code=BACKEND_NOT_FOUND) 且 run reject', async () => {
  const reg = new CliBackendRegistry([
    { id: 'ghost', label: 'Ghost', bin: 'definitely-not-a-real-bin-b4-xyz', buildArgs: () => [], parseLine: () => null },
  ]);
  const { events, onEvent } = collector();
  await assert.rejects(() => reg.run('ghost', { prompt: 'x', onEvent }), /spawn 失败|未安装/);
  assert.equal(events[0].kind, 'started');
  const err = events.find((e) => e.kind === 'error');
  assert.ok(err, '应收到 error 事件');
  assert.equal(err.data.code, 'BACKEND_NOT_FOUND');
});

test('onEvent: 超时杀组 → error(code=TIMEOUT)（不静默）', async () => {
  const reg = new CliBackendRegistry([
    { id: 'slp', label: 'Slp', bin: 'sleep', timeoutMs: 60000, buildArgs: () => ['60'], parseLine: () => null },
  ]);
  const { events, onEvent } = collector();
  const res = await reg.run('slp', { prompt: 'x', timeoutMs: 250, onEvent });
  assert.equal(res.timedOut, true);
  const err = events.find((e) => e.kind === 'error');
  assert.ok(err && err.data.code === 'TIMEOUT', `实得: ${JSON.stringify(err)}`);
});

// ── 4. 回调健壮性（best-effort，绝不阻断执行）───────────────────────────────
test('onEvent: 回调抛错被吞 —— run 仍正常结算（不回归）', async () => {
  const reg = new CliBackendRegistry([printerBackend('p3', ['hello'], { parseLine: (l) => ({ text: l }) })]);
  const res = await reg.run('p3', { prompt: 'x', onEvent: () => { throw new Error('host boom'); } });
  assert.equal(res.text, 'hello');
  assert.equal(res.error, null);
});

test('onEvent: 未注入 onEvent → 行为与今日一致（不回调、不报错）', async () => {
  const reg = new CliBackendRegistry([printerBackend('p4', ['hi'], { parseLine: (l) => ({ text: l }) })]);
  const res = await reg.run('p4', { prompt: 'x' });
  assert.equal(res.text, 'hi');
  assert.equal(res.error, null);
});

// ── 5. delegate onEvent 透传 ────────────────────────────────────────────────
test('delegate: onEvent 透传 {kind,data,backend} + ctx，且不含 argv/prompt/密钥', async () => {
  const seen = [];
  const reg = {
    async run(id, opts) {
      opts.onEvent?.('started', {});
      opts.onEvent?.('assistant_delta', { text: 'part' });
      opts.onEvent?.('result', { text: 'done', sessionId: 's-sec' });
      return { text: 'done', sessionId: 's-sec', exitCode: 0, stderr: '', pid: 1, timedOut: false, error: null };
    },
  };
  const tool = createDelegateTool({
    cliBackends: reg,
    cwdAllowlist: ['/tmp/b4-root'],
    onEvent: (event, ctx) => seen.push({ event, ctx }),
  });
  const ctx = { entityId: 'stu-1' };
  const out = await tool.execute(ctx, { backend: 'claude-code', goal: 'SECRET-GOAL' });
  assert.equal(out.ok, true);
  assert.deepEqual(seen.map((s) => s.event.kind), ['started', 'assistant_delta', 'result']);
  assert.equal(seen[0].event.backend, 'claude-code');
  assert.equal(seen[1].event.data.text, 'part');
  assert.equal(seen[0].ctx, ctx); // ctx 透传
  // 事件面**不含** argv/prompt/密钥（goal 文本不得出现在事件里）
  const blob = JSON.stringify(seen.map((s) => s.event));
  assert.ok(!/SECRET-GOAL/.test(blob), '事件不得含 goal/prompt');
  assert.ok(!/argv|apiKey|api_key|token|secret/i.test(blob), '事件不得含密钥字段');
});

test('delegate: 未注入 onEvent → runOpts 逐字不变（零回归）', async () => {
  let captured = null;
  const reg = {
    async run(_id, opts) {
      captured = Object.keys(opts).sort();
      return { text: 'ok', sessionId: null, exitCode: 0, stderr: '', pid: 1, timedOut: false, error: null };
    },
  };
  const tool = createDelegateTool({ cliBackends: reg, cwdAllowlist: ['/tmp/b4-root'] });
  await tool.execute({ entityId: 'e' }, { backend: 'claude-code', goal: 'g' });
  assert.deepEqual(captured, ['cwd', 'prompt']);
});
