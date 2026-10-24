import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createAgentClient, AgentSdkError, AGENT_API_PREFIX, AGENT_API_VERSION } from '../src/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE = 'https://gri.example.test';

/** 记录型桩 fetch：把每次调用({url,method,headers,body})留在 calls，按 route 决定响应。 */
function makeStubFetch(handler) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const rec = {
      url,
      method: init.method,
      headers: init.headers ?? {},
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      signal: init.signal,
    };
    calls.push(rec);
    return handler(rec);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

/** 造一个最小 Response 替身（只用到 status/statusText/text）。 */
function res(status, bodyObj, statusText = '') {
  return {
    status,
    statusText,
    async text() {
      return bodyObj === undefined ? '' : typeof bodyObj === 'string' ? bodyObj : JSON.stringify(bodyObj);
    },
  };
}

const okEnvelope = (data) => ({ v: AGENT_API_VERSION, success: true, data });

// ── §1 基址/前缀/鉴权头注入 ────────────────────────────────────────────────
test('§1.1 getMe 打到 /api/v1/agent/me 且带 Authorization: Bearer', async () => {
  const fetchImpl = makeStubFetch(() => res(200, okEnvelope({ success: true, entityId: 'u1', tools: ['a'] })));
  const agent = createAgentClient({ baseUrl: BASE, token: 'tk-abc', fetch: fetchImpl });
  const me = await agent.getMe();
  assert.equal(me.entityId, 'u1');
  assert.deepEqual(me.tools, ['a']);
  const c = fetchImpl.calls[0];
  assert.equal(c.url, `${BASE}${AGENT_API_PREFIX}/me`);
  assert.equal(c.method, 'GET');
  assert.equal(c.headers.Authorization, 'Bearer tk-abc');
});

test('§1.2 baseUrl 末尾斜杠被归一（不多出 //）', async () => {
  const fetchImpl = makeStubFetch(() => res(200, okEnvelope({ success: true })));
  const agent = createAgentClient({ baseUrl: `${BASE}/`, token: 'tk', fetch: fetchImpl });
  assert.equal(agent.baseUrl, BASE);
  await agent.listBackends();
  assert.equal(fetchImpl.calls[0].url, `${BASE}${AGENT_API_PREFIX}/delegate/backends`);
});

test('§1.3 四个方法的路径与动词', async () => {
  const fetchImpl = makeStubFetch((rec) => {
    if (rec.url.endsWith('/me')) return res(200, okEnvelope({ success: true }));
    if (rec.url.endsWith('/me/diagnosis')) return res(200, okEnvelope({ success: true, phase: 'diagnosis' }));
    if (rec.url.endsWith('/me/message')) return res(201, okEnvelope({ success: true, message: 'ok' }));
    if (rec.url.endsWith('/delegate/backends')) return res(200, okEnvelope({ backends: [{ id: 'codex' }] }));
    return res(404, { v: 1, success: false, error: { code: 'NOT_FOUND', message: 'x' } });
  });
  const agent = createAgentClient({ baseUrl: BASE, token: 'tk', fetch: fetchImpl });
  await agent.getMe();
  await agent.getDiagnosis();
  await agent.sendMessage('hi');
  const backends = await agent.listBackends();
  assert.deepEqual(backends, [{ id: 'codex' }]);
  assert.deepEqual(
    fetchImpl.calls.map((c) => `${c.method} ${c.url.slice(BASE.length)}`),
    [
      `GET ${AGENT_API_PREFIX}/me`,
      `GET ${AGENT_API_PREFIX}/me/diagnosis`,
      `POST ${AGENT_API_PREFIX}/me/message`,
      `GET ${AGENT_API_PREFIX}/delegate/backends`,
    ],
  );
});

test('§1.4 sendMessage 透传 routeKey；未给则不发该字段', async () => {
  const fetchImpl = makeStubFetch(() => res(201, okEnvelope({ success: true })));
  const agent = createAgentClient({ baseUrl: BASE, token: 'tk', fetch: fetchImpl });
  await agent.sendMessage('q1', { routeKey: 'entity=u1' });
  await agent.sendMessage('q2');
  assert.equal(fetchImpl.calls[0].headers['Content-Type'], 'application/json');
  assert.deepEqual(fetchImpl.calls[0].body, { content: 'q1', routeKey: 'entity=u1' });
  assert.deepEqual(fetchImpl.calls[1].body, { content: 'q2' });
});

// ── §2 信封解包 ────────────────────────────────────────────────────────────
test('§2.1 成功取 data（不把信封壳暴露给调用方）', async () => {
  const fetchImpl = makeStubFetch(() => res(200, okEnvelope({ success: true, entityId: 'u9', memoryDigest: { facts: 2 } })));
  const agent = createAgentClient({ baseUrl: BASE, token: 'tk', fetch: fetchImpl });
  const me = await agent.getMe();
  assert.equal(me.v, undefined);
  assert.equal(me.entityId, 'u9');
  assert.deepEqual(me.memoryDigest, { facts: 2 });
});

