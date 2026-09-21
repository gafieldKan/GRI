/**
 * TypeValidator 类型验证器测试
 */

import { describe, it, expect } from 'vitest'
import { TypeValidator, ValidationError, TypeCheck } from '../../lowcode/core/TypeValidator.js'
import * as Constants from '../../lowcode/core/Constants.js'

describe('TypeValidator', () => {
  describe('validateString', () => {
    it('应该验证字符串成功', () => {
      expect(() => TypeValidator.validateString('hello', 'name')).not.toThrow()
    })

    it('应该验证非字符串失败', () => {
      expect(() => TypeValidator.validateString(123, 'name')).toThrow(ValidationError)
    })

    it('应该验证 null 失败', () => {
      expect(() => TypeValidator.validateString(null, 'name')).toThrow(ValidationError)
    })
  })

  describe('validateNumber', () => {
    it('应该验证数字成功', () => {
      expect(() => TypeValidator.validateNumber(42, 'age')).not.toThrow()
      expect(() => TypeValidator.validateNumber(3.14, 'pi')).not.toThrow()
    })

    it('应该验证非数字失败', () => {
      expect(() => TypeValidator.validateNumber('42', 'age')).toThrow(ValidationError)
    })

    it('应该验证 NaN 失败', () => {
      expect(() => TypeValidator.validateNumber(NaN, 'value')).toThrow(ValidationError)
    })
  })

  describe('validateFunction', () => {
    it('应该验证函数成功', () => {
      expect(() => TypeValidator.validateFunction(() => {}, 'callback')).not.toThrow()
      expect(() => TypeValidator.validateFunction(function () {}, 'fn')).not.toThrow()
    })

    it('应该验证非函数失败', () => {
      expect(() => TypeValidator.validateFunction('not a function', 'fn')).toThrow(
        ValidationError
      )
    })
  })

  describe('validateObject', () => {
    it('应该验证对象成功', () => {
      expect(() => TypeValidator.validateObject({}, 'obj')).not.toThrow()
      expect(() => TypeValidator.validateObject({ name: 'test' }, 'obj')).not.toThrow()
    })

    it('应该验证非对象失败', () => {
      expect(() => TypeValidator.validateObject('not an object', 'obj')).toThrow(
        ValidationError
      )
    })

    it('应该验证 null 失败', () => {
      expect(() => TypeValidator.validateObject(null, 'obj')).toThrow(ValidationError)
    })
  })

  describe('validateArray', () => {
    it('应该验证数组成功', () => {
      expect(() => TypeValidator.validateArray([], 'arr')).not.toThrow()
      expect(() => TypeValidator.validateArray([1, 2, 3], 'arr')).not.toThrow()
    })

    it('应该验证非数组失败', () => {
      expect(() => TypeValidator.validateArray('not an array', 'arr')).toThrow(ValidationError)
    })
  })

  describe('validateId', () => {
    it('应该验证有效 ID 成功', () => {
      expect(() => TypeValidator.validateId('ent_123456', 'id')).not.toThrow()
      expect(() => TypeValidator.validateId('abc123', 'id')).not.toThrow()
    })

    it('应该验证空字符串失败', () => {
      expect(() => TypeValidator.validateId('', 'id')).toThrow(ValidationError)
    })

    it('应该验证非字符串失败', () => {
      expect(() => TypeValidator.validateId(123, 'id')).toThrow(ValidationError)
    })
  })

  describe('validateEnum', () => {
    it('应该验证枚举值成功', () => {
      expect(() => TypeValidator.validateEnum('active', Constants.EntityState, 'status')).not.toThrow()
      expect(() => TypeValidator.validateEnum('pending', Constants.EntityState, 'status')).not.toThrow()
    })

    it('应该验证无效枚举值失败', () => {
      expect(() => TypeValidator.validateEnum('invalid', Constants.EntityState, 'status')).toThrow(
        ValidationError
      )
    })
  })

  describe('validateEmail', () => {
    it('应该验证有效邮箱成功', () => {
      expect(() => TypeValidator.validateEmail('test@example.com', 'email')).not.toThrow()
    })

    it('应该验证无效邮箱失败', () => {
      expect(() => TypeValidator.validateEmail('invalid-email', 'email')).toThrow(ValidationError)
      expect(() => TypeValidator.validateEmail('test@', 'email')).toThrow(ValidationError)
    })
  })

  describe('validatePhone', () => {
    it('应该验证有效手机号成功', () => {
      expect(() => TypeValidator.validatePhone('13800138000', 'phone')).not.toThrow()
      expect(() => TypeValidator.validatePhone('19876543210', 'phone')).not.toThrow()
    })

    it('应该验证无效手机号失败', () => {
      expect(() => TypeValidator.validatePhone('12345678901', 'phone')).toThrow(ValidationError)
      expect(() => TypeValidator.validatePhone('20000000000', 'phone')).toThrow(ValidationError)
    })
  })
})

