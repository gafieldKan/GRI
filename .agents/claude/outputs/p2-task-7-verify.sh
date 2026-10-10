#!/usr/bin/env bash
# ============================================================================
# P2-T7 验收：OCR 适配层 / 结构化解析 / 变式生成（无 LLM key 时全程 Mock）
#
# 结构：
#   §1 jest 单测     —— 复用 3 个新 spec（ocr-processor / question-parser / variant-generator，≥16 例）
#   §2 独立行为断言  —— ts-node 直驱纯领域链路：
#                       2.1 OCR 统一输出 + 无 key → Mock
#                       2.2 结构化：单选/填空/解答 判别 + 选项/空位/KP
#                       2.3 变式：3 变式 数值不同/KP 同源/选项数一致 + parser 反向校验
#                       2.4 确定性：同输入同输出（OCR + 变式）
#                       2.5 异常：空/乱码输入不崩溃
#                       2.6 exam-scanner 向后兼容（ocr.rawText / parsedQuestions / variants 增量）
#   §3 活体冒烟      —— 若 api 在运行则加一轮；否则 SKIP（不计数）
#
# 依赖：services/api 下已 npm install（ts-node + jest 可用）。不依赖任何外部服务。
# 用法： bash .agents/claude/outputs/p2-task-7-verify.sh
# 通过： 末尾打印「PASS=<n> FAIL=0 VERIFY_EXIT=0」
# ============================================================================
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
API_DIR="$ROOT_DIR/services/api"
API_HEALTH="${API_HEALTH:-http://localhost:3008/health}"

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); printf 'PASS  %s\n' "$1"; }
fail() { FAIL=$((FAIL + 1)); printf 'FAIL  %s\n' "$1"; }

json_field() { # json_field <field>  (stdin = jest --json 输出)
  node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s)["'"$1"'"]||0)}catch(e){console.log(0)}})'
}

# ---------------------------------------------------------------------------
echo "== §1. jest 单测（复用 3 个新 spec，≥16 例）=="
JEST_JSON="$(cd "$API_DIR" && npx jest \
  src/modules/tuition/agents/ocr-processor.spec \
  src/modules/tuition/agents/question-parser.spec \
  src/modules/tuition/agents/variant-generator.spec \
  --json 2>/dev/null)"
JT_PASS="$(printf '%s' "$JEST_JSON" | json_field numPassedTests)"
JT_FAIL="$(printf '%s' "$JEST_JSON" | json_field numFailedTests)"
JT_TOTAL="$(printf '%s' "$JEST_JSON" | json_field numTotalTests)"
if [ "${JT_FAIL:-0}" -eq 0 ] && [ "${JT_PASS:-0}" -ge 16 ]; then
  pass "jest: ${JT_PASS}/${JT_TOTAL:-?} tests passed, 0 failed (≥16 required)"
else
  fail "jest: ${JT_PASS:-0} passed / ${JT_FAIL:-0} failed (expect ≥16 passed & 0 failed)"
fi

# ---------------------------------------------------------------------------
echo "== §2. 独立行为断言（ts-node 直驱纯领域链路）=="
HARNESS="$API_DIR/.p2t7-verify.tmp.ts"
cat > "$HARNESS" <<'TS'
import { OcrProcessor, MockOcrEngine, MOCK_OCR_TEXT } from './src/modules/tuition/agents/ocr-processor';
import { QuestionParser } from './src/modules/tuition/agents/question-parser';
import { VariantGenerator } from './src/modules/tuition/agents/variant-generator';
import { ExamScannerAgent } from './src/modules/tuition/agents/exam-scanner';

let pass = 0;
let fail = 0;
const ok = (cond: boolean, desc: string): void => {
  if (cond) { pass += 1; console.log('PASS  ' + desc); }
  else { fail += 1; console.log('FAIL  ' + desc); }
};

// 无 key 桩：isRealKey=false；多模态/对话端点均抛 NO_LLM_KEY（模拟离线）
const stubLlm: any = {
  isRealKey: () => false,
  chatCompletion: async () => { throw new Error('NO_LLM_KEY'); },
  chatCompletionMultimodal: async () => { throw new Error('NO_LLM_KEY'); },
};

const render = (content: string, options: string[]): string => {
  const opts = options.map((o, i) => `${'ABCD'[i]}. ${o}`).join('\n');
  return opts ? `1. ${content}\n${opts}` : `1. ${content}`;
};

