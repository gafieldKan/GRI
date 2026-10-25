import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseManifest,
  assemblyOrder,
  PluginManifestError,
  PluginHost,
  PluginHostError,
  CapabilityRegistry,
  DEFAULT_KINDS,
  HOST_API_VERSION,
} from '../src/index.js';

const base = (over = {}) => ({ id: 'demo', kind: 'agent.skill', ...over });

// ---------- manifest ----------

test('parseManifest: 最小合法清单补齐默认', () => {
  const m = parseManifest(base());
  assert.equal(m.id, 'demo');
  assert.equal(m.kind, 'agent.skill');
  assert.equal(m.apiVersion, HOST_API_VERSION);
  assert.equal(m.version, '0.0.0');
  assert.deepEqual(m.tools, []);
  assert.deepEqual(m.provides, []);
  assert.deepEqual(m.requires, []);
  assert.deepEqual(m.hooks, []);
  assert.equal(m.name, 'demo'); // 缺 name → 回退 id
  assert.deepEqual(m.config, { schema: null, secretRefs: [] });
  assert.deepEqual(m.trust, { boundary: 'in-process', network: false, filesystem: 'none' });
  assert.ok(Object.isFrozen(m));
});

test('parseManifest: 数组字段去空白并规范', () => {
  const m = parseManifest(base({ provides: [' a.b ', 'c.d'], hooks: ['onTurn'] }));
  assert.deepEqual(m.provides, ['a.b', 'c.d']);
  assert.deepEqual(m.hooks, ['onTurn']);
});

test('parseManifest: id/kind/apiVersion 非法一律拒绝且带 code', () => {
  const cases = [
    [{ kind: 'agent.skill' }, 'MISSING_ID'],
    [{ id: 'Bad_Id', kind: 'agent.skill' }, 'INVALID_ID'],
    [{ id: 'ok' }, 'MISSING_KIND'],
    [{ id: 'ok', kind: 'nope.kind' }, 'UNKNOWN_KIND'],
    [{ id: 'ok', kind: 'agent.skill', apiVersion: '2' }, 'INCOMPATIBLE_API_VERSION'],
    [{ id: 'ok', kind: 'agent.skill', tools: [1] }, 'INVALID_FIELD'],
    [null, 'NOT_AN_OBJECT'],
  ];
  for (const [raw, code] of cases) {
    try {
      parseManifest(raw);
      assert.fail(`应拒绝: ${JSON.stringify(raw)}`);
    } catch (e) {
      assert.ok(e instanceof PluginManifestError, `应为 PluginManifestError: ${e}`);
      assert.equal(e.code, code);
    }
  }
});

test('parseManifest: trust 描述符透传', () => {
  const m = parseManifest(base({ trust: { boundary: 'container', network: true, filesystem: 'worktree' } }));
  assert.deepEqual(m.trust, { boundary: 'container', network: true, filesystem: 'worktree' });
});

// ---------- assembly order ----------

test('assemblyOrder: 按 kind 优先级，policy 恒最后，同 kind 稳定', () => {
  const list = [
    parseManifest(base({ id: 'pol', kind: 'policy' })),
    parseManifest(base({ id: 'sk1', kind: 'agent.skill' })),
    parseManifest(base({ id: 'scene', kind: 'world.scene' })),
    parseManifest(base({ id: 'sk2', kind: 'agent.skill' })),
    parseManifest(base({ id: 'content', kind: 'knowledge.content' })),
  ];
  const ids = assemblyOrder(list).map((m) => m.id);
  assert.deepEqual(ids, ['content', 'scene', 'sk1', 'sk2', 'pol']);
  assert.ok(DEFAULT_KINDS.policy > DEFAULT_KINDS['agent.skill']);
});

// ---------- registry ----------

