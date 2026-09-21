/**
 * 错误日志系统
 * 错误捕获、日志上报、告警通知
 *
 * @author GRI Team
 * @version 1.0
 */

import { EventEmitter } from 'events'

/**
 * 错误级别枚举
 */
export const ErrorLevel = {
  DEBUG: 'debug',
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical',
}

/**
 * 错误来源枚举
 */
export const ErrorSource = {
  APPLICATION: 'application',
  NETWORK: 'network',
  RESOURCE: 'resource',
  PROMISE: 'promise',
  CONSOLE: 'console',
  CUSTOM: 'custom',
}

/**
 * 错误日志类
 */
export class ErrorLog {
  constructor(config = {}) {
    this.id = config.id || `err_${Date.now()}`
    this.message = config.message || ''
    this.level = config.level || ErrorLevel.ERROR
    this.source = config.source || ErrorSource.APPLICATION
    this.stack = config.stack || ''
    this.url = config.url || ''
    this.userAgent = config.userAgent || ''
    this.timestamp = config.timestamp || Date.now()
    this.extra = config.extra || {}
    this.count = config.count || 1
  }

  toJSON() {
    return {
      id: this.id,
      message: this.message,
      level: this.level,
      source: this.source,
      stack: this.stack,
      url: this.url,
      userAgent: this.userAgent,
      timestamp: this.timestamp,
      extra: this.extra,
      count: this.count,
    }
  }
}

/**
 * 错误日志系统主类
 */
class ErrorLoggerClass extends EventEmitter {
  constructor() {
    super()
    this.logs = []
    this.maxLogs = 100
    this.reportUrl = ''
    this.enabled = false
    this.ignorePatterns = []
    this.beforeReport = null
    this.errorCounts = new Map()
  }

  /**
   * 初始化错误日志系统
   */
  init(options = {}) {
    if (typeof window === 'undefined') {
      console.warn('[ErrorLogger] 仅在浏览器环境中可用')
      return
    }

    this.enabled = true
    this.reportUrl = options.reportUrl || ''
    this.ignorePatterns = options.ignorePatterns || []
    this.maxLogs = options.maxLogs || 100

    // 监听全局错误
    this.#listenGlobalErrors()

    // 监听 Promise 错误
    this.#listenPromiseErrors()

    // 监听资源加载错误
    this.#listenResourceErrors()

    // 监听控制台错误
    if (options.captureConsoleErrors) {
      this.#listenConsoleErrors()
    }

    this.emit('init')
  }

