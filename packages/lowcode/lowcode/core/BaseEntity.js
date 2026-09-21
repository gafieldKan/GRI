/**
 * GRI 平台基础实体类
 * 所有业务实体的基类，提供封装、继承、钩子等基础能力
 * 遵循：封装性、继承性、多态性原则
 *
 * @author GRI Team
 * @version 2.0
 */

import { EventEmitter } from 'events'
import { TypeValidator, ValidationError } from './TypeValidator.js'
import { EntityState } from './Constants.js'

/**
 * 钩子管理器
 * 管理生命周期钩子的注册和触发
 */
export class HookManager extends EventEmitter {
  #hooks = new Map()
  #registered = false

  constructor() {
    super()
    this.#hooks = new Map()
    this.#registered = false
    this.#registerDefaultHooks()
  }

  /**
   * 注册默认钩子
   */
  #registerDefaultHooks() {
    if (this.#registered) return

    const defaultHooks = [
      'beforeCreate',
      'afterCreate',
      'beforeUpdate',
      'afterUpdate',
      'beforeDelete',
      'afterDelete',
      'beforeValidate',
      'afterValidate',
      'beforeSave',
      'afterSave',
      'beforeLoad',
      'afterLoad',
    ]

    defaultHooks.forEach((name) => {
      this.#hooks.set(name, [])
    })
    this.#registered = true
  }

  /**
   * 注册钩子
   * @param {string} name - 钩子名称
   * @param {Function} callback - 回调函数
   * @param {number} priority - 优先级（数字越大越先执行）
   * @throws {ValidationError} 参数验证失败时抛出
   */
  register(name, callback, priority = 0) {
    // 类型验证
    try {
      TypeValidator.validateString(name, 'name')
      TypeValidator.validateFunction(callback, 'callback')
      TypeValidator.validateNumber(priority, 'priority')
    } catch (error) {
      throw new ValidationError('HookManager.register', 'valid parameters', error.message)
    }

    if (!this.#hooks.has(name)) {
      this.#hooks.set(name, [])
    }
    const hooks = this.#hooks.get(name)
    hooks.push({ callback, priority })
    // 按优先级降序排序
    hooks.sort((a, b) => b.priority - a.priority)
    return this
  }

  /**
   * 触发钩子
   * @param {string} name - 钩子名称
   * @param {Object} context - 上下文
   * @throws {ValidationError} 参数验证失败时抛出
   */
  async trigger(name, context = {}) {
    // 类型验证
    try {
      TypeValidator.validateString(name, 'name')
    } catch (error) {
      throw new ValidationError('HookManager.trigger', 'valid name', error.message)
    }

    const hooks = this.#hooks.get(name)
    if (!hooks) return

    for (const { callback } of hooks) {
      try {
        await callback(context)
      } catch (error) {
        console.error(`Hook ${name} execution error:`, error)
        throw error
      }
    }
  }

  /**
   * 触发同步钩子
   * @param {string} name - 钩子名称
   * @param {Object} context - 上下文
   */
  triggerSync(name, context = {}) {
    // 类型验证
    try {
      TypeValidator.validateString(name, 'name')
    } catch (error) {
      throw new ValidationError('HookManager.triggerSync', 'valid name', error.message)
    }

    const hooks = this.#hooks.get(name)
    if (!hooks) return

    for (const { callback } of hooks) {
      try {
        callback(context)
      } catch (error) {
        console.error(`Hook ${name} execution error:`, error)
        throw error
      }
    }
  }

  /**
   * 清空钩子
   */
  clear() {
    this.#hooks.clear()
    this.#registerDefaultHooks()
    return this
  }

  /**
   * 获取钩子数量
   * @returns {number} 钩子总数
   */
  getHookCount() {
    let count = 0
    for (const hooks of this.#hooks.values()) {
      count += hooks.length
    }
    return count
  }
}

/**
 * 基础实体类
 * 所有业务实体的基类，提供封装、继承、钩子等基础能力
 *
 * 设计原则：
 * - 封装性：所有内部字段使用私有字段 # 前缀
 * - 继承性：支持子类 extends 扩展
 * - 多态性：支持方法重写和动态绑定
 */
export class BaseEntity {
  /**
   * 私有字段（封装性）
   */
  #id = ''
  #createdAt = 0
  #updatedAt = 0
  #status = ''
  #metadata = {}
  #accessLog = []
  #hookManager = null

