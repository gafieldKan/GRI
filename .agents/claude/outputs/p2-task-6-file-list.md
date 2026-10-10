# P2-T6 文件清单（tuition/agents —— 教学卡片状态机 + 意图识别 + 苏格拉底模板）

分支：`feat/stage-c-unified-auth-shell`｜执行者：Claude（实现工程师）｜日期：2026-10-10

## 设计决策（对齐卡片硬约束 N1–N6）

| 决策 | 取值 | 理由 |
|------|------|------|
| 卡片态 vs 会话阶段 | **两个不同域、可组合**：既有 `session-fsm.ts`（welcome/diagnosis/teaching/quizzing/done）不动；新 `teaching-card-fsm.ts` 管「单张卡片内」的 Question/Hint/Scaffold/Solution/Reflection。卡片态**内嵌**于会话阶段之内。 | N1：不重建 FSM 基础设施；既有 `SessionFsm` 导出签名零改动。 |
| 态/转移/模板的载体 | **代码常量**（`TRANSITIONS` 常量对象 + 内置模板数组），**不新建 YAML、不走 codegen**。转移表形态对齐本体 `stateMachine.transitions`（`from → [to]`）。 | N3：卡片态是运行时行为、非持久化结构，不触发结构变更红线；对齐 `session-fsm.ts` 的 phase 逻辑同样在代码中的先例。 |
| `TeachingCardFsm` 是否有实例态 | **无状态引擎**：`transition(state, intent, ctx) → newState`（不可变推进）。故可安全注册为 Nest provider 而被并发会话复用（对齐 `SessionFsmService` 门面 + `SessionFsm` 实例的分工）。 | N6：注册为 provider；避免单例持有跨会话的脏状态。 |
| 意图兜底 | 规则表打分（多命中累加）**优先**；`confidence < 0.6` 时调既有 `LlmService.analyzeUserMessage`，其意图空间（answer/greeting/…）经 `LLM_INTENT_MAP` 归一到本 7 意图；无 key（返回 null）/异常 → 退回规则默认（OFF_TOPIC 低置信）。 | N5：复用既有 `LlmService`，无 key 走 Mock 降级（同 `exam-scanner.ts` 范式）。 |
| 模板键解析 | `Map<string, TemplateFn>`，回退链 **精确 → 类型通配 → 学科通配 → 全局 stage 基模板**；保证 `4×3×3=36` 槽位全覆盖，同时允许题型特化覆盖。 | 卡片验收 7：覆盖全槽位；缺模板/缺变量**明确报错**。 |
| 持久化 | **无 DB 迁移**：本卡不新增表，会话上下文仍走既有 `edu.sessions.session_data`（JSONB）。 | N4：不新增 `edu.tutor_sessions` 等。 |
| 本体真源 | 仅读既有 4 个扁平 YAML；**未引用** `k12/teaching.yaml`（不存在）。 | N2。 |

## 改动清单

### 新增（源码 3）

| 文件 | 要点 |
|------|------|
| `services/api/src/modules/tuition/agents/teaching-card-fsm.ts` | `TeachingCardFsm`（无状态引擎）：`TRANSITIONS` 五态转移表 + `can()`；`transition()` 施三条 Guard（`hintCount ≤ MAX_HINTS=2` 超限强制 `Scaffold`；进 `Scaffold` 需 `attemptCount ≥ 1`；`ASK_SOLUTION` 可直达 `Solution`），非法转移/Guard 不满足抛 `IllegalCardTransitionError`；`initialCardState()` 初态 `Question`；`advance()` 产出 `TeachingCardUpdate`。导出 `TeachingCardStage`。 |
| `services/api/src/modules/tuition/agents/intent-classifier.ts` | `IntentClassifier.classify(input, ctx) → {intent, confidence}`：7 意图（`ASK_HINT/ASK_SOLUTION/ATTEMPT_ANSWER/ASK_CLARIFICATION/OFF_TOPIC/GIVE_UP/NEXT_QUESTION`），规则表（关键词 + 正则）打分优先，`<0.6` 调 `LlmService.analyzeUserMessage` 兜底并映射；`OFF_TOPIC`/`GIVE_UP` 有明确触发词表；空/异常输入永不抛错。 |
| `services/api/src/modules/tuition/agents/socratic-templates.ts` | `SocraticTemplates`：`Map<TemplateKey, TemplateFn>`；`render(key, ctx)` 做变量插值（`{knowledgePoint}`/`{studentLevel}`/`{attemptCount}`），缺失变量抛 `MissingTemplateVariableError`，无模板抛 `MissingTemplateError`；内置 3 条全局 stage 基模板 + 3 条题型特化。 |

### 修改（2）

