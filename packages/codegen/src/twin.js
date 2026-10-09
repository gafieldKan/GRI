/**
 * @gri/codegen —— 孪生描述符生成器
 *
 * 消费本体 DSL 顶层的 `twins:` 段，确定性产出「孪生描述符」JSON。
 * 这是「本体 → 数字孪生」通用机制的编译期产物：把「一个人的本体」编译成
 * 运行时可装配的孪生结构（六面 + 世界节点 + 行动闭集），供前端/后端共享。
 *
 * 纯函数 f(DSL) → JSON 字符串（键序确定、可审阅、可回滚、可测试）。
 */

/**
 * 生成孪生描述符对象（未序列化，便于测试断言）。
 * @param {object} ontology 已校验本体（含 twins）
 * @returns {{ schemaVersion: string, ontology: string, twins: Array<object> }}
 */
export function buildTwinDescriptor(ontology) {
  const twins = (ontology.twins ?? []).map((t) => ({
    name: t.name,
    description: t.description ?? null,
    entity: t.entity,
    world: t.world ?? null,
    parts: (t.parts ?? []).map((p) => ({
      name: p.name,
      source: p.source ?? null,
      object: p.object ?? null,
      description: p.description ?? null,
    })),
    verbs: (t.verbs ?? []).map((v) => ({
      verb: v.verb,
      title: v.title,
      description: v.description ?? null,
    })),
  }))
  return {
    schemaVersion: ontology.schemaVersion ?? '0.1.0',
    ontology: ontology.name,
    twins,
  }
}

/**
 * 生成孪生描述符 JSON 字符串（供写入产物文件）。
 * @param {object} ontology
 */
export function generateTwinDescriptor(ontology) {
  return JSON.stringify(buildTwinDescriptor(ontology), null, 2) + '\n'
}

export default { generateTwinDescriptor, buildTwinDescriptor }
