/**
 * 小程序版统一登录态 store —— 基于 @gri/auth-client 工厂实例化。
 *
 * 小程序与 web 一起经 nginx 网关：相对 /auth 由 nginx /auth/ → auth-center 保留前缀。
 * （不再直连 :3004，避免跨端 base 分歧；/api 统一走网关 → services/api。）
 */
import { createAuthStore } from '@gri/auth-client'

const AUTH_BASE = '/auth'

export const useAuthStore = createAuthStore({ authBase: AUTH_BASE })

export { authHeaders, requireAuth } from '@gri/auth-client'