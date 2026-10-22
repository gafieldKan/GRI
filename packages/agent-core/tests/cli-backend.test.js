/**
 * CliBackendRegistry 单测（B-3a）。
 *
 * 覆盖：注册/撞名/清单 · 四后端 argv 断言 · 三方解析器 · DENYLIST 阻断与放权 ·
 *       argv 数组防注入 · 超时杀进程组（无孤儿）· 零静默/ENOENT/stderr 截断。
 * 不依赖本机 CLI 真的可跑：真跑验收在 `.agents/claude/outputs/b3a-verify.sh`。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CliBackendRegistry,
  BACKENDS,
  DENYLIST,
  cliBackends,
  createCliBackendRegistry,
  findDeniedArg,
  claudeCodeBackend,
  codexBackend,
  openclawBackend,
  hermesBackend,
} from '../src/index.js';

// ── 测试替身 ────────────────────────────────────────────────────────────────

/** `echo` 后端：原样打印 argv（用来**端到端观测真实传给 spawn 的 argv 数组**）。 */
function echoBackend(overrides = {}) {
  return {
    id: 'echo',
    label: 'Echo',
    bin: 'echo',
    timeoutMs: 5000,
    buildArgs: ({ prompt }) => [prompt],
    parseLine: (line) => ({ text: String(line) }),
    ...overrides,
  };
}

/** `sleep` 后端：永不输出，用来验证超时杀进程组。 */
function sleepBackend(seconds = 60) {
  return {
    id: 'sleepy',
    label: 'Sleep',
    bin: 'sleep',
    timeoutMs: 60000,
    buildArgs: () => [String(seconds)],
    parseLine: () => null,
  };
}

/** 进程存活探测（kill(pid,0) 成功 = 还在）。 */
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitDead(pid, ms = 2000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (!alive(pid)) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return !alive(pid);
}

// ── §1 注册表：register/get/list/has ────────────────────────────────────────

test('registry: 默认注册表含四内置后端，get/has/list 一致', () => {
  for (const id of ['claude-code', 'codex', 'openclaw', 'hermes']) {
    assert.equal(cliBackends.has(id), true, `${id} 应已注册`);
    assert.equal(cliBackends.get(id).id, id);
  }
  assert.equal(cliBackends.get('nope'), null);
  const list = cliBackends.list();
  assert.equal(list.length, 4);
  assert.deepEqual(
    list.map((b) => b.id),
    ['claude-code', 'codex', 'openclaw', 'hermes'],
  );
  // list() 必须可序列化（不带函数）
  for (const b of list) {
    for (const v of Object.values(b)) assert.notEqual(typeof v, 'function');
  }
});

test('registry: BACKENDS 冻结且按 id 索引；BACKENDS[id] === 具名导出', () => {
  assert.equal(Object.isFrozen(BACKENDS), true);
  assert.equal(BACKENDS['claude-code'], claudeCodeBackend);
  assert.equal(BACKENDS.codex, codexBackend);
  assert.equal(BACKENDS.openclaw, openclawBackend);
  assert.equal(BACKENDS.hermes, hermesBackend);
});

test('registry: 撞名 register 抛错 + 诊断（不静默覆盖）', () => {
  const r = new CliBackendRegistry();
  r.register(echoBackend({ id: 'dup', bin: 'echo' }));
  assert.throws(
    () => r.register(echoBackend({ id: 'dup', bin: 'other-bin' })),
    (e) => /id 冲突/.test(e.message) && /dup/.test(e.message) && /other-bin/.test(e.message),
  );
  // 首次注册未被覆盖
  assert.equal(r.get('dup').bin, 'echo');
});

test('registry: 非法后端 fail-fast（缺 id/bin/buildArgs/parseLine）', () => {
  const r = new CliBackendRegistry();
  assert.throws(() => r.register(null), /必须是对象/);
  assert.throws(() => r.register({ bin: 'x', buildArgs() {}, parseLine() {} }), /id 必填/);
  assert.throws(() => r.register({ id: 'a', buildArgs() {}, parseLine() {} }), /bin 必填/);
  assert.throws(() => r.register({ id: 'a', bin: 'x', parseLine() {} }), /buildArgs/);
  assert.throws(() => r.register({ id: 'a', bin: 'x', buildArgs() {} }), /parseLine/);
});

