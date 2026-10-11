import { ForbiddenException } from '@nestjs/common';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';

const ORG_ID = '10000000-0000-0000-0000-000000000001';
const ACTOR = 'a0000000-0000-0000-0000-000000000001';

/** 假 service：只暴露本轮要用的方法，其余不管。 */
function makeSvc(overrides: Partial<OrganizationService> = {}): OrganizationService {
  return {
    assertSiteOperator: jest.fn(async () => undefined),
    lookupUsers: jest.fn(async () => []),
    getAudit: jest.fn(async () => ({ rows: [], total: 0, limit: 50, offset: 0 })),
    listInvitations: jest.fn(async () => []),
    ...overrides,
  } as unknown as OrganizationService;
}

/** 假 req：携带 auth.externalId。 */
function req(externalId: string | null = ACTOR) {
  return { auth: { externalId } } as any;
}

const forbit = () => async () => {
  throw new ForbiddenException('only site operator');
};

describe('OrganizationController 站点运营探询 / 用户目录 / 审计（portal 管理台消费面）', () => {
  describe('capability（运营探询，零资源暴露）', () => {
    it('站点运营 → isOperator:true', async () => {
      const ctl = new OrganizationController(makeSvc());
      const res = await ctl.capability(req());
      expect(res).toEqual({ success: true, isOperator: true });
    });

    it('非运营（assertSiteOperator 抛 Forbidden）→ isOperator:false，不 throw', async () => {
      const ctl = new OrganizationController(makeSvc({ assertSiteOperator: forbit() }));
      const res = await ctl.capability(req());
      expect(res).toEqual({ success: true, isOperator: false });
    });

    it('无 externalId → isOperator:false，不 throw', async () => {
      const ctl = new OrganizationController(makeSvc());
      const res = await ctl.capability(req(null));
      expect(res).toEqual({ success: true, isOperator: false });
    });
  });

  describe('users/lookup（用户目录，运营门禁）', () => {
    it('运营 → 返回 {success,users}', async () => {
      const svc = makeSvc({ lookupUsers: jest.fn(async () => [
        { id: 'u1', username: 'algo', email: null, name: null },
      ]) });
      const ctl = new OrganizationController(svc);
      const res = await ctl.userLookup(req(), 'algo', '10');
      expect(res).toEqual({ success: true, users: [{ id: 'u1', username: 'algo', email: null, name: null }] });
      expect(svc.assertSiteOperator).toHaveBeenCalledWith(ACTOR);
      expect(svc.lookupUsers).toHaveBeenCalledWith('algo', 10);
    });

    it('非运营 → assertSiteOperator 抛 403', async () => {
      const svc = makeSvc({ assertSiteOperator: forbit() });
      const ctl = new OrganizationController(svc);
      await expect(ctl.userLookup(req(), 'algo', '10')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('audit（组织审计日志，owner/admin 门禁在 service）', () => {
    const ROW = { id: 'a1', action: 'member.add', entity_type: 'member', entity_id: 'm1', actor_id: ACTOR, actor_name: 'x', changes: {}, created_at: '2026-09-19T00:00:00Z' };

    it('owner/admin + 分页/筛选参数 → 透传查询对象，响应保留 rows 并增量 total/limit/offset', async () => {
      const svc = makeSvc({ getAudit: jest.fn(async () => ({ rows: [ROW], total: 7, limit: 10, offset: 20 })) });
      const ctl = new OrganizationController(svc);
      const res = await ctl.audit(
        req(), ORG_ID, '10', '20', 'member.add', 'member', ACTOR, '2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z',
      );
      expect(res).toEqual({ success: true, rows: [ROW], total: 7, limit: 10, offset: 20 });
      expect(svc.getAudit).toHaveBeenCalledWith(ACTOR, ORG_ID, {
        limit: 10,
        offset: 20,
        action: 'member.add',
        entityType: 'member',
        actorId: ACTOR,
        from: '2026-01-01T00:00:00Z',
        to: '2026-02-01T00:00:00Z',
      });
    });

    it('无查询参数 → 全 undefined（由 service 回落默认 limit=50/offset=0）', async () => {
      const svc = makeSvc();
      const ctl = new OrganizationController(svc);
      const res = await ctl.audit(req(), ORG_ID);
      expect(res).toEqual({ success: true, rows: [], total: 0, limit: 50, offset: 0 });
      expect(svc.getAudit).toHaveBeenCalledWith(ACTOR, ORG_ID, {
        limit: undefined,
        offset: undefined,
        action: undefined,
        entityType: undefined,
        actorId: undefined,
        from: undefined,
        to: undefined,
      });
    });

    it('空串/非数查询值 → 归一为 undefined（不产生 NaN 参数）', async () => {
      const svc = makeSvc();
      const ctl = new OrganizationController(svc);
      await ctl.audit(req(), ORG_ID, 'abc', '', '', '', '', '', '');
      expect(svc.getAudit).toHaveBeenCalledWith(ACTOR, ORG_ID, {
        limit: undefined,
        offset: undefined,
        action: undefined,
        entityType: undefined,
        actorId: undefined,
        from: undefined,
        to: undefined,
      });
    });

    it('门禁失败 → getAudit 抛 403，透传', async () => {
      const svc = makeSvc({ getAudit: jest.fn(async () => { throw new ForbiddenException('no admin'); }) });
      const ctl = new OrganizationController(svc);
      await expect(ctl.audit(req(), ORG_ID, '50')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('invitations（邀请清单，owner/admin 门禁在 service）', () => {
    it('owner/admin → 传 externalId + orgId，缺省筛选归一为 undefined', async () => {
      const svc = makeSvc();
      const ctl = new OrganizationController(svc);
      const res = await ctl.invitations(req(), ORG_ID);
      expect(res).toEqual([]);
      expect(svc.listInvitations).toHaveBeenCalledWith(ACTOR, ORG_ID, {
        status: undefined,
        limit: undefined,
        offset: undefined,
      });
    });

    it('?status&limit&offset → 解析为查询对象', async () => {
      const svc = makeSvc();
      const ctl = new OrganizationController(svc);
      await ctl.invitations(req(), ORG_ID, 'pending', '10', '20');
      expect(svc.listInvitations).toHaveBeenCalledWith(ACTOR, ORG_ID, {
        status: 'pending',
        limit: 10,
        offset: 20,
      });
    });

    it('非该组织 owner/admin → service 抛 403，透传且不泄数据', async () => {
      const svc = makeSvc({
        listInvitations: jest.fn(async () => { throw new ForbiddenException('仅组织管理员可执行此操作'); }),
      });
      const ctl = new OrganizationController(svc);
      await expect(ctl.invitations(req(), ORG_ID)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('无 externalId（缺身份契约字段）→ 403，不触 service', () => {
      const svc = makeSvc();
      const ctl = new OrganizationController(svc);
      // 非 async 端点：externalId(req) 同步抛 Forbidden（Nest 同样转 403）
      expect(() => ctl.invitations(req(null), ORG_ID)).toThrow(ForbiddenException);
      expect(svc.listInvitations).not.toHaveBeenCalled();
    });
  });
});