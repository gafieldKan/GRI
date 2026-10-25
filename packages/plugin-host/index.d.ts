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
  constructor(opts?: {
    kinds?: Record<string, number>;
    apiVersion?: string;
    context?: Record<string, unknown>;
    observability?: { event?: (name: string, data: unknown) => void };
  });
  registry: CapabilityRegistry;
  register(manifestRaw: ManifestInput, impl?: PluginImpl | null): PluginManifest;
  registerAll(entries: Array<[ManifestInput, PluginImpl?] | ManifestInput>): this;
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
  host: PluginHost;
  tools: unknown[];
  diagnostics: {
    dir: string | null;
    discovered: Array<{ id: string; dir: string; kind: string; entry: string }>;
    activated: string[];
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
  assemble?: { skipKinds?: string[]; requirePolicy?: boolean };
  manifestFile?: string;
  entryFile?: string;
}): LoadPluginsResult;
