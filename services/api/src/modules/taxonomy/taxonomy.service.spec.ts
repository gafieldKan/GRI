import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { TaxonomyService } from './taxonomy.service';

function mockDb(query: jest.Mock): DatabaseService {
  return { query } as unknown as DatabaseService;
}

const REGION_PARENT = {
  id: '100000',
  code: '156',
  name: '中国',
  short: '中国',
  english: 'China',
  level: 'country',
  iso2: 'CN',
  iso3: 'CHN',
  center: [104.195397, 35.86166],
  parent_id: '9000030',
  has_children: true,
  child_count: 34,
};

const REGION_CHILD = {
  id: '110000',
  code: '110000',
  name: '北京市',
  short: '北京',
  english: 'Beijing',
  level: 'province',
  iso2: null,
  iso3: null,
  center: [116.405285, 39.904989],
  parent_id: '100000',
  has_children: true,
  child_count: 16,
};

const INDUSTRY_ROOT = {
  id: 'UN',
  code: 'UN',
  name: '联合国',
  short: null,
  english: 'United Nations',
  level: 'root',
  parent_id: null,
  section: null,
  intro: null,
  includes: null,
  also: null,
  excludes: null,
  refs: null,
  updated: null,
  has_children: true,
  child_count: 1,
};

const INDUSTRY_SYSTEM = {
  id: 'ISIC Rev.5',
  code: 'ISIC Rev.5',
  name: '国际标准产业分类',
  short: null,
  english: 'ISIC Rev.5',
  level: 'system',
  parent_id: 'UN',
  section: null,
  intro: null,
  includes: null,
  also: null,
  excludes: null,
  refs: null,
  updated: null,
  has_children: true,
  child_count: 22,
};

