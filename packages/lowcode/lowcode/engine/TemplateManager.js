/**
 * 模板管理器
 * 支持应用/页面/表单模板的创建、分享、安装、导出导入
 *
 * @author GRI Team
 * @version 1.0
 */

import { EventEmitter } from 'events'

/**
 * 模板类型枚举
 */
export const TemplateType = {
  APP: 'app',
  PAGE: 'page',
  FORM: 'form',
  MODEL: 'model',
  WORKFLOW: 'workflow',
  COMPONENT: 'component',
}

/**
 * 模板来源枚举
 */
export const TemplateSource = {
  LOCAL: 'local',
  MARKET: 'market',
  CUSTOM: 'custom',
}

/**
 * 模板类
 */
export class Template {
  constructor(config = {}) {
    this.id = config.id || `tpl_${Date.now()}`
    this.name = config.name || '未命名模板'
    this.type = config.type || TemplateType.PAGE
    this.description = config.description || ''
    this.version = config.version || '1.0.0'
    this.author = config.author || 'Anonymous'
    this.source = config.source || TemplateSource.LOCAL
    this.category = config.category || 'uncategorized'
    this.tags = config.tags || []
    this.thumbnail = config.thumbnail || ''
    this.schema = config.schema || {}
    this.dependencies = config.dependencies || []
    this.settings = config.settings || {}
    this.createdAt = config.createdAt || Date.now()
    this.updatedAt = config.updatedAt || Date.now()
    this.downloads = config.downloads || 0
    this.rating = config.rating || 0
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      description: this.description,
      version: this.version,
      author: this.author,
      source: this.source,
      category: this.category,
      tags: this.tags,
      thumbnail: this.thumbnail,
      schema: this.schema,
      dependencies: this.dependencies,
      settings: this.settings,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    }
  }

  /**
   * 从 JSON 创建模板
   */
  static fromJSON(jsonString) {
    const data = JSON.parse(jsonString)
    return new Template(data)
  }
}

/**
 * 模板分类配置
 */
const TEMPLATE_CATEGORIES = {
  uncategorized: '未分类',
  common: '通用模板',
  form: '表单模板',
  list: '列表模板',
  detail: '详情模板',
  dashboard: '仪表盘',
  workflow: '工作流',
  crm: 'CRM 相关',
  erp: 'ERP 相关',
  oa: 'OA 办公',
}

/**
 * 预设模板库
 */
const BUILTIN_TEMPLATES = [
  {
    id: 'tpl_simple_form',
    name: '简单表单',
    type: TemplateType.FORM,
    category: 'form',
    description: '基础表单模板，包含常用表单项',
    schema: {
      type: 'form',
      fields: [
        { name: 'title', type: 'string', label: '标题', required: true },
        { name: 'content', type: 'text', label: '内容' },
        { name: 'status', type: 'select', label: '状态', options: ['draft', 'published'] },
      ],
    },
  },
  {
    id: 'tpl_list_page',
    name: '列表页面',
    type: TemplateType.PAGE,
    category: 'list',
    description: '标准列表页面，包含搜索、分页、操作',
    schema: {
      type: 'page',
      components: [
        { type: 'search-bar', fields: ['keyword', 'status'] },
        { type: 'table', columns: ['name', 'status', 'actions'] },
        { type: 'pagination' },
      ],
    },
  },
  {
    id: 'tpl_detail_page',
    name: '详情页面',
    type: TemplateType.PAGE,
    category: 'detail',
    description: '详情展示页面',
    schema: {
      type: 'page',
      components: [
        { type: 'card', fields: ['title', 'content', 'meta'] },
        { type: 'actions', actions: ['edit', 'delete', 'back'] },
      ],
    },
  },
  {
    id: 'tpl_dashboard',
    name: '数据仪表盘',
    type: TemplateType.PAGE,
    category: 'dashboard',
    description: '数据可视化仪表盘模板',
    schema: {
      type: 'page',
      components: [
        { type: 'stats-cards', data: ['total', 'today', 'pending'] },
        { type: 'chart', chartType: 'line', data: 'trend' },
        { type: 'chart', chartType: 'pie', data: 'distribution' },
      ],
    },
  },
  {
    id: 'tpl_approval_workflow',
    name: '审批工作流',
    type: TemplateType.WORKFLOW,
    category: 'workflow',
    description: '标准审批流程模板',
    schema: {
      type: 'workflow',
      nodes: [
        { id: 'start', type: 'trigger', name: '开始' },
        { id: 'approval', type: 'approval', name: '审批', approver: 'manager' },
        { id: 'condition', type: 'condition', name: '判断', condition: '${approved}' },
        { id: 'end', type: 'end', name: '结束' },
      ],
    },
  },
]

