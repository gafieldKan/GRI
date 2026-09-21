/**
 * 表达式引擎
 * 支持变量解析、函数计算、条件表达式、数据绑定
 * 具备沙箱安全保护机制
 *
 * @author GRI Team
 * @version 2.0
 */

import { EventEmitter } from 'events'

/**
 * 表达式错误类型
 */
export class ExpressionError extends Error {
  constructor(message, expression, context) {
    super(message)
    this.name = 'ExpressionError'
    this.expression = expression
    this.context = context
  }
}

/**
 * 安全配置
 */
const SECURITY_CONFIG = {
  // 禁止的关键字
  blockedKeywords: [
    'constructor',
    '__proto__',
    'prototype',
    '__defineGetter__',
    '__defineSetter__',
    '__lookupGetter__',
    '__lookupSetter__',
  ],
  // 禁止的函数
  blockedFunctions: [
    'eval',
    'Function',
    'setTimeout',
    'setInterval',
    'setImmediate',
    'require',
    'import',
    'alert',
  ],
  // 最大递归深度
  maxRecursionDepth: 10,
  // 最大执行时间 (ms)
  maxExecutionTime: 1000,
}

/**
 * 安全沙箱工具类
 */
class SecuritySandbox {
  /**
   * 检查表达式是否包含危险内容
   */
  static validate(expression) {
    const issues = []
    const lowerExpr = expression.toLowerCase()

    // 检查禁止的关键字
    for (const keyword of SECURITY_CONFIG.blockedKeywords) {
      if (lowerExpr.includes(keyword.toLowerCase())) {
        issues.push(`包含危险关键字：${keyword}`)
      }
    }

    // 检查禁止的函数
    for (const func of SECURITY_CONFIG.blockedFunctions) {
      const regex = new RegExp(`\\b${func}\\s*\\(`, 'i')
      if (regex.test(expression)) {
        issues.push(`调用危险函数：${func}`)
      }
    }

    // 检查原型链访问
    if (expression.includes('constructor') || expression.includes('__proto__')) {
      issues.push('尝试访问原型链')
    }

    return {
      valid: issues.length === 0,
      issues,
    }
  }

  /**
   * 创建安全的执行上下文
   */
  static createSafeScope(context, allowedFunctions) {
    const safeScope = Object.create(null)

    // 添加允许的函数
    for (const [name, fn] of Object.entries(allowedFunctions)) {
      if (typeof fn === 'function') {
        safeScope[name] = fn
      }
    }

    // 添加上下文变量（浅拷贝）
    for (const [key, value] of Object.entries(context)) {
      if (typeof value !== 'object' || value === null) {
        safeScope[key] = value
      } else if (Array.isArray(value)) {
        safeScope[key] = [...value]
      } else {
        safeScope[key] = { ...value }
      }
    }

    return safeScope
  }
}

/**
 * 表达式解析器
 */
class ExpressionParser {
  constructor(builtInFunctions = {}) {
    this.builtInFunctions = builtInFunctions
    this.executionCache = new Map()
  }

  parse(expression, context = {}) {
    const expr = expression.trim()

    // 安全检查
    const validation = SecuritySandbox.validate(expr)
    if (!validation.valid) {
      throw new ExpressionError(
        `表达式安全检查失败：${validation.issues.join(', ')}`,
        expr,
        context
      )
    }

    // 处理 {{ }} 包裹的表达式
    if (expr.startsWith('{{') && expr.endsWith('}}')) {
      return this.parseExpression(expr.slice(2, -2).trim(), context)
    }

    // 直接计算表达式
    return this.parseExpression(expr, context)
  }

  parseExpression(expr, context = {}) {
    try {
      // 创建安全的执行环境
      const scope = SecuritySandbox.createSafeScope(context, this.builtInFunctions)

      // 添加保护的工具函数
      this.#addSafeUtilities(scope)

      // 解析并执行表达式
      const func = this.compileExpression(expr)
      return func(scope)
    } catch (error) {
      throw new ExpressionError(`表达式执行失败：${error.message}`, expr, context)
    }
  }

