/**
 * 权限管理器
 * 提供完整的 RBAC（基于角色的访问控制）权限控制
 * 支持模型级/字段级/操作级/数据级权限
 * 参考 Frappe 和 NocoBase 的权限系统设计
 */

// 操作类型
export const Operations = {
  READ: 'read',
  WRITE: 'write',
  CREATE: 'create',
  DELETE: 'delete',
  UPDATE: 'update',
  SUBMIT: 'submit', // 提交审批
  CANCEL: 'cancel', // 取消/作废
  APPROVE: 'approve', // 审批
  REJECT: 'reject', // 拒绝
  SHARE: 'share', // 分享
  EXPORT: 'export', // 导出
  IMPORT: 'import', // 导入
  PRINT: 'print', // 打印
  FULL: 'full', // 完全控制
}

// 权限级别
export const PermissionLevel = {
  NONE: 'none',
  READ: 'read',
  WRITE: 'write',
  ADMIN: 'admin',
  FULL: 'full',
}

// 数据权限范围
export const DataScope = {
  ALL: 'all', // 全部数据
  MINE: 'mine', // 仅本人数据
  DEPT: 'dept', // 本部门数据
  DEPT_AND_SUB: 'dept_and_sub', // 本部门及子部门数据
  CUSTOM: 'custom', // 自定义范围
}

// 默认角色定义
export const defaultRoles = {
  GUEST: {
    id: 'guest',
    name: '访客',
    description: '未登录用户',
    permissions: [],
    dataScope: DataScope.MINE,
  },
  USER: {
    id: 'user',
    name: '普通用户',
    description: '系统普通用户',
    permissions: [],
    dataScope: DataScope.MINE,
  },
  EDITOR: {
    id: 'editor',
    name: '编辑者',
    description: '内容编辑人员',
    permissions: [],
    dataScope: DataScope.DEPT,
  },
  ADMIN: {
    id: 'admin',
    name: '管理员',
    description: '系统管理员',
    permissions: ['*'],
    dataScope: DataScope.ALL,
  },
}

// 角色枚举（兼容导入）
export const Role = defaultRoles

// 权限描述符生成器
export const createPermissionDescriptor = (type, resource, action) => {
  return `${type}:${resource}:${action}`
}

// 权限检查器类
class PermissionManagerClass {
  constructor() {
    this.roles = new Map()
    this.userRoles = new Map() // 用户可以有多个角色
    this.roleGroups = new Map() // 角色组（角色继承）
    this.modelPermissions = new Map()
    this.fieldPermissions = new Map()
    this.actionPermissions = new Map()
    this.menuPermissions = new Map()
    this.dataPermissions = new Map()
    this.permissionCache = new Map()

    // 初始化默认角色
    Object.values(defaultRoles).forEach((role) => {
      this.registerRole(role)
    })
  }

  // ============ 角色管理 ============

  /**
   * 注册角色
   */
  registerRole(role) {
    if (!role.id || !role.name) {
      throw new Error('角色必须包含 id 和 name')
    }
    this.roles.set(role.id, role)
    this.permissionCache.clear()
    return this
  }

  /**
   * 获取角色
   */
  getRole(roleId) {
    return this.roles.get(roleId)
  }

  /**
   * 删除角色
   */
  removeRole(roleId) {
    this.roles.delete(roleId)
    this.permissionCache.clear()
    return this
  }

  /**
   * 为用户分配角色（支持多角色）
   */
  assignRole(userId, roleId) {
    if (!this.userRoles.has(userId)) {
      this.userRoles.set(userId, [])
    }
    const roles = this.userRoles.get(userId)
    if (!roles.includes(roleId)) {
      roles.push(roleId)
    }
    this.permissionCache.clear()
    return this
  }

  /**
   * 移除用户角色
   */
  removeUserRole(userId, roleId) {
    const roles = this.userRoles.get(userId)
    if (roles) {
      const index = roles.indexOf(roleId)
      if (index !== -1) {
        roles.splice(index, 1)
      }
    }
    this.permissionCache.clear()
    return this
  }

  /**
   * 设置用户的角色列表
   */
  setUserRoles(userId, roleIds) {
    this.userRoles.set(userId, roleIds)
    this.permissionCache.clear()
    return this
  }

  /**
   * 获取用户的所有角色
   */
  getUserRoles(userId) {
    const roleIds = this.userRoles.get(userId) || []
    return roleIds.map((id) => this.roles.get(id)).filter(Boolean)
  }

  /**
   * 检查用户是否有某个角色
   */
  userHasRole(userId, roleId) {
    const roles = this.userRoles.get(userId) || []
    return roles.includes(roleId)
  }

  // ============ 角色继承 ============

  /**
   * 设置角色继承关系
   */
  setRoleInheritance(roleId, parentRoleId) {
    this.roleGroups.set(roleId, parentRoleId)
    this.permissionCache.clear()
    return this
  }

