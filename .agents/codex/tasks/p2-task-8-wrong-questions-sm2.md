> ✅ STATUS: REWRITTEN (2026-10-10) —— 依据 `.agents/coordination/card-recon-2026-10-10.md §六` 重写。原卡**多处与实况不符**：引用 `k12/wrong-questions.yaml`（不存在）；称 SM-2 方法为 `calculateNextReview`/`updateEaseFactor`（实为 `calculateSM2`/`updateSRQueue`）；`edu.wrong_questions` 表结构描述全错（无 `external_id`/`knowledge_point_ids[]`/`ease_factor`/`interval_days`/`next_review_at`；SM-2 参数在 `edu.sr_queue` 不在 wrong_questions）；去重键是 `(user_id, question_id)` 非 `(external_id, question_id)`。
> 执行者：Codex ｜ 依赖：无（可按序在 T5 后，但无硬依赖）｜ 预估：0.5 天

# T8 任务卡：`tuition` 错题本 —— due 队列 + 复习闭环 + 统计（增量补齐）

**执行者**：Codex
**依赖**：无硬依赖（T5 推荐先做，因 both 改 `tuition.service.ts`）
**产出目录**：`services/api/src/modules/tuition/`
**预估**：0.5 天

---

## 🎯 本卡定位（必须先读，防重蹈覆辙）

原卡把 T8 写成「从零建设错题本 + SM-2」，**但 SM-2 算法与错题端点大半已在仓库中**。实测对照：

| 原卡要求 | 现实 | 判定 |
|---|---|---|
| 错题自动入库 | ✅ 已有（`submitPracticeAnswer` 内 `ON CONFLICT (user_id, question_id)` 幂等入账） | **勿重建** |
| SM-2 间隔复习调度 | ✅ 已有（`SpacedRepetitionService.calculateSM2` + `updateSRQueue`，写 `edu.sr_queue`） | **勿重建** |
| 卡片式复习 `GET /wrong-questions/due` | ❌ **真缺口**（现仅有 `GET /practice/sr-queue/:studentId`，非 wrong-questions 卡片流） | **本卡核心** |
| `POST /wrong-questions/:id/review` | ✅ 已有（`:104` → `reviewWrongQuestion`） | **勿重建** |
| `GET /wrong-questions/stats/:externalId` | ❌ **真缺口** | **本卡核心** |
| `GET /wrong-questions/:id` 单题详情 | ❌ 真缺口（小） | 本卡补 |

**本卡只做 3 件真缺口**：
1. **`GET /wrong-questions/due`** —— 到期卡片流（`next_review ≤ now`，按 `next_review` 升序）。
2. **`GET /wrong-questions/stats/:studentId`** —— 掌握度分布、高频错误 KP、复习进度。
3. **`GET /wrong-questions/:id`** —— 单条错题详情（含 SR 参数）。

---

## 🔴 硬约束（违反即失败）

| # | 约束 |
|---|---|
| **N1** | **禁引 `packages/ontology/ontologies/k12/wrong-questions.yaml`（不存在）**。真源 = `edu.wrong_questions` + `edu.sr_queue` 表。 |
| **N2** | **复用既有 `SpacedRepetitionService`**（`calculateSM2`/`updateSRQueue`），**禁**新造 `calculateNextReview`/`updateEaseFactor`，**禁**改其签名。 |
| **N3** | **SM-2 参数只存 `edu.sr_queue`**（`ease_factor`/`interval`/`repetitions`/`next_review`）；**不得**给 `edu.wrong_questions` 加 SR 列。 |
| **N4** | **无 DB 迁移**（`edu.sr_queue` 已有 `idx_sr_next(next_review)`，够用）。仅当必要才加迁移，且先 `npm run build` 再 `npm run migrate`。 |
| **N5** | **身份契约**：一律 `req.auth.externalId`（`:studentId` 经 `assertOwner` 校验）。 |
| **N6** | **错误类型沿用现有中文值**（如 `'计算错误'`），**不得**改成原卡提议的英文枚举 `'conceptual'|...`（会与库中既有数据断层）。 |

---

## 📥 必读上下文（按序）

| 文件 | 用途 |
|---|---|
| `services/api/src/modules/tuition/agents/spaced-repetition.service.ts` | `calculateSM2`/`masteryToQuality`/`updateSRQueue` 全 API |
| `services/api/src/modules/tuition/tuition.controller.ts` | 错题段 `:92-118`；`assertOwner` |
| `services/api/src/modules/tuition/tuition.service.ts` | `getWrongQuestions`(`:133`)/`reviewWrongQuestion`(`:154`)/`getSpacedRepetitionQueue`(`:384`) |
| `services/api/src/modules/tuition/tuition.types.ts` | 现有 `WrongQuestion` |
| `services/api/src/modules/tuition/tuition.service.spec.ts` | 测试风格 |

