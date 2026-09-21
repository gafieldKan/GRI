/**
 * @gri/codegen —— SQL 生成器
 *
 * 消费 @gri/ontology-engine 的单表继承建模结果，确定性输出迁移 SQL。
 * 纯函数 f(DSL) → SQL 字符串，可审阅、可回滚、可测试（§5.1.1 / §2.3）。
 *
 * 映射规则：
 *  - Object → 表名（snake_case）
 *  - 字段 → 列（FieldType → 具体 PostgreSQL 类型）
 *  - discriminator → 判别列（VARCHAR + CHECK 约束可选）
 *  - variantFields → 合并进 extra JSONB（单表继承差异化承载）
 *  - Link → 外键（§6.1）
 */

import { buildSingleTableSchema, toSnakeCase } from '@gri/ontology-engine'

/**
 * FieldType → PostgreSQL 列类型映射（§5.1）。
 * 可扩展：新增标量类型只需在此登记一行，不改生成器骨架（§7.4 契约）。
 */
export const PG_TYPE_MAP = {
  string: 'VARCHAR(255)',
  text: 'TEXT',
  integer: 'INTEGER',
  number: 'NUMERIC(14, 2)',
  boolean: 'BOOLEAN',
  uuid: 'UUID',
  date: 'DATE',
  datetime: 'TIMESTAMPTZ',
  json: 'JSONB',
  enum: 'VARCHAR(64)',
  array: 'JSONB',
}

/**
 * 把单字段映射为 SQL 列定义片段（列名转 snake_case，与现有迁移约定一致）。
 * @param {object} field 字段声明
 */
export function fieldToColumn(field) {
  const type = PG_TYPE_MAP[field.type] ?? 'TEXT'
  const name = toSnakeCase(field.name)
  const parts = [name, type]
  if (field.required && !field.default && !field.dbDefault) parts.push('NOT NULL')
  if (field.unique) parts.push('UNIQUE')
  if (field.dbDefault) {
    parts.push(`DEFAULT ${field.dbDefault}`)
  } else if (field.default != null) {
    parts.push(`DEFAULT ${sqlLiteral(field.default)}`)
  }
  return parts.join(' ')
}

/**
 * 把字面量转成 SQL 字面量（字符串加引号，数字/布尔原样）。
 * @param {string|number|boolean|null} value
 */
export function sqlLiteral(value) {
  if (value === null) return 'NULL'
  if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  return String(value)
}

/**
 * 为一张单表继承的表生成 CREATE TABLE SQL。
 * @param {object} schema 来自 buildSingleTableSchema 的结果
 */
export function generateCreateTableSQL(schema) {
  if (!schema.table) {
    throw new Error('本体不包含单表继承基类，无法生成单表 CREATE TABLE')
  }

  const lines = []
  lines.push(`-- 由 @gri/codegen 生成，源自本体 DSL（单表继承）`)
  lines.push(`-- 表：${schema.table}，判别列：${schema.discriminatorColumn}，差异化字段进 ${schema.extraColumn} JSONB`)
  lines.push(`CREATE TABLE IF NOT EXISTS ${schema.table} (`)

  const colDefs = schema.columns.map((c) => {
    if (c.name === schema.discriminatorColumn) {
      return `    ${c.name} VARCHAR(32) NOT NULL` // 判别列非空
    }
    if (c.name === schema.extraColumn) {
      return `    ${c.name} JSONB` // 差异化字段承载
    }
    if (c.name === 'id') {
      return `    id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
    }
    return `    ${fieldToColumn(c)}`
  })

  // 基础时间戳兜底（若 DSL 未声明）
  const hasCreated = schema.columns.some((c) => c.name === 'createdAt' || c.name === 'created_at')
  const hasUpdated = schema.columns.some((c) => c.name === 'updatedAt' || c.name === 'updated_at')
  if (!hasCreated) colDefs.push(`    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`)
  if (!hasUpdated) colDefs.push(`    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`)

  lines.push(colDefs.join(',\n'))
  lines.push(`);`)

  // 索引：判别列 + 声明的 index 字段
  const indexes = []
  indexes.push(`CREATE INDEX IF NOT EXISTS idx_${schema.table}_${schema.discriminatorColumn} ON ${schema.table} (${schema.discriminatorColumn});`)
  for (const c of schema.columns) {
    const colName = toSnakeCase(c.name)
    if (c.index && c.name !== schema.discriminatorColumn) {
      indexes.push(`CREATE INDEX IF NOT EXISTS idx_${schema.table}_${colName} ON ${schema.table} (${colName});`)
    }
  }

  return [...lines, ...indexes].join('\n')
}

/**
 * 入口：从本体对象生成完整迁移 SQL（含头注 + 表 + 索引）。
 * @param {object} ontology 本体对象（含 objects）
 */
export function generateSQL(ontology) {
  const schema = buildSingleTableSchema(ontology)
  if (!schema.table) {
    // 非单表继承：退化为逐 Object 生表（保留基础能力）
    const tables = []
    for (const obj of ontology.objects ?? []) {
      if (obj.abstract) continue
      tables.push(generatePlainTableSQL(obj))
    }
    return tables.join('\n\n')
  }
  return generateCreateTableSQL(schema)
}

/**
 * 为普通 Object（非继承场景）生成基础 CREATE TABLE（兜底能力）。
 * @param {object} obj
 */
function generatePlainTableSQL(obj) {
  const table = toSnakeCase(obj.name)
  const cols = (obj.fields ?? []).map((f) => {
    if (f.name === 'id') return `    id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
    return `    ${fieldToColumn(f)}`
  })
  return [
    `-- 由 @gri/codegen 生成（普通 Object）`,
    `CREATE TABLE IF NOT EXISTS ${table} (`,
    cols.join(',\n'),
    `);`,
  ].join('\n')
}

export default { generateSQL, generateCreateTableSQL, fieldToColumn, toSnakeCase, PG_TYPE_MAP }