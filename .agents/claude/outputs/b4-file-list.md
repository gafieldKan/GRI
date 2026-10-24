# B-4 产出物清单（外部 agent 反馈回路）

> 卡：`.agents/claude/tasks/b4-external-feedback.md`（原卡）＋ `.agents/claude/tasks/b4-continue-artifacts.md`（续作卡）
> 生成：2026-10-24 ｜ 基准：`git status` 实测（本清单只列 B-4 触及的文件）
> 门禁实测：core `node --test` **132/132 fail 0**、sdk **21/21 fail 0**、api `npx jest` **669/669 fail 0**、`npx tsc --noEmit` **=0**；`b4-verify.sh` **PASS=44 FAIL=0**。

## 一、改动文件（12 个 M + 2 个新增源码/测试 + 2 份续作产出 + 2 张卡）

### 底座 `@gri/agent-core`（目标 1）

| 文件 | 类型 | 改了什么 | 对应卡面目标 |
|---|---|---|---|
| `packages/agent-core/src/cli-backend.js` | M (+75/−1) | `run()` 增 `opts.onEvent(kind,data)` 透传；新增导出 `CLI_EVENT_KINDS` 闭集（started/tool_use/assistant_delta/result/error）；`spawnRun` 逐行把 `parseLine` 归一化的 `events` 冒泡（**中间行不再丢弃**），spawn 即 `started`、收尾唯一终态 `result`/`error`；新增 `classifyRunError` 把失败归一为机器码；回调抛错被吞 | 目标 1、目标 4 |
| `packages/agent-core/src/cli-delegate.js` | M (+23/−3) | 工厂增 `onEvent` 选项：`execute` 时**仅当宿主注入**才向 `run` 透传 `onEvent`（未注入 → `runOpts` 逐字不变，零回归）；事件 `{kind,data,backend}` 只含 child 派生信息，不含 argv/prompt/密钥 | 目标 1 |
| `packages/agent-core/src/index.js` | M (+1) | 导出 `CLI_EVENT_KINDS` | 目标 1 |
| `packages/agent-core/index.d.ts` | M (+26/−1) | 新增 `CliBackendEventKind`/`CliBackendEvent` 类型、`CliParseResult.events`、`CLI_EVENT_KINDS` 声明；`CliBackendRegistry.run` 与 `createDelegateTool` 补 `onEvent` 签名 | 目标 1、C8 |
| `packages/agent-core/tests/cli-events.test.js` | **新增**（156 行，9 测） | 事件四类按序冒泡／闭集／started 一次终态一次／ENOENT→BACKEND_NOT_FOUND／超时→TIMEOUT／回调抛错不阻断／未注入零回归／delegate 透传不含 argv-prompt | 目标 1、验收 1 |

### 宿主 `services/api`（目标 2、3、4）

| 文件 | 类型 | 改了什么 | 对应卡面目标 |
|---|---|---|---|
| `services/api/src/migrate/033_agent_external_runs.sql` | **新增**（48 行） | `agent.external_runs`（run 状态行）+ `agent.external_events`（事件流）+ 两索引；风格照 032（schema 限定、`IF NOT EXISTS` 幂等、FK→`public.users`）；`error_code` 取值集注释先声明 | 目标 2、C8 |
| `services/api/src/modules/agent/agent.service.ts` | M (+258/−4) | 新增 `EXTERNAL_RUN_ERROR_CODES` 常量集；`AsyncLocalStorage` 携带 runId（不改工厂签名）；`_delegateTool()` 包一层接管生命周期 + schema 增 `mode`；`_delegateExecute`（建 running 行→跑→落终态，sync/async 统一）；`_onDelegateEvent`/`_recordExternalEvent`（best-effort 落事件，保序）；`_finishExternalRun`/`_classifyDelegateError`；`onModuleInit` 重启对账 `reconcileInterruptedRuns`；只读查询 `listExternalRuns`/`getExternalRun`/`listExternalEvents`（按 entity_id 隔离） | 目标 2、3、4 |
| `services/api/src/modules/agent/agent-v1.controller.ts` | M (+108/−3) | 三只读端点：`GET delegate/runs`（列表）、`GET delegate/runs/:runId`（详情，他人→404）、`GET delegate/runs/:runId/events`（**SSE** `text/event-stream`，增量轮询 events 表，终态 status 尾巴 5s 关流，他人→404）；零新依赖、无 WS | 目标 3、C5 |
| `services/api/src/modules/agent/agent.service.spec.ts` | M (+191/−2) | fakeDb 认 `external_runs`/`external_events` SQL；新增 describe：schema mode／sync 生命周期／失败 error_code／错误码归一／错误码集／事件落库不含 argv-prompt／async 立即返回+终态／async 失败落终态／重启对账／所有权隔离 | 目标 2、3、4、验收 2–4、6 |
| `services/api/src/modules/agent/agent-v1.controller.spec.ts` | M (+85/−2) | 新增 `requestRaw`（SSE 原始文本客户端）；§5 五例：列表主体取 externalId／详情／他人 404／他人 events 404／SSE 增量+收尾；`AGENT_SSE_POLL_MS`/`TAIL_MS` 测试加速 | 目标 3、验收 4、6 |

