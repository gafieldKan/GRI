/**
 * 数据权限管理器
 * 支持行级权限、字段级权限、数据范围控制、数据脱敏
 *
 * @author GRI Team
 * @version 1.0
 */

import { EventEmitter } from 'events'

/**
 * 数据权限范围枚举
 */
export const DataScope = {
  ALL: 'all', // 全部数据
  MINE: 'mine', // 仅本人数据
  DEPT: 'dept', // 本部门数据
  DEPT_AND_SUB: 'dept_and_sub', // 本部门及子部门数据
  CUSTOM: 'custom', // 自定义范围
  ROLE: 'role', // 按角色分配
}

/**
 * 字段权限级别
 */
export const FieldPermissionLevel = {
  NONE: 'none', // 无权限
  VISIBLE: 'visible', // 仅可见
  EDITABLE: 'editable', // 可编辑
  FULL: 'full', // 完全权限
}

/**
 * 脱敏规则类型
 */
export const MaskType = {
  NONE: 'none', // 不脱敏
  PHONE: 'phone', // 手机号脱敏
  EMAIL: 'email', // 邮箱脱敏
  NAME: 'name', // 姓名脱敏
  ID_CARD: 'idcard', // 身份证脱敏
  BANK_CARD: 'bankcard', // 银行卡脱敏
  ADDRESS: 'address', // 地址脱敏
  CUSTOM: 'custom', // 自定义脱敏
}

/**
 * 脱敏规则类
 */
export class MaskRule {
  constructor(config = {}) {
    this.type = config.type || MaskType.NONE
    this.pattern = config.pattern || '****'
    this.positions = config.positions || [] // 保留的位置
    this.placeholder = config.placeholder || '*'
  }

  apply(value) {
    if (!value || this.type === MaskType.NONE) return value

    switch (this.type) {
      case MaskType.PHONE:
        return this.maskPhone(value)
      case MaskType.EMAIL:
        return this.maskEmail(value)
      case MaskType.NAME:
        return this.maskName(value)
      case MaskType.ID_CARD:
        return this.maskIdCard(value)
      case MaskType.BANK_CARD:
        return this.maskBankCard(value)
      case MaskType.ADDRESS:
        return this.maskAddress(value)
      case MaskType.CUSTOM:
        return this.maskCustom(value, this.pattern, this.positions)
      default:
        return value
    }
  }

  maskPhone(phone) {
    if (!phone || phone.length < 7) return phone
    return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
  }

  maskEmail(email) {
    if (!email || !email.includes('@')) return email
    const [username, domain] = email.split('@')
    const maskedUsername = username.substring(0, 2) + '*'.repeat(Math.max(0, username.length - 2))
    return `${maskedUsername}@${domain}`
  }

  maskName(name) {
    if (!name || name.length < 2) return name
    return name[0] + '*'.repeat(name.length - 1)
  }

  maskIdCard(idCard) {
    if (!idCard || idCard.length < 10) return idCard
    return idCard.replace(/(\d{6})\d{8}(\w{4})/, '$1********$2')
  }

  maskBankCard(cardNo) {
    if (!cardNo || cardNo.length < 8) return cardNo
    return cardNo.replace(/(\d{4})\d+(\d{4})/, `$1****${cardNo.slice(-4)}`)
  }

  maskAddress(address) {
    if (!address) return address
    return address.replace(/[\d\d+][^\d\d+]*/, '[隐藏]')
  }

  maskCustom(value, pattern, positions) {
    if (!value) return value
    let result = String(value)
    if (pattern) {
      result = result.replace(/./g, pattern)
    }
    if (positions && positions.length > 0) {
      const chars = String(value).split('')
      const masked = String(value).split('')
      positions.forEach((pos) => {
        if (pos >= 0 && pos < chars.length) {
          masked[pos] = chars[pos]
        }
      })
      return masked.join('')
    }
    return result
  }
}

/**
 * 行级权限规则类
 */
export class RowPermissionRule {
  constructor(config = {}) {
    this.id = config.id || `row_rule_${Date.now()}`
    this.name = config.name || '行权限规则'
    this.description = config.description || ''
    this.model = config.model // 适用的数据模型
    this.scope = config.scope || DataScope.MINE // 数据范围
    this.conditions = config.conditions || [] // 自定义条件
    this.sqlFragment = config.sqlFragment // 自定义 SQL 片段
    this.priority = config.priority || 0 // 优先级
    this.enabled = config.enabled ?? true
    this.roles = config.roles || [] // 适用的角色
    this.users = config.users || [] // 适用的用户
    this.departments = config.departments || [] // 适用的部门
  }

  /**
   * 生成查询条件
   */
  toQueryFilter(context = {}) {
    const { userId, deptId, deptPath } = context

    switch (this.scope) {
      case DataScope.ALL:
        return {}
      case DataScope.MINE:
        return { created_by: userId }
      case DataScope.DEPT:
        return { dept_id: deptId }
      case DataScope.DEPT_AND_SUB:
        return { dept_id: { $in: deptPath?.split(',') || [] } }
      case DataScope.CUSTOM:
        return this.buildCustomConditions()
      default:
        return { created_by: userId }
    }
  }

