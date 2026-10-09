import { Request } from 'express';
import { UnauthorizedException } from '@nestjs/common';
import { IdentityAdminController } from './identity-admin.controller';
import { IdentityAdminService } from './identity-admin.service';

/**
 * 控制器回归：**必须 await 服务调用** —— 若返回对象内嵌 Promise，
 * Nest 序列化时会把 Promise 变成 {}，线上表现为查找恒空（曾踩坑）。
 */
describe('IdentityAdminController', () => {
  const authorize = jest.fn();
  const lookup = jest.fn();
  const byBusinessId = jest.fn();
  const createIdentity = jest.fn();
  const disableIdentityByExternalId = jest.fn();
  const svc: unknown = { authorize, lookup, byBusinessId, createIdentity, disableIdentityByExternalId };
  const ctrl = new IdentityAdminController(svc as IdentityAdminService);
  const withToken = { headers: { 'x-service-token': 'secret' } } as unknown as Request;

  // 每条用例独立清 mock 调用史，否则「不发查询」断言读到上位用例残留。
  beforeEach(() => {
    authorize.mockReset();
    lookup.mockReset();
    byBusinessId.mockReset();
    createIdentity.mockReset();
    disableIdentityByExternalId.mockReset();
  });

  it('lookup → 返回已 await 的 identities 数组（而非 Promise→{}）', async () => {
    lookup.mockResolvedValueOnce([{ id: 'x', username: 'alice', external_id: 'x' }]);
    const res = await ctrl.lookup(withToken, 'alice', '10');
    expect(authorize).toHaveBeenCalledWith('secret');
    expect(res.success).toBe(true);
    expect(Array.isArray(res.identities)).toBe(true);
    expect(res.identities).toEqual([{ id: 'x', username: 'alice', external_id: 'x' }]);
  });

  it('缺 service token → 授权抛 401（不发查询）', async () => {
    authorize.mockImplementationOnce(() => {
      throw new UnauthorizedException();
    });
    await expect(ctrl.lookup({ headers: {} } as unknown as Request, 'q')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(lookup).not.toHaveBeenCalled();
  });

  it('byId → 返回已 await 的 identity（而非 Promise→{}）', async () => {
    byBusinessId.mockResolvedValueOnce({ id: 'b', username: 'bob' });
    const res = await ctrl.byId(withToken, 'b');
    expect(typeof res.identity).toBe('object');
    expect(res.identity).toEqual({ id: 'b', username: 'bob' });
  });

  it('create → 授权后返回已 await 的脱敏身份', async () => {
    createIdentity.mockResolvedValueOnce({ id: 'i-1', external_id: 'uuid-1' });
    const dto = { domain: 'core', username: 'alice', password: 'password123', externalId: 'uuid-1' };
    const res = await ctrl.create(withToken, dto as any);
    expect(authorize).toHaveBeenCalledWith('secret');
    expect(typeof res.identity).toBe('object');
    expect(res.identity).toEqual({ id: 'i-1', external_id: 'uuid-1' });
  });

  it('create 缺 service token → 401（不建身份）', async () => {
    authorize.mockImplementationOnce(() => {
      throw new UnauthorizedException();
    });
    await expect(ctrl.create({ headers: {} } as unknown as Request, {} as any)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(createIdentity).not.toHaveBeenCalled();
  });

  it('disable → 授权后停用并返回 success', async () => {
    const res = await ctrl.disable(withToken, 'uuid-1');
    expect(authorize).toHaveBeenCalledWith('secret');
    expect(disableIdentityByExternalId).toHaveBeenCalledWith('uuid-1');
    expect(res.success).toBe(true);
  });
});