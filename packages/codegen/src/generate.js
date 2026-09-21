/**
 * @gri/codegen —— 编排入口
 *
 * 把本体 DSL 一键生成各轨产物（SQL / TS / …未来 Vue 页面）。
 * 产物是「真实代码入库、可审阅、可回滚」的编译期双轨之一（§4.4）。
 */

import { generateSQL } from './sql.js'
import { generateTypeScript } from './typescript.js'

/**
 * 可插拔生成器注册表（§7.4 扩展契约）：
 * 新增生成轨（如 Vue 页面骨架、OpenAPI 签名），只需在此登记一个
 * { name, run(ontology) => string } 条目，不改骨架。
 */
export const generators = {
  sql: generateSQL,
  typescript: generateTypeScript,
}

/**
 * 一键生成所有已注册产物。
 * @param {object} ontology
 * @param {string[]} [tracks] 要生成的轨（默认全部）
 * @returns {Record<string, string>} { sql: '...', typescript: '...' }
 */
export function generate(ontology, tracks = Object.keys(generators)) {
  const out = {}
  for (const track of tracks) {
    const gen = generators[track]
    if (!gen) throw new Error(`未注册的生成轨：${track}`)
    out[track] = gen(ontology)
  }
  return out
}

export { generateSQL, generateTypeScript }
export default generate