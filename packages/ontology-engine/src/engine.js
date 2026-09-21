/**
 * @gri/ontology-engine —— 本体 OO 引擎（核心）
 *
 * 职责（对应方案 §6.6）：
 *  - 加载 @gri/ontology DSL，跑 schema + 语义两道门禁
 *  - 继承解析：extends 链展开、字段扁平化（递归父类 → 子类）
 *  - 接口/抽象校验：抽象基类不可实例化、implements 动作完整、抽象动作有实现
 *  - 多态派发：同名 Action 按 discriminator 路由到「最具体子类」的实现（§6.3）
 *  - 单表继承：产出 orders 表 + order_type 判别列 + extra JSONB（§5.1.1）
 *
 * 契约：本引擎不承载持久化、不承载 UI，只做「语义真源 → 解析结果」的确定性计算，
 * 供代码生成器、迁移器、后端运行时统一消费（避免各服务自造 domain 的真源分歧）。
 */

import { OntologySchema } from '@gri/ontology'
import {
  resolveInheritedFields,
  inheritanceChain,
  collectAbstractActions,
  resolveActionImplementation,
} from './resolver.js'
import { resolveSingleTableInheritance, buildSingleTableSchema } from './single-table.js'

export class OntologyEngine {
  /**
   * @param {object} data 本体数据（yaml/json 已解析为对象）
   *
   * 构造时只做「结构化 schema 校验」（是否合法 DSL 形状）；继承/接口/抽象等
   * 语义契约延后到 instantiate()/missingAbstractActions() 调用点 enforce，
   * 使引擎既能加载「结构合法但实现未补全」的本体（用于内省补全缺口），
   * 又在真正实例化时 fail-fast（§6.2 / §6.6）。
   */
  constructor(data) {
    const parsed = OntologySchema.safeParse(data)
    if (!parsed.success) {
      const err = new Error(
        `本体 schema 校验失败：${parsed.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')}`,
      )
      err.errors = parsed.error.issues.map((i) => ({
        path: i.path.length ? i.path.join('.') : '(root)',
        message: i.message,
      }))
      throw err
    }
    this.ontology = parsed.data
    this.objects = this.ontology.objects ?? []
    this.objByName = new Map(this.objects.map((o) => [o.name, o]))
    this._singleTable = resolveSingleTableInheritance(this.ontology)
  }

  /**
   * 判断某 Object 是否为抽象（不可直接实例化，§6.2）。
   * @param {string} name
   */
  isAbstract(name) {
    return Boolean(this.objByName.get(name)?.abstract)
  }

  /**
   * 展开某 Object 的继承字段集（父类字段 ∪ 自身字段，去重）。
   * @param {string} name
   */
  inheritedFields(name) {
    this._assertExists(name)
    return resolveInheritedFields(name, this.objByName)
  }

  /**
   * 返回继承链（最顶层基类 → 目标 object）。
   * @param {string} name
   */
  chain(name) {
    this._assertExists(name)
    return inheritanceChain(name, this.objByName).map((o) => o.name)
  }

  /**
   * 多态派发：解析某 Object 上某 Action 的「最具体实现」。
   * 返回 { action, owner }，或 null（整条链都 abstract / 未定义）。
   * @param {string} name
   * @param {string} actionName
   */
  dispatch(name, actionName) {
    this._assertExists(name)
    return resolveActionImplementation(name, actionName, this.objByName)
  }

  /**
   * 校验某具体子类的实现完整性：父类抽象动作必须全部有非抽象实现。
   * 返回缺失的抽象动作名列表（空数组 = 完整）。
   * @param {string} name
   */
  missingAbstractActions(name) {
    this._assertExists(name)
    const abstract = collectAbstractActions(name, this.objByName)
    const implemented = new Set(
      (this.objByName.get(name).actions ?? []).filter((a) => !a.abstract).map((a) => a.name),
    )
    return abstract.map((a) => a.name).filter((n) => !implemented.has(n))
  }

  /**
   * 实例化一个具体 Object：抽象基类不可实例化（fail-fast）。
   * 返回 { object, inheritedFields, singleTable } 供上层消费。
   * @param {string} name
   */
  instantiate(name) {
    this._assertExists(name)
    if (this.isAbstract(name)) {
      throw new Error(`抽象 Object "${name}" 不可实例化`)
    }
    const missing = this.missingAbstractActions(name)
    if (missing.length) {
      throw new Error(`Object "${name}" 未实现抽象动作：${missing.join(', ')}`)
    }
    return {
      name,
      object: this.objByName.get(name),
      inheritedFields: this.inheritedFields(name),
      chain: this.chain(name),
    }
  }

  /**
   * 单表继承建模结果（§5.1.1）。
   * @returns {object} resolveSingleTableInheritance 的结果
   */
  singleTableInheritance() {
    return this._singleTable
  }

  /**
   * 单表继承的表结构（基表列 + 判别列 + extra JSONB）。
   * @returns {object} buildSingleTableSchema 的结果
   */
  singleTableSchema() {
    return buildSingleTableSchema(this.ontology)
  }

  _assertExists(name) {
    if (!this.objByName.has(name)) {
      throw new Error(`Object "${name}" 不存在`)
    }
  }
}

/**
 * 便捷工厂：从本体数据构建并立即校验引擎。
 * @param {object} data
 */
export function createEngine(data) {
  return new OntologyEngine(data)
}

export default OntologyEngine