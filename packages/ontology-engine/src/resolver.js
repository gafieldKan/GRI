/**
 * @gri/ontology-engine —— 继承解析器
 *
 * 把本体 DSL 的 `extends` 关系展开成「扁平化」的字段表，供生成器与运行时消费：
 *  - 单表继承（§5.1.1）：子类字段 = 父类字段 ∪ 子类自身字段，差异化字段进 variantFields
 *  - 子类通过 discriminator 落到父类同一张表，variantFields → JSONB extra
 *  - 抽象动作契约沿继承链向下传递（§6.2）
 */

/**
 * 沿 extends 链展开某个 Object 的完整（继承）字段集。
 * 返回顺序：父类字段在前，子类自身字段在后（符合单表继承的列序）。
 *
 * @param {string} objectName 起点 Object 名
 * @param {Map<string,object>} objByName Object 名 → Object（须含 .extends/.fields/.variantFields）
 * @param {Map<string,string>} [discriminators] 记录每个 object 的判别值（用于去重校验）
 * @returns {Array} 扁平化字段列表（含父类字段 + 子类普通字段）
 */
export function resolveInheritedFields(objectName, objByName) {
  const chain = inheritanceChain(objectName, objByName)
  const seen = new Set()
  const fields = []
  for (const obj of chain) {
    for (const field of obj.fields ?? []) {
      if (!seen.has(field.name)) {
        seen.add(field.name)
        fields.push(field)
      }
    }
  }
  return fields
}

/**
 * 返回从「最顶层基类」到「目标 object」的继承链（含目标自身）。
 * 已在语义校验层保证父类存在，这里防御性跳过缺失父类。
 *
 * @param {string} objectName
 * @param {Map<string,object>} objByName
 * @param {Set<string>} [visited] 防环
 * @returns {object[]}
 */
export function inheritanceChain(objectName, objByName, visited = new Set()) {
  if (visited.has(objectName)) return [objByName.get(objectName)].filter(Boolean)
  visited.add(objectName)
  const obj = objByName.get(objectName)
  if (!obj) return []
  const parents = obj.extends ? inheritanceChain(obj.extends, objByName, visited) : []
  return [...parents, obj]
}

/**
 * 搜集某 Object 继承链上所有「抽象动作」（父类 abstract action 需子类实现的契约）。
 *
 * @param {string} objectName
 * @param {Map<string,object>} objByName
 * @returns {{ name: string }[]}
 */
export function collectAbstractActions(objectName, objByName) {
  const chain = inheritanceChain(objectName, objByName)
  const acc = []
  for (const obj of chain) {
    for (const action of obj.actions ?? []) {
      if (action.abstract) acc.push(action)
    }
  }
  return acc
}

/**
 * 解析继承链上某动作的「最终实现」——多态派发的核心（§6.3）。
 *
 * 规则：从最具体类（目标 object）向上回溯，返回第一个非 abstract 的同名动作；
 * 若整条链都未实现（仍 abstract），返回 null 表示该动作在该子类语义下不可调用。
 *
 * @param {string} objectName
 * @param {string} actionName
 * @param {Map<string,object>} objByName
 * @returns {object|null}
 */
export function resolveActionImplementation(objectName, actionName, objByName) {
  // 从最具体到最抽象（反转继承链）
  const chain = inheritanceChain(objectName, objByName).reverse()
  for (const obj of chain) {
    const action = (obj.actions ?? []).find((a) => a.name === actionName)
    if (action && !action.abstract) return { action, owner: obj.name }
  }
  return null
}

export default {
  resolveInheritedFields,
  inheritanceChain,
  collectAbstractActions,
  resolveActionImplementation,
}