<template>
  <view class="container">
    <!-- 菜单列表 -->
    <view class="menu-list">
      <view
        class="menu-item"
        v-for="item in menuItems"
        :key="item.id"
      >
        <image class="menu-image" :src="item.image" mode="aspectFill" />
        <view class="menu-info">
          <view class="menu-name">{{ item.name }}</view>
          <view class="menu-description">{{ item.description }}</view>
          <view class="menu-bottom">
            <view class="menu-price">¥{{ item.price }}</view>
            <view class="add-btn" @click="addToCart(item)">
              <text>+ 加入购物车</text>
            </view>
          </view>
        </view>
      </view>
    </view>

    <!-- 底部购物车栏 -->
    <view class="cart-bar" v-if="cartItemCount > 0">
      <view class="cart-info">
        <text class="cart-count">{{ cartItemCount }}</text>
        <text class="cart-text">已选</text>
      </view>
      <view class="cart-total">¥{{ cartTotal }}</view>
      <view class="cart-btn" @click="goToCart">去结算</view>
    </view>
  </view>
</template>

<script>
import { useCartStore } from '../../store/cart'
import { getRestaurantById, getDishes } from '../../api/restaurant'

export default {
  data() {
    return {
      restaurantId: null,
      restaurantName: '',
      loading: true,
      menuItems: [],
      cartStore: null
    }
  },
  computed: {
    cartItemCount() {
      return this.cartStore ? this.cartStore.itemCount : 0
    },
    cartTotal() {
      return this.cartStore ? this.cartStore.totalPrice.toFixed(2) : '0.00'
    }
  },
  onLoad(options) {
    if (options.restaurantId) {
      this.restaurantId = options.restaurantId
    }
    this.cartStore = useCartStore()
    this.fetchMenuItems()
  },
  methods: {
    async fetchMenuItems() {
      this.loading = true
      try {
        // Nest 面：餐厅详情与在售菜品是分开的公开读端点
        const restaurant = await getRestaurantById(this.restaurantId)
        this.restaurantName = restaurant.name || ''
        const dishes = await getDishes(this.restaurantId)
        if (dishes && dishes.length > 0) {
          this.menuItems = dishes.map(d => ({
            id: d.id,
            name: d.name,
            description: d.description || '',
            price: d.price,
            image: d.image_url || d.image || `https://picsum.photos/150/150?random=${Math.random()}`,
            dishId: d.id
          }))
        } else {
          // 使用 mock 数据
          this.menuItems = this.getMockMenu()
        }
      } catch (err) {
        console.error('获取菜单失败:', err)
        this.menuItems = this.getMockMenu()
      } finally {
        this.loading = false
      }
    },
    getMockMenu() {
      return [
        { id: 1, dishId: 'ab54a816-207b-5857-935b-39b086aa022a', name: '招牌汉堡套餐', description: '汉堡 + 可乐 + 薯条', price: 39.9, image: 'https://picsum.photos/150/150?random=10' },
        { id: 2, dishId: '165c9010-c77f-53e0-9b0e-dea941d22cb8', name: '香辣鸡腿堡', description: '经典美味', price: 19.9, image: 'https://picsum.photos/150/150?random=11' },
        { id: 3, dishId: '13243ad3-a788-5b95-a06f-b7c7d0dc45d6', name: '牛肉汉堡', description: '多汁牛肉', price: 24.9, image: 'https://picsum.photos/150/150?random=12' },
        { id: 4, dishId: '06383385-582d-5d76-94a5-37eb40005e55', name: '炸鸡套餐', description: '外酥里嫩', price: 29.9, image: 'https://picsum.photos/150/150?random=13' },
        { id: 5, dishId: 'f7bd4b92-2795-56bb-b809-3a6698f7b726', name: '薯条', description: '香脆可口', price: 9.9, image: 'https://picsum.photos/150/150?random=14' },
        { id: 6, dishId: 'c6b78167-2dc2-5d51-934-3b6809423051', name: '可乐', description: '冰爽解渴', price: 6.9, image: 'https://picsum.photos/150/150?random=15' }
      ]
    },
    addToCart(item) {
      if (this.cartStore) {
        this.cartStore.addItem({ ...item, quantity: 1, image: item.image, restaurantId: this.restaurantId })
      }
      uni.showToast({
        title: '已加入购物车',
        icon: 'success'
      })
    },
    goToCart() {
      // cart 是 tabBar 页面，必须用 switchTab，不能用 navigateTo
      uni.switchTab({
        url: '/pages/cart/cart'
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

.menu-list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  padding-bottom: 140rpx;
}

.menu-item {
  display: flex;
  background-color: var(--color-bg-card);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

.menu-image {
  width: 200rpx;
  height: 200rpx;
  flex-shrink: 0;
}

.menu-info {
  flex: 1;
  padding: 20rpx;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.menu-name {
  font-size: var(--font-size-md);
  font-weight: bold;
  color: var(--color-text-primary);
}

.menu-description {
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
}

.menu-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.menu-price {
  font-size: var(--font-size-lg);
  color: var(--color-danger);
  font-weight: bold;
}

.add-btn {
  background-color: var(--color-primary);
  color: var(--color-text-inverse);
  padding: 10rpx 24rpx;
  border-radius: 20rpx;
  font-size: var(--font-size-sm);
}

.cart-bar {
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

.cart-info {
  display: flex;
  align-items: center;
  color: var(--color-text-inverse);
}

.cart-count {
  font-size: var(--font-size-2xl);
  font-weight: bold;
  color: var(--color-secondary);
  margin-right: 12rpx;
}

.cart-text {
  font-size: var(--font-size-base);
}

.cart-total {
  color: var(--color-text-inverse);
  font-size: var(--font-size-xl);
  font-weight: bold;
}

.cart-btn {
  background-color: var(--color-secondary);
  color: var(--color-text-inverse);
  padding: 16rpx 40rpx;
  border-radius: 30rpx;
  font-size: var(--font-size-base);
}
</style>