<template>
  <keep-alive>
    <router-view />
  </keep-alive>
</template>

<script>
import { useAuthStore } from './store/auth.js'

export default {
  onLaunch: function () {
    console.log('App Launch')
    // Initialize auth state from persisted storage
    this._checkAuth()
  },
  onShow: function () {
    console.log('App Show')
  },
  onHide: function () {
    console.log('App Hide')
  },
  methods: {
    _checkAuth() {
      const authStore = useAuthStore()
      // Initialize dark mode first
      authStore.initDarkMode()

      // Delay navigation to avoid race with uni-app's initial routing
      setTimeout(() => {
        const pages = getCurrentPages()
        const currentRoute = pages.length > 0 ? pages[pages.length - 1].route : ''
        const authRoutes = ['pages/login/login', 'pages/login/register', 'pages/login/forgot-password']
        const isOnAuthPage = authRoutes.includes(currentRoute)

        if (authStore.isAuthenticated) {
          // User logged in — verify token freshness
          authStore.verifyToken().then((valid) => {
            if (!valid) {
              // Token expired, redirect to login
              if (!isOnAuthPage) {
                uni.reLaunch({ url: '/pages/login/login' })
              }
            } else if (isOnAuthPage) {
              // Already authenticated — navigate to index (tabBar page uses switchTab)
              uni.switchTab({ url: '/pages/index/index' })
            }
          })
        } else {
          // Not authenticated — redirect to login unless already on an auth page
          if (!isOnAuthPage) {
            uni.reLaunch({ url: '/pages/login/login' })
          }
        }
      }, 100)
    }
  }
}
</script>

<style>
/* ── GRI App 全局样式 ── */
/* 共享基础样式（reset/typography/utilities/tokens/components）已通过 main.js 导入 */
/* 这里只保留 uni-app 特定的 page 级别样式 */

@import "@styles/design.css";

page {
  background-color: var(--color-bg-primary);
  font-family: var(--font-sans);
  font-size: var(--font-size-base);
  color: var(--color-text-primary);
  line-height: var(--line-height-base);
}

/* uni-app 特定：rich-text 富文本内容 */
rich-text {
  word-break: break-all;
}
</style>
