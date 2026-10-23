# B-3b 交付清单：`provider='cli'` 路由分支 —— 外部 agent 接进 ModelRouter（按用户可选、默认关闭）

> 执行者：Claude ｜ 日期：2026-10-23 ｜ 分支：`feat/stage-c-unified-auth-shell`（**未 commit / 未 checkout / 未 push**）
> 依据：`docs/EXTERNAL_AGENT_HARNESS.md` §四①/§五（**灵魂**）｜ `docs/AGENT_LAYERING.md`｜ `docs/AI_PRODUCTIZATION_OPTIONS.md` §七
> 依赖：B-3a（`40ea83c`，`CliBackendRegistry` + 四后端 + 共享 `cliBackends`）
> 定位：**「换脑子」接入点** —— 某 routeKey 的路由行 `provider='cli'` 时，该 routeKey 的 LLM 调用改由 B-3a 的 `CliBackendRegistry` 执行；**不改默认行为**。

---

## 一、交付文件（7 项，均在任务卡「产出物清单」内）

| # | 文件 | 状态 | 说明 |
|---|------|------|------|
| 1 | `packages/agent-core/src/model-router.js` | 改（+16 −6 行） | `resolve` 增 `cliBackend` 信号 + `source='route:cli'`；`isRealKey` 对 cli 路由视为真 |
| 2 | `packages/agent-core/src/llm-client.js` | 改（+66 −9 行） | 构造收 `cliBackends`；`chat()` CLI 分支（`_chatViaCli`，不 POST）+ `isRealKey` cli 语义 + `_promptFromMessages` |
| 3 | `packages/agent-core/src/agent.js` | 改（+2 −1 行） | deps 透传 `cliBackends` 给默认 `LlmClient`（缺省 `null`） |
| 4 | `packages/agent-core/index.d.ts` | 改（+9 −3 行） | `LlmConfig.cliBackend`/`source:'route:cli'`；`LlmClient` 构造第二参 + `chat` 返回 `toolCalls`；`AgentCoreDeps.cliBackends` |
| 5 | `packages/agent-core/tests/model-router.test.js` | 改（+34 行 / 3 测） | cli 信号 / 默认零回归 / disabled 不算数 / default 兜底 |
| 6 | `packages/agent-core/tests/llm-client-cli.test.js` | **新**（6 测） | CLI 分支走桩不发 HTTP / isRealKey / 抛错上抛 / timedOut / 空文本 / 未注入 registry |
| 7 | `services/api/src/modules/agent/agent.service.ts` + `agent.module.ts` | 改（+14 / +9 行） | 令牌 `AGENT_CLI_BACKENDS` 注入（默认 `null`）；module 提供共享 `cliBackends` |
| 8 | `.agents/claude/outputs/b3b-file-list.md` + `b3b-verify.sh` | **新** | 本文件 + 复验脚本（末行 `PASS=34 FAIL=0 VERIFY_EXIT=0`） |

**未改动**其他任何模块文件；未 `commit` / `checkout` / `push`；零明文（无密钥/token 落盘或打印）。

---

## 二、接线契约（实现要点）

### 1. 信号（`ModelRouter.resolve`）

```js
// 只看**路由行**（不看 env，C2）：该 routeKey 存在 enabled 的 provider='cli' 行 → 走 CLI
const isCli = !!row && row.provider === 'cli';
{ provider, model, multimodalModel, baseUrl, apiKey,
  cliBackend: isCli ? row.model || null : null,   // provider='cli' → model 字段即后端 id；其余恒 null
  source:     isCli ? 'route:cli' : <既有 route|env|cred|route+cred> }
```

- **`model` = 后端 id**（`claude-code`/`codex`/`openclaw`/`hermes`）。
- `source` 既有四值**一字不改**；仅 cli 分支新增 `'route:cli'`。
- `_pick` 的「越具体越优先」沿用 → `default` 的 cli 行也让所有 routeKey 走 CLI（doc §五「默认全站」）。
- `isRealKey()` 对 cli 路由 → `true`（否则 `AgentCore.run` 会误判无 key 落 `_mock`）。

### 2. 分支（`LlmClient.chat`）

```js
if (cfg.cliBackend || cfg.provider === 'cli') return this._chatViaCli(cfg, messages, opts); // 不发 HTTP
// _chatViaCli:
//   registry 未注入 / run 抛错 / timedOut / error / 空文本 → **一律明确抛错**（C5，不静默返回空）
//   → { content: res.text, usage: null, toolCalls: null }
```

- **失败语义**：`registry` 未注入 → `拒绝静默降级`；`run` 抛错 → 原样上抛；`res.timedOut || res.error` → `调用失败：<why>`；空文本 → `拒绝静默返回空`。
- `AgentCore._real` 拿到的 `toolCalls=null` 自然退化为「无工具调用 → 直接产出」，CLI 结果当 assistant 回复（**同一对话，换脑子**）。

### 3. 装配（不硬编码）

