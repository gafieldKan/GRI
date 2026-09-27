/**
 * 混合模式生成器契约测试（k12 教材继承 · 单表继承 + 普通 Object 并存）
 *
 * 背景：旧资产改造片 D（2026-09）——k12-curriculum 本体补用继承/多态后，
 * generateSQL 旧版「发现 discriminator 就整本体走单表、砍掉其余六表」的缺陷必须修。
 * 本测试锚定混合模式语义：
 *   1. 单表继承基类（Textbook）→ 一张基表 + textbook_type 判别列 + extra JSONB
 *   2. 普通对象（Subject/Grade/…）→ 照常逐个 CREATE TABLE
 *   3. orders 纯单表样板不回归（双锚点之一）
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import path from 'path'
import { fileURLToPath } from 'url'
import { loadOntologyFile, generateSQL } from '../src/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const K12_DSL = path.resolve(__dirname, '../../ontology/ontologies/k12-curriculum.ontology.yaml')
const ORDERS_DSL = path.resolve(__dirname, '../../ontology/ontologies/orders.ontology.yaml')

describe('混合模式：k12 教材单表继承 + 普通对象并存', () => {
  it('k12 YAML 过 schema 门禁且继承体系完整（15 objects，0.4.0 版图层 +2）', async () => {
    const r = await loadOntologyFile(K12_DSL)
    assert.equal(r.ok, true, JSON.stringify(r.errors))
    assert.equal(r.ontology.objects.length, 15)
    const tb = r.ontology.objects.find((o) => o.name === 'Textbook')
    assert.equal(tb.abstract, true)
    const subs = r.ontology.objects.filter((o) => o.extends === 'Textbook')
    assert.equal(subs.length, 6)
    assert.deepEqual(
      subs.map((s) => s.discriminator.value).sort(),
      ['bio', 'chem', 'chn', 'eng', 'math', 'phys'],
    )
  })

  it('基表带判别列与 extra；六学科子类不另建表', async () => {
    const r = await loadOntologyFile(K12_DSL)
    const sql = generateSQL(r.ontology)
    assert.match(sql, /CREATE TABLE IF NOT EXISTS ontology\.textbook \(/)
    assert.match(sql, /textbook_type VARCHAR\(32\) NOT NULL/)
    assert.match(sql, /extra JSONB/)
    // 子类绝不单独建表（单表继承语义）
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS ontology\.math_textbook/)
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS ontology\.physics_textbook/)
  })

  it('其余八普通对象照常生表（不被单表路径砍掉；含 0.4.0 版图两表）', async () => {
    const r = await loadOntologyFile(K12_DSL)
    const sql = generateSQL(r.ontology)
    for (const t of [
      'ontology.subject',
      'ontology.school_stage',
      'ontology.grade',
      'ontology.textbook_chapter',
      'edu.knowledge_points',
      'ontology.kp_prerequisite',
      'ontology.knowledge_area',
      'ontology.area_prerequisite',
    ]) {
      assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${t.replace('.', '\\.')} \\(`), `缺表：${t}`)
    }
  })

  it('版图层（0.4.0）：knowledge_area 自引用树 + area_prerequisite 复合唯一', async () => {
    const r = await loadOntologyFile(K12_DSL)
    const sql = generateSQL(r.ontology)
    assert.match(sql, /FOREIGN KEY \(parent_id\) REFERENCES ontology\.knowledge_area\(id\)/)
    assert.match(sql, /UNIQUE \(from_area, to_area\)/)
    // scope 语义列与 grade_level 落位列在
    assert.match(sql, /scope VARCHAR\(\d+\) NOT NULL/)
    assert.match(sql, /grade_level INTEGER/)
  })

  it('关联类复合唯一与自引用树 FK 在混合模式下保留', async () => {
    const r = await loadOntologyFile(K12_DSL)
    const sql = generateSQL(r.ontology)
    assert.match(sql, /UNIQUE \(from_kp, to_kp\)/)
    assert.match(sql, /parent_id UUID[^,]*,/)
    assert.match(sql, /FOREIGN KEY \(parent_id\) REFERENCES ontology\.textbook_chapter\(id\)/)
  })

  it('orders 纯单表样板零回归（双锚点）', async () => {
    const r = await loadOntologyFile(ORDERS_DSL)
    const sql = generateSQL(r.ontology)
    assert.match(sql, /CREATE TABLE IF NOT EXISTS order \(/)
    assert.match(sql, /order_type VARCHAR\(32\) NOT NULL/)
    // 纯单表样板的 User（普通对象）也应在（混合模式对它反而修了旧缺陷）
    assert.match(sql, /CREATE TABLE IF NOT EXISTS user \(/)
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS catering_order/)
  })

  it('生成确定性：同源两次生成完全一致', async () => {
    const r = await loadOntologyFile(K12_DSL)
    assert.equal(generateSQL(r.ontology), generateSQL(r.ontology))
  })
})
