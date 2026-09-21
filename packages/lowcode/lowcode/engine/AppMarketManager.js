/**
 * 应用市场管理器
 * 支持应用模板的浏览、安装、卸载、版本管理
 *
 * @author GRI Team
 * @version 1.0
 */

import { EventEmitter } from 'events'

/**
 * 应用类型枚举
 */
export const AppType = {
  ENTERPRISE: 'enterprise',  // 企业管理类
  CRM: 'crm',                // 客户关系管理
  ERP: 'erp',                // 企业资源计划
  PROJECT: 'project',        // 项目管理
  HR: 'hr',                  // 人力资源
  FINANCE: 'finance',        // 财务管理
  RETAIL: 'retail',          // 零售餐饮
  EDUCATION: 'education',    // 教育培训
  MEDICAL: 'medical',        // 医疗健康
  CUSTOM: 'custom',          // 自定义
}

/**
 * 应用状态枚举
 */
export const AppStatus = {
  NOT_INSTALLED: 'not_installed',
  INSTALLED: 'installed',
  UPDATING: 'updating',
  DISABLED: 'disabled',
}

/**
 * 应用来源枚举
 */
export const AppSource = {
  MARKET: 'market',          // 应用市场
  LOCAL: 'local',            // 本地导入
  CUSTOM: 'custom',          // 自定义开发
}

/**
 * 应用定义类
 */
export class Application {
  constructor(config = {}) {
    this.id = config.id || `app_${Date.now()}`
    this.name = config.name || '未命名应用'
    this.description = config.description || ''
    this.version = config.version || '1.0.0'
    this.author = config.author || 'Anonymous'
    this.source = config.source || AppSource.MARKET
    this.type = config.type || AppType.CUSTOM
    this.category = config.category || 'custom'
    this.tags = config.tags || []
    this.icon = config.icon || '📦'
    this.thumbnail = config.thumbnail || ''
    this.screenshots = config.screenshots || []
    this.manifest = config.manifest || {}
    this.dependencies = config.dependencies || []
    this.settings = config.settings || {}
    this.pages = config.pages || []
    this.models = config.models || []
    this.workflows = config.workflows || []
    this.createdAt = config.createdAt || Date.now()
    this.updatedAt = config.updatedAt || Date.now()
    this.installedAt = config.installedAt || null
    this.downloads = config.downloads || 0
    this.rating = config.rating || 0
    this.size = config.size || 0
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      version: this.version,
      author: this.author,
      source: this.source,
      type: this.type,
      category: this.category,
      tags: this.tags,
      icon: this.icon,
      thumbnail: this.thumbnail,
      screenshots: this.screenshots,
      manifest: this.manifest,
      dependencies: this.dependencies,
      settings: this.settings,
      pages: this.pages,
      models: this.models,
      workflows: this.workflows,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    }
  }

  /**
   * 从 JSON 创建应用
   */
  static fromJSON(jsonString) {
    const data = JSON.parse(jsonString)
    return new Application(data)
  }
}

/**
 * 应用分类配置
 */
const APP_CATEGORIES = {
  all: '全部',
  enterprise: '企业管理',
  crm: '客户关系',
  erp: '资源计划',
  project: '项目管理',
  hr: '人力资源',
  finance: '财务管理',
  retail: '零售餐饮',
  education: '教育培训',
  medical: '医疗健康',
  custom: '自定义',
}

/**
 * 预设应用模板库
 */