test('§2.2 listBackends 无后端 → 空数组（不抛）', async () => {
  const fetchImpl = makeStubFetch(() => res(200, okEnvelope({ backends: [] })));
  const agent = createAgentClient({ baseUrl: BASE, token: 'tk', fetch: fetchImpl });
  assert.deepEqual(await agent.listBackends(), []);
});

test('§2.3 2xx 但 success:false → 抛 AGENT_ERROR（不吞错）', async () => {
  const fetchImpl = makeStubFetch(() => res(200, { v: 1, success: false, error: { code: 'AGENT_DOWN', message: '模型不可用' } }));
  const agent = createAgentClient({ baseUrl: BASE, token: 'tk', fetch: fetchImpl });
  await assert.rejects(() => agent.getMe(), (err) => {
    assert.ok(err instanceof AgentSdkError);
    assert.equal(err.code, 'AGENT_DOWN');
    assert.equal(err.message, '模型不可用');
    return true;
  });
});

// ── §3 错误语义（非 2xx 结构化）────────────────────────────────────────────
test('§3.1 400 → 抛结构化错误（status/code/url/body 齐备）', async () => {
  const fetchImpl = makeStubFetch(() =>
    res(400, { v: 1, success: false, error: { code: 'INVALID_CONTENT', message: 'content 必填且非空' } }, 'Bad Request'),
  );
  const agent = createAgentClient({ baseUrl: BASE, token: 'tk', fetch: fetchImpl });
  await assert.rejects(() => agent.sendMessage('x'), (err) => {
    assert.ok(err instanceof AgentSdkError);
    assert.equal(err.code, 'INVALID_CONTENT');
    assert.equal(err.status, 400);
    assert.equal(err.statusText, 'Bad Request');
    assert.equal(err.url, `${BASE}${AGENT_API_PREFIX}/me/message`);
    assert.deepEqual(err.body, { v: 1, success: false, error: { code: 'INVALID_CONTENT', message: 'content 必填且非空' } });
    return true;
  });
});

test('§3.2 401 无 body.error.code → code=HTTP_ERROR', async () => {
  const fetchImpl = makeStubFetch(() => res(401, { message: 'Unauthorized' }, 'Unauthorized'));
  const agent = createAgentClient({ baseUrl: BASE, token: 'tk', fetch: fetchImpl });
  await assert.rejects(() => agent.getMe(), (err) => {
    assert.equal(err.code, 'HTTP_ERROR');
    assert.equal(err.status, 401);
    return true;
  });
});

test('§3.3 非 JSON 体错误也不崩（body.raw 兜底）', async () => {
  const fetchImpl = makeStubFetch(() => res(502, '<html>bad gateway</html>', 'Bad Gateway'));
  const agent = createAgentClient({ baseUrl: BASE, token: 'tk', fetch: fetchImpl });
  await assert.rejects(() => agent.getMe(), (err) => {
    assert.equal(err.status, 502);
    assert.deepEqual(err.body, { raw: '<html>bad gateway</html>' });
    return true;
  });
});

test('§3.4 网络异常 → code=NETWORK', async () => {
  const fetchImpl = async () => {
    throw new TypeError('fetch failed');
  };
  const agent = createAgentClient({ baseUrl: BASE, token: 'tk', fetch: fetchImpl });
  await assert.rejects(() => agent.getMe(), (err) => {
    assert.equal(err.code, 'NETWORK');
    return true;
  });
});

test('§3.5 超时 → code=TIMEOUT（AbortController 生效）', async () => {
  const fetchImpl = (_url, init) =>
    new Promise((_resolve, reject) => {
      assert.ok(init.signal, '应传入 AbortSignal');
      init.signal.addEventListener('abort', () => {
        const e = new Error('aborted');
        e.name = 'AbortError';
        reject(e);
      });
    });
  const agent = createAgentClient({ baseUrl: BASE, token: 'tk', fetch: fetchImpl, timeoutMs: 20 });
  await assert.rejects(() => agent.getMe(), (err) => {
    assert.equal(err.code, 'TIMEOUT');
    assert.match(err.message, /超时/);
    return true;
  });
});

// ── §4 入参校验（fail-fast，且不发请求）────────────────────────────────────
test('§4.1 缺 baseUrl / token → INVALID_ARGUMENT', () => {
  assert.throws(() => createAgentClient({ token: 'tk' }), (e) => e.code === 'INVALID_ARGUMENT');
  assert.throws(() => createAgentClient({ baseUrl: BASE }), (e) => e.code === 'INVALID_ARGUMENT');
  assert.throws(() => createAgentClient({ baseUrl: BASE, token: '   ' }), (e) => e.code === 'INVALID_ARGUMENT');
});

test('§4.2 空 content → INVALID_ARGUMENT 且不发请求', async () => {
  const fetchImpl = makeStubFetch(() => res(201, okEnvelope({ success: true })));
  const agent = createAgentClient({ baseUrl: BASE, token: 'tk', fetch: fetchImpl });
  await assert.rejects(() => agent.sendMessage('  '), (e) => e.code === 'INVALID_ARGUMENT');
  assert.equal(fetchImpl.calls.length, 0);
});

