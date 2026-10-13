# P4-D 教学卡接线（T6/T7 → TuitionController）+ DI 冒烟 — 交付清单

> 分支：`feat/stage-c-unified-auth-shell`（改动留在工作树，未 commit / 未 checkout）
> 任务卡：`.agents/codex/tasks/p4-d-tuition-wiring.md`
> 依据：`.agents/codex/tasks/p4-d-tuition-wiring.md`

## 1. 变更文件

### 新增

| 文件 | 说明 |
|---|---|
| `services/api/src/modules/tuition/tuition.controller.spec.ts` | T6/T7 五个最小端点的参数校验、委托调用与 `200` HTTP 状态断言 |
| `services/api/src/modules/tuition/agents/tutor-agent.spec.ts` | `question_type` 从 parser 词汇到 TutorAgent 分桶键的归一断言 |
| `.agents/codex/outputs/p4-d-verify.sh` | tsc、聚焦/全量 Jest、build、真实 DI 启动与 `401/400/200` 活体冒烟 |
| `.agents/codex/outputs/p4-d-file-list.md` | 本清单 |

### 修改

| 文件 | 说明 |
|---|---|
| `services/api/src/modules/tuition/tuition.controller.ts` | 接入既有 `IntentClassifier`、`TeachingCardFsm`、`SocraticTemplates`、`ExamScannerAgent`、`VariantGenerator`，暴露 T6/T7 最小端点集 |
| `services/api/src/modules/tuition/agents/tutor-agent.ts` | 在答案校验和 `byType` 分桶消费边界统一归一 `question_type` |

## 2. API 契约

新端点均为 `POST`，未登录 `401`，缺参/非法参数 `400`，正常 `200`。既有端点契约不改，新端点不进入公开路由白名单。

| 端点 | 最小请求 | 行为 |
|---|---|---|
| `POST /api/tuition/agent/classify-intent` | `{ "input": "..." }` | 委托 `IntentClassifier.classify`，返回 `{intent, confidence}` |
| `POST /api/tuition/agent/card/advance` | `{ "intent": "ASK_HINT" }` | 未传 `state` 时使用 `initialCardState()`，返回下一状态与前端 update |
| `POST /api/tuition/agent/socratic/render` | `{ "key": {...}, "context": { "knowledgePoint": "..." } }` | 委托模板库渲染，返回 `{message}` |
| `POST /api/tuition/exam/scan` | `{ "rawText": "..." }` 或 `imageDataUrl` | 委托 `ExamScannerAgent` 完成 OCR/解析/可选变式链路 |
| `POST /api/tuition/exam/variants` | `{ "seed": { "type": "solution", "content": "..." } }` | 委托 `VariantGenerator`，返回 `{variants}` |

非法卡片转移、缺失模板或模板变量统一映射为 `BadRequestException`，避免把领域错误暴露为 `500`。

## 3. `question_type` 归一

`QuestionParser` 产出 `single_choice` / `multiple_choice` / `fill_blank` / `solution`；TutorAgent 的分桶键是 `choice` / `fill` / `solution`。归一边界：

- `choice` / `single_choice` / `multiple_choice` / `multiple-choice` → `choice`
- `fill` / `fill_blank` / `text` → `fill`
- `solution` / `short-answer` / `short_answer` / `essay` → `solution`
- 未知题型仍计入总正确数，但不臆造 `byType` 分桶。

`_checkAnswer` 与 `_analyzeAnswers` 共用同一归一函数，spec 对 parser 词汇和 TutorAgent 消费键做了一致性断言。

## 4. 验证结果

```bash
bash .agents/codex/outputs/p4-d-verify.sh
```

- `npx tsc --noEmit`：0 errors。
- 聚焦 Jest：2 suites / 11 tests passed。
- 全量 Jest：42 suites / 595 tests passed，较任务卡记录的 40/572 基线保留原有测试并新增 2 suites / 11 tests。
- `npm run build`：通过。
- 真实实例：镜像内 `node dist/main.js` 成功完成 Nest DI 构造并启动，`/health` 为 `200`，运行期路由表包含 5 个新端点。
- 新端点活体断言：每个端点均验证无 token `401`、缺参 `400`、有效请求 `200`；`classify-intent`、卡片推进、模板消息、试卷解析与 `solution` 变式返回均通过。
- `git diff --check`：干净。

最终门禁以脚本末行 `全绿：PASS=... FAIL=0 SKIP=0` 为准。

## 5. 边界

- 未新建 module，仍沿用 `TuitionModule` 既有 provider 边界。
- 无新增迁移；本次只接线、归一和验证。
- 未改 auth/权限；新端点保持强制鉴权。
- 未 commit、未 checkout；未输出 token、service token、密码或 API key。
- 明确不做：Explorer / 资源定位。
