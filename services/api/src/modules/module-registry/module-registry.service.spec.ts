import { ForbiddenException } from '@nestjs/common';
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
          selected: true,
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
    expect(sql).toContain('LEFT JOIN ontology.user_module');
    expect(sql).toContain('um.user_id = $2');
    expect(sql).toContain('ORDER BY sort_order ASC NULLS LAST, code ASC');
    expect(params).toEqual(['consumer', 'consumer-1']);

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
        selected: true,
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

    expect(query.mock.calls[0][1]).toEqual(['operator', 'operator-1']);
  });

  it('对角色不可用的模块 enable → 403，CTE 不产生 user_module 写入', async () => {
    const identity = {
      getProfileByExternalId: jest.fn().mockResolvedValue({
        user: { id: 'consumer-1', role: 'consumer' },
      }),
    } as unknown as jest.Mocked<IdentityService>;
    const query = jest.fn().mockResolvedValue({
      rows: [{ available: false, changed: 0 }],
    });
    const service = new ModuleRegistryService(identity, mockDb(query));

    await expect(service.enableModule('consumer-1', 'org-admin')).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('WITH available AS');
    expect(sql).toContain('INSERT INTO ontology.user_module');
    expect(sql).toContain('ON CONFLICT (user_id, module_code) DO NOTHING');
    expect(sql).toContain("status = 'active'");
    expect(sql).toContain('allowed_roles ? $2');
    expect(params).toEqual(['consumer-1', 'consumer', 'org-admin']);
  });

  it('对可用模块 enable 使用 ON CONFLICT 幂等写入偏好', async () => {
    const identity = {
      getProfileByExternalId: jest.fn().mockResolvedValue({
        user: { id: 'student-1', role: 'student' },
      }),
    } as unknown as jest.Mocked<IdentityService>;
    const query = jest.fn().mockResolvedValue({
      rows: [{ available: true, changed: 1 }],
    });
    const service = new ModuleRegistryService(identity, mockDb(query));

    await expect(service.enableModule('student-1', 'tutor')).resolves.toEqual({
      code: 'tutor',
      selected: true,
    });
    expect(query.mock.calls[0][1]).toEqual(['student-1', 'student', 'tutor']);
  });

  it('对可用模块 disable 幂等删除偏好', async () => {
    const identity = {
      getProfileByExternalId: jest.fn().mockResolvedValue({
        user: { id: 'student-1', role: 'student' },
      }),
    } as unknown as jest.Mocked<IdentityService>;
    const query = jest.fn().mockResolvedValue({
      rows: [{ available: true, changed: 0 }],
    });
    const service = new ModuleRegistryService(identity, mockDb(query));

    await expect(service.disableModule('student-1', 'tutor')).resolves.toEqual({
      code: 'tutor',
      selected: false,
    });

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('DELETE FROM ontology.user_module');
    expect(sql).toContain('WHERE user_id = $1');
    expect(params).toEqual(['student-1', 'student', 'tutor']);
  });

  it('对角色不可用的模块 disable → 403', async () => {
    const identity = {
      getProfileByExternalId: jest.fn().mockResolvedValue({
        user: { id: 'consumer-1', role: 'consumer' },
      }),
    } as unknown as jest.Mocked<IdentityService>;
    const query = jest.fn().mockResolvedValue({
      rows: [{ available: false, changed: 0 }],
    });
    const service = new ModuleRegistryService(identity, mockDb(query));

    await expect(service.disableModule('consumer-1', 'org-admin')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
