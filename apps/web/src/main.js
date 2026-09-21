import { createSSRApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import App from './App.vue'
import './styles/tailwind.css'

export function createApp() {
  const app = createSSRApp(App)

  // 初始化 Pinia
  const pinia = createPinia()
  pinia.use(piniaPluginPersistedstate)
  app.use(pinia)

  // 挂载到全局以便 uni 生命周期钩子访问
  if (!uni.$store) {
    uni.$store = {}
  }

  return { app, pinia }
}