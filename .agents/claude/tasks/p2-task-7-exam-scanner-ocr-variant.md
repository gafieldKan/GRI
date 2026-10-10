> ✅ STATUS: REWRITTEN (2026-10-10) —— 依据 .agents/coordination/card-recon-2026-10-10.md §五 重写。原卡参照物 `k12/questions.yaml` 不存在；`exam-scanner.ts` 骨架已存在（含 **Mock OCR 回退 + LLM 解析**，非空壳）。真实缺口 = 3 个文件：`ocr-processor.ts` / `question-parser.ts` / `variant-generator.ts`；并需**确认 OCR 引擎选型**。
> 执行者：Claude ｜ 依赖：无（既有 tuition 基座 + `LlmService` 已就绪）｜ 预估：1 天

# T7 任务卡（重写）：`tuition/agents` —— ExamScanner OCR→结构化题目→变式题 增量补齐

## 📋 任务目标

在**既有 `ExamScannerAgent` 之上**增量补齐拍照解题链路的三个缺失环节：

1. **OCR 适配层** `ocr-processor.ts`：统一 `{text, latex, blocks[]}` 返回；多引擎可切换（本地 Mock / 多模态 LLM）。
2. **结构化解析** `question-parser.ts`：文本块 → `Question`（类型判别、知识点映射、难度估算）。
3. **变式生成** `variant-generator.ts`：`generate(seed, options) → Question[]`，策略：数值替换 / 条件变换。

## ⛔ 硬约束（先钉死，违反即失败）

| # | 约束 | 依据 |
|---|------|------|
| N1 | **不得重建** `exam-scanner.ts`。既有 `ExamScannerAgent.scanExam({imageDataUrl, subject?, gradeLevel?, rawText?})` 已实现：显式 `rawText` 优先 → 否则多模态 OCR → 无 key 抛 `NO_LLM_KEY` → **回退 Mock OCR 文本** → `_parseQuestions` LLM 解析 → `_parseJsonObject/_parseJsonArray`。新三文件是它的**下钻拆分/增强**，保持 `scanExam` 对外签名向后兼容（可增字段，不可删）。 | recon §五 + 实测 |
| N2 | **不得**引用 `packages/ontology/ontologies/k12/questions.yaml`（**不存在**）。题目/知识点真源 = `edu.questions` / `edu.knowledge_points` 表 + `k12-curriculum.ontology.yaml`（知识点结构）。 | 实测 |
| N3 | **OCR 引擎定论（本卡拍板）**：**默认多模态 LLM OCR**（复用既有 `LlmService.chatCompletionMultimodal`，即 `exam-scanner._performOCR` 现状）；`ocr-processor.ts` 作为**适配层**，定义统一接口 + 至少一个 Mock 引擎（无 key/离线/测试用）。**不引入** PaddleOCR/Tesseract/Mistral 等新原生依赖（与既有「禁用 native、只用既有依赖」纪律一致）。生产若要换引擎，仅需实现同接口。 | 本卡决策 |
| N4 | **无 DB 迁移**。既有链路不落库；本卡维持**纯计算**（输入图片/文本 → 输出结构）。**不新增** `edu.exam_scans` 表（原卡设想的缓存/去重表**不在本卡范围**，另立卡）。 | 求稳 |
| N5 | 变式生成**必须**经 `question-parser` 反向自校验（生成的变式题能被 parser 判为合法）；**离线/无 key 时用确定性 Mock 生成器**（数值替换可纯逻辑实现，不依赖 LLM）。 | 验收硬性 |
| N6 | `tuition.module.ts` 已 provide `ExamScannerAgent`；新增类若需注入 LLM/DB，**在此 module 注册**，不新建 module。 | 实测 |

## 📥 必读上下文（按顺序）

| 文件 | 用途 |
|------|------|
| `services/api/src/modules/tuition/agents/exam-scanner.ts` | **既有** `ExamScannerAgent`（OCR→解析主入口 + Mock 回退范式）——**下钻拆分基准** |
| `services/api/src/modules/tuition/agents/llm.service.ts` | **既有** LLM 封装（`isRealKey`/`chatCompletionMultimodal`/`chatCompletion`/`normalizeText`/`extractNumber`） |
| `services/api/src/modules/tuition/agents/question-generator.ts` | **既有** 出题器（可参考结构，勿改签名） |
| `services/api/src/modules/tuition/tuition.types.ts` | 需补 `ExamScanRequest`/`ExamScanResult`/`QuestionSeed`/`VariantGenerationOptions`（纯接口） |
| `services/api/src/modules/tuition/tuition.controller.ts` | 既有 `exam/upload`/`exam/save`/`exam/analyze` 端点（`exam-scanner` 的对外面） |
| `packages/ontology/ontologies/k12-curriculum.ontology.yaml` | 本体真源：知识点结构（**只读参考**，本卡不改） |

