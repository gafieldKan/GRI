/**
 * 引擎一致性套件（gate）——「可换」的**定义**。
 *
 * `assertEnginePortConformance(engine, opts)` 是**黑盒**检查，任一 EnginePort 适配器都必须通过：
 * 它只依赖公开面（`id/apiVersion/capabilities/run/listTools/listSkills`），不依赖任何 gri-core 内部实现。
 * 未来 Claude Agent SDK / OpenClaw core 适配器直接复用它，即可证明「换引擎不破保命不变量」。
 *
 * 覆盖的三个可移植不变量（对应方案 §二.4 的 (a)(d)(e)）：
 *   ① 端口形状    —— id/apiVersion/capabilities.toolLoop 合法；
 *   ② 列表面      —— listTools()/listSkills() 恒为数组；
 *   ③ 无 key 回落 —— 无真实凭据时必须走宿主 defaultResponder（确定性），
 *                    且**每 entity 隔离**（应答随 entityId 变化，绝不跨 entity 复用）。
 *
 * (b) 工具名净化往返、(c) tool_call_id 配对 属 gri-core 真实环内部不变量，
 * 由 `engine-conformance.test.js` 用脚本化 LLM 直测（外部引擎以其自身方式满足其**可观测结果**）。
 */
import assert from 'node:assert';

export const CONFORMANCE_CHECKS = Object.freeze([
  'port-shape',
  'tools-skills-arrays',
  'no-key-fallback',
  'entity-isolation',
]);

/**
 * @param {object} engine 待检引擎
 * @param {object} [opts]
 * @param {(entityId:string)=>string} [opts.runProbe] 提供 harness 的确定性应答探针（responder 应回此串）
 * @param {typeof assert} [opts.assert] 断言器（node:assert 兼容）
 * @param {string} [opts.label] 报错前缀
 */
export async function assertEnginePortConformance(engine, { runProbe, assert: A = assert, label = 'engine' } = {}) {
  const p = (msg) => `${label}: ${msg}`;
  if (!engine || typeof engine !== 'object') A.fail(p('必须为对象'));

  // ① 端口形状
  A.equal(typeof engine.id, 'string', p('id 必须是字符串'));
  A.ok(engine.id.length > 0, p('id 不能为空'));
  A.equal(engine.apiVersion, '1', p('apiVersion 必须是 "1"'));
  A.ok(engine.capabilities && typeof engine.capabilities === 'object', p('缺 capabilities'));
  A.ok(['host', 'engine'].includes(engine.capabilities.toolLoop), p("capabilities.toolLoop 必须是 'host'|'engine'"));

  // ② 列表面
  A.ok(Array.isArray(engine.listTools()), p('listTools() 必须返回数组'));
  A.ok(Array.isArray(engine.listSkills()), p('listSkills() 必须返回数组'));

  // ③ 无 key 回落 + 每 entity 隔离
  const a = await engine.run({ entityId: 'conformance-a', sessionId: null, history: [], userMessage: 'ping' });
  A.ok(a && typeof a === 'object', p('run() 必须返回对象'));
  A.equal(a.success, true, p('run().success 必须为 true'));
  A.equal(typeof a.message, 'string', p('run().message 必须是字符串'));
  if (runProbe) {
    A.equal(a.message, runProbe('conformance-a'), p('无 key 必须回落 defaultResponder（确定性应答）'));
  }

  const b = await engine.run({ entityId: 'conformance-b', sessionId: null, history: [], userMessage: 'ping' });
  A.equal(b.success, true, p('run().success 必须为 true'));
  if (runProbe) {
    A.equal(b.message, runProbe('conformance-b'), p('每 entity 隔离：应答不得跨 entity'));
    A.notEqual(a.message, b.message, p('不同 entity 必须得到不同应答（证隔离）'));
  }
}
