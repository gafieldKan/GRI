> ✅ STATUS: REWRITTEN (2026-10-10) —— 依据 .agents/coordination/card-recon-2026-10-10.md §四 重写。原卡参照物 `k12/teaching.yaml` 不存在；`tutor-agent.ts`/`session-fsm.ts`/`tutor-session-agent.ts`/`llm.service.ts` 均已存在（勿重建）。真实缺口 = 3 个文件：`teaching-card-fsm.ts` / `intent-classifier.ts` / `socratic-templates.ts`。
> 执行者：Claude ｜ 依赖：无（既有 tuition 基座已就绪）｜ 预估：1 天

# T6 任务卡（重写）：`tuition/agents` —— 教学卡片状态机 + 意图识别 + 苏格拉底模板

## 📋 任务目标

在**既有 tuition agent 基座之上**增量补齐 AI 互动辅导的三块缺失，支撑前端「AI 互动辅导」Tab：

1. **教学卡片状态机** `teaching-card-fsm.ts`：`Question → Hint → Scaffold → Solution → Reflection` 五态流转，转移表 + Guard（Hint 上限、Scaffold 前置）。
2. **意图识别** `intent-classifier.ts`：把学生输入分类为 `ASK_HINT | ASK_SOLUTION | ATTEMPT_ANSWER | ASK_CLARIFICATION | OFF_TOPIC | GIVE_UP | NEXT_QUESTION`，返回 `{ intent, confidence }`；规则优先、LLM 兜底。
3. **苏格拉底模板库** `socratic-templates.ts`：按 `{subject, type, difficulty, stage}` 键的模板 `Map`，支持变量插值（`{knowledgePoint}`/`{studentLevel}`/`{attemptCount}`）。

## ⛔ 硬约束（先钉死，违反即失败）

| # | 约束 | 依据 |
|---|------|------|
| N1 | **不得重建** FSM 基础设施。既有 `session-fsm.ts`（427 行，`SessionFsm`+`SessionFsmService`）是**会话阶段**状态机（welcome/diagnosis/teaching/quizzing/done），**新文件 `teaching-card-fsm.ts` 是「卡片态」状态机（Question/Hint/Scaffold/Solution/Reflection），二者不同域、可组合**。卡片态**内嵌**于阶段状态机之内，勿改动既有 `session-fsm.ts` 的既有导出签名。 | recon §四 |
| N2 | **不得**引用 `packages/ontology/ontologies/k12/teaching.yaml`（**不存在**）。本体真源仅 4 个扁平文件：`k12-curriculum.ontology.yaml` / `student-twin.ontology.yaml` / `orders.ontology.yaml` / `database-orders.ontology.yaml`。 | 实测 |
| N3 | 卡片态/转移/模板**用代码常量定义**（对齐既有 `session-fsm.ts` 先例——其 phase 逻辑亦在代码中）。**不新建 YAML、不走 codegen**（卡片态是运行时行为，非持久化结构，不触发结构变更红线）。若确需本体化，另立 YAML→codegen 卡。 | 本体驱动红线澄清 |
| N4 | **无 DB 迁移**。会话上下文沿用既有 `edu.sessions.session_data`（JSONB）持久化（见 `session-fsm.ts:9,138,370,419`）；**不新增** `edu.tutor_sessions`/`teaching_templates` 表。 | 实测 |
| N5 | 使用既有 `LlmService`（552 行）能力：`chatCompletion` / `chatCompletionMultimodal` / `analyzeUserMessage`；**不得**新增 LLM SDK 依赖。无 key 时（`isRealKey()===false`）必须回退 Mock（与既有 `exam-scanner.ts` 同范式）。 | 实测 |
| N6 | `tuition.module.ts` 已 provide `SessionFsmService`/`TutorAgent`/`ExamScannerAgent`/`PlanAgent`。新增 3 个类若需注入，**在此 module 注册**（providers），不新建 module。 | 实测 |

## 📥 必读上下文（按顺序）

| 文件 | 用途 |
|------|------|
| `services/api/src/modules/tuition/agents/session-fsm.ts` | **既有**会话阶段状态机（`SessionFsm`/`SessionFsmService`）。学其 FSM 范式与 `edu.sessions` 持久化，勿改签名 |
| `services/api/src/modules/tuition/agents/tutor-agent.ts` | **既有** `TutorAgent`（`analyzeExam`/`_checkAnswer`） |
| `services/api/src/modules/tuition/agents/tutor-session-agent.ts` | **既有** `TutorSessionAgent.decide(session, userMessage)`（LLM+Tool 路由） |
| `services/api/src/modules/tuition/agents/llm.service.ts` | **既有** LLM 封装（`isRealKey`/`chatCompletion`/`analyzeUserMessage`/`validateAnswer`） |
| `services/api/src/modules/tuition/agents/session-fsm.spec.ts`、`tutor-session-agent.spec.ts` | **既有**测试风格参考 |
| `services/api/src/modules/tuition/tuition.types.ts` | 需补 `TeachingCardStage`/`Intent`/`SocraticContext` 类型（纯接口，无装饰器——api 侧无 class-validator） |
| `packages/ontology/ontologies/k12-curriculum.ontology.yaml` | 本体真源（含 `stateMachine` 范式、知识点结构）。**只读参考**，本卡不改它 |

