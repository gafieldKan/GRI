<template>
  <view class="container">
    <!-- 概览指标卡 -->
    <view class="overview-grid" v-if="!loading">
      <view class="metric-card" v-for="m in metrics" :key="m.label">
        <text class="metric-label">{{ m.label }}</text>
        <text class="metric-value" :style="{ color: m.color }">{{ m.value }}</text>
      </view>
    </view>
    <view class="loading-tip" v-else>
      <text>数据加载中...</text>
    </view>

    <!-- 订单趋势 -->
    <view class="section">
      <view class="section-title">📈 订单趋势（近 7 天）</view>
      <view class="trend-chart" v-if="trends.length">
        <view class="bar-col" v-for="(t, i) in trends" :key="i">
          <text class="bar-value">{{ t.orderCount }}</text>
          <view class="bar" :style="{ height: barHeight(t.orderCount) }" />
          <text class="bar-label">{{ t.date }}</text>
        </view>
      </view>
      <view class="empty" v-else>暂无订单数据</view>
    </view>

    <!-- 热销商品 -->
    <view class="section">
      <view class="section-title">🔥 热销商品 TOP10</view>
      <view class="rank-item" v-for="(p, i) in topProducts" :key="i">
        <text class="rank-idx">{{ i + 1 }}</text>
        <text class="rank-name">{{ p.name }}</text>
        <text class="rank-sales">{{ p.sales }} 份</text>
        <text class="rank-amount">¥{{ (p.amount || 0).toFixed(2) }}</text>
      </view>
      <view class="empty" v-if="!topProducts.length">暂无销售数据</view>
    </view>

    <!-- 商家订单分布 -->
    <view class="section">
      <view class="section-title">🏪 商家订单分布</view>
      <view class="dist-item" v-for="(r, i) in regionDist" :key="i">
        <text class="dist-name">{{ r.name }}</text>
        <view class="dist-track">
          <view class="dist-fill" :style="{ width: distWidth(r.value) }" />
        </view>
        <text class="dist-value">{{ r.value }}</text>
      </view>
      <view class="empty" v-if="!regionDist.length">暂无分布数据</view>
    </view>

    <!-- 用户增长 -->
    <view class="section">
      <view class="section-title">👥 用户增长</view>
      <view class="funnel-item" v-for="(f, i) in userFunnel" :key="i">
        <text class="funnel-month">{{ f.month }}</text>
        <text class="funnel-count">{{ f.count }} 人</text>
      </view>
      <view class="empty" v-if="!userFunnel.length">暂无用户数据</view>
    </view>
  </view>
</template>

<script>
import {
  getDashboardOverview,
  getOrdersTrend,
  getRegionDistribution,
  getTopProducts,
  getUserFunnel
} from '../../api/dashboard'

export default {
  data() {
    return {
      loading: true,
      metrics: [],
      trends: [],
      topProducts: [],
      regionDist: [],
      userFunnel: []
    }
  },
  onLoad() {
    this.fetchAll()
  },
  onPullDownRefresh() {
    this.fetchAll().then(() => uni.stopPullDownRefresh())
  },
  methods: {
    async fetchAll() {
      this.loading = true
      const [overview, trend, region, products, funnel] = await Promise.allSettled([
        getDashboardOverview(),
        getOrdersTrend(),
        getRegionDistribution(),
        getTopProducts(),
        getUserFunnel()
      ])

      if (overview.status === 'fulfilled') {
        const d = overview.value || {}
        this.metrics = [
          { label: '今日订单', value: d.todayOrders ?? 0, color: '#1890ff' },
          { label: '今日营收', value: '¥' + (d.todayRevenue ?? 0).toFixed(2), color: '#52c41a' },
          { label: '今日新增用户', value: d.todayUsers ?? 0, color: '#722ed1' },
          { label: '商家总数', value: d.totalMerchants ?? 0, color: '#fa8c16' },
          { label: '未营业商家', value: d.pendingMerchants ?? 0, color: '#ff4d4f' },
          { label: '客单价', value: '¥' + (d.avgOrderValue ?? 0).toFixed(2), color: '#13c2c2' }
        ]
      }

      this.trends = trend.status === 'fulfilled' ? (trend.value || []) : []
      this.regionDist = region.status === 'fulfilled' ? (region.value || []) : []
      this.topProducts = products.status === 'fulfilled' ? (products.value || []) : []
      this.userFunnel = funnel.status === 'fulfilled' ? (funnel.value || []) : []

      this.loading = false
    },
    barHeight(count) {
      const max = Math.max(...this.trends.map(t => t.orderCount), 1)
      return Math.max(8, Math.round((count / max) * 120)) + 'px'
    },
    distWidth(value) {
      const max = Math.max(...this.regionDist.map(r => r.value), 1)
      return Math.max(4, Math.round((value / max) * 100)) + '%'
    }
  }
}
</script>

