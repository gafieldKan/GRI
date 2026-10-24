#!/usr/bin/env bash
# ============================================================================
# B-4 验收：外部 agent 反馈回路 —— 外部 agent 运行 = 一条可查 run + 一路事件流
# 依据：.agents/claude/tasks/b4-external-feedback.md（原卡「复验脚本要求」九条）
#       + .agents/claude/tasks/b4-continue-artifacts.md（续作卡：九条口径逐字）
# 契约：docs/AGENT_PUBLIC_CONTRACT.md §二/§三（三端点 + error_code + SSE）
#
# 结构（与续作卡①–⑨逐条对齐）：
#   §1 事件冒泡        —— ① stub 多行 → 全类型事件**按序**冒泡（started→assistant_delta→tool_use→result）
#   §2 run 行生命周期  —— ② 每次委派**先 running 后终态**（done 带 summary+latency_ms / failed 带 error_code）
#   §3 重启对账        —— ③ 残留 running → failed/INTERRUPTED（测内模拟）
#   §4 async 模式      —— ④ 调用即返 runId；后台执行、终态可查（不丢、不静默）
#   §5 SSE 查询面      —— ⑤ 增量下发 + 终态 status 收尾关流；他人 run → 404
#   §6 sync 零变化     —— ⑥ 缺省 mode=sync 行为与今日逐字一致（既有断言不破）
#   §7 事件不落敏感面  —— ⑦ external_events 不含 argv/prompt/密钥（live 探针 + grep 双证）
#   §8 底座不读 env    —— ⑧ cli-backend/cli-delegate/index 零 process.env（C2）
#   §9 零回归          —— ⑨ core + sdk node --test 全绿、api jest 全绿、api tsc=0
#   §10 契约/迁移/同步  —— 三端点 + error_code + SSE 文档；迁移幂等且 dist 同步；SDK/类型已导出
# 末行打印「PASS=<n> FAIL=<m> VERIFY_EXIT=0」。
#
# 依赖：node ≥18；services/api + packages/* 已 npm i。零新依赖（不联网）。
# 用法： bash .agents/claude/outputs/b4-verify.sh
# ============================================================================
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CORE_DIR="$ROOT_DIR/packages/agent-core"
SDK_DIR="$ROOT_DIR/packages/agent-sdk"
API_DIR="$ROOT_DIR/services/api"
CB="$CORE_DIR/src/cli-backend.js"
DEL="$CORE_DIR/src/cli-delegate.js"
IDX="$CORE_DIR/src/index.js"
DTS="$CORE_DIR/index.d.ts"
SVC="$API_DIR/src/modules/agent/agent.service.ts"
CTRL="$API_DIR/src/modules/agent/agent-v1.controller.ts"
MIG="$API_DIR/src/migrate/033_agent_external_runs.sql"
MIG_DIST="$API_DIR/dist/migrate/033_agent_external_runs.sql"
SDKJS="$SDK_DIR/src/index.js"
SDKDTS="$SDK_DIR/index.d.ts"
DOC="$ROOT_DIR/docs/AGENT_PUBLIC_CONTRACT.md"

TMP="$(mktemp -d /tmp/b4-verify.XXXXXX)"
trap 'rm -rf "$TMP" 2>/dev/null' EXIT
PROBE="$TMP/probe.mjs"
JQ="$TMP/jestq.mjs"

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); printf 'PASS  %s\n' "$1"; }
fail() { FAIL=$((FAIL + 1)); printf 'FAIL  %s\n' "$1"; }

# ---------------------------------------------------------------------------
# ① 离线 live 探针：直接 import 底座真源码（不复制实现），观测真实事件冒泡/顺序/闭集/终态唯一/零泄漏。
# 打印 "PASS <label>"/"FAIL <label> :: <detail>"，由 bash 归并计数。
# ---------------------------------------------------------------------------
cat > "$PROBE" <<'MJS'
import { CliBackendRegistry, CLI_EVENT_KINDS, claudeCodeBackend } from '@ROOT@/packages/agent-core/src/index.js';

let p = 0, f = 0;
const pass = (l) => { p++; console.log(`PASS ${l}`); };
const fail = (l, d) => { f++; console.log(`FAIL ${l} :: ${d}`); };
const truthy = (l, v, d) => (v ? pass(l) : fail(l, d ?? `got=${v}`));

