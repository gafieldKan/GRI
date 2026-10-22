#!/usr/bin/env bash
# ============================================================================
# B-3a 验收：外部 agent 后端 —— CliBackendRegistry + 四后端（claude-code/codex/openclaw/hermes）
# 依据：docs/EXTERNAL_AGENT_HARNESS.md（灵魂文件）+ .agents/claude/tasks/b3a-cli-backends.md
#
# 结构：
#   §1 端口（C2）        —— 四后端注册/get/list/has；撞名 register 抛错（不静默覆盖）；非法后端 fail-fast
#   §2 argv 断言（实测）  —— 四后端 argv 逐项 deepEqual（claude-code 必须带 --verbose）
#   §3 解析器            —— stream-json(取 result) / JSONL(agent_message) / 纯文本(hermes) / openclaw 信封
#   §4 DENYLIST（C3）     —— 未放权 argv 无危险旗标且 run 拒绝；显式放权端到端观测到旗标
#   §5 只读真跑          —— claude-code/codex 必过（非空 text）；openclaw 尝试（成/或明确报错）；
#                          hermes 必须**明确报错**（被杀，不静默/不挂死）
#   §6 超时杀 + 无孤儿（C5）—— 极小 timeoutMs → 被杀、exitCode=124、ps 无孤儿
#   §7 零回归（C9/C10）   —— packages/agent-core node --test 全绿 + services/api tsc --noEmit = 0
#   §8 底座合规/零明文(C1/C4/C6)—— 源码不读 env、不 import 业务、shell:false、无密钥字面量、无 console 打印
# 末行打印「PASS=<n> FAIL=<m> VERIFY_EXIT=0」。
#
# 依赖：node ≥18、本机已装 claude/codex/openclaw/hermes（§5）；services/api 已 npm i（§7）。
# 用法： bash .agents/claude/outputs/b3a-verify.sh
#       B3A_SKIP_REAL=1         跳过 §5 真跑（离线环境）
#       B3A_REAL_TIMEOUT_MS=…   覆盖 §5 单后端超时（默认 180000）
# ============================================================================
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CORE_DIR="$ROOT_DIR/packages/agent-core"
API_DIR="$ROOT_DIR/services/api"
SRC="$CORE_DIR/src/cli-backend.js"
DTS="$CORE_DIR/index.d.ts"
IDX="$CORE_DIR/src/index.js"
REAL_TIMEOUT_MS="${B3A_REAL_TIMEOUT_MS:-180000}"

HELPER="$(mktemp /tmp/b3a-helper.XXXXXX.mjs)"
trap 'rm -f "$HELPER" 2>/dev/null' EXIT

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); printf 'PASS  %s\n' "$1"; }
fail() { FAIL=$((FAIL + 1)); printf 'FAIL  %s\n' "$1"; }
ok() { if [ "$1" = "0" ]; then pass "$2"; else fail "$2"; fi; }

# ---------------------------------------------------------------------------
# 离线 helper：直接 import 底座真源码（不复制实现），跑静态断言 / 真跑 / 超时
# 静态断言打印 "PASS <label>" / "FAIL <label> :: <detail>"，由 bash 计数。
# ---------------------------------------------------------------------------
cat > "$HELPER" <<'MJS'
import {
  CliBackendRegistry, BACKENDS, DENYLIST, cliBackends, createCliBackendRegistry,
  findDeniedArg, claudeCodeBackend, codexBackend, openclawBackend, hermesBackend,
} from 'CLI_BACKEND_SRC/index.js';

const [cmd, ...args] = process.argv.slice(2);
let p = 0, f = 0;
const pass = (l) => { p++; console.log(`PASS ${l}`); };
const fail = (l, d) => { f++; console.log(`FAIL ${l} :: ${d}`); };
const eq = (l, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) pass(l); else fail(l, `got=${a} want=${b}`);
};
const truthy = (l, v, d) => (v ? pass(l) : fail(l, d ?? `got=${v}`));

