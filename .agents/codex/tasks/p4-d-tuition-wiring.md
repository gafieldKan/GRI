# P4-D：教学卡接线（T6/T7 → TuitionController）+ DI 冒烟

> 执行者：Codex ｜ 波次：P4 ｜ 依赖：无 ｜ 状态：待下达
> 起因：历史挂起——T6（教学 FSM/意图/苏格拉底）/T7（试卷识别/变式）**未接线到 controller**；T7 顺带修了 T6 的 `import type { LlmService }` 潜伏 DI 缺陷，**须 build+启动冒烟验证 DI 真实路径**。

## 🔴 硬约束

| # | 约束 |
|---|---|
| N1 | 接线 = 在 `TuitionController` 暴露 T6/T7 能力（**最小端点集**）；不改已有端点契约。 |
| N2 | **DI 冒烟必做**：`npm run build` 后启动实例，确认容器 DI 能构造相关 provider（含 `LlmService` 值导入）；不得只跑 jest。 |
| N3 | 沿用既有模块边界；不新建 module。 |
| N4 | 无新迁移（除非确需，且先 build 再 migrate）。 |

## 📥 承重事实（实测）

- `services/api/src/modules/tuition/agents/`：`intent-classifier.ts`、`session-fsm.ts`、`socratic-templates.ts`、`ocr-processor.ts`、`question-parser.ts`、`variant-generator.ts`、`exam-scanner.ts`、`llm.service.ts`。
- `tuition.module.ts` / `tuition.service.ts` 已有引用（部分接线）。
- **question_type 词汇归一缺口**（历史）：parser 规范化 `single_choice/fill_blank/solution` vs tutor-agent 键 `choice/fill/solution` → 接线时归一。
- T6 曾用 `import type { LlmService }` 致 DI 失败（T7 改值导入 + jest.mock('@gri/agent-core')）；**运行期未验**。

## 📦 产出物

- TuitionController：暴露 T6（如 `POST /api/tuition/agent/{classify-intent,plan,chat}` 之一组最小端点）+ T7（如 `POST /api/tuition/exam/{scan,variants}`）。
- question_type 归一（parser ↔ tutor-agent 键）。
- spec + `.agents/codex/outputs/p4-d-file-list.md` + `p4-d-verify.sh`（含 **build+启动冒烟**）

## ✅ 验收标准

1. tsc 0 err；全量 jest 不回归；`verify.sh` FAIL=0。
2. **启动冒烟**：实例成功启动、相关 provider DI 构造无错；新端点无 token→401、缺参→400、正常→200。
3. question_type 归一：parser 输出与 tutor-agent 消费一致（断言）。

## 🚫 明确不做

- 不改 auth/权限；不做 Explorer/资源定位。
