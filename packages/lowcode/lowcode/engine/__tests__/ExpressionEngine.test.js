/**
 * 表达式引擎测试
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { expressionEngine, ExpressionError } from '../ExpressionEngine.js'

describe('ExpressionEngine', () => {
  beforeEach(() => {
    // 重置引擎状态
    expressionEngine.clearFunctions()
  })

  describe('基础表达式计算', () => {
    it('应该计算简单算术表达式', () => {
      expect(expressionEngine.evaluate('{{ 1 + 2 }}')).toBe(3)
      expect(expressionEngine.evaluate('{{ 10 - 3 }}')).toBe(7)
      expect(expressionEngine.evaluate('{{ 2 * 3 }}')).toBe(6)
      expect(expressionEngine.evaluate('{{ 15 / 3 }}')).toBe(5)
    })

    it('应该处理运算优先级', () => {
      expect(expressionEngine.evaluate('{{ 1 + 2 * 3 }}')).toBe(7)
      expect(expressionEngine.evaluate('{{ (1 + 2) * 3 }}')).toBe(9)
    })

    it('应该处理字符串字面量', () => {
      expect(expressionEngine.evaluate('{{ "hello" }}')).toBe('hello')
      expect(expressionEngine.evaluate("{{ 'world' }}")).toBe('world')
    })
  })

  describe('变量解析', () => {
    it('应该解析简单变量', () => {
      const context = { name: 'John', age: 30 }
      expect(expressionEngine.evaluate('{{ name }}', context)).toBe('John')
      expect(expressionEngine.evaluate('{{ age }}', context)).toBe(30)
    })

    it('应该解析嵌套对象属性', () => {
      const context = { user: { name: 'John', address: { city: 'NYC' } } }
      expect(expressionEngine.evaluate('{{ user.name }}', context)).toBe('John')
      expect(expressionEngine.evaluate('{{ user.address.city }}', context)).toBe('NYC')
    })

    it('应该处理数组访问', () => {
      const context = { items: ['a', 'b', 'c'] }
      expect(expressionEngine.evaluate('{{ items[0] }}', context)).toBe('a')
    })
  })

  describe('条件表达式', () => {
    it('应该处理三元运算符', () => {
      expect(expressionEngine.evaluate('{{ true ? "yes" : "no" }}')).toBe('yes')
      expect(expressionEngine.evaluate('{{ false ? "yes" : "no" }}')).toBe('no')
    })

    it('应该处理比较运算', () => {
      expect(expressionEngine.evaluate('{{ 5 > 3 }}', {})).toBe(true)
      expect(expressionEngine.evaluate('{{ 5 < 3 }}', {})).toBe(false)
      expect(expressionEngine.evaluate('{{ 5 == 5 }}', {})).toBe(true)
      expect(expressionEngine.evaluate('{{ 5 === 5 }}', {})).toBe(true)
    })

    it('应该处理逻辑运算', () => {
      expect(expressionEngine.evaluate('{{ true && true }}', {})).toBe(true)
      expect(expressionEngine.evaluate('{{ true || false }}', {})).toBe(true)
      expect(expressionEngine.evaluate('{{ !false }}', {})).toBe(true)
    })
  })

  describe('内置函数', () => {
    it('应该支持数学函数', () => {
      expect(expressionEngine.evaluate('{{ abs(-5) }}')).toBe(5)
      expect(expressionEngine.evaluate('{{ round(3.7) }}')).toBe(4)
      expect(expressionEngine.evaluate('{{ floor(3.7) }}')).toBe(3)
      expect(expressionEngine.evaluate('{{ ceil(3.2) }}')).toBe(4)
      expect(expressionEngine.evaluate('{{ max(1, 5, 3) }}')).toBe(5)
      expect(expressionEngine.evaluate('{{ min(1, 5, 3) }}')).toBe(1)
    })

    it('应该支持字符串函数', () => {
      expect(expressionEngine.evaluate('{{ toUpperCase("hello") }}')).toBe('HELLO')
      expect(expressionEngine.evaluate('{{ toLowerCase("HELLO") }}')).toBe('hello')
      expect(expressionEngine.evaluate('{{ length("hello") }}')).toBe(5)
    })

    it('应该支持数组函数', () => {
      expect(expressionEngine.evaluate('{{ sum([1, 2, 3, 4]) }}')).toBe(10)
      expect(expressionEngine.evaluate('{{ count([1, 2, 3]) }}')).toBe(3)
      expect(expressionEngine.evaluate('{{ first([1, 2, 3]) }}')).toBe(1)
      expect(expressionEngine.evaluate('{{ last([1, 2, 3]) }}')).toBe(3)
    })

    it('应该支持类型判断', () => {
      expect(expressionEngine.evaluate('{{ isString("hello") }}')).toBe(true)
      expect(expressionEngine.evaluate('{{ isNumber(123) }}')).toBe(true)
      expect(expressionEngine.evaluate('{{ isBoolean(true) }}')).toBe(true)
      expect(expressionEngine.evaluate('{{ isArray([1, 2]) }}')).toBe(true)
      expect(expressionEngine.evaluate('{{ isObject({}) }}')).toBe(true)
    })

    it('应该支持类型转换', () => {
      expect(expressionEngine.evaluate('{{ toNumber("123") }}')).toBe(123)
      expect(expressionEngine.evaluate('{{ toString(123) }}')).toBe('123')
      expect(expressionEngine.evaluate('{{ toBoolean(true) }}')).toBe(true)
    })
  })

  describe('日期格式化', () => {
    it('应该格式化日期', () => {
      const date = new Date('2024-01-15T10:30:00')
      const context = { date }
      const result = expressionEngine.evaluate('{{ formatDate(date, "YYYY-MM-DD") }}', context)
      expect(result).toBe('2024-01-15')
    })
  })

  describe('安全性测试', () => {
    it('应该阻止访问原型链', () => {
      expect(() => {
        expressionEngine.evaluate('{{ constructor.constructor }}', {})
      }).toThrow()
    })

    it('应该阻止危险函数调用', () => {
      expect(() => {
        expressionEngine.evaluate('{{ eval("1+1") }}', {})
      }).toThrow()
    })

    it('应该阻止 require 调用', () => {
      expect(() => {
        expressionEngine.evaluate('{{ require("fs") }}', {})
      }).toThrow()
    })
  })

  describe('错误处理', () => {
    it('应该抛出 ExpressionError 当表达式无效时', () => {
      expect(() => {
        expressionEngine.evaluate('{{ invalid syntax }}', {})
      }).toThrow(ExpressionError)
    })

    it('应该提供有意义的错误信息', () => {
      try {
        expressionEngine.evaluate('{{ undefinedProp }}', {})
      } catch (error) {
        expect(error.message).toContain('表达式')
      }
    })
  })

  describe('自定义函数', () => {
    it('应该支持注册自定义函数', () => {
      expressionEngine.registerFunction('add', (a, b) => a + b)
      expect(expressionEngine.evaluate('{{ add(2, 3) }}')).toBe(5)
    })

    it('应该支持获取已注册函数列表', () => {
      expressionEngine.registerFunction('testFn', () => {})
      const functions = expressionEngine.getFunctions()
      expect(functions).toContain('testFn')
    })
  })

  describe('表达式验证', () => {
    it('应该验证表达式语法', () => {
      const valid = expressionEngine.validate('1 + 2')
      expect(valid.valid).toBe(true)
    })

    it('应该识别无效表达式', () => {
      const result = expressionEngine.validate('1 + * 2')
      expect(result.valid).toBe(false)
    })
  })
})
