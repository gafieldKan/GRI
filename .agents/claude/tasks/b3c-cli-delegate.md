# B-3c：`agent.delegate` 委派工具 —— 把外部 agent 当"派活儿"工人（接入点②）

> 执行者：**Claude** ｜ 波次：AI 产品化 · B-3 第三卡 ｜ 依赖：B-3a `40ea83c` + B-3b `b426070`（均已提交）｜ 状态：待下达（串行）
> 依据：`docs/EXTERNAL_AGENT_HARNESS.md` §四②/§六/§八（**本卡灵魂**）｜ `docs/AI_PRODUCTIZATION_OPTIONS.md` §七裁决
> 定位：**「派活儿」接入点** —— agent 可调用工具 `agent.delegate`，把一个独立子任务交给本机外部 agent（claude-code/codex/openclaw/hermes）执行；**父 agent 只拿摘要结果**（对标 Hermes `delegate_tool`：parent 看不到 child 的中间工具调用）。

## 📥 承重事实（架构师已核对现有代码，按此接线，勿另造概念）

- **接入点①（已做）**：`provider='cli'` 路由 → `LlmClient._chatViaCli` 调 `cliBackends.run(id,{prompt})`（B-3b）。①是"换脑子"：同一对话，外部 agent 只产**回答文本**。
- **接入点②（本卡）**：工具 `agent.delegate`——子任务有**独立上下文**，父只拿**摘要**。工具契约见 §四②。
- `CliBackendRegistry.run(id, opts)`（`cli-backend.js:257`）签名：`{prompt, cwd?, timeoutMs?, allowDangerous?}` → `{text, sessionId, exitCode, stderr, pid, timedOut, error}`；内置 `spawn`（shell:false + argv 数组 + `detached:true` + 超时 `kill(-pid)` 杀组 + stderr ≤512B）。
- **工具契约**（`tool.js`）：`makeTool({name, description, inputSchema, execute(ctx,args), category})`；`ToolRegistry.call(ctx, name, args, {onRun})` 已把每次调用经 `onRun` 写审计。
- **审计缝（已存在）**：`agent.service.ts::_audit` → `INSERT INTO agent.tool_runs (entity_id, tool_name, args, result, latency_ms)`。本卡**复用**，不新建审计表。
- **装配缝**：`agent.service.ts::_agent()` 里 `new AgentCore({..., cliBackends: this.cliBackends ?? null})`（B-3b 已接）。本卡把委派工具 `registerAll` 进 `_teachingTools()` 或就近（作者择一，file-list 说明）。
- **后端续接字段**（B-3a 已声明）：`claude-code.resumeKey='session_id'`、`codex.resumeKey='thread_id'`、`openclaw.resumeKey='sessionId'`、`hermes.resumeKey=null`。

### 🔎 续接 argv 实测（架构师 2026-10-23 实探，**以本行为准**）

- **claude-code**：`claude -p <prompt> ... --resume <session_id>`（`-r, --resume [value]`；续最近可用 `-c/--continue`）。**续接时 session_id 即 B-3a 从 stream-json 解析的 `session_id`。**
- **codex**：`codex exec resume <SESSION_ID> <PROMPT> --json --skip-git-repo-check`（子命令 `exec resume [SESSION_ID] [PROMPT]`；省略 id 用 `--last`）。**session 即 B-3a 解析的 `thread_id`。**
- **openclaw**：`agent exec --json --cwd <dir> <msg>`；**无显式 resume flag**（`--isolated` 会缺鉴权，B-3a 已实测）→ **本卡不给 openclaw 做续接**（传 resumeKey 也忽略，退化为新上下文）。
- **hermes**：`-z <prompt>` one-shot，`resumeKey=null` → **无续接**。

**即：`resumeKey` 只对 `claude-code` / `codex` 有意义**；其余后端传了也退化为"每次新上下文"，须在 file-list 明示。

## 🎯 本卡目标（四条）

1. **新增 `packages/agent-core/src/cli-delegate.js`**：导出 `createDelegateTool({ cliBackends, cwdAllowlist })` → 返回一个 `makeTool` 产物，`name='agent.delegate'`。**底座侧只做工具工厂，不 import 业务、不读 env、不碰密钥。**
2. **`cli-backend.js` 续接支持**：`run(id, opts)` 的 `opts` 增可选 `resumeKey`；`buildArgs({prompt, cwd, resumeKey})` 对 `claude-code` / `codex` 追加对应续接 argv（见上实测）；无续接能力的后端忽略之（不报错）。**保持既有 `run(id,{prompt})` 调用零回归**（B-3b/既有测不受影响）。
3. **cwd 白名单（§八第 3 条）**：`createDelegateTool` 收 `cwdAllowlist`（默认 `['/home/ubantu/GRI']`）；`agent.delegate` 的 `cwd` 参数**必须落在白名单内**（含子路径用前缀判定），越界**明确拒绝**（返回 `{ok:false,error}` 或抛错，不静默）。
4. **装配**：`agent.service.ts` 把该工具注册进学生 agent 工具表（默认 `cwdAllowlist=['/home/ubantu/GRI']`），经既有 `onRun` 落审计。

