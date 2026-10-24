import { createHash, createPublicKey } from 'crypto';
import { JwtIssuerService, deriveKeyId } from './jwt-issuer.service';

/** 解出 JWT 的 JOSE header（第一段） */
function decodeHeader(token: string): Record<string, unknown> {
  const seg = token.split('.')[0];
  return JSON.parse(Buffer.from(seg, 'base64url').toString('utf8'));
}

function makeKeyPair(): { privateKey: string; publicKey: string } {
  const { generateKeyPairSync } = require('crypto');
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { privateKey, publicKey };
}

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

/**
 * F-1：token header 带 kid（公钥指纹），与 JWKS.kid 同源。
 * ⑥ 签发 token header 含 kid；⑦ header.kid === JWKS.kid；⑧ 指纹纯函数性质（轮钥即换）。
 */
describe('JwtIssuerService —— F-1 kid 指纹', () => {
  let svc: JwtIssuerService;

  beforeEach(() => {
    delete process.env.JWT_PRIVATE_KEY;
    delete process.env.JWT_PUBLIC_KEY;
    delete process.env.JWT_PRIVATE_KEY_FILE;
    delete process.env.JWT_PUBLIC_KEY_FILE;
    svc = new JwtIssuerService();
  });

  it('⑥ 签发 token 的 JOSE header 含 kid（16 hex 指纹），且 payload/iss 不变', () => {
    const token = svc.signAccess({ sub: 'uuid-kid', domain: 'food' });
    const header = decodeHeader(token);
    expect(header.alg).toBe('RS256');
    expect(typeof header.kid).toBe('string');
    expect(header.kid).toMatch(/^[0-9a-f]{16}$/);

    // C2：payload/iss/exp 语义不变
    const payload = svc.verifyAccess(token) as Record<string, unknown>;
    expect(payload.sub).toBe('uuid-kid');
    expect(payload.iss).toBe('gri-auth-center');
    expect(payload.exp).toBeDefined();
  });

  it('⑦ header.kid === JWKS.kid（签发与公钥发布同源）', () => {
    const token = svc.signAccess({ sub: 'uuid-kid2', domain: 'food' });
    const header = decodeHeader(token);
    expect(header.kid).toBe(svc.getJwk().kid);
    // 且 kid 不再恒为 issuer 串
    expect(header.kid).not.toBe('gri-auth-center');
  });

  it('⑧ 指纹纯函数：由公钥 n 的 sha256 前 16 hex 派生，轮钥即换', () => {
    const a = makeKeyPair();
    const b = makeKeyPair();

    // 同公钥恒得同 kid（确定性）
    expect(deriveKeyId(a.publicKey)).toBe(deriveKeyId(a.publicKey));
    // 轮换密钥 → kid 变化
    expect(deriveKeyId(a.publicKey)).not.toBe(deriveKeyId(b.publicKey));

    // 与「JWK n 的 sha256 前 16 hex」定义一致
    const n = (createPublicKey(a.publicKey).export({ format: 'jwk' }) as { n: string }).n;
    const expected = createHash('sha256').update(n, 'utf8').digest('hex').slice(0, 16);
    expect(deriveKeyId(a.publicKey)).toBe(expected);

    // 派生 kid 与当前服务实例 JWKS 同源
    expect(deriveKeyId(svc.getPublicKeyPem())).toBe(svc.getJwk().kid);
  });

  it('兼容：不传 kid 的旧 token 仍可用 verifyAccess 校验', () => {
    // 用当前服务私钥手工签一枚无 kid 的 token（模拟旧版本签发）
    const jwt = require('jsonwebtoken');
    const legacy = jwt.sign({ sub: 'legacy', domain: 'food' }, svc.getPrivateKeyPem(), {
      algorithm: 'RS256',
      issuer: 'gri-auth-center',
      expiresIn: 900,
    });
    expect(decodeHeader(legacy).kid).toBeUndefined();
    const payload = svc.verifyAccess(legacy) as Record<string, unknown>;
    expect(payload.sub).toBe('legacy');
  });
});