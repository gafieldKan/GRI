/**
 * Auth API Module — 对接统一签发中心（auth-center）
 *
 * 阶段 C 收口：认证从旧后端 opaque-token（/api/auth/*）切换到 auth-center（/auth/*）。
 * 契约（阶段 B 已交付）：
 *  - POST /auth/login     入参 {identifier, password} → {accessToken, refreshToken, expiresIn, user}
 *  - POST /api/auth/register  入参 {username, email, password, name?} → public.users 行（无 token，经 services/api 编排）
 *  - POST /auth/refresh   入参 {refreshToken} → {accessToken, refreshToken, expiresIn}
 *  - POST /auth/logout    入参 {refreshToken} → {message}
 *  - GET  /auth/me        Bearer → identity
 *
 * 为保持 store/auth.js 与 login/register 页面既有调用契约不变，
 * 本模块把 auth-center 的 {accessToken, refreshToken} 映射回旧形状 {code, data:{token, refreshToken, user}}。
 *
 * 基线：生产/统一网关经 nginx /auth/ 转发（阶段 A）；直连 auth-center:3004 仅纯本地兜底。
 */
const AUTH_BASE = import.meta.env.VITE_AUTH_BASE_URL || '/auth'
// 注册已收归单一后端编排入口（services/api 建 public.users → 服务间建 auth-center 身份）。
// 其余认证动作仍直连 auth-center（/auth/*）。
const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

/** 统一包装：把 auth-center 响应规约为 { code, data, message } */
async function request(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${AUTH_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) {
    const err = new Error(json?.message || `HTTP ${res.status}`)
    err.status = res.status
    err.data = json
    throw err
  }
  return json
}

/**
 * Login — identifier 为 email 或 username（auth-center 通用登录）
 * @param {{ email: string, password: string }} credentials
 * @returns {Promise<{ code: number, data: { token: string, refreshToken: string|null, user: object }, message?: string }>}
 */
export async function login({ email, password }) {
  try {
    // auth-center 通用 identifier 登录（email 或 username）
    const res = await request('/login', {
      method: 'POST',
      body: { identifier: email.trim(), password }
    })
    return {
      code: 200,
      data: {
        token: res.accessToken,
        refreshToken: res.refreshToken ?? null,
        user: res.user ?? null
      }
    }
  } catch (err) {
    console.warn('[GRI Dev] authAPI login:', err.message || 'auth-center offline')
    throw err
  }
}

/**
 * Register new account — auth-center 注册返回 identity（无 token），注册后需再走 login。
 * @param {{ username: string, email: string, phone?: string, password: string, name?: string }} data
 * @returns {Promise<{ code: number, data?: object, message?: string }>}
 */
export async function register(data) {
  try {
    // 统一注册入口：POST /api/auth/register（services/api 编排，非直连 auth-center）
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: data.username.trim(),
        email: data.email.trim(),
        password: data.password,
        name: data.name ?? undefined
      })
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      const err = new Error(json?.message || `HTTP ${res.status}`)
      err.status = res.status
      err.data = json
      throw err
    }
    // 注册成功不自动登录（服务端契约），返回码沿用页面判断的 201 语义
    return { code: 201, data: null }
  } catch (err) {
    console.warn('[GRI Dev] authAPI register:', err.message || 'api offline')
    throw err
  }
}

/**
 * Refresh access token — 轮转 refresh token 换新 access。
 * @param {string} refreshToken
 * @returns {Promise<{ code: number, data: { token: string, refreshToken: string } }>}
 */
export async function refreshAccessToken(refreshToken) {
  const res = await request('/refresh', {
    method: 'POST',
    body: { refreshToken }
  })
  return {
    code: 200,
    data: {
      token: res.accessToken,
      refreshToken: res.refreshToken ?? refreshToken
    }
  }
}

/**
 * Logout from server（吊销 refresh token）
 * @param {string} token — access token（授权头）
 * @param {string} [refreshToken] — 待吊销的 refresh token
 */
export async function logoutServer(token, refreshToken) {
  try {
    await request('/logout', {
      method: 'POST',
      token,
      body: { refreshToken }
    })
  } catch (err) {
    console.warn('[GRI Dev] authAPI logoutServer:', err.message)
    // 非致命：本地态照常清除
  }
  return null
}

/**
 * Fetch current user profile（JWT 解析身份）
 * @param {string} token — access token
 */
export async function getMe(token) {
  const user = await request('/me', { token })
  return { code: 200, data: user }
}

/**
 * Refresh session helper：包装 refreshAccessToken 为 store 期望的形状。
 * @deprecated 保留以兼容 store.refreshSession；实际走 refreshAccessToken
 */
export { refreshAccessToken as refresh }

/**
 * SMS 验证码登录 — auth-center v1 尚未提供，保留入口以免 import 断裂；
 * 页面应走密码登录或开发降级。未来接第三方短信后在此接入。
 */
export async function loginWithSMS() {
  throw new Error('SMS 登录暂未接入 auth-center v1')
}

/**
 * 微信小程序登录 — auth-center v1 尚未提供，保留入口；页面已有 dev 降级。
 */
export async function loginWithWeChat() {
  throw new Error('微信登录暂未接入 auth-center v1')
}

/**
 * 发送短信验证码 — auth-center v1 尚未提供。
 */
export async function sendVerificationCode() {
  throw new Error('短信验证码暂未接入 auth-center v1')
}

/**
 * 请求重置密码 — auth-center v1 尚未提供。
 */
export async function requestPasswordReset() {
  throw new Error('重置密码暂未接入 auth-center v1')
}

/**
 * 校验 access token 是否仍有效（本地授权头命中 /auth/me）。无效/过期触发刷新。
 * @param {string} token
 * @returns {Promise<{ valid: boolean }>}
 */
export async function verifyToken(token) {
  try {
    await request('/me', { token })
    return { valid: true }
  } catch (err) {
    return { valid: false, code: err.status || 0, message: err.message }
  }
}