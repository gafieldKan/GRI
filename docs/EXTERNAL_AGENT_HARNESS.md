# GRI 底座：外部 Agent 调用契约（本地已装 agent 后端）

> 需求：GRI 的 AI 底座（`packages/agent-core`）**能调用本机已安装的其他 agent**（Claude Code / Codex / OpenClaw / Hermes…），把它们当成一类"可委派的外部推理后端"。
> 追加需求（2026-10-22 用户口径，本版并入）：
> **① 应用 agent（代码开发 agent）可接入本机 `claude code` / `codex`；② 业务 agent 也可接入本机 `openclaw` / `hermes`；③ 应用 agent 与业务 agent 是否使用本地已装 agent，由用户按配置选择。**
> 对标：OpenClaw `registerCliBackend`（`docs/plugins/cli-backend-plugins.md`）+ Hermes `delegate_tool` / `agent/transports/*`。
> 依据分层判据：`docs/AGENT_LAYERING.md`。术语对齐：`docs/AI_PRODUCTIZATION_OPTIONS.md`（base / business / application 三层）。

---

## 一、定位（放哪一层？）

外部 CLI agent 调用 **属底座能力**（判据 1/2：换行业仍成立、换场景不改代码）——它是**通用"委派执行"端口**，不是教育业务。**四个后端各装什么 CLI 是部署配置，不是底座代码**。

但它**不是**普通工具，而是**第二类模型后端**：

| 后端类型 | 代表 | 底座接入点 |
|---|---|---|
| 文本推理 provider | NVIDIA/DeepSeek | `ModelRouter` → `LlmClient` |
| **外部 agent 后端** | **claude / codex / openclaw / hermes** | **`CliBackendRegistry`（本契约）** |
| 工具/技能 | `question.lookup` 等 | `ToolRegistry` / `SkillRegistry` |

**分层与归属（红线）**：`CliBackendRegistry` 是**底座的通用端口**（任何行业可用）；"应用 agent 用 claude/codex、业务 agent 用 openclaw/hermes" 是**装配/配置**（谁装哪个后端），**不写进底座代码**——否则就是把业务语义焊进底座（判据 3 违规）。

---

## 二、本地实况（2026-10-22/23 实测核对，B-3a 后的**权威表**）

> ⚠️ 本表是四后端 argv 的**唯一事实源**；B-3a 已据此实现 `packages/agent-core/src/cli-backend.js`。下表 argv 与实现**逐字一致**（单测 deepEqual 锁死）。

| 后端 id | 路径 | 版本 | **实测可用非交互 argv** | 实测结果 |
|---|---|---|---|---|
| `claude-code` | `~/.npm-global/bin/claude` | `2.1.251` | `claude -p "<prompt>" --output-format stream-json --verbose --permission-mode default` | ✅ 出 stream-json：首行 `{"type":"system","subtype":"init","session_id":…}`，末尾 `{"type":"result","result":"<text>","session_id":…}` 含最终文本。**必须带 `--verbose`**，否则报错 `--output-format=stream-json requires --verbose` |
| `codex` | `~/.npm-global/bin/codex` | `codex-cli 0.162.1` | `codex exec "<prompt>" --json --skip-git-repo-check` | ✅ JSONL：`{"type":"thread.started","thread_id":…}` 起；最终文本在 `{"type":"item.completed","item":{"type":"agent_message","text":…}}` |
| `openclaw` | `~/.npm-global/bin/openclaw` | `OpenClaw 2026.10.5` | `openclaw agent exec --json --cwd <dir> "<msg>"` | ✅ **B-3a 实测本机已真通**：`{"ok":true,"final":"ok","sessionId":…}` exit 0（ambient provider 凭据就绪）。⚠️ 用 `--isolated` 会缺鉴权（`No route-compatible authentication source is configured`）；旧的 `agent --local --json -m` 撞运行中 Gateway、非 `--local` 撞 exec 归属守卫，**均已废弃** |
| `hermes` | `~/.local/bin/hermes` | `v0.21.5+7014.gaf8839d` | `hermes -z "<prompt>"`（one-shot，仅打最终文本） | ⚠️ 本机 headless **挂起**（≥120s 无输出）；`chat -q --oneshot -Q` 同挂。**必须靠 `timeoutMs` 强制杀进程组 + 明确报错**（绝不静默/挂死） |

