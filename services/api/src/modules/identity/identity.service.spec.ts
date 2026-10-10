import { BadGatewayException, BadRequestException, NotFoundException } from '@nestjs/common';
import { IdentityService } from './identity.service';
import { DatabaseService } from '../../database/database.service';

function mockDb(queryImpl: jest.Mock) {
  return { query: queryImpl, getPool: jest.fn() } as unknown as DatabaseService;
}

describe('IdentityService', () => {
  describe('getProfileByExternalId', () => {
    it('返回 student 用户的聚合档案（users + edu.students）', async () => {
      const query = jest.fn()
        .mockResolvedValueOnce({ rows: [{ id: 'u1', role: 'student', name: '测试' }] })
        .mockResolvedValueOnce({ rows: [{ user_id: 'u1', grade: 9 }] });
      const svc = new IdentityService(mockDb(query));

      const profile = await svc.getProfileByExternalId('u1');

      expect(profile.user.id).toBe('u1');
      expect(profile.student!.grade).toBe(9);
      // 两次查询：users 一次，students 一次，均以 externalId 为键
      expect(query).toHaveBeenCalledTimes(2);
      expect(query).toHaveBeenNthCalledWith(1, expect.stringContaining('public.users'), ['u1']);
      expect(query.mock.calls[0][0]).toContain('deleted_at IS NULL');
      expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining('edu.students'), ['u1']);
    });

    it('非 student 角色不拉取 students 扩展', async () => {
      const query = jest.fn().mockResolvedValueOnce({ rows: [{ id: 'u1', role: 'consumer', name: 'C' }] });
      const svc = new IdentityService(mockDb(query));

      const profile = await svc.getProfileByExternalId('u1');

      expect(profile.student).toBeUndefined();
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('externalId 查无此人 → NotFoundException', async () => {
      const query = jest.fn().mockResolvedValue({ rows: [] });
      const svc = new IdentityService(mockDb(query));

      await expect(svc.getProfileByExternalId('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateProfile（字段白名单，防提权）', () => {
    afterEach(() => jest.restoreAllMocks());

    it('剥离 role/status/password/id 等受保护列，只更新白名单字段', async () => {
      const query = jest.fn().mockResolvedValue({ rows: [{ id: 'u1', role: 'student', name: 'X' }] });
      const svc = new IdentityService(mockDb(query));

      // 恶意载荷：试图把 role 改成 merchant 提权，同时正常改 name
      await svc.updateProfile('u1', { role: 'merchant', name: '改名' } as any);

      const [sql, params] = query.mock.calls[0] as [string, unknown[]];
      // 生成的 SQL 绝不能出现受保护列 role
      expect(sql).not.toContain('role');
      expect(sql).not.toContain('status');
      expect(sql).not.toContain('password');
      expect(sql).toContain('name');
      expect(sql).toContain('id = $1'); // externalId 恒为 $1
      expect(sql).toContain('deleted_at IS NULL');
      // 参数：[$1=userId, ...白名单字段值]
      expect(params).toEqual(['u1', '改名']);
    });

    it('无白名单字段时幂等读回（不报错、不发 UPDATE）', async () => {
      const query = jest.fn().mockResolvedValue({ rows: [{ id: 'u1' }] });
      const svc = new IdentityService(mockDb(query));

      const got = await svc.updateProfile('u1', { role: 'merchant' } as any);

      expect(got).toEqual({ id: 'u1' });
      // 只发了一次 SELECT，未发 UPDATE
      expect(query).toHaveBeenCalledTimes(1);
      expect(query.mock.calls[0][0]).toContain('SELECT');
      expect(query.mock.calls[0][0]).toContain('deleted_at IS NULL');
    });
  });

  describe('deleteProfile（先停用凭证，再软删档案）', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('先停用 auth-center 凭证，再软删 public.users（不硬删）', async () => {
      const fetchMock = jest.spyOn(global, 'fetch' as any).mockResolvedValue({ ok: true, status: 200 });
      const query = jest.fn().mockResolvedValue({ rows: [], rowCount: 1 });
      const svc = new IdentityService(mockDb(query));

      await expect(svc.deleteProfile('u1')).resolves.toBeUndefined();

      // 1) 服务间停用身份（DELETE /auth/admin/identities/:externalId）
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/auth/admin/identities/u1');
      expect(init.method).toBe('DELETE');
      expect((init.headers as Record<string, string>)['x-service-token']).toBeDefined();
      expect(init.signal).toBeInstanceOf(AbortSignal);

      // 2) 软删：SET status='deleted' + deleted_at，绝不 DELETE
      expect(query).toHaveBeenCalledTimes(1);
      const [sql, params] = query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('UPDATE public.users');
      expect(sql).toContain("status = 'deleted'");
      expect(sql).toContain('deleted_at = NOW()');
      expect(sql).not.toContain('DELETE');
      expect(params).toEqual(['u1']);
    });

    it('凭证停用失败（5xx）→ 抛 BadGatewayException，且不软删业务库', async () => {
      jest.spyOn(global, 'fetch' as any).mockResolvedValue({ ok: false, status: 502 });
      const query = jest.fn().mockResolvedValue({ rows: [], rowCount: 1 });
      const svc = new IdentityService(mockDb(query));

      await expect(svc.deleteProfile('u1')).rejects.toThrow('身份停用失败');
      // 安全优先：身份未停用即中止，绝不动 users
      expect(query).not.toHaveBeenCalled();
    });

    it('凭证服务网络失败 → 抛 BadGatewayException，且不软删业务库', async () => {
      jest.spyOn(global, 'fetch' as any).mockRejectedValue(new Error('ECONNRESET'));
      const query = jest.fn().mockResolvedValue({ rows: [], rowCount: 1 });
      const svc = new IdentityService(mockDb(query));

      await expect(svc.deleteProfile('u1')).rejects.toThrow('身份服务不可达');
      expect(query).not.toHaveBeenCalled();
    });

    it('auth-center 身份不存在（404）→ 幂等继续软删业务档', async () => {
      jest.spyOn(global, 'fetch' as any).mockResolvedValue({ ok: false, status: 404 });
      const query = jest.fn().mockResolvedValue({ rows: [], rowCount: 1 });
      const svc = new IdentityService(mockDb(query));

      await expect(svc.deleteProfile('u1')).resolves.toBeUndefined();
      expect(query).toHaveBeenCalledTimes(1);
      expect(query.mock.calls[0][0]).toContain('UPDATE public.users');
    });

    it('externalId 查无此人（软删影响 0 行）→ NotFoundException', async () => {
      jest.spyOn(global, 'fetch' as any).mockResolvedValue({ ok: true, status: 200 });
      const query = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
      const svc = new IdentityService(mockDb(query));

      await expect(svc.deleteProfile('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateRole（运营角色变更）', () => {
    afterEach(() => jest.restoreAllMocks());

    it('S1 合法 role → 预检后更新并返回新行', async () => {
      const query = jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: 'u1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'u1', role: 'merchant', status: 'active' }] });
      const svc = new IdentityService(mockDb(query));

      const out = await svc.updateRole('u1', 'merchant');

      expect(out.role).toBe('merchant');
      expect(query).toHaveBeenCalledTimes(2);
      expect(query.mock.calls[0][0]).toContain('SELECT id FROM public.users');
      expect(query.mock.calls[0][0]).toContain('deleted_at IS NULL');
      expect(query.mock.calls[1][0]).toContain('UPDATE public.users SET role = $2');
      expect(query.mock.calls[1][0]).toContain('RETURNING *');
      expect(query.mock.calls[1][1]).toEqual(['u1', 'merchant']);
    });

    it('S2 非法 role → 400，短库前不发 SQL', async () => {
      const query = jest.fn();
      const svc = new IdentityService(mockDb(query));

      await expect(svc.updateRole('u1', 'superadmin' as any)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(query).not.toHaveBeenCalled();
    });

    it('S3 目标不存在或已删 → 404，短路 UPDATE', async () => {
      const query = jest.fn().mockResolvedValueOnce({ rows: [] });
      const svc = new IdentityService(mockDb(query));

      await expect(svc.updateRole('deleted-user', 'consumer')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(query).toHaveBeenCalledTimes(1);
      expect(query.mock.calls[0][0]).toContain('deleted_at IS NULL');
    });
  });

  describe('updateStatus（运营状态变更 + auth-center 联动）', () => {
    afterEach(() => jest.restoreAllMocks());

    it('S4 deleted → 先停凭证，再软删业务档', async () => {
      const fetchMock = jest.spyOn(global, 'fetch' as any).mockResolvedValue({ ok: true, status: 200 });
      const query = jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: 'u1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'u1', status: 'deleted', deleted_at: new Date() }] });
      const svc = new IdentityService(mockDb(query));

      const out = await svc.updateStatus('u1', 'deleted');

      expect(out.status).toBe('deleted');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('DELETE');
      expect(query).toHaveBeenCalledTimes(2);
      expect(query.mock.calls[1][0]).toContain('status = $2');
      expect(query.mock.calls[1][0]).toContain('deleted_at = NOW()');
      expect(query.mock.calls[1][1]).toEqual(['u1', 'deleted']);
    });

    it('S5 auth-center 停用失败 → 502，且业务库不改', async () => {
      jest.spyOn(global, 'fetch' as any).mockResolvedValue({ ok: false, status: 502 });
      const query = jest.fn().mockResolvedValueOnce({ rows: [{ id: 'u1' }] });
      const svc = new IdentityService(mockDb(query));

      await expect(svc.updateStatus('u1', 'deleted')).rejects.toBeInstanceOf(BadGatewayException);
      expect(query).toHaveBeenCalledTimes(1);
      expect(query.mock.calls[0][0]).toContain('SELECT id FROM public.users');
    });

    it('S6 suspended → 停凭证并置 suspended，不写 deleted_at', async () => {
      const fetchMock = jest.spyOn(global, 'fetch' as any).mockResolvedValue({ ok: true, status: 200 });
      const query = jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: 'u1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'u1', status: 'suspended', deleted_at: null }] });
      const svc = new IdentityService(mockDb(query));

      const out = await svc.updateStatus('u1', 'suspended');

      expect(out.status).toBe('suspended');
      expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('DELETE');
      expect(query).toHaveBeenCalledTimes(2);
      expect(query.mock.calls[1][0]).not.toContain('deleted_at = NOW()');
      expect(query.mock.calls[1][1]).toEqual(['u1', 'suspended']);
    });

    it('S7 active（恢复）→ 调 auth-center enable 后置 active', async () => {
      const fetchMock = jest.spyOn(global, 'fetch' as any).mockResolvedValue({ ok: true, status: 200 });
      const query = jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ id: 'u1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'u1', status: 'active' }] });
      const svc = new IdentityService(mockDb(query));

      const out = await svc.updateStatus('u1', 'active');

      expect(out.status).toBe('active');
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/auth/admin/identities/u1/enable');
      expect(init.method).toBe('POST');
      expect(query.mock.calls[1][1]).toEqual(['u1', 'active']);
    });

    it('S8 非法 status → 400，短信任副作用', async () => {
      const fetchMock = jest.spyOn(global, 'fetch' as any);
      const query = jest.fn();
      const svc = new IdentityService(mockDb(query));

      await expect(svc.updateStatus('u1', 'banned' as any)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(fetchMock).not.toHaveBeenCalled();
      expect(query).not.toHaveBeenCalled();
    });
  });

  describe('listUsers（分页、筛选、默认排除 deleted）', () => {
    afterEach(() => jest.restoreAllMocks());

    it('S9 pageSize=101 → 400，不发查询', async () => {
      const query = jest.fn();
      const svc = new IdentityService(mockDb(query));

      await expect(svc.listUsers({ pageSize: 101 })).rejects.toBeInstanceOf(BadRequestException);
      expect(query).not.toHaveBeenCalled();
    });

    it('S10 缺省分页 → page=1,pageSize=20,LIMIT $1 OFFSET $2', async () => {
      const query = jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [] });
      const svc = new IdentityService(mockDb(query));

      await expect(svc.listUsers({})).resolves.toEqual({
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
      });

      expect(query).toHaveBeenCalledTimes(2);
      const [selectSql, selectParams] = query.mock.calls[1] as [string, unknown[]];
      expect(selectSql).toContain('LIMIT $1 OFFSET $2');
      expect(selectParams).toEqual([20, 0]);
    });

    it('S11 role 筛选参数化', async () => {
      const query = jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ total: 1 }] })
        .mockResolvedValueOnce({ rows: [{ id: 'u1', role: 'student' }] });
      const svc = new IdentityService(mockDb(query));

      const out = await svc.listUsers({ role: 'student' });

      expect(out.items).toHaveLength(1);
      expect(query.mock.calls[1][0]).toContain('role = $1');
      expect(query.mock.calls[1][1]).toContain('student');
    });

    it('S12 缺省排除 deleted；显式 status=deleted 时包含软删行', async () => {
      const defaultQuery = jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [] });
      await new IdentityService(mockDb(defaultQuery)).listUsers({});
      expect(defaultQuery.mock.calls[0][0]).toContain('deleted_at IS NULL');
      expect(defaultQuery.mock.calls[1][0]).toContain('deleted_at IS NULL');

      const deletedQuery = jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ total: 1 }] })
        .mockResolvedValueOnce({ rows: [{ id: 'u1', status: 'deleted' }] });
      await new IdentityService(mockDb(deletedQuery)).listUsers({ status: 'deleted' });
      expect(deletedQuery.mock.calls[0][0]).not.toContain('deleted_at IS NULL');
      expect(deletedQuery.mock.calls[1][0]).not.toContain('deleted_at IS NULL');
      expect(deletedQuery.mock.calls[1][1]).toContain('deleted');
    });

    it('S13 空结果 → 200 语义对象，不抛错', async () => {
      const query = jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [] });
      const svc = new IdentityService(mockDb(query));

      await expect(svc.listUsers({ q: '_____nomatch' })).resolves.toEqual({
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
      });
    });
  });
});