/**
 * 模板管理器主类
 */
class TemplateManagerClass extends EventEmitter {
  constructor() {
    super()
    this.templates = new Map()
    this.installedTemplates = new Set()
    this.categories = { ...TEMPLATE_CATEGORIES }

    // 初始化预设模板
    this.#initBuiltInTemplates()
  }

  #initBuiltInTemplates() {
    BUILTIN_TEMPLATES.forEach((tpl) => {
      const template = new Template(tpl)
      this.templates.set(template.id, template)
    })
  }

  /**
   * 注册模板
   */
  register(config) {
    const template = new Template(config)
    this.templates.set(template.id, template)
    this.emit('template:register', { template })
    return template
  }

  /**
   * 从 Schema 创建模板
   */
  createFromSchema(name, schema, type = TemplateType.PAGE) {
    const template = new Template({
      name,
      type,
      schema,
      source: TemplateSource.CUSTOM,
    })
    this.register(template)
    return template
  }

  /**
   * 获取模板
   */
  get(id) {
    return this.templates.get(id)
  }

  /**
   * 获取所有模板
   */
  getAll() {
    return Array.from(this.templates.values())
  }

  /**
   * 按类型获取模板
   */
  getByType(type) {
    return this.getAll().filter((t) => t.type === type)
  }

  /**
   * 按分类获取模板
   */
  getByCategory(category) {
    return this.getAll().filter((t) => t.category === category)
  }

  /**
   * 搜索模板
   */
  search(query, options = {}) {
    const { type, category } = options
    return this.getAll().filter((t) => {
      const matchQuery =
        t.name.toLowerCase().includes(query.toLowerCase()) ||
        t.description.toLowerCase().includes(query.toLowerCase())
      const matchType = type ? t.type === type : true
      const matchCategory = category ? t.category === category : true
      return matchQuery && matchType && matchCategory
    })
  }

  /**
   * 安装模板
   */
  install(templateId) {
    const template = this.templates.get(templateId)
    if (!template) {
      throw new Error(`模板不存在：${templateId}`)
    }

    this.installedTemplates.add(templateId)
    template.downloads++
    this.emit('template:install', { template })
    return template
  }

  /**
   * 卸载模板
   */
  uninstall(templateId) {
    const template = this.templates.get(templateId)
    if (template) {
      this.installedTemplates.delete(templateId)
      this.emit('template:uninstall', { template })
      return true
    }
    return false
  }

  /**
   * 获取已安装的模板
   */
  getInstalled() {
    return Array.from(this.installedTemplates)
      .map((id) => this.templates.get(id))
      .filter(Boolean)
  }

  /**
   * 检查模板是否已安装
   */
  isInstalled(templateId) {
    return this.installedTemplates.has(templateId)
  }

  /**
   * 导出模板
   */
  export(templateId) {
    const template = this.templates.get(templateId)
    if (!template) {
      return null
    }
    return JSON.stringify(template.toJSON(), null, 2)
  }

  /**
   * 导出为 JSON 文件
   */
  exportAsFile(templateId, filename) {
    const json = this.export(templateId)
    if (!json) return

    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename || `${templateId}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  /**
   * 导入模板
   */
  import(jsonString) {
    try {
      const template = Template.fromJSON(jsonString)
      this.register(template)
      return template
    } catch (error) {
      throw new Error(`导入模板失败：${error.message}`)
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
          const template = this.import(e.target.result)
          resolve(template)
        } catch (error) {
          reject(error)
        }
      }
      reader.onerror = reject
      reader.readAsText(file)
    })
  }

  /**
   * 删除模板
   */
  delete(templateId) {
    const template = this.templates.get(templateId)
    if (template) {
      this.templates.delete(templateId)
      this.installedTemplates.delete(templateId)
      this.emit('template:delete', { template })
      return true
    }
    return false
  }

  /**
   * 更新模板
   */
  update(templateId, updates) {
    const template = this.templates.get(templateId)
    if (!template) {
      throw new Error(`模板不存在：${templateId}`)
    }

    Object.assign(template, updates)
    template.updatedAt = Date.now()
    this.emit('template:update', { template })
    return template
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
   * 清除所有模板
   */
  clear() {
    this.templates.clear()
    this.installedTemplates.clear()
    this.#initBuiltInTemplates()
  }
}

// 导出单例和常量
export const templateManager = new TemplateManagerClass()
export { TEMPLATE_CATEGORIES, BUILTIN_TEMPLATES }
export default templateManager