function staticChecks() {
  // §1 端口
  const ids = ['claude-code', 'codex', 'openclaw', 'hermes'];
  truthy('§1.1 默认注册表 list() 回 4 个', cliBackends.list().length === 4, `len=${cliBackends.list().length}`);
  for (const id of ids) {
    truthy(`§1.2 get('${id}') 可得`, cliBackends.get(id)?.id === id);
    truthy(`§1.3 has('${id}')=true`, cliBackends.has(id) === true);
  }
  truthy('§1.4 get 未知 id → null', cliBackends.get('nope') === null);
  eq('§1.5 list() id 顺序', cliBackends.list().map((b) => b.id), ids);
  truthy('§1.6 list() 可序列化（无函数）',
    cliBackends.list().every((b) => Object.values(b).every((v) => typeof v !== 'function')));

  // §1.7 撞名 → 抛错 + 诊断，且不覆盖
  const dup = new CliBackendRegistry([{ id: 'dup', label: 'D', bin: 'echo-bin-1', buildArgs: () => [], parseLine: () => null }]);
  let err = null;
  try { dup.register({ id: 'dup', label: 'D', bin: 'echo-bin-2', buildArgs: () => [], parseLine: () => null }); }
  catch (e) { err = e; }
  truthy('§1.7 撞名 register 抛错（不静默覆盖）', !!err, '未抛错');
  truthy('§1.8 撞名诊断含 id/bin', err && /dup/.test(err.message) && /echo-bin-2/.test(err.message), err?.message);
  truthy('§1.9 首次注册未被覆盖', dup.get('dup')?.bin === 'echo-bin-1');

  // §1.10 非法后端 fail-fast
  const cases = [
    [null, '必须是对象'], [{ bin: 'x', buildArgs() {}, parseLine() {} }, 'id 必填'],
    [{ id: 'a', buildArgs() {}, parseLine() {} }, 'bin 必填'],
    [{ id: 'a', bin: 'x', parseLine() {} }, 'buildArgs'],
    [{ id: 'a', bin: 'x', buildArgs() {} }, 'parseLine'],
  ];
  let allThrew = true;
  for (const [bad, re] of cases) {
    try { new CliBackendRegistry().register(bad); allThrew = false; }
    catch (e) { if (!new RegExp(re).test(e.message)) allThrew = false; }
  }
  truthy('§1.10 非法后端 fail-fast（缺 id/bin/buildArgs/parseLine）', allThrew);

  // §1.11 工厂可追加 + 追加撞名抛错
  truthy('§1.11 createCliBackendRegistry 预装 4 个', createCliBackendRegistry().list().length === 4);
  let fe = null;
  try { createCliBackendRegistry([{ id: 'codex', label: 'x', bin: 'b', buildArgs: () => [], parseLine: () => null }]); }
  catch (e) { fe = e; }
  truthy('§1.12 工厂追加撞名抛错', !!fe);

  // §2 argv（2026-10-22 实测口径）
  eq('§2.1 claude-code argv',
    claudeCodeBackend.buildArgs({ prompt: 'P' }),
    ['-p', 'P', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'default']);
  eq('§2.2 codex argv', codexBackend.buildArgs({ prompt: 'P' }), ['exec', 'P', '--json', '--skip-git-repo-check']);
  eq('§2.3 openclaw argv', openclawBackend.buildArgs({ prompt: 'P', cwd: '/tmp/w' }),
    ['agent', 'exec', '--json', '--cwd', '/tmp/w', 'P']);
  eq('§2.4 hermes argv', hermesBackend.buildArgs({ prompt: 'P' }), ['-z', 'P']);
  eq('§2.5 bin 名', [claudeCodeBackend.bin, codexBackend.bin, openclawBackend.bin, hermesBackend.bin],
    ['claude', 'codex', 'openclaw', 'hermes']);
  eq('§2.6 默认 timeoutMs', [claudeCodeBackend.timeoutMs, codexBackend.timeoutMs, openclawBackend.timeoutMs, hermesBackend.timeoutMs],
    [600000, 900000, 600000, 600000]);
  truthy('§2.7 BACKENDS 冻结且按 id 索引',
    Object.isFrozen(BACKENDS) && BACKENDS['claude-code'] === claudeCodeBackend && BACKENDS.hermes === hermesBackend);

  // §3 解析器
  const claudeState = { text: '', sessionId: null };
  for (const l of [
    '{"type":"system","subtype":"init","session_id":"sess-1"}',
    '{"type":"assistant","message":{"content":[{"type":"text","text":"增量"}]},"session_id":"sess-1"}',
    '{"type":"result","subtype":"success","result":"最终答复","session_id":"sess-1"}',
  ]) {
    const r = claudeCodeBackend.parseLine(l, claudeState);
    if (r?.sessionId) claudeState.sessionId = r.sessionId;
    if (typeof r?.text === 'string') claudeState.text = r.text;
  }
  eq('§3.1 stream-json 取 result 文本', claudeState.text, '最终答复');
  eq('§3.2 stream-json 取 session_id', claudeState.sessionId, 'sess-1');

  const codexState = { text: '', sessionId: null };
  for (const l of [
    '{"type":"thread.started","thread_id":"th-9"}',
    '{"type":"item.completed","item":{"type":"reasoning","text":"思考"}}',
    '{"type":"item.completed","item":{"type":"agent_message","text":"最终答复"}}',
  ]) {
    const r = codexBackend.parseLine(l, codexState);
    if (r?.sessionId) codexState.sessionId = r.sessionId;
    if (typeof r?.text === 'string') codexState.text = r.text;
  }
  eq('§3.3 JSONL 取 agent_message 文本', codexState.text, '最终答复');
  eq('§3.4 JSONL 取 thread_id', codexState.sessionId, 'th-9');
  truthy('§3.5 JSONL 非 agent_message 不产出文本',
    codexBackend.parseLine('{"type":"item.completed","item":{"type":"reasoning","text":"x"}}') === null);

  const hermesState = { text: '', sessionId: null };
  for (const l of ['第一行', '第二行', '']) {
    const r = hermesBackend.parseLine(l, hermesState);
    if (typeof r?.text === 'string') hermesState.text = r.append && hermesState.text ? `${hermesState.text}\n${r.text}` : r.text;
  }
  eq('§3.6 纯文本逐行追加（hermes）', hermesState.text, '第一行\n第二行');

  const env = openclawBackend.parseOutput(JSON.stringify({ ok: true, final: '最终答复', payloads: [{ text: 'p' }], sessionId: 'oc-1' }));
  eq('§3.7 openclaw 信封取 final', env.text, '最终答复');
  eq('§3.8 openclaw 信封取 sessionId', env.sessionId, 'oc-1');
  eq('§3.9 openclaw final 缺失回退 payloads',
    openclawBackend.parseOutput(JSON.stringify({ payloads: [{ text: 'a' }, { text: 'b' }] })).text, 'a\nb');
  truthy('§3.10 openclaw 非 JSON → 明确 error（不静默）',
    !!openclawBackend.parseOutput('No route-compatible authentication source is configured').error);

  // §4 DENYLIST
  truthy('§4.1 findDeniedArg 命中 bypassPermissions 取值',
    findDeniedArg(['--permission-mode', 'bypassPermissions']) === 'bypassPermissions');
  truthy('§4.2 findDeniedArg 命中 --dangerously-skip-permissions',
    findDeniedArg(['--dangerously-skip-permissions']) === '--dangerously-skip-permissions');
  truthy('§4.3 findDeniedArg 命中 --dangerously-bypass* 前缀族',
    findDeniedArg(['--dangerously-bypass-anything']) === '--dangerously-bypass-anything');
  truthy('§4.4 findDeniedArg 命中 --yolo', findDeniedArg(['--yolo']) === '--yolo');
  truthy('§4.5 安全 argv → null', findDeniedArg(['-p', 'x', '--verbose']) === null);
  truthy('§4.6 DENYLIST 冻结', Object.isFrozen(DENYLIST));
  let clean = true;
  for (const b of Object.values(BACKENDS)) if (findDeniedArg(b.buildArgs({ prompt: 'P', cwd: '/tmp' })) !== null) clean = false;
  truthy('§4.7 四后端默认 argv 均无危险旗标', clean);

  console.log(`__STATIC_DONE__ pass=${p} fail=${f}`);
  process.exit(f === 0 ? 0 : 1);
}

