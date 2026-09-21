/**
 * API 连接器管理器
 * 支持 REST/SOAP/GraphQL 等多种协议的数据源连接
 *
 * @author GRI Team
 * @version 1.0
 */

import { EventEmitter } from 'events'

/**
 * 数据源类型
 */
export const ApiType = {
  REST: 'rest',
  SOAP: 'soap',
  GRAPHQL: 'graphql',
  WEBSOCKET: 'websocket',
}

/**
 * 请求方法枚举
 */
export const HttpMethod = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  PATCH: 'PATCH',
  DELETE: 'DELETE',
  HEAD: 'HEAD',
  OPTIONS: 'OPTIONS',
}

/**
 * 认证类型枚举
 */
export const AuthType = {
  NONE: 'none',
  BASIC: 'basic',
  BEARER: 'bearer',
  API_KEY: 'apiKey',
  OAUTH2: 'oauth2',
  JWT: 'jwt',
}

/**
 * API 配置类
 */
export class ApiConfig {
  constructor(config = {}) {
    this.id = config.id || `api_${Date.now()}`
    this.name = config.name || '未命名 API'
    this.type = config.type || ApiType.REST
    this.baseUrl = config.baseUrl || ''
    this.timeout = config.timeout || 30000
    this.headers = config.headers || {}
    this.auth = config.auth || { type: AuthType.NONE }
    this.endpoints = config.endpoints || []
    this.transformers = config.transformers || {
      request: null,
      response: null,
    }
    this.retry = config.retry || { count: 3, delay: 1000 }
    this.cache = config.cache || { enabled: false, ttl: 60000 }
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      baseUrl: this.baseUrl,
      timeout: this.timeout,
      headers: this.headers,
      auth: this.auth,
      endpoints: this.endpoints,
      transformers: this.transformers,
      retry: this.retry,
      cache: this.cache,
    }
  }
}

/**
 * 端点配置类
 */
export class Endpoint {
  constructor(config = {}) {
    this.id = config.id || `endpoint_${Date.now()}`
    this.name = config.name || '未命名端点'
    this.method = config.method || HttpMethod.GET
    this.path = config.path || ''
    this.description = config.description || ''
    this.params = config.params || []
    this.headers = config.headers || {}
    this.body = config.body || null
    this.transformers = config.transformers || {}
  }

  getFullUrl(baseUrl) {
    const path = this.path.startsWith('http') ? this.path : `${baseUrl}${this.path}`
    return path
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      method: this.method,
      path: this.path,
      description: this.description,
      params: this.params,
      headers: this.headers,
      body: this.body,
      transformers: this.transformers,
    }
  }
}

/**
 * 请求构建器
 */
class RequestBuilder {
  constructor(apiConfig, endpoint, params = {}) {
    this.apiConfig = apiConfig
    this.endpoint = endpoint
    this.params = params
    this.headers = {}
  }

  buildHeaders() {
    const headers = {
      'Content-Type': 'application/json',
      ...this.apiConfig.headers,
      ...this.endpoint.headers,
    }

    // 添加认证头
    const auth = this.apiConfig.auth
    if (auth) {
      switch (auth.type) {
        case AuthType.BASIC:
          const credentials = btoa(`${auth.username}:${auth.password}`)
          headers['Authorization'] = `Basic ${credentials}`
          break
        case AuthType.BEARER:
          headers['Authorization'] = `Bearer ${auth.token}`
          break
        case AuthType.API_KEY:
          if (auth.in === 'header') {
            headers[auth.keyName] = auth.keyValue
          }
          break
        case AuthType.JWT:
          headers['Authorization'] = `Bearer ${auth.token}`
          break
      }
    }

    return headers
  }

  buildUrl() {
    const baseUrl = this.apiConfig.baseUrl || ''
    let url = this.endpoint.getFullUrl(baseUrl)

    // 替换路径参数
    for (const [key, value] of Object.entries(this.params)) {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, encodeURIComponent(value))
      }
    }

    // 添加查询参数
    const queryParams = new URLSearchParams()
    for (const [key, value] of Object.entries(this.params)) {
      if (!this.endpoint.path.includes(`:${key}`)) {
        queryParams.append(key, value)
      }
    }

    if (queryParams.toString()) {
      url += `${url.includes('?') ? '&' : '?'}${queryParams.toString()}`
    }

    return url
  }

  buildBody() {
    const { body } = this.endpoint
    if (!body) return null

    // 替换参数
    let bodyString = JSON.stringify(body)
    for (const [key, value] of Object.entries(this.params)) {
      bodyString = bodyString.replace(`{{${key}}}`, value)
    }

    return bodyString
  }
}

