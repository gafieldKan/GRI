import { createSSRApp } from 'vue'
import App from './App.vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
// 导入 GRI 共享样式系统 + AI Tutor 蓝主题
import '../../styles/index.css'
import '../../styles/tokens/themes/ai-tutor.css'

export function createApp() {
  const app = createSSRApp(App)

  // 统一 pinia 实例（修复此前 App.vue 里 `this._pinia = createPinia()` 未注册导致的
  // useXxxStore() 拿不到 active pinia 的问题）
  const pinia = createPinia()
  pinia.use(piniaPluginPersistedstate)
  app.use(pinia)

  return {
    app,
    pinia
  }
}