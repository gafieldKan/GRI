import { AgentAdminAuditController } from './agent-admin.controller';

// @gri/agent-core 是 ESM（type: module）；导入本体 controller 会传递加载它 —— 按既有范式 jest.mock 重定向。
// 本 spec 只测审计保留端点（不碰模型/凭据）；底座正确性由 packages/agent-core 的 node --test 覆盖。
jest.mock('@gri/agent-core', () => ({
  ModelRouter: class {},
  storeFrom: (q: unknown) => q,
  CredentialStore: class {},
  makeCipher: () => ({}),
}));

/**
 * 审计保留（W3）—— `POST /api/agent/admin/audit/prune`。
 * 断言：运营门禁 / 三表按窗口删（同型 cast）/ 保留窗口缺省与钳制 / 未过运营不删任何行。
 */

function makeDb(opts: { rowCount?: number; failOn?: number } = {}) {
  const calls: Array<{ text: string; params: any[] }> = [];
  let n = 0;
  const db = {
    query: jest.fn(async (text: string, params: any[]) => {
      calls.push({ text, params });
      n++;
      if (opts.failOn === n) throw new Error('db down');
      return { rows: [], rowCount: opts.rowCount ?? 2 };
    }),
  };
  return { db: db as any, calls };
}

const makeOrg = (reject = false) => ({
  assertSiteOperator: reject
    ? jest.fn().mockRejectedValue(new Error('非运营'))
    : jest.fn().mockResolvedValue(undefined),
});

describe('AgentAdminAuditController —— 审计保留（W3）', () => {
  it('prune：先过运营门禁，再按窗口删三表，返回各表删除行数', async () => {
    const { db, calls } = makeDb({ rowCount: 2 });
    const org = makeOrg();
    const c = new AgentAdminAuditController(db, org as any);

    const r = await c.prune({ auth: { externalId: 'op1' } } as any, { keepDays: 90 });

    expect(org.assertSiteOperator).toHaveBeenCalledWith('op1');
    expect(calls).toHaveLength(3);
    const tables = calls.map((x) => /DELETE FROM agent\.(\w+)/.exec(x.text)?.[1]);
    expect(tables).toEqual(['tool_runs', 'external_events', 'external_runs']);
    for (const c2 of calls) {
      expect(c2.text).toContain("NOW() - ($1::int * INTERVAL '1 day')"); // 同型 cast 防 PG 推断歧义
      expect(c2.params).toEqual([90]);
    }
    expect(r).toEqual({
      success: true,
      keepDays: 90,
      deleted: { toolRuns: 2, externalEvents: 2, externalRuns: 2 },
    });
  });

  it('保留窗口：仅显式 ≥1 有限数被采纳；缺省/非法/≤0 → 180（安全默认，防 ≤0 误清全量）', async () => {
    const cases: Array<[any, number]> = [
      [undefined, 180],
      [{ keepDays: 99999 }, 3650],
      [{ keepDays: 3651 }, 3650],
      [{ keepDays: 90.9 }, 90],
      [{ keepDays: 1 }, 1],
      // 安全默认：≤0 / 假值（Number→0）/ 非数 一律回缺省 180，**不**钳到 1（否则空串会静默清光审计）
      [{ keepDays: 0 }, 180],
      [{ keepDays: -5 }, 180],
      [{ keepDays: '' }, 180],
      [{ keepDays: 'abc' }, 180],
    ];
    for (const [body, want] of cases) {
      const { db, calls } = makeDb();
      const c = new AgentAdminAuditController(db, makeOrg() as any);
      const r = await c.prune({ auth: { externalId: 'op' } } as any, body);
      expect(r.keepDays).toBe(want);
      expect(calls[0].params).toEqual([want]); // 窗口值真落到 SQL 参数
    }
  });

  it('**未过**运营 → 抛错，且**不删任何行**（门禁在删之前）', async () => {
    const { db, calls } = makeDb();
    const c = new AgentAdminAuditController(db, makeOrg(true) as any);

    await expect(c.prune({ auth: { externalId: 'student' } } as any)).rejects.toThrow('非运营');
    expect(calls).toHaveLength(0);
  });
});
