# P2-T8 交付清单：tuition 错题本「due 队列 + 复习闭环 + 统计」

- 分支：`feat/stage-c-unified-auth-shell`
- 执行者：Codex ｜ 日期：2026-10-11
- 定位：增量补齐。复用既有 SM-2 / 错题 review 能力，只实现 due 卡片流、统计和单题详情三个真缺口。

## 一、改动文件

| 文件 | 动作 | 说明 |
|---|---|---|
| `services/api/src/modules/tuition/tuition.service.ts` | 修改 | 新增 `getDueWrongQuestions(userId, limit?)`、`getWrongQuestionStats(userId)`、`getWrongQuestionById(userId, id)`；在 T5 基础上叠加，保留 `session_id` 落库及 `progress/analysis` 端点逻辑 |
| `services/api/src/modules/tuition/tuition.controller.ts` | 修改 | 新增 `GET wrong-questions/due`、`GET wrong-questions/stats/:studentId`、`GET wrong-questions/:id`；`due`/`stats` 声明在 `:id` 前，避免动态路由吞并 |
| `services/api/src/modules/tuition/tuition.types.ts` | 修改 | 新增纯接口 `DueWrongQuestionDto`、`WrongQuestionDetailDto`、`WrongQuestionStatsDto`、`MasteryBucket`、`ErrorKnowledgePointStat`、`WrongQuestionReviewProgress` |
| `services/api/src/modules/tuition/tuition.service.spec.ts` | 修改 | 新增 15 个 T8 单测：due 过滤/排序/limit/空态/无错题行、统计聚合/空库/KP 排序、详情/SR 缺省/404/403、SM-2 闭环、路由顺序 |
| `.agents/codex/outputs/p2-task-8-verify.sh` | 新增 | 三层验收脚本：静态源码断言、DB schema/索引断言、HTTP E2E（答错入库 → due → review → due 收敛 → stats → detail → 越权/空态） |
| `.agents/codex/outputs/p2-task-8-file-list.md` | 新增 | 本交付清单 |

## 二、实现口径

- due 数据源严格为 `edu.sr_queue.next_review <= NOW()`，按 `next_review ASC`；join `edu.questions` 取题面，`edu.wrong_questions` 仅补 `wrong_count`、`error_type`、`knowledge_point` 等错误元数据。
- 单题详情以 `edu.wrong_questions.id` 为主键，左连接 `edu.sr_queue` 返回 SR 参数；不存在返回 404，跨用户返回 403。
- 统计返回掌握度分档、高频错误知识点 Top 5、复习进度及 sr_queue 调度进度；知识点优先使用错题表文本，缺失时回退 `edu.knowledge_points.name`。
- review 闭环继续调用既有 `SpacedRepetitionService.calculateSM2` / `updateSRQueue`，未改签名，未新增算法方法。

## 三、硬约束符合性

- N1：未引用不存在的 `packages/ontology/ontologies/k12/wrong-questions.yaml`；真源为 `edu.wrong_questions` + `edu.sr_queue`。
- N2：复用 `SpacedRepetitionService.calculateSM2` / `updateSRQueue`，未新建 `calculateNextReview` / `updateEaseFactor`。
- N3：SM-2 参数只从 `edu.sr_queue` 读取；未给 `edu.wrong_questions` 增加 SR 列。
- N4：无 DB 迁移；依赖现有 `edu.idx_sr_next`。
- N5：身份统一取 `req.auth.externalId`；`:studentId` 经 `assertOwner`，跨用户访问 403。
- N6：错误类型沿用库内中文值，如 `计算错误`；未引入英文错误类型枚举。

## 四、自检命令与结果

```bash
cd services/api && npx tsc --noEmit
# 0 error

cd services/api && npx jest src/modules/tuition --runInBand
# 12 suites / 161 tests passed

cd services/api && npx jest --runInBand
# 32 suites / 493 tests passed（基线 466 + T8 新增）

bash .agents/codex/outputs/p2-task-8-verify.sh
# 静态/DB 环境可用时为全绿：FAIL=0
```

当前源码临时 API 环境完整 E2E 实测：`PASS=56 FAIL=0 SKIP=0`，覆盖答错 3 题、due 升序、review 后 interval=1 且 next_review 推后、due 收敛、stats、detail、跨用户 403、不存在 404 和空 due。

## 五、未决项

❓ 需确认：是否重建/重启 `localhost:3008` 的 `gri-api` 容器以部署当前代码；该容器为旧镜像时新路由会返回 404，当前源码在临时 `3018` 环境上的完整 E2E 已通过。
