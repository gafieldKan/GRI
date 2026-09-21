/**
 * API 数据源插件示例
 * 演示如何扩展一个 API 数据源连接器
 */

import { registerPlugin, PluginType } from '../../core/PluginRegistry'

// 模拟 API 请求
const fetchApi = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  if (!response.ok) {
    throw new Error(`HTTP Error: ${response.status}`)
  }
  return response.json()
}

// 注册 API 数据源插件
registerPlugin({
  name: 'api-data-source',
  type: PluginType.DATA_SOURCE,
  version: '1.0.0',
  description: '通用 API 数据源连接器，支持 RESTful API',
  author: 'Awesome Lowcode Team',

  config: {
    timeout: 30000,
    retry: 3,
  },

  async init() {
    console.warn('[ApiDataSource] 初始化')
    this.configs = new Map()
  },

  /**
   * 配置数据源
   */
  configure(name, config) {
    this.configs.set(name, {
      baseUrl: config.baseUrl,
      headers: config.headers || {},
      timeout: config.timeout || 30000,
    })
  },

  /**
   * 获取数据
   * @param {string} name - 数据源名称
   * @param {string} endpoint - API 端点
   * @param {Object} params - 请求参数
   */
  async fetch(name, endpoint, params = {}) {
    const config = this.configs.get(name)
    if (!config) {
      throw new Error(`数据源未配置：${name}`)
    }

    const url = new URL(endpoint, config.baseUrl)
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value)
    })

    return fetchApi(url.toString(), {
      headers: config.headers,
      timeout: config.timeout,
    })
  },

  /**
   * 提交数据
   */
  async post(name, endpoint, data) {
    const config = this.configs.get(name)
    if (!config) {
      throw new Error(`数据源未配置：${name}`)
    }

    const url = new URL(endpoint, config.baseUrl)

    return fetchApi(url.toString(), {
      method: 'POST',
      headers: config.headers,
      body: JSON.stringify(data),
      timeout: config.timeout,
    })
  },

  async onLoad(context) {
    console.warn('[ApiDataSource] 加载', context)
  },

  async onSave(data) {
    console.warn('[ApiDataSource] 保存配置', data)
  },

  async onDestroy() {
    console.warn('[ApiDataSource] 销毁')
    this.configs?.clear()
  },
})

// 导出 Hook 供 React 组件使用
export const useApiDataSource = (dataSourceName) => {
  const { fetch, post } = window.dataSourcePlugin?.[dataSourceName] || {}

  const fetchData = async (endpoint, params) => {
    try {
      const data = await fetch?.(endpoint, params)
      return data
    } catch (error) {
      console.error('获取数据失败:', error)
      throw error
    }
  }

  const postData = async (endpoint, data) => {
    try {
      const result = await post?.(endpoint, data)
      return result
    } catch (error) {
      console.error('提交数据失败:', error)
      throw error
    }
  }

  return { fetch: fetchData, post: postData }
}

export default useApiDataSource
