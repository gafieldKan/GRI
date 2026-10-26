import { test } from 'node:test';
import assert from 'node:assert/strict';

import { AgentCore, ToolRegistry, makeTool, defineEnginePort, isEnginePort, EngineRegistry, ENGINE_API_VERSION, GRI_CORE_CAPABILITIES } from '../src/index.js';
import { assertEnginePortConformance, CONFORMANCE_CHECKS } from './conformance.js';

// ---------- 测试桩 ----------

/** 无真实 key 的 router（isRealKey()=false → 走确定性 mock 路径）。 */
const noKeyRouter = { resolve: async () => ({ provider: 'nvidia', model: 'stub', baseUrl: '', apiKey: '' }) };

const stubs = () => ({
  router: noKeyRouter,
  store: {},
  tools: new ToolRegistry(),
  skills: { list: () => [], instructionsBlock: () => '' },
  memory: { digest: async () => '' },
});

/**
 * 建一个 gri-core（默认引擎）。`runProbe` 供一致性套件校验确定性应答与 entity 隔离。
 * responder 形如 `echo:<entityId>` —— 应答随 entityId 变化，任何跨 entity 复用都会被抓。
 */
function makeGriCore({ tools } = {}) {
  const s = stubs();
  if (tools) s.tools = tools;
  const engine = new AgentCore({
    ...s,
    defaultResponder: async (ctx) => ({ success: true, message: `echo:${ctx.entityId}` }),
  });
  return { engine, runProbe: (entityId) => `echo:${entityId}` };
}

/** 脚本化 LLM：逐轮返回预置 res；记录每轮收到的 messages 与 payload 工具名。 */
function scriptedLlm(script) {
  const seen = [];
  let i = 0;
  return {
    seen,
    isRealKey: async () => true,
    async chat(messages, _routeKey, opts = {}) {
      seen.push({
        messages: JSON.parse(JSON.stringify(messages)),
        toolNames: Array.isArray(opts.tools) ? opts.tools.map((t) => t.function.name) : [],
      });
      return script[i++] ?? { content: '' };
    },
  };
}

// ---------- 黑盒一致性（任一引擎适配器都必须过） ----------

test('conformance: gri-core 通过可移植一致性套件（形状/列表/无 key 回落/隔离）', async () => {
  const { engine, runProbe } = makeGriCore();
  assert.equal(CONFORMANCE_CHECKS.length, 4);
  await assertEnginePortConformance(engine, { runProbe, label: 'gri-core' });
});

test('conformance: 违约引擎（无 key 却不回落后端）被套件抓住', async () => {
  // 一个不遵守「无 key 回落」的假引擎：恒返回固定串
  const bad = { id: 'bad', apiVersion: '1', capabilities: { toolLoop: 'engine' }, listTools: () => [], listSkills: () => [], run: async () => ({ success: true, message: 'fixed' }) };
  await assert.rejects(
    () => assertEnginePortConformance(bad, { runProbe: (id) => `echo:${id}`, label: 'bad' }),
    /回落 defaultResponder/,
  );
});

// ---------- gri-core 真实环内部不变量（(b) 净化往返 / (c) tool_call_id 配对） ----------

test('gri-core: 工具名净化往返 —— 注册名含 "." 也能被模型按清洗名调起', async () => {
  const calls = [];
  const tools = new ToolRegistry();
  tools.register(makeTool({
    name: 'probe.echo',
    description: '回声',
    inputSchema: { type: 'object' },
    execute: async (ctx, args) => { calls.push({ entityId: ctx.entityId, args }); return 'PONG'; },
  }));

  const llm = scriptedLlm([
    { content: '', toolCalls: [{ id: 'call_1', function: { name: 'probe-echo', arguments: '{"x":1}' } }] },
    { content: 'done' },
  ]);
  const engine = new AgentCore({ ...stubs(), tools, llm, defaultResponder: async () => null });

  const out = await engine.run({ entityId: 'stu-1', userMessage: 'go' });

  // payload 里给模型的是**清洗名**（无 "."），符合 OpenAI/NVIDIA 命名约束
  assert.deepEqual(llm.seen[0].toolNames, ['probe-echo']);
  // 反查回注册名 'probe.echo' 并真的执行了（净化往返闭合）
  assert.deepEqual(calls, [{ entityId: 'stu-1', args: { x: 1 } }]);
  assert.equal(out.message, 'done');
});