  /**
   * 构造函数
   * @param {Object} config - 配置对象
   * @throws {ValidationError} 配置验证失败时抛出
   */
  constructor(config = {}) {
    // 参数验证
    if (config !== undefined && typeof config !== 'object') {
      throw new ValidationError('config', 'object or undefined', typeof config)
    }

    // ID 验证
    if (config.id !== undefined) {
      try {
        TypeValidator.validateId(config.id, 'config.id')
      } catch (error) {
        throw new ValidationError('config.id', 'valid id', error.message)
      }
    }

    this.#id = config.id || this.#generateId()
    this.#createdAt = config.createdAt || Date.now()
    this.#updatedAt = config.updatedAt || Date.now()

    // 状态验证 - 修复：正确保存传入的有效状态值
    if (config.status !== undefined && config.status !== '') {
      try {
        TypeValidator.validateEnum(config.status, EntityState, 'config.status')
        this.#status = config.status
      } catch {
        this.#status = 'active'
      }
    } else {
      this.#status = 'active'
    }

    this.#hookManager = new HookManager()

    // 深拷贝元数据
    if (config.metadata) {
      this.#metadata = { ...config.metadata }
    }
  }

  /**
   * 生成唯一 ID
   * @private
   * @returns {string} 唯一 ID
   */
  #generateId() {
    return `ent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  // ==================== Getter/Setter（封装性）====================

  get id() {
    return this.#id
  }
  get createdAt() {
    return this.#createdAt
  }
  get updatedAt() {
    return this.#updatedAt
  }
  get status() {
    return this.#status
  }
  get metadata() {
    return { ...this.#metadata }
  }
  get hookManager() {
    return this.#hookManager
  }

set status(value) {
  const oldValue = this.#status
  this.#beforeChange('status', oldValue, value)
  this.#status = value
  this.#updatedAt = Date.now()
  this.#afterChange('status', value)
  // 触发 beforeUpdate 和 afterUpdate 钩子
  this.#hookManager.triggerSync('beforeUpdate', { field: 'status', oldValue, newValue: value })
  this.#hookManager.triggerSync('afterUpdate', { field: 'status', oldValue, newValue: value })
}

  // ==================== 钩子管理 ====================

  /**
   * 注册钩子
   * @param {string} name - 钩子名称
   * @param {Function} callback - 回调函数
   * @param {number} priority - 优先级
   */
  on(name, callback, priority) {
    this.#hookManager.register(name, callback, priority)
    return this
  }

  /**
   * 触发钩子
   * @param {string} name - 钩子名称
   * @param {Object} context - 上下文
   */
  async triggerHook(name, context = {}) {
    await this.#hookManager.trigger(name, context)
  }

  // ==================== 生命周期钩子（子类可重写）====================

  /**
   * 字段变更前钩子
   * @param {string} field - 字段名
   * @param {*} oldValue - 旧值
   * @param {*} newValue - 新值
   */
  #beforeChange(field, oldValue, newValue) {
    // 子类可重写
  }

  /**
   * 字段变更后钩子
   * @param {string} field - 字段名
   * @param {*} value - 值
   */
  #afterChange(field, value) {
    // 子类可重写
  }

  // ==================== 状态管理 ====================

  /**
   * 激活实体
   * @throws {ValidationError} 状态变更失败时抛出
   */
  activate() {
    this.#logAccess('activate')
    this.#status = 'active'
    this.#updatedAt = Date.now()
    return this
  }

  /**
   * 停用实体
   * @throws {ValidationError} 状态变更失败时抛出
   */
  deactivate() {
    this.#logAccess('deactivate')
    this.#status = 'inactive'
    this.#updatedAt = Date.now()
    return this
  }

  /**
   * 归档实体
   * @throws {ValidationError} 状态变更失败时抛出
   */
  archive() {
    this.#logAccess('archive')
    this.#status = 'archived'
    this.#updatedAt = Date.now()
    return this
  }

  /**
   * 检查是否活跃
   * @returns {boolean} 是否活跃
   */
  isActive() {
    return this.#status === 'active'
  }

  /**
   * 访问日志
   * @private
   * @param {string} action - 操作
   */
  #logAccess(action) {
    this.#accessLog.push({ action, timestamp: Date.now() })
    if (this.#accessLog.length > 100) {
      this.#accessLog.shift()
    }
  }

  // ==================== 序列化 ====================

  /**
   * 转换为 JSON
   * @returns {Object} JSON 对象
   */
  toJSON() {
    return {
      id: this.#id,
      createdAt: this.#createdAt,
      updatedAt: this.#updatedAt,
      status: this.#status,
      metadata: this.#metadata,
    }
  }

  /**
   * 转换为字符串
   * @returns {string} 字符串表示
   */
  toString() {
    return `${this.constructor.name}(${this.#id})`
  }
}

/**
 * 可配置实体基类
 * 扩展 BaseEntity，添加配置化能力
 */
export class ConfigurableEntity extends BaseEntity {
  #config = {}
  #featureFlags = new Map()

