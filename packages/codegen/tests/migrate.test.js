/**
 * @gri/codegen 统一迁移器契约测试
 *
 * 验证「单一 DSL 源」(*.ontology.yaml) 能：
 *  - 被 loadOntologyFile 读取 + 解析 + schema/语义双重校验
 *  - 确定性产出迁移 SQL（与内存夹具 order-inheritance.js 完全一致，证明无双源漂移）
 *  - 迁移文件名编号与后端 migrate.js 约定一致
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import path from 'path'
import { fileURLToPath } from 'url'
import { promises as fs } from 'fs'
import {
  loadOntologyFile,
  generateMigrationFile,
  generateMigrationBody,
  migrationFileName,
  generateSQL,
} from '../src/index.js'
import { orderOntology } from '../../ontology/src/samples/order-inheritance.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DSL_FILE = path.resolve(__dirname, '../../ontology/ontologies/orders.ontology.yaml')

describe('loadOntologyFile 读取 + 校验', () => {
  it('加载 orders.ontology.yaml 成功且语义完整（无漂移）', async () => {
    const r = await loadOntologyFile(DSL_FILE)
    assert.equal(r.ok, true, JSON.stringify(r.errors))
    assert.equal(r.ontology.name, 'gri-orders')
    assert.equal(r.ontology.objects.length, 5) // User + Order + 3 子类
  })

  it('YAML 源与内存夹具生成完全一致的 SQL（源唯一）', async () => {
    const r = await loadOntologyFile(DSL_FILE)
    const sqlFromYaml = generateSQL(r.ontology)
    const sqlFromFixture = generateSQL(orderOntology)
    assert.equal(sqlFromYaml, sqlFromFixture)
  })

  it('非法 YAML（空内容）返回统一 errors', async () => {
    const r = await loadOntologyFile(DSL_FILE, {
      readFile: async () => `schemaVersion: 0.1.0\nname: x\n`,
    })
    assert.equal(r.ok, false)
    assert.ok(Array.isArray(r.errors))
    assert.ok(r.errors.some((e) => /objects/.test(e.path) || /objects/.test(e.message)))
  })
})

describe('生成迁移文件体', () => {
  it('迁移体含可审阅头注 + 来源标记', () => {
    const body = generateMigrationBody(orderOntology, { source: 'orders.ontology.yaml' })
    assert.match(body, /orders\.ontology\.yaml → 迁移文件/)
    assert.match(body, /由 @gri\/codegen 生成/)
    assert.match(body, /CREATE TABLE/)
  })

  it('migrationFileName 编号三位补零', () => {
    assert.equal(migrationFileName(7, 'x'), '007_x.sql')
    assert.equal(migrationFileName(18, 'create_orders_single_table'), '018_create_orders_single_table.sql')
  })

  it('generateMigrationFile 返回 fileName + content 完整', () => {
    const f = generateMigrationFile(orderOntology, 18, 'create_orders_single_table')
    assert.equal(f.fileName, '018_create_orders_single_table.sql')
    assert.match(f.content, /CREATE TABLE IF NOT EXISTS order\b/)
    assert.match(f.content, /order_type/)
  })
})

describe('物理表名覆盖（table 字段）', () => {
  const DB_DSL = path.resolve(__dirname, '../../ontology/ontologies/database-orders.ontology.yaml')

  it('显式 table 字段覆盖隐式 toSnakeCase（避免与线上 orders 冲突）', async () => {
    const r = await loadOntologyFile(DB_DSL)
    assert.equal(r.ok, true, JSON.stringify(r.errors))
    const sql = generateSQL(r.ontology)
    assert.match(sql, /CREATE TABLE IF NOT EXISTS ontology_orders/)
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS order\b/)
    assert.match(sql, /order_type VARCHAR\(32\) NOT NULL/)
    assert.match(sql, /extra JSONB/)
  })

  it('数据库验证本体与抽象样板同构（三子类 + 三元判别值）', async () => {
    const r = await loadOntologyFile(DB_DSL)
    const { OntologyEngine } = await import('@gri/ontology-engine')
    const engine = new OntologyEngine(r.ontology)
    const { subclasses } = engine.singleTableInheritance()
    assert.deepEqual(
      subclasses.map((s) => s.discriminatorValue).sort(),
      ['catering', 'farm', 'wholesale'],
    )
  })

  it('生成器输出与已提交迁移文件完全一致（防生成器漂移）', async () => {
    const r = await loadOntologyFile(DB_DSL)
    const generated = generateSQL(r.ontology)
    const committed = await fs.readFile(
      path.resolve(__dirname, '../../../services/backend/src/infra/db/migrate/018_create_ontology_orders.sql'),
      'utf-8',
    )
    // 两侧各剥离注释头注，比较纯 SQL 主体（生成器自带头注与迁移文件的文档头注定位不同，属预期差异）
    const stripComments = (s) =>
      s.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').trim()
    assert.equal(stripComments(generated), stripComments(committed))
  })
})