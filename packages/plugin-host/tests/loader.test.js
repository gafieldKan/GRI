import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { loadPlugins, PluginHost } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name) => join(here, 'fixtures', name);

test('loadPlugins: 扫目录 → 注册 → 同步装配，工具集合与诊断齐备', () => {
  const { host, tools, diagnostics } = loadPlugins({ dir: fx('plugins-ok') });
  assert.deepEqual(diagnostics.activated, ['good', 'second'], '按 kind 优先级 + 目录名序');
  assert.deepEqual(diagnostics.errors, []);
  assert.deepEqual(tools.map((t) => t.name), ['good.echo', 'second.ping']);
  // 非插件目录（无 plugin.json）不出现
  assert.deepEqual(diagnostics.discovered.map((d) => d.dir), ['a-good', 'b-second']);
  assert.equal(diagnostics.discovered[0].kind, 'agent.skill');
  assert.equal(host.isActive('good'), true);
  assert.deepEqual(host.resolve('demo.good').map((e) => e.manifest.id), ['good']);
});

test('loadPlugins: ESM 入口（默认 index.js）与 CJS 入口（自定义 index.cjs）都能载', async () => {
  const { tools } = loadPlugins({ dir: fx('plugins-ok') });
  const echo = tools.find((t) => t.name === 'good.echo'); // ESM default 导出
  const ping = tools.find((t) => t.name === 'second.ping'); // CJS module.exports
  assert.deepEqual(await echo.execute({}, { a: 1 }), { ok: true, args: { a: 1 } });
  assert.equal(await ping.execute({}, {}), 'pong');
});

test('loadPlugins: 坏插件不阻断启动（P5）—— 清单非法/入口爆炸各记一条，好插件照常', () => {
  const { tools, diagnostics } = loadPlugins({ dir: fx('plugins-broken') });
  assert.deepEqual(diagnostics.activated, ['good']); // g-good 照常装配
  assert.deepEqual(tools.map((t) => t.name), ['good.echo']);
  const byDir = Object.fromEntries(diagnostics.errors.map((e) => [e.dir, e]));
  assert.equal(byDir['c-bad-manifest'].code, 'UNKNOWN_KIND');
  assert.equal(byDir['d-bad-entry'].code, 'PLUGIN_LOAD_FAILED');
  assert.match(byDir['d-bad-entry'].message, /入口爆炸/);
});

test('loadPlugins: 工具撞名由宿主拒绝 —— 先到者留，冲突插件记诊断且无孤儿工具', () => {
  const { tools, diagnostics } = loadPlugins({ dir: fx('plugins-collide') });
  assert.deepEqual(diagnostics.activated, ['good']);
  assert.deepEqual(tools.map((t) => t.name), ['good.echo']);
  assert.equal(diagnostics.errors.length, 1);
  assert.equal(diagnostics.errors[0].id, 'collide');
  assert.match(diagnostics.errors[0].error, /撞名/);
});

test('loadPlugins: 目录缺失/未指定 → 记诊断、零工具，宿主仍可用（可再装）', () => {
  const miss = loadPlugins({ dir: fx('nope-not-here') });
  assert.equal(miss.diagnostics.errors[0].code, 'PLUGINS_DIR_MISSING');
  assert.deepEqual(miss.tools, []);
  // 宿主未被弄坏：还能继续注册装配
  miss.host.register({ id: 'later', kind: 'agent.skill' }, { tools: [{ name: 'later.t' }] });
  assert.deepEqual(miss.host.assembleSync().activated, ['later']);
  assert.deepEqual(miss.host.tools().map((t) => t.name), ['later.t']);

  const unset = loadPlugins({});
  assert.equal(unset.diagnostics.errors[0].code, 'PLUGINS_DIR_UNSET');
  assert.equal(unset.diagnostics.dir, null);
});

test('loadPlugins: 可复用传入的宿主，并透传 assemble 选项（requirePolicy 走同一 fail-closed）', () => {
  const host = new PluginHost();
  const r = loadPlugins({ dir: fx('plugins-ok'), host, assemble: { requirePolicy: true } });
  assert.equal(r.host, host);
  const policyErr = r.diagnostics.errors.find((e) => e.code === 'POLICY_REQUIRED');
  assert.ok(policyErr, '生产档缺 policy → 记 POLICY_REQUIRED（不是静默）');
  assert.deepEqual(r.diagnostics.activated, [], '前置校验 → 零激活（不半装配）');
  assert.deepEqual(host.diagnostics().active, []);
});

test('loadPlugins: 发现顺序确定性 —— 两次加载得到同一装配序列', () => {
  const a = loadPlugins({ dir: fx('plugins-ok') });
  const b = loadPlugins({ dir: fx('plugins-ok') });
  assert.deepEqual(a.diagnostics.activated, b.diagnostics.activated);
  assert.deepEqual(a.tools.map((t) => t.name), b.tools.map((t) => t.name));
});