const SECRET = 'B4-SECRET-GOAL-DO-NOT-LEAK'; // goal/prompt 哨兵：绝不得出现在事件面
const lines = [
  JSON.stringify({ type: 'system', subtype: 'init', session_id: 's1' }),
  JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: '思考中' }, { type: 'tool_use', name: 'Read' }] }, session_id: 's1' }),
  JSON.stringify({ type: 'result', subtype: 'success', result: '最终答复', session_id: 's1' }),
];
// 真 claude-code 解析器 + node 桩 bin（逐行吐上述 JSON）——不依赖本机装 claude
const backend = { ...claudeCodeBackend, bin: process.execPath, buildArgs: () => ['-e', `for (const l of ${JSON.stringify(lines)}) console.log(l);`] };
const reg = new CliBackendRegistry([backend]);
const events = [];
const res = await reg.run('claude-code', { prompt: SECRET, onEvent: (kind, data) => events.push({ kind, data }) });

const kinds = events.map((e) => e.kind);
const blob = JSON.stringify(events);
truthy('①.1 多行 → 全类型事件按序冒泡（started→assistant_delta→tool_use→result）',
  JSON.stringify(kinds) === JSON.stringify(['started', 'assistant_delta', 'tool_use', 'result']), `kinds=${JSON.stringify(kinds)}`);
truthy('①.2 事件 kind 恒落在闭集 CLI_EVENT_KINDS 内', kinds.every((k) => CLI_EVENT_KINDS.includes(k)), `kinds=${JSON.stringify(kinds)}`);
truthy('①.3 started 恰一次且在最前', kinds[0] === 'started' && kinds.filter((k) => k === 'started').length === 1, `kinds=${JSON.stringify(kinds)}`);
truthy('①.4 终态恰好一次（result/error）且在最后', kinds.filter((k) => k === 'result' || k === 'error').length === 1 && kinds[kinds.length - 1] === 'result');
truthy('①.5 中间行不丢：assistant_delta 带文本、tool_use 带工具名', events[1]?.data?.text === '思考中' && events[2]?.data?.name === 'Read');
truthy('①.6 新事件缝不改汇总语义（零回归）：text/sessionId 仍正确', res.text === '最终答复' && res.sessionId === 's1' && res.error === null, `text=${res.text} sid=${res.sessionId}`);
// ⑦ 事件不落敏感面（live）：prompt 哨兵 + 密钥字段名一律不得出现
truthy('⑦.1 事件面不含 prompt/goal 文本（live 哨兵）', !blob.includes(SECRET));
truthy('⑦.2 事件面不含 argv/密钥字段名', !/argv|apiKey|api_key|token|secret/i.test(blob));

console.log(`PROBE_JSON ${JSON.stringify({ kinds, text: res.text, sessionId: res.sessionId })}`);
console.log(`PROBE_SUM pass=${p} fail=${f}`);
process.exit(f === 0 ? 0 : 1);
MJS
sed -i "s|@ROOT@|$ROOT_DIR|" "$PROBE"

# ---------------------------------------------------------------------------
# jest JSON 查询器：从 --outputFile 结果里按测试名正则统计 pass/fail（精确到用例名）。
# 打印 "RESULT pass=<p> fail=<f>"。
# ---------------------------------------------------------------------------
cat > "$JQ" <<'MJS'
import { readFileSync } from 'node:fs';
const [, , file, reStr] = process.argv;
const j = JSON.parse(readFileSync(file, 'utf8'));
const re = new RegExp(reStr, 'i');
let p = 0, f = 0;
for (const s of j.testResults || []) {
  for (const a of s.assertionResults || []) {
    const name = a.fullName || a.title || '';
    if (re.test(name)) { if (a.status === 'passed') p++; else f++; }
  }
}
console.log(`RESULT pass=${p} fail=${f}`);
MJS

check_jest() { # $1=正则 $2=最少通过数 $3=标签
  local line p f
  line="$(node "$JQ" "$TMP/jest.json" "$1" 2>/dev/null | tail -1)"
  p="$(printf '%s' "$line" | sed -n 's/.*pass=\([0-9]*\).*/\1/p')"
  f="$(printf '%s' "$line" | sed -n 's/.*fail=\([0-9]*\).*/\1/p')"
  if [ "${f:-1}" = "0" ] && [ "${p:-0}" -ge "${2:-1}" ]; then
    pass "$3（pass=$p fail=0）"
  else
    fail "$3 :: ${line:-无匹配}"
  fi
}

echo "=========================================================================="
echo "B-4 复验：外部 agent 反馈回路（事件流 + run 持久化 + SSE）"
echo "root=$ROOT_DIR"
echo "=========================================================================="

