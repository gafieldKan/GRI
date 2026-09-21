/**
 * @gri/auth-client —— GRI 三前端统一登录态共享包。
 *
 * 导出 createAuthStore（pinia store 工厂）、authHeaders（授权头注入）、
 * requireAuth（路由守卫）、createStorage（存储抽象）。
 *
 * 用法（uni-app + vue3 + pinia 前端）：
 *   // main.js
 *   import { createAuthStore } from '@gri/auth-client'
 *   const useAuthStore = createAuthStore({ authBase: '/auth' })
 *   app.config.globalProperties.$useAuthStore = useAuthStore
 *
 *   // 组件内
 *   const auth = useAuthStore()
 *   await auth.login('alice@example.com', 'password')
 */
export { createAuthStore, authHeaders, requireAuth } from './store.js';
export { createStorage } from './storage.js';
export { createEndpoints } from './endpoints.js';

/**
 * 默认单例 store —— 三前端统一复用同一个 '@gri/auth-client 登录态'。
 * 若某前端需要自定义 authBase / 存储 / 请求实现，仍可用 createAuthStore 自行实例化。
 */
import { createAuthStore } from './store.js';
export const useAuthStore = createAuthStore();