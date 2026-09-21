/**
 * GRI 模块管理器
 * 管理 GRI 平台的模块层级结构
 * 遵循：工厂模式、单例模式、观察者模式
 *
 * 模块层级:
 * 1. 一级模块 = 行业维度 (ISIC 行业分类)
 * 2. 二级模块 = 功能维度 (业务场景/子行业)
 * 3. 三级模块 = 服务模式
 * 4. 末端 = 具体应用
 *
 * ISIC 行业分类映射:
 * - A01      农业 (种植、养殖)
 * - C10-C12  食品制造业
 * - G46      批发业 (食材批发)
 * - G47      零售业
 * - H49-H53  物流业 (运输、仓储、配送)
 * - 55       住宿业
 * - 56       餐饮业
 * - M69-M75  专业服务
 *
 * @author GRI Team
 * @version 2.0
 */

import { EventEmitter } from 'events'
import { BaseEntity, HookManager } from './BaseEntity.js'

/**
 * 模块状态枚举
 */
export const ModuleState = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  DEVELOPING: 'developing',
  DEPRECATED: 'deprecated',
}

/**
 * 模块层级枚举
 */
export const ModuleLevel = {
  INDUSTRY: 1, // 行业维度
  FUNCTION: 2, // 功能维度
  SERVICE: 3, // 服务模式
  APP: 4, // 应用
}

/**
 * 模块实体类
 * 继承 BaseEntity，具备封装、继承、钩子能力
 */
export class Module extends BaseEntity {
  // 私有字段（封装性）
  #children = new Map()
  #apps = []
  #icon = null
  #industryCode = null
  #level = ModuleLevel.FUNCTION
  #parent = null

  constructor(config = {}) {
    super(config)

    this._name = config.name || '未命名模块'
    this._nameEn = config.nameEn || this._name
    this.#icon = config.icon || null
    this.#industryCode = config.industryCode || null
    this.#level = config.level || ModuleLevel.FUNCTION
    this.#parent = config.parent || null

    // 初始化子模块
    if (config.children) {
      config.children.forEach((childConfig) => {
        this.addChild(childConfig)
      })
    }

    // 初始化应用
    if (config.apps) {
      this.#apps = [...config.apps]
    }
  }

  // ==================== Getter/Setter ====================

  get name() {
    return this._name
  }
  get nameEn() {
    return this._nameEn
  }
  get icon() {
    return this.#icon
  }
  get industryCode() {
    return this.#industryCode
  }
  get level() {
    return this.#level
  }
  get parent() {
    return this.#parent
  }
  get path() {
    return this.#buildPath()
  }
  get apps() {
    return [...this.#apps]
  }
  get state() {
    return this._status
  }

  set name(value) {
    this.triggerHook('beforeUpdate', { field: 'name', oldValue: this._name, newValue: value })
    this._name = value
    this._updatedAt = Date.now()
    this.triggerHook('afterUpdate', { field: 'name', oldValue: this._name, newValue: value })
  }

  // ==================== 子模块管理 ====================

  /**
   * 添加子模块（工厂模式）
   */
  addChild(childConfig) {
    const child = new Module({
      ...childConfig,
      parent: this,
    })
    this.#children.set(child.id, child)
    this.triggerHook('afterAddChild', { child })
    return child
  }

  /**
   * 移除子模块
   */
  removeChild(childId) {
    const child = this.#children.get(childId)
    if (child) {
      this.triggerHook('beforeRemoveChild', { child })
      this.#children.delete(childId)
      this.triggerHook('afterRemoveChild', { child })
    }
    return child
  }

  /**
   * 获取子模块
   */
  getChild(childId) {
    return this.#children.get(childId)
  }

  /**
   * 获取所有子模块
   */
  getChildren() {
    return Array.from(this.#children.values())
  }

  /**
   * 构建完整路径
   */
  #buildPath() {
    if (this.#parent) {
      return `${this.#parent.path}/${this._id}`
    }
    return this._id
  }

  // ==================== 应用管理 ====================

  /**
   * 添加应用
   */
  addApp(appKey) {
    if (!this.#apps.includes(appKey)) {
      this.#apps.push(appKey)
      this.triggerHook('afterAddApp', { appKey })
    }
    return this
  }

  /**
   * 移除应用
   */
  removeApp(appKey) {
    const index = this.#apps.indexOf(appKey)
    if (index > -1) {
      this.#apps.splice(index, 1)
      this.triggerHook('afterRemoveApp', { appKey })
    }
    return this
  }

  /**
   * 是否包含应用
   */
  hasApp(appKey) {
    return this.#apps.includes(appKey)
  }

  // ==================== 序列化 ====================

  toJSON() {
    return {
      ...super.toJSON(),
      id: this._id,
      name: this._name,
      nameEn: this._nameEn,
      icon: this.#icon,
      industryCode: this.#industryCode,
      level: this.#level,
      path: this.path,
      state: this._status,
      apps: this.#apps,
      children: this.getChildren().map((child) => child.toJSON()),
    }
  }
}

/**
 * 模块工厂（工厂模式）
 */
export class ModuleFactory {
  static #registry = new Map()

