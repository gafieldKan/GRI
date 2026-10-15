/**
 * W1 人本世界本体契约测试。
 *
 * 锚定：
 *   1. organization / life-scene YAML 过 schema + 语义双重校验；
 *   2. YAML -> codegen SQL 确定；
 *   3. 029/030 只嵌入生成结构主体，迁移禁止 ALTER 遗留 tenant 表；
 *   4. 关键种子与 SceneModuleLink 映射在迁移中可审阅。
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import path from 'path'
import { fileURLToPath } from 'url'
import { promises as fs } from 'fs'
import { loadOntologyFile, generateSQL } from '../src/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../../..')
const ORGANIZATION_DSL = path.join(ROOT, 'packages/ontology/ontologies/organization.ontology.yaml')
const LIFE_SCENE_DSL = path.join(ROOT, 'packages/ontology/ontologies/life-scene.ontology.yaml')
const MIGRATION_029 = path.join(ROOT, 'services/api/src/migrate/029_organization.sql')
const MIGRATION_030 = path.join(ROOT, 'services/api/src/migrate/030_life_scene.sql')

describe('W1 组织本体（organization）', () => {
  it('YAML 过双重校验，三类对象 + Person 抽象锚点形态正确', async () => {
    const r = await loadOntologyFile(ORGANIZATION_DSL)
    assert.equal(r.ok, true, JSON.stringify(r.errors))
    assert.equal(r.ontology.name, 'organization')
    assert.deepEqual(
      r.ontology.objects.map((o) => o.name).sort(),
      ['OrgMember', 'Organization', 'OrganizationType', 'Person'],
    )
    assert.equal(r.ontology.objects.find((o) => o.name === 'Person').abstract, true)
    assert.equal(
      r.ontology.objects.find((o) => o.name === 'Organization').table,
      'ontology.organization',
    )
    assert.equal(
      r.ontology.objects.find((o) => o.name === 'OrgMember').table,
      'ontology.org_member',
    )
  })

  it('codegen SQL 与 029 结构主体一致，且 029 不改遗留表', async () => {
    const r = await loadOntologyFile(ORGANIZATION_DSL)
    const generated = generateSQL(r.ontology)
    const migration = await fs.readFile(MIGRATION_029, 'utf-8')
    assert.ok(migration.includes(generated), '029 未嵌入 organization codegen SQL')
    assert.doesNotMatch(migration, /ALTER\s+TABLE\s+tenant\./i)
    assert.doesNotMatch(generated, /CREATE TABLE IF NOT EXISTS public\.users/)
  })

  it('029 含 7 个组织类型种子 + 幂等回填锚点', async () => {
    const migration = await fs.readFile(MIGRATION_029, 'utf-8')
    for (const code of ['family', 'school', 'company', 'social-group', 'department', 'community', 'other']) {
      assert.match(migration, new RegExp(`['\"]${code}['\"]`))
    }
    assert.match(migration, /INSERT INTO ontology\.organization\b/i)
    assert.match(migration, /INSERT INTO ontology\.org_member\b/i)
    assert.match(migration, /ON CONFLICT \(id\) DO UPDATE/i)
    assert.match(migration, /NULLIF\(code, ''\)/)
  })
})

describe('W1 人本世界本体（life-scene）', () => {
  it('YAML 过双重校验，三对象结构正确', async () => {
    const r = await loadOntologyFile(LIFE_SCENE_DSL)
    assert.equal(r.ok, true, JSON.stringify(r.errors))
    assert.equal(r.ontology.name, 'life-scene')
    assert.deepEqual(
      r.ontology.objects.map((o) => o.name).sort(),
      ['LifeIntent', 'LifeScene', 'SceneModuleLink'],
    )
  })

  it('codegen SQL 与 030 结构主体一致，且不改遗留表', async () => {
    const r = await loadOntologyFile(LIFE_SCENE_DSL)
    const generated = generateSQL(r.ontology)
    const migration = await fs.readFile(MIGRATION_030, 'utf-8')
    assert.ok(migration.includes(generated), '030 未嵌入 life-scene codegen SQL')
    assert.doesNotMatch(migration, /ALTER\s+TABLE\s+tenant\./i)
  })

  it('030 含 7 场景、意向与指定模块映射', async () => {
    const migration = await fs.readFile(MIGRATION_030, 'utf-8')
    for (const code of ['home', 'dining', 'academy', 'work', 'social', 'travel', 'wellness']) {
      assert.match(migration, new RegExp(`['\"]${code}['\"]`))
    }
    assert.match(migration, /ontology\.life_intent/i)
    assert.match(migration, /ontology\.scene_module_link/i)
    for (const code of ['food', 'tutor', 'curriculum', 'agent', 'org-admin', 'dashboard']) {
      assert.match(migration, new RegExp(`['\"]${code}['\"]`))
    }
    assert.match(migration, /ON CONFLICT \(scene_code, code\) DO UPDATE/i)
    assert.match(migration, /ON CONFLICT \(scene_code, intent_code, module_code\) DO UPDATE/i)
  })
})
