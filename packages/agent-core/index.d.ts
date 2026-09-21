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
  source?: 'route' | 'env';
}

export declare class ModelRouter {
  constructor(store: Store, env?: Record<string, string | undefined> | null);
  resolve(routeKey?: string): Promise<LlmConfig>;
  isRealKey(routeKey?: string): Promise<boolean>;
  list(): Promise<any[]>;
  set(route: Record<string, any>): Promise<boolean>;
}

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