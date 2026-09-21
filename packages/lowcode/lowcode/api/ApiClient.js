/**
 * API 客户端抽象
 * 提供统一的 API 调用接口，支持拦截器、缓存、重试等功能
 *
 * @author GRI Team
 * @version 1.0
 */

/**
 * API 客户端配置
 */
export class ApiClientConfig {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || ''
    this.timeout = config.timeout || 30000
    this.headers = config.headers || {
      'Content-Type': 'application/json',
    }
    this.withCredentials = config.withCredentials || false
    this.retryCount = config.retryCount || 0
    this.retryDelay = config.retryDelay || 1000
    this.cacheEnabled = config.cacheEnabled || false
    this.cacheTimeout = config.cacheTimeout || 5 * 60 * 1000 // 5 分钟
  }
}

/**
 * API 响应
 */
export class ApiResponse {
  constructor({ status, statusText, data, headers }) {
    this.status = status
    this.statusText = statusText
    this.data = data
    this.headers = headers
  }

  get isSuccess() {
    return this.status >= 200 && this.status < 300
  }
}

/**
 * API 错误
 */
export class ApiError extends Error {
  constructor(message, status, statusText, data) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.statusText = statusText
    this.data = data
  }
}

/**
 * 缓存管理器
 */
class CacheManager {
  constructor() {
    this.cache = new Map()
    this.timeouts = new Map()
  }

  get(key) {
    const entry = this.cache.get(key)
    if (!entry) return null

    if (Date.now() > entry.expiresAt) {
      this.delete(key)
      return null
    }

    return entry.data
  }

  set(key, data, ttl) {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttl,
    })
  }

  delete(key) {
    this.cache.delete(key)
  }

  clear() {
    this.cache.clear()
    this.timeouts.clear()
  }
}

/**
 * API 客户端类
 */
export class ApiClient {
  constructor(config = {}) {
    this.config = new ApiClientConfig(config)
    this.cacheManager = new CacheManager()
    this.interceptors = {
      request: [],
      response: [],
      error: [],
    }
  }

  /**
   * 添加请求拦截器
   */
  addRequestInterceptor(interceptor) {
    this.interceptors.request.push(interceptor)
    return this
  }

  /**
   * 添加响应拦截器
   */
  addResponseInterceptor(interceptor) {
    this.interceptors.response.push(interceptor)
    return this
  }

  /**
   * 添加错误拦截器
   */
  addErrorInterceptor(interceptor) {
    this.interceptors.error.push(interceptor)
    return this
  }

  /**
   * GET 请求
   */
  async get(url, params = {}, options = {}) {
    return await this.request('GET', url, { ...options, params })
  }

  /**
   * POST 请求
   */
  async post(url, data = {}, options = {}) {
    return await this.request('POST', url, { ...options, data })
  }

  /**
   * PUT 请求
   */
  async put(url, data = {}, options = {}) {
    return await this.request('PUT', url, { ...options, data })
  }

  /**
   * DELETE 请求
   */
  async delete(url, params = {}, options = {}) {
    return await this.request('DELETE', url, { ...options, params })
  }

  /**
   * 通用请求方法
   */
  async request(method, url, options = {}) {
    const { params, data, headers: customHeaders } = options

    // 构建完整 URL
    let fullUrl = url.startsWith('http') ? url : `${this.config.baseUrl}${url}`

    // 添加查询参数
    if (params && Object.keys(params).length > 0) {
      const queryString = new URLSearchParams(params).toString()
      fullUrl += `${fullUrl.includes('?') ? '&' : '?'}${queryString}`
    }

    // 合并请求头
    const headers = {
      ...this.config.headers,
      ...customHeaders,
    }

    // 执行请求拦截器
    let config = { method, url: fullUrl, data, headers }
    for (const interceptor of this.interceptors.request) {
      config = await interceptor(config)
    }

    // 检查缓存
    const cacheKey = `${method}:${config.url}`
    if (method === 'GET' && this.config.cacheEnabled) {
      const cached = this.cacheManager.get(cacheKey)
      if (cached) {
        return cached
      }
    }

    // 发送请求
    let response
    try {
      response = await this.#sendRequest(config)
    } catch (error) {
      // 执行错误拦截器
      for (const interceptor of this.interceptors.error) {
        await interceptor(error)
      }
      throw error
    }

    // 执行响应拦截器
    let result = response
    for (const interceptor of this.interceptors.response) {
      result = await interceptor(result, response)
    }

    // 缓存 GET 请求结果
    if (method === 'GET' && this.config.cacheEnabled && result.isSuccess) {
      this.cacheManager.set(cacheKey, result, this.config.cacheTimeout)
    }

    return result
  }

  /**
   * 发送请求（内部方法）
   */
  async #sendRequest(config) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout)

    try {
      const fetchOptions = {
        method: config.method,
        headers: config.headers,
        signal: controller.signal,
      }

      if (config.data && ['POST', 'PUT', 'PATCH'].includes(config.method)) {
        fetchOptions.body = JSON.stringify(config.data)
      }

      const fetchResponse = await fetch(config.url, fetchOptions)
      clearTimeout(timeoutId)

      const data = await fetchResponse.json()

      return new ApiResponse({
        status: fetchResponse.status,
        statusText: fetchResponse.statusText,
        data,
        headers: fetchResponse.headers,
      })
    } catch (error) {
      clearTimeout(timeoutId)

      if (error.name === 'AbortError') {
        throw new ApiError('请求超时', 408, 'Timeout')
      }

      throw error
    }
  }

  /**
   * 带重试的请求
   */
  async requestWithRetry(method, url, options = {}) {
    let lastError
    const retries = this.config.retryCount + 1

    for (let i = 0; i < retries; i++) {
      try {
        return await this.request(method, url, options)
      } catch (error) {
        lastError = error
        if (i < retries - 1) {
          await this.#sleep(this.config.retryDelay * (i + 1))
        }
      }
    }

    throw lastError
  }

  #sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * 清除缓存
   */
  clearCache(key) {
    if (key) {
      this.cacheManager.delete(key)
    } else {
      this.cacheManager.clear()
    }
  }

  /**
   * 设置认证 Token
   */
  setAuthToken(token) {
    this.config.headers['Authorization'] = `Bearer ${token}`
  }

  /**
   * 移除认证 Token
   */
  clearAuthToken() {
    delete this.config.headers['Authorization']
  }
}

// 默认导出
const apiClient = new ApiClient()
export default apiClient
