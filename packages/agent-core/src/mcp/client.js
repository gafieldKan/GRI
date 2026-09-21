/**
 * McpClient —— MCP 客户端（2026-09-18 实连：stdio + Streamable HTTP）。
 * 仿 OpenClaw mcp extension 的意图：把外部 MCP server 的工具桥进 ToolRegistry（agent 工具表）。
 * 凭证铁律：本 client 只消费 transport 形态（command/args/url/env-var 白名单），不接收/不回传任何 apiKey/secret。
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { makeTool } from '../tool.js';

const CONNECT_TIMEOUT_MS = 10_000;
const TOOL_CALL_TIMEOUT_MS = 20_000;
const MAX_TEXT_LEN = 4000;

/** server 名消毒成一个安全 key 片段（underscore 分隔作物名前缀，天然避 '.'，不与教学工具 sanitize 撞名）。 */
export function serverKey(name) {
  return String(name)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 32);
}

/** 竞态超时包装：超时 reject，宿主（AgentCore）会把错误捕获进工具结果，不悬挂。 */
export function withTimeout(p, ms, what) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`MCP ${what} 超时（>${ms}ms）`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

/** 归一 SDK callTool 返回 → 可 JSON 序列化文本（text/structuredContent 均收敛，超大截断）。 */
export function normalizeCallResult(raw) {
  const parts = Array.isArray(raw?.content) ? raw.content : [];
  let text = parts
    .map((c) => (c && c.type === 'text' ? c.text : c?.type ? `[${c.type}]` : ''))
    .filter(Boolean)
    .join('\n');
  if (raw?.structuredContent && Object.keys(raw.structuredContent).length > 0) {
    const sc = JSON.stringify(raw.structuredContent);
    text = text ? `${text}\n---\n${sc}` : sc;
  }
  if (text.length > MAX_TEXT_LEN) text = `${text.slice(0, MAX_TEXT_LEN)}…[截断]`;
  return { ok: !raw?.isError, text, isError: !!raw?.isError };
}

export class McpClient {
  /**
   * @param {import('../store.js').Store} store
   * @param {object} [opts] {transport:'stdio'|'http'|string, url?, command?, config?}
   *   config: {command, args, env(Var名白名单), cwd}（stdio）/ {headers via env-var 引用的外部 url（http）
   */
  constructor(store, opts = {}) {
    this.store = store;
    this.opts = opts;
    this._client = null;
    this._transport = null;
    this._connected = false;
  }

  /** 建立真实传输并握手。超时/失败抛错，宿主捕获不悬挂。 */
  async connect() {
    if (this._connected) return true;
    const { transport, url, config = {} } = this.opts;
    let tr = null;
    if (transport === 'http' || transport === 'http-jsonrpc' || transport === 'streamable-http') {
      if (!url) throw new Error('MCP http transport 需要 url');
      tr = new StreamableHTTPClientTransport({ requestUrl: url });
    } else {
      // stdio（默认）
      const command = config.command || this.opts.command;
      if (!command) throw new Error('MCP stdio transport 需要 config.command');
      tr = new StdioClientTransport({
        command,
        args: config.args || this.opts.args || [],
        env: this._filterEnv(config.env),
        cwd: config.cwd,
        stderr: 'inherit',
      });
    }
    const client = new Client({ name: 'gri-agent-core', version: '0.1.0' });
    await withTimeout(client.connect(tr), CONNECT_TIMEOUT_MS, 'connect');
    this._client = client;
    this._transport = tr;
    this._connected = true;
    return true;
  }

  /** env 只按白名单透传（无密钥直传）；无白名单则不注入。 */
  _filterEnv(keys) {
    if (!Array.isArray(keys) || !keys.length) return undefined;
    const allow = new Set(keys);
    const out = {};
    for (const [k, v] of Object.entries(process.env)) if (allow.has(k)) out[k] = v;
    return out;
  }

  /** 列出某 server 的工具（归一化给 bridge）。 */
  async listTools(serverName) {
    void serverName;
    if (!this._connected) await this.connect();
    const res = await this._client.listTools();
    return (res?.tools || []).map((t) => ({
      name: t.name,
      description: t.description || '',
      inputSchema: t.inputSchema || { type: 'object', properties: {}, required: [] },
    }));
  }

  /** 调用 MCP 工具 → 归一文本结果。 */
  async callTool(serverName, toolName, args) {
    void serverName;
    if (!this._connected) await this.connect();
    const raw = await withTimeout(
      this._client.callTool({ name: toolName, arguments: args || {} }),
      TOOL_CALL_TIMEOUT_MS,
      `callTool(${toolName})`,
    );
    return normalizeCallResult(raw);
  }

  async disconnect() {
    if (!this._connected) return true;
    this._connected = false;
    // stdio 传输的里层 child 得在 close() 前抓住（close() 会清掉引用再发 SIGTERM/SIGKILL）。
    // SDK close() 发完 SIGKILL 就返回、不等 'close' 事件 → 这里补一手 await，把子进程真正 reap，
    // 既让 node --test 天然退出，也避免长驻 API 进程累积僵尸 MCP 子进程。
    const child = this._transport && typeof (this._transport._process) !== 'undefined' ? this._transport._process : null;
    const client = this._client;
    const tr = this._transport;
    try { await client?.close(); } catch { /* 关不掉也置空 */ }
    try { await tr?.close(); } catch { /* 同上 */ }
    if (child) {
      await new Promise((resolve) => {
        if (child.exitCode !== null || child.signalCode !== null) return resolve();
        child.once('close', resolve);
        setTimeout(resolve, 3000).unref();
      });
    }
    this._client = null;
    this._transport = null;
    return true;
  }
}

/** 从 agent.mcp_servers 表读可用的 server 清单（enabled=true）。 */
export async function listMcpServers(store) {
  try {
    const { rows } = await store.query(
      'SELECT name, transport, url, config FROM agent.mcp_servers WHERE enabled = TRUE',
    );
    return rows || [];
  } catch {
    return [];
  }
}

/**
 * 把可用的 MCP server 工具桥成 Tool 数组（供 ToolRegistry.registerAll）。
 * 命名 <serverKey>_<toolName>（underscore，天然避 '.'）。单台连不上/无工具 → 跳过并断开，
 * 不拖垮整个 agent；每台急连即断（短生命周期，防句柄泄漏）。
 */
export async function bridgeMcpTools(store) {
  const servers = await listMcpServers(store);
  const tools = [];
  for (const s of servers) {
    let client = null;
    try {
      client = new McpClient(store, { transport: s.transport, url: s.url, config: s.config || {} });
      const list = await client.listTools(s.name);
      const key = serverKey(s.name);
      for (const t of list) {
        const toolName = String(t.name).replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_');
        tools.push(
          makeTool({
            name: `${key}_${toolName}`,
            description: `[MCP ${s.name}] ${t.description || t.name}`,
            inputSchema: t.inputSchema || { type: 'object', properties: {}, required: [] },
            category: 'mcp',
            async execute(ctx, args) {
              void ctx;
              const r = await client.callTool(s.name, t.name, args);
              if (!r.ok) throw new Error(r.text || `MCP ${t.name} 返回错误`);
              return r.text;
            },
          }),
        );
      }
    } catch {
      /* 单台失败：跳过该 server，agent 照常工作 */
    } finally {
      if (client) await client.disconnect().catch(() => {});
    }
  }
  return tools;
}