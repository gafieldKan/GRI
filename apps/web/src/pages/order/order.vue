<template>
  <view class="container">
    <!-- 订单列表 -->
    <view class="order-tabs">
      <view
        class="tab-item"
        :class="{ active: currentTab === tab.key }"
        v-for="tab in tabs"
        :key="tab.key"
        @click="currentTab = tab.key"
      >
        {{ tab.label }}
      </view>
    </view>

    <!-- 订单列表 -->
    <view class="order-list">
      <view v-if="loading" class="empty-tip">
        加载中...
      </view>
      <view v-else-if="filteredOrders.length === 0" class="empty-tip">
        暂无{{ currentTab === 'all' ? '' : orderStatusMap[currentTab] }}订单
      </view>
      <view class="order-item" v-for="order in filteredOrders" :key="order.id">
        <view class="order-header" @click="goToDetail(order.id)">
          <text class="order-no">订单号：{{ order.orderNo || order.id }}</text>
          <text class="order-status" :style="{ color: order.statusColor }">{{ order.statusLabel }}</text>
        </view>
        <view class="order-items">
          <view
            class="order-item-info"
            v-for="item in order.items"
            :key="item.id"
          >
            <image class="order-item-image" :src="item.dishImage || 'https://picsum.photos/100/100?random=30'" mode="aspectFill" />
            <view class="order-item-detail">
              <text class="order-item-name">{{ item.dishName }}</text>
              <text class="order-item-quantity">x{{ item.quantity }}</text>
            </view>
          </view>
        </view>
        <view class="order-footer">
          <text class="order-total">实付：¥{{ order.totalAmount || order.total }}</text>
          <view class="order-actions">
            <!-- 待支付 -->
            <button class="action-btn cancel" v-if="order.status === 'pending' || order.status === 'PENDING'" @click="handleCancelOrder(order)">取消订单</button>
            <button class="action-btn primary" v-if="order.status === 'pending' || order.status === 'PENDING'" @click="handlePayOrder(order)">立即支付</button>
            <!-- 待发货 / 已确认 -->
            <button class="action-btn cancel" v-if="order.status === 'confirmed' || order.status === 'CONFIRMED'" @click="handleCancelOrder(order)">取消订单</button>
            <button class="action-btn primary" v-if="order.status === 'confirmed' || order.status === 'CONFIRMED'" @click="handleRemindShip(order)">提醒发货</button>
            <!-- 配送中 -->
            <button class="action-btn primary" v-if="order.status === 'delivering' || order.status === 'DELIVERING'" @click="handleConfirmReceive(order)">确认收货</button>
            <!-- 已完成 -->
            <button class="action-btn primary" v-if="order.status === 'completed' || order.status === 'COMPLETED'" @click="handleReOrder(order)">再来一单</button>
            <button class="action-btn" v-if="order.status === 'completed' || order.status === 'COMPLETED'" @click="handleReviewOrder(order)">评价</button>
            <!-- 已取消 -->
            <button class="action-btn primary" v-if="order.status === 'cancelled' || order.status === 'CANCELLED'" @click="handleReOrder(order)">再来一单</button>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { getOrders, cancelOrder, confirmOrder, completeOrder } from '../../api/order'
import { refundOrder } from '../../api/payment'

// 订单状态映射
const orderStatusMap = {
  all: '全部',
  pending: '待支付',
  confirmed: '待发货',
  delivering: '待收货',
  completed: '已完成',
  cancelled: '已取消'
}

const statusColorMap = {
  pending: '#ff4d4f',
  confirmed: '#1890ff',
  delivering: '#f5a623',
  completed: '#52c41a',
  cancelled: '#999'
}

// 默认用户 ID 占位
const DEFAULT_USER_ID = 'a0000000-0000-0000-0000-000000000001'

