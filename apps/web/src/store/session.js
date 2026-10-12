/**
 * 跨模块统一会话桥（SSO）。
 *
 * 会话真源 = @gri/auth-client 的 `gri-auth-token`（同源 localStorage，
 * 值含 { accessToken, refreshToken, user }）。订餐端保留自建 store 的
 * UI 态（darkMode / loginMethod / activeProduct），仅把会话读写对齐到该键，
 * 以便与 portal / AI 辅导共享同一登录态，消除二次登录。
 *
 * 存储读写复用 auth-client 的 createStorage（uni.* → localStorage 兜底），
 * 保证键名与序列化格式与 auth-client 完全一致，不另造会话。
 */
import { createStorage } from '@gri/auth-client'

export const SHARED_AUTH_KEY = 'gri-auth-token'

// 统一登录入口（nginx / → portal 工作台；未登录由 portal 守卫送到登录页）。
export const PORTAL_ENTRY = '/'

const storage = createStorage()

/**
 * 读取共享登录态。订餐端 store 的 user 形状为 { id, ...externalId }，
 * 而 auth-client 的 user 为 { id, externalId, ... }，此处优先把业务主键
 * externalId 映射到 id，令订餐端既有 userId/userName getter 继续可用。
 * @returns {{ accessToken: string, refreshToken: string|null, user: object|null }|null}
 */
export function readSharedSession() {
  try {
    const saved = storage.get(SHARED_AUTH_KEY)
    if (!saved || !saved.accessToken) return null
    const user = saved.user
      ? { ...saved.user, id: saved.user.externalId || saved.user.id || null }
      : null
    return {
      accessToken: saved.accessToken,
      refreshToken: saved.refreshToken ?? null,
      user
    }
  } catch {
    return null
  }
}

/**
 * 写入共享登录态（键与格式对齐 auth-client）。
 * @param {{ accessToken: string, refreshToken?: string|null, user?: object|null }} session
 */
export function writeSharedSession({ accessToken, refreshToken = null, user = null }) {
  if (!accessToken) return
  try {
    storage.set(SHARED_AUTH_KEY, { accessToken, refreshToken, user })
  } catch {
    /* 存储不可用时忽略：不阻断本端登录 */
  }
}

/** 清除共享登录态（登出 / 会话失效时调用，供各端同步失效）。 */
export function clearSharedSession() {
  try {
    storage.remove(SHARED_AUTH_KEY)
  } catch {
    /* ignore */
  }
}

/** 跳转统一登录入口 portal（未登录模块端的唯一去向）。 */
export function redirectToPortal() {
  // H5：模块挂载在 /food|/tutor|/portal 子路径，uni.reLaunch('/') 会被 SPA base 解析回本模块，
  // 故用整页导航跳到网关根 `/`（portal 工作台 / 登录）。
  // #ifdef H5
  if (typeof window !== 'undefined' && window.location) {
    window.location.replace(PORTAL_ENTRY)
    return
  }
  // #endif
  try {
    uni.reLaunch({ url: PORTAL_ENTRY })
  } catch {
    /* ignore */
  }
}
