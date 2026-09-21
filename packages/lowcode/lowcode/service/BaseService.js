/**
 * 服务层抽象基类
 * 所有业务服务继承自此类
 *
 * @author GRI Team
 * @version 1.0
 */

/**
 * 服务基类
 */
export class BaseService {
  constructor(repository, eventPublisher) {
    if (new.target === BaseService) {
      throw new Error('BaseService 是抽象类，不能直接实例化')
    }
    this.repository = repository
    this.eventPublisher = eventPublisher
  }

  /**
   * 获取单个实体
   */
  async getById(id) {
    throw new Error('子类必须实现 getById 方法')
  }

  /**
   * 获取列表
   */
  async getList(condition) {
    throw new Error('子类必须实现 getList 方法')
  }

  /**
   * 分页获取
   */
  async getPage(page, pageSize, condition) {
    throw new Error('子类必须实现 getPage 方法')
  }

  /**
   * 创建
   */
  async create(data) {
    throw new Error('子类必须实现 create 方法')
  }

  /**
   * 更新
   */
  async update(id, data) {
    throw new Error('子类必须实现 update 方法')
  }

  /**
   * 删除
   */
  async delete(id) {
    throw new Error('子类必须实现 delete 方法')
  }

  /**
   * 批量操作
   */
  async batchOperate(operations) {
    const results = []
    for (const op of operations) {
      try {
        const result = await this[op.type](...op.args)
        results.push({ success: true, result })
      } catch (error) {
        results.push({ success: false, error: error.message })
      }
    }
    return results
  }

  /**
   * 发布领域事件
   */
  async publishEvent(eventType, data) {
    await this.eventPublisher?.publish(eventType, data)
  }

  /**
   * 验证权限
   */
  async checkPermission(user, resource, action) {
    // 默认实现，子类可重写
    return true
  }

  /**
   * 记录日志
   */
  log(level, message, data) {
    const timestamp = new Date().toISOString()
    console.log(`[${timestamp}] [${level}] ${message}`, data || '')
  }
}

/**
 * 只缓存服务
 */
export class CacheableService extends BaseService {
  constructor(repository, eventPublisher, cacheManager) {
    super(repository, eventPublisher)
    this.cacheManager = cacheManager
  }

  async getById(id) {
    // 先查缓存
    const cached = this.cacheManager.get(this.getCacheKey(id))
    if (cached) {
      return cached
    }

    // 查数据库
    const result = await super.getById(id)

    // 写入缓存
    this.cacheManager.set(this.getCacheKey(id), result)

    return result
  }

  getCacheKey(id) {
    return `${this.constructor.name}:${id}`
  }
}

/**
 * 事务服务装饰器
 */
export class TransactionalService {
  constructor(service, transactionManager) {
    this.service = service
    this.transactionManager = transactionManager
  }

  async create(data) {
    return await this.transactionManager.execute(async () => {
      return await this.service.create(data)
    })
  }

  async update(id, data) {
    return await this.transactionManager.execute(async () => {
      return await this.service.update(id, data)
    })
  }

  async delete(id) {
    return await this.transactionManager.execute(async () => {
      return await this.service.delete(id)
    })
  }
}

export default BaseService
