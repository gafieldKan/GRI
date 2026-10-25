import { LlmClient } from './llm-client.js';
import { ENGINE_API_VERSION } from './engine-port.js';
import { sanitizeToolName } from './tool.js';

/**
 * AgentCore —— 通用推理/工具循环（OpenClaw core 的浓缩）。
 *
 * 一条 user message 的生命周期：
 *   组 system prompt（persona + 技能指令 + 记忆摘要 + 可用工具清单）
 *     → 真实 key：function-calling（LLM 挑工具→ToolRegistry.exec→结果回喂→再循）→ 产出 {message, followUps…}
 *     → 无 key：走注入的 defaultResponder（确定性 mock，保测试/E2E 绿，也当本地降级）。
 *
 * 每轮从 model-router 实时解析 provider/model，切换写表即生效，无需重启。
 */
export class AgentCore {
  /**
   * @param {object} deps
   * @param {import('./model-router.js').ModelRouter} deps.router
   * @param {import('./store.js').Store} deps.store
   * @param {import('./tool-registry.js').ToolRegistry} deps.tools
   * @param {import('./skill-registry.js').SkillRegistry} deps.skills
   * @param {import('./memory.js').MemoryStore} deps.memory
   * @param {string} [deps.persona] 默认人格（可被每轮 opts.persona 覆盖）
   * @param {Function} [deps.defaultResponder] async (ctx, opts) => any 无 key 时的确定性应答
   * @param {{run: Function}} [deps.cliBackends] 外部 CLI 后端注册表（B-3a/B-3b，「换脑子」）；缺省 null → 同今日
   * @param {string} [deps.memoryHeading] 记忆摘要的小标题（底座保持业务中立，缺省 '## 记忆'；宿主注入业务文案）
   */
  constructor(deps) {
    this.router = deps.router;
    this.store = deps.store;
    this.tools = deps.tools;
    this.skills = deps.skills;
    this.memory = deps.memory;
    this.persona = deps.persona || '你是一个严谨、耐心的 AI 助教。';
    // 记忆摘要标题可注入：底座不渗业务语义（AGENT_LAYERING 判据 1/2）；宿主给「## 关于该学生的记忆」，缺省中性。
    this.memoryHeading = deps.memoryHeading || '## 记忆';
    // cliBackends 缺省 null → 默认 LlmClient 无 CLI 后端（行为同今日，零回归）；cli 路由时才会真正被调用
    // llmTimeoutMs：宿主可注入 LLM 单次调用超时（deepseek 等推理模型大 prompt 下默认 60s 会误杀）；不传 = LlmClient 默认 60s（零回归）
    this.llm =
      deps.llm ||
      new LlmClient((routeKey, o) => this.router.resolve(routeKey), deps.cliBackends || null, deps.llmTimeoutMs != null ? { timeoutMs: deps.llmTimeoutMs } : undefined);
    this.defaultResponder = deps.defaultResponder || (async () => null);
    // 工具执行审计钩子（Nest 接管 agent.tool_runs）
    this.onRun = deps.onRun || null;
    // —— EnginePort 身份与能力（双轨：gri-core 为默认引擎，见 engine-port.js）——
    // 类名 AgentCore 不变（index.js/index.d.ts + 大量 node:test 依赖）；这里只**显式声明**它已满足的端口。
    this.id = deps.engineId || 'gri-core';
    this.apiVersion = ENGINE_API_VERSION;
    this.capabilities = Object.freeze({
      toolLoop: 'host', // 工具环在 GRI；外部引擎（Claude SDK / OpenClaw core）声明 'engine'
      streaming: false,
      needsApiKey: true,
      subagents: true, // agent.delegate
      multimodal: false,
    });
  }

  listTools() {
    return this.tools.list();
  }

  listSkills() {
    return this.skills.list();
  }

