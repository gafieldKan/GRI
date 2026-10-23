# @gri/agent-core

GRI 浓缩 **AI Agent 底座** —— 泛化推理环 + 工具循环、skill 注册、大模型/凭据路由、跨会话记忆、
外部 agent 后端端口（`CliBackendRegistry` + `agent.delegate` 委派）。仿 OpenClaw 架构意图，
但**不 import 任何业务、不读环境变量**（宿主注入一切）。

- 纯 JS ESM（`type: module`），类型声明见 `index.d.ts`。
- 唯一运行时依赖：`@modelcontextprotocol/sdk`（MCP 客户端/桥接）。

## 目录

| 文件 | 职责 |
|---|---|
| `src/agent.js` | `AgentCore` 推理环 + 工具循环 |
| `src/llm-client.js` | LLM 调用（HTTP 供应商 + `provider='cli'` 外部 agent 分支） |
| `src/model-router.js` | 路由（`default` / `kind=<k>` / `entity=<id>`）→ 供应商/模型/凭据 |
| `src/credential-store.js` | 每用户 api key 的 AES-256-GCM 密文存取缝 |
| `src/tool-registry.js` · `src/tool.js` | 工具注册与 `makeTool` |
| `src/skill-registry.js` · `src/skill.js` | 技能（Markdown 解析 + 注册） |
| `src/memory.js` | 跨会话记忆 |
| `src/cli-backend.js` | 外部 agent CLI 后端（claude-code / codex / openclaw / hermes）+ 注册表 |
| `src/cli-delegate.js` | `agent.delegate` 委派工具（父只拿摘要、cwd 白名单、默认只读） |
| `src/mcp/` · `src/acp/` | MCP 客户端/连接池 · ACP 适配 |

## 如何作为依赖被其他项目接入

本仓整体 **`private: true`**，本包**不发布到公开 npm**。作为「独立产品」接入，二选一：

```sh
# ① 私有 registry（npmmirror / 内部 verdaccio）
npm config set @gri:registry https://registry.npmmirror.com
npm i @gri/agent-core

# ② git 依赖兜底（无需 registry）
npm i git+https://<your-git-host>/gri.git#main
#   或打包产物：
npm pack ./packages/agent-core && npm i ./gri-agent-core-0.1.0.tgz
```

`package.json` 的 `publishConfig` 只**声明**发布去向（私有 registry + `access: restricted`）：
`files` 限定只发 `src/` + `index.d.ts` + `README.md`（测试/夹具/编排脚本不上传）。

> 想在业务服务里「开箱即用」地调用 GRI agent，请用薄客户端
> [`@gri/agent-sdk`](../agent-sdk/README.md)（HTTP 面，不拖入本底座）。

## 用法（宿主注入式）

```js
import { AgentCore, ModelRouter, MemoryStore, ToolRegistry, SkillRegistry, storeFrom } from '@gri/agent-core';

const store = storeFrom((text, params) => pool.query(text, params));
const router = new ModelRouter(store);                      // 读 llm_routes；无行 → 宿主 env 缺省
const memory = new MemoryStore(store);                      // entityId 按调用传
const core = new AgentCore({ store, router, memory, tools: new ToolRegistry(), skills: new SkillRegistry() });
const out = await core.run({ entityId: 'entity-1', userMessage: '你好', routeKey: 'default' });
```

底座不读 `process.env`；API key / 模型 / base_url 一律由宿主（如 `services/api` 的
`AgentService`、`AgentCredentialsService`）注入。

## 测试

```sh
npm test          # node --test（零网络；外部 CLI 后端以桩 argv/行解析覆盖）
```
