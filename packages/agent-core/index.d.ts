/** @gri/agent-core 类型声明（plain-JS ESM，供 TS 消费方）。 */

export interface Store {
  query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount?: number | null }>;
}

export interface LlmMessage {
  role: string;
  content: string;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema?: Record<string, any>;
  execute(ctx: any, args: Record<string, any>): Promise<any>;
  category?: string;
}

export declare function makeTool(def: Partial<Tool> & { name: string }): Tool;

export declare function storeFrom(query: Store['query']): Store;

export declare class ToolRegistry {
  register(tool: Partial<Tool> & { name: string }): this;
  registerAll(tools: Array<Partial<Tool> & { name: string }>): this;
  has(name: string): boolean;
  list(): Array<Pick<Tool, 'name' | 'description' | 'inputSchema'>>;
  get(name: string): Tool | null;
  call(ctx: any, name: string, args?: Record<string, any>, opts?: { onRun?: (audit: any) => void }): Promise<any>;
}

export interface LlmConfig {
  provider?: string;
  model?: string;
  multimodalModel?: string;
  baseUrl?: string;
  apiKey?: string;
  /** provider='cli' 时 = 外部 agent 后端 id（claude-code/codex/openclaw/hermes）；其余恒 null（B-3b）。 */
  cliBackend?: string | null;
  source?: 'route' | 'env' | 'cred' | 'route+cred' | 'route:cli';
  /** LLM 单次调用超时（ms）；透传 LlmClient。缺省 = LlmClient 默认 60000。 */
  timeoutMs?: number;
}

/** 每 routeKey 的密文凭据读取器（底座 CredentialStore 的形状；ModelRouter 只依赖 get）。 */
export interface CredentialReader {
  get(routeKey: string): Promise<{ apiKey: string; keyVersion?: number } | null>;
}

export declare class ModelRouter {
  constructor(store: Store, env?: Record<string, string | undefined> | null, credentials?: CredentialReader | null);
  resolve(routeKey?: string): Promise<LlmConfig>;
  isRealKey(routeKey?: string): Promise<boolean>;
  list(): Promise<any[]>;
  set(route: Record<string, any>): Promise<boolean>;
}

/** AES-256-GCM 封装：master key 由宿主注入（底座不读 env）。 */
export interface Cipher {
  algo: string;
  keyVersion: number;
  encrypt(plaintext: string): { ciphertext: Buffer; iv: Buffer; authTag: Buffer };
  decrypt(sealed: { ciphertext: Buffer | Uint8Array; iv: Buffer | Uint8Array; authTag: Buffer | Uint8Array }): string;
}

export declare function makeCipher(masterKey: Buffer | Uint8Array, opts?: { keyVersion?: number }): Cipher;

/** 凭据存储（agent.llm_credentials，密文）：明文永不落库、永不外传；解密失败 fail-fast。 */
export declare class CredentialStore {
  constructor(deps: { cipher: Cipher; query: Store['query'] });
  readonly algo: string;
  readonly keyVersion: number;
  get(routeKey: string): Promise<{ apiKey: string; keyVersion: number } | null>;
  set(routeKey: string, plaintext: string, opts?: { updatedBy?: string | null }): Promise<{ ok: boolean; hint: string }>;
  remove(routeKey: string): Promise<boolean>;
  meta(routeKey: string): Promise<{ has_key: boolean; hint: string | null; keyVersion: number | null; updatedAt: any; updatedBy: any }>;
}

/** hint = 后 4 位（短 key 全掩）。 */
export declare function hintOf(plaintext: string): string;

export declare class LlmClient {
  constructor(
    resolveConfig: (routeKey: string, opts?: { multimodal?: boolean }) => Promise<LlmConfig>,
    cliBackends?: CliBackendRegistry | null,
  );
  isRealKey(routeKey?: string): Promise<boolean>;
  chat(messages: LlmMessage[], routeKey?: string, opts?: Record<string, any>): Promise<{ content: string; usage?: any; toolCalls?: any }>;
  chatMultimodal(imageDataUrl: string, text: string, routeKey?: string, opts?: Record<string, any>): Promise<{ content: string; usage?: any }>;
  parseJSON(raw: any): any;
  validateAnswer(question: any, studentAnswer: any): any;
}

export declare class MemoryStore {
  constructor(store: Store, opts?: { ttlDays?: number; maxFacts?: number });
  get(entityId: string, factKey: string): Promise<any>;
  set(entityId: string, factKey: string, value: any, strength?: number): Promise<boolean>;
  delete(entityId: string, factKey: string): Promise<boolean>;
  list(entityId: string, opts?: { limit?: number }): Promise<any[]>;
  digest(entityId: string, opts?: { limit?: number }): Promise<string>;
}

export interface Skill {
  name: string;
  description: string;
  tools: Array<Tool | Record<string, any>>;
  instructions: string;
  enabled?: boolean;
}

export declare function parseSkillMarkdown(md: string): { name: string; description: string; tools: string[]; instructions: string };

