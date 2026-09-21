/**
 * GRI 组织成员领域模型
 * 描述用户与组织的关联关系
 *
 * @author GRI Team
 * @version 1.0
 */

import { BaseDomain } from '../BaseDomain.js'

/**
 * 成员角色枚举
 */
export const MemberRole = {
  OWNER: 'owner', // 所有者
  LEGAL_REPRESENTATIVE: 'legal', // 法人代表
  MANAGER: 'manager', // 经理/管理员
  SUPERVISOR: 'supervisor', // 主管
  MEMBER: 'member', // 普通成员
  EMPLOYEE: 'employee', // 员工
  PARTNER: 'partner', // 合作伙伴
  SUPPLIER: 'supplier', // 供应商
}

/**
 * 成员状态枚举
 */
export const MemberStatus = {
  PENDING: 'pending', // 待审核
  ACTIVE: 'active', // 活跃
  INACTIVE: 'inactive', // 非活跃
  SUSPENDED: 'suspended', // 已暂停
  RESIGNED: 'resigned', // 已离职
  ARCHIVED: 'archived', // 已归档
}

/**
 * 成员头衔/职位枚举（餐饮行业）
 */
export const MemberTitle = {
  // 公司层级
  CEO: 'CEO', // 首席执行官
  COO: 'COO', // 首席运营官
  CFO: 'CFO', // 首席财务官
  GENERAL_MANAGER: '总经理',
  DEPUTY_GENERAL_MANAGER: '副总经理',

  // 运营相关
  OPERATION_DIRECTOR: '运营总监',
  OPERATION_MANAGER: '运营经理',
  STORE_MANAGER: '店长',
  DEPUTY_STORE_MANAGER: '副店长',

  // 厨房相关
  HEAD_CHEF: '行政总厨',
  SOUS_CHEF: '厨师长',
  CHEF: '厨师',
  APPRENTICE: '学徒',

  // 服务相关
  SERVICE_MANAGER: '大堂经理',
  WAITER: '服务员',
  CASHIER: '收银员',

  // 采购相关
  PURCHASING_MANAGER: '采购经理',
  PURCHASING_AGENT: '采购员',

  // 其他
  HR_MANAGER: '人事经理',
  ACCOUNTANT: '会计',
  CASHIER_ACCOUNTANT: '出纳',
  MAINTENANCE: '维修工',
  CLEANER: '清洁工',
  DELIVERY: '配送员',
}

/**
 * 组织成员实体类
 */
export class OrganizationMember extends BaseDomain {
  // 私有字段
  #organizationId = null
  #userId = null
  #roleId = null
  #role = null
  #title = null
  #employeeNo = null
  #department = null
  #directManager = null
  #joinedAt = null
  #signedAt = null
  #signedBy = null
  #metadata = {}

  constructor(config = {}) {
    super({ ...config, domainType: 'organizationMember' })

    this.#organizationId = config.organizationId
    this.#userId = config.userId
    this.#roleId = config.roleId
    this.#role = config.role || MemberRole.MEMBER
    this.#title = config.title
    this.#employeeNo = config.employeeNo
    this.#department = config.department
    this.#directManager = config.directManager
    this.#joinedAt = config.joinedAt ? new Date(config.joinedAt) : new Date()
    this.#signedAt = config.signedAt ? new Date(config.signedAt) : null
    this.#signedBy = config.signedBy
    this.#metadata = config.metadata || {}
  }

  // ==================== Getter/Setter ====================

