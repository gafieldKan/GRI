/**
 * 菜品领域模型
 * 包含菜品的核心业务逻辑和规则
 *
 * @author GRI Team
 * @version 1.0
 */

import { BaseDomain, ValueObject } from '../BaseDomain.js'

/**
 * 价格值对象
 */
export class Price extends ValueObject {
  constructor({ amount, currency = 'CNY' }) {
    super({ amount, currency })
    Object.freeze(this)
  }

  get amount() {
    return this._values.amount
  }
  get currency() {
    return this._values.currency
  }

  /**
   * 格式化价格
   */
  format(locale = 'zh-CN') {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: this.currency,
    }).format(this.amount)
  }

  /**
   * 价格计算
   */
  add(other) {
    if (other instanceof Price && this.currency === other.currency) {
      return new Price({ amount: this.amount + other.amount, currency: this.currency })
    }
    throw new Error('货币类型不匹配')
  }

  /**
   * 折扣计算
   */
  discount(rate) {
    return new Price({ amount: this.amount * rate, currency: this.currency })
  }
}

/**
 * 规格值对象
 */
export class Specification extends ValueObject {
  constructor({ name, value, priceModifier = 0 }) {
    super({ name, value, priceModifier })
    Object.freeze(this)
  }

  get name() {
    return this._values.name
  }
  get value() {
    return this._values.value
  }
  get priceModifier() {
    return this._values.priceModifier
  }
}

/**
 * 菜品实体
 */
export class Dish extends BaseDomain {
  // 私有字段
  #name = ''
  #code = ''
  #description = ''
  #price = null
  #originalPrice = null
  #costPrice = null
  #category = null
  #images = []
  #unit = '份'
  #status = 'onsale'
  #isRecommended = false
  #isSignature = false
  #spicyLevel = 0
  #tags = []
  #ingredients = []
  #allergens = []
  #specifications = []
  #flavors = []
  #restaurantId = null
  #sortOrder = 0

  constructor(config = {}) {
    super({ ...config, domainType: 'dish' })

    this.#name = config.name || ''
    this.#code = config.code || ''
    this.#description = config.description || ''
    this.#images = config.images || []
    this.#unit = config.unit || '份'
    this.#status = config.status || 'onsale'
    this.#isRecommended = config.isRecommended || false
    this.#isSignature = config.isSignature || false
    this.#spicyLevel = config.spicyLevel || 0
    this.#tags = config.tags || []
    this.#ingredients = config.ingredients || []
    this.#allergens = config.allergens || []
    this.#specifications = config.specifications || []
    this.#flavors = config.flavors || []
    this.#restaurantId = config.restaurantId || null
    this.#sortOrder = config.sortOrder || 0

    if (config.price) {
      this.#price = config.price instanceof Price ? config.price : new Price(config.price)
    }

    if (config.originalPrice) {
      this.#originalPrice =
        config.originalPrice instanceof Price
          ? config.originalPrice
          : new Price(config.originalPrice)
    }
  }

  // ==================== Getter ====================

  get name() {
    return this.#name
  }
  get code() {
    return this.#code
  }
  get description() {
    return this.#description
  }
  get price() {
    return this.#price
  }
  get originalPrice() {
    return this.#originalPrice
  }
  get images() {
    return [...this.#images]
  }
  get unit() {
    return this.#unit
  }
  get status() {
    return this.#status
  }
  get isRecommended() {
    return this.#isRecommended
  }
  get isSignature() {
    return this.#isSignature
  }
  get spicyLevel() {
    return this.#spicyLevel
  }
  get tags() {
    return [...this.#tags]
  }
  get ingredients() {
    return [...this.#ingredients]
  }
  get allergens() {
    return [...this.#allergens]
  }
  get specifications() {
    return [...this.#specifications]
  }
  get flavors() {
    return [...this.#flavors]
  }
  get restaurantId() {
    return this.#restaurantId
  }
  get sortOrder() {
    return this.#sortOrder
  }
  get category() {
    return this.#category
  }

  // ==================== 业务方法 ====================

  /**
   * 验证业务规则
   */
  validate() {
    const errors = []

    if (!this.#name) errors.push('菜品名称不能为空')
    if (!this.#code) errors.push('菜品编码不能为空')
    if (!this.#price) errors.push('价格不能为空')
    if (this.#price?.amount < 0) errors.push('价格不能为负数')

    if (errors.length > 0) {
      throw new Error(`菜品验证失败：${errors.join('，')}`)
    }

    return true
  }

  /**
   * 检查是否可售
   */
  isOnSale() {
    return this.#status === 'onsale'
  }

  /**
   * 检查是否有规格
   */
  hasSpecifications() {
    return this.#specifications.length > 0
  }

  /**
   * 获取折扣率
   */
  getDiscountRate() {
    if (!this.#originalPrice || !this.#price) return 0
    return Math.round((this.#price.amount / this.#originalPrice.amount) * 10)
  }

  /**
   * 应用业务规则
   */
  applyBusinessRules() {
    // 售罄菜品自动下架
    if (this.status === 'soldout') {
      this.#isRecommended = false
    }
  }

  // ==================== 序列化 ====================

  toDTO() {
    return {
      ...super.toDTO(),
      id: this.id,
      name: this.#name,
      code: this.#code,
      description: this.#description,
      price: this.#price?._values,
      originalPrice: this.#originalPrice?._values,
      images: this.#images,
      unit: this.#unit,
      status: this.#status,
      isRecommended: this.#isRecommended,
      isSignature: this.#isSignature,
      spicyLevel: this.#spicyLevel,
      tags: this.#tags,
      ingredients: this.#ingredients,
      allergens: this.#allergens,
      specifications: this.#specifications,
      flavors: this.#flavors,
      restaurantId: this.#restaurantId,
      category: this.#category,
    }
  }

  static fromDTO(dto) {
    return new Dish(dto)
  }
}

export default Dish
