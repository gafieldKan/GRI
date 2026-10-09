> ⚠️ STATUS: NEEDS REWRITE (2026-10-10) —— 参照物 k12/teaching.yaml 不存在；tutor-agent.ts/session-fsm.ts 已存在（勿重建重复 FSM）。需按 .agents/coordination/card-recon-2026-10-10.md §四 重写后执行。

# T6 任务卡：`tuition/agents` - Tutor Agent 教学卡片状态机 + 意图识别 + 苏格拉底模板

**执行者**：Claude  
**依赖**：T5 完成（练习中心主链路就绪）  
**产出目录**：`services/api/src/modules/tuition/agents/`  
**预估**：1.5 天

---

## 📋 任务目标

实现 **AI 互动辅导** 核心 Agent，支撑前端「AI 互动辅导」Tab：

1. **教学卡片状态机**：`Question → Hint → Scaffold → Solution → Reflection` 五态流转，每态有入口/出口 Guard
2. **意图识别**：分类用户输入 → `ASK_HINT`、`ASK_SOLUTION`、`ATTEMPT_ANSWER`、`ASK_CLARIFICATION`、`OFF_TOPIC`、`GIVE_UP`
3. **苏格拉底式模板库**：按学科/题型/难度预置引导话术，支持变量插值（知识点、学生水平、历史错误）

---

## 📥 必读上下文（按顺序）

| 文件 | 用途 |
|------|------|
| `services/api/src/modules/tuition/agents/tutor-agent.ts` | 现有骨架（若有）或新建，状态机核心 |
| `services/api/src/modules/tuition/agents/session-fsm.ts` | 现有 FSM 基础设施（State、Transition、Guard） |
| `services/api/src/modules/tuition/agents/tutor-session-agent.spec.ts` | 现有测试风格参考 |
| `services/api/src/modules/tuition/tuition.types.ts` | 需补 `TeachingCard`、`Intent`、`SocraticTemplate` 类型 |
| `packages/ontology/ontologies/k12/teaching.yaml` | 教学卡片本体 DSL（状态、转移、动作、模板引用） |
| `docs/WEB_AI_TUTOR_COMPLETION_PLAN.md` | 前端交互契约：卡片渲染、WebSocket 推流、历史记录 |

---

## 📦 产出物清单

| 文件 | 动作 |
|------|------|
| `services/api/src/modules/tuition/agents/tutor-agent.ts` | 核心类：`handleUserInput(sessionId, input)` → `{ nextCard, intent, socraticPrompt }` |
| `services/api/src/modules/tuition/agents/teaching-card-fsm.ts` | 状态机定义：5 态、转移表、Guard（如：Hint 最多 2 次、Scaffold 需尝试过答案） |
| `services/api/src/modules/tuition/agents/intent-classifier.ts` | 意图分类器（规则+关键词+可选 LLM 兜底），返回 `Intent` + `confidence` |
| `services/api/src/modules/tuition/agents/socratic-templates.ts` | 模板库：`Map<TemplateKey, TemplateFn>`，Key = `{subject, type, difficulty, stage}` |
| `services/api/src/modules/tuition/agents/tutor-agent.spec.ts` | 20+ 单测：状态机全路径覆盖、意图分类准确率、模板渲染、边界（超限、异常输入） |
| `.agents/claude/outputs/p2-task-6-file-list.md` | 本任务新增/修改文件清单 |
| `.agents/claude/outputs/p2-task-6-verify.sh` | 自动化验收脚本（见下） |

---

## ✅ 验收标准（硬性）

1. **TypeScript 编译通过**：`npm run build` 0 error
2. **单测全绿**：`npm run test -- src/modules/tuition/agents/tutor-agent.spec.ts` 全部通过（目标 ≥ 20 tests）
3. **端到端验证脚本通过**：运行 `bash .agents/claude/outputs/p2-task-6-verify.sh` 输出 `全绿：PASS=X FAIL=0`
4. **状态机合规**：
   - 初态 `Question`，终态 `Reflection`/`Solution`
   - 非法转移抛 `IllegalStateTransitionError`
   - `Hint` 计数器持久化（会话级），超限强制进 `Scaffold`
5. **意图识别**：
   - 规则覆盖 ≥ 90% 常见输入（测试用例 ≥ 30 条）
   - `OFF_TOPIC`/`GIVE_UP` 有明确触发词
6. **苏格拉底模板**：
   - 至少覆盖：数学单选/多选/填空/解答题 × 3 难度 × 5 阶段 = 60 个模板槽位
   - 变量插值正确：`{knowledgePoint}`、`{studentLevel}`、`{attemptCount}`

---

## 🧪 验收脚本 `task-6-verify.sh` 规范

```bash
#!/usr/bin/env bash
# T6 自动化验收：Tutor Agent 状态机/意图/模板
set -uo pipefail
API_BASE="${API_BASE:-http://localhost:3008/api}"

# 1. 创建辅导会话 → sessionId
# 2. 获取初始卡片 → 态 Question，含题目渲染数据
# 3. 用户输入「不会」 → 意图 ASK_HINT → 卡片态 Hint，返回苏格拉底提示
# 4. 再次「不会」 → Hint 计数+1，仍返回 Hint（不同模板）
# 5. 第三次「不会」 → 强制进 Scaffold，返回脚手架拆解
# 6. 用户尝试作答 → 意图 ATTEMPT_ANSWER → 判分 → 正确进 Reflection，错误进 Scaffold
# 7. 用户输入「直接给答案」 → 意图 ASK_SOLUTION → 卡片态 Solution，返回标准解析
# 8. 用户输入「下一题」→ 意图 NEXT_QUESTION → 新会话或下一题
# 9. 意图识别批量测试：喂入 30 条样本，校验分类准确率
# 10. 模板渲染：遍历 60 槽位，校验变量插值无遗漏
```

---

## 🔐 关键实现细节

| 点 | 要求 |
|----|------|
| 状态持久化 | `edu.tutor_sessions(id, student_id, current_state, hint_count, scaffold_count, context_jsonb, updated_at)` |
| WebSocket 推流 | 状态变更时通过 WS 推送 `TeachingCardUpdate` 事件（复用 `gateway` 模块） |
| 模板存储 | `teaching_templates` 表（或 YAML 文件加载），支持热更 |
| LLM 兜底 | 意图识别规则命中 < 0.6 时，调用 `LLMService.classifyIntent()`（T5 已有接口） |
| 可观测性 | 每次状态转移记录 `edu.teaching_card_logs(session_id, from_state, to_state, intent, user_input, timestamp)` |

---

## 📝 任务卡存放路径

```
.agents/claude/tasks/p2-task-6-tutor-agent-fsm-intent-socratic.md
```