const BUILTIN_APPS = [
  {
    id: 'app-crm-001',
    name: '客户关系管理 (CRM)',
    description: '完整的客户管理解决方案，包含客户信息、跟进记录、销售机会、合同管理等功能',
    version: '2.0.0',
    author: 'GRI Team',
    type: AppType.CRM,
    category: 'crm',
    icon: '🤝',
    tags: ['客户管理', '销售', '跟进', '合同'],
    rating: 4.9,
    downloads: 1024,
    size: 2.5,
    pages: [
      { path: '/customers', name: '客户列表' },
      { path: '/customers/new', name: '新建客户' },
      { path: '/opportunities', name: '销售机会' },
      { path: '/contracts', name: '合同管理' },
    ],
    models: ['客户表', '联系人表', '跟进记录', '销售机会', '合同表'],
    workflows: ['客户分配流程', '合同审批流程'],
  },
  {
    id: 'app-project-001',
    name: '项目任务管理',
    description: '敏捷项目管理模板，支持任务分配、进度跟踪、团队协作、工时统计',
    version: '1.5.0',
    author: 'GRI Team',
    type: AppType.PROJECT,
    category: 'project',
    icon: '📋',
    tags: ['项目管理', '任务分配', '进度跟踪', '团队协作'],
    rating: 4.7,
    downloads: 654,
    size: 1.8,
    pages: [
      { path: '/projects', name: '项目列表' },
      { path: '/tasks', name: '任务看板' },
      { path: '/team', name: '团队成员' },
      { path: '/reports', name: '进度报告' },
    ],
    models: ['项目表', '任务表', '成员表', '工时表'],
    workflows: ['任务分配流程', '项目审批流程'],
  },
  {
    id: 'app-restaurant-001',
    name: '餐饮点餐系统',
    description: '适用于餐厅的点餐系统，支持扫码点餐、订单管理、库存管理、会员管理',
    version: '1.2.0',
    author: 'GRI Team',
    type: AppType.RETAIL,
    category: 'retail',
    icon: '🍽️',
    tags: ['点餐', '订单管理', '库存', '会员'],
    rating: 4.9,
    downloads: 892,
    size: 3.2,
    pages: [
      { path: '/menu', name: '菜单管理' },
      { path: '/orders', name: '订单列表' },
      { path: '/tables', name: '桌台管理' },
      { path: '/members', name: '会员管理' },
    ],
    models: ['菜单表', '订单表', '桌台表', '会员表', '库存表'],
    workflows: ['订单处理流程', '库存预警流程'],
  },
  {
    id: 'app-hr-001',
    name: '人事管理系统',
    description: '完整的人事管理解决方案，包含招聘、入职、考勤、绩效、薪资等功能',
    version: '1.8.0',
    author: 'GRI Team',
    type: AppType.HR,
    category: 'hr',
    icon: '👥',
    tags: ['人事', '考勤', '绩效', '薪资'],
    rating: 4.8,
    downloads: 756,
    size: 2.8,
    pages: [
      { path: '/employees', name: '员工管理' },
      { path: '/attendance', name: '考勤管理' },
      { path: '/performance', name: '绩效管理' },
      { path: '/salary', name: '薪资管理' },
    ],
    models: ['员工表', '考勤表', '绩效表', '薪资表', '部门表'],
    workflows: ['入职流程', '请假审批流程', '报销流程'],
  },
  {
    id: 'app-inventory-001',
    name: '库存管理系统',
    description: '简单易用的库存管理模板，支持入库、出库、盘点、调拨等操作',
    version: '1.3.0',
    author: 'GRI Team',
    type: AppType.ERP,
    category: 'erp',
    icon: '📦',
    tags: ['库存', '出入库', '盘点', '调拨'],
    rating: 4.6,
    downloads: 478,
    size: 1.5,
    pages: [
      { path: '/inventory', name: '库存查询' },
      { path: '/inbound', name: '入库管理' },
      { path: '/outbound', name: '出库管理' },
      { path: '/stocktake', name: '盘点管理' },
    ],
    models: ['商品表', '仓库表', '入库单', '出库单', '库存表'],
    workflows: ['入库审批流程', '出库审批流程'],
  },
  {
    id: 'app-finance-001',
    name: '财务管理系统',
    description: '企业财务管理解决方案，包含收支管理、发票管理、报表统计等功能',
    version: '1.0.0',
    author: 'GRI Team',
    type: AppType.FINANCE,
    category: 'finance',
    icon: '💰',
    tags: ['财务', '收支', '发票', '报表'],
    rating: 4.5,
    downloads: 320,
    size: 2.0,
    pages: [
      { path: '/income', name: '收入管理' },
      { path: '/expense', name: '支出管理' },
      { path: '/invoice', name: '发票管理' },
      { path: '/reports', name: '财务报表' },
    ],
    models: ['收入表', '支出表', '发票表', '账户表'],
    workflows: ['报销审批流程', '付款审批流程'],
  },
]

/**
 * 应用市场管理器主类
 */
class AppMarketManagerClass extends EventEmitter {
  constructor() {
    super()
    this.apps = new Map()           // 所有应用
    this.installedApps = new Map()  // 已安装的应用
    this.categories = { ...APP_CATEGORIES }
    this.syncEnabled = true         // 是否启用同步

    // 初始化预设应用
    this.#initBuiltInApps()
  }

