/**
 * auth-center 端点契约适配。
 *
 * 默认指向 nginx 统一入口（阶段 A 已把 /auth/ 转发到 auth-center:3004）。
 * 三前端可显式注入 authBase（如直连 http://localhost:3004/auth 便于本地调试）。
 *
 * 契约（阶段 B 已交付）：
 *  - POST /auth/login     入参 {identifier, password} → {accessToken, refreshToken, expiresIn, user}
 *  - POST /auth/register  入参 {username, email, password, name?} → identity（无 token）
 *  - POST /auth/refresh   入参 {refreshToken} → {accessToken, refreshToken, expiresIn}
 *  - POST /auth/logout    入参 {refreshToken} → {message}
 *  - GET  /auth/me        Bearer → identity
 */

export function createEndpoints({ authBase = '/auth', fetchImpl } = {}) {
  // uniapp 下默认使用 uni.request；测试环境用注入的 fetchImpl 或全局 fetch
  const http = fetchImpl ?? defaultHttp();

  async function post(path, body, { authToken } = {}) {
    return http(`${authBase}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  async function get(path, { authToken } = {}) {
    return http(`${authBase}${path}`, {
      method: 'GET',
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    });
  }

  return {
    async login(identifier, password) {
      return post('/login', { identifier, password });
    },

    async register({ username, email, password, name }) {
      return post('/register', { username, email, password, name });
    },

    async refresh(refreshToken) {
      return post('/refresh', { refreshToken });
    },

    async logout(refreshToken, authToken) {
      return post('/logout', { refreshToken }, { authToken });
    },

    async me(authToken) {
      return get('/me', { authToken });
    },
  };
}

/** 默认请求实现：优先 uni.request，回退全局 fetch（node 18+ / 非 uni web） */
function defaultHttp() {
  if (typeof globalThis.uni !== 'undefined' && typeof globalThis.uni.request === 'function') {
    return (url, { method, headers, body }) =>
      new Promise((resolve, reject) => {
        globalThis.uni.request({
          url,
          method,
          header: headers,
          data: body ? JSON.parse(body) : undefined,
          success: (res) => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(res.data);
            } else {
              reject(Object.assign(new Error(res.data?.message || `HTTP ${res.statusCode}`), {
                status: res.statusCode,
                data: res.data,
              }));
            }
          },
          fail: (err) => reject(err),
        });
      });
  }

  if (typeof globalThis.fetch === 'function') {
    return async (url, { method, headers, body }) => {
      const res = await globalThis.fetch(url, { method, headers, body });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw Object.assign(new Error(data?.message || `HTTP ${res.status}`), {
          status: res.status,
          data,
        });
      }
      return data;
    };
  }

  throw new Error('[auth-client] 无可用请求实现：需注入 fetchImpl 或在 uni/web 环境运行');
}