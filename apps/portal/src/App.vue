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
    // 路由守卫：登录/注册页公开，业务页必须登录。
    const pages = getCurrentPages()
    const route = pages.length ? pages[pages.length - 1].route : ''
    const publicRoutes = ['pages/login/login', 'pages/register/index']
    const isPublicRoute = publicRoutes.some((publicRoute) => route.startsWith(publicRoute))
    const auth = useAuthStore()

    if (!auth.isAuthenticated && !isPublicRoute) {
      uni.reLaunch({ url: '/pages/login/login' })
      return
    }

    if (auth.isAuthenticated && isPublicRoute) {
      uni.reLaunch({ url: '/pages/world/index' })
    }
  },
  onHide() {
    console.log('GRI 组织管理台 Hide')
  }
}
</script>

<style></style>
