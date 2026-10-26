/**
 * CLI 引擎适配器 —— 把**已装的外部 CLI agent**（`claude -p` / `openclaw agent exec --json`…）
 * 以 EnginePort 形态接进 GRI（双轨的「可换引擎」一轨）。
 *
 * 形态（W2.6 已裁决 = **薄壳 shell-out，零新依赖**）：不嵌 SDK，只 spawn 既有 CLI，
 * 复用 `CliBackendRegistry.run`（argv 已有 `cli-backend.test.js` 锁定、危险旗标 DENYLIST、
 * 超时杀进程组、事件冒泡 —— 这些都**不重写**）。
 *
 * `capabilities.toolLoop: 'engine'` —— 交错环（perceive→act）**在引擎内**，与 `gri-core`
 * （`'host'`：GRI 拥有环、引擎只占模型调用槽，先例 `provider='cli'`）分属两个边界。
 *
 * ⚠️ **shell-out 的诚实边界（勿过度宣称）**：`listTools()` 恒为 `[]`。
 * 外部 CLI 自带工具集，GRI 的 16 个教学工具**不经本适配器传进去**（CLI 没有「注册宿主工具」的口）。
 * 故本适配器**不是**「同一教师的换引擎」——它换的是**外壳能力**（自主环/子 agent/自带沙箱），
 * 而 GRI 的教学工具仍由 `gri-core` 路径调用。真要双向给工具，需 SDK 内嵌路线（W2.6 已否决）。
 * 这个缺口是有意的、已知的；接入方（宿主）据此判断该不该把某 route 指到本引擎。
 *
 * 保命不变量（由 `tests/conformance.js` 黑盒门禁）：
 *   ① `{success, message}` 形状；② **不可用时回落宿主 `defaultResponder`**（确定性路径）；
 *   ③ 每 entity 隔离（`ctx` 原样交给 responder，引擎自身不跨 entity 取数）；
 *   ④ 不写任何 SQL；⑤ 审计/事件经 `onEvent` 上报给宿主落库。
 *
 * 「不可用」的**判据由宿主注入**（`usable`）——引擎无法自证 CLI 装没装/放没放权；
 * 缺省 `() => true`（乐观），宿主按需给 `() => registry.has(id) && 凭据在位` 之类的探针。
 */
import { EnginePortError, defineEnginePort, ENGINE_API_VERSION } from '../engine-port.js';

/** 引擎 id（= 对应 CLI 后端 id；选路 `agent.llm_routes.engine` 用的就是这串）。 */
export const CLAUDE_CODE_ENGINE_ID = 'claude-code';
export const OPENCLAW_ENGINE_ID = 'openclaw';

/**
 * 造一个「一路 CLI 后端」的 EnginePort。
 *
 * @param {object} spec
 * @param {string} spec.id 引擎 id（唯一，注册表判重）
 * @param {string} spec.cliBackendId 交给 `registry.run()` 的后端 id
 * @param {import('./cli-backend.js').CliBackendRegistry} spec.registry CLI 后端注册表（复用，不重写 spawn）
 * @param {Function} spec.defaultResponder `async (ctx, info) => shape` 不可用时的确定性回落（与 `AgentCore` 同契约）
 * @param {() => boolean|Promise<boolean>} [spec.usable] 可用性探针（缺省乐观 `true`）
 * @param {(ctx: object) => string} [spec.composePrompt] 提示词口径（缺省 = 本轮 `userMessage`）
 * @param {string} [spec.persona] 引擎级人设前缀（可选，拼在提示词之前）
 * @param {string} [spec.cwd] 工作目录（缺省交给 registry → `process.cwd()`）
 * @param {number} [spec.timeoutMs] 单次超时（缺省交给 registry → 后端自带缺省）
 * @param {boolean} [spec.allowDangerous] 是否放行危险旗标（缺省 false = 最小权限）
 * @param {object} [spec.capabilities] 覆盖/补充能力声明（`toolLoop` **不可**覆写：非 `'engine'` 构造期即拒）
 * @returns {Readonly<import('./engine-port.js').EnginePort>}
 */
