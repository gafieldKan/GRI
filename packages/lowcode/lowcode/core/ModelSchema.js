/**
 * 数据模型 Schema 定义
 * 参考 Frappe DocType 和 NocoBase 数据模型
 * 支持完整的字段类型、验证规则、关联关系
 */

// 字段类型定义
export const FieldType = {
  // 基础类型
  STRING: 'string', // 字符串
  TEXT: 'text', // 长文本
  RICH_TEXT: 'richText', // 富文本
  NUMBER: 'number', // 数字
  INTEGER: 'integer', // 整数
  FLOAT: 'float', // 浮点数
  BOOLEAN: 'boolean', // 布尔值

  // 日期时间
  DATE: 'date', // 日期
  DATETIME: 'datetime', // 日期时间
  TIME: 'time', // 时间

  // 选择类型
  SELECT: 'select', // 单选
  MULTI_SELECT: 'multiSelect', // 多选
  RADIO: 'radio', // 单选按钮
  CHECKBOX: 'checkbox', // 复选框
  TAG: 'tag', // 标签选择

  // 文件类型
  IMAGE: 'image', // 图片
  FILE: 'file', // 文件
  IMAGES: 'images', // 多图片
  FILES: 'files', // 多文件

  // 关联类型
  LINK: 'link', // 链接
  REFERENCE: 'reference', // 引用其他模型
  TABLE: 'table', // 子表

  // 高级类型
  JSON: 'json', // JSON 对象
  CODE: 'code', // 代码
  COLOR: 'color', // 颜色选择
  RATING: 'rating', // 评分
  PERCENT: 'percent', // 百分比
  CURRENCY: 'currency', // 货币
  PHONE: 'phone', // 电话
  EMAIL: 'email', // 邮箱
  URL: 'url', // URL
  ADDRESS: 'address', // 地址
  FORMULA: 'formula', // 公式计算
  AUTO_NUMBER: 'autoNumber', // 自动编号
}

// 验证规则类型
export const ValidationType = {
  REQUIRED: 'required',
  PATTERN: 'pattern',
  MIN: 'min',
  MAX: 'max',
  MIN_LENGTH: 'minLength',
  MAX_LENGTH: 'maxLength',
  UNIQUE: 'unique',
  EMAIL: 'email',
  PHONE: 'phone',
  URL: 'url',
  NUMBER: 'number',
  INTEGER: 'integer',
  CUSTOM: 'custom',
}

// 字段配置基类
export class FieldConfig {
  constructor(config) {
    this.name = config.name
    this.label = config.label || config.name
    this.type = config.type
    this.default = config.default
    this.required = config.required || false
    this.unique = config.unique || false
    this.index = config.index || false
    this.hidden = config.hidden || false
    this.disabled = config.disabled || false
    this.readonly = config.readonly || false
    this.description = config.description || ''
    this.placeholder = config.placeholder || ''
    this.validation = config.validation || []
    this.options = config.options || [] // 用于 select/radio 等
    this.component = config.component // 自定义组件
  }

  /**
   * 验证字段值
   */
  validate(value, data = {}) {
    const errors = []

    // 必填验证
    if (this.required && (value === undefined || value === null || value === '')) {
      errors.push(`${this.label} 是必填项`)
      return errors
    }

    // 如果为空且非必填，跳过后续验证
    if (!value && !this.required) {
      return errors
    }

    // 遍历验证规则
    for (const rule of this.validation) {
      const error = this._validateRule(rule, value, data)
      if (error) {
        errors.push(error)
      }
    }

    return errors
  }

  _validateRule(rule, value, data) {
    switch (rule.type) {
      case 'required':
        return !value ? rule.message || '不能为空' : null
      case 'pattern':
        const regex = new RegExp(rule.pattern)
        return !regex.test(value) ? rule.message || '格式不正确' : null
      case 'min':
        return value < rule.value ? rule.message || `不能小于 ${rule.value}` : null
      case 'max':
        return value > rule.value ? rule.message || `不能大于 ${rule.value}` : null
      case 'minLength':
        return String(value).length < rule.value
          ? rule.message || `长度不能小于 ${rule.value}`
          : null
      case 'maxLength':
        return String(value).length > rule.value
          ? rule.message || `长度不能大于 ${rule.value}`
          : null
      case 'email':
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        return !emailRegex.test(value) ? rule.message || '邮箱格式不正确' : null
      case 'phone':
        const phoneRegex = /^1[3-9]\d{9}$/
        return !phoneRegex.test(value) ? rule.message || '手机号格式不正确' : null
      case 'url':
        try {
          new URL(value)
          return null
        } catch {
          return rule.message || 'URL 格式不正确'
        }
      case 'number':
        return isNaN(Number(value)) ? rule.message || '必须是数字' : null
      case 'integer':
        return !Number.isInteger(Number(value)) ? rule.message || '必须是整数' : null
      case 'custom':
        return rule.validate ? rule.validate(value, data) : null
      default:
        return null
    }
  }
}

