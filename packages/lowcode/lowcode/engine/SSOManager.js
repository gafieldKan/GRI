/**
 * 单点登录 (SSO) 管理器
 * 支持 OAuth2、SAML、LDAP 等认证协议
 *
 * @author GRI Team
 * @version 1.0
 */

import { EventEmitter } from 'events'

/**
 * 认证协议枚举
 */
export const AuthProtocol = {
  OAUTH2: 'oauth2',
  OAUTH2_PKCE: 'oauth2-pkce',
  SAML: 'saml',
  LDAP: 'ldap',
  OIDC: 'oidc',
  CAS: 'cas',
}

/**
 * 登录状态枚举
 */
export const LoginStatus = {
  LOGGED_OUT: 'logged_out',
  LOGGING_IN: 'logging_in',
  LOGGED_IN: 'logged_in',
  EXPIRED: 'expired',
  ERROR: 'error',
}

/**
 * SSO 配置类
 */
export class SSOConfig {
  constructor(config = {}) {
    this.protocol = config.protocol || AuthProtocol.OAUTH2
    this.authorizeUrl = config.authorizeUrl || ''
    this.tokenUrl = config.tokenUrl || ''
    this.userInfoUrl = config.userInfoUrl || ''
    this.clientId = config.clientId || ''
    this.clientSecret = config.clientSecret || ''
    this.redirectUri = config.redirectUri || ''
    this.scope = config.scope || 'openid profile email'
    this.responseType = config.responseType || 'code'
    this.logoutUrl = config.logoutUrl || ''
    this.samlEntryPoint = config.samlEntryPoint || ''
    this.ldapServer = config.ldapServer || ''
    this.ldapBaseDN = config.ldapBaseDN || ''
  }
}

/**
 * 用户信息类
 */
export class UserInfo {
  constructor(data = {}) {
    this.id = data.id || ''
    this.username = data.username || ''
    this.email = data.email || ''
    this.name = data.name || ''
    this.avatar = data.avatar || ''
    this.roles = data.roles || []
    this.permissions = data.permissions || []
    this.attributes = data.attributes || {}
  }
}

/**
 * Token 信息类
 */
export class TokenInfo {
  constructor(data = {}) {
    this.accessToken = data.accessToken || ''
    this.refreshToken = data.refreshToken || ''
    this.expiresIn = data.expiresIn || 3600
    this.tokenType = data.tokenType || 'Bearer'
    this.scope = data.scope || ''
    this.expiresAt = data.expiresAt || Date.now() + this.expiresIn * 1000
  }

  isExpired() {
    return Date.now() >= this.expiresAt - 60000 // 提前 1 分钟过期
  }

  getRemainingTime() {
    return Math.max(0, this.expiresAt - Date.now())
  }
}

/**
 * SSO 管理器主类
 */
class SSOManagerClass extends EventEmitter {
  constructor() {
    super()
    this.config = null
    this.status = LoginStatus.LOGGED_OUT
    this.user = null
    this.token = null
    this.state = null
    this.codeVerifier = null
  }

  /**
   * 初始化 SSO 配置
   */
  init(config) {
    this.config = new SSOConfig(config)
    this.#loadFromStorage()
    this.emit('init', { config: this.config })
    return this
  }

  /**
   * 开始 OAuth2 登录流程
   */
  async login(options = {}) {
    if (!this.config) {
      throw new Error('请先初始化 SSO 配置')
    }

    this.status = LoginStatus.LOGGING_IN
    this.emit('login:start')

    try {
      switch (this.config.protocol) {
        case AuthProtocol.OAUTH2:
        case AuthProtocol.OAUTH2_PKCE:
          await this.#oauth2Login(options)
          break
        case AuthProtocol.OIDC:
          await this.#oidcLogin(options)
          break
        case AuthProtocol.SAML:
          await this.#samlLogin(options)
          break
        case AuthProtocol.LDAP:
          await this.#ldapLogin(options)
          break
        case AuthProtocol.CAS:
          await this.#casLogin(options)
          break
        default:
          throw new Error(`不支持的认证协议：${this.config.protocol}`)
      }
    } catch (error) {
      this.status = LoginStatus.ERROR
      this.emit('login:error', { error })
      throw error
    }
  }

