import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AgentCore, ModelRouter, ToolRegistry, SkillRegistry, MemoryStore, makeTool, storeFrom,
} from '../src/index.js';

function emptyStore() {
  const rows = [];
  return storeFrom(async (text, params = []) => {
    if (/INSERT INTO agent\.memory/.test(text)) {
      const parsed = JSON.parse(params[2]);
      const e = rows.find((x) => x.entity_id === params[0] && x.fact_key === params[1]);
      if (e) { e.value = parsed; e.strength = Math.max(e.strength, params[3]); }
      else rows.push({ entity_id: params[0], fact_key: params[1], value: parsed, strength: params[3] });
      return { rows: [], rowCount: 1 };
    }
    if (/SELECT fact_key, value, strength/.test(text)) {
      return { rows: rows.filter((x) => x.entity_id === params[0]) };
    }
    if (/SELECT value, strength, updated_at/.test(text)) {
      const e = rows.find((x) => x.entity_id === params[0] && x.fact_key === params[1]);
      return { rows: e ? [e] : [] };
    }
    if (/DELETE FROM agent\.memory/.test(text)) return { rows: [], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
}

/** 无 key 环境：isRealKey=false → mock 路径。 */
test('agent-core: 无 key → 走 defaultResponder（mock 降级）', async () => {
  const store = emptyStore();
  const router = new ModelRouter(store, {});
  const memory = new MemoryStore(store);
  const tools = new ToolRegistry().register(makeTool({
    name: 'quiz.grade',
    description: '判分',
    async execute(ctx, args) { return { correct: true }; },
  }));
  const skills = new SkillRegistry().register({ name: 'tutor', description: '教师', instructions: '耐心讲解。' });
  const agent = new AgentCore({
    router, store, tools, skills, memory,
    persona: '你是 AI 助教。',
    defaultResponder: async (ctx, o) => ({
      success: true, phase: 'teach', message: `演示回复（学生 ${o.entityId}）`,
    }),
  });
  const out = await agent.run({ entityId: 'studentA', userMessage: '你好' });
  assert.equal(out.success, true);
  assert.equal(out.message, '演示回复（学生 studentA）');
  assert.equal(out.phase, 'teach');
  assert.equal(agent.listTools()[0].name, 'quiz.grade');
  assert.equal(agent.listSkills()[0].name, 'tutor');
});

test('agent-core: 每生独立记忆 → 他人读不到', async () => {
  const store = emptyStore();
  const router = new ModelRouter(store, {});
  const memory = new MemoryStore(store);
  const agent = new AgentCore({ router, store, tools: new ToolRegistry(), skills: new SkillRegistry(), memory });
  await memory.set('A', 'fact.x', 'A的', 1);
  await memory.set('B', 'fact.x', 'B的', 1);
  assert.equal(await memory.get('A', 'fact.x'), 'A的');
  assert.equal(await memory.get('B', 'fact.x'), 'B的');
  assert.equal(await agent.memory.get('A', 'fact.x'), 'A的');
});

/* ---- 真实 key 路径：用 stub LlmClient 模拟 function-calling 工具循环 ---- */

class StubLlm {
  constructor(replies) {
    this.replies = replies; // 每轮 chat 依次返回的 content
    this.callIdx = 0;
    this.msgCount = 0;
  }
  async isRealKey() { return true; }
  async chat() {
    const c = this.replies[Math.min(this.callIdx++, this.replies.length - 1)];
    this.msgCount++;
    return { content: c, usage: null };
  }
}

test('agent-core: 真实 key → function-calling 循环产出', async () => {
  const store = emptyStore();
  const router = new ModelRouter(store, { LLM_API_KEY: 'nvapi-test', LLM_API_URL: 'http://x' });
  const memory = new MemoryStore(store);
  const audits = [];
  const tools = new ToolRegistry().register(makeTool({
    name: 'quiz.grade',
    description: '判分',
    inputSchema: { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] },
    async execute(ctx, args) { return { correct: true, answer: args.a }; },
  }));
  const llm = new StubLlm([
    '{"tool":"quiz.grade","arguments":{"a":"2+2"}}',
    '答案是 4。',
  ]);
  const agent = new AgentCore({ router, store, tools, skills: new SkillRegistry(), memory, llm, onRun: (a) => audits.push(a) });
  const out = await agent.run({ entityId: 'A', userMessage: '判个分' });
  assert.equal(out.message, '答案是 4。');
  assert.ok(out.toolCallsProcessed >= 1, '应至少执行一次工具循环');
  assert.equal(audits.length, 1, '工具执行应入审计');
  assert.equal(audits[0].tool_name, 'quiz.grade');
});

test('agent-core: 结构化 tool_calls（OpenAI 兼容）也被解析调用', async () => {
  const store = emptyStore();
  const router = new ModelRouter(store, { LLM_API_KEY: 'nvapi-test', LLM_API_URL: 'http://x' });
  const calls = [];
  const received = []; // 记录 LLM 每轮收到的最新消息（验证 tool_call_id 配对不破坏协议）
  const tools = new ToolRegistry().register(makeTool({
    name: 'memory.remember',
    description: '记记忆',
    inputSchema: { type: 'object', properties: { key: { type: 'string' }, value: { type: 'string' } }, required: ['key', 'value'] },
    async execute(ctx, args) { calls.push(args); return { saved: true }; },
  }));
  // stub 依次返回「结构化 tool_calls（带 id）→ 纯文本」
  const llm = {
    async isRealKey() { return true; },
    async chat(messages) {
      received.push(messages);
      const n = this._n = (this._n || 0) + 1;
      return n === 1
        ? { content: '', toolCalls: [{ id: 'call_123', function: { name: 'memory.remember', arguments: '{"key":"pref.x","value":"1"}' } }], usage: null }
        : { content: '已记住，下次我会用。', toolCalls: null, usage: null };
    },
  };
  const agent = new AgentCore({ router, store, tools, skills: new SkillRegistry(), memory: new MemoryStore(store), llm });
  const out = await agent.run({ entityId: 'A', userMessage: '帮我记住 x=1' });
  assert.deepEqual(calls, [{ key: 'pref.x', value: '1' }]);
  assert.equal(out.message, '已记住，下次我会用。');
  assert.equal(out.toolCallsProcessed, 1);

  // —— 协议回归（曾致 400 missing field tool_call_id）——
  // 第二轮 LLM 收到：assistant 消息必须带 tool_calls（含 id），后跟 role:'tool'+tool_call_id 配对。
  const second = received[1];
  const assistant = second.find((m) => m.role === 'assistant' && m.tool_calls);
  assert.ok(assistant, 'assistant 消息应原样携带 tool_calls');
  assert.equal(assistant.tool_calls[0].id, 'call_123');
  const toolResult = second.find((m) => m.role === 'tool');
  assert.ok(toolResult, '应存在 role:tool 的结果消息');
  assert.equal(toolResult.tool_call_id, 'call_123', 'tool 结果必须用 tool_call_id 配对');
  // 且不得残留缺配对的旧 tool 消息形态
  assert.ok(!second.find((m) => m.role === 'tool' && !m.tool_call_id), '所有 tool 消息都必须带 tool_call_id');
});

test('agent-core: 工具调用缺参 → 校验失败记审计不崩', async () => {
  const store = emptyStore();
  const router = new ModelRouter(store, { LLM_API_KEY: 'nvapi-test', LLM_API_URL: 'http://x' });
  const audits = [];
  const tools = new ToolRegistry().register(makeTool({
    name: 'need.a',
    description: '要 a',
    inputSchema: { type: 'object', properties: {}, required: ['a'] },
    async execute() { return 1; },
  }));
  const llm = new StubLlm(['{"tool":"need.a"}']); // 缺 a
  const agent = new AgentCore({ router, store, tools, skills: new SkillRegistry(), memory: new MemoryStore(store), llm, onRun: (a) => audits.push(a) });
  await agent.run({ entityId: 'A', userMessage: 'x' });
  assert.ok(audits.some((a) => a.error && /缺少必填参数/.test(a.error)), '缺参应入审计');
});