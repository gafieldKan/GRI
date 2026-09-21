/**
 * 模型验证器
 *
 * 功能：
 * 1. 基于 ModelSchema 的元数据验证
 * 2. 支持自定义验证器注册
 * 3. 与 Repository 集成，自动验证
 *
 * @author GRI Team
 * @version 1.0
 */

import { EventEmitter } from 'events'
import { ModelConfig, FieldType, ValidationType } from './ModelSchema.js'
import { TypeValidator } from './TypeValidator.js'

/**
 * 模型验证结果
 */
export class ValidationResult {
  constructor() {
    this.valid = true
    this.errors = []
  }

  addError(field, message) {
    this.valid = false
    this.errors.push({ field, message })
  }

  merge(other) {
    if (!other.valid) {
      this.valid = false
      this.errors.push(...other.errors)
    }
  }
}

/**
 * 模型验证器类
 */
class ModelValidatorClass extends EventEmitter {
  constructor() {
    super()
    this.models = new Map()
    this.validators = new Map()
    this.#initBuiltInValidators()
  }

  #initBuiltInValidators() {
    // 字符串验证器
    this.validators.set('string', (value, field, options = {}) => {
      const result = new ValidationResult()
      if (typeof value !== 'string') {
        result.addError(field.name, `${field.name} 必须是字符串`)
      }
      if (options.minLength && value.length < options.minLength) {
        result.addError(field.name, `${field.name} 长度不能少于${options.minLength}个字符`)
      }
      if (options.maxLength && value.length > options.maxLength) {
        result.addError(field.name, `${field.name} 长度不能超过${options.maxLength}个字符`)
      }
      return result
    })

    // 数字验证器
    this.validators.set('number', (value, field, options = {}) => {
      const result = new ValidationResult()
      if (typeof value !== 'number') {
        result.addError(field.name, `${field.name} 必须是数字`)
      }
      if (options.min !== undefined && value < options.min) {
        result.addError(field.name, `${field.name} 不能小于${options.min}`)
      }
      if (options.max !== undefined && value > options.max) {
        result.addError(field.name, `${field.name} 不能大于${options.max}`)
      }
      return result
    })

    // 布尔值验证器
    this.validators.set('boolean', (value, field) => {
      const result = new ValidationResult()
      if (typeof value !== 'boolean') {
        result.addError(field.name, `${field.name} 必须是布尔值`)
      }
      return result
    })

    // 日期验证器
    this.validators.set('date', (value, field) => {
      const result = new ValidationResult()
      if (value && isNaN(new Date(value).getTime())) {
        result.addError(field.name, `${field.name} 必须是有效日期`)
      }
      return result
    })

    // 邮箱验证器
    this.validators.set('email', (value, field) => {
      const result = new ValidationResult()
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (value && !emailRegex.test(value)) {
        result.addError(field.name, `${field.name} 必须是有效邮箱`)
      }
      return result
    })

    // 手机号验证器
    this.validators.set('phone', (value, field) => {
      const result = new ValidationResult()
      const phoneRegex = /^1[3-9]\d{9}$/
      if (value && !phoneRegex.test(value)) {
        result.addError(field.name, `${field.name} 必须是有效手机号`)
      }
      return result
    })
  }

  /**
   * 注册模型
   */
  register(modelName, schema) {
    this.models.set(modelName, schema)
    this.emit('model:register', { modelName, schema })
    return this
  }

  /**
   * 获取模型
   */
  getModel(modelName) {
    return this.models.get(modelName)
  }

  /**
   * 验证数据
   */
  validate(modelName, data, options = {}) {
    const schema = this.models.get(modelName)
    if (!schema) {
      throw new Error(`模型未注册：${modelName}`)
    }

    const result = new ValidationResult()
    const { fields = [] } = schema

    // 字段验证
    for (const field of fields) {
      const value = data[field.name]
      const isRequired = field.required ?? options.required ?? false

      // 必填检查
      if (isRequired && (value === undefined || value === null || value === '')) {
        result.addError(field.name, `${field.name} 是必填项`)
        continue
      }

      // 空值且非必填时跳过
      if (value === undefined || value === null || value === '') {
        continue
      }

      // 获取验证器
      const validatorType = field.type || 'string'
      const validator = this.validators.get(validatorType)

      if (validator) {
        const fieldResult = validator(value, field, field)
        result.merge(fieldResult)
      }
    }

    return result
  }

  /**
   * 验证并抛出异常
   */
  validateOrThrow(modelName, data, options = {}) {
    const result = this.validate(modelName, data, options)
    if (!result.valid) {
      throw new ModelValidationError(result)
    }
    return result
  }

  /**
   * 注册自定义验证器
   */
  registerValidator(type, validator) {
    this.validators.set(type, validator)
    this.emit('validator:register', { type })
    return this
  }
}

/**
 * 模型验证异常类
 */
export class ModelValidationError extends Error {
  constructor(result) {
    const messages = result.errors.map((e) => `${e.field}: ${e.message}`).join('; ')
    super(`模型验证失败：${messages}`)
    this.name = 'ModelValidationError'
    this.result = result
  }
}

// 导出单例
export const modelValidator = new ModelValidatorClass()
export default modelValidator

/**
 * 将验证器应用到 Repository
 */
export class RepositoryValidationPlugin {
  /**
   * 应用插件到 Repository
   */
  static apply(repository, modelName, options = {}) {
    const validator = modelValidator

    // 注册模型配置（如果提供了）
    if (options.fields) {
      validator.register(modelName, options.fields)
    }

    // 包装 save 方法
    const originalSave = repository.save
    repository.save = async function (entity) {
      // 验证数据
      validator.validateOrThrow(modelName, entity)
      // 调用原始 save
      return originalSave.call(this, entity)
    }

    // 包装 update 方法
    const originalUpdate = repository.update
    repository.update = async function (id, data) {
      // 只验证提供的字段
      const partialData = {}
      for (const key of Object.keys(data)) {
        partialData[key] = data[key]
      }
      validator.validateOrThrow(modelName, partialData)
      return originalUpdate.call(this, id, data)
    }

    return repository
  }
}
