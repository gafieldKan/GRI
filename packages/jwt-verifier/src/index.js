/**
 * @gri/jwt-verifier —— GRI 业务后端统一 JWT 公钥校验中间件。
 *
 * 设计目标：
 *  - RS256 无状态校验：只验签名 + iss + exp，不查任何库。
 *  - 公钥来源二选一（优先级从高到低）：
 *    1. 直接注入 PEM（AUTH_PUBLIC_KEY 或 AUTH_PUBLIC_KEY_FILE）：生产 k8s secret，最健壮。
 *    2. 从 JWKS 端点拉取（AUTH_JWKS_URL，默认 http://localhost:3004/auth/jwks）：
 *       动态、免 secret；首次请求惰性拉取并缓存，密钥轮换后通过 kid 不匹配触发重拉。
 *  - 校验通过后把 payload 挂到 req.auth：
 *      { sub, domain, externalId, username, name, roles, iat, exp, iss }
 *    business 后端据 externalId 定位业务实体（原 users.id / students.id），保持无状态。
 *
 * 用法（Express）：
 *   import { createJwtVerifier } from '@gri/jwt-verifier'
 *   const requireAuth = createJwtVerifier({
 *     issuer: 'gri-auth-center',
 *     publicKey: process.env.AUTH_PUBLIC_KEY,          // 可选
 *     jwksUrl: process.env.AUTH_JWKS_URL,              // 可选
 *   })
 *   app.get('/protected', requireAuth(), (req, res) => { ... req.auth.sub ... })
 */
import jsonwebtoken from 'jsonwebtoken';
import { readFileSync } from 'node:fs';
import { createPublicKey } from 'node:crypto';

const { verify } = jsonwebtoken;
const DEFAULT_ISSUER = 'gri-auth-center';

/**
 * 将 JWKS 中的 RSA JWK（n/e）转为 PEM 公钥，供 jsonwebtoken verify 使用。
 * 无依赖，用 node:crypto。
 */
function jwkToPem(jwk) {
  const pub = createPublicKey({
    key: { kty: jwk.kty, n: jwk.n, e: jwk.e },
    format: 'jwk',
  });
  return pub.export({ type: 'spki', format: 'pem' });
}

function readPemFromEnv() {
  if (process.env.AUTH_PUBLIC_KEY) return process.env.AUTH_PUBLIC_KEY;
  if (process.env.AUTH_PUBLIC_KEY_FILE) {
    return readFileSync(process.env.AUTH_PUBLIC_KEY_FILE, 'utf8');
  }
  return '';
}

/**
 * 创建 JWT 校验中间件工厂。
 * @param {object} [opts]
 * @param {string} [opts.issuer='gri-auth-center'] 期望的 iss
 * @param {string} [opts.publicKey] PEM 公钥（优先，绕过 JWKS 拉取）
 * @param {string} [opts.jwksUrl] JWKS 端点（缺省 http://localhost:3004/auth/jwks）
 * @returns {function} Express middleware `(req,res,next)`，校验成功注入 req.auth
 */
export function createJwtVerifier(opts = {}) {
  const issuer = opts.issuer ?? DEFAULT_ISSUER;
  const jwksUrl = opts.jwksUrl ?? 'http://localhost:3004/auth/jwks';

  // 缓存：优先 PEM 注入；否则按 kid 缓存 JWK→PEM
  const cache = { keyId: null, pem: null };

  // 注入的静态 PEM（若提供，永不拉 JWKS）
  const staticPem = opts.publicKey ?? readPemFromEnv();
  if (staticPem) cache.pem = staticPem;

  /** 惰性解析公钥 PEM（静态优先；否则拉 JWKS 并按 kid 缓存，命中快路径免拉） */
  async function resolvePem(header) {
    if (staticPem) return staticPem;

    const targetKid = header?.kid;
    // 快路径：已有缓存且 kid 一致（或无 kid 但有缓存）→ 直接复用，免一次 JWKS 往返。
    // 修复点：原实现无条件 fetchJson(jwksUrl)，导致 JWKS 模式下每请求都拉公钥（缓存形同虚设）。
    if (cache.pem && (!targetKid || targetKid === cache.keyId)) {
      return cache.pem;
    }

    const { keys } = await fetchJson(jwksUrl);
    // 挑 kid 匹配的；未提供 header/token kid 时取第一把
    const jwk =
      keys.find((k) => k.kid === targetKid) ??
      keys.find((k) => k.kty === 'RSA' && k.use === 'sig') ??
      keys[0];
    if (!jwk) throw new Error('JWKS 无可用签名公钥');

    const pem = jwkToPem(jwk);
    if (jwk.kid && jwk.kid !== cache.keyId) {
      cache.keyId = jwk.kid;
      cache.pem = pem;
    } else if (!cache.pem) {
      cache.pem = pem;
    }
    return pem;
  }

  async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`JWKS 拉取失败: ${res.status}`);
    return res.json();
  }

  /** 若提供了 token，则解出头（含 kid）供 JWKS 匹配 */
  function decodeHeader(token) {
    try {
      const seg = token.split('.')[0];
      return JSON.parse(Buffer.from(seg, 'base64url').toString('utf8'));
    } catch {
      return null;
    }
  }

  /** 返回 Express 中间件 */
  return function requireAuth(options = {}) {
    const optional = options.optional === true;
    return async function jwtVerifier(req, res, next) {
      const authz = req.headers.authorization ?? '';
      if (!authz.startsWith('Bearer ')) {
        if (optional) return next();
        return res.status(401).json({ code: 401, message: 'Unauthorized' });
      }
      const token = authz.substring(7);
      try {
        const header = decodeHeader(token);
        const pem = await resolvePem(header);
        const payload = verify(token, pem, {
          algorithms: ['RS256'],
          issuer,
        });
        req.auth = {
          sub: payload.sub,
          domain: payload.domain ?? null,
          externalId: payload.external_id ?? payload.sub ?? null,
          username: payload.username ?? null,
          name: payload.name ?? null,
          roles: payload.roles ?? [],
          iat: payload.iat,
          exp: payload.exp,
          iss: payload.iss,
        };
        next();
      } catch (err) {
        // 密钥轮换导致校验失败时，若走 JWKS 缓存则清缓存重试一次
        if (!staticPem && cache.pem) {
          cache.pem = null;
          cache.keyId = null;
          try {
            const pem = await resolvePem(decodeHeader(token));
            const payload = verify(token, pem, {
              algorithms: ['RS256'],
              issuer,
            });
            req.auth = { sub: payload.sub, externalId: payload.external_id ?? payload.sub ?? null };
            return next();
          } catch {
            /* fallthrough to 401 */
          }
        }
        return res.status(401).json({ code: 401, message: 'Invalid or expired token' });
      }
    };
  };
}