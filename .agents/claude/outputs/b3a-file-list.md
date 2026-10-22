# B-3a 交付清单：外部 agent 后端 —— `CliBackendRegistry` + 四后端

> 执行者：Claude ｜ 日期：2026-10-23 ｜ 分支：`feat/stage-c-unified-auth-shell`（未 commit）
> 依据：`docs/EXTERNAL_AGENT_HARNESS.md`（灵魂文件）｜ `docs/AGENT_LAYERING.md` 判据 1/2/3
> 定位：给底座加**第二类模型后端**端口。**本卡只做端口 + 四后端定义 + 只读问答**；不接路由（B-3b）、不做委派（B-3c）。

---

## 一、交付文件（5 项，均在任务卡「产出物清单」内）

| # | 文件 | 状态 | 说明 |
|---|------|------|------|
| 1 | `packages/agent-core/src/cli-backend.js` | 续写（半成品基础上补齐） | `CliBackendRegistry` + 四后端 + `BACKENDS` + `DENYLIST` + 执行器；**新增** `createCliBackendRegistry()` / `cliBackends`（默认注册表） |
| 2 | `packages/agent-core/src/index.js` | 改（+12 行） | 增导出：注册表、`DENYLIST`、`findDeniedArg`、`BACKENDS`、四具名后端、工厂与默认实例 |
| 3 | `packages/agent-core/index.d.ts` | 改（+73 −1 行） | 补 `CliBackend` / `CliParseResult` / `CliRunResult` / `CliBackendRegistry` / `BACKENDS` / 四后端 / 工厂 |
| 4 | `packages/agent-core/tests/cli-backend.test.js` | 新（27 测） | 端口 / argv ×4 / 解析器三方 / DENYLIST / 注入 / 超时杀 / 零静默 / ENOENT / 截断 |
| 5 | `.agents/claude/outputs/b3a-file-list.md` + `b3a-verify.sh` | 新 | 本文件 + 复验脚本（末行 `PASS=67 FAIL=0 VERIFY_EXIT=0`） |

**未改动**其他任何模块文件；未 `commit`/`checkout`/`push`。

### 超出卡面的两处增补（理由）

1. **`createCliBackendRegistry(extra)` + `cliBackends`（进程级默认注册表）**
   卡面验收 ① 要求「`get('claude-code'|…)` 均可得；`list()` 回 4 个」。半成品只有类、无默认实例，"预装四后端"的装配动作无处落地。增补一个工厂 + 默认实例，既是验收入口，也是 **B-3b 接路由时的装配点**（装配哪些后端=部署配置，不进底座语义，符合判据 3）。零风险：纯新增导出，不改既有语义。

2. **`index.js` 同时导出四个具名后端**（`claudeCodeBackend` …）
   卡面只点名 `BACKENDS`。导出具名便于单测直接断言 argv、也便于装配层覆盖单个后端。纯新增。

---

## 二、契约形状（实现要点）

```js
new CliBackendRegistry([...])     // 或 (id→后端 映射)
  .register(b)   // id 必填唯一；撞名 → throw（含 id/bin 诊断，绝不静默覆盖）；非法后端 fail-fast
  .registerAll(bs) .has(id) .get(id) .list()   // list() 只回可序列化字段 {id,label,bin,timeoutMs,resumeKey}
  .run(id, { prompt, cwd?, timeoutMs?, allowDangerous? })  // → CliRunResult
```

`CliRunResult` = `{ text, sessionId, exitCode, stderr(≤512B), pid, timedOut, error, signal }`。

**执行器安全铁律**：`spawn(bin, args, { cwd, shell:false, detached:true, stdio:['ignore','pipe','pipe'] })`
→ prompt 恒为 **argv 数组元素**（字符串拼接禁止，防注入）；`detached` 建独立进程组，超时 `process.kill(-pid, 'SIGKILL')` **整组杀**；stdin 置 ignore 防 CLI 等 stdin 挂起。

### 四内置后端（argv 按 2026-10-22 实测）

