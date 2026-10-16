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
// 世界语言（W3 · N1）：学习世界与门户人本世界同一观感 —— 同一组 --world-* 令牌
// （persona-world.css 为世界色唯一真源）＋ 同一份几何类映射（styles/world.css，共享单份）。
import '@styles/tokens/themes/persona-world.css'
import '@styles/world.css'

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
