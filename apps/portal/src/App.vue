<template>
  <view>
    <router-view />
  </view>
</template>

<script>
import { useAuthStore } from '@gri/auth-client'

export default {
  globalData: {
    // 统一经 nginx 网关 /api（M5 收敛）
    API_BASE_URL: import.meta.env.VITE_API_BASE_URL || ''
  },
  onLaunch() {
    console.log('GRI 组织管理台 Launch')
    useAuthStore().restore()
  },
  onShow() {
    console.log('GRI 组织管理台 Show')
    // 路由守卫：未登录访问业务页重定向到登录页（登录页自身跳过）
    const pages = getCurrentPages()
    const route = pages.length ? pages[pages.length - 1].route : ''
    if (!useAuthStore().isAuthenticated && !route.startsWith('pages/login/')) {
      uni.reLaunch({ url: '/pages/login/login' })
    }
  },
  onHide() {
    console.log('GRI 组织管理台 Hide')
  }
}
</script>

<style></style>