test('CapabilityRegistry: 撞名 id 拒绝加载', () => {
  const reg = new CapabilityRegistry();
  reg.add(parseManifest(base({ id: 'dup' })));
  try {
    reg.add(parseManifest(base({ id: 'dup' })));
    assert.fail('应拒绝撞名');
  } catch (e) {
    assert.equal(e.code, 'DUPLICATE_PLUGIN_ID');
  }
});

test('CapabilityRegistry: capability 索引与 resolve', () => {
  const reg = new CapabilityRegistry();
  reg.add(parseManifest(base({ id: 'a', provides: ['world.scene'] })));
  reg.add(parseManifest(base({ id: 'b', provides: ['world.scene'], kind: 'world.scene' })));
  reg.add(parseManifest(base({ id: 'c', provides: ['x.y'] })));
  assert.deepEqual(reg.capabilityIndex()['world.scene'], ['a', 'b']);
  assert.deepEqual(reg.resolve('world.scene').map((e) => e.manifest.id), ['a', 'b']);
  assert.deepEqual(reg.resolve('nothing'), []);
  assert.deepEqual(reg.getByKind('world.scene').map((e) => e.manifest.id), ['b']);
});

// ---------- host ----------

test('PluginHost: 按序装配，policy 最后；生命周期 install→activate 各触发一次', async () => {
  const order = [];
  const mk = (id, kind) => [
    base({ id, kind }),
    {
      install: () => order.push(`install:${id}`),
      activate: () => order.push(`activate:${id}`),
    },
  ];
  const host = new PluginHost();
  host.registerAll([mk('sk', 'agent.skill'), mk('pol', 'policy'), mk('scene', 'world.scene')]);
  const r = await host.assemble();
  assert.deepEqual(r.activated, ['scene', 'sk', 'pol']);
  assert.deepEqual(order, [
    'install:scene', 'activate:scene',
    'install:sk', 'activate:sk',
    'install:pol', 'activate:pol',
  ]);
  assert.ok(host.isActive('pol'));
});

test('PluginHost: skipKinds=[policy] → 未装策略插件，authorize 放行（测试档）', async () => {
  const host = new PluginHost();
  host.register(base({ id: 'pol', kind: 'policy' }), { authorize: () => ({ allowed: false }) });
  host.register(base({ id: 'sk', kind: 'agent.skill' }));
  const r = await host.assemble({ skipKinds: ['policy'] });
  assert.deepEqual(r.activated, ['sk']);
  assert.deepEqual(r.skipped, ['policy']);
  const verdict = await host.authorize({ user: 'u1' }, { tool: 'x' });
  assert.deepEqual(verdict, { allowed: true, reason: 'no-policy-assembled' });
});

test('PluginHost: 装了策略插件 → 由其裁决', async () => {
  const host = new PluginHost();
  host.register(base({ id: 'pol', kind: 'policy' }), {
    authorize: (_ctx, action) => (action.tool === 'secret' ? { allowed: false, reason: 'nope' } : { allowed: true }),
  });
  await host.assemble();
  assert.equal((await host.authorize({}, { tool: 'ok' })).allowed, true);
  const denied = await host.authorize({}, { tool: 'secret' });
  assert.equal(denied.allowed, false);
  assert.equal(denied.by, 'pol');
  assert.equal(denied.reason, 'nope');
});

test('PluginHost: 工具撞名 → 冲突插件报错，先到者工具完好（无孤儿）', async () => {
  const host = new PluginHost();
  const t = (name) => ({ name, execute: async () => 1 });
  host.register(base({ id: 'p1' }), { tools: [t('a.b')] });
  host.register(base({ id: 'p2' }), { tools: [t('a.b'), t('c.d')] });
  const r = await host.assemble();
  assert.deepEqual(r.activated, ['p1']);
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0].error, /撞名/);
  assert.deepEqual(host.tools().map((x) => x.name), ['a.b']); // 只有 p1 的，无 c.d 孤儿
});

