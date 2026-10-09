import { NotFoundException } from '@nestjs/common';
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

    it('externalId 查无此人（软删影响 0 行）→ NotFoundException', async () => {
      jest.spyOn(global, 'fetch' as any).mockResolvedValue({ ok: true, status: 200 });
      const query = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
      const svc = new IdentityService(mockDb(query));

      await expect(svc.deleteProfile('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