  /**
   * 构建自定义条件
   */
  buildCustomConditions() {
    const conditions = []
    for (const cond of this.conditions) {
      const { field, operator, value, valueType = 'static' } = cond
      conditions.push({ [field]: { [operator]: value } })
    }
    return conditions.length > 0 ? { $and: conditions } : {}
  }

  /**
   * 生成 SQL WHERE 子句
   */
  toSqlWhere(tableAlias = '') {
    const prefix = tableAlias ? `${tableAlias}.` : ''
    const filter = this.toQueryFilter()

    if (Object.keys(filter).length === 0) {
      return this.sqlFragment ? `(${this.sqlFragment})` : '1=1'
    }

    const conditions = Object.entries(filter).map(([field, value]) => {
      if (typeof value === 'object' && value.$in) {
        const values = value.$in.map((v) => `'${v}'`).join(',')
        return `${prefix}${field} IN (${values})`
      }
      return `${prefix}${field} = '${value}'`
    })

    return conditions.join(' AND ')
  }

  /**
   * 检查规则是否适用于指定用户/角色
   */
  isApplicable(user, role) {
    if (!this.enabled) return false
    if (this.roles.length > 0 && !this.roles.includes(role?.id)) return false
    if (this.users.length > 0 && !this.users.includes(user?.id)) return false
    return true
  }
}

/**
 * 字段权限配置类
 */
export class FieldPermissionConfig {
  constructor(config = {}) {
    this.model = config.model // 数据模型
    this.field = config.field // 字段名
    this.permissionLevel = config.permissionLevel || FieldPermissionLevel.VISIBLE
    this.maskRule = config.maskRule ? new MaskRule(config.maskRule) : null
    this.roles = config.roles || [] // 适用的角色
    this.conditions = config.conditions || [] // 适用条件
  }

  /**
   * 检查是否有权限
   */
  hasPermission(user, role, action) {
    if (!this.roles.includes(role?.id)) return false

    switch (action) {
      case 'read':
        return this.permissionLevel !== FieldPermissionLevel.NONE
      case 'write':
        return (
          this.permissionLevel === FieldPermissionLevel.EDITABLE ||
          this.permissionLevel === FieldPermissionLevel.FULL
        )
      case 'full':
        return this.permissionLevel === FieldPermissionLevel.FULL
      default:
        return false
    }
  }

  /**
   * 对值进行脱敏处理
   */
  mask(value, user, role) {
    if (!this.maskRule || !this.maskRule.type || this.maskRule.type === MaskType.NONE) {
      return value
    }

    // 如果有查看权限，根据脱敏规则处理
    if (this.hasPermission(user, role, 'read')) {
      return this.maskRule.apply(value)
    }

    // 无查看权限
    return undefined
  }
}

/**
 * 数据权限管理器主类
 */
class DataPermissionManagerClass extends EventEmitter {
  constructor() {
    super()
    this.rowRules = new Map() // modelId -> RowPermissionRule[]
    this.fieldPermissions = new Map() // modelId -> FieldPermissionConfig[]
    this.dataScopes = new Map() // modelId -> DataScope
    this.maskRules = new Map() // fieldId -> MaskRule
  }

  // ==================== 行级权限 ====================

  /**
   * 注册行级权限规则
   */
  registerRowRule(ruleConfig) {
    const rule = new RowPermissionRule(ruleConfig)
    const modelId = rule.model

    if (!this.rowRules.has(modelId)) {
      this.rowRules.set(modelId, [])
    }
    this.rowRules.get(modelId).push(rule)

    // 按优先级排序
    this.rowRules.get(modelId).sort((a, b) => b.priority - a.priority)

    this.emit('rowRule:register', { rule, modelId })
    return rule
  }

  /**
   * 获取模型的行级权限规则
   */
  getRowRules(modelId) {
    return this.rowRules.get(modelId) || []
  }

  /**
   * 删除行级权限规则
   */
  removeRowRule(modelId, ruleId) {
    const rules = this.rowRules.get(modelId)
    if (rules) {
      const index = rules.findIndex((r) => r.id === ruleId)
      if (index > -1) {
        rules.splice(index, 1)
        this.emit('rowRule:remove', { ruleId, modelId })
      }
    }
  }

  /**
   * 生成行级查询条件
   */
  getRowFilter(modelId, user, role) {
    const rules = this.rowRules.get(modelId) || []
    const applicableRules = rules.filter((rule) => rule.isApplicable(user, role))

    if (applicableRules.length === 0) {
      // 没有适用规则，默认只允许访问自己的数据
      return { created_by: user?.id }
    }

    // 取优先级最高的规则
    const topRule = applicableRules[0]
    return topRule.toQueryFilter({
      userId: user?.id,
      deptId: user?.deptId,
      deptPath: user?.deptPath,
    })
  }