  /**
   * 注册模块类型
   */
  static register(type, moduleClass) {
    this.#registry.set(type, moduleClass)
  }

  /**
   * 创建模块实例
   */
  static create(type = 'default', config) {
    const ModuleClass = this.#registry.get(type) || Module
    return new ModuleClass(config)
  }
}

/**
 * 模块管理器单例
 */
class ModuleManagerClass extends EventEmitter {
  #modules = new Map()
  #appModules = new Map() // appKey -> module 映射
  #hookManager = new HookManager()

  constructor() {
    super()
    this.#initDefaultModules()
  }

  /**
   * 初始化默认模块
   * 按照 ISIC 行业分类构建完整的一级模块体系
   */
  #initDefaultModules() {
    // ============================================
    // 第一组：核心行业模块（直接面向消费者）
    // ============================================

    // ==================== 餐饮业 (ISIC 56) ====================
    const catering = new Module({
      id: 'catering',
      name: '餐饮业',
      nameEn: 'Catering',
      industryCode: '56',
      level: ModuleLevel.INDUSTRY,
      icon: 'RestaurantOutlined',
    })

    // 点餐系统 - 二级模块
    const ordering = new Module({
      id: 'ordering',
      name: '点餐系统',
      nameEn: 'Ordering System',
      level: ModuleLevel.FUNCTION,
      parent: catering,
    })

    // 定制化点餐 - 三级模块（服务模式）
    const custom = new Module({
      id: 'custom',
      name: '定制化点餐',
      nameEn: 'Custom Ordering',
      level: ModuleLevel.SERVICE,
      parent: ordering,
      apps: ['gri-restaurant-app'],
    })

    // 传统点餐 - 三级模块
    const traditional = new Module({
      id: 'traditional',
      name: '传统点餐',
      nameEn: 'Traditional Ordering',
      level: ModuleLevel.SERVICE,
      parent: ordering,
    })

    ordering.addChild(custom)
    ordering.addChild(traditional)

    // 厨房管理 - 二级模块
    const kitchenMgmt = new Module({
      id: 'kitchen_mgmt',
      name: '厨房管理',
      nameEn: 'Kitchen Management',
      level: ModuleLevel.FUNCTION,
      parent: catering,
    })

    // 餐厅管理 - 二级模块
    const restaurantMgmt = new Module({
      id: 'restaurant_mgmt',
      name: '餐厅管理',
      nameEn: 'Restaurant Management',
      level: ModuleLevel.FUNCTION,
      parent: catering,
    })

    catering.addChild(ordering)
    catering.addChild(kitchenMgmt)
    catering.addChild(restaurantMgmt)

    // ==================== 住宿业 (ISIC 55) ====================
    const accommodation = new Module({
      id: 'accommodation',
      name: '住宿业',
      nameEn: 'Accommodation',
      industryCode: '55',
      level: ModuleLevel.INDUSTRY,
      icon: 'HomeOutlined',
    })

    // 客房管理 - 二级模块
    const roomMgmt = new Module({
      id: 'room_mgmt',
      name: '客房管理',
      nameEn: 'Room Management',
      level: ModuleLevel.FUNCTION,
      parent: accommodation,
    })

    // 预订系统 - 二级模块
    const reservation = new Module({
      id: 'reservation',
      name: '预订系统',
      nameEn: 'Reservation System',
      level: ModuleLevel.FUNCTION,
      parent: accommodation,
    })

