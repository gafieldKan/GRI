// Type definitions for @gri/plugin-host

export interface PluginTrust {
  boundary: string;
  network: boolean;
  filesystem: string;
}

export interface PluginConfig {
  schema: string | null;
  secretRefs: string[];
}

export interface PluginManifest {
  id: string;
  name: string;
  kind: string;
  apiVersion: string;
  version: string;
  description: string;
  entry: string | null;
  skill: string | null;
  tools: string[];
  provides: string[];
  requires: string[];
  hooks: string[];
  config: PluginConfig;
  trust: PluginTrust;
  source: string | null;
}

export interface ManifestInput {
  id: string;
  kind: string;
  apiVersion?: string;
  name?: string;
  version?: string;
  description?: string;
  entry?: string;
  skill?: string;
  tools?: string[];
  provides?: string[];
  requires?: string[];
  hooks?: string[];
  config?: { schema?: string; secretRefs?: string[] };
  trust?: { boundary?: string; network?: boolean; filesystem?: string };
}

/** 插件实现；生命周期方法可省。`tools` 可为数组或工厂。 */
export interface PluginImpl {
  install?: (host: HostApi) => unknown | Promise<unknown>;
  activate?: (host: HostApi) => unknown | Promise<unknown>;
  deactivate?: (host: HostApi) => unknown | Promise<unknown>;
  uninstall?: (host: HostApi) => unknown | Promise<unknown>;
  tools?: unknown[] | ((args: { host: HostApi }) => unknown[]);
  authorize?: (ctx: unknown, action: unknown) => { allowed: boolean; reason?: string } | Promise<{ allowed: boolean; reason?: string }>;
  [hook: string]: unknown;
}

export interface HostApi {
  context: Record<string, unknown>;
  resolve(capability: string): Array<{ manifest: PluginManifest; impl: PluginImpl | null }>;
  getByKind(kind: string): Array<{ manifest: PluginManifest; impl: PluginImpl | null }>;
  emit(name: string, data: unknown): void;
}

export const DEFAULT_KINDS: Record<string, number>;
export const HOST_API_VERSION: string;

export class PluginManifestError extends Error {
  code: string;
}

export function parseManifest(
  raw: unknown,
  opts?: { kinds?: Record<string, number>; apiVersion?: string; source?: string },
): PluginManifest;

export function assemblyOrder(manifests: PluginManifest[], kinds?: Record<string, number>): PluginManifest[];

export class CapabilityRegistry {
  add(manifest: PluginManifest, impl?: PluginImpl | null): this;
  has(id: string): boolean;
  get(id: string): { manifest: PluginManifest; impl: PluginImpl | null } | null;
  resolve(capability: string): Array<{ manifest: PluginManifest; impl: PluginImpl | null }>;
  getByKind(kind: string): Array<{ manifest: PluginManifest; impl: PluginImpl | null }>;
  all(): Array<{ manifest: PluginManifest; impl: PluginImpl | null }>;
  capabilityIndex(): Record<string, string[]>;
  describe(id: string): Partial<PluginManifest> | null;
}

