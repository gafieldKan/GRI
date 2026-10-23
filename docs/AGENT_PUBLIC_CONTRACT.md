# GRI Agent 对外契约 v1（`/api/v1/agent/*`）

> 状态：**现行** ｜ 落卡：B-2（B 波收官）｜ 依赖：B-1 凭据缝、B-3a/b/c 外部 agent 后端
> 依据：`docs/AI_PRODUCTIZATION_OPTIONS.md` §七裁决（② 外部入口 + ① 发布边界）
> 实现：`services/api/src/modules/agent/agent-v1.controller.ts`（复用 `AgentService`，不复制业务逻辑）
> 客户端：[`@gri/agent-sdk`](../packages/agent-sdk/README.md)

本页是**对外承诺面**的单一真源：形状、语义、版本策略。前端 3 端/portal 在用的
**旧面 `/api/agent/*` 不在本契约内**，其路径与形状保持不变（零回归），但不受版本承诺保护。

---

## 一、总则

| 项 | 约定 |
|---|---|
| 基址 | 服务根（如 `https://host`）+ 全局前缀 `/api` → 契约面即 `/api/v1/agent/*` |
| 鉴权 | **强制** `Authorization: Bearer <RS256 JWT>`（auth-center 签发）。本面**不在** `public-routes` 白名单 |
| 所有权 | 一律以 `req.auth.externalId`（≡ `public.users.id`）为真源 |
| 越权 | v1 面**不接受**任何 `studentId` 类入参 → 跨用户访问被结构性消灭（无从传入）。他人资源 → 404 |
| 版本 | `/api/v1/**` 为对外承诺面；**任何不兼容变更开 `/api/v2/**`**，不得原地改 v1 语义 |
| 版本标识 | 路径 `/v1/` ＋ 响应体 `v` 字段 ＋ 响应头 `X-Agent-Api-Version: 1` |
| 成功状态码 | `GET` → **200**；`POST` → **201**（Nest 默认语义，非异常）。客户端判定成功应取 **2xx**，勿硬编码 200 |
| 错误状态码 | 本面显式校验 → **400**（`error.code` 见 §三）；其余沿用 Nest 缺省（401/404/500…，无 `error.code`，按 `status` 兜底） |

### 响应信封

成功（HTTP 2xx）：

```json
{ "v": 1, "success": true, "data": { } }
```

失败（HTTP 4xx/5xx）：

```json
{ "v": 1, "success": false, "error": { "code": "INVALID_CONTENT", "message": "content 必填且非空" } }
```

> `data` 的形状随端点而定（见下表）。客户端应读取 `data`；`v`/`success` 为协议字段。
> NestJS 自身产生的错误（如路由不存在 404）不带该信封 —— 客户端需按 `status` 兜底。

---

## 二、端点

### `GET /api/v1/agent/me`

打开「我的 agent」（建实体 + 返回工具/技能/记忆摘要）。幂等。

```json
{
  "v": 1, "success": true,
  "data": {
    "success": true,
    "entityId": "<users.id>",
    "kind": "student",
    "status": "active",
    "tools": ["diagnosis.state", "wrong.list", "…"],
    "skills": ["…"],
    "memoryDigest": "…"
  }
}
```

### `POST /api/v1/agent/me/message`

发消息给 AI 教师 → 回复。

请求体：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `content` | string | ✅ | 非空（去空白后）。空 → **400** `INVALID_CONTENT`（不落业务层） |
| `routeKey` | string | ❌ | 模型路由键：`default` / `kind=<k>` / `entity=<users.id>`；缺省 `default` |

```json
{ "v": 1, "success": true, "data": { "success": true, "message": "…", "routeKey": "default" } }
```

### `GET /api/v1/agent/me/diagnosis`

只读学情总览（复用 `diagnosis.state`，不绕 LLM）。

```json
{ "v": 1, "success": true, "data": { "success": true, "phase": "diagnosis", "…": "…" } }
```

### `GET /api/v1/agent/delegate/backends`

**只读探测面**：列出本机可用 CLI 后端（外部项目据此判断本机能力）。

```json
{ "v": 1, "success": true, "data": { "backends": [
  { "id": "claude-code", "label": "Claude Code", "bin": "claude", "timeoutMs": 180000, "resumeKey": "session_id" }
] } }
```

- 无注册表 / 无后端 → `{ "backends": [] }`，**永不 5xx**。
- 仅可序列化清单（`id`/`label`/`bin`/`timeoutMs`/`resumeKey`）—— 不含函数、不含任何凭据/密钥。

---

## 三、错误码

| `error.code` | HTTP | 含义 |
|---|---|---|
| `INVALID_CONTENT` | 400 | `POST me/message` 的 `content` 缺失/全空白 |

> 其余失败沿用 Nest 缺省形状（无 `error.code` 字段），客户端按 `status` 处理。
> 结构化错误由 SDK 统一归一化为 `AgentSdkError.code`（见 SDK README）。

---

## 四、客户端

```js
import { createAgentClient } from '@gri/agent-sdk';
const agent = createAgentClient({ baseUrl: 'https://host', token });  // token 由调用方注入
await agent.getMe(); await agent.sendMessage('…'); await agent.getDiagnosis(); await agent.listBackends();
```

SDK 只讲 HTTP、零运行时依赖、**不 import `@gri/agent-core`**、不读 env、不硬编码密钥。

---

## 五、发布边界（① 缺口）

| 包 | 语义 | 发布去向 |
|---|---|---|
| `@gri/agent-core` | 底座（引擎） | `publishConfig` → 私有 registry（npmmirror/verdaccio）+ `access: restricted`；`files` 限定 `src/`+`index.d.ts`+`README.md` |
| `@gri/agent-sdk` | 业务 agent 薄 HTTP 客户端 | 同上 |

- 整仓根 `package.json` **保持 `private: true`**（不放开整仓发布）。
- 现阶段**不发布到公开 npm**；`publishConfig` 仅为**声明**，供后续私有 registry 发布使用。
- 接入兜底见两包 README 的「如何作为依赖被其他项目接入」（私有 registry / `npm i git+…` / `npm pack`）。

---

## 六、变更流程

1. **兼容**变更（新增可选字段/新增端点）→ 留在 v1，更新本页。
2. **不兼容**变更（改形状/改语义/删字段）→ 新增 `/api/v2/**` 控制器，v1 冻结并标注 `deprecated`。
3. 任一变更须同步：本页 + `packages/agent-sdk`（+ 其 `index.d.ts`）+ `agent-v1.controller.spec.ts`。
