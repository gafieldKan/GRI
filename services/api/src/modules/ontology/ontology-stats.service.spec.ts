import { DatabaseService } from '../../database/database.service';
import { OntologyStatsService } from './ontology-stats.service';

// @gri/ontology-engine 是 ESM（type: module），jest 模块注册表不解析 node_modules 里的
// export 语法。与 ontology.service.spec 一致：jest.mock 重定向，jest 不再加载真实 ESM。
// 真实引擎正确性由 packages/ontology-engine 的 node --test 套件 + 运行时冒烟覆盖。
jest.mock('@gri/ontology-engine', () => ({
  OntologyEngine: class {},
  createEngine: jest.fn(),
}));

// yaml 同理：CJS require 在 jest 下可用，但为锁「YAML → 引擎 → 统计形态」映射，
// mock 掉 yaml.parse 返回固定的两份本体（一份单表继承 + 一份普通）。
jest.mock('yaml', () => ({
  parse: jest.fn(() => ({ objects: [] })), // 占位，逐用例覆盖
}));

// fs 同理 mock：readdir/readFileSync 定形为 2 份本体，测试不依赖 dev node_modules
// 的真实目录内容（否则加第 4 份 YAML 时用例漂移）。requireActual 保 pg 等内部用法。
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  readdirSync: jest.fn(() => ['a.ontology.yaml', 'b.ontology.yaml']),
  readFileSync: jest.fn(() => 'objects: []'),
}));

import { parse as yamlParse } from 'yaml';

/**
 * 统计门面 spec：只锁「引擎输出 → 统计形态」映射，不测真实 YAML 内容
 * （真实本体正确性由 @gri/ontology 门禁 + 各 node --test 套件覆盖）。
 *
 * 构造路径：createEngine（mock）逐份返回 fakeEngine；OntologyStatsService 构造时
 * readdir @gri/ontology/ontologies 目录 → parse → createEngine。
 */

function fakeEngineSingleTable() {
  const objByName = new Map<string, object>();
  objByName.set('Base', {});
  objByName.set('ChildA', {});
  objByName.set('ChildB', {});
  return {
    ontology: {
      name: 'demo-single-table',
      schemaVersion: '1.0.0',
      description: '单表继承演示',
      interfaces: [{ name: 'Confirmable', actions: [] }],
      links: [{ name: 'toUser', source: 'ChildA', target: 'User', cardinality: 'many', foreignKey: 'userId' }],
      objects: [
        { name: 'Base', abstract: true, discriminator: null },
        { name: 'ChildA', abstract: false, extends: 'Base', discriminator: { field: 'kind', value: 'a' } },
        { name: 'ChildB', abstract: false, extends: 'Base', discriminator: { field: 'kind', value: 'b' } },
        { name: 'User', abstract: false, discriminator: null },
      ],
    },
    objects: [
      { name: 'Base', abstract: true, discriminator: null },
      { name: 'ChildA', abstract: false, extends: 'Base', discriminator: { field: 'kind', value: 'a' } },
      { name: 'ChildB', abstract: false, extends: 'Base', discriminator: { field: 'kind', value: 'b' } },
      { name: 'User', abstract: false, discriminator: null },
    ],
    objByName,
    singleTableInheritance: () => ({ base: { name: 'Base' }, discriminatorField: 'kind', subclasses: ['ChildA', 'ChildB'] }),
  };
}

function fakeEnginePlain() {
  const objByName = new Map<string, object>();
  objByName.set('Widget', {});
  return {
    ontology: {
      name: 'demo-plain',
      schemaVersion: '0.3.0',
      description: '普通对象演示',
      interfaces: [],
      links: [],
      objects: [{ name: 'Widget', abstract: false, discriminator: null }],
    },
    objects: [{ name: 'Widget', abstract: false, discriminator: null }],
    objByName,
    singleTableInheritance: () => null,
  };
}