  /**
   * 获取角色的所有父角色（继承链）
   */
  getRoleAncestors(roleId) {
    const ancestors = []
    let currentId = roleId
    while (currentId && this.roleGroups.has(currentId)) {
      const parentId = this.roleGroups.get(currentId)
      if (parentId) {
        ancestors.push(parentId)
        currentId = parentId
      } else {
        break
      }
    }
    return ancestors
  }

  // ============ 模型权限 ============

  /**
   * 设置模型权限
   */
  setModelPermission(modelId, roleId, operations) {
    const key = `${modelId}:${roleId}`
    this.modelPermissions.set(key, Array.isArray(operations) ? operations : [operations])
    this.permissionCache.clear()
    return this
  }

  /**
   * 检查模型权限
   */
  hasModelPermission(modelId, roleId, operation = Operations.READ) {
    const key = `${modelId}:${roleId}`
    const ops = this.modelPermissions.get(key)

    if (!ops) {
      // 检查继承角色
      const role = this.getRole(roleId)
      if (role?.permissions?.includes('*')) {
        return true
      }
      return false
    }

    return ops.includes(operation) || ops.includes(Operations.FULL) || ops.includes('*')
  }

  /**
   * 获取模型的所有操作权限
   */
  getModelOperations(modelId, roleId) {
    const key = `${modelId}:${roleId}`
    return this.modelPermissions.get(key) || []
  }

  // ============ 字段权限 ============

  /**
   * 设置字段权限
   */
  setFieldPermission(
    modelId,
    fieldId,
    roleId,
    { visible = true, readable = true, writable = false } = {}
  ) {
    const key = `${modelId}:${fieldId}:${roleId}`
    this.fieldPermissions.set(key, { visible, readable, writable })
    this.permissionCache.clear()
    return this
  }

  /**
   * 检查字段权限
   */
  getFieldPermission(modelId, fieldId, roleId) {
    const key = `${modelId}:${fieldId}:${roleId}`
    return this.fieldPermissions.get(key) || { visible: false, readable: false, writable: false }
  }

  /**
   * 检查字段是否可见
   */
  isFieldVisible(modelId, fieldId, roleId) {
    const perm = this.getFieldPermission(modelId, fieldId, roleId)
    return perm.visible
  }

  /**
   * 检查字段是否可写
   */
  isFieldWritable(modelId, fieldId, roleId) {
    const perm = this.getFieldPermission(modelId, fieldId, roleId)
    return perm.writable
  }

  // ============ 操作权限 ============

  /**
   * 设置操作权限
   */
  setActionPermission(actionId, roleId, allowed) {
    const key = `${actionId}:${roleId}`
    this.actionPermissions.set(key, allowed)
    this.permissionCache.clear()
    return this
  }

  /**
   * 检查操作权限
   */
  hasActionPermission(actionId, roleId) {
    const key = `${actionId}:${roleId}`
    return this.actionPermissions.get(key) || false
  }

  // ============ 菜单权限 ============

  /**
   * 设置菜单权限
   */
  setMenuPermission(menuId, roleId, visible) {
    const key = `${menuId}:${roleId}`
    this.menuPermissions.set(key, visible)
    this.permissionCache.clear()
    return this
  }

  /**
   * 检查菜单权限
   */
  hasMenuPermission(menuId, roleId) {
    const key = `${menuId}:${roleId}`
    return this.menuPermissions.get(key) ?? true
  }

  // ============ 数据权限 ============

  /**
   * 设置数据权限范围
   */
  setDataScope(modelId, roleId, scope, config = {}) {
    const key = `${modelId}:${roleId}`
    this.dataPermissions.set(key, {
      scope,
      ...config,
    })
    this.permissionCache.clear()
    return this
  }

  /**
   * 获取数据权限范围
   */
  getDataScope(modelId, roleId) {
    const key = `${modelId}:${roleId}`
    return this.dataPermissions.get(key) || { scope: DataScope.MINE }
  }

  /**
   * 构建数据查询条件（基于数据权限）
   */
  buildDataFilter(modelId, userId) {
    const roles = this.getUserRoles(userId)
    const currentUserId = userId

    // 查找最宽松的数据范围
    let widestScope = DataScope.MINE
    for (const role of roles) {
      const dataPerm = this.getDataScope(modelId, role.id)
      if (dataPerm.scope === DataScope.ALL) {
        return {} // 全部数据，无需过滤
      }
      if (dataPerm.scope === DataScope.DEPT_AND_SUB) {
        widestScope = DataScope.DEPT_AND_SUB
      } else if (dataPerm.scope === DataScope.DEPT && widestScope !== DataScope.DEPT_AND_SUB) {
        widestScope = DataScope.DEPT
      }
    }

    // 构建过滤条件
    switch (widestScope) {
      case DataScope.MINE:
        return { createBy: currentUserId }
      case DataScope.DEPT:
        return { departmentId: '$user.departmentId' }
      case DataScope.DEPT_AND_SUB:
        return { departmentId: { $in: '$user.departmentPath' } }
      default:
        return {}
    }
  }

  // ============ 权限缓存 ============