export declare class SkillRegistry {
  register(def: Partial<Skill> & { name: string }): this;
  registerAll(defs: Array<Partial<Skill> & { name: string }>): this;
  has(name: string): boolean;
  get(name: string): Skill | null;
  list(opts?: { includeDisabled?: boolean }): Skill[];
  instructionsBlock(): string;
  mountTools(registry: ToolRegistry): this;
  registerMarkdown(md: string): this;
}

export interface AgentCoreDeps {
  router: ModelRouter;
  store: Store;
  tools: ToolRegistry;
  skills: SkillRegistry;
  memory: MemoryStore;
  persona?: string;
  defaultResponder?: (ctx: any, opts: any) => Promise<any>;
  onRun?: (audit: any) => void;
  /** 外部 CLI 后端注册表（B-3b）；缺省 null → CLI 路由无后端 → chat 明确抛错（不静默降级）。 */
  cliBackends?: CliBackendRegistry | null;
  /** LLM 单次调用超时（ms）；透传 LlmClient。不传 = 默认 60000（零回归）。 */
  llmTimeoutMs?: number;
  /** 记忆摘要小标题（底座保持业务中立，缺省 '## 记忆'；宿主注入业务文案）。 */
  memoryHeading?: string;
}

export declare class AgentCore implements EnginePort {
  constructor(deps: AgentCoreDeps);
  /** EnginePort 身份（默认引擎 'gri-core'）。 */
  id: string;
  apiVersion: string;
  capabilities: EngineCapabilities;
  listTools(): Array<Pick<Tool, 'name' | 'description' | 'inputSchema'>>;
  listSkills(): Skill[];
  run(params: {
    entityId: string;
    sessionId?: string | null;
    history?: LlmMessage[];
    userMessage: string;
    routeKey?: string;
    opts?: Record<string, any>;
  }): Promise<any>;
}

/** 可换引擎契约（双轨：抽象端口 + 可换引擎）。见 src/engine-port.js。 */
export interface EngineCapabilities {
  /** 'host' = 工具环在 GRI；'engine' = 工具环在引擎。 */
  toolLoop: 'host' | 'engine';
  streaming: boolean;
  needsApiKey: boolean;
  subagents: boolean;
  multimodal: boolean;
}

export interface EnginePort {
  id: string;
  apiVersion: string;
  capabilities: EngineCapabilities;
  run(ctx: Record<string, any>): Promise<any>;
  listTools(): any[];
  listSkills(): any[];
}

export declare const ENGINE_API_VERSION: string;

export declare class EnginePortError extends Error {
  code: string;
}

export declare function defineEnginePort(spec: {
  id: string;
  apiVersion?: string;
  capabilities?: Partial<EngineCapabilities>;
  run: (ctx: Record<string, any>) => Promise<any>;
  listTools?: () => any[];
  listSkills?: () => any[];
}): Readonly<EnginePort>;

export declare function isEnginePort(x: unknown): x is EnginePort;

export declare class EngineRegistry {
  constructor(engines?: EnginePort[]);
  register(engine: EnginePort): this;
  has(id: string): boolean;
  get(id: string): EnginePort | null;
  list(): Array<Pick<EnginePort, 'id' | 'apiVersion' | 'capabilities'>>;
}

export declare class McpClient {
  constructor(store: Store, opts?: Record<string, any>);
  connect(): Promise<boolean>;
  listTools(serverName?: string): Promise<any[]>;
  callTool(serverName: string, toolName: string, args: any): Promise<{ ok: boolean; text: string; isError: boolean }>;
  disconnect(): Promise<boolean>;
}
export declare function listMcpServers(store: Store): Promise<any[]>;
/** 把 agent.mcp_servers（enabled）的 MCP 工具桥成 Tool 数组，供 ToolRegistry.registerAll。 */
export declare function bridgeMcpTools(store: Store): Promise<Tool[]>;

/** 进程级共享 MCP 连接池：跨消息复用同一 server 连接，空闲超时回收。 */
export declare class McpPool {
  constructor(store: Store, opts?: { idleTtlMs?: number; autoPrune?: boolean });
  bridgeTools(): Promise<Tool[]>;
  pruneIdle(): Promise<void>;
  disconnect(): Promise<void>;
  stats: { connections: number; calls: number; pruned: number };
}

export declare class AcpAdapter {
  constructor(agentCore: AgentCore, opts?: Record<string, any>);
  asTool(): Tool | null;
}

// ─── 外部 agent 后端端口（CliBackendRegistry，B-3a）──────────────────────────
// 第二类模型后端：把本机已装 CLI agent（claude/codex/openclaw/hermes）当可委派推理后端。
// 只描述 argv 与解析，不碰 apiKey/token、不读 env、不 import 业务。

/** 单行/整体解析产物：text 覆盖累加，append=true 表示追加（纯文本后端）。 */
export interface CliParseResult {
  text?: string;
  sessionId?: string;
  append?: boolean;
  /** B-4：该行归一化出的运行期事件（逐条冒泡；只含 child 派生内容）。 */
  events?: CliBackendEvent[];
}

