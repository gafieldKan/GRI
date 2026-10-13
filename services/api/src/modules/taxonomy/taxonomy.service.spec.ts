import {
  BadRequestException,
  ConflictException,
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

  describe('createNode（新建：粒度闭集 + 审计 op=create）', () => {
    const calls = (queries: jest.Mock) => queries.mock.calls as Array<[string, unknown[]]>;
    const insertCall = (queries: jest.Mock) =>
      calls(queries).find(([sql]) => /^INSERT INTO ontology\.(region|industry)/.test(sql.trim()));
    const auditCall = (queries: jest.Mock) =>
      calls(queries).find(([sql]) => sql.includes('ontology.dimension_change_log'));

    const REGION_INTERMEDIATE = {
      ...REGION_PARENT,
      id: '9000030',
      code: '030',
      name: '东亚',
      level: 'intermediate',
      parent_id: '9000020',
    };
    const REGION_CREATED = {
      ...REGION_PARENT,
      id: '990000',
      code: '990000',
      name: '测试国',
      short: null,
      english: null,
      level: 'country',
      iso2: null,
      iso3: null,
      center: null,
      parent_id: '9000030',
      has_children: false,
      child_count: 0,
    };
    const INDUSTRY_SECTION = {
      ...INDUSTRY_SYSTEM,
      id: 'Z9',
      code: 'Z9',
      name: '测试门类',
      english: null,
      level: 'section',
      parent_id: 'ISIC Rev.5',
      section: 'Z9',
      has_children: false,
      child_count: 0,
    };

    it('region：父级 intermediate → 新建 country；INSERT 锚点=编码、level 由父级推导，并写审计', async () => {
      const query = jest
        .fn()
        .mockResolvedValueOnce({ rows: [REGION_INTERMEDIATE] }) // 父级存在
        .mockResolvedValueOnce({ rows: [] }) // 编码未占用
        .mockResolvedValueOnce({ rows: [] }) // INSERT
        .mockResolvedValueOnce({ rows: [REGION_CREATED] }); // 回读
      const service = new TaxonomyService(mockDb(query));

      const node = await service.createNode(
        'region',
        { code: '990000', name: '测试国', parentId: '9000030' },
        'op-1',
      );

      expect(node).toMatchObject({
        id: '990000',
        name: '测试国',
        level: 'country',
        parentId: '9000030',
      });
      const insert = insertCall(query);
      expect(insert?.[0]).toContain('INSERT INTO ontology.region');
      expect(insert?.[0]).toContain('(SELECT id FROM ontology.region WHERE node_id = $5)');
      expect(insert?.[1]).toEqual(['990000', '测试国', null, 'country', '9000030']);

      const audit = auditCall(query);
      expect(audit?.[0]).toContain('ontology.dimension_change_log');
      expect(audit?.[0]).toContain("'create'");
      const params = audit?.[1] as unknown[];
      expect(params[0]).toBe('region');
      expect(params[1]).toBe('990000');
      expect(params[4]).toBe('op-1');
      expect(params[5]).toBe('manual');
      expect(JSON.parse(String(params[3]))).toMatchObject({ id: '990000', level: 'country' });
    });

    it('industry：父级 system → 新建 section（section 列取编码），审计 source 可透传', async () => {
      const query = jest
        .fn()
        .mockResolvedValueOnce({ rows: [INDUSTRY_SYSTEM] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [INDUSTRY_SECTION] });
      const service = new TaxonomyService(mockDb(query));

      const node = await service.createNode(
        'industry',
        { code: 'Z9', name: '测试门类', short: '测试', parentId: 'ISIC Rev.5' },
        'op-1',
        'ai_command',
      );

      expect(node).toMatchObject({ id: 'Z9', level: 'section', parentId: 'ISIC Rev.5' });
      const insert = insertCall(query);
      expect(insert?.[0]).toContain('INSERT INTO ontology.industry');
      expect(insert?.[1]).toEqual(['Z9', '测试门类', '测试', 'section', 'ISIC Rev.5']);
      expect((auditCall(query)?.[1] as unknown[])[5]).toBe('ai_command');
    });

    it('粒度外：region 父级 province → 400，且不落库、不写审计', async () => {
      const query = jest.fn().mockResolvedValueOnce({ rows: [REGION_CHILD] });
      const service = new TaxonomyService(mockDb(query));

      await expect(
        service.createNode('region', { code: '990001', name: '越界', parentId: '110000' }, 'op-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(insertCall(query)).toBeUndefined();
      expect(auditCall(query)).toBeUndefined();
    });

    it('粒度外：industry 父级 section → 400（仅 system 下可建 section）', async () => {
      const section = { ...INDUSTRY_SECTION, parent_id: 'UN' };
      const query = jest.fn().mockResolvedValueOnce({ rows: [section] });
      const service = new TaxonomyService(mockDb(query));

      await expect(
        service.createNode('industry', { code: 'Z8', name: '越界', parentId: 'Z9' }, 'op-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(insertCall(query)).toBeUndefined();
    });

    it('父级不存在 → 404', async () => {
      const query = jest.fn().mockResolvedValueOnce({ rows: [] });
      const service = new TaxonomyService(mockDb(query));

      await expect(
        service.createNode('region', { code: '990000', name: '测试国', parentId: '888888' }, 'op-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('空值/非法编码 → 400（校验先于任何查询）', async () => {
      const query = jest.fn();
      const service = new TaxonomyService(mockDb(query));

      for (const body of [
        { code: '990000', parentId: '9000030' }, // 缺 name
        { name: '测试国', parentId: '9000030' }, // 缺 code
        { name: '测试国', code: '990000' }, // 缺 parentId
        { name: '测试国', code: '990000', parentId: '   ' }, // 父级空白
        { name: '测试国', code: 'ABC', parentId: '9000030' }, // region 编码须为数字
      ]) {
        await expect(service.createNode('region', body, 'op-1')).rejects.toBeInstanceOf(
          BadRequestException,
        );
      }
      expect(query).not.toHaveBeenCalled();
    });

    it('编码重复 → 409（预检覆盖已归档节点：不带 status 过滤）', async () => {
      const query = jest
        .fn()
        .mockResolvedValueOnce({ rows: [REGION_INTERMEDIATE] })
        .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
      const service = new TaxonomyService(mockDb(query));

      await expect(
        service.createNode('region', { code: '990000', name: '测试国', parentId: '9000030' }, 'op-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      const exists = calls(query)[1];
      expect(exists[0]).toContain('FROM ontology.region WHERE node_id = $1');
      expect(exists[0]).not.toContain('status');
      expect(insertCall(query)).toBeUndefined();
    });

    it('并发兜底：唯一约束冲突 23505 → 409（不冒 500）', async () => {
      const conflict = Object.assign(new Error('duplicate key'), { code: '23505' });
      const query = jest
        .fn()
        .mockResolvedValueOnce({ rows: [REGION_INTERMEDIATE] })
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce(conflict);
      const service = new TaxonomyService(mockDb(query));

      await expect(
        service.createNode('region', { code: '990000', name: '测试国', parentId: '9000030' }, 'op-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(auditCall(query)).toBeUndefined();
    });
  });
});