| id | bin | buildArgs | 解析 | timeoutMs |
|---|---|---|---|---|
| `claude-code` | `claude` | `-p <prompt> --output-format stream-json --verbose --permission-mode default` | 逐行 stream-json，**只取 `type==='result'` 行**的 `result`；`session_id` 全程更新 | 600000 |
| `codex` | `codex` | `exec <prompt> --json --skip-git-repo-check` | 逐行 JSONL：`thread.started.thread_id` → sessionId；`item.completed.item.type==='agent_message'.text` → text | 900000 |
| `openclaw` | `openclaw` | `agent exec --json --cwd <cwd> <prompt>` | **非逐行**（多行 pretty JSON 信封）→ `parseOutput` 整体解析：`final`（回退 `payloads[].text`）+ `sessionId` | 600000 |
| `hermes` | `hermes` | `-z <prompt>` | 纯文本逐行追加（`append:true`） | 600000 |

`DENYLIST`（C3）：`--dangerously-skip-permissions`、`--allow-dangerously-skip-permissions`、`--dangerously-bypass-approvals-and-sandbox`、`--dangerously-bypass-hook-trust`、`--yolo`、`bypassPermissions`。
`findDeniedArg(args)` 额外命中 `--dangerously-bypass*` **前缀族**与 `bypassPermissions`（大小写不敏感）**取值**。默认 argv 永不含；`allowDangerous:true` 才追加后端 `dangerousFlags`；未放权时 `run` 还会**兜底复查**（防后端 `buildArgs` 误加 → 直接拒绝执行，不 spawn）。

---

## 三、⚠️ 与任务卡「实测表」的偏差（按 CLI 实况为准，已注明）

| 项 | 卡面预期 | 本轮实测 | 处置 |
|---|---|---|---|
| `openclaw` | 本机缺鉴权（`No route-compatible authentication source…`） | **真跑通过**：`{"ok":true,"status":"ok","final":"ok",…,"sessionId":"…"}`，exit 0（ambient provider 凭据当前已就绪） | 解析器与 argv 不变；`b3a-verify.sh` 对 openclaw **容错**：**成功或有明确前置报错**都算通过，**静默/挂死 = FAIL** |
| `hermes` | headless 挂起 | **复现**：60s 无输出（RC=124）；30s 超时被杀 | 强制超时 + 明确报错为唯一合法结果；verify 断言 `timedOut=true && error≠null` |
| `openclaw` argv | 卡面给的是 `agent exec`（灵魂文件 §二 旧表写 `agent --local --json -m`） | 按卡面 `agent exec --json --cwd <dir> <msg>` 实现并实测通过 | 以卡面为准；灵魂文件旧表可后续对齐 |

---

## 四、验收标准逐条自证

### ① 端口（C2）
```bash
node --test --test-force-exit "tests/cli-backend.test.js"
# ✔ registry: 默认注册表含四内置后端，get/has/list 一致
# ✔ registry: 撞名 register 抛错 + 诊断（不静默覆盖）
# ✔ registry: 非法后端 fail-fast（缺 id/bin/buildArgs/parseLine）
# ✔ registry: createCliBackendRegistry 预装四后端并可追加（追加撞名抛错）
```
撞名 → `Error: CLI 后端 id 冲突：'dup' 已注册（bin=echo），拒绝覆盖为 bin=other-bin；请改用唯一 id`。

### ② argv（单测断言，不真 spawn）
`✔ argv: claude-code（stream-json 必须带 --verbose）` / `✔ argv: codex` / `✔ argv: openclaw（agent exec + --cwd + 末位 msg）` / `✔ argv: hermes（one-shot -z）` —— 四后端逐项 `deepEqual`，与卡面 §2 字面一致。

### ③ 解析器三方样例
`✔ parse: claude-code stream-json 取 result 行文本 + session_id`（且 `assistant` 增量**不**被当文本）
`✔ parse: codex JSONL 取 item.completed(agent_message).text + thread_id`（`reasoning` item 不产出）
`✔ parse: hermes 纯文本逐行追加（append）`
`✔ parse: openclaw 多行 JSON 信封取 final（回退 payloads[].text）+ sessionId`

