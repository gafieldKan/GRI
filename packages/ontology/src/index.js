/**
 * @gri/ontology —— 唯一语义真源（公共入口）
 *
 * 导出 DSL 契约（schema）、语义校验、以及「结构校验 → 语义校验」的一站式
 * 消费函数，供本体引擎、代码生成器、迁移器与 AI 架构师 Agent 统一复用。
 */

export * from './schema.js'
export { validateOntologySemantics } from './validate.js'

import { OntologySchema } from './schema.js'
import { validateOntologySemantics } from './validate.js'

/**
 * 一站式校验：把（已解析为对象的）本体数据跑完 schema + 语义两道门禁。
 * 成功时返回 { ok:true, ontology }，失败时返回 { ok:false, errors }（结构错误
 * 与语义错误合并为统一的结构化列表，便于上层逐条消费与打回）。
 *
 * @param {object} data 本体对象（来自 yaml/json 解析）
 * @returns {{ ok:true, ontology:object } | { ok:false, errors: Array<{path:string, message:string}> }}
 */
export function loadOntology(data) {
  const parsed = OntologySchema.safeParse(data)
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => ({
        path: i.path.length ? i.path.join('.') : '(root)',
        message: i.message,
      })),
    }
  }
  const semantics = validateOntologySemantics(parsed.data)
  if (!semantics.ok) return semantics
  return { ok: true, ontology: parsed.data }
}

export { OntologySchema }