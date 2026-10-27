# GRI Agent 快速开始（W4）

> 「别人能用」的三条路径：**调 API** / **用 SDK** / **嵌底座**。契约真源见 `docs/AGENT_PUBLIC_CONTRACT.md` 与
> `docs/openapi/agent-v1.yaml`；底座见 `packages/agent-core/README.md`；SDK 见 `packages/agent-sdk/README.md`。

---

## A. 调 API（无论言/任意客户端）

对外承诺面 = `/api/v1/agent/*`（鉴权强制；服务端以令牌解析身份，**不接** `studentId` 入参）。
统一信封：成功 `{ v:1, success:true, data }`，失败 `{ v:1, success:false, error:{ code, message } }`。

```bash
TOKEN=...   # 你的 Bearer JWT
BASE=https://<host>/api

# 打开我的 AI 教师（工具/技能/记忆摘要）
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/v1/agent/me" | jq

# 发消息
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
     -d '{"content":"帮我复习一下勾股定理"}' "$BASE/v1/agent/me/message" | jq

# 可用引擎（只读，不探活）；本机可用 CLI 后端；本人 run 列表
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/v1/agent/engines" | jq
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/v1/agent/delegate/backends" | jq
curl -s -H "Authorization: Bearer $TOKEN" "$BASE/v1/agent/delegate/runs?limit=20" | jq
```

run 事件流（SSE）：`GET /api/v1/agent/delegate/runs/{runId}/events` → `text/event-stream`
（`event:` ∈ 事件 kind ∪ `status`；终态后 5 秒尾巴关流）。

机器可读契约：`docs/openapi/agent-v1.yaml`（OpenAPI 3.1）。

## B. 用 SDK（TypeScript/JS 客户端）

```bash
npm i @gri/agent-sdk
```

`@gri/agent-sdk` 是对 `/api/v1/agent/*` 的薄客户端（信封解包 + 结构化错误 + 版本头）。
逐方法契约见 `packages/agent-sdk/README.md`（方法 → 端点表）。

## C. 嵌底座（把 GRI 的 agent 内核装进你自己的宿主）

```bash
npm i @gri/agent-core
```

底座是**传输无关**的：`AgentCore`（工具环/skill/记忆）+ `ModelRouter`（大模型路由）+ `LlmClient`（模型调用）
+ `CliBackendRegistry`（外部 CLI 后端）+ `EnginePort`（可换引擎）。宿主负责注入 store/凭据/persona——
底座**不读 env、不见明文凭据**。最小装配示例见 `packages/agent-core/README.md`。

## D. 加一个能力（不改宿主代码）

插件是**本地目录 + 清单**（manifest-first）：放一个目录进宿主扫描面，含 `plugin.json`（`packages/plugin-host`
即 schema 基线）+ 入口/SKILL.md，**重启即可用**、**卸载即消失**。形状与示例见
`docs/AGENT_SKILL_PLUGIN_CONTRACT.md`；外来非教育插件的最小证明见 `services/api/plugins-examples/weather/`。

---

## 边界（诚实口径）

- 本快速开始假定你已有一个跑起来的 GRI 服务（`services/api`）与有效身份令牌。
- 发布到公共 registry（`npm publish`）**尚未进行**——`@gri/agent-core` 的 `package.json` 已备
  `files`/`publishConfig`，但 repository/homepage 为占位（`example.invalid`），发布属**对外动作**，须显式授权。
- 换引擎（`world.scene` 等）与前端消费侧的装配细节见各专项文档，不在本页。
