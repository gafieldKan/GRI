/**
 * F-1 verifier 场景测试：JWKS 带 kid 的选钥、TTL 定期刷新、失败重试、诊断日志。
 *
 * 对应任务卡目标 3 的场景 ①–⑤：
 *   ① 带 kid token：kid 不匹配 → 重拉后通过
 *   ② TTL 到期 → 重拉（注入时钟 + 小 TTL）；TTL 内不发请求（C4）
 *   ③ 无 kid 旧 token → 仍通过
 *   ④ 验签失败 → 清缓存重拉重试一次成功
 *   ⑤ JWKS 拉取失败 → 明确抛错不静默（有诊断日志、请求 401、日志零敏感）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createPublicKey } from 'node:crypto';
import jsonwebtoken from 'jsonwebtoken';
import http from 'node:http';
import { createJwtVerifier } from '../src/index.js';

const { sign } = jsonwebtoken;
const ISSUER = 'gri-auth-center';
const KID_A = 'kid-aaaaaaaaaaaa';
const KID_B = 'kid-bbbbbbbbbbbb';

function makeKeys() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { privateKey, publicKey };
}

function jwkOf(publicKey, kid) {
  const jwk = createPublicKey(publicKey).export({ format: 'jwk' });
  return { kty: 'RSA', use: 'sig', alg: 'RS256', kid, ...jwk };
}

/** 签发测试 token；kid 传 undefined 则不带 kid（模拟旧版签发） */
function makeToken(privateKey, payload = {}, kid) {
  const opts = { algorithm: 'RS256', issuer: ISSUER, expiresIn: '1h' };
  if (kid) opts.header = { alg: 'RS256', typ: 'JWT', kid };
  return sign({ domain: 'food', external_id: 'food-user-x', ...payload }, privateKey, opts);
}

/** 起一个可控的 JWKS HTTP 桩，handler(req,res) 由测试自定义；返回 { server, url } */
function startJwksServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, () => {
      resolve({ server, url: `http://localhost:${server.address().port}/jwks` });
    });
  });
}

function serveJwks(payload) {
  return (req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(payload));
  };
}

function mockReqRes(token) {
  const req = { headers: token ? { authorization: `Bearer ${token}` } : {} };
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  return { req, res };
}

/** 跑一次中间件，返回 { called, req, res } */
async function run(requireAuth, token) {
  const { req, res } = mockReqRes(token);
  let called = false;
  await requireAuth()(req, res, () => {
    called = true;
  });
  return { called, req, res };
}

test('① 带 kid token：kid 不匹配缓存 → 重拉 JWKS 后通过', async () => {
  const A = makeKeys();
  const B = makeKeys();
  let served = { keys: [jwkOf(A.publicKey, KID_A)] };
  const { server, url } = await startJwksServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(served));
  });

  try {
    const requireAuth = createJwtVerifier({ issuer: ISSUER, jwksUrl: url });

    // 首请求：A token 命中并缓存 A
    const r1 = await run(requireAuth, makeToken(A.privateKey, { sub: 'a' }, KID_A));
    assert.equal(r1.called, true, 'A token 应通过');

    // 模拟轮钥：JWKS 改发 B
    served = { keys: [jwkOf(B.publicKey, KID_B)] };

    const r2 = await run(requireAuth, makeToken(B.privateKey, { sub: 'b' }, KID_B));
    assert.equal(r2.called, true, 'kid 不匹配应重拉 JWKS 后通过');
    assert.equal(r2.req.auth.sub, 'b');
    assert.equal(r2.req.auth.externalId, 'food-user-x');
  } finally {
    server.close();
  }
});

test('② TTL 到期 → 重拉；TTL 内不发请求（C4）', async () => {
  const A = makeKeys();
  let fetchCount = 0;
  const { server, url } = await startJwksServer((req, res) => {
    fetchCount += 1;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ keys: [jwkOf(A.publicKey, KID_A)] }));
  });

  let clock = 1_000_000;
  try {
    const requireAuth = createJwtVerifier({
      issuer: ISSUER,
      jwksUrl: url,
      jwksTtlMs: 100,
      now: () => clock,
    });
    const token = makeToken(A.privateKey, { sub: 'ttl' }, KID_A);

    const r1 = await run(requireAuth, token);
    assert.equal(r1.called, true);
    assert.equal(fetchCount, 1, '首次应拉取 JWKS');

    // TTL 内（+50ms）→ 快路径命中，不再拉取
    clock += 50;
    const r2 = await run(requireAuth, token);
    assert.equal(r2.called, true);
    assert.equal(fetchCount, 1, 'TTL 内不应再拉 JWKS');

    // TTL 到期（再 +60ms，累计 110 > 100）→ 同步刷新一次
    clock += 60;
    const r3 = await run(requireAuth, token);
    assert.equal(r3.called, true);
    assert.equal(fetchCount, 2, 'TTL 到期后首个请求应同步刷新 JWKS');
  } finally {
    server.close();
  }
});

