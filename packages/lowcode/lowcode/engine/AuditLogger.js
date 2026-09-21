/**
 * 变更审计日志系统
 * 记录所有配置变更、数据修改等操作的详细日志
 *
 * @author GRI Team
 * @version 1.0
 */

import { EventEmitter } from 'events'

/**
 * 审计操作类型枚举
 */
export const AuditAction = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  DEPLOY: 'deploy',
  ROLLBACK: 'rollback',
  LOGIN: 'login',
  LOGOUT: 'logout',
  PERMISSION_CHANGE: 'permission_change',
  CONFIG_CHANGE: 'config_change',
  DATA_EXPORT: 'data_export',
  DATA_IMPORT: 'data_import',
  OTHER: 'other',
}

/**
 * 审计日志级别枚举
 */
export const AuditLevel = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical',
}

/**
 * 审计日志条目类
 */
export class AuditEntry {
  constructor(config = {}) {
    this.id = config.id || `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    this.action = config.action || AuditAction.OTHER
    this.resource = config.resource || ''
    this.resourceId = config.resourceId || ''
    this.userId = config.userId || 'system'
    this.userName = config.userName || 'System'
    this.level = config.level || AuditLevel.INFO
    this.description = config.description || ''
    this.changes = config.changes || null
    this.metadata = config.metadata || {}
    this.ipAddress = config.ipAddress || ''
    this.userAgent = config.userAgent || ''
    this.timestamp = config.timestamp || Date.now()
    this.duration = config.duration || 0
    this.status = config.status || 'success'
    this.error = config.error || null
  }

  toJSON() {
    return {
      id: this.id,
      action: this.action,
      resource: this.resource,
      resourceId: this.resourceId,
      userId: this.userId,
      userName: this.userName,
      level: this.level,
      description: this.description,
      changes: this.changes,
      metadata: this.metadata,
      ipAddress: this.ipAddress,
      userAgent: this.userAgent,
      timestamp: this.timestamp,
      duration: this.duration,
      status: this.status,
      error: this.error,
    }
  }
}

/**
 * 审计日志存储接口
 */
class AuditStorage {
  constructor() {
    this.entries = []
    this.maxEntries = 10000
  }

  save(entry) {
    this.entries.push(entry)
    if (this.entries.length > this.maxEntries) {
      this.entries.shift()
    }
  }

  query(options = {}) {
    let result = this.entries

    if (options.action) {
      result = result.filter((e) => e.action === options.action)
    }

    if (options.userId) {
      result = result.filter((e) => e.userId === options.userId)
    }

    if (options.resource) {
      result = result.filter((e) => e.resource === options.resource)
    }

    if (options.resourceId) {
      result = result.filter((e) => e.resourceId === options.resourceId)
    }

    if (options.startTime) {
      result = result.filter((e) => e.timestamp >= options.startTime)
    }

    if (options.endTime) {
      result = result.filter((e) => e.timestamp <= options.endTime)
    }

    if (options.limit) {
      result = result.slice(-options.limit)
    }

    return result
  }

  clear() {
    this.entries = []
  }

  count() {
    return this.entries.length
  }
}

/**
 * 审计日志管理器主类
 */
class AuditLoggerClass extends EventEmitter {
  constructor() {
    super()
    this.storage = new AuditStorage()
    this.enabled = true
    this.currentUser = null
    this.filters = []
    this.reportUrl = ''
    this.autoSave = true
  }

  /**
   * 初始化审计日志
   */
  init(options = {}) {
    this.enabled = options.enabled ?? true
    this.reportUrl = options.reportUrl || ''
    this.autoSave = options.autoSave ?? true

    // 自动记录用户信息
    if (typeof window !== 'undefined') {
      this.#initUserTracking()
    }

    this.emit('init')
  }

  /**
   * 初始化用户追踪
   */
  #initUserTracking() {
    if (typeof document !== 'undefined') {
      // 从 cookie 或 localStorage 获取用户信息
      const userStr = localStorage.getItem('current_user')
      if (userStr) {
        try {
          this.currentUser = JSON.parse(userStr)
        } catch {
          this.currentUser = { id: 'unknown', name: 'Unknown' }
        }
      }
    }
  }

  /**
   * 设置当前用户
   */
  setUser(user) {
    this.currentUser = user
  }

  /**
   * 记录审计日志
   */
  log(config) {
    if (!this.enabled) return

    const entry = new AuditEntry({
      ...config,
      userId: this.currentUser?.id || config.userId || 'system',
      userName: this.currentUser?.name || config.userName || 'System',
      ipAddress: this.#getIPAddress(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    })

    // 应用过滤器
    for (const filter of this.filters) {
      if (!filter(entry)) return
    }

    // 保存日志
    if (this.autoSave) {
      this.storage.save(entry)
    }

    // 触发事件
    this.emit('log', entry)

    // 严重级别日志立即上报
    if (entry.level === AuditLevel.CRITICAL || entry.level === AuditLevel.ERROR) {
      this.#report(entry)
    }

    return entry
  }

  /**
   * 记录创建操作
   */
  logCreate(resource, resourceId, changes, metadata = {}) {
    return this.log({
      action: AuditAction.CREATE,
      resource,
      resourceId,
      description: `创建${resource}: ${resourceId}`,
      changes,
      metadata,
      level: AuditLevel.INFO,
    })
  }

  /**
   * 记录更新操作
   */
  logUpdate(resource, resourceId, changes, metadata = {}) {
    return this.log({
      action: AuditAction.UPDATE,
      resource,
      resourceId,
      description: `更新${resource}: ${resourceId}`,
      changes,
      metadata,
      level: AuditLevel.INFO,
    })
  }

  /**
   * 记录删除操作
   */
  logDelete(resource, resourceId, metadata = {}) {
    return this.log({
      action: AuditAction.DELETE,
      resource,
      resourceId,
      description: `删除${resource}: ${resourceId}`,
      metadata,
      level: AuditLevel.WARNING,
    })
  }

  /**
   * 记录部署操作
   */
  logDeploy(resource, resourceId, metadata = {}) {
    return this.log({
      action: AuditAction.DEPLOY,
      resource,
      resourceId,
      description: `部署${resource}: ${resourceId}`,
      metadata,
      level: AuditLevel.INFO,
    })
  }

  /**
   * 记录权限变更
   */
  logPermissionChange(resource, resourceId, changes, metadata = {}) {
    return this.log({
      action: AuditAction.PERMISSION_CHANGE,
      resource,
      resourceId,
      description: `权限变更${resource}: ${resourceId}`,
      changes,
      metadata,
      level: AuditLevel.WARNING,
    })
  }

  /**
   * 添加日志过滤器
   */
  addFilter(filterFn) {
    this.filters.push(filterFn)
  }

  /**
   * 移除过滤器
   */
  removeFilter(filterFn) {
    this.filters = this.filters.filter((f) => f !== filterFn)
  }

  /**
   * 查询日志
   */
  query(options) {
    return this.storage.query(options).map((e) => e.toJSON())
  }

  /**
   * 获取所有日志
   */
  getAll(limit = 100) {
    return this.storage.query({ limit }).map((e) => e.toJSON())
  }

  /**
   * 按用户查询日志
   */
  getByUser(userId, limit = 100) {
    return this.storage.query({ userId, limit }).map((e) => e.toJSON())
  }

  /**
   * 按资源查询日志
   */
  getByResource(resource, limit = 100) {
    return this.storage.query({ resource, limit }).map((e) => e.toJSON())
  }

  /**
   * 按资源 ID 查询日志
   */
  getByResourceId(resourceId, limit = 100) {
    return this.storage.query({ resourceId, limit }).map((e) => e.toJSON())
  }

  /**
   * 获取统计信息
   */
  getStats(timeRange = 24 * 60 * 60 * 1000) {
    const now = Date.now()
    const entries = this.storage.entries.filter((e) => now - e.timestamp < timeRange)

    const stats = {
      total: entries.length,
      byAction: {},
      byUser: {},
      byLevel: {},
      byResource: {},
      errors: entries.filter((e) => e.status === 'error').length,
    }

    entries.forEach((e) => {
      stats.byAction[e.action] = (stats.byAction[e.action] || 0) + 1
      stats.byUser[e.userId] = (stats.byUser[e.userId] || 0) + 1
      stats.byLevel[e.level] = (stats.byLevel[e.level] || 0) + 1
      stats.byResource[e.resource] = (stats.byResource[e.resource] || 0) + 1
    })

    return stats
  }

  /**
   * 导出日志
   */
  export(options = {}) {
    const entries = this.query(options)
    return JSON.stringify(
      entries.map((e) => e.toJSON()),
      null,
      2
    )
  }

  /**
   * 清除日志
   */
  clear() {
    this.storage.clear()
    this.emit('clear')
  }

  /**
   * 获取 IP 地址
   */
  #getIPAddress() {
    return 'local'
  }

  /**
   * 上报告日志
   */
  async #report(entry) {
    if (!this.reportUrl) return

    try {
      await navigator.sendBeacon(this.reportUrl, JSON.stringify(entry.toJSON()))
    } catch (e) {
      console.warn('[AuditLogger] 上报失败:', e)
    }
  }

  /**
   * 禁用审计
   */
  disable() {
    this.enabled = false
  }

  /**
   * 启用审计
   */
  enable() {
    this.enabled = true
  }
}

// 导出单例
export const auditLogger = new AuditLoggerClass()
export default auditLogger
