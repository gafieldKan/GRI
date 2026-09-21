/**
 * 运行时渲染引擎
 * 基于 JSON Schema 动态渲染页面/表单，支持数据绑定和双向绑定
 *
 * @author GRI Team
 * @version 1.0
 */

import { EventEmitter } from 'events'
import { expressionEngine } from './ExpressionEngine.js'

/**
 * 渲染器类型枚举
 */
export const RendererType = {
  INPUT: 'input',
  SELECT: 'select',
  TEXTAREA: 'textarea',
  NUMBER: 'number',
  DATE: 'date',
  CHECKBOX: 'checkbox',
  RADIO: 'radio',
  SWITCH: 'switch',
  UPLOAD: 'upload',
  RICH_TEXT: 'richText',
  TABLE: 'table',
  CARD: 'card',
  BUTTON: 'button',
  TEXT: 'text',
  CONTAINER: 'container',
  GRID: 'grid',
  TABS: 'tabs',
  MODAL: 'modal',
  DRAWER: 'drawer',
}

/**
 * 数据绑定类 - 支持双向绑定
 */
export class DataBinding {
  constructor(initialData = {}, onChange) {
    this.data = new Proxy(
      { ...initialData },
      {
        set: (target, key, value) => {
          target[key] = value
          onChange?.(key, value)
          return true
        },
        get: (target, key) => {
          return target[key]
        },
      }
    )
    this.subscriptions = new Map()
    this.onChange = onChange
  }

  get(path) {
    const keys = path.split('.')
    let value = this.data
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key]
      } else {
        return undefined
      }
    }
    return value
  }

  set(path, value) {
    const keys = path.split('.')
    let current = this.data
    for (let i = 0; i < keys.length - 1; i++) {
      if (!(keys[i] in current)) {
        current[keys[i]] = {}
      }
      current = current[keys[i]]
    }
    current[keys[keys.length - 1]] = value
    this.notifySubscribers(path, value)
  }

  subscribe(path, callback) {
    if (!this.subscriptions.has(path)) {
      this.subscriptions.set(path, new Set())
    }
    this.subscriptions.get(path).add(callback)
    return () => this.unsubscribe(path, callback)
  }

  unsubscribe(path, callback) {
    const callbacks = this.subscriptions.get(path)
    if (callbacks) {
      callbacks.delete(callback)
    }
  }

  notifySubscribers(path, value) {
    const callbacks = this.subscriptions.get(path)
    if (callbacks) {
      callbacks.forEach((cb) => cb(value))
    }
    // 通知所有订阅者
    this.subscriptions.forEach((_, subPath) => {
      if (path.startsWith(subPath + '.') || subPath === path) {
        this.subscriptions.get(subPath)?.forEach((cb) => cb(this.get(subPath)))
      }
    })
  }
}

/**
 * 组件渲染配置
 */
export class RenderConfig {
  constructor(config = {}) {
    this.id = config.id || `render_${Date.now()}`
    this.type = config.type || 'container'
    this.props = config.props || {}
    this.children = config.children || []
    this.dataBindings = config.dataBindings || {}
    this.events = config.events || {}
    this.visible = config.visible ?? true
    this.disabled = config.disabled ?? false
    this.className = config.className || ''
    this.style = config.style || {}
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      props: this.props,
      children: this.children.map((c) => c.toJSON?.() || c),
      dataBindings: this.dataBindings,
      events: this.events,
      visible: this.visible,
      disabled: this.disabled,
      className: this.className,
      style: this.style,
    }
  }
}

/**
 * 运行时渲染引擎主类
 */
class RenderEngineClass extends EventEmitter {
  constructor() {
    super()
    this.componentRegistry = new Map()
    this.pageInstances = new Map()
    this.bindingCache = new Map()
    this.#registerBuiltInComponents()
  }

  /**
   * 注册内置组件
   */
  #registerBuiltInComponents() {
    // 输入框
    this.registerComponent(RendererType.INPUT, {
      render: (props, context) => ({
        type: 'input',
        props: {
          value: context?.data?.[props.field] || props.defaultValue || '',
          onChange: props.onChange,
          placeholder: props.placeholder,
          disabled: props.disabled,
          ...props,
        },
      }),
    })

    // 选择器
    this.registerComponent(RendererType.SELECT, {
      render: (props, context) => ({
        type: 'select',
        props: {
          value: context?.data?.[props.field],
          options: props.options || [],
          onChange: props.onChange,
          placeholder: props.placeholder,
          ...props,
        },
      }),
    })

    // 文本域
    this.registerComponent(RendererType.TEXTAREA, {
      render: (props, context) => ({
        type: 'textarea',
        props: {
          value: context?.data?.[props.field] || '',
          onChange: props.onChange,
          rows: props.rows || 4,
          ...props,
        },
      }),
    })

    // 数字输入
    this.registerComponent(RendererType.NUMBER, {
      render: (props, context) => ({
        type: 'input-number',
        props: {
          value: context?.data?.[props.field] || props.defaultValue || 0,
          onChange: props.onChange,
          min: props.min,
          max: props.max,
          step: props.step,
          ...props,
        },
      }),
    })

    // 日期选择
    this.registerComponent(RendererType.DATE, {
      render: (props, context) => ({
        type: 'date-picker',
        props: {
          value: context?.data?.[props.field],
          onChange: props.onChange,
          format: props.format || 'YYYY-MM-DD',
          ...props,
        },
      }),
    })

    // 复选框
    this.registerComponent(RendererType.CHECKBOX, {
      render: (props, context) => ({
        type: 'checkbox',
        props: {
          checked: context?.data?.[props.field] || false,
          onChange: props.onChange,
          label: props.label,
          ...props,
        },
      }),
    })

