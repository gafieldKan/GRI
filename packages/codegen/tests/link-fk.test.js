/**
 * @gri/codegen 契约测试 —— K12 课程本体形态（树自引用 / 跨 schema FK / 关联类 / 复合唯一）
 *
 * 对应施工方案「DSL 补完」片：sql.js 兑现头注已列的 §6.1 "Link → 外键" 映射规则。
 * 断言生成器的确定性输出：
 *  - 自引用 Link（树）→ 自引用外键
 *  - 跨 schema 限定表名（table: "ontology.xxx"）原样透传
 *  - 关联类（桥表）+ uniqueConstraints → 复合唯一
 *  - cardinality 'one' → UNIQUE 外键
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  generateSQL,
  resolveObjectLinks,
  uniqueConstraintSQL,
} from '../src/index.js'

/** 课程树最小形态：自引用章节 + 跨 schema FK */
const treeOntology = {
  schemaVersion: '0.2.0',
  name: 'k12-tree-smoke',
  objects: [
    {
      name: 'Chapter',
      table: 'ontology.textbook_chapter',
      fields: [{ name: 'code', type: 'string', unique: true }],
      links: [
        { name: 'parentChapter', source: 'Chapter', target: 'Chapter', cardinality: 'one', foreignKey: 'parentId' },
      ],
    },
  ],
}

/** 关联类形态：桥表 + 复合唯一 */
const bridgeOntology = {
  schemaVersion: '0.2.0',
  name: 'k12-bridge-smoke',
  objects: [
    {
      name: 'KnowledgePoint',
      table: 'edu.knowledge_points',
      fields: [{ name: 'code', type: 'string', unique: true }],
    },
    {
      name: 'KnowledgePointPrerequisite',
      table: 'ontology.kp_prerequisite',
      fields: [],
      links: [
        { name: 'prerequisiteFrom', source: 'KnowledgePointPrerequisite', target: 'KnowledgePoint', cardinality: 'one', foreignKey: 'fromKp' },
        { name: 'prerequisiteTo', source: 'KnowledgePointPrerequisite', target: 'KnowledgePoint', cardinality: 'one', foreignKey: 'toKp' },
      ],
      uniqueConstraints: [['fromKp', 'toKp']],
    },
  ],
}

describe('Link → 外键（§6.1 补完）', () => {
  it('自引用 Link 产出自引用外键（树形结构）', () => {
    const sql = generateSQL(treeOntology)
    assert.match(sql, /parent_id UUID UNIQUE/)
    assert.match(sql, /FOREIGN KEY \(parent_id\) REFERENCES ontology\.textbook_chapter\(id\) ON DELETE CASCADE/)
  })

  it('跨 schema 限定表名原样透传', () => {
    const sql = generateSQL(treeOntology)
    assert.match(sql, /CREATE TABLE IF NOT EXISTS ontology\.textbook_chapter/)
  })

  it('关联类桥表产出双外键 + 复合唯一', () => {
    const sql = generateSQL(bridgeOntology)
    assert.match(sql, /from_kp UUID UNIQUE/)
    assert.match(sql, /to_kp UUID UNIQUE/)
    assert.match(sql, /UNIQUE \(from_kp, to_kp\)/)
    assert.match(sql, /FOREIGN KEY \(from_kp\) REFERENCES edu\.knowledge_points\(id\)/)
    assert.match(sql, /FOREIGN KEY \(to_kp\) REFERENCES edu\.knowledge_points\(id\)/)
  })

  it('resolveObjectLinks 缺省 foreignKey 为 targetId 转 snake_case', () => {
    const links = resolveObjectLinks({
      links: [{ name: 'x', source: 'A', target: 'SchoolStage', cardinality: 'one' }],
    })
    assert.equal(links.length, 1)
    assert.equal(links[0].fkName, 'school_stage_id')
    assert.equal(links[0].targetTable, 'school_stage') // 无 table 覆盖时 toSnakeCase
  })

  it('resolveObjectLinks 支持 table 覆盖的 target 表名', () => {
    const links = resolveObjectLinks(
      {
        links: [{ name: 'x', source: 'A', target: 'KnowledgePoint', cardinality: 'many' }],
      },
      new Map([['KnowledgePoint', { name: 'KnowledgePoint', table: 'edu.knowledge_points' }]]),
    )
    assert.equal(links[0].targetTable, 'edu.knowledge_points')
    assert.equal(links[0].unique, false)
  })

  it('uniqueConstraintSQL 产出表内复合唯一行', () => {
    const rows = uniqueConstraintSQL({ uniqueConstraints: [['fromKp', 'toKp']] })
    assert.deepEqual(rows, ['    UNIQUE (from_kp, to_kp)'])
  })

  it('无 links 的 Object 不产出外键段（既有形态不回归）', () => {
    const sql = generateSQL({
      schemaVersion: '0.2.0',
      name: 'plain',
      objects: [{ name: 'Thing', fields: [{ name: 'name', type: 'string' }] }],
    })
    assert.doesNotMatch(sql, /FOREIGN KEY/)
    assert.match(sql, /CREATE TABLE IF NOT EXISTS thing/)
  })
})
