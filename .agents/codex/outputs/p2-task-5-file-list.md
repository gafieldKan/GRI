# P2-T5 交付清单：tuition 练习中心「会话级进度/分析闭环」

- 分支：`feat/stage-c-unified-auth-shell`
- 执行者：Codex ｜ 日期：2026-10-11
- 定位：增量补齐（原卡 4/5 端点已存在，勿重建）。仅做 3 件真缺口。

## 一、改动文件（3 源文件小改 + 1 必要迁移 + 1 测试 + 2 验收产物）

| 文件 | 动作 | 说明 |
|---|---|---|
| `services/api/src/modules/tuition/tuition.service.ts` | 修改 | ① `submitPracticeAnswer` 落真实 `session_id`（`VALUES($1..$6)`，替换硬编码 `NULL`）并做会话归属校验；② 新增 `loadOwnedSession`（404/403 语义）；③ 新增 `getSessionProgress`；④ 新增 `getSessionAnalysis`；⑤ 新增 `UUID_RE` 静态守卫 |
| `services/api/src/modules/tuition/tuition.controller.ts` | 修改 | 新增 `GET practice/sessions/:sessionId/progress`、`GET practice/sessions/:sessionId/analysis`；`submitAnswer` 签名改用 `AnswerSubmitDto` |
| `services/api/src/modules/tuition/tuition.types.ts` | 修改 | 新增纯接口 `AnswerSubmitDto` / `SessionProgressDto` / `SessionAnalysisItem` / `KnowledgePointMastery` / `SessionAnalysisDto` |
| `services/api/src/migrate/020_answer_records_session_fk.sql` | 新增（N4 必要例外） | `edu.answer_records.session_id` 的 FK 由 `edu.sessions(id)` 重定向到 `edu.practice_sessions(id)`（`ON DELETE SET NULL`）+ `idx_answers_session` 索引 |
| `services/api/src/modules/tuition/tuition.service.spec.ts` | 修改 | 新增 12 个单测（会话落库/归属/进度/分析/403/404） |
| `.agents/codex/outputs/p2-task-5-verify.sh` | 新增 | 三层自动化验收脚本（静态 + DB + HTTP E2E） |
| `.agents/codex/outputs/p2-task-5-file-list.md` | 新增 | 本文件 |

## 二、为什么必须新增迁移 020（N4 例外说明）

承重事实（迁移前实查）：`edu.answer_records.session_id` 的 FK 指向 **`edu.sessions(id)`**（006_ai_vertical.sql:95），
而练习会话 id 来自 **`edu.practice_sessions(id)`**——两者是不同域的表。
若直接写 `session_id = practice_sessions.id`，Postgres 立即 FK 违约（500），故「真落库」无法达成。
迁移前 `answer_records` 共 29 行、`session_id` 非空 **0 行**（无数据依赖），重定向安全。
020 仅 `DROP/ADD CONSTRAINT`（幂等 DO 块）+ 建索引，不改表结构、不动 jsonb 列。

## 三、契约与约束符合性

- **N1** 真源 = `edu.questions` 表（本卡只读）；未引用不存在的 `k12/questions.yaml`。
- **N2** 未新建 module，全部落在既有 controller/service/types。
- **N3** 题面多态沿用 `edu.questions.type` + `options jsonb` + `content_latex`/`answer_latex`，未引入新判别列/新表。
- **N4** 唯一迁移 020 为「落 session_id 必需」的 FK 重定向（见上），且已 `build → migrate` 落地。
- **N5** 身份一律 `req.auth.externalId`（controller `userId(req)`），无硬编码学生 id。
- **N6** 越权 → 403（`loadOwnedSession` 走 `ForbiddenException`）；无效/畸形 sessionId → 404。

## 四、自检命令与结果

```bash
cd services/api && npx tsc --noEmit                 # 0 error
cd services/api && npx jest src/modules/tuition     # 12 suites / 146 tests 全绿
cd services/api && npx jest                         # 32 suites / 478 tests 全绿（基线 466 + 12）
bash .agents/codex/outputs/p2-task-5-verify.sh      # 全绿：PASS=32 FAIL=0 SKIP=0
```

E2E 实测要点（真实容器栈）：
- `POST practice/session/start` → `POST practice/answer`×3（带 `sessionId`）→ `GET .../progress` = `{answered:3,total:3,currentIndex:3,correctRate:0}`。
- `GET .../analysis` = 逐题 3 条 + `knowledgePoints` 聚合数组。
- `edu.answer_records.session_id` 实测落库 3 条非 NULL。
- B 访问 A 的 progress/analysis → 403；不存在/畸形 sessionId → 404。

## 五、未决项

❓ 需确认：迁移 020 将 `answer_records.session_id` 的 FK 从 `edu.sessions` 改为 `edu.practice_sessions`。
该列历史恒为 NULL、当前无其它消费方，属「练习会话闭环」的根因修复；若未来教学 FSM 会话（edu.sessions）
也要在此列留痕，需另立判别列（本卡受 N3 限制未引入）。请确认此 FK 语义收敛是否符合预期。
