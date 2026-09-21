# @gri/ontology-engine

GRI 本体 OO 引擎 —— 运行时继承/多态/接口解析（消费 `@gri/ontology` DSL）。

## 定位

对应方案 §6.6「本体引擎」。契约：只做「语义真源 → 解析结果」的确定性计算，不承载
持久化/UI，供代码生成器、迁移器、后端运行时统一消费（消除各服务自造 domain 的真源分歧）。

## API

```js
import { OntologyEngine } from '@gri/ontology-engine'

const engine = new OntologyEngine(ontology) // 结构性 schema 校验（语义延后到调用点）

engine.inheritedFields('CateringOrder')   // 父类字段 ∪ 自身字段（扁平化去重）
engine.chain('WholesaleOrder')            // ['Order', 'WholesaleOrder']
engine.dispatch('FarmOrder', 'confirm')   // 多态派发 → { action, owner }
engine.isAbstract('Order')                // true
engine.instantiate('CateringOrder')       // 抽象基类抛错 / 未补全抽象动作抛错
engine.missingAbstractActions('X')        // 内省缺口（不抛错）
engine.singleTableSchema()                // { table, columns, discriminatorColumn, extraColumn }
```

## 关键语义

- **继承**：`extends` 链展开，字段扁平化（父类优先，去重）
- **抽象**：`abstract` Object 不可实例化；父类 `abstract Action` 必须被子类实现（fail-fast）
- **多态**：同名 Action 沿「最具体子类 → 基类」回溯，返回首个非抽象实现
- **单表继承**：`discriminator + variantFields` → `table + order_type + extra JSONB`

## 测试

```bash
npm test   # node --test，13 例（真实消费 orders 继承样板）
```