> `claude-code`/`codex`/`openclaw` 本机真跑均通；`hermes` 走超时兜底。`gemini`/`aider`/`opencode` 未安装（后端可扩展，registry 允许 `register`）。

---

## 三、契约形状（对标 OpenClaw `registerCliBackend`）

```js
// 底座新增：packages/agent-core/src/cli-backend.js
export class CliBackendRegistry {
  register(backend) { /* 校验 id 唯一 + argv 模板 + 输出解析器；撞名拒绝加载 + 诊断 */ }
  get(id) {}
  list() {}
  has(id) {}
}

// 一个后端 = 声明式描述（不含密钥；密钥走 host 注入 env 或 CLI 自持登守）
export const BACKENDS = {
  claudeCodeBackend,
  codexBackend,
  openclawBackend,
  hermesBackend,
};
```

**四个内置后端（要点；完整定义在实现卡）**：

| id | bin | 关键 argv | parseLine 输出 | timeoutMs |
|---|---|---|---|---|
| `claude-code` | `claude` | `-p {prompt} --output-format stream-json --permission-mode {mode}` | `{type,text,toolCall,sessionId}`（stream-json） | 600000 |
| `codex` | `codex` | `exec {prompt} --json --skip-git-repo-check` | `{type,text,diff,sessionId}`（JSONL） | 900000 |
| `openclaw` | `openclaw` | `agent --local --json -m {prompt}` | 解析 `--json` 结果 `{reply, sessionId, usage}` | 600000 |
| `hermes` | `hermes` | `-z {prompt}` | stdout 纯文本（final response） | 600000 |

**三条硬约束（同 `AGENT_SKILL_PLUGIN_CONTRACT.md`）**：
1. 后端**只描述 argv 与解析**，**不**碰 `apiKey`/token（CLI 自持登录态，或由 host 注入 env）。
2. **id 全局唯一**；撞名拒绝加载 + 诊断。
3. **默认最小权限**：`--permission-mode` / codex `--dangerously-bypass-*` / `hermes --yolo` 默认**不放开**；放开须显式配置。

---

## 四、两处接入点

```
① 作为「模型后端」被选中（"换脑子"）
   agent.llm_routes / agent.delegate_policy :
     provider = "cli"              ← 走外部 CLI 后端
     model    = "claude-code"      ← 或 codex/openclaw/hermes（即 backend id）
   → AgentCore 调 CliBackendRegistry.run(backend, {prompt})，用其输出当 assistant 回复

② 作为「委派工具」被 agent 调用（派活儿，对标 Hermes delegate_tool）
   makeTool({
     name: 'agent.delegate',
     description: '把一个独立子任务交给本机外部 agent（claude-code/codex/openclaw/hermes）执行',
     inputSchema: { type:'object', properties:{ backend:{type:'string'}, goal:{type:'string'}, cwd:{type:'string'} }, required:['backend','goal'] },
     execute: async (ctx, { backend, goal, cwd }) => host.cliBackends.run(backend, { prompt: goal, cwd })
   })
```

**关键区别（必守）**：
- ① 是"换脑子"——同一对话，外部 agent 只产出**回答文本**。
- ② 是"派活儿"——子任务有**独立上下文/文件副作用**，父只拿**摘要结果**（对标 Hermes：parent 看不到 child 的中间工具调用）。

---

## 五、按用户可选配置（本版核心新增）

**需求**：应用 agent 与业务 agent **是否使用本地已装 agent，由用户配置选择**。

**做法（复用既有路由缝，不新造概念）**：使用与否 = **`agent.llm_routes` 里该 routeKey 是否有 enabled 的 `provider='cli'` 行**。

| 场景 | 配置写法 | 效果 |
|---|---|---|
| 某用户**不用**本地 agent | 无该 routeKey 的 `cli` 行（或 `enabled=false`） | 走原 provider（NVIDIA/env 或该用户自己的 key）；**默认态=不用**（零回归，安全兜底） |
| 某用户**用** | `PUT /api/agent/admin/routes {route_key:'entity=<id>', provider:'cli', model:'claude-code', enabled:true}` | 该用户的**应用类**调用路由到 `claude-code` |
| 业务 agent 用 openclaw/hermes | `route_key:'kind=<kind>'`（如 `kind=tutor`）+ `provider:'cli', model:'hermes'` | **按调用域**（kind）选后端——即"业务 agent 接 hermes"的落地写法 |
| 默认全站 | `route_key:'default', provider:'cli', model:'openclaw'` | 全站默认走 openclaw（谨慎；默认关） |

