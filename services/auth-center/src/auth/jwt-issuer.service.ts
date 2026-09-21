import { Injectable } from '@nestjs/common';
import {
  generateKeyPairSync,
  createPublicKey,
} from 'crypto';
import { sign, verify, SignOptions, VerifyOptions } from 'jsonwebtoken';
import { loadConfig } from '../config/config';

/**
 * JWT 签发/校验封装（RS256 非对称）。
 * 私钥只在本服务；公钥通过 JWKS 端点公开给业务后端离线校验。
 *
 * 采用底层 jsonwebtoken 直接签名/校验，而非 @nestjs/jwt 的 JwtService——
 * 后者面向单一共享 secret 设计，RS256 若混用 module 注册的占位 secret 会
 * 在 sign 时误判 "secretOrPrivateKey must be an asymmetric key"。
 *
 * 开发兜底：若环境未注入 JWT_PRIVATE_KEY/JWT_PUBLIC_KEY，则生成临时 RSA-2048 密钥对。
 * 生产必须通过 k8s secret 注入持久密钥（否则重启后已签发 token 失效）。
 */
@Injectable()
export class JwtIssuerService {
  private readonly privateKey: string;
  private readonly publicKey: string;
  private readonly accessTtl: number;
  private readonly issuer: string;

  constructor() {
    const cfg = loadConfig().jwt;
    let priv = cfg.privateKey;
    let pub = cfg.publicKey;

    if (!priv || !pub) {
      // 开发兜底：临时密钥对（仅本地）
      const { privateKey, publicKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      priv = privateKey;
      pub = publicKey;
      // eslint-disable-next-line no-console
      console.warn(
        '[auth-center] 未注入 JWT 密钥，已生成临时 RSA 密钥（仅开发用）。生产请注入 JWT_PRIVATE_KEY/JWT_PUBLIC_KEY。',
      );
    }

    this.privateKey = priv;
    this.publicKey = pub;
    this.accessTtl = cfg.accessTokenTtl;
    this.issuer = cfg.issuer;
  }

  /** 签发 access token（RS256） */
  signAccess(payload: {
    sub: string;
    domain: string;
    username?: string | null;
    name?: string | null;
    external_id?: string | null;
    roles?: string[];
  }): string {
    const options: SignOptions = {
      algorithm: 'RS256',
      expiresIn: this.accessTtl,
      issuer: this.issuer,
    };
    return sign(payload, this.privateKey, options);
  }

  /** 校验 access token（RS256 公钥），返回 payload 或抛错 */
  verifyAccess(token: string) {
    const options: VerifyOptions = {
      algorithms: ['RS256'],
      issuer: this.issuer,
    };
    return verify(token, this.publicKey, options);
  }

  /** 返回公钥 PEM（JWKS 用） */
  getPublicKeyPem(): string {
    return this.publicKey;
  }

  /** 返回私钥 PEM（仅供 refresh 轮转等内部使用） */
  getPrivateKeyPem(): string {
    return this.privateKey;
  }

  /** 从 PEM 导出 JWK（RSA n/e），供 JWKS 端点 */
  getJwk() {
    const key = createPublicKey(this.publicKey);
    const jwk = key.export({ format: 'jwk' });
    return {
      kty: 'RSA',
      use: 'sig',
      alg: 'RS256',
      kid: this.issuer,
      ...jwk,
    };
  }
}