**表结构实测（承重事实，勿臆测）**：
- `edu.wrong_questions(id, user_id, question_id, wrong_count, last_attempt_at, is_resolved, exam_id, question_text, question_type, subject, knowledge_point varchar(200), student_answer, correct_answer, error_type, difficulty float, mastery_level, reviewed, mastered, review_count, last_reviewed_at, legacy_id, created_at, updated_at)` — **注意：无 `next_review_at`！**
- `edu.sr_queue(user_id, question_id, last_reviewed, interval int, ease_factor float, repetitions int, next_review, updated_at)` PK`(user_id, question_id)`，idx`idx_sr_next(next_review)`

**关键归属**：`due` 队列的正确数据源 = **`edu.sr_queue`（`next_review ≤ now`）** join `edu.questions`；`wrong_questions` 只提供错误元数据（`error_type`/`wrong_count`/`knowledge_point`）。

---

## 📦 产出物清单

| 文件 | 动作 |
|---|---|
| `tuition.service.ts` | 新增 `getDueWrongQuestions(userId, limit?)`（join sr_queue）、`getWrongQuestionStats(userId)`（KP 聚合 + 掌握度分布）、`getWrongQuestionById(userId, id)` |
| `tuition.controller.ts` | 新增 `GET /wrong-questions/due`、`GET /wrong-questions/stats/:studentId`、`GET /wrong-questions/:id`（**注意路由顺序：`due`/`stats` 必须在 `:id` 之前声明**，否则被 `:id` 吞） |
| `tuition.types.ts` | 补 `DueWrongQuestionDto` / `WrongQuestionStatsDto`（纯接口，无装饰器） |
| `tuition.service.spec.ts` | 新增 ≥ 12 单测（due 过滤/排序、统计聚合、越权、空态、SM-2 联动） |
| `.agents/codex/outputs/p2-task-8-file-list.md` | 新增/修改清单 |
| `.agents/codex/outputs/p2-task-8-verify.sh` | 自动化验收脚本 |

---

## ✅ 验收标准（硬性）

1. `npx tsc --noEmit` → 0 error。
2. `npx jest src/modules/tuition` 全绿；新增 ≥ 12 测试。
3. `npx jest`（全量）**不回归** —— 基线 **32 suites / 466 tests**。
4. `bash .agents/codex/outputs/p2-task-8-verify.sh` → `FAIL=0`。
5. **due 过滤正确**：仅返回 `sr_queue.next_review ≤ now`，按 `next_review` 升序；答对推后 `next_review` 后**不再出现**在 due。
6. **SM-2 联动**：`review` 后 `sr_queue.interval/ease_factor/repetitions/next_review` 按 `calculateSM2` 更新。
7. **统计聚合**：`stats` 返回 `{masteryBuckets, topErrorKnowledgePoints[], reviewProgress}`，按 `knowledge_point` 聚合。
8. **越权 403**：跨用户访问 → 403；无 SR 记录时 due 返回空数组（不报错）。

---

## 🧪 验收脚本 `p2-task-8-verify.sh` 规范

```bash
#!/usr/bin/env bash
# T8 自动化验收：错题本 due 队列 + 复习闭环 + 统计
set -uo pipefail
API_BASE="${API_BASE:-http://localhost:3008/api}"
# 前置：登录取 token（TEST_IDENTIFIER=testuser / TEST_PASSWORD=test1234）
# 1. 练习答错 3 题 → 自动入库 wrong_questions 且 sr_queue 建行（next_review ≤ now）
# 2. GET /wrong-questions/due → 3 条，按 next_review 升序
# 3. POST /wrong-questions/{q1}/review {mastery:0.9} → 200；sr_queue 该行 interval=1,next_review≈+1d
# 4. 再 GET /due → q1 已消失（或按实现口径减少）
# 5. GET /wrong-questions/stats/{externalId} → masteryBuckets + topErrorKnowledgePoints + reviewProgress
# 6. GET /wrong-questions/{id} → 单条详情含 SR 参数
# 7. 越权：另一 token → 403
echo "全绿：PASS=$PASS FAIL=$FAIL"
```

---

## 📝 任务卡路径

```
.agents/codex/tasks/p2-task-8-wrong-questions-sm2.md
```
