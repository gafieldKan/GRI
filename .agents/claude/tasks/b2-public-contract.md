# B-2：对外契约 + 发布面 —— 让底座/业务 agent 真正「可被其他项目调用与使用」（B 波收官卡）

> 执行者：**Claude** ｜ 波次：AI 产品化 · B 波收官 ｜ 依赖：B-1 `8fb1fb5`、B-3a `40ea83c`、B-3b `b426070`、B-3c `194a72a`（均已提交）｜ 状态：待下达（串行）
> 依据：`docs/AI_PRODUCTIZATION_OPTIONS.md` §〇（四道产品缺口 ①/②）§七裁决 ｜ `docs/AGENT_LAYERING.md` ｜ `docs/EXTERNAL_AGENT_HARNESS.md`
> 定位：**产品化封口**。B-1/B-3 已把「每用户 key」与「外部 agent（换脑子/派活儿）」做进底座；本卡补上**外部入口（②）**与**发布边界（①）**——用户最终目标「按产品可发布」的**最后一块**。

## 📥 承重事实（架构师已核对现有代码，按此接线，勿另造概念）

- **业务 agent 已有稳定门面**：`services/api/src/modules/agent/agent.controller.ts`，`@Controller('agent')`，全局前缀 `/api`（`main.ts:14` `app.setGlobalPrefix('api', ...)`）→ 现对外是 **`/api/agent/*`**（`POST me/message`、`GET me`、`GET me/diagnosis`…）。
- **鉴权**：全局 `/api` 强制 Bearer RS256 JWT（`main.ts:30`）；业务主体 = `req.auth.externalId`（`agent.controller.ts::externalId`）。
- **发布面现状（缺口①）**：`packages/agent-core/package.json` = `name:@gri/agent-core`、`version:0.1.0`、`main:src/index.js`、**有 `exports`**、**无 `files`、无 `publishConfig`、无 `private`**；根 `package.json` `private:true`（整仓不发布——保持）。
- **SDK 模板**：`packages/auth-client/package.json`（`type:module`、`exports:{".":"src/index.js"}`、`scripts.test`=`node --test`）——`@gri/agent-sdk` **照此风格**。
- **裁决口径（§七）**：
  - 底座发布去向 = **私有 registry（npmmirror/verdaccio）+ git 依赖兜底**；**不推公开 npm**（用户已定"暂不发布，仅自用"）→ 本卡**只补发布面**（`files`/`publishConfig`）把"独立产品"语义坐实，**不真发远端**。
  - 业务 agent 运行时形态 = **独立 NPM 包（薄 HTTP SDK）+ 既有 Nest 服务**。
  - 应用 agent 权限档 = 默认全只读（B-3c 已落）。

## 🎯 本卡目标（三条，缺一不可）

### 目标 1：`/api/v1/agent/*` 版本化对外契约

新增**版本化**对外面（**不改**既有 `/api/agent/*`，保前端零回归——见 C1）。做法二选一，作者择一并说明：
- **(a) 新增 `AgentV1Controller`**（`@Controller('v1/agent')`）——把 `agent.controller.ts` 的**读/写门面**以 v1 契约重挂；或
- **(b) 新增版本化路由模块**（`agent/v1/`），复用 `AgentService`（不复制业务逻辑，只做契约层：入参校验/出参形状/版本头）。

**v1 契约最小承诺**（至少覆盖，形状须稳定并写入 `docs/`）：
| 方法 | 路径 | 语义 |
|---|---|---|
| `GET` | `/api/v1/agent/me` | 打开我的 agent（工具/技能/记忆） |
| `POST` | `/api/v1/agent/me/message` | 发消息（`{content, routeKey?}`）→ 回复 |
| `GET` | `/api/v1/agent/me/diagnosis` | 只读学情总览 |
| `GET` | `/api/v1/agent/delegate/backends` | **只读**：列出可用 CLI 后端（`cliBackends.list()`），供外部项目探测本机能力（无则空数组，不报错） |

**版本语义**：`/api/v1/**` 为对外承诺面；不兼容变更须进 `/api/v2/**`。所有权铁律不变（`externalId` 真源，跨用户 404）。

### 目标 2：`@gri/agent-sdk` 薄 HTTP 客户端（新包 `packages/agent-sdk`）

照 `auth-client` 风格，**纯 JS、零运行时依赖（或仅 node:fetch）**：
- `createAgentClient({ baseUrl, token })` → `{ getMe(), sendMessage(content, {routeKey}), getDiagnosis(), listBackends() }`；
- 内置：`Authorization: Bearer <token>` 注入、`/api/v1/agent` 基址拼接、非 2xx 抛结构化错误（**不吞错**）、超时；
- `package.json`：`name:@gri/agent-sdk`、`type:module`、`exports`、`scripts.test`（`node --test`）、**含 `files`/`publishConfig`**（同目标 3 口径）。
- **不得** import `@gri/agent-core`（外部项目不该被拖入底座实现）——SDK 只讲 HTTP。**不硬编码任何密钥**。