test('PluginHost: 卸载后工具移除且不再激活', async () => {
  const host = new PluginHost();
  host.register(base({ id: 'p1' }), { tools: [{ name: 'a.b' }], deactivate: () => {} });
  await host.assemble();
  assert.equal(host.tools().length, 1);
  assert.deepEqual(await host.uninstall('p1'), { ok: true });
  assert.equal(host.tools().length, 0);
  assert.equal(host.isActive('p1'), false);
  assert.equal((await host.uninstall('ghost')).ok, false);
});

test('PluginHost: runHook 只触发订阅者', async () => {
  const seen = [];
  const host = new PluginHost();
  host.register(base({ id: 'a', hooks: ['onTurn'] }), { onTurn: (ctx) => seen.push(['a', ctx.n]) });
  host.register(base({ id: 'b' }), { onTurn: () => seen.push(['b', 0]) });
  await host.assemble();
  const results = await host.runHook('onTurn', { n: 7 });
  assert.deepEqual(seen, [['a', 7]]); // b 未订阅
  assert.deepEqual(results.map((r) => r.plugin), ['a']);
});

test('PluginHost: resolve 只返回已激活插件；diagnostics 只读无密钥', async () => {
  const host = new PluginHost();
  host.register(base({ id: 'active', provides: ['cap.x'], trust: { network: true } }));
  host.register(base({ id: 'off', kind: 'policy', provides: ['cap.x'] }));
  await host.assemble({ skipKinds: ['policy'] });
  assert.deepEqual(host.resolve('cap.x').map((e) => e.manifest.id), ['active']); // off 未激活
  const d = host.diagnostics();
  assert.deepEqual(d.active, ['active']);
  assert.equal(d.byKind['agent.skill'][0], 'active');
  assert.equal(d.trust[0].id, 'active');
  assert.ok(!JSON.stringify(d).includes('apiKey'));
});

test('PluginHost: 观测缝记录生命周期事件（不因观测抛错而中断）', async () => {
  const events = [];
  const host = new PluginHost({ observability: { event: (n, d) => events.push([n, d.id]) } });
  host.register(base({ id: 'p1' }));
  await host.assemble();
  assert.deepEqual(events, [['plugin.registered', 'p1'], ['plugin.activated', 'p1']]);
});

test('PluginHost: 清单非法在注册时即失败（不在装配时）', () => {
  const host = new PluginHost();
  assert.throws(() => host.register({ id: 'bad', kind: 'nope' }), (e) => e.code === 'UNKNOWN_KIND');
});

// ---------- fail-closed 代码闸门（生产档 requirePolicy） ----------

test('PluginHost: 生产档 assemble({requirePolicy:true}) 缺 policy → 抛 POLICY_REQUIRED 且不半途生效', async () => {
  const host = new PluginHost();
  host.register(base({ id: 'sk', kind: 'agent.skill' }), { activate: () => assert.fail('不应跑到生命周期') });
  await assert.rejects(
    () => host.assemble({ requirePolicy: true }),
    (e) => e instanceof PluginHostError && e.code === 'POLICY_REQUIRED',
  );
  assert.deepEqual(host.diagnostics().active, []); // 前置校验 → 零激活（无半装配状态）
  assert.equal(host.diagnostics().policyAssembled, false);
});

test('PluginHost: 生产档装了 policy → 装配通过，policyAssembled=true', async () => {
  const host = new PluginHost();
  host.register(base({ id: 'pol', kind: 'policy' }), { authorize: () => ({ allowed: true }) });
  host.register(base({ id: 'sk', kind: 'agent.skill' }));
  const r = await host.assemble({ requirePolicy: true });
  assert.deepEqual(r.activated, ['sk', 'pol']);
  assert.equal(host.diagnostics().policyAssembled, true);
});

test('PluginHost: 生产档不得跳过 policy（requirePolicy + skipKinds 同置 → 拒绝）', async () => {
  const host = new PluginHost();
  host.register(base({ id: 'pol', kind: 'policy' }));
  await assert.rejects(
    () => host.assemble({ requirePolicy: true, skipKinds: ['policy'] }),
    (e) => e.code === 'POLICY_REQUIRED',
  );
});

