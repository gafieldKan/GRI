/**
 * GRI 角色与权限领域模型
 * 基于 RBAC（Role-Based Access Control）模型
 *
 * @author GRI Team
 * @version 1.0
 */

import { BaseDomain, ValueObject } from '../BaseDomain.js'

/**
 * 数据权限范围枚举
 */
export const DataScope = {
  SYSTEM: 'system', // 系统级（全部数据）
  ORG: 'org', // 组织级（本组织及下级）
  DEPT: 'dept', // 部门级（本部门及下级）
  SELF: 'self', // 仅本人
}

/**
 * 数据范围层级（数字越小范围越大）
 */
export const DATA_SCOPE_LEVEL = {
  [DataScope.SYSTEM]: 1,
  [DataScope.ORG]: 2,
  [DataScope.DEPT]: 3,
  [DataScope.SELF]: 4,
}

/**
 * 权限操作枚举
 */
export const PermissionAction = {
  CREATE: 'create',
  READ: 'read',
  UPDATE: 'update',
  DELETE: 'delete',
  EXPORT: 'export',
  IMPORT: 'import',
  AUDIT: 'audit',
  MANAGE: 'manage',
}

/**
 * 权限资源枚举
 */
export const PermissionResource = {
  // 组织相关
  ORGANIZATION: 'organization',
  MEMBER: 'member',
  ROLE: 'role',
  USER: 'user',

  // 业务相关
  RESTAURANT: 'restaurant',
  DISH: 'dish',
  ORDER: 'order',
  CART: 'cart',
  PAYMENT: 'payment',

  // 系统相关
  RESOURCE: 'resource',
  MENU: 'menu',
  MODULE: 'module',
  TENANT: 'tenant',
  CONFIG: 'config',
}

/**
 * 权限描述符（单个权限点）
 */
export class PermissionDescriptor extends ValueObject {
  constructor(resource, action, dataScope = DataScope.SELF) {
    super({
      resource,
      action,
      dataScope,
    })
  }

  get resource() {
    return this._values.resource
  }
  get action() {
    return this._values.action
  }
  get dataScope() {
    return this._values.dataScope
  }

  /**
   * 转换为字符串格式 "resource:action:dataScope"
   */
  toString() {
    return `${this.resource}:${this.action}:${this.dataScope}`
  }

  /**
   * 从字符串解析
   */
  static fromString(str) {
    const [resource, action, dataScope = DataScope.SELF] = str.split(':')
    return new PermissionDescriptor(resource, action, dataScope)
  }

  /**
   * 检查是否匹配另一个权限
   */
  matches(other) {
    if (!(other instanceof PermissionDescriptor)) {
      return false
    }
    return (
      this.resource === other.resource &&
      this.action === other.action &&
      this._matchDataScope(other.dataScope)
    )
  }

  /**
   * 检查数据范围是否匹配
   */
  _matchDataScope(otherScope) {
    const currentLevel = DATA_SCOPE_LEVEL[this.dataScope] || 4
    const otherLevel = DATA_SCOPE_LEVEL[otherScope] || 4
    // 当前范围 >= 其他范围（数字越小范围越大）
    return currentLevel <= otherLevel
  }
}

/**
 * 角色实体类
 */
export class Role extends BaseDomain {
  // 私有字段
  #name = ''
  #code = ''
  #type = 'organization' // system/organization/functional
  #permissions = []
  #dataScope = DataScope.SELF
  #inheritable = true
  #parentRoleId = null

  constructor(config = {}) {
    super({ ...config, domainType: 'role' })

    this.#name = config.name || '未命名角色'
    this.#code = config.code || this.#generateCode()
    this.#type = config.type || 'organization'
    this.#permissions = config.permissions || []
    this.#dataScope = config.dataScope || DataScope.SELF
    this.#inheritable = config.inheritable ?? true
    this.#parentRoleId = config.parentRoleId
  }

  // ==================== Getter/Setter ====================