export function createCliEnginePort(spec = {}) {
  const { id, cliBackendId, registry, defaultResponder, usable, composePrompt, persona, cwd, timeoutMs, allowDangerous } = spec;
  if (!id || typeof id !== 'string') throw new EnginePortError('MISSING_ENGINE_ID', 'CLI 引擎缺 id');
  if (!cliBackendId || typeof cliBackendId !== 'string') {
    throw new EnginePortError('MISSING_CLI_BACKEND_ID', `引擎 ${id} 缺 cliBackendId`);
  }
  if (!registry || typeof registry.run !== 'function') {
    throw new EnginePortError('MISSING_REGISTRY', `引擎 ${id} 需要 CliBackendRegistry（提供 run()）`);
  }
  // 无回落应答 = 不可用时**只能**给非确定结果（测试/E2E 全红）→ 拒绝构造，而不是默默返回空。
  if (typeof defaultResponder !== 'function') {
    throw new EnginePortError('MISSING_DEFAULT_RESPONDER', `引擎 ${id} 必须注入 defaultResponder（无 key/不可用时的确定性回落）`);
  }
  // `toolLoop` 是**本适配器的定义性事实**（环在引擎），不是可调项：让 host 覆写成 'host'
  // 会得到一个自称「宿主拥有工具环」、实则把提示词整个甩给外部 CLI 的引擎 —— 直接矛盾。
  // 故响亮拒绝（配置错误不静默吞），其余能力位（streaming/multimodal/…）仍可覆盖。
  const caps = spec.capabilities || {};
  if (caps.toolLoop != null && caps.toolLoop !== 'engine') {
    throw new EnginePortError('TOOL_LOOP_NOT_OVERRIDABLE', `引擎 ${id} 是 shell-out 适配器，toolLoop 恒为 'engine'；收到 '${caps.toolLoop}'`);
  }

  const compose = typeof composePrompt === 'function' ? composePrompt : (ctx) => (ctx && ctx.userMessage ? String(ctx.userMessage) : '');
  // 乐观缺省：宿主没给探针就当作可用（真不可用会由 spawn 的 error 如实返回，不吞）。
  const canUse = typeof usable === 'function' ? usable : () => true;

  /** 回落：与 `AgentCore._mock` 同形（responder 回 null/undefined → 兜底文案，绝不空手而归）。 */
  async function fallback(ctx) {
    const out = await defaultResponder(ctx, {
      entityId: ctx.entityId,
      sessionId: ctx.sessionId ?? null,
      history: ctx.history || [],
      userMessage: ctx.userMessage,
      engine: id,
      // 为什么回落：供宿主观测/断言（非引擎自证）
      reason: 'engine-unavailable',
    });
    return out || { success: true, message: `（${id} 不可用）收到：${ctx.userMessage ?? ''}`, engine: id };
  }

  async function run(params = {}) {
    const ctx = { sessionId: null, history: [], ...params };
    // ① 可用性闸门：不可用 → 确定性回落（保命不变量②）。探针抛错按**不可用**处理——
    //    「判不出可用」时宁可走确定性路径，也不去 spawn 一个状态未知的外部进程。
    let ok = false;
    try {
      ok = Boolean(await canUse(ctx));
    } catch {
      ok = false;
    }
    if (!ok) return fallback(ctx);

    // ② 组装提示词：空提示词无从 spawn（registry 也会拒）→ 同样按不可用回落。
    const prompt = [persona, compose(ctx)].filter(Boolean).join('\n\n');
    if (!prompt.trim()) return fallback(ctx);

    // ③ 交给既有 CLI 执行器（argv/超时/杀组/事件冒泡全在那边，不在此重写）。
    const opts = ctx.opts || {};
    const onEvent = typeof opts.onEvent === 'function' ? opts.onEvent : undefined;
    let res;
    try {
      res = await registry.run(cliBackendId, {
        prompt,
        cwd,
        timeoutMs,
        allowDangerous: allowDangerous === true,
        resumeKey: opts.resumeKey,
        onEvent,
      });
    } catch (e) {
      // 未知后端 / 危险旗标 / prompt 校验失败等**执行器**抛错：如实报错，不静默降级成「成功」。
      return { success: false, message: `${id} 调用失败：${e && e.message ? e.message : e}`, engine: id };
    }

    // ④ 结果判定：与 `LlmClient._chatViaCli` 同口径（拒绝静默降级 / 拒绝静默返回空）。
    //    `!res` 守卫不可省：执行器契约是回 `CliRunResult`，但**注入的**注册表可能回 undefined/null ——
    //    那样下面的 `res.timedOut` 会抛 TypeError（宿主命中即崩），而不是如实返回失败。
    if (!res || typeof res !== 'object') {
      return { success: false, message: `${id} 后端返回非法结果（非对象）`, engine: id };
    }
    if (res.timedOut) return { success: false, message: `${id} 调用超时`, engine: id, timedOut: true };
    if (res.error) return { success: false, message: `${id} 调用失败：${res.error}`, engine: id };
    const text = typeof res.text === 'string' ? res.text : '';
    if (!text.trim()) return { success: false, message: `${id} 返回空结果`, engine: id };

    // 成功：形状对齐 `AgentCore._shape` 的最小面（phase 由宿主补），并如实带上引擎自报的会话 id 供续接。
    return { success: true, message: text, engine: id, sessionId: res.sessionId ?? null };
  }

  return defineEnginePort({
    id,
    apiVersion: ENGINE_API_VERSION,
    capabilities: {
      streaming: true,
      needsApiKey: false, // GRI 侧不见凭据：CLI 自己的鉴权与宿主无关
      subagents: false,
      multimodal: false,
      ...caps,
      toolLoop: 'engine', // 恒在最后：本适配器的定义性事实，构造期已拒非法覆写（见上）
    },
    run,
    // 引擎自带工具集 → 宿主工具不经 shell-out 传入（见文件头 ⚠️）。如实为空，不假装有。
    listTools: () => [],
    listSkills: () => [],
  });
}

/**
 * Claude Code 引擎（`claude -p`，argv 见 `cli-backend.js` 的 `claudeCodeBackend`）。
 * 语义距离最近：GRI 的 CLI 后端测试即以此为准（`cli-backend.test.js` 有 oracle）。
 */
export function claudeCodeEngine(opts = {}) {
  return createCliEnginePort({ id: CLAUDE_CODE_ENGINE_ID, cliBackendId: 'claude-code', ...opts });
}

/** OpenClaw 引擎（`openclaw agent exec --json`）。 */
export function openclawEngine(opts = {}) {
  return createCliEnginePort({ id: OPENCLAW_ENGINE_ID, cliBackendId: 'openclaw', ...opts });
}