// ── §5 边界合规：不依赖底座 / 零密钥 ───────────────────────────────────────
test('§5.1 package.json dependencies 不含 @gri/agent-core（SDK 只讲 HTTP）', () => {
  const pkg = JSON.parse(readFileSync(join(HERE, '..', 'package.json'), 'utf8'));
  assert.equal(pkg.name, '@gri/agent-sdk');
  assert.equal(pkg.type, 'module');
  assert.deepEqual(pkg.dependencies, {});
  const all = { ...(pkg.dependencies ?? {}), ...(pkg.peerDependencies ?? {}), ...(pkg.optionalDependencies ?? {}) };
  assert.ok(!Object.keys(all).includes('@gri/agent-core'), 'SDK 不得依赖 @gri/agent-core');
  assert.ok(Array.isArray(pkg.files) && pkg.files.length > 0, 'files 发布面必填');
  assert.ok(pkg.publishConfig && pkg.publishConfig.registry, 'publishConfig.registry 必填');
});

test('§5.2 src 不 import @gri/agent-core，且无密钥明文', () => {
  const src = readFileSync(join(HERE, '..', 'src', 'index.js'), 'utf8');
  // 只认真正的 import/require 语句（注释里提到包名是允许的）
  assert.ok(!/^\s*(import|export)\b[^\n]*['"]@gri\/agent-core['"]/m.test(src), 'src 不得 import 底座');
  assert.ok(!/require\(\s*['"]@gri\/agent-core['"]\s*\)/.test(src), 'src 不得 require 底座');
  assert.ok(!src.includes('process.env'), 'SDK 不读 env');
  assert.ok(!/nvapi-|sk-[A-Za-z0-9]{20}/.test(src), 'src 不得含密钥明文');
});

// ── §6 B-4：run 查询面（listRuns / getRun）─────────────────────────────────
test('§6.1 listRuns 打到 /delegate/runs（limit 透传为 query），取 data.runs', async () => {
  const fetchImpl = makeStubFetch(() => res(200, okEnvelope({ runs: [{ run_id: 'r1', status: 'done' }] })));
  const agent = createAgentClient({ baseUrl: BASE, token: 'tk', fetch: fetchImpl });
  const runs = await agent.listRuns({ limit: 5 });
  assert.deepEqual(runs, [{ run_id: 'r1', status: 'done' }]);
  assert.equal(fetchImpl.calls[0].method, 'GET');
  assert.equal(fetchImpl.calls[0].url, `${BASE}${AGENT_API_PREFIX}/delegate/runs?limit=5`);
});

test('§6.2 listRuns 无 limit / 无 run → 空数组（不抛）', async () => {
  const fetchImpl = makeStubFetch(() => res(200, okEnvelope({ runs: [] })));
  const agent = createAgentClient({ baseUrl: BASE, token: 'tk', fetch: fetchImpl });
  assert.deepEqual(await agent.listRuns(), []);
  assert.equal(fetchImpl.calls[0].url, `${BASE}${AGENT_API_PREFIX}/delegate/runs`);
});

test('§6.3 getRun 打到 /delegate/runs/:id 并取 data.run', async () => {
  const fetchImpl = makeStubFetch(() => res(200, okEnvelope({ run: { run_id: 'r1', status: 'failed', error_code: 'TIMEOUT' } })));
  const agent = createAgentClient({ baseUrl: BASE, token: 'tk', fetch: fetchImpl });
  const run = await agent.getRun('r1');
  assert.equal(run.run_id, 'r1');
  assert.equal(run.error_code, 'TIMEOUT');
  assert.equal(fetchImpl.calls[0].url, `${BASE}${AGENT_API_PREFIX}/delegate/runs/r1`);
});

test('§6.4 getRun 他人/不存在（404 RUN_NOT_FOUND）→ 抛结构化错误（不吞）', async () => {
  const fetchImpl = makeStubFetch(() => res(404, { v: 1, success: false, error: { code: 'RUN_NOT_FOUND', message: 'run 不存在或无权访问' } }, 'Not Found'));
  const agent = createAgentClient({ baseUrl: BASE, token: 'tk', fetch: fetchImpl });
  await assert.rejects(() => agent.getRun('ghost'), (err) => {
    assert.ok(err instanceof AgentSdkError);
    assert.equal(err.code, 'RUN_NOT_FOUND');
    assert.equal(err.status, 404);
    return true;
  });
});

test('§6.5 getRun 空 runId → INVALID_ARGUMENT 且不发请求', async () => {
  const fetchImpl = makeStubFetch(() => res(200, okEnvelope({ run: null })));
  const agent = createAgentClient({ baseUrl: BASE, token: 'tk', fetch: fetchImpl });
  await assert.rejects(() => agent.getRun('   '), (e) => e.code === 'INVALID_ARGUMENT');
  assert.equal(fetchImpl.calls.length, 0);
});
