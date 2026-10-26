# @gri/agent-sdk

GRI 业务 agent 的**薄 HTTP 客户端** —— 外部项目/程序接入 GRI agent 的唯一推荐入口。

- 只讲 HTTP：对接 `services/api` 的 **`/api/v1/agent/*`** 版本化对外契约。
- **零运行时依赖**（Node ≥ 18 原生 `fetch`）。
- **不依赖 `@gri/agent-core`**：外部项目不会被拖入底座/服务端实现。
- 不读环境变量、不硬编码任何密钥 —— token 由调用方注入。

契约形状与版本策略见 [`docs/AGENT_PUBLIC_CONTRACT.md`](../../docs/AGENT_PUBLIC_CONTRACT.md)。

## 安装（作为依赖被其他项目接入）

本包**不发布到公开 npm**（整仓 `private`）。二选一：

```sh
# ① 私有 registry（npmmirror / 内部 verdaccio）—— 需先在能访问该 registry 的环境发布本包
npm config set @gri:registry https://registry.npmmirror.com
npm i @gri/agent-sdk

# ② git 依赖兜底（无需 registry，拉仓库子目录）
npm i git+https://<your-git-host>/gri.git#main
#   若宿主不支持子目录安装，用 gitpkg / npm pack 产物：
npm pack ./packages/agent-sdk && npm i ./gri-agent-sdk-0.1.0.tgz
```

> `package.json` 里的 `publishConfig.registry` 只是**声明**发布去向（私有 registry + `access: restricted`），
> 本卡不执行任何 `npm publish`。

## 用法

```js
import { createAgentClient } from '@gri/agent-sdk';

const agent = createAgentClient({
  baseUrl: 'https://gri.example.com', // 服务根，不含 /api
  token,                              // RS256 JWT，调用方注入
  // timeoutMs: 15000,                // 可选
  // fetch,                           // 可选：注入自定义 fetch（测试/代理/小程序）
});

const me       = await agent.getMe();                                   // 工具/技能/记忆摘要
const reply    = await agent.sendMessage('什么是光合作用', { routeKey: 'default' });
const overview = await agent.getDiagnosis();                            // 只读学情总览
const backends = await agent.listBackends();                            // 本机可用 CLI 后端（无则 []）
const engines  = await agent.listEngines();                             // 可用引擎目录（builtin=gri-core；无则 []）
const runs     = await agent.listRuns({ limit: 20 });                   // 本人外部 agent run（B-4；无则 []）
const run      = await agent.getRun('run-123');                         // 单条 run（他人/不存在 → 抛 RUN_NOT_FOUND）
```

方法 → 端点映射：

| 方法 | 端点 |
|---|---|
| `getMe()` | `GET /api/v1/agent/me` |
| `sendMessage(content, {routeKey?})` | `POST /api/v1/agent/me/message` |
| `getDiagnosis()` | `GET /api/v1/agent/me/diagnosis` |
| `listBackends()` | `GET /api/v1/agent/delegate/backends` |
| `listEngines()` | `GET /api/v1/agent/engines` |
| `listRuns({limit?})` | `GET /api/v1/agent/delegate/runs` |
| `getRun(runId)` | `GET /api/v1/agent/delegate/runs/:runId` |

每个方法返回**已解包的 `data`**（v1 信封 `{v,success,data}` 的壳不外泄）。

## 错误语义（绝不吞错）

所有失败都抛 `AgentSdkError`（`instanceof` 可判），字段稳定、无需解析文本：

| `code` | 触发 |
|---|---|
| `INVALID_ARGUMENT` | 构造缺 `baseUrl`/`token`；`sendMessage` 空 content（**不发请求**） |
| `HTTP_ERROR` | 非 2xx 且响应体无 `error.code` |
| `<后端 error.code>` | 非 2xx 且响应体带 `{success:false,error:{code,message}}`（如 `INVALID_CONTENT`） |
| `AGENT_ERROR` | 2xx 但信封 `success:false` |
| `TIMEOUT` | 超过 `timeoutMs`（`AbortController`） |
| `NETWORK` | fetch 抛错（连不上/DNS/TLS…） |
| `NO_FETCH` | 运行环境无 `fetch` 且未注入 |

```js
import { AgentSdkError } from '@gri/agent-sdk';
try {
  await agent.sendMessage(content);
} catch (e) {
  if (e instanceof AgentSdkError && e.status === 401) { /* 刷新 token 后重试 */ }
}
```

## 测试

```sh
npm test          # node --test（桩 fetch，零网络/零依赖）
```
