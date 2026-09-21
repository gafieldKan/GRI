<script>
import { useAuthStore } from './store/auth.js'
import { useUserStore } from './store/user.js'

export default {
  globalData: {
    // 全局配置 — 小程序经 nginx 网关 /api（统一；旧直连 :3003 已退役）
    API_BASE_URL: 'http://localhost',
    // 当前学习会话
    currentSession: null
  },
  onLaunch() {
    console.log('智学慧眼 小程序 Launch')
    // 还原统一登录态，解出学生业务主键
    const auth = useAuthStore()
    auth.restore()
    if (auth.externalId) {
      useUserStore().setStudent(auth.externalId, auth.user || {})
    }
  },
  onShow() {
    console.log('智学慧眼 小程序 Show')
    // 路由守卫：未登录访问业务页重定向到登录页（登录页自身跳过）
    const pages = getCurrentPages()
    const route = pages.length ? pages[pages.length - 1].route : ''
    if (!useAuthStore().isAuthenticated && !route.startsWith('pages/login/')) {
      uni.reLaunch({ url: '/pages/login/login' })
    }
  },
  onHide() {
    console.log('智学��眼 小程序 Hide')
  }
}
</script>

<style>
/* 智学��眼 小程序全局样式 - 使用统一设计令牌 */
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
  --error-color: var(--color-error);
}

/* 通用工具类 */
.flex-center {
  display: flex;
  align-items: center;
  justify-content: center;
}

.flex-between {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.flex-col {
  display: flex;
  flex-direction: column;
}

/* 通用卡片样式 */
.teaching-card {
  background: var(--color-bg-panel);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--color-border);
  overflow: hidden;
}

.card-header {
  display: flex;
  align-items: center;
  padding: 16px;
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-active) 100%);
  color: white;
}

.card-icon {
  font-size: 24px;
  margin-right: 12px;
}

.card-title {
  font-size: var(--font-heading-md);
  font-weight: var(--font-weight-bold);
}

.card-content {
  padding: 16px;
}

.content-section {
  margin-bottom: 20px;
}

.section-title {
  display: block;
  font-size: var(--font-heading-sm);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
  margin-bottom: 8px;
}

.section-text {
  font-size: var(--font-base);
  line-height: 1.6;
  color: var(--color-text-primary);
}

.formula-section {
  margin: 16px 0;
}

.formula-box {
  text-align: center;
  padding: 16px;
  background: var(--color-bg-base);
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
}

.formula-text {
  font-size: var(--font-heading-md);
  color: var(--color-primary);
}
</style>