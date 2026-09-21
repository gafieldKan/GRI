/**
 * @gri/codegen —— 统一迁移器
 *
 * 把「单一 DSL 源」(*.ontology.yaml|json) 确定性地产出带编号的迁移 SQL 文件，
 * 接到服务端既有迁移机制（services/api/src/migrate/run-migrations.js，单库 gri 多 schema）。
 *
 * 职责：
 *  - loadOntologyFile  —— 读磁盘 DSL 文件 → 解析 → schema + 语义双重校验（硬门禁）
 *  - generateMigration —— 本体 → 带编号的迁移文件体（`NNN_xxx.sql`）
 *  - 迁移产物可审阅、可回滚（是真实 .sql 文件，不是运行时魔法）
 */

import { promises as fs } from 'fs'
import path from 'path'
import { load as yamlLoad } from 'js-yaml'
import { loadOntology } from '@gri/ontology'
import { generateSQL } from './sql.js'

/**
 * 读取并校验一个本体 DSL 文件（.yaml / .yml / .json）。
 * 返回 { ok:true, ontology } 或 { ok:false, errors }。
 *
 * @param {string} filePath 磁盘路径
 * @param {{ readFile?: typeof fs.readFile }} [deps] 依赖注入（便于测试）
 */
export async function loadOntologyFile(filePath, deps = {}) {
  const readFile = deps.readFile ?? fs.readFile
  const raw = await readFile(filePath, 'utf-8')
  const ext = path.extname(filePath).toLowerCase()

  let data
  try {
    if (ext === '.json') {
      data = JSON.parse(raw)
    } else if (ext === '.yaml' || ext === '.yml') {
      data = yamlLoad(raw)
      if (data == null) throw new Error('YAML 内容为空或未解析出对象')
    } else {
      return { ok: false, errors: [{ path: '(root)', message: `不支持的 DSL 扩展名：${ext}` }] }
    }
  } catch (e) {
    return { ok: false, errors: [{ path: '(root)', message: `DSL 文件解析失败：${e.message}` }] }
  }

  return loadOntology(data)
}

/**
 * 生成本体对应的迁移文件体（纯 SQL 文本，含头注与来源标记）。
 * 内容与 generateSQL 一致，额外加上「可审阅」的来源头注。
 *
 * @param {object} ontology 已校验本体
 * @param {{ source?: string }} [meta] 来源元信息（如 DSL 文件名）
 */
export function generateMigrationBody(ontology, meta = {}) {
  const header = [
    `-- ${meta.source ?? 'ontology'} → 迁移文件（由 @gri/codegen 生成）`,
    `-- DSL schemaVersion: ${ontology.schemaVersion ?? '?'}`,
    `-- 审阅后合并入 services/api/src/migrate/ 即由 run-migrations 执行`,
  ].join('\n')
  return `${header}\n\n${generateSQL(ontology)}\n`
}

/**
 * 生成本存放的编号迁移文件名（对接 migrate.js 的 .sql 序号约定）。
 * @param {number} seq 递增序号（三位补零，如 18 → "018"）
 * @param {string} baseName 语义名（snake_case，如 create_orders_single_table）
 */
export function migrationFileName(seq, baseName) {
  const padded = String(seq).padStart(3, '0')
  return `${padded}_${baseName}.sql`
}

/**
 * 一键：本体 → 带编号的迁移文件内容（body 决定是否含头注）。
 * @param {object} ontology
 * @param {number} seq
 * @param {string} baseName
 * @param {{ source?: string }} [meta]
 */
export function generateMigrationFile(ontology, seq, baseName, meta = {}) {
  return {
    fileName: migrationFileName(seq, baseName),
    content: generateMigrationBody(ontology, { ...meta, source: meta.source ?? baseName }),
  }
}

export default { loadOntologyFile, generateMigrationBody, generateMigrationFile, migrationFileName }