async function main(): Promise<void> {
  const ocr = new OcrProcessor(stubLlm);
  const parser = new QuestionParser(stubLlm);
  const gen = new VariantGenerator(parser, stubLlm);

  // --- §2.1 OCR 适配层 ---
  const o1 = await ocr.process('data:image/png;base64,AAA');
  const o2 = await ocr.process('data:image/png;base64,BBB');
  ok(o1.engine === 'mock', 'OCR 无 key → Mock 引擎');
  ok(o1.text === MOCK_OCR_TEXT, 'OCR 统一输出 text');
  ok(o1.blocks.length > 0 && typeof o1.latex === 'string', 'OCR 统一输出 blocks[] + latex');
  ok(JSON.stringify(o1) === JSON.stringify(o2), 'OCR 确定性（同输入同输出）');
  ok((await new MockOcrEngine().process('x')).engine === 'mock', 'MockOcrEngine 直接可用');

  // --- §2.2 结构化解析 ---
  const qs = await parser.parse(o1.text);
  ok(qs.length === 3, '整卷解析出 3 题 (got ' + qs.length + ')');
  ok(qs[0].type === 'single_choice' && qs[0].options.length === 4, '单选 → type=single_choice + 4 选项');
  ok(!!qs[0].knowledgePoint, '单选 KP 非空 (' + qs[0].knowledgePoint + ')');
  ok(qs[1].type === 'fill_blank' && qs[1].blanks.length === 2, '填空 → type=fill_blank + 2 空位');
  ok(qs[1].blanks.map((b) => b.index).join(',') === '0,1', '空位序号连续 0,1');
  ok(qs[2].type === 'solution', '解答 → type=solution');
  ok(qs[0].content.indexOf('A.') === -1, '题干已剔除选项标记');

  // --- §2.3 变式生成 ---
  const seed = qs[0];
  const vs = await gen.generate(seed, { count: 3 });
  ok(vs.length === 3, '单选题种子 → 3 变式 (got ' + vs.length + ')');
  ok(new Set(vs.map((v) => v.content)).size === 3, '变式数值/表述两两不同');
  ok(vs.every((v) => v.knowledgePoint === seed.knowledgePoint), 'KP 同源 (' + seed.knowledgePoint + ')');
  ok(vs.every((v) => v.options.length === seed.options.length), '选项数一致 (4)');
  let allValid = true;
  for (const v of vs) {
    const [re] = await parser.parse(render(v.content, v.options));
    if (!re || re.type !== 'single_choice' || re.options.length !== v.options.length) allValid = false;
  }
  ok(allValid, '每题经 question-parser 反向校验合法');
  const re2 = await gen.generate(seed, { count: 3 });
  ok(JSON.stringify(vs) === JSON.stringify(re2), '变式确定性（同输入同输出）');
  ok((await gen.generate({ ...seed, content: '   ' }, { count: 3 })).length === 0, '空种子 → []');
  const swapped = await gen.generate({ ...qs[2], content: '已知直角三角形的两条直角边分别是 3 和 4，求斜边的长度。' }, { count: 1, strategy: 'swap' });
  ok(swapped.length === 1 && swapped[0].content.indexOf('已知斜边') === 0, 'swap 策略：已知/未知互换');

  // --- §2.4 异常输入 ---
  ok((await parser.parse('')).length === 0, '空输入 → []（不抛错）');
  let threw = false;
  try { await parser.parse('@@@###%%%\n��'); } catch { threw = true; }
  ok(!threw, '乱码输入不抛未捕获异常');
  ok((await ocr.process('')).engine === 'mock', '空图 → Mock（不发外部请求）');

  // --- §2.5 exam-scanner 向后兼容 ---
  const scanner = new ExamScannerAgent(ocr, parser, gen);
  const sText = await scanner.scanExam({ imageDataUrl: '', rawText: '1. 解方程：2x + 5 = 15' });
  ok(sText.success === true && typeof sText.ocr.rawText === 'string' && sText.ocr.rawText.length > 0, 'scanExam 保留 ocr.rawText 契约');
  ok(sText.parsedQuestions.length === 1 && sText.parsedQuestions[0].type === 'solution', 'rawText（文本链路）→ parsedQuestions');
  const sImg = await scanner.scanExam({ imageDataUrl: 'data:image/png;base64,AAA' });
  ok(sImg.success === true && sImg.ocr.engine === 'mock' && sImg.parsedQuestions.length === 3, '无 key 拍照 → Mock OCR 全链路 3 题');
  ok(!!sImg.metadata && sImg.metadata.subject === 'math', 'metadata 保留');
  const sVar = await scanner.scanExam({ imageDataUrl: 'x', withVariants: true });
  ok(Array.isArray(sVar.variants) && (sVar.variants as any[]).length === 3, '可选 variants 增量字段（3 变式）');

  console.log('HARNESS PASS=' + pass + ' FAIL=' + fail);
  process.exit(fail ? 1 : 0);
}