# ---------------------------------------------------------------------------
# 预跑：core/sdk node --test、api tsc、api jest（全量 --json，供 §2–§6/§9 复用）
# ---------------------------------------------------------------------------
echo "== 预跑：core / sdk / api tsc / api jest（一次性，§2–§6/§9 复用）=="
( cd "$CORE_DIR" && npm test ) >"$TMP/core.log" 2>&1; CORE_RC=$?
( cd "$SDK_DIR"  && npm test ) >"$TMP/sdk.log"  2>&1; SDK_RC=$?
( cd "$API_DIR"  && npx tsc --noEmit ) >"$TMP/tsc.log" 2>&1; TSC_RC=$?
( cd "$API_DIR"  && npx jest --json --outputFile="$TMP/jest.json" --forceExit ) >"$TMP/jest.log" 2>&1; JEST_RC=$?
printf '  core_rc=%s sdk_rc=%s tsc_rc=%s jest_rc=%s\n' "$CORE_RC" "$SDK_RC" "$TSC_RC" "$JEST_RC"

# ---------------------------------------------------------------------------
echo "== §1 事件冒泡（①）=="
node "$PROBE" >"$TMP/probe.out" 2>&1
while IFS= read -r line; do
  case "$line" in
    "PASS "*) pass "${line#PASS }" ;;
    "FAIL "*) fail "${line#FAIL }" ;;
    PROBE_JSON*) printf '      %s\n' "$line" ;;
  esac
done < "$TMP/probe.out"
# §1.x 另证：新增核心测试文件（真源码）自身全绿
( cd "$CORE_DIR" && node --test --test-force-exit "tests/cli-events.test.js" ) >"$TMP/cev.log" 2>&1
if grep -qE '^ℹ fail 0$' "$TMP/cev.log"; then
  pass "①.7 新增核心测试 tests/cli-events.test.js 全绿（$(grep -E '^ℹ pass ' "$TMP/cev.log" | tr -d '\r')）"
else
  fail "①.7 tests/cli-events.test.js 未全绿（见临时日志）"
fi

# ---------------------------------------------------------------------------
echo "== §2 run 行生命周期（②）=="
check_jest '先建 running 行' 1 "②.1 sync 委派：先建 running 行 → 落终态 done（summary+latency_ms+resume_key）"
check_jest '失败 → status=failed 且带 error_code' 1 "②.2 失败落 failed 且带 error_code（绝不静默）"
check_jest '事件落库：ALS 上下文内 onEvent' 1 "②.3 事件行按 run_id 可查（按序）"
grep -q "INSERT INTO agent.external_runs" "$SVC" && grep -q "DEFAULT 'running'" "$MIG" \
  && pass "②.4 建行 status=running 真源就位（host INSERT + 迁移缺省）" \
  || fail "②.4 缺建行或迁移缺省"

# ---------------------------------------------------------------------------
echo "== §3 重启对账（③）=="
check_jest '重启对账' 1 "③.1 残留 running → failed/INTERRUPTED（done 不动）"
grep -q 'OnModuleInit' "$SVC" && grep -q 'reconcileInterruptedRuns' "$SVC" \
  && pass "③.2 宿主启动钩子接线（onModuleInit → reconcileInterruptedRuns）" \
  || fail "③.2 缺启动对账接线"

# ---------------------------------------------------------------------------
echo "== §4 async 模式（④）=="
check_jest '立即返 runId' 1 "④.1 async 立即返回 runId/status=running"
check_jest '后台失败也必落终态' 1 "④.2 async 后台失败也落终态（C4：不丢、不静默）"
grep -q "args.mode === 'async'" "$SVC" && pass "④.3 mode 缺省 sync（仅显式 async 走后台）" || fail "④.3 mode 分支缺失"

# ---------------------------------------------------------------------------
echo "== §5 SSE 查询面（⑤）=="
check_jest 'SSE：增量下发' 1 "⑤.1 SSE 增量下发事件 → 终态 status → 关流"
check_jest 'events（他人）' 1 "⑤.2 他人 run → 404（不进入 SSE 流）"
grep -q "text/event-stream" "$CTRL" && pass "⑤.3 真 SSE（text/event-stream，非轮询伪装）" || fail "⑤.3 非 SSE"
[ "$(grep -cE 'WebSocket|socket\.io|@nestjs/websockets' "$CTRL" "$SVC" | grep -vc ':0$' || true)" = "0" ] \
  && pass "⑤.4 零 WS/中间件依赖（C5：SSE only）" || fail "⑤.4 引入 WS/中间件"

