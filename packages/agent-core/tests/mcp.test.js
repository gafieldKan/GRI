/**
 * MCP 实连集成测试（node --test, ESM）：
 * 把演示 stdio MCP server 当真实子进程拉起 → McpClient 握手/列工具/调用 → bridgeMcpTools 桥出可执行 Tool。
 * 覆盖 host node --test 的完整链路；容器 E2E 复用同一份 demo server。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { McpClient, listMcpServers, bridgeMcpTools, makeTool, ToolRegistry } from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEMO = join(__dirname, 'fixtures', 'demo-mcp-server.mjs');

const serverRow = {
  name: 'demo',
  transport: 'stdio',
  url: null,
  config: { command: 'node', args: [DEMO] },
};

/** 最小 Store（形如 storeFrom 的 {query}），只 serve agent.mcp_servers 查询。 */
function makeStore(rows) {
  return {
    async query(sql) {
      if (/FROM agent\.mcp_servers/.test(sql)) return { rows };
      throw new Error('unexpected query: ' + sql);
    },
  };
}

test('McpClient stdio：握手 + listTools + callTool 全通', async () => {
  const client = new McpClient(makeStore([]), {
    transport: serverRow.transport,
    url: serverRow.url,
    config: serverRow.config,
  });
  try {
    assert.equal(await client.connect(), true);
    const tools = await client.listTools('demo');
    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, ['fact.lookup', 'math.add']);
    const r = await client.callTool('demo', 'math.add', { a: 2, b: 3 });
    assert.equal(r.ok, true);
    assert.equal(r.text, '5');
  } finally {
    await client.disconnect();
  }
});

test('McpClient callTool 未知工具 → isError=true，不抛（宿主可回传文本）', async () => {
  const client = new McpClient(makeStore([]), { transport: 'stdio', config: { command: 'node', args: [DEMO] } });
  try {
    await client.connect();
    const r = await client.callTool('demo', 'nope.missing', {});
    assert.equal(r.ok, false);
    assert.match(r.text, /unknown tool/);
  } finally {
    await client.disconnect();
  }
});

test('bridgeMcpTools：启用行 → 产出可执行 Tool，命名 <serverKey>_<tool>，无干教学工具', async () => {
  const store = makeStore([serverRow]);
  const tools = await bridgeMcpTools(store);
  const names = tools.map((t) => t.name).sort();
  // fact.lookup → demo_fact_lookup（不落 '.'，NVIDIA 函数名兼容）；math.add → demo_math_add
  assert.deepEqual(names, ['demo_fact_lookup', 'demo_math_add']);

  const reg = new ToolRegistry().registerAll(tools);
  const mn = reg.get('demo_math_add');
  assert.ok(mn, 'bridge 出的工具已注册');
  assert.equal(mn.description.includes('[MCP demo]'), true);
  const out = await mn.execute({}, { a: 20, b: 22 });
  assert.equal(out, '42');
});

test('bridgeMcpTools：无启用行 → []（agent 侧 no-op，不回归）', async () => {
  const tools = await bridgeMcpTools(makeStore([]));
  assert.deepEqual(tools, []);
});

test('bridgeMcpTools：单台连不上被隔离跳过，不拖垮其余/agent', async () => {
  const store = makeStore([
    { name: 'broken', transport: 'stdio', url: null, config: { command: 'node_exec_that_does_not_exist_zzz', args: [] } },
    serverRow,
  ]);
  const tools = await bridgeMcpTools(store);
  // broken 跳过，demo 正常桥出
  assert.ok(tools.some((t) => t.name === 'demo_math_add'));
});

test('makeTool 默认形状与 ToolRegistry 类型一致（回归护栏）', () => {
  const t = makeTool({ name: 'x.y', execute: async () => 1 });
  assert.equal(t.name, 'x.y');
  assert.equal(typeof t.execute, 'function');
  assert.equal(typeof t.inputSchema.required.length, 'number');
});