/**
 * @gri/ontology-engine —— 公共入口
 *
 * 导出本体 OO 引擎（继承/多态/接口解析 + 单表继承建模），
 * 供代码生成器、迁移器、后端运行时统一消费。
 */

export { OntologyEngine, createEngine } from './engine.js'
export {
  resolveInheritedFields,
  inheritanceChain,
  collectAbstractActions,
  resolveActionImplementation,
} from './resolver.js'
export {
  resolveSingleTableInheritance,
  buildSingleTableSchema,
  toSnakeCase,
} from './single-table.js'