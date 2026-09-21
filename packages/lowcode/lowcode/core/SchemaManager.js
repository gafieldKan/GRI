/**
 * Schema 管理器
 * 负责管理所有组件和表单的元数据定义
 * 支持热更新和远程下发
 */

import { EventEmitter } from 'events'

// 字段类型定义
export const FieldTypes = {
  STRING: 'string',
  NUMBER: 'number',
  BOOLEAN: 'boolean',
  DATE: 'date',
  DATETIME: 'datetime',
  TIME: 'time',
  SELECT: 'select',
  MULTI_SELECT: 'multiSelect',
  RADIO: 'radio',
  CHECKBOX: 'checkbox',
  TEXT: 'text',
  RICH_TEXT: 'richText',
  UPLOAD: 'upload',
  REFERENCE: 'reference',
  JSON: 'json',
}

// 组件类型定义
export const ComponentTypes = {
  INPUT: 'Input',
  TEXTAREA: 'TextArea',
  SELECT: 'Select',
  RADIO: 'Radio',
  CHECKBOX: 'Checkbox',
  DATE_PICKER: 'DatePicker',
  NUMBER: 'InputNumber',
  SWITCH: 'Switch',
  UPLOAD: 'Upload',
  RICH_TEXT: 'RichText',
  TABLE: 'Table',
  FORM: 'Form',
  BUTTON: 'Button',
  CARD: 'Card',
  MODAL: 'Modal',
}

// Schema 验证器
class SchemaValidator {
  static validate(schema) {
    const errors = []

    if (!schema) {
      errors.push('Schema 不能为空')
      return errors
    }

    if (!schema.id || !schema.name) {
      errors.push('Schema 必须包含 id 和 name')
    }

    if (schema.fields && !Array.isArray(schema.fields)) {
      errors.push('fields 必须是数组')
    }

    return errors
  }

  static validateField(field) {
    const errors = []

    if (!field.name) {
      errors.push('字段必须有 name')
    }

    if (!field.type) {
      errors.push('字段必须有 type')
    }

    return errors
  }
}

class SchemaManagerClass extends EventEmitter {
  constructor() {
    super()
    this.schemas = new Map()
    this.componentSchemas = new Map()
    this.remoteSchemas = new Map()
  }

  /**
   * 注册组件 Schema
   */
  registerComponent(componentId, schema) {
    const errors = SchemaValidator.validate(schema)
    if (errors.length > 0) {
      throw new Error(`Schema 验证失败：${errors.join(', ')}`)
    }

    this.componentSchemas.set(componentId, {
      ...schema,
      updatedAt: Date.now(),
    })

    this.emit('component:registered', { componentId, schema })
    return this
  }

  /**
   * 获取组件 Schema
   */
  getComponent(componentId) {
    return this.componentSchemas.get(componentId)
  }

  /**
   * 注册数据模型 Schema
   */
  registerModel(modelId, schema) {
    const errors = SchemaValidator.validate(schema)
    if (errors.length > 0) {
      throw new Error(`Schema 验证失败：${errors.join(', ')}`)
    }

    this.schemas.set(modelId, {
      ...schema,
      updatedAt: Date.now(),
    })

    this.emit('model:registered', { modelId, schema })
    return this
  }

  /**
   * 获取数据模型 Schema
   */
  getModel(modelId) {
    return this.schemas.get(modelId)
  }

  /**
   * 更新 Schema（支持热更新）
   */
  update(modelId, updates) {
    const existing = this.schemas.get(modelId)
    if (!existing) {
      throw new Error(`模型不存在：${modelId}`)
    }

    const updated = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    }

    this.schemas.set(modelId, updated)
    this.emit('model:updated', { modelId, schema: updated })
    return updated
  }

  /**
   * 从远程加载 Schema（支持远程下发）
   */
  async loadRemote(url, options = {}) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`)
      }

      const schemas = await response.json()

      // 存储远程 schema
      schemas.forEach((schema) => {
        this.remoteSchemas.set(schema.id, schema)
        this.schemas.set(schema.id, schema)
      })

      this.emit('remote:loaded', { count: schemas.length })
      return schemas
    } catch (error) {
      console.error('[SchemaManager] 加载远程 Schema 失败:', error)
      throw error
    }
  }

  /**
   * 获取所有 Schema
   */
  getAll() {
    return Array.from(this.schemas.values())
  }

  /**
   * 获取所有组件 Schema
   */
  getAllComponents() {
    return Array.from(this.componentSchemas.values())
  }

  /**
   * 删除 Schema
   */
  delete(modelId) {
    const deleted = this.schemas.delete(modelId)
    if (deleted) {
      this.emit('model:deleted', { modelId })
    }
    return deleted
  }

  /**
   * 导出 Schema 为 JSON
   */
  exportJSON(modelId) {
    const schema = modelId ? this.schemas.get(modelId) : this.getAll()
    return JSON.stringify(schema, null, 2)
  }

  /**
   * 从 JSON 导入 Schema
   */
  importJSON(jsonString) {
    try {
      const schema = JSON.parse(jsonString)
      if (Array.isArray(schema)) {
        schema.forEach((s) => this.registerModel(s.id, s))
      } else {
        this.registerModel(schema.id, schema)
      }
      return true
    } catch (error) {
      console.error('[SchemaManager] 导入 JSON 失败:', error)
      throw error
    }
  }

  /**
   * 清空所有 Schema
   */
  clear() {
    this.schemas.clear()
    this.componentSchemas.clear()
    this.remoteSchemas.clear()
    this.emit('cleared')
  }
}

// 导出单例
export const schemaManager = new SchemaManagerClass()

export default schemaManager
