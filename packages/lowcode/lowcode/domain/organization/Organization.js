/**
 * GRI 组织架构领域模型
 * 基于领域驱动设计 (DDD) 原则
 *
 * @author GRI Team
 * @version 1.0
 */

import { BaseDomain, ValueObject } from '../BaseDomain.js'
import { BaseEntity } from '../../core/BaseEntity.js'

/**
 * 组织类型枚举
 */
export const OrganizationType = {
  COMPANY: 'company', // 公司
  BRANCH: 'branch', // 分公司
  DEPARTMENT: 'department', // 部门
  TEAM: 'team', // 团队
  STORE: 'store', // 门店
  KITCHEN: 'kitchen', // 厨房
  FARM: 'farm', // 农场/基地
}

/**
 * 组织层级深度限制
 */
export const ORG_LEVEL_LIMITS = {
  maxDepth: 10,
  maxChildren: 1000,
}

/**
 * 组织类型标签（用于显示）
 */
export const ORG_TYPE_LABELS = {
  [OrganizationType.COMPANY]: '公司',
  [OrganizationType.BRANCH]: '分公司',
  [OrganizationType.DEPARTMENT]: '部门',
  [OrganizationType.TEAM]: '团队',
  [OrganizationType.STORE]: '门店',
  [OrganizationType.KITCHEN]: '厨房',
  [OrganizationType.FARM]: '农场',
}

/**
 * 组织类型图标映射
 */
export const ORG_TYPE_ICONS = {
  [OrganizationType.COMPANY]: 'HomeOutlined',
  [OrganizationType.BRANCH]: 'BuildOutlined',
  [OrganizationType.DEPARTMENT]: 'TeamOutlined',
  [OrganizationType.TEAM]: 'GroupOutlined',
  [OrganizationType.STORE]: 'ShopOutlined',
  [OrganizationType.KITCHEN]: 'FireOutlined',
  [OrganizationType.FARM]: 'FieldOutlined',
}

/**
 * 组织配置值对象
 */
export class OrganizationConfig extends ValueObject {
  constructor(values = {}) {
    super({
      // 行业代码（ISIC）
      industryCode: values.industryCode || null,
      // 营业执照号
      businessLicense: values.businessLicense || null,
      // 法人代表
      legalPerson: values.legalPerson || null,
      // 联系电话
      contactPhone: values.contactPhone || null,
      // 地址
      address: values.address || null,
      // 工作时间
      businessHours: values.businessHours || null,
      // 配送范围（公里）
      deliveryRange: values.deliveryRange || 0,
      // 人均消费
      averageConsumption: values.averageConsumption || 0,
      // 营业状态
      businessStatus: values.businessStatus || 'open',
      ...values,
    })
  }

  get(key) {
    return this._values[key]
  }

  set(key, value) {
    const newValues = { ...this._values, [key]: value }
    return new OrganizationConfig(newValues)
  }
}

/**
 * 组织元数据值对象
 */
export class OrganizationMetadata extends ValueObject {
  constructor(values = {}) {
    super({
      // 组织描述
      description: values.description || '',
      // 组织图标
      icon: values.icon || null,
      // 组织颜色
      color: values.color || null,
      // 排序号
      sortOrder: values.sortOrder || 0,
      // 是否启用
      isEnabled: values.isEnabled ?? true,
      // 自定义字段
      customFields: values.customFields || {},
      ...values,
    })
  }

  get(key) {
    return this._values[key]
  }

  withDescription(description) {
    return new OrganizationMetadata({ ...this._values, description })
  }

  withCustomField(key, value) {
    const newCustomFields = { ...this._values.customFields, [key]: value }
    return new OrganizationMetadata({ ...this._values, customFields: newCustomFields })
  }
}

/**
 * 组织实体类
 * 继承 BaseDomain，提供领域行为
 */
export class Organization extends BaseDomain {
  // 私有字段
  #name = ''
  #shortName = ''
  #parentId = null
  #parentPath = ''
  #level = 1
  #type = OrganizationType.COMPANY
  #industry = null
  #settings = {}
  #quotas = {}
  #config = null
  #metadata = null

  constructor(config = {}) {
    super({ ...config, domainType: 'organization' })

    this.#name = config.name || '未命名组织'
    this.#shortName = config.shortName || this.#name
    this.#parentId = config.parentId || null
    this.#parentPath = config.parentPath || '/'
    this.#level = config.level || 1
    this.#type = config.type || OrganizationType.COMPANY
    this.#industry = config.industry || null
    this.#settings = config.settings || {}
    this.#quotas = config.quotas || {}
    this.#config = new OrganizationConfig(config)
    this.#metadata = new OrganizationMetadata(config)
  }

  // ==================== Getter/Setter（封装性）====================

