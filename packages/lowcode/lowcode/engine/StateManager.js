/**
 * 状态管理器
 * 页面状态持久化（URL 参数、LocalStorage）、页面间参数传递
 *
 * @author GRI Team
 * @version 1.0
 */

import { EventEmitter } from 'events'

/**
 * 持久化类型枚举
 */
export const PersistType = {
  URL: 'url',
  LOCAL: 'local',
  SESSION: 'session',
  MEMORY: 'memory',
}

/**
 * URL 参数处理器
 */
class URLHandler {
  /**
   * 获取 URL 参数
   */
  getParams() {
    if (typeof window === 'undefined') return {}

    const params = new URLSearchParams(window.location.search)
    const result = {}

    params.forEach((value, key) => {
      result[key] = this.#parseValue(value)
    })

    return result
  }

  /**
   * 获取单个参数
   */
  getParam(key, defaultValue) {
    const params = this.getParams()
    return params[key] ?? defaultValue
  }

  /**
   * 设置 URL 参数
   */
  setParam(key, value, options = {}) {
    if (typeof window === 'undefined') return

    const { replace = true, encode = true } = options

    const params = new URLSearchParams(window.location.search)
    const stringValue = encode ? encodeURIComponent(value) : String(value)
    params.set(key, stringValue)

    const newUrl = `${window.location.pathname}?${params.toString()}${window.location.hash || ''}`

    if (replace) {
      window.history.replaceState({}, '', newUrl)
    } else {
      window.history.pushState({}, '', newUrl)
    }

    this.#emitChange(key, value)
  }

  /**
   * 批量设置参数
   */
  setParams(params, options = {}) {
    if (typeof window === 'undefined') return

    const { replace = true } = options

    const currentParams = new URLSearchParams(window.location.search)

    for (const [key, value] of Object.entries(params)) {
      currentParams.set(key, String(value))
    }

    const newUrl = `${window.location.pathname}?${currentParams.toString()}${window.location.hash || ''}`

    if (replace) {
      window.history.replaceState({}, '', newUrl)
    } else {
      window.history.pushState({}, '', newUrl)
    }
  }

  /**
   * 删除参数
   */
  removeParam(key, options = {}) {
    if (typeof window === 'undefined') return

    const { replace = true } = options
    const params = new URLSearchParams(window.location.search)
    params.delete(key)

    const newUrl = `${window.location.pathname}?${params.toString()}${window.location.hash || ''}`

    if (replace) {
      window.history.replaceState({}, '', newUrl)
    } else {
      window.history.pushState({}, '', newUrl)
    }
  }

  /**
   * 解析值
   */
  #parseValue(value) {
    if (value === 'true') return true
    if (value === 'false') return false
    if (value === 'null') return null
    if (value === 'undefined') return undefined

    const num = Number(value)
    if (!isNaN(num) && value !== '') return num

    try {
      return JSON.parse(decodeURIComponent(value))
    } catch {
      return decodeURIComponent(value)
    }
  }

  /**
   * 触发变化事件
   */
  #emitChange(key, value) {
    const event = new CustomEvent('urlparamchange', { detail: { key, value } })
    window.dispatchEvent(event)
  }

  /**
   * 监听参数变化
   */
  onChange(callback) {
    if (typeof window === 'undefined') return () => {}

    const handler = (event) => {
      callback(event.detail)
    }

    window.addEventListener('urlparamchange', handler)
    return () => window.removeEventListener('urlparamchange', handler)
  }
}

/**
 * 本地存储处理器
 */
class StorageHandler {
  constructor(type = PersistType.LOCAL) {
    this.type = type
    this.prefix = 'lowcode_'
  }

  /**
   * 获取存储
   */
  get(key, defaultValue) {
    if (typeof window === 'undefined') return defaultValue

    const storage = this.#getStorage()
    const fullKey = `${this.prefix}${key}`
    const value = storage.getItem(fullKey)

    if (value === null) return defaultValue

    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }

  /**
   * 设置存储
   */
  set(key, value, options = {}) {
    if (typeof window === 'undefined') return

    const { expires } = options
    const fullKey = `${this.prefix}${key}`
    const data = {
      value,
      timestamp: Date.now(),
      expires,
    }

    this.#getStorage().setItem(fullKey, JSON.stringify(data))
  }

  /**
   * 删除存储
   */
  remove(key) {
    if (typeof window === 'undefined') return
    const fullKey = `${this.prefix}${key}`
    this.#getStorage().removeItem(fullKey)
  }

  /**
   * 清空存储
   */
  clear() {
    if (typeof window === 'undefined') return

    const storage = this.#getStorage()
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key?.startsWith(this.prefix)) {
        storage.removeItem(key)
      }
    }
  }

  /**
   * 获取存储对象
   */
  #getStorage() {
    if (this.type === PersistType.SESSION) {
      return window.sessionStorage
    }
    return window.localStorage
  }

  /**
   * 检查是否过期
   */
  isExpired(key) {
    const value = this.get(key)
    if (!value) return true

    try {
      const data = JSON.parse(window.localStorage.getItem(`${this.prefix}${key}`))
      if (data?.expires) {
        return Date.now() > data.timestamp + data.expires
      }
      return false
    } catch {
      return false
    }
  }
}

/**
 * 内存存储处理器
 */