### ④ DENYLIST（C3）
```bash
node helper denylist   # 真 spawn echo 端到端观测 argv
# → 未放权 argv='hello'；显式放权 argv='hello --yolo'
```
`✔ DENYLIST: findDeniedArg 命中清单项与危险前缀族`
`✔ DENYLIST: 未放权时 run 拒绝含危险旗标的 argv（不 spawn）`
`✔ DENYLIST: 显式 allowDangerous 才追加 dangerousFlags（端到端观测 argv）`
`✔ argv: 四后端默认 argv 均不含危险旗标（C3 最小权限）`

### ⑤ 真跑（只读，prompt = `reply exactly: ok`）
```
PASS  §5.claude-code 只读真跑通过（text 非空，len=2，exitCode=0）
PASS  §5.codex       只读真跑通过（text 非空，len=2，exitCode=0）
PASS  §5.openclaw    只读真跑通过（text 非空，len=2，exitCode=0）
PASS  §5.hermes      挂起被超时杀且明确报错（timedOut=true exitCode=124）：超时（>30000ms）已杀进程组…
```
`claude-code`/`codex` 必过 ✅；`openclaw` 环境已就绪、真跑通过 ✅；`hermes` 挂起但**明确报错、不静默、不挂死** ✅。

### ⑥ 超时杀 + 无孤儿（C5）
```
PASS  §6.1 极小 timeoutMs → timedOut=true
PASS  §6.2 超时退出码 = 124
PASS  §6.4 ps 验证无孤儿（pid=25145 已消亡）
PASS  §6.5 进程组内无残留（pgrep -g = 0）
```

### ⑦ 零回归（C9/C10）
```bash
cd packages/agent-core && node --test --test-force-exit "tests/**/*.test.js"
# ℹ tests 89  ℹ pass 89  ℹ fail 0        （基线 62 → 89，+27 新测，既有 0 变红）
cd services/api && npx tsc --noEmit
# (无输出) TSC_EXIT=0
cd services/api && npx jest --silent
# Test Suites: 48 passed, 48 total
# Tests:       646 passed, 646 total
```

### ⑧ 零明文 / 底座合规
```
PASS  §8.1 底座不读 env（process.env 命中 0）
PASS  §8.2 仅 import node:child_process（无业务依赖）
PASS  §8.5 源码无密钥字面量/apiKey 赋值（C1）
PASS  §8.6 源码无 console 打印（不落 prompt/明文）
PASS  §8.9 stderr 摘要上限 512B（C6）
```

---

## 五、复验方式

```bash
cd /home/ubantu/GRI
bash .agents/claude/outputs/b3a-verify.sh          # 全量（含 §5 四 CLI 真跑，约 1–3 分钟）
B3A_SKIP_REAL=1 bash .agents/claude/outputs/b3a-verify.sh   # 离线（跳过真跑）
# 末行： PASS=67 FAIL=0 VERIFY_EXIT=0
```

脚本用 `mktemp` 在 `/tmp` 落**临时 helper**（跑完即删），不在仓库写任何运行产物（C7）。

---

## 六、未决项 / 交给下游（B-3b / B-3c）

1. **❓ 尚未接路由**：本卡刻意不含 `ModelRouter` 的 `provider='cli'` 分支（灵魂文件 §五）。B-3b 需在 `agent.llm_routes` 加该分支 → `cliBackends.run(model, {prompt})`，把 `text` 当 assistant 回复。**尊重 `enabled` 缺省=不用**（零回归兜底）。
2. **❓ 尚未做委派工具**：`agent.delegate` 工具（灵魂文件 §四②）属 B-3c；本卡已备好 `run()` 返回的 `sessionId`，`resumeKey` 字段已声明但**未消费**——续话/`--resume` 由 B-3c 决定。
3. **❓ `hermes` 前置条件**：本机挂起原因未定位（`hermes status` 正常）。本卡只保证"不挂死 + 明确报错"；若要真用 hermes，需 B-3b 前先修其 headless 入口（或提供 `--url` 网关）。
4. **❓ 灵魂文件 §二旧表待对齐**：`docs/EXTERNAL_AGENT_HARNESS.md` §二 仍写 openclaw `agent --local --json -m` 与 codex 表列（本卡按卡面实测 argv 实现）。建议架构师更新该表，避免 B-3b 误读。
