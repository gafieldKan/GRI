/**
 * 订单模型定义
 * 支持多种订单类型和状态流转
 */

export const orderModel = {
  name: 'Order',
  singular: 'Order',
  plural: 'Orders',

  fields: [
    {
      name: 'orderNo',
      label: '订单号',
      type: 'string',
      unique: true,
      required: true,
      index: true,
    },
    {
      name: 'restaurantId',
      label: '餐厅 ID',
      type: 'link',
      target: 'Restaurant',
      required: true,
      index: true,
    },
    {
      name: 'userId',
      label: '用户 ID',
      type: 'link',
      target: 'User',
      required: true,
      index: true,
    },
    {
      name: 'orderType',
      label: '订单类型',
      type: 'select',
      options: [
        { value: 'dinein', label: '堂食' },
        { value: 'takeout', label: '外带' },
        { value: 'delivery', label: '外卖' },
      ],
      required: true,
      index: true,
    },
    {
      name: 'status',
      label: '订单状态',
      type: 'select',
      options: [
        { value: 'pending_payment', label: '待支付' },
        { value: 'paid', label: '已支付' },
        { value: 'confirmed', label: '已确认' },
        { value: 'cooking', label: '制作中' },
        { value: 'ready', label: '待配送/待取餐' },
        { value: 'delivering', label: '配送中' },
        { value: 'completed', label: '已完成' },
        { value: 'cancelled', label: '已取消' },
        { value: 'refunded', label: '已退款' },
      ],
      required: true,
      default: 'pending_payment',
      index: true,
    },
    {
      name: 'items',
      label: '订单明细',
      type: 'array',
      required: true,
      schema: {
        dishId: 'link:Dish',
        dishName: 'string',
        dishImage: 'image',
        price: 'number',
        quantity: 'number',
        specifications: 'array',
        flavors: 'array',
        remarks: 'string',
      },
    },
    {
      name: 'subtotal',
      label: '商品小计',
      type: 'number',
      required: true,
      precision: 2,
    },
    {
      name: 'deliveryFee',
      label: '配送费',
      type: 'number',
      default: 0,
      precision: 2,
    },
    {
      name: 'discountAmount',
      label: '优惠金额',
      type: 'number',
      default: 0,
      precision: 2,
    },
    {
      name: 'couponAmount',
      label: '优惠券金额',
      type: 'number',
      default: 0,
      precision: 2,
    },
    {
      name: 'totalAmount',
      label: '订单总额',
      type: 'number',
      required: true,
      precision: 2,
    },
    {
      name: 'paidAmount',
      label: '实付金额',
      type: 'number',
      precision: 2,
    },
    {
      name: 'deliveryAddress',
      label: '配送地址',
      type: 'json',
      schema: {
        name: 'string',
        phone: 'string',
        province: 'string',
        city: 'string',
        district: 'string',
        street: 'string',
        detail: 'string',
        location: 'geopoint',
      },
    },
    {
      name: 'deliveryLocation',
      label: '配送位置',
      type: 'geopoint',
    },
    {
      name: 'consignee',
      label: '收货人',
      type: 'json',
      schema: {
        name: 'string',
        phone: 'string',
      },
    },
    {
      name: 'paymentMethod',
      label: '支付方式',
      type: 'select',
      options: [
        { value: 'wechat', label: '微信支付' },
        { value: 'alipay', label: '支付宝' },
        { value: 'unionpay', label: '银联' },
        { value: 'balance', label: '余额支付' },
        { value: 'credit', label: '信用支付' },
      ],
    },
    {
      name: 'paymentTime',
      label: '支付时间',
      type: 'datetime',
      index: true,
    },
    {
      name: 'transactionId',
      label: '支付流水号',
      type: 'string',
    },
    {
      name: 'remarks',
      label: '订单备注',
      type: 'string',
    },
    {
      name: 'shopRemarks',
      label: '商家备注',
      type: 'string',
    },
    {
      name: 'cancelReason',
      label: '取消原因',
      type: 'select',
      options: [
        { value: 'user_cancel', label: '用户取消' },
        { value: 'merchant_cancel', label: '商家取消' },
        { value: 'timeout', label: '超时取消' },
        { value: 'refund', label: '退款' },
      ],
    },
    {
      name: 'cancelTime',
      label: '取消时间',
      type: 'datetime',
    },
    {
      name: 'confirmTime',
      label: '确认时间',
      type: 'datetime',
    },
    {
      name: 'cookStartTime',
      label: '开始制作时间',
      type: 'datetime',
    },
    {
      name: 'cookEndTime',
      label: '制作完成时间',
      type: 'datetime',
    },
    {
      name: 'deliveryTime',
      label: '配送时间',
      type: 'datetime',
    },
    {
      name: 'completedTime',
      label: '完成时间',
      type: 'datetime',
    },
    {
      name: 'expectedTime',
      label: '期望时间',
      type: 'datetime',
    },
    {
      name: 'actualTime',
      label: '实际时间',
      type: 'datetime',
    },
    {
      name: 'invoice',
      label: '发票信息',
      type: 'json',
      schema: {
        title: 'string',
        type: 'string',
        taxId: 'string',
        email: 'string',
      },
    },
    {
      name: 'rating',
      label: '评分',
      type: 'number',
      min: 1,
      max: 5,
    },
    {
      name: 'review',
      label: '评价内容',
      type: 'text',
    },
    {
      name: 'reviewTime',
      label: '评价时间',
      type: 'datetime',
    },
    {
      name: 'metadata',
      label: '扩展信息',
      type: 'json',
    },
    {
      name: 'createdBy',
      label: '创建人',
      type: 'link',
      target: 'User',
    },
    {
      name: 'updatedBy',
      label: '更新人',
      type: 'link',
      target: 'User',
    },
    {
      name: 'createdAt',
      label: '创建时间',
      type: 'datetime',
      auto: true,
    },
    {
      name: 'updatedAt',
      label: '更新时间',
      type: 'datetime',
      autoUpdate: true,
    },
  ],

  // 索引定义
  indexes: [
    { fields: ['orderNo'], unique: true },
    { fields: ['restaurantId'] },
    { fields: ['userId'] },
    { fields: ['status'] },
    { fields: ['paymentTime'] },
    { fields: ['createdAt'] },
  ],

  // 订单状态机配置
  stateMachine: {
    initial: 'pending_payment',
    transitions: [
      { from: 'pending_payment', to: 'paid', event: 'pay' },
      { from: 'pending_payment', to: 'cancelled', event: 'cancel' },
      { from: 'paid', to: 'confirmed', event: 'confirm' },
      { from: 'paid', to: 'cancelled', event: 'cancel' },
      { from: 'confirmed', to: 'cooking', event: 'start_cook' },
      { from: 'cooking', to: 'ready', event: 'finish_cook' },
      { from: 'ready', to: 'delivering', event: 'start_delivery' },
      { from: 'delivering', to: 'completed', event: 'complete' },
      { from: 'completed', to: 'refunded', event: 'refund' },
    ],
    timeout: {
      pending_payment: 900000, // 15 分钟未支付自动取消
      confirmed: 300000, // 5 分钟未制作自动提醒
      delivering: 3600000, // 1 小时未送达自动提醒
    },
  },

  // 权限配置
  permissions: {
    create: ['user', 'admin'],
    read: ['user', 'admin', 'restaurant_manager'],
    update: ['admin', 'restaurant_manager'],
    delete: ['admin'],
  },

  // 生命周期钩子
  hooks: {
    beforeCreate: (data) => {
      // 生成订单号：ORD + 日期 + 随机数
      const date = new Date()
        .toISOString()
        .replace(/[-:T.]/g, '')
        .substr(0, 8)
      const random = Math.random().toString(36).substr(2, 6).toUpperCase()
      data.orderNo = `ORD${date}${random}`
      return data
    },
    afterCreate: async (order, context) => {
      // 扣减库存
      // 发送订单通知
      console.log(`订单创建：${order.orderNo}`)
    },
    beforeStatusChange: (order, from, to) => {
      // 状态变更前的校验
      if (from === 'pending_payment' && to === 'paid') {
        // 校验支付金额
      }
      return true
    },
    afterStatusChange: async (order, from, to) => {
      // 状态变更后处理
      // 1. 发送通知
      // 2. 更新统计数据
      // 3. 触发工作流
      console.log(`订单状态变更：${order.orderNo} ${from} -> ${to}`)
    },
  },
}

export default orderModel