  /**
   * 生成 SQL WHERE 子句
   */
  getRowSqlWhere(modelId, user, role, tableAlias) {
    const filter = this.getRowFilter(modelId, user, role)
    if (Object.keys(filter).length === 0) {
      return '1=1'
    }

    const prefix = tableAlias ? `${tableAlias}.` : ''
    const conditions = Object.entries(filter).map(([field, value]) => {
      if (typeof value === 'object' && value.$in) {
        const values = value.$in.map((v) => `'${v}'`).join(',')
        return `${prefix}${field} IN (${values})`
      }
      return `${prefix}${field} = '${value}'`
    })

    return conditions.join(' AND ')
  }

  // ==================== 字段级权限 ====================

  /**
   * 注册字段权限配置
   */
  registerFieldPermission(config) {
    const fieldPerm = new FieldPermissionConfig(config)
    const modelId = fieldPerm.model

    if (!this.fieldPermissions.has(modelId)) {
      this.fieldPermissions.set(modelId, [])
    }
    this.fieldPermissions.get(modelId).push(fieldPerm)

    this.emit('fieldPermission:register', { fieldPerm, modelId })
    return fieldPerm
  }

  /**
   * 获取字段权限配置
   */
  getFieldPermissions(modelId) {
    return this.fieldPermissions.get(modelId) || []
  }

  /**
   * 检查字段访问权限
   */
  checkFieldPermission(modelId, field, user, role, action) {
    const perms = this.fieldPermissions.get(modelId) || []
    const fieldPerm = perms.find((p) => p.field === field)

    if (!fieldPerm) {
      // 没有配置则默认允许
      return true
    }

    return fieldPerm.hasPermission(user, role, action)
  }

  /**
   * 对数据进行脱敏处理
   */
  maskData(modelId, data, user, role) {
    if (!data || !modelId) return data

    const perms = this.fieldPermissions.get(modelId) || []
    const maskedData = Array.isArray(data) ? [...data] : { ...data }

    // 对每个字段应用脱敏规则
    perms.forEach((perm) => {
      if (Array.isArray(maskedData)) {
        maskedData.forEach((item) => {
          if (item[perm.field]) {
            item[perm.field] = perm.mask(item[perm.field], user, role)
          }
        })
      } else {
        if (maskedData[perm.field]) {
          maskedData[perm.field] = perm.mask(maskedData[perm.field], user, role)
        }
      }
    })

    return maskedData
  }

  // ==================== 数据范围 ====================

  /**
   * 设置数据范围
   */
  setDataScope(modelId, scope) {
    this.dataScopes.set(modelId, scope)
    this.emit('dataScope:set', { modelId, scope })
  }

  /**
   * 获取数据范围
   */
  getDataScope(modelId) {
    return this.dataScopes.get(modelId) || DataScope.MINE
  }

  /**
   * 检查数据访问权限
   */
  checkDataAccess(modelId, dataOwnerId, user, role) {
    const scope = this.getDataScope(modelId)
    const { id: userId, deptId, deptPath } = user || {}

    switch (scope) {
      case DataScope.ALL:
        return true
      case DataScope.MINE:
        return dataOwnerId === userId
      case DataScope.DEPT:
        return dataOwnerId === userId || dataOwnerId === deptId
      case DataScope.DEPT_AND_SUB:
        return dataOwnerId === userId || (deptPath && deptPath.includes(dataOwnerId))
      case DataScope.CUSTOM:
        // 自定义范围需要额外的条件判断
        return this.checkCustomDataScope(modelId, dataOwnerId, user, role)
      default:
        return false
    }
  }

  /**
   * 自定义数据范围检查（可扩展）
   */
  checkCustomDataScope(modelId, dataOwnerId, user, role) {
    // 默认实现：只允许访问自己的数据
    return dataOwnerId === user?.id
  }

  // ==================== 工具方法 ====================

  /**
   * 清除所有配置
   */
  clear() {
    this.rowRules.clear()
    this.fieldPermissions.clear()
    this.dataScopes.clear()
    this.maskRules.clear()
    this.emit('clear')
  }

  /**
   * 导出行权限配置
   */
  exportRowRules(modelId) {
    const rules = this.rowRules.get(modelId) || []
    return JSON.stringify(
      rules.map((r) => r),
      null,
      2
    )
  }

  /**
   * 导入权限配置
   */
  importConfig(jsonString) {
    try {
      const config = JSON.parse(jsonString)
      if (config.rowRules) {
        config.rowRules.forEach((ruleConfig) => {
          this.registerRowRule(ruleConfig)
        })
      }
      if (config.fieldPermissions) {
        config.fieldPermissions.forEach((permConfig) => {
          this.registerFieldPermission(permConfig)
        })
      }
      return true
    } catch (error) {
      console.error('导入权限配置失败:', error)
      return false
    }
  }
}

// 导出单例
export const dataPermissionManager = new DataPermissionManagerClass()

// 导出工具函数
export const createMaskRule = (config) => new MaskRule(config)
export const createRowPermissionRule = (config) => new RowPermissionRule(config)
export const createFieldPermissionConfig = (config) => new FieldPermissionConfig(config)

export default dataPermissionManager