    // 单选框组
    this.registerComponent(RendererType.RADIO, {
      render: (props, context) => ({
        type: 'radio-group',
        props: {
          value: context?.data?.[props.field],
          options: props.options || [],
          onChange: props.onChange,
          ...props,
        },
      }),
    })

    // 开关
    this.registerComponent(RendererType.SWITCH, {
      render: (props, context) => ({
        type: 'switch',
        props: {
          checked: context?.data?.[props.field] || false,
          onChange: props.onChange,
          ...props,
        },
      }),
    })

    // 按钮
    this.registerComponent(RendererType.BUTTON, {
      render: (props, context) => ({
        type: 'button',
        props: {
          onClick: props.onClick,
          disabled: props.disabled,
          children: props.children || props.text,
          ...props,
        },
      }),
    })

    // 文本显示
    this.registerComponent(RendererType.TEXT, {
      render: (props, context) => ({
        type: 'text',
        props: {
          children: props.content || props.children,
          ...props,
        },
      }),
    })

    // 容器
    this.registerComponent(RendererType.CONTAINER, {
      render: (props, context) => ({
        type: 'div',
        props: {
          children: props.children,
          ...props,
        },
      }),
    })

    // 表格
    this.registerComponent(RendererType.TABLE, {
      render: (props, context) => ({
        type: 'table',
        props: {
          dataSource: props.dataSource || context?.data?.[props.dataField] || [],
          columns: props.columns || [],
          pagination: props.pagination,
          ...props,
        },
      }),
    })

    // 卡片
    this.registerComponent(RendererType.CARD, {
      render: (props, context) => ({
        type: 'card',
        props: {
          title: props.title,
          children: props.children,
          ...props,
        },
      }),
    })

    // 弹窗
    this.registerComponent(RendererType.MODAL, {
      render: (props, context) => ({
        type: 'modal',
        props: {
          visible: props.visible || false,
          title: props.title,
          children: props.children,
          onOk: props.onOk,
          onCancel: props.onCancel,
          ...props,
        },
      }),
    })
  }

  /**
   * 注册组件渲染器
   */
  registerComponent(type, renderer) {
    this.componentRegistry.set(type, renderer)
    this.emit('component:register', { type, renderer })
  }

  /**
   * 获取组件渲染器
   */
  getComponent(type) {
    return this.componentRegistry.get(type)
  }

  /**
   * 创建数据绑定实例
   */
  createBinding(initialData, onChange) {
    return new DataBinding(initialData, onChange)
  }

  /**
   * 解析表达式
   */
  parseExpression(expression, context = {}) {
    if (!expression) return expression
    if (typeof expression !== 'string') return expression

    // 支持 ${} 语法
    if (expression.includes('${') && expression.includes('}')) {
      return expression.replace(/\$\{([^}]+)\}/g, (_, expr) => {
        try {
          return expressionEngine.evaluate(`{{ ${expr.trim()} }}`, context)
        } catch {
          return expression
        }
      })
    }

    // 支持 {{}} 语法
    return expressionEngine.evaluate(expression, context)
  }

  /**
   * 渲染单个组件配置
   */
  renderComponent(config, context = {}) {
    const renderer = this.getComponent(config.type)
    if (!renderer) {
      console.warn(`组件未注册：${config.type}`)
      return null
    }

    try {
      return renderer.render(config.props, context)
    } catch (error) {
      console.error(`渲染组件失败：${config.type}`, error)
      return null
    }
  }

  /**
   * 渲染组件树
   */
  renderTree(config, context = {}) {
    if (!config) return null

    const rendered = this.renderComponent(config, context)
    if (!rendered) return null

    // 递归渲染子节点
    if (config.children && config.children.length > 0) {
      rendered.children = config.children
        .map((child) => this.renderTree(child, context))
        .filter(Boolean)
    }

    return rendered
  }

  /**
   * 创建页面实例
   */
  createPageInstance(pageId, schema, initialData = {}) {
    const binding = new DataBinding(initialData, (key, value) => {
      this.emit('data:change', { pageId, key, value })
    })

    const instance = {
      id: pageId,
      schema,
      binding,
      createdAt: Date.now(),
    }

    this.pageInstances.set(pageId, instance)
    this.emit('page:create', { pageId, instance })

    return instance
  }

  /**
   * 获取页面实例
   */
  getPageInstance(pageId) {
    return this.pageInstances.get(pageId)
  }

  /**
   * 销毁页面实例
   */
  destroyPageInstance(pageId) {
    const instance = this.pageInstances.get(pageId)
    if (instance) {
      this.emit('page:destroy', { pageId })
      this.pageInstances.delete(pageId)
    }
  }

  /**
   * 更新页面数据
   */
  updatePageData(pageId, path, value) {
    const instance = this.pageInstances.get(pageId)
    if (instance) {
      instance.binding.set(path, value)
    }
  }

  /**
   * 获取页面数据
   */
  getPageData(pageId, path) {
    const instance = this.pageInstances.get(pageId)
    if (instance) {
      return instance.binding.get(path)
    }
    return undefined
  }

  /**
   * 序列化页面
   */
  serializePage(pageId) {
    const instance = this.pageInstances.get(pageId)
    if (!instance) {
      throw new Error(`页面实例不存在：${pageId}`)
    }

    return {
      schema: instance.schema,
      data: instance.binding.data,
    }
  }

  /**
   * 导出页面配置
   */
  exportPage(pageId) {
    return JSON.stringify(this.serializePage(pageId), null, 2)
  }

  /**
   * 导入页面配置
   */
  importPage(pageId, json) {
    const config = JSON.parse(json)
    return this.createPageInstance(pageId, config.schema, config.data)
  }
}

// 导出单例
export const renderEngine = new RenderEngineClass()
export default renderEngine