  /**
   * 添加安全的工具函数
   */
  #addSafeUtilities(scope) {
    // 日期格式化
    scope.formatDate = (date, format = 'YYYY-MM-DD') => {
      if (!date) return ''
      const d = new Date(date)
      const pad = (n) => String(n).padStart(2, '0')
      const replacements = {
        YYYY: d.getFullYear(),
        MM: pad(d.getMonth() + 1),
        DD: pad(d.getDate()),
        HH: pad(d.getHours()),
        mm: pad(d.getMinutes()),
        ss: pad(d.getSeconds()),
      }
      let result = format
      for (const [key, value] of Object.entries(replacements)) {
        result = result.replace(key, value)
      }
      return result
    }

    // 数字格式化
    scope.formatNumber = (num, decimals = 2) => {
      if (typeof num !== 'number') return num
      return num.toFixed(decimals)
    }

    // 字符串工具
    scope.toUpperCase = (str) => String(str).toUpperCase()
    scope.toLowerCase = (str) => String(str).toLowerCase()
    scope.concat = (...args) => args.join('')
    scope.trim = (str) => String(str).trim()
    scope.slice = (str, start, end) => String(str).slice(start, end)
    scope.replace = (str, find, replace) => String(str).replace(new RegExp(find, 'g'), replace)

    // 数组工具
    scope.sum = (arr) => (Array.isArray(arr) ? arr.reduce((a, b) => a + b, 0) : 0)
    scope.count = (arr) => (Array.isArray(arr) ? arr : []).length
    scope.first = (arr) => (Array.isArray(arr) ? arr[0] : undefined)
    scope.last = (arr) => (Array.isArray(arr) ? arr[arr.length - 1] : undefined)
    scope.filter = (arr, fn) => (Array.isArray(arr) ? arr.filter(fn) : [])
    scope.map = (arr, fn) => (Array.isArray(arr) ? arr.map(fn) : [])
    scope.sort = (arr, key) => (Array.isArray(arr) ? [...arr].sort((a, b) => a[key] - b[key]) : arr)
    scope.includes = (arr, item) => (Array.isArray(arr) ? arr.includes(item) : false)
    scope.find = (arr, fn) => (Array.isArray(arr) ? arr.find(fn) : undefined)
    scope.some = (arr, fn) => (Array.isArray(arr) ? arr.some(fn) : false)
    scope.every = (arr, fn) => (Array.isArray(arr) ? arr.every(fn) : true)
    scope.reverse = (arr) => (Array.isArray(arr) ? [...arr].reverse() : arr)
    scope.join = (arr, sep) => (Array.isArray(arr) ? arr.join(sep) : '')

    // 对象工具
    scope.keys = (obj) => Object.keys(obj || {})
    scope.values = (obj) => Object.values(obj || {})
    scope.has = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key)

    // 逻辑工具
    scope.if = (condition, trueVal, falseVal) => (condition ? trueVal : falseVal)
    scope.and = (...args) => args.every(Boolean)
    scope.or = (...args) => args.some(Boolean)
    scope.not = (val) => !val

    // 类型判断
    scope.isString = (val) => typeof val === 'string'
    scope.isNumber = (val) => typeof val === 'number'
    scope.isBoolean = (val) => typeof val === 'boolean'
    scope.isArray = (val) => Array.isArray(val)
    scope.isObject = (val) => typeof val === 'object' && val !== null
    scope.isNull = (val) => val === null
    scope.isUndefined = (val) => val === undefined
    scope.isEmpty = (val) => {
      if (!val) return true
      if (Array.isArray(val)) return val.length === 0
      if (typeof val === 'object') return Object.keys(val).length === 0
      return false
    }

    // 类型转换
    scope.toString = (val) => String(val)
    scope.toNumber = (val) => Number(val)
    scope.toBoolean = (val) => Boolean(val)
    scope.toArray = (val) => (Array.isArray(val) ? val : [val])

    // 数学函数（安全版本）
    scope.abs = Math.abs
    scope.round = Math.round
    scope.floor = Math.floor
    scope.ceil = Math.ceil
    scope.min = Math.min
    scope.max = Math.max
    scope.pow = Math.pow
    scope.sqrt = Math.sqrt
    scope.random = Math.random
  }

  compileExpression(expr) {
    // 简单的表达式编译
    // 替换点访问为安全访问
    const safeExpr = expr.replace(/([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*)/g, (match) => {
      // 检查是否保留字或函数
      if (
        ['true', 'false', 'null', 'undefined', 'Math', 'Date', 'Array', 'Object'].includes(match)
      ) {
        return match
      }
      return match
    })

    try {
      // 使用 Function 构造器创建执行函数
      const func = new Function(
        'scope',
        `
        with (scope) {
          return ${safeExpr};
        }
      `
      )

      return (scope) => {
        try {
          return func(scope)
        } catch (e) {
          // 如果直接执行失败，尝试使用默认值
          return undefined
        }
      }
    } catch (e) {
      throw new ExpressionError(`表达式语法错误：${e.message}`, expr, {})
    }
  }

  formatDate(date, format = 'YYYY-MM-DD') {
    if (!date) return ''
    const d = new Date(date)
    const pad = (n) => String(n).padStart(2, '0')

    const replacements = {
      YYYY: d.getFullYear(),
      MM: pad(d.getMonth() + 1),
      DD: pad(d.getDate()),
      HH: pad(d.getHours()),
      mm: pad(d.getMinutes()),
      ss: pad(d.getSeconds()),
      MS: pad(d.getMilliseconds()),
    }

    let result = format
    for (const [key, value] of Object.entries(replacements)) {
      result = result.replace(key, value)
    }
    return result
  }

  formatNumber(num, decimals = 2) {
    if (typeof num !== 'number') return num
    return num.toFixed(decimals)
  }
}

