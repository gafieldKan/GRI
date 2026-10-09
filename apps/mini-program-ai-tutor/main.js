import { createSSRApp } from 'vue'
import App from './App.vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
// 设计令牌真源（阶段 C 收口）：与 web-ai-tutor 同源，只引 token + 排版。
// ⚠️ 不可引 styles/index.css —— 它经 base/reset.css 带入 `*, *::before, *::after {}`
// 通配选择器，WXSS 不支持，app.wxss 编译即报 `unexpected token *`。
// （reset 里的全局 border-box 由 App.vue 以显式元素列表复刻，见该文件。）
import '../../styles/tokens/global.css'
import '../../styles/tokens/themes/ai-tutor.css'
import '../../styles/base/typography.css'

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