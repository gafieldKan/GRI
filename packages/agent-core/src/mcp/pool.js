/**
 * McpPool —— 进程级共享 MCP 连接池（跨消息复用，消掉「每消息 spawn stdio 子进程」的热点）。
 *
 * 思路：每 entity agent 每消息都走 bridgeTools() 桥工具，但底层对同一 agent.mcp_servers 行的 MCP 连接
 * 只建一次、按需复用；空闲超时后 prune 收回。连接由池持有，工具 execute 只发 callTool，不再重建/泄漏子进程。
 * 每 server 一把 promise 链，规避「多消费者并发打同一 server」对单 Client 的重入竞争。
 *
 * 凭证铁律不变：连接只带 transport 形态（config.command/args/url/env-var 名），无任何 apiKey/secret 落内存。
 */
import { McpClient, listMcpServers, serverKey, withTimeout } from './client.js';
import { makeTool } from '../tool.js';

const DEFAULT_IDLE_TTL_MS = 120_000;
const TOOL_CALL_TIMEOUT_MS = 20_000;

export class McpPool {
  /**
   * @param {import('../store.js').Store} store
   * @param {{ idleTtlMs?: number, autoPrune?: boolean }} [opts]
   */
  constructor(store, opts = {}) {
    this.store = store;
    this.idleTtlMs = opts.idleTtlMs ?? DEFAULT_IDLE_TTL_MS;
    this.servers = new Map(); // name -> { row, client, tools, lastUsed, chain }
    this.stats = { connections: 0, calls: 0, pruned: 0 };
    if (opts.autoPrune !== false) {
      this._timer = setInterval(() => { void this.pruneIdle(); }, this.idleTtlMs);
      if (typeof this._timer.unref === 'function') this._timer.unref();
    }
  }

  /**
   * 把当前 enabled 的 MCP server 工具桥成 Tool 数组。同一 server 首次调用才建连接；此后复用。
   * 返回的工具 execute 走池内连接（串行）→ 单次消息闭环，不重建/不泄漏子进程。
   */
  async bridgeTools() {
    const rows = await listMcpServers(this.store);
    const tools = [];
    for (const row of rows) {
      let entry = this.servers.get(row.name);
      if (!entry) {
        const client = new McpClient(this.store, { transport: row.transport, url: row.url, config: row.config || {} });
        let list = [];
        try {
          list = await client.listTools(row.name);
        } catch {
          await client.disconnect().catch(() => {});
          continue; // 该台连不上：隔离跳过，不拖垮 agent
        }
        this.stats.connections += 1;
        entry = { row, client, tools: list, lastUsed: Date.now(), chain: Promise.resolve() };
        this.servers.set(row.name, entry);
      }
      entry.lastUsed = Date.now();
      const key = serverKey(row.name);
      for (const t of entry.tools) {
        const toolName = String(t.name).replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_');
        tools.push(
          makeTool({
            name: `${key}_${toolName}`,
            description: `[MCP ${row.name}] ${t.description || t.name}`,
            inputSchema: t.inputSchema || { type: 'object', properties: {}, required: [] },
            category: 'mcp',
            execute: async (ctx, args) => this._call(entry, t.name, args),
          }),
        );
      }
    }
    return tools;
  }

  /** 一个 server 上的串行 call（链式避免并发重入）。结果归一文本；错误抛给宿主捕获。 */
  _call(entry, toolName, args) {
    entry.lastUsed = Date.now();
    const op = entry.chain.then(async () => {
      this.stats.calls += 1;
      // McpClient.callTool 已归一为 {ok, text, isError} —— 不要再次 normalize（会把 content 读空）
      const r = await withTimeout(
        entry.client.callTool(entry.row.name, toolName, args || {}),
        TOOL_CALL_TIMEOUT_MS,
        `callTool(${toolName})`,
      );
      return r;
    });
    // 链保持 resolved，单次失败不阻断后续调用
    entry.chain = op.then(() => {}, () => {});
    return op.then((r) => {
      if (!r.ok) throw new Error(r.text || `MCP ${toolName} 返回错误`);
      return r.text;
    });
  }

  /** 回收超时未用的连接。幂等，可手动/定时调用。 */
  async pruneIdle() {
    const now = Date.now();
    for (const [name, entry] of this.servers) {
      if (now - entry.lastUsed > this.idleTtlMs) {
        await entry.client.disconnect().catch(() => {});
        this.servers.delete(name);
        this.stats.pruned += 1;
      }
    }
  }

  /** 关闭全部连接（模块退出时调用）。 */
  async disconnect() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    for (const [, entry] of this.servers) await entry.client.disconnect().catch(() => {});
    this.servers.clear();
  }
}