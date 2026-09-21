/**
 * Store —— agent-core 对持久层的唯一抽象。
 * 保持 agent-core 传输无关/与 pg 解耦：Nest 端用 DatabaseService.query 适配，
 * 测试用 fake store。model-router 读 agent.llm_routes、memory 读写 agent.memory 都经它。
 *
 * @typedef {(_text: string, _params?: unknown[]) => Promise<{rows: any[]; rowCount?: number|null}>} QueryFn
 */

/** @returns {(mock: QueryFn) => Store} Store 适配器（把任意 query 函数包成 Store） */
export function storeFrom(query) {
  return { query };
}