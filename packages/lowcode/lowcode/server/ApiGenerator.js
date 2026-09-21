/**
 * 自动 API 生成器
 * 基于模型 Schema 自动生成 CRUD REST API
 *
 * @author GRI Team
 * @version 1.0
 */

import { EventEmitter } from 'events'
import { modelValidator } from '../core/ModelValidator.js'

/**
 * API 响应助手
 */
class ApiResponse {
  static success(data, message = 'Success') {
    return {
      success: true,
      message,
      data,
      timestamp: Date.now(),
    }
  }

  static error(message, code = 'ERROR') {
    return {
      success: false,
      message,
      code,
      timestamp: Date.now(),
    }
  }
}

/**
 * 查询解析器
 */
class QueryParser {
  /**
   * 解析查询参数
   */
  static parse(queryParams = {}) {
    const { page = 1, pageSize = 10, sort, order = 'asc', fields, ...filters } = queryParams

    return {
      pagination: {
        page: parseInt(page, 10),
        pageSize: parseInt(pageSize, 10),
      },
      sort: this.parseSort(sort, order),
      fields: this.parseFields(fields),
      filters: this.parseFilters(filters),
    }
  }

  /**
   * 解析排序
   */
  static parseSort(sort, order) {
    if (!sort) return null

    const validOrders = ['asc', 'desc', 'ASC', 'DESC', 1, -1]
    const normalizedOrder = order.toLowerCase() === 'desc' || order === -1 ? 'desc' : 'asc'

    return {
      field: sort,
      order: normalizedOrder,
    }
  }

  /**
   * 解析字段选择
   */
  static parseFields(fields) {
    if (!fields) return null

    return Array.isArray(fields)
      ? fields
      : String(fields)
          .split(',')
          .map((f) => f.trim())
  }

  /**
   * 解析过滤器
   */
  static parseFilters(filters) {
    const parsed = {}

    for (const [key, value] of Object.entries(filters)) {
      if (value === '' || value === undefined || value === null) {
        continue
      }

      // 支持操作符前缀
      const operators = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'nin', 'like', 'ilike']
      const parts = key.split('_')
      let fieldName = key
      let operator = 'eq'

      if (parts.length > 1 && operators.includes(parts[parts.length - 1])) {
        operator = parts.pop()
        fieldName = parts.join('_')
      }

      parsed[fieldName] = {
        operator,
        value: this.parseValue(value, operator),
      }
    }

    return parsed
  }

  /**
   * 解析值
   */
  static parseValue(value, operator) {
    if (operator === 'in' || operator === 'nin') {
      return Array.isArray(value) ? value : String(value).split(',')
    }

    // 尝试转换为数字
    if (!isNaN(value) && value !== '') {
      return Number(value)
    }

    // 布尔值
    if (value === 'true') return true
    if (value === 'false') return false

    return value
  }
}

/**
 * 数据访问对象基类
 */
class BaseDAO {
  constructor(modelName) {
    this.modelName = modelName
    this.storage = new Map() // 内存存储，实际实现需对接数据库
  }

  async find(query = {}) {
    const results = Array.from(this.storage.values())

    if (query.filters) {
      return results.filter((item) => this.matchesFilters(item, query.filters))
    }

    return results
  }

  async findById(id) {
    return this.storage.get(id) || null
  }

  async create(data) {
    const id = data.id || `item_${Date.now()}`
    const item = { ...data, id, createdAt: Date.now(), updatedAt: Date.now() }
    this.storage.set(id, item)
    return item
  }

  async update(id, data) {
    const existing = this.storage.get(id)
    if (!existing) {
      throw new Error(`记录不存在：${id}`)
    }

    const updated = {
      ...existing,
      ...data,
      id,
      updatedAt: Date.now(),
    }
    this.storage.set(id, updated)
    return updated
  }

  async delete(id) {
    return this.storage.delete(id)
  }

  async count(query = {}) {
    const results = await this.find(query)
    return results.length
  }

  matchesFilters(item, filters) {
    for (const [field, { operator, value }] of Object.entries(filters)) {
      const itemValue = item[field]

      switch (operator) {
        case 'eq':
          if (itemValue !== value) return false
          break
        case 'ne':
          if (itemValue === value) return false
          break
        case 'gt':
          if (itemValue <= value) return false
          break
        case 'gte':
          if (itemValue < value) return false
          break
        case 'lt':
          if (itemValue >= value) return false
          break
        case 'lte':
          if (itemValue > value) return false
          break
        case 'in':
          if (!value.includes(itemValue)) return false
          break
        case 'nin':
          if (value.includes(itemValue)) return false
          break
        case 'like':
          if (!String(itemValue).includes(value)) return false
          break
        case 'ilike':
          if (!String(itemValue).toLowerCase().includes(String(value).toLowerCase())) return false
          break
        default:
          if (itemValue !== value) return false
      }
    }
    return true
  }
}

/**
 * API 生成器主类
 */
class ApiGeneratorClass extends EventEmitter {
  constructor() {
    super()
    this.apis = new Map()
    this.daos = new Map()
    this.middlewares = []
    this.basePath = '/api'
  }

  /**
   * 为模型生成 API
   */
  generate(modelName, schema) {
    const routes = {
      list: this.createListRoute(modelName, schema),
      get: this.createGetRoute(modelName, schema),
      create: this.createCreateRoute(modelName, schema),
      update: this.createUpdateRoute(modelName, schema),
      delete: this.createDeleteRoute(modelName, schema),
      batch: this.createBatchRoute(modelName, schema),
    }

    this.apis.set(modelName, { schema, routes })
    this.daos.set(modelName, new BaseDAO(modelName))

    this.emit('api:generate', { modelName, schema, routes })
    return routes
  }

