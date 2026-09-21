<template>
  <view class="container">
    <!-- 应付金额 -->
    <view class="amount-section">
      <text class="amount-label">应付金额</text>
      <view class="amount-value">
        <text class="amount-symbol">¥</text>
        <text class="amount-number">{{ amount }}</text>
      </view>
      <text class="amount-order" v-if="orderId">订单号：{{ orderId }}</text>
    </view>

    <!-- 支付方式 -->
    <view class="section">
      <view class="section-header">
        <text class="section-icon">💳</text>
        <text class="section-title">支付方式</text>
      </view>
      <view
        class="method-option"
        :class="{ active: paymentMethod === m.key }"
        v-for="m in methods"
        :key="m.key"
        @click="paymentMethod = m.key"
      >
        <text class="method-icon">{{ m.icon }}</text>
        <view class="method-info">
          <text class="method-name">{{ m.label }}</text>
          <text class="method-desc">{{ m.desc }}</text>
        </view>
        <view class="radio" :class="{ checked: paymentMethod === m.key }" />
      </view>
    </view>

    <!-- 底部确认支付 -->
    <view class="bottom-bar">
      <button class="pay-btn" @click="confirmPay">确认支付 ¥{{ amount }}</button>
    </view>
  </view>
</template>

<script>
import { processPayment } from '../../api/payment'

export default {
  data() {
    return {
      orderId: '',
      amount: '0.00',
      paymentMethod: 'wechat',
      methods: [
        { key: 'wechat', label: '微信支付', icon: '🟢', desc: '推荐使用微信支付' },
        { key: 'alipay', label: '支付宝', icon: '🔵', desc: '使用支付宝支付' },
        { key: 'cash', label: '货到付款', icon: '📦', desc: '收货时现金支付' }
      ]
    }
  },
  onLoad(options) {
    if (options && options.orderId) {
      this.orderId = options.orderId
    }
    if (options && options.amount) {
      this.amount = options.amount
    }
  },
  methods: {
    confirmPay() {
      if (!this.orderId) {
        uni.showToast({ title: '订单信息缺失', icon: 'none' })
        return
      }
      uni.showLoading({ title: '支付处理中...' })
      processPayment({
        orderId: this.orderId,
        paymentMethod: this.paymentMethod,
        transactionId: `${this.paymentMethod}_${Date.now()}`
      })
        .then(() => {
          uni.hideLoading()
          uni.showToast({ title: '支付成功！', icon: 'success', duration: 1500 })
          // 预置订单列表 tab 到「待发货」，并跳转
          uni.$emit('switchOrderTab', 'confirmed')
          setTimeout(() => {
            uni.switchTab({ url: '/pages/order/order' })
          }, 1500)
        })
        .catch((err) => {
          uni.hideLoading()
          console.error('支付失败:', err)
          uni.showToast({ title: err.message || '支付失败，请重试', icon: 'none', duration: 2000 })
        })
    }
  }
}
</script>

<style>
.container {
  background-color: var(--color-bg-primary);
  min-height: 100vh;
  padding-bottom: 200rpx;
}

/* 金额 */
.amount-section {
  background: linear-gradient(135deg, var(--color-primary), var(--color-success));
  margin: 20rpx;
  border-radius: var(--radius-lg);
  padding: 40rpx 30rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.amount-label {
  font-size: var(--font-size-sm);
  color: rgba(255, 255, 255, 0.85);
  margin-bottom: 12rpx;
}

.amount-value {
  display: flex;
  align-items: baseline;
}

.amount-symbol {
  font-size: var(--font-size-lg);
  color: var(--color-text-inverse);
  font-weight: bold;
  margin-right: 8rpx;
}

.amount-number {
  font-size: 64rpx;
  color: var(--color-text-inverse);
  font-weight: bold;
}

.amount-order {
  margin-top: 16rpx;
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.7);
}

/* 支付方式 */
.section {
  background-color: var(--color-bg-card);
  margin: 20rpx;
  border-radius: var(--radius-lg);
  padding: var(--spacing-md);
}

.section-header {
  display: flex;
  align-items: center;
  margin-bottom: var(--spacing-sm);
}

.section-icon {
  font-size: var(--font-size-lg);
  margin-right: 12rpx;
}

.section-title {
  font-size: var(--font-size-base);
  font-weight: bold;
  color: var(--color-text-primary);
}

.method-option {
  display: flex;
  align-items: center;
  padding: 24rpx 0;
  border-bottom: 1rpx solid var(--color-border-light);
}

.method-option:last-child {
  border-bottom: none;
}

.method-icon {
  font-size: 40rpx;
  margin-right: 20rpx;
}

.method-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.method-name {
  font-size: var(--font-size-base);
  color: var(--color-text-primary);
  font-weight: bold;
}

.method-desc {
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
}

.radio {
  width: 36rpx;
  height: 36rpx;
  border-radius: 50%;
  border: 2rpx solid var(--color-border);
}

.radio.checked {
  border-color: var(--color-primary);
  background-color: var(--color-primary);
  position: relative;
}

.radio.checked::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background-color: var(--color-text-inverse);
}

/* 底部 */
.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: var(--color-bg-card);
  padding: 20rpx 30rpx;
  box-shadow: 0 -2rpx 8rpx rgba(0, 0, 0, 0.05);
}

.pay-btn {
  background-color: var(--color-danger);
  color: var(--color-text-inverse);
  padding: 20rpx 0;
  border-radius: 40rpx;
  font-size: var(--font-size-base);
  font-weight: bold;
}
</style>