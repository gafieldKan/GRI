# @gri/ontology

GRI 唯一语义真源 —— 本体 DSL 契约（Object/Link/Action/OO 继承）+ schema 校验。

## 定位

对应方案 §2.1「统一本体 DSL」的**契约层**。所有 `*.ontology.yaml|json` 必须先通过本包的
schema（结构）与语义（跨引用）双重校验，才能进入引擎/生成器/迁移。

## API

```js
import { OntologySchema, loadOntology, validateOntologySemantics } from '@gri/ontology'

// 结构校验（zod schema）
const parsed = OntologySchema.safeParse(ontology)

// 语义校验（extends 父类存在 / implements 动作完整 / abstract 契约 / Link 端点 / discriminator 唯一）
const { ok, errors } = validateOntologySemantics(parsed.data)

// 一站式：schema + 语义两道门禁
const result = loadOntology(ontology) // { ok:true, ontology } | { ok:false, errors }
```

## DSL 核心元素

| 元素 | 作用 | 方案 |
|---|---|---|
| `Object`（fields/abstract/extends/implements） | 领域对象，OO 抽象基类 + 子类 | §6.1/§6.2 |
| `Link`（source/target/cardinality/foreignKey） | 关系 + 基数 + 外键 | §6.1 |
| `Action`（abstract/params/transition/decorators） | 动作签名 + 抽象契约 + 状态迁移 | §6.3/§6.5 |
| `discriminator` + `variantFields` | 单表继承：判别列 + 差异化字段→JSONB | §5.1.1 |
| `stateMachine` | 生命周期（状态机，§6.5） | §6.3 |

## 样例

权威文件源：`ontologies/orders.ontology.yaml`（订单基类 + 批发/助农/点餐三子类单表继承）。

内存测试夹具 `src/samples/order-inheritance.js` 与之等价，须保持同步（由「源唯一」测试保证）。

## 测试

```bash
npm test   # node --test，12 例
```