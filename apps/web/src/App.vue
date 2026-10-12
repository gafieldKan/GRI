<template>
  <keep-alive>
    <router-view />
  </keep-alive>
</template>

<script>
import { useAuthStore } from './store/auth.js'
import { SHARED_AUTH_KEY, redirectToPortal } from './store/session.js'

export default {
  onLaunch: function () {
    console.log('App Launch')
    // Initialize auth state from persisted storage
    this._checkAuth()
    // SSO：portal 登出/登录会改写共享键，跨标签同步会话（登出即回 portal 登录）。
    this._listenSharedSession()
  },
  onShow: function () {
    console.log('App Show')
  },
  onHide: function () {
    console.log('App Hide')
  },
  methods: {
    _listenSharedSession() {
      // #ifdef H5
      if (typeof window === 'undefined' || !window.addEventListener) return
      window.addEventListener('storage', (event) => {
        if (event.key !== SHARED_AUTH_KEY) return
        if (useAuthStore().syncFromSharedSession()) {
          const pages = getCurrentPages()
          const route = pages.length ? pages[pages.length - 1].route : ''
          if (route.startsWith('pages/login/')) uni.switchTab({ url: '/pages/index/index' })
          return
        }
        redirectToPortal()
      })
      // #endif
    },
    _checkAuth() {
      const authStore = useAuthStore()
      // Initialize dark mode first
      authStore.initDarkMode()
      // SSO：优先以共享会话键（gri-auth-token）为准还原登录态
      authStore.syncFromSharedSession()

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
              // Token expired → 回统一登录入口 portal
              redirectToPortal()
            } else if (isOnAuthPage) {
              // Already authenticated — navigate to index (tabBar page uses switchTab)
              uni.switchTab({ url: '/pages/index/index' })
            }
          })
        } else {
          // Not authenticated — 模块端不再自持登录页，统一回 portal 登录
          redirectToPortal()
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