test('registry: createCliBackendRegistry 预装四后端并可追加（追加撞名抛错）', () => {
  const r = createCliBackendRegistry();
  assert.equal(r.list().length, 4);
  const r2 = createCliBackendRegistry([echoBackend({ id: 'extra' })]);
  assert.equal(r2.list().length, 5);
  assert.throws(() => createCliBackendRegistry([echoBackend({ id: 'codex' })]), /id 冲突/);
});

test('registry: run 未知后端 → 抛错并列出已注册 id', async () => {
  await assert.rejects(() => cliBackends.run('ghost', { prompt: 'hi' }), /未知 CLI 后端/);
  await assert.rejects(() => cliBackends.run('ghost', { prompt: 'hi' }), /hermes/);
});

test('registry: run 空 prompt → 抛错（不 spawn）', async () => {
  await assert.rejects(() => cliBackends.run('claude-code', { prompt: '   ' }), /prompt 必填/);
});

// ── §2 argv 断言（四内置后端，不真 spawn）────────────────────────────────────

test('argv: claude-code（stream-json 必须带 --verbose）', () => {
  assert.deepEqual(claudeCodeBackend.buildArgs({ prompt: 'P' }), [
    '-p',
    'P',
    '--output-format',
    'stream-json',
    '--verbose',
    '--permission-mode',
    'default',
  ]);
  assert.equal(claudeCodeBackend.bin, 'claude');
  assert.equal(claudeCodeBackend.timeoutMs, 600000);
});

test('argv: codex', () => {
  assert.deepEqual(codexBackend.buildArgs({ prompt: 'P' }), ['exec', 'P', '--json', '--skip-git-repo-check']);
  assert.equal(codexBackend.bin, 'codex');
  assert.equal(codexBackend.timeoutMs, 900000);
});

test('argv: openclaw（agent exec + --cwd + 末位 msg）', () => {
  assert.deepEqual(openclawBackend.buildArgs({ prompt: 'P', cwd: '/tmp/x' }), [
    'agent',
    'exec',
    '--json',
    '--cwd',
    '/tmp/x',
    'P',
  ]);
  assert.equal(openclawBackend.bin, 'openclaw');
});

test('argv: hermes（one-shot -z）', () => {
  assert.deepEqual(hermesBackend.buildArgs({ prompt: 'P' }), ['-z', 'P']);
  assert.equal(hermesBackend.bin, 'hermes');
});

test('argv: 四后端默认 argv 均不含危险旗标（C3 最小权限）', () => {
  for (const b of Object.values(BACKENDS)) {
    const args = b.buildArgs({ prompt: 'P', cwd: '/tmp' });
    assert.equal(findDeniedArg(args), null, `${b.id} 默认 argv 不应含危险旗标`);
  }
});

// ── §3 解析器（三方样例）────────────────────────────────────────────────────

test('parse: claude-code stream-json 取 result 行文本 + session_id', () => {
  const lines = [
    '{"type":"system","subtype":"init","session_id":"sess-1","model":"m"}',
    '{"type":"assistant","message":{"content":[{"type":"text","text":"（增量，不取）"}]},"session_id":"sess-1"}',
    '{"type":"result","subtype":"success","result":"最终答复","session_id":"sess-1","is_error":false}',
  ];
  const state = { text: '', sessionId: null };
  for (const l of lines) {
    const p = claudeCodeBackend.parseLine(l, state);
    if (!p) continue;
    if (p.sessionId) state.sessionId = p.sessionId;
    if (typeof p.text === 'string') state.text = p.text;
  }
  assert.equal(state.text, '最终答复'); // 只取 result，不与 assistant 增量重复
  assert.equal(state.sessionId, 'sess-1');
  // 噪音行（非 JSON）容错为 null
  assert.equal(claudeCodeBackend.parseLine('npm warn something'), null);
});