  /**
   * 监听全局错误
   */
  #listenGlobalErrors() {
    window.addEventListener('error', (event) => {
      const { error, message, filename, lineno, colno } = event

      const log = new ErrorLog({
        message: message || (error && error.message) || 'Unknown error',
        level: ErrorLevel.ERROR,
        source: ErrorSource.APPLICATION,
        stack: error ? error.stack : '',
        url: `${filename}:${lineno}:${colno}`,
        userAgent: navigator.userAgent,
        extra: {
          filename,
          lineno,
          colno,
        },
      })

      this.#addLog(log)
    })
  }

  /**
   * 监听 Promise 错误
   */
  #listenPromiseErrors() {
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason
      const log = new ErrorLog({
        message: reason ? reason.toString() : 'Unhandled promise rejection',
        level: ErrorLevel.ERROR,
        source: ErrorSource.PROMISE,
        stack: reason ? reason.stack : '',
        userAgent: navigator.userAgent,
      })

      this.#addLog(log)
    })
  }

  /**
   * 监听资源加载错误
   */
  #listenResourceErrors() {
    window.addEventListener(
      'error',
      (event) => {
        const target = event.target
        if (!target) return

        const log = new ErrorLog({
          message: `Resource load error: ${target.src || target.href || 'unknown'}`,
          level: ErrorLevel.WARNING,
          source: ErrorSource.RESOURCE,
          userAgent: navigator.userAgent,
          extra: {
            src: target.src || target.href,
            tagName: target.tagName,
          },
        })

        this.#addLog(log)
      },
      true
    )
  }

  /**
   * 监听控制台错误
   */
  #listenConsoleErrors() {
    const originalError = console.error
    const self = this

    console.error = function (...args) {
      const message = args.map((arg) => String(arg)).join(' ')
      const log = new ErrorLog({
        message,
        level: ErrorLevel.ERROR,
        source: ErrorSource.CONSOLE,
        userAgent: navigator.userAgent,
      })

      self.#addLog(log)
      originalError.apply(console, args)
    }
  }

  /**
   * 添加日志
   */
  #addLog(log) {
    // 检查是否应该忽略
    if (this.#shouldIgnore(log.message)) {
      return
    }

    // 合并重复错误
    const key = `${log.message}-${log.source}`
    const existing = this.errorCounts.get(key)

    if (existing) {
      existing.count++
      existing.timestamp = Date.now()
      log = existing
    } else {
      this.errorCounts.set(key, log)
      this.logs.push(log)

      // 限制日志数量
      if (this.logs.length > this.maxLogs) {
        this.logs.shift()
      }
    }

    this.emit('error', log)

    // 严重错误立即上报
    if (log.level === ErrorLevel.CRITICAL || log.level === ErrorLevel.ERROR) {
      this.#report(log)
    }
  }

  /**
   * 检查是否应该忽略
   */
  #shouldIgnore(message) {
    return this.ignorePatterns.some((pattern) => {
      if (typeof pattern === 'string') {
        return message.includes(pattern)
      }
      if (pattern instanceof RegExp) {
        return pattern.test(message)
      }
      return false
    })
  }

  /**
   * 上报告错误
   */
  async #report(log) {
    if (!this.reportUrl) return

    const reportData = {
      logs: [log.toJSON()],
      timestamp: Date.now(),
      url: typeof window !== 'undefined' ? window.location.href : '',
    }

    // 调用上报前钩子
    if (this.beforeReport) {
      reportData.logs = await this.beforeReport(reportData.logs)
    }

    try {
      await navigator.sendBeacon(this.reportUrl, JSON.stringify(reportData))
    } catch (e) {
      console.warn('[ErrorLogger] 上报失败:', e)
    }

    this.emit('report', log)
  }

  /**
   * 手动记录错误
   */
  log(message, level = ErrorLevel.ERROR, extra = {}) {
    const log = new ErrorLog({
      message,
      level,
      source: ErrorSource.CUSTOM,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      extra,
    })

    this.#addLog(log)
    return log
  }

  /**
   * 记录调试信息
   */
  debug(message, extra = {}) {
    return this.log(message, ErrorLevel.DEBUG, extra)
  }

  /**
   * 记录信息
   */
  info(message, extra = {}) {
    return this.log(message, ErrorLevel.INFO, extra)
  }

  /**
   * 记录警告
   */
  warn(message, extra = {}) {
    return this.log(message, ErrorLevel.WARNING, extra)
  }

  /**
   * 记录错误
   */
  error(message, extra = {}) {
    return this.log(message, ErrorLevel.ERROR, extra)
  }

  /**
   * 记录严重错误
   */
  critical(message, extra = {}) {
    return this.log(message, ErrorLevel.CRITICAL, extra)
  }

  /**
   * 获取所有日志
   */
  getLogs() {
    return this.logs.map((log) => log.toJSON())
  }

  /**
   * 按级别筛选日志
   */
  getByLevel(level) {
    return this.logs.filter((log) => log.level === level).map((log) => log.toJSON())
  }

  /**
   * 按来源筛选日志
   */
  getBySource(source) {
    return this.logs.filter((log) => log.source === source).map((log) => log.toJSON())
  }

  /**
   * 清除日志
   */
  clear() {
    this.logs = []
    this.errorCounts.clear()
  }

  /**
   * 设置上报前钩子
   */
  setBeforeReport(fn) {
    this.beforeReport = fn
  }

  /**
   * 获取错误统计
   */
  getStats() {
    const stats = {
      total: this.logs.length,
      byLevel: {},
      bySource: {},
      topErrors: [],
    }

    this.logs.forEach((log) => {
      stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1
      stats.bySource[log.source] = (stats.bySource[log.source] || 0) + 1
    })

    // 错误次数排序
    stats.topErrors = Array.from(this.errorCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((log) => ({
        message: log.message,
        count: log.count,
      }))

    return stats
  }

  /**
   * 停止监控
   */
  destroy() {
    this.enabled = false
    this.clear()
    this.errorCounts.clear()
  }
}

// 导出单例和工具函数
export const errorLogger = new ErrorLoggerClass()

/**
 * 快捷错误捕获装饰器
 */
export function catchError(target, name, descriptor) {
  const original = descriptor.value

  descriptor.value = async function (...args) {
    try {
      return await original.apply(this, args)
    } catch (error) {
      errorLogger.error(`Error in ${name}: ${error.message}`, {
        stack: error.stack,
        args: JSON.stringify(args),
      })
      throw error
    }
  }

  return descriptor
}

export default errorLogger