  #initBuiltInApps() {
    BUILTIN_APPS.forEach(appConfig => {
      const app = new Application(appConfig)
      this.apps.set(app.id, app)
    })
  }

  /**
   * 注册应用
   */
  register(config) {
    const app = new Application(config)
    this.apps.set(app.id, app)
    this.emit('app:register', { app })
    return app
  }

  /**
   * 获取应用
   */
  get(id) {
    return this.apps.get(id)
  }

  /**
   * 获取所有应用
   */
  getAll() {
    return Array.from(this.apps.values())
  }

  /**
   * 获取市场应用（未安装的）
   */
  getMarketApps() {
    return this.getAll().filter(app => !this.installedApps.has(app.id))
  }

  /**
   * 按类型获取应用
   */
  getByType(type) {
    return this.getAll().filter(app => app.type === type)
  }

  /**
   * 按分类获取应用
   */
  getByCategory(category) {
    return this.getAll().filter(app => app.category === category)
  }

  /**
   * 搜索应用
   */
  search(query, options = {}) {
    const { type, category } = options
    return this.getAll().filter(app => {
      const matchQuery = query === '' ||
        app.name.toLowerCase().includes(query.toLowerCase()) ||
        app.description.toLowerCase().includes(query.toLowerCase()) ||
        app.tags.some(tag => tag.toLowerCase().includes(query.toLowerCase()))
      const matchType = type ? app.type === type : true
      const matchCategory = category ? app.category === category : true
      return matchQuery && matchType && matchCategory
    })
  }

  /**
   * 安装应用
   */
  install(appId) {
    const app = this.apps.get(appId)
    if (!app) {
      throw new Error(`应用不存在：${appId}`)
    }

    // 检查依赖
    if (app.dependencies && app.dependencies.length > 0) {
      const missingDeps = app.dependencies.filter(depId => !this.installedApps.has(depId))
      if (missingDeps.length > 0) {
        throw new Error(`缺少依赖：${missingDeps.join(', ')}`)
      }
    }

    // 安装应用
    this.installedApps.set(appId, {
      ...app,
      installedAt: Date.now(),
      status: AppStatus.INSTALLED,
    })

    app.installedAt = Date.now()
    app.downloads++

    this.emit('app:install', { app })
    return app
  }

  /**
   * 卸载应用
   */
  uninstall(appId) {
    const app = this.apps.get(appId)
    if (app) {
      this.installedApps.delete(appId)
      this.emit('app:uninstall', { app })
      return true
    }
    return false
  }

  /**
   * 获取已安装的应用
   */
  getInstalled() {
    return Array.from(this.installedApps.values())
  }

  /**
   * 检查应用是否已安装
   */
  isInstalled(appId) {
    return this.installedApps.has(appId)
  }

  /**
   * 更新应用
   */
  update(appId, updates) {
    const app = this.apps.get(appId)
    if (!app) {
      throw new Error(`应用不存在：${appId}`)
    }

    Object.assign(app, updates)
    app.updatedAt = Date.now()
    this.emit('app:update', { app })
    return app
  }

  /**
   * 删除应用
   */
  delete(appId) {
    const app = this.apps.get(appId)
    if (app) {
      this.apps.delete(appId)
      this.installedApps.delete(appId)
      this.emit('app:delete', { app })
      return true
    }
    return false
  }

  /**
   * 导出应用
   */
  export(appId) {
    const app = this.apps.get(appId)
    if (!app) {
      return null
    }
    return JSON.stringify(app.toJSON(), null, 2)
  }

  /**
   * 导出为 JSON 文件
   */
  exportAsFile(appId, filename) {
    const json = this.export(appId)
    if (!json) return

    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename || `${appId}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  /**
   * 导入应用
   */
  import(jsonString) {
    try {
      const app = Application.fromJSON(jsonString)
      this.register(app)
      return app
    } catch (error) {
      throw new Error(`导入应用失败：${error.message}`)
    }
  }

  /**
   * 从文件导入
   */
  importFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const app = this.import(e.target.result)
          resolve(app)
        } catch (error) {
          reject(error)
        }
      }
      reader.onerror = reject
      reader.readAsText(file)
    })
  }

  /**
   * 获取分类列表
   */
  getCategories() {
    return this.categories
  }

  /**
   * 添加分类
   */
  addCategory(key, label) {
    this.categories[key] = label
  }

  /**
   * 获取分类统计
   */
  getCategoryStats() {
    const stats = {}
    for (const key of Object.keys(this.categories)) {
      stats[key] = this.getByCategory(key).length
    }
    return stats
  }

  /**
   * 获取应用统计
   */
  getStats() {
    const all = this.getAll()
    const installed = this.getInstalled()
    return {
      total: all.length,
      installed: installed.length,
      market: all.length - installed.length,
      byType: all.reduce((acc, app) => {
        acc[app.type] = (acc[app.type] || 0) + 1
        return acc
      }, {}),
    }
  }

  /**
   * 清除所有应用
   */
  clear() {
    this.apps.clear()
    this.installedApps.clear()
    this.#initBuiltInApps()
  }
}

// 导出单例和常量
export const appMarketManager = new AppMarketManagerClass()
export { APP_CATEGORIES, BUILTIN_APPS }
export default appMarketManager
