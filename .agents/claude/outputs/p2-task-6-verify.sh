#!/usr/bin/env bash
# ============================================================================
# P2-T6 验收：教学卡片 FSM / 意图识别 / 苏格拉底模板（无 LLM key 时走 Mock）
#
# 结构：
#   §1 jest 单测     —— 复用既有 3 个 spec（teaching-card-fsm / intent-classifier / socratic-templates）
#   §2 独立行为断言  —— ts-node 直驱领域逻辑：≥30 意图样本(≥90%)、5 态转移+Guard、模板槽位/插值/报错
#   §3 活体冒烟      —— 若 tuition 端点所在 api 在运行则加一轮；不在运行则 SKIP（不计数）
#
# 依赖：services/api 下已 npm install（ts-node + jest 可用）。不依赖任何外部服务。
# 用法： bash .agents/claude/outputs/p2-task-6-verify.sh
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
echo "== §1. jest 单测（复用既有 3 spec）=="
JEST_JSON="$(cd "$API_DIR" && npx jest \
  src/modules/tuition/agents/teaching-card-fsm.spec \
  src/modules/tuition/agents/intent-classifier.spec \
  src/modules/tuition/agents/socratic-templates.spec \
  --json 2>/dev/null)"
JT_PASS="$(printf '%s' "$JEST_JSON" | json_field numPassedTests)"
JT_FAIL="$(printf '%s' "$JEST_JSON" | json_field numFailedTests)"
JT_TOTAL="$(printf '%s' "$JEST_JSON" | json_field numTotalTests)"
if [ "${JT_FAIL:-0}" -eq 0 ] && [ "${JT_PASS:-0}" -ge 26 ]; then
  pass "jest: ${JT_PASS}/${JT_TOTAL:-?} tests passed, 0 failed (≥26 required)"
else
  fail "jest: ${JT_PASS:-0} passed / ${JT_FAIL:-0} failed (expect ≥26 passed & 0 failed)"
fi

# ---------------------------------------------------------------------------
echo "== §2. 独立行为断言（ts-node 直驱领域逻辑）=="
HARNESS="$API_DIR/.p2t6-verify.tmp.ts"
cat > "$HARNESS" <<'TS'
import { IntentClassifier } from './src/modules/tuition/agents/intent-classifier';
import { SocraticTemplates } from './src/modules/tuition/agents/socratic-templates';
import {
  TeachingCardFsm,
  initialCardState,
  IllegalCardTransitionError,
} from './src/modules/tuition/agents/teaching-card-fsm';

let pass = 0;
let fail = 0;
const ok = (cond: boolean, desc: string): void => {
  if (cond) { pass += 1; console.log('PASS  ' + desc); }
  else { fail += 1; console.log('FAIL  ' + desc); }
};

const stubLlm: any = { analyzeUserMessage: async () => null };