- 底座：`LlmClient(resolveConfig, cliBackends = null)`、`AgentCore({ …, cliBackends = null })` —— **缺省 null → 行为同今日**。
- 宿主：`agent.service.ts` 定义并 `@Optional() @Inject(AGENT_CLI_BACKENDS)` 注入（缺省 `undefined → ?? null`）；`agent.module.ts` `{ provide: AGENT_CLI_BACKENDS, useValue: cliBackends }`（B-3a 进程级共享注册表）。
- 注册表是**零成本**的声明式描述（构造不 spawn）；**只有 cli 路由行存在时才被 `run`** → 「仅当出现 cli 路由才真正启用」。

---

## 三、两处实现口径（卡面授权「实现者按最小必要决定并说明」）

1. **prompt 组装口径 = 本轮 user message**（卡面默认）。
   `_promptFromMessages(messages)` 取最后一条 `role='user'` 的消息文本；不含 system/persona（CLI agent 自带人格与工具，喂入 GRI 内部工具清单反而混淆）。会话续接（`resumeKey`）按卡面**留 B-3c**。
2. **timeout 取值**：`opts.timeoutMs` 显式传入时透传；未传则**由 B-3a 用后端默认**（claude-code 600s / codex 900s / …）——即卡面「resolve 的 row/后端默认」中的**后端默认**（`llm_routes` 无 timeout 列，故 row 侧无值可取）。
3. **cli 行若同时有密文凭据**：`source` 取 `'route:cli'`（cli 分支优先），`apiKey` 仍照旧解析但不参与 CLI 调用（CLI 用自持登录态，C4：密钥永不进 prompt/argv）。

---

## 四、自检结果（命令 + 实际输出摘要）

```bash
# ① 底座单测
cd packages/agent-core && npm test
#   ℹ tests 98  ℹ pass 98  ℹ fail 0        ← 既有 89 测 + 新增 9（model-router +3 + 新文件 llm-client-cli 6），零回归

# ② API 类型检查
cd services/api && npx tsc --noEmit
#   TSC_EXIT=0

# ③ API 全量测试
cd services/api && npx jest
#   Test Suites: 48 passed, 48 total
#   Tests:       646 passed, 646 total

# ④ 复验脚本
bash .agents/claude/outputs/b3b-verify.sh
#   PASS=34 FAIL=0 VERIFY_EXIT=0   （含 §6 claude-code 真跑：端到端得非空文本）
```

### 验收标准逐条对照

| # | 标准 | 证据 |
|---|------|------|
| 1 | 默认零回归（无 cli 行 resolve 除 `cliBackend:null` 外一致） | verify §1.1 快照逐字段一致；§1.2 非 cli 行 `cliBackend=null & source=route`；core 98 + api 646 全绿 |
| 2 | cli 信号 | verify §2.1 `cliBackend==='claude-code'`；§2.2 `source==='route:cli'` |
| 3 | CLI 分支走桩、`content==='OK'`、未发 HTTP | verify §3.1–§3.6（`fetch 命中 0`；`runOpts` 无密钥字段） |
| 4 | isRealKey cli → true | verify §2.4（router）+ §4.1（client） |
| 5 | 桩抛错 / timedOut → 明确抛错 | verify §5.1–§5.4（含空文本、未注入 registry） |
| 6 | 真跑 claude-code 端到端非空文本 | verify §6.1 PASS（`resolve→provider:cli/cliBackend:claude-code`，`chat` 回文本，无 HTTP） |
| 7 | 零回归 + 末行 FAIL=0 + 零明文 | verify §7 + 末行 `PASS=34 FAIL=0 VERIFY_EXIT=0`；§8 底座合规/零明文 |

---

## 五、设计模式与红线合规

| 红线 | 落实 |
|------|------|
| **本体驱动** | 无结构变更（`cliBackend` 是解析态派生字段，非持久化结构；路由真源仍是 `agent.llm_routes`，无需迁移） |
| **OO 四特性** | 多态：`provider` 分支把「模型后端」抽象成可替换实现（HTTP provider vs CLI backend），调用方（`AgentCore`）零感知 |
| **设计模式** | **Strategy（策略）**：`provider='cli'` 是新策略分支，与既有 HTTP 策略同接口（`chat → {content,usage,toolCalls}`）；**Registry（B-3a）**：后端按 id 注册/查取；**Null Object**：`cliBackends` 缺省 `null` → 无 CLI 能力但接口不崩（真正调用才 fail-fast） |
| **fail-fast** | cli 路由无 registry / run 抛错 / timedOut / 空文本 → **明确抛错**，绝不静默返回空或降级 |
| **身份唯一真源** | 未触碰 |

---

## 六、未决项

无。（`❓ 需确认` 空项。）

- `prompt` 组装口径与 `timeout` 取值按卡面授权已在 §三 说明；`resumeKey` 会话续接留 **B-3c**（卡面既定）。
- 可选真跑依赖本机已装 `claude`（本机已证通）；离线环境可 `B3B_SKIP_REAL=1` 跳过 §6（记 SKIP，不影响 `FAIL=0`）。
