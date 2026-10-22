# GRI 底座：外部 Agent 调用契约（Claude Code / Codex 等本地 CLI）

> 需求：GRI 的 AI 底座（`packages/agent-core`）**能调用本地的其他 agent**（Claude Code、Codex…），把它们当成一类"可委派的外部推理后端"。
> 对标：OpenClaw `registerCliBackend`（`docs/plugins/cli-backend-plugins.md`）+ Hermes `delegate_tool` / `agent/transports/*`。
> 依据分层判据：`docs/AGENT_LAYERING.md`。

---

## 一、定位（放哪一层？）

外部 CLI agent 调用 **属底座能力**（判据 1/2：换行业仍成立、换场景不改代码）——它是**通用"委派执行"端口**，不是教育业务。

但它**不是**普通工具，而是**第二类模型后端**：

| 后端类型 | 代表 | 底座接入点 |
|---|---|---|
| 文本推理 provider | NVIDIA/DeepSeek | `ModelRouter` → `LlmClient` |
| **外部 agent 后端** | **Claude Code / Codex** | **新增 `CliBackendRegistry`（本契约）** |
| 工具/技能 | `question.lookup` 等 | `ToolRegistry` / `SkillRegistry` |

---

## 二、本地实况（2026-10-22 核对）

| CLI | 路径 | 版本 | 非交互入口 |
|---|---|---|---|
| **Claude Code** | `~/.npm-global/bin/claude` | `2.1.251` | `claude -p "<prompt>" --output-format stream-json --permission-mode <mode> [--resume <id>] [--allowedTools ...] [--append-system-prompt ...]` |
| **Codex** | `~/.npm-global/bin/codex` | `codex-cli` `0.162.1` | `codex exec "<prompt>" [--json] [--output-schema <file>] [--add-dir <dir>] [--skip-git-repo-check] [--ephemeral]` |

> 二者均**已就位**；`gemini`/`opencode`/`aider` 未安装（后端可扩展）。

---

## 三、契约形状（对标 OpenClaw `registerCliBackend`）

```js
// 底座新增：packages/agent-core/src/cli-backend.js
export class CliBackendRegistry {
  register(backend) { /* 校验 id 唯一 + argv 模板 + 输出解析器 */ }
  get(id) {}
  list() {}
}

// 一个后端 = 声明式描述（不含密钥；密钥走 host 注入）
export const claudeCodeBackend = {
  id: 'claude-code',                    // 唯一，小写短横线
  label: 'Claude Code',
  kind: 'cli-backend',
  bin: 'claude',                        // 需在 gateway PATH 上
  // argv 模板：{prompt} 占位；其余为固定开关
  buildArgs: ({ prompt, model, allowedTools, resume, permissionMode }) => [
    '-p', prompt,
    '--output-format', 'stream-json',
    '--permission-mode', permissionMode || 'default',
    ...(model ? ['--model', model] : []),
    ...(allowedTools?.length ? ['--allowedTools', allowedTools.join(',')] : []),
    ...(resume ? ['--resume', resume] : []),
  ],
  parseLine: (line) => { /* stream-json → {type,text,toolCall,sessionId} */ },
  resumeKey: (line) => line?.session_id ?? null,
  timeoutMs: 600000,
};

export const codexBackend = {
  id: 'codex',
  label: 'Codex',
  kind: 'cli-backend',
  bin: 'codex',
  buildArgs: ({ prompt, cwd, json = true, addDirs, outputSchema }) => [
    'exec', prompt,
    ...(json ? ['--json'] : []),
    ...(addDirs?.map((d) => ['--add-dir', d]).flat() ?? []),
    ...(outputSchema ? ['--output-schema', outputSchema] : []),
    '--skip-git-repo-check',
  ],
  parseLine: (line) => { /* codex JSONL → {type,text,diff,sessionId} */ },
  timeoutMs: 900000,
};
```

**三条硬约束（同 `AGENT_SKILL_PLUGIN_CONTRACT.md`）**：
1. 后端**只描述 argv 与解析**，**不**碰 `apiKey`/token（CLI 自持凭据，或由 host 注入 env）。
2. **id 全局唯一**；撞名拒绝加载 + 诊断。
3. **默认最小权限**：`--permission-mode` / codex 沙箱默认不放开；放开须显式传参。

---

## 四、两处接入点

```
① 作为「模型后端」被选中（对标 OpenClaw model-ref 前缀）
   agents.defaults.model.primary = "openai/gpt-..."        ← 内置 provider
   agents.defaults.model.fallbacks = ["claude-code/opus"]  ← 外部后端（新）
   → AgentCore 路由到 CliBackend，用其 stdout 当 assistant 回复

② 作为「委派工具」被 agent 调用（对标 Hermes delegate_tool）
   makeTool({
     name: 'agent.delegate',
     description: '把一个独立子任务交给本地外部 agent（claude-code/codex）执行',
     inputSchema: { type:'object', properties:{ backend:{type:'string'}, goal:{type:'string'}, cwd:{type:'string'} }, required:['backend','goal'] },
     execute: async (ctx, { backend, goal, cwd }) => host.cliBackends.run(backend, { prompt: goal, cwd })
   })
```

**关键区别（必守）**：
- ① 是"换脑子"——同一对话，外部 agent 只产出**回答文本**。
- ② 是"派活儿"——子任务有**独立上下文/文件副作用**，父只拿**摘要结果**（对标 Hermes：parent 看不到 child 的中间工具调用）。

---

## 五、安全与隔离（必须明示）

| 项 | 规则 |
|---|---|
| **信任边界** | 外部 CLI 是**本机进程**，与网关同机信任域——同 OpenClaw 原生插件"in-process 非沙箱"的明示 |
| **工作目录** | 派活儿必须显式 `cwd`；GRI 仓库改动只允许在工作树，**禁** `git push`、**禁**改他人分支 |
| **审批** | 默认**不可**绕过审批；`--permission-mode`/codex `--dangerously-bypass-*` **列入禁用清单**，需人工显式开 |
| **超时/失控** | 每个后端带 `timeoutMs` + 进程组 kill；输出按行流式解析，防卡死 |
| **审计** | 每次委派写 `agent.tool_runs`（后端 id、argv 摘要、耗时、退出码、摘要），**不落**完整 prompt（可含敏感） |
| **凭据** | CLI 用**自己的登录态**；GRI **不**转发任何 `nvapi-`/token 给外部 CLI |

---

## 六、实施波次（P-3 邻接，串行）

| 步 | 内容 | 验收 |
|---|---|---|
| E-0 | 落 `CliBackendRegistry` + `claude-code` 后端（仅 ①，只读问答） | 单测 argv + 真跑 `claude -p "reply exactly: ok"` |
| E-1 | 落 `codex` 后端（`codex exec --json`） | 真跑一次，解析 JSONL |
| E-2 | 落 `agent.delegate` 工具（②，带 cwd + 审计 + 超时） | E2E：委派一个"读文件总结"子任务，父只拿摘要 |
| E-3 | 接入 `agents.defaults.model.fallbacks` 路由 | 路由切换不回归既有 LLM 路径 |

**纪律**：E-0/E-1 是**只读**（不改仓库）；E-2 起允许文件副作用，但**作者不自验**——由我独立复验（含"是否偷偷 push"检查）。

---

## 七、待用户裁决

1. **接入点范围**：只做 ①（当模型后端）？只做 ②（当委派工具）？还是都要？
2. **放开权限到哪一档**：默认只读 / 允许改工作树 / 允许在沙箱内跑命令？
3. **E-2 的 cwd 白名单**：仅 GRI 仓库 / 也含其他项目目录？