class MemoryHandler {
  constructor() {
    this.store = new Map()
  }

  get(key, defaultValue) {
    return this.store.has(key) ? this.store.get(key) : defaultValue
  }

  set(key, value) {
    this.store.set(key, value)
  }

  remove(key) {
    this.store.delete(key)
  }

  clear() {
    this.store.clear()
  }

  has(key) {
    return this.store.has(key)
  }
}

/**
 * 状态管理器主类
 */
class StateManagerClass extends EventEmitter {
  constructor() {
    super()
    this.urlHandler = new URLHandler()
    this.localHandler = new StorageHandler(PersistType.LOCAL)
    this.sessionHandler = new StorageHandler(PersistType.SESSION)
    this.memoryHandler = new MemoryHandler()

    this.pageData = new Map()
    this.pageParams = new Map()
  }

  /**
   * 获取 URL 参数
   */
  getUrlParam(key, defaultValue) {
    return this.urlHandler.getParam(key, defaultValue)
  }

  /**
   * 设置 URL 参数
   */
  setUrlParam(key, value, options = {}) {
    this.urlHandler.setParam(key, value, options)
  }

  /**
   * 批量设置 URL 参数
   */
  setUrlParams(params, options = {}) {
    this.urlHandler.setParams(params, options)
  }

  /**
   * 获取 LocalStorage 数据
   */
  getLocal(key, defaultValue) {
    return this.localHandler.get(key, defaultValue)
  }

  /**
   * 设置 LocalStorage 数据
   */
  setLocal(key, value, options = {}) {
    this.localHandler.set(key, value, options)
  }

  /**
   * 删除 LocalStorage 数据
   */
  removeLocal(key) {
    this.localHandler.remove(key)
  }

  /**
   * 获取 SessionStorage 数据
   */
  getSession(key, defaultValue) {
    return this.sessionHandler.get(key, defaultValue)
  }

  /**
   * 设置 SessionStorage 数据
   */
  setSession(key, value, options = {}) {
    this.sessionHandler.set(key, value, options)
  }

  /**
   * 删除 SessionStorage 数据
   */
  removeSession(key) {
    this.sessionHandler.remove(key)
  }

  /**
   * 获取内存数据
   */
  getMemory(key, defaultValue) {
    return this.memoryHandler.get(key, defaultValue)
  }

  /**
   * 设置内存数据
   */
  setMemory(key, value) {
    this.memoryHandler.set(key, value)
  }

  /**
   * 页面间参数传递 - 发送
   */
  sendToPage(pageId, params, persistType = PersistType.MEMORY) {
    const data = {
      fromPage: this.#getCurrentPageId(),
      toPage: pageId,
      params,
      timestamp: Date.now(),
    }

    switch (persistType) {
      case PersistType.URL:
        this.setUrlParams(params)
        break
      case PersistType.LOCAL:
        this.setLocal(`page_${pageId}`, params)
        break
      case PersistType.SESSION:
        this.setSession(`page_${pageId}`, params)
        break
      case PersistType.MEMORY:
      default:
        this.pageParams.set(pageId, params)
        break
    }

    this.emit('send', data)
  }

  /**
   * 页面间参数传递 - 接收
   */
  receiveFromPage(pageId, persistType = PersistType.MEMORY) {
    switch (persistType) {
      case PersistType.URL:
        return this.urlHandler.getParams()
      case PersistType.LOCAL:
        return this.getLocal(`page_${pageId}`)
      case PersistType.SESSION:
        return this.getSession(`page_${pageId}`)
      case PersistType.MEMORY:
      default:
        return this.pageParams.get(pageId)
    }
  }

  /**
   * 获取当前页面 ID
   */
  #getCurrentPageId() {
    if (typeof window === 'undefined') return 'unknown'
    return window.location.pathname
  }

  /**
   * 持久化页面状态
   */
  persistPageState(pageId, state, persistType = PersistType.LOCAL) {
    const key = `page_state_${pageId}`

    switch (persistType) {
      case PersistType.URL:
        this.setUrlParams(state)
        break
      case PersistType.LOCAL:
        this.setLocal(key, state)
        break
      case PersistType.SESSION:
        this.setSession(key, state)
        break
      case PersistType.MEMORY:
      default:
        this.pageData.set(pageId, state)
        break
    }

    this.emit('persist', { pageId, state, persistType })
  }

  /**
   * 恢复页面状态
   */
  restorePageState(pageId, persistType = PersistType.LOCAL) {
    switch (persistType) {
      case PersistType.URL:
        return this.urlHandler.getParams()
      case PersistType.LOCAL:
        return this.getLocal(`page_state_${pageId}`)
      case PersistType.SESSION:
        return this.getSession(`page_state_${pageId}`)
      case PersistType.MEMORY:
      default:
        return this.pageData.get(pageId)
    }
  }

  /**
   * 清除页面状态
   */
  clearPageState(pageId) {
    const key = `page_state_${pageId}`
    this.removeLocal(key)
    this.removeSession(key)
    this.pageData.delete(pageId)
    this.emit('clear', { pageId })
  }

  /**
   * 获取所有持久化类型
   */
  getPersistTypes() {
    return PersistType
  }
}

// 导出单例
export const stateManager = new StateManagerClass()
export default stateManager
