/**
 * 小程序版统一登录态 store —— 基于 @gri/auth-client 工厂实例化。
 *
 * 小程序与 web 一起经 nginx 网关：/auth 由 nginx 保留前缀转发 auth-center。
 * （不再直连 :3004，避免跨端 base 分歧；/api 统一走网关 → services/api。）
 *
 * ⚠️ mp-weixin 适配：uni-app 把源码里的裸 `uni.*` 编译成内部 import，**不**挂到
 * `globalThis`。而 @gri/auth-client 的默认探测读的是 `globalThis.uni` —— 到点为空，
 * 且它发生在模块求值期（顶层 createAuthStore），会直接抛「无可用请求实现」，
 * 连带整个登录页求值失败 → 白屏。故此处显式注入基于裸 `uni.*` 的请求/存储适配，
 * 绕开 globalThis 探测（同时也修好了登录态存储：否则会静默降级到内存）。
 */
import { createAuthStore } from '@gri/auth-client'

// 小程序无同源相对，必须绝对地址：构建期注入 <origin>/auth（如 https://localhost/auth）。
const AUTH_BASE = import.meta.env.VITE_AUTH_BASE_URL || '/auth'
// 注册收归单一后端编排入口（services/api）。小程序同样需绝对地址：构建期注入 <origin>
const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

/** 基于 uni.request 的请求适配（形参契约对齐 auth-client 的 http(url,{method,headers,body})） */
const uniHttp = (url, { method, headers, body }) =>
  new Promise((resolve, reject) => {
    uni.request({
      url,
      method,
      header: headers,
      data: body ? JSON.parse(body) : undefined,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
        } else {
          reject(Object.assign(new Error((res.data && res.data.message) || `HTTP ${res.statusCode}`), {
            status: res.statusCode,
            data: res.data
          }))
        }
      },
      fail: (err) => reject(err)
    })
  })

/** 基于 uni.* 同步存储的持久化适配 */
const uniStorage = {
  set: (k, v) => uni.setStorageSync(k, v),
  get: (k) => {
    try {
      return uni.getStorageSync(k) || null
    } catch {
      return null
    }
  },
  remove: (k) => uni.removeStorageSync(k)
}

export const useAuthStore = createAuthStore({
  authBase: AUTH_BASE,
  apiBase: API_BASE,
  fetchImpl: uniHttp,
  storage: uniStorage
})

export { authHeaders, requireAuth } from '@gri/auth-client'
