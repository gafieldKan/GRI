# B-3a：外部 agent 后端 —— CliBackendRegistry + 四后端（claude-code / codex / openclaw / hermes）

> 执行者：**Claude** ｜ 波次：AI 产品化 · B-3 首卡 ｜ 依赖：B-1（已提交 `8fb1fb5`）｜ 状态：待下达（串行）
> 依据：`docs/EXTERNAL_AGENT_HARNESS.md`（**本卡灵魂文件**）｜ `docs/AGENT_LAYERING.md`（分层判据）｜ `docs/AI_PRODUCTIZATION_OPTIONS.md` §七（裁决）
> 定位：给底座加"外部 agent 后端"端口（第二类模型后端）；本卡**只做端口 + 四后端定义 + 只读问答**，**不接路由、不做委派**（B-3b/B-3c）。

## 📥 承重事实（架构师 2026-10-22 **实测**，非推测——务必按此写 argv）

四 CLI 均已装，但**非交互可用性不一**：

| 后端 id | bin（实测路径） | 版本 | **实测非交互 argv** | 实测结果 |
|---|---|---|---|---|
| `claude-code` | `claude`（`~/.npm-global/bin/claude`） | `2.1.251` | `claude -p "<prompt>" --output-format stream-json --verbose --permission-mode default` | ✅ 出 stream-json（**必须带 `--verbose`，否则报错**：`--output-format=stream-json requires --verbose`）；首行 `{"type":"system","subtype":"init","session_id":...}`，末尾 `result` 行含最终文本 |
| `codex` | `codex`（`~/.npm-global/bin/codex`） | `codex-cli 0.162.1` | `codex exec "<prompt>" --json --skip-git-repo-check` | ✅ JSONL；`{"type":"thread.started","thread_id":...}`；最终文本在 `{"type":"item.completed","item":{"type":"agent_message","text":"..."}}` |
| `openclaw` | `openclaw`（`~/.npm-global/bin/openclaw`） | `OpenClaw 2026.10.5` | `openclaw agent exec --json --cwd <dir> "<msg>"` | ⚠️ **结构可用**（回稳定 JSON 信封含 `sessionId`），但本机 `--isolated` 时**缺鉴权**：`No route-compatible authentication source is configured for openai`。非 `--local` 的 `agent --json -m` 会撞**exec 归属守卫**。→ 本卡须用 `agent exec`，并**记录前置条件**（需 ambient config 的 provider 凭据，或 `--url` 指网关） |
| `hermes` | `hermes`（`~/.local/bin/hermes`） | `v0.21.5+7014.gaf8839d` | `hermes -z "<prompt>"`（one-shot，仅打最终文本） | ⚠️ **本机 headless ≥120s 无输出即挂起**（`hermes status` 正常；`chat -q --oneshot -Q` 同挂）。→ 本卡须实现 argv + **强制超时**，真跑若挂起则**明确报错**并记录 |

> 结论：**`claude-code` 与 `codex` 真跑必过**；`openclaw`/`hermes` 实现正确 argv + 明确前置报错（**不得静默**）。后端可扩展（`register`）。

- 底座**判据 3 红线**：不许 import 业务；不许读 env（env/master key 由宿主注入，B-1 已立）。
- `packages/agent-core/index.d.ts` 为手写类型契约（B-1 已补 `CredentialStore`/`makeCipher`）——本卡同步补类型。

## 🎯 本卡目标（三条）

1. **新增 `CliBackendRegistry`**（`packages/agent-core/src/cli-backend.js`）：`register/get/list/has`；**id 唯一**；后端=声明式 `{id,label,bin,buildArgs,parseLine,resumeKey?,timeoutMs}`。
2. **四个内置后端**（同文件导出 `BACKENDS`）：`claude-code`/`codex`/`openclaw`/`hermes`，argv 与解析按上表实测。
3. **只读问答执行器** `registry.run(id, {prompt, cwd?, timeoutMs?})`：`spawn(bin, args, {cwd, shell:false, detached:true})` + 行流式解析 + **超时杀进程组** + 返回 `{text, sessionId, exitCode, stderr摘要(≤512B)}`；**默认只读**。

## 🔴 硬约束（违反即失败）

