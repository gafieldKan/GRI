/**
 * 数据权限插件
 *
 * 功能：
 * 1. 拦截 Repository 调用，自动注入租户隔离条件
 * 2. 支持行级数据权限（基于角色/数据范围）
 * 3. 支持字段级权限（脱敏/隐藏）
 *
 * @author GRI Team
 * @version 1.0
 */

import { EventEmitter } from 'events'
import { tenantManager } from '../core/TenantManager.js'
import { permissionManager, PermissionLevel } from '../core/PermissionManager.js'

/**
 * 数据范围枚举
 */
export const DataScope = {
  ALL: 'all', // 全部数据
  ORG: 'org', // 本部门
  ORG_AND_SUB: 'org_and_sub', // 本部门及子部门
  PERSONAL: 'personal', // 个人数据
  CUSTOM: 'custom', // 自定义
}

/**
 * 字段权限级别
 */
export const FieldPermissionLevel = {
  FULL: 'full', // 完全可见
  MASKED: 'masked', // 脱敏显示
  HIDDEN: 'hidden', // 隐藏
  READONLY: 'readonly', // 只读
}

/**
 * 数据权限配置类
 */
export class DataPermissionConfig {
  constructor(config = {}) {
    this.modelName = config.modelName || ''
    this.dataScope = config.dataScope || DataScope.PERSONAL
    this.ownerField = config.ownerField || 'ownerId'
    this.deptField = config.deptField || 'deptId'
    this.fieldPermissions = new Map()
  }

  /**
   * 设置字段权限
   */
  setFieldPermission(fieldName, level) {
    this.fieldPermissions.set(fieldName, level)
    return this
  }

  /**
   * 获取字段权限
   */
  getFieldPermission(fieldName) {
    return this.fieldPermissions.get(fieldName) || FieldPermissionLevel.FULL
  }

  /**
   * 字段值脱敏
   */
  maskValue(value, level) {
    if (level === FieldPermissionLevel.MASKED) {
      if (typeof value === 'string') {
        return value.substring(0, 3) + '***'
      }
      return '***'
    }
    return value
  }
}

/**
 * 数据权限引擎类
 */
class DataPermissionEngineClass extends EventEmitter {
  constructor() {
    super()
    this.configs = new Map()
    this.interceptors = new Map()
  }

  /**
   * 注册模型权限配置
   */
  register(modelName, config = {}) {
    const modelConfig = new DataPermissionConfig({ modelName, ...config })
    this.configs.set(modelName, modelConfig)
    this.emit('model:register', { modelName, config: modelConfig })
    return this
  }

  /**
   * 获取模型配置
   */
  getConfig(modelName) {
    return this.configs.get(modelName) || new DataPermissionConfig()
  }

  /**
   * 添加查询拦截器
   */
  addQueryInterceptor(modelName, interceptor) {
    if (!this.interceptors.has(modelName)) {
      this.interceptors.set(modelName, [])
    }
    this.interceptors.get(modelName).push(interceptor)
    return this
  }

  /**
   * 构建查询条件（注入租户隔离、数据范围等）
   */
  buildQueryConditions(modelName, originalConditions = {}) {
    const config = this.getConfig(modelName)
    const conditions = { ...originalConditions }

    // 1. 注入租户隔离条件
    const tenant = tenantManager.getCurrentTenant()
    if (tenant) {
      conditions.tenantId = tenant.id
    }

    // 2. 注入数据范围过滤
    const dataScope = config.dataScope
    const userId = permissionManager.currentUserId

    if (dataScope === DataScope.PERSONAL && userId) {
      conditions[config.ownerField] = userId
    } else if (dataScope === DataScope.ORG && userId) {
      // 部门级别过滤逻辑
      conditions.deptId = userId // 简化示例
    }

    // 3. 执行拦截器
    if (this.interceptors.has(modelName)) {
      for (const interceptor of this.interceptors.get(modelName)) {
        interceptor(conditions)
      }
    }

    return conditions
  }

  /**
   * 字段脱敏处理
   */
  maskFieldData(modelName, data) {
    const config = this.getConfig(modelName)
    const result = {}

    for (const [key, value] of Object.entries(data)) {
      const level = config.getFieldPermission(key)
      result[key] = config.maskValue(value, level)
    }

    return result
  }

  /**
   * 应用到 Repository
   */
  applyToRepository(repository, modelName) {
    const originalFindAll = repository.findAll
    const self = this

    repository.findAll = async function (conditions = {}) {
      // 构建增强后的查询条件
      const enhancedConditions = self.buildQueryConditions(modelName, conditions)

      // 调用原始方法时传入增强后的条件
      return originalFindAll.call(this, enhancedConditions)
    }

    // 包装保存方法
    const originalSave = repository.save
    repository.save = async function (entity) {
      // 在保存前注入租户 ID
      const tenant = tenantManager.getCurrentTenant()
      if (tenant && entity.tenantId === undefined) {
        entity.tenantId = tenant.id
      }
      return originalSave.call(this, entity)
    }

    return repository
  }
}

// 导出单例
export const dataPermissionEngine = new DataPermissionEngineClass()
export default dataPermissionEngine

/**
 * 数据权限插件类
 */
export class DataPermissionPlugin {
  static install(app, options = {}) {
    app.use('data-permission', dataPermissionEngine)
    return dataPermissionEngine
  }
}
