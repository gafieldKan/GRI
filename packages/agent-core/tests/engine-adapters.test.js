/**
 * CLI 引擎适配器（W2.6a，薄壳 shell-out）测试。
 *
 * 断言分三层：
 *   ① **黑盒一致性**：两个适配器都必须过 `assertEnginePortConformance`（「可换」的定义）。
 *   ② **执行面**：可用时确实把提示词交给 `CliBackendRegistry.run`，并把 CLI 文本/会话 id 如实带回。
 *   ③ **不静默**：超时 / 出错 / 空文本 / 注册表抛错 —— 一律 `success:false`，**不**伪装成成功，
 *      也**不**悄悄降级成回落（回落只留给「可用性闸门判定不可用」这一条确定性路径）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  claudeCodeEngine,
  openclawEngine,
  createCliEnginePort,
  CLAUDE_CODE_ENGINE_ID,
  OPENCLAW_ENGINE_ID,
  EngineRegistry,
} from '../src/index.js';
import { assertEnginePortConformance } from './conformance.js';

// ---------- 测试桩 ----------

/** 假 CLI 后端注册表：记录调用，按 `result`（值或 (id,opts)=>…) 回结果。**不 spawn 任何真进程**。 */
function fakeRegistry(result) {
  const calls = [];
  return {
    calls,
    async run(id, opts) {
      calls.push({ id, opts });
      return typeof result === 'function' ? result(id, opts) : result;
    },
  };
}

const OK = (text = 'CLI-OUT') => ({ text, sessionId: 'sess-1', exitCode: 0, stderr: '', pid: 1, timedOut: false, error: null });

/** 不可用档（`usable:false`）：用于过一致性套件（确定性回落路径）。 */
const unavailableDeps = () => ({
  registry: fakeRegistry(OK()),
  usable: () => false,
  defaultResponder: async (ctx) => ({ success: true, message: `echo:${ctx.entityId}` }),
});
const probe = (id) => `echo:${id}`;

/** 可用档：真走执行面。 */
const availableDeps = (over = {}) => ({
  registry: fakeRegistry(OK()),
  usable: () => true,
  defaultResponder: async () => ({ success: true, message: 'FALLBACK' }),
  ...over,
});

// ---------- ① 黑盒一致性（两个适配器都必须过）----------

test('conformance: claude-code 适配器通过可移植一致性套件', async () => {
  const engine = claudeCodeEngine(unavailableDeps());
  await assertEnginePortConformance(engine, { runProbe: probe, label: CLAUDE_CODE_ENGINE_ID });
});

test('conformance: openclaw 适配器通过可移植一致性套件', async () => {
  const engine = openclawEngine(unavailableDeps());
  await assertEnginePortConformance(engine, { runProbe: probe, label: OPENCLAW_ENGINE_ID });
});

test('两个适配器声明的边界：id 正确、toolLoop=engine、listTools 恒空（外壳环，不自带宿主工具）', () => {
  const claude = claudeCodeEngine(unavailableDeps());
  const openclaw = openclawEngine(unavailableDeps());
  assert.equal(claude.id, 'claude-code');
  assert.equal(openclaw.id, 'openclaw');
  for (const e of [claude, openclaw]) {
    assert.equal(e.capabilities.toolLoop, 'engine');
    assert.equal(e.capabilities.needsApiKey, false); // GRI 侧不见凭据
    assert.equal(e.capabilities.streaming, true);
    assert.deepEqual(e.listTools(), []);
    assert.deepEqual(e.listSkills(), []);
  }
  // 两者可并存于同一注册表（W2.6「并行两适配器」的落点）
  const reg = new EngineRegistry([claude, openclaw]);
  assert.deepEqual(reg.list().map((x) => x.id).sort(), ['claude-code', 'openclaw']);
});

// ---------- ② 执行面（可用时真调 CLI 后端）----------