<style>
.container {
  min-height: 100vh;
  padding: 20rpx;
  background-color: var(--color-bg-primary);
  box-sizing: border-box;
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16rpx;
  margin-bottom: 24rpx;
}

.metric-card {
  background-color: var(--color-bg-card);
  border-radius: var(--radius-md);
  padding: 20rpx;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  box-shadow: var(--shadow-sm);
}

.metric-label {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.metric-value {
  font-size: var(--font-size-xl);
  font-weight: bold;
}

.loading-tip, .empty {
  padding: 60rpx 0;
  text-align: center;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-base);
}

.section {
  background-color: var(--color-bg-card);
  border-radius: var(--radius-lg);
  padding: 24rpx;
  margin-bottom: 24rpx;
  box-shadow: var(--shadow-sm);
}

.section-title {
  font-size: var(--font-size-lg);
  font-weight: bold;
  color: var(--color-text-primary);
  margin-bottom: 24rpx;
}

.trend-chart {
  display: flex;
  align-items: flex-end;
  justify-content: space-around;
  height: 220rpx;
  padding: 20rpx 0;
}

.bar-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
}

.bar {
  width: 36rpx;
  background-color: var(--color-primary);
  border-radius: 6rpx 6rpx 0 0;
}

.bar-value {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.bar-label {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.rank-item {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 16rpx 0;
  border-bottom: 1rpx solid var(--color-border-light);
}

.rank-item:last-child { border-bottom: none; }

.rank-idx {
  width: 40rpx;
  height: 40rpx;
  line-height: 40rpx;
  text-align: center;
  border-radius: 50%;
  background-color: var(--color-primary);
  color: var(--color-text-inverse);
  font-size: var(--font-size-xs);
  flex-shrink: 0;
}

.rank-name {
  flex: 1;
  font-size: var(--font-size-base);
  color: var(--color-text-primary);
}

.rank-sales {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.rank-amount {
  font-size: var(--font-size-sm);
  color: var(--color-danger);
  font-weight: bold;
}

.dist-item {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 12rpx 0;
}

.dist-name {
  width: 180rpx;
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
}

.dist-track {
  flex: 1;
  height: 20rpx;
  background-color: var(--color-bg-primary);
  border-radius: 10rpx;
  overflow: hidden;
}

.dist-fill {
  height: 100%;
  background-color: var(--color-primary);
  border-radius: 10rpx;
}

.dist-value {
  width: 60rpx;
  text-align: right;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  flex-shrink: 0;
}

.funnel-item {
  display: flex;
  justify-content: space-between;
  padding: 16rpx 0;
  border-bottom: 1rpx solid var(--color-border-light);
}

.funnel-item:last-child { border-bottom: none; }

.funnel-month {
  font-size: var(--font-size-base);
  color: var(--color-text-primary);
}

.funnel-count {
  font-size: var(--font-size-base);
  color: var(--color-primary);
  font-weight: bold;
}
</style>