/**
 * 超大表单分片加载管理器
 * 支持字段数>500 的超大表单分片渲染与按需加载
 *
 * @author GRI Team
 * @version 1.0
 */

import { EventEmitter } from 'events'

/**
 * 分片配置类
 */
export class SplitConfig {
  constructor(config = {}) {
    this.pageSize = config.pageSize || 50
    this.preloadPages = config.preloadPages || 1
    this.debounceTime = config.debounceTime || 100
    this.virtualScroll = config.virtualScroll ?? true
    this.viewportHeight = config.viewportHeight || 600
    this.fieldHeight = config.fieldHeight || 60
  }
}

/**
 * 字段类
 */
export class Field {
  constructor(config = {}) {
    this.id = config.id || `field_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    this.name = config.name || ''
    this.type = config.type || 'text'
    this.label = config.label || ''
    this.value = config.value || null
    this.required = config.required ?? false
    this.visible = config.visible ?? true
    this.disabled = config.disabled ?? false
    this.order = config.order || 0
    this.group = config.group || 'default'
    this.props = config.props || {}
  }
}

/**
 * 分片加载器类
 */
export class SplitLoader {
  constructor(fields = [], config = {}) {
    this.config = new SplitConfig(config)
    this.allFields = fields
    this.visibleFields = this.getVisibleFields(fields)
    this.currentPage = 0
    this.loading = false
    this.subscribers = new Set()
  }

  getPage(page = this.currentPage) {
    const start = page * this.config.pageSize
    const end = start + this.config.pageSize
    return this.visibleFields.slice(start, end)
  }

  getTotalPages() {
    return Math.ceil(this.visibleFields.length / this.config.pageSize) || 1
  }

  getCurrentPage() {
    return this.currentPage
  }

  setCurrentPage(page) {
    const totalPages = this.getTotalPages()
    if (page < 0 || page >= totalPages) return false
    this.currentPage = page
    this.notify()
    return true
  }

  previousPage() {
    return this.setCurrentPage(this.currentPage - 1)
  }

  nextPage() {
    return this.setCurrentPage(this.currentPage + 1)
  }

  getVisibleFields(fields) {
    return (fields || this.allFields).filter((f) => f.visible)
  }

  subscribe(callback) {
    this.subscribers.add(callback)
    return () => this.subscribers.delete(callback)
  }

  notify() {
    this.subscribers.forEach((cb) => cb(this.getState()))
  }

  getState() {
    return {
      currentPage: this.currentPage,
      totalPages: this.getTotalPages(),
      fields: this.getPage(),
      totalFields: this.visibleFields.length,
    }
  }

  updateField(fieldId, updates) {
    const field = this.allFields.find((f) => f.id === fieldId)
    if (field) {
      Object.assign(field, updates)
      this.visibleFields = this.getVisibleFields()
      this.notify()
    }
  }

  addField(field) {
    this.allFields.push(new Field(field))
    this.visibleFields = this.getVisibleFields()
    this.notify()
  }

  removeField(fieldId) {
    const index = this.allFields.findIndex((f) => f.id === fieldId)
    if (index > -1) {
      this.allFields.splice(index, 1)
      this.visibleFields = this.getVisibleFields()
      this.notify()
    }
  }

  getAllFields() {
    return this.allFields
  }
}

/**
 * 创建分片加载器
 */
export function createSplitLoader(fields, config) {
  return new SplitLoader(fields, config)
}

export default SplitLoader