  /**
   * 生成列表查询路由
   */
  createListRoute(modelName, schema) {
    return {
      method: 'GET',
      path: `/${this.basePath}/${modelName}`,
      handler: async (req) => {
        try {
          const query = QueryParser.parse(req.query)
          const dao = this.daos.get(modelName)

          let results = await dao.find({ filters: query.filters })

          // 应用排序
          if (query.sort) {
            const { field, order } = query.sort
            results.sort((a, b) => {
              const aVal = a[field]
              const bVal = b[field]
              const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
              return order === 'desc' ? -cmp : cmp
            })
          }

          // 应用分页
          const { page, pageSize } = query.pagination
          const start = (page - 1) * pageSize
          const paginated = results.slice(start, start + pageSize)

          return ApiResponse.success({
            list: paginated,
            pagination: {
              page,
              pageSize,
              total: results.length,
              totalPage: Math.ceil(results.length / pageSize),
            },
          })
        } catch (error) {
          return ApiResponse.error(error.message)
        }
      },
    }
  }

  /**
   * 生成获取单个资源路由
   */
  createGetRoute(modelName, schema) {
    return {
      method: 'GET',
      path: `/${this.basePath}/${modelName}/:id`,
      handler: async (req) => {
        try {
          const dao = this.daos.get(modelName)
          const item = await dao.findById(req.params.id)

          if (!item) {
            return ApiResponse.error('记录不存在', 'NOT_FOUND')
          }

          return ApiResponse.success(item)
        } catch (error) {
          return ApiResponse.error(error.message)
        }
      },
    }
  }

  /**
   * 生成创建资源路由
   */
  createCreateRoute(modelName, schema) {
    return {
      method: 'POST',
      path: `/${this.basePath}/${modelName}`,
      handler: async (req) => {
        try {
          // 验证数据
          const errors = modelValidator.validate(req.body, schema)
          if (errors.length > 0) {
            return ApiResponse.error(`验证失败：${errors.join(', ')}`, 'VALIDATION_ERROR')
          }

          const dao = this.daos.get(modelName)
          const item = await dao.create(req.body)

          return ApiResponse.success(item, '创建成功')
        } catch (error) {
          return ApiResponse.error(error.message)
        }
      },
    }
  }

  /**
   * 生成更新资源路由
   */
  createUpdateRoute(modelName, schema) {
    return {
      method: 'PUT',
      path: `/${this.basePath}/${modelName}/:id`,
      handler: async (req) => {
        try {
          const dao = this.daos.get(modelName)
          const item = await dao.update(req.params.id, req.body)

          return ApiResponse.success(item, '更新成功')
        } catch (error) {
          return ApiResponse.error(error.message)
        }
      },
    }
  }

  /**
   * 生成删除资源路由
   */
  createDeleteRoute(modelName, schema) {
    return {
      method: 'DELETE',
      path: `/${this.basePath}/${modelName}/:id`,
      handler: async (req) => {
        try {
          const dao = this.daos.get(modelName)
          const deleted = await dao.delete(req.params.id)

          if (!deleted) {
            return ApiResponse.error('记录不存在', 'NOT_FOUND')
          }

          return ApiResponse.success(null, '删除成功')
        } catch (error) {
          return ApiResponse.error(error.message)
        }
      },
    }
  }

  /**
   * 生成批量操作路由
   */
  createBatchRoute(modelName, schema) {
    return {
      method: 'POST',
      path: `/${this.basePath}/${modelName}/batch`,
      handler: async (req) => {
        try {
          const { operation, ids, data } = req.body
          const dao = this.daos.get(modelName)

          if (!operation || !ids || !Array.isArray(ids)) {
            return ApiResponse.error('无效请求', 'INVALID_REQUEST')
          }

          let result

          switch (operation) {
            case 'delete':
              result = ids.filter((id) => dao.storage.delete(id))
              break
            case 'update':
              result = ids.map((id) => dao.update(id, data))
              break
            default:
              return ApiResponse.error('不支持的批量操作', 'UNSUPPORTED_OPERATION')
          }

          return ApiResponse.success(result, `批量${operation}成功`)
        } catch (error) {
          return ApiResponse.error(error.message)
        }
      },
    }
  }

  /**
   * 注册中间件
   */
  use(middleware) {
    this.middlewares.push(middleware)
    return this
  }

  /**
   * 执行中间件链
   */
  async executeMiddlewares(context) {
    for (const middleware of this.middlewares) {
      await middleware(context)
    }
  }

  /**
   * 获取所有 API 路由
   */
  getRoutes() {
    const routes = []
    for (const [modelName, { routes: modelRoutes }] of this.apis) {
      for (const [action, route] of Object.entries(modelRoutes)) {
        routes.push({
          model: modelName,
          action,
          ...route,
        })
      }
    }
    return routes
  }

  /**
   * 获取指定模型的路由
   */
  getRoutesByModel(modelName) {
    const api = this.apis.get(modelName)
    return api ? api.routes : null
  }

  /**
   * 执行路由处理器
   */
  async executeRoute(modelName, action, context) {
    const api = this.apis.get(modelName)
    if (!api) {
      return ApiResponse.error(`模型不存在：${modelName}`, 'MODEL_NOT_FOUND')
    }

    const route = api.routes[action]
    if (!route) {
      return ApiResponse.error(`路由不存在：${action}`, 'ROUTE_NOT_FOUND')
    }

    // 执行中间件
    await this.executeMiddlewares(context)

    // 执行路由处理器
    return route.handler(context)
  }
}

// 导出单例
export const apiGenerator = new ApiGeneratorClass()
export { ApiResponse, QueryParser, BaseDAO }
export default apiGenerator
