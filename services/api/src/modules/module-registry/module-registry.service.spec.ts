import { IdentityService } from '../identity/identity.service';
import { DatabaseService } from '../../database/database.service';
import { ModuleRegistryService } from './module-registry.service';

function mockDb(query: jest.Mock) {
  return { query, getPool: jest.fn() } as unknown as DatabaseService;
}

describe('ModuleRegistryService', () => {
  it('按 req.auth.externalId 对应的业务角色过滤活跃模块并映射为 API 契约', async () => {
    const identity = {
      getProfileByExternalId: jest.fn().mockResolvedValue({
        user: { id: 'consumer-1', role: 'consumer' },
      }),
    } as unknown as jest.Mocked<IdentityService>;
    const query = jest.fn().mockResolvedValue({
      rows: [
        {
          code: 'food',
          name: '订餐平台',
          short: '订餐',
          description: '浏览餐厅与下单',
          icon: '餐',
          entry_url: '/food/',
          category: 'business',
          allowed_roles: ['consumer', 'student'],
          is_core: true,
          status: 'active',
          sort_order: 10,
        },
      ],
    });
    const service = new ModuleRegistryService(identity, mockDb(query));

    const result = await service.listAvailableModules('consumer-1');

    expect(identity.getProfileByExternalId).toHaveBeenCalledWith('consumer-1');
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('FROM ontology.app_module');
    expect(sql).toContain("status = 'active'");
    expect(sql).toContain("jsonb_typeof(allowed_roles) = 'array'");
    expect(sql).toContain('jsonb_array_length(allowed_roles) = 0');
    expect(sql).toContain('allowed_roles ? $1');
    expect(sql).toContain('ORDER BY sort_order ASC NULLS LAST, code ASC');
    expect(params).toEqual(['consumer']);

    expect(result).toEqual([
      {
        code: 'food',
        name: '订餐平台',
        short: '订餐',
        description: '浏览餐厅与下单',
        icon: '餐',
        entryUrl: '/food/',
        category: 'business',
        allowedRoles: ['consumer', 'student'],
        isCore: true,
        status: 'active',
        sortOrder: 10,
      },
    ]);
  });

  it('operator 查询沿用数据库业务角色，不读取 token 角色', async () => {
    const identity = {
      getProfileByExternalId: jest.fn().mockResolvedValue({
        user: { id: 'operator-1', role: 'operator' },
      }),
    } as unknown as jest.Mocked<IdentityService>;
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const service = new ModuleRegistryService(identity, mockDb(query));

    await service.listAvailableModules('operator-1');

    expect(query.mock.calls[0][1]).toEqual(['operator']);
  });
});
