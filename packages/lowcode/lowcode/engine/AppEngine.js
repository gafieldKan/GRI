/**
 * 应用引擎
 * 负责应用的生命周期管理、路由管理、状态管理
 * 参考 Frappe/NocoBase 的应用架构设计
 */

import { EventEmitter } from 'events'

// 应用状态
export const AppState = {
  INITIALIZING: 'initializing',
  READY: 'ready',
  RUNNING: 'running',
  PAUSED: 'paused',
  DESTROYED: 'destroyed',
}

// 应用配置
export const defaultAppConfig = {
  name: '未命名应用',
  description: '',
  version: '1.0.0',
  routes: [],
  plugins: [],
  theme: {
    primaryColor: '#1890ff',
    layout: 'side',
  },
  settings: {
    enableCache: true,
    enableLog: true,
    debugMode: false,
  },
}

class AppEngineClass extends EventEmitter {
  constructor() {
    super()
    this.app = null
    this.state = AppState.INITIALIZING
    this.config = null
    this.modules = new Map()
    this.globalState = new Map()
  }

  /**
   * 初始化应用
   */
  async init(config = {}) {
    this.emit('before:init')

    this.config = {
      ...defaultAppConfig,
      ...config,
    }

    this.state = AppState.INITIALIZING

    try {
      // 初始化内置模块
      await this.initModules()

      this.state = AppState.READY
      this.emit('after:init', this.config)

      console.warn('[AppEngine] 应用初始化完成')
    } catch (error) {
      this.state = 'error'
      this.emit('error', error)
      throw error
    }

    return this
  }

  /**
   * 启动应用
   */
  async start() {
    if (this.state !== AppState.READY) {
      throw new Error('应用未就绪，无法启动')
    }

    this.state = AppState.RUNNING
    this.emit('start')
    console.warn('[AppEngine] 应用已启动')

    return this
  }

  /**
   * 暂停应用
   */
  async pause() {
    if (this.state !== AppState.RUNNING) {
      return
    }

    this.state = AppState.PAUSED
    this.emit('pause')
    console.warn('[AppEngine] 应用已暂停')

    return this
  }

  /**
   * 恢复应用
   */
  async resume() {
    if (this.state !== AppState.PAUSED) {
      return
    }

    this.state = AppState.RUNNING
    this.emit('resume')
    console.warn('[AppEngine] 应用已恢复')

    return this
  }

  /**
   * 销毁应用
   */
  async destroy() {
    this.emit('before:destroy')

    // 清理所有模块
    for (const [name, module] of this.modules) {
      if (module.destroy) {
        await module.destroy()
      }
    }

    this.modules.clear()
    this.globalState.clear()
    this.app = null
    this.state = AppState.DESTROYED

    this.emit('after:destroy')
    console.warn('[AppEngine] 应用已销毁')

    return this
  }

  /**
   * 初始化内置模块
   */
  async initModules() {
    // 初始化路由模块
    this.modules.set('router', {
      routes: this.config.routes || [],
      addRoute: this.addRoute.bind(this),
      removeRoute: this.removeRoute.bind(this),
    })

    // 初始化状态管理模块
    this.modules.set('state', {
      get: this.getGlobalState.bind(this),
      set: this.setGlobalState.bind(this),
      remove: this.removeGlobalState.bind(this),
    })

    // 初始化插件模块
    if (this.config.plugins) {
      for (const plugin of this.config.plugins) {
        await this.loadPlugin(plugin)
      }
    }
  }

  /**
   * 注册模块
   */
  registerModule(name, module) {
    if (this.modules.has(name)) {
      console.warn(`[AppEngine] 模块 ${name} 已存在，覆盖中...`)
    }
    this.modules.set(name, module)
    this.emit('module:register', { name, module })
    return this
  }

  /**
   * 获取模块
   */
  getModule(name) {
    return this.modules.get(name)
  }

  /**
   * 移除模块
   */
  removeModule(name) {
    const module = this.modules.get(name)
    if (module?.destroy) {
      module.destroy()
    }
    this.modules.delete(name)
    this.emit('module:remove', { name })
    return this
  }

  /**
   * 添加路由
   */
  addRoute(route) {
    const router = this.modules.get('router')
    if (router) {
      router.routes.push(route)
      this.emit('route:add', route)
    }
    return this
  }

  /**
   * 移除路由
   */
  removeRoute(path) {
    const router = this.modules.get('router')
    if (router) {
      router.routes = router.routes.filter((r) => r.path !== path)
      this.emit('route:remove', { path })
    }
    return this
  }

  /**
   * 设置全局状态
   */
  setGlobalState(key, value) {
    this.globalState.set(key, value)
    this.emit('state:set', { key, value })
    return this
  }

  /**
   * 获取全局状态
   */
  getGlobalState(key, defaultValue) {
    return this.globalState.has(key) ? this.globalState.get(key) : defaultValue
  }

  /**
   * 移除全局状态
   */
  removeGlobalState(key) {
    this.globalState.delete(key)
    this.emit('state:remove', { key })
    return this
  }

  /**
   * 加载插件
   */
  async loadPlugin(plugin) {
    try {
      if (typeof plugin === 'function') {
        await plugin(this)
      } else if (plugin?.install) {
        await plugin.install(this)
      }
      this.emit('plugin:load', { plugin })
    } catch (error) {
      console.error(`[AppEngine] 加载插件失败:`, error)
      throw error
    }
  }

  /**
   * 获取应用信息
   */
  getInfo() {
    return {
      name: this.config?.name,
      version: this.config?.version,
      state: this.state,
      modules: Array.from(this.modules.keys()),
    }
  }
}

// 导出单例
export const appEngine = new AppEngineClass()

export default appEngine
