import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { OrganizationService } from './organization.service';
import { DatabaseService } from '../../database/database.service';

const ORG_ID = '10000000-0000-0000-0000-000000000001';
const PARENT_ID = '10000000-0000-0000-0000-000000000001';
const ACTOR_OWNER = 'a0000000-0000-0000-0000-000000000001';
const ACTOR_ADMIN = 'a0000000-0000-0000-0000-000000000010';
const ACTOR_MEMBER = 'a0000000-0000-0000-0000-000000000002';
const TARGET = 'a0000000-0000-0000-0000-000000000099';

const okRow = { id: 'm1', organization_id: ORG_ID, user_id: TARGET, role: 'admin' };

/**
 * 假库：按 SQL 形态分发。
 *   - organization SELECT → 按 id 查 orgs 映射；
 *   - assertRole/getActorRole → 按 membership[orgId][userId] 返回 role；
 *   - 其余（含事务内 INSERT/audit）→ 返回哨兵行 okRow。
 */
function makeDb(
  membership: Record<string, Record<string, string>>,
  orgs: Record<string, Record<string, unknown>> = { [ORG_ID]: { id: ORG_ID, level: 1, parent_path: '/' } },
): DatabaseService {
  const client = {
    query: jest.fn(async () => ({ rows: [okRow] })),
    release: jest.fn(),
  };
  const pool = { connect: jest.fn(() => client) };
  const query = jest.fn(async (sql: string, params?: unknown[]) => {
    // 目标用户存在性校验（public.users 唯一映射点）
    if (/FROM public\.users/.test(sql)) return { rows: [{ id: 'u' }] };
    if (/FROM tenant\.organizations/.test(sql)) {
      const id = params?.[0] as string | undefined;
      return { rows: id && orgs[id] ? [orgs[id]] : [] };
    }
    if (/SELECT role FROM tenant\.organization_members/.test(sql)) {
      const o = params?.[0] as string;
      const u = params?.[1] as string;
      return { rows: membership[o]?.[u] ? [{ role: membership[o][u] }] : [] };
    }
    return { rows: [] };
  });
  return { query, getPool: jest.fn(() => pool) } as unknown as DatabaseService;
}

/**
 * 记录型假库（T10 审计/邀请专用）：捕获每条 SQL + bind 参数，便于断言「筛选走参数化」。
 * 分发优先级：public.users → organizations → members.role → COUNT(*) → audit → invitations。
 */
function makeRecordingDb(
  membership: Record<string, Record<string, string>>,
  rows: { auditRows?: unknown[]; auditTotal?: number; invitationRows?: unknown[] } = {},
): { db: DatabaseService; calls: { sql: string; params?: unknown[] }[] } {
  const calls: { sql: string; params?: unknown[] }[] = [];
  const query = jest.fn(async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params });
    if (/FROM public\.users/.test(sql)) return { rows: [{ id: 'u' }] };
    if (/FROM tenant\.organizations/.test(sql)) {
      return { rows: params?.[0] ? [{ id: params[0], level: 1, parent_path: '/' }] : [] };
    }
    if (/SELECT role FROM tenant\.organization_members/.test(sql)) {
      const role = membership[params?.[0] as string]?.[params?.[1] as string];
      return { rows: role ? [{ role }] : [] };
    }
    if (/COUNT\(\*\)/.test(sql)) return { rows: [{ total: rows.auditTotal ?? 0 }] };
    if (/FROM tenant\.organization_audit_logs/.test(sql)) return { rows: rows.auditRows ?? [] };
    if (/FROM tenant\.organization_invitations/.test(sql)) return { rows: rows.invitationRows ?? [] };
    return { rows: [] };
  });
  const pool = { connect: jest.fn(() => ({ query: jest.fn(async () => ({ rows: [] })), release: jest.fn() })) };
  return { db: { query, getPool: jest.fn(() => pool) } as unknown as DatabaseService, calls };
}

/** 取「审计/邀请」分页查询（带 LIMIT/OFFSET 的那条）的 bind 参数。 */
function pageParamsOf(calls: { sql: string; params?: unknown[] }[]): unknown[] | undefined {
  return calls.find((c) => /LIMIT \$/.test(c.sql))?.params;
}