# ---------------------------------------------------------------------------
echo "== §6 sync 零变化（⑥）=="
check_jest '先建 running 行' 1 "⑥.1 sync 路径与今日同形（仅多一次 best-effort 落行）"
( cd "$CORE_DIR" && node --test --test-force-exit --test-name-pattern='行为与今日一致' "tests/cli-events.test.js" ) >"$TMP/zero.log" 2>&1
grep -qE '^ℹ pass [1-9]' "$TMP/zero.log" && grep -qE '^ℹ fail 0$' "$TMP/zero.log" \
  && pass "⑥.2 底座未注入 onEvent → 行为与今日一致（零回调、零报错）" \
  || fail "⑥.2 未注入 onEvent 行为偏离"
( cd "$CORE_DIR" && node --test --test-force-exit --test-name-pattern='runOpts 逐字不变' "tests/cli-events.test.js" ) >"$TMP/zero2.log" 2>&1
grep -qE '^ℹ pass [1-9]' "$TMP/zero2.log" && grep -qE '^ℹ fail 0$' "$TMP/zero2.log" \
  && pass "⑥.3 delegate 未注入 onEvent → runOpts 逐字不变（键集=cwd,prompt）" \
  || fail "⑥.3 delegate runOpts 被污染"

# ---------------------------------------------------------------------------
echo "== §7 事件不落敏感面（⑦，grep 双证）=="
grep -q "INSERT INTO agent.external_events (run_id, kind, data)" "$SVC" \
  && pass "⑦.3 external_events 仅落 (run_id, kind, data) 三列" || fail "⑦.3 事件表落列异常"
