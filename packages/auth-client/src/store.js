/**
 * @gri/auth-client 统一登录态 pinia store。
 *
 * 三前端复用：apps/web（订餐）、apps/web-ai-tutor（AI）、apps/mini-program-ai-tutor。
 * 契约对接 auth-center（identifier 通用登录 + JWT + refresh 轮转 + 登出）。
 */
import { defineStore } from 'pinia';
import { createEndpoints } from './endpoints.js';
import { createStorage } from './storage.js';

const STORAGE_KEY = 'gri-auth-token';

/**
 * 创建 auth store 定义（三前端在自己的 pinia 实例上注册）。
 *
 * @param {object} [opts]
 * @param {string} [opts.authBase='/auth'] auth-center 端点前缀（nginx /auth/ 或直连 http://localhost:3004/auth）
 * @param {object} [opts.storage] 注入存储实现（默认 uni.*；测试注入内存）
 * @param {function} [opts.fetchImpl] 注入请求实现（测试注入 mock）
 * @returns {function} useAuthStore()
 */
export function createAuthStore(opts = {}) {
  const endpoints = createEndpoints({
    authBase: opts.authBase ?? '/auth',
    fetchImpl: opts.fetchImpl,
  });
  const storage = createStorage(opts.storage);

  return defineStore('auth', {
    state: () => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      isLoggedIn: false,
      // 懒初始化：首次访问 storage 时还原（uni.getStorageSync 需运行时）
      _restored: false,
    }),

    getters: {
      /** 业务主键 = 原域 users.id / students.id（JWT external_id 语义） */
      externalId: (state) => state.user?.externalId ?? state.user?.id ?? null,
      userId: (state) => state.user?.id ?? null,
      isAuthenticated: (state) => state.isLoggedIn && !!state.accessToken,
    },

    actions: {
      /** 幂等还原持久化登录态（App.onLaunch / main 启动时调一次） */
      restore() {
        if (this._restored) return;
        try {
          const saved = storage.get(STORAGE_KEY);
          if (saved && saved.accessToken) {
            this.accessToken = saved.accessToken;
            this.refreshToken = saved.refreshToken ?? null;
            this.user = saved.user ?? null;
            this.isLoggedIn = true;
          }
        } catch {
          /* 存储损坏则视为未登录 */
        }
        this._restored = true;
      },

      _persist() {
        storage.set(STORAGE_KEY, {
          accessToken: this.accessToken,
          refreshToken: this.refreshToken,
          user: this.user,
        });
      },

      _clear() {
        storage.remove(STORAGE_KEY);
        this.accessToken = null;
        this.refreshToken = null;
        this.user = null;
        this.isLoggedIn = false;
      },

      /** 登录：identifier 为 email 或 username */
      async login(identifier, password) {
        const res = await endpoints.login(identifier, password);
        this.accessToken = res.accessToken;
        this.refreshToken = res.refreshToken ?? null;
        this.user = res.user ?? null;
        this.isLoggedIn = true;
        this._persist();
        return res;
      },

      async register(payload) {
        // auth-center 注册返回 identity（无 token）；注册后需再走 login 拿 token
        return endpoints.register(payload);
      },

      /** 用 refresh token 换新 access（轮转）；失败则登出 */
      async refresh() {
        if (!this.refreshToken) return false;
        try {
          const res = await endpoints.refresh(this.refreshToken);
          this.accessToken = res.accessToken;
          this.refreshToken = res.refreshToken ?? this.refreshToken;
          this._persist();
          return true;
        } catch {
          this._clear();
          return false;
        }
      },

      /** 登出：通知服务端吊销 refresh，清本地 */
      async logout() {
        try {
          if (this.refreshToken) {
            await endpoints.logout(this.refreshToken, this.accessToken);
          }
        } catch {
          /* 网络失败不阻断本地登出 */
        }
        this._clear();
      },

      /** 拉取最新用户档案 */
      async fetchMe() {
        if (!this.accessToken) return null;
        try {
          const user = await endpoints.me(this.accessToken);
          this.user = user;
          this._persist();
          return user;
        } catch {
          return null;
        }
      },
    },
  });
}

/** 授权头辅助：三前端 axios/fetch 拦截器用它注入 Authorization */
export function authHeaders(state) {
  return state?.accessToken ? { Authorization: `Bearer ${state.accessToken}` } : {};
}

/**
 * 路由守卫：未登录则跳登录页。
 * @param {object} store pinia auth store 实例
 * @param {string} [loginUrl='/pages/login/login']
 * @param {object} [nav] 导航实现（默认 uni.redirectTo；测试注入 mock）
 */
export function requireAuth(store, loginUrl = '/pages/login/login', nav) {
  const go = nav ?? (typeof globalThis.uni !== 'undefined'
    ? (url) => globalThis.uni.redirectTo({ url })
    : () => {});
  return function guard() {
    store.restore?.();
    if (!store.isAuthenticated) {
      go(loginUrl);
      return false;
    }
    return true;
  };
}