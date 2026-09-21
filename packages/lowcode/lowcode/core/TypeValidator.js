/**
 * 类型验证工具
 * 提供运行时类型检查和验证功能
 *
 * @author GRI Team
 * @version 1.0
 */

/**
 * 验证错误类
 */
export class ValidationError extends Error {
  constructor(field, expected, actual, message) {
    super(message || `类型验证失败：字段 "${String(field)}" 期望 ${expected}，实际得到 ${actual}`)
    this.name = 'ValidationError'
    this.field = field
    this.expected = expected
    this.actual = actual
  }
}

/**
 * 快捷验证方法（不抛出异常的版本由 TypeCheck 提供）
 */

/**
 * 类型验证器类
 */
export class TypeValidator {
  /**
   * 验证类型
   * @param {*} value - 要验证的值
   * @param {string} expectedType - 期望的类型
   * @param {string} fieldName - 字段名
   * @throws {ValidationError} 类型不匹配时抛出
   */
  static validateType(value, expectedType, fieldName = 'value') {
    const actualType = typeof value
    const actualDisplay = value === null ? 'null' : actualType

    if (expectedType === 'any') return true

    if (expectedType === 'object') {
      if (value !== null && actualType !== 'object') {
        throw new ValidationError(fieldName, expectedType, actualDisplay)
      }
      return true
    }

    if (expectedType === 'array') {
      if (!Array.isArray(value)) {
        throw new ValidationError(fieldName, 'array', actualDisplay)
      }
      return true
    }

    if (expectedType === 'function') {
      if (actualType !== 'function') {
        throw new ValidationError(fieldName, expectedType, actualDisplay)
      }
      return true
    }

    if (expectedType === 'string') {
      if (actualType !== 'string') {
        throw new ValidationError(fieldName, expectedType, actualDisplay)
      }
      return true
    }

    if (expectedType === 'number') {
      if (actualType !== 'number' || isNaN(value)) {
        throw new ValidationError(fieldName, expectedType, actualDisplay)
      }
      return true
    }

    if (expectedType === 'boolean') {
      if (actualType !== 'boolean') {
        throw new ValidationError(fieldName, expectedType, actualDisplay)
      }
      return true
    }

    if (expectedType === 'null') {
      if (value !== null) {
        throw new ValidationError(fieldName, expectedType, actualDisplay)
      }
      return true
    }

    if (expectedType === 'undefined') {
      if (typeof value !== 'undefined') {
        throw new ValidationError(fieldName, expectedType, actualDisplay)
      }
      return true
    }

    // 枚举类型检查
    if (typeof expectedType === 'object' && expectedType !== null) {
      const values = Object.values(expectedType)
      if (!values.includes(value)) {
        throw new ValidationError(fieldName, `enum(${JSON.stringify(values)}`, value)
      }
      return true
    }

    return true
  }

  /**
   * 验证必填字段
   * @param {*} value - 要验证的值
   * @param {string} fieldName - 字段名
   * @throws {ValidationError} 为空时抛出
   */
  static validateRequired(value, fieldName = 'value') {
    if (value === null || value === undefined || value === '') {
      throw new ValidationError(fieldName, 'required', value === null ? 'null' : typeof value)
    }
    return true
  }

  /**
   * 验证字符串长度
   * @param {string} value - 要验证的字符串
   * @param {number} minLength - 最小长度
   * @param {number} maxLength - 最大长度
   * @param {string} fieldName - 字段名
   * @throws {ValidationError} 长度不符合时抛出
   */
  static validateStringLength(value, minLength = 0, maxLength = Infinity, fieldName = 'value') {
    if (typeof value !== 'string') {
      throw new ValidationError(fieldName, 'string', typeof value)
    }
    if (value.length < minLength || value.length > maxLength) {
      throw new ValidationError(
        fieldName,
        `length[${minLength}-${maxLength}]`,
        `length:${value.length}`
      )
    }
    return true
  }