export class PluginHost {
  /** `null` 合法（等价于 `{}`）：配置可缺省，不得成为崩溃点。 */
  constructor(opts?: {
    kinds?: Record<string, number>;
    apiVersion?: string;
    context?: Record<string, unknown>;
    observability?: { event?: (name: string, data: unknown) => void };
    /** 宿主**自有**工具名 —— 插件不得占用（撞名 → `TOOL_NAME_RESERVED`，防静默顶替宿主工具）。 */
    reservedTools?: string[];
    /**
     * 工具名的**等价键**（缺省恒等）。撞名判定一律走它，故可表达「多对一」的模型函数名空间
     * （如 agent-core 的 `sanitizeToolName`：`answer.grade` 与 `answer-grade` 同键）。
     */
    nameKey?: ((name: string) => string) | null;
  } | null);
  registry: CapabilityRegistry;
  register(manifestRaw: ManifestInput, impl?: PluginImpl | null): PluginManifest;
  registerAll(entries: Array<[ManifestInput, PluginImpl?] | ManifestInput>): this;
  /** 装配前追加保留工具名（复用宿主时补保留表；与构造项 `reservedTools` 同效）。`names` 缺省为空。 */
  reserveTools(names?: string[]): this;
  /**
   * 复用宿主时设定/更换等价键，并可**一步**追加保留名（按**新键**归一）。
   * 先整体校验、后整体提交：若引入撞名则抛错且宿主**分毫未动**（原子），不静默改键。
   * `fn` 缺省（`null`/`undefined`）表示等价键复位为恒等；非函数且非空 → 抛 `NAME_KEY_INVALID`。
   */
  setNameKey(fn?: ((name: string) => string) | null, extraReserved?: string[]): this;
  hostApi(): HostApi;
  assemble(opts?: { skipKinds?: string[]; requirePolicy?: boolean }): Promise<{ activated: string[]; skipped: string[]; errors: object[] }>;
  assembleSync(opts?: { skipKinds?: string[]; requirePolicy?: boolean }): { activated: string[]; skipped: string[]; errors: object[] };
  isActive(id: string): boolean;
  resolve(capability: string): Array<{ manifest: PluginManifest; impl: PluginImpl | null }>;
  getByKind(kind: string): Array<{ manifest: PluginManifest; impl: PluginImpl | null }>;
  tools(): unknown[];
  authorize(ctx: unknown, action: unknown): Promise<{ allowed: boolean; reason?: string; by?: string }>;
  runHook(name: string, ctx: unknown): Promise<Array<{ plugin: string; value: unknown }>>;
  uninstall(id: string): Promise<{ ok: boolean; error?: string; warning?: string }>;
  diagnostics(): object;
}

export class PluginHostError extends Error {
  code: string;
}

/** 单个插件的加载/装配失败诊断（不含实现、不含密钥）。 */
export interface PluginDiagnostic {
  dir?: string;
  id?: string;
  kind?: string;
  error?: string;
  code?: string;
  message?: string;
}

export interface LoadPluginsResult {
  /** 宿主配置非法（如非函数 `nameKey`）时为 `null` —— 交出诊断而非半建宿主。 */
  host: PluginHost | null;
  tools: unknown[];
  /**
   * 插件声明的技能正文（`skill: "./SKILL.md"`），按发现序；宿主自行并入 prompt。
   * 只含**被激活**插件的正文（装配期被拒的插件连正文一起丢）；已剥首字节 BOM。
   */
  skills: Array<{ id: string; dir: string; path: string; markdown: string }>;
  diagnostics: {
    dir: string | null;
    /** `entry` 为 `null` = 纯内容插件（无入口文件，如只有 `plugin.json` + `SKILL.md`）。 */
    discovered: Array<{ id: string; dir: string; kind: string; entry: string | null }>;
    activated: string[];
    /** 目录存在但无清单 → 按非插件跳过（**非 error**：共享/依赖目录本就合法），但**不静默**。 */
    ignored: PluginDiagnostic[];
    errors: PluginDiagnostic[];
  };
}

/**
 * 同步扫描并装配一个插件目录（`plugins/<id>/plugin.json`）。
 * 任何单点失败只记入 `diagnostics.errors`，宿主照常启动（P5）。
 */
export function loadPlugins(opts?: {
  dir?: string;
  host?: PluginHost;
  hostOptions?: ConstructorParameters<typeof PluginHost>[0];
  /** 宿主自有工具名（透传 `PluginHost.reservedTools`）。 */
  reservedTools?: string[];
  /** 工具名等价键（透传 `PluginHost.nameKey`）——多对一时用它判撞名；`null` 合法（保持恒等）。 */
  nameKey?: ((name: string) => string) | null;
  assemble?: { skipKinds?: string[]; requirePolicy?: boolean };
  manifestFile?: string;
  entryFile?: string;
}): LoadPluginsResult;
