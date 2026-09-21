/**
 * GRI 多租户管理器
 * 提供租户隔离、租户配置、资源配额管理
 * 遵循：单例模式、工厂模式、策略模式
 * 参考 SAP 多租户和 SaaS 架构设计
 *
 * @author GRI Team
 * @version 1.0
 */

import { EventEmitter } from 'events'
import { BaseEntity, ConfigurableEntity, HookManager } from './BaseEntity.js'

/**
 * 租户状态枚举
 */
export const TenantState = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  ARCHIVED: 'archived',
  PENDING: 'pending',
}

/**
 * 租户实体类
 * 继承 ConfigurableEntity，支持多租户配置隔离
 */
export class Tenant extends ConfigurableEntity {
  // 私有字段（封装性）
  #slug = ''
  #state = TenantState.PENDING
  #quotas = {}
  #usage = {}

  constructor(config = {}) {
    super(config)

    if (!config.id || !config.name || !config.slug) {
      throw new Error('租户必须包含 id, name 和 slug')
    }

    this._name = config.name
    this.#slug = config.slug
    this.#state = config.state || TenantState.PENDING

    // 初始化配额
    this.#quotas = {
      maxUsers: config.maxUsers || 10,
      maxModels: config.maxModels || 50,
      maxStorage: config.maxStorage || 1024 * 1024 * 100, // 100MB
      maxWorkflows: config.maxWorkflows || 20,
      maxPlugins: config.maxPlugins || 10,
      maxApiCalls: config.maxApiCalls || 10000, // 每月
      ...config.quotas,
    }