  get name() {
    return this.#name
  }
  get code() {
    return this.#code
  }
  get type() {
    return this.#type
  }
  get permissions() {
    return [...this.#permissions]
  }
  get dataScope() {
    return this.#dataScope
  }
  get inheritable() {
    return this.#inheritable
  }
  get parentRoleId() {
    return this.#parentRoleId
  }

  set name(value) {
    this.triggerHook('beforeUpdate', { field: 'name', oldValue: this.#name, newValue: value })
    this.#name = value
    this._updatedAt = Date.now()
    this.triggerHook('afterUpdate', { field: 'name', oldValue: this.#name, newValue: value })
  }

  set dataScope(value) {
    if (Object.values(DataScope).includes(value)) {
      this.#dataScope = value
      this._updatedAt = Date.now()
    }
  }

  // ==================== 工具方法 ====================

  /**
   * 生成角色代码
   */
  #generateCode() {
    return `ROLE_${Date.now().toString(36).toUpperCase()}`
  }

  // ==================== 权限管理 ====================

  /**
   * 添加权限
   */
  addPermission(permission) {
    const permStr = permission instanceof PermissionDescriptor ? permission.toString() : permission

    if (!this.#permissions.includes(permStr)) {
      this.#permissions.push(permStr)
      this.triggerHook('afterAddPermission', { permission: permStr })
    }
    return this
  }

  /**
   * 移除权限
   */
  removePermission(permission) {
    const permStr = permission instanceof PermissionDescriptor ? permission.toString() : permission

    const index = this.#permissions.indexOf(permStr)
    if (index > -1) {
      this.#permissions.splice(index, 1)
      this.triggerHook('afterRemovePermission', { permission: permStr })
    }
    return this
  }

  /**
   * 检查是否有权限
   */
  hasPermission(permission, dataScope = null) {
    const targetPerm =
      permission instanceof PermissionDescriptor
        ? permission
        : PermissionDescriptor.fromString(permission)

    const scope = dataScope || targetPerm.dataScope

    for (const permStr of this.#permissions) {
      const perm = PermissionDescriptor.fromString(permStr)
      if (perm.matches(targetPerm)) {
        return true
      }
    }
    return false
  }

  /**
   * 检查是否有资源的操作权限
   */
  can(resource, action) {
    return this.#permissions.some((permStr) => {
      const perm = PermissionDescriptor.fromString(permStr)
      return perm.resource === resource && perm.action === action
    })
  }

  /**
   * 批量添加权限
   */
  addPermissions(permissions) {
    permissions.forEach((perm) => this.addPermission(perm))
    return this
  }

  // ==================== 业务规则验证 ====================

  /**
   * 验证角色信息
   */
  validate() {
    const errors = []

    if (!this.#name || this.#name.trim() === '') {
      errors.push('角色名称不能为空')
    }

    if (!this.#code || this.#code.trim() === '') {
      errors.push('角色代码不能为空')
    }

    // 检查权限格式
    for (const permStr of this.#permissions) {
      try {
        PermissionDescriptor.fromString(permStr)
      } catch (e) {
        errors.push(`无效权限格式：${permStr}`)
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }

  // ==================== 领域事件 ====================

  /**
   * 权限变更时触发
   */
  onPermissionChanged(action, permission) {
    this.raiseEvent('PERMISSION_CHANGED', { action, permission, roleId: this._id })
  }

  // ==================== 序列化 ====================

  toJSON() {
    return {
      ...super.toJSON(),
      id: this._id,
      name: this.#name,
      code: this.#code,
      type: this.#type,
      permissions: this.#permissions,
      dataScope: this.#dataScope,
      inheritable: this.#inheritable,
      parentRoleId: this.#parentRoleId,
    }
  }

  /**
   * 从 DTO 创建
   */
  static fromDTO(dto) {
    return new Role(dto)
  }
}

/**
 * 角色模板（预定义角色）
 */
export const RoleTemplates = {
  // 系统级角色
  SYSTEM_ADMIN: {
    code: 'SYSTEM_ADMIN',
    name: '系统管理员',
    type: 'system',
    permissions: ['*:*:*'], // 所有权限
    dataScope: DataScope.SYSTEM,
    inheritable: false,
  },

  // 组织级角色
  ORG_OWNER: {
    code: 'ORG_OWNER',
    name: '组织所有者',
    type: 'organization',
    permissions: [
      'organization:*:org',
      'member:*:org',
      'role:*:org',
      'restaurant:*:org',
      'dish:*:org',
      'order:*:org',
    ],
    dataScope: DataScope.ORG,
    inheritable: true,
  },

  ORG_MANAGER: {
    code: 'ORG_MANAGER',
    name: '组织管理员',
    type: 'organization',
    permissions: [
      'organization:read:org',
      'member:*:org',
      'role:read:org',
      'restaurant:*:org',
      'dish:*:org',
      'order:*:org',
    ],
    dataScope: DataScope.ORG,
    inheritable: true,
  },

  // 餐厅角色
  RESTAURANT_ADMIN: {
    code: 'RESTAURANT_ADMIN',
    name: '餐厅管理员',
    type: 'functional',
    permissions: ['restaurant:*:dept', 'dish:*:dept', 'order:*:dept', 'member:read:dept'],
    dataScope: DataScope.DEPT,
    inheritable: true,
  },

  RESTAURANT_STAFF: {
    code: 'RESTAURANT_STAFF',
    name: '餐厅员工',
    type: 'functional',
    permissions: ['restaurant:read:dept', 'dish:read:dept', 'order:read:dept', 'order:update:self'],
    dataScope: DataScope.SELF,
    inheritable: false,
  },

  // 普通用户
  COMMON_USER: {
    code: 'COMMON_USER',
    name: '普通用户',
    type: 'functional',
    permissions: [
      'restaurant:read:self',
      'dish:read:self',
      'order:create:self',
      'order:read:self',
      'cart:*:self',
    ],
    dataScope: DataScope.SELF,
    inheritable: false,
  },
}

/**
 * 角色工厂
 */
export class RoleFactory {
  /**
   * 从模板创建角色
   */
  static fromTemplate(templateName, overrides = {}) {
    const template = RoleTemplates[templateName]
    if (!template) {
      throw new Error(`角色模板不存在：${templateName}`)
    }
    return new Role({ ...template, ...overrides })
  }

  /**
   * 创建自定义角色
   */
  static createCustom(name, code, permissions, dataScope = DataScope.SELF) {
    return new Role({
      name,
      code,
      permissions,
      dataScope,
      type: 'functional',
    })
  }
}

export default Role