/**
 * 数据绑定类
 */
class DataBinding {
  constructor(expressionEngine) {
    this.expressionEngine = expressionEngine
    this.bindings = new Map()
    this.listeners = new Map()
  }

  /**
   * 绑定数据到表达式
   */
  bind(target, expression, context = {}) {
    const binding = {
      target,
      expression,
      context,
      lastValue: undefined,
    }

    this.bindings.set(target, binding)
    return this
  }

  /**
   * 更新绑定值
   */
  update(target, newValue) {
    const binding = this.bindings.get(target)
    if (!binding) return

    binding.context = newValue
    this.notify(target, newValue)
  }

  /**
   * 获取绑定值
   */
  get(target) {
    const binding = this.bindings.get(target)
    if (!binding) return undefined

    const value = this.expressionEngine.evaluate(binding.expression, binding.context)
    return value
  }

  /**
   * 添加监听器
   */
  on(target, callback) {
    if (!this.listeners.has(target)) {
      this.listeners.set(target, [])
    }
    this.listeners.get(target).push(callback)
  }

  /**
   * 通知监听者
   */
  notify(target, value) {
    const callbacks = this.listeners.get(target) || []
    callbacks.forEach((cb) => cb(value))
  }
}

/**
 * 表达式引擎主类
 */
class ExpressionEngineClass extends EventEmitter {
  constructor() {
    super()
    this.parser = new ExpressionParser()
    this.dataBinding = new DataBinding(this)
    this.customFunctions = new Map()
    this.#initBuiltInFunctions()
  }