    accommodation.addChild(roomMgmt)
    accommodation.addChild(reservation)

    // ==================== 零售业 (ISIC G47) ====================
    const retail = new Module({
      id: 'retail',
      name: '零售业',
      nameEn: 'Retail',
      industryCode: 'G47',
      level: ModuleLevel.INDUSTRY,
      icon: 'ShopOutlined',
    })

    // 门店管理 - 二级模块
    const storeMgmt = new Module({
      id: 'store_mgmt',
      name: '门店管理',
      nameEn: 'Store Management',
      level: ModuleLevel.FUNCTION,
      parent: retail,
    })

    // 收银管理 - 二级模块
    const cashierMgmt = new Module({
      id: 'cashier_mgmt',
      name: '收银管理',
      nameEn: 'Cashier Management',
      level: ModuleLevel.FUNCTION,
      parent: retail,
    })

    retail.addChild(storeMgmt)
    retail.addChild(cashierMgmt)

    // ============================================
    // 第二组：供应链行业模块（支撑核心行业）
    // ============================================

    // ==================== 农业 (ISIC A01) ====================
    const agriculture = new Module({
      id: 'agriculture',
      name: '农业',
      nameEn: 'Agriculture',
      industryCode: 'A01',
      level: ModuleLevel.INDUSTRY,
      icon: 'FieldOutlined',
    })

    // 种植管理 - 二级模块
    const planting = new Module({
      id: 'planting',
      name: '种植管理',
      nameEn: 'Planting Management',
      level: ModuleLevel.FUNCTION,
      parent: agriculture,
    })

    // 养殖管理 - 二级模块
    const breeding = new Module({
      id: 'breeding',
      name: '养殖管理',
      nameEn: 'Breeding Management',
      level: ModuleLevel.FUNCTION,
      parent: agriculture,
    })

    // 农产品溯源 - 二级模块
    const traceability = new Module({
      id: 'traceability',
      name: '农产品溯源',
      nameEn: 'Agricultural Traceability',
      level: ModuleLevel.FUNCTION,
      parent: agriculture,
    })

    agriculture.addChild(planting)
    agriculture.addChild(breeding)
    agriculture.addChild(traceability)

    // ==================== 食品制造业 (ISIC C10-C12) ====================
    const manufacturing = new Module({
      id: 'manufacturing',
      name: '食品制造业',
      nameEn: 'Food Manufacturing',
      industryCode: 'C10-C12',
      level: ModuleLevel.INDUSTRY,
      icon: 'FactoryOutlined',
    })

    // 食品加工 - 二级模块
    const foodProcessing = new Module({
      id: 'food_processing',
      name: '食品加工',
      nameEn: 'Food Processing',
      level: ModuleLevel.FUNCTION,
      parent: manufacturing,
    })

    // 质量控制 - 二级模块
    const qualityControl = new Module({
      id: 'quality_control',
      name: '质量控制',
      nameEn: 'Quality Control',
      level: ModuleLevel.FUNCTION,
      parent: manufacturing,
    })

    manufacturing.addChild(foodProcessing)
    manufacturing.addChild(qualityControl)

    // ==================== 批发业 (ISIC G46) ====================
    const wholesale = new Module({
      id: 'wholesale',
      name: '批发业',
      nameEn: 'Wholesale',
      industryCode: 'G46',
      level: ModuleLevel.INDUSTRY,
      icon: 'BulkOutlined',
    })

    // 供应商管理 - 二级模块
    const supplierMgmt = new Module({
      id: 'supplier_mgmt',
      name: '供应商管理',
      nameEn: 'Supplier Management',
      level: ModuleLevel.FUNCTION,
      parent: wholesale,
    })

    // 采购管理 - 二级模块
    const procurement = new Module({
      id: 'procurement',
      name: '采购管理',
      nameEn: 'Procurement Management',
      level: ModuleLevel.FUNCTION,
      parent: wholesale,
    })

    // 食材批发 - 二级模块
    const ingredientWholesale = new Module({
      id: 'ingredient_wholesale',
      name: '食材批发',
      nameEn: 'Ingredient Wholesale',
      level: ModuleLevel.FUNCTION,
      parent: wholesale,
    })

