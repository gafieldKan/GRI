import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ModelRouter, storeFrom, DEFAULT_ENGINE } from '../src/index.js';

/** 内存 fake store，模拟 agent.llm_routes 表。 */
function fakeStore(routes = []) {
  const rowsByKey = new Map(routes.map((r) => [r.route_key, r]));
  return storeFrom(async (text, params = []) => {
    if (/SELECT \* FROM agent\.llm_routes WHERE route_key = \$1/.test(text)) {
      const row = rowsByKey.get(params[0]);
      return { rows: row ? [row] : [] };
    }
    if (/ORDER BY route_key/.test(text)) {
      return { rows: routes.map((r) => ({ route_key: r.route_key, model: r.model, enabled: r.enabled })) };
    }
    if (/INSERT INTO agent\.llm_routes/.test(text)) {
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
}

test('model-router: env 兜底当无路由', async () => {
  const env = { LLM_PROVIDER: 'nvidia', LLM_MODEL: 'm', LLM_API_KEY: 'nvapi-in-env' };
  const r = new ModelRouter(fakeStore([]), env);
  const cfg = await r.resolve('default');
  assert.equal(cfg.source, 'env');
  assert.equal(cfg.model, 'm');
  assert.equal(cfg.apiKey, 'nvapi-in-env'); // env key 保留（运行时凭据）
  assert.equal(await r.isRealKey('default'), true);
});

test('model-router: route 命中优先于 env，apiKey 不落表', async () => {
  const env = { LLM_MODEL: 'env-model', LLM_API_KEY: 'nvapi-in-env' };
  const r = new ModelRouter(fakeStore([{ route_key: 'entity=abc', model: 'route-model', enabled: true }]), env);
  const cfg = await r.resolve('entity=abc');
  assert.equal(cfg.source, 'route');
  assert.equal(cfg.model, 'route-model'); // 路由行覆盖 model
  assert.equal(cfg.apiKey, 'nvapi-in-env'); // apiKey 一律取 env，不入行
  assert.equal(await r.isRealKey('entity=abc'), true);
});

test('model-router: 无 key → isRealKey false（mock gate）', async () => {
  const r = new ModelRouter(fakeStore([]), {});
  assert.equal(await r.isRealKey('default'), false);
});

test('model-router: disabled 路由跳过 → 回退 env/下一候选', async () => {
  const env = { LLM_PROVIDER: 'nvidia' };
  const r = new ModelRouter(
    fakeStore([
      { route_key: 'entity=abc', model: 'off-model', enabled: false },
      { route_key: 'default', model: 'default-model', enabled: true },
    ]),
    env,
  );
  const cfg = await r.resolve('entity=abc');
  assert.equal(cfg.model, 'default-model'); // 具体路由禁用 → 落到 default
});

test('model-router: set upsert 可用', async () => {
  const calls = [];
  const store = storeFrom(async (text, params) => {
    calls.push({ text, params });
    return { rows: [], rowCount: 0 };
  });
  const r = new ModelRouter(store, {});
  await r.set({ route_key: 'default', model: 'm1', enabled: true });
  const upsert = calls.find((c) => /INSERT INTO agent\.llm_routes/.test(c.text));
  assert.ok(upsert, '应走 INSERT … ON CONFLICT');
  assert.ok(!calls.some((c) => /api_?key/i.test(c.text)), '写入不应含 apiKey');
});

test('model-router: 未传 provider 不写 NULL（NOT NULL 默认列，防 23502 / 500）', async () => {
  const calls = [];
  const store = storeFrom(async (text, params) => {
    calls.push({ text, params });
    return { rows: [], rowCount: 1 };
  });
  const r = new ModelRouter(store, {});
  await r.set({ route_key: 'entity=abc', model: 'm' });
  const upsert = calls.find((c) => /INSERT INTO agent\.llm_routes/.test(c.text));
  assert.ok(upsert, '应走 INSERT … ON CONFLICT');
  assert.ok(/COALESCE\(\$2, 'nvidia'\)/.test(upsert.text), '插入时 provider 缺省落 nvidia');
  assert.ok(/provider = COALESCE\(\$2, agent\.llm_routes\.provider\)/.test(upsert.text), '冲突时保留旧 provider');
  assert.equal(upsert.params[1], null); // 应用侧仍传 null，由 SQL COALESCE 兜底
});

test('model-router: 表缺失不回崩（回退 env）', async () => {
  const env = { LLM_MODEL: 'fallback' };
  const store = storeFrom(async () => {
    throw new Error('relation does not exist');
  });
  const r = new ModelRouter(store, env);
  const cfg = await r.resolve('default');
  assert.equal(cfg.source, 'env');
  assert.equal(cfg.model, 'fallback');
});

// ─── B-3b：provider='cli' 路由分支（换脑子接入点）───────────────────────────────

test('model-router: 非 cli 行 → cliBackend 恒 null（默认零回归）', async () => {
  const env = { LLM_MODEL: 'm', LLM_API_KEY: 'nvapi-in-env' };
  const r = new ModelRouter(fakeStore([{ route_key: 'entity=abc', model: 'route-model', enabled: true }]), env);
  const hit = await r.resolve('entity=abc');
  assert.equal(hit.cliBackend, null); // route 命中但非 cli → 无信号
  assert.equal(hit.source, 'route');
  const miss = await r.resolve('entity=zzz'); // 无行 → env
  assert.equal(miss.cliBackend, null);
  assert.equal(miss.source, 'env');
  assert.equal(await r.isRealKey('entity=zzz'), true); // env nvapi- key 仍判真
});

test('model-router: provider=cli, model=claude-code → cliBackend 信号 + source=route:cli', async () => {
  const r = new ModelRouter(
    fakeStore([{ route_key: 'entity=abc', provider: 'cli', model: 'claude-code', enabled: true }]),
    {},
  );
  const cfg = await r.resolve('entity=abc');
  assert.equal(cfg.provider, 'cli');
  assert.equal(cfg.cliBackend, 'claude-code'); // model 字段即后端 id
  assert.equal(cfg.source, 'route:cli');
  assert.equal(await r.isRealKey('entity=abc'), true); // cli 路由 → 真（否则误落 _mock）
});

test('model-router: cli 行默认落 default → 该 routeKey 也走 CLI；disabled cli 行不算数', async () => {
  const r = new ModelRouter(
    fakeStore([
      { route_key: 'entity=abc', provider: 'cli', model: 'codex', enabled: false }, // 关掉的具体行 → 跳过
      { route_key: 'default', provider: 'cli', model: 'openclaw', enabled: true },
    ]),
    {},
  );
  const cfg = await r.resolve('entity=abc');
  assert.equal(cfg.cliBackend, 'openclaw'); // 落到 default 的 cli 行
  assert.equal(cfg.source, 'route:cli');
  assert.equal((await r.resolve('entity=abc')).cliBackend, 'openclaw');
});

// ─── W2.6b：engine 选路（可换引擎接入点）─────────────────────────────────────

test('model-router: 无行 / 行上无 engine 列 → engine 缺省 gri-core（迁移未应用也零回归）', async () => {
  assert.equal(DEFAULT_ENGINE, 'gri-core');
  const noRow = await new ModelRouter(fakeStore([]), {}).resolve('default');
  assert.equal(noRow.engine, 'gri-core');
  // 行存在但没有 engine 字段（老行 / 迁移未跑）→ 同样 gri-core
  const oldRow = await new ModelRouter(fakeStore([{ route_key: 'entity=abc', model: 'm', enabled: true }]), {}).resolve('entity=abc');
  assert.equal(oldRow.engine, 'gri-core');
});

test('model-router: engine 与 provider=cli 是**两个正交信号**，可并存', async () => {
  // engine 决定「谁拥有交错环」；cliBackend 决定 gri-core **内部**的模型调用槽。
  const byEngine = new ModelRouter(fakeStore([{ route_key: 'entity=abc', model: 'm', engine: 'claude-code', enabled: true }]), {});
  const a = await byEngine.resolve('entity=abc');
  assert.equal(a.engine, 'claude-code');
  assert.equal(a.cliBackend, null); // 非 cli provider → 模型槽仍走 HTTP（引擎自带自己的模型）

  const both = new ModelRouter(
    fakeStore([{ route_key: 'entity=abc', provider: 'cli', model: 'openclaw', engine: 'gri-core', enabled: true }]),
    {},
  );
  const b = await both.resolve('entity=abc');
  assert.equal(b.engine, 'gri-core'); // 环仍在宿主
  assert.equal(b.cliBackend, 'openclaw'); // 但模型槽外包给 CLI（= 今天已有的「换脑子」，语义不变）
  assert.equal(b.source, 'route:cli');
});

test('model-router: set 写 engine；未传 → COALESCE 保留旧值（不静默清空，回到默认请显式传 gri-core）', async () => {
  const calls = [];
  const store = storeFrom(async (text, params) => {
    calls.push({ text, params });
    return { rows: [], rowCount: 1 };
  });
  const r = new ModelRouter(store, {});
  await r.set({ route_key: 'entity=abc', model: 'm', engine: 'claude-code' });
  const up = calls.find((c) => /INSERT INTO agent\.llm_routes/.test(c.text));
  assert.ok(/engine = COALESCE\(\$7, agent\.llm_routes\.engine\)/.test(up.text), '冲突时保留旧 engine');
  assert.equal(up.params[6], 'claude-code');

  calls.length = 0;
  await r.set({ route_key: 'entity=abc', model: 'm2' }); // 「只改 model」的常见写法
  assert.equal(calls.find((c) => /INSERT/.test(c.text)).params[6], null); // 应用侧传 null → SQL 兜底保留旧 engine
});

test('model-router: list 选出 engine 列（运营台看「哪条路由归哪个引擎」）', async () => {
  const store = storeFrom(async (text) => {
    if (/ORDER BY route_key/.test(text)) return { rows: [{ route_key: 'default', engine: 'claude-code' }] };
    return { rows: [] };
  });
  const rows = await new ModelRouter(store, {}).list();
  assert.equal(rows[0].engine, 'claude-code');
});

test('model-router: engine 的**优先级**与路由同源 —— 具体键压过 default（不另起一套选路）', async () => {
  // entity=abc 有行（engine=claude-code），default 也有行（engine=openclaw）→ 具体键胜。
  const store = fakeStore([
    { route_key: 'entity=abc', model: 'm', engine: 'claude-code', enabled: true },
    { route_key: 'default', model: 'd', engine: 'openclaw', enabled: true },
  ]);
  const r = new ModelRouter(store, {});
  assert.equal((await r.resolve('entity=abc')).engine, 'claude-code');
  assert.equal((await r.resolve('default')).engine, 'openclaw');
  // 具体键无行 → 落到 default 行的 engine（而不是回 gri-core）
  assert.equal((await r.resolve('entity=zzz')).engine, 'openclaw');
});
