/**
 * 菜品 Repository 实现
 * 提供菜品领域的数据访问接口
 *
 * @author GRI Team
 * @version 1.0
 */

import { BaseRepository } from './BaseRepository.js'
import { Dish, Price } from '../domain/dish/Dish.js'

/**
 * 菜品 Repository
 */
export class DishRepository extends BaseRepository {
  constructor(dataSource) {
    super()
    this.dataSource = dataSource
    this.tableName = 'dishes'
  }

  getEntityType() {
    return 'Dish'
  }

  /**
   * 根据 ID 查找菜品
   */
  async findById(id) {
    const result = await this.dataSource.query(`SELECT * FROM ${this.tableName} WHERE id = :id`, {
      id,
    })
    if (!result || !result.data) return null
    return this.mapToEntity(result.data)
  }

  /**
   * 根据餐厅查找菜品
   */
  async findByRestaurant(restaurantId, categoryId) {
    const condition = { restaurantId }
    if (categoryId) condition.categoryId = categoryId

    const result = await this.dataSource.query(
      `SELECT * FROM ${this.tableName} WHERE restaurantId = :restaurantId`,
      condition
    )
    if (!result || !result.data) return []
    return result.data.map((item) => this.mapToEntity(item))
  }

  /**
   * 查找所有菜品
   */
  async findAll() {
    const result = await this.dataSource.query(`SELECT * FROM ${this.tableName}`)
    if (!result || !result.data) return []
    return result.data.map((item) => this.mapToEntity(item))
  }

  /**
   * 根据条件查找
   */
  async findByCondition(condition) {
    const { restaurantId, status, category, keyword } = condition
    const params = {}
    const whereClauses = []

    if (restaurantId) {
      whereClauses.push('restaurantId = :restaurantId')
      params.restaurantId = restaurantId
    }

    if (status) {
      whereClauses.push('status = :status')
      params.status = status
    }

    if (category) {
      whereClauses.push('categoryId = :categoryId')
      params.categoryId = category
    }

    if (keyword) {
      whereClauses.push('name LIKE :keyword')
      params.keyword = `%${keyword}%`
    }

    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''

    const result = await this.dataSource.query(
      `SELECT * FROM ${this.tableName} ${whereClause} ORDER BY sortOrder ASC`
    )

    if (!result || !result.data) return []
    return result.data.map((item) => this.mapToEntity(item))
  }

  /**
   * 保存菜品
   */
  async save(dish) {
    const dto = dish.toDTO()
    const result = await this.dataSource.insert(this.tableName, dto)
    return this.mapToEntity(result)
  }

  /**
   * 更新菜品
   */
  async update(dish) {
    const dto = dish.toDTO()
    const result = await this.dataSource.update(this.tableName, dto, { id: dish.id })
    return this.mapToEntity(result)
  }

  /**
   * 删除菜品
   */
  async delete(dish) {
    return await this.dataSource.delete(this.tableName, { id: dish.id })
  }

  /**
   * 批量删除
   */
  async deleteAll(ids) {
    const promises = ids.map((id) => this.dataSource.delete(this.tableName, { id }))
    return Promise.all(promises)
  }

  /**
   * 计数
   */
  async count(condition = {}) {
    const result = await this.dataSource.query(
      `SELECT COUNT(*) as count FROM ${this.tableName}`,
      condition
    )
    return result?.data?.[0]?.count || 0
  }

  /**
   * 分页查询
   */
  async findPage(page = 1, pageSize = 10, condition = {}) {
    const offset = (page - 1) * pageSize
    const result = await this.dataSource.query(
      `SELECT * FROM ${this.tableName} LIMIT :limit OFFSET :offset`,
      { limit: pageSize, offset, ...condition }
    )

    const total = await this.count(condition)

    return {
      data: result?.data?.map((item) => this.mapToEntity(item)) || [],
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    }
  }

  /**
   * 将数据映射到领域对象
   */
  mapToEntity(data) {
    if (!data) return null

    return new Dish({
      id: data.id,
      name: data.name,
      code: data.code,
      description: data.description,
      price: data.price ? new Price(data.price) : null,
      originalPrice: data.originalPrice ? new Price(data.originalPrice) : null,
      images: data.images || [],
      unit: data.unit || '份',
      status: data.status || 'onsale',
      isRecommended: data.isRecommended || false,
      isSignature: data.isSignature || false,
      spicyLevel: data.spicyLevel || 0,
      tags: data.tags || [],
      ingredients: data.ingredients || [],
      allergens: data.allergens || [],
      specifications: data.specifications || [],
      flavors: data.flavors || [],
      restaurantId: data.restaurantId,
      sortOrder: data.sortOrder || 0,
      category: data.category,
    })
  }
}

export default DishRepository

// 导出单例实例
export const dishRepository = new DishRepository()
