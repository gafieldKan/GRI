/**
 * EnginePort —— 可换引擎的**最小契约**（双轨：抽象端口 + 可换引擎）。
 *
 * 既有 `AgentCore` 已隐式满足本契约（有 `run`/`listTools`/`listSkills`）；本文件把它**显式化**
 * 为可校验的契约，使外部成熟引擎（Claude Agent SDK / OpenClaw core…）能以适配器形态接入，
 * 而不改 `/api/v1/agent/*` 契约与宿主逻辑。
 *
 * 边界（由 `capabilities.toolLoop` 声明）：
 *   - `'host'`   ：工具环在宿主（GRI）——引擎只拥有模型调用槽（如 `provider='cli'` 先例）。
 *   - `'engine'` ：工具环在引擎——真正的适配器；宿主把工具交给引擎注册 API、审计经钩子注入。
 *
 * RunCtx / RunResult **不是新概念**：
 *   - RunCtx ≈ `AgentCore.run` 的入参（`entityId/sessionId/history/userMessage/routeKey/opts`）
 *     ＋构造期注入的能力（router/store/tools/skills/memory/persona/defaultResponder/onRun/cliBackends）。
 *   - RunResult ≈ `AgentCore._shape()` 的输出 `{success, message, phase?, state?, …}`。
 *
 * 硬约束（任一引擎适配器都必须满足，由 `engine-conformance.test.js` 门禁）：
 *   ① 返回 `{success:boolean, message:string}` 形状；
 *   ② **无真实 key 时回落宿主 `defaultResponder`**（否则确定性测试/E2E 全红）；
 *   ③ 每 entity 隔离（引擎只拿 scoped Store，绝不跨 entity 查询）；
 *   ④ 工具只**调**宿主工具，不自行写 SQL；
 *   ⑤ 审计经 `onRun`/`onEvent` 上报，宿主落库。
 */

export const ENGINE_API_VERSION = '1';

/** 引擎契约违规。`code` 供分支（不靠 message 文本）。 */
export class EnginePortError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'EnginePortError';
    this.code = code;
  }
}

/**
 * 构造并校验一个 EnginePort（冻结）。既有引擎对象若已满足形状，可不用本函数——
 * 但仍应通过 `isEnginePort` 校验。
 * @param {object} spec
 * @returns {Readonly<object>}
 */
export function defineEnginePort(spec) {
  if (!spec || typeof spec !== 'object') {
    throw new EnginePortError('NOT_AN_OBJECT', 'EnginePort 必须是对象');
  }
  const { id, run, listTools, listSkills } = spec;
  const apiVersion = spec.apiVersion == null ? ENGINE_API_VERSION : String(spec.apiVersion);

  if (!id || typeof id !== 'string') throw new EnginePortError('MISSING_ENGINE_ID', 'EnginePort 缺 id');
  if (apiVersion !== ENGINE_API_VERSION) {
    throw new EnginePortError('INCOMPATIBLE_API_VERSION', `引擎 ${id} apiVersion=${apiVersion} 与 ${ENGINE_API_VERSION} 不兼容`);
  }
  if (typeof run !== 'function') throw new EnginePortError('MISSING_RUN', `引擎 ${id} 缺 run()`);

  const c = spec.capabilities || {};
  const toolLoop = c.toolLoop === 'host' ? 'host' : 'engine';
  return Object.freeze({
    id,
    apiVersion,
    capabilities: Object.freeze({
      toolLoop,
      streaming: c.streaming === true,
      needsApiKey: c.needsApiKey !== false,
      subagents: c.subagents === true,
      multimodal: c.multimodal === true,
    }),
    run,
    listTools: typeof listTools === 'function' ? listTools : () => [],
    listSkills: typeof listSkills === 'function' ? listSkills : () => [],
  });
}

/** 形状校验（不构造）。 */
export function isEnginePort(x) {
  return !!x && typeof x === 'object' && typeof x.id === 'string' && typeof x.run === 'function';
}

/**
 * EngineRegistry —— 引擎注册表（对标 `CliBackendRegistry` 的写法：声明式、id 唯一、撞名拒绝）。
 * 只**持有**引擎；「选哪个」由宿主按 `agent.llm_routes.engine` 解析后 `get(id)`——**不新建第二套路由**。
 */
export class EngineRegistry {
  constructor(engines = []) {
    /** @type {Map<string, object>} */
    this._engines = new Map();
    for (const e of engines) this.register(e);
  }

  register(engine) {
    if (!isEnginePort(engine)) throw new EnginePortError('INVALID_ENGINE', 'get() 前引擎必须满足 EnginePort 形状');
    if (this._engines.has(engine.id)) {
      throw new EnginePortError('DUPLICATE_ENGINE_ID', `引擎 id 撞名，拒绝加载: ${engine.id}`);
    }
    this._engines.set(engine.id, engine);
    return this;
  }

  /** 注册且设为默认（第一个注册者通常即默认）。 */
  has(id) {
    return this._engines.has(id);
  }

  get(id) {
    return this._engines.get(id) || null;
  }

  /** @returns {Array<{id:string, apiVersion:string, capabilities:object}>} 可序列化清单（无实现） */
  list() {
    return Array.from(this._engines.values()).map((e) => ({ id: e.id, apiVersion: e.apiVersion, capabilities: e.capabilities }));
  }
}