  get organizationId() {
    return this.#organizationId
  }
  get userId() {
    return this.#userId
  }
  get roleId() {
    return this.#roleId
  }
  get role() {
    return this.#role
  }
  get title() {
    return this.#title
  }
  get employeeNo() {
    return this.#employeeNo
  }
  get department() {
    return this.#department
  }
  get directManager() {
    return this.#directManager
  }
  get joinedAt() {
    return this.#joinedAt
  }
  get signedAt() {
    return this.#signedAt
  }
  get signedBy() {
    return this.#signedBy
  }
  get metadata() {
    return { ...this.#metadata }
  }

  set role(value) {
    if (Object.values(MemberRole).includes(value)) {
      this.triggerHook('beforeUpdate', { field: 'role', oldValue: this.#role, newValue: value })
      this.#role = value
      this._updatedAt = Date.now()
      this.triggerHook('afterUpdate', { field: 'role', oldValue: this.#role, newValue: value })
    }
  }

  set title(value) {
    this.triggerHook('beforeUpdate', { field: 'title', oldValue: this.#title, newValue: value })
    this.#title = value
    this._updatedAt = Date.now()
  }

  // ==================== 状态管理 ====================

  /**
   * 检查成员是否活跃
   */
  isActive() {
    return this._status === MemberStatus.ACTIVE
  }

  /**
   * 激活成员
   */
  activate() {
    this._status = MemberStatus.ACTIVE
    this._updatedAt = Date.now()
    this.triggerHook('afterActivate', { member: this })
    return this
  }

  /**
   * 暂停成员
   */
  suspend() {
    this._status = MemberStatus.SUSPENDED
    this._updatedAt = Date.now()
    this.triggerHook('afterSuspend', { member: this })
    return this
  }

  /**
   * 恢复成员
   */
  resume() {
    if (this._status === MemberStatus.SUSPENDED) {
      this._status = MemberStatus.ACTIVE
      this._updatedAt = Date.now()
      this.triggerHook('afterResume', { member: this })
    }
    return this
  }

  /**
   * 离职处理
   */
  resign() {
    this._status = MemberStatus.RESIGNED
    this._updatedAt = Date.now()
    this.triggerHook('afterResign', { member: this })
    return this
  }

  // ==================== 签字认证 ====================

  /**
   * 签字确认
   */
  sign(userId, timestamp = new Date()) {
    this.#signedAt = timestamp
    this.#signedBy = userId
    this._updatedAt = Date.now()
    this.triggerHook('afterSign', { member: this, userId, timestamp })
    return this
  }

  /**
   * 检查是否已签字
   */
  isSigned() {
    return this.#signedAt !== null && this.#signedBy !== null
  }

  // ==================== 业务规则验证 ====================

  /**
   * 验证成员信息
   */
  validate() {
    const errors = []

    if (!this.#organizationId) {
      errors.push('组织 ID 不能为空')
    }

    if (!this.#userId) {
      errors.push('用户 ID 不能为空')
    }

    if (!Object.values(MemberRole).includes(this.#role)) {
      errors.push('无效的成员角色')
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }

  /**
   * 应用业务规则
   */
  applyBusinessRules() {
    // 所有者/法人代表不能有直接上级
    if (this.#role === MemberRole.OWNER || this.#role === MemberRole.LEGAL_REPRESENTATIVE) {
      this.#directManager = null
    }

    return this
  }

  // ==================== 领域事件 ====================

  /**
   * 角色变更时触发
   */
  onRoleChanged(oldRole, newRole) {
    this.raiseEvent('ROLE_CHANGED', { oldRole, newRole, memberId: this._id })
  }

  /**
   * 离职时触发
   */
  onResign() {
    this.raiseEvent('MEMBER_RESIGNED', {
      memberId: this._id,
      organizationId: this.#organizationId,
      userId: this.#userId,
      resignedAt: this._updatedAt,
    })
  }

  // ==================== 序列化 ====================

  toJSON() {
    return {
      ...super.toJSON(),
      id: this._id,
      organizationId: this.#organizationId,
      userId: this.#userId,
      roleId: this.#roleId,
      role: this.#role,
      title: this.#title,
      employeeNo: this.#employeeNo,
      department: this.#department,
      directManager: this.#directManager,
      joinedAt: this.#joinedAt?.toISOString(),
      signedAt: this.#signedAt?.toISOString(),
      signedBy: this.#signedBy,
      metadata: this.#metadata,
    }
  }

  /**
   * 从 DTO 创建
   */
  static fromDTO(dto) {
    return new OrganizationMember(dto)
  }
}

/**
 * 角色工具函数
 */
export const MemberRoleUtils = {
  /**
   * 获取角色层级（数字越小层级越高）
   */
  getRoleLevel(role) {
    const levelMap = {
      [MemberRole.OWNER]: 1,
      [MemberRole.LEGAL_REPRESENTATIVE]: 1,
      [MemberRole.MANAGER]: 2,
      [MemberRole.SUPERVISOR]: 3,
      [MemberRole.MEMBER]: 4,
      [MemberRole.EMPLOYEE]: 4,
      [MemberRole.PARTNER]: 5,
      [MemberRole.SUPPLIER]: 5,
    }
    return levelMap[role] || 99
  },

  /**
   * 检查角色是否可以管理另一个角色
   */
  canManage(managerRole, targetRole) {
    return this.getRoleLevel(managerRole) <= this.getRoleLevel(targetRole)
  },

  /**
   * 获取角色的显示名称
   */
  getRoleLabel(role) {
    const labelMap = {
      [MemberRole.OWNER]: '所有者',
      [MemberRole.LEGAL_REPRESENTATIVE]: '法人代表',
      [MemberRole.MANAGER]: '管理员',
      [MemberRole.SUPERVISOR]: '主管',
      [MemberRole.MEMBER]: '成员',
      [MemberRole.EMPLOYEE]: '员工',
      [MemberRole.PARTNER]: '合作伙伴',
      [MemberRole.SUPPLIER]: '供应商',
    }
    return labelMap[role] || role
  },
}

export default OrganizationMember
