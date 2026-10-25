/**
 * Tool —— agent 可调用的最小能力单元（仿 OpenClaw 工具契约的浓缩）。
 * `execute(ctx, args)` 返回值会经 JSON 序列化进工具结果（供 LLM 观察）；抛错被 ToolRegistry.call 捕获。
 *
 * @typedef {Object} Tool
 * @property {string} name         唯一名（小写，短横线，如 'quiz.grade'）
 * @property {string} description  给 LLM 看的用途说明（决定它何时调用）
 * @property {Object} [inputSchema] JSON Schema（{type:'object',properties,required}），用于参数校验与 LLM function 定义
 * @property {Function} execute    async (ctx, args) => any
 * @property {string} [category]   归类（'teaching'/'question'/'memory'/'admin'…）
 */

/**
 * 构造一个带默认值封装的 Tool。返回对象满足上面 Tool 形状。
 * @param {Tool} def
 * @returns {Tool}
 */
export function makeTool(def) {
  return {
    name: def.name,
    description: def.description || '',
    inputSchema: def.inputSchema || { type: 'object', properties: {}, required: [] },
    category: def.category || 'general',
    execute: typeof def.execute === 'function' ? def.execute : async () => null,
  };
}

/**
 * 工具名的**跨 provider 清洗**：OpenAI/NVIDIA 等只接受 `[a-zA-Z0-9_-]`，而注册名可含 `.`。
 * 模型看到的是清洗名（`question.lookup` → `question-lookup`），调用时再反查回注册名。
 *
 * 注意这是**多对一**映射（`.` 与 `-` 都 → `-`），故两个不同注册名可能撞到同一个清洗名 ——
 * 那会让「反查」有歧义（模型失去分辨力，谁被选中取决于注册顺序）。调用方（`AgentCore` 的
 * 反查表、以及装配期的撞名检查）因此必须把**清洗名**当作等价键：装配期拒收，运行期不猜。
 *
 * @param {string} name
 * @returns {string}
 */
export function sanitizeToolName(name) {
  return String(name).replace(/[^a-zA-Z0-9_-]/g, '-');
}