  /**
   * 跑一轮。
   * @param {object} p
   * @param {string} p.entityId 所有权真源（每生一独立 agent）
   * @param {string} [p.sessionId]
   * @param {Array<{role:string,content:string}>} p.history 此前消息（不含本轮 system）
   * @param {string} p.userMessage 本轮用户输入
   * @param {string} [p.routeKey] 模型路由键（缺省 default）
   * @param {object} [p.opts] {maxToolTurns, temperature, defaultOpts:…传给 defaultResponder}
   * @returns {Promise<any>} 产出 {message, phase?, state?, questions?, followUps?, toolCalls?}
   */
  async run({ entityId, sessionId = null, history = [], userMessage = '', routeKey = 'default', opts = {} }) {
    const ctx = { entityId, sessionId, store: this.store, memory: this.memory, router: this.router };
    const maxToolTurns = opts.maxToolTurns ?? 4;

    // 无真实 key → 确定性 mock 路径（保 baseline 绿；默认应答前先喂一次工具回路，尽量贴近真实形态）
    if (!(await this.llm.isRealKey(routeKey))) {
      return this._mock(entityId, sessionId, history, userMessage, ctx, opts);
    }

    return this._real(entityId, history, userMessage, routeKey, ctx, maxToolTurns, opts);
  }

  /** 真实 key：function-calling 工具循环。 */
  async _real(entityId, history, userMessage, routeKey, ctx, maxToolTurns, opts) {
    const messages = [
      { role: 'system', content: await this._systemPrompt(ctx, routeKey, opts) },
      ...(history || []),
      { role: 'user', content: userMessage },
    ];
    // 注册表工具名可含 `.`（如 question.lookup），但 OpenAI/NVIDIA 等只允许 [a-zA-Z0-9_-]。
    // → payload 里用清洗名，调用时反查回注册名，保证跨 provider 通用。
    // 清洗名是**多对一**（`answer.grade` 与 `answer-grade` 同键），故这里**先到先得**：同名键已存在就
    // 保留先注册者、后来者不进 payload。这保证的是**确定性**（不给模型两个同名函数、反查无歧义），
    // 而**不是**「宿主工具一定赢」——谁赢取决于**注册顺序**。真正防「插件顶替宿主工具」的是
    // **装配期拒收**（plugin-host 的 reservedTools / nameKey）与宿主自己的保留名守卫；底座不猜谁是谁。
    const bySanitized = new Map();
    const payloadTools = [];
    for (const t of this.tools.list()) {
      const key = sanitizeToolName(t.name);
      if (bySanitized.has(key)) continue;
      bySanitized.set(key, t.name);
      payloadTools.push({
        type: 'function',
        function: { name: key, description: t.description, parameters: t.inputSchema || { type: 'object' } },
      });
    }

    let turn = 0;
    while (turn < maxToolTurns) {
      const res = await this.llm.chat(messages, routeKey, {
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.max_tokens ?? 4096,
        tools: payloadTools,
      });

      // OpenAI 兼容 function-calling：assistant 消息必须原样带 tool_calls（含 id），
      // 否则后续 tool 结果消息缺配对 → "missing field tool_call_id" 400。
      const structured = Array.isArray(res.toolCalls) && res.toolCalls.length ? res.toolCalls : null;
      const assistantMsg = { role: 'assistant', content: res.content };
      if (structured) assistantMsg.tool_calls = structured;
      messages.push(assistantMsg);

      // 优先读 OpenAI 兼容结构化 tool_calls；否则 fallback 解析模型写进 content 的 JSON 函数调用串
      const call = this._firstToolCall(structured) || this._detectToolCall(res.content);
      if (!call || !call.name) break; // 无工具调用 → 直接产出

      const realName = bySanitized.get(call.name) || call.name; // 清洗名 → 注册名
      const toolMsg = await this.tools.call(ctx, realName, call.argument || {}, { onRun: this.onRun });
      const resultContent = typeof toolMsg.result === 'string' ? toolMsg.result : JSON.stringify(toolMsg.result ?? { error: toolMsg.error });
      if (call.id) {
        // 结构化工具调用：用 tool_call_id 配对回刚才的 assistant tool_calls
        messages.push({ role: 'tool', tool_call_id: call.id, content: resultContent });
      } else {
        // content 内联调用（无 id 可配）：不能以 role:'tool' 回喂（会因缺 tool_call_id 400），
        // 改由 assistant 自述工具返回，模型照常继续推理。
        messages.push({ role: 'assistant', content: `（工具 ${realName} 返回）\n${resultContent}` });
      }
      if (!toolMsg.ok) break;
      turn++;
    }

    const last = messages[messages.length - 1];
    return this._shape(last && last.content, opts, { toolCallsProcessed: turn });
  }