async function runBackend() {
  const [id, prompt, timeoutMs] = args;
  const reg = createCliBackendRegistry();
  const res = await reg.run(id, { prompt, timeoutMs: Number(timeoutMs) });
  // 零明文：不打印 prompt / 不打印完整 text 之外的敏感面；只回结构化字段
  console.log(JSON.stringify(res));
}

async function timeoutKill() {
  // 注册一个"永不退出"的后端（sleep），极小超时 → 应被杀组
  const reg = new CliBackendRegistry([
    { id: 'sleepy', label: 'Sleep', bin: 'sleep', timeoutMs: 60000, buildArgs: () => ['60'], parseLine: () => null },
  ]);
  const res = await reg.run('sleepy', { prompt: 'x', timeoutMs: 250 });
  console.log(JSON.stringify(res));
}

async function denylistBlock() {
  // 未放权：buildArgs 自带危险旗标 → run 必须拒绝（不 spawn）
  const reg = new CliBackendRegistry([
    { id: 'bad', label: 'Bad', bin: 'echo', timeoutMs: 5000,
      buildArgs: ({ prompt }) => ['--permission-mode', 'bypassPermissions', prompt], parseLine: () => null },
  ]);
  let rejected = null;
  try { await reg.run('bad', { prompt: 'hi' }); } catch (e) { rejected = e.message; }
  // 放权：dangerousFlags 追加 → 端到端观测 argv（echo 原样回显）
  const reg2 = new CliBackendRegistry([
    { id: 'danger', label: 'Danger', bin: 'echo', timeoutMs: 5000, dangerousFlags: ['--yolo'],
      buildArgs: ({ prompt }) => [prompt], parseLine: (l) => ({ text: String(l) }) },
  ]);
  const safe = await reg2.run('danger', { prompt: 'hello' });
  const risky = await reg2.run('danger', { prompt: 'hello', allowDangerous: true });
  console.log(JSON.stringify({ rejected, safeText: safe.text, riskyText: risky.text }));
}

