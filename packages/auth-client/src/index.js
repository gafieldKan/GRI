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
 *
 * ⚠️ 必须「惰性」实例化：createAuthStore() 内部会即时解析请求实现
 * （createEndpoints → defaultHttp）。若在模块求值期调用，在 mp-weixin
 * （裸 `uni.*` 不挂 globalThis、亦无 fetch）会直接抛「无可用请求实现」，
 * 令任何 `import '@gri/auth-client'` 的模块求值失败（连带白屏）。
 * 惰性化后仅在真正 useAuthStore() 时才建实例：H5（有 fetch）照常；
 * 小程序侧改用自带 fetchImpl 的实例，根本不会触碰这个默认单例。
 */
import { createAuthStore } from './store.js';

let _defaultUseAuthStore;
export function useAuthStore(...args) {
  if (!_defaultUseAuthStore) _defaultUseAuthStore = createAuthStore();
  return _defaultUseAuthStore(...args);
}