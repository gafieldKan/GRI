# P2-T7 文件清单（tuition/agents —— OCR 适配层 + 结构化解析 + 变式生成）

分支：`feat/stage-c-unified-auth-shell`｜执行者：Claude（实现工程师）｜日期：2026-10-10

## 设计决策（对齐硬约束 N1–N6）

| 决策 | 取值 | 理由 |
|------|------|------|
| OCR 引擎选型 | **默认多模态 LLM**（复用既有 `LlmService.chatCompletionMultimodal`）；`MockOcrEngine` 为**确定性**引擎，用于无 key / 离线 / 测试。二者同实现 `OcrEngine` 接口，生产换引擎仅需实现同接口。 | **N3** 定论；**不引入** PaddleOCR/Tesseract/Mistral 等原生依赖。 |
| OCR 门面容错 | `OcrProcessor.process` 分派：显式 `rawText` → `passthrough`；空图 → Mock（**不发空图给端点**，避免挂死）；无 key → Mock；多模态失败 → Mock 兜底。**绝不抛未捕获异常**。 | 离线可控可重复；沿用既有 `exam-scanner` Mock 回退范式。 |
| OCR 统一出参 | `{ text, latex, blocks[] }`（`OcrResult`）；`blocks` 按行分块，含 `=` 的行为 `formula` 块并附 latex。 | 卡内产出要求「统一 `{text,latex,blocks[]}`」。 |
| 解析判别顺序 | **规则优先**：选项标记（A/B/C/D 连续）→ 单选/多选；下划线空位（`_{2,}` / 空括号）→ 填空；否则解答。KP 先匹配 `edu.knowledge_points` 名录（子串、最长优先），再退回内置关键词表，**兜底非空**（`综合`）。 | **N2**：KP 真源为表；**不引向量/embedding 依赖**，用名称/关键词匹配 + 可选 LLM。 |
| 解析 LLM 兜底 | 仅在有真实 key（`isRealKey()`）时，用既有 `chatCompletion` 对**已定结构**微调 KP/难度；**题型由规则定、不被 LLM 改动**；异常静默回退规则结果。 | **N5**/离线确定性：无 key 全链路不触网。 |
| 变式策略 | 纯逻辑、确定性：`numeric`（同一 ±20% 内非零因子作用于题干/选项/答案，**十分位精度**避免取整塌缩）、`swap`（「已知 X，求 Y」互换，**仅非选择题**，避免选项错配）、`auto`（交替）。可选 LLM 改写（有 key 时，失败即回退）。 | 卡内「数值 ±20% 非零替换 / 已知未知互换 + 可选 LLM」。 |
| 变式自校验 | 每个变式渲染回单题文本 → 交 `QuestionParser.parse` → **题型一致 + 选项数/空位数不变**方采纳；不合法者丢弃并换因子重试（有界 4×count，确定性）。 | **N5**：变式必须经 parser 反向自校验。 |
| `exam-scanner` 改法 | 内部**改由 `OcrProcessor`/`QuestionParser`/`VariantGenerator` 编排**；`scanExam` 出参**向后兼容**（`success`/`error`/`ocr.rawText`/`ocr.questions`/`parsedQuestions`/`metadata` 原样保留，新增 `ocr.text|latex|blocks` 与可选 `variants[]`）。死代码私有方法（`_performOCR`/`_getMockOCRResult`/`_parseQuestions`/`_parseJson*`）移除。 | **N1**：不重建、不改对外签名、可增字段不可删。 |
| 持久化 | **无 DB 迁移**、不落库、维持纯计算；不新增 `edu.exam_scans`。 | **N4**。 |
| provider 注册 | 新增 3 类在既有 `tuition.module.ts` 注册；不新建 module。 | **N6**。 |
| 本体真源 | 未引用 `k12/questions.yaml`（不存在）；`k12-curriculum.ontology.yaml` 只读参考（本卡未改）。 | **N2**。 |

## 改动清单

### 新增（源码 3）

