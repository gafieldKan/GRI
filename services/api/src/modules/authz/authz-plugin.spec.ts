/**
 * authz **策略插件**自有用例（W2.7）——越权/放行/**fail-closed** 的裁决语义在此验（plan 既定：
 * 「越权用例仅在 authz 自有测试里验」，组装类测试则整体跳过 policy、免搭权限）。
 *
 * 直接 `require` **真件**（`plugins/authz/index.js` 是纯 CJS、不 import 任何 `@gri/*` 业务模块）——
 * 它就是被验对象，故不 mock。契约红线：本插件只**声明/裁决**准入，判定真源经 `ctx.authz` 由宿主注入。
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const plugin = require('../../../plugins/authz/index.js');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const manifest = require('../../../plugins/authz/plugin.json');

describe('authz 策略插件', () => {
  it('清单：id=authz、kind=policy、entry=./index.js（「装配清单末位」的后组装依据）', () => {
    expect(manifest.id).toBe('authz');
    expect(manifest.kind).toBe('policy');
    expect(manifest.entry).toBe('./index.js');
    expect(typeof plugin.authorize).toBe('function');
  });

  it('未声明 requiresOperator 的动作 → 放行，且**不问** isSiteOperator（学生面动作不该被闸门拦）', async () => {
    let asked = 0;
    const ctx = { actorId: 's1', authz: { isSiteOperator: async () => { asked++; return false; } } };
    expect(await plugin.authorize(ctx, { tool: 'question.lookup' })).toEqual({ allowed: true });
    expect(asked).toBe(0);
  });

  it('requiresOperator + 真源判为运营 → 放行', async () => {
    const ctx = { actorId: 'op', authz: { isSiteOperator: async () => true } };
    expect(await plugin.authorize(ctx, { requiresOperator: true })).toEqual({ allowed: true });
  });

  it('requiresOperator + 真源判为**非**运营 → 拒绝（带原因）', async () => {
    const ctx = { actorId: 's1', authz: { isSiteOperator: async () => false } };
    const r = await plugin.authorize(ctx, { requiresOperator: true });
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain('运营');
  });

  it('**fail-closed**：需要运营身份却拿不到真源（`ctx.authz` 未注入/形状不对）→ 拒绝，绝不放行', async () => {
    for (const ctx of [null, undefined, {}, { actorId: 'x' }, { authz: {} }, { authz: { isSiteOperator: 'not-fn' } }]) {
      const r = await plugin.authorize(ctx as any, { requiresOperator: true });
      expect(r.allowed).toBe(false);
    }
  });

  it('actor 标识取 `ctx.actorId ?? entityId ?? externalId`（与宿主身份不变量 external_id ≡ users.id 同源）', async () => {
    const seen: Array<string | null> = [];
    const authz = { isSiteOperator: async (id: string) => { seen.push(id); return true; } };
    await plugin.authorize({ entityId: 'e1', authz }, { requiresOperator: true });
    await plugin.authorize({ externalId: 'x2', authz }, { requiresOperator: true });
    await plugin.authorize({ actorId: 'a3', entityId: 'ignored', authz }, { requiresOperator: true });
    expect(seen).toEqual(['e1', 'x2', 'a3']);
  });

  it('非对象/缺失的 action 不炸：按「不需运营身份」处理（工具调用面传入的 action 可缺省）', async () => {
    expect(await plugin.authorize({ actorId: 'x' }, undefined as any)).toEqual({ allowed: true });
    expect(await plugin.authorize({ actorId: 'x' }, null as any)).toEqual({ allowed: true });
  });
});
