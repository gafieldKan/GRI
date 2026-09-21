/**
 * 插件市场管理器
 * 负责插件的注册、发现、版本管理、依赖检查
 * 参考 Frappe 和 NocoBase 的插件架构
 */

import { EventEmitter } from 'events'

// 插件市场状态
export const MarketState = {
  IDLE: 'idle',
  LOADING: 'loading',
  READY: 'ready',
  ERROR: 'error',
}

// 插件状态
export const PluginState = {
  INSTALLED: 'installed',
  AVAILABLE: 'available',
  UPDATABLE: 'updatable',
  DISABLED: 'disabled',
  ERROR: 'error',
}

// 内置插件注册表
const BuiltinPlugins = {
  'custom-input': {
    name: 'custom-input',
    version: '1.0.0',
    description: '自定义输入组件插件',
    author: 'Awesome Lowcode',
    type: 'formComponent',
    main: './examples/custom-input/index.js',
    dependencies: {},
    state: PluginState.INSTALLED,
  },
  'data-source-api': {
    name: 'data-source-api',
    version: '1.0.0',
    description: 'API 数据源连接器',
    author: 'Awesome Lowcode',
    type: 'dataSource',
    main: './examples/data-source-api/index.js',
    dependencies: {},
    state: PluginState.INSTALLED,
  },
  'workflow-approval': {
    name: 'workflow-approval',
    version: '1.0.0',
    description: '审批工作流节点插件',
    author: 'Awesome Lowcode',
    type: 'workflowNode',
    main: './examples/workflow-approval/index.js',
    dependencies: {},
    state: PluginState.INSTALLED,
  },
}

class PluginMarketClass extends EventEmitter {
  constructor() {
    super()
    this.state = MarketState.IDLE
    this.plugins = new Map()
    this.installedPlugins = new Set()
    this.enabledPlugins = new Set()
    this.pluginConfig = new Map()
    this.registryUrl = null

    // 初始化内置插件
    this._initBuiltins()
  }

  /**
   * 初始化内置插件
   */
  _initBuiltins() {
    Object.values(BuiltinPlugins).forEach((plugin) => {
      this.plugins.set(plugin.name, { ...plugin })
      this.installedPlugins.add(plugin.name)
      this.enabledPlugins.add(plugin.name)
    })
  }

  /**
   * 设置插件注册中心 URL
   */
  setRegistryUrl(url) {
    this.registryUrl = url
    this.emit('registry:change', { url })
  }

  /**
   * 获取所有插件
   */
  getAllPlugins() {
    return Array.from(this.plugins.values())
  }

  /**
   * 获取已安装的插件
   */
  getInstalledPlugins() {
    return Array.from(this.installedPlugins).map((name) => this.plugins.get(name))
  }

  /**
   * 获取已启用的插件
   */
  getEnabledPlugins() {
    return Array.from(this.enabledPlugins).map((name) => this.plugins.get(name))
  }

  /**
   * 获取可用的插件（未安装）
   */
  getAvailablePlugins() {
    return Array.from(this.plugins.values()).filter((p) => !this.installedPlugins.has(p.name))
  }

  /**
   * 获取可更新的插件
   */
  getUpdatablePlugins() {
    return Array.from(this.plugins.values()).filter((p) => p.state === PluginState.UPDATABLE)
  }

  /**
   * 按类型获取插件
   */
  getPluginsByType(type) {
    return Array.from(this.plugins.values()).filter((p) => p.type === type)
  }

  /**
   * 获取插件详情
   */
  getPlugin(name) {
    return this.plugins.get(name)
  }

