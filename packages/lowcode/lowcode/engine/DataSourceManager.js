/**
 * 数据源管理器
 * 支持 REST、GraphQL、MySQL、PostgreSQL、MongoDB 等多种数据源
 *
 * @author GRI Team
 * @version 1.0
 */

import { EventEmitter } from 'events'

/**
 * 数据源类型枚举
 */
export const DataSourceType = {
  REST: 'rest',
  GRAPHQL: 'graphql',
  MYSQL: 'mysql',
  POSTGRESQL: 'postgresql',
  MONGODB: 'mongodb',
  SQLITE: 'sqlite',
  ORACLE: 'oracle',
  SQLSERVER: 'sqlserver',
  CUSTOM: 'custom',
}

/**
 * 数据源状态枚举
 */
export const DataSourceState = {
  INACTIVE: 'inactive',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error',
}

/**
 * 数据源配置类
 */
export class DataSourceConfig {
  constructor(config = {}) {
    this.id = config.id || this.#generateId()
    this.name = config.name || ''
    this.type = config.type || DataSourceType.REST
    this.description = config.description || ''
    this.config = config.config || {}
    this.state = DataSourceState.INACTIVE
    this.timeout = config.timeout || 30000
    this.retry = config.retry || 3
    this.endpoints = config.endpoints || {}
    this.headers = config.headers || {}
    this.transformers = config.transformers || {
      request: null,
      response: null,
    }
    this.createdAt = Date.now()
    this.updatedAt = Date.now()
  }

  #generateId() {
    return `ds_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      description: this.description,
      config: this.config,
      state: this.state,
      timeout: this.timeout,
      retry: this.retry,
      endpoints: this.endpoints,
      headers: this.headers,
      transformers: this.transformers,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    }
  }
}

/**
 * REST 数据源适配器
 */
class RestAdapter {
  constructor(config) {
    this.config = config
    this.baseURL = config.baseURL || ''
    this.headers = config.headers || {}
  }

  async connect() {
    try {
      // 测试连接
      const response = await fetch(this.baseURL, {
        method: 'GET',
        headers: this.headers,
      })
      return response.ok
    } catch (error) {
      throw new Error(`REST 数据源连接失败：${error.message}`)
    }
  }

  async execute(endpoint, options = {}) {
    const { method = 'GET', path, body, headers = {} } = options

    const url = path.startsWith('http') ? path : `${this.baseURL}${path}`

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...this.headers,
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      ...options,
    })

    if (!response.ok) {
      throw new Error(`HTTP 错误：${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return data
  }

  async disconnect() {
    // REST 无需特别断开
  }
}

/**
 * GraphQL 数据源适配器
 */
class GraphqlAdapter {
  constructor(config) {
    this.config = config
    this.endpoint = config.endpoint || ''
    this.headers = config.headers || {}
  }

  async connect() {
    try {
      // 发送 introspection 查询测试连接
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.headers,
        },
        body: JSON.stringify({
          query: '__schema { types { name } }',
        }),
      })
      return response.ok
    } catch (error) {
      throw new Error(`GraphQL 数据源连接失败：${error.message}`)
    }
  }

  async execute(query, variables = {}) {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.headers,
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    })

    if (!response.ok) {
      throw new Error(`GraphQL 错误：${response.status} ${response.statusText}`)
    }

    const data = await response.json()

    if (data.errors) {
      throw new Error(`GraphQL 查询错误：${JSON.stringify(data.errors)}`)
    }

    return data.data
  }

  async disconnect() {
    // 无需特别处理
  }
}

/**
 * SQL 数据源适配器基类
 */
class SqlAdapter {
  constructor(config) {
    this.config = config
    this.connection = null
  }

  async connect() {
    throw new Error('子类必须实现 connect 方法')
  }

  async execute(sql, params = []) {
    throw new Error('子类必须实现 execute 方法')
  }

  async disconnect() {
    throw new Error('子类必须实现 disconnect 方法')
  }

  /**
   * 构建查询条件
   */
  buildQuery(options = {}) {
    const { where, orderBy, limit, offset } = options
    const conditions = []
    const values = []

    if (where) {
      for (const [key, value] of Object.entries(where)) {
        if (value !== undefined) {
          conditions.push(`${key} = ?`)
          values.push(value)
        }
      }
    }

    const sql = `SELECT * FROM ${options.table}${conditions.length ? ' WHERE ' + conditions.join(' AND ') : ''}${orderBy ? ' ORDER BY ' + orderBy : ''}${limit ? ' LIMIT ' + limit : ''}${offset ? ' OFFSET ' + offset : ''}`

    return { sql, values }
  }
}

/**
 * MySQL 适配器
 */
class MySqlAdapter extends SqlAdapter {
  async connect() {
    // 实际项目中需要 mysql2 或 mysql 驱动
    // 这里仅做模拟
    this.connection = { connected: true }
    return true
  }

  async execute(sql, params = []) {
    if (!this.connection) {
      throw new Error('数据库未连接')
    }
    // 模拟执行
    console.log('[MySQL]', sql, params)
    return []
  }

