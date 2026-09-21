/**
 * GRI 配置服务
 * 提供分层配置管理、功能开关、多语言支持
 * 遵循：单例模式、策略模式
 *
 * @author GRI Team
 * @version 1.0
 */

import { EventEmitter } from 'events'
import { HookManager } from './BaseEntity.js'

/**
 * 配置层枚举
 */
export const ConfigLayer = {
  SYSTEM: 'system', // 系统默认配置
  TENANT: 'tenant', // 租户配置
  ORG: 'org', // 组织配置
  USER: 'user', // 用户配置
}

/**
 * 配置项实体
 */
export class ConfigItem {
  #value = null
  #layer = ConfigLayer.SYSTEM
  #description = ''
  #validator = null

  constructor(key, defaultValue, config = {}) {
    this.key = key
    this.#value = defaultValue
    this.#layer = config.layer || ConfigLayer.SYSTEM
    this.#description = config.description || ''
    this.#validator = config.validator
  }

  get value() {
    return this.#value
  }
  get layer() {
    return this.#layer
  }
  get description() {
    return this.#description
  }

  set value(val) {
    if (this.#validator) {
      this.#validator(val)
    }
    this.#value = val
  }
}

/**
 * 配置服务类
 */
class ConfigServiceClass extends EventEmitter {
  #layers = {
    [ConfigLayer.SYSTEM]: new Map(),
    [ConfigLayer.TENANT]: new Map(),
    [ConfigLayer.ORG]: new Map(),
    [ConfigLayer.USER]: new Map(),
  }
  #hookManager = new HookManager()

  constructor() {
    super()
  }

  // ==================== 配置管理 ====================

  /**
   * 设置配置值
   * @param {string} key - 配置键
   * @param {any} value - 配置值
   * @param {string} layer - 配置层
   */
  set(key, value, layer = ConfigLayer.SYSTEM) {
    if (!this.#layers[layer]) {
      throw new Error(`无效的配置层：${layer}`)
    }
    this.#layers[layer].set(key, value)
    this.#triggerChange(key, value, layer)
    return this
  }

  /**
   * 获取配置值（分层合并）
   * @param {string} key - 配置键
   * @param {any} defaultValue - 默认值
   * @returns {any} 配置值
   */
  get(key, defaultValue) {
    // 从用户层到系统层依次查找
    for (const layer of Object.values(ConfigLayer)) {
      if (this.#layers[layer].has(key)) {
        return this.#layers[layer].get(key)
      }
    }
    return defaultValue
  }

  /**
   * 获取配置对象
   */
  getConfigObject(keys) {
    const result = {}
    keys.forEach((key) => {
      result[key] = this.get(key)
    })
    return result
  }

  /**
   * 删除配置
   */
  delete(key, layer = ConfigLayer.SYSTEM) {
    if (this.#layers[layer]) {
      this.#layers[layer].delete(key)
    }
    return this
  }

  /**
   * 清空配置层
   */
  clear(layer) {
    if (layer) {
      this.#layers[layer].clear()
    } else {
      Object.values(this.#layers).forEach((l) => l.clear())
    }
    return this
  }

  // ==================== 配置项管理 ====================

  /**
   * 注册配置项
   */
  register(key, defaultValue, config = {}) {
    const item = new ConfigItem(key, defaultValue, config)
    this.set(key, defaultValue, config.layer)
    return item
  }

  /**
   * 批量加载配置
   */
  load(configObj, layer = ConfigLayer.SYSTEM) {
    Object.entries(configObj).forEach(([key, value]) => {
      this.set(key, value, layer)
    })
    return this
  }

  // ==================== 功能开关 ====================

  /**
   * 检查功能是否启用
   */
  isEnabled(featureName, context = {}) {
    const enabled = this.get(`features.${featureName}`, false)
    if (typeof enabled === 'boolean') {
      return enabled
    }
    if (enabled && enabled.conditions) {
      return this.#evaluateConditions(enabled.conditions, context)
    }
    return false
  }

  /**
   * 启用功能
   */
  enable(featureName) {
    this.set(`features.${featureName}`, true)
    return this
  }

  /**
   * 禁用功能
   */
  disable(featureName) {
    this.set(`features.${featureName}`, false)
    return this
  }

  // ==================== 条件评估 ====================

  #evaluateConditions(conditions, context) {
    return conditions.every((cond) => {
      const { field, operator, value } = cond
      const contextValue = context[field]

      switch (operator) {
        case 'in':
          return value.includes(contextValue)
        case 'equals':
          return contextValue === value
        case 'greaterThan':
          return contextValue > value
        case 'lessThan':
          return contextValue < value
        case 'contains':
          return contextValue?.includes(value)
        default:
          return true
      }
    })
  }

  // ==================== 钩子管理 ====================

  #triggerChange(key, value, layer) {
    this.emit('change', { key, value, layer })
    this.#hookManager.triggerSync('change', { key, value, layer })
  }

  on(name, callback, priority) {
    this.#hookManager.register(name, callback, priority)
    return this
  }

  // ==================== 序列化 ====================

  toJSON() {
    const result = {}
    for (const [layer, map] of Object.entries(this.#layers)) {
      result[layer] = Object.fromEntries(map)
    }
    return result
  }

  /**
   * 导出配置
   */
  exportConfig() {
    return JSON.stringify(this.toJSON(), null, 2)
  }

  /**
   * 导入配置
   */
  importConfig(json) {
    try {
      const data = JSON.parse(json)
      Object.entries(data).forEach(([layer, configs]) => {
        Object.entries(configs).forEach(([key, value]) => {
          this.set(key, value, layer)
        })
      })
      return true
    } catch (e) {
      console.error('配置导入失败:', e)
      return false
    }
  }
}

