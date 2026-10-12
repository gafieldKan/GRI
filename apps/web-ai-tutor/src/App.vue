<template>
  <view>
    <TwinIcons />
    <router-view />
  </view>
</template>

<script>
import { useAuthStore } from '@gri/auth-client'
import { useUserStore } from './store/user.js'
import TwinIcons from './components/twin/TwinIcons.vue'

// 统一登录入口 = portal（nginx / → 工作台；未登录由 portal 守卫送到登录/注册）。
const SHARED_AUTH_KEY = 'gri-auth-token'
const PORTAL_ENTRY = '/'

export default {
  components: { TwinIcons },
  globalData: {
    // 全局配置（M5 收敛：统一经 nginx 网关 /api；旧直连 :3003 已退役）
    API_BASE_URL: import.meta.env.VITE_API_BASE_URL || '',
    // 当前学习会话
    currentSession: null
  },
  onLaunch() {
    console.log('智学慧眼 App Launch')
    // 还原统一登录态，并把学生业务主键从 externalId 解出到 user store
    const auth = useAuthStore()
    auth.restore()
    useUserStore().syncFromAuth()
    // SSO：portal 登出/登录改写共享键 → 跨标签同步；登出即回 portal 登录。
    this._listenSharedSession()
  },
  onShow() {
    console.log('智学慧眼 App Show')
    // 路由守卫：未登录访问业务页 → 统一回 portal 登录（模块端不再自持登录入口）
    const auth = useAuthStore()
    auth.restore()
    const pages = getCurrentPages()
    const route = pages.length ? pages[pages.length - 1].route : ''
    if (!auth.isAuthenticated) {
      this._redirectToPortal()
    }
  },
  onHide() {
    console.log('智学慧眼 App Hide')
  },
  methods: {
    _redirectToPortal() {
      // H5：模块挂在 /tutor 子路径，uni.reLaunch('/') 会被 SPA base 解析回本模块，
      // 故用整页导航跳到网关根 `/`（portal 工作台 / 登录）。
      // #ifdef H5
      if (typeof window !== 'undefined' && window.location) {
        window.location.replace(PORTAL_ENTRY)
        return
      }
      // #endif
      uni.reLaunch({ url: PORTAL_ENTRY })
    },
    _listenSharedSession() {
      // #ifdef H5
      if (typeof window === 'undefined' || !window.addEventListener) return
      window.addEventListener('storage', (event) => {
        if (event.key !== SHARED_AUTH_KEY) return
        const auth = useAuthStore()
        // 共享键被移除/清空 = portal 已登出 → 本端同步失效
        if (event.newValue === null || event.newValue === '' || event.newValue === 'null') {
          auth._clear()
          this._redirectToPortal()
          return
        }
        // 共享键写入 = portal 已登录 → 只重置内存态再从共享键还原。
        // 不能先 `_clear()`：那会删除刚写入的 gri-auth-token，反向破坏 portal/web 会话。
        auth.$reset()
        auth.restore()
        if (!auth.isAuthenticated) {
          this._redirectToPortal()
        } else {
          useUserStore().syncFromAuth()
          uni.switchTab({ url: '/pages/index/index' })
        }
      })
      // #endif
    }
  }
}
</script>

<style>
/* 智学慧眼 App 全局样式 - 使用统一设计令牌（真源经 main.js 引入 @styles/tokens） */
page {
  background-color: var(--color-bg-primary);
  font-family: var(--font-sans);
  font-size: var(--font-size-base);
  color: var(--color-text-primary);
  line-height: var(--line-height-base);
}

/* 统一主题色变量 */
:root {
  --primary-color: var(--color-primary);
  --primary-color-light: var(--color-primary-hover);
  --primary-color-dark: var(--color-primary-active);
  --success-color: var(--color-success);
  --warning-color: var(--color-warning);
  --error-color: var(--color-danger);
}

