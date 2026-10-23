# B-3b：`provider='cli'` 路由分支 —— 把外部 agent 接进 ModelRouter（按用户可选、默认关闭）

> 执行者：**Claude** ｜ 波次：AI 产品化 · B-3 第二卡 ｜ 依赖：B-3a（已提交 `40ea83c`）｜ 状态：待下达（串行）
> 依据：`docs/EXTERNAL_AGENT_HARNESS.md` §四①/§五（**本卡灵魂**）｜ `docs/AGENT_LAYERING.md`｜ `docs/AI_PRODUCTIZATION_OPTIONS.md` §七
> 定位：**「换脑子」接入点** —— 当某 routeKey 的路由行 `provider='cli'` 时，该 routeKey 的 LLM 调用改由 B-3a 的 `CliBackendRegistry` 执行；**不改默认行为**。

## 📥 承重事实（架构师已核对现有代码，按此接线，勿另造概念）

- `ModelRouter.resolve(routeKey)` → `{provider, model, multimodalModel, baseUrl, apiKey, source}`；`_pick` 从具体键→`default` 取首个 `enabled` 行（`packages/agent-core/src/model-router.js`）。
- `AgentCore.run`（`agent.js`）：先 `this.llm.isRealKey(routeKey)` 判定；真→`_real`（`this.llm.chat(messages, routeKey, opts)` 工具循环）；假→`_mock`。
- `LlmClient.chat`（`llm-client.js`）：向 `cfg.baseUrl` POST，`Authorization: Bearer ${apiKey}`。`isRealKey` 现判 `apiKey.startsWith('nvapi-')`。
- 路由写入面：`PUT /api/agent/admin/routes`（`agent-admin.controller.ts` → `ModelRouter.set`）。B-3a 已导出 `cliBackends` / `createCliBackendRegistry`。

**语义约定（本卡核心）**：路由行 `provider='cli'` 时，**`model` 字段即 B-3a 的 backend id**（`claude-code`/`codex`/`openclaw`/`hermes`）。
用户可选 = **该 routeKey 是否存在 enabled 的 `provider='cli'` 行**：无 → 走原路径（**默认态，零回归**）；有 → 走 CLI 后端。

## 🎯 本卡目标（三条）

1. **`ModelRouter.resolve` 增 `cliBackend` 信号**：`provider==='cli'` 时补 `cliBackend = <model>`（缺省 `null`）；其余分支不受影响。可在 `_envDefaults`/`resolve` 内判别并保留 `source` 语义（新增 `'route:cli'` 或等价，勿破坏既有 `route|env|cred|route+cred`）。
2. **`LlmClient` 增 CLI 分支**：`chat()` 前若 `cfg.provider==='cli'`（或有 `cliBackend`）→ 不 POST，改调注入的 `CliBackendRegistry.run(cliBackend, {prompt, cwd?, timeoutMs?})`，把 `res.text` 当 `content` 返回 `{content, usage:null, toolCalls:null}`；`isRealKey()` 对 cli 路由 → 视为真（否则会误落 `_mock`）。
3. **装配注入（不硬编码）**：`AgentCore`/`LlmClient` 经 deps 注入 `cliBackends`（默认 `null` → 行为同今日）；`agent.module.ts` 处按现有模式接线，**仅当**出现 cli 路由才真正启用。

## 🔴 硬约束（违反即失败）

| # | 约束 |
|---|---|
| C1 | **默认关闭**：无 enabled 的 `provider='cli'` 行 → 行为与今日**逐字节一致**（既有 62+ 测、api 646 测全绿） |
| C2 | **按用户可选**：仅依据该 routeKey 的 `agent.llm_routes` 行；不得引入全局开关/env 覆盖（可选注入仍需显式） |
| C3 | **底座不 import 业务、不读 env**（沿用 B-1/B-3a 红线）；CLI 调用只经 `CliBackendRegistry` |
| C4 | **prompt 走 argv 数组**（B-3a 已保）；本卡不得把密钥/token 拼进 prompt 或 argv |
| C5 | **超时**：CLI 调用必须带 `timeoutMs`（`resolve` 的 row/后端默认，取合理值），超时由 B-3a 杀进程组；失败**明确上抛或明确降级**（不得静默返回空） |
| C6 | **类型同步**：`index.d.ts` 补 `resolve` 新字段 / `LlmClient` cli 分支形状 |
| C7 | **零回归**：`packages/agent-core` `node --test` 全绿；`services/api` `npx tsc --noEmit`=0、`npx jest` 全绿 |
| C8 | 不 commit / 不 checkout / 不 push；末行 `FAIL=0` |

## 📦 产出物

1. `packages/agent-core/src/model-router.js`：`resolve` 增 `cliBackend` 信号。
2. `packages/agent-core/src/llm-client.js`：`chat()` CLI 分支 + `isRealKey` cli 语义（`cliBackends` 可注入）。
3. `packages/agent-core/src/agent.js`：deps 透传 `cliBackends`（若需）。
4. `packages/agent-core/index.d.ts`：类型同步。
5. `packages/agent-core/tests/model-router.test.js`（或新 `llm-client-cli.test.js`）：cli 分支单测。
6. `services/api/src/modules/agent/agent.module.ts`（或就近）：按现有模式注入（默认 null）。
7. `.agents/claude/outputs/b3b-file-list.md` + `.agents/claude/outputs/b3b-verify.sh`。

## ✅ 验收标准

1. **默认零回归**：无 cli 行 → `resolve` 输出与改前一致（除新增 `cliBackend:null`）；agent-core + api 全绿。
2. **信号**：`provider='cli', model='claude-code'` 行 → `resolve(routeKey).cliBackend === 'claude-code'`。
3. **CLI 分支**：注入桩 `cliBackends`（`run` 回 `{text:'OK'}`）→ `LlmClient.chat(...)` 走 CLI、返回 `content==='OK'`，**未发 HTTP**（断言 fetch 未被调用）。
4. **isRealKey**：cli 路由 → `true`（不落 `_mock`）。
5. **超时/错误**：桩 `run` 抛错 / `timedOut` → `chat` 明确抛错（不得返回空 mock）。
6. **真跑（可选但建议）**：`provider='cli', model='claude-code'` 端到端一次只读问答得非空文本（本机已证真通）。
7. **零回归 + C8**：core 测全绿；api `tsc`=0、`jest` 全绿；`verify.sh` 末行 `FAIL=0`；零明文。

## 🧪 复验脚本要求

`b3b-verify.sh` 覆盖：① 无 cli 行零回归（resolve 快照比对）；② cli 信号；③ CLI 分支走桩不发 HTTP；④ isRealKey；⑤ 桩抛错上抛；⑥（可选）claude-code 端到端；⑦ core+api 零回归；⑧ 末行 `FAIL=0`。

## ❓ 需确认

无。（`prompt` 组装口径：默认取「本轮 user message」，如需带 persona/system 由实现者按最小必要决定并在 file-list 说明；`resumeKey` 会话续接留 B-3c。）