  async disconnect() {
    this.connection = null
  }
}

/**
 * PostgreSQL 适配器
 */
class PostgreSQLAdapter extends SqlAdapter {
  async connect() {
    // 实际项目中需要 pg 驱动
    this.connection = { connected: true }
    return true
  }

  async execute(sql, params = []) {
    if (!this.connection) {
      throw new Error('数据库未连接')
    }
    console.log('[PostgreSQL]', sql, params)
    return []
  }

  async disconnect() {
    this.connection = null
  }
}

/**
 * MongoDB 适配器
 */
class MongoDBAdapter {
  constructor(config) {
    this.config = config
    this.connection = null
    this.db = null
  }

  async connect() {
    // 实际项目中需要 mongodb 驱动
    this.connection = { connected: true }
    return true
  }

  async execute(collection, operation, query = {}) {
    if (!this.connection) {
      throw new Error('数据库未连接')
    }
    console.log('[MongoDB]', collection, operation, query)
    return []
  }

  async disconnect() {
    this.connection = null
    this.db = null
  }
}

/**
 * 数据源管理器主类
 */
class DataSourceManagerClass extends EventEmitter {
  constructor() {
    super()
    this.sources = new Map()
    this.connections = new Map()
    this.adapters = {
      [DataSourceType.REST]: RestAdapter,
      [DataSourceType.GRAPHQL]: GraphqlAdapter,
      [DataSourceType.MYSQL]: MySqlAdapter,
      [DataSourceType.POSTGRESQL]: PostgreSQLAdapter,
      [DataSourceType.MONGODB]: MongoDBAdapter,
    }
  }

  /**
   * 注册数据源
   */
  register(config) {
    const dataSource = new DataSourceConfig(config)
    this.sources.set(dataSource.id, dataSource)
    this.emit('datasource:register', { dataSource })
    return dataSource
  }

  /**
   * 获取数据源
   */
  get(id) {
    return this.sources.get(id)
  }

  /**
   * 获取所有数据源
   */
  getAll() {
    return Array.from(this.sources.values())
  }

  /**
   * 按类型获取数据源
   */
  getByType(type) {
    return this.getAll().filter((ds) => ds.type === type)
  }

  /**
   * 连接数据源
   */
  async connect(id) {
    const dataSource = this.sources.get(id)
    if (!dataSource) {
      throw new Error(`数据源不存在：${id}`)
    }

    try {
      dataSource.state = DataSourceState.CONNECTING
      const AdapterClass = this.adapters[dataSource.type] || RestAdapter
      const adapter = new AdapterClass(dataSource.config)

      await adapter.connect()
      this.connections.set(id, adapter)
      dataSource.state = DataSourceState.CONNECTED
      dataSource.updatedAt = Date.now()

      this.emit('datasource:connect', { id, dataSource })
      return true
    } catch (error) {
      dataSource.state = DataSourceState.ERROR
      this.emit('datasource:error', { id, error })
      throw error
    }
  }

  /**
   * 断开数据源连接
   */
  async disconnect(id) {
    const adapter = this.connections.get(id)
    if (adapter) {
      await adapter.disconnect()
      this.connections.delete(id)
    }

    const dataSource = this.sources.get(id)
    if (dataSource) {
      dataSource.state = DataSourceState.INACTIVE
    }

    this.emit('datasource:disconnect', { id })
  }

  /**
   * 执行查询
   */
  async execute(id, query, params = {}) {
    const adapter = this.connections.get(id)
    if (!adapter) {
      throw new Error(`数据源未连接：${id}`)
    }

    try {
      const result = await adapter.execute(query, params)
      this.emit('datasource:execute', { id, query, result })
      return result
    } catch (error) {
      this.emit('datasource:error', { id, query, error })
      throw error
    }
  }

  /**
   * 删除数据源
   */
  async delete(id) {
    await this.disconnect(id)
    const deleted = this.sources.delete(id)
    if (deleted) {
      this.emit('datasource:delete', { id })
    }
    return deleted
  }

  /**
   * 更新数据源配置
   */
  update(id, updates) {
    const dataSource = this.sources.get(id)
    if (!dataSource) {
      throw new Error(`数据源不存在：${id}`)
    }

    Object.assign(dataSource, updates)
    dataSource.updatedAt = Date.now()
    this.emit('datasource:update', { id, dataSource })
    return dataSource
  }

  /**
   * 导出数据源配置
   */
  export(id) {
    const dataSource = this.sources.get(id)
    if (!dataSource) {
      return null
    }
    return JSON.stringify(dataSource.toJSON(), null, 2)
  }

  /**
   * 导入数据源配置
   */
  import(jsonString) {
    try {
      const config = JSON.parse(jsonString)
      return this.register(config)
    } catch (error) {
      throw new Error(`导入数据源失败：${error.message}`)
    }
  }

  /**
   * 清空所有数据源
   */
  clear() {
    this.sources.clear()
    this.connections.clear()
    this.emit('datasource:clear')
  }
}

// 导出单例
export const dataSourceManager = new DataSourceManagerClass()
export default dataSourceManager
