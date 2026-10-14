/**
 * @gri/codegen —— SQL 生成器
 *
 * 消费 @gri/ontology-engine 的单表继承建模结果，确定性输出迁移 SQL。
 * 纯函数 f(DSL) → SQL 字符串，可审阅、可回滚、可测试（§5.1.1 / §2.3）。
 *
 * 映射规则：
 *  - Object → 表名（snake_case，或显式 table 覆盖，支持 schema 限定名）
 *  - 字段 → 列（FieldType → 具体 PostgreSQL 类型）
 *  - discriminator → 判别列（VARCHAR + CHECK 约束可选）
 *  - variantFields → 合并进 extra JSONB（单表继承差异化承载）
 *  - Link → 外键（§6.1）：从【对象级 links】生成（带 foreignKey 的 Link 落到
 *    source 表上；自引用/跨表/schema 限定引用均支持）。本体级 links（ontology.links）
 *    仅声明关系语义、不落列——与既有订单样板输出兼容。
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
  if (field.dbCheck === true && Array.isArray(field.values) && field.values.length) {
    parts.push(`CHECK (${name} IN (${field.values.map(sqlLiteral).join(', ')}))`)
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
 * 解析某 Object 上「对象级 links」的外键列声明（§6.1 Link → 外键）。
 * - foreignKey 显式声明优先；缺省为 `${target}Id`（camelCase，生成时转 snake_case）
 * - cardinality 'one' → UNIQUE 外键；'many' → 普通外键 + 索引
 * - 自引用 Link（source === target）天然支持（树形结构）
 *
 * @param {object} obj Object 声明
 * @param {Map<string,object>} objByName 全部 Object 名 → Object（解析 target 表名用）
 * @returns {Array<{ name: string, fkName: string, targetTable: string, unique: boolean }>}
 */
export function resolveObjectLinks(obj, objByName = new Map()) {
  return (obj.links ?? [])
    .filter((l) => l.foreignKey !== null) // 显式排除（foreignKey: null 表示纯语义关系）
    .map((l) => {
      const fkName = toSnakeCase(l.foreignKey ?? `${l.target}Id`)
      const target = objByName.get(l.target)
      const targetTable = target?.table ?? toSnakeCase(l.target)
      const unique = l.cardinality === 'one'
      return {
        name: l.name,
        fkName,
        targetTable,
        unique,
        // 删除行为：显式 onDelete 优先；缺省沿用历史语义（UNIQUE 外键 → 级联）
        onDelete: l.onDelete ?? (unique ? 'cascade' : null),
        targetName: l.target,
      }
    })
}

/**
 * 外键删除行为的 SQL 片段（无则空串）。
 * @param {'cascade'|'set null'|'restrict'|null|undefined} onDelete
 */
export function onDeleteClause(onDelete) {
  if (onDelete === 'cascade') return ' ON DELETE CASCADE'
  if (onDelete === 'set null') return ' ON DELETE SET NULL'
  if (onDelete === 'restrict') return ' ON DELETE RESTRICT'
  return ''
}

/**
 * 生成对象级 indexes 的 CREATE INDEX 语句。
 * 支持 "col" / "col DESC" 列项（排序方向保留，列名转 snake_case）、唯一索引、
 * 部分索引谓词与显式索引名（缺省 idx_<table>_<cols>）。
 * @param {object} obj Object 声明
 * @param {string} [table] 物理表名（缺省按 name 推导）
 */
export function indexSQL(obj, table) {
  const tbl = table ?? obj.table ?? toSnakeCase(obj.name)
  return (obj.indexes ?? []).map((idx) => {
    const cols = idx.columns
      .map((c) => {
        const parts = String(c).trim().split(/\s+/)
        return [toSnakeCase(parts[0]), ...parts.slice(1)].join(' ')
      })
      .join(', ')
    const name = idx.name ?? `idx_${tbl.replace(/\./g, '_')}_${(idx.columns[0] || 'col').split(/\s+/)[0].replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()}`
    const unique = idx.unique ? 'UNIQUE ' : ''
    const where = idx.where ? ` WHERE ${idx.where}` : ''
    return `CREATE ${unique}INDEX IF NOT EXISTS ${name} ON ${tbl} (${cols})${where};`
  })
}