    wholesale.addChild(supplierMgmt)
    wholesale.addChild(procurement)
    wholesale.addChild(ingredientWholesale)

    // ==================== 物流业 (ISIC H49-H53) ====================
    const logistics = new Module({
      id: 'logistics',
      name: '物流业',
      nameEn: 'Logistics',
      industryCode: 'H49-H53',
      level: ModuleLevel.INDUSTRY,
      icon: 'CarOutlined',
    })

    // 配送管理 - 二级模块
    const deliveryMgmt = new Module({
      id: 'delivery_mgmt',
      name: '配送管理',
      nameEn: 'Delivery Management',
      level: ModuleLevel.FUNCTION,
      parent: logistics,
    })

    // 路线规划 - 二级模块
    const routePlanning = new Module({
      id: 'route_planning',
      name: '路线规划',
      nameEn: 'Route Planning',
      level: ModuleLevel.FUNCTION,
      parent: logistics,
    })

    // 仓储服务 - 二级模块
    const warehouse = new Module({
      id: 'warehouse',
      name: '仓储服务',
      nameEn: 'Warehouse Service',
      level: ModuleLevel.FUNCTION,
      parent: logistics,
    })

    logistics.addChild(deliveryMgmt)
    logistics.addChild(routePlanning)
    logistics.addChild(warehouse)

    // ============================================
    // 第三组：支撑服务模块
    // ============================================

    // ==================== 专业服务 (ISIC M69-M75) ====================
    const professional = new Module({
      id: 'professional',
      name: '专业服务',
      nameEn: 'Professional Services',
      industryCode: 'M69-M75',
      level: ModuleLevel.INDUSTRY,
      icon: 'UserOutlined',
    })

    // 法律服务 - 二级模块
    const legal = new Module({
      id: 'legal',
      name: '法律服务',
      nameEn: 'Legal Service',
      level: ModuleLevel.FUNCTION,
      parent: professional,
    })

    // 会计审计 - 二级模块
    const accounting = new Module({
      id: 'accounting',
      name: '会计审计',
      nameEn: 'Accounting & Audit',
      level: ModuleLevel.FUNCTION,
      parent: professional,
    })

    // 咨询服务 - 二级模块
    const consulting = new Module({
      id: 'consulting',
      name: '咨询服务',
      nameEn: 'Consulting Service',
      level: ModuleLevel.FUNCTION,
      parent: professional,
    })

    professional.addChild(legal)
    professional.addChild(accounting)
    professional.addChild(consulting)

    // ==================== 平台管理 (跨行业支撑) ====================
    const platform = new Module({
      id: 'platform',
      name: '平台管理',
      nameEn: 'Platform Administration',
      industryCode: 'PLATFORM',
      level: ModuleLevel.INDUSTRY,
      icon: 'SettingOutlined',
    })

    // 组织管理 - 二级模块
    const orgMgmt = new Module({
      id: 'org_mgmt',
      name: '组织管理',
      nameEn: 'Organization Management',
      level: ModuleLevel.FUNCTION,
      parent: platform,
    })

    // 主数据管理 - 二级模块
    const masterData = new Module({
      id: 'master_data',
      name: '主数据管理',
      nameEn: 'Master Data Management',
      level: ModuleLevel.FUNCTION,
      parent: platform,
    })

    // 合规管理 - 二级模块
    const compliance = new Module({
      id: 'compliance',
      name: '合规管理',
      nameEn: 'Compliance Management',
      level: ModuleLevel.FUNCTION,
      parent: platform,
    })

    platform.addChild(orgMgmt)
    platform.addChild(masterData)
    platform.addChild(compliance)

    // ============================================
    // 注册所有模块
    // ============================================

    // 餐饮行业
    this.#modules.set('catering', catering)
    this.#modules.set('ordering', ordering)
    this.#modules.set('custom', custom)
    this.#modules.set('traditional', traditional)
    this.#modules.set('kitchen_mgmt', kitchenMgmt)
    this.#modules.set('restaurant_mgmt', restaurantMgmt)

    // 住宿行业
    this.#modules.set('accommodation', accommodation)
    this.#modules.set('room_mgmt', roomMgmt)
    this.#modules.set('reservation', reservation)

    // 零售行业
    this.#modules.set('retail', retail)
    this.#modules.set('store_mgmt', storeMgmt)
    this.#modules.set('cashier_mgmt', cashierMgmt)

