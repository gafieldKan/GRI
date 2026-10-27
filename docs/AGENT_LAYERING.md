# AI Agent 分层：底座 vs 业务 agent

> 回答三个问题：**怎么划分？各自包含什么能力？划分原则是什么？**
> 本文是判据文件——后续任何"该放底座还是放业务"的争论，以此文裁决。
> 实况依据：`packages/agent-core/src/*`、`services/api/src/modules/agent/*`、`services/api/src/modules/tuition/agents/*`。

---

## 一、一句话定义

```
底座（agent-core）  = 引擎：模型 + 工具 + 技能 + 记忆 + 互操作 的「运行环」
业务 agent          = 整车：把引擎装到「教育」这个场景上，提供具体工具/技能/提示词/状态机
```

- 底座**不知道"教育"**——只会跑「收→路由→工具环→答」。
- 业务 agent**不知道"模型怎么调"**——只会描述"我要什么能力"。
- **谁都不该越界**：底座出现学科名词 = 污染；业务出现 `apiKey`/`baseUrl` = 污染。

---

## 二、划分原则（五条判据，按优先级）

| # | 判据 | 判底座 | 判业务 |
|---|---|---|---|
| 1 | **行业无关性** | 换到"医疗/法律/电商"仍成立 | 只对教育成立 |
| 2 | **可移植性** | 换场景不改一行 | 换场景必须改 |
| 3 | **依赖方向（DIP）** | 底座**不** import 业务 | 业务 import 底座 |
| 4 | **契约角色** | 提供"孔"（Tool/Skill/Memory/Model 接口） | 提供"塞子"（具体工具、技能正文、prompt） |
| 5 | **生命周期** | 实例可被任意装配（每生一个 `AgentCore`） | 决定"装配哪些孔" |

**铁律**：判据 1+2 有冲突时取 2（"是否要改代码"比"听起来通用"更硬）；判据 3 是**红线**，反向依赖即违规，不需讨论。

**一句话记法**：
> **底座回答"怎么跑一个 agent"，业务回答"这个 agent 会什么"。**

---

## 三、底座能力清单（`packages/agent-core`，712K）

| 能力域 | 导出物 | 职责 |
|---|---|---|
| **推理环** | `AgentCore`（`run({entityId, sessionId, history, userMessage, routeKey, opts})`） | 收→路由→tool loop→答 |
| **模型** | `LlmClient` / `ModelRouter` | 调 provider、多模型路由、前台切模型 |
| **工具** | `ToolRegistry` / `makeTool`（`tool.js` 契约：name/description/inputSchema/execute/category） | 注册、查找、校验、调用 |
| **技能** | `SkillRegistry` / `parseSkillMarkdown` / `normalizeSkill` | SKILL.md 清单 → system prompt 指令 + 依赖工具 |
| **记忆** | `MemoryStore` / `storeFrom` | 跨会话记忆（Store 注入，DB 无关） |
| **互操作** | `McpClient` / `McpPool` / `bridgeMcpTools` / `AcpAdapter` / `listMcpServers` | MCP 工具桥 + ACP 适配 |

**底座不变性的实况核对（2026-10-22 扫描）**：底座**并非零业务语义**——扫描 `packages/agent-core/src` 命中 3 文件：

| 文件:行 | 泄漏 | 性质 |
|---|---|---|
| `agent.js:163` | system prompt 里硬写 `## 关于该学生的记忆` | **真违规**：底座产出的 prompt 含教育角色词 |
| `memory.js:3` | 注释「每个学生（entity）一个独立记忆命名空间」 | 注释泄漏（术语应按 `entity`） |
| `mcp/pool.js:6` | 注释「多学生并发打同一 server」 | 注释泄漏 |

> 架构上 `Store` 仍由外部注入（`storeFrom(db.query)`）→ DB/传输无关成立；但**术语层已渗入业务语义**。这正是"一切皆插件"要顺手归位的点（见 §五 V6）。

---

## 四、业务 agent 能力清单

### A. `modules/agent`（智学慧眼 = 底座正统消费者）

