import { isSiteOperator, type QueryExecutor } from './site-operator';

/**
 * `isSiteOperator` 是「站点运营」判定的**唯一真源**（W2.7 收敛后）——订餐域与组织域都经它，
 * 不再各写一份（曾发生过口径漂移）。故它值得**自有用例**，而不是只靠两个 service spec 间接覆盖
 * （第一轮独立复验指出的覆盖缺口：真源无隔离用例）。
 */

/** 记录调用 + 按序回行的假执行器（与 `organization.service.spec.ts` 的 `makeSiteDb` 同姿势）。 */
function seqExec(rows: Array<{ rows: Record<string, unknown>[] }>): {
  exec: QueryExecutor;
  calls: Array<{ sql: string; params?: unknown[] }>;
} {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  let i = 0;
  const exec: QueryExecutor = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return rows[i++] ?? { rows: [] };
    },
  };
  return { exec, calls };
}

describe('isSiteOperator（站点运营判定真源）', () => {
  it('无根组织（`parent_id IS NULL` 查不到）→ false，且**不发**第二条查询', async () => {
    const { exec, calls } = seqExec([{ rows: [] }]);
    expect(await isSiteOperator(exec, 'u1')).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('tenant.organizations');
  });

  it('根组织 owner → true', async () => {
    const { exec } = seqExec([{ rows: [{ id: 'root' }] }, { rows: [{ role: 'owner' }] }]);
    expect(await isSiteOperator(exec, 'u1')).toBe(true);
  });

  it('根组织 admin → true', async () => {
    const { exec } = seqExec([{ rows: [{ id: 'root' }] }, { rows: [{ role: 'admin' }] }]);
    expect(await isSiteOperator(exec, 'u2')).toBe(true);
  });

  it('根组织普通成员（role=member）→ false', async () => {
    const { exec } = seqExec([{ rows: [{ id: 'root' }] }, { rows: [{ role: 'member' }] }]);
    expect(await isSiteOperator(exec, 'u3')).toBe(false);
  });

  it('非成员（成员查询空行）→ false', async () => {
    const { exec } = seqExec([{ rows: [{ id: 'root' }] }, { rows: [] }]);
    expect(await isSiteOperator(exec, 'u4')).toBe(false);
  });

  it('成员查询带根组织 id 与参与者 id（顺序 = [rootId, actorId]）——真源按此绑定', async () => {
    const { exec, calls } = seqExec([{ rows: [{ id: 'root-7' }] }, { rows: [{ role: 'owner' }] }]);
    await isSiteOperator(exec, 'actor-9');
    expect(calls).toHaveLength(2);
    expect(calls[1].sql).toContain('tenant.organization_members');
    expect(calls[1].params).toEqual(['root-7', 'actor-9']);
  });

  it('判定读的是**传入的 executor**（订餐事务把 pg client 传进来 → 走同一连接），不是别的 db', async () => {
    // 关键：`food.service` 的事务路径把 pg `client` 当 executor 传入。真源必须用它，否则事务内
    // 读到的是另一条连接、看不到未提交的组织变更 → 判定漂移。此用例把「用传入者」钉死。
    const passed = seqExec([{ rows: [{ id: 'root' }] }, { rows: [{ role: 'admin' }] }]);
    const other = seqExec([{ rows: [{ id: 'WRONG' }] }, { rows: [{ role: 'member' }] }]);
    expect(await isSiteOperator(passed.exec, 'op')).toBe(true);
    expect(passed.calls).toHaveLength(2); // 真源只碰传入的 executor
    expect(other.calls).toHaveLength(0);
  });
});