test('PluginHost: 空壳 policy（无 authorize 实现）不能满足生产档 → POLICY_NOT_IMPLEMENTED', async () => {
  const host = new PluginHost();
  host.register(base({ id: 'pol', kind: 'policy' })); // 只声明 kind，无 impl
  await assert.rejects(
    () => host.assemble({ requirePolicy: true }),
    (e) => e.code === 'POLICY_NOT_IMPLEMENTED',
  );
  // 有 impl 但没 authorize 方法，同样拒
  const host2 = new PluginHost();
  host2.register(base({ id: 'pol', kind: 'policy' }), { activate: () => {} });
  await assert.rejects(
    () => host2.assemble({ requirePolicy: true }),
    (e) => e.code === 'POLICY_NOT_IMPLEMENTED',
  );
});

test('PluginHost: policy 激活期抛错 → POLICY_INACTIVE 且回滚本次装配（不留半装配）', async () => {
  const host = new PluginHost();
  host.register(base({ id: 'sk', kind: 'agent.skill' }), { activate: () => {} });
  host.register(base({ id: 'pol', kind: 'policy' }), {
    activate: () => { throw new Error('boom'); },
    authorize: () => ({ allowed: true }),
  });
  await assert.rejects(
    () => host.assemble({ requirePolicy: true }),
    (e) => e.code === 'POLICY_INACTIVE',
  );
  // 已激活的 sk 被回滚 → 无半装配残留
  assert.deepEqual(host.diagnostics().active, []);
  assert.equal(host.tools().length, 0);
  // 回滚后宿主仍可用（可重新装配）
  const host2 = new PluginHost();
  host2.register(base({ id: 'pol2', kind: 'policy' }), { authorize: () => ({ allowed: true }) });
  assert.deepEqual((await host2.assemble({ requirePolicy: true })).activated, ['pol2']);
});

test('PluginHost: 回滚不因 deactivate 抛错而留孤儿（uninstall 保证摘除，finally 清场）', async () => {
  const host = new PluginHost();
  host.register(base({ id: 'sk', kind: 'agent.skill' }), {
    activate: () => {},
    deactivate: () => { throw new Error('teardown boom'); },
    tools: [{ name: 's.tool', execute: async () => 1 }],
  });
  host.register(base({ id: 'pol', kind: 'policy' }), {
    activate: () => { throw new Error('policy boom'); },
    authorize: () => ({ allowed: true }),
  });
  await assert.rejects(() => host.assemble({ requirePolicy: true }), (e) => e.code === 'POLICY_INACTIVE');
  // 即便 sk.deactivate 抛错，也须被摘除：不留半装配/孤儿工具
  assert.deepEqual(host.diagnostics().active, []);
  assert.equal(host.tools().length, 0);
  assert.equal(host.isActive('sk'), false);
});

test('PluginHost: uninstall 钩子抛错仍摘除，且以 warning 报出（不静默）', async () => {
  const errors = [];
  const host = new PluginHost({ observability: { event: (n, d) => n === 'plugin.error' && errors.push(d.id) } });
  host.register(base({ id: 'p1' }), { deactivate: () => { throw new Error('x'); }, tools: [{ name: 'a.b' }] });
  await host.assemble();
  const r = await host.uninstall('p1');
  assert.equal(r.ok, true);
  assert.match(r.warning, /x/);
  assert.equal(host.tools().length, 0);
  assert.deepEqual(errors, ['p1']);
});

test('PluginHost: 默认档（requirePolicy 缺省）依旧放行 —— 测试便利不受影响', async () => {
  const host = new PluginHost();
  host.register(base({ id: 'sk', kind: 'agent.skill' }));
  const r = await host.assemble();
  assert.deepEqual(r.activated, ['sk']);
  assert.deepEqual(await host.authorize({}, { tool: 'x' }), { allowed: true, reason: 'no-policy-assembled' });
});
