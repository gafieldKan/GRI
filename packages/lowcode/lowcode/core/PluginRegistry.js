/**
 * 插件注册中心
 * 负责管理所有插件的注册、初始化和生命周期
 * 遵循：单例模式、工厂模式、责任链模式
 *
 * @author GRI Team
 * @version 2.0
 */

import { ValidationError } from './TypeValidator.js'
import { PluginType, PluginLifecycle } from './Constants.js'

// 默认插件配置
const defaultPluginConfig = {
  version: '1.0.0',
  author: '',
  description: '',
  dependencies: [],
}

/**
 * 插件注册中心类
 */
class PluginRegistryClass {
  constructor() {
    this.plugins = new Map()
    this.pluginByType = new Map()
    this.initializedPlugins = new Set()
  }

  /**
   * 注册插件
   * @param {Object} plugin - 插件对象
   * @throws {ValidationError} 参数验证失败时抛出
   */
  register(plugin) {
    // 参数验证
    if (!plugin) {
      throw new ValidationError('plugin', 'object', 'undefined')
    }

    if (!plugin.name) {
      throw new ValidationError('plugin.name', 'required', 'undefined', '插件必须包含 name 属性')
    }

    if (!plugin.type) {
      throw new ValidationError('plugin.type', 'required', 'undefined', '插件必须包含 type 属性')
    }

    if (!Object.values(PluginType).includes(plugin.type)) {
      const validTypes = Object.values(PluginType).join(', ')
      throw new ValidationError(
        'plugin.type',
        `enum[${validTypes}]`,
        plugin.type,
        `无效的插件类型：${plugin.type}`
      )
    }

    const config = { ...defaultPluginConfig, ...plugin.config }
    const pluginInstance = {
      ...plugin,
      config,
      loaded: false,
      active: false,
    }

    this.plugins.set(plugin.name, pluginInstance)

    // 按类型索引
    if (!this.pluginByType.has(plugin.type)) {
      this.pluginByType.set(plugin.type, [])
    }
    this.pluginByType.get(plugin.type).push(plugin.name)

    console.warn(`[PluginRegistry] 插件已注册：${plugin.name} (${plugin.type})`)
    return this
  }

  /**
   * 获取插件
   * @param {string} name - 插件名称
   * @throws {ValidationError} 插件不存在时抛出
   */
  get(name) {
    const plugin = this.plugins.get(name)
    if (!plugin) {
      throw new ValidationError('name', 'valid plugin name', name, `插件不存在：${name}`)
    }
    return plugin
  }

  /**
   * 按类型获取所有插件
   * @param {string} type - 插件类型
   * @returns {Array} 插件数组
   */
  getByType(type) {
    const names = this.pluginByType.get(type) || []
    return names.map((name) => this.plugins.get(name)).filter(Boolean)
  }

  /**
   * 初始化插件
   * @param {string} name - 插件名称
   * @throws {ValidationError} 插件不存在或初始化失败时抛出
   */
  async init(name) {
    const plugin = this.plugins.get(name)
    if (!plugin) {
      throw new ValidationError('name', 'valid plugin name', name, `插件不存在：${name}`)
    }

    if (this.initializedPlugins.has(name)) {
      console.warn(`[PluginRegistry] 插件已初始化：${name}`)
      return
    }

    if (plugin.init) {
      try {
        await plugin.init()
      } catch (error) {
        throw new ValidationError(
          'plugin.init',
          'function',
          'error',
          `插件初始化失败：${error.message}`
        )
      }
    }

    this.initializedPlugins.add(name)
    plugin.loaded = true
    console.warn(`[PluginRegistry] 插件已初始化：${name}`)
  }

  /**
   * 加载插件
   * @param {string} name - 插件名称
   * @param {Object} context - 上下文
   * @throws {ValidationError} 插件不存在或加载失败时抛出
   */
  async load(name, context = {}) {
    const plugin = this.plugins.get(name)
    if (!plugin) {
      throw new ValidationError('name', 'valid plugin name', name, `插件不存在：${name}`)
    }

    if (plugin.onLoad) {
      try {
        await plugin.onLoad(context)
      } catch (error) {
        throw new ValidationError(
          'plugin.onLoad',
          'function',
          'error',
          `插件加载失败：${error.message}`
        )
      }
    }

    plugin.active = true
    console.warn(`[PluginRegistry] 插件已加载：${name}`)
  }

  /**
   * 保存插件状态
   * @param {string} name - 插件名称
   * @param {Object} data - 保存数据
   * @throws {ValidationError} 插件不存在或保存失败时抛出
   */
  async save(name, data) {
    const plugin = this.plugins.get(name)
    if (!plugin) {
      throw new ValidationError('name', 'valid plugin name', name, `插件不存在：${name}`)
    }

    if (plugin.onSave) {
      try {
        await plugin.onSave(data)
      } catch (error) {
        throw new ValidationError(
          'plugin.onSave',
          'function',
          'error',
          `插件保存失败：${error.message}`
        )
      }
    }
  }

  /**
   * 销毁插件
   * @param {string} name - 插件名称
   * @throws {ValidationError} 插件不存在或销毁失败时抛出
   */
  async destroy(name) {
    const plugin = this.plugins.get(name)
    if (!plugin) {
      throw new ValidationError('name', 'valid plugin name', name, `插件不存在：${name}`)
    }

    if (plugin.onDestroy) {
      try {
        await plugin.onDestroy()
      } catch (error) {
        throw new ValidationError(
          'plugin.onDestroy',
          'function',
          'error',
          `插件销毁失败：${error.message}`
        )
      }
    }

    this.plugins.delete(name)
    this.initializedPlugins.delete(name)
    console.warn(`[PluginRegistry] 插件已销毁：${name}`)
  }

  /**
   * 激活插件
   * @param {string} name - 插件名称
   * @throws {ValidationError} 插件不存在或激活失败时抛出
   */
  async activate(name) {
    const plugin = this.plugins.get(name)
    if (!plugin) {
      throw new ValidationError('name', 'valid plugin name', name, `插件不存在：${name}`)
    }

    if (plugin.onActivate) {
      try {
        await plugin.onActivate()
      } catch (error) {
        throw new ValidationError(
          'plugin.onActivate',
          'function',
          'error',
          `插件激活失败：${error.message}`
        )
      }
    }
    plugin.active = true
  }

  /**
   * 停用插件
   * @param {string} name - 插件名称
   * @throws {ValidationError} 插件不存在或停用失败时抛出
   */
  async deactivate(name) {
    const plugin = this.plugins.get(name)
    if (!plugin) {
      throw new ValidationError('name', 'valid plugin name', name, `插件不存在：${name}`)
    }

    if (plugin.onDeactivate) {
      try {
        await plugin.onDeactivate()
      } catch (error) {
        throw new ValidationError(
          'plugin.onDeactivate',
          'function',
          'error',
          `插件停用失败：${error.message}`
        )
      }
    }
    plugin.active = false
  }

  /**
   * 获取所有已注册的插件
   * @returns {Array} 插件数组
   */
  getAll() {
    return Array.from(this.plugins.values())
  }

  /**
   * 清除所有插件
   */
  clear() {
    this.plugins.clear()
    this.pluginByType.clear()
    this.initializedPlugins.clear()
  }

  /**
   * 获取已注册的插件数量
   * @returns {number} 插件数量
   */
  getCount() {
    return this.plugins.size
  }
}

// 导出单例
export const pluginRegistry = new PluginRegistryClass()

// 导出注册方法
export const registerPlugin = (plugin) => pluginRegistry.register(plugin)

export default pluginRegistry
