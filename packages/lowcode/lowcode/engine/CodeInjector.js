/**
 * 自定义代码注入管理器
 * 支持前后端自定义代码注入、沙箱执行、脚本管理
 *
 * @author GRI Team
 * @version 1.0
 */

import { EventEmitter } from 'events'

/**
 * 注入点枚举
 */
export const InjectPoint = {
  // 前端注入点
  APP_INIT: 'app_init',
  APP_MOUNT: 'app_mount',
  APP_UNMOUNT: 'app_unmount',
  PAGE_LOAD: 'page_load',
  PAGE_UNLOAD: 'page_unload',
  COMPONENT_MOUNT: 'component_mount',
  COMPONENT_UPDATE: 'component_update',
  COMPONENT_UNMOUNT: 'component_unmount',
  API_BEFORE: 'api_before',
  API_AFTER: 'api_after',
  FORM_SUBMIT: 'form_submit',
  FORM_VALIDATE: 'form_validate',

  // 后端注入点
  SERVER_INIT: 'server_init',
  REQUEST_BEFORE: 'request_before',
  REQUEST_AFTER: 'request_after',
  DB_BEFORE: 'db_before',
  DB_AFTER: 'db_after',
}

/**
 * 代码类型枚举
 */
export const CodeType = {
  JAVASCRIPT: 'javascript',
  PYTHON: 'python',
  SQL: 'sql',
  TEMPLATE: 'template',
}

/**
 * 沙箱配置类
 */
export class SandboxConfig {
  constructor(config = {}) {
    this.timeout = config.timeout || 5000
    this.globals = config.globals || {}
    this.allowedModules = config.allowedModules || []
    this.allowedGlobals = config.allowedGlobals || ['console', 'Math', 'Date', 'JSON']
    this.strict = config.strict ?? true
  }
}

/**
 * 注入代码类
 */
