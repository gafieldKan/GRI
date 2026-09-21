/**
 * 统一错误处理工具
 * 提供统一的错误分类、用户友好提示、错误上报功能
 */

// 错误类型枚举
export const ErrorType = {
  NETWORK: 'NETWORK',           // 网络错误
  TIMEOUT: 'TIMEOUT',           // 请求超时
  UNAUTHORIZED: 'UNAUTHORIZED', // 未授权/登录过期
  FORBIDDEN: 'FORBIDDEN',       // 权限不足
  NOT_FOUND: 'NOT_FOUND',       // 资源不存在
  VALIDATION: 'VALIDATION',     // 参数验证失败
  SERVER: 'SERVER',             // 服务器内部错误
  PARSE: 'PARSE',               // 数据解析错误
  STORAGE: 'STORAGE',           // 存储错误
  UNKNOWN: 'UNKNOWN'            // 未知错误
}

// 错误严重程度
export const ErrorSeverity = {
  LOW: 'LOW',       // 低 - 仅记录日志
  MEDIUM: 'MEDIUM', // 中 - 显示 Toast
  HIGH: 'HIGH',     // 高 - 显示 Modal
  CRITICAL: 'CRITICAL' // 严重 - 阻塞操作，需立即处理
}

// 错误代码映射（HTTP 状态码 -> 错误类型）
const HTTP_CODE_MAP = {
  0: ErrorType.NETWORK,
  400: ErrorType.VALIDATION,
  401: ErrorType.UNAUTHORIZED,
  403: ErrorType.FORBIDDEN,
  404: ErrorType.NOT_FOUND,
  408: ErrorType.TIMEOUT,
  422: ErrorType.VALIDATION,
  429: ErrorType.SERVER, // 限流
  500: ErrorType.SERVER,
  502: ErrorType.SERVER,
  503: ErrorType.SERVER,
  504: ErrorType.TIMEOUT
}

// 用户友好的错误消息映射
const ERROR_MESSAGES = {
  [ErrorType.NETWORK]: '网络连接失败，请检查网络设置',
  [ErrorType.TIMEOUT]: '请求超时，请稍后重试',
  [ErrorType.UNAUTHORIZED]: '登录已过期，请重新登录',
  [ErrorType.FORBIDDEN]: '权限不足，无法访问该资源',
  [ErrorType.NOT_FOUND]: '请求的资源不存在',
  [ErrorType.VALIDATION]: '输入数据格式不正确',
  [ErrorType.SERVER]: '服务器暂时不可用，请稍后重试',
  [ErrorType.PARSE]: '数据解析失败，请重试',
  [ErrorType.STORAGE]: '本地存储失败，请检查存储空间',
  [ErrorType.UNKNOWN]: '发生未知错误，请稍后重试'
}

// 严重程度默认映射
const SEVERITY_MAP = {
  [ErrorType.NETWORK]: ErrorSeverity.HIGH,
  [ErrorType.TIMEOUT]: ErrorSeverity.MEDIUM,
  [ErrorType.UNAUTHORIZED]: ErrorSeverity.CRITICAL,
  [ErrorType.FORBIDDEN]: ErrorSeverity.HIGH,
  [ErrorType.NOT_FOUND]: ErrorSeverity.MEDIUM,
  [ErrorType.VALIDATION]: ErrorSeverity.LOW,
  [ErrorType.SERVER]: ErrorSeverity.HIGH,
  [ErrorType.PARSE]: ErrorSeverity.MEDIUM,
  [ErrorType.STORAGE]: ErrorSeverity.LOW,
  [ErrorType.UNKNOWN]: ErrorSeverity.MEDIUM
}

/**
 * 标准化错误对象
 */
export class AppError extends Error {
  constructor(message, type = ErrorType.UNKNOWN, originalError = null, context = {}) {
    super(message)
    this.name = 'AppError'
    this.type = type
    this.severity = SEVERITY_MAP[type] || ErrorSeverity.MEDIUM
    this.originalError = originalError
    this.context = context
    this.timestamp = new Date().toISOString()
    this.code = originalError?.code || originalError?.status || originalError?.response?.status
  }
}

/**
 * 解析并标准化错误
 */
export function normalizeError(error, context = {}) {
  // 已经是 AppError，直接返回
  if (error instanceof AppError) {
    return error
  }

  // 网络错误
  if (!navigator.onLine || error.message?.includes('Network Error') || error.message?.includes('Failed to fetch')) {
    return new AppError(
      ERROR_MESSAGES[ErrorType.NETWORK],
      ErrorType.NETWORK,
      error,
      context
    )
  }

  // 超时错误
  if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
    return new AppError(
      ERROR_MESSAGES[ErrorType.TIMEOUT],
      ErrorType.TIMEOUT,
      error,
      context
    )
  }

  // HTTP 错误响应
  if (error.response) {
    const status = error.response.status
    const errorType = HTTP_CODE_MAP[status] || ErrorType.SERVER
    const message = error.response.data?.message || error.response.data?.error || ERROR_MESSAGES[errorType]

    // 特殊处理 401 - 触发登出
    if (status === 401) {
      return new AppError(
        ERROR_MESSAGES[ErrorType.UNAUTHORIZED],
        ErrorType.UNAUTHORIZED,
        error,
        { ...context, redirectToLogin: true }
      )
    }

    return new AppError(message, errorType, error, { ...context, status })
  }

  // 请求配置错误
  if (error.request) {
    return new AppError(
      ERROR_MESSAGES[ErrorType.NETWORK],
      ErrorType.NETWORK,
      error,
      context
    )
  }

  // 其他错误
  return new AppError(
    error.message || ERROR_MESSAGES[ErrorType.UNKNOWN],
    ErrorType.UNKNOWN,
    error,
    context
  )
}

