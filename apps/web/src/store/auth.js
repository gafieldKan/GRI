/**
 * Pinia Auth Store
 * 认证状态管理 — token, user profile, session management
 * Follows the same defineStore + persistedstate pattern as store/cart.js
 *
 * 阶段 C 收口说明：
 *  - 登录/注册/刷新/登出已切换到统一签发中心 auth-center（见 api/auth.js 字段映射
 *    {accessToken,refreshToken,user} → {token,refreshToken,user}），JWT 无状态，user 携带 externalId 业务主键。
 *  - 本 store 保留订餐端特有的 UI 态（darkMode / activeProduct / loginMethod / memberLevel），
 *    故未直接复用 @gri/auth-client 的 pinia store（两 AI 前端因其无 UI 态已完整接入）。
 *    统一登录态由 auth-center 契约 + JWT 保证；本 store 是其薄 UI 层。
 */

import { defineStore } from 'pinia'
import * as authApi from '../api/auth.js'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: null,
    refreshToken: null,
    user: null,
    // user shape: { id, username, email, phone, avatarUrl, memberLevel, status }
    isLoggedIn: false,
    loginMethod: null,   // 'email' | 'sms' | 'wechat' | 'alipay' | 'apple'
    activeProduct: 'restaurant', // 'restaurant' | 'ai-tutor' | 'lowcode'
    darkMode: false,
    // Track whether we've attempted initial auth restore
    _hydrated: false
  }),

  getters: {
    /**
     * Current user ID — returns null if not authenticated
     */
    userId(state) {
      return state.user?.id || null
    },

    /**
     * Display name for current user
     */
    userName(state) {
      return state.user?.username || ''
    },

    /**
     * Member level badge text
     */
    memberLevel(state) {
      return state.user?.memberLevel || '普通会员'
    },

    /**
     * Avatar URL with fallback
     */
    avatarUrl(state) {
      return state.user?.avatarUrl || 'https://picsum.photos/100/100?random=40'
    },

    /**
     * Is user authenticated with valid token?
     */
    isAuthenticated(state) {
      return state.isLoggedIn && !!state.token
    }
  },

  actions: {
    // ─── Login Actions ───

    /**
     * Set login state after successful authentication
     * @param {{ token: string, refreshToken?: string, user: object, method: string }} result
     */
    setLogin(result) {
      this.token = result.token
      this.refreshToken = result.refreshToken || null
      this.user = result.user
      this.isLoggedIn = true
      this.loginMethod = result.method || 'email'
      this._hydrated = true
    },

    /**
     * Full email/password login flow
     * @param {string} email
     * @param {string} password
     */
    async login(email, password) {
      const result = await authApi.login({ email, password })
      // result shape: { code: 200, data: { token, user } }
      if (result.code === 200 && result.data) {
        this.setLogin({
          token: result.data.token,
          refreshToken: result.data.refreshToken,
          user: result.data.user,
          method: 'email'
        })
      }
      return result
    },

    /**
     * SMS verification-code login flow
     * @param {string} phone
     * @param {string} code
     */
    async loginWithPhone(phone, code) {
      const result = await authApi.loginWithSMS({ phone, code })
      if (result.code === 200 && result.data) {
        this.setLogin({
          token: result.data.token,
          refreshToken: result.data.refreshToken,
          user: result.data.user,
          method: 'sms'
        })
      }
      return result
    },

    /**
     * WeChat mini-program login flow
     * @param {string} code — from uni.login()
     */
    async loginWithWeChat(code) {
      const result = await authApi.loginWithWeChat({ code })
      if (result.code === 200 && result.data) {
        this.setLogin({
          token: result.data.token,
          refreshToken: result.data.refreshToken,
          user: result.data.user,
          method: 'wechat'
        })
      }
      return result
    },

    // ─── Registration ───

    /**
     * Register and auto-login (or redirect to login page)
     * @param {{ username: string, email: string, phone?: string, password: string }} data
     */
    async register(data) {
      const result = await authApi.register(data)
      // Registration may or may not auto-login — depends on backend config
      if (result.code === 201 && result.data) {
        if (result.data.token) {
          this.setLogin({
            token: result.data.token,
            refreshToken: result.data.refreshToken,
            user: result.data.user,
            method: 'email'
          })
        }
      }
      return result
    },

    // ─── Token Verification ───

    /**
     * Verify current token validity
     * Returns false if token is expired/invalid
     */
    async verifyToken() {
      if (!this.token) return false
      try {
        const result = await authApi.verifyToken(this.token)
        if (!result.valid) {
          // Try refresh if we have a refresh token
          if (this.refreshToken) {
            return await this.refreshSession()
          }
          this.logout()
          return false
        }
        return true
      } catch {
        // Network error = don't log out (offline grace)
        return this.isLoggedIn
      }
    },

    /**
     * Refresh expired token using refresh token
     */
    async refreshSession() {
      if (!this.refreshToken) return false
      try {
        const result = await authApi.refreshAccessToken(this.refreshToken)
        if (result.code === 200 && result.data) {
          this.token = result.data.token
          this.refreshToken = result.data.refreshToken || this.refreshToken
          return true
        }
      } catch {
        // refresh failed
      }
      this.logout()
      return false
    },

    // ─── Profile ───

    /**
     * Fetch the latest user profile from the server
     */
    async fetchProfile() {
      if (!this.token) return
      try {
        const result = await authApi.getMe(this.token)
        if (result.code === 200 && result.data) {
          this.user = result.data
        }
      } catch {
        // Will retry on next onShow
      }
    },

    /**
     * Update local user profile
     * @param {object} updates
     */
    updateProfile(updates) {
      if (this.user) {
        Object.assign(this.user, updates)
      }
    },

    // ─── Logout ───

    /**
     * Clear all auth state and redirect to login
     */
    logout(silent = false) {
      // Try to inform server（吊销 refresh token）
      if (this.token) {
        authApi.logoutServer(this.token, this.refreshToken).catch(() => { /* non-fatal */ })
      }

      // Clear state
      this.token = null
      this.refreshToken = null
      this.user = null
      this.isLoggedIn = false
      this.loginMethod = null
      // Keep darkMode and activeProduct preferences

      // Clear legacy token in uni storage
      try {
        uni.removeStorageSync('token')
      } catch (e) { /* ignore */ }

      // Redirect to login page
      if (!silent) {
        uni.reLaunch({ url: '/pages/login/login' })
      }
    },

    // ─── Dark Mode ───

    /**
     * Toggle dark mode on/off, persist, and apply to DOM
     */
    toggleDarkMode() {
      this.darkMode = !this.darkMode
      this._applyDarkMode()
    },

    /**
     * Apply dark mode class to root element
     */
    _applyDarkMode() {
      // #ifdef H5
      if (this.darkMode) {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
      // #endif

      // #ifdef MP-WEIXIN
      // Mini-programs don't have document — darkMore is applied via
      // computed styles in components or via theme.css vars + class toggle
      uni.setStorageSync('theme', this.darkMode ? 'dark' : 'light')
      // #endif
    },

    /**
     * Initialize dark mode from persisted state (call in App.onLaunch)
     */
    initDarkMode() {
      this._applyDarkMode()
    }
  },

  // ─── Persistence to uni.storage ───
  persist: {
    key: 'gri-auth',
    storage: {
      getItem: (key) => {
        try {
          return uni.getStorageSync(key)
        } catch (e) {
          return null
        }
      },
      setItem: (key, value) => {
        try {
          uni.setStorageSync(key, value)
        } catch (e) {
          console.error('auth store persist failed:', e)
        }
      }
    },
    // Only persist these fields (don't persist _hydrated)
    paths: ['token', 'refreshToken', 'user', 'isLoggedIn', 'activeProduct', 'darkMode', 'loginMethod']
  }
})