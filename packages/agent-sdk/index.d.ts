/** @gri/agent-sdk 类型声明（plain-JS ESM，供 TS 消费方）。 */

export declare const AGENT_API_PREFIX = '/api/v1/agent';
export declare const AGENT_API_VERSION = 1;

export interface AgentSdkErrorMeta {
  code?: string;
  status?: number | null;
  statusText?: string | null;
  url?: string | null;
  body?: any;
  cause?: any;
}

/** SDK 结构化错误（非 2xx / 超时 / 网络异常 / 入参非法）。 */
export declare class AgentSdkError extends Error {
  constructor(message: string, meta?: AgentSdkErrorMeta);
  name: 'AgentSdkError';
  /** 'HTTP_ERROR' | 'INVALID_ARGUMENT' | 'TIMEOUT' | 'NETWORK' | 'NO_FETCH' | 'AGENT_ERROR' | 'SDK_ERROR' */
  code: string;
  status: number | null;
  statusText: string | null;
  url: string | null;
  /** 解析后的错误响应体（可能为 null）。 */
  body: any;
  cause?: any;
}

/** 打开 agent 的返回（v1 `GET /api/v1/agent/me` 的 data）。 */
export interface AgentMe {
  success: boolean;
  entityId: string;
  kind?: string;
  status?: string;
  tools?: string[];
  skills?: string[];
  memoryDigest?: any;
  [k: string]: any;
}

/** 发消息的返回（v1 `POST /api/v1/agent/me/message` 的 data）。 */
export interface AgentMessageResult {
  success: boolean;
  message?: string;
  routeKey?: string;
  [k: string]: any;
}

/** 只读学情总览（v1 `GET /api/v1/agent/me/diagnosis` 的 data）。 */
export interface AgentDiagnosis {
  success: boolean;
  phase?: string;
  [k: string]: any;
}

/** CLI 后端清单项（v1 `GET /api/v1/agent/delegate/backends` 的 data.backends[i]）。 */
export interface AgentCliBackend {
  id: string;
  label: string;
  bin: string;
  timeoutMs?: number;
  resumeKey?: string | null;
}

/**
 * 外部 agent 运行记录（B-4；v1 `GET /api/v1/agent/delegate/runs[/:id]`）。
 * `error_code` 取值见 docs/AGENT_PUBLIC_CONTRACT.md §三（failed 必带其一）。
 */
export interface AgentRun {
  run_id: string;
  backend: string | null;
  goal: string | null;
  mode: 'sync' | 'async';
  resume_key: string | null;
  status: 'running' | 'done' | 'failed';
  error_code: string | null;
  summary: string | null;
  exit_code: number | null;
  timed_out: boolean;
  latency_ms: number | null;
  created_at: string;
  finished_at: string | null;
  [k: string]: any;
}

export interface CreateAgentClientOptions {
  /** 服务根（如 `https://gri.example.com`，不含 `/api`）；末尾 `/` 自动去除。 */
  baseUrl: string;
  /** Bearer token（RS256 JWT），由调用方注入。 */
  token: string;
  /** 请求超时（ms），默认 15000。 */
  timeoutMs?: number;
  /** 自定义 fetch（测试/代理场景）；默认 `globalThis.fetch`。 */
  fetch?: typeof fetch;
}

export interface AgentClient {
  baseUrl: string;
  apiPrefix: typeof AGENT_API_PREFIX;
  getMe(): Promise<AgentMe>;
  sendMessage(content: string, opts?: { routeKey?: string }): Promise<AgentMessageResult>;
  getDiagnosis(): Promise<AgentDiagnosis>;
  listBackends(): Promise<AgentCliBackend[]>;
  /** 本人外部 agent 最近 run 列表（B-4）。 */
  listRuns(opts?: { limit?: number }): Promise<AgentRun[]>;
  /** 单条 run（B-4）；他人/不存在 → AgentSdkError(code='RUN_NOT_FOUND', status=404)。 */
  getRun(runId: string): Promise<AgentRun | null>;
}

export declare function createAgentClient(opts: CreateAgentClientOptions): AgentClient;