// 模型配置类
export class ModelConfig {
  constructor(config) {
    this.id = config.id
    this.name = config.name
    this.label = config.label || config.name
    this.description = config.description || ''
    this.fields = (config.fields || []).map((f) => new FieldConfig(f))
    this.timestamps = config.timestamps ?? true
    this.softDelete = config.softDelete ?? false
    this.indexes = config.indexes || []
    this.uniqueKeys = config.uniqueKeys || []
    this.relationships = config.relationships || []
    this.permissions = config.permissions || {}
    this.hooks = config.hooks || {} // 模型钩子
  }

  /**
   * 获取字段
   */
  getField(fieldName) {
    return this.fields.find((f) => f.name === fieldName)
  }

  /**
   * 添加字段
   */
  addField(fieldConfig) {
    this.fields.push(new FieldConfig(fieldConfig))
    return this
  }

  /**
   * 移除字段
   */
  removeField(fieldName) {
    this.fields = this.fields.filter((f) => f.name !== fieldName)
    return this
  }

  /**
   * 获取所有必填字段
   */
  getRequiredFields() {
    return this.fields.filter((f) => f.required)
  }

  /**
   * 验证数据
   */
  validate(data) {
    const errors = []

    for (const field of this.fields) {
      const value = data[field.name]
      const fieldErrors = field.validate(value, data)
      if (fieldErrors.length > 0) {
        errors.push({
          field: field.name,
          errors: fieldErrors,
        })
      }
    }

    return errors
  }

  /**
   * 转换为 JSON Schema
   */
  toJSONSchema() {
    return {
      $schema: 'http://json-schema.org/draft-07/schema#',
      title: this.label,
      description: this.description,
      type: 'object',
      properties: this.fields.reduce((acc, field) => {
        acc[field.name] = this._fieldToSchema(field)
        return acc
      }, {}),
      required: this.getRequiredFields().map((f) => f.name),
    }
  }

  _fieldToSchema(field) {
    const schema = {
      type: this._getJsonType(field.type),
      description: field.description,
    }

    if (field.default !== undefined) {
      schema.default = field.default
    }

    return schema
  }

  _getJsonType(type) {
    const typeMap = {
      string: 'string',
      text: 'string',
      richText: 'string',
      number: 'number',
      integer: 'number',
      float: 'number',
      boolean: 'boolean',
      date: 'string',
      datetime: 'string',
      time: 'string',
      select: 'string',
      multiSelect: 'array',
      json: 'object',
      table: 'array',
    }
    return typeMap[type] || 'string'
  }
}

// 关联关系类型
export const RelationType = {
  HAS_ONE: 'hasOne', // 一对一
  HAS_MANY: 'hasMany', // 一对多
  BELONGS_TO: 'belongsTo', // 多对一
  MANY_TO_MANY: 'manyToMany', // 多对多
}

// 关联配置
export class RelationConfig {
  constructor(config) {
    this.type = config.type
    this.model = config.model // 关联的模型
    this.field = config.field // 当前模型的字段
    this.foreignField = config.foreignField // 关联模型的字段
    this.through = config.through // 中间表 (多对多)
    this.onDelete = config.onDelete || 'cascade' // cascade, setNull, restrict
    this.onUpdate = config.onUpdate || 'cascade'
  }
}

// 导出辅助函数
export const defineModel = (config) => new ModelConfig(config)
export const defineField = (config) => new FieldConfig(config)

export default {
  FieldType,
  ValidationType,
  FieldConfig,
  ModelConfig,
  RelationType,
  RelationConfig,
  defineModel,
  defineField,
}