  get name() {
    return this.#name
  }
  get shortName() {
    return this.#shortName
  }
  get parentId() {
    return this.#parentId
  }
  get parentPath() {
    return this.#parentPath
  }
  get level() {
    return this.#level
  }
  get type() {
    return this.#type
  }
  get industry() {
    return this.#industry
  }
  get settings() {
    return { ...this.#settings }
  }
  get quotas() {
    return { ...this.#quotas }
  }
  get config() {
    return this.#config
  }
  get metadata() {
    return this.#metadata
  }

  set name(value) {
    this.triggerHook('beforeUpdate', { field: 'name', oldValue: this.#name, newValue: value })
    this.#name = value
    this._updatedAt = Date.now()
    this.triggerHook('afterUpdate', { field: 'name', oldValue: this.#name, newValue: value })
  }

  set shortName(value) {
    this.triggerHook('beforeUpdate', {
      field: 'shortName',
      oldValue: this.#shortName,
      newValue: value,
    })
    this.#shortName = value
    this._updatedAt = Date.now()
  }

  // ==================== 组织层级方法 ====================

  /**
   * 获取完整路径（从根到当前节点）
   */
  getFullPath() {
    return this.#parentPath ? `${this.#parentPath}/${this._id}` : this._id
  }

  /**
   * 获取祖先 ID 列表
   */
  getAncestorIds() {
    if (!this.#parentPath || this.#parentPath === '/') {
      return []
    }
    return this.#parentPath.split('/').filter(Boolean)
  }

  /**
   * 检查是否是另一个组织的子组织
   */
  isChildOf(ancestorId) {
    return this.#parentPath.includes(ancestorId)
  }

  /**
   * 检查是否是叶子节点
   */
  isLeaf() {
    return (
      this.#type === OrganizationType.STORE ||
      this.#type === OrganizationType.KITCHEN ||
      this.#type === OrganizationType.FARM
    )
  }

  // ==================== 业务规则验证 ====================

  /**
   * 验证组织信息
   */
  validate() {
    const errors = []

    if (!this.#name || this.#name.trim() === '') {
      errors.push('组织名称不能为空')
    }

    if (this.#level < 1 || this.#level > ORG_LEVEL_LIMITS.maxDepth) {
      errors.push(`组织层级必须在 1-${ORG_LEVEL_LIMITS.maxDepth} 之间`)
    }

    if (!Object.values(OrganizationType).includes(this.#type)) {
      errors.push('无效的组织类型')
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
    // 顶级组织不能有父路径
    if (this.#level === 1 && this.#parentPath !== '/') {
      this.#parentPath = '/'
    }

    // 门店/厨房/农场 必须是叶子节点
    if (this.isLeaf()) {
      // 叶子节点逻辑
    }

    return this
  }

  // ==================== 领域事件 ====================

  /**
   * 添加成员时触发
   */
  onMemberAdded(memberId) {
    this.raiseEvent('MEMBER_ADDED', { memberId })
  }

  /**
   * 移除成员时触发
   */
  onMemberRemoved(memberId) {
    this.raiseEvent('MEMBER_REMOVED', { memberId })
  }

  // ==================== 序列化 ====================

  toJSON() {
    return {
      ...super.toJSON(),
      id: this._id,
      name: this.#name,
      shortName: this.#shortName,
      parentId: this.#parentId,
      parentPath: this.#parentPath,
      level: this.#level,
      type: this.#type,
      industry: this.#industry,
      settings: this.#settings,
      quotas: this.#quotas,
      config: this.#config?._values || {},
      metadata: this.#metadata?._values || {},
    }
  }

  /**
   * 从 DTO 创建
   */
  static fromDTO(dto) {
    return new Organization(dto)
  }
}

/**
 * 组织类型判断工具函数
 */
export const OrganizationUtils = {
  /**
   * 判断是否为公司类型
   */
  isCompany(type) {
    return type === OrganizationType.COMPANY
  },

  /**
   * 判断是否为分支机构
   */
  isBranch(type) {
    return type === OrganizationType.BRANCH
  },

  /**
   * 判断是否为部门
   */
  isDepartment(type) {
    return type === OrganizationType.DEPARTMENT
  },

  /**
   * 判断是否为叶子节点类型
   */
  isLeafType(type) {
    return [OrganizationType.STORE, OrganizationType.KITCHEN, OrganizationType.FARM].includes(type)
  },

  /**
   * 获取组织类型标签
   */
  getTypeLabel(type) {
    return ORG_TYPE_LABELS[type] || type
  },

  /**
   * 获取组织类型图标
   */
  getTypeIcon(type) {
    return ORG_TYPE_ICONS[type] || 'HomeOutlined'
  },
}

export default Organization