| 文件 | 动作 | 说明 |
|------|------|------|
| `services/api/src/modules/tuition/tuition.types.ts` | 追加纯类型 | `TeachingCardStage` / `Intent` / `SocraticContext` / `TeachingCardUpdate`（纯接口/联合，无装饰器——api 侧无 class-validator）。 |
| `services/api/src/modules/tuition/tuition.module.ts` | 注册 providers | 追加 `TeachingCardFsm` / `IntentClassifier` / `SocraticTemplates`；`IntentClassifier` 复用既有 `LlmService`（同 module 已 provide）。未新建 module。 |

### 新增（测试 3）

| 文件 | 用例数 | 覆盖 |
|------|-------|------|
| `.../agents/teaching-card-fsm.spec.ts` | **15** | 初态/转移表真值、`can()`、提示路径、Hint 上限强制 Scaffold、Scaffold 前置 Guard、作答对/错、Solution 直达（ASK_SOLUTION/GIVE_UP）、两类非法转移抛错、自转移、NEXT_QUESTION 重置、`advance()`。 |
| `.../agents/intent-classifier.spec.ts` | **17** | 7 意图各 ≥2 例、规则命中不调 LLM、多命中置信度更高、LLM 兜底映射（confused→ASK_CLARIFICATION / skip_diagnosis→ASK_SOLUTION）、无 key(null)/异常降级、空/非字符串边界、**37 条样本准确率 100%（验收硬性 ≥90%）**、GIVE_UP/OFF_TOPIC 触发词表。 |
| `.../agents/socratic-templates.spec.ts` | **11** | 插值完整、缺变量/缺模板报错、`attemptCount=0` 合法、**36 槽位全覆盖**、精确键覆盖通配、内置特化优先、动态 `TemplateFn`、跨学科回退、`size`。 |

### 新增（产出物 2）

| 文件 | 说明 |
|------|------|
| `.agents/claude/outputs/p2-task-6-verify.sh` | 自动化验收：§1 jest 复用 3 spec → §2 ts-node 直驱独立行为断言（≥30 样本/≥90%、FSM 转移+Guard、模板槽位/插值/报错）→ §3 api 活体冒烟（不在跑则 SKIP）。 |
| `.agents/claude/outputs/p2-task-6-file-list.md` | 本文件。 |

## 硬约束合规映射

| # | 约束 | 落实 |
|---|------|------|
| N1 | 不重建 FSM、不改既有导出签名 | `session-fsm.ts` 未改（0 字节 diff）；卡片态为独立新域文件。 |
| N2 | 禁引 `k12/teaching.yaml` | 未引用；源码零 ontology import。 |
| N3 | 态/转移/模板用代码常量，不新建 YAML/不走 codegen | `TRANSITIONS` 常量 + 内置模板常量；无 `.yaml`/codegen 改动。 |
| N4 | 无 DB 迁移 | 无迁移文件；不新增表。 |
| N5 | 复用 `LlmService`、无 key 回退 Mock | `IntentClassifier` 注入既有 `LlmService`；无 key 时 `analyzeUserMessage` 返回 null → 规则默认，测试全走 Mock stub。 |
| N6 | 在既有 `tuition.module.ts` 注册 | 追加 3 个 provider；未新建 module。 |

## 自检命令与结果

```sh
cd services/api && npx tsc --noEmit
#   → 0 error（TSC_EXIT=0）

cd services/api && npx jest src/modules/tuition/agents
#   → 8 suites / 85 tests 全绿（既有 5 suites/42 + 新增 3 suites/43）

cd services/api && npx jest
#   → 29 suites / 431 tests 全绿（基线 26/388 → +3 suites/+43 tests，只增不减）

bash .agents/claude/outputs/p2-task-6-verify.sh
#   → PASS=13 FAIL=0 VERIFY_EXIT=0
#     §1 jest 43/43 passed；§2 独立断言 11/11（样本 37 条 100%、槽位 36/36）；§3 api 可达
```

## 已知说明

- `TeachingCardFsm` 设计为**无状态引擎**（`transition` 不可变推进），故可安全作 Nest 单例 provider；每张卡片的运行态由调用方持有的 `TeachingCardState` 承载。这与既有 `SessionFsm`（实例态）+ `SessionFsmService`（注入门面）的分工一致。
- 本卡只交付**领域逻辑与底座就绪**（3 类 + 类型 + provider 注册），**未接线** 到 `TuitionController`/`TuitionService`——卡片态如何「内嵌」进会话阶段（如 teaching 阶段启用卡片）属后续前端「AI 互动辅导」Tab 的集成卡范围。
- `IntentClassifier` 的 LLM 兜底分支在无 key 环境不可达（`analyzeUserMessage` 返回 null）；其映射逻辑由单测以 mock 覆盖，真实链路留待有 key 的环境 E2E。