## 🔴 硬约束（违反即失败）

| # | 约束 |
|---|---|
| C1 | **默认只读**：本卡 `agent.delegate` **不开放** `allowDangerous`（不得传 `true`）；`bypassPermissions`/`--dangerously-*`/`--yolo` 仍被 DENYLIST 挡下 |
| C2 | **cwd 白名单强制**：越界拒绝；不得接受任意绝对路径；默认 `['/home/ubantu/GRI']`，可由配置扩（不写死） |
| C3 | **底座不 import 业务、不读 env、不碰 apiKey/token**（沿用 B-1/B-3a/B-3b 红线）；CLI 只经 `CliBackendRegistry` |
| C4 | **prompt 走 argv 数组**；本卡不得把密钥/token 拼进 prompt 或 argv |
| C5 | **超时**：委派必须带 `timeoutMs`（取后端默认或调用方传入），超时由 B-3a 杀进程组；失败**明确上抛/明确返回 error**（不得静默返回空） |
| C6 | **审计**：每次委派经 `onRun` 落 `agent.tool_runs`（后段 id、argv 摘要、耗时、退出码、结果摘要）；**不落完整 prompt**（可含敏感） |
| C7 | **类型同步**：`index.d.ts` 补 `createDelegateTool` 与新 opts 字段 |
| C8 | **零回归**：`packages/agent-core` `node --test` 全绿；`services/api` `npx tsc --noEmit`=0、`npx jest` 全绿 |
| C9 | 不 commit / 不 checkout / 不 push；**不得执行 `git push`**（含任何形式）；末行 `FAIL=0` |
| C10 | CLI 调用返回/日志**不落完整 prompt**、stderr 摘要 ≤512B（沿用 B-3a）；无 console |

## 📦 产出物

1. `packages/agent-core/src/cli-delegate.js`：`createDelegateTool({cliBackends, cwdAllowlist})` → `agent.delegate` Tool（含 cwd 白名单校验 + 超时 + error 上抛）。
2. `packages/agent-core/src/cli-backend.js`：`run`/`buildArgs` 增 `resumeKey` 支持（claude-code/codex 续接 argv；其余忽略）。
3. `packages/agent-core/src/index.js`：导出 `createDelegateTool`（如适用）。
4. `packages/agent-core/index.d.ts`：类型同步。
5. `packages/agent-core/tests/cli-delegate.test.js`（新）：cwd 白名单拒/放、run 桩调用、超时/抛错上抛、resumeKey argv 组装、无续接后端忽略。
6. `services/api/src/modules/agent/agent.service.ts`（或就近）：注册 `agent.delegate`（默认白名单）。
7. `.agents/claude/outputs/b3c-file-list.md` + `.agents/claude/outputs/b3c-verify.sh`。

## ✅ 验收标准

1. **工具注册**：`agent.delegate` 出现在学生 agent 工具表（`list()` 含之）。
2. **cwd 白名单**：`cwd` 在白名单内 → 放行；`cwd='/tmp'`（越界）→ **明确拒绝**（不 spawn）。
3. **正常委派**：注入桩 `cliBackends.run` 回 `{text:'摘要', exitCode:0}` → `execute` 返回含摘要；**父只拿摘要**（不回 child 中间产物）。
4. **超时/错误**：桩 `run` 抛错 / `timedOut:true` → 工具返回 `ok:false` 或抛错（**不得返回空成功**）。
5. **续接**：`resumeKey` 传入 → claude-code argv 含 `--resume <id>`、codex argv 形如 `exec resume <id> <prompt>`；hermes/openclaw 传了忽略（不报错）。
6. **默认只读**：`agent.delegate` 调用**不含**任何 DENYLIST token（断言 argv）；不得传 `allowDangerous:true`。
7. **审计**：调用一次后 `agent.tool_runs` 有对应行（或 `onRun` 被以含 `tool_name='agent.delegate'` 调用）。
8. **真跑（可选但建议）**：委派"读某文件并总结"只读子任务给 `claude-code`，父拿到非空摘要（本机已证 claude-code 真通）。
9. **零回归 + C9**：core 测全绿；api `tsc`=0、`jest` 全绿；`verify.sh` 末行 `FAIL=0`；零明文。

## 🧪 复验脚本要求

`b3c-verify.sh` 覆盖：① 工具已注册；② cwd 越界拒绝 / 白名单内放行；③ 桩委派返回摘要；④ 桩抛错/超时上抛（不静默）；⑤ resumeKey argv（claude-code/codex 含续接、hermes/openclaw 忽略）；⑥ 默认只读（argv 不含 DENYLIST）；⑦ 审计触发；⑧（可选）claude-code 真跑；⑨ core+api 零回归；⑩ 末行 `FAIL=0`。

## ❓ 需确认

无。（开放设计点自行决定，在 file-list 说明：委派工具注册位置、`cwdAllowlist` 配置来源、`goal` 是否拼 persona/上下文——按最小必要，且**不得**拼密钥。）
