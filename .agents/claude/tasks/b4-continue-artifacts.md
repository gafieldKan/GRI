# B-4 续作（中断恢复）：补齐两份产出物 + 自检报告

> 执行者：**Claude** ｜ 上游：`b4-external-feedback.md`（13:15 派发，`marine-shell` 被 SIGTERM 腰斩）
> 背景：实现主体在你被中断前已基本落成，架构师已实测门禁全绿——**不要重写、不要改动已落地的实现**；你的任务只剩三件：① 产出物清单；② 验收脚本；③ 自检报告。

## 📥 当前实况（架构师实测，勿再怀疑，也不要重做）

| 项 | 状态（实测） |
|---|---|
| 底座 `onEvent` 链路 | ✅ `cli-backend.js`（`run()` 透传 + `CLI_EVENT_KINDS` 闭集 + error 分类）+ `cli-delegate.js`（工厂透传、未注入即零回归） |
| 新增核心测试 | ✅ `packages/agent-core/tests/cli-events.test.js`（**core `node --test` 130/130 fail 0**，含事件按序/闭集/启动一次终态一次/ENOENT→BACKEND_NOT_FOUND/超时→TIMEOUT/回调抛错不回归/未注入零回归/delegate 透传不含 argv） |
| host 侧 | ✅ `agent.service.ts`：AsyncLocalStorage runId、`agent.external_runs`/`external_events` best-effort 生命周期、重启对账 INTERRUPTED、sync/async 双模 |
| v1 | ✅ `agent-v1.controller.ts`：`delegate/runs`、`delegate/runs/:runId`、`delegate/runs/:runId/events`（SSE） |
| 迁移 | ✅ `services/api/src/migrate/033_agent_external_runs.sql`（4 个 CREATE，幂等）——**dist/migrate/ 同步按仓库既有约定自行核对**（032 的先例：src 与 dist 各一份） |
| SDK | ✅ `packages/agent-sdk/src/index.js`（`listRuns`/`getRun`）+ `index.d.ts` + tests（**sdk 21/21 fail 0**） |
| 契约文档 | ✅ `docs/AGENT_PUBLIC_CONTRACT.md` +67 行（三端点 + error_code + SSE + INTERRUPTED） |
| api 测试 | ✅ `agent-v1.controller.spec.ts`/`agent.service.spec.ts` 已扩展；**`npx jest` 669/669 全过、`tsc --noEmit`=0** |

## ✅ 你要做的三件事（就这些，不多做）

1. **`.agents/claude/outputs/b4-file-list.md`**：列本卡**全部**改动文件（对照 `git status`：11 个 M + 4 个 untracked + 你续作新增的），每个文件一句话说明改了什么、对应卡面哪条目标。确认 `dist/migrate/` 同步状态并在清单里注明。
2. **`.agents/claude/outputs/b4-verify.sh`**：按原卡「复验脚本要求」九条实现并**实际跑通**——① stub 多行→全类型事件按序冒泡；② run 行生命周期（先 running 后终态）；③ 重启对账置 INTERRUPTED（测内模拟）；④ async 立即返回 runId + 终态可查；⑤ SSE 增量/收尾/他人 404；⑥ sync 零变化（缺省行为断言）；⑦ `external_events` 不含 argv/prompt（grep 断言）；⑧ 底座不读 env（grep）；⑨ core+api 零回归 + tsc。末行 `PASS=<n> FAIL=<m> VERIFY_EXIT=0`。
3. **最终自检报告**（作为你的收尾消息，不是独立文件）：上述三份产出路径 + 你跑 `b4-verify.sh` 的真实输出末行 + `git status` 快照 + 任何你发现但未修的疑点（有就明说，不要粉饰）。

## 🔴 硬约束（同原卡，重申）

- 不改已落地的实现语义；若自检发现与卡面不符的**小缺口**，直接补并在报告里说明（大缺口停下来说明，不要扩权）。
- **不 commit / 不 checkout / 不 push**（含任何形式）。
- 零明文：`b4-verify.sh`/产出物里不得出现任何真实密钥/token。
- 探针类临时文件用完即删、不入库。
- 末行 `FAIL=0`。

## ❓ 需确认

无。