describe('TaxonomyService', () => {
  it('region children 只按 node_id 读取直接子级并映射外部锚点', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [REGION_PARENT] })
      .mockResolvedValueOnce({
        rows: [
          REGION_CHILD,
          { ...REGION_CHILD, id: '120000', code: '120000', name: '天津市', short: '天津' },
        ],
      });
    const service = new TaxonomyService(mockDb(query));

    await expect(service.children('region', '100000')).resolves.toEqual({
      parent: {
        id: '100000',
        code: '156',
        name: '中国',
        short: '中国',
        english: 'China',
        level: 'country',
        parentId: '9000030',
        hasChildren: true,
        childCount: 34,
        iso2: 'CN',
        iso3: 'CHN',
        center: [104.195397, 35.86166],
      },
      children: [
        {
          id: '110000',
          code: '110000',
          name: '北京市',
          short: '北京',
          english: 'Beijing',
          level: 'province',
          parentId: '100000',
          hasChildren: true,
          childCount: 16,
          iso2: null,
          iso3: null,
          center: [116.405285, 39.904989],
        },
        {
          id: '120000',
          code: '120000',
          name: '天津市',
          short: '天津',
          english: 'Beijing',
          level: 'province',
          parentId: '100000',
          hasChildren: true,
          childCount: 16,
          iso2: null,
          iso3: null,
          center: [116.405285, 39.904989],
        },
      ],
    });

    expect(query).toHaveBeenCalledTimes(2);
    const [parentSql, parentParams] = query.mock.calls[0] as [string, unknown[]];
    const [childSql, childParams] = query.mock.calls[1] as [string, unknown[]];
    expect(parentSql).toContain('FROM ontology.region');
    expect(parentSql).toContain('node_id = $1');
    expect(parentParams).toEqual(['100000']);
    expect(childSql).not.toContain('WITH RECURSIVE');
    expect(childSql).toContain('p.node_id = $1');
    expect(childSql).toContain('c.parent_id = p.id');
    expect(childParams).toEqual(['100000']);
  });

  it('region 未给 parent 时从唯一 world 根开始', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ ...REGION_PARENT, level: 'world', parent_id: null }] })
      .mockResolvedValueOnce({ rows: [] });
    const service = new TaxonomyService(mockDb(query));

    await service.children('region');

    const [rootSql] = query.mock.calls[0] as [string, unknown[]];
    expect(rootSql).toContain("level = 'world'");
    expect(rootSql).toContain('parent_id IS NULL');
  });

  it('industry children 与根节点使用 code 锚点', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [INDUSTRY_ROOT] })
      .mockResolvedValueOnce({ rows: [INDUSTRY_SYSTEM] });
    const service = new TaxonomyService(mockDb(query));

    const result = await service.children('industry');

    expect(result.parent?.id).toBe('UN');
    expect(result.children[0]).toMatchObject({
      id: 'ISIC Rev.5',
      name: '国际标准产业分类',
      english: 'ISIC Rev.5',
      parentId: 'UN',
      childCount: 22,
    });
    expect((query.mock.calls[0][0] as string)).toContain("level = 'root'");
    expect((query.mock.calls[1][0] as string)).toContain('FROM ontology.industry');
    expect(query.mock.calls[1][1]).toEqual(['UN']);
  });

  it('未知 name → 404，未知 id → 404', async () => {
    const query = jest.fn();
    const service = new TaxonomyService(mockDb(query));

    await expect(service.children('planet', '1')).rejects.toBeInstanceOf(NotFoundException);
    query.mockResolvedValueOnce({ rows: [] });
    await expect(service.getNode('region', '999999')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('空 parent / 非法 limit / 空搜索词 → 400，且不访问数据库', async () => {
    const query = jest.fn();
    const service = new TaxonomyService(mockDb(query));

    await expect(service.children('region', '')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.search('industry', 'A', '0')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.search('industry', '   ', '20')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.getNode('region', '../100000')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(query).not.toHaveBeenCalled();
  });

  it('node 详情返回 region / industry 的完整只读字段', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [REGION_PARENT] })
      .mockResolvedValueOnce({
        rows: [
          {
            ...INDUSTRY_SYSTEM,
            section: 'A',
            intro: '说明',
            refs: [{ url: 'https://example.test' }],
            updated: true,
          },
        ],
      });
    const service = new TaxonomyService(mockDb(query));

    await expect(service.getNode('region', '100000')).resolves.toMatchObject({
      id: '100000',
      name: '中国',
      iso2: 'CN',
    });
    await expect(service.getNode('industry', 'ISIC Rev.5')).resolves.toMatchObject({
      id: 'ISIC Rev.5',
      name: '国际标准产业分类',
      section: 'A',
      intro: '说明',
      updated: true,
    });
  });

  it('search 对中文、编码、英文统一参数化，并限制返回数量', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            ...INDUSTRY_SYSTEM,
            id: 'A',
            code: 'A',
            name: '农业、林业及渔业',
            english: 'Agriculture, forestry and fishing',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            ...INDUSTRY_SYSTEM,
            id: 'A',
            code: 'A',
            name: '农业、林业及渔业',
            english: 'Agriculture, forestry and fishing',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            ...INDUSTRY_SYSTEM,
            id: 'A',
            code: 'A',
            name: '农业、林业及渔业',
            english: 'Agriculture, forestry and fishing',
          },
        ],
      });
    const service = new TaxonomyService(mockDb(query));

    for (const q of ['农业', 'A', 'Agriculture']) {
      await expect(service.search('industry', q, '5')).resolves.toMatchObject({
        query: q,
        limit: 5,
        items: [{ id: 'A', code: 'A' }],
      });
    }

    expect(query).toHaveBeenCalledTimes(3);
    const expectedQueries = ['农业', 'A', 'Agriculture'];
    for (const [index, [sql, params]] of (
      query.mock.calls as Array<[string, unknown[]]>
    ).entries()) {
      expect(sql).toContain('ILIKE');
      expect(sql).toContain('i.name');
      expect(sql).toContain('i.code');
      expect(sql).toContain('i.en');
      expect(params).toEqual([expectedQueries[index], 5]);
    }
  });

  it('path 返回根到目标的祖先链', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [
        { ...REGION_PARENT, id: '9999999', code: '001', name: '联合国', level: 'world', parent_id: null, has_children: true, child_count: 5 },
        { ...REGION_PARENT, id: '9000142', name: '亚洲', level: 'region', parent_id: '9999999' },
        { ...REGION_PARENT },
      ],
    });
    const service = new TaxonomyService(mockDb(query));

    const result = await service.path('region', '100000');

    expect(result.nodes.map((node) => node.id)).toEqual(['9999999', '9000142', '100000']);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('WITH RECURSIVE');
    expect(sql).toContain('FROM ontology.region');
    expect(sql).toContain('ORDER BY');
    expect(params).toEqual(['100000']);
  });
});
