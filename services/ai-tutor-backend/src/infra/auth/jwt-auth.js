/**
 * AI 辅导后端 JWT 公钥校验中间件（接入 @gri/jwt-verifier）。
 *
 * 用于替代前端硬编码 student_001：校验 RS256 JWT 后，把 req.auth 注入
 * （含 sub=统一主体 id、externalId=原 students.id 即 studentId）。
 * 业务代码据 req.auth.externalId 取 studentId，保持无状态。
 *
 * 公钥来源优先级：
 *   1. AUTH_PUBLIC_KEY / AUTH_PUBLIC_KEY_FILE（生产 k8s secret，最健壮）
 *   2. AUTH_JWKS_URL（缺省 http://localhost:3004/auth/jwks，动态拉取缓存）
 *
 * 用法：
 *   import { requireAuth, requireOptionalAuth } from './infra/auth/jwt-auth.js'
 *   app.post('/api/exams', requireAuth, async (req, res) => {
 *     const studentId = req.auth.externalId  // 原 students.id
 *     ...
 *   })
 */
import { createJwtVerifier } from '@gri/jwt-verifier';

const verifier = createJwtVerifier({
  issuer: process.env.JWT_ISSUER ?? 'gri-auth-center',
  publicKey: process.env.AUTH_PUBLIC_KEY,
  jwksUrl: process.env.AUTH_JWKS_URL ?? 'http://localhost:3004/auth/jwks',
});

/** 强制鉴权中间件（无/坏 token → 401），校验通过注入 req.auth */
export const requireAuth = verifier();

/** 可选鉴权中间件（无 token 放行；有 token 则校验并注入 req.auth） */
export const requireOptionalAuth = verifier({ optional: true });