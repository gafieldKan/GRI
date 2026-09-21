#!/usr/bin/env node
/**
 * 演示/测试用最小本地 MCP stdio server —— 暴露 2 个确定性工具供「agent 桥接」验证。
 * 既被 agent-core 自己的 node --test 当 stdio 子进程拉起来，也被容器 E2E 当作
 * agent.mcp_servers 的一行动态桥接来源（operator 注册到真实外部 server 即同构替换）。
 *
 * 运行：node <此文件绝对路径>
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const server = new Server({ name: 'gri-demo-mcp', version: '0.1.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'math.add',
      description: '两个数相加，返回和。',
      inputSchema: {
        type: 'object',
        properties: { a: { type: 'number' }, b: { type: 'number' } },
        required: ['a', 'b'],
      },
    },
    {
      name: 'fact.lookup',
      description: '查一条趣味事实。',
      inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  try {
    if (name === 'math.add') {
      const sum = Number(args.a) + Number(args.b);
      return { content: [{ type: 'text', text: String(sum) }] };
    }
    if (name === 'fact.lookup') {
      const id = String(args.id || 'water');
      const facts = {
        water: '水在标准大气压下 100°C 沸腾。',
        moon: '月球距地球约 38.4 万公里。',
      };
      return { content: [{ type: 'text', text: facts[id] || `未知事实 id=${id}` }] };
    }
    throw new Error(`unknown tool ${name}`);
  } catch (e) {
    return { content: [{ type: 'text', text: `ERROR: ${e.message}` }], isError: true };
  }
});

await server.connect(new StdioServerTransport());