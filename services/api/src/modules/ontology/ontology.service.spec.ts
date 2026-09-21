import { NotFoundException } from '@nestjs/common';
import { OntologyRegistry } from './ontology.registry';
import { OntologyService } from './ontology.service';

// @gri/ontology-engine 是 ESM（type: module），jest 模块注册表不解析 node_modules 里的
// export 语法。与 jwt-auth.middleware.spec 一致：jest.mock 重定向，jest 不再加载真实 ESM。
// 真实引擎正确性由 packages/ontology-engine 的 node --test 套件 + 运行时冒烟覆盖。
jest.mock('@gri/ontology-engine', () => ({
  OntologyEngine: class {},
  createEngine: jest.fn(),
}));

/**
 * 假引擎：不 loadedola 真实 @gri/ontology-engine（ESM，jest 模块注册表不解析 node_modules ESM；
 * 真实引擎正确性由 packages/ontology-engine 的 node --test 套件 + 运行时冒烟覆盖）。
 * 此处只锁 OntologyService 门面的「引擎输出 → 对外形态」映射：
 *   Base 抽象 / Child 抽象=false 带判别列；Child 继承链 [Base,Child]；
 *   继承字段 [id,own]；run 已实现、stop 未实现；dispatch run → 最具体子类 Child。
 */
function fakeEngine() {
  const objByName = new Map<string, object>();
  objByName.set('Base', {});
  objByName.set('Child', {});
  return {
    objects: [
      { name: 'Base', description: null, abstract: true, discriminator: null },
      { name: 'Child', description: null, abstract: false, discriminator: { field: 'kind', value: 'child' } },
    ],
    objByName,
    inheritedFields: (n: string) => (n === 'Child' ? [{ name: 'id' }, { name: 'own' }] : []),
    chain: (n: string) => (n === 'Child' ? ['Base', 'Child'] : ['Base']),
    missingAbstractActions: (n: string) => (n === 'Child' ? ['stop'] : []),
    dispatch: (n: string, a: string) =>
      n === 'Child' && a === 'run'
        ? { action: { name: 'run', abstract: false }, owner: 'Child' }
        : null,
  };
}

function makeService(): OntologyService {
  const registry = { engine: fakeEngine() } as unknown as OntologyRegistry;
  return new OntologyService(registry);
}

describe('OntologyService 语义真源内省（M4 ontology 门面）', () => {
  it('listObjects 暴露目录：抽象标记 + 判别列', () => {
    const list = makeService().listObjects();
    expect(list).toHaveLength(2);
    const base = list.find((o) => o.name === 'Base')!;
    const child = list.find((o) => o.name === 'Child')!;
    expect(base.abstract).toBe(true);
    expect(child.abstract).toBe(false);
    expect(child.discriminator).toEqual({ field: 'kind', value: 'child' });
  });

  it('getObject：继承字段 = 基类字段 ∪ 自身字段，缺失抽象动作仅列出未实现的', () => {
    const obj = makeService().getObject('Child');
    expect(obj.inheritedFields.map((f) => f.name)).toEqual(['id', 'own']);
    expect(obj.chain).toEqual(['Base', 'Child']);
    expect(obj.missingAbstractActions).toEqual(['stop']); // run 已实现，stop 缺
  });

  it('chain：最顶层基类 → 目标', () => {
    expect(makeService().chain('Child')).toEqual(['Base', 'Child']);
  });

  it('dispatch：resolve 到最具体子类的非抽象实现', () => {
    const d = makeService().dispatch('Child', 'run');
    expect(d.resolved).toBe(true);
    expect(d.implementationOwner).toBe('Child');

    const miss = makeService().dispatch('Child', 'stop');
    expect(miss.resolved).toBe(false);
  });

  it('对象不存在 → NotFoundException', () => {
    expect(() => makeService().getObject('Ghost')).toThrow(NotFoundException);
    expect(() => makeService().chain('Ghost')).toThrow(NotFoundException);
  });
});