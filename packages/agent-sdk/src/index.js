/**
 * @gri/agent-sdk —— GRI 业务 agent 的**薄 HTTP 客户端**（B-2 目标 2）。
 *
 * 定位：外部项目/程序接入 GRI agent 的唯一推荐入口。只讲 HTTP，**不 import `@gri/agent-core`**
 *   （外部项目不该被拖入底座/服务端实现）；**零运行时依赖**（Node ≥18 原生 fetch）。
 *
 * 契约：对接 `services/api` 的 `/api/v1/agent/*`（版本化对外面，见 docs/AGENT_PUBLIC_CONTRACT.md）。
 *   - `GET  /api/v1/agent/me`                   → 打开我的 agent（工具/技能/记忆摘要）
 *   - `POST /api/v1/agent/me/message`           → 发消息 `{content, routeKey?}` → 回复
 *   - `GET  /api/v1/agent/me/diagnosis`         → 只读学情总览
 *   - `GET  /api/v1/agent/delegate/backends`    → 只读：本机可用 CLI 后端
 *
 * 错误语义：**绝不吞错**。非 2xx → 抛 `AgentSdkError`（含 status/code/url/body）；
 *   超时 → `code='TIMEOUT'`；网络异常 → `code='NETWORK'`。鉴权 token 由调用方注入，
 *   本包不读 env、不硬编码任何密钥。
 *
 * 用法：
 *   import { createAgentClient } from '@gri/agent-sdk';
 *   const agent = createAgentClient({ baseUrl: 'https://gri.example.com', token });
 *   const me = await agent.getMe();
 *   const reply = await agent.sendMessage('什么是光合作用', { routeKey: 'default' });
 */

/** v1 契约路径前缀（与 services/api 的 `@Controller('v1/agent')` + 全局前缀 `api` 对齐）。 */
export const AGENT_API_PREFIX = '/api/v1/agent';

/** 契约版本（响应体 `v` 字段应与之相等）。 */
export const AGENT_API_VERSION = 1;

const DEFAULT_TIMEOUT_MS = 15000;

/**
 * SDK 结构化错误。字段稳定，便于调用方分支处理（不解析 message 文本）。
 */
export class AgentSdkError extends Error {
  /**
   * @param {string} message 人类可读信息（**不含**任何密钥/token）
   * @param {{code?: string, status?: number|null, statusText?: string|null, url?: string|null, body?: any, cause?: any}} [meta]
   */
  constructor(message, meta = {}) {
    super(message);
    this.name = 'AgentSdkError';
    this.code = meta.code ?? 'SDK_ERROR';
    this.status = meta.status ?? null;
    this.statusText = meta.statusText ?? null;
    this.url = meta.url ?? null;
    this.body = meta.body ?? null;
    if (meta.cause) this.cause = meta.cause;
  }
}

/** @param {any} v */
function isEnvelope(v) {
  return !!v && typeof v === 'object' && typeof v.v === 'number' && typeof v.success === 'boolean';
}

/** 解开 v1 信封：成功取 `data`；`success:false`（理论上是 2xx 软失败）按错误抛。 */
function unwrap(env, url) {
  if (!isEnvelope(env)) return env;
  if (env.success === false) {
    const err = env.error ?? {};
    throw new AgentSdkError(err.message ?? 'agent 返回失败', { code: err.code ?? 'AGENT_ERROR', url, body: env });
  }
  return env.data;
}

/**
 * 创建 agent 客户端。
 * @param {{baseUrl: string, token: string, timeoutMs?: number, fetch?: typeof fetch}} opts
 *   - `baseUrl` 服务根（如 `https://gri.example.com`，**不含** `/api`）；末尾 `/` 自动去除。
 *   - `token`   Bearer token（RS256 JWT），**由调用方注入**；本包不读 env、不落盘。
 *   - `timeoutMs` 可选，默认 15000。
 *   - `fetch`   可选，注入自定义 fetch（测试/小程序/代理场景）；默认取 `globalThis.fetch`。
 */
export function createAgentClient(opts = {}) {
  const baseUrl = String(opts.baseUrl ?? '').replace(/\/+$/, '');
  if (!baseUrl) throw new AgentSdkError('baseUrl 必填（服务根，如 https://host）', { code: 'INVALID_ARGUMENT' });
  const token = typeof opts.token === 'string' ? opts.token : '';
  if (!token.trim()) throw new AgentSdkError('token 必填（由调用方注入）', { code: 'INVALID_ARGUMENT' });
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? Number(opts.timeoutMs) : DEFAULT_TIMEOUT_MS;
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new AgentSdkError('无可用 fetch（需 Node ≥18，或显式传入 opts.fetch）', { code: 'NO_FETCH' });
  }

  /**
   * 发一次请求并归一化错误。返回解析后的 JSON 体（可能为 null）。
   */
  async function request(method, path, body) {
    const url = baseUrl + AGENT_API_PREFIX + path;
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
    /** @type {Record<string, any>} */
    const init = { method, headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    let timer = null;
    if (timeoutMs > 0 && typeof AbortController === 'function') {
      const controller = new AbortController();
      init.signal = controller.signal;
      timer = setTimeout(() => controller.abort(), timeoutMs);
    }

    let res;
    try {
      res = await fetchImpl(url, init);
    } catch (cause) {
      const aborted = !!cause && (cause.name === 'AbortError' || cause.code === 'ABORT_ERR');
      throw new AgentSdkError(aborted ? `请求超时（${timeoutMs}ms）` : `网络错误：${cause?.message ?? cause}`, {
        code: aborted ? 'TIMEOUT' : 'NETWORK',
        url,
        cause,
      });
    } finally {
      if (timer) clearTimeout(timer);
    }

    const text = typeof res.text === 'function' ? await res.text() : '';
    let parsed = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
    }

    if (!(res.status >= 200 && res.status < 300)) {
      const errBody = parsed ?? (text ? { raw: text } : null);
      const code = errBody?.error?.code ?? 'HTTP_ERROR';
      const message = errBody?.error?.message ?? `${res.status} ${res.statusText ?? ''}`.trim();
      throw new AgentSdkError(message, {
        code,
        status: res.status,
        statusText: res.statusText ?? null,
        url,
        body: errBody,
      });
    }
    return parsed;
  }

  return {
    /** 实际服务根（去尾斜杠后）。 */
    baseUrl,
    /** 契约前缀。 */
    apiPrefix: AGENT_API_PREFIX,

    /** 打开我的 agent（工具/技能/记忆摘要）。 */
    async getMe() {
      return unwrap(await request('GET', '/me'), baseUrl + AGENT_API_PREFIX + '/me');
    },

    /** 发消息 → 回复。@param {string} content @param {{routeKey?: string}} [o] */
    async sendMessage(content, o = {}) {
      if (typeof content !== 'string' || !content.trim()) {
        throw new AgentSdkError('content 必填且非空', { code: 'INVALID_ARGUMENT' });
      }
      const body = { content };
      if (o && o.routeKey) body.routeKey = o.routeKey;
      return unwrap(await request('POST', '/me/message', body), baseUrl + AGENT_API_PREFIX + '/me/message');
    },

    /** 只读学情总览。 */
    async getDiagnosis() {
      return unwrap(await request('GET', '/me/diagnosis'), baseUrl + AGENT_API_PREFIX + '/me/diagnosis');
    },

    /** 只读：本机可用 CLI 后端（无则空数组）。 */
    async listBackends() {
      const data = unwrap(await request('GET', '/delegate/backends'), baseUrl + AGENT_API_PREFIX + '/delegate/backends');
      return data?.backends ?? [];
    },
  };
}
