/**
 * Repository 层抽象
 * 提供数据访问的抽象接口，实现业务逻辑与数据源的解耦
 *
 * @author GRI Team
 * @version 1.0
 */

/**
 * Repository 基类
 * 定义通用的数据访问接口
 */
export class BaseRepository {
  constructor(dataSource) {
    if (new.target === BaseRepository) {
      throw new Error('BaseRepository 是抽象类，不能直接实例化')
    }
    this.dataSource = dataSource
    this.entityType = this.getEntityType()
  }

  /**
   * 获取实体类型（子类实现）
   */
  getEntityType() {
    throw new Error('子类必须实现 getEntityType 方法')
  }

  /**
   * 根据 ID 查找实体
   */
  async findById(id) {
    throw new Error('子类必须实现 findById 方法')
  }

  /**
   * 查找所有实体
   */
  async findAll() {
    throw new Error('子类必须实现 findAll 方法')
  }

  /**
   * 根据条件查找
   */
  async findByCondition(condition) {
    throw new Error('子类必须实现 findByCondition 方法')
  }

  /**
   * 保存实体
   */
  async save(entity) {
    throw new Error('子类必须实现 save 方法')
  }

  /**
   * 更新实体
   */
  async update(entity) {
    throw new Error('子类必须实现 update 方法')
  }

  /**
   * 删除实体
   */
  async delete(entity) {
    throw new Error('子类必须实现 delete 方法')
  }

  /**
   * 批量删除
   */
  async deleteAll(ids) {
    throw new Error('子类必须实现 deleteAll 方法')
  }

  /**
   * 计数
   */
  async count(condition) {
    throw new Error('子类必须实现 count 方法')
  }

  /**
   * 检查是否存在
   */
  async exists(id) {
    return !!(await this.findById(id))
  }

  /**
   * 分页查询
   */
  async findPage(page = 1, pageSize = 10, condition = {}) {
    throw new Error('子类必须实现 findPage 方法')
  }
}

/**
 * 数据源接口
 */
export class DataSource {
  /**
   * 查询数据
   */
  async query(sql, params) {
    throw new Error('子类必须实现 query 方法')
  }

  /**
   * 插入数据
   */
  async insert(table, data) {
    throw new Error('子类必须实现 insert 方法')
  }

  /**
   * 更新数据
   */
  async update(table, data, condition) {
    throw new Error('子类必须实现 update 方法')
  }

  /**
   * 删除数据
   */
  async delete(table, condition) {
    throw new Error('子类必须实现 delete 方法')
  }

  /**
   * 事务执行
   */
  async transaction(callback) {
    throw new Error('子类必须实现 transaction 方法')
  }
}

/**
 * 内存数据源（用于测试和演示）
 */
export class InMemoryDataSource extends DataSource {
  constructor() {
    super()
    this.storage = new Map()
  }

  async query(sql, params) {
    // 简化的内存查询实现
    const table = sql.match(/FROM\s+(\w+)/i)?.[1]
    if (!table) return []

    const data = this.storage.get(table) || []
    return data.filter((item) => {
      if (!params || !params.id) return true
      return item.id === params.id
    })
  }

  async insert(table, data) {
    if (!this.storage.has(table)) {
      this.storage.set(table, [])
    }
    const tableData = this.storage.get(table)
    tableData.push(data)
    return { id: data.id, ...data }
  }

  async update(table, data, condition) {
    const tableData = this.storage.get(table) || []
    const index = tableData.findIndex((item) => (condition.id ? item.id === condition.id : true))
    if (index > -1) {
      tableData[index] = { ...tableData[index], ...data }
      return tableData[index]
    }
    return null
  }

  async delete(table, condition) {
    const tableData = this.storage.get(table) || []
    const filtered = tableData.filter((item) => (condition.id ? item.id !== condition.id : true))
    this.storage.set(table, filtered)
    return tableData.length - filtered.length
  }

  async transaction(callback) {
    try {
      const result = await callback()
      return result
    } catch (error) {
      console.error('事务执行失败:', error)
      throw error
    }
  }

  // 辅助方法：清空数据
  clear(table) {
    if (table) {
      this.storage.delete(table)
    } else {
      this.storage.clear()
    }
  }
}

/**
 * REST API 数据源
 */
export class RestApiDataSource extends DataSource {
  constructor(baseUrl, options = {}) {
    super()
    this.baseUrl = baseUrl
    this.options = {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    }
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
  }

  /**
   * 添加响应拦截器
   */
  addResponseInterceptor(interceptor) {
    this.interceptors.response.push(interceptor)
  }

  /**
   * 添加错误拦截器
   */
  addErrorInterceptor(interceptor) {
    this.interceptors.error.push(interceptor)
  }

  async query(sql, params) {
    const url = this.buildUrl(sql, params)
    return await this.request('GET', url)
  }

  async insert(table, data) {
    return await this.request('POST', `/${table}`, data)
  }

  async update(table, data, condition) {
    const url = condition.id ? `/${table}/${condition.id}` : `/${table}`
    return await this.request('PUT', url, data)
  }

  async delete(table, condition) {
    const url = condition.id ? `/${table}/${condition.id}` : `/${table}`
    return await this.request('DELETE', url)
  }

  async transaction(callback) {
    // REST API 的事务支持
    try {
      return await callback()
    } catch (error) {
      throw error
    }
  }

  async request(method, url, data = null) {
    const fullUrl = url.startsWith('http') ? url : `${this.baseUrl}${url}`

    // 执行请求拦截器
    let config = { method, url: fullUrl, data }
    for (const interceptor of this.interceptors.request) {
      config = await interceptor(config)
    }

    try {
      const response = await fetch(config.url, {
        method: config.method,
        headers: this.options.headers,
        body: config.data ? JSON.stringify(config.data) : null,
        ...this.options,
      })

      const result = await response.json()

      // 执行响应拦截器
      let processedResult = result
      for (const interceptor of this.interceptors.response) {
        processedResult = await interceptor(processedResult, response)
      }

      return processedResult
    } catch (error) {
      // 执行错误拦截器
      for (const interceptor of this.interceptors.error) {
        await interceptor(error)
      }
      throw error
    }
  }

  buildUrl(sql, params) {
    // 简化实现，实际应解析 SQL
    return sql
  }
}

export default BaseRepository
