/**
 * @gri/ontology DSL 契约 + 语义校验单元测试
 *
 * 对应方案 §2.1 / §2.5：本体 DSL 的 schema 与跨引用语义必须可运行、可断言。
 * 覆盖：
 *  1) schema 结构校验（合法本体通过、结构错误被拦截）
 *  2) 语义校验（extends 父类缺失 / implements 动作缺失 / 抽象动作未实现 /
 *     Link 端点缺失 / discriminator 重复）
 *  3) 订单继承样板本体的真实有效性与继承关系
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { OntologySchema, loadOntology, validateOntologySemantics } from '../src/index.js'
import { orderOntology } from '../src/samples/order-inheritance.js'

describe('OntologySchema 结构校验', () => {
  it('订单继承样板通过 schema 校验', () => {
    const parsed = OntologySchema.safeParse(orderOntology)
    assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues ?? null))
    assert.equal(parsed.data.objects.length, 5) // User + Order + 3 子类
  })

  it('缺 objects（空数组）被拦截', () => {
    const parsed = OntologySchema.safeParse({ schemaVersion: '0.1.0', name: 'x', objects: [] })
    assert.equal(parsed.success, false)
  })

  it('字段类型非法被拦截', () => {
    const bad = {
      ...orderOntology,
      objects: [{ name: 'X', fields: [{ name: 'a', type: 'not-a-type' }] }],
    }
    const parsed = OntologySchema.safeParse(bad)
    assert.equal(parsed.success, false)
  })

  it('状态机 initial 不在 states 被拦截', () => {
    const bad = {
      ...orderOntology,
      objects: [
        {
          name: 'X',
          stateMachine: { initial: 'foo', states: ['bar'], transitions: { bar: [] } },
        },
      ],
    }
    const parsed = OntologySchema.safeParse(bad)
    assert.equal(parsed.success, false)
  })
})

describe('validateOntologySemantics 语义校验', () => {
  it('合法本体语义通过', () => {
    const parsed = OntologySchema.parse(orderOntology)
    const r = validateOntologySemantics(parsed)
    assert.equal(r.ok, true, JSON.stringify(r.errors))
  })

  it('extends 父类不存在被拦截', () => {
    const parsed = OntologySchema.parse({
      ...orderOntology,
      objects: [{ name: 'A', extends: 'NonExistent' }],
    })
    const r = validateOntologySemantics(parsed)
    assert.equal(r.ok, false)
    assert.ok(r.errors.some((e) => /父 Object/.test(e.message)))
  })

  it('implements 接口动作缺失被拦截', () => {
    // CateringOrder 实现 Confirmable（动作 confirm）→ 去掉 confirm 应报错
    const parsed = OntologySchema.parse({
      ...orderOntology,
      objects: orderOntology.objects.map((o) =>
        o.name === 'CateringOrder'
          ? { ...o, actions: [{ name: 'cancel' }] } // 缺 confirm
          : o,
      ),
    })
    const r = validateOntologySemantics(parsed)
    assert.equal(r.ok, false)
    assert.ok(r.errors.some((e) => /缺少动作实现 "confirm"/.test(e.message)))
  })

  it('子类未实现父类抽象动作被拦截', () => {
    // Order 声明 abstract confirm/cancel → 子类只实现 confirm，缺 cancel
    const parsed = OntologySchema.parse({
      ...orderOntology,
      objects: orderOntology.objects.map((o) =>
        o.extends === 'Order'
          ? { ...o, actions: o.actions.filter((a) => a.name !== 'cancel') }
          : o,
      ),
    })
    const r = validateOntologySemantics(parsed)
    assert.equal(r.ok, false)
    assert.ok(r.errors.some((e) => /未实现父类抽象动作 "cancel"/.test(e.message)))
  })

  it('Link 端点缺失被拦截', () => {
    const parsed = OntologySchema.parse({
      ...orderOntology,
      links: [{ name: 'x', source: 'Order', target: 'NonExistentTarget' }],
    })
    const r = validateOntologySemantics(parsed)
    assert.equal(r.ok, false)
    assert.ok(r.errors.some((e) => /target "NonExistentTarget" 不存在/.test(e.message)))
  })

  it('discriminator 判别值重复被拦截', () => {
    const parsed = OntologySchema.parse({
      ...orderOntology,
      objects: orderOntology.objects.map((o) =>
        o.name === 'FarmOrder'
          ? { ...o, discriminator: { field: 'order_type', value: 'catering' } } // 与 CateringOrder 重复
          : o,
      ),
    })
    const r = validateOntologySemantics(parsed)
    assert.equal(r.ok, false)
    assert.ok(r.errors.some((e) => /判别值 "catering" 与 Object "CateringOrder" 重复/.test(e.message)))
  })

  it('indexes 引用不存在的列被拦截', () => {
    const parsed = OntologySchema.parse({
      schemaVersion: '0.5.0',
      name: 'x',
      objects: [{ name: 'A', fields: [{ name: 'a', type: 'string' }], indexes: [{ columns: ['ghost'] }] }],
    })
    const r = validateOntologySemantics(parsed)
    assert.equal(r.ok, false)
    assert.ok(r.errors.some((e) => /索引列 "ghost"/.test(e.message)))
  })

  it('indexes 可用 "col DESC" 且命中字段列', () => {
    const parsed = OntologySchema.parse({
      schemaVersion: '0.5.0',
      name: 'x',
      objects: [{ name: 'A', fields: [{ name: 'at', type: 'datetime' }], indexes: [{ columns: ['at DESC'] }] }],
    })
    const r = validateOntologySemantics(parsed)
    assert.equal(r.ok, true, JSON.stringify(r.errors))
  })

  it('twins 默认 []（additive，旧本体零影响）', () => {
    const parsed = OntologySchema.parse(orderOntology)
    assert.deepEqual(parsed.twins, [])
  })

  it('twins 部件引用不存在的 Object 被拦截', () => {
    const parsed = OntologySchema.parse({
      schemaVersion: '0.5.0',
      name: 'x',
      objects: [{ name: 'A', fields: [] }],
      twins: [{ name: 'T', entity: 'A', parts: [{ name: 'events', object: 'Ghost' }] }],
    })
    const r = validateOntologySemantics(parsed)
    assert.equal(r.ok, false)
    assert.ok(r.errors.some((e) => /孪生部件 "events"/.test(e.message)))
  })
})

describe('loadOntology 一站式校验', () => {
  it('合法本体返回 { ok:true, ontology }', () => {
    const r = loadOntology(orderOntology)
    assert.equal(r.ok, true)
    assert.equal(r.ontology.objects.length, 5)
  })

  it('结构错误返回统一 errors 列表', () => {
    const r = loadOntology({ schemaVersion: '0.1.0', name: 'x', objects: [] })
    assert.equal(r.ok, false)
    assert.ok(Array.isArray(r.errors))
    assert.ok(r.errors.length > 0)
    assert.ok(r.errors.every((e) => typeof e.message === 'string'))
  })
})