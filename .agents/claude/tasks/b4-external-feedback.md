# B-4：外部 agent 反馈回路 —— 让外部 agent 真正「融入项目」（流式事件 + run 持久化 + 可查可续）

> 执行者：**Claude** ｜ 波次：AI 产品化 · 外部 agent 融合 ｜ 依赖：B-3a `40ea83c`、B-3b `b426070`、B-3c `194a72a`（均已提交）
> 依据：用户 2026-10-24 口径「如果其他 agent 出现问题或有回复信息，要能够**实时反馈**到底座所在的项目中」+ `docs/AI_PRODUCTIZATION_REVIEW.md` §二（三缺：流式/持久/推送）
> 定位：把「接入」从「能跑完」升级为「可观测、可查询、可续接、可告警」——**外部 agent 运行 = 一条可查的 run 记录 + 一路事件流**。

## 📥 承重事实（架构师已核对现有代码，按此接线，勿另造概念）

- **无 WS 基础设施**（全仓 grep 无 `@WebSocketGateway`/`platform-socket.io`）→ 反馈推送用 **SSE**（`text/event-stream`，服务端轮询 events 表即可，零新依赖）；WS 留 v2。
- **现有两条缝**：① `provider='cli'` 路由（`model-router.js`/`llm-client.js`）；② `agent.delegate` 委派工具（`cli-delegate.js` + `cli-backend.js`）。
- **parseLine 已逐行解析但只取终态**：`cli-backend.js:83-88`（claude-code stream-json）、`113-114`（codex JSONL）——注释明说「避免与 assistant 增量重复」，即**事件已被解析后丢弃**。本卡把丢弃改为「透传」。
- **run() 签名**：`cli-backend.js:263` `async run(id, opts)`，opts 现含 `prompt/cwd/timeoutMs/allowDangerous/resumeKey`。
- **delegate 注册点**：`agent.service.ts:1125-1133` `_teachingTools()` 内 `createDelegateTool({cliBackends, cwdAllowlist})`。
- **审计既有**：`agent.tool_runs`（`agent.service.ts:1305` INSERT 列 `entity_id/tool_name/args/result/latency_ms`）。
- **迁移风格**：`services/api/src/migrate/032_agent_credentials.sql`（schema 限定、幂等）；需同步 `dist/migrate/`（构建产物，按仓库既有约定）。
- **重启对账锚点**：`agent.service.ts` 构造期已有 MCP pool 装配 + `onModuleShutdown` 断开（`:192/:197`）。

## 🎯 本卡目标（四条）

### 目标 1：底座事件缝——`run()` 透传 `onEvent`，不再丢中间行

- `CliBackend.run(id, opts)` 增可选 `opts.onEvent(kind, data)`：`parseLine` 解析出的每一行归一化为 `kind ∈ started|tool_use|assistant_delta|result|error`，逐条回调（**不得只回调终态**）。
- `cli-delegate.js` `execute` 透传：工厂选项 `createDelegateTool({..., onEvent })` → 每次 `execute` 触发事件时调用 `onEvent(event, ctx)`；`event` 只含 child 派生信息（kind/data），**不得含 argv/prompt/密钥**。
- `index.js`/`index.d.ts` 同步导出与类型（`CliBackendEvent` 类型名可自定，与既有风格一致）。

### 目标 2：run 持久化——`agent.external_runs` + `agent.external_events`

新迁移 `033_agent_external_runs.sql`（风格照 032，幂等，schema `agent`）：

```sql
-- external_runs：一次外部 agent 运行 = 一行状态（可查/可续）
--   run_id uuid pk, entity_id uuid not null（FK 按 032 既有约定挂 users/entities）, backend text,
--   goal text, mode text('sync'|'async'), resume_key text, status text('running'|'done'|'failed'),
--   error_code text, summary text, exit_code int, timed_out bool, latency_ms int,
--   created_at/finished_at timestamptz；索引 ix_external_runs_entity_created (entity_id, created_at desc)
-- external_events：事件流（run_id fk, kind text, data jsonb, id bigserial, created_at）；
--   索引 (run_id, id)。data 只存 child 派生内容，不存 argv/prompt。
```

- 写入一律 **best-effort**（失败静默不阻断对话，与 `tool_runs` 审计同格）；读侧按 `entity_id` 隔离（所有权铁律：`externalId` 真源）。
- 每一次委派（**sync 与 async 都统一**）：**先建 run 行（status=running）→ 跑 → 落终态**（done/failed + summary/exit_code/timed_out/error_code/latency_ms）。

### 目标 3：async 模式 + SSE 查询面（v1 契约扩展）

- `agent.delegate` 的调用增 `mode?: 'sync'|'async'`（缺省 sync，行为与今日一致）：
  - `async`：host 侧立即返回 `{ runId, status:'running' }`（对话继续），后台执行、落终态；
  - 后台执行用**已完成验证的同一路径**：`tool.execute`（沿用 cwd 白名单/DENYLIST/goal 校验，**不复制校验**）+ `detached` 进程组 + `timeoutMs`（B-3a 既有机制）。
- v1 契约（`agent-v1.controller.ts` 同文件扩展，信封不变）：
  - `GET /api/v1/agent/delegate/runs` ?limit=20 → 本人最近 run 列表；
  - `GET /api/v1/agent/delegate/runs/:runId` → 单条（他人 → 404）；
  - `GET /api/v1/agent/delegate/runs/:runId/events` → **SSE**（`text/event-stream`）：循 events 表增量下发，run 终态后再发 5 秒尾巴即关流（轮询间隔 ≤1s；零新依赖、无 WS）。