test('②b TTL 配置读取：AUTH_JWKS_TTL_MS 环境变量生效', async () => {
  const A = makeKeys();
  let fetchCount = 0;
  const { server, url } = await startJwksServer((req, res) => {
    fetchCount += 1;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ keys: [jwkOf(A.publicKey, KID_A)] }));
  });

  const prev = process.env.AUTH_JWKS_TTL_MS;
  process.env.AUTH_JWKS_TTL_MS = '100';
  let clock = 0;
  try {
    // 不传 opts.jwksTtlMs，仅靠环境变量
    const requireAuth = createJwtVerifier({ issuer: ISSUER, jwksUrl: url, now: () => clock });
    const token = makeToken(A.privateKey, { sub: 'env-ttl' }, KID_A);

    await run(requireAuth, token);
    assert.equal(fetchCount, 1);
    clock = 1000; // 远超 100ms
    await run(requireAuth, token);
    assert.equal(fetchCount, 2, '环境变量 TTL 应生效');
  } finally {
    server.close();
    if (prev === undefined) delete process.env.AUTH_JWKS_TTL_MS;
    else process.env.AUTH_JWKS_TTL_MS = prev;
  }
});

test('③ 无 kid 旧 token → 仍通过（取第一把签名钥）', async () => {
  const A = makeKeys();
  let fetchCount = 0;
  const { server, url } = await startJwksServer((req, res) => {
    fetchCount += 1;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ keys: [jwkOf(A.publicKey, KID_A)] }));
  });

  try {
    const requireAuth = createJwtVerifier({ issuer: ISSUER, jwksUrl: url });
    const legacy = makeToken(A.privateKey, { sub: 'legacy' }); // 无 kid

    const r1 = await run(requireAuth, legacy);
    assert.equal(r1.called, true, '无 kid token 应通过');
    assert.equal(r1.req.auth.sub, 'legacy');

    const r2 = await run(requireAuth, legacy);
    assert.equal(r2.called, true);
    assert.equal(fetchCount, 1, '无 kid 第二次应走缓存');
  } finally {
    server.close();
  }
});

test('④ 验签失败 → 清缓存重拉重试一次成功', async () => {
  const A = makeKeys();
  const B = makeKeys();
  let n = 0;
  // 两把钥挂同一 kid：第一次返回错误钥(A)，第二次返回正确钥(B)
  const { server, url } = await startJwksServer((req, res) => {
    n += 1;
    const key = n === 1 ? jwkOf(A.publicKey, KID_A) : jwkOf(B.publicKey, KID_A);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ keys: [key] }));
  });

  try {
    const requireAuth = createJwtVerifier({ issuer: ISSUER, jwksUrl: url });
    // token 由 B 签、kid = KID_A（与桩首返的 A 钥同 kid 但签名不符）
    const token = makeToken(B.privateKey, { sub: 'retry' }, KID_A);

    const r = await run(requireAuth, token);
    assert.equal(r.called, true, '重试一次后应成功');
    assert.equal(r.req.auth.sub, 'retry');
    assert.equal(n, 2, '应恰好重拉一次');
  } finally {
    server.close();
  }
});

test('⑤ JWKS 拉取失败 → 明确抛错不静默（有诊断日志、401、日志零敏感）', async () => {
  const A = makeKeys();
  const warns = [];
  const origWarn = console.warn;
  console.warn = (...args) => warns.push(args.join(' '));
  try {
    // 指向必连不上的地址（1 端口）
    const requireAuth = createJwtVerifier({
      issuer: ISSUER,
      jwksUrl: 'http://127.0.0.1:1/jwks',
    });
    const token = makeToken(A.privateKey, { sub: 'unreachable' }, KID_A);

    const r = await run(requireAuth, token);
    assert.equal(r.called, false);
    assert.equal(r.res.statusCode, 401);
    assert.ok(
      warns.some((w) => w.includes('JWKS 拉取失败')),
      '拉取失败应产生诊断日志（不静默）',
    );
    // C3 日志零敏感：不得包含 token 明文
    assert.ok(
      warns.every((w) => !w.includes(token)),
      '诊断日志不得包含 token',
    );
  } finally {
    console.warn = origWarn;
  }
});

test('① 补充：TTL 内旧 kid 仍由缓存钥验证（缓存键与公钥一致，不误伤在途 token）', async () => {
  const A = makeKeys();
  const B = makeKeys();
  let served = { keys: [jwkOf(A.publicKey, KID_A)] };
  const { server, url } = await startJwksServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(served));
  });

  try {
    const requireAuth = createJwtVerifier({ issuer: ISSUER, jwksUrl: url });
    await run(requireAuth, makeToken(A.privateKey, { sub: 'a' }, KID_A));

    // JWKS 改发 B，但 TTL 未到 → 缓存中 A 钥仍在，A token 仍应通过
    served = { keys: [jwkOf(B.publicKey, KID_B)] };
    const r = await run(requireAuth, makeToken(A.privateKey, { sub: 'a2' }, KID_A));
    assert.equal(r.called, true, 'TTL 内缓存钥仍应验证在途 token');
    assert.equal(r.req.auth.sub, 'a2');
  } finally {
    server.close();
  }
});