  /**
   * 安装插件
   */
  async install(pluginName, version) {
    const plugin = this.plugins.get(pluginName)

    if (!plugin) {
      // 从注册中心获取
      if (this.registryUrl) {
        try {
          const response = await fetch(`${this.registryUrl}/plugins/${pluginName}`)
          if (!response.ok) {
            throw new Error(`插件不存在：${pluginName}`)
          }
          const pluginData = await response.json()
          this.plugins.set(pluginName, {
            ...pluginData,
            state: PluginState.INSTALLED,
          })
        } catch (error) {
          console.error('[PluginMarket] 安装插件失败:', error)
          throw error
        }
      } else {
        throw new Error(`插件不存在：${pluginName}`)
      }
    }

    // 检查依赖
    const depErrors = this._checkDependencies(plugin)
    if (depErrors.length > 0) {
      throw new Error(`依赖检查失败：${depErrors.join(', ')}`)
    }

    // 标记为已安装
    this.installedPlugins.add(pluginName)
    this.enabledPlugins.add(pluginName)
    plugin.state = PluginState.INSTALLED

    this.emit('plugin:install', { name: pluginName, version })
    console.warn(`[PluginMarket] 已安装插件：${pluginName}`)

    return plugin
  }

  /**
   * 卸载插件
   */
  async uninstall(pluginName) {
    const plugin = this.plugins.get(pluginName)
    if (!plugin) {
      throw new Error(`插件未安装：${pluginName}`)
    }

    // 检查是否有其他插件依赖它
    const dependents = this._getDependents(pluginName)
    if (dependents.length > 0) {
      throw new Error(`无法卸载，以下插件依赖此插件：${dependents.join(', ')}`)
    }

    this.installedPlugins.delete(pluginName)
    this.enabledPlugins.delete(pluginName)
    plugin.state = PluginState.AVAILABLE

    this.emit('plugin:uninstall', { name: pluginName })
    console.warn(`[PluginMarket] 已卸载插件：${pluginName}`)

    return true
  }

  /**
   * 启用插件
   */
  async enable(pluginName) {
    const plugin = this.plugins.get(pluginName)
    if (!plugin) {
      throw new Error(`插件不存在：${pluginName}`)
    }

    if (!this.installedPlugins.has(pluginName)) {
      throw new Error(`插件未安装：${pluginName}`)
    }

    // 检查依赖
    const depErrors = this._checkDependencies(plugin)
    if (depErrors.length > 0) {
      throw new Error(`依赖检查失败：${depErrors.join(', ')}`)
    }

    this.enabledPlugins.add(pluginName)
    plugin.state = PluginState.INSTALLED

    this.emit('plugin:enable', { name: pluginName })
    console.warn(`[PluginMarket] 已启用插件：${pluginName}`)

    return true
  }

  /**
   * 禁用插件
   */
  async disable(pluginName) {
    const plugin = this.plugins.get(pluginName)
    if (!plugin) {
      throw new Error(`插件不存在：${pluginName}`)
    }

    this.enabledPlugins.delete(pluginName)
    plugin.state = PluginState.DISABLED

    this.emit('plugin:disable', { name: pluginName })
    console.warn(`[PluginMarket] 已禁用插件：${pluginName}`)

    return true
  }

  /**
   * 更新插件
   */
  async update(pluginName) {
    const plugin = this.plugins.get(pluginName)
    if (!plugin) {
      throw new Error(`插件不存在：${pluginName}`)
    }

    if (this.registryUrl) {
      try {
        const response = await fetch(`${this.registryUrl}/plugins/${pluginName}/latest`)
        if (!response.ok) {
          throw new Error('无法获取最新版本')
        }
        const latest = await response.json()

        if (latest.version !== plugin.version) {
          // 有新版本
          this.plugins.set(pluginName, {
            ...plugin,
            ...latest,
            state: PluginState.INSTALLED,
          })
          this.emit('plugin:update', {
            name: pluginName,
            from: plugin.version,
            to: latest.version,
          })
          console.warn(
            `[PluginMarket] 已更新插件：${pluginName} ${plugin.version} -> ${latest.version}`
          )
        }
      } catch (error) {
        console.error('[PluginMarket] 更新插件失败:', error)
        throw error
      }
    }

    return true
  }

