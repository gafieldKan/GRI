# T7 任务卡：`tuition/agents` - ExamScanner OCR→结构化题目→生成变式题链路

**执行者**：Claude  
**依赖**：T5 完成（练习中心主链路就绪）  
**产出目录**：`services/api/src/modules/tuition/agents/`  
**预估**：1 天

---

## 📋 任务目标

实现 **拍照解题** 核心链路，支撑前端「拍照解题」Tab：

1. **OCR 识别**：图片 → 文本/LaTeX/结构化块（题干、选项、图表区域）
2. **结构化解析**：文本块 → `Question` 对象（类型判别、知识点映射、难度估算）
3. **变式题生成**：基于种子题 + 知识点 → 生成 N 道变式题（数值替换、条件变换、数字化/图形化互换）

---

## 📥 必读上下文（按顺序）

| 文件 | 用途 |
|------|------|
| `services/api/src/modules/tuition/agents/exam-scanner.ts` | 现有骨架或新建，OCR+解析+生成主入口 |
| `services/api/src/modules/tuition/agents/llm.service.ts` | LLM 调用封装（已有），用于结构化解析/变式生成 |
| `services/api/src/modules/tuition/tuition.types.ts` | 需补 `ExamScanRequest`、`ExamScanResult`、`QuestionSeed`、`VariantGenerationOptions` |
| `packages/ontology/ontologies/k12/questions.yaml` | 题目本体 DSL，变式生成需遵守判别列/extra 约束 |
| `docs/WEB_AI_TUTOR_COMPLETION_PLAN.md` | 前端交互：上传图片 → 轮询进度 → 返回结构化题目 + 变式题列表 |

---

## 📦 产出物清单

| 文件 | 动作 |
|------|------|
| `services/api/src/modules/tuition/agents/exam-scanner.ts` | 核心类：`scan(imageBuffer)` → `ExamScanResult`（含 `question` + `variants[]`） |
| `services/api/src/modules/tuition/agents/ocr-processor.ts` | OCR 适配层：支持多引擎（PaddleOCR/Mistral/Tesseract），统一返回 `{text, latex, blocks[]}` |
| `services/api/src/modules/tuition/agents/question-parser.ts` | 文本块 → `Question`：类型判别（规则+LLM）、KP 映射（向量检索 `knowledge_points`）、难度估算 |
| `services/api/src/modules/tuition/agents/variant-generator.ts` | 变式生成：`generate(seed, options)` → `Question[]`，策略：数值替换/条件变换/图文互换 |
| `services/api/src/modules/tuition/agents/exam-scanner.spec.ts` | 15+ 单测：OCR 模拟、解析准确率、变式生成多样性/正确性、异常图片处理 |
| `.agents/claude/outputs/p2-task-7-file-list.md` | 本任务新增/修改文件清单 |
| `.agents/claude/outputs/p2-task-7-verify.sh` | 自动化验收脚本（见下） |

---

## ✅ 验收标准（硬性）

1. **TypeScript 编译通过**：`npm run build` 0 error
2. **单测全绿**：`npm run test -- src/modules/tuition/agents/exam-scanner.spec.ts` 全部通过（目标 ≥ 15 tests）
3. **端到端验证脚本通过**：运行 `bash .agents/claude/outputs/p2-task-7-verify.sh` 输出 `全绿：PASS=X FAIL=0`
4. **OCR→结构化**：
   - 单选题图片 → 识别题干/选项/答案 → `type: 'single_choice'`、KP 映射命中率 ≥ 80%
   - 填空题图片 → 识别空白数 → `type: 'fill_blank'`、`blanks[]` 正确
5. **变式生成**：
   - 单选题种子 → 生成 3 道变式，数值不同、知识点相同、难度 ±1
   - 变式题通过 `question-parser` 反向校验均合法
5. **性能**：单图片端到端 ≤ 10s（OCR 3s + 解析 2s + 生成 5s）

---

## 🧪 验收脚本 `task-7-verify.sh` 规范

```bash
#!/usr/bin/env bash
# T7 自动化验收：ExamScanner OCR→结构化→变式
set -uo pipefail
API_BASE="${API_BASE:-http://localhost:3008/api}"

# 1. 上传单选题图片（测试资源） → POST /tuition/exam/scan → jobId
# 2. 轮询 GET /tuition/exam/scan/{jobId} → completed，返回 {question, variants[]}
# 3. 校验 question: type=single_choice, options.length=4, knowledgePointIds 非空
# 4. 校验 variants: length=3, 每题 type/KP 同源，数值不同，通过 parser 校验
# 5. 上传填空题图片 → 同流程，校验 blanks[] 数量正确
# 6. 上传模糊/非题目图片 → 返回错误码 400/422，不崩溃
# 7. 并发 5 张图片 → 全部完成，无资源泄漏
```

---

## 🔐 关键实现细节

| 点 | 要求 |
|----|------|
| OCR 引擎 | 开发环境用 PaddleOCR（本地），生产可切 Mistral OCR API，适配层统一接口 |
| 结构化解析 | Prompt 模板化：`"从以下文本提取题目结构，输出 JSON: {type, stem, options?, blanks?, answer, knowledgePoints[]}"` |
| 知识点映射 | 向量检索：`question.embedding` 与 `knowledge_points.embedding` 余弦相似度 Top-K，阈值 0.75 |
| 变式生成策略 | 1) 数值替换：数字 ±20% 非零  2) 条件变换：已知/未知互换  3) 图文互换：文字题↔函数图像 |
| 幂等/去重 | 同一图片（内容哈希）24h 内重复扫描返回缓存结果 |
| 存储 | `edu.exam_scans(id, student_id, image_hash, status, result_jsonb, created_at)` |

---

## 📝 任务卡存放路径

```
.agents/claude/tasks/p2-task-7-exam-scanner-ocr-variant.md
```