    // 初始化使用量
    this.#usage = { ...config.usage }
  }

  // ==================== Getter/Setter（封装性）====================

  get slug() {
    return this.#slug
  }
  get state() {
    return this.#state
  }
  get quotas() {
    return { ...this.#quotas }
  }
  get usage() {
    return { ...this.#usage }
  }

  set state(value) {
    if (Object.values(TenantState).includes(value)) {
      this.triggerHook('beforeUpdate', { field: 'state', oldValue: this.#state, newValue: value })
      this.#state = value
      this._updatedAt = Date.now()
      this.triggerHook('afterUpdate', { field: 'state', oldValue: this.#state, newValue: value })
    }
  }

  // ==================== 配额管理 ====================

  /**
   * 检查资源配额
   */
  checkQuota(resource, count = 1) {
    const limit = this.#quotas[resource]
    const usage = this.#usage[resource] || 0

    if (limit === -1) return true // -1 表示无限制
    return usage + count <= limit
  }

  /**
   * 增加使用量
   */
  incrementUsage(resource, amount = 1) {
    if (!this.#usage[resource]) {
      this.#usage[resource] = 0
    }
    this.#usage[resource] += amount

    // 检查是否超出配额
    if (this.#usage[resource] > this.#quotas[resource]) {
      console.warn(`租户 ${this._name} 超出配额：${resource}`)
    }

    return this.#usage[resource]
  }

  /**
   * 重置使用量
   */
  resetUsage(resource) {
    if (resource) {
      this.#usage[resource] = 0
    } else {
      this.#usage = {}
    }
  }

  /**
   * 获取配额使用率
   */
  getQuotaUsage() {
    const usage = {}
    for (const [key, limit] of Object.entries(this.#quotas)) {
      const used = this.#usage[key] || 0
      usage[key] = {
        used,
        limit,
        percent: limit === -1 ? 100 : Math.round((used / limit) * 100),
      }
    }
    return usage
  }

  /**
   * 设置配额
   */
  setQuota(resource, limit) {
    this.#quotas[resource] = limit
  }

  // ==================== 状态管理 ====================

  /**
   * 检查租户是否活跃
   */
  isActive() {
    return this.#state === TenantState.ACTIVE
  }

  /**
   * 激活租户
   */
  activate() {
    this.state = TenantState.ACTIVE
    this.triggerHook('afterActivate', { tenant: this })
    return this
  }

  /**
   * 暂停租户
   */
  suspend() {
    this.state = TenantState.SUSPENDED
    this.triggerHook('afterSuspend', { tenant: this })
    return this
  }

  /**
   * 归档租户
   */
  archive() {
    this.state = TenantState.ARCHIVED
    this.triggerHook('afterArchive', { tenant: this })
    return this
  }

  // ==================== 序列化 ====================

  toJSON() {
    return {
      ...super.toJSON(),
      id: this._id,
      name: this._name,
      slug: this.#slug,
      state: this.#state,
      quotas: { ...this.#quotas },
      usage: { ...this.#usage },
      settings: this.getConfig(null),
    }
  }
}

/**
 * 租户工厂（工厂模式）
 */
export class TenantFactory {
  static #registry = new Map()

  /**
   * 注册租户类型
   */
  static register(type, tenantClass) {
    this.#registry.set(type, tenantClass)
  }

  /**
   * 创建租户实例
   */
  static create(type = 'default', config) {
    const TenantClass = this.#registry.get(type) || Tenant
    return new TenantClass(config)
  }
}

/**
 * 配额策略（策略模式）
 */
export class QuotaStrategy {
  getQuotas() {
    throw new Error('子类必须实现 getQuotas 方法')
  }
}

/**
 * 基础配额策略
 */
class BasicQuotaStrategy extends QuotaStrategy {
  getQuotas() {
    return {
      maxUsers: 10,
      maxModels: 50,
      maxStorage: 1024 * 1024 * 100,
      maxWorkflows: 20,
      maxApiCalls: 10000,
    }
  }
}

/**
 * 企业配额策略
 */
class EnterpriseQuotaStrategy extends QuotaStrategy {
  getQuotas() {
    return {
      maxUsers: 100,
      maxModels: 500,
      maxStorage: 1024 * 1024 * 1024 * 10, // 10GB
      maxWorkflows: 200,
      maxApiCalls: 1000000,
    }
  }
}

/**
 * 租户管理器单例
 */
class TenantManagerClass extends EventEmitter {
  #tenants = new Map()
  #currentTenantId = null
  #defaultTenantId = null
  #hookManager = new HookManager()
  #quotaStrategies = {
    basic: new BasicQuotaStrategy(),
    enterprise: new EnterpriseQuotaStrategy(),
  }

  constructor() {
    super()
  }

  // ==================== 租户管理 ====================

  /**
   * 创建租户
   */
  createTenant(config) {
    // 触发前置钩子
    this.#hookManager.triggerSync('beforeCreateTenant', { config })

    // 使用工厂创建
    const tenant = TenantFactory.create('default', config)

    // 检查是否已存在
    if (this.#tenants.has(tenant.id)) {
      throw new Error(`租户已存在：${tenant.id}`)
    }

    // 注册租户
    this.#tenants.set(tenant.id, tenant)

    // 设置默认租户
    if (!this.#defaultTenantId) {
      this.#defaultTenantId = tenant.id
    }

    // 触发后置钩子
    this.#hookManager.triggerSync('afterCreateTenant', { tenant })

    console.warn(`[TenantManager] 创建租户：${tenant.slug}`)

    return tenant
  }

  /**
   * 获取租户
   */
  getTenant(tenantId) {
    return this.#tenants.get(tenantId)
  }

  /**
   * 通过 slug 获取租户
   */
  getTenantBySlug(slug) {
    for (const tenant of this.#tenants.values()) {
      if (tenant.slug === slug) {
        return tenant
      }
    }
    return null
  }

  /**
   * 设置当前租户
   */
  setCurrentTenant(tenantId) {
    const tenant = this.#tenants.get(tenantId)
    if (!tenant) {
      throw new Error(`租户不存在：${tenantId}`)
    }

    if (!tenant.isActive()) {
      throw new Error(`租户未激活：${tenantId}`)
    }

    this.#currentTenantId = tenantId
    this.#hookManager.triggerSync('switchTenant', { tenant })
    return tenant
  }

  /**
   * 获取当前租户
   */
  getCurrentTenant() {
    if (this.#currentTenantId) {
      return this.#tenants.get(this.#currentTenantId)
    }
    return null
  }

  /**
   * 获取所有租户
   */
  getAllTenants() {
    return Array.from(this.#tenants.values())
  }

  /**
   * 获取活跃的租户
   */
  getActiveTenants() {
    return this.getAllTenants().filter((t) => t.isActive())
  }

  // ==================== 租户状态管理 ====================

  /**
   * 暂停租户
   */
  suspendTenant(tenantId) {
    const tenant = this.#tenants.get(tenantId)
    if (!tenant) {
      throw new Error(`租户不存在：${tenantId}`)
    }
    tenant.suspend()
    return tenant
  }

  /**
   * 激活租户
   */
  activateTenant(tenantId) {
    const tenant = this.#tenants.get(tenantId)
    if (!tenant) {
      throw new Error(`租户不存在：${tenantId}`)
    }
    tenant.activate()
    return tenant
  }

  /**
   * 归档租户
   */
  archiveTenant(tenantId) {
    const tenant = this.#tenants.get(tenantId)
    if (!tenant) {
      throw new Error(`租户不存在：${tenantId}`)
    }
    tenant.archive()
    return tenant
  }

  /**
   * 删除租户
   */
  deleteTenant(tenantId) {
    const tenant = this.#tenants.get(tenantId)
    if (!tenant) {
      throw new Error(`租户不存在：${tenantId}`)
    }

    this.#hookManager.triggerSync('beforeDeleteTenant', { tenant })
    this.#tenants.delete(tenantId)
    this.#hookManager.triggerSync('afterDeleteTenant', { tenant })

    return true
  }

  // ==================== 配额管理 ====================

  /**
   * 检查当前租户资源配额
   */
  checkQuota(resource, count = 1) {
    const tenant = this.getCurrentTenant()
    if (!tenant) {
      throw new Error('当前无租户上下文')
    }
    return tenant.checkQuota(resource, count)
  }

  /**
   * 增加当前租户使用量
   */
  incrementUsage(resource, amount = 1) {
    const tenant = this.getCurrentTenant()
    if (!tenant) {
      throw new Error('当前无租户上下文')
    }
    return tenant.incrementUsage(resource, amount)
  }

  /**
   * 获取当前租户配额使用率
   */
  getQuotaUsage() {
    const tenant = this.getCurrentTenant()
    if (!tenant) {
      return {}
    }
    return tenant.getQuotaUsage()
  }

  // ==================== 钩子管理 ====================

  /**
   * 注册钩子
   */
  on(name, callback, priority) {
    this.#hookManager.register(name, callback, priority)
    return this
  }

  // ==================== 其他方法 ====================

  /**
   * 导出租户配置
   */
  exportTenantConfig(tenantId) {
    const tenant = this.#tenants.get(tenantId)
    if (!tenant) {
      throw new Error(`租户不存在：${tenantId}`)
    }
    return tenant.toJSON()
  }

  /**
   * 导入租户配置
   */
  importTenantConfig(config) {
    if (!config.id || !config.slug) {
      throw new Error('导入配置必须包含 id 和 slug')
    }
    return this.createTenant(config)
  }

  /**
   * 清空所有租户
   */
  clear() {
    this.#tenants.clear()
    this.#currentTenantId = null
    this.#defaultTenantId = null
    this.#hookManager.clear()
  }
}

// 导出单例
export const tenantManager = new TenantManagerClass()
export default tenantManager