## 📦 产出物清单

| 文件 | 动作 | 要点 |
|------|------|------|
| `services/api/src/modules/tuition/agents/teaching-card-fsm.ts` | **新增** | `TeachingCardFsm` 类：5 态转移表 + Guard（`hint_count ≤ 2` 超限强制 `Scaffold`；进 `Scaffold` 需尝试过答案；`Solution` 可由 `ASK_SOLUTION` 直达）。非法转移抛 `IllegalCardTransitionError`。导出 `TeachingCardStage` |
| `services/api/src/modules/tuition/agents/intent-classifier.ts` | **新增** | `IntentClassifier.classify(input, ctx) → { intent, confidence }`：关键词/规则表为主，命中 confidence < 0.6 时调 `LlmService.analyzeUserMessage` 兜底；`OFF_TOPIC`/`GIVE_UP` 有明确触发词表 |
| `services/api/src/modules/tuition/agents/socratic-templates.ts` | **新增** | `SocraticTemplates`：`Map<TemplateKey, TemplateFn>`，`TemplateKey = {subject, type, difficulty, stage}`；`render(key, ctx)` 做变量插值（`{knowledgePoint}`/`{studentLevel}`/`{attemptCount}`），缺失变量明确报错 |
| `services/api/src/modules/tuition/tuition.types.ts` | 修改 | 补 `TeachingCardStage`、`Intent`、`SocraticContext`、`TeachingCardUpdate` 纯接口 |
| `services/api/src/modules/tuition/tuition.module.ts` | 修改 | 注册新增 providers（如 `IntentClassifier`/`TeachingCardFsm`/`SocraticTemplates`） |
| `services/api/src/modules/tuition/agents/teaching-card-fsm.spec.ts` | **新增** | ≥ 8 单测：全路径覆盖、Guard、超限强制、非法转移抛错、边界 |
| `services/api/src/modules/tuition/agents/intent-classifier.spec.ts` | **新增** | ≥ 12 单测：6 意图各 2 例 + 兜底 + 空/异常输入 |
| `services/api/src/modules/tuition/agents/socratic-templates.spec.ts` | **新增** | ≥ 6 单测：插值正确、缺失变量报错、键覆盖 |
| `.agents/claude/outputs/p2-task-6-file-list.md` | **新增** | 新增/修改文件清单 |
| `.agents/claude/outputs/p2-task-6-verify.sh` | **新增** | 自动化验收脚本（见下） |

> **总计单测 ≥ 26**（既有 tuition 测试基线之上净增）。

## ✅ 验收标准（硬性）

1. **TypeScript 编译**：`cd services/api && npx tsc --noEmit` → 0 error。
2. **单测全绿**：`npx jest src/modules/tuition/agents` 全部通过（新增 ≥ 26 例）。
3. **既有回归不破**：`npx jest` 全量通过（基线 26 suites / 388 tests → 只增不减）。
4. **e2e**：`bash .agents/claude/outputs/p2-task-6-verify.sh` → `PASS=x FAIL=0 VERIFY_EXIT=0`。
5. **状态机合规**：初态 `Question`；非法转移抛 `IllegalCardTransitionError`；Hint 超 2 次强制进 `Scaffold`。
6. **意图识别**：规则覆盖 ≥ 30 条样本；`OFF_TOPIC`/`GIVE_UP` 有明确触发词。
7. **模板**：至少覆盖 `{单选/多选/填空/解答} × {easy/medium/hard} × {hint/scaffold/solution}` 槽位；插值无遗漏。

## 🧪 验收脚本 `.agents/claude/outputs/p2-task-6-verify.sh` 规范

```bash
#!/usr/bin/env bash
# T6 验收：教学卡片 FSM / 意图识别 / 苏格拉底模板（无 LLM key 时走 Mock）
set -uo pipefail
# 计数 PASS/FAIL，末尾输出 PASS=n FAIL=m VERIFY_EXIT=0|1
# 1. 纯逻辑段（不需要服务）：直接 node -e 或间接经 jest —— 校验 5 态转移表、Guard、非法转移抛错
# 2. 意图分类：喂 ≥ 30 条样本，断言命中预期意图，准确率 ≥ 90%
# 3. 模板渲染：遍历槽位，断言变量插值替换完整、缺失变量抛错
# 4. 不依赖外部服务时以 jest 覆盖为主；若 tuition 端点在运行，可加一轮活体冒烟
```

> 说明：本卡核心是**纯领域逻辑**（状态机/分类器/模板），验收以单测为主；`verify.sh` 复用 jest 输出并补归类断言，避免为造 e2e 而引入假端点。

## 📝 任务卡存放路径

```
.agents/claude/tasks/p2-task-6-tutor-agent-fsm-intent-socratic.md
```