/* 通用工具类 */
flex-center {
  display: flex;
  align-items: center;
  justify-content: center;
}

flex-between {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

flex-col {
  display: flex;
  flex-direction: column;
}

/* 通用卡片样式 */
teaching-card {
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--color-border);
  overflow: hidden;
}

card-header {
  display: flex;
  align-items: center;
  padding: 16px;
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-active) 100%);
  color: white;
}

card-icon {
  font-size: 24px;
  margin-right: 12px;
}

card-title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
}

card-content {
  padding: 16px;
}

content-section {
  margin-bottom: 20px;
}

section-title {
  display: block;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
  margin-bottom: 8px;
}

section-text {
  font-size: var(--font-size-base);
  line-height: 16;
  color: var(--color-text-primary);
}

formula-section {
  margin: 16px 0;
}

formula-box {
  text-align: center;
  padding: 16px;
  background: var(--color-bg-card);
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
}

formula-text {
  font-size: var(--font-size-xl);
  color: var(--color-primary);
}

examples-list {
  display: flex;
  flex-direction: column;
  gap: 8px
}

example-item {
  padding: 8px 12px;
  background: var(--color-bg-card);
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  margin-bottom: 8px;
}

example-text {
  font-size: var(--font-size-base);
  color: var(--color-text-secondary);
  line-height: 15;
}

warning {
  background: #fffbe6;
  border: 1px solid #ffd591;
  border-radius: var(--radius-sm);
  padding: 12px 16px;
}

mistake-item {
  margin-bottom: 8px;
  color: var(--color-warning);
}

mistake-text {
  font-size: var(--font-size-base);
  color: var(--color-text-secondary);
}

card-footer {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border);
  display: flex;
  justify-content: flex-end;
}

action-btn {
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-active) 100%);
  color: white;
  border: none;
  padding: 10px 24px;
  border-radius: var(--radius-md);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
}

action-btn:active {
  transform: scale(0.98);
}

/* Button components */
btn-primary {
  background-color: var(--color-primary);
  color: var(--color-bg-card);
  border: none;
  padding: 8px 16px;
  border-radius: var(--radius-md);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
}

btn-primary:hover {
  opacity: 0.9;
}

btn-danger {
  background-color: var(--color-danger);
  color: var(--color-bg-card);
  border: none;
  padding: 8px 16px;
  border-radius: var(--radius-md);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  cursor: pointer;
}

btn-danger:hover {
  opacity: 0.9;
}

/* Input styles */
input {
  width: 100%;
  padding: 8px 12px;
  font-size: var(--font-size-base);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  background-color: var(--color-bg-card);
  color: var(--color-text-primary);
}

input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
  outline: none;
}

input::placeholder {
  color: var(--color-text-tertiary);
}

input:disabled {
  background-color: var(--color-bg-secondary);
  color: var(--color-text-placeholder);
  cursor: not-allowed;
}

/* Card styles */
card {
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--color-border);
}

card-header {
  padding: 16px;
  border-bottom: 1px solid var(--color-border);
}

card-title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
}

card-content {
  padding: 16px;
}

/* Form styles */
form-item {
  margin-bottom: var(--spacing-md);
}

form-label {
  display: block;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-xs);
}

form-error {
  color: var(--color-danger);
  font-size: var(--font-size-sm);
  margin-top: var(--spacing-xs);
}

/* Utility classes */
flex-center {
  display: flex;
  align-items: center;
  justify-content: center;
}

flex-between {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

flex-col {
  display: flex;
  flex-direction: column;
}

text-center {
  text-align: center;
}

text-truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* Focus visible */
:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

/* Selection */
::selection {
  background-color: rgba(24, 144, 255, 0.2);
  color: var(--color-text-primary);
}

/* Scrollbar */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background-color: var(--color-text-tertiary);
  border-radius: var(--radius-round);
}

::-webkit-scrollbar-thumb:hover {
  background-color: var(--color-text-secondary);
}
</style>
