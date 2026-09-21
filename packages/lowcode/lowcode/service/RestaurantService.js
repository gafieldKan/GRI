/**
 * 餐厅服务层
 * 提供餐厅业务逻辑的封装，对外提供统一的 API 接口
 *
 * @author GRI Team
 * @version 1.0
 */

import { RestaurantRepository } from '../repository/RestaurantRepository.js'
import { Restaurant, Address, BusinessHours } from '../domain/restaurant/Restaurant.js'

/**
 * 餐厅服务接口（抽象类）
 */
export class IRestaurantService {
  /**
   * 获取餐厅详情
   */
  async getRestaurant(id) {
    throw new Error('子类必须实现 getRestaurant 方法')
  }

  /**
   * 获取餐厅列表
   */
  async getRestaurantList(condition) {
    throw new Error('子类必须实现 getRestaurantList 方法')
  }

  /**
   * 创建餐厅
   */
  async createRestaurant(data) {
    throw new Error('子类必须实现 createRestaurant 方法')
  }

  /**
   * 更新餐厅
   */
  async updateRestaurant(id, data) {
    throw new Error('子类必须实现 updateRestaurant 方法')
  }

  /**
   * 删除餐厅
   */
  async deleteRestaurant(id) {
    throw new Error('子类必须实现 deleteRestaurant 方法')
  }

  /**
   * 检查餐厅是否在服务范围内
   */
  async isInServiceArea(restaurantId, lat, lng) {
    throw new Error('子类必须实现 isInServiceArea 方法')
  }

  /**
   * 获取餐厅菜单
   */
  async getMenu(restaurantId, categoryId) {
    throw new Error('子类必须实现 getMenu 方法')
  }
}

/**
 * 餐厅服务实现
 */
export class RestaurantService extends IRestaurantService {
  constructor(repository, domainEventPublisher) {
    super()
    this.repository = repository
    this.eventPublisher = domainEventPublisher
  }

  /**
   * 获取餐厅详情
   * @param {string} id - 餐厅 ID
   * @returns {Promise<Restaurant>}
   */
  async getRestaurant(id) {
    const restaurant = await this.repository.findById(id)

    if (!restaurant) {
      throw new Error(`餐厅不存在：${id}`)
    }

    return restaurant
  }

  /**
   * 获取餐厅列表
   * @param {Object} condition - 查询条件
   * @returns {Promise<Array>}
   */
  async getRestaurantList(condition = {}) {
    return await this.repository.findByCondition(condition)
  }

  /**
   * 获取餐厅列表（分页）
   * @param {number} page
   * @param {number} pageSize
   * @param {Object} condition
   * @returns {Promise<Object>}
   */
  async getRestaurantListPage(page, pageSize, condition = {}) {
    return await this.repository.findPage(page, pageSize, condition)
  }

  /**
   * 创建餐厅
   * @param {Object} data - 餐厅数据
   * @returns {Promise<Restaurant>}
   */
  async createRestaurant(data) {
    // 业务规则验证
    if (!data.name || !data.code) {
      throw new Error('餐厅名称和编码为必填项')
    }

    // 检查编码是否重复
    const existing = await this.repository.findByCondition({ code: data.code })
    if (existing && existing.length > 0) {
      throw new Error(`餐厅编码已存在：${data.code}`)
    }

    // 构建地址对象
    let address = null
    if (data.address) {
      address = new Address(data.address)
    }

    // 构建营业时间对象
    let businessHours = null
    if (data.businessHours) {
      businessHours = new BusinessHours(data.businessHours)
    }

    // 创建领域对象
    const restaurant = new Restaurant({
      ...data,
      address,
      businessHours,
      status: 'active',
    })

    // 验证业务规则
    restaurant.validate()

    // 保存
    const saved = await this.repository.save(restaurant)

    // 发布领域事件
    await this.eventPublisher?.publish('RESTAURANT_CREATED', {
      restaurantId: saved.id,
      code: saved.code,
    })

    return saved
  }

  /**
   * 更新餐厅
   * @param {string} id - 餐厅 ID
   * @param {Object} data - 更新数据
   * @returns {Promise<Restaurant>}
   */
  async updateRestaurant(id, data) {
    const restaurant = await this.getRestaurant(id)

    if (!restaurant) {
      throw new Error(`餐厅不存在：${id}`)
    }

    // 更新字段
    if (data.name) restaurant.name = data.name
    if (data.description) restaurant.description = data.description
    if (data.cuisine) restaurant.cuisine = data.cuisine
    if (data.phone) restaurant.phone = data.phone
    if (data.deliveryRange !== undefined) restaurant.deliveryRange = data.deliveryRange
    if (data.deliveryFee !== undefined) restaurant.deliveryFee = data.deliveryFee

    // 验证并保存
    restaurant.validate()
    const updated = await this.repository.update(restaurant)

    // 发布事件
    await this.eventPublisher?.publish('RESTAURANT_UPDATED', {
      restaurantId: id,
    })

    return updated
  }

  /**
   * 删除餐厅
   * @param {string} id - 餐厅 ID
   * @returns {Promise<boolean>}
   */
  async deleteRestaurant(id) {
    const restaurant = await this.getRestaurant(id)

    if (!restaurant) {
      throw new Error(`餐厅不存在：${id}`)
    }

    // 软删除
    restaurant.status = 'deleted'
    await this.repository.update(restaurant)

    // 发布事件
    await this.eventPublisher?.publish('RESTAURANT_DELETED', {
      restaurantId: id,
    })

    return true
  }

  /**
   * 检查餐厅是否在服务范围内
   * @param {string} restaurantId - 餐厅 ID
   * @param {number} lat - 纬度
   * @param {number} lng - 经度
   * @returns {Promise<boolean>}
   */
  async isInServiceArea(restaurantId, lat, lng) {
    const restaurant = await this.getRestaurant(restaurantId)
    return restaurant.isInServiceArea(lat, lng)
  }

  /**
   * 获取餐厅菜单
   * @param {string} restaurantId - 餐厅 ID
   * @param {string} categoryId - 分类 ID（可选）
   * @returns {Promise<Object>}
   */
  async getMenu(restaurantId, categoryId) {
    // 先检查餐厅是否存在
    await this.getRestaurant(restaurantId)

    // 通过菜单服务获取菜单
    const menuService = new MenuService(this.repository)
    return await menuService.getMenuByRestaurant(restaurantId, categoryId)
  }

  /**
   * 获取餐厅营业状态
   * @param {string} restaurantId - 餐厅 ID
   * @returns {Promise<Object>}
   */
  async getBusinessStatus(restaurantId) {
    const restaurant = await this.getRestaurant(restaurantId)
    const businessHours = restaurant.businessHours

    return {
      isOpen: businessHours?.isOpen() || false,
      statusText: businessHours?.getStatusText() || '未知',
      businessHours: businessHours?._values,
    }
  }
}

export default RestaurantService