  /**
   * 检查所有插件更新
   */
  async checkUpdates() {
    if (!this.registryUrl) {
      return []
    }

    const updates = []
    for (const plugin of this.plugins.values()) {
      if (this.installedPlugins.has(plugin.name)) {
        try {
          const response = await fetch(`${this.registryUrl}/plugins/${plugin.name}/latest`)
          if (response.ok) {
            const latest = await response.json()
            if (latest.version !== plugin.version) {
              updates.push({
                name: plugin.name,
                currentVersion: plugin.version,
                newVersion: latest.version,
              })
              plugin.state = PluginState.UPDATABLE
            }
          }
        } catch (error) {
          console.error(`[PluginMarket] 检查更新失败 ${plugin.name}:`, error)
        }
      }
    }

    return updates
  }

  /**
   * 设置插件配置
   */
  setPluginConfig(pluginName, config) {
    this.pluginConfig.set(pluginName, config)
    this.emit('plugin:config', { name: pluginName, config })
  }

  /**
   * 获取插件配置
   */
  getPluginConfig(pluginName) {
    return this.pluginConfig.get(pluginName) || {}
  }

  /**
   * 检查依赖
   */
  _checkDependencies(plugin) {
    const errors = []

    if (!plugin.dependencies) return errors

    for (const [depName, versionRange] of Object.entries(plugin.dependencies)) {
      const depPlugin = this.plugins.get(depName)

      if (!depPlugin) {
        errors.push(`缺少依赖：${depName}`)
        continue
      }

      if (!this._satisfiesVersion(depPlugin.version, versionRange)) {
        errors.push(`${depName} 版本不匹配 (需要 ${versionRange}, 当前 ${depPlugin.version})`)
      }
    }

    return errors
  }

  /**
   * 获取依赖此插件的其他插件
   */
  _getDependents(pluginName) {
    const dependents = []
    for (const plugin of this.plugins.values()) {
      if (plugin.dependencies?.[pluginName]) {
        dependents.push(plugin.name)
      }
    }
    return dependents
  }

  /**
   * 版本匹配检查
   */
  _satisfiesVersion(version, range) {
    // 简单实现，支持 * 和 >= 前缀
    if (range === '*') return true
    if (range.startsWith('>=')) {
      const minVersion = range.slice(2)
      return this._compareVersion(version, minVersion) >= 0
    }
    return version === range
  }

  /**
   * 版本比较
   */
  _compareVersion(v1, v2) {
    const parts1 = v1.split('.').map(Number)
    const parts2 = v2.split('.').map(Number)
    const len = Math.max(parts1.length, parts2.length)

    for (let i = 0; i < len; i++) {
      const n1 = parts1[i] || 0
      const n2 = parts2[i] || 0
      if (n1 > n2) return 1
      if (n1 < n2) return -1
    }
    return 0
  }

  /**
   * 刷新插件列表
   */
  async refresh() {
    if (this.registryUrl) {
      this.state = MarketState.LOADING
      this.emit('market:refresh')

      try {
        const response = await fetch(`${this.registryUrl}/plugins`)
        if (!response.ok) {
          throw new Error('获取插件列表失败')
        }
        const plugins = await response.json()

        plugins.forEach((plugin) => {
          const existing = this.plugins.get(plugin.name)
          if (existing) {
            // 更新现有插件信息
            this.plugins.set(plugin.name, {
              ...existing,
              latestVersion: plugin.version,
              state: plugin.version !== existing.version ? PluginState.UPDATABLE : existing.state,
            })
          } else {
            // 添加新插件
            this.plugins.set(plugin.name, {
              ...plugin,
              state: PluginState.AVAILABLE,
            })
          }
        })

        this.state = MarketState.READY
        this.emit('market:ready')
      } catch (error) {
        this.state = MarketState.ERROR
        this.emit('market:error', error)
      }
    }
  }
}

// 导出单例
export const pluginMarket = new PluginMarketClass()

export default pluginMarket
