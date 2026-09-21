/**
 * 组件引擎
 * 负责组件的注册、渲染、属性管理和事件处理
 */

import { EventEmitter } from 'events'

// 组件分类
export const ComponentCategory = {
  BASIC: 'basic', // 基础组件
  FORM: 'form', // 表单组件
  LAYOUT: 'layout', // 布局组件
  DISPLAY: 'display', // 展示组件
  FEEDBACK: 'feedback', // 反馈组件
  CUSTOM: 'custom', // 自定义组件
}

// 组件定义
export class ComponentDef {
  constructor(config) {
    this.id = config.id
    this.name = config.name
    this.type = config.type
    this.category = config.category || ComponentCategory.BASIC
    this.icon = config.icon
    this.description = config.description
    this.props = config.props || {}
    this.defaultProps = config.defaultProps || {}
    this.events = config.events || []
    this.slots = config.slots || []
    this.render = config.render
  }
}

class ComponentEngineClass extends EventEmitter {
  constructor() {
    super()
    this.components = new Map()
    this.componentByCategory = new Map()
    this.registeredTypes = new Set()
  }

  /**
   * 注册组件类型
   */
  registerComponent(componentDef) {
    if (!componentDef.id || !componentDef.type) {
      throw new Error('组件必须有 id 和 type')
    }

    const def = componentDef instanceof ComponentDef ? componentDef : new ComponentDef(componentDef)

    this.components.set(def.id, def)
    this.registeredTypes.add(def.type)

    // 按分类索引
    if (!this.componentByCategory.has(def.category)) {
      this.componentByCategory.set(def.category, [])
    }
    this.componentByCategory.get(def.category).push(def.id)

    this.emit('component:registered', def)
    return this
  }

  /**
   * 获取组件定义
   */
  getComponent(componentId) {
    return this.components.get(componentId)
  }

  /**
   * 按类型获取组件
   */
  getByType(type) {
    return Array.from(this.components.values()).filter((c) => c.type === type)
  }

  /**
   * 按分类获取组件
   */
  getByCategory(category) {
    const ids = this.componentByCategory.get(category) || []
    return ids.map((id) => this.components.get(id)).filter(Boolean)
  }

  /**
   * 获取所有分类
   */
  getCategories() {
    return Array.from(this.componentByCategory.keys())
  }

  /**
   * 获取所有组件
   */
  getAllComponents() {
    return Array.from(this.components.values())
  }

  /**
   * 注册组件类型别名
   */
  registerAlias(_alias, type) {
    this.registeredTypes.add(alias)
    return this
  }

  /**
   * 移除组件
   */
  removeComponent(componentId) {
    const component = this.components.get(componentId)
    if (component) {
      this.components.delete(componentId)
      this.componentByCategory
        .get(component.category)
        ?.splice(this.componentByCategory.get(component.category).indexOf(componentId), 1)
      this.emit('component:removed', { componentId })
    }
    return this
  }

  /**
   * 清空所有组件
   */
  clear() {
    this.components.clear()
    this.componentByCategory.clear()
    this.registeredTypes.clear()
    this.emit('cleared')
  }
}

// 导出单例
export const componentEngine = new ComponentEngineClass()

export default componentEngine
