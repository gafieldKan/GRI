/**
 * @gri/codegen —— TypeScript 类型生成器
 *
 * 消费本体的继承关系，产出 TS 接口（含 discriminator 联合类型的「判别联合」）。
 * 纯函数 f(DSL) → TS 源码字符串，供前端/后端共享类型（§4.4 / §2.1 双轨构建）。
 *
 * 单表继承 → 判别联合：
 *   export type Order = CateringOrder | FarmOrder | WholesaleOrder
 *   export interface CateringOrder extends OrderBase { order_type: 'catering'; extra: {...} }
 */

import { buildSingleTableSchema, toSnakeCase } from '@gri/ontology-engine'

/**
 * FieldType → TS 类型映射。
 */
export const TS_TYPE_MAP = {
  string: 'string',
  text: 'string',
  integer: 'number',
  number: 'number',
  boolean: 'boolean',
  uuid: 'string',
  date: 'string',
  datetime: 'string',
  json: 'Record<string, unknown>',
  enum: 'string',
  array: 'unknown[]',
}

/**
 * 生成一个字段的 TS 属性声明（含 optional 标记）。
 * @param {object} field
 */
export function fieldToTS(field) {
  const type = TS_TYPE_MAP[field.type] ?? 'unknown'
  const optional = field.required ? '' : '?'
  return `  ${field.name}${optional}: ${type};`
}

/**
 * 生成单表继承的 TS 类型源码。
 * @param {object} ontology
 */
export function generateTypeScript(ontology) {
  const schema = buildSingleTableSchema(ontology)
  if (!schema.table || !schema.baseName) {
    return generatePlainTypes(ontology)
  }

  const baseName = schema.baseName
  const baseFields = (schema.baseName ? (ontology.objects.find((o) => o.name === schema.baseName)?.fields ?? []) : [])

  const lines = []
  lines.push(`// 由 @gri/codegen 生成，源自本体 DSL（单表继承）`)
  lines.push(`// 基类：${baseName}；判别列：${schema.discriminatorColumn}`)
  lines.push(``)
  lines.push(`export interface ${baseName}Base {`)

  // 基类字段（排除 id/时间戳兜底）
  for (const f of baseFields) {
    if (f.name === 'id') { lines.push(`  ${f.name}${f.required ? '' : '?'}: string;`); continue }
    lines.push(fieldToTS(f))
  }
  lines.push(`  ${schema.discriminatorColumn}: string;`)
  lines.push(`  ${schema.extraColumn}: Record<string, unknown>;`)
  lines.push(`}`)
  lines.push(``)

  // 子类差异化 extra 类型
  for (const sub of schema.subclasses) {
    const obj = ontology.objects.find((o) => o.name === sub.name)
    lines.push(`export interface ${sub.name}${sub.name.endsWith('Order') ? 'Extra' : 'Fields'} {`)
    for (const f of sub.variantFields ?? []) {
      lines.push(fieldToTS(f))
    }
    lines.push(`}`)
    lines.push(``)
  }

  // 判别联合
  const members = schema.subclasses.map((s) => s.name).join(' | ')
  lines.push(`export type ${baseName} = ${members};`)

  return lines.join('\n')
}

/**
 * 非单表继承场景：为每个非抽象 Object 生成独立 interface。
 * @param {object} ontology
 */
function generatePlainTypes(ontology) {
  const chunks = []
  for (const obj of ontology.objects ?? []) {
    if (obj.abstract) continue
    chunks.push(`export interface ${obj.name} {`)
    for (const f of obj.fields ?? []) {
      chunks.push(fieldToTS(f))
    }
    chunks.push(`}`)
    chunks.push(``)
  }
  return chunks.join('\n')
}

export default { generateTypeScript, fieldToTS, TS_TYPE_MAP }