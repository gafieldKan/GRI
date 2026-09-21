import { NotFoundException } from '@nestjs/common';
import { MasterDataService } from './master-data.service';
import { DatabaseService } from '../../database/database.service';

function mockDb(impl: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }>) {
  return { query: impl, getPool: jest.fn() } as unknown as DatabaseService;
}

describe('MasterDataService 引用主数据字典', () => {
  it('listKinds 聚合每类条目数', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [
        { kind: 'Subject', total: 5, active: 5 },
        { kind: 'Grade', total: 3, active: 3 },
      ],
    });
    const svc = new MasterDataService(mockDb(query));

    const kinds = await svc.listKinds();

    expect(kinds).toHaveLength(2);
    expect(query.mock.calls[0][0]).toContain('GROUP BY kind');
  });

  it('listByKind 只按 kind 且 status=active，ordered by sort_order', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ id: 'm1', kind: 'Subject', label: '数学' }] });
    const svc = new MasterDataService(mockDb(query));

    const rows = await svc.listByKind('Subject');

    expect(rows[0].label).toBe('数学');
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('kind = $1');
    expect(sql).toContain("status = 'active'");
    expect(params).toEqual(['Subject']);
  });

  it('getById 查不到 → NotFoundException', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const svc = new MasterDataService(mockDb(query));

    await expect(svc.getById('90000000-0000-0000-0000-000000000001')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});