/**
 * API 连接器主类
 */
class ApiConnectorClass extends EventEmitter {
  constructor() {
    super()
    this.apis = new Map()
    this.cache = new Map()
    this.activeRequests = new Map()
  }

  /**
   * 注册 API 数据源
   */
  register(config) {
    const apiConfig = new ApiConfig(config)
    this.apis.set(apiConfig.id, apiConfig)
    this.emit('api:register', { apiConfig })
    return apiConfig
  }

  /**
   * 获取 API 配置
   */
  getApi(apiId) {
    return this.apis.get(apiId)
  }

  /**
   * 获取所有 API
   */
  getApis() {
    return Array.from(this.apis.values())
  }

  /**
   * 删除 API
   */
  delete(apiId) {
    return this.apis.delete(apiId)
  }

  /**
   * 执行 API 调用
   */
  async execute(apiId, endpointId, params = {}) {
    const api = this.apis.get(apiId)
    if (!api) {
      throw new Error(`API 不存在：${apiId}`)
    }

    const endpoint = api.endpoints.find((e) => e.id === endpointId || e.name === endpointId)
    if (!endpoint) {
      throw new Error(`端点不存在：${endpointId}`)
    }

    // 检查缓存
    if (api.cache?.enabled) {
      const cacheKey = `${apiId}:${endpointId}:${JSON.stringify(params)}`
      const cached = this.cache.get(cacheKey)
      if (cached && Date.now() - cached.time < api.cache.ttl) {
        return cached.data
      }
    }

    // 构建请求
    const builder = new RequestBuilder(api, endpoint, params)
    const url = builder.buildUrl()
    const headers = builder.buildHeaders()
    const body = builder.buildBody()

    // 发送请求
    const response = await this.sendRequest({
      url,
      method: endpoint.method,
      headers,
      body,
      timeout: api.timeout,
    })

    // 缓存响应
    if (api.cache?.enabled) {
      const cacheKey = `${apiId}:${endpointId}:${JSON.stringify(params)}`
      this.cache.set(cacheKey, {
        data: response,
        time: Date.now(),
      })
    }

    return response
  }

  /**
   * 发送 HTTP 请求
   */
  async sendRequest(options) {
    const { url, method, headers, body, timeout } = options

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      return data
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
  }

  /**
   * 测试连接
   */
  async testConnection(apiId) {
    const api = this.apis.get(apiId)
    if (!api) {
      throw new Error(`API 不存在：${apiId}`)
    }

    try {
      // 尝试访问根路径
      const response = await fetch(api.baseUrl, {
        method: 'GET',
        headers: api.headers,
      })
      return {
        success: response.ok,
        status: response.status,
        message: response.ok ? '连接成功' : response.statusText,
      }
    } catch (error) {
      return {
        success: false,
        message: error.message,
      }
    }
  }

  /**
   * 添加端点
   */
  addEndpoint(apiId, endpointConfig) {
    const api = this.apis.get(apiId)
    if (!api) {
      throw new Error(`API 不存在：${apiId}`)
    }

    const endpoint = new Endpoint(endpointConfig)
    api.endpoints.push(endpoint)
    this.emit('endpoint:add', { apiId, endpoint })
    return endpoint
  }

  /**
   * 移除端点
   */
  removeEndpoint(apiId, endpointId) {
    const api = this.apis.get(apiId)
    if (!api) {
      throw new Error(`API 不存在：${apiId}`)
    }

    const index = api.endpoints.findIndex((e) => e.id === endpointId)
    if (index > -1) {
      api.endpoints.splice(index, 1)
      this.emit('endpoint:remove', { apiId, endpointId })
      return true
    }
    return false
  }

  /**
   * 清除缓存
   */
  clearCache(apiId) {
    if (apiId) {
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${apiId}:`)) {
          this.cache.delete(key)
        }
      }
    } else {
      this.cache.clear()
    }
  }

  /**
   * 导出 API 配置
   */
  export(apiId) {
    const api = this.apis.get(apiId)
    if (!api) {
      return null
    }
    return JSON.stringify(api.toJSON(), null, 2)
  }

  /**
   * 导入 API 配置
   */
  import(jsonString) {
    try {
      const config = JSON.parse(jsonString)
      return this.register(config)
    } catch (error) {
      throw new Error(`导入 API 失败：${error.message}`)
    }
  }
}

// 导出单例和工具类
export const apiConnector = new ApiConnectorClass()
export { RequestBuilder }
export default apiConnector