test('parse: codex JSONL 取 item.completed(agent_message).text + thread_id', () => {
  const state = { text: '', sessionId: null };
  const lines = [
    '{"type":"thread.started","thread_id":"th-9"}',
    '{"type":"turn.started"}',
    '{"type":"item.completed","item":{"type":"reasoning","text":"思考（不取）"}}',
    '{"type":"item.completed","item":{"type":"agent_message","text":"最终答复"}}',
  ];
  for (const l of lines) {
    const p = codexBackend.parseLine(l, state);
    if (!p) continue;
    if (p.sessionId) state.sessionId = p.sessionId;
    if (typeof p.text === 'string') state.text = p.text;
  }
  assert.equal(state.text, '最终答复');
  assert.equal(state.sessionId, 'th-9');
  // 非 agent_message 的 item 不产出文本
  assert.equal(codexBackend.parseLine('{"type":"item.completed","item":{"type":"reasoning","text":"x"}}'), null);
});

test('parse: hermes 纯文本逐行追加（append）', () => {
  const lines = ['第一行', '第二行', ''];
  const state = { text: '', sessionId: null };
  for (const l of lines) {
    const p = hermesBackend.parseLine(l, state);
    if (!p) continue;
    if (typeof p.text === 'string') state.text = p.append && state.text ? `${state.text}\n${p.text}` : p.text;
  }
  assert.equal(state.text, '第一行\n第二行'); // 空行不产出
});

test('parse: openclaw 多行 JSON 信封取 final（回退 payloads[].text）+ sessionId', () => {
  const envelope = JSON.stringify(
    {
      ok: true,
      final: '最终答复',
      payloads: [{ text: 'payload 文本' }],
      sessionId: 'oc-1',
      usage: { total: 12 },
    },
    null,
    2,
  );
  const out = openclawBackend.parseOutput(envelope);
  assert.equal(out.text, '最终答复'); // final 优先
  assert.equal(out.sessionId, 'oc-1');
  assert.equal(out.error, undefined);

  // final 缺失 → 回退 payloads
  const out2 = openclawBackend.parseOutput(JSON.stringify({ payloads: [{ text: 'a' }, { text: 'b' }] }));
  assert.equal(out2.text, 'a\nb');

  // 非 JSON（如鉴权报错文本）→ 明确 error，不静默
  const out3 = openclawBackend.parseOutput('No route-compatible authentication source is configured for openai');
  assert.ok(out3.error && /前置/.test(out3.error));
});

// ── §4 DENYLIST（默认最小权限 / 显式放权）───────────────────────────────────

test('DENYLIST: findDeniedArg 命中清单项与危险前缀族', () => {
  assert.equal(findDeniedArg(['-p', 'x']), null);
  assert.equal(findDeniedArg(['--permission-mode', 'bypassPermissions']), 'bypassPermissions');
  assert.equal(findDeniedArg(['--dangerously-skip-permissions']), '--dangerously-skip-permissions');
  assert.equal(findDeniedArg(['--dangerously-bypass-anything-else']), '--dangerously-bypass-anything-else');
  assert.equal(findDeniedArg(['--yolo']), '--yolo');
  assert.ok(DENYLIST.includes('--dangerously-skip-permissions'));
  assert.equal(Object.isFrozen(DENYLIST), true);
});

test('DENYLIST: 未放权时 run 拒绝含危险旗标的 argv（不 spawn）', async () => {
  const r = new CliBackendRegistry([
    echoBackend({
      id: 'bad',
      buildArgs: ({ prompt }) => ['--permission-mode', 'bypassPermissions', prompt],
    }),
  ]);
  await assert.rejects(() => r.run('bad', { prompt: 'hi' }), /拒绝执行.*bypassPermissions/);
});

test('DENYLIST: 显式 allowDangerous 才追加 dangerousFlags（端到端观测 argv）', async () => {
  const r = new CliBackendRegistry([echoBackend({ id: 'danger', dangerousFlags: ['--yolo'] })]);
  // 未放权 → 不含 --yolo
  const safe = await r.run('danger', { prompt: 'hello' });
  assert.equal(safe.text, 'hello');
  assert.ok(!safe.text.includes('--yolo'));
  // 放权 → 追加 --yolo
  const risky = await r.run('danger', { prompt: 'hello', allowDangerous: true });
  assert.ok(risky.text.includes('--yolo'), `实得: ${risky.text}`);
});

