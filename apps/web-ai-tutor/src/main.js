import { createSSRApp } from 'vue'
import App from './App.vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import Toast from './components/ui/Toast.vue'
import Modal from './components/ui/Modal.vue'
import ErrorBoundary from './components/ErrorBoundary.vue'
import { setupGlobalErrorHandler } from './utils/errorHandler.js'

// 设计令牌真源（阶段 C 收口）：三前端统一 @styles/tokens
import '@styles/tokens/global.css'
import '@styles/tokens/themes/ai-tutor.css'
import '@styles/base/typography.css'

export function createApp() {
  const app = createSSRApp(App)

  const pinia = createPinia()
  pinia.use(piniaPluginPersistedstate)
  app.use(pinia)

  // 注册全局组件
  app.component('Toast', Toast)
  app.component('Modal', Modal)
  app.component('ErrorBoundary', ErrorBoundary)

  // 设置全局错误处理
  setupGlobalErrorHandler(app)

  return {
    app,
    pinia
  }
}
