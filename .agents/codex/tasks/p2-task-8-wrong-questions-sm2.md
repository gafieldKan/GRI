# T8 任务卡：`tuition` - 错题本 SM-2 间隔复习 + 卡片式复习模式

**执行者**：Codex  
**依赖**：T5 完成（练习中心主链路就绪）  
**产出目录**：`services/api/src/modules/tuition/`、`services/api/src/modules/tuition/agents/`  
**预估**：1 天

---

## 📋 任务目标

实现 **错题本** 核心功能，支撑前端「错题本」Tab：

1. **错题自动入库**：练习/考试/辅导中答错 → 自动写入 `edu.wrong_questions`（去重、关联知识点、记录错误类型）
2. **SM-2 间隔复习调度**：基于 `spaced-repetition-service.ts` 现有实现，生成复习计划（间隔、下次复习时间、ease factor）
3. **卡片式复习模式**：`GET /api/tuition/wrong-questions/due` → 到期题目卡片流，`POST /api/tuition/wrong-questions/:id/review` → 判分 + 更新 SM-2 参数
4. **错题统计**：`GET /api/tuition/wrong-questions/stats/:externalId` → 掌握度分布、高频错误 KP、复习进度

---

## 📥 必读上下文（按顺序）

| 文件 | 用途 |
|------|------|
| `services/api/src/modules/tuition/agents/spaced-repetition.service.ts` | 现有 SM-2 实现（`calculateNextReview`、`updateEaseFactor`），直接复用 |
| `services/api/src/modules/tuition/tuition.service.ts` | 现有 `getPracticeStats` 风格，新增错题相关方法 |
| `services/api/src/modules/tuition/tuition.controller.ts` | 现有端点风格，新增错题端点 |
| `services/api/src/modules/tuition/tuition.types.ts` | 需补 `WrongQuestion`、`ReviewRecord`、`SM2Params`、`WrongQuestionStats` |
| `services/api/src/modules/tuition/tuition.service.spec.ts` | 现有测试风格，新增错题测试 |
| `packages/ontology/ontologies/k12/wrong-questions.yaml` | 错题本体 DSL（错误类型枚举、SM-2 参数列） |

---

## 📦 产出物清单

| 文件 | 动作 |
|------|------|
| `services/api/src/modules/tuition/tuition.controller.ts` | 新增 4 个端点：`GET /wrong-questions/due`、`POST /wrong-questions/:id/review`、`GET /wrong-questions/stats/:externalId`、`GET /wrong-questions/:id` |
| `services/api/src/modules/tuition/tuition.service.ts` | 新增 `getDueWrongQuestions`、`reviewWrongQuestion`、`getWrongQuestionStats`、`getWrongQuestionById`、内部 `recordWrongQuestion`（供练习/辅导调用） |
| `services/api/src/modules/tuition/tuition.types.ts` | 补全上述类型 |
| `services/api/src/modules/tuition/tuition.service.spec.ts` | 新增 12+ 单测：SM-2 算法验证、去重逻辑、复习流转、统计聚合 |
| `.agents/codex/outputs/p2-task-8-file-list.md` | 本任务新增/修改文件清单 |
| `.agents/codex/outputs/p2-task-8-verify.sh` | 自动化验收脚本（见下） |

---

## ✅ 验收标准（硬性）

1. **TypeScript 编译通过**：`npm run build` 0 error
2. **单测全绿**：`npm run test -- src/modules/tuition/tuition.service.spec.ts` 全部通过（目标 ≥ 42 tests 含原有）
3. **端到端验证脚本通过**：运行 `bash .agents/codex/outputs/p2-task-8-verify.sh` 输出 `全绿：PASS=X FAIL=0`
4. **SM-2 算法正确**：
   - 首次复习间隔 1 天，第二次 6 天，之后按 ease factor 指数增长
   - `again` (0) → 重置间隔 1 天、ease -0.2
   - `hard` (3) → 间隔 ×1.2、ease -0.15
   - `good` (4) → 间隔 ×ease、ease 不变
   - `easy` (5) → 间隔 ×ease×1.3、ease +0.15
5. **去重逻辑**：同一 `question_id` + `externalId` 24h 内重复入库只计 1 条，错误类型取最新
6. **卡片流**：`due` 接口仅返回 `next_review_at ≤ now` 的题目，按 `next_review_at` 升序

---

## 🧪 验收脚本 `task-8-verify.sh` 规范

```bash
#!/usr/bin/env bash
# T8 自动化验收：错题本 SM-2 + 卡片复习
set -uo pipefail
API_BASE="${API_BASE:-http://localhost:3008/api}"

# 1. 做练习答错 3 题 → 自动入库 wrong_questions（检查去重）
# 2. GET /wrong-questions/due → 3 道题（首次间隔 0 天即到期）
# 3. 复习第 1 题：POST /review {rating: 4(good)} → 下次复习 6 天后
# 4. 复习第 2 题：POST /review {rating: 0(again)} → 下次复习 1 天后
# 5. 复习第 3 题：POST /review {rating: 5(easy)} → 下次复习 8 天后
# 6. 立即 GET /due → 仅第 2 题（1 天后到期，当前不 due）→ 空数组
# 7. 修改系统时间/模拟时间推进 → 验证 due 正确性
# 8. GET /wrong-questions/stats/{externalId} → 掌握度分布、高频 KP、复习进度
# 9. 越权：用 A token 复习 B 的错题 → 403
```

---

## 🔐 关键实现细节

| 点 | 要求 |
|----|------|
| 错题表 | `edu.wrong_questions(id, external_id, question_id, knowledge_point_ids[], error_type, first_wrong_at, last_wrong_at, review_count, ease_factor, interval_days, next_review_at, status)` |
| 错误类型枚举 | `'conceptual' \| 'calculation' \| 'careless' \| 'misreading' \| 'unknown'` |
| 入库触发点 | `tuitionService.submitAnswers`、`tutorAgent.handleUserInput`、`examScanner.scan` 均调用 `recordWrongQuestion` |
| SM-2 参数持久化 | 每次复习更新 `ease_factor`、`interval_days`、`next_review_at`、`review_count`、`last_reviewed_at` |
| 索引 | `idx_wrong_due (external_id, next_review_at)`、`idx_wrong_kp (knowledge_point_ids)` |
| 幂等 | `recordWrongQuestion` 使用 `ON CONFLICT (external_id, question_id) DO UPDATE` |

---

## 📝 任务卡存放路径

```
.agents/codex/tasks/p2-task-8-wrong-questions-sm2.md
```