test('可用时：把提示词交给对应后端，并带回 CLI 文本与会话 id', async () => {
  const registry = fakeRegistry(OK('你好，我是引擎'));
  const engine = claudeCodeEngine(availableDeps({ registry }));

  const out = await engine.run({ entityId: 'stu-1', userMessage: '帮我复习错题' });

  assert.equal(registry.calls.length, 1);
  assert.equal(registry.calls[0].id, 'claude-code'); // 后端 id 正确（不是引擎 id 乱传）
  assert.equal(registry.calls[0].opts.prompt, '帮我复习错题'); // 缺省口径 = 本轮 userMessage
  assert.deepEqual(out, { success: true, message: '你好，我是引擎', engine: 'claude-code', sessionId: 'sess-1' });
});

test('openclaw 走它自己的后端 id（两适配器不串线）', async () => {
  const registry = fakeRegistry(OK('oc'));
  const engine = openclawEngine(availableDeps({ registry }));
  await engine.run({ entityId: 'stu-2', userMessage: 'hi' });
  assert.equal(registry.calls[0].id, 'openclaw');
});

test('提示词口径：persona 前缀 + 自定义 composePrompt；opts.resumeKey/onEvent 透传到后端', async () => {
  const registry = fakeRegistry(OK());
  const seenEvents = [];
  const engine = claudeCodeEngine(availableDeps({
    registry,
    persona: '你是教学助手',
    composePrompt: (ctx) => `课题：${ctx.userMessage}`,
  }));

  await engine.run({
    entityId: 'stu-3',
    userMessage: '勾股定理',
    opts: { resumeKey: 'sess-x', onEvent: (k) => seenEvents.push(k) },
  });

  assert.equal(registry.calls[0].opts.prompt, '你是教学助手\n\n课题：勾股定理');
  assert.equal(registry.calls[0].opts.resumeKey, 'sess-x');
  assert.equal(typeof registry.calls[0].opts.onEvent, 'function'); // 事件回调真透传（宿主据此落库）
  assert.equal(registry.calls[0].opts.allowDangerous, false); // 缺省最小权限
});

// ---------- ③ 不静默（错误如实上报，不伪装成功也不偷偷回落）----------

test('CLI 超时 / 出错 / 返回空 → 一律 success:false（拒绝静默降级/静默返回空）', async () => {
  const cases = [
    [{ ...OK(), timedOut: true, text: '' }, /超时/],
    [{ ...OK(), error: 'spawn ENOENT', text: '' }, /spawn ENOENT/],
    [{ ...OK(), text: '   ' }, /空结果/],
  ];
  for (const [res, re] of cases) {
    const engine = claudeCodeEngine(availableDeps({ registry: fakeRegistry(res) }));
    const out = await engine.run({ entityId: 'stu-4', userMessage: 'q' });
    assert.equal(out.success, false, `应失败: ${JSON.stringify(res)}`);
    assert.match(out.message, re);
    assert.equal(out.engine, 'claude-code');
    // 关键：**没有**回落到 FALLBACK —— 真实错误不得被回落掩盖
    assert.notEqual(out.message, 'FALLBACK');
  }
});

test('后端注册表抛错（未知后端/危险旗标）→ success:false，不静默降级', async () => {
  const registry = { run: async () => { throw new Error("未知 CLI 后端: 'claude-code'"); } };
  const engine = claudeCodeEngine(availableDeps({ registry }));
  const out = await engine.run({ entityId: 'stu-5', userMessage: 'q' });
  assert.equal(out.success, false);
  assert.match(out.message, /未知 CLI 后端/);
  assert.notEqual(out.message, 'FALLBACK');
});

test('后端返回**非对象**（注入的注册表违约）→ success:false，绝不抛 TypeError 给宿主', async () => {
  // 独立复验抓到的缺口：`res.timedOut` 原在 try 之外且无 `!res` 守卫 —— 回 undefined 时整条 run() 抛错。
  // 与 `LlmClient._chatViaCli`（`if (!res || res.timedOut || res.error)`）同口径。
  for (const bad of [undefined, null, 'oops', 42]) {
    const engine = claudeCodeEngine(availableDeps({ registry: fakeRegistry(bad) }));
    const out = await engine.run({ entityId: 'stu-7', userMessage: 'q' });
    assert.equal(out.success, false, `非对象结果须判失败: ${String(bad)}`);
    assert.match(out.message, /非法结果/);
  }
});

// ---------- 可用性闸门 ----------

