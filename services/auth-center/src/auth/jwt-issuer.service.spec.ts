import { JwtIssuerService } from './jwt-issuer.service';

/**
 * 单元测试：验证 RS256 签发/校验/JWKS 导出的正确性，无需数据库。
 * 走开发兜底分支（未注入密钥 → 临时 RSA-2048）。
 */
describe('JwtIssuerService', () => {
  let svc: JwtIssuerService;

  beforeEach(() => {
    // 清空密钥注入，确保走临时密钥兜底分支
    delete process.env.JWT_PRIVATE_KEY;
    delete process.env.JWT_PUBLIC_KEY;
    delete process.env.JWT_PRIVATE_KEY_FILE;
    delete process.env.JWT_PUBLIC_KEY_FILE;
    svc = new JwtIssuerService();
  });

  it('签发的 token 可用公钥校验，payload 字段完整', () => {
    const token = svc.signAccess({
      sub: 'uuid-123',
      domain: 'food',
      username: 'alice',
      name: null,
      roles: [],
    });
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3); // JWT 三段

    const payload = svc.verifyAccess(token) as Record<string, unknown>;
    expect(payload.sub).toBe('uuid-123');
    expect(payload.domain).toBe('food');
    expect(payload.username).toBe('alice');
    expect(payload.iss).toBe('gri-auth-center');
  });

  it('篡改后的 token 校验失败', () => {
    const token = svc.signAccess({ sub: 'uuid-456', domain: 'food' });
    // 篡改 payload 段（第二段），签名必然失效
    const [h, p, s] = token.split('.');
    const tamperedPayload = Buffer.from(
      JSON.stringify({ sub: 'uuid-999', domain: 'food' }),
    ).toString('base64url');
    const tampered = `${h}.${tamperedPayload}.${s}`;
    expect(() => svc.verifyAccess(tampered)).toThrow();
  });

  it('错误公钥无法校验本服务签发的 token', () => {
    const token = svc.signAccess({ sub: 'uuid-1', domain: 'food' });
    // 用一个独立密钥对校验，应失败
    const { generateKeyPairSync } = require('crypto');
    const { publicKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const jwt = require('jsonwebtoken');
    expect(() =>
      jwt.verify(token, publicKey, { algorithms: ['RS256'] }),
    ).toThrow();
  });

  it('JWK 导出为合法 RSA 公钥，可与私钥签名互通', () => {
    const token = svc.signAccess({ sub: 'uuid-2', domain: 'food' });
    const jwk = svc.getJwk();
    expect(jwk.kty).toBe('RSA');
    expect(jwk.alg).toBe('RS256');
    expect(jwk.n).toBeDefined();
    expect(jwk.e).toBeDefined();

    // 用导出的 JWK 重建公钥并校验 token
    const jose = { createPublicKey: require('crypto').createPublicKey };
    const pub = jose.createPublicKey({
      key: { kty: 'RSA', n: jwk.n, e: jwk.e },
      format: 'jwk',
    });
    const { verify } = require('jsonwebtoken');
    const payload = verify(token, pub, { algorithms: ['RS256'] });
    expect((payload as Record<string, unknown>).sub).toBe('uuid-2');
  });

  it('构造时不注入密钥则生成 PKCS8/SPKI PEM', () => {
    expect(svc.getPrivateKeyPem()).toMatch(/BEGIN PRIVATE KEY/);
    expect(svc.getPublicKeyPem()).toMatch(/BEGIN PUBLIC KEY/);
  });
});