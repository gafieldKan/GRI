/**
 * @gri/ontology —— 本体 DSL 的权威契约（schema）
 *
 * 这是 GRI「唯一语义真源」的第三层：本体 DSL 的 JSON Schema（用 zod 表达）。
 * 所有 *.ontology.yaml|json 必须先通过本 schema 校验，才能进入引擎/生成器/迁移。
 *
 * 设计目标（对应方案 §2.1 / §6）：
 *  - Object 声明：字段/主键/校验/索引，抽象/继承/接口（§6.2）
 *  - Link 声明：关系 + 基数 + 外键映射（§6.1）
 *  - Action 声明：签名 + 抽象契约 + 状态迁移（§6.3 多态）
 *  - 单表继承：discriminator 判别列 + variantFields→JSONB extra（§5.1.1）
 *
 * 契约必须严格：任何「已定义但未被上层消费」或「extends 父类不存在」等错误，
 * 都应在 schema 层 fail-fast（对应 AI 五道门禁之第 1 道：DSL schema 校验）。
 */

import { z } from 'zod'

/**
 * 字段类型枚举 —— 覆盖「模型先全」的常用标量类型。
 * 生成器将据此把 Object.fields 映射为数据库列与 TS/Vue 类型（§5.1）。
 */
export const FieldType = z.enum([
  'string',
  'text',
  'integer',
  'number',
  'boolean',
  'uuid',
  'date',
  'datetime',
  'json',
  'enum',
  'array',
])

/**
 * 基数约束（Link 的 multiplicity）。
 * 生成器把一对一映射为 UNIQUE 外键，一对多映射为普通外键 + 索引（§6.1）。
 */
export const Cardinality = z.enum(['one', 'many'])

/**
 * 字段声明。abstract 字段继承共用；子类差异化字段进 variantFields。
 */
export const FieldSchema = z.object({
  name: z.string().min(1),
  type: FieldType,
  description: z.string().optional(),
  required: z.boolean().optional().default(false),
  unique: z.boolean().optional(),
  index: z.boolean().optional(),
  default: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  // 数据库默认值（原始 SQL 表达式，如 CURRENT_TIMESTAMP / gen_random_uuid()），
  // 与 default 互斥：default 是「字面量」会被加引号，dbDefault 是「表达式」原样输出。
  dbDefault: z.string().optional(),
  // enum 类型的取值闭集
  values: z.array(z.string()).optional(),
  // 是否把 enum values 落到数据库 CHECK；默认关闭以保持既有迁移的 SQL 形态稳定
  dbCheck: z.boolean().optional(),
  // 校验规则（生成器/引擎据此产出运行时校验，如 min/max/正则）
  validation: z
    .object({
      min: z.number().optional(),
      max: z.number().optional(),
      pattern: z.string().optional(),
    })
    .optional(),
})

/**
 * Link 声明：两个 Object 之间带语义的关系。
 * - source / target：关系两端（Object 名）
 * - name：关系语义名（如 belongsTo / reportingTo）
 * - cardinality：source 侧一个实例关联 target 多少个实例
 * - foreignKey：落到 source 表上的外键列名（缺省为 `${target}Id`）
 * - onDelete：外键删除行为（cascade/set null/restrict）。缺省：cardinality
 *   'one' 沿用历史语义（UNIQUE 外键 → ON DELETE CASCADE），'many' 不级联。
 */
export const LinkSchema = z.object({
  name: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  cardinality: Cardinality.optional().default('many'),
  foreignKey: z.string().optional(),
  required: z.boolean().optional().default(false),
  onDelete: z.enum(['cascade', 'set null', 'restrict']).optional(),
  description: z.string().optional(),
})

/**
 * 索引声明（Object 级，落普通表/单表均可）。
 * - columns：列名数组；每项可为 "col" 或 "col DESC"（排序方向原样保留，
 *   列名部分转 snake_case）
 * - name：索引名（缺省按 `idx_<table>_<cols>` 推导）
 * - unique：唯一索引
 * - where：部分索引谓词（原样 SQL 片段，如 `kind = 'action'`）
 */
export const IndexSchema = z.object({
  columns: z.array(z.string().min(1)).min(1),
  name: z.string().optional(),
  unique: z.boolean().optional(),
  where: z.string().optional(),
})

/**
 * Action 声明：对象动作签名 + 抽象契约 + 状态迁移。
 * - abstract: 基类声明、子类必须实现的契约（§6.2 接口/抽象）
 * - transition: 触发状态迁移（源状态 → 目标状态），交给状态机（§6.5 状态模式）
 * - decorators: 能力装饰器挂载点（§6.5 装饰器模式；解析器留位 §3.4）
 * - params/returns: 动作签名（生成 API 端点与前端按钮）
 */
export const ActionSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  // 抽象动作：基类只声明、子类必实现；也可用 interface 表达
  abstract: z.boolean().optional().default(false),
  // 关联了 interface 才有接口语义
  interface: z.string().optional(),
  params: z
    .array(
      z.object({
        name: z.string().min(1),
        type: FieldType,
        required: z.boolean().optional().default(false),
        description: z.string().optional(),
      }),
    )
    .optional(),
  returns: FieldType.optional(),
  // 状态机迁移：from 状态数组 + to 目标状态
  transition: z
    .object({
      from: z.array(z.string()),
      to: z.string(),
    })
    .optional(),
  // 能力装饰器挂载点（§7.2；未注册维度运行时为 no-op）
  decorators: z.array(z.string()).optional(),
})

