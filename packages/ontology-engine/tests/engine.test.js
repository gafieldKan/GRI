/**
 * @gri/ontology-engine 单元测试
 *
 * 真实消费 @gri/ontology 的「订单基类 + 三子类单表继承」样板，验证 OO 解析：
 *  - 继承解析（字段扁平化、继承链）
 *  - 抽象基类不可实例化、未实现抽象动作 fail-fast
 *  - 多态派发（同名 confirm 按子类路由到各自实现）
 *  - 单表继承建模（orders + order_type 判别列 + extra JSONB）
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { OntologyEngine, createEngine } from '../src/index.js'
import { orderOntology } from '../../ontology/src/samples/order-inheritance.js'

function makeEngine() {
  return new OntologyEngine(orderOntology)
}

describe('OntologyEngine 继承解析', () => {
  it('CateringOrder 的继承字段 = 父类 Order 字段 + 自身普通字段（不跟进 variantFields）', () => {
    const engine = makeEngine()
    const fields = engine.inheritedFields('CateringOrder')
    const names = fields.map((f) => f.name)
    // 父类字段
    assert.ok(names.includes('id'))
    assert.ok(names.includes('orderNo'))
    assert.ok(names.includes('status'))
    assert.ok(names.includes('totalAmount'))
    // variantFields（差异化字段）不应进入继承字段，它们进 extra
    assert.ok(!names.includes('restaurantId'))
    assert.ok(!names.includes('dishItems'))
  })

  it('继承链顺序为 基类 → 子类', () => {
    const engine = makeEngine()
    assert.deepEqual(engine.chain('WholesaleOrder'), ['Order', 'WholesaleOrder'])
  })

  it('抽象基类 isAbstract=true，具体子类 isAbstract=false', () => {
    const engine = makeEngine()
    assert.equal(engine.isAbstract('Order'), true)
    assert.equal(engine.isAbstract('CateringOrder'), false)
    assert.equal(engine.isAbstract('FarmOrder'), false)
  })
})

describe('OntologyEngine 抽象/接口契约', () => {
  it('抽象基类 Order 不可实例化（fail-fast）', () => {
    const engine = makeEngine()
    assert.throws(() => engine.instantiate('Order'), /抽象 Object "Order" 不可实例化/)
  })

  it('具体子类三兄弟均可实例化，且无缺失抽象动作', () => {
    const engine = makeEngine()
    for (const name of ['CateringOrder', 'FarmOrder', 'WholesaleOrder']) {
      const inst = engine.instantiate(name)
      assert.equal(inst.name, name)
      assert.ok(inst.inheritedFields.length >= 6) // 至少包含 6 个基类字段
    }
  })

  it('子类缺失抽象动作可被 missingAbstractActions 检出', () => {
    // 构造一个去掉 confirm/cancel 实现的子类
    const mutated = {
      ...orderOntology,
      objects: orderOntology.objects.map((o) =>
        o.name === 'CateringOrder'
          ? { ...o, actions: [{ name: 'confirm' }] } // 缺 cancel
          : o,
      ),
    }
    const engine = new OntologyEngine(mutated)
    assert.deepEqual(engine.missingAbstractActions('CateringOrder'), ['cancel'])
    assert.throws(() => engine.instantiate('CateringOrder'), /未实现抽象动作/)
  })
})

describe('OntologyEngine 多态派发', () => {
  it('同名 confirm 按子类路由到各自实现', () => {
    const engine = makeEngine()
    const catering = engine.dispatch('CateringOrder', 'confirm')
    const farm = engine.dispatch('FarmOrder', 'confirm')
    const wholesale = engine.dispatch('WholesaleOrder', 'confirm')

    assert.equal(catering.owner, 'CateringOrder')
    assert.equal(farm.owner, 'FarmOrder')
    assert.equal(wholesale.owner, 'WholesaleOrder')

    // 三个语义不同的实现（点餐确认 / 助农采摘 / 批发双方确认）
    assert.match(catering.action.description, /点餐/)
    assert.match(farm.action.description, /助农/)
    assert.match(wholesale.action.description, /双方/)
  })

  it('abstract 动作直接派发（父类）返回 null（无可调用实现）', () => {
    const engine = makeEngine()
    assert.equal(engine.dispatch('Order', 'confirm'), null)
  })
})

describe('OntologyEngine 单表继承建模', () => {
  it('产出 orders 表 + order_type 判别列 + extra JSONB', () => {
    const engine = makeEngine()
    const schema = engine.singleTableSchema()
    assert.equal(schema.table, 'order')
    assert.equal(schema.discriminatorColumn, 'order_type')
    assert.equal(schema.extraColumn, 'extra')
    // 基表列含 base 字段 + order_type + extra
    const colNames = schema.columns.map((c) => c.name)
    assert.ok(colNames.includes('order_type'))
    assert.ok(colNames.includes('extra'))
    assert.ok(colNames.includes('id'))
  })

  it('三个子类的判别值互不重复', () => {
    const engine = makeEngine()
    const { subclasses } = engine.singleTableInheritance()
    const values = subclasses.map((s) => s.discriminatorValue).sort()
    assert.deepEqual(values, ['catering', 'farm', 'wholesale'])
  })

  it('variantFields 从继承字段剥离、进入子类名下的 extra 语义', () => {
    const engine = makeEngine()
    const { subclasses } = engine.singleTableInheritance()
    const catering = subclasses.find((s) => s.name === 'CateringOrder')
    const variantNames = catering.variantFields.map((f) => f.name)
    assert.ok(variantNames.includes('restaurantId'))
    assert.ok(variantNames.includes('dishItems'))
  })
})

describe('createEngine 便捷工厂', () => {
  it('合法本体构建成功', () => {
    const engine = createEngine(orderOntology)
    assert.ok(engine instanceof OntologyEngine)
  })

  it('非法本体构建抛错并携带 errors 列表', () => {
    const bad = { schemaVersion: '0.1.0', name: 'x', objects: [] }
    assert.throws(
      () => createEngine(bad),
      (err) => err.errors && err.errors.length > 0,
    )
  })
})