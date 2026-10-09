/**
 * 孪生 DSL 契约测试（S5 · 「本体 → 孪生」形式化 · 孪生锚点）
 *
 * 锚定三件事：
 *   1. student-twin.ontology.yaml 过 schema + 语义双重门禁（twin 跨引用校验）
 *   2. f(DSL) → SQL 确定且结构正确（twin.event + entity_id FK 级联 + 复合索引）
 *   3. f(DSL) → SQL 与实际迁移 016 逐字节一致（防漂移：YAML 是唯一真源）
 *   4. f(DSL) → 孪生描述符形态正确（六面 + 世界 + 行动闭集）
 *   5. 双锚点零回归：orders/k12 不含 twins 时行为不变（twins 默认 []）
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { loadOntology, OntologySchema } from '@gri/ontology'
import {
  loadOntologyFile,
  generateSQL,
  generateTwinDescriptor,
  buildTwinDescriptor,
} from '../src/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TWIN_DSL = path.resolve(__dirname, '../../ontology/ontologies/student-twin.ontology.yaml')
const K12_DSL = path.resolve(__dirname, '../../ontology/ontologies/k12-curriculum.ontology.yaml')
const ORDERS_DSL = path.resolve(__dirname, '../../ontology/ontologies/orders.ontology.yaml')
const MIGRATION_016 = path.resolve(__dirname, '../../../services/api/src/migrate/016_student_twin_ontology.sql')

describe('孪生 DSL：本体 → 孪生（student-twin 锚点）', () => {
  it('student-twin YAML 过双重门禁；User 抽象 + TwinEvent 经历对象', async () => {
    const r = await loadOntologyFile(TWIN_DSL)
    assert.equal(r.ok, true, JSON.stringify(r.errors))
    assert.equal(r.ontology.schemaVersion, '0.5.0')
    const names = r.ontology.objects.map((o) => o.name).sort()
    assert.deepEqual(names, ['TwinEvent', 'User'])
    assert.equal(r.ontology.objects.find((o) => o.name === 'User').abstract, true)
    // 孪生声明存在且形态完整
    assert.equal(r.ontology.twins.length, 1)
    const t = r.ontology.twins[0]
    assert.equal(t.name, 'StudentTwin')
    assert.equal(t.entity, 'User')
    assert.equal(t.world, 'KnowledgeArea')
    assert.equal(t.parts.length, 6)
    assert.equal(t.verbs.length, 6)
  })

  it('生成 SQL：twin.event 表 + entity_id→public.users 级联 FK + 复合索引', async () => {
    const r = await loadOntologyFile(TWIN_DSL)
    const sql = generateSQL(r.ontology)
    assert.match(sql, /CREATE TABLE IF NOT EXISTS twin\.event \(/)
    assert.match(sql, /entity_id UUID NOT NULL/)
    assert.match(sql, /FOREIGN KEY \(entity_id\) REFERENCES public\.users\(id\) ON DELETE CASCADE/)
    assert.match(sql, /diffs JSONB DEFAULT '\[\]'::jsonb/)
    assert.match(sql, /at TIMESTAMPTZ DEFAULT NOW\(\)/)
    assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_twin_event_entity_at ON twin\.event \(entity_id, at DESC\);/)
    // 抽象 User 不建表（只作 FK 引用目标）
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS public\.users/)
    // 确定性
    assert.equal(sql, generateSQL(r.ontology))
  })

  it('防漂移：迁移 016 = 生成 SQL（YAML 唯一真源）', async () => {
    const r = await loadOntologyFile(TWIN_DSL)
    const sql = generateSQL(r.ontology)
    const migration = await fs.readFile(MIGRATION_016, 'utf-8')
    assert.ok(
      migration.includes(sql),
      '迁移 016 与 YAML 生成 SQL 不一致 —— 改 YAML 后须重跑 codegen 更新迁移',
    )
  })

  it('孪生描述符：六面 + 世界 + 行动闭集（可序列化供前后端共享）', async () => {
    const r = await loadOntologyFile(TWIN_DSL)
    const d = buildTwinDescriptor(r.ontology)
    assert.equal(d.ontology, 'student-twin')
    const t = d.twins[0]
    assert.deepEqual(t.parts.map((p) => p.name), [
      'profile', 'state', 'world', 'events', 'memories', 'relations',
    ])
    assert.equal(t.parts.find((p) => p.name === 'events').object, 'TwinEvent')
    assert.deepEqual(t.verbs.map((v) => v.verb), [
      'lesson', 'practice', 'review', 'chat', 'exam', 'rest',
    ])
    // JSON 序列化确定
    assert.equal(generateTwinDescriptor(r.ontology), generateTwinDescriptor(r.ontology))
    assert.match(generateTwinDescriptor(r.ontology), /"name": "StudentTwin"/)
  })

  it('twin 跨引用门禁：entity 指向不存在的 Object 时 fail-fast', () => {
    const bad = OntologySchema.parse({
      schemaVersion: '0.5.0',
      name: 'x',
      objects: [{ name: 'A', fields: [] }],
      twins: [{ name: 'T', entity: 'Ghost' }],
    })
    const r = loadOntology(bad)
    assert.equal(r.ok, false)
    assert.ok(r.errors.some((e) => e.message.includes('Ghost') && e.path === 'twins[T].entity'))
  })

  it('双锚点零回归：orders/k12 无 twins 时默认空、生成不受影响', async () => {
    for (const dsl of [ORDERS_DSL, K12_DSL]) {
      const r = await loadOntologyFile(dsl)
      assert.equal(r.ok, true, JSON.stringify(r.errors))
      assert.deepEqual(r.ontology.twins, []) // 默认空（additive）
      // 生成确定且不含孪生表（twins 不进 SQL 轨）
      const sql = generateSQL(r.ontology)
      assert.equal(sql, generateSQL(r.ontology))
      assert.doesNotMatch(sql, /twin\.event/)
    }
  })
})