/**
 * 用户友好的错误提示
 */
export function showErrorToast(appError, options = {}) {
  const { duration = 3000, showRetry = false, onRetry } = options

  // 根据严重程度决定显示方式
  switch (appError.severity) {
    case ErrorSeverity.CRITICAL:
      uni.showModal({
        title: '错误',
        content: appError.message,
        showCancel: showRetry && !!onRetry,
        confirmText: onRetry ? '重试' : '确定',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm && onRetry) onRetry()
        }
      })
      break
    case ErrorSeverity.HIGH:
      uni.showModal({
        title: '提示',
        content: appError.message,
        showCancel: false,
        confirmText: '知道了'
      })
      break
    case ErrorSeverity.MEDIUM:
      uni.showToast({
        title: appError.message,
        icon: 'none',
        duration
      })
      break
    case ErrorSeverity.LOW:
    default:
      // 低严重度仅控制台记录，不打扰用户
      console.warn('[Low Severity Error]', appError.message)
      break
  }
}

/**
 * 统一错误处理器 - 用于 API 请求
 */
export function handleApiError(error, context = {}) {
  const appError = normalizeError(error, context)

  // 记录错误日志
  logError(appError)

  // 特殊处理：401 触发登出流程
  if (appError.type === ErrorType.UNAUTHORIZED) {
    handleUnauthorized()
  }

  // 显示用户提示
  showErrorToast(appError, context.toastOptions)

  return appError
}

/**
 * 处理未授权 - 清除本地状态并跳转登录
 */
function handleUnauthorized() {
  // 清除用户相关存储
  const keysToClear = [
    'gri-user', 'gri-session', 'gri-practice',
    'gri-report', 'gri-knowledge', 'gri-wrong-questions',
    'gri-settings'
  ]
  keysToClear.forEach(key => {
    try { uni.removeStorageSync(key) } catch (e) {}
  })

  // 跳转登录页
  setTimeout(() => {
    uni.reLaunch({ url: '/pages/login/login' })
  }, 1500)
}

/**
 * 错误日志记录
 */
export function logError(appError) {
  const logEntry = {
    timestamp: appError.timestamp,
    type: appError.type,
    severity: appError.severity,
    message: appError.message,
    code: appError.code,
    context: appError.context,
    stack: appError.originalError?.stack,
    userAgent: navigator.userAgent,
    url: window.location.href
  }

  // 控制台输出
  console.error('[AppError]', logEntry)

  // 本地存储错误日志（限制条数）
  try {
    const logs = JSON.parse(uni.getStorageSync('app_error_logs') || '[]')
    logs.unshift(logEntry)
    if (logs.length > 100) logs.length = 100
    uni.setStorageSync('app_error_logs', JSON.stringify(logs))
  } catch (e) {
    // 忽略存储错误
  }

  // TODO: 发送到错误监控服务
  // reportToMonitoringService(logEntry)
}

/**
 * 表单验证错误处理
 */
export function handleValidationError(errors, fieldNames = {}) {
  const messages = Object.entries(errors).map(([field, message]) => {
    const label = fieldNames[field] || field
    return `${label}: ${message}`
  })

  const appError = new AppError(
    messages.join('；'),
    ErrorType.VALIDATION,
    null,
    { fields: errors }
  )

  showErrorToast(appError)
  return appError
}

/**
 * 全局 Vue 错误处理器
 */
export function setupGlobalErrorHandler(app) {
  app.config.errorHandler = (err, instance, info) => {
    const appError = normalizeError(err, {
      component: instance?.$options?.name,
      lifecycle: info
    })
    logError(appError)

    // 生产环境上报
    if (process.env.NODE_ENV === 'production') {
      // reportToMonitoringService(appError)
    }
  }

  // 全局未捕获 Promise 错误
  window.addEventListener('unhandledrejection', (event) => {
    const appError = normalizeError(event.reason, {
      type: 'unhandledrejection'
    })
    logError(appError)
    event.preventDefault() // 防止默认控制台报错
  })

  // 全局 JS 错误
  window.addEventListener('error', (event) => {
    const appError = normalizeError(event.error, {
      type: 'global_error',
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno
    })
    logError(appError)
  })
}

/**
 * 获取本地错误日志
 */
export function getErrorLogs() {
  try {
    return JSON.parse(uni.getStorageSync('app_error_logs') || '[]')
  } catch {
    return []
  }
}

/**
 * 清除错误日志
 */
export function clearErrorLogs() {
  uni.removeStorageSync('app_error_logs')
}

export default {
  AppError,
  ErrorType,
  ErrorSeverity,
  normalizeError,
  handleApiError,
  handleValidationError,
  showErrorToast,
  logError,
  getErrorLogs,
  clearErrorLogs,
  setupGlobalErrorHandler
}