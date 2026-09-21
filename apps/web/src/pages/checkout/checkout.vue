<template>
  <view class="container">
    <!-- 收货地址 -->
    <view class="section address-section" @click="selectAddress">
      <view class="address-header">
        <text class="section-icon">📍</text>
        <text class="section-title">收货地址</text>
      </view>
      <view class="address-detail" v-if="address.name">
        <view class="address-contact">
          <text class="contact-name">{{ address.name }}</text>
          <text class="contact-phone">{{ address.phone }}</text>
        </view>
        <text class="address-full">{{ address.province }}{{ address.city }}{{ address.district }} {{ address.detail }}</text>
      </view>
      <view class="address-empty" v-else>
        <text>请选择收货地址</text>
        <text class="arrow">›</text>
      </view>
      <text class="arrow" v-if="address.name">›</text>
    </view>

    <!-- 商品列表 -->
    <view class="section">
      <view class="section-header">
        <text class="section-icon">🛒</text>
        <text class="section-title">商品明细</text>
      </view>
      <view class="item" v-for="item in cartItems" :key="item.id">
        <image class="item-image" :src="item.image" mode="aspectFill" />
        <view class="item-info">
          <text class="item-name">{{ item.name }}</text>
          <text class="item-price">¥{{ item.price }}</text>
        </view>
        <text class="item-quantity">x{{ item.quantity }}</text>
      </view>
    </view>

    <!-- 配送方式 -->
    <view class="section">
      <view class="section-header">
        <text class="section-icon">🚀</text>
        <text class="section-title">配送方式</text>
      </view>
      <view class="delivery-option" :class="{ active: deliveryType === 'express' }" @click="deliveryType = 'express'">
        <text class="delivery-name">快递配送</text>
        <text class="delivery-fee">¥5.00</text>
        <view class="radio" :class="{ checked: deliveryType === 'express' }" />
      </view>
      <view class="delivery-option" :class="{ active: deliveryType === 'self' }" @click="deliveryType = 'self'">
        <text class="delivery-name">到店自取</text>
        <text class="delivery-fee">免费</text>
        <view class="radio" :class="{ checked: deliveryType === 'self' }" />
      </view>
    </view>

    <!-- 备注 -->
    <view class="section">
      <view class="section-header">
        <text class="section-icon">📝</text>
        <text class="section-title">订单备注</text>
      </view>
      <input class="remark-input" v-model="remark" placeholder="选填，如口味偏好、配送要求等" />
    </view>

    <!-- 订单签名 -->
    <view class="section">
      <view class="section-header">
        <text class="section-icon">✍️</text>
        <text class="section-title">订单签名</text>
        <text class="section-hint">请在下方签名确认订单</text>
      </view>
      <SignaturePad ref="signature" canvas-id="order-signature" height="280" />
      <view class="signature-actions">
        <button class="sign-btn" @click="clearSignature">清空</button>
        <button class="sign-btn" @click="undoSignature">撤销</button>
      </view>
    </view>

    <!-- 费用明细 -->
    <view class="section">
      <view class="section-header">
        <text class="section-icon">💰</text>
        <text class="section-title">费用明细</text>
      </view>
      <view class="fee-row">
        <text class="fee-label">商品小计</text>
        <text class="fee-value">¥{{ subtotal }}</text>
      </view>
      <view class="fee-row">
        <text class="fee-label">配送费</text>
        <text class="fee-value" v-if="deliveryType === 'express'">¥5.00</text>
        <text class="fee-value free" v-else>免费</text>
      </view>
      <view class="fee-row total-row">
        <text class="fee-label">合计</text>
        <text class="fee-value total">¥{{ total }}</text>
      </view>
    </view>

    <!-- 底部提交 -->
    <view class="bottom-bar">
      <view class="bottom-total">
        <text class="total-label">合计：</text>
        <text class="total-price">¥{{ total }}</text>
      </view>
      <button class="submit-btn" @click="submitOrder">提交订单</button>
    </view>
  </view>
</template>

<script>
import { useCartStore } from '../../store/cart'
import { createOrder } from '../../api/order'
import SignaturePad from '../../components/base/SignaturePad.vue'

// 默认用户 ID 占位（与 order 页一致）
const DEFAULT_USER_ID = 'a0000000-0000-0000-0000-000000000001'

