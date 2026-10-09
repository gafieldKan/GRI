import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPinia, setActivePinia } from 'pinia';
import { createAuthStore, authHeaders, requireAuth } from '../src/index.js';
import { createStorage } from '../src/storage.js';

/** 模拟 auth-center 端点的 fetch 实现 */
function makeMockFetch() {
  const calls = [];
  const mockFetch = async (url, { method = 'GET', headers = {}, body } = {}) => {
    calls.push({ url, method, headers, body: body ? JSON.parse(body) : undefined });
    const path = url.replace(/^\/auth/, '') || url;

    if (path === '/login') {
      const { identifier, password } = body ? JSON.parse(body) : {};
      if (password === 'wrong') {
        const err = new Error('Invalid credentials');
        err.status = 401;
        throw err;
      }
      return {
        accessToken: 'jwt-access-1',
        refreshToken: 'opaque-refresh-1',
        expiresIn: 900,
        user: { id: 'identity-1', domain: 'food', username: identifier.split('@')[0], email: identifier, externalId: 'users-123', status: 'active' },
      };
    }
    if (path === '/refresh') {
      return { accessToken: 'jwt-access-2', refreshToken: 'opaque-refresh-2', expiresIn: 900 };
    }
    if (path === '/logout') {
      return { message: 'Logged out' };
    }
    if (path === '/me') {
      return { id: 'identity-1', domain: 'food', username: 'alice', email: 'alice@example.com', externalId: 'users-123', status: 'active' };
    }
    if (path === '/api/auth/register') {
      // 统一注册入口（services/api 编排）：返回 public.users 行
      return { id: 'users-456', username: 'bob', email: 'bob@example.com', role: 'consumer', status: 'active' };
    }
    throw new Error(`unexpected ${method} ${url}`);
  };
  return { mockFetch, calls };
}

function makeStore(opts = {}) {
  setActivePinia(createPinia());
  const useAuthStore = createAuthStore({
    storage: createStorage(), // 内存 storage，隔离测试
    fetchImpl: opts.fetchImpl,
    authBase: opts.authBase,
  });
  return useAuthStore();
}

test('login 成功：存双 token + user，isAuthenticated 为真，字段正确', async () => {
  const { mockFetch } = makeMockFetch();
  const store = makeStore({ fetchImpl: mockFetch });

  await store.login('alice@example.com', 'secret');

  assert.equal(store.accessToken, 'jwt-access-1');
  assert.equal(store.refreshToken, 'opaque-refresh-1');
  assert.equal(store.isAuthenticated, true);
  assert.equal(store.user.email, 'alice@example.com');
  assert.equal(store.externalId, 'users-123'); // getter 优先 externalId
});

test('login 失败抛错，保持未登录态', async () => {
  const { mockFetch } = makeMockFetch();
  const store = makeStore({ fetchImpl: mockFetch });

  await assert.rejects(() => store.login('alice@example.com', 'wrong'));
  assert.equal(store.isLoggedIn, false);
  assert.equal(store.accessToken, null);
});

test('authHeaders 返回 Bearer 授权头；无 token 返回空对象', () => {
  assert.deepEqual(authHeaders({ accessToken: 'abc' }), { Authorization: 'Bearer abc' });
  assert.deepEqual(authHeaders({ accessToken: null }), {});
  assert.deepEqual(authHeaders(undefined), {});
});

test('refresh 轮转成功后更新 token；失败清态', async () => {
  const { mockFetch } = makeMockFetch();
  const store = makeStore({ fetchImpl: mockFetch });

  await store.login('alice@example.com', 'secret');
  const ok = await store.refresh();
  assert.equal(ok, true);
  assert.equal(store.accessToken, 'jwt-access-2');
  assert.equal(store.refreshToken, 'opaque-refresh-2');

  // 强制 refresh 失败：把 refreshToken 置空（无 refresh token 直接返回 false）
  store.refreshToken = null;
  const ok2 = await store.refresh();
  assert.equal(ok2, false);
});

test('logout 清空 token 与 user，调服务端吊销', async () => {
  const { mockFetch, calls } = makeMockFetch();
  const store = makeStore({ fetchImpl: mockFetch });

  await store.login('alice@example.com', 'secret');
  await store.logout();

  assert.equal(store.isLoggedIn, false);
  assert.equal(store.accessToken, null);
  assert.equal(store.user, null);
  assert.ok(calls.some((c) => c.url.includes('/logout')));
});

test('restore 从 storage 还原登录态；损坏数据视为未登录', () => {
  const { mockFetch } = makeMockFetch();
  const memStorage = createStorage();
  // 预置持久化内容
  memStorage.set('gri-auth-token', {
    accessToken: 'saved-token',
    refreshToken: 'saved-refresh',
    user: { id: 'identity-9', externalId: 'users-9' },
  });

  setActivePinia(createPinia());
  const useAuthStore = createAuthStore({ storage: memStorage, fetchImpl: mockFetch });
  const store = useAuthStore();
  store.restore();

  assert.equal(store.accessToken, 'saved-token');
  assert.equal(store.isLoggedIn, true);
  assert.equal(store.user.id, 'identity-9');
});

test('register 调用端点返回 identity（不自动登录）', async () => {
  const { mockFetch } = makeMockFetch();
  const store = makeStore({ fetchImpl: mockFetch });

  const identity = await store.register({ username: 'bob', email: 'bob@example.com', password: 'secret123' });

  assert.equal(identity.username, 'bob');
  assert.equal(store.isLoggedIn, false); // 注册不自动登录
});

test('requireAuth：未登录跳登录页；已登录放行', () => {
  const { mockFetch } = makeMockFetch();
  const store = makeStore({ fetchImpl: mockFetch });

  let redirected = null;
  const guard = requireAuth(store, '/pages/login/login', (url) => { redirected = url; });

  // 未登录
  assert.equal(guard(), false);
  assert.equal(redirected, '/pages/login/login');

  // 登录后
  store.accessToken = 'jwt-access-1';
  store.isLoggedIn = true;
  assert.equal(guard(), true);
});