async function injection() {
  const reg = new CliBackendRegistry([
    { id: 'echo', label: 'Echo', bin: 'echo', timeoutMs: 5000,
      buildArgs: ({ prompt }) => [prompt], parseLine: (l) => ({ text: String(l) }) },
  ]);
  const evil = '"; exit 7; echo $(id) && rm -rf / -- #';
  const res = await reg.run('echo', { prompt: evil });
  console.log(JSON.stringify({ text: res.text, exitCode: res.exitCode }));
}

const table = { static: staticChecks, run: runBackend, timeout: timeoutKill, denylist: denylistBlock, injection };
if (!table[cmd]) { console.error(`unknown cmd: ${cmd}`); process.exit(2); }
await table[cmd]();
MJS

# 把源码路径注入 helper（CLI_BACKEND_SRC 占位 → 真实绝对路径）
sed -i "s#CLI_BACKEND_SRC#${CORE_DIR}/src#" "$HELPER"

# ---------------------------------------------------------------------------
echo "== §1–§4 端口 / argv / 解析器 / DENYLIST（离线，直接 import 真源码）=="
STATIC_OUT="$(node "$HELPER" static 2>&1)"
STATIC_RC=$?
printf '%s\n' "$STATIC_OUT" | grep -E '^PASS ' | sed 's/^PASS /PASS  /'
n_pass="$(printf '%s\n' "$STATIC_OUT" | grep -cE '^PASS ')"
n_fail="$(printf '%s\n' "$STATIC_OUT" | grep -cE '^FAIL ')"
PASS=$((PASS + n_pass)); FAIL=$((FAIL + n_fail))
printf '%s\n' "$STATIC_OUT" | grep -E '^FAIL ' || true
[ "$STATIC_RC" = "0" ] || fail "§4.8 静态断言套件整体退出码非 0（rc=$STATIC_RC）"

echo "== §4.9–§4.12 DENYLIST 阻断/放权 + 注入（真 spawn echo）=="
DL_OUT="$(node "$HELPER" denylist 2>/dev/null)"
REJ="$(printf '%s' "$DL_OUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log((JSON.parse(s).rejected||"").toString())}catch{console.log("")}})')"
case "$REJ" in
  *拒绝执行*bypassPermissions*) pass "§4.9 未放权时 run 拒绝危险 argv（不 spawn）" ;;
  *) fail "§4.9 未放权应拒绝 bypassPermissions（实得: '$REJ'）" ;;
esac
SAFE_T="$(printf '%s' "$DL_OUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).safeText)}catch{console.log("")}})')"
RISKY_T="$(printf '%s' "$DL_OUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).riskyText)}catch{console.log("")}})')"
case "$SAFE_T" in
  *--yolo*) fail "§4.10 未放权 argv 不得含 --yolo（实得 '$SAFE_T'）" ;;
  "") fail "§4.10 未放权 echo 无输出" ;;
  *) pass "§4.10 未放权 argv 不含 --yolo（实测 '$SAFE_T'）" ;;
esac
case "$RISKY_T" in
  *--yolo*) pass "§4.11 显式放权才追加 --yolo（实测 '$RISKY_T'）" ;;
  *) fail "§4.11 放权后应含 --yolo（实得 '$RISKY_T'）" ;;