test('可用性探针**抛错** → 按不可用处理（走确定性回落，不去 spawn 状态未知的进程）', async () => {
  const registry = fakeRegistry(OK());
  const engine = claudeCodeEngine(availableDeps({
    registry,
    usable: () => { throw new Error('探针炸了'); },
    defaultResponder: async (ctx) => ({ success: true, message: `echo:${ctx.entityId}` }),
  }));
  const out = await engine.run({ entityId: 'stu-6', userMessage: 'q' });
  assert.deepEqual(out, { success: true, message: 'echo:stu-6' });
  assert.equal(registry.calls.length, 0); // 一次都没调后端
});

test('不可用时回落到 defaultResponder，且把 ctx（含 entityId）原样交给它 —— 每 entity 隔离', async () => {
  const engine = openclawEngine(unavailableDeps());
  const a = await engine.run({ entityId: 'a', userMessage: 'q' });
  const b = await engine.run({ entityId: 'b', userMessage: 'q' });
  assert.deepEqual(a, { success: true, message: 'echo:a' });
  assert.deepEqual(b, { success: true, message: 'echo:b' });
});

test('responder 回 null → 兜底文案（绝不空手而归，也不抛）', async () => {
  const engine = claudeCodeEngine({ registry: fakeRegistry(OK()), usable: () => false, defaultResponder: async () => null });
  const out = await engine.run({ entityId: 'x', userMessage: '你好' });
  assert.equal(out.success, true);
  assert.match(out.message, /claude-code 不可用/);
});

test('提示词为空（无 userMessage 且无 persona）→ 回落，不 spawn', async () => {
  const registry = fakeRegistry(OK());
  const engine = claudeCodeEngine(availableDeps({ registry }));
  const out = await engine.run({ entityId: 'x', userMessage: '' });
  assert.equal(out.message, 'FALLBACK');
  assert.equal(registry.calls.length, 0);
});

// ---------- 构造期校验 ----------

test('createCliEnginePort 构造期拒绝缺件（缺注册表 / 缺回落应答），不产出残废引擎', () => {
  const attempts = [
    [() => createCliEnginePort({ id: 'x', cliBackendId: 'claude-code', defaultResponder: async () => ({}) }), 'MISSING_REGISTRY'],
    [() => createCliEnginePort({ id: 'x', cliBackendId: 'claude-code', registry: fakeRegistry(OK()) }), 'MISSING_DEFAULT_RESPONDER'],
    [() => createCliEnginePort({ cliBackendId: 'claude-code', registry: fakeRegistry(OK()), defaultResponder: async () => ({}) }), 'MISSING_ENGINE_ID'],
    [() => createCliEnginePort({ id: 'x', registry: fakeRegistry(OK()), defaultResponder: async () => ({}) }), 'MISSING_CLI_BACKEND_ID'],
  ];
  for (const [fn, code] of attempts) {
    assert.throws(fn, (e) => e.code === code, `应拒绝，码=${code}`);
  }
});

test('toolLoop 是定义性事实、不可覆写：写非 engine 即构造期拒；其余能力位仍可覆写', () => {
  // 独立复验发现：`...spec.capabilities` 原先在末位，host 可把 toolLoop 覆写成 'host' —— 与
  // 「shell-out 把环整个甩给外部 CLI」的事实直接矛盾（会骗过依赖该位的宿主）。故响亮拒绝。
  for (const tl of ['host', 'nonsense']) {
    assert.throws(
      () => claudeCodeEngine(availableDeps({ capabilities: { toolLoop: tl } })),
      (e) => e.code === 'TOOL_LOOP_NOT_OVERRIDABLE',
      `toolLoop='${tl}' 应被拒`,
    );
  }
  // 显式写 'engine' 合法（幂等）
  assert.equal(claudeCodeEngine(availableDeps({ capabilities: { toolLoop: 'engine' } })).capabilities.toolLoop, 'engine');
  // 其余能力位照旧可覆写（如宿主确知该 CLI 支持多模态）
  const e = openclawEngine(availableDeps({ capabilities: { multimodal: true } }));
  assert.equal(e.capabilities.multimodal, true);
  assert.equal(e.capabilities.toolLoop, 'engine');
});
