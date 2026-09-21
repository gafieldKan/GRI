import { Injectable, NotFoundException } from '@nestjs/common';
import { OntologyRegistry } from './ontology.registry';
import type { ObjectDef } from '@gri/ontology';

/**
 * M4 ontology 门面 —— 把本体 OO 引擎（继承/多态/接口解析）暴露为对外的只读知识端点。
 *
 * 不承载任意写：本体真源变更走 `@gri/ontology` 的 DSL 文件 + 重新装载（registry），
 * 而非运行时写库。端点语义 = 语义真源的确定性内省，供前端目录/生成器/AI 架构师 Agent 消费。
 */
@Injectable()
export class OntologyService {
  constructor(private readonly registry: OntologyRegistry) {}

  private engine() {
    return this.registry.engine;
  }

  /** 对象清单：名称 + 抽象标记 + 判别列（目录浏览）。 */
  listObjects() {
    return this.engine().objects.map((o) => ({
      name: o.name,
      description: o.description ?? null,
      abstract: o.abstract === true,
      discriminator: o.discriminator ?? null,
    }));
  }

  /** 单个对象内省：继承字段集 + 继承链 + 抽象动作缺口 + 多态实现。 */
  getObject(name: string) {
    const obj = this.assertExists(name);
    const eng = this.engine();
    return {
      name,
      description: obj.description ?? null,
      abstract: obj.abstract === true,
      extends: obj.extends ?? null,
      implements: obj.implements ?? [],
      discriminator: obj.discriminator ?? null,
      fields: obj.fields ?? [],
      variantFields: obj.variantFields ?? [],
      actions: obj.actions ?? [],
      inheritedFields: eng.inheritedFields(name),
      chain: eng.chain(name),
      missingAbstractActions: eng.missingAbstractActions(name),
    };
  }

  /** 继承链：最顶层基类 → 目标 object。 */
  chain(name: string): string[] {
    this.assertExists(name);
    return this.engine().chain(name);
  }

  /** 多态派发：某 Action 在目标 object 上的「最具体实现」。 */
  dispatch(name: string, action: string) {
    this.assertExists(name);
    const result = this.engine().dispatch(name, action);
    return {
      object: name,
      action,
      resolved: result ? true : false,
      implementationOwner: result?.owner ?? null,
      implementation: result?.action ?? null,
    };
  }

  /** 单表继承产物预览：orders 表 + 判别列 + extra JSONB。 */
  singleTableSchema() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const st = (this.engine() as any)._singleTable;
    return st ?? null;
  }

  private assertExists(name: string): ObjectDef {
    const obj = this.engine().objByName.get(name);
    if (!obj) throw new NotFoundException(`本体 Object 不存在: ${name}`);
    return obj;
  }
}