### SDK 与契约（目标 3、C8）

| 文件 | 类型 | 改了什么 | 对应卡面目标 |
|---|---|---|---|
| `packages/agent-sdk/src/index.js` | M (+22) | 新增 `listRuns({limit})` / `getRun(runId)`（薄客户端；SSE 不入 SDK，消费方用 EventSource） | 产出物 7、目标 3 |
| `packages/agent-sdk/index.d.ts` | M (+25) | 新增 `AgentRun` 接口 + `AgentClient.listRuns/getRun` 签名 | 产出物 7、C8 |
| `packages/agent-sdk/tests/agent-sdk.test.js` | M (+44) | §6 五例：listRuns 打点/limit 透传、空数组、getRun 取 data.run、404→结构化错误、空 runId→INVALID_ARGUMENT | 产出物 7 |
| `docs/AGENT_PUBLIC_CONTRACT.md` | M (+69/−2) | 补三端点（runs 列表/详情/SSE）文档 + `error_code` 表（3.1 契约码 + 3.2 run 业务码含 INTERRUPTED）+ SSE 语义说明 + SSE 不入 SDK 声明 | 目标 3、4、C8 |

### 续作产出物（本卡新增）

| 文件 | 类型 | 说明 |
|---|---|---|
| `.agents/claude/outputs/b4-verify.sh` | **新增**（可执行） | 九条复验脚本；末行 `PASS=44 FAIL=0 VERIFY_EXIT=0` |
| `.agents/claude/outputs/b4-file-list.md` | **新增** | 本清单 |

### 任务卡（上游，非产出但属本卡 untracked）

| 文件 | 说明 |
|---|---|
| `.agents/claude/tasks/b4-external-feedback.md` | 原卡（13:15 派发） |
| `.agents/claude/tasks/b4-continue-artifacts.md` | 续作卡（本卡依据） |

## 二、`dist/migrate/` 同步状态（卡面点名核对）

- `services/api/dist/migrate/033_agent_external_runs.sql` **存在且与 `src/` 逐字节一致**（`diff -q` 无输出）。
- 先例核对：`032_agent_credentials.sql` 同样 src/dist 各一份且一致，本卡照此约定。
- ⚠️ `dist/` 受 `.gitignore` 忽略，**不入库**；本清单如实注明其存在与同步状态（它是 `nest build` 产物，迁移运行器读 dist）。
- 复核命令：`diff services/api/src/migrate/033_agent_external_runs.sql services/api/dist/migrate/033_agent_external_runs.sql`

## 三、卡面计数勘误（如实）

续作卡称中断时实况为「11 个 M + 4 个 untracked」。**实测为 12 个 M**（本就含 `cli-delegate.js`）+ 4 个 untracked；续作新增 `b4-verify.sh` 与 `b4-file-list.md`。差异为卡面漏数 `cli-delegate.js`，非实现缺件。

## 四、续作期的一处非语义修正

- `packages/agent-core/src/cli-delegate.js:116`：`execute` 箭头函数体首行被 SIGTERM 腰斩成 `=> {      const backend = …`（丢了换行，纯排版）。续作期**仅补回换行**，零语义改动；修正后 core/jest 全绿复跑通过。`git diff` 该行现为独立的 `const backend = …`。