**归属**：应用 agent 用 `claude-code`/`codex`、业务 agent 用 `openclaw`/`hermes`，只是**约定俗成的 routeKey 配置**，底座不硬编码——换行业/换团队，改配置即可。

**为什么复用 routeKey**：现有 `ModelRouter` 已按 `entity=<id>` / `kind=<kind>` / `default` 粒度解析，且已在 B-1 接入「每用户凭据」。加 `provider='cli'` 只是**多一个 provider 分支**，对既有行为零回归。

---

## 六、安全与隔离（必须明示）

| 项 | 规则 |
|---|---|
| **信任边界** | 外部 CLI 是**本机进程**，与本机同信任域——同 OpenClaw 原生插件"in-process 非沙箱"的明示 |
| **默认关闭** | 未在路由显式开启 `provider='cli'` → **绝不用**本地 agent（默认态安全） |
| **工作目录** | 派活儿必须显式 `cwd`；GRI 仓库改动只允许在工作树，**禁** `git push`、**禁**改他人分支 |
| **审批** | 默认**不可**绕过；`--permission-mode bypassPermissions` / codex `--dangerously-bypass-*` / `hermes --yolo` **列入禁用清单**，需人工显式开 |
| **超时/失控** | 每个后端带 `timeoutMs` + 进程组 kill；输出按行流式解析，防卡死 |
| **审计** | 每次委派写 `agent.tool_runs`（后端 id、argv 摘要、耗时、退出码、摘要），**不落**完整 prompt（可含敏感） |
| **凭据** | CLI 用**自己的登录态**；GRI **不**转发任何 `nvapi-`/token 给外部 CLI |

---

## 七、实施波次（串行，每波一卡）

| 步 | 内容 | 验收 | 权限档 |
|---|---|---|---|
| **E-0** | `CliBackendRegistry` + `claude-code` + `codex` 后端（只读问答，接入点①） | 单测 argv；真跑 `claude -p "reply exactly: ok"` / `codex exec --json` | 只读 |
| **E-1** | `openclaw` + `hermes` 后端（只读问答，接入点①） | 真跑 `openclaw agent --local --json` / `hermes -z` | 只读 |
| **E-2** | `provider='cli'` 路由分支接入 `ModelRouter.resolve`（**按用户可选**，默认关） | 默认无 cli 行→零回归；显式 cli 行→走 CLI；单测合并优先级 | 只读 |
| **E-3** | `agent.delegate` 工具（接入点②，带 cwd + 审计 + 超时） | E2E：委派"读文件总结"子任务，父只拿摘要 | 只读→改工作树 |
| **E-4** | admin 面暴露"每用户是否用本地 agent"的开关（GET/PUT 语义扩展） | 开关可读可写；非运营 403 | 只读 |

**纪律**：E-0/E-1 是**只读**（不改仓库）；E-3 起允许文件副作用，但**作者不自验**——由架构师独立复验（含"是否偷偷 push"检查）。

---

## 八、待裁决（架构师裁决口径，2026-10-22）

用户已授权"按最优建议执行；最终目标=达到产品可发布"。据此定为：

1. **接入点范围**：①（模型后端）+ ②（委派工具）**都要**（应用 agent 靠 ②、业务 agent 靠 ① 与 ② 混合）。
2. **权限档**：**默认全只读**（E-0..E-2，含 E-4）；**改工作树**仅 E-3 之后、且 cwd 白名单内、可配置开关。
3. **cwd 白名单**：默认 `['/home/ubantu/GRI']`，可由配置扩。
4. **四个后端全做**（claude-code / codex / openclaw / hermes）。

---

## 九、与"产品可发布"的关系（用户最终目标）

四个后端 + 按用户可选，直接服务于"产品可发布"：外部项目装 GRI 底座后，能**按自己环境**选用本地已装 agent（有人装 claude、有人装 hermes），且**默认不用**——发布包不假设用户机器有任何 CLI，装了才用。这是"可配置产品"（方案 B）的关键一环。
