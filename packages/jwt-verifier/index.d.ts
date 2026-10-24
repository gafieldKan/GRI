/**
 * @gri/jwt-verifier 类型声明。
 *
 * 供 TS 服务（services/api）消费共享包时获得类型提示。运行时由 src/index.js 提供，
 * 本文件仅声明接口契约，不改运行时行为。
 */
/// <reference types="node" />

import type { RequestHandler } from 'express';

/** 校验通过后注入 req.auth 的身份载荷 */
export interface VerifierAuth {
  /** JWT sub —— 统一主体 id（auth.identities.id） */
  sub: string;
  /** 身份域（'food' | 'tutor'） */
  domain: string | null;
  /** 业务主键 external_id —— 对应 public.users.id / edu.students.user_id */
  externalId: string | null;
  username: string | null;
  name: string | null;
  /** JWT roles claim（数组） */
  roles: string[];
  iat: number;
  exp: number;
  iss: string;
}

/** createJwtVerifier 的配置选项 */
export interface JwtVerifierOptions {
  /** 期望的 iss，缺省 'gri-auth-center' */
  issuer?: string;
  /** 直接注入的 PEM 公钥（优先，绕过 JWKS） */
  publicKey?: string;
  /** JWKS 端点，缺省 http://localhost:3004/auth/jwks */
  jwksUrl?: string;
  /** JWKS 缓存 TTL（ms），缺省 300000；亦可用环境变量 AUTH_JWKS_TTL_MS 配置 */
  jwksTtlMs?: number;
  /** 时钟注入（测试用），缺省 Date.now */
  now?: () => number;
}

/** requireAuth(options) 的运行时选项 */
export interface RequireAuthOptions {
  /** true = 无 token 放行（可选鉴权）；缺省 false = 强制 */
  optional?: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** @gri/jwt-verifier 注入的身份载荷（校验通过时） */
      auth?: VerifierAuth;
    }
  }
}

/**
 * 创建 JWT 校验中间件工厂。
 * 返回 requireAuth(options)，再调用返回 Express 中间件 (req,res,next)。
 */
export function createJwtVerifier(
  opts?: JwtVerifierOptions,
): (options?: RequireAuthOptions) => RequestHandler;