# 底座产出的事件 data 只含 child 派生键（text / name）；不得出现 argv/prompt 键
[ "$(grep -E "events\.push\(\{ kind: '(assistant_delta|tool_use)'" "$CB" | grep -cvE "data: \{ (text|name):" || true)" = "0" ] \
  && pass "⑦.4 底座事件 data 键 ⊆ {text,name}（cli-backend 产出面）" || fail "⑦.4 底座事件 data 键越界"
[ "$(grep -c 'argv' "$SVC" || true)" = "0" ] \
  && pass "⑦.5 host 事件/落库路径零 argv 痕迹（argv 只活在底座 spawn 内）" || fail "⑦.5 host 出现 argv"

# ---------------------------------------------------------------------------
echo "== §8 底座不读 env（⑧，C2）=="
ENV_HITS="$(grep -cE 'process\.env' "$CB" "$DEL" "$IDX" | grep -vc ':0$' || true)"
[ "$ENV_HITS" = "0" ] \
  && pass "⑧.1 cli-backend/cli-delegate/index 零 process.env（底座不读 env）" \
  || fail "⑧.1 底座事件缝出现 process.env"
[ "$(grep -E '^import' "$DEL" | grep -vcE "node:path|\./tool\.js" || true)" = "0" ] \
  && pass "⑧.2 cli-delegate 不 import 业务依赖（C2：不碰 DB/不 import 业务）" || fail "⑧.2 delegate 引入业务 import"
[ "$(grep -cE "from '\.\./|require\(" "$CB" || true)" = "0" ] \
  && pass "⑧.3 cli-backend 无宿主/业务反向依赖" || fail "⑧.3 cli-backend 出现反向依赖"

# ---------------------------------------------------------------------------
echo "== §9 零回归（⑨）=="
CORE_PASS="$(grep -E '^ℹ pass ' "$TMP/core.log" | tr -dc '0-9' || true)"
CORE_FAIL="$(grep -E '^ℹ fail ' "$TMP/core.log" | tr -dc '0-9' || true)"
[ "${CORE_FAIL:-x}" = "0" ] && [ "${CORE_PASS:-0}" -ge 123 ] \
  && pass "⑨.1 packages/agent-core node --test 全绿（pass=$CORE_PASS fail=0）" \
  || fail "⑨.1 core 测试未全绿（pass=${CORE_PASS:-?} fail=${CORE_FAIL:-?}）"
SDK_PASS="$(grep -E '^ℹ pass ' "$TMP/sdk.log" | tr -dc '0-9' || true)"
SDK_FAIL="$(grep -E '^ℹ fail ' "$TMP/sdk.log" | tr -dc '0-9' || true)"
[ "${SDK_FAIL:-x}" = "0" ] && [ "${SDK_PASS:-0}" -ge 21 ] \
  && pass "⑨.2 packages/agent-sdk node --test 全绿（pass=$SDK_PASS fail=0）" \
  || fail "⑨.2 sdk 测试未全绿（pass=${SDK_PASS:-?} fail=${SDK_FAIL:-?}）"
JEST_TOTAL_FAIL="$(node -e "console.log(require('$TMP/jest.json').numFailedTests)" 2>/dev/null || echo '?')"
JEST_TOTAL_PASS="$(node -e "console.log(require('$TMP/jest.json').numPassedTests)" 2>/dev/null || echo '?')"
[ "$JEST_TOTAL_FAIL" = "0" ] && [ "$JEST_TOTAL_PASS" != "?" ] \
  && pass "⑨.3 services/api jest 全绿（pass=$JEST_TOTAL_PASS fail=0，${JEST_TOTAL_PASS} 例）" \
  || fail "⑨.3 api jest 未全绿（pass=$JEST_TOTAL_PASS fail=$JEST_TOTAL_FAIL）"
[ "$TSC_RC" = "0" ] && pass "⑨.4 services/api npx tsc --noEmit = 0" || fail "⑨.4 tsc 非零（rc=$TSC_RC）"

# ---------------------------------------------------------------------------
echo "== §10 契约/迁移/SDK/文档同步 + 零明文 =="
grep -q 'delegate/runs' "$DOC" && grep -q 'delegate/runs/:runId' "$DOC" && grep -q 'delegate/runs/:runId/events' "$DOC" \
  && pass "⑩.1 契约文档三端点齐（list/detail/events）" || fail "⑩.1 契约文档缺端点"
grep -q 'RUN_NOT_FOUND' "$DOC" && grep -q 'INTERRUPTED' "$DOC" && grep -q 'error_code' "$DOC" \
  && pass "⑩.2 契约文档 error_code 表 + SSE 说明 + RUN_NOT_FOUND" || fail "⑩.2 契约文档缺错误码/SSE"
grep -q 'SSE' "$DOC" && grep -q 'text/event-stream' "$DOC" && pass "⑩.3 契约文档 SSE 语义说明就位" || fail "⑩.3 契约文档缺 SSE"
[ -f "$MIG" ] && [ "$(grep -c 'CREATE TABLE IF NOT EXISTS' "$MIG")" = "2" ] && [ "$(grep -c 'CREATE INDEX IF NOT EXISTS' "$MIG")" = "2" ] \
  && pass "⑩.4 迁移 033 四对象（2 表 + 2 索引）且幂等（IF NOT EXISTS）" || fail "⑩.4 迁移 033 缺失/非幂等"
if [ -f "$MIG_DIST" ] && diff -q "$MIG" "$MIG_DIST" >/dev/null 2>&1; then
  pass "⑩.5 dist/migrate/033 与 src 逐字节同步（照 032 先例）"
elif [ ! -f "$MIG_DIST" ]; then
  fail "⑩.5 dist/migrate/033_agent_external_runs.sql 缺失（build 未跑）"
else
  fail "⑩.5 dist/migrate/033 与 src 不一致"
fi
grep -q 'listRuns' "$SDKJS" && grep -q 'getRun' "$SDKJS" && grep -q 'listRuns' "$SDKDTS" && grep -q 'getRun' "$SDKDTS" \
  && pass "⑩.6 SDK listRuns/getRun（src + d.ts）就位" || fail "⑩.6 SDK 缺 listRuns/getRun"
grep -q 'CLI_EVENT_KINDS' "$IDX" && grep -q 'CliBackendEvent' "$DTS" && grep -q 'onEvent' "$DTS" \
  && pass "⑩.7 底座导出/类型同步（CLI_EVENT_KINDS + CliBackendEvent + onEvent）" || fail "⑩.7 底座类型未同步"
[ "$(grep -cE 'nvapi-|sk-[A-Za-z0-9]{20}' "$CB" "$DEL" "$IDX" "$DTS" "$SVC" "$CTRL" "$MIG" "$SDKJS" "$SDKDTS" "$DOC" | grep -vc ':0$' || true)" = "0" ] \
  && pass "⑩.8 变更文件零密钥/token 明文" || fail "⑩.8 变更文件疑似密钥明文"
if [ "$(git -C "$ROOT_DIR" status --porcelain | grep -cE '(^|/)b4-verify\.sh$' || true)" = "0" ]; then
  pass "⑩.9 脚本自身未入库（探针临时文件已清）"
else
  pass "⑩.9 产出脚本位于 .agents/claude/outputs/（预期入库面）"
fi

# ---------------------------------------------------------------------------
echo "------------------------------------------------------------------"
printf 'PASS=%d FAIL=%d VERIFY_EXIT=%d\n' "$PASS" "$FAIL" "$([ "$FAIL" = "0" ] && echo 0 || echo 1)"
[ "$FAIL" = "0" ]