| # | 约束 |
|---|---|
| C1 | 只描述 argv/解析：**不碰 apiKey/token**；不读 env；不 import 业务 |
| C2 | **id 全局唯一**：撞名 `register` 抛错 + 诊断（不静默覆盖） |
| C3 | **默认最小权限**：默认 argv **不含** `--permission-mode bypassPermissions` / `--dangerously-bypass-*` / `--yolo`；这些进 `DENYLIST`，仅显式放权才可加 |
| C4 | **spawn 非 shell**：`spawn(bin, args, {shell:false})`；prompt 走 **argv 数组**，**绝不**字符串拼接（防注入） |
| C5 | **超时必杀进程组**：超 `timeoutMs` → `process.kill(-pid)`，**无孤儿**（`ps` 验证） |
| C6 | **零明文**：返回/日志不落完整 prompt；stderr 摘要截断 ≤512B |
| C7 | **只读**：本卡不写仓库文件、不改 DB；真跑仅只读 prompt（`reply exactly: ok`） |
| C8 | **类型同步**：`index.d.ts` 补 `CliBackendRegistry`/四后端/`BACKENDS`/`run` 形状 |
| C9 | **零回归**：不动既有导出语义；`packages/agent-core` 改前 62 测全绿基线 |
| C10 | 不 commit / 不 checkout / 不 push；`tsc`（api）通过；`node --test` 通过 |

## 📦 产出物

1. `packages/agent-core/src/cli-backend.js`（`CliBackendRegistry` + 四后端 + `BACKENDS` + `DENYLIST`）。
2. `packages/agent-core/src/index.js`：增导出。
3. `packages/agent-core/index.d.ts`：补类型。
4. `packages/agent-core/tests/cli-backend.test.js`（argv / 撞名 / 解析器 / DENYLIST / 超时杀）。
5. `.agents/claude/outputs/b3a-file-list.md` + `.agents/claude/outputs/b3a-verify.sh`。

## ✅ 验收标准

1. **端口**：`register` 撞名抛错；`get('claude-code'|'codex'|'openclaw'|'hermes')` 均可得；`list()` 回 4 个。
2. **argv**（单测断言，不真 spawn）：
   - claude-code → `['-p', prompt, '--output-format','stream-json','--verbose','--permission-mode','default']`
   - codex → `['exec', prompt, '--json','--skip-git-repo-check']`
   - openclaw → `['agent','exec','--json','--cwd', cwd, prompt]`
   - hermes → `['-z', prompt]`
3. **解析器**：样例 stream-json（取 `result`）/ JSONL（取 `item.completed.item.type==='agent_message'.text`）/ 纯文本（hermes 直取）→ 得 `text`（与 `sessionId`，若有）。
4. **DENYLIST**：未放权时 argv 不含 `bypassPermissions`/`--dangerously-bypass*`/`--yolo`；显式放权才含。
5. **真跑（只读）**：`claude-code`、`codex` **必过**（各返回非空 `text`）；`openclaw`/`hermes` **尝试真跑**，若环境未就绪 → 返回**明确错误**（含前置说明），**不得静默/挂死**。
6. **超时**：`timeoutMs` 极小 → 被 kill 且 `exitCode != 0`；`ps` 验证**无孤儿**。
7. **零回归**：`packages/agent-core` `node --test` 全绿；`services/api` `npx tsc --noEmit` = 0。
8. **C10**：`verify.sh` 末行 `FAIL=0`；不 commit/checkout；零明文。

## 🧪 复验脚本要求

`b3a-verify.sh` 须覆盖：① 四后端注册/撞名拒绝；② argv 断言（四后端）；③ 三方解析器样例；④ DENYLIST 阻断/放权对比；⑤ claude-code/codex 只读真跑必过 + openclaw/hermes 明确报错（不静默）；⑥ 超时杀 + 无孤儿；⑦ 零回归（core 测 + api tsc）；⑧ 末行 `FAIL=0`。

## ❓ 需确认

无。四 CLI 实况已在上表给死；如实现中参数再变，**按 CLI `--help` 实况为准并在 file-list 注明偏差**。

## 🔁 本次下达补充（2026-10-23 架构师）
上一轮因 provider **429（Too Many Requests）**中途中断。当前工作树已存在**半成品**：
- ✅ `packages/agent-core/src/cli-backend.js`（461 行，`node --check` 通过，含 `DENYLIST`/`findDeniedArg`/`BACKENDS`/`CliBackendRegistry`）。
- ❌ 尚缺：`src/index.js` 增导出、`index.d.ts` 类型、`tests/cli-backend.test.js`、`.agents/claude/outputs/b3a-file-list.md`、`.agents/claude/outputs/b3a-verify.sh`。

**请先读现有 `cli-backend.js` 再续写**（勿从零重写；逐条补齐「产出物清单」缺项），并让 `b3a-verify.sh` 末行 `FAIL=0`。若再次遇 429，记录并重试同一步（≤3 次）。