| 层 | 内容 |
|---|---|
| **宿主绑定** | `agent.service.ts` 薄 Nest 绑定：每生 `new AgentCore`、`MemoryStore`、`McpPool`、`onRun`→`agent.tool_runs` 审计 |
| **教学工具** | **17 个**：`answer.grade` `curriculum.lookup` `diagnosis.state` `lesson.current` `lesson.record` `lesson.submit` `map.explorer` `memory.forget` `memory.recall` `memory.remember` `plan.complete` `plan.generate` `progress.trend` `question.lookup` `review.sequence` `tutor` `wrong.list` |
| **教学技能** | 1 个 `tutor`（学情诊断→讲解→测验的完整流程，正文以 `lesson.*` 状态机 + `map.explorer` 登山比喻驱动） |
| **落库** | `edu.answer_records` / `edu.wrong_questions` / `edu.learning_plans` / `agent.memory` |

> ⚠️ 这 17 个工具**全部硬编码在 `agent.service.ts` 一个文件**里——是"业务能力硬编码进宿主"，P-3 要拆成 `agent.skill` 插件。

### B. `modules/tuition/agents`（**第二范式** = 确定性流水线零件）

15 文件：`tutor-agent` `tutor-session-agent` `ai-agent.service` `plan-agent` `session-fsm` `teaching-card-fsm` `spaced-repetition.service` `variant-generator` `question-generator` `question-parser` `question.service` `intent-classifier` `socratic-templates` `exam-scanner` `ocr-processor`。

- 形态：**会话状态机 + 单次 LLM 调用**，非 `AgentCore` 自主工具环。
- LLM 客户端：已归位底座 `@gri/agent-core` 的 `LlmClient`（W2.4 删原自持 `LlmService` 重复实现；装配见 `tuition/agents/llm-provider.ts`）。

---

## 五、当前违规点（"一切皆插件"要归位的）

| # | 违规 | 证据 | 归位方向 |
|---|---|---|---|
| V1 | **双 LLM 路径** | ~~底座 `LlmClient` **vs** 业务 `tuition/agents/LlmService`~~ —— **已归位（W2.4）**：tuition 全走底座 `LlmClient`，重复实现已删（`grep LlmService services/api/src`=0） | ✅ 已完成 |
| V2 | **双 agent 范式** | `AgentCore` 自主环 vs `tuition` 确定性 FSM，无统一契约 | 两者都收敛为"可挂到底座的能力"：FSM = 一个会话策略插件 |
| V3 | **业务硬编码进宿主** | 17 工具全在 `agent.service.ts` | 拆 `agent.skill` 插件（一学科/一类能力一插件） |
| V4 | **跨模块能力归属不清** | `map.explorer`（世界/地图能力）注册在 agent 模块 | 由 `world` 模块以插件身份提供该工具 |
| V5 | **记忆语义边界模糊** | `MemoryStore`（底座）vs `memory.remember/recall/forget`（业务工具） | 保留：存储是底座孔，"记什么"是业务塞子——**此为正确示例**，作范本 |
| **V6** | **底座术语渗入业务语义** | `agent.js:163` 写死「关于该学生的记忆」；`memory.js`/`mcp/pool.js` 注释用「学生」 | 底座文案参数化（persona 由 host 注入），术语统一为 `entity`；属底座更新 |

---

## 六、判定流程（拿来即用）

```
新能力放哪？
  ├─ 含学科/学生/课程/Prompt 业务语义？ ── 是 → 业务
  ├─ 换到别的行业要改代码？        ── 是 → 业务
  ├─ 提供的是"接口/契约/注册表"？   ── 是 → 底座
  ├─ 业务 import 它（不许反向）？    ── 是 → 底座
  └─ 两者都要（如 memory）→ 存储属底座、语义属业务，拆两个面
```

---

## 七、与"一切皆插件"的关系

- **底座 = 契约层**（保持小而稳，≈712K）。
- **业务能力 = 插件**（`agent.skill` / 工具插件，读 `plugin.json` 即可装）。
- 插件划分**必须**通过本文五条判据；跨界的（如 `LlmService`）按 V1/V2 归位。
- 相关：`docs/PLUGIN_ARCHITECTURE.md`（总则）、`docs/AGENT_SKILL_PLUGIN_CONTRACT.md`（P-3 契约）、`docs/AGENT_BENCHMARK_PROTOCOL.md`（定期对标）、`docs/EXTERNAL_AGENT_HARNESS.md`（调外部 agent：Claude Code / Codex）。

## 八、外部 agent 后端（归属裁决）

"底座调用本地 Claude Code / Codex" 经五判据裁决：**屑底座能力**（换行业仍成立 / 换场景不改代码），但归为**第二类模型后端**（非普通工具）——契约见 `docs/EXTERNAL_AGENT_HARNESS.md`。两个接入点：① 当模型后端被路由选中（换脑子）；② 当 `agent.delegate` 委派工具（派活儿）。