async function main(): Promise<void> {
  // --- 意图分类：≥30 样本、准确率 ≥90% ---
  const clf = new IntentClassifier(stubLlm);
  const samples: Array<[string, string]> = [
    ['给我一点提示', 'ASK_HINT'], ['这题怎么入手', 'ASK_HINT'], ['有没有思路', 'ASK_HINT'],
    ['提示一下', 'ASK_HINT'], ['从哪里开始想', 'ASK_HINT'], ['给点线索吧', 'ASK_HINT'],
    ['直接告诉我答案', 'ASK_SOLUTION'], ['这道题的答案是什么', 'ASK_SOLUTION'],
    ['把解题步骤写出来', 'ASK_SOLUTION'], ['求答案', 'ASK_SOLUTION'], ['教我完整解法', 'ASK_SOLUTION'],
    ['答案是 5', 'ATTEMPT_ANSWER'], ['我选 B', 'ATTEMPT_ANSWER'], ['我觉得是 3.14', 'ATTEMPT_ANSWER'],
    ['应该是 12', 'ATTEMPT_ANSWER'], ['我的答案：x=2', 'ATTEMPT_ANSWER'], ['等于 7', 'ATTEMPT_ANSWER'],
    ['为什么是这样', 'ASK_CLARIFICATION'], ['我不明白', 'ASK_CLARIFICATION'],
    ['这是什么意思', 'ASK_CLARIFICATION'], ['能再讲一遍吗', 'ASK_CLARIFICATION'],
    ['解释一下这个概念', 'ASK_CLARIFICATION'],
    ['太难了，我放弃', 'GIVE_UP'], ['我不会，直接讲吧', 'GIVE_UP'], ['我不做了', 'GIVE_UP'],
    ['算了吧', 'GIVE_UP'], ['实在想不出来', 'GIVE_UP'],
    ['下一题', 'NEXT_QUESTION'], ['换一题吧', 'NEXT_QUESTION'], ['再来一道', 'NEXT_QUESTION'],
    ['跳过这题', 'NEXT_QUESTION'], ['继续下一题', 'NEXT_QUESTION'],
    ['今天天气不错', 'OFF_TOPIC'], ['你喜欢玩什么游戏', 'OFF_TOPIC'], ['你叫什么名字', 'OFF_TOPIC'],
    ['我们聊点别的吧', 'OFF_TOPIC'], ['讲个笑话', 'OFF_TOPIC'],
  ];
  let hit = 0;
  for (const [text, want] of samples) {
    const r = await clf.classify(text);
    if (r.intent === want) hit += 1;
    else console.log('  miss: "' + text + '" want=' + want + ' got=' + r.intent);
  }
  const acc = hit / samples.length;
  ok(samples.length >= 30, 'intent samples >= 30 (n=' + samples.length + ')');
  ok(acc >= 0.9, 'intent accuracy >= 90% (' + (acc * 100).toFixed(1) + '%)');

  // --- 卡片态 FSM ---
  const fsm = new TeachingCardFsm();
  ok(initialCardState().stage === 'Question', 'FSM 初态 = Question');
  let s = initialCardState();
  s = fsm.transition(s, 'ATTEMPT_ANSWER', { correct: false });
  s = fsm.transition(s, 'ASK_HINT');
  s = fsm.transition(s, 'ASK_HINT');
  s = fsm.transition(s, 'ASK_HINT');
  ok(s.stage === 'Scaffold', 'Hint 超 2 次强制 Scaffold');
  const refl = fsm.transition(initialCardState(), 'ATTEMPT_ANSWER', { correct: true });
  let threwIllegal = false;
  try { fsm.transition(refl, 'ASK_SOLUTION'); }
  catch (e) { threwIllegal = e instanceof IllegalCardTransitionError; }
  ok(threwIllegal, '非法转移抛 IllegalCardTransitionError');
  let s2 = initialCardState();
  s2 = fsm.transition(s2, 'ASK_HINT');
  s2 = fsm.transition(s2, 'ASK_HINT');
  let threwGuard = false;
  try { fsm.transition(s2, 'ASK_HINT'); }
  catch (e) { threwGuard = e instanceof IllegalCardTransitionError; }
  ok(threwGuard, 'Scaffold 前置 Guard（未尝试作答即抛错）');
  ok(fsm.transition(initialCardState(), 'ASK_SOLUTION').stage === 'Solution', 'ASK_SOLUTION 直达 Solution');

  // --- 苏格拉底模板 ---
  const t = new SocraticTemplates();
  const types = ['single-choice', 'multiple-choice', 'fill', 'solution'];
  const diffs = ['easy', 'medium', 'hard'];
  const stages = ['hint', 'scaffold', 'solution'];
  const ctx: any = { knowledgePoint: '勾股定理', studentLevel: '初二', attemptCount: 2 };
  let covered = 0;
  let residue = 0;
  for (const ty of types) for (const d of diffs) for (const st of stages) {
    const out = t.render({ subject: 'math', type: ty, difficulty: d, stage: st } as any, ctx);
    covered += 1;
    if (out.includes('{')) residue += 1;
  }
  ok(covered === 36, '模板槽位全覆盖 4×3×3=36 (got ' + covered + ')');
  ok(residue === 0, '插值无 { 残留');
  let missVar = false;
  try {
    t.render(
      { subject: 'math', type: 'multiple-choice', difficulty: 'easy', stage: 'scaffold' } as any,
      { knowledgePoint: 'x', attemptCount: 1 } as any,
    );
  } catch (e) { missVar = (e as Error).name === 'MissingTemplateVariableError'; }
  ok(missVar, '缺失变量明确报错');
  let missKey = false;
  try {
    t.render({ subject: 'math', type: 'fill', difficulty: 'easy', stage: 'nope' } as any, ctx);
  } catch (e) { missKey = (e as Error).name === 'MissingTemplateError'; }
  ok(missKey, '无模板键明确报错');

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
  .p2t6-verify.tmp.ts 2>&1)"
HARNESS_RC=$?
rm -f "$HARNESS"

printf '%s\n' "$HARNESS_OUT" | grep -E '^(PASS|FAIL) ' || true
HP="$(printf '%s\n' "$HARNESS_OUT" | grep -cE '^PASS ' || true)"
HF="$(printf '%s\n' "$HARNESS_OUT" | grep -cE '^FAIL ' || true)"
PASS=$((PASS + ${HP:-0}))
FAIL=$((FAIL + ${HF:-0}))
[ "$HARNESS_RC" -eq 0 ] || fail "ts-node harness exited rc=$HARNESS_RC"

# ---------------------------------------------------------------------------
echo "== §3. 活体冒烟（tuition 端点若在运行）=="
if curl -sf "$API_HEALTH" >/dev/null 2>&1; then
  pass "api reachable $API_HEALTH（tuition module 随启动装载）"
else
  echo "SKIP  api 未运行 —— 纯领域逻辑已由 §1/§2 覆盖（不计数）"
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
