/**
 * 存储抽象 —— auth-client 状态的持久化层。
 *
 * 三前端都是 uni-app，生产环境走 uni.* 同步存储 API；
 * 测试/非 uni 环境（node 跑单测）降级到内存 Map（不跨进程，但足以覆盖 store 单测）。
 *
 * 设计动机：`uni` 在 vitest/node 环境不存在，抽这一层让 store 逻辑可被单测。
 */

function detectUni() {
  return typeof globalThis.uni !== 'undefined'
    && typeof globalThis.uni.setStorageSync === 'function'
    && typeof globalThis.uni.getStorageSync === 'function';
}

function createMemoryStore() {
  const map = new Map();
  return {
    set: (k, v) => map.set(k, JSON.stringify(v)),
    get: (k) => {
      if (!map.has(k)) return null;
      return JSON.parse(map.get(k));
    },
    remove: (k) => map.delete(k),
  };
}

/**
 * 统一的同步存储接口。默认走 uni.*，非 uni 环境回退内存。
 * @returns {{ set: (key: string, value: any) => void, get: (key: string) => any|null, remove: (key: string) => void }}
 */
export function createStorage(impl) {
  if (impl) return impl;

  if (detectUni()) {
    return {
      set: (k, v) => globalThis.uni.setStorageSync(k, v),
      get: (k) => {
        try {
          return globalThis.uni.getStorageSync(k) || null;
        } catch {
          return null;
        }
      },
      remove: (k) => globalThis.uni.removeStorageSync(k),
    };
  }

  // H5 回退：uni-app H5 构建里 `window.uni` 只挂最小 API，setStorageSync/getStorageSync
  // 并不存在（detectUni 为假），若直接落到内存 Map，刷新页面即丢登录态。H5 平台的
  // uni.* 同步存储本身就是 localStorage 之上的一层，故此处直接以 localStorage 兜底，
  // 保证「刷新仍在登录态」；值以 JSON 序列化，与 uni.* 行为一致。
  if (typeof globalThis.localStorage !== 'undefined') {
    return {
      set: (k, v) => globalThis.localStorage.setItem(k, JSON.stringify(v)),
      get: (k) => {
        try {
          const raw = globalThis.localStorage.getItem(k);
          return raw === null ? null : JSON.parse(raw);
        } catch {
          return null;
        }
      },
      remove: (k) => globalThis.localStorage.removeItem(k),
    };
  }

  return createMemoryStore();
}