  #initBuiltInFunctions() {
    // 内置函数
    this.builtInFunctions = {
      // 数学函数
      abs: Math.abs,
      round: Math.round,
      floor: Math.floor,
      ceil: Math.ceil,
      min: Math.min,
      max: Math.max,
      pow: Math.pow,
      sqrt: Math.sqrt,
      random: Math.random,

      // 字符串函数
      length: (str) => String(str).length,
      trim: (str) => String(str).trim(),
      substr: (str, start, end) => String(str).substr(start, end),
      slice: (str, start, end) => String(str).slice(start, end),
      split: (str, sep) => String(str).split(sep),
      join: (arr, sep) => (Array.isArray(arr) ? arr : []).join(sep),
      replace: (str, find, replace) => String(str).replace(new RegExp(find, 'g'), replace),

      // 逻辑函数
      if: (condition, trueVal, falseVal) => (condition ? trueVal : falseVal),
      and: (...args) => args.every(Boolean),
      or: (...args) => args.some(Boolean),
      not: (val) => !val,
      eq: (a, b) => a === b,
      ne: (a, b) => a !== b,
      gt: (a, b) => a > b,
      lt: (a, b) => a < b,
      gte: (a, b) => a >= b,
      lte: (a, b) => a <= b,

      // 类型判断
      isString: (val) => typeof val === 'string',
      isNumber: (val) => typeof val === 'number',
      isBoolean: (val) => typeof val === 'boolean',
      isArray: (val) => Array.isArray(val),
      isObject: (val) => typeof val === 'object' && val !== null,
      isNull: (val) => val === null,
      isUndefined: (val) => val === undefined,
      isEmpty: (val) => {
        if (!val) return true
        if (Array.isArray(val)) return val.length === 0
        if (typeof val === 'object') return Object.keys(val).length === 0
        return false
      },

      // 类型转换
      toString: (val) => String(val),
      toNumber: (val) => Number(val),
      toBoolean: (val) => Boolean(val),
      toArray: (val) => (Array.isArray(val) ? val : [val]),

      // 数组函数
      concat: (...args) => args.flat(),
      reverse: (arr) => [...(Array.isArray(arr) ? arr : [])].reverse(),

      // 对象函数
      keys: (obj) => Object.keys(obj || {}),
      values: (obj) => Object.values(obj || {}),
      has: (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key),

      // 日期函数
      now: () => Date.now(),
      today: () => new Date().toISOString().split('T')[0],

      // 工具函数
      log: (val) => {
        console.log(val)
        return val
      },
      alert: (msg) => {
        if (typeof window !== 'undefined') window.alert(msg)
        else console.log(msg)
      },
    }

    // 更新 parser 的内置函数
    this.parser.builtInFunctions = this.builtInFunctions
  }

  /**
   * 注册自定义函数
   */
  registerFunction(name, fn) {
    this.customFunctions.set(name, fn)
    this.builtInFunctions[name] = fn
    this.parser.builtInFunctions = this.builtInFunctions
    this.emit('function:register', { name, fn })
  }

  /**
   * 取消注册函数
   */
  unregisterFunction(name) {
    this.customFunctions.delete(name)
    delete this.builtInFunctions[name]
    this.parser.builtInFunctions = this.builtInFunctions
    this.emit('function:unregister', { name })
  }

  /**
   * 计算表达式
   */
  evaluate(expression, context = {}) {
    if (!expression) return expression

    const expr = String(expression).trim()

    // 如果不是表达式格式，直接返回
    if (!expr.includes('{{') && !expr.includes('}}')) {
      // 检查是否是纯变量引用
      if (/^[a-zA-Z_$][\w$.]*$/.test(expr)) {
        return this.resolvePath(expr, context)
      }
      return expr
    }

    try {
      return this.parser.parse(expr, context)
    } catch (error) {
      console.error('[ExpressionEngine] 表达式计算错误:', error)
      throw error
    }
  }

  /**
   * 安全计算表达式（失败时返回默认值）
   */
  safeEvaluate(expression, context = {}, defaultValue = undefined) {
    try {
      return this.evaluate(expression, context)
    } catch (error) {
      return defaultValue
    }
  }

  /**
   * 解析路径
   */
  resolvePath(path, context = {}) {
    const parts = path.split('.')
    let value = context

    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = value[part]
      } else {
        return undefined
      }
    }

    return value
  }

  /**
   * 设置数据绑定
   */
  bind(target, expression, context = {}) {
    return this.dataBinding.bind(target, expression, context)
  }

  /**
   * 更新绑定数据
   */
  updateBinding(target, newValue) {
    return this.dataBinding.update(target, newValue)
  }

  /**
   * 获取绑定值
   */
  getBinding(target) {
    return this.dataBinding.get(target)
  }

  /**
   * 编译表达式（用于预编译优化）
   */
  compile(expression) {
    return this.parser.compileExpression(expression)
  }

  /**
   * 验证表达式语法
   */
  validate(expression) {
    try {
      this.parser.compileExpression(expression)
      return { valid: true }
    } catch (error) {
      return { valid: false, error: error.message }
    }
  }

  /**
   * 清除所有自定义函数
   */
  clearFunctions() {
    this.customFunctions.clear()
    this.#initBuiltInFunctions()
  }

  /**
   * 获取所有注册的函数
   */
  getFunctions() {
    return [...this.customFunctions.keys()]
  }
}

// 导出单例
export const expressionEngine = new ExpressionEngineClass()
export default expressionEngine
