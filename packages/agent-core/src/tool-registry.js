import { makeTool } from './tool.js';

/**
 * ToolRegistry —— 工具注册/查找/校验/调用（内存注册表）。
 * 每个 AgentCore 实例一份；skill 注册会把 skill 声明的工具（makeTool 产物）装进来。
 * 可选 onRun 钩子由 Nest 适配器接 agent.tool_runs 审计。
 */
export class ToolRegistry {
  constructor() {
    /** @type {Map<string, import('./tool.js').Tool>} */
    this._tools = new Map();
  }

  /** @param {import('./tool.js').Tool} tool */
  register(tool) {
    const t = makeTool(tool);
    this._tools.set(t.name, t);
    return this;
  }

  /** @param {Array<import('./tool.js').Tool>} tools */
  registerAll(tools) {
    for (const t of tools) this.register(t);
    return this;
  }

  /** @param {string} name */
  has(name) {
    return this._tools.has(name);
  }

  /** LLM-visible 清单：{name,description,inputSchema} */
  list() {
    return Array.from(this._tools.values()).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }

  /** @param {string} name */
  get(name) {
    return this._tools.get(name) || null;
  }

  /**
   * 校验并调用。返回值统一 {ok, tool, args, result?, error?}。
   * execute 抛错不向上抛（记进 error），保证 agent 循环感知到失败而不是崩溃。
   * @param {any} ctx
   * @param {string} name
   * @param {object} args
   */
  async call(ctx, name, args, { onRun = null } = {}) {
    const tool = this._tools.get(name);
    if (!tool) return { ok: false, tool: name, args, error: `未知工具: ${name}` };

    // 校验必填参数（仅做 required + 枚举，粗校验即可——fail-open，让 LLM 观察结果自纠）
    const err = this._validate(name, tool.inputSchema, args);
    if (err) {
      if (onRun) onRun({ tool_name: name, args, error: err });
      return { ok: false, tool: name, args, error: err };
    }

    const started = Date.now();
    try {
      const result = await tool.execute(ctx, args || {});
      const latency = Date.now() - started;
      if (onRun) onRun({ tool_name: name, args, result, latency_ms: latency });
      return { ok: true, tool: name, args, result };
    } catch (e) {
      const latency = Date.now() - started;
      const error = e && e.message ? e.message : String(e);
      if (onRun) onRun({ tool_name: name, args, error, latency_ms: latency });
      return { ok: false, tool: name, args, error };
    }
  }

  _validate(name, schema, args) {
    if (!schema || !Array.isArray(schema.required) || schema.required.length === 0) return null;
    for (const key of schema.required) {
      if (args == null || args[key] === undefined) return `工具 ${name} 缺少必填参数: ${key}`;
    }
    return null;
  }
}