esac
INJ_OUT="$(node "$HELPER" injection 2>/dev/null)"
INJ_T="$(printf '%s' "$INJ_OUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).text)}catch{console.log("")}})')"
if [ "$INJ_T" = '"; exit 7; echo $(id) && rm -rf / -- #' ]; then
  pass "§4.12 注入串原样作单个 argv（shell:false，无解释）"
else
  fail "§4.12 注入串被解释（实得 '$INJ_T'）"
fi

# ---------------------------------------------------------------------------
echo "== §5 只读真跑（claude-code / codex 必过；openclaw 尝试；hermes 必明确报错）=="
RUN_PROMPT='reply exactly: ok'
probe() { # $1=id  $2=timeoutMs
  node "$HELPER" run "$1" "$RUN_PROMPT" "$2" 2>/dev/null
}
jget() { # $1=json  $2=field
  printf '%s' "$1" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s);const v=o[process.argv[1]];console.log(v==null?"":String(v))}catch{console.log("")}})' "$2"
}

if [ "${B3A_SKIP_REAL:-0}" = "1" ]; then
  echo "   （B3A_SKIP_REAL=1，跳过 §5 真跑）"
  pass "§5.skip 真跑按环境开关跳过"
else
  for id in claude-code codex openclaw; do
    R="$(probe "$id" "$REAL_TIMEOUT_MS")"
    T="$(jget "$R" text)"; E="$(jget "$R" error)"; RC="$(jget "$R" exitCode)"; TO="$(jget "$R" timedOut)"
    if [ -n "$T" ]; then
      pass "§5.$id 只读真跑通过（text 非空，len=${#T}，exitCode=${RC}）"
    elif [ -n "$E" ]; then
      # openclaw 允许"环境未就绪"（如缺 ambient 鉴权）——但必须**明确报错**，不得静默
      if [ "$id" = "openclaw" ] && [ "$TO" != "true" ]; then
        pass "§5.$id 环境未就绪 → 明确报错（不静默）：${E:0:90}"
      else
        fail "§5.$id 应有文本或（openclaw）明确前置报错；实得 error='$E' timedOut=$TO"
      fi
    else
      fail "§5.$id 既无文本也无 error（静默）exitCode=$RC"
    fi
  done

  # hermes：实测 headless 挂起 → 必须以小超时被杀并**明确报错**，不得挂死
  RH="$(probe hermes 30000)"
  TH="$(jget "$RH" text)"; EH="$(jget "$RH" error)"; TOH="$(jget "$RH" timedOut)"; RCH="$(jget "$RH" exitCode)"
  if [ -n "$TH" ]; then
    pass "§5.hermes 真跑通过（本机 hermes 未挂起，text len=${#TH}）"
  elif [ "$TOH" = "true" ] && [ -n "$EH" ]; then
    pass "§5.hermes 挂起被超时杀且明确报错（timedOut=true exitCode=$RCH）：${EH:0:90}"
  else
    fail "§5.hermes 应挂起被杀并报错（实得 timedOut=$TOH error='$EH' exitCode=$RCH）"
  fi
fi

# ---------------------------------------------------------------------------
echo "== §6 超时杀进程组 + 无孤儿（C5）=="
TO_OUT="$(node "$HELPER" timeout 2>/dev/null)"
TO_FLAG="$(jget "$TO_OUT" timedOut)"
TO_CODE="$(jget "$TO_OUT" exitCode)"
TO_PID="$(jget "$TO_OUT" pid)"
[ "$TO_FLAG" = "true" ] && pass "§6.1 极小 timeoutMs → timedOut=true" || fail "§6.1 应超时（实得 timedOut='$TO_FLAG'）"
[ "$TO_CODE" = "124" ] && pass "§6.2 超时退出码 = 124" || fail "§6.2 超时 exitCode 应 124（实得 '$TO_CODE'）"
[ -n "$TO_PID" ] && pass "§6.3 拿到子进程 pid=$TO_PID" || fail "§6.3 未拿到 pid"
if [ -n "$TO_PID" ]; then
  sleep 0.5
  if ps -p "$TO_PID" >/dev/null 2>&1; then
    fail "§6.4 孤儿进程仍在（pid=$TO_PID）"
    kill -9 "$TO_PID" 2>/dev/null
  else
    pass "§6.4 ps 验证无孤儿（pid=$TO_PID 已消亡）"
  fi
  # 组内无残留 sleep（防杀组只杀组长）
  LEFT="$(pgrep -g "$TO_PID" 2>/dev/null | wc -l)"
  [ "${LEFT:-0}" = "0" ] && pass "§6.5 进程组内无残留（pgrep -g = 0）" || fail "§6.5 进程组残留 $LEFT 个"