/**
 * 状态机声明：对象生命周期（§6.5 状态模式）。
 * 用于生成校验迁移合法性的运行时状态机，以及迁移 SQL 中的 status 约束。
 */
export const StateMachineSchema = z.object({
  field: z.string().optional().default('status'),
  initial: z.string(),
  states: z.array(z.string()),
  transitions: z.record(z.array(z.string())),
}).superRefine((sm, ctx) => {
  // initial 必须在 states 内；transitions 的键与值也必须在 states 内
  if (!sm.states.includes(sm.initial)) {
    ctx.addIssue({ code: 'custom', message: `initial 状态 "${sm.initial}" 不在 states 中` })
  }
  for (const [from, tos] of Object.entries(sm.transitions)) {
    if (!sm.states.includes(from)) {
      ctx.addIssue({ code: 'custom', message: `transitions 的源状态 "${from}" 不在 states 中` })
    }
    for (const to of tos) {
      if (!sm.states.includes(to)) {
        ctx.addIssue({ code: 'custom', message: `transitions 的目标状态 "${to}" 不在 states 中` })
      }
    }
  }
})

/**
 * 接口声明：一组抽象 Action 契约（§6.2 接口）。
 * Object 用 implements 引用它；本体引擎在运行时校验实现完整性。
 */
export const InterfaceSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  actions: z.array(z.string()).min(1),
})

/**
 * Object 声明：本体核心元素（§6.1）。
 * - abstract：抽象基类不可实例化（§6.2）
 * - extends：继承父 Object（单表继承时落到同一张表 + discriminator）
 * - implements：实现的接口（引擎校验 action 完整性）
 * - fields：字段声明（继承父类字段，子类补差异化字段）
 * - variantFields：子类差异化字段 → 单表继承的 JSONB extra（§5.1.1）
 * - uniqueConstraints：复合唯一约束（关联类/桥表场景，如前置依赖的
 *   UNIQUE(from_kp, to_kp)）；列名须在本 Object fields ∪ Link foreignKey 内
 */
const ObjectSchemaBase = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  // 物理表名（可选，支持 schema 限定名如 "edu.knowledge_points"）。缺省由生成器按
  // name → snake_case 推导；当逻辑名与既有表名冲突（如 Order→order 已被点餐表占用）
  // 时显式覆盖。
  table: z.string().optional(),
  abstract: z.boolean().optional().default(false),
  extends: z.string().optional(),
  implements: z.array(z.string()).optional(),
  discriminator: z.object({
    field: z.string().default('type'),
    value: z.string(),
  }).optional(),
  fields: z.array(FieldSchema).default([]),
  variantFields: z.array(FieldSchema).optional(),
  uniqueConstraints: z.array(z.array(z.string()).min(1)).optional(),
  indexes: z.array(IndexSchema).optional(),
  links: z.array(LinkSchema).default([]),
  actions: z.array(ActionSchema).default([]),
  stateMachine: StateMachineSchema.optional(),
})

export const ObjectSchema = ObjectSchemaBase

/**
 * 孪生部件声明：孪生体的一个面（身份/状态/世界/经历/记忆/关系…）。
 * - name：部件名（profile/state/world/events/memories/relations/settings…）
 * - source：真源描述（自由文本：服务/表/装配函数），说明「这一面从哪来」
 * - object：关联的本体 Object（如经历面 → TwinEvent）；须在 objects 中声明
 */
export const TwinPartSchema = z.object({
  name: z.string().min(1),
  source: z.string().optional(),
  object: z.string().optional(),
  description: z.string().optional(),
})

/**
 * 孪生动词声明：世界里的行动（闭集）——「行动 → 经历」的挂钩面。
 */
export const TwinVerbSchema = z.object({
  verb: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
})

/**
 * 孪生声明（顶层层级，与 objects/links/interfaces 并列）。
 *
 * 「本体 → 孪生」的通用机制：每一个本体都可以生成对应的数字孪生——
 *   - entity：所孪生的「人/主本体」Object（人本论：人本体是孪生的锚）
 *   - world：世界（场景/节点）来源 Object（如 KnowledgeArea）
 *   - parts：孪生的六面（身份/状态/世界/经历/记忆/…）及各自真源
 *   - verbs：世界里的行动闭集
 *
 * 一期先跑通「学生孪生」垂直（student-twin.ontology.yaml）；本 schema 是
 * 由 vertical 泛化为通用机制的形式化载体（双锚点 + 孪生锚点防漂移）。
 */
export const TwinSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  entity: z.string().min(1),
  world: z.string().optional(),
  parts: z.array(TwinPartSchema).default([]),
  verbs: z.array(TwinVerbSchema).default([]),
})

/**
 * 完整本体文档：schema 版本 + Object 集合 + Link 集合 + Interface 集合 + 孪生集合。
 */
export const OntologySchema = z.object({
  // DSL 版本化（§2.1：向后兼容的关键）
  schemaVersion: z.string().default('0.1.0'),
  name: z.string().min(1),
  description: z.string().optional(),
  interfaces: z.array(InterfaceSchema).default([]),
  objects: z.array(ObjectSchema).min(1),
  links: z.array(LinkSchema).default([]),
  // 孪生声明（可选，additive；「本体 → 孪生」的通用机制载体）
  twins: z.array(TwinSchema).default([]),
})

export const validateOntologySchema = (data) => OntologySchema.parse(data)

export default OntologySchema