export default {
  data() {
    return {
      currentTab: 'all',
      tabs: [
        { key: 'all', label: '全部' },
        { key: 'pending', label: '待支付' },
        { key: 'confirmed', label: '待发货' },
        { key: 'delivering', label: '待收货' },
        { key: 'completed', label: '已完成' },
        { key: 'cancelled', label: '已取消' }
      ],
      orderList: [],
      loading: true,
      orderStatusMap
    }
  },
  computed: {
    filteredOrders() {
      if (this.currentTab === 'all') {
        return this.orderList
      }
      const targetStatus = this.currentTab.toUpperCase()
      return this.orderList.filter(order => {
        const status = (order.status || '').toLowerCase()
        return status === this.currentTab || status === targetStatus
      })
    }
  },
  onLoad() {
    this.fetchOrders()
  },
  onShow() {
    // 每次切换到这个 tab 时刷新订单列表
    this.fetchOrders()
  },
  mounted() {
    // 组件挂载时注册事件监听
    this._switchTabHandler = (status) => {
      if (status) {
        this.currentTab = status
      }
    }
    uni.$on('switchOrderTab', this._switchTabHandler)
  },
  beforeUnmount() {
    if (this._switchTabHandler) {
      uni.$off('switchOrderTab', this._switchTabHandler)
      this._switchTabHandler = null
    }
  },
  onPullDownRefresh() {
    this.fetchOrders().then(() => {
      uni.stopPullDownRefresh()
    })
  },
  methods: {
    async fetchOrders() {
      this.loading = true
      try {
        const result = await getOrders()
        const rawOrders = result || []
        this.orderList = rawOrders.map(order => ({
          ...order,
          orderNo: order.order_no || order.orderNo || order.id,
          statusLabel: orderStatusMap[(order.status || '').toLowerCase()] || order.status,
          statusColor: statusColorMap[(order.status || '').toLowerCase()] || '#666',
          totalAmount: order.total_amount || order.totalAmount || order.total || 0,
          items: (order.items || []).map(item => ({
            ...item,
            image: item.dishImage || item.image || `https://picsum.photos/150/150?random=${Math.random()}`
          }))
        }))
      } catch (err) {
        console.error('获取订单列表失败:', err)
        // 降级：显示空列表
        this.orderList = []
      } finally {
        this.loading = false
      }
    },

    goToDetail(id) {
      // order 是 tabBar 页面，navigateTo 会报「can not navigateTo a tabbar page」；
      // 且当前无独立订单详情页（order 列表本身即详情），故此处不做跳转。
      // 如需订单详情，后续应新增 pages/order/detail 页面再改用 navigateTo。
      uni.showToast({ title: `订单 ${id}`, icon: 'none' })
    },

    async handleCancelOrder(order) {
      uni.showModal({
        title: '取消订单',
        content: '确定取消该订单吗？',
        success: async (res) => {
          if (res.confirm) {
            try {
              await cancelOrder(order.id, '用户取消')
              uni.showToast({ title: '订单已取消', icon: 'success' })
              this.fetchOrders()
            } catch (err) {
              console.error('取消订单失败:', err)
              uni.showToast({ title: '取消失败，请稍后重试', icon: 'none' })
            }
          }
        }
      })
    },

    async handlePayOrder(order) {
      // 跳转到独立支付页，供用户查看金额并选择支付方式
      const amount = order.totalAmount || order.total || '0.00'
      uni.navigateTo({ url: `/pages/pay/pay?orderId=${order.id}&amount=${amount}` })
    },

    async handleConfirmReceive(order) {
      uni.showModal({
        title: '确认收货',
        content: '确认已收到货物吗？',
        success: async (res) => {
          if (res.confirm) {
            try {
              await completeOrder(order.id)
              uni.showToast({ title: '已确认收货', icon: 'success' })
              this.fetchOrders()
            } catch (err) {
              console.error('确认收货失败:', err)
              uni.showToast({ title: '操作失败，请重试', icon: 'none' })
            }
          }
        }
      })
    },

    handleRemindShip(order) {
      uni.showToast({ title: '已提醒商家发货', icon: 'none' })
    },

    handleReOrder(order) {
      uni.showToast({ title: '已加入购物车', icon: 'success' })
    },

    handleReviewOrder(order) {
      uni.showToast({ title: '评价功能开发中', icon: 'none' })
    }
  }
}
</script>

<style>
.container {
  background-color: var(--color-bg-primary);
  min-height: 100vh;
}

.order-tabs {
  display: flex;
  background-color: var(--color-bg-card);
  padding: 20rpx;
  gap: 0;
  flex-wrap: wrap;
}

.tab-item {
  text-align: center;
  font-size: 26rpx;
  color: var(--color-text-secondary);
  padding: 12rpx 20rpx;
  border-bottom: 2rpx solid transparent;
  white-space: nowrap;
}

.tab-item.active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
  font-weight: bold;
}

.order-list {
  padding: 20rpx;
}

.order-item {
  background-color: var(--color-bg-card);
  border-radius: var(--radius-lg);
  padding: 20rpx;
  margin-bottom: 20rpx;
  box-shadow: var(--shadow-sm);
}

.order-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 20rpx;
  border-bottom: 1rpx solid var(--color-border);
}

.order-no {
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
}

.order-status {
  font-size: 26rpx;
  font-weight: bold;
}

.order-items {
  padding: 20rpx 0;
}

.order-item-info {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 10rpx 0;
}

.order-item-image {
  width: 100rpx;
  height: 100rpx;
  border-radius: var(--radius-sm);
}

.order-item-detail {
  flex: 1;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.order-item-name {
  font-size: var(--font-size-base);
  color: var(--color-text-primary);
}

.order-item-quantity {
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
}

.order-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 20rpx;
  border-top: 1rpx solid var(--color-border);
}

.order-total {
  font-size: var(--font-size-lg);
  color: var(--color-danger);
  font-weight: bold;
}

.order-actions {
  display: flex;
  gap: 20rpx;
}

.action-btn {
  padding: 12rpx 32rpx;
  border-radius: 30rpx;
  font-size: var(--font-size-sm);
  border: 1rpx solid var(--color-border);
  background-color: var(--color-bg-card);
}

.action-btn.primary {
  background-color: var(--color-primary);
  color: var(--color-text-inverse);
  border-color: var(--color-primary);
}

.action-btn.cancel {
  color: var(--color-text-tertiary);
}

.empty-tip {
  text-align: center;
  padding: 100rpx 0;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-base);
}
</style>