describe('OrganizationService 组织级权限（M4：升级 operator/merchant 为真实角色模型）', () => {
  describe('addMember（需 owner/admin）', () => {
    it('admin 成员可加人 → 落成员行 + 写审计', async () => {
      const db = makeDb({ [ORG_ID]: { [ACTOR_ADMIN]: 'admin' } });
      const svc = new OrganizationService(db);

      const member = await svc.addMember(ACTOR_ADMIN, ORG_ID, { userId: TARGET, role: 'member' });

      expect(member).toBeTruthy();
      // 触发了成员 INSERT（经历事务 client）与审计写入
      const client = (db.getPool() as unknown as { connect: jest.Mock }).connect.mock.results[0].value;
      expect(client.query).toHaveBeenCalled();
      const auditCall = client.query.mock.calls.find(
        (c: unknown[]) => /organization_audit_logs/.test(c[0] as string),
      );
      expect(auditCall).toBeTruthy();
    });

    it('非成员 actor → Forbidden，且不触事务 client', async () => {
      const db = makeDb({ [ORG_ID]: {} });
      const svc = new OrganizationService(db);

      await expect(svc.addMember(ACTOR_MEMBER, ORG_ID, { userId: TARGET })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect((db.getPool() as unknown as { connect: jest.Mock }).connect).not.toHaveBeenCalled();
    });

    it('仅 member 角色的 actor → Forbidden', async () => {
      const db = makeDb({ [ORG_ID]: { [ACTOR_MEMBER]: 'member' } });
      const svc = new OrganizationService(db);

      await expect(svc.addMember(ACTOR_MEMBER, ORG_ID, { userId: TARGET })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('createOrganization（根可自建，子组织需父级 admin）', () => {
    it('无 parent 的根组织 → 发起人成为 owner', async () => {
      const db = makeDb({}) as DatabaseService;
      const svc = new OrganizationService(db);

      const org = await svc.createOrganization(ACTOR_OWNER, { name: '新组织' });

      expect(org).toBeTruthy();
    });

    it('自供给 actor 的 public.users 行（取自 JWT 摘要，幂等 ON CONFLICT）', async () => {
      const queries: string[] = [];
      const client = {
        query: jest.fn(async (sql: string) => {
          queries.push(sql);
          return { rows: [okRow] };
        }),
        release: jest.fn(),
      };
      const pool = { connect: jest.fn(() => client) };
      const db = { query: jest.fn(async () => ({ rows: [] })), getPool: jest.fn(() => pool) } as unknown as DatabaseService;
      const svc = new OrganizationService(db);

      await svc.createOrganization(ACTOR_OWNER, { name: '供给组织' }, { username: 'freshuser', name: '新·供给' });

      // 事务内第一条业务写入 → public.users 自供给（幂等），随后才是 owner 成员行。
      const userInsertIdx = queries.findIndex((s) => /INSERT INTO public\.users/.test(s));
      expect(userInsertIdx).toBeGreaterThanOrEqual(0);
      expect(queries[userInsertIdx]).toContain('ON CONFLICT (id) DO NOTHING');
      const params = (client.query as jest.Mock).mock.calls.find(
        (c) => typeof c[0] === 'string' && /INSERT INTO public\.users/.test(c[0]),
      )?.[1];
      expect(params?.[0]).toBe(ACTOR_OWNER);
      expect(params?.[1]).toBe('freshuser');
      expect(params?.[2]).toBe('新·供给');
    });

    it('在父组织下建子组织、但 actor 非父级 admin → Forbidden', async () => {
      const db = makeDb({ [PARENT_ID]: { [ACTOR_MEMBER]: 'member' } });
      const svc = new OrganizationService(db);

      await expect(
        svc.createOrganization(ACTOR_MEMBER, { name: '子组织', parent_id: PARENT_ID }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('updateMemberRole（owner 转移仅 owner）', () => {
    it('owner 转让 owner → 允许', async () => {
      const db = makeDb({ [ORG_ID]: { [ACTOR_OWNER]: 'owner' } });
      const svc = new OrganizationService(db);

      await expect(svc.updateMemberRole(ACTOR_OWNER, ORG_ID, TARGET, 'owner')).resolves.toBeTruthy();
    });

    it('admin 想把某人提为 owner → Forbidden（转移权归 owner）', async () => {
      const db = makeDb({ [ORG_ID]: { [ACTOR_ADMIN]: 'admin' } });
      const svc = new OrganizationService(db);

      await expect(svc.updateMemberRole(ACTOR_ADMIN, ORG_ID, TARGET, 'owner')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('assertSiteOperator（站点运营门槛：根组织 owner|admin）', () => {
    /** 只喂 assertSiteOperator 需要的两条查询：根组织 + actor 角色。 */
    function makeSiteDb(role: string | null, rootExists = true): DatabaseService {
      const query = jest.fn()
        .mockResolvedValueOnce(
          { rows: rootExists ? [{ id: 'ooo00000-0000-0000-0000-000000000000' }] : [] },
        )
        .mockResolvedValueOnce({ rows: role ? [{ role }] : [] });
      return { query } as unknown as DatabaseService;
    }

    it('根组织 owner → 放行', async () => {
      const svc = new OrganizationService(makeSiteDb('owner'));
      await expect(svc.assertSiteOperator(ACTOR_OWNER)).resolves.toBeUndefined();
    });

    it('根组织 admin → 放行', async () => {
      const svc = new OrganizationService(makeSiteDb('admin'));
      await expect(svc.assertSiteOperator(ACTOR_ADMIN)).resolves.toBeUndefined();
    });

    it('非根组织普通 member（testuser2）→ Forbidden', async () => {
      const svc = new OrganizationService(makeSiteDb('member'));
      await expect(svc.assertSiteOperator(ACTOR_MEMBER)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('组织外/非成员 → Forbidden', async () => {
      const svc = new OrganizationService(makeSiteDb(null));
      await expect(svc.assertSiteOperator(TARGET)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('平台未初始化组织 → Forbidden（不崩）', async () => {
      const svc = new OrganizationService(makeSiteDb('owner', false));
      await expect(svc.assertSiteOperator(ACTOR_OWNER)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('getAudit（审计日志读取，owner/admin 门禁）', () => {
    it('admin 读审计 → 返回分页对象（rows/total/limit/offset）', async () => {
      const db = makeDb({ [ORG_ID]: { [ACTOR_ADMIN]: 'admin' } });
      const svc = new OrganizationService(db);
      const page = await svc.getAudit(ACTOR_ADMIN, ORG_ID, { limit: 20 });
      expect(page.rows).toEqual([]);
      expect(page.limit).toBe(20);
      expect(page.offset).toBe(0);
      expect(page.total).toBe(0);
    });

    it('缺省 limit → 回落 50（保持改造前默认语义）', async () => {
      const { db, calls } = makeRecordingDb({ [ORG_ID]: { [ACTOR_ADMIN]: 'admin' } });
      const svc = new OrganizationService(db);
      const page = await svc.getAudit(ACTOR_ADMIN, ORG_ID);
      expect(page.limit).toBe(50);
      const pageQuery = calls.find((c) => /LIMIT \$/.test(c.sql));
      expect(pageQuery?.params?.slice(-2)).toEqual([50, 0]);
    });

    it('仅 member（无管理权）读审计 → Forbidden', async () => {
      const db = makeDb({ [ORG_ID]: { [ACTOR_MEMBER]: 'member' } });
      const svc = new OrganizationService(db);
      await expect(svc.getAudit(ACTOR_MEMBER, ORG_ID)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('lookupUsers（用户目录查询，仅运营经 controller 门禁）', () => {
    it('按关键字查 public.users → 返回用户数组', async () => {
      const svc = new OrganizationService(makeDb({}));
      const rows = await svc.lookupUsers('xiaoming', 5);
      expect(rows).toEqual([{ id: 'u' }]);
    });

    it('空关键字 → 返回有限条数（仍走 public.users）', async () => {
      const svc = new OrganizationService(makeDb({}));
      const rows = await svc.lookupUsers('', 10);
      expect(Array.isArray(rows)).toBe(true);
    });

    it('并入身份目录（external_id ?? id，本地优先去重）', async () => {
      const svc = new OrganizationService(makeDb({}));
      const fake = jest.fn(async () => new Response(JSON.stringify({
        success: true,
        identities: [
          { id: 'rem1', username: null, email: 'newbie@x.com', name: '新注册', external_id: null },
          { id: 'u', username: 'local-already', email: null, name: '已有', external_id: 'u' },
        ],
      }), { status: 200 }));
      (globalThis as { fetch?: unknown }).fetch = fake;

      const rows = await svc.lookupUsers('x', 10);
      const ids = rows.map((r) => r.id);
      expect(ids).toContain('rem1'); // external_id 为 null → 业务主键取 identity.id
      expect(ids).toContain('u'); // 本地行保留；远程 external_id:'u' 与本地重复被去重
      expect(ids.indexOf('u')).toBeLessThan(ids.indexOf('rem1')); // 本地优先
      expect(rows.find((r) => r.id === 'rem1')?.email).toBe('newbie@x.com');

      (globalThis as { fetch?: unknown }).fetch = undefined;
    });
  });

  describe('listInvitations（T10 门禁：堵「任意登录用户枚举他组织邀请」缺口）', () => {
    const INV = { id: 'i1', organization_id: ORG_ID, email: 'x@y.com', status: 'pending' };

    it('owner 读邀请清单 → 通过并返回列表', async () => {
      const { db } = makeRecordingDb(
        { [ORG_ID]: { [ACTOR_OWNER]: 'owner' } },
        { invitationRows: [INV] },
      );
      const svc = new OrganizationService(db);
      await expect(svc.listInvitations(ACTOR_OWNER, ORG_ID)).resolves.toEqual([INV]);
    });

    it('admin 读邀请清单 → 通过', async () => {
      const { db } = makeRecordingDb({ [ORG_ID]: { [ACTOR_ADMIN]: 'admin' } }, { invitationRows: [INV] });
      const svc = new OrganizationService(db);
      await expect(svc.listInvitations(ACTOR_ADMIN, ORG_ID)).resolves.toEqual([INV]);
    });

    it('非成员（组织外登录用户）→ Forbidden，且不执行邀请查询 ← 修复前为 200 裸数据', async () => {
      const { db, calls } = makeRecordingDb({ [ORG_ID]: {} });
      const svc = new OrganizationService(db);
      await expect(svc.listInvitations(TARGET, ORG_ID)).rejects.toBeInstanceOf(ForbiddenException);
      expect(calls.some((c) => /FROM tenant\.organization_invitations/.test(c.sql))).toBe(false);
    });

    it('本组织普通 member（无管理权）→ Forbidden', async () => {
      const { db, calls } = makeRecordingDb({ [ORG_ID]: { [ACTOR_MEMBER]: 'member' } });
      const svc = new OrganizationService(db);
      await expect(svc.listInvitations(ACTOR_MEMBER, ORG_ID)).rejects.toBeInstanceOf(ForbiddenException);
      expect(calls.some((c) => /FROM tenant\.organization_invitations/.test(c.sql))).toBe(false);
    });

    it('status 筛选 → 走 bind 参数（SQL 文本不含筛选值）', async () => {
      const { db, calls } = makeRecordingDb(
        { [ORG_ID]: { [ACTOR_ADMIN]: 'admin' } },
        { invitationRows: [INV] },
      );
      const svc = new OrganizationService(db);
      await svc.listInvitations(ACTOR_ADMIN, ORG_ID, { status: 'pending' });
      const q = calls.find((c) => /FROM tenant\.organization_invitations/.test(c.sql));
      expect(q?.sql).toContain('status = $2');
      expect(q?.sql).not.toContain('pending');
      expect(q?.params).toEqual([ORG_ID, 'pending']);
    });

    it('limit/offset → 绑定为 LIMIT/OFFSET 参数', async () => {
      const { db, calls } = makeRecordingDb({ [ORG_ID]: { [ACTOR_ADMIN]: 'admin' } });
      const svc = new OrganizationService(db);
      await svc.listInvitations(ACTOR_ADMIN, ORG_ID, { limit: 10, offset: 20 });
      expect(pageParamsOf(calls)).toEqual([ORG_ID, 10, 20]);
    });

    it('缺省 limit → 无 LIMIT 子句（保持旧「返回全部」行为，Portal 零改动）', async () => {
      const { db, calls } = makeRecordingDb({ [ORG_ID]: { [ACTOR_ADMIN]: 'admin' } });
      const svc = new OrganizationService(db);
      await svc.listInvitations(ACTOR_ADMIN, ORG_ID);
      const q = calls.find((c) => /FROM tenant\.organization_invitations/.test(c.sql));
      expect(q?.sql).not.toMatch(/LIMIT/);
      expect(q?.params).toEqual([ORG_ID]);
    });
  });

  describe('getAudit 分页/筛选（T10：offset 分页 + action/entity_type/actor_id/时间范围）', () => {
    const AUDIT_ROW = {
      id: 'a1', action: 'member.add', entity_type: 'member', entity_id: null,
      actor_id: ACTOR_ADMIN, actor_name: '管理员', changes: {}, created_at: '2026-10-01T00:00:00Z',
    };
    const mk = (total = 12) =>
      makeRecordingDb({ [ORG_ID]: { [ACTOR_ADMIN]: 'admin' } }, { auditRows: [AUDIT_ROW], auditTotal: total });

    it('第二页：limit=10&offset=10 → LIMIT/OFFSET 绑定 10/10，返回 total', async () => {
      const { db, calls } = mk();
      const svc = new OrganizationService(db);
      const page = await svc.getAudit(ACTOR_ADMIN, ORG_ID, { limit: 10, offset: 10 });
      expect(pageParamsOf(calls)).toEqual([ORG_ID, 10, 10]);
      expect(page).toEqual({ rows: [AUDIT_ROW], total: 12, limit: 10, offset: 10 });
    });

    it('action 筛选 → a.action = $2 参数化（值不进 SQL 文本）', async () => {
      const { db, calls } = mk();
      const svc = new OrganizationService(db);
      await svc.getAudit(ACTOR_ADMIN, ORG_ID, { action: 'member.add' });
      const q = calls.find((c) => /FROM tenant\.organization_audit_logs/.test(c.sql));
      expect(q?.sql).toContain('a.action = $2');
      expect(q?.sql).not.toContain('member.add');
      expect(pageParamsOf(calls)).toEqual([ORG_ID, 'member.add', 50, 0]);
    });

    it('entityType + actorId 联合筛选 → 条件按序绑定 $2/$3', async () => {
      const { db, calls } = mk();
      const svc = new OrganizationService(db);
      await svc.getAudit(ACTOR_ADMIN, ORG_ID, { entityType: 'member', actorId: ACTOR_ADMIN });
      const q = calls.find((c) => /FROM tenant\.organization_audit_logs/.test(c.sql));
      expect(q?.sql).toContain('a.entity_type = $2');
      expect(q?.sql).toContain('a.actor_id = $3');
      expect(pageParamsOf(calls)).toEqual([ORG_ID, 'member', ACTOR_ADMIN, 50, 0]);
    });

    it('from/to 时间范围 → created_at >= / <= 参数化，且归一为 ISO', async () => {
      const { db, calls } = mk();
      const svc = new OrganizationService(db);
      await svc.getAudit(ACTOR_ADMIN, ORG_ID, { from: '2026-01-01T00:00:00Z', to: '2026-02-01T00:00:00Z' });
      const q = calls.find((c) => /FROM tenant\.organization_audit_logs/.test(c.sql));
      expect(q?.sql).toContain('a.created_at >= $2');
      expect(q?.sql).toContain('a.created_at <= $3');
      expect(pageParamsOf(calls)).toEqual([
        ORG_ID, '2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z', 50, 0,
      ]);
    });

    it('筛选条件同样作用于 COUNT（total 与当前页同口径）', async () => {
      const { db, calls } = mk(3);
      const svc = new OrganizationService(db);
      const page = await svc.getAudit(ACTOR_ADMIN, ORG_ID, { action: 'member.add' });
      const countQ = calls.find((c) => /COUNT\(\*\)/.test(c.sql));
      expect(countQ?.sql).toContain('a.action = $2');
      expect(countQ?.params).toEqual([ORG_ID, 'member.add']);
      expect(page.total).toBe(3);
    });

    it('游标越界钳制：limit=5000 → 200，offset=-5 → 0', async () => {
      const { db, calls } = mk();
      const svc = new OrganizationService(db);
      const page = await svc.getAudit(ACTOR_ADMIN, ORG_ID, { limit: 5000, offset: -5 });
      expect(pageParamsOf(calls)).toEqual([ORG_ID, 200, 0]);
      expect(page.limit).toBe(200);
      expect(page.offset).toBe(0);
    });

    it('注入尝试：动作值含引号仍走 bind 参数，SQL 文本零拼接', async () => {
      const { db, calls } = mk();
      const svc = new OrganizationService(db);
      const payload = `member.add' OR '1'='1`;
      await svc.getAudit(ACTOR_ADMIN, ORG_ID, { action: payload });
      const q = calls.find((c) => /FROM tenant\.organization_audit_logs/.test(c.sql));
      expect(q?.sql).not.toContain("OR '1'='1");
      expect(q?.params).toContain(payload);
    });

    it('非法 actorId（非 UUID）→ BadRequest（不把坏值丢给 PG 崩 500）', async () => {
      const { db, calls } = mk();
      const svc = new OrganizationService(db);
      await expect(svc.getAudit(ACTOR_ADMIN, ORG_ID, { actorId: 'not-a-uuid' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(calls.some((c) => /FROM tenant\.organization_audit_logs/.test(c.sql))).toBe(false);
    });

    it('非法 from（坏时间）→ BadRequest', async () => {
      const { db } = mk();
      const svc = new OrganizationService(db);
      await expect(svc.getAudit(ACTOR_ADMIN, ORG_ID, { from: '昨天' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('越权边界：非成员传再合法筛选也先被排外 → Forbidden（门禁在查询之前）', async () => {
      const { db, calls } = makeRecordingDb({ [ORG_ID]: {} });
      const svc = new OrganizationService(db);
      await expect(
        svc.getAudit(TARGET, ORG_ID, { action: 'member.add', limit: 1 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(calls.some((c) => /COUNT\(\*\)|organization_audit_logs/.test(c.sql))).toBe(false);
    });
  });
});