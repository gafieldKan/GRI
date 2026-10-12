import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { IdentityService } from '../identity/identity.service';
import { DatabaseService } from '../../database/database.service';
import { ModuleRegistryService } from './module-registry.service';

function mockDb(query: jest.Mock) {
  return { query, getPool: jest.fn() } as unknown as DatabaseService;
}

function mockTransactionalDb(query: jest.Mock, clientQuery: jest.Mock) {
  return {
    query,
    getPool: jest.fn(() => ({
      connect: jest.fn().mockResolvedValue({
        query: clientQuery,
        release: jest.fn(),
      }),
    })),
  } as unknown as DatabaseService;
}

function identityFor(id: string, role: string) {
  return {
    getProfileByExternalId: jest.fn().mockResolvedValue({
      user: { id, role },
    }),
  } as unknown as jest.Mocked<IdentityService>;
}

describe('ModuleRegistryService', () => {
  it('按 req.auth.externalId 对应的业务角色过滤活跃模块并映射为 API 契约', async () => {
    const identity = identityFor('consumer-1', 'consumer');
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
    expect(sql).toContain('FROM ontology.app_module am');
    expect(sql).toContain("status = 'active'");
    expect(sql).toContain("jsonb_typeof(allowed_roles) = 'array'");
    expect(sql).toContain('jsonb_array_length(allowed_roles) = 0');
    expect(sql).toContain('allowed_roles ? $1');
    expect(sql).toContain('LEFT JOIN ontology.user_module');
    expect(sql).toContain('um.user_id = $2');
    expect(sql).toContain('NOT EXISTS (SELECT 1 FROM ontology.module_region');
    expect(sql).toContain('NOT EXISTS (SELECT 1 FROM ontology.module_industry');
    expect(sql).toContain('ORDER BY sort_order ASC NULLS LAST, code ASC');
    expect(params).toEqual(['consumer', 'consumer-1', null, null]);

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

  it('区域和行业过滤解析为真实 UUID，并以 AND 语义应用可选限定', async () => {
    const identity = identityFor('operator-1', 'operator');
    const query = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [{ region_id: 'region-uuid', industry_id: 'industry-uuid' }],
      })
      .mockResolvedValueOnce({ rows: [] });
    const service = new ModuleRegistryService(identity, mockDb(query));

    await service.listAvailableModules('operator-1', {
      region: '156',
      industry: 'A',
    });

    expect(query).toHaveBeenCalledTimes(2);
    const [dimensionSql, dimensionParams] = query.mock.calls[0] as [string, unknown[]];
    expect(dimensionSql).toContain("level IN ('country', 'province')");
    expect(dimensionSql).toContain("level = 'section'");
    expect(dimensionParams).toEqual(['156', 'A']);

    const [listSql, listParams] = query.mock.calls[1] as [string, unknown[]];
    expect(listSql).toContain('mr.region_id = $3');
    expect(listSql).toContain('mi.industry_id = $4');
    expect(listParams).toEqual(['operator', 'operator-1', 'region-uuid', 'industry-uuid']);
  });

  it('未知或层级不合法的 region → 400，且不查询模块目录', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [{ region_id: null, industry_id: null }],
    });
    const service = new ModuleRegistryService(
      identityFor('consumer-1', 'consumer'),
      mockDb(query),
    );

    await expect(
      service.listAvailableModules('consumer-1', { region: '399999' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(query).toHaveBeenCalledTimes(1);
  });

  it('未知或非 section 的 industry → 400，且不查询模块目录', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [{ region_id: null, industry_id: null }],
    });
    const service = new ModuleRegistryService(
      identityFor('consumer-1', 'consumer'),
      mockDb(query),
    );

    await expect(
      service.listAvailableModules('consumer-1', { industry: '01' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(query).toHaveBeenCalledTimes(1);
  });

  it('operator 查询沿用数据库业务角色，不读取 token 角色', async () => {
    const identity = identityFor('operator-1', 'operator');
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const service = new ModuleRegistryService(identity, mockDb(query));

    await service.listAvailableModules('operator-1');

    expect(query.mock.calls[0][1]).toEqual(['operator', 'operator-1', null, null]);
  });

  it('门户维度选择器只返回 country/province 与 section 闭集', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            node_id: '156',
            code: 'CHN',
            name: '中国',
            level: 'country',
            parent_id: 'parent-uuid',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            code: 'A',
            name: '农业、林业和渔业',
            level: 'section',
            section: 'A',
          },
        ],
      });
    const service = new ModuleRegistryService(
      identityFor('consumer-1', 'consumer'),
      mockDb(query),
    );

    await expect(service.listDimensionOptions()).resolves.toEqual({
      regions: [
        {
          nodeId: '156',
          code: 'CHN',
          name: '中国',
          level: 'country',
          parentId: 'parent-uuid',
        },
      ],
      industries: [
        {
          code: 'A',
          name: '农业、林业和渔业',
          level: 'section',
          section: 'A',
        },
      ],
    });

    const [regionSql] = query.mock.calls[0] as [string, unknown[]];
    const [industrySql] = query.mock.calls[1] as [string, unknown[]];
    expect(regionSql).toContain("level IN ('country', 'province')");
    expect(industrySql).toContain("level = 'section'");
  });

  it('读取指定模块的真实 FK 绑定', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [
        {
          code: 'food',
          region_node_ids: ['156', '110000'],
          industry_codes: ['A', 'I'],
        },
      ],
    });
    const service = new ModuleRegistryService(
      identityFor('operator-1', 'operator'),
      mockDb(query),
    );

    await expect(service.getModuleBindings('food')).resolves.toEqual({
      code: 'food',
      regionNodeIds: ['156', '110000'],
      industryCodes: ['A', 'I'],
    });

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('JOIN ontology.module_region');
    expect(sql).toContain('JOIN ontology.module_industry');
    expect(sql).toContain('JOIN ontology.region');
    expect(sql).toContain('JOIN ontology.industry');
    expect(params).toEqual(['food']);
  });

  it('读取不存在模块的绑定 → 404', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const service = new ModuleRegistryService(
      identityFor('operator-1', 'operator'),
      mockDb(query),
    );

    await expect(service.getModuleBindings('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('PUT 绑定以事务整体替换，只接受 country/province 与 section', async () => {
    const clientQuery = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'module-uuid' }] })
      .mockResolvedValueOnce({
        rows: [
          { id: 'region-1', node_id: '156', level: 'country' },
          { id: 'region-2', node_id: '110000', level: 'province' },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { id: 'industry-1', code: 'A', level: 'section' },
          { id: 'industry-2', code: 'I', level: 'section' },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }) // DELETE module_region
      .mockResolvedValueOnce({ rows: [] }) // DELETE module_industry
      .mockResolvedValueOnce({ rows: [] }) // INSERT module_region
      .mockResolvedValueOnce({ rows: [] }) // INSERT module_industry
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    const service = new ModuleRegistryService(
      identityFor('operator-1', 'operator'),
      mockTransactionalDb(jest.fn(), clientQuery),
    );

    await expect(
      service.replaceModuleBindings('food', {
        regionNodeIds: ['156', '110000'],
        industryCodes: ['A', 'I'],
      }),
    ).resolves.toEqual({
      code: 'food',
      regionNodeIds: ['156', '110000'],
      industryCodes: ['A', 'I'],
    });

    const sql = clientQuery.mock.calls.map(([text]) => text as string);
    expect(sql).toContain('BEGIN');
    expect(sql.some((text) => text.includes('DELETE FROM ontology.module_region'))).toBe(
      true,
    );
    expect(sql.some((text) => text.includes('DELETE FROM ontology.module_industry'))).toBe(
      true,
    );
    expect(sql.some((text) => text.includes('INSERT INTO ontology.module_region'))).toBe(
      true,
    );
    expect(sql.some((text) => text.includes('INSERT INTO ontology.module_industry'))).toBe(
      true,
    );
    expect(sql).toContain('COMMIT');
  });

  it('PUT 绑定包含非法粒度 → 400、回滚且不写关联表', async () => {
    const clientQuery = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'module-uuid' }] })
      .mockResolvedValueOnce({
        rows: [{ id: 'region-1', node_id: '110101', level: 'district' }],
      })
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
    const service = new ModuleRegistryService(
      identityFor('operator-1', 'operator'),
      mockTransactionalDb(jest.fn(), clientQuery),
    );

    await expect(
      service.replaceModuleBindings('food', { regionNodeIds: ['110101'] }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const sql = clientQuery.mock.calls.map(([text]) => text as string);
    expect(sql).toContain('ROLLBACK');
    expect(sql.some((text) => text.includes('DELETE FROM ontology.module_region'))).toBe(
      false,
    );
    expect(sql.some((text) => text.includes('INSERT INTO ontology.module_region'))).toBe(
      false,
    );
  });

  it('对角色不可用的模块 enable → 403，CTE 不产生 user_module 写入', async () => {
    const identity = identityFor('consumer-1', 'consumer');
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
    const identity = identityFor('student-1', 'student');
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
    const identity = identityFor('student-1', 'student');
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
    const identity = identityFor('consumer-1', 'consumer');
    const query = jest.fn().mockResolvedValue({
      rows: [{ available: false, changed: 0 }],
    });
    const service = new ModuleRegistryService(identity, mockDb(query));

    await expect(service.disableModule('consumer-1', 'org-admin')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
