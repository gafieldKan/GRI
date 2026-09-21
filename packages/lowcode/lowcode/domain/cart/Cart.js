/**
 * 购物车领域模型
 * 包含购物车的核心业务逻辑和规则
 *
 * @author GRI Team
 * @version 1.0
 */

import { BaseDomain, ValueObject } from '../BaseDomain.js'

/**
 * 购物车项值对象
 */
export class CartItem extends ValueObject {
  constructor({
    dishId,
    dishName,
    dishImage,
    price,
    quantity,
    specifications = [],
    flavors = [],
    remarks = '',
  }) {
    super({ dishId, dishName, dishImage, price, quantity, specifications, flavors, remarks })
    Object.freeze(this)
  }

  get dishId() {
    return this._values.dishId
  }
  get dishName() {
    return this._values.dishName
  }
  get dishImage() {
    return this._values.dishImage
  }
  get price() {
    return this._values.price
  }
  get quantity() {
    return this._values.quantity
  }
  get specifications() {
    return this._values.specifications
  }
  get flavors() {
    return this._values.flavors
  }
  get remarks() {
    return this._values.remarks
  }

  /**
   * 小计
   */
  get subtotal() {
    return this.price * this.quantity
  }

  /**
   * 增加数量
   */
  withQuantity(quantity) {
    return new CartItem({
      ...this._values,
      quantity,
    })
  }
}

/**
 * 购物车实体 - 聚合根
 */
export class Cart extends BaseDomain {
  // 私有字段
  #userId = null
  #restaurantId = null
  #items = new Map() // dishId -> CartItem

  constructor(config = {}) {
    super({ ...config, domainType: 'cart' })

    this.#userId = config.userId || null
    this.#restaurantId = config.restaurantId || null

    // 初始化购物车项
    if (config.items) {
      config.items.forEach((item) => {
        const cartItem = item instanceof CartItem ? item : new CartItem(item)
        this.#items.set(this.#generateItemId(cartItem), cartItem)
      })
    }
  }

  // ==================== Getter ====================

  get userId() {
    return this.#userId
  }
  get restaurantId() {
    return this.#restaurantId
  }
  get items() {
    return Array.from(this.#items.values())
  }
  get itemCount() {
    return this.items.length
  }

  /**
   * 商品总数
   */
  get totalQuantity() {
    return this.items.reduce((sum, item) => sum + item.quantity, 0)
  }

  /**
   * 应付总额
   */
  get totalAmount() {
    return this.items.reduce((sum, item) => sum + item.subtotal, 0)
  }

  // ==================== 业务方法 ====================

  /**
   * 验证业务规则
   */
  validate() {
    const errors = []

    if (!this.#userId) errors.push('用户 ID 不能为空')

    if (errors.length > 0) {
      throw new Error(`购物车验证失败：${errors.join('，')}`)
    }

    return true
  }

  /**
   * 生成购物车项 ID（用于相同规格的商品合并）
   */
  #generateItemId(item) {
    const specs = item.specifications?.map((s) => `${s.name}:${s.value}`).join('|') || ''
    const flavors = item.flavors?.join('|') || ''
    return `${item.dishId}:${specs}:${flavors}`
  }

  /**
   * 添加商品到购物车
   */
  addItem(item) {
    const cartItem = item instanceof CartItem ? item : new CartItem(item)
    const itemId = this.#generateItemId(cartItem)

    if (this.#items.has(itemId)) {
      // 已存在相同商品，合并数量
      const existingItem = this.#items.get(itemId)
      const newItem = cartItem.withQuantity(existingItem.quantity + cartItem.quantity)
      this.#items.set(itemId, newItem)
    } else {
      // 检查是否来自同一家店
      if (this.#restaurantId && this.#restaurantId !== item.restaurantId) {
        // 这里可以选择清空购物车或者抛出异常
        console.warn('添加了不同店铺的商品')
      }

      this.#restaurantId = item.restaurantId
      this.#items.set(itemId, cartItem)
    }

    this.raiseEvent('CART_ITEM_ADDED', {
      itemId: cartItem.dishId,
      quantity: cartItem.quantity,
    })

    return this
  }

  /**
   * 更新商品数量
   */
  updateQuantity(dishId, quantity, specs = {}, flavors = []) {
    const itemId = this.#generateItemId({ dishId, specifications: specs, flavors })

    if (this.#items.has(itemId)) {
      if (quantity <= 0) {
        this.removeItem(dishId, specs, flavors)
      } else {
        const existingItem = this.#items.get(itemId)
        const newItem = existingItem.withQuantity(quantity)
        this.#items.set(itemId, newItem)
      }
    }

    return this
  }

  /**
   * 移除商品
   */
  removeItem(dishId, specs = {}, flavors = []) {
    const itemId = this.#generateItemId({ dishId, specifications: specs, flavors })
    const removed = this.#items.delete(itemId)

    if (removed) {
      this.raiseEvent('CART_ITEM_REMOVED', { itemId: dishId })

      // 如果购物车为空，清空店铺信息
      if (this.#items.size === 0) {
        this.#restaurantId = null
      }
    }

    return this
  }

  /**
   * 清空购物车
   */
  clear() {
    this.#items.clear()
    this.#restaurantId = null
    this.raiseEvent('CART_CLEARED')
    return this
  }

  /**
   * 检查购物车是否为空
   */
  isEmpty() {
    return this.#items.size === 0
  }

  /**
   * 获取商品数量
   */
  getItemQuantity(dishId, specs = {}, flavors = []) {
    const itemId = this.#generateItemId({ dishId, specifications: specs, flavors })
    const item = this.#items.get(itemId)
    return item ? item.quantity : 0
  }

  /**
   * 检查商品是否在购物车中
   */
  hasItem(dishId, specs = {}, flavors = []) {
    const itemId = this.#generateItemId({ dishId, specifications: specs, flavors })
    return this.#items.has(itemId)
  }

  /**
   * 应用业务规则
   */
  applyBusinessRules() {
    // 检查所有商品是否可售
    this.#items.forEach((item, key) => {
      if (!item.isOnSale) {
        this.#items.delete(key)
        this.raiseEvent('CART_ITEM_REMOVED', {
          itemId: item.dishId,
          reason: '商品已下架',
        })
      }
    })
  }

  // ==================== 序列化 ====================

  toDTO() {
    return {
      ...super.toDTO(),
      id: this.id,
      userId: this.#userId,
      restaurantId: this.#restaurantId,
      items: this.items.map((item) => item._values),
      itemCount: this.itemCount,
      totalQuantity: this.totalQuantity,
      totalAmount: this.totalAmount,
    }
  }

  static fromDTO(dto) {
    return new Cart(dto)
  }
}

export default Cart