// ── §5 执行器：argv 数组防注入 / 超时杀组 / 零静默 / ENOENT ─────────────────

test('run: prompt 走 argv 数组（shell:false），注入串原样传入不被解释', async () => {
  const r = new CliBackendRegistry([echoBackend()]);
  const evil = '"; exit 7; echo $(id) && rm -rf / -- #';
  const res = await r.run('echo', { prompt: evil });
  assert.equal(res.exitCode, 0);
  assert.equal(res.text, evil); // 整串当作单个 argv，无 shell 解释
  assert.equal(res.error, null);
});

test('run: 超时 → 杀进程组，exitCode=124，无孤儿进程', async () => {
  const r = new CliBackendRegistry([sleepBackend(60)]);
  const res = await r.run('sleepy', { prompt: 'x', timeoutMs: 300 });
  assert.equal(res.timedOut, true);
  assert.equal(res.exitCode, 124);
  assert.ok(res.pid, '应拿到 pid');
  assert.ok(/超时/.test(res.error || ''), `应含超时说明，实得: ${res.error}`);
  assert.equal(await waitDead(res.pid), true, `pid ${res.pid} 应已被杀（无孤儿）`);
});

test('run: 自定义 timeoutMs 覆盖后端默认值', async () => {
  const r = new CliBackendRegistry([sleepBackend(60)]);
  const t0 = Date.now();
  const res = await r.run('sleepy', { prompt: 'x', timeoutMs: 250 });
  assert.equal(res.timedOut, true);
  assert.ok(Date.now() - t0 < 5000, '应远早于后端 60s 默认值被杀');
});

test('run: 正常退出但零输出 → 明确 error，不静默', async () => {
  const r = new CliBackendRegistry([
    { id: 'quiet', label: 'Quiet', bin: 'true', timeoutMs: 5000, buildArgs: () => [], parseLine: () => null },
  ]);
  const res = await r.run('quiet', { prompt: 'x' });
  assert.equal(res.text, '');
  assert.equal(res.exitCode, 0);
  assert.ok(res.error && /无输出/.test(res.error), `实得 error: ${res.error}`);
});

test('run: 非零退出且无文本 → 明确 error（前置未就绪不得伪装成功）', async () => {
  const r = new CliBackendRegistry([
    {
      id: 'failn',
      label: 'FailN',
      bin: process.execPath,
      timeoutMs: 5000,
      buildArgs: () => ['-e', 'process.stderr.write("boom"); process.exit(3)'],
      parseLine: () => null,
    },
  ]);
  const res = await r.run('failn', { prompt: 'x' });
  assert.equal(res.exitCode, 3);
  assert.ok(res.error && /非零退出/.test(res.error) && /3/.test(res.error), `实得 error: ${res.error}`);
});

test('run: bin 不存在（ENOENT）→ reject，含"未安装"诊断', async () => {
  const r = new CliBackendRegistry([
    { id: 'ghostbin', label: 'Ghost', bin: 'definitely-not-a-real-bin-xyz', buildArgs: () => [], parseLine: () => null },
  ]);
  await assert.rejects(() => r.run('ghostbin', { prompt: 'x' }), /spawn 失败|未安装/);
});

test('run: stderr 摘要截断 ≤512B（零明文过大日志）', async () => {
  const r = new CliBackendRegistry([
    {
      id: 'noisy',
      label: 'Noisy',
      bin: process.execPath,
      timeoutMs: 5000,
      buildArgs: () => ['-e', 'process.stderr.write("E".repeat(4000))'],
      parseLine: () => null,
    },
  ]);
  const res = await r.run('noisy', { prompt: 'x' });
  assert.ok(res.stderr.length <= 512, `stderr 应 ≤512B，实得 ${res.stderr.length}`);
  assert.ok(res.stderr.length > 0);
});

test('run: exitCode 反映真实退出码', async () => {
  const r = new CliBackendRegistry([
    {
      id: 'fail7',
      label: 'Fail7',
      bin: process.execPath,
      timeoutMs: 5000,
      buildArgs: () => ['-e', 'process.exit(7)'],
      parseLine: () => null,
    },
  ]);
  const res = await r.run('fail7', { prompt: 'x' });
  assert.equal(res.exitCode, 7);
});