  /**
   * OAuth2 登录
   */
  async #oauth2Login(options) {
    const { protocol, clientId, redirectUri, scope, responseType, authorizeUrl } = this.config

    // 生成 state 防止 CSRF
    this.state = this.#generateState()

    // PKCE 模式生成 code_verifier
    let codeChallenge = ''
    if (protocol === AuthProtocol.OAUTH2_PKCE) {
      this.codeVerifier = this.#generateCodeVerifier()
      codeChallenge = await this.#generateCodeChallenge(this.codeVerifier)
    }

    // 构建授权 URL
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: scope,
      response_type: responseType,
      state: this.state,
      ...(codeChallenge && { code_challenge: codeChallenge, code_challenge_method: 'S256' }),
    })

    // 重定向到授权页面
    window.location.href = `${authorizeUrl}?${params.toString()}`
  }

  /**
   * OIDC 登录
   */
  async #oidcLogin(options) {
    // OIDC 基于 OAuth2，使用相同流程
    await this.#oauth2Login(options)
  }

  /**
   * SAML 登录
   */
  async #samlLogin(options) {
    const { samlEntryPoint } = this.config

    if (!samlEntryPoint) {
      throw new Error('SAML 入口 URL 未配置')
    }

    // 创建 SAML 请求表单
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = samlEntryPoint

    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = 'SAMLRequest'
    input.value = this.#generateSAMLRequest()

    form.appendChild(input)
    document.body.appendChild(form)
    form.submit()
  }

  /**
   * LDAP 登录
   */
  async #ldapLogin(options) {
    const { ldapServer, ldapBaseDN } = this.config
    const { username, password } = options

    if (!username || !password) {
      throw new Error('LDAP 登录需要用户名和密码')
    }

    // 模拟 LDAP 认证
    this.emit('ldap:authenticating', { username, ldapServer })

    // 实际场景需要调用后端 LDAP 服务
    const response = await fetch('/api/auth/ldap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        server: ldapServer,
        baseDN: ldapBaseDN,
        username,
        password,
      }),
    })

    if (!response.ok) {
      throw new Error('LDAP 认证失败')
    }

    const result = await response.json()
    await this.#handleAuthSuccess(result)
  }

  /**
   * CAS 登录
   */
  async #casLogin(options) {
    const { authorizeUrl } = this.config
    window.location.href = authorizeUrl
  }

  /**
   * 处理登录回调（OAuth2）
   */
  async handleCallback(callbackUrl) {
    const url = new URL(callbackUrl || window.location.href)
    const params = new URLSearchParams(url.search)

    const code = params.get('code')
    const state = params.get('state')
    const error = params.get('error')

    // 检查错误
    if (error) {
      throw new Error(`认证失败：${error}`)
    }

    // 验证 state
    if (state !== this.state) {
      throw new Error('State 验证失败，可能存在 CSRF 攻击')
    }

    if (!code) {
      throw new Error('未获取到授权码')
    }

    // 用授权码换取 Token
    await this.#exchangeToken(code)
  }

  /**
   * 用授权码换取 Token
   */
  async #exchangeToken(code) {
    const { tokenUrl, clientId, clientSecret, redirectUri } = this.config

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        ...(this.codeVerifier && { code_verifier: this.codeVerifier }),
      }).toString(),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Token 交换失败：${error}`)
    }

    const data = await response.json()
    await this.#handleAuthSuccess(data)
  }

  /**
   * 处理认证成功
   */
  async #handleAuthSuccess(tokenData) {
    // 保存 Token
    this.token = new TokenInfo({
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresIn: tokenData.expires_in,
      tokenType: tokenData.token_type,
      scope: tokenData.scope,
    })

    // 获取用户信息
    await this.#fetchUserInfo()

    // 更新状态
    this.status = LoginStatus.LOGGED_IN
    this.#saveToStorage()

    this.emit('login:success', { user: this.user, token: this.token })
  }

  /**
   * 获取用户信息
   */
  async #fetchUserInfo() {
    const { userInfoUrl } = this.config

    if (!userInfoUrl || !this.token?.accessToken) {
      return
    }

    try {
      const response = await fetch(userInfoUrl, {
        headers: {
          Authorization: `${this.token.tokenType} ${this.token.accessToken}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        this.user = new UserInfo({
          id: data.id || data.sub,
          username: data.username || data.preferred_username,
          email: data.email,
          name: data.name,
          avatar: data.picture || data.avatar,
          roles: data.roles || [],
          permissions: data.permissions || [],
        })
      }
    } catch (error) {
      console.warn('获取用户信息失败:', error)
    }
  }

  /**
   * 刷新 Token
   */
  async refreshToken() {
    if (!this.token?.refreshToken) {
      throw new Error('没有刷新 Token')
    }

    const { tokenUrl, clientId, clientSecret } = this.config

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.token.refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    })

    if (!response.ok) {
      throw new Error('刷新 Token 失败')
    }

    const data = await response.json()
    this.token = new TokenInfo({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      tokenType: data.token_type,
      scope: data.scope,
    })

    this.#saveToStorage()
    this.emit('token:refresh', { token: this.token })

    return this.token
  }

  /**
   * 登出
   */
  logout(options = {}) {
    const { logoutUrl } = this.config

    // 清除本地状态
    this.status = LoginStatus.LOGGED_OUT
    this.user = null
    this.token = null
    this.state = null
    this.codeVerifier = null
    this.#clearStorage()

    this.emit('logout', options)

    // 重定向到 SSO 登出
    if (logoutUrl && options.redirect !== false) {
      window.location.href = logoutUrl
    }
  }

  /**
   * 检查登录状态
   */
  isLoggedIn() {
    return this.status === LoginStatus.LOGGED_IN && !this.token?.isExpired()
  }

  /**
   * 获取 Token
   */
  getToken() {
    return this.token?.accessToken
  }

  /**
   * 获取用户信息
   */
  getUser() {
    return this.user
  }

  /**
   * 获取登录状态
   */
  getStatus() {
    return this.status
  }

  // ==================== 私有方法 ====================

  #generateState() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36)
  }

  #generateCodeVerifier() {
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    return Array.from(array)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }

  async #generateCodeChallenge(verifier) {
    const encoder = new TextEncoder()
    const data = encoder.encode(verifier)
  const hash = btoa(String.fromCharCode(...new Uint8Array(digest)))
  return hash.replace(/[+/=]/g, (m) => (m === "+" ? "-" : m === "/" ? "_" : ""))
  }

  #generateSAMLRequest() {
    // 简化实现，实际需要生成完整的 SAML 请求
    return btoa(`<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" />`)
  }

  #saveToStorage() {
    if (typeof localStorage === 'undefined') return

    if (this.token) {
      localStorage.setItem('sso_token', JSON.stringify(this.token))
    }
    if (this.user) {
      localStorage.setItem('sso_user', JSON.stringify(this.user))
    }
    localStorage.setItem('sso_status', this.status)
  }

  #loadFromStorage() {
    if (typeof localStorage === 'undefined') return

    try {
      const tokenStr = localStorage.getItem('sso_token')
      const userStr = localStorage.getItem('sso_user')
      const status = localStorage.getItem('sso_status')

      if (tokenStr) {
        this.token = new TokenInfo(JSON.parse(tokenStr))
      }
      if (userStr) {
        this.user = new UserInfo(JSON.parse(userStr))
      }
      if (status) {
        this.status = status
      }
    } catch (error) {
      console.warn('从存储加载 SSO 信息失败:', error)
    }
  }

  #clearStorage() {
    if (typeof localStorage === 'undefined') return

    localStorage.removeItem('sso_token')
    localStorage.removeItem('sso_user')
    localStorage.removeItem('sso_status')
  }
}

// 导出单例
export const ssoManager = new SSOManagerClass()

// 导出工具函数
export function createSSOManager() {
  return new SSOManagerClass()
}

export default ssoManager
