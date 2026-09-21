// index.js
// GRI 点餐系统服务端入口
// 提供数据模型定义和 API 路由

// 导出数据模型
export { restaurantModel } from './models/restaurant.js'
export { dishModel, dishCategoryModel } from './models/dish.js'
export { orderModel } from './models/order.js'

// 导出 API 路由
export { default as restaurantApi } from './api/restaurant-api.js'
export { default as orderApi } from './api/order-api.js'

/**
 * 初始化 GRI 点餐系统服务
 * @param {Object} app - Express 应用实例
 */
export function initGriServer(app) {
  // 注册 API 路由
  app.use('/api', restaurantApi)
  app.use('/api', orderApi)

  console.log('[GRI Server] API 路由已注册')
  console.log('[GRI Server] 点餐系统服务已启动')
}

console.log('[Server] GRI 点餐系统服务端模块已加载')
