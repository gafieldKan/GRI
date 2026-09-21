/**
 * 餐厅 Repository 实现
 * 提供餐厅领域的数据访问接口
 *
 * @author GRI Team
 * @version 1.0
 */

import { BaseRepository } from './BaseRepository.js'
import { Restaurant, Address, BusinessHours } from '../domain/restaurant/Restaurant.js'

/**
 * 餐厅 Repository
 */
export class RestaurantRepository extends BaseRepository {
  constructor(dataSource) {
    super()
    this.dataSource = dataSource
    this.tableName = 'restaurants'
  }

  getEntityType() {
    return 'Restaurant'
  }

  /**
   * 根据 ID 查找餐厅
   */
  async findById(id) {
    const result = await this.dataSource.query(`SELECT * FROM ${this.tableName} WHERE id = :id`, {
      id,
    })

    if (!result || !result.data) return null
    return this.mapToEntity(result.data)
  }

  /**
   * 查找所有餐厅
   */
  async findAll() {
    const result = await this.dataSource.query(`SELECT * FROM ${this.tableName}`)

    if (!result || !result.data) return []
    return result.data.map((item) => this.mapToEntity(item))
  }

  /**
   * 根据条件查找餐厅
   */
  async findByCondition(condition) {
    const { cuisine, status, keyword, lat, lng, range } = condition
    const params = {}
    const whereClauses = []

    if (cuisine) {
      whereClauses.push('cuisine = :cuisine')
      params.cuisine = cuisine
    }

    if (status) {
      whereClauses.push('status = :status')
      params.status = status
    }

    if (keyword) {
      whereClauses.push('name LIKE :keyword')
      params.keyword = `%${keyword}%`
    }

    if (lat && lng && range) {
      // 地理位置查询（简化）
      whereClauses.push('lat BETWEEN :latRange AND :lngRange')
      params.latRange = lat - range
      params.lngRange = lng + range
    }

    const whereClause = whereClauses.join(' AND ')
    const result = await this.dataSource.query(
      `SELECT * FROM ${this.tableName} WHERE ${whereClause}`,
      params
    )

    if (!result || !result.data) return []
    return result.data.map((item) => this.mapToEntity(item))
  }

  /**
   * 根据 ID 列表查找餐厅
   */
  async findByIds(ids) {
    const result = await this.dataSource.query(
      `SELECT * FROM ${this.tableName} WHERE id IN (:ids)`,
      { ids }
    )

    if (!result || !result.data) return []
    return result.data.map((item) => this.mapToEntity(item))
  }

  /**
   * 保存餐厅
   */
  async save(restaurant) {
    const dto = restaurant.toDTO()
    const result = await this.dataSource.insert(this.tableName, dto)
    return this.mapToEntity(result)
  }

  /**
   * 更新餐厅
   */
  async update(restaurant) {
    const dto = restaurant.toDTO()
    const result = await this.dataSource.update(this.tableName, dto, { id: restaurant.id })
    return this.mapToEntity(result)
  }

  /**
   * 删除餐厅
   */
  async delete(restaurant) {
    return await this.dataSource.delete(this.tableName, { id: restaurant.id })
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

    return new Restaurant({
      id: data.id,
      name: data.name,
      code: data.code,
      description: data.description,
      cuisine: data.cuisine || [],
      phone: data.phone,
      images: data.images || [],
      rating: data.rating || 0,
      reviewCount: data.reviewCount || 0,
      deliveryRange: data.deliveryRange || 0,
      deliveryFee: data.deliveryFee || 0,
      minDeliveryAmount: data.minDeliveryAmount || 0,
      status: data.status || 'active',
      organizationId: data.organization_id,
      address: data.address ? new Address(data.address) : null,
      businessHours: data.business_hours ? new BusinessHours(data.business_hours) : null,
    })
  }
}

export default RestaurantRepository

// 导出单例实例
export const restaurantRepository = new RestaurantRepository()
