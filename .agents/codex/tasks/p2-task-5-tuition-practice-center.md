> ⚠️ STATUS: DOWNGRADE TO VERIFY (2026-10-10) —— tuition.controller 已有 questions/practice/*/analysis/stats 等端点。按 card-recon §三 降级核验，只补真缺口（如 progress、路径对齐）。

# T5 任务卡：`tuition` 核心 - 练习中心主链路（题目渲染/答题交互/解析/进度/统计）

**执行者**：Codex  
**依赖**：M1 完成（identity 契约就绪）  
**产出目录**：`services/api/src/modules/tuition/`  
**预估**：1.5 天

---

## 📋 任务目标

补全 `tuition` 模块**练习中心**主链路，使学情切片达到**生产可用**：

1. **题目渲染**：`GET /api/tuition/questions/:id` → 返回结构化题目（stem、options、type、difficulty、knowledgePointIds、latex、media）
2. **答题提交**：`POST /api/tuition/practice/sessions/:id/answers` → 单题/批量提交，返回即时判分 + 解析
3. **解析展示**：`GET /api/tuition/practice/sessions/:id/analysis` → 逐题解析、知识点掌握度、用时分布
4. **练习进度**：`GET /api/tuition/practice/sessions/:id/progress` → 已答/总数、正确率、剩余时间、当前题索引
5. **练习统计**：`GET /api/tuition/practice/stats/:externalId` → 历史正确率、弱点知识点、推荐复习题、连续天数

---

## 📥 必读上下文（按顺序）

| 文件 | 用途 |
|------|------|
| `services/api/src/modules/tuition/tuition.controller.ts` | 现有端点风格、鉴权模式、`req.auth.externalId` 用法 |
| `services/api/src/modules/tuition/tuition.service.ts` | 现有 `getPracticeStats`、`createSession` 等实现参考 |
| `services/api/src/modules/tuition/tuition.types.ts` | 现有类型，需补 `Question`、`PracticeSession`、`AnswerSubmitDto`、`AnalysisResult`、`ProgressDto`、`StatsDto` |
| `services/api/src/modules/tuition/tuition.service.spec.ts` | 现有测试风格参考 |
| `services/api/src/modules/tuition/agents/` | Agent 核心（后续 T6/T7 对接），先了解接口契约 |
| `packages/ontology/ontologies/k12/questions.yaml` | 题目本体 DSL 结构（判别列、extra JSONB、多态选项） |

---

## 📦 产出物清单

| 文件 | 动作 |
|------|------|
| `services/api/src/modules/tuition/tuition.controller.ts` | 新增 5 个端点（含参数校验、异常映射） |
| `services/api/src/modules/tuition/tuition.service.ts` | 新增 `getQuestion`、`submitAnswers`、`getAnalysis`、`getProgress`、`getStats` |
| `services/api/src/modules/tuition/tuition.types.ts` | 补全上述 6 个 DTO/返回类型 |
| `services/api/src/modules/tuition/tuition.service.spec.ts` | 新增 15+ 单测：题目渲染（多态类型）、答题判分（单选/多选/填空/主观）、进度计算、统计聚合 |
| `.agents/codex/outputs/p2-task-5-file-list.md` | 本任务新增/修改文件清单 |
| `.agents/codex/outputs/p2-task-5-verify.sh` | 自动化验收脚本（见下） |

---

## ✅ 验收标准（硬性）

1. **TypeScript 编译通过**：`npm run build` 0 error
2. **单测全绿**：`npm run test -- src/modules/tuition/tuition.service.spec.ts` 全部通过（目标 ≥ 30 tests）
3. **端到端验证脚本通过**：运行 `bash .agents/codex/outputs/p2-task-5-verify.sh` 输出 `全绿：PASS=X FAIL=0`
4. **题目多态渲染**：
   - `single_choice`：返回 `options[]`、单选判分
   - `multiple_choice`：返回 `options[]`、多选判分（全对给分）
   - `fill_blank`：返回 `blanks[]`、不区分大小写/空格判分
   - `essay`：返回 `rubric`、不自动判分（标记需人工/AI 批改）
5. **进度/统计实时性**：提交答案后 `GET /progress`、`GET /analysis` 立即反映最新状态
6. **externalId 契约**：所有端点按 `req.auth.externalId` 隔离数据，越权 403

---

## 🧪 验收脚本 `task-5-verify.sh` 规范

```bash
#!/usr/bin/env bash
# T5 自动化验收：练习中心主链路
set -uo pipefail
API_BASE="${API_BASE:-http://localhost:3008/api}"

# 1. 创建练习会话（指定知识点/题型/数量） → sessionId
# 2. GET /questions/{q1} → 渲染单选题，含 options/latex
# 3. POST /practice/sessions/{id}/answers {questionId: q1, answer: "A"} → 200, {correct: true, explanation: "..."}
# 4. 连续答 5 题（混合题型）
# 5. GET /practice/sessions/{id}/progress → {answered: 5, total: 10, correctRate: 0.8, currentIndex: 5}
# 6. GET /practice/sessions/{id}/analysis → 逐题解析、知识点掌握度对象
# 7. GET /practice/stats/{externalId} → 历史正确率、弱点 KP 列表、推荐复习题 IDs
# 8. 越权：用 A token 访问 B 的 session → 403
# 9. 无效题目 ID → 404
# 10. 会话已结束/超时 → 400/410
```

---

## 🔐 关键实现细节

| 点 | 要求 |
|----|------|
| 题目本体映射 | `questions.yaml` → `edu.questions` 表，`type` 判别列、`extra` JSONB 存选项/空白/评分规则 |
| 会话状态机 | `created → in_progress → completed/expired/abandoned`，状态流转受控 |
| 答题记录 | `edu.practice_answers(session_id, question_id, user_answer, is_correct, time_ms, submitted_at)` |
| 统计聚合 | `getStats` 读 `edu.practice_sessions` + `edu.practice_answers` 聚合，缓存 5min（Redis） |
| 知识点关联 | `question.knowledge_point_ids[]` → `edu.knowledge_points`，统计时按 KP 聚合正确率 |
| 事务边界 | `submitAnswers` 批量写入答案 + 更新会话进度，单事务 |

---

## 📝 任务卡存放路径

```
.agents/codex/tasks/p2-task-5-tuition-practice-center.md
```