export class InjectedCode {
  constructor(config = {}) {
    this.id = config.id || `code_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    this.name = config.name || '未命名代码'
    this.description = config.description || ''
    this.injectPoint = config.injectPoint || InjectPoint.APP_INIT
    this.codeType = config.codeType || CodeType.JAVASCRIPT
    this.code = config.code || ''
    this.enabled = config.enabled ?? true
    this.priority = config.priority || 0
    this.async = config.async ?? false
    this.sandbox = config.sandbox || new SandboxConfig()
    this.createdAt = config.createdAt || Date.now()
    this.updatedAt = Date.now()
    this.errorCount = 0
    this.lastError = null
    this.lastExecuted = null
  }

  updateCode(newCode) {
    this.code = newCode
    this.updatedAt = Date.now()
  }

  recordError(error) {
    this.errorCount++
    this.lastError = error
    this.updatedAt = Date.now()
  }

  recordSuccess() {
    this.lastExecuted = Date.now()
    this.errorCount = 0
    this.lastError = null
  }
}

/**
 * 代码沙箱类
 */
class CodeSandbox {
  constructor(config) {
    this.config = config
    this.globals = { ...config.globals }
  }

  /**
   * 执行 JavaScript 代码
   */
  async execute(code, context = {}) {
    const { timeout, strict } = this.config

    // 创建安全的执行环境
    const sandbox = this.#createSandbox(context)

    // 超时控制
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`代码执行超时 (${timeout}ms)`)), timeout)
    })

    // 执行代码
    const execPromise = new Promise((resolve, reject) => {
      try {
        // 严格模式
        const strictCode = strict ? `'use strict';\n${code}` : code

        // 创建函数执行
        const fn = new Function(
          ...Object.keys(sandbox),
          `
          try {
            return (async () => { ${strictCode} })()
          } catch (e) {
            throw e
          }
        `
        )

        const result = fn(...Object.values(sandbox))
        resolve(result)
      } catch (error) {
        reject(error)
      }
    })

    return Promise.race([execPromise, timeoutPromise])
  }

  /**
   * 创建安全沙箱
   */
  #createSandbox(context) {
    const sandbox = {
      console: this.#createSafeConsole(),
      Math,
      Date,
      JSON,
      ...this.globals,
      ...context,
    }

    // 在严格模式下限制全局访问
    if (this.config.strict) {
      // 移除危险全局对象
      delete sandbox.window
      delete sandbox.document
      delete sandbox.global
      delete sandbox.process
    }

    return sandbox
  }

  /**
   * 创建安全的控制台
   */
  #createSafeConsole() {
    return {
      log: (...args) => console.log('[Sandbox]', ...args),
      warn: (...args) => console.warn('[Sandbox]', ...args),
      error: (...args) => console.error('[Sandbox]', ...args),
      info: (...args) => console.info('[Sandbox]', ...args),
    }
  }
}

/**
 * 代码注入管理器主类
 */
class CodeInjectorClass extends EventEmitter {
  constructor() {
    super()
    this.codes = new Map()
    this.executedCodes = new Map()
    this.sandboxes = new Map()
    this.enabled = true
  }

  /**
   * 初始化代码注入
   */
  init(config = {}) {
    this.enabled = config.enabled ?? true
    this.emit('init', { config })
    return this
  }

  /**
   * 注册注入代码
   */
  register(config) {
    const injectedCode = new InjectedCode(config)
    this.codes.set(injectedCode.id, injectedCode)
    this.emit('code:register', { code: injectedCode })
    return injectedCode
  }

  /**
   * 移除注入代码
   */
  remove(codeId) {
    const code = this.codes.get(codeId)
    if (code) {
      this.codes.delete(codeId)
      this.emit('code:remove', { codeId, code })
      return true
    }
    return false
  }

  /**
   * 更新代码
   */
  update(codeId, updates) {
    const code = this.codes.get(codeId)
    if (!code) return false

    if (updates.code) {
      code.updateCode(updates.code)
    }
    if (updates.enabled !== undefined) {
      code.enabled = updates.enabled
    }
    if (updates.priority) {
      code.priority = updates.priority
    }

    this.emit('code:update', { codeId, code })
    return true
  }

  /**
   * 执行指定注入点的代码
   */
  async executeAt(injectPoint, context = {}) {
    if (!this.enabled) return

    // 获取该注入点的所有代码
    const codes = Array.from(this.codes.values())
      .filter((code) => code.injectPoint === injectPoint && code.enabled)
      .sort((a, b) => a.priority - b.priority)

    // 依次执行
    const results = []
    for (const code of codes) {
      try {
        const result = await this.executeCode(code, context)
        results.push({ codeId: code.id, success: true, result })
        code.recordSuccess()
      } catch (error) {
        code.recordError(error.message)
        results.push({ codeId: code.id, success: false, error: error.message })
        this.emit('code:error', { code, error })
      }
    }

    return results
  }

  /**
   * 执行单段代码
   */
  async executeCode(injectedCode, context = {}) {
    const { codeType, code } = injectedCode

    switch (codeType) {
      case CodeType.JAVASCRIPT:
        return this.#executeJavaScript(code, context, injectedCode.sandbox)
      case CodeType.PYTHON:
        return this.#executePython(code, context)
      case CodeType.SQL:
        return this.#executeSQL(code, context)
      default:
        throw new Error(`不支持的代码类型：${codeType}`)
    }
  }

  /**
   * 执行 JavaScript 代码
   */
  async #executeJavaScript(code, context, sandboxConfig = {}) {
    const sandbox = new CodeSandbox(sandboxConfig)
    return sandbox.execute(code, context)
  }

  /**
   * 执行 Python 代码（需要后端支持）
   */
  async #executePython(code, context) {
    // 调用后端 Python 执行服务
    const response = await fetch('/api/code/execute-python', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, context }),
    })

    if (!response.ok) {
      throw new Error('Python 代码执行失败')
    }

    return response.json()
  }

  /**
   * 执行 SQL 代码
   */
  async #executeSQL(code, context) {
    // 调用数据库执行
    const response = await fetch('/api/db/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql: code, params: context }),
    })

    if (!response.ok) {
      throw new Error('SQL 执行失败')
    }

    return response.json()
  }

  /**
   * 获取所有注入代码
   */
  getAllCodes() {
    return Array.from(this.codes.values())
  }

  /**
   * 获取指定注入点的代码
   */
  getCodesByPoint(injectPoint) {
    return Array.from(this.codes.values()).filter((code) => code.injectPoint === injectPoint)
  }

  /**
   * 执行统计
   */
  getStats() {
    const codes = this.getAllCodes()
    return {
      total: codes.length,
      enabled: codes.filter((c) => c.enabled).length,
      disabled: codes.filter((c) => !c.enabled).length,
      errors: codes.filter((c) => c.errorCount > 0).length,
    }
  }

  /**
   * 清空所有代码
   */
  clear() {
    this.codes.clear()
    this.executedCodes.clear()
    this.emit('clear')
  }
}

// 导出单例
export const codeInjector = new CodeInjectorClass()

// 导出工具函数
export function createCodeInjector() {
  return new CodeInjectorClass()
}

export default codeInjector