/**
 * 生成某 Object 的复合唯一约束 SQL（UNIQUE (a, b)，关联类/桥表场景）。
 * @param {object} obj Object 声明（含 uniqueConstraints）
 */
export function uniqueConstraintSQL(obj) {
  return (obj.uniqueConstraints ?? []).map(
    (group) => `    UNIQUE (${group.map((c) => toSnakeCase(c)).join(', ')})`,
  )
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
  const objByName = new Map((ontology.objects ?? []).map((o) => [o.name, o]))
  if (!schema.table) {
    // 非单表继承：退化为逐 Object 生表（保留基础能力）
    const tables = []
    for (const obj of ontology.objects ?? []) {
      if (obj.abstract) continue
      tables.push(generatePlainTableSQL(obj, objByName))
    }
    return tables.join('\n\n')
  }
  // 混合模式：单表继承基类（如 orders 的 Order、k12 的 Textbook）走单表生成；
  // 其余普通 Object（含 extends 子类——已并入基表）继续逐个生表。
  // §7.4 登记制加性扩展：k12 本体引入「教材继承 + 六对象并存」，旧版在此直接
  // return 单表 SQL 会把其余六表砍掉。
  const tables = [generateCreateTableSQL(schema)]
  const consumedBySingleTable = new Set([
    schema.baseName,
    ...ontology.objects.filter((o) => o.discriminator).map((o) => o.name),
  ])
  for (const obj of ontology.objects ?? []) {
    if (obj.abstract || consumedBySingleTable.has(obj.name)) continue
    tables.push(generatePlainTableSQL(obj, objByName))
  }
  return tables.join('\n\n')
}

/**
 * 为普通 Object（非继承场景）生成基础 CREATE TABLE（兜底能力）。
 * 含 Link → 外键（§6.1，对象级 links）与复合唯一约束（关联类场景）。
 * @param {object} obj
 * @param {Map<string,object>} [objByName] 全部 Object（解析 Link target 表名用）
 */
function generatePlainTableSQL(obj, objByName = new Map()) {
  const table = obj.table ?? toSnakeCase(obj.name)
  const linkFks = resolveObjectLinks(obj, objByName)
  // id 主键兜底（与单表继承路径对齐——FK REFERENCES xxx(id) 依赖它）：
  // fields 未声明 id 时补 gen_random_uuid() 主键；声明了则沿用 fields 定义
  const hasId = (obj.fields ?? []).some((f) => f.name === 'id')
  const cols = []
  if (!hasId) cols.push(`    id UUID PRIMARY KEY DEFAULT gen_random_uuid()`)
  for (const f of obj.fields ?? []) {
    if (f.name === 'id') cols.push(`    id UUID PRIMARY KEY DEFAULT gen_random_uuid()`)
    else cols.push(`    ${fieldToColumn(f)}`)
  }
  // Link 外键列（fields 已声明同名列的沿用 fields 定义，只补缺失的）
  for (const fk of linkFks) {
    if (!cols.some((c) => c.startsWith(`    ${fk.fkName} `))) {
      cols.push(`    ${fk.fkName} UUID` + (fk.unique ? ' UNIQUE' : ''))
    }
  }
  // 复合唯一约束（关联类/桥表）
  cols.push(...uniqueConstraintSQL(obj))
  // 外键声明（REFERENCES，含 schema 限定目标表与自引用）
  const fks = linkFks.map(
    (fk) =>
      `    FOREIGN KEY (${fk.fkName}) REFERENCES ${fk.targetTable}(id)` + onDeleteClause(fk.onDelete),
  )
  const lines = [`-- 由 @gri/codegen 生成（普通 Object）`, `CREATE TABLE IF NOT EXISTS ${table} (`]
  if (fks.length) {
    lines.push(cols.filter((c) => c !== '').join(',\n') + ',')
    lines.push(fks.join(',\n'))
  } else {
    lines.push(cols.filter((c) => c !== '').join(',\n'))
  }
  lines.push(`);`)
  // 对象级索引（含复合/部分索引）
  lines.push(...indexSQL(obj, table))
  return lines.join('\n')
}

export default { generateSQL, generateCreateTableSQL, fieldToColumn, toSnakeCase, PG_TYPE_MAP }
