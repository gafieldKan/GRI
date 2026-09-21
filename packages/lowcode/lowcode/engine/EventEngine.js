/**
 * 事件引擎
 * 全局事件总线，支持事件的发布/订阅、拦截器、优先级等
 * 参考 Frappe 的事件钩子和 NocoBase 的事件系统
 */

import { EventEmitter } from 'events'

// 事件优先级
export const EventPriority = {
  HIGH: 10,
  NORMAL: 5,
  LOW: 1,
}

// 内置事件类型
export const EventType = {
  // 应用生命周期事件
  APP_INIT: 'app:init',
  APP_START: 'app:start',
  APP_PAUSE: 'app:pause',
  APP_RESUME: 'app:resume',
  APP_DESTROY: 'app:destroy',

  // 数据事件
  DATA_CREATE: 'data:create',
  DATA_UPDATE: 'data:update',
  DATA_DELETE: 'data:delete',
  DATA_LOAD: 'data:load',

  // 用户事件
  USER_LOGIN: 'user:login',
  USER_LOGOUT: 'user:logout',
  USER_CHANGE: 'user:change',

  // 组件事件
  COMPONENT_MOUNT: 'component:mount',
  COMPONENT_UNMOUNT: 'component:unmount',
  COMPONENT_UPDATE: 'component:update',

  // 插件事件
  PLUGIN_LOAD: 'plugin:load',
  PLUGIN_UNLOAD: 'plugin:unload',
  PLUGIN_ENABLE: 'plugin:enable',
  PLUGIN_DISABLE: 'plugin:disable',
}

// 事件总线类
class EventEngineClass extends EventEmitter {
  constructor() {
    super()
    this.handlers = new Map()
    this.interceptors = new Map()
    this.eventHistory = new Map()
    this.hooks = new Map() // 钩子队列
    this.maxHistory = 100
    this.debugMode = false
  }

  /**
   * 订阅事件
   * @param {string} event - 事件名称
   * @param {Function} callback - 回调函数
   * @param {number} priority - 优先级 (数字越大优先级越高)
   */
  on(event, callback, priority = EventPriority.NORMAL) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, [])
    }

    const handlers = this.handlers.get(event)
    handlers.push({ callback, priority, id: this._generateId() })

    // 按优先级排序
    handlers.sort((a, b) => b.priority - a.priority)

    return this._generateId()
  }

  /**
   * 一次性订阅
   */
  once(event, callback, priority = EventPriority.NORMAL) {
    const wrapper = (...args) => {
      this.off(event, wrapper)
      return callback(...args)
    }
    return this.on(event, wrapper, priority)
  }

  /**
   * 取消订阅
   */
  off(event, callbackId) {
    const handlers = this.handlers.get(event)
    if (!handlers) return

    const index = handlers.findIndex((h) => h.id === callbackId)
    if (index !== -1) {
      handlers.splice(index, 1)
    }
  }

  /**
   * 发布事件
   */
  async emit(event, ...args) {
    const startTime = this.debugMode ? Date.now() : null

    // 执行前置钩子
    const beforeHooks = this.hooks.get(`${event}:before`)
    if (beforeHooks) {
      for (const hook of beforeHooks) {
        try {
          await hook(event, ...args)
        } catch (error) {
          console.error(`[EventEngine] 前置钩子错误:`, error)
        }
      }
    }

    // 执行拦截器
    const interceptors = this.interceptors.get(event)
    if (interceptors) {
      for (const interceptor of interceptors) {
        try {
          const result = await interceptor.fn(...args)
          if (result === false) {
            if (this.debugMode) {
              console.warn(`[EventEngine] 事件被拦截：${event}`)
            }
            return false
          }
        } catch (error) {
          console.error(`[EventEngine] 拦截器错误:`, error)
        }
      }
    }

    // 执行处理器
    const handlers = this.handlers.get(event)
    if (handlers) {
      for (const { callback } of handlers) {
        try {
          await callback(...args)
        } catch (error) {
          console.error(`[EventEngine] 事件处理错误 [${event}]:`, error)
        }
      }
    }

    // 超级类的事件发射
    super.emit(event, ...args)

    // 执行后置钩子
    const afterHooks = this.hooks.get(`${event}:after`)
    if (afterHooks) {
      for (const hook of afterHooks) {
        try {
          await hook(event, ...args)
        } catch (error) {
          console.error(`[EventEngine] 后置钩子错误:`, error)
        }
      }
    }

    // 记录事件历史
    this._addToHistory(event, args)

    if (this.debugMode && startTime) {
      console.warn(`[EventEngine] 事件 [${event}] 执行耗时：${Date.now() - startTime}ms`)
    }

    return true
  }

  /**
   * 添加拦截器
   */
  addInterceptor(event, fn, priority = EventPriority.NORMAL) {
    if (!this.interceptors.has(event)) {
      this.interceptors.set(event, [])
    }

    const interceptors = this.interceptors.get(event)
    interceptors.push({ fn, priority, id: this._generateId() })
    interceptors.sort((a, b) => b.priority - a.priority)

    return this.interceptors.get(event).find((i) => i.fn === fn)?.id
  }

  /**
   * 移除拦截器
   */
  removeInterceptor(event, interceptorId) {
    const interceptors = this.interceptors.get(event)
    if (!interceptors) return

    const index = interceptors.findIndex((i) => i.id === interceptorId)
    if (index !== -1) {
      interceptors.splice(index, 1)
    }
  }

  /**
   * 获取事件历史
   */
  getHistory(event) {
    if (event) {
      return this.eventHistory.get(event) || []
    }
    return Array.from(this.eventHistory.entries())
  }

  /**
   * 清空事件历史
   */
  clearHistory() {
    this.eventHistory.clear()
  }

  /**
   * 清空所有处理器
   */
  clear() {
    this.handlers.clear()
    this.interceptors.clear()
    this.eventHistory.clear()
    this.hooks.clear()
  }

  /**
   * 添加钩子（在事件处理前/后执行）
   * @param {string} event - 事件名
   * @param {Function} hook - 钩子函数
   * @param {'before'|'after'} position - 钩子位置
   */
  addHook(event, hook, position = 'before') {
    const key = `${event}:${position}`
    if (!this.hooks.has(key)) {
      this.hooks.set(key, [])
    }
    this.hooks.get(key).push(hook)
    return this
  }

  /**
   * 移除钩子
   */
  removeHook(event, hook, position = 'before') {
    const key = `${event}:${position}`
    const hooks = this.hooks.get(key)
    if (!hooks) return
    const index = hooks.indexOf(hook)
    if (index !== -1) {
      hooks.splice(index, 1)
    }
  }

  /**
   * 设置调试模式
   */
  setDebugMode(enabled) {
    this.debugMode = enabled
  }

  // 内部方法

  _generateId() {
    return `_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  _addToHistory(event, args) {
    if (!this.eventHistory.has(event)) {
      this.eventHistory.set(event, [])
    }

    const history = this.eventHistory.get(event)
    history.push({ event, args, timestamp: Date.now() })

    // 限制历史记录数量
    if (history.length > this.maxHistory) {
      history.shift()
    }
  }
}

// 导出单例
export const eventEngine = new EventEngineClass()

// 快捷方法
export const on = eventEngine.on.bind(eventEngine)
export const once = eventEngine.once.bind(eventEngine)
export const off = eventEngine.off.bind(eventEngine)
export const emit = eventEngine.emit.bind(eventEngine)
export const addInterceptor = eventEngine.addInterceptor.bind(eventEngine)
export const removeInterceptor = eventEngine.removeInterceptor.bind(eventEngine)

export default eventEngine