/** 运行期事件 kind（B-4 反馈回路）。 */
export type CliBackendEventKind = 'started' | 'tool_use' | 'assistant_delta' | 'result' | 'error';

/** 运行期事件：只含 child 派生内容（文本/工具名/sessionId），**不含** argv/prompt/密钥。 */
export interface CliBackendEvent {
  kind: CliBackendEventKind;
  data: Record<string, any> | null;
}

/** 一个 CLI 后端 = 声明式描述（不含密钥）。 */
export interface CliBackend {
  id: string;
  label: string;
  bin: string;
  resumeKey?: string | null;
  timeoutMs?: number;
  buildArgs(input: { prompt: string; cwd?: string; resumeKey?: string }): string[];
  parseLine(line: string, state?: { text: string; sessionId: string | null }): CliParseResult | null;
  /** 整体 stdout 解析（openclaw 多行 JSON 信封等非逐行可析者用）。 */
  parseOutput?(stdout: string): { text?: string; sessionId?: string; error?: string } | null;
  /** 显式放权（allowDangerous）时才追加的危险旗标。 */
  dangerousFlags?: string[];
}

/** run() 返回形状（stderr 已截断 ≤512B；零明文）。 */
export interface CliRunResult {
  text: string;
  sessionId: string | null;
  exitCode: number;
  stderr: string;
  pid: number | null;
  timedOut: boolean;
  error: string | null;
  signal?: string | null;
}

/** 危险放权旗标清单（C3）。 */
export declare const DENYLIST: ReadonlyArray<string>;
/** 运行期事件 kind 取值集（B-4）。 */
export declare const CLI_EVENT_KINDS: ReadonlyArray<CliBackendEventKind>;
/** 查 argv 首个命中 DENYLIST/危险前缀族的 token，无则 null。 */
export declare function findDeniedArg(args: string[]): string | null;

export declare const claudeCodeBackend: CliBackend;
export declare const codexBackend: CliBackend;
export declare const openclawBackend: CliBackend;
export declare const hermesBackend: CliBackend;
/** 四内置后端按 id 索引（`BACKENDS['claude-code']`）。 */
export declare const BACKENDS: Readonly<Record<string, CliBackend>>;

export declare class CliBackendRegistry {
  constructor(backends?: CliBackend[] | Record<string, CliBackend>);
  register(backend: CliBackend): this;
  registerAll(backends: CliBackend[] | Record<string, CliBackend>): this;
  has(id: string): boolean;
  get(id: string): CliBackend | null;
  list(): Array<Pick<CliBackend, 'id' | 'label' | 'bin' | 'timeoutMs' | 'resumeKey'>>;
  /** 只读问答执行器：spawn（shell:false/detached）→ 行流式解析 → 超时杀进程组。 */
  run(
    id: string,
    opts: {
      prompt: string;
      cwd?: string;
      timeoutMs?: number;
      allowDangerous?: boolean;
      resumeKey?: string;
      /** B-4：运行期事件回调（started/tool_use/assistant_delta/result/error），逐条回调；抛错被吞。 */
      onEvent?: (kind: CliBackendEventKind, data: Record<string, any>) => void;
    },
  ): Promise<CliRunResult>;
}

/** 建预装四内置后端的注册表（可再追加自定义后端；撞名抛错）。 */
export declare function createCliBackendRegistry(
  extra?: CliBackend[] | Record<string, CliBackend>,
): CliBackendRegistry;
/** 进程级默认注册表。 */
export declare const cliBackends: CliBackendRegistry;

// ─── 委派工具（agent.delegate，B-3c）────────────────────────────────────────
// 接入点②「派活儿」：agent 调 agent.delegate 把**独立子任务**交给外部 agent，父只拿**摘要**。
// 底座侧只做工具工厂：不 import 业务、不读 env、不碰 apiKey/token；CLI 只经 cliBackends。

/** 默认 cwd 白名单（GRI 工作树；可由宿主配置扩）。 */
export declare const DEFAULT_DELEGATE_CWD_ALLOWLIST: ReadonlyArray<string>;

/** cwd 白名单判定（越界明确拒绝，不静默）。 */
export declare function resolveDelegateCwd(
  cwd: string | null | undefined,
  cwdAllowlist?: string[],
): { ok: true; cwd: string } | { ok: false; error: string };

/**
 * 造 `agent.delegate` 委派工具（makeTool 产物）。
 * execute 只回 `{ok, backend, summary, sessionId, exitCode, timedOut, error}`（父只拿摘要）；
 * cwd 必须落在 `cwdAllowlist`；失败/超时/空文本一律 `ok:false`（不静默返回空）。
 * `onEvent`（B-4 可选）：底座逐行事件透传给宿主（`event={kind,data,backend}`，不含 argv/prompt/密钥）；
 * execute 仍是**同步**语义（async 编排/落库在宿主）。
 */
export declare function createDelegateTool(opts?: {
  cliBackends?: { run: Function } | CliBackendRegistry | null;
  cwdAllowlist?: string[];
  onEvent?: ((event: { kind: CliBackendEventKind; data: Record<string, any> | null; backend: string }, ctx: any) => void) | null;
}): Tool;