// 导出单例
export const configService = new ConfigServiceClass()
export default configService

/**
 * 国际化服务
 */
class I18nServiceClass extends EventEmitter {
  #translations = new Map()
  #currentLocale = 'zh-CN'
  #fallbackLocale = 'en-US'
  #hookManager = new HookManager()

  /**
   * 设置当前语言环境
   */
  setLocale(locale) {
    this.#currentLocale = locale
    this.emit('localeChange', locale)
    return this
  }

  /**
   * 获取当前语言环境
   */
  getLocale() {
    return this.#currentLocale
  }

  /**
   * 设置回退语言
   */
  setFallbackLocale(locale) {
    this.#fallbackLocale = locale
    return this
  }

  /**
   * 加载翻译
   */
  loadTranslations(locale, translations) {
    Object.entries(translations).forEach(([key, value]) => {
      if (!this.#translations.has(key)) {
        this.#translations.set(key, {})
      }
      this.#translations.get(key)[locale] = value
    })
    return this
  }

  /**
   * 翻译文本
   */
  t(key, params = {}) {
    const translation = this.#translations.get(key)
    if (!translation) {
      return key
    }

    // 获取当前语言翻译，回退到默认语言
    let text = translation[this.#currentLocale] || translation[this.#fallbackLocale] || key

    // 参数替换
    Object.entries(params).forEach(([k, v]) => {
      text = text.replace(`{${k}}`, v)
    })

    return text
  }

  /**
   * 格式化数字
   */
  formatNumber(value, locale) {
    return new Intl.NumberFormat(locale || this.#currentLocale).format(value)
  }

  /**
   * 格式化货币
   */
  formatCurrency(amount, currency, locale) {
    return new Intl.NumberFormat(locale || this.#currentLocale, {
      style: 'currency',
      currency: currency || 'CNY',
    }).format(amount)
  }

  /**
   * 格式化日期
   */
  formatDate(date, format, locale) {
    const d = new Date(date)
    const loc = locale || this.#currentLocale

    if (!format || format === 'short') {
      return new Intl.DateTimeFormat(loc).format(d)
    }

    return new Intl.DateTimeFormat(loc, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d)
  }

  /**
   * 格式化相对时间
   */
  formatRelative(date, locale) {
    const d = new Date(date)
    const now = new Date()
    const diff = d.getTime() - now.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (Math.abs(minutes) < 1) {
      return this.t('common.justNow')
    }
    if (Math.abs(minutes) < 60) {
      return this.t('common.minutesAgo', { count: Math.abs(minutes) })
    }
    if (Math.abs(hours) < 24) {
      return this.t('common.hoursAgo', { count: Math.abs(hours) })
    }
    return this.formatDate(date, 'short', locale)
  }

  // ==================== 钩子管理 ====================

  on(name, callback, priority) {
    this.#hookManager.register(name, callback, priority)
    return this
  }
}

// 导出国际化单例和配置服务
export const i18n = new I18nServiceClass()