  /**
   * 验证数字范围
   * @param {number} value - 要验证的数字
   * @param {number} min - 最小值
   * @param {number} max - 最大值
   * @param {string} fieldName - 字段名
   * @throws {ValidationError} 超出范围时抛出
   */
  static validateNumberRange(value, min = -Infinity, max = Infinity, fieldName = 'value') {
    if (typeof value !== 'number' || isNaN(value)) {
      throw new ValidationError(fieldName, 'number', typeof value)
    }
    if (value < min || value > max) {
      throw new ValidationError(fieldName, `range[${min}-${max}]`, value)
    }
    return true
  }

  /**
   * 验证邮箱格式
   * @param {string} value - 要验证的邮箱
   * @param {string} fieldName - 字段名
   * @throws {ValidationError} 格式不正确时抛出
   */
  static validateEmail(value, fieldName = 'value') {
    if (typeof value !== 'string') {
      throw new ValidationError(fieldName, 'string', typeof value)
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(value)) {
      throw new ValidationError(fieldName, 'email format', value)
    }
    return true
  }

  /**
   * 验证手机号格式（中国大陆）
   * @param {string} value - 要验证的手机号
   * @param {string} fieldName - 字段名
   * @throws {ValidationError} 格式不正确时抛出
   */
  static validatePhone(value, fieldName = 'value') {
    if (typeof value !== 'string') {
      throw new ValidationError(fieldName, 'string', typeof value)
    }
    const phoneRegex = /^1[3-9]\d{9}$/
    if (!phoneRegex.test(value)) {
      throw new ValidationError(fieldName, 'phone format', value)
    }
    return true
  }

  /**
   * 验证 URL 格式
   * @param {string} value - 要验证的 URL
   * @param {string} fieldName - 字段名
   * @throws {ValidationError} 格式不正确时抛出
   */
  static validateUrl(value, fieldName = 'value') {
    if (typeof value !== 'string') {
      throw new ValidationError(fieldName, 'string', typeof value)
    }
    try {
      new URL(value)
      return true
    } catch {
      throw new ValidationError(fieldName, 'url format', value)
    }
  }

  /**
   * 验证对象结构
   * @param {Object} obj - 要验证的对象
   * @param {Object} schema - 结构定义
   * @param {string} fieldName - 字段名
   * @throws {ValidationError} 结构不符合时抛出
   */
  static validateObjectShape(obj, schema, fieldName = 'object') {
    if (typeof obj !== 'object' || obj === null) {
      throw new ValidationError(fieldName, 'object', typeof obj)
    }

    for (const [key, expectedType] of Object.entries(schema)) {
      if (!(key in obj)) {
        throw new ValidationError(`${fieldName}.${key}`, expectedType, 'undefined')
      }
      this.validateType(obj[key], expectedType, `${fieldName}.${key}`)
    }

    return true
  }

  /**
   * 验证数组元素类型
   * @param {Array} arr - 要验证的数组
   * @param {string} elementType - 元素类型
   * @param {string} fieldName - 字段名
   * @throws {ValidationError} 元素类型不正确时抛出
   */
  static validateArrayElements(arr, elementType, fieldName = 'array') {
    if (!Array.isArray(arr)) {
      throw new ValidationError(fieldName, 'array', typeof arr)
    }

    for (let i = 0; i < arr.length; i++) {
      this.validateType(arr[i], elementType, `${fieldName}[${i}]`)
    }

    return true
  }

  /**
   * 验证枚举值
   * @param {*} value - 要验证的值
   * @param {Object} enumObj - 枚举对象
   * @param {string} fieldName - 字段名
   * @throws {ValidationError} 值不在枚举中时抛出
   */
  static validateEnum(value, enumObj, fieldName = 'value') {
    const values = Object.values(enumObj)
    if (!values.includes(value)) {
      throw new ValidationError(fieldName, `enum(${JSON.stringify(values)})`, value)
    }
    return true
  }