test('gri-core: tool_call_id 配对 —— assistant 带 tool_calls，tool 结果用同 id 回喂', async () => {
  const tools = new ToolRegistry();
  tools.register(makeTool({ name: 'probe.echo', description: 'x', execute: async () => 'PONG' }));

  const llm = scriptedLlm([
    { content: '', toolCalls: [{ id: 'call_42', function: { name: 'probe-echo', arguments: '{}' } }] },
    { content: 'done' },
  ]);
  const engine = new AgentCore({ ...stubs(), tools, llm, defaultResponder: async () => null });
  await engine.run({ entityId: 'stu-1', userMessage: 'go' });

  const secondReq = llm.seen[1].messages; // 第二轮请求
  const assistant = secondReq.find((m) => m.role === 'assistant' && m.tool_calls);
  assert.ok(assistant, 'assistant 消息必须原样带 tool_calls（否则下一轮 400）');
  assert.equal(assistant.tool_calls[0].id, 'call_42');
  const toolMsg = secondReq.find((m) => m.role === 'tool');
  assert.ok(toolMsg, '工具结果必须以 role:tool 回喂');
  assert.equal(toolMsg.tool_call_id, 'call_42', 'tool_call_id 必须与 assistant 的调用配对');
  assert.equal(toolMsg.content, 'PONG');
});

test('gri-core: 无 key 回落 defaultResponder（确定性路径保命）', async () => {
  const { engine } = makeGriCore();
  const out = await engine.run({ entityId: 'stu-9', userMessage: '你好' });
  assert.deepEqual(out, { success: true, message: 'echo:stu-9' });
});

// ---------- 端口契约与注册表 ----------

test('EnginePort: defineEnginePort 校验并冻结；非法一律拒', () => {
  const ok = defineEnginePort({ id: 'x', run: async () => ({ success: true, message: '' }), capabilities: { toolLoop: 'engine' } });
  assert.equal(ok.apiVersion, ENGINE_API_VERSION);
  assert.equal(ok.capabilities.toolLoop, 'engine');
  assert.ok(Object.isFrozen(ok) && Object.isFrozen(ok.capabilities));

  const cases = [
    [{ run: async () => {} }, 'MISSING_ENGINE_ID'],
    [{ id: 'x' }, 'MISSING_RUN'],
    [{ id: 'x', apiVersion: '9', run: async () => {} }, 'INCOMPATIBLE_API_VERSION'],
    [null, 'NOT_AN_OBJECT'],
  ];
  for (const [spec, code] of cases) {
    try {
      defineEnginePort(spec);
      assert.fail(`应拒绝: ${JSON.stringify(spec)}`);
    } catch (e) {
      assert.equal(e.code, code);
    }
  }
});

test('EnginePort: AgentCore 自声明为 gri-core（host 环、可委派）', () => {
  const { engine } = makeGriCore();
  assert.equal(engine.id, 'gri-core');
  assert.equal(engine.apiVersion, '1');
  assert.equal(engine.capabilities.toolLoop, 'host');
  assert.equal(engine.capabilities.subagents, true);
  assert.ok(isEnginePort(engine));
});

test('gri-core 能力声明单一真源：GRI_CORE_CAPABILITIES 与实例**同一冻结对象**（宿主列举不会漂移）', () => {
  // 宿主侧「列可用引擎」（/api/v1/agent/engines）不构造 AgentCore 也要报 gri-core 的能力面 —
  // 若各处各写一份，能力位会漂移（例如一边说 streaming=true 一边 false）。故钉死「同一真源」。
  const { engine } = makeGriCore();
  assert.equal(engine.capabilities, GRI_CORE_CAPABILITIES); // 同一对象（非拷贝）
  assert.deepEqual({ ...engine.capabilities }, { ...GRI_CORE_CAPABILITIES });
  assert.equal(Object.isFrozen(GRI_CORE_CAPABILITIES), true);
});

test('EngineRegistry: 撞名拒绝；list() 只回可序列化清单', () => {
  const reg = new EngineRegistry();
  const mk = (id) => defineEnginePort({ id, run: async () => ({}) });
  reg.register(mk('gri-core'));
  assert.ok(reg.has('gri-core'));
  assert.equal(reg.get('nope'), null);
  assert.deepEqual(reg.list().map((e) => e.id), ['gri-core']);
  try {
    reg.register(mk('gri-core'));
    assert.fail('应拒绝撞名');
  } catch (e) {
    assert.equal(e.code, 'DUPLICATE_ENGINE_ID');
  }
  assert.throws(() => reg.register({ id: 'bad' }), (e) => e.code === 'INVALID_ENGINE');
});