| 文件 | 要点 |
|------|------|
| `services/api/src/modules/tuition/agents/ocr-processor.ts` | `OcrEngine` 接口；`MockOcrEngine`（确定性样卷：单选/填空/解答各一题）；`MultimodalLlmEngine`（包既有 `chatCompletionMultimodal`，非 JSON 出参退化纯文本）；`OcrProcessor` 门面（`engines`/`passthrough`/`process`；空图·无 key·失败 → Mock，绝不抛）；导出 `MOCK_OCR_TEXT`/`extractLatex`/`buildBlocks` 纯函数。 |
| `services/api/src/modules/tuition/agents/question-parser.ts` | `QuestionParser.parse(text\|OcrBlock[], ctx) → ParsedQuestion[]`：按题号切分；题型判别（选项/空位/多选关键词）；选项抽取（同行/分行、标签须 A/B/C/D 连续）；空位计数；KP 映射（名录子串最长优先 → 内置关键词表 → 兜底非空）；难度启发式；有 key 时 LLM 微调（不改题型）。导出 `KP_KEYWORDS`/`DEFAULT_KNOWLEDGE_POINT`。 |
| `services/api/src/modules/tuition/agents/variant-generator.ts` | `VariantGenerator.generate(seed, options) → ParsedQuestion[]`：`numeric`（±20% 内非零因子、十分位精度）/`swap`（已知未知互换，选择题退化数值）/`auto`；生成后**经 parser 反向自校验**（题型+选项数+空位数）；去重、确定性、有界重试；可选 LLM 改写。导出 `NUMERIC_FACTORS`。 |

### 修改（3）

| 文件 | 动作 | 说明 |
|------|------|------|
| `services/api/src/modules/tuition/tuition.types.ts` | 追加纯类型 | `QuestionType`（新增 `single_choice`/`multiple_choice`/`fill_blank`/`solution`，保留旧词汇）；`OcrBlock`/`OcrResult`/`ExamScanRequest`/`ExamScanResult`/`BlankSpec`/`ParsedQuestion`/`QuestionSeed`/`VariantGenerationOptions`。纯接口/联合，无装饰器（api 侧无 class-validator）。 |
| `services/api/src/modules/tuition/agents/exam-scanner.ts` | **最小改** | 降为编排层：`constructor(ocr, parser, variants)`；`scanExam` 委托三者，出参向后兼容 + 新增 `variants?`；移除被取代的私有 OCR/解析方法与死代码。 |
| `services/api/src/modules/tuition/tuition.module.ts` | 注册 providers | 追加 `OcrProcessor`/`QuestionParser`/`VariantGenerator`；未新建 module。 |

### 附带修复（N1 兼容性副产品，1 源码 + 4 spec）

| 文件 | 动作 | 原因 |
|------|------|------|
| `.../agents/ocr-processor.ts`、`.../agents/question-parser.ts`、`.../agents/variant-generator.ts`、`.../agents/intent-classifier.ts` | `import type { LlmService }` → **值导入** | `nest build` 产出的 JS 依赖 `emitDecoratorMetadata` 生成 `design:paramtypes`；**`import type` 会被完全擦除**，致 Nest 运行期把构造参数当成 `Function` 而 **DI 解析失败**（`Nest can't resolve dependencies of the OcrProcessor (?)`）。改用值导入后 DI 图可编译（见 §3 断言）。**注意**：`intent-classifier.ts`（P2-T6 产物）存在同一潜在缺陷 —— 本次一并修复，否则应用启动即崩。 |
| `.../agents/ocr-processor.spec.ts`、`question-parser.spec.ts`、`variant-generator.spec.ts`、`intent-classifier.spec.ts` | 追加 `jest.mock('@gri/agent-core', ...)` | 值导入使 `llm.service`（其传递引入 **ESM** 包 `@gri/agent-core`）进入 spec 运行期图，jest CJS 无法解析 `export`。按既有范式 mock（同 `llm.service.spec`/`plan-agent.spec`）。 |

### 新增（测试 3，共 35 例）

| 文件 | 用例数 | 覆盖 |
|------|-------|------|
| `.../agents/ocr-processor.spec.ts` | **10** | Mock 确定性（不同图片同输出）、样卷含三题型、无 key → Mock、空图不发外部、有 key → 多模态、LLM 异常兜底 Mock、非 JSON 退化、`engines` 契约、`passthrough`、`extractLatex` 去重 / `buildBlocks` 分块。 |
| `.../agents/question-parser.spec.ts` | **16** | 单选/填空/解答/多选判别、整卷 3 题题型序列、同行/分行选项抽取、非连续标签不误判、KP 名录（最长优先）/关键词表/兜底、难度闭集、空/乱码输入、`OcrBlock[]` 输入、无 key 不调 LLM、有 key LLM 微调不改题型。 |
| `.../agents/variant-generator.spec.ts` | **9** | 3 变式数值不同/KP 同源/选项数一致、原数值确被替换、每题 parser 反向校验、确定性、count 生效、空种子/count=0、swap 互换、选择题 swap 退化保护、因子池 ±20% 非零校验。 |

### 新增（产出物 2）

| 文件 | 说明 |
|------|------|
| `.agents/claude/outputs/p2-task-7-verify.sh` | 自动化验收：§1 jest 复用 3 个新 spec（≥16）→ §2 ts-node 直驱纯领域断言（OCR 统一出参/确定性、三题型判别、变式反向校验、异常输入、`scanExam` 向后兼容）→ §3 Nest DI 图编译（离线，验证 provider 注册可解析）+ api 活体探测。 |
| `.agents/claude/outputs/p2-task-7-file-list.md` | 本文件。 |