main().catch((e: Error) => {
  console.log('FAIL  harness threw: ' + (e && e.message));
  console.log('HARNESS PASS=' + pass + ' FAIL=' + (fail + 1));
  process.exit(1);
});
TS

HARNESS_OUT="$(cd "$API_DIR" && npx ts-node --compiler-options \
  '{"experimentalDecorators":true,"emitDecoratorMetadata":true,"esModuleInterop":true,"module":"commonjs","target":"ES2022","strict":false}' \
  .p2t7-verify.tmp.ts 2>&1)"
HARNESS_RC=$?
rm -f "$HARNESS"

printf '%s\n' "$HARNESS_OUT" | grep -E '^(PASS|FAIL) ' || true
HP="$(printf '%s\n' "$HARNESS_OUT" | grep -cE '^PASS ' || true)"
HF="$(printf '%s\n' "$HARNESS_OUT" | grep -cE '^FAIL ' || true)"
PASS=$((PASS + ${HP:-0}))
FAIL=$((FAIL + ${HF:-0}))
[ "$HARNESS_RC" -eq 0 ] || fail "ts-node harness exited rc=$HARNESS_RC"

# ---------------------------------------------------------------------------
echo "== §3. 接线冒烟（Nest DI 图编译 + api 活体）=="
DI_HARNESS="$API_DIR/.p2t7-di.tmp.ts"
cat > "$DI_HARNESS" <<'TS'
import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { LlmService } from './src/modules/tuition/agents/llm.service';
import { OcrProcessor } from './src/modules/tuition/agents/ocr-processor';
import { QuestionParser } from './src/modules/tuition/agents/question-parser';
import { VariantGenerator } from './src/modules/tuition/agents/variant-generator';
import { ExamScannerAgent } from './src/modules/tuition/agents/exam-scanner';

const stub: any = {
  isRealKey: () => false,
  chatCompletion: async () => { throw new Error('NO_LLM_KEY'); },
  chatCompletionMultimodal: async () => { throw new Error('NO_LLM_KEY'); },
};

async function main(): Promise<void> {
  const m = await Test.createTestingModule({
    providers: [
      { provide: LlmService, useValue: stub },
      OcrProcessor, QuestionParser, VariantGenerator, ExamScannerAgent,
    ],
  }).compile();
  const r = await m.get(ExamScannerAgent).scanExam({ imageDataUrl: 'x', withVariants: true });
  console.log('DI_OK success=' + r.success + ' parsed=' + r.parsedQuestions.length + ' variants=' + (r.variants || []).length);
  process.exit(r.success && r.parsedQuestions.length === 3 ? 0 : 1);
}
main().catch((e: Error) => { console.log('DI_FAIL ' + (e && e.message)); process.exit(1); });
TS
DI_OUT="$(cd "$API_DIR" && npx ts-node --compiler-options \
  '{"experimentalDecorators":true,"emitDecoratorMetadata":true,"esModuleInterop":true,"module":"commonjs","target":"ES2022","strict":false}' \
  .p2t7-di.tmp.ts 2>&1)"
DI_RC=$?
rm -f "$DI_HARNESS"
if [ "$DI_RC" -eq 0 ] && printf '%s' "$DI_OUT" | grep -q '^DI_OK '; then
  pass "Nest DI 图可编译（OcrProcessor/QuestionParser/VariantGenerator/ExamScannerAgent 依赖可解析）"
else
  fail "Nest DI 图编译失败：$(printf '%s' "$DI_OUT" | grep -E 'DI_FAIL|Nest can.t resolve' | head -1)"
fi

if curl -sf "$API_HEALTH" >/dev/null 2>&1; then
  echo "INFO  api reachable $API_HEALTH（运行进程为既有 dist 构建，未必含本次改动；接线已由上方 DI 图编译覆盖）"
else
  echo "SKIP  api 未运行（不计数；接线已由上方 DI 图编译覆盖）"
fi

# ---------------------------------------------------------------------------
echo
if [ "$FAIL" -eq 0 ]; then
  echo "PASS=$PASS FAIL=0 VERIFY_EXIT=0"
  exit 0
else
  echo "PASS=$PASS FAIL=$FAIL VERIFY_EXIT=1"
  exit 1
fi
