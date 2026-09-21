<template>
  <view class="container">
    <!-- 用户信息 -->
    <view class="user-header">
      <image class="avatar" :src="userInfo.avatar" mode="aspectFill" />
      <view class="user-info">
        <text class="username">{{ userInfo.username }}</text>
        <text class="user-desc">会员等级：普通会员</text>
      </view>
    </view>

    <!-- 功能列表 -->
    <view class="menu-list">
      <view class="menu-item" v-for="(item, index) in menuItems" :key="index" @click="handleClick(item.path)">
        <text class="menu-icon">{{ item.icon }}</text>
        <text class="menu-title">{{ item.title }}</text>
        <text class="menu-arrow">›</text>
      </view>
    </view>

    <!-- 退出登录 -->
    <button class="logout-btn" @click="handleLogout">退出登录</button>
  </view>
</template>

<script>
export default {
  data() {
    return {
      userInfo: {
        username: '用户 123',
        avatar: 'https://picsum.photos/100/100?random=40'
      },
      menuItems: [
        { title: '数据大屏', icon: '📊', path: '/pages/dashboard/index' },
        { title: '我的收藏', icon: '❤️', path: '/pages/favorite/favorite' },
        { title: '收货地址', icon: '📍', path: '/pages/address/address' },
        { title: '优惠券', icon: '🎫', path: '/pages/coupon/coupon' },
        { title: '会员中心', icon: '👑', path: '/pages/vip/vip' },
        { title: '客服中心', icon: '🎧', path: '/pages/service/service' },
        { title: '关于我们', icon: 'ℹ️', path: '/pages/about/about' }
      ]
    }
  },
  methods: {
    handleClick(path) {
      if (path === '/pages/dashboard/index') {
        uni.navigateTo({ url: path })
        return
      }
      console.log('点击', path)
    },
    handleLogout() {
      uni.showModal({
        title: '提示',
        content: '确定要退出登录吗？',
        success: (res) => {
          if (res.confirm) {
            uni.showToast({
              title: '已退出登录',
              icon: 'success'
            })
          }
        }
      })
    }
  }
}
</script>

<style>
.container {
  background-color: var(--color-bg-primary);
  min-height: 100vh;
}

.user-header {
  display: flex;
  align-items: center;
  padding: 40rpx 30rpx;
  background: var(--color-primary-gradient);
  color: var(--color-text-inverse);
}

.avatar {
  width: 120rpx;
  height: 120rpx;
  border-radius: 50%;
  border: 4rpx solid rgba(255, 255, 255, 0.3);
}

.user-info {
  margin-left: 30rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.username {
  font-size: var(--font-size-xl);
  font-weight: bold;
}

.user-desc {
  font-size: var(--font-size-sm);
  opacity: 0.8;
}

.menu-list {
  margin-top: 20rpx;
  background-color: var(--color-bg-card);
  border-radius: var(--radius-lg);
}

.menu-item {
  display: flex;
  align-items: center;
  padding: 30rpx;
  border-bottom: 1rpx solid var(--color-border-light);
}

.menu-item:last-child {
  border-bottom: none;
}

.menu-icon {
  font-size: var(--font-size-2xl);
  margin-right: 20rpx;
}

.menu-title {
  flex: 1;
  font-size: var(--font-size-base);
  color: var(--color-text-primary);
}

.menu-arrow {
  font-size: var(--font-size-2xl);
  color: var(--color-border);
}

.logout-btn {
  margin-top: 40rpx;
  background-color: var(--color-danger);
  color: var(--color-text-inverse);
  border-radius: 30rpx;
  font-size: var(--font-size-base);
}
</style>
