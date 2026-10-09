import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createPublicKey } from 'node:crypto';
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

function mockReqRes(token) {
  const req = { headers: token ? { authorization: `Bearer ${token}` } : {} };
  const res = {
    statusCode: 200,
    status(c) { this.statusCode = c; return this; },
    json() { return this; },
  };
  return { req, res };
}

test('F-1 回归：JWKS 模式下同一 kid 的第二次请求不再拉取公钥（缓存命中）', async () => {
  const jwk = createPublicKey(publicKey).export({ format: 'jwk' });
  const jwks = { keys: [{ kty: 'RSA', use: 'sig', alg: 'RS256', kid: ISSUER, ...jwk }] };
  let hits = 0;
  const server = http.createServer((req, res) => {
    hits++;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(jwks));
  });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;

  try {
    const requireAuth = createJwtVerifier({ issuer: ISSUER, jwksUrl: `http://localhost:${port}/jwks` });
    const token = sign({ sub: 'identity-uuid', external_id: 'u1' }, privateKey, {
      algorithm: 'RS256', issuer: ISSUER, expiresIn: '1h',
    });

    // 两次同 kid 请求
    for (let i = 0; i < 2; i++) {
      const { req, res } = mockReqRes(token);
      let called = false;
      await requireAuth()(req, res, () => { called = true; });
      assert.equal(called, true, `第 ${i + 1} 次请求应通过`);
      assert.equal(req.auth.externalId, 'u1');
    }

    // 修复前：hits === 2（每请求一拉）；修复后：hits === 1（首拉后命中缓存）
    assert.equal(hits, 1, '同 kid 第二次请求不应再次拉取 JWKS（缓存必须命中）');
  } finally {
    server.close();
  }
});

test('F-1 回归：kid 轮换后重拉一次以取得新公钥（缓存失效语义保留）', async () => {
  // 两套密钥对，JWKS 先返回 A、切换后返回 B，验证轮换被感知
  const a = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  const b = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  const jwksFor = (kp, kid) => ({ keys: [{ kty: 'RSA', use: 'sig', alg: 'RS256', kid, ...createPublicKey(kp.publicKey).export({ format: 'jwk' }) }] });
  let current = jwksFor(a, 'kid-A');
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(current));
  });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;

  try {
    const requireAuth = createJwtVerifier({ issuer: ISSUER, jwksUrl: `http://localhost:${port}/jwks` });
    const tokenA = sign({ sub: 's', external_id: 'u1' }, a.privateKey, { algorithm: 'RS256', issuer: ISSUER, expiresIn: '1h', keyid: 'kid-A' });
    const tokenB = sign({ sub: 's', external_id: 'u1' }, b.privateKey, { algorithm: 'RS256', issuer: ISSUER, expiresIn: '1h', keyid: 'kid-B' });

    let called = false;
    const r1 = mockReqRes(tokenA);
    await requireAuth()(r1.req, r1.res, () => { called = true; });
    assert.equal(called, true, 'kid-A token 应通过');

    // 轮换 JWKS 到 B；kid-B token 应触发重拉并通过
    current = jwksFor(b, 'kid-B');
    const r2 = mockReqRes(tokenB);
    called = false; await requireAuth()(r2.req, r2.res, () => { called = true; });
    assert.equal(called, true, '轮换后 kid-B token 应通过（缓存按 kid 失效重拉）');
  } finally {
    server.close();
  }
});