- **resume_key 落库**：run 完成时把解析出的 session_id/thread_id 写入 `resume_key`；查询面回传；续接由调用方显式传 `resumeKey`（B-3c 语义不变）。
- **异步执行在 host（`agent.service`）分层**：底座 delegate 保持「同步 + onEvent 透传」；async 编排、DB、生命周期都在 host——**底座仍不 import 业务/不碰 DB**。per-run 上下文用 `node:async_hooks` 的 `AsyncLocalStorage`（Node 内置，零依赖）把 `runId` 带给 `onEvent`；不得为单个 runId 改工厂签名。

### 目标 4：错误编码标准化（可告警的前提）

统一 `error_code` 取值（写进契约文档与 `AGENT_PUBLIC_CONTRACT.md`）：`TIMEOUT`｜`NONZERO_EXIT`｜`EMPTY_TEXT`｜`BACKEND_NOT_FOUND`｜`GOAL_MISSING`｜`CWD_DENIED`｜`REGISTRY_NOT_INJECTED`｜`INTERRUPTED`（重启对账专用）。`failed` 一律带 `error_code`，**绝不静默**。

- **重启对账**：宿主启动/模块初始化时，把残留 `status='running'` 的 run 置 `failed/error_code='INTERRUPTED'`（孤儿进程由 B-3c 的进程组超时兜底杀）。

## 🔴 硬约束（违反即失败）

| # | 约束 |
|---|---|
| C1 | **零回归**：既有 `/api/agent/*` 与 `/api/v1/agent/*` 行为逐字节不变；agent-core 123 测、api 654 测全绿；tsc=0 |
| C2 | **底座不读 env / 不碰 DB / 不 import 业务**：`onEvent` 只是回调孔；async 与落库全在 host |
| C3 | **事件不落敏感面**：`external_events.data` 不得含 argv/prompt/密钥；`goal` 文本按既有审计同级存 `external_runs.goal`（保留期策略属 W3，不在本卡） |
| C4 | **async 不丢、不静默**：返回 runId 必有终态；失败必带 error_code；进程组超时照 B-3a/b 机制 |
| C5 | SSE 零新依赖；不得为此引入 WS/队列中间件 |
| C6 | sync 行为零变化（缺省 mode=sync → 与今日逐字节一致）；cli DENYLIST/最小权限不变 |
| C7 | 不 commit / 不 checkout / **不 push**（含任何形式）；末行 `FAIL=0`；探针类临时文件用完即删、不入库 |
| C8 | 类型/文档同步：`index.d.ts` 补事件/resume 类型；`AGENT_PUBLIC_CONTRACT.md` 补 runs 三端点 + error_code 表 + SSE 说明 |

## 📦 产出物

1. `packages/agent-core/src/cli-backend.js`（+onEvent）、`cli-delegate.js`（透传）、`index.js`、`index.d.ts`。
2. `packages/agent-core/tests/`：新增测（onEvent 四类事件冒泡、delegate 透传、死后端事件错误路径）——core 123→更多。
3. `services/api/src/migrate/033_agent_external_runs.sql`（+按仓库约定同步 dist）。
4. `services/api/src/modules/agent/agent.service.ts`：run 行生命周期（建/终态/对账）、AsyncLocalStorage runId、async 编排。
5. `services/api/src/modules/agent/agent-v1.controller.ts`：三只读端点（含 SSE）。
6. 既有 spec 扩展：`agent-v1.controller.spec.ts`（真 HTTP 断言三端点 + 他人 404）、`agent.service.spec.ts`（run 行写入/终态/对账）。
7. `packages/agent-sdk/`：`listRuns()/getRun(runId)`（薄客户端，零新依赖；SSE 由消费方用 EventSource 自取，不入 SDK）。
8. `docs/AGENT_PUBLIC_CONTRACT.md`（三端点 + error_code + SSE）。
9. `.agents/claude/outputs/b4-file-list.md` + `.agents/claude/outputs/b4-verify.sh`。

## ✅ 验收标准

1. **事件冒泡**：stub 后端逐行吐 `tool_use`/`assistant_delta`/`result` → `onEvent` **按序收到全部类型**（终态不再是唯一回调）。
2. **run 行**：每次委派先有 running 行、后有终态行（done 带 summary+latency_ms；failed 带 error_code）；事件行按 run_id 可查且不含 argv/prompt。
3. **async**：调用即返 runId；终态可查；重启对账把残留 running 置 `INTERRUPTED`（测内模拟）。
4. **SSE**：run 进行中拉 `/events` 能增量收到事件、终态后收尾关闭；他人 run → 404。
5. **sync 零变化**：不传 mode 的行为与今日一致（既有断言不破）。
6. **所有权**：列表/详情只回本人（entity=他人 → 404/空）。
7. **零回归 + C7**：core/api 全绿 + tsc=0；脚本末行 `FAIL=0`；零明文；无 push。

## 🧪 复验脚本要求

`b4-verify.sh` 覆盖：① stub 多行 → 全类型事件冒泡；② run 行生命周期 + 对账；③ async 立即返回 + 终态可查；④ SSE 增量/收尾/他人 404；⑤ sync 零变化（缺省行为断言）；⑥ 事件不含 argv/prompt（grep 断言）；⑦ 底座不读 env（grep）；⑧ core+api 零回归 + tsc；⑨ 末行 `FAIL=0`。

## ❓ 需确认

无。（开放设计点自行决定并说明：事件类型细分命名、SSE 轮询实现细节、runs 列表分页参数。**不得**引入 WS/消息中间件；**不得**改 sync 语义；async 的风险面（人审/速率）不在本卡，属 W3。）
