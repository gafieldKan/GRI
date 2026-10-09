/**
 * @gri/codegen 契约测试
 *
 * 断言生成器的「确定性输出」：DSL → SQL / TS 的结构可审阅、可回滚、可测试。
 * 采用结构断言（关键列/声明存在），保证生成器骨架漂移能被立即捕获（§2.5 契约测试）。
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  generate,
  generateSQL,
  generateTypeScript,
  fieldToColumn,
  toSnakeCase,
} from '../src/index.js'
import { orderOntology } from '../../ontology/src/samples/order-inheritance.js'

describe('SQL 生成器', () => {
  it('单表继承产出 orders 表（非三表平铺）', () => {
    const sql = generateSQL(orderOntology)
    assert.match(sql, /CREATE TABLE IF NOT EXISTS order\b/)
    // 不应出现三张独立表
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS (catering_order|farm_order|wholesale_order)/)
  })

  it('含 order_type 判别列 + extra JSONB', () => {
    const sql = generateSQL(orderOntology)
    assert.match(sql, /order_type VARCHAR\(32\) NOT NULL/)
    assert.match(sql, /extra JSONB/)
  })

  it('基类字段列名转 snake_case，与现有迁移约定一致', () => {
    const sql = generateSQL(orderOntology)
    assert.match(sql, /order_no VARCHAR/)
    assert.match(sql, /total_amount NUMERIC/)
    assert.match(sql, /created_at TIMESTAMPTZ/)
    assert.match(sql, /updated_at TIMESTAMPTZ/)
  })

  it('为判别列建索引', () => {
    const sql = generateSQL(orderOntology)
    assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_order_order_type ON order \(order_type\)/)
  })
})

describe('TypeScript 生成器', () => {
  it('产出基类 + 判别联合类型', () => {
    const ts = generateTypeScript(orderOntology)
    assert.match(ts, /export interface OrderBase/)
    assert.match(ts, /export type Order = CateringOrder \| FarmOrder \| WholesaleOrder/)
  })

  it('判别列是 string 类型', () => {
    const ts = generateTypeScript(orderOntology)
    assert.match(ts, /order_type: string;/)
  })

  it('子类差异化字段进入各自 Extra 类型', () => {
    const ts = generateTypeScript(orderOntology)
    assert.match(ts, /export interface WholesaleOrderExtra/)
    assert.match(ts, /tradeTerm\?: string;/)
    assert.match(ts, /export interface CateringOrderExtra/)
    assert.match(ts, /restaurantId\?: string;/)
  })
})

describe('fieldToColumn 字段→列映射', () => {
  it('required + unique 正确产出 NOT NULL UNIQUE', () => {
    const col = fieldToColumn({ name: 'orderNo', type: 'string', required: true, unique: true })
    assert.equal(col, 'order_no VARCHAR(255) NOT NULL UNIQUE')
  })

  it('number 类型映射为 NUMERIC(14,2)', () => {
    const col = fieldToColumn({ name: 'totalAmount', type: 'number', required: true })
    assert.equal(col, 'total_amount NUMERIC(14, 2) NOT NULL')
  })

  it('toSnakeCase 正确转换 camelCase', () => {
    assert.equal(toSnakeCase('WholesaleOrder'), 'wholesale_order')
    assert.equal(toSnakeCase('orderNo'), 'order_no')
  })
})

describe('generate 编排', () => {
  it('默认生成 sql + typescript + twin 三轨', () => {
    const out = generate(orderOntology)
    assert.deepEqual(Object.keys(out).sort(), ['sql', 'twin', 'typescript'])
    assert.ok(out.sql.length > 0)
    assert.ok(out.typescript.length > 0)
    assert.ok(out.twin.length > 0)
  })

  it('可指定单一轨', () => {
    const out = generate(orderOntology, ['sql'])
    assert.deepEqual(Object.keys(out), ['sql'])
  })

  it('未注册轨抛错', () => {
    assert.throws(() => generate(orderOntology, ['nope']), /未注册的生成轨/)
  })
})