  /**
   * 验证 ID 格式
   * @param {string} value - 要验证的 ID
   * @param {string} fieldName - 字段名
   * @throws {ValidationError} 格式不正确时抛出
   */
  static validateId(value, fieldName = 'value') {
    if (typeof value !== 'string') {
      throw new ValidationError(fieldName, 'string', typeof value)
    }
    if (value.length === 0) {
      throw new ValidationError(fieldName, 'non-empty string', 'empty')
    }
    return true
  }

  /**
   * 验证配置对象
   * @param {Object} config - 要验证的配置对象
   * @param {Object} schema - 配置 schema
   * @param {string} fieldName - 字段名
   * @returns {Object} 验证后的配置（包含默认值）
   */
  static validateConfig(config, schema, fieldName = 'config') {
    if (typeof config !== 'object' || config === null) {
      throw new ValidationError(fieldName, 'object', typeof config)
    }

    const result = {}

    for (const [key, { type, required = false, default: defaultValue }] of Object.entries(schema)) {
      const value = config[key]

      if (required && (value === null || value === undefined)) {
        throw new ValidationError(`${fieldName}.${key}`, 'required', 'undefined')
      }

      if (value === null || value === undefined) {
        result[key] = defaultValue !== undefined ? defaultValue : null
      } else {
        this.validateType(value, type, `${fieldName}.${key}`)
        result[key] = value
      }
    }

    return result
  }
}

/**
 * 类型验证辅助函数（不抛出异常的版本）
 */
export const TypeCheck = {
  isString: (value) => typeof value === 'string',
  isNumber: (value) => typeof value === 'number' && !isNaN(value),
  isBoolean: (value) => typeof value === 'boolean',
  isFunction: (value) => typeof value === 'function',
  isObject: (value) => typeof value === 'object' && value !== null,
  isArray: (value) => Array.isArray(value),
  isNull: (value) => value === null,
  isUndefined: (value) => typeof value === 'undefined',
  isDefined: (value) => value !== null && value !== undefined,
  isEmpty: (value) => {
    if (value === null || value === undefined) return true
    if (typeof value === 'string' || Array.isArray(value)) return value.length === 0
    if (typeof value === 'object') return Object.keys(value).length === 0
    return false
  },
  isEnumValue: (value, enumObj) => Object.values(enumObj).includes(value),
}

/**
 * 快捷验证方法（抛出异常版本）
 */
TypeValidator.validateString = (value, fieldName) => {
  if (typeof value !== 'string') {
    throw new ValidationError(fieldName, 'string', typeof value)
  }
  return true
}

TypeValidator.validateNumber = (value, fieldName) => {
  if (typeof value !== 'number' || isNaN(value)) {
    throw new ValidationError(fieldName, 'number', typeof value)
  }
  return true
}

TypeValidator.validateBoolean = (value, fieldName) => {
  if (typeof value !== 'boolean') {
    throw new ValidationError(fieldName, 'boolean', typeof value)
  }
  return true
}

TypeValidator.validateFunction = (value, fieldName) => {
  if (typeof value !== 'function') {
    throw new ValidationError(fieldName, 'function', typeof value)
  }
  return true
}

TypeValidator.validateObject = (value, fieldName) => {
  if (typeof value !== 'object' || value === null) {
    throw new ValidationError(fieldName, 'object', typeof value)
  }
  return true
}

TypeValidator.validateArray = (value, fieldName) => {
  if (!Array.isArray(value)) {
    throw new ValidationError(fieldName, 'array', Array.isArray(value) ? 'object' : typeof value)
  }
  return true
}

TypeValidator.validateId = (value, fieldName) => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ValidationError(fieldName, 'non-empty string', typeof value)
  }
  return true
}

TypeValidator.validateEnum = (value, enumObj, fieldName) => {
  const values = Object.values(enumObj)
  if (!values.includes(value)) {
    throw new ValidationError(fieldName, `enum(${JSON.stringify(values)})`, value)
  }
  return true
}

export default TypeValidator
