/**
 * 订单相关 API 接口
 * 提供订单创建、查询、状态流转等接口
 */

import { Router } from 'express'

const router = Router()

/**
 * @api GET /api/orders
 * @desc 获取订单列表（根据用户角色返回不同数据）
 * @param {string} status 状态筛选
 * @param {string} restaurantId 餐厅筛选
 * @param {number} page 页码
 * @param {number} pageSize 每页数量
 */
router.get('/orders', async (req, res) => {
  try {
    const { status, restaurantId, page = 1, pageSize = 10 } = req.query
    const currentUserId = req.user?.id // 当前登录用户

    // 构建查询条件
    const query = {}

    // 根据用户角色返回数据
    const userRole = req.user?.role
    if (userRole === 'admin') {
      // 管理员可查看所有订单
      if (restaurantId) query.restaurantId = restaurantId
    } else if (userRole === 'restaurant_manager') {
      // 餐厅管理员只能查看本店订单
      query.restaurantId = userRole.restaurantId
    } else {
      // 普通用户只能查看自己的订单
      query.userId = currentUserId
    }

    // 状态筛选
    if (status) query.status = status

    const orders = await find('Order', query, {
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      sort: { createdAt: -1 },
    })

    res.json({
      success: true,
      data: orders,
      pagination: {
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        total: orders.total,
      },
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

/**
 * @api GET /api/orders/:id
 * @desc 获取订单详情
 */
router.get('/orders/:id', async (req, res) => {
  try {
    const { id } = req.params
    const currentUserId = req.user?.id
    const userRole = req.user?.role

    const order = await findOne('Order', { _id: id })

    if (!order) {
      return res.status(404).json({
        success: false,
        error: '订单不存在',
      })
    }

    // 权限校验：只能查看自己的订单
    if (userRole !== 'admin' && userRole !== 'restaurant_manager') {
      if (order.userId !== currentUserId) {
        return res.status(403).json({
          success: false,
          error: '无权查看该订单',
        })
      }
    }

    res.json({
      success: true,
      data: order,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

/**
 * @api POST /api/orders
 * @desc 创建订单
 * @body {array} items 订单明细
 * @body {string} restaurantId 餐厅 ID
 * @body {string} orderType 订单类型
 * @body {object} deliveryAddress 配送地址
 * @body {string} remarks 备注
 */
router.post('/orders', async (req, res) => {
  try {
    const currentUserId = req.user?.id
    const { items, restaurantId, orderType, deliveryAddress, remarks } = req.body

    // 参数校验
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: '订单明细不能为空',
      })
    }

    if (!restaurantId) {
      return res.status(400).json({
        success: false,
        error: '餐厅 ID 不能为空',
      })
    }

    // 验证餐厅是否存在
    const restaurant = await findOne('Restaurant', { _id: restaurantId })
    if (!restaurant) {
      return res.status(400).json({
        success: false,
        error: '餐厅不存在',
      })
    }

    // 验证菜品并计算价格
    let subtotal = 0
    const validItems = []

    for (const item of items) {
      const dish = await findOne('Dish', { _id: item.dishId })
      if (!dish || dish.status !== 'onsale') {
        return res.status(400).json({
          success: false,
          error: `菜品 ${item.dishName || item.dishId} 不可用`,
        })
      }

      validItems.push({
        dishId: dish._id,
        dishName: dish.name,
        dishImage: dish.images?.[0],
        price: dish.price,
        quantity: item.quantity || 1,
        specifications: item.specifications || [],
        flavors: item.flavors || [],
        remarks: item.remarks || '',
      })

      subtotal += dish.price * (item.quantity || 1)
    }

    // 计算总价
    const deliveryFee = orderType === 'delivery' ? restaurant.deliveryFee || 0 : 0
    const totalAmount = subtotal + deliveryFee

    // 创建订单
    const orderData = {
      restaurantId,
      userId: currentUserId,
      orderType: orderType || 'dinein',
      status: 'pending_payment',
      items: validItems,
      subtotal,
      deliveryFee,
      totalAmount,
      deliveryAddress: orderType === 'delivery' ? deliveryAddress : null,
      remarks,
      expectedTime: new Date(Date.now() + 30 * 60 * 1000), // 预计 30 分钟后
    }

    const order = await create('Order', orderData)

    res.json({
      success: true,
      data: order,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

/**
 * @api POST /api/orders/:id/cancel
 * @desc 取消订单
 */
router.post('/orders/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params
    const { reason } = req.body
    const currentUserId = req.user?.id

    const order = await findOne('Order', { _id: id })

    if (!order) {
      return res.status(404).json({
        success: false,
        error: '订单不存在',
      })
    }

    // 权限校验
    if (order.userId !== currentUserId && req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: '无权取消该订单',
      })
    }

    // 状态校验
    if (!['pending_payment', 'paid', 'confirmed'].includes(order.status)) {
      return res.status(400).json({
        success: false,
        error: '当前订单状态无法取消',
      })
    }

    // 更新订单状态
    order.status = 'cancelled'
    order.cancelReason = reason
    order.cancelTime = new Date()
    await update('Order', order)

    res.json({
      success: true,
      data: order,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

/**
 * @api POST /api/orders/:id/pay
 * @desc 支付订单
 */
router.post('/orders/:id/pay', async (req, res) => {
  try {
    const { id } = req.params
    const { paymentMethod, transactionId } = req.body

    const order = await findOne('Order', { _id: id })

    if (!order) {
      return res.status(404).json({
        success: false,
        error: '订单不存在',
      })
    }

    // 状态校验
    if (order.status !== 'pending_payment') {
      return res.status(400).json({
        success: false,
        error: '订单状态无法支付',
      })
    }

    // 更新订单状态为已支付
    order.status = 'paid'
    order.paymentMethod = paymentMethod
    order.transactionId = transactionId || `TXN_${Date.now()}`
    order.paymentTime = new Date()
    await update('Order', order)

    // 触发支付成功回调
    // - 发送支付成功通知
    // - 通知后厨准备制作
    // - 更新统计数据

    res.json({
      success: true,
      data: order,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

/**
 * @api POST /api/orders/:id/confirm
 * @desc 商家确认订单
 */
router.post('/orders/:id/confirm', async (req, res) => {
  try {
    const { id } = req.params

    const order = await findOne('Order', { _id: id })
    if (!order) {
      return res.status(404).json({
        success: false,
        error: '订单不存在',
      })
    }

    if (order.status !== 'paid') {
      return res.status(400).json({
        success: false,
        error: '订单状态无法确认',
      })
    }

    order.status = 'confirmed'
    order.confirmTime = new Date()
    await update('Order', order)

    res.json({
      success: true,
      data: order,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

/**
 * @api POST /api/orders/:id/complete
 * @desc 完成订单
 */
router.post('/orders/:id/complete', async (req, res) => {
  try {
    const { id } = req.params

    const order = await findOne('Order', { _id: id })
    if (!order) {
      return res.status(404).json({
        success: false,
        error: '订单不存在',
      })
    }

    if (order.status !== 'delivering' && order.status !== 'ready') {
      return res.status(400).json({
        success: false,
        error: '订单状态无法完成',
      })
    }

    order.status = 'completed'
    order.completedTime = new Date()
    await update('Order', order)

    res.json({
      success: true,
      data: order,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

export default router