describe('TypeCheck', () => {
  it('应该正确识别字符串', () => {
    expect(TypeCheck.isString('hello')).toBe(true)
    expect(TypeCheck.isString(123)).toBe(false)
  })

  it('应该正确识别数字', () => {
    expect(TypeCheck.isNumber(42)).toBe(true)
    expect(TypeCheck.isNumber('42')).toBe(false)
    expect(TypeCheck.isNumber(NaN)).toBe(false)
  })

  it('应该正确识别布尔值', () => {
    expect(TypeCheck.isBoolean(true)).toBe(true)
    expect(TypeCheck.isBoolean('true')).toBe(false)
  })

  it('应该正确识别函数', () => {
    expect(TypeCheck.isFunction(() => {})).toBe(true)
    expect(TypeCheck.isFunction('not a function')).toBe(false)
  })

  it('应该正确识别对象', () => {
    expect(TypeCheck.isObject({})).toBe(true)
    expect(TypeCheck.isObject(null)).toBe(false)
    expect(TypeCheck.isObject([])).toBe(true) // 数组在 JS 中也是对象
  })

  it('应该正确识别数组', () => {
    expect(TypeCheck.isArray([])).toBe(true)
    expect(TypeCheck.isArray({})).toBe(false)
  })

  it('应该正确识别 null 和 undefined', () => {
    expect(TypeCheck.isNull(null)).toBe(true)
    expect(TypeCheck.isUndefined(undefined)).toBe(true)
    expect(TypeCheck.isDefined('value')).toBe(true)
    expect(TypeCheck.isDefined(null)).toBe(false)
    expect(TypeCheck.isDefined(undefined)).toBe(false)
  })

  it('应该正确识别空值', () => {
    expect(TypeCheck.isEmpty('')).toBe(true)
    expect(TypeCheck.isEmpty([])).toBe(true)
    expect(TypeCheck.isEmpty({})).toBe(true)
    expect(TypeCheck.isEmpty('not empty')).toBe(false)
    expect(TypeCheck.isEmpty([1])).toBe(false)
  })

  it('应该正确识别枚举值', () => {
    expect(TypeCheck.isEnumValue('active', Constants.EntityState)).toBe(true)
    expect(TypeCheck.isEnumValue('invalid', Constants.EntityState)).toBe(false)
  })
})

describe('ValidationError', () => {
  it('应该创建带有正确信息的错误', () => {
    const error = new ValidationError('testField', 'string', 'number', 'custom message')
    expect(error.name).toBe('ValidationError')
    expect(error.field).toBe('testField')
    expect(error.expected).toBe('string')
    expect(error.actual).toBe('number')
    expect(error.message).toContain('custom message')
  })

  it('应该创建默认消息', () => {
    const error = new ValidationError('field', 'string', 'number')
    expect(error.message).toContain('field')
    expect(error.message).toContain('string')
    expect(error.message).toContain('number')
  })
})
