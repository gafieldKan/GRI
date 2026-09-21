/**
 * AcpAdapter —— Agent Client Protocol（ACP）适配器接线位（v0 不实际连接）。
 * ACP = 让 Claude Code 等 CLI 客户端把本 agent 当工具/被工具调用的开放协议。v1+ 接。
 */

export class AcpAdapter {
  constructor(agentCore, opts = {}) {
    this.agent = agentCore;
    this.opts = opts;
  }

  /** 把 AgentCore 暴露为一个 ACP 工具（v0 返回 null，占位）。 */
  asTool() {
    // v1: 返回 {name:'agent-core', description, inputSchema, execute(ctx,{message,routeKey})}
    return null;
  }

  /** 处理一条 ACP 请求（v0 占位 → 抛错）。 */
  async handleRequest(req) {
    void req;
    throw new Error('ACP v0 未接实际连接');
  }
}