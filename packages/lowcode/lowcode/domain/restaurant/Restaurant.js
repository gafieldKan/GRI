/**
 * 餐厅领域模型
 * 包含餐厅的核心业务逻辑和规则
 *
 * @author GRI Team
 * @version 1.0
 */

import { BaseDomain, ValueObject } from '../BaseDomain.js'

/**
 * 地址值对象
 */
export class Address extends ValueObject {
  constructor({ province, city, district, street, detail, lat, lng }) {
    super({ province, city, district, street, detail, lat, lng })
    Object.freeze(this)
  }

  get province() {
    return this._values.province
  }
  get city() {
    return this._values.city
  }
  get district() {
    return this._values.district
  }
  get street() {
    return this._values.street
  }
  get detail() {
    return this._values.detail
  }
  get lat() {
    return this._values.lat
  }
  get lng() {
    return this._values.lng
  }

  get fullAddress() {
    return `${this.province}${this.city}${this.district}${this.street}${this.detail}`
  }
}

/**
 * 营业时间值对象
 */
export class BusinessHours extends ValueObject {
  constructor({ openTime, closeTime, openDays, is24Hours = false }) {
    super({ openTime, closeTime, openDays, is24Hours })
    Object.freeze(this)
  }

  get openTime() {
    return this._values.openTime
  }
  get closeTime() {
    return this._values.closeTime
  }
  get openDays() {
    return this._values.openDays
  }
  get is24Hours() {
    return this._values.is24Hours
  }

  /**
   * 检查是否营业中
   */
  isOpen(now = new Date()) {
    if (this.is24Hours) return true

    const day = now.getDay()
    if (!this.openDays.includes(day)) return false

    const currentTime = now.getHours() * 60 + now.getMinutes()
    const [openHour, openMin] = this.openTime.split(':').map(Number)
    const [closeHour, closeMin] = this.closeTime.split(':').map(Number)
    const openMinutes = openHour * 60 + openMin
    const closeMinutes = closeHour * 60 + closeMin

    return currentTime >= openMinutes && currentTime <= closeMinutes
  }

  /**
   * 获取营业状态文本
   */
  getStatusText(now = new Date()) {
    return this.isOpen(now) ? '营业中' : '休息中'
  }
}

/**
 * 餐厅实体
 */
export class Restaurant extends BaseDomain {
  // 私有字段
  #name = ''
  #code = ''
  #description = ''
  #cuisine = []
  #address = null
  #businessHours = null
  #phone = ''
  #images = []
  #rating = 0
  #reviewCount = 0
  #deliveryRange = 0
  #deliveryFee = 0
  #minDeliveryAmount = 0
  #priceRange = { min: 0, max: 0 }
  #tags = []
  #features = []
  #organizationId = null

  constructor(config = {}) {
    super({ ...config, domainType: 'restaurant' })

    this.#name = config.name || ''
    this.#code = config.code || ''
    this.#description = config.description || ''
    this.#cuisine = config.cuisine || []
    this.#phone = config.phone || ''
    this.#images = config.images || []
    this.#rating = config.rating || 0
    this.#reviewCount = config.reviewCount || 0
    this.#deliveryRange = config.deliveryRange || 0
    this.#deliveryFee = config.deliveryFee || 0
    this.#minDeliveryAmount = config.minDeliveryAmount || 0
    this.#priceRange = config.priceRange || { min: 0, max: 0 }
    this.#tags = config.tags || []
    this.#features = config.features || []
    this.#organizationId = config.organizationId || null

    if (config.address) {
      this.#address =
        config.address instanceof Address ? config.address : new Address(config.address)
    }

    if (config.businessHours) {
      this.#businessHours =
        config.businessHours instanceof BusinessHours
          ? config.businessHours
          : new BusinessHours(config.businessHours)
    }
  }

  // ==================== Getter/Setter ====================

  get name() {
    return this.#name
  }
  get code() {
    return this.#code
  }
  get description() {
    return this.#description
  }
  get cuisine() {
    return [...this.#cuisine]
  }
  get address() {
    return this.#address
  }
  get businessHours() {
    return this.#businessHours
  }
  get phone() {
    return this.#phone
  }
  get images() {
    return [...this.#images]
  }
  get rating() {
    return this.#rating
  }
  get reviewCount() {
    return this.#reviewCount
  }
  get deliveryRange() {
    return this.#deliveryRange
  }
  get deliveryFee() {
    return this.#deliveryFee
  }
  get minDeliveryAmount() {
    return this.#minDeliveryAmount
  }
  get priceRange() {
    return { ...this.#priceRange }
  }
  get tags() {
    return [...this.#tags]
  }
  get features() {
    return [...this.#features]
  }
  get organizationId() {
    return this.#organizationId
  }

  set name(value) {
    this.triggerHook('beforeUpdate', { field: 'name', oldValue: this.#name, newValue: value })
    this.#name = value
    this.triggerHook('afterUpdate', { field: 'name', newValue: value })
  }

  // ==================== 业务方法 ====================

  /**
   * 验证业务规则
   */
  validate() {
    const errors = []

    if (!this.#name) errors.push('餐厅名称不能为空')
    if (!this.#code) errors.push('餐厅编码不能为空')
    if (this.#deliveryRange < 0) errors.push('配送范围不能为负数')
    if (this.#deliveryFee < 0) errors.push('配送费不能为负数')

    if (errors.length > 0) {
      throw new Error(`餐厅验证失败：${errors.join('，')}`)
    }

    return true
  }

  /**
   * 检查是否在服务范围内
   */
  isInServiceArea(lat, lng) {
    if (!this.#address || !this.#address.lat || !this.#address.lng) {
      return false
    }

    const distance = this.#calculateDistance(lat, lng, this.#address.lat, this.#address.lng)

    return distance <= this.#deliveryRange
  }

  /**
   * 计算距离（简化版）
   */
  #calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371 // 地球半径 km
    const dLat = this.#toRad(lat2 - lat1)
    const dLng = this.#toRad(lng2 - lng1)
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.#toRad(lat1)) *
        Math.cos(this.#toRad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  #toRad(deg) {
    return (deg * Math.PI) / 180
  }

  /**
   * 检查是否可以下单
   */
  canOrder() {
    return this.status === 'active' && this.businessHours?.isOpen()
  }

  /**
   * 获取最低起送价
   */
  getMinOrderAmount() {
    return this.#minDeliveryAmount
  }

  /**
   * 计算预计送达时间
   */
  getEstimatedDeliveryTime() {
    // 简化实现
    return 30 // 分钟
  }

  // ==================== 序列化 ====================

  toDTO() {
    return {
      ...super.toDTO(),
      id: this.id,
      name: this.#name,
      code: this.#code,
      description: this.#description,
      cuisine: this.#cuisine,
      address: this.#address?._values,
      businessHours: this.#businessHours?._values,
      phone: this.#phone,
      images: this.#images,
      rating: this.#rating,
      reviewCount: this.#reviewCount,
      deliveryRange: this.#deliveryRange,
      deliveryFee: this.#deliveryFee,
      minDeliveryAmount: this.#minDeliveryAmount,
      priceRange: this.#priceRange,
      tags: this.#tags,
      features: this.#features,
      organizationId: this.#organizationId,
    }
  }

  static fromDTO(dto) {
    return new Restaurant(dto)
  }
}

export default Restaurant
