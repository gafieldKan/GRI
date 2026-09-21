import { ForbiddenException } from '@nestjs/common';
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
    it('admin 读审计 → 返回 rows（关联演员名）', async () => {
      const db = makeDb({ [ORG_ID]: { [ACTOR_ADMIN]: 'admin' } });
      const svc = new OrganizationService(db);
      const rows = await svc.getAudit(ACTOR_ADMIN, ORG_ID, 20);
      expect(rows).toEqual([]);
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
});