## 📦 产出物清单

| 文件 | 动作 | 要点 |
|------|------|------|
| `services/api/src/modules/tuition/agents/ocr-processor.ts` | **新增** | `OcrProcessor`：统一接口 `process(imageDataUrl) → { text, latex, blocks[] }`；实现 `MockOcrEngine`（确定性）+ `MultimodalLlmEngine`（包既有 `chatCompletionMultimodal`）；无 key → Mock |
| `services/api/src/modules/tuition/agents/question-parser.ts` | **新增** | `QuestionParser.parse(text|blocks, ctx) → Question[]`：类型判别（规则优先，LLM 兜底）、KP 映射（对 `edu.knowledge_points` 名匹配或 LLM）、难度估算；**不新引入向量检索依赖**，用名称/关键词匹配 + LLM |
| `services/api/src/modules/tuition/agents/variant-generator.ts` | **新增** | `VariantGenerator.generate(seed, options) → Question[]`：确定性策略（数值 ±20% 非零替换 / 已知未知互换）+ 可选 LLM 策略；生成后**自校验** |
| `services/api/src/modules/tuition/tuition.types.ts` | 修改 | 补 `ExamScanRequest`/`ExamScanResult`/`QuestionSeed`/`VariantGenerationOptions`/`OcrResult` 纯接口 |
| `services/api/src/modules/tuition/agents/exam-scanner.ts` | 修改（**最小**） | 内部改用 `OcrProcessor`/`QuestionParser`；`scanExam` 对外签名**向后兼容**；可增 `variants[]` |
| `services/api/src/modules/tuition/tuition.module.ts` | 修改 | 注册新增 providers |
| `services/api/src/modules/tuition/agents/ocr-processor.spec.ts` | **新增** | ≥ 4 单测：Mock 引擎确定性、无 key 回退、接口契约、异常输入 |
| `services/api/src/modules/tuition/agents/question-parser.spec.ts` | **新增** | ≥ 6 单测：单选/填空/解答判别、选项抽取、空白数、空输入 |
| `services/api/src/modules/tuition/agents/variant-generator.spec.ts` | **新增** | ≥ 6 单测：数值不同、KP 同源、确定性、自校验通过、选项数不变 |
| `.agents/claude/outputs/p2-task-7-file-list.md` | **新增** | 新增/修改文件清单 |
| `.agents/claude/outputs/p2-task-7-verify.sh` | **新增** | 自动化验收脚本（见下） |

> **总计单测 ≥ 16**。

## ✅ 验收标准（硬性）

1. **TypeScript 编译**：`cd services/api && npx tsc --noEmit` → 0 error。
2. **单测全绿**：`npx jest src/modules/tuition/agents` 全部通过（新增 ≥ 16 例）。
3. **既有回归不破**：`npx jest` 全量通过（基线 26 suites / 388 tests → 只增不减）。
4. **e2e**：`bash .agents/claude/outputs/p2-task-7-verify.sh` → `PASS=x FAIL=0 VERIFY_EXIT=0`。
5. **OCR→结构化**：单选题文本 → `type='single_choice'` + 4 选项 + KP 非空；填空题 → `type='fill_blank'` + `blanks[]` 数量正确。
6. **变式生成**：单选题种子 → 生成 3 道变式，数值不同、KP 同源、选项数一致，且**每题经 `question-parser` 反向校验合法**。
7. **离线确定性**：无 LLM key 时全流程走 Mock，结果**可重复**（同输入同输出）。

## 🧪 验收脚本 `.agents/claude/outputs/p2-task-7-verify.sh` 规范

```bash
#!/usr/bin/env bash
# T7 验收：OCR适配层/结构化解析/变式生成（无 LLM key 时全程 Mock）
set -uo pipefail
# 计数 PASS/FAIL，末尾输出 PASS=n FAIL=m VERIFY_EXIT=0|1
# 1. 纯计算段（无外部服务）：Mock OCR 文本 → QuestionParser 解析 → 断言 type/options/blanks/KP
# 2. 变式生成：断言 3 变式数值不同/KP 同源/自校验通过
# 3. 确定性：同输入连跑两次结果一致
# 4. 异常：空/乱码输入不崩溃（返回空数组或明确错误，不抛未捕获异常）
# 5. 以 jest 覆盖为主；若 tuition 端点运行，可加活体冒烟（exam/analyze）
```

> 说明：本卡核心是**纯领域链路**（OCR 适配/解析/生成），离线可完整验证；不以「假图片/假 job 轮询」造 e2e。

## 📝 任务卡存放路径

```
.agents/claude/tasks/p2-task-7-exam-scanner-ocr-variant.md
```