  /** 从 OpenAI 兼容 tool_calls 数组取首个可用函数调用（含 id，供 tool 结果配对）。 */
  _firstToolCall(toolCalls) {
    if (!Array.isArray(toolCalls)) return null;
    for (const tc of toolCalls) {
      const fn = tc && tc.function;
      if (!fn || !fn.name) continue;
      let argument = {};
      if (fn.arguments) {
        try { argument = JSON.parse(fn.arguments); } catch { argument = {}; }
      }
      return { name: fn.name, argument, id: tc && tc.id };
    }
    return null;
  }

  async _mock(entityId, sessionId, history, userMessage, ctx, opts) {
    const responder = opts.defaultResponder || this.defaultResponder;
    const out = await responder(ctx, {
      entityId,
      sessionId,
      history,
      userMessage,
      toolsAvailable: this.listTools().map((t) => t.name),
      skills: this.listSkills().map((s) => s.name),
      memory: ctx.memory,
      opts,
    });
    return out || this._shape(`（演示环境）收到：${userMessage}`, opts);
  }

  /** 装配 system prompt：人格 + 技能指令 + 记忆摘要 + 工具清单。 */
  async _systemPrompt(ctx, routeKey, opts) {
    const persona = opts.persona || this.persona;
    const skills = this.skills.instructionsBlock();
    const mem = await this.memory.digest(ctx.entityId, { limit: opts.memoryLimit ?? 50 });
    const tools = this.listTools()
      .map((t) => `- ${t.name}: ${t.description}`)
      .join('\n');
    return [
      persona,
      skills ? `\n\n## 可用技能\n${skills}` : '',
      mem ? `\n\n${this.memoryHeading}\n${mem}` : '',
      `\n\n## 可用工具\n${tools || '（无）'}\n\n始终用中文回复。`,
      routeKey && routeKey !== 'default' ? `\n（当前模型路由：${routeKey}）` : '',
    ].join('');
  }

  /** 工具调用探测：接受 JSON 函数调用串或 markdown 代码块。 */
  _detectToolCall(content) {
    if (!content) return null;
    const s = String(content);
    try {
      const j = JSON.parse(s);
      if (j && j.tool && j.arguments) return { name: j.tool, argument: j.arguments };
      if (j && (j.name || j.tool)) return { name: j.name || j.tool, argument: j.arguments || j.input || {} };
    } catch {
      /* 走正则 */
    }
    const m = s.match(/\{\s*"tool"\s*:\s*"([^"]+)"[\s\S]*?\}/);
    if (m) {
      try {
        const j = JSON.parse(m[0]);
        return { name: j.tool, argument: j.arguments || {} };
      } catch {
        return { name: m[1], argument: {} };
      }
    }
    return null;
  }

  /** 规整统一返回体（前端契约由 tuition 层保证不变）。 */
  _shape(message, opts, extra = {}) {
    const body = { success: true, message: message == null ? '' : String(message) };
    if (opts && opts.phase != null) body.phase = opts.phase;
    if (opts && opts.state) body.state = opts.state;
    return { ...body, ...extra };
  }
}