## 硬约束合规映射

| # | 约束 | 落实 |
|---|------|------|
| N1 | 不重建 `exam-scanner.ts`；签名向后兼容 | 保留 `scanExam({imageDataUrl, subject?, gradeLevel?, rawText?})` 与出参形状；仅内部改为委派新三类，新增可选 `withVariants`/`variants[]`。 |
| N2 | 禁引 `k12/questions.yaml`；真源 = 表 + `k12-curriculum.ontology.yaml` | 源码零引用不存在文件；KP 靠 `edu.knowledge_points` 名录 + 内置关键词表；未改本体。 |
| N3 | OCR = 默认多模态 LLM + ≥1 Mock 引擎；不引原生依赖 | `MultimodalLlmEngine`（包 `chatCompletionMultimodal`）+ `MockOcrEngine`；`package.json` 无改动。 |
| N4 | 无 DB 迁移；纯计算；不新增 `edu.exam_scans` | 无迁移文件；无 DB 调用；无新表。 |
| N5 | 变式经 `question-parser` 反向自校验；离线确定性 Mock | `_selfCheck` 逐题回读校验（题型/选项数/空位）；无 key 全程纯逻辑、同输入同输出。 |
| N6 | 在既有 `tuition.module.ts` 注册 | 追加 3 个 provider；未新建 module。 |

## 自检命令与结果

```sh
cd services/api && npx tsc --noEmit
#   → 0 error（TSC_EXIT=0）

cd services/api && npx jest src/modules/tuition/agents
#   → 11 suites / 122 tests 全绿（新增 3 suites / +35 tests）

cd services/api && npx jest
#   → 32 suites / 466 tests 全绿（本卡执行前 29 suites / 431 tests → +3 suites / +35 tests，只增不减）

bash .agents/claude/outputs/p2-task-7-verify.sh
#   → PASS=30 FAIL=0 VERIFY_EXIT=0
#     §1 jest 35/35；§2 独立断言 28/28（三题型、变式反向校验、确定性、异常、scanExam 向后兼容）；
#     §3 Nest DI 图编译通过（provider 注册可解析）+ api 活体探测
```

验收标准逐条：① tsc 0 err ✅ ② agents 全绿、新增 35≥16 ✅ ③ 全量不回归（29/431 → 32/466）✅ ④ verify.sh FAIL=0 ✅ ⑤ 单选 → `single_choice`+4 选项+KP 非空；填空 → `fill_blank`+2 空位 ✅ ⑥ 单选种子 → 3 变式、数值不同、KP 同源、选项数一致、每题经 parser 反向校验 ✅ ⑦ 无 key 全流程 Mock、同输入同输出 ✅

## 已知说明与未决项

- **数值替换不保证数学自洽**：`numeric` 策略在 ±20% 内缩放题干/选项数值，保证「结构合法 + 数值有别 + 同 KP + 经 parser 反向校验」，但**不保证变式在数学上仍成立**（如勾股 3-4-5 缩放后三边不再满足勾股关系）。数学自洽需领域求解器（按知识点建模求新解），超出本卡「确定性纯逻辑 + 反向自校验」范围。
- **下游题型词汇**：`question-parser` 产出**规范化**题型（`single_choice`/`fill_blank`/`solution`），而既有 `tutor-agent._checkAnswer`/`_analyzeAnswers.byType` 以 `choice`/`fill`/`solution` 为键。未知类型**不崩溃**（`byType` 有守卫，`_checkAnswer` 走通用分支），仅使填报/选择类在 `byType` 分桶统计中不计数、且填空数值容差（1%）不生效。**本卡未改 `tutor-agent.ts`**（不在卡内产出清单）——如需对齐，建议另立小卡加 4 个别名映射，或由 `ai-agent.service` 落库前归一。
- **`ocr.questions` 字段**：旧实现回填多模态 LLM 的 `questions`，新实现恒为 `[]`（实测无消费方读取，`ai-agent.service` 只读 `ocr.rawText`/`parsedQuestions`）；如需保留，可由 `parsedQuestions` 回填。

❓ 需确认：
1. 变式的**数学自洽**是否要在后续卡引入「按知识点求解器」（本卡仅保证结构合法与数值差异）？
2. 下游 `tutor-agent` 的题型键（`choice`/`fill`）是否需要归一为新的规范化词汇？本卡按「不扩范围」未改。
3. `withVariants` 默认 `false`（不破坏既有调用）；若前端「拍照做题」Tab 需要默认带变式，可在接线卡改为 `true` 或由 controller 传参。
