<template>
  <view class="container">
    <!-- 搜索栏 -->
    <view class="search-bar">
      <view class="search-input">
        <text class="search-icon">🔍</text>
        <input
          class="search-field"
          v-model="searchKeyword"
          placeholder="搜索商家或菜品"
          confirm-type="search"
          @confirm="onSearch"
          @input="onSearchInput"
        />
        <text
          v-if="searchKeyword"
          class="search-clear"
          @click="clearSearch"
        >✕</text>
      </view>
      <!-- 搜索结果提示 -->
      <view class="search-results-hint" v-if="isSearching">
        搜索结果：{{ filteredRestaurants.length }} 家商家
      </view>
    </view>

    <!-- 商家列表 -->
    <view class="restaurant-list">
      <view v-if="filteredRestaurants.length === 0" class="empty-tip">
        暂无匹配的商家
      </view>
      <view
        class="restaurant-item"
        v-for="(item, index) in filteredRestaurants"
        :key="item.id"
        @click="goToMenu(item.id)"
      >
        <image class="restaurant-image" :src="item.image" mode="aspectFill" />
        <view class="restaurant-info">
          <view class="restaurant-name">
            <text v-if="searchKeyword" v-html="highlightMatch(item.name)"></text>
            <text v-else>{{ item.name }}</text>
          </view>
          <view class="restaurant-tags">
            <text class="tag" v-for="(tag, i) in item.tags" :key="i">{{ tag }}</text>
          </view>
          <view class="restaurant-meta">
            <text class="rating">⭐ {{ item.rating }}</text>
            <text class="delivery-time">{{ item.deliveryTime }}</text>
            <text class="delivery-fee">{{ item.deliveryFee }}</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { getRestaurants } from '../../api/restaurant'

export default {
  data() {
    return {
      searchKeyword: '',
      isSearching: false,
      loading: true,
      restaurants: []
    }
  },
  computed: {
    filteredRestaurants() {
      if (!this.searchKeyword.trim()) {
        this.isSearching = false
        return this.restaurants
      }
      this.isSearching = true
      const keyword = this.searchKeyword.trim().toLowerCase()
      return this.restaurants.filter(item => {
        const nameMatch = (item.name || '').toLowerCase().includes(keyword)
        const tagMatch = (item.tags || []).some(tag => tag.toLowerCase().includes(keyword))
        return nameMatch || tagMatch
      })
    }
  },
  onLoad() {
    this.fetchRestaurants()
  },
  onPullDownRefresh() {
    this.fetchRestaurants().then(() => {
      uni.stopPullDownRefresh()
    })
  },
  methods: {
    async fetchRestaurants() {
      this.loading = true
      try {
        const data = await getRestaurants()
        this.restaurants = (data || []).map(r => ({
          id: r.id,
          name: r.name,
          image: r.image || r.logo_url || `https://picsum.photos/150/150?random=${Math.random()}`,
          rating: r.rating || 4.5,
          deliveryTime: r.delivery_time || (Math.floor(Math.random() * 30 + 20) + ' 分钟'),
          deliveryFee: r.delivery_fee || '¥' + Math.floor(Math.random() * 10 + 5),
          tags: r.tags || (r.categories || ['商家']),
          address: r.address
        }))
      } catch (err) {
        console.error('获取商家列表失败:', err)
        this.restaurants = [
          { id: 1, name: '麦当劳', image: 'https://picsum.photos/150/150?random=1', rating: 4.8, deliveryTime: '30 分钟', deliveryFee: '¥9', tags: ['汉堡快餐', '满减优惠'] },
          { id: 2, name: '肯德基', image: 'https://picsum.photos/150/150?random=2', rating: 4.7, deliveryTime: '35 分钟', deliveryFee: '¥8', tags: ['汉堡快餐', '新客立减'] },
          { id: 3, name: '星巴克', image: 'https://picsum.photos/150/150?random=3', rating: 4.9, deliveryTime: '40 分钟', deliveryFee: '¥12', tags: ['咖啡茶饮', '品牌连锁'] },
          { id: 4, name: '海底捞', image: 'https://picsum.photos/150/150?random=4', rating: 4.9, deliveryTime: '60 分钟', deliveryFee: '¥15', tags: ['火锅烧烤', '满减优惠'] },
          { id: 5, name: '西贝莜面村', image: 'https://picsum.photos/150/150?random=5', rating: 4.6, deliveryTime: '45 分钟', deliveryFee: '¥10', tags: ['西北菜', '品牌连锁'] },
          { id: 6, name: '披萨胜客', image: 'https://picsum.photos/150/150?random=6', rating: 4.5, deliveryTime: '50 分钟', deliveryFee: '¥12', tags: ['西餐披萨', '满减优惠'] }
        ]
      } finally {
        this.loading = false
      }
    },
    onSearch() {
      // 确认搜索
    },
    onSearchInput() {
      // 实时搜索（computed 已自动响应）
    },
    clearSearch() {
      this.searchKeyword = ''
      this.isSearching = false
    },
    highlightMatch(text) {
      const keyword = this.searchKeyword.trim()
      if (!keyword) return text
      const reg = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
      return text.replace(reg, '<span style="color:var(--color-primary);font-weight:bold;">$1</span>')
    },
    goToMenu(id) {
      uni.navigateTo({
        url: '/pages/menu/menu?restaurantId=' + id
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

.search-bar {
  margin-bottom: 20rpx;
}

.search-input {
  display: flex;
  align-items: center;
  background-color: var(--color-bg-card);
  border-radius: var(--radius-xl);
  padding: 16rpx 30rpx;
  box-shadow: var(--shadow-sm);
}

.search-icon {
  margin-right: 16rpx;
  font-size: var(--font-size-lg);
  flex-shrink: 0;
}

.search-field {
  flex: 1;
  font-size: var(--font-size-base);
  color: var(--color-text-primary);
  border: none;
  outline: none;
}

.search-clear {
  font-size: var(--font-size-base);
  color: var(--color-text-tertiary);
  padding: 8rpx 12rpx;
  flex-shrink: 0;
}

.search-results-hint {
  margin-top: 10rpx;
  padding-left: 30rpx;
  font-size: var(--font-size-sm);
  color: var(--color-primary);
}

.empty-tip {
  text-align: center;
  padding: 60rpx 0;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-base);
}

.restaurant-list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.restaurant-item {
  display: flex;
  background-color: var(--color-bg-card);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

.restaurant-image {
  width: 180rpx;
  height: 180rpx;
  flex-shrink: 0;
}

.restaurant-info {
  flex: 1;
  padding: 20rpx;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.restaurant-name {
  font-size: var(--font-size-lg);
  font-weight: bold;
  color: var(--color-text-primary);
}

.restaurant-tags {
  display: flex;
  gap: 12rpx;
}

.tag {
  font-size: var(--font-size-xs);
  color: var(--color-primary);
  border: 1rpx solid var(--color-primary);
  padding: 4rpx 12rpx;
  border-radius: var(--radius-sm);
}

.restaurant-meta {
  display: flex;
  align-items: center;
  gap: 20rpx;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.rating {
  color: var(--color-warning);
}
</style>