    // 农业
    this.#modules.set('agriculture', agriculture)
    this.#modules.set('planting', planting)
    this.#modules.set('breeding', breeding)
    this.#modules.set('traceability', traceability)

    // 食品制造业
    this.#modules.set('manufacturing', manufacturing)
    this.#modules.set('food_processing', foodProcessing)
    this.#modules.set('quality_control', qualityControl)

    // 批发业
    this.#modules.set('wholesale', wholesale)
    this.#modules.set('supplier_mgmt', supplierMgmt)
    this.#modules.set('procurement', procurement)
    this.#modules.set('ingredient_wholesale', ingredientWholesale)

    // 物流业
    this.#modules.set('logistics', logistics)
    this.#modules.set('delivery_mgmt', deliveryMgmt)
    this.#modules.set('route_planning', routePlanning)
    this.#modules.set('warehouse', warehouse)

    // 专业服务
    this.#modules.set('professional', professional)
    this.#modules.set('legal', legal)
    this.#modules.set('accounting', accounting)
    this.#modules.set('consulting', consulting)

    // 平台管理
    this.#modules.set('platform', platform)
    this.#modules.set('org_mgmt', orgMgmt)
    this.#modules.set('master_data', masterData)
    this.#modules.set('compliance', compliance)

    // 注册应用映射
    this.#appModules.set('gri-restaurant-app', custom)
  }

  // ==================== 模块注册管理 ====================

  /**
   * 注册模块
   */
  registerModule(moduleConfig) {
    const module = ModuleFactory.create('default', moduleConfig)
    this.#modules.set(module.id, module)
    this.#hookManager.triggerSync('register', { module })
    return module
  }

  /**
   * 获取模块
   */
  getModule(moduleId) {
    return this.#modules.get(moduleId)
  }

  /**
   * 获取所有模块
   */
  getAllModules() {
    return Array.from(this.#modules.values())
  }

  /**
   * 获取行业模块（一级模块）
   */
  getIndustryModules() {
    return this.getAllModules().filter((m) => m.level === ModuleLevel.INDUSTRY)
  }

  /**
   * 获取模块树
   */
  getModuleTree() {
    return this.getIndustryModules().map((module) => module.toJSON())
  }

  // ==================== 应用管理 ====================

  /**
   * 添加应用到模块
   */
  addAppToModule(moduleId, appKey) {
    const module = this.#modules.get(moduleId)
    if (!module) {
      throw new Error(`模块不存在：${moduleId}`)
    }

    module.addApp(appKey)
    this.#appModules.set(appKey, module)
    this.#hookManager.triggerSync('addApp', { module, appKey })
    return module
  }

  /**
   * 从模块移除应用
   */
  removeAppFromModule(moduleId, appKey) {
    const module = this.#modules.get(moduleId)
    if (!module) {
      throw new Error(`模块不存在：${moduleId}`)
    }

    module.removeApp(appKey)
    if (module.apps.length === 0 || !module.hasApp(appKey)) {
      this.#appModules.delete(appKey)
    }
    return module
  }

  /**
   * 获取应用所在模块
   */
  getModuleByApp(appKey) {
    return this.#appModules.get(appKey)
  }

  // ==================== 钩子管理 ====================

  /**
   * 注册钩子
   */
  on(name, callback, priority) {
    this.#hookManager.register(name, callback, priority)
    return this
  }

  // ==================== 模块删除 ====================

  /**
   * 删除模块
   */
  deleteModule(moduleId) {
    const module = this.#modules.get(moduleId)
    if (!module) {
      throw new Error(`模块不存在：${moduleId}`)
    }

    // 删除应用映射
    module.apps.forEach((appKey) => {
      this.#appModules.delete(appKey)
    })

    // 递归删除子模块
    module.getChildren().forEach((child) => {
      this.deleteModule(child.id)
    })

    this.#modules.delete(moduleId)
    this.#hookManager.triggerSync('delete', { moduleId })

    return true
  }

  /**
   * 清空所有模块
   */
  clear() {
    this.#modules.clear()
    this.#appModules.clear()
    this.#hookManager.clear()
  }
}

// 导出单例
export const moduleManager = new ModuleManagerClass()
export default moduleManager
