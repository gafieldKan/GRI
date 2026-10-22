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
  source?: 'route' | 'env' | 'cred' | 'route+cred';
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
  constructor(resolveConfig: (routeKey: string, opts?: { multimodal?: boolean }) => Promise<LlmConfig>);
  isRealKey(routeKey?: string): Promise<boolean>;
  chat(messages: LlmMessage[], routeKey?: string, opts?: Record<string, any>): Promise<{ content: string; usage?: any }>;
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
}

export declare class AgentCore {
  constructor(deps: AgentCoreDeps);
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
}

/** 一个 CLI 后端 = 声明式描述（不含密钥）。 */
export interface CliBackend {
  id: string;
  label: string;
  bin: string;
  resumeKey?: string | null;
  timeoutMs?: number;
  buildArgs(input: { prompt: string; cwd?: string }): string[];
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
    opts: { prompt: string; cwd?: string; timeoutMs?: number; allowDangerous?: boolean },
  ): Promise<CliRunResult>;
}

/** 建预装四内置后端的注册表（可再追加自定义后端；撞名抛错）。 */
export declare function createCliBackendRegistry(
  extra?: CliBackend[] | Record<string, CliBackend>,
): CliBackendRegistry;
/** 进程级默认注册表。 */
export declare const cliBackends: CliBackendRegistry;