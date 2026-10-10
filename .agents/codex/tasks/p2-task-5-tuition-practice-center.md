> ✅ STATUS: REWRITTEN (2026-10-10) —— 依据 `.agents/coordination/card-recon-2026-10-10.md §三` 重写。原卡引用 `k12/questions.yaml` **不存在**；5 个目标端点中 4 个**已存在**（`questions` / `questions/:id` / `practice/session/start|complete` / `practice/stats/:studentId` / `practice/answer`）。**真实缺口 = 会话级 progress/analysis 缺口 + `/practice/answer` 不落 session_id**。
> 执行者：Codex ｜ 依赖：无（tuition 基座已就绪）｜ 预估：0.5 天

# T5 任务卡：`tuition` 练习中心 —— 会话级进度/分析闭环（增量补齐）

**执行者**：Codex
**依赖**：无（`tuition` 模块 + `edu.practice_sessions` / `edu.answer_records` 均已就绪）
**产出目录**：`services/api/src/modules/tuition/`
**预估**：0.5 天

---

## 🎯 本卡定位（必须先读，防重蹈覆辙）

原卡把 T5 写成「从零建设练习中心主链路」，**但主链路 80% 已在仓库中**。实测对照：

| 原卡要求 | 现实 | 判定 |
|---|---|---|
| `GET /questions/:id` 题目渲染 | ✅ 已有（`tuition.controller.ts:57` → `getQuestionDetail`） | **勿重建** |
| `POST /practice/sessions/:id/answers` 答题提交 | 🟡 语义已有，形为 `POST /practice/answer`（`:192`） | **勿新建，改其行为** |
| `GET /practice/sessions/:id/analysis` 逐题解析 | 🟡 `POST /analysis/analyze` + `GET /analysis/report/:examId` 已有 | **补会话级视图** |
| `GET /practice/sessions/:id/progress` 进度 | ❌ **真缺口** | **本卡核心** |
| `GET /practice/stats/:externalId` 统计 | 🟡 已有 `GET /practice/stats/:studentId`（`:173`，`assertOwner` 已把 `:studentId` 当 externalId 校验） | **勿重建，补字段** |

**本卡只做 3 件真缺口**：
1. **`POST /practice/answer` 落 `session_id`**（当前硬编码 `NULL`，会话级进度/分析**无数据源**——这是根因）。
2. **新增 `GET /practice/sessions/:id/progress`**（已答/总数、正确率、当前题索引）。
3. **新增 `GET /practice/sessions/:id/analysis`**（会话级逐题解析 + 知识点掌握度聚合）。

---

## 🔴 硬约束（违反即失败）

| # | 约束 |
|---|---|
| **N1** | **禁引 `packages/ontology/ontologies/k12/questions.yaml`（不存在）**。题目真源 = `edu.questions` 表 + `packages/ontology/ontologies/k12-curriculum.ontology.yaml`（只读参考，本卡不改本体）。 |
| **N2** | **不新建 module**；全部改在既有 `tuition.controller.ts` / `tuition.service.ts` / `tuition.types.ts`。 |
| **N3** | **题面多态沿用现有表结构**：`edu.questions.type`（`multiple-choice`/`fill`/…）+ `options jsonb` + `content_latex`/`answer_latex`。**不得**引入 `single_choice`/`fill_blank` 等新判别列或新表。 |
| **N4** | **无 DB 迁移**（`edu.practice_sessions.questions`/`answers`/`stats` 均已是 jsonb，够用）。仅当发现列缺失且**必要**时才可新增迁移，且必须 `npm run build` 后再 `npm run migrate`。 |
| **N5** | **身份契约**：一律 `req.auth.externalId`（`:studentId` 参数由 `assertOwner` 校验等价于 externalId）。**禁止**硬编码 `student_001`。 |
| **N6** | **越权 403**：会话/统计属个人私有，跨用户访问经 `assertOwner` 返回 403。 |

---

## 📥 必读上下文（按序）

