/**
 * @gri/ontology-engine —— 单表继承建模
 *
 * 消费 @gri/ontology 的 discriminator + variantFields，产出「单表继承」的
 * 确定性表结构描述（§5.1.1）：
 *  - 基类字段 = orders 表的实际列
 *  - discriminator 字段（如 order_type）作为判别列
 *  - 子类差异化字段收敛进 extra JSONB 列（而非平铺三表）
 *
 * 这是生成器产出「一张表 + order_type 判别列 + extra JSONB」的纯函数来源，
 * 可独立可测试（f(DSL) → 表结构）。
 */

/**
 * 解析单表继承：找出扮演「基类」的 Object、判别字段、以及每个子类的差异化字段。
 *
 * @param {object} ontology 已通过 schema 校验的本体（含 .objects）
 * @returns {{
 *   base: object|null,
 *   discriminatorField: string|null,
 *   subclasses: Array<{ name: string, discriminatorValue: string, variantFields: object[] }>,
 * }}
 */
export function resolveSingleTableInheritance(ontology) {
  const objects = ontology.objects ?? []
  const objByName = new Map(objects.map((o) => [o.name, o]))

  // 判别字段名由所有带 discriminator 的子类统一推断（须一致，否则歧义）
  const discFields = new Set()
  for (const obj of objects) {
    if (obj.discriminator) discFields.add(obj.discriminator.field)
  }
  if (discFields.size === 0) {
    return { base: null, discriminatorField: null, subclasses: [] }
  }
  if (discFields.size > 1) {
    throw new Error(`单表继承判别字段不一致：${[...discFields].join(', ')}`)
  }

  const discriminatorField = [...discFields][0]

  // 基类 = 至少被一个带 discriminator 的子类 extends 的 object
  const subobjects = objects.filter((o) => o.discriminator)
  const baseNames = new Set(subobjects.map((o) => o.extends).filter(Boolean))
  const base = baseNames.size === 1 ? objByName.get([...baseNames][0]) : null
  // 若子类 extends 到不同基类（理论上单表继承不允许），报错
  if (baseNames.size > 1) {
    throw new Error(`单表继承子类 extends 到不同基类：${[...baseNames].join(', ')}`)
  }

  const subclasses = subobjects.map((o) => ({
    name: o.name,
    discriminatorValue: o.discriminator.value,
    variantFields: o.variantFields ?? [],
  }))

  return { base, discriminatorField, subclasses }
}

/**
 * 把单表继承解析结果映射为「一张基表」的列结构。
 *
 * @param {object} ontology
 * @returns {{
 *   table: string|null,
 *   columns: Array<{ name: string, type: string, ... }>,
 *   discriminatorColumn: string|null,
 *   extraColumn: string|null,
 * }}
 */
export function buildSingleTableSchema(ontology) {
  const { base, discriminatorField, subclasses } = resolveSingleTableInheritance(ontology)
  if (!base) {
    return { table: null, columns: [], discriminatorColumn: null, extraColumn: null }
  }

  const columns = (base.fields ?? []).map((f) => ({ name: f.name, type: f.type, ...f }))

  // discriminator + extra 作为额外列附加到基表
  columns.push({ name: discriminatorField, type: 'string' })
  columns.push({ name: 'extra', type: 'json', description: '子类差异化字段（variantFields → JSONB）' })

  return {
    table: base.table ?? toSnakeCase(base.name),
    columns,
    discriminatorColumn: discriminatorField,
    extraColumn: 'extra',
    baseName: base.name,
    subclasses,
  }
}

/**
 * 简单 PascalCase → snake_case（Order → order，WholesaleOrder → wholesale_order）。
 * @param {string} name
 */
export function toSnakeCase(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
}

export default { resolveSingleTableInheritance, buildSingleTableSchema, toSnakeCase }