  /**
   * 获取缓存的权限检查器
   */
  getPermissionChecker(userId) {
    if (this.permissionCache.has(userId)) {
      return this.permissionCache.get(userId)
    }

    const roles = this.getUserRoles(userId)
    const allPermissions = new Set()

    for (const role of roles) {
      if (role.permissions.includes('*')) {
        allPermissions.add('*')
        break
      }
      role.permissions.forEach((p) => allPermissions.add(p))
    }

    const checker = {
      hasPermission: (perm) => allPermissions.has('*') || allPermissions.has(perm),
      roles: roles.map((r) => r.id),
    }

    this.permissionCache.set(userId, checker)
    return checker
  }

  // ============ 工具方法 ============

  /**
   * 批量设置权限
   */
  batchSetPermissions(permissions) {
    permissions.forEach((perm) => {
      const { type, resource, role, ...config } = perm
      if (type === 'model') {
        this.setModelPermission(resource, role, config.operations || [])
      } else if (type === 'field') {
        this.setFieldPermission(perm.modelId, resource, role, config)
      } else if (type === 'action') {
        this.setActionPermission(resource, role, config.allowed)
      } else if (type === 'menu') {
        this.setMenuPermission(resource, role, config.visible)
      } else if (type === 'data') {
        this.setDataScope(resource, role, config.scope, config)
      }
    })
    return this
  }

  /**
   * 获取用户对模型的所有权限
   */
  getUserModelPermissions(userId, modelId) {
    const roles = this.getUserRoles(userId)
    const permissions = {
      canRead: false,
      canWrite: false,
      canCreate: false,
      canDelete: false,
      canSubmit: false,
      canApprove: false,
    }

    for (const role of roles) {
      const ops = this.getModelOperations(modelId, role.id)
      if (ops.includes(Operations.READ)) permissions.canRead = true
      if (ops.includes(Operations.WRITE) || ops.includes(Operations.UPDATE))
        permissions.canWrite = true
      if (ops.includes(Operations.CREATE)) permissions.canCreate = true
      if (ops.includes(Operations.DELETE)) permissions.canDelete = true
      if (ops.includes(Operations.SUBMIT)) permissions.canSubmit = true
      if (ops.includes(Operations.APPROVE)) permissions.canApprove = true
      if (ops.includes(Operations.FULL)) {
        Object.values(permissions).forEach((_, key) => {
          permissions[key] = true
        })
      }
    }

    return permissions
  }

  /**
   * 清除所有权限配置
   */
  clear() {
    this.roles.clear()
    this.userRoles.clear()
    this.modelPermissions.clear()
    this.fieldPermissions.clear()
    this.actionPermissions.clear()
    this.menuPermissions.clear()
    this.dataPermissions.clear()
    this.permissionCache.clear()
    this.roleGroups.clear()

    // 重新注册默认角色
    Object.values(defaultRoles).forEach((role) => {
      this.registerRole(role)
    })
  }

  /**
   * 检查用户权限
   * @param {string} userId - 用户 ID
   * @param {string} permission - 权限描述符
   * @returns {boolean} 是否有权限
   */
  hasPermission(userId, permission) {
    const roles = this.getUserRoles(userId)
    if (!roles || roles.length === 0) {
      return false
    }
    for (const role of roles) {
      if (role.hasPermission && role.hasPermission(permission)) {
        return true
      }
      if (role.permissions && role.permissions.includes(permission)) {
        return true
      }
      if (role.permissions && role.permissions.includes('*')) {
        return true
      }
    }
    return false
  }

  /**
   * 设置菜单权限
   * @param {string} menuId - 菜单 ID
   * @param {string} roleId - 角色 ID
   * @param {boolean} allowed - 是否允许
   */
  setMenuPermission(menuId, roleId, allowed) {
    const key = `${menuId}:${roleId}`
    this.menuPermissions.set(key, allowed)
    return this
  }

  /**
   * 检查菜单权限
   * @param {string} menuId - 菜单 ID
   * @param {string} roleId - 角色 ID
   * @returns {boolean} 是否有权限
   */
  hasMenuPermission(menuId, roleId) {
    const key = `${menuId}:${roleId}`
    return !!this.menuPermissions.get(key)
  }

  /**
   * 设置操作权限
   * @param {string} action - 操作
   * @param {string} roleId - 角色 ID
   * @param {boolean} allowed - 是否允许
   */
  setActionPermission(action, roleId, allowed) {
    const key = `${action}:${roleId}`
    this.actionPermissions.set(key, allowed)
    return this
  }

  /**
   * 检查操作权限
   * @param {string} action - 操作
   * @param {string} roleId - 角色 ID
   * @returns {boolean} 是否有权限
   */
  hasActionPermission(action, roleId) {
    const key = `${action}:${roleId}`
    return !!this.actionPermissions.get(key)
  }
}

// 导出单例
export const permissionManager = new PermissionManagerClass()

// 快捷方法
export const hasPermission = permissionManager.hasModelPermission.bind(permissionManager)
export const hasRole = permissionManager.userHasRole.bind(permissionManager)
export const getUserPermissions = permissionManager.getUserModelPermissions.bind(permissionManager)

export default permissionManager
