import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import jsonwebtoken from 'jsonwebtoken';
import http from 'node:http';
import { createJwtVerifier } from '../src/index.js';

const { sign } = jsonwebtoken;

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const ISSUER = 'gri-auth-center';

function makeToken(payload = {}) {
  return sign(
    {
      domain: 'food',
      external_id: 'food-user-123',
      ...payload,
    },
    privateKey,
    { algorithm: 'RS256', issuer: ISSUER, expiresIn: '1h' },
  );
}

// 模拟 req/res/next 的 Express 三元组
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

test('静态 PEM 注入：合法 token 通过并注入 req.auth（含 externalId）', async () => {
  const requireAuth = createJwtVerifier({ issuer: ISSUER, publicKey });
  const token = makeToken({ sub: 'identity-uuid-1' });
  const { req, res } = mockReqRes(token);
  let called = false;

  await requireAuth()(req, res, () => {
    called = true;
  });

  assert.equal(called, true);
  assert.equal(req.auth.sub, 'identity-uuid-1');
  assert.equal(req.auth.externalId, 'food-user-123');
  assert.equal(req.auth.domain, 'food');
  assert.equal(req.auth.iss, ISSUER);
});

test('缺少 Bearer header → 401', async () => {
  const requireAuth = createJwtVerifier({ issuer: ISSUER, publicKey });
  const { req, res } = mockReqRes(null);
  let called = false;

  await requireAuth()(req, res, () => {
    called = true;
  });

  assert.equal(called, false);
  assert.equal(res.statusCode, 401);
});

test('篡改 token → 401 且不注入 auth', async () => {
  const requireAuth = createJwtVerifier({ issuer: ISSUER, publicKey });
  const token = makeToken({ sub: 'identity-uuid-2' });
  const [h, p, s] = token.split('.');
  const tampered = `${h}.${Buffer.from(JSON.stringify({ sub: 'x' })).toString('base64url')}.${s}`;
  const { req, res } = mockReqRes(tampered);
  let called = false;

  await requireAuth()(req, res, () => {
    called = true;
  });

  assert.equal(called, false);
  assert.equal(res.statusCode, 401);
  assert.equal(req.auth, undefined);
});

test('错误 iss 的 token → 401', async () => {
  const requireAuth = createJwtVerifier({ issuer: ISSUER, publicKey });
  const badIssuer = sign({ sub: 'identity-uuid-3' }, privateKey, {
    algorithm: 'RS256',
    issuer: 'someone-else',
    expiresIn: '1h',
  });
  const { req, res } = mockReqRes(badIssuer);
  let called = false;

  await requireAuth()(req, res, () => {
    called = true;
  });

  assert.equal(called, false);
  assert.equal(res.statusCode, 401);
});

test('optional: true 时无 Bearer 也放行且不注入 auth', async () => {
  const requireAuth = createJwtVerifier({ issuer: ISSUER, publicKey });
  const { req, res } = mockReqRes(null);
  let called = false;

  await requireAuth({ optional: true })(req, res, () => {
    called = true;
  });

  assert.equal(called, true);
  assert.equal(req.auth, undefined);
});

test('JWKS URL 拉取：动态获取公钥并校验', async () => {
  // 起一个本地 JWKS HTTP 服务，返回公钥 JWK
  const { createPublicKey } = await import('node:crypto');
  const jwk = createPublicKey(publicKey).export({ format: 'jwk' });
  const jwks = {
    keys: [{ kty: 'RSA', use: 'sig', alg: 'RS256', kid: ISSUER, ...jwk }],
  };

  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(jwks));
  });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;

  try {
    const requireAuth = createJwtVerifier({
      issuer: ISSUER,
      jwksUrl: `http://localhost:${port}/jwks`,
    });
    const token = makeToken({ sub: 'identity-uuid-4' });
    const { req, res } = mockReqRes(token);
    let called = false;

    await requireAuth()(req, res, () => {
      called = true;
    });

    assert.equal(called, true);
    assert.equal(req.auth.sub, 'identity-uuid-4');
  } finally {
    server.close();
  }
});