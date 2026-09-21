/**
 * 订单工作流定义
 * 包含订单状态流转的完整逻辑
 */

import { stateMachineEngine, OrderStateMachine } from '../../engine/StateMachineEngine'

/**
 * 订单工作流配置
 */
export const orderWorkflow = {
  id: 'order_workflow',
  name: '订单工作流',
  description: '处理订单从创建到完成的完整流程',
  version: '1.0',

  // 状态定义
  states: {
    pending_payment: {
      name: '待支付',
      timeout: 900000, // 15 分钟
      onEnter: async (context) => {
        // 创建订单时触发
        console.log('订单已创建，等待支付')
        // 发送支付提醒通知
      },
      onTimeout: async (context) => {
        // 超时未支付处理
        console.log('订单超时未支付，自动取消')
        return 'cancelled'
      },
    },
    paid: {
      name: '已支付',
      onEnter: async (context) => {
        // 支付成功后触发
        console.log('订单已支付，通知商家')
        // 发送通知给商家
      },
    },
    confirmed: {
      name: '已确认',
      onEnter: async (context) => {
        // 商家确认订单
        console.log('商家已确认订单')
      },
    },
    cooking: {
      name: '制作中',
      onEnter: async (context) => {
        // 开始制作
        console.log('订单开始制作')
        // 推送制作进度
      },
    },
    ready: {
      name: '待配送',
      onEnter: async (context) => {
        // 制作完成，等待配送
        console.log('订单已就绪，等待配送')
        // 通知配送员取餐
      },
    },
    delivering: {
      name: '配送中',
      onEnter: async (context) => {
        // 开始配送
        console.log('订单配送中')
        // 推送配送进度
      },
    },
    completed: {
      name: '已完成',
      onEnter: async (context) => {
        // 订单完成
        console.log('订单已完成')
        // 邀请用户评价
        // 更新统计数据
      },
    },
    cancelled: {
      name: '已取消',
      onEnter: async (context) => {
        // 订单取消
        console.log('订单已取消')
        // 处理退款
        // 恢复库存
      },
    },
    refunded: {
      name: '已退款',
      onEnter: async (context) => {
        // 退款完成
        console.log('订单已退款')
      },
    },
  },

  // 状态转换定义
  transitions: [
    { from: 'pending_payment', to: 'paid', event: 'pay' },
    { from: 'pending_payment', to: 'cancelled', event: 'cancel' },
    { from: 'paid', to: 'confirmed', event: 'confirm' },
    { from: 'paid', to: 'cancelled', event: 'cancel' },
    { from: 'paid', to: 'refunded', event: 'refund' },
    { from: 'confirmed', to: 'cooking', event: 'start_cooking' },
    { from: 'confirmed', to: 'cancelled', event: 'cancel' },
    { from: 'cooking', to: 'ready', event: 'finish_cooking' },
    { from: 'ready', to: 'delivering', event: 'start_delivery' },
    { from: 'delivering', to: 'completed', event: 'complete' },
    { from: 'completed', to: 'refunded', event: 'refund' },
  ],

  // 事件处理器
  handlers: {
    pay: async (order, payload) => {
      // 处理支付
      const { paymentMethod, transactionId } = payload
      // 调用支付接口
      return {
        ...order,
        paymentMethod,
        transactionId,
        paymentTime: new Date(),
      }
    },

    cancel: async (order, payload) => {
      // 处理取消
      const { reason } = payload
      // 检查是否可以取消
      // 处理退款
      return {
        ...order,
        cancelReason: reason,
        cancelTime: new Date(),
      }
    },

    confirm: async (order) => {
      // 商家确认
      return {
        ...order,
        confirmTime: new Date(),
      }
    },

    start_cooking: async (order) => {
      // 开始制作
      return {
        ...order,
        cookStartTime: new Date(),
      }
    },

    finish_cooking: async (order) => {
      // 制作完成
      return {
        ...order,
        cookEndTime: new Date(),
      }
    },

    start_delivery: async (order, payload) => {
      // 开始配送
      const { deliveryId, deliveryman } = payload
      return {
        ...order,
        deliveryId,
        deliveryman,
        deliveryTime: new Date(),
      }
    },

    complete: async (order) => {
      // 完成订单
      return {
        ...order,
        completedTime: new Date(),
        status: 'completed',
      }
    },

    refund: async (order, payload) => {
      // 处理退款
      const { refundAmount, reason } = payload
      // 调用退款接口
      return {
        ...order,
        refundAmount,
        refundReason: reason,
        refundTime: new Date(),
      }
    },
  },
}

/**
 * 注册订单状态机
 */
export function registerOrderWorkflow() {
  stateMachineEngine.registerType('order', OrderStateMachine)
  console.log('[Workflow] 订单工作流已注册')
}

/**
 * 创建订单实例
 */
export function createOrderInstance(context = {}) {
  return stateMachineEngine.create('order', context)
}

export default orderWorkflow