### 目标 3：发布面（缺口①）

- `packages/agent-core/package.json`：补
  - `"files": ["src", "index.d.ts", "README.md"]`（只发必要面）；
  - `"publishConfig": { "registry": "<私有 registry 占位，如 https://registry.npmmirror.com 或内部 verdaccio>", "access": "restricted" }`；
  - 可选 `"repository"`/`"homepage"` 占位。
- `packages/agent-sdk/package.json`：同上（`files`/`publishConfig`）。
- **不执行任何 `npm publish`**（C9）；根 `package.json` **保持 `private:true`**（不放开整仓）。
- README（底座或 SDK）补一节「如何作为依赖被其他项目接入」（私有 registry / `npm i git+…` 兜底）。

## 🔴 硬约束（违反即失败）

| # | 约束 |
|---|---|
| C1 | **零回归**：既有 `/api/agent/*` **路径与行为逐字节不变**（前端 3 端与 portal 不受影响）；既有 646 api 测全绿；agent-core 123 测全绿 |
| C2 | **不真发远端**：不得执行 `npm publish` / `npm install -g` / 任何推送到 registry 的命令；`publishConfig` 只作**声明** |
| C3 | **版本化不动旧面**：v1 是**新增**；不得改 `agent.controller.ts` 既有路由（如需共享逻辑，抽 `AgentService`，不复制） |
| C4 | **所有权不变**：v1 面同样以 `req.auth.externalId` 为真源；跨用户一律 404 |
| C5 | **SDK 不 import 底座**（`@gri/agent-sdk` 不得依赖 `@gri/agent-core`）；不硬编码密钥/token；token 由调用方注入 |
| C6 | **不读 env 拼接密钥**；SDK/契约层不落明文；错误信息不含密钥 |
| C7 | **零明文**：仓库内无 `nvapi-*`/真实 token 明文；文档用占位 |
| C8 | 根 `package.json` 保持 `private:true`；不改全局路由前缀 |
| C9 | 不 commit / 不 checkout / **不 push**（含任何形式）；末行 `FAIL=0` |
| C10 | 类型/文档同步：新包 `index.d.ts`（若给类型）；`docs/` 补 v1 契约一页 + 接入说明 |

## 📦 产出物

1. `services/api/src/modules/agent/`（或子目录）：v1 契约控制器（`@Controller('v1/agent')`），复用 `AgentService`。
2. `packages/agent-sdk/`（新）：`package.json` + `src/index.js`（`createAgentClient`）+ `index.d.ts`（可选）+ `tests/*.test.js` + `README.md`。
3. `packages/agent-core/package.json`：补 `files`/`publishConfig`（+ 可选 repository）。
4. `docs/`：`AGENT_PUBLIC_CONTRACT.md`（或就近）——v1 契约 + 版本策略 + 接入方式。
5. `.agents/claude/outputs/b2-file-list.md` + `.agents/claude/outputs/b2-verify.sh`。

## ✅ 验收标准

1. **v1 面可用**：`GET /api/v1/agent/me`、`POST /api/v1/agent/me/message`、`GET /api/v1/agent/delegate/backends` 路由存在（单测/集成测可断言路由已注册、形状正确）。
2. **旧面零回归**：既有 `/api/agent/*` 路由与响应形状不变（对照既有 spec 全绿）。
3. **SDK 契约**：`createAgentClient` 注入 baseUrl+token → 请求带 `Authorization: Bearer`、打到 `/api/v1/agent/*`；2xx 解析、非 2xx 抛结构化错误（桩 fetch 断言）。
4. **SDK 不依赖底座**：`packages/agent-sdk/package.json` 的 `dependencies` **不含** `@gri/agent-core`（脚本断言）。
5. **发布面**：`agent-core` 与 `agent-sdk` 的 `package.json` 含 `files` 与 `publishConfig`（脚本断言）；根包仍 `private:true`。
6. **无远端副作用**：无 `npm publish` 痕迹；registry 无新包（不适用则说明）。
7. **零回归 + C9**：agent-core 123 测全绿；api `tsc`=0、`jest` 全绿；`verify.sh` 末行 `FAIL=0`；零明文。

## 🧪 复验脚本要求

`b2-verify.sh` 覆盖：① v1 路由注册/形状；② 旧面零回归（既有 spec）；③ SDK 请求头/基址/错误语义（桩 fetch）；④ SDK 不依赖底座；⑤ 两个包 `files`/`publishConfig` 存在、根包 `private:true`；⑥ 无 `npm publish` 痕迹；⑦ core+api 零回归；⑧ 末行 `FAIL=0`。

## ❓ 需确认

无。（开放设计点自行决定并说明：v1 控制器放同目录还是 `v1/` 子目录；SDK 是否用原生 `fetch`（Node 18+）；契约文档落点文件名。**不得**真发 registry，**不得**动旧路由。）