  constructor(config = {}) {
    super(config)

    // 配置验证
    try {
      TypeValidator.validateObject(config, 'config')
    } catch (error) {
      throw new ValidationError('config', 'valid config object', error.message)
    }

    this.#config = {
      // 功能开关
      features: {
        enableApproval: config.enableApproval ?? false,
        enableNotification: config.enableNotification ?? true,
        enableAudit: config.enableAudit ?? true,
        ...config.features,
      },
      // 区域设置
      region: {
        timezone: config.timezone ?? 'UTC',
        locale: config.locale ?? 'zh-CN',
        currency: config.currency ?? 'CNY',
      },
      // 业务规则
      rules: {
        maxAmount: config.maxAmount ?? 100000,
        minAmount: config.minAmount ?? 0,
        allowedMethods: config.allowedMethods ?? [],
        ...config.rules,
      },
      ...config.extConfig,
    }
  }

  /**
   * 获取配置值
   * @param {string} key - 配置键
   * @param {*} defaultValue - 默认值
   * @returns {*} 配置值
   */
  getConfig(key, defaultValue) {
    const keys = key.split('.')
    let value = this.#config
    for (const k of keys) {
      if (value && typeof value === 'object') {
        value = value[k]
      } else {
        return defaultValue
      }
    }
    return value !== undefined ? value : defaultValue
  }

  /**
   * 设置配置值
   * @param {string} key - 配置键
   * @param {*} value - 配置值
   */
  setConfig(key, value) {
    const keys = key.split('.')
    let current = this.#config
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {}
      }
      current = current[keys[i]]
    }
    current[keys[keys.length - 1]] = value
  }

  /**
   * 检查功能是否启用
   * @param {string} featureName - 功能名
   * @param {Object} context - 上下文
   * @returns {boolean} 是否启用
   */
  isFeatureEnabled(featureName, context = {}) {
    const feature = this.#featureFlags.get(featureName)
    if (!feature) {
      return this.getConfig(`features.${featureName}`, false)
    }

    if (!feature.enabled) return false

    // 检查条件
    if (feature.conditions) {
      for (const condition of feature.conditions) {
        if (!this.#evaluateCondition(condition, context)) {
          return false
        }
      }
    }

    return true
  }

  /**
   * 注册功能开关
   * @param {string} name - 功能名
   * @param {Object} config - 配置
   */
  registerFeature(name, config) {
    this.#featureFlags.set(name, {
      enabled: config.enabled ?? true,
      conditions: config.conditions || [],
    })
  }

  /**
   * 评估条件
   * @private
   * @param {Object} condition - 条件
   * @param {Object} context - 上下文
   * @returns {boolean} 是否满足条件
   */
  #evaluateCondition(condition, context) {
    const { field, operator, value } = condition

    switch (operator) {
      case 'in':
        return value.includes(context[field])
      case 'equals':
        return context[field] === value
      case 'greaterThan':
        return context[field] > value
      case 'lessThan':
        return context[field] < value
      case 'contains':
        return context[field]?.includes(value)
      default:
        return true
    }
  }

  /**
   * 获取区域设置
   * @returns {string} 区域设置
   */
  getLocale() {
    return this.getConfig('region.locale', 'zh-CN')
  }

  /**
   * 获取时区
   * @returns {string} 时区
   */
  getTimezone() {
    return this.getConfig('region.timezone', 'UTC')
  }

  /**
   * 获取货币
   * @returns {string} 货币
   */
  getCurrency() {
    return this.getConfig('region.currency', 'CNY')
  }
}

// 导出
export default { BaseEntity, ConfigurableEntity, HookManager }
