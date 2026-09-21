<template>
  <view class="container">
    <view class="empty-cart" v-if="cartItems.length === 0">
      <image src="https://picsum.photos/300/300?random=20" class="empty-image" mode="aspectFit" />
      <text class="empty-text">购物车还是空的</text>
      <button class="go-shop-btn" @click="goToIndex">去逛逛</button>
    </view>

    <view v-else>
      <!-- 购物车列表 -->
      <view class="cart-list">
        <view class="cart-item" v-for="item in cartItems" :key="item.id">
          <image class="cart-item-image" :src="item.image" mode="aspectFill" />
          <view class="cart-item-info">
            <view class="cart-item-name">{{ item.name }}</view>
            <view class="cart-item-price">¥{{ item.price }}</view>
            <view class="cart-item-quantity">
              <view class="quantity-btn" @click="decreaseQuantity(item)">
                <text>-</text>
              </view>
              <text class="quantity-value">{{ item.quantity }}</text>
              <view class="quantity-btn" @click="increaseQuantity(item)">
                <text>+</text>
              </view>
            </view>
          </view>
        </view>
      </view>

      <!-- 底部结算栏 -->
      <view class="checkout-bar">
        <view class="checkout-info">
          <text class="total-label">合计：</text>
          <text class="total-price">¥{{ totalPrice }}</text>
        </view>
        <button class="checkout-btn" @click="goToOrder">去结算</button>
      </view>
    </view>
  </view>
</template>

<script>
import { useCartStore } from '../../store/cart'

export default {
  data() {
    return {
      cartStore: null
    }
  },
  computed: {
    cartItems() {
      return this.cartStore ? this.cartStore.items : []
    },
    totalPrice() {
      return this.cartStore ? this.cartStore.totalPrice.toFixed(2) : '0.00'
    }
  },
  onLoad() {
    this.cartStore = useCartStore()
  },
  methods: {
    decreaseQuantity(item) {
      if (this.cartStore && item.quantity > 1) {
        this.cartStore.updateQuantity(item.id, item.quantity - 1)
      } else {
        this.removeItem(item)
      }
    },
    increaseQuantity(item) {
      if (this.cartStore) {
        this.cartStore.updateQuantity(item.id, item.quantity + 1)
      }
    },
    removeItem(item) {
      if (this.cartStore) {
        this.cartStore.removeItem(item.id)
      }
    },
    goToOrder() {
      uni.navigateTo({
        url: '/pages/checkout/checkout'
      })
    },
    goToIndex() {
      uni.switchTab({
        url: '/pages/index/index'
      })
    }
  }
}
</script>

<style>
.container {
  padding: var(--spacing-lg);
  background-color: var(--color-bg-primary);
  min-height: 100vh;
}

.empty-cart {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 200rpx;
}

.empty-image {
  width: 300rpx;
  height: 300rpx;
  margin-bottom: 40rpx;
}

.empty-text {
  font-size: var(--font-size-base);
  color: var(--color-text-tertiary);
  margin-bottom: 40rpx;
}

.go-shop-btn {
  background-color: var(--color-primary);
  color: var(--color-text-inverse);
  padding: 20rpx 60rpx;
  border-radius: 30rpx;
  font-size: var(--font-size-base);
}

.cart-list {
  padding-bottom: 240rpx;
}

.cart-item {
  display: flex;
  background-color: var(--color-bg-card);
  border-radius: var(--radius-lg);
  margin-bottom: 20rpx;
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

.cart-item-image {
  width: 180rpx;
  height: 180rpx;
  flex-shrink: 0;
}

.cart-item-info {
  flex: 1;
  padding: 20rpx;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.cart-item-name {
  font-size: var(--font-size-base);
  font-weight: bold;
  color: var(--color-text-primary);
}

.cart-item-price {
  font-size: var(--font-size-base);
  color: var(--color-danger);
  font-weight: bold;
}

.cart-item-quantity {
  display: flex;
  align-items: center;
  gap: 20rpx;
}

.quantity-btn {
  width: 50rpx;
  height: 50rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1rpx solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-lg);
}

.quantity-value {
  font-size: var(--font-size-base);
  font-weight: bold;
}

.checkout-bar {
  position: fixed;
  bottom: 100rpx;
  left: 0;
  right: 0;
  background-color: var(--color-text-primary);
  padding: 20rpx 30rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.checkout-info {
  display: flex;
  align-items: center;
}

.total-label {
  color: var(--color-text-inverse);
  font-size: var(--font-size-base);
  margin-right: 16rpx;
}

.total-price {
  color: var(--color-danger);
  font-size: var(--font-size-2xl);
  font-weight: bold;
}

.checkout-btn {
  background-color: var(--color-primary);
  color: var(--color-text-inverse);
  padding: 16rpx 40rpx;
  border-radius: 30rpx;
  font-size: var(--font-size-base);
}
</style>