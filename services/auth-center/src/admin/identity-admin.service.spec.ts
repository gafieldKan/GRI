import { UnauthorizedException } from '@nestjs/common';
import { IdentityAdminService } from './identity-admin.service';
import { DatabaseService } from '../database/database.service';

/**
 * 身份目录服务间面 —— PII 面安全守卫 + 查询语义。
 * 关键：authorize 时序安全；id(uuid) 与 external_id(varchar) 双参数 + ::uuid 强转。
 */
describe('IdentityAdminService', () => {
  let svc: IdentityAdminService;
  let query: jest.Mock;

  beforeEach(() => {
    process.env.SERVICE_TOKEN = 'test-secret';
    query = jest.fn(async () => ({ rows: [] }));
    svc = new IdentityAdminService({ query } as unknown as DatabaseService);
  });
  afterEach(() => {
    delete process.env.SERVICE_TOKEN;
  });

  describe('authorize（服务间令牌，时序安全）', () => {
    it('正确 token → 放行', () => {
      expect(() => svc.authorize('test-secret')).not.toThrow();
    });
    it('缺失/空 token → 401', () => {
      expect(() => svc.authorize(undefined)).toThrow(UnauthorizedException);
      expect(() => svc.authorize('')).toThrow(UnauthorizedException);
    });
    it('错误 token（含长度不等短路）→ 401', () => {
      expect(() => svc.authorize('wrong')).toThrow(UnauthorizedException);
      expect(() => svc.authorize('much-longer-secret-token-value-x')).toThrow(UnauthorizedException);
    });
  });

  describe('lookup（身份目录搜索，PII）', () => {
    it('带关键字 → username/email/name ILIKE 三字段 + limit', async () => {
      query.mockResolvedValueOnce({ rows: [{ id: 'x', username: 'alice', name: '爱丽丝' }] });
      const out = await svc.lookup('alice', 10);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('username ILIKE $1 OR email ILIKE $1 OR name ILIKE $1'),
        ['%alice%', 10],
      );
      expect(out).toEqual([{ id: 'x', username: 'alice', name: '爱丽丝' }]);
    });
    it('空关键字 → 全量列表 with limit', async () => {
      await svc.lookup('', 5);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('FROM identities ORDER BY created_at DESC LIMIT $1'),
        [5],
      );
    });
    it('limit 越界 → 复位默认 10（[1,100] 外一律退回默认值）', async () => {
      await svc.lookup(undefined, 999);
      expect(query).toHaveBeenLastCalledWith(expect.stringContaining('LIMIT $'), [10]);
      await svc.lookup(undefined, 0);
      expect(query).toHaveBeenLastCalledWith(expect.stringContaining('LIMIT $'), [10]);
      await svc.lookup(undefined, -5);
      expect(query).toHaveBeenLastCalledWith(expect.stringContaining('LIMIT $'), [10]);
    });
  });

  describe('byBusinessId（业务主键 external_id ?? id）', () => {
    it('按 uuid id 查询 → 双参数 + ::uuid 显式强转（规避 uuid≠text）', async () => {
      query.mockResolvedValueOnce({ rows: [{ id: 'u-1', username: 'bob', external_id: null }] });
      const out = await svc.byBusinessId('u-1');
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = $1::uuid OR external_id = $2 LIMIT 1'),
        ['u-1', 'u-1'],
      );
      expect(out?.username).toBe('bob');
    });
    it('未命中 → null', async () => {
      const out = await svc.byBusinessId('00000000-0000-0000-0000-000000000000');
      expect(out).toBeNull();
    });
  });
});