| 文件 | 用途 |
|---|---|
| `services/api/src/modules/tuition/tuition.controller.ts` | 现有端点风格、`userId(req)`/`assertOwner` 用法、练习段 `:150-200` |
| `services/api/src/modules/tuition/tuition.service.ts` | `startPracticeSession`(`:226`)、`submitPracticeAnswer`(`:262`)、`completePracticeSession`(`:466`)、`computeStats`(`:358`) |
| `services/api/src/modules/tuition/tuition.types.ts` | 现有 `PracticeSession` / `Question`；本卡补 DTO |
| `services/api/src/modules/tuition/tuition.service.spec.ts` | 现有测试风格 |
| `.agents/coordination/card-recon-2026-10-10.md §三` | 降级判定依据 |
| （真源参考）`packages/ontology/ontologies/k12-curriculum.ontology.yaml` | 知识点/题型本体口径 |

**表结构实测（承重事实，勿臆测）**：
- `edu.practice_sessions(id, user_id, start_time, end_time, score, status['in_progress'|...], mode, subject, topic_id, questions jsonb, answers jsonb, stats jsonb, duration, completed_at, legacy_id)`
- `edu.answer_records(user_id, question_id, session_id, student_answer, is_correct, time_spent_ms, ...)`
- `edu.questions(id, knowledge_point_id, content, options jsonb, answer, analysis, difficulty, type, content_latex, answer_latex, explanation, variant_of, legacy_id)`

---

## 📦 产出物清单

| 文件 | 动作 |
|---|---|
| `tuition.service.ts` | ① `submitPracticeAnswer` **落真实 `session_id`**（替换硬编码 `NULL`，并校验会话归属）② 新增 `getSessionProgress(userId, sessionId)` ③ 新增 `getSessionAnalysis(userId, sessionId)` |
| `tuition.controller.ts` | 新增 `GET /practice/sessions/:sessionId/progress`、`GET /practice/sessions/:sessionId/analysis`（均经 `assertOwner` + 会话归属校验） |
| `tuition.types.ts` | 补 `SessionProgressDto` / `SessionAnalysisDto` / `AnswerSubmitDto`（纯接口，无装饰器） |
| `tuition.service.spec.ts` | 新增 ≥ 12 单测 |
| `.agents/codex/outputs/p2-task-5-file-list.md` | 新增/修改清单 |
| `.agents/codex/outputs/p2-task-5-verify.sh` | 自动化验收脚本 |

---

## ✅ 验收标准（硬性）

1. `npx tsc --noEmit` → 0 error。
2. `npx jest src/modules/tuition` 全绿；新增 ≥ 12 测试。
3. `npx jest`（全量）**不回归** —— 执行前基线 **32 suites / 466 tests**。
4. `bash .agents/codex/outputs/p2-task-5-verify.sh` → `FAIL=0`。
5. **会话进度**：`practice/session/start` 建会话 → `practice/answer`（带 `sessionId`）答 3 题 → `GET .../progress` 返回 `{answered:3, total:N, correctRate, currentIndex:3}`。
6. **会话分析**：`GET .../analysis` 返回逐题解析 + 按 `knowledge_point_id` 聚合的正确率。
7. **session_id 真落库**：查 `edu.answer_records` 该记录的 `session_id` 非 NULL。
8. **越权 403**：A 用户 token 访问 B 的 session progress/analysis → 403；无效 sessionId → 404。

---

## 🧪 验收脚本 `p2-task-5-verify.sh` 规范

```bash
#!/usr/bin/env bash
# T5 自动化验收：会话级进度/分析闭环
set -uo pipefail
API_BASE="${API_BASE:-http://localhost:3008/api}"
# 前置：TEST_IDENTIFIER=testuser / TEST_PASSWORD=test1234 登录取 token
# 1. POST /practice/session/start → sessionId
# 2. POST /practice/answer {questionId,answer,sessionId} ×3
# 3. GET  /practice/sessions/{id}/progress  → answered=3, currentIndex≈3, correctRate∈[0,1]
# 4. GET  /practice/sessions/{id}/analysis  → 逐题解析数组 + KP 聚合对象
# 5. psql 校验 answer_records.session_id NOT NULL = sessionId
# 6. 越权：另一 token 访问 → 403
# 7. 无效 sessionId → 404
echo "全绿：PASS=$PASS FAIL=$FAIL"
```

---

## 📝 任务卡路径

```
.agents/codex/tasks/p2-task-5-tuition-practice-center.md
```