fi

# ---------------------------------------------------------------------------
echo "== §7 零回归（C9/C10）=="
( cd "$CORE_DIR" && node --test --test-force-exit "tests/**/*.test.js" >/tmp/b3a-core-test.log 2>&1 )
CORE_RC=$?
if [ "$CORE_RC" = "0" ]; then
  CT="$(grep -E '^ℹ (tests|pass|fail) ' /tmp/b3a-core-test.log | tr '\n' ' ')"
  pass "§7.1 packages/agent-core node --test 全绿（$CT）"
else
  fail "§7.1 packages/agent-core 测试未全绿（rc=$CORE_RC）；见 /tmp/b3a-core-test.log"
fi
if [ -d "$API_DIR/node_modules" ]; then
  ( cd "$API_DIR" && npx tsc --noEmit >/tmp/b3a-tsc.log 2>&1 )
  TSC_RC=$?
  [ "$TSC_RC" = "0" ] && pass "§7.2 services/api npx tsc --noEmit = 0" || fail "§7.2 api tsc 报错（rc=$TSC_RC）；见 /tmp/b3a-tsc.log"
else
  fail "§7.2 services/api 未装依赖（node_modules 缺失），无法跑 tsc"
fi

# ---------------------------------------------------------------------------
echo "== §8 底座合规 / 零明文（C1/C4/C6）=="
ENVHIT="$(grep -cE 'process\.env' "$SRC" 2>/dev/null || true)"
[ "${ENVHIT:-1}" = "0" ] && pass "§8.1 底座不读 env（process.env 命中 0）" || fail "§8.1 cli-backend.js 读 env $ENVHIT 处（C1 违规）"
IMPORTS="$(grep -oE "from '[^']+'" "$SRC" | sort -u | tr '\n' ' ')"
[ "$IMPORTS" = "from 'node:child_process' " ] && pass "§8.2 仅 import node:child_process（无业务依赖）" || fail "§8.2 依赖异常：$IMPORTS"
grep -q 'shell: false' "$SRC" && pass "§8.3 spawn 显式 shell:false（C4）" || fail "§8.3 缺 shell:false"
grep -q 'detached: true' "$SRC" && pass "§8.4 spawn detached:true（进程组可整组杀）" || fail "§8.4 缺 detached:true"
KEYHIT="$(grep -cE 'nvapi-[A-Za-z0-9]{8,}|sk-[A-Za-z0-9]{8,}|Bearer |apiKey\s*[:=]|api_key' "$SRC" 2>/dev/null || true)"
[ "${KEYHIT:-1}" = "0" ] && pass "§8.5 源码无密钥字面量/apiKey 赋值（C1）" || fail "§8.5 源码出现密钥相关 $KEYHIT 处"
LOGHIT="$(grep -cE 'console\.(log|error|warn)' "$SRC" 2>/dev/null || true)"
[ "${LOGHIT:-1}" = "0" ] && pass "§8.6 源码无 console 打印（不落 prompt/明文）" || fail "§8.6 源码含 console 打印 $LOGHIT 处"
grep -q 'CliBackendRegistry' "$IDX" && grep -q 'BACKENDS' "$IDX" && pass "§8.7 src/index.js 已导出端口" || fail "§8.7 index.js 缺导出"
grep -q 'CliBackendRegistry' "$DTS" && grep -q 'CliRunResult' "$DTS" && pass "§8.8 index.d.ts 已补类型" || fail "§8.8 index.d.ts 缺类型"
CLIPHIT="$(grep -c 'STDERR_CLIP_BYTES = 512' "$SRC" 2>/dev/null || true)"
[ "${CLIPHIT:-0}" = "1" ] && pass "§8.9 stderr 摘要上限 512B（C6）" || fail "§8.9 未见 512B 截断常量"
[ -f "$CORE_DIR/tests/cli-backend.test.js" ] && pass "§8.10 单测文件存在" || fail "§8.10 缺 tests/cli-backend.test.js"

# ---------------------------------------------------------------------------
echo "------------------------------------------------------------------"
printf 'PASS=%d FAIL=%d VERIFY_EXIT=%d\n' "$PASS" "$FAIL" "$([ "$FAIL" = "0" ] && echo 0 || echo 1)"
[ "$FAIL" = "0" ]
