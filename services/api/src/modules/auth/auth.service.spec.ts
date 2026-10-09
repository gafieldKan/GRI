import { BadRequestException, ConflictException, BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { DatabaseService } from '../../database/database.service';

/**
 * 注册编排（Saga）契约：
 *   public.users 先行（拿 uuid）→ 以 external_id=该 uuid 调 auth-center 服务间面 →
 *   失败则补偿删除刚建行。external_id ≡ public.users.id 的**唯一映射点**在此。
 */
describe('AuthService.register（注册编排）', () => {
  let svc: AuthService;
  let query: jest.Mock;
  const config = { get: jest.fn().mockReturnValue('http://auth-center:3004') } as unknown as ConfigService;

  beforeEach(() => {
    query = jest.fn();
    svc = new AuthService(config, { query } as unknown as DatabaseService);
  });
  afterEach(() => jest.restoreAllMocks());

  const dto = { username: 'alice', email: 'Alice@Example.com', password: 'password123', name: '爱丽丝' };

  it('先建 public.users 拿 uuid，再以 external_id=该 uuid 建身份（唯一映射点）', async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: 'uuid-1', username: 'alice', email: 'alice@example.com', role: 'consumer' }],
    });
    const fetchMock = jest.spyOn(global, 'fetch' as any).mockResolvedValue({ ok: true, status: 201 });

    const out = await svc.register(dto);

    // 业务库 INSERT（username 保留大小写，email 小写化）
    const [insSql, insParams] = query.mock.calls[0] as [string, unknown[]];
    expect(insSql).toContain('INSERT INTO public.users');
    expect(insSql).toContain("'consumer'");
    expect(insParams[0]).toBe('alice');
    expect(insParams[1]).toBe('alice@example.com');

    // 服务间写面：external_id 恰为刚建的 users.id
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/auth/admin/identities');
    expect((init.headers as Record<string, string>)['x-service-token']).toBeDefined();
    const body = JSON.parse(init.body as string);
    expect(body.externalId).toBe('uuid-1');
    expect(body.domain).toBe('core');
    expect(body.password).toBe('password123');
    expect(init.signal).toBeInstanceOf(AbortSignal);

    expect(out.id).toBe('uuid-1');
  });

  it('public.users 唯一冲突(23505) → ConflictException（不调身份面）', async () => {
    query.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }));
    const fetchMock = jest.spyOn(global, 'fetch' as any);

    await expect(svc.register(dto)).rejects.toBeInstanceOf(ConflictException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('身份面 409 → ConflictException 且补偿删除刚建 users 行', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'uuid-2', username: 'alice' }] });
    jest.spyOn(global, 'fetch' as any).mockResolvedValue({ ok: false, status: 409 });

    await expect(svc.register(dto)).rejects.toBeInstanceOf(ConflictException);
    // 补偿：DELETE public.users WHERE id=$1
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0]).toContain('DELETE FROM public.users');
    expect(query.mock.calls[1][1]).toEqual(['uuid-2']);
  });

  it('身份面不可达 → BadGatewayException 且补偿删除', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'uuid-3', username: 'alice' }] });
    jest.spyOn(global, 'fetch' as any).mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(svc.register(dto)).rejects.toBeInstanceOf(BadGatewayException);
    expect(query.mock.calls[1][0]).toContain('DELETE FROM public.users');
  });

  it('身份面超时 → BadGatewayException 且补偿删除', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'uuid-timeout', username: 'alice' }] });
    jest
      .spyOn(global, 'fetch' as any)
      .mockRejectedValue(Object.assign(new Error('The operation was aborted due to timeout'), {
        name: 'TimeoutError',
      }));

    await expect(svc.register(dto)).rejects.toBeInstanceOf(BadGatewayException);
    expect(query.mock.calls[1][0]).toContain('DELETE FROM public.users');
  });

  it('补偿删除失败不覆盖原始身份错误（仍抛 502）', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: 'uuid-compensate-fail', username: 'alice' }] })
      .mockRejectedValueOnce(new Error('delete failed'));
    jest.spyOn(global, 'fetch' as any).mockResolvedValue({ ok: false, status: 503 });

    await expect(svc.register(dto)).rejects.toThrow('身份服务创建失败');
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0]).toContain('DELETE FROM public.users');
  });

  describe('入参 fail-fast 校验', () => {
    it('username < 3 → BadRequest', async () => {
      await expect(svc.register({ ...dto, username: 'ab' })).rejects.toBeInstanceOf(BadRequestException);
    });
    it('password < 8 → BadRequest', async () => {
      await expect(svc.register({ ...dto, password: 'short' })).rejects.toBeInstanceOf(BadRequestException);
    });
    it('email 格式非法 → BadRequest', async () => {
      await expect(svc.register({ ...dto, email: 'not-an-email' })).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
