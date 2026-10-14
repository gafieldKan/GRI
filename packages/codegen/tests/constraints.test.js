/**
 * 本体约束 → SQL 契约测试。
 *
 * 这两类约束是主数据生命周期的基础：
 *  - enum 字段必须落数据库 CHECK，避免运行时写入词表外的值
 *  - stateMachine 字段必须至少落状态闭集 CHECK，保证库侧与本体同源
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import path from 'path'
import { fileURLToPath } from 'url'
import { promises as fs } from 'fs'
import { fieldToColumn, generateSQL, loadOntologyFile } from '../src/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../../..')

const resourceOntology = {
  schemaVersion: '0.1.0',
  name: 'un-cpc-constraint-smoke',
  objects: [
    {
      name: 'Resource',
      table: 'ontology.resource',
      fields: [
        { name: 'code', type: 'string', required: true, unique: true },
        { name: 'name', type: 'string', required: true },
        {
          name: 'level',
          type: 'enum',
          required: true,
          dbCheck: true,
          values: ['section', 'division', 'group', 'class', 'subclass'],
        },
        {
          name: 'status',
          type: 'enum',
          dbDefault: "'active'",
          dbCheck: true,
          values: ['draft', 'active', 'archived'],
        },
        { name: 'twinActive', type: 'boolean', dbDefault: 'FALSE' },
      ],
      indexes: [
        { columns: ['level'], name: 'idx_resource_level' },
        { columns: ['parentId'], name: 'idx_resource_parent_id' },
      ],
      links: [
        {
          name: 'parentResource',
          source: 'Resource',
          target: 'Resource',
          cardinality: 'many',
          foreignKey: 'parentId',
        },
      ],
      stateMachine: {
        field: 'status',
        initial: 'draft',
        states: ['draft', 'active', 'archived'],
        transitions: {
          draft: ['active'],
          active: ['archived'],
          archived: [],
        },
      },
    },
  ],
}

describe('enum 字段约束', () => {
  it('fieldToColumn 仅在 dbCheck 显式开启时为 enum values 产出 CHECK 闭集', () => {
    const column = fieldToColumn({
      name: 'level',
      type: 'enum',
      required: true,
      dbCheck: true,
      values: ['section', 'division'],
    })
    assert.equal(
      column,
      "level VARCHAR(64) NOT NULL CHECK (level IN ('section', 'division'))",
    )
  })

  it('既有未声明 dbCheck 的 enum 保持历史 SQL 形态', () => {
    const column = fieldToColumn({
      name: 'kind',
      type: 'enum',
      required: true,
      values: ['system', 'session'],
    })
    assert.equal(column, 'kind VARCHAR(64) NOT NULL')
  })
})

describe('stateMachine 约束', () => {
  it('Resource 本体形态产出唯一 code、自引用 parent、状态机与 twinActive 预留列', () => {
    const sql = generateSQL(resourceOntology)
    assert.match(sql, /CREATE TABLE IF NOT EXISTS ontology\.resource \(/)
    assert.match(sql, /code VARCHAR\(255\) NOT NULL UNIQUE/)
    assert.match(
      sql,
      /level VARCHAR\(64\) NOT NULL CHECK \(level IN \('section', 'division', 'group', 'class', 'subclass'\)\)/,
    )
    assert.match(
      sql,
      /status VARCHAR\(64\) DEFAULT 'active' CHECK \(status IN \('draft', 'active', 'archived'\)\)/,
    )
    assert.match(sql, /twin_active BOOLEAN DEFAULT FALSE/)
    assert.match(sql, /parent_id UUID/)
    assert.match(sql, /FOREIGN KEY \(parent_id\) REFERENCES ontology\.resource\(id\)/)
    assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_resource_level ON ontology\.resource \(level\)/)
    assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_resource_parent_id ON ontology\.resource \(parent_id\)/)
  })
})

describe('UN CPC 资源主数据防漂移', () => {
  it('un-cpc.ontology.yaml 通过双重校验，且生成主体与 028 一致', async () => {
    const ontologyPath = path.join(
      ROOT,
      'packages/ontology/ontologies/un-cpc.ontology.yaml',
    )
    const migrationPath = path.join(
      ROOT,
      'services/api/src/migrate/028_un_cpc.sql',
    )
    const loaded = await loadOntologyFile(ontologyPath)
    assert.equal(loaded.ok, true, JSON.stringify(loaded.errors))

    const generated = generateSQL(loaded.ontology)
    const committed = await fs.readFile(migrationPath, 'utf-8')
    const stripScaffold = (sql) =>
      sql
        .split('\n')
        .filter((line) => {
          const trimmed = line.trim()
          return (
            !trimmed.startsWith('--') &&
            trimmed !== 'BEGIN;' &&
            trimmed !== 'COMMIT;' &&
            trimmed !== ''
          )
        })
        .join('\n')
    assert.equal(stripScaffold(generated), stripScaffold(committed))
  })
})