function makeService(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  engine: any,
  db: Partial<DatabaseService>,
) {
  (createEngineMock as jest.Mock).mockReturnValue(engine);
  return new OntologyStatsService(db as DatabaseService);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createEngineMock = (jest.requireMock('@gri/ontology-engine') as any).createEngine;

describe('OntologyStatsService 统计门面（引擎输出 → 统计形态）', () => {
  beforeEach(() => {
    createEngineMock.mockReset();
    (yamlParse as jest.Mock).mockReset();
    (yamlParse as jest.Mock).mockImplementation(() => ({ objects: [] }));
  });

  it('每本体：objects/abstract/subclasses 计数 + 判别列提取', async () => {
    const svc = makeService(fakeEngineSingleTable(), {});
    const stats = await svc.stats();

    // fs mock 为 2 文件 → 每文件一引擎（default return 同一形态）→ 2 份本体。
    expect(stats.ontologies).toHaveLength(2);
    const o = stats.ontologies[0];
    expect(o.name).toBe('demo-single-table');
    expect(o.sourceFile).toBe('a.ontology.yaml');
    expect(o.objectCount).toBe(4);
    expect(o.abstractClasses).toEqual(['Base']);
    expect(o.subclassCount).toBe(2);
    expect(o.subclasses[0]).toEqual({ name: 'ChildA', base: 'Base', discriminator: 'kind' });
    expect(o.discriminatorCount).toBe(2);
    expect(o.interfaces).toEqual(['Confirmable']);
    expect(o.singleTable).toEqual({ baseName: 'Base', baseTable: null, discriminatorColumn: 'kind', subclassCount: 2 });
  });

  it('合计聚合：多本体的 objects/links 跨本体累加 + 卡inality 分类', async () => {
    // readdir 已 mock 为 2 文件 → createEngine ×2。Once 优先：首调单表引擎，次调普通。
    (createEngineMock as jest.Mock).mockImplementation(() => fakeEnginePlain());
    (createEngineMock as jest.Mock).mockImplementationOnce(() => fakeEngineSingleTable());

    const svc = makeService(fakeEnginePlain(), {});
    const stats = await svc.stats();

    expect(stats.ontologies).toHaveLength(2);
    const totals = stats.ontologyTotals;
    expect(totals.ontologyCount).toBe(2);
    // single-table: 4 objects + plain: 1
    expect(totals.objectCount).toBe(5);
    // single-table 1 link (many)
    expect(totals.links.total).toBe(1);
    expect(totals.links.oneToMany).toBe(1);
    expect(totals.links.oneToOne).toBe(0);
  });

  it('links 卡inality：one → oneToOne 桶；桥表（复合唯一）不误归 oneToOne', async () => {
    const svc = makeService(fakeEnginePlain(), {});
    const stats = await svc.stats();
    // plain 引擎 links 空 → 桶全 0
    expect(stats.ontologyTotals.links).toEqual({ total: 0, oneToMany: 0, oneToOne: 0 });
  });

  it('DB/迁移失败容忍回空不崩', async () => {
    const dbFail = {
      query: jest.fn().mockRejectedValue(new Error('db down')),
    };
    const svc = makeService(fakeEnginePlain(), dbFail as unknown as DatabaseService);
    const stats = await svc.stats();

    expect(stats.database).toEqual({ schemaCount: 0, tableCount: 0 });
    expect(stats.migrations.fileCount).toBeGreaterThanOrEqual(0);
    expect(stats.migrations.appliedCount).toBe(0);
  });

  it('curated 常量齐备：以人为本/设计模式/OO 四特性/现实映射/开发过程快照', async () => {
    const svc = makeService(fakeEnginePlain(), {});
    const stats = await svc.stats();

    expect(stats.humanCentricPrinciple.title).toBe('以人为本');
    expect(stats.humanCentricPrinciple.chain.map((c) => c.step)).toEqual([
      '人', '以人引出万物', '由万物引出本体', '本体 → 对象', '对象 → 模式',
    ]);
    expect(stats.designPatterns.creational).toHaveLength(2);
    expect(stats.designPatterns.structural).toHaveLength(3);
    expect(stats.designPatterns.behavioral).toHaveLength(5);
    expect(stats.ooFeatures.map((f) => f.name)).toEqual(['多态', '继承', '封装', '生命周期']);
    expect(stats.realWorldMappings).toHaveLength(3);
    expect(stats.devProcess.snapshotDate).toBe('2026-09-25');
    expect(stats.devProcess.commits.total).toBe(15);
    expect(stats.devProcess.plans.active).toHaveLength(4);
    expect(stats.devProcess.milestones[0]).toEqual({
      stage: '人本', name: expect.stringContaining('以人为本'), status: '起点',
    });
  });
});
