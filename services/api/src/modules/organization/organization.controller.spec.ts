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
    getAudit: jest.fn(async () => []),
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
    it('owner/admin → 返回 {success,rows,limit}', async () => {
      const svc = makeSvc({ getAudit: jest.fn(async () => [
        { id: 'a1', action: 'member.add', entity_type: 'member', entity_id: 'm1', actor_id: ACTOR, actor_name: 'x', changes: {}, created_at: '2026-09-19T00:00:00Z' },
      ]) });
      const ctl = new OrganizationController(svc);
      const res = await ctl.audit(req(), ORG_ID, '50');
      expect(res).toEqual({
        success: true,
        rows: [{ id: 'a1', action: 'member.add', entity_type: 'member', entity_id: 'm1', actor_id: ACTOR, actor_name: 'x', changes: {}, created_at: '2026-09-19T00:00:00Z' }],
        limit: 1,
      });
      expect(svc.getAudit).toHaveBeenCalledWith(ACTOR, ORG_ID, 50);
    });

    it('门禁失败 → getAudit 抛 403，透传', async () => {
      const svc = makeSvc({ getAudit: jest.fn(async () => { throw new ForbiddenException('no admin'); }) });
      const ctl = new OrganizationController(svc);
      await expect(ctl.audit(req(), ORG_ID, '50')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});