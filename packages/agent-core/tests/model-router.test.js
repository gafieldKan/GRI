import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ModelRouter, storeFrom } from '../src/index.js';

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