export default {
  components: { SignaturePad },
  data() {
    return {
      cartStore: null,
      address: {
        name: '张三',
        phone: '138****8888',
        province: '广东省',
        city: '深圳市',
        district: '南山区',
        detail: '科技园路88号创新大厦12F'
      },
      deliveryType: 'express',
      remark: ''
    }
  },
  computed: {
    cartItems() {
      return this.cartStore ? this.cartStore.items : []
    },
    subtotal() {
      return this.cartStore ? this.cartStore.totalPrice.toFixed(2) : '0.00'
    },
    deliveryFee() {
      return this.deliveryType === 'express' ? 5.00 : 0.00
    },
    total() {
      const sub = parseFloat(this.subtotal) || 0
      return (sub + this.deliveryFee).toFixed(2)
    }
  },
  onLoad() {
    this.cartStore = useCartStore()
  },
  methods: {
    selectAddress() {
      uni.showToast({ title: '选择地址', icon: 'none' })
    },
    clearSignature() {
      this.$refs.signature && this.$refs.signature.clear()
    },
    undoSignature() {
      this.$refs.signature && this.$refs.signature.undo()
    },
    submitOrder() {
      if (!this.address.name) {
        uni.showToast({ title: '请选择收货地址', icon: 'none' })
        return
      }
      if (this.cartItems.length === 0) {
        uni.showToast({ title: '购物车为空', icon: 'none' })
        return
      }
      if (!this.$refs.signature || this.$refs.signature.isEmpty()) {
        uni.showToast({ title: '请签名确认订单', icon: 'none' })
        return
      }
      uni.showModal({
        title: '确认下单',
        content: `合计 ¥${this.total}，确认提交订单？`,
        success: async (res) => {
          if (res.confirm) {
            await this.placeOrder()
          }
        }
      })
    },
    async placeOrder() {
      uni.showLoading({ title: '提交中...' })
      try {
        // 从购物车取餐厅归属（默认取第一个菜品所属餐厅）
        const restaurantId = this.cartItems[0]?.restaurantId || null
        const items = this.cartItems.map(item => ({
          dishId: item.dishId || item.id,
          dishName: item.name,
          dishImage: item.image,
          quantity: item.quantity,
          price: item.price
        }))

        const result = await createOrder({
          userId: DEFAULT_USER_ID,
          restaurantId,
          items,
          remark: this.remark,
          address: `${this.address.province}${this.address.city}${this.address.district} ${this.address.detail}`
        })

        uni.hideLoading()
        if (this.cartStore) {
          this.cartStore.clearCart()
        }
        uni.showToast({ title: '下单成功！', icon: 'success', duration: 1500 })
        // 下单成功后自动跳转支付页，补齐下单 → 支付的空档
        const orderId = result?.id
        const amount = result?.total_amount ?? result?.totalAmount ?? this.total
        uni.$emit('switchOrderTab', 'pending')
        setTimeout(() => {
          uni.navigateTo({ url: `/pages/pay/pay?orderId=${orderId}&amount=${amount}` })
        }, 1500)
      } catch (err) {
        uni.hideLoading()
        console.error('提交订单失败:', err)
        uni.showToast({ title: err.message || '下单失败，请重试', icon: 'none', duration: 2000 })
      }
    }
  }
}
</script>

<style>
.container {
  background-color: var(--color-bg-primary);
  min-height: 100vh;
  padding-bottom: 140rpx;
}

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

/* 地址 */
.address-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
}

.address-header {
  display: flex;
  align-items: center;
  width: 100%;
  margin-bottom: 12rpx;
}

.address-detail {
  flex: 1;
}

.address-contact {
  display: flex;
  align-items: center;
  gap: 20rpx;
  margin-bottom: 8rpx;
}

.contact-name {
  font-size: var(--font-size-md);
  font-weight: bold;
  color: var(--color-text-primary);
}

.contact-phone {
  font-size: 26rpx;
  color: var(--color-text-secondary);
}

.address-full {
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
}

.address-empty {
  flex: 1;
  font-size: var(--font-size-base);
  color: var(--color-text-tertiary);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.arrow {
  font-size: var(--font-size-2xl);
  color: var(--color-border);
  align-self: center;
}

/* 商品 */
.order-item {
  display: flex;
  align-items: center;
  padding: 12rpx 0;
  border-bottom: 1rpx solid var(--color-border-light);
}

.order-item:last-child {
  border-bottom: none;
}

.item-image {
  width: 100rpx;
  height: 100rpx;
  border-radius: var(--radius-sm);
}

.item-info {
  flex: 1;
  margin-left: 20rpx;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.item-name {
  font-size: 26rpx;
  color: var(--color-text-primary);
}

.item-price {
  font-size: 26rpx;
  color: var(--color-danger);
  font-weight: bold;
}

.item-quantity {
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
}

/* 配送 */
.delivery-option, .delivery {
  display: flex;
  align-items: center;
  padding: 16rpx 0;
  border-bottom: 1rpx solid var(--color-border-light);
}

.delivery-option:last-child, .delivery:last-child {
  border-bottom: none;
}

.delivery-name {
  flex: 1;
  font-size: 26rpx;
  color: var(--color-text-primary);
}

.delivery-fee {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin-right: 16rpx;
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

/* 备注 */
.remark-input {
  width: 100%;
  height: 120rpx;
  font-size: 26rpx;
  color: var(--color-text-primary);
  padding: 12rpx;
}

/* 签名 */
.section-hint {
  margin-left: auto;
  font-size: 22rpx;
  color: var(--color-text-tertiary);
}

.signature-actions {
  display: flex;
  gap: 20rpx;
  margin-top: 20rpx;
}

.sign-btn {
  flex: 1;
  font-size: 26rpx;
  color: var(--color-text-primary);
  background-color: #F0F2F5;
  border: 1rpx solid #D9D9D9;
  border-radius: 30rpx;
  padding: 10rpx 0;
}

/* 费用 */
.fee-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12rpx 0;
}

.fee-label {
  font-size: 26rpx;
  color: var(--color-text-secondary);
}

.fee-value {
  font-size: 26rpx;
  color: var(--color-text-primary);
}

.fee-value.free {
  color: var(--color-success);
}

.total-row {
  border-top: 1rpx solid var(--color-border);
  margin-top: 8rpx;
  padding-top: 16rpx;
}

.fee-value.total {
  font-size: var(--font-size-lg);
  color: var(--color-danger);
  font-weight: bold;
}

/* 底部栏 */
.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: var(--color-bg-card);
  padding: 20rpx 30rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 -2rpx 8rpx rgba(0, 0, 0, 0.05);
}

.bottom-total {
  display: flex;
  align-items: baseline;
}

.total-label {
  font-size: 26rpx;
  color: var(--color-text-primary);
}

.total-price {
  font-size: var(--font-size-2xl);
  color: var(--color-danger);
  font-weight: bold;
}

.submit-btn {
  background-color: var(--color-danger);
  color: var(--color-text-inverse);
  padding: 16rpx 60rpx;
  border-radius: 30rpx;
  font-size: var(--font-size-base);
  font-weight: bold;
}
</style>