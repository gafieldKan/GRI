import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { ResourceService } from './resource.service';

const RESTAURANT_ID = 'b0000000-0000-0000-0000-000000000001';
const ORG_ID = '10000000-0000-0000-0000-000000000001';
const ACTOR_ID = 'a0000000-0000-0000-0000-000000000001';

function mockDb(query: jest.Mock): DatabaseService {
  return { query, getPool: jest.fn() } as unknown as DatabaseService;
}

function mockTransactionalDb(query: jest.Mock, clientQuery: jest.Mock): DatabaseService {
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

describe('ResourceService', () => {
  it('按 region/industry/type 查询绑定，两个维度使用 AND 语义并返回业务标签', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [{ region_id: 'region-uuid', industry_id: 'industry-uuid' }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            resource_type: 'restaurant',
            resource_id: RESTAURANT_ID,
            label: '示例食堂',
            region_id: '100000',
            industry_id: 'I',
          },
        ],
      });
    const service = new ResourceService(mockDb(query));

    await expect(
      service.list({ region: '100000', industry: 'I', type: 'restaurant' }),
    ).resolves.toEqual([
      {
        type: 'restaurant',
        id: RESTAURANT_ID,
        label: '示例食堂',
        regionId: '100000',
        industryId: 'I',
      },
    ]);

    const [dimensionSql, dimensionParams] = query.mock.calls[0] as [string, unknown[]];
    expect(dimensionSql).toContain("level IN ('country', 'province')");
    expect(dimensionSql).toContain("level = 'section'");
    expect(dimensionParams).toEqual(['100000', 'I']);

    const [listSql, listParams] = query.mock.calls[1] as [string, unknown[]];
    expect(listSql).toContain('FROM ontology.resource_dimension rd');
    expect(listSql).toContain('LEFT JOIN public.restaurants r');
    expect(listSql).toContain('LEFT JOIN tenant.organizations o');
    expect(listSql).toContain('LEFT JOIN ontology.region rg');
    expect(listSql).toContain('LEFT JOIN ontology.industry ind');
    expect(listSql).toContain('rd.region_id = $1');
    expect(listSql).toContain('rd.industry_id = $2');
    expect(listSql).toContain('rd.resource_type = $3');
    expect(listParams).toEqual(['region-uuid', 'industry-uuid', 'restaurant']);
  });

  it('无过滤条件时不解析维度，直接列出存量绑定', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const service = new ResourceService(mockDb(query));

    await expect(service.list({})).resolves.toEqual([]);

    expect(query).toHaveBeenCalledTimes(1);
    expect((query.mock.calls[0][1] as unknown[])).toEqual([null, null, null]);
  });

  it('未知或层级不合法的 region/industry → 400，且不查询资源', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [{ region_id: null, industry_id: null }],
    });
    const service = new ResourceService(mockDb(query));

    await expect(service.list({ region: '9999999' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.list({ industry: '01' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('空 region/industry 与未知 type → 400，且不访问数据库', async () => {
    const query = jest.fn();
    const service = new ResourceService(mockDb(query));

    await expect(service.list({ region: '' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.list({ industry: '   ' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.list({ type: 'hotel' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('PUT 更新真实 FK，并在同一事务写 resource_dimension 审计', async () => {
    const clientQuery = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ resource_type: 'restaurant', resource_id: RESTAURANT_ID, name: '示例食堂' }],
      }) // resource exists
      .mockResolvedValueOnce({ rows: [] }) // existing binding
      .mockResolvedValueOnce({
        rows: [{ id: 'region-uuid', node_id: '100000' }],
      }) // resolve region
      .mockResolvedValueOnce({
        rows: [{ id: 'industry-uuid', code: 'I' }],
      }) // resolve industry
      .mockResolvedValueOnce({ rows: [{ resource_id: RESTAURANT_ID }] }) // upsert
      .mockResolvedValueOnce({ rows: [] }) // audit
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    const service = new ResourceService(mockTransactionalDb(jest.fn(), clientQuery));

    await expect(
      service.setDimension(
        'restaurant',
        RESTAURANT_ID,
        { regionId: '100000', industryId: 'I' },
        ACTOR_ID,
      ),
    ).resolves.toEqual({
      type: 'restaurant',
      id: RESTAURANT_ID,
      label: '示例食堂',
      regionId: '100000',
      industryId: 'I',
    });

    expect(clientQuery.mock.calls[0][0]).toBe('BEGIN');
    expect(clientQuery.mock.calls.some(([sql]) => /INSERT INTO ontology\.resource_dimension/.test(sql))).toBe(true);
    const auditCall = clientQuery.mock.calls.find(([sql]) =>
      /INSERT INTO ontology\.dimension_change_log/.test(sql),
    );
    expect(auditCall).toBeDefined();
    expect(auditCall?.[1]).toEqual([
      'resource_dimension',
      `restaurant:${RESTAURANT_ID}`,
      '{}',
      JSON.stringify({ regionId: '100000', industryId: 'I' }),
      ACTOR_ID,
      'manual',
    ]);
    expect(clientQuery.mock.calls.at(-1)?.[0]).toBe('COMMIT');
  });

  it('PUT 资源不存在 → 404 并回滚', async () => {
    const clientQuery = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // resource missing
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
    const service = new ResourceService(mockTransactionalDb(jest.fn(), clientQuery));

    await expect(
      service.setDimension(
        'organization',
        ORG_ID,
        { regionId: '100000' },
        ACTOR_ID,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(clientQuery.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');
    expect(
      clientQuery.mock.calls.some(([sql]) => /INSERT INTO ontology\.resource_dimension/.test(sql)),
    ).toBe(false);
  });

  it('PUT 非法类型/UUID/维度 → 400，且不访问数据库', async () => {
    const query = jest.fn();
    const service = new ResourceService(mockDb(query));

    await expect(
      service.setDimension('hotel', RESTAURANT_ID, { regionId: '100000' }, ACTOR_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.setDimension('restaurant', 'not-a-uuid', { regionId: '100000' }, ACTOR_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.setDimension('restaurant', RESTAURANT_ID, {}, ACTOR_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });
});
