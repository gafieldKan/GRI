/**
 * 订单领域模型
 * 包含订单的核心业务逻辑和规则
 *
 * @author GRI Team
 * @version 1.0
 */

import { BaseDomain, ValueObject } from '../BaseDomain.js'

/**
 * 订单项值对象
 */
export class OrderItem extends ValueObject {
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
}

/**
 * 配送地址值对象
 */
export class DeliveryAddress extends ValueObject {
  constructor({ name, phone, province, city, district, street, detail, lat, lng }) {
    super({ name, phone, province, city, district, street, detail, lat, lng })
    Object.freeze(this)
  }

  get name() {
    return this._values.name
  }
  get phone() {
    return this._values.phone
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
 * 支付信息值对象
 */
export class PaymentInfo extends ValueObject {
  constructor({ method, transactionId, paymentTime, amount }) {
    super({ method, transactionId, paymentTime, amount })
    Object.freeze(this)
  }

  get method() {
    return this._values.method
  }
  get transactionId() {
    return this._values.transactionId
  }
  get paymentTime() {
    return this._values.paymentTime
  }
  get amount() {
    return this._values.amount
  }
}

/**
 * 订单实体 - 聚合根
 */
export class Order extends BaseDomain {
  // 私有字段
  #orderNo = ''
  #restaurantId = null
  #userId = null
  #orderType = 'dinein'
  #status = 'pending_payment'
  #items = []
  #subtotal = 0
  #deliveryFee = 0
  #discountAmount = 0
  #couponAmount = 0
  #totalAmount = 0
  #paidAmount = 0
  #deliveryAddress = null
  #paymentInfo = null
  #remarks = ''
  #shopRemarks = ''

  constructor(config = {}) {
    super({ ...config, domainType: 'order' })

    this.#orderNo = config.orderNo || ''
    this.#restaurantId = config.restaurantId || null
    this.#userId = config.userId || null
    this.#orderType = config.orderType || 'dinein'
    this.#status = config.status || 'pending_payment'
    this.#items = config.items || []
    this.#subtotal = config.subtotal || 0
    this.#deliveryFee = config.deliveryFee || 0
    this.#discountAmount = config.discountAmount || 0
    this.#couponAmount = config.couponAmount || 0
    this.#totalAmount = config.totalAmount || 0
    this.#paidAmount = config.paidAmount || 0
    this.#remarks = config.remarks || ''
    this.#shopRemarks = config.shopRemarks || ''

    if (config.deliveryAddress) {
      this.#deliveryAddress =
        config.deliveryAddress instanceof DeliveryAddress
          ? config.deliveryAddress
          : new DeliveryAddress(config.deliveryAddress)
    }

    if (config.paymentInfo) {
      this.#paymentInfo =
        config.paymentInfo instanceof PaymentInfo
          ? config.paymentInfo
          : new PaymentInfo(config.paymentInfo)
    }
  }

  // ==================== Getter ====================

  get orderNo() {
    return this.#orderNo
  }
  get restaurantId() {
    return this.#restaurantId
  }
  get userId() {
    return this.#userId
  }
  get orderType() {
    return this.#orderType
  }
  get status() {
    return this.#status
  }
  get items() {
    return [...this.#items]
  }
  get subtotal() {
    return this.#subtotal
  }
  get deliveryFee() {
    return this.#deliveryFee
  }
  get discountAmount() {
    return this.#discountAmount
  }
  get couponAmount() {
    return this.#couponAmount
  }
  get totalAmount() {
    return this.#totalAmount
  }
  get paidAmount() {
    return this.#paidAmount
  }
  get deliveryAddress() {
    return this.#deliveryAddress
  }
  get paymentInfo() {
    return this.#paymentInfo
  }
  get remarks() {
    return this.#remarks
  }
  get shopRemarks() {
    return this.#shopRemarks
  }

  // ==================== 业务方法 ====================

  /**
   * 验证业务规则
   */
  validate() {
    const errors = []

    if (!this.#orderNo) errors.push('订单号不能为空')
    if (!this.#restaurantId) errors.push('餐厅 ID 不能为空')
    if (!this.#userId) errors.push('用户 ID 不能为空')
    if (this.#items.length === 0) errors.push('订单必须包含菜品')
    if (this.#totalAmount < 0) errors.push('订单金额不能为负数')

    if (errors.length > 0) {
      throw new Error(`订单验证失败：${errors.join('，')}`)
    }

    return true
  }

  /**
   * 检查是否可以支付
   */
  canPay() {
    return this.#status === 'pending_payment'
  }

  /**
   * 检查是否可以取消
   */
  canCancel() {
    return ['pending_payment', 'paid', 'confirmed'].includes(this.#status)
  }

  /**
   * 支付订单
   */
  pay(paymentInfo) {
    if (!this.canPay()) {
      throw new Error('当前订单状态无法支付')
    }

    this.#paymentInfo =
      paymentInfo instanceof PaymentInfo ? paymentInfo : new PaymentInfo(paymentInfo)

    this.#status = 'paid'
    this.#paidAmount = this.#totalAmount

    this.raiseEvent('ORDER_PAID', {
      orderId: this.id,
      paymentInfo: this.#paymentInfo,
    })

    return this
  }

  /**
   * 取消订单
   */
  cancel(reason) {
    if (!this.canCancel()) {
      throw new Error('当前订单状态无法取消')
    }

    this.#status = 'cancelled'
    this.raiseEvent('ORDER_CANCELLED', {
      orderId: this.id,
      reason,
    })

    return this
  }

  /**
   * 确认订单
   */
  confirm() {
    if (this.#status !== 'paid') {
      throw new Error('订单状态无法确认')
    }

    this.#status = 'confirmed'
    this.raiseEvent('ORDER_CONFIRMED', { orderId: this.id })

    return this
  }

  /**
   * 开始制作
   */
  startCooking() {
    if (this.#status !== 'confirmed') {
      throw new Error('订单状态无法开始制作')
    }

    this.#status = 'cooking'
    this.raiseEvent('ORDER_COOKING', { orderId: this.id })

    return this
  }

  /**
   * 制作完成
   */
  finishCooking() {
    if (this.#status !== 'cooking') {
      throw new Error('订单状态无法完成制作')
    }

    this.#status = 'ready'
    this.raiseEvent('ORDER_READY', { orderId: this.id })

    return this
  }

  /**
   * 开始配送
   */
  startDelivery(deliveryInfo) {
    if (this.#status !== 'ready') {
      throw new Error('订单状态无法开始配送')
    }

    this.#status = 'delivering'
    this.raiseEvent('ORDER_DELIVERING', {
      orderId: this.id,
      deliveryInfo,
    })

    return this
  }

  /**
   * 完成订单
   */
  complete() {
    if (this.#status !== 'delivering' && this.#status !== 'ready') {
      throw new Error('订单状态无法完成')
    }

    this.#status = 'completed'
    this.raiseEvent('ORDER_COMPLETED', { orderId: this.id })

    return this
  }

  /**
   * 计算总计
   */
  calculateTotal() {
    this.#subtotal = this.#items.reduce((sum, item) => sum + item.price * item.quantity, 0)
    this.#totalAmount =
      this.#subtotal + this.#deliveryFee - this.#discountAmount - this.#couponAmount
    return this.#totalAmount
  }

  /**
   * 添加商品项
   */
  addItem(item) {
    this.#items.push(item)
    this.calculateTotal()
    return this
  }

  // ==================== 序列化 ====================

  toDTO() {
    return {
      ...super.toDTO(),
      id: this.id,
      orderNo: this.#orderNo,
      restaurantId: this.#restaurantId,
      userId: this.#userId,
      orderType: this.#orderType,
      status: this.#status,
      items: this.#items.map((item) => (item instanceof OrderItem ? item._values : item)),
      subtotal: this.#subtotal,
      deliveryFee: this.#deliveryFee,
      discountAmount: this.#discountAmount,
      couponAmount: this.#couponAmount,
      totalAmount: this.#totalAmount,
      paidAmount: this.#paidAmount,
      deliveryAddress: this.#deliveryAddress?._values,
      paymentInfo: this.#paymentInfo?._values,
      remarks: this.#remarks,
      shopRemarks: this.#shopRemarks,
    }
  }

  static fromDTO(dto) {
    return new Order(dto)
  }
}

export default Order
