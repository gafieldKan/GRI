/**
 * McpPool 集成测试：跨消息复用连接（不再每消息 spawn 子进程）+ 串行化 + 空闲回收。
 * 真转 demo stdio server（SDK 握手），用 pool.stats 断言连接数不变。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { McpPool } from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEMO = join(__dirname, 'fixtures', 'demo-mcp-server.mjs');

const serverRows = () => [
  { name: 'demo', transport: 'stdio', url: null, config: { command: 'node', args: [DEMO] } },
];

function makeStore(rows) {
  return {
    async query(sql) {
      if (/FROM agent\.mcp_servers/.test(sql)) return { rows };
      throw new Error('unexpected query: ' + sql);
    },
  };
}

test('复用：同样 server 桥两次 → 只建 1 条连接，工具可反复执行', async () => {
  const pool = new McpPool(makeStore(serverRows()));
  try {
    const a = await pool.bridgeTools();
    const b = await pool.bridgeTools();
    assert.equal(pool.stats.connections, 1, '跨消息应复用同一条连接');
    assert.deepEqual(a.map((t) => t.name).sort(), ['demo_fact_lookup', 'demo_math_add']);
    assert.deepEqual(b.map((t) => t.name).sort(), a.map((t) => t.name).sort());
    const r1 = await a.find((t) => t.name === 'demo_math_add').execute({}, { a: 1, b: 2 });
    assert.equal(r1, '3');
    const r2 = await a.find((t) => t.name === 'demo_fact_lookup').execute({}, { id: 'water' });
    assert.match(r2, /100/);
    assert.equal(pool.stats.calls, 2);
    assert.equal(pool.stats.connections, 1, '执行调用不应再建连接');
  } finally {
    await pool.disconnect();
  }
});

test('无 enabled server → 桥出 []，0 连接（no-op）', async () => {
  const pool = new McpPool(makeStore([]));
  try {
    const tools = await pool.bridgeTools();
    assert.deepEqual(tools, []);
    assert.equal(pool.stats.connections, 0);
  } finally {
    await pool.disconnect();
  }
});

test('单台连不上 → 隔离跳过不崩，其余照常', async () => {
  const pool = new McpPool(makeStore([
    { name: 'broken', transport: 'stdio', url: null, config: { command: 'node_exec_that_does_not_exist_zzz', args: [] } },
    ...serverRows(),
  ]));
  try {
    const tools = await pool.bridgeTools();
    assert.ok(tools.some((t) => t.name === 'demo_math_add'));
    assert.ok(!tools.some((t) => t.name.startsWith('broken_')));
  } finally {
    await pool.disconnect();
  }
});

test('空闲回收：超时未用连接被 prune，再用则重新建', async () => {
  const pool = new McpPool(makeStore(serverRows()), { idleTtlMs: 50, autoPrune: false });
  try {
    await pool.bridgeTools();
    assert.equal(pool.stats.connections, 1);
    await new Promise((r) => setTimeout(r, 120)); // 超过 idleTtlMs
    await pool.pruneIdle();
    assert.equal(pool.stats.pruned, 1);
    // 再次桥 → 重新建连接
    await pool.bridgeTools();
    assert.equal(pool.stats.connections, 2);
  } finally {
    await pool.disconnect();
  }
});

test('并发调用同一 server → 串行且各得正确结果', async () => {
  const pool = new McpPool(makeStore(serverRows()));
  try {
    const [t] = (await pool.bridgeTools()).filter((x) => x.name === 'demo_math_add');
    const results = await Promise.all([1, 2, 3, 4, 5].map((n) => t.execute({}, { a: n, b: 10 })));
    assert.deepEqual(results, ['11', '12', '13', '14', '15']);
    assert.equal(pool.stats.calls, 5);
  } finally {
    await pool.disconnect();
  }
});