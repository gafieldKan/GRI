import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { createJwtVerifier } from '@gri/jwt-verifier';
import { loadConfig } from '../config/config';
import { isPublicRoute } from './public-routes';

export type JwtVerifier = ReturnType<ReturnType<typeof createJwtVerifier>>;

/** 根据配置构造一枚已绑定签名参数的 verifier（强制/可选由传参决定）。 */
function makeVerifier(optional: boolean): JwtVerifier {
  const cfg = loadConfig().jwt;
  return createJwtVerifier({
    issuer: cfg.issuer,
    publicKey: cfg.publicKey || undefined,
    jwksUrl: cfg.jwksUrl,
  })({ optional });
}

/**
 * 全局鉴权路由中间件 —— 「一处挂接」。
 * 单一挂载点 app.use('/api', authRouter) 即同时实现：
 *   - 默认：强制鉴权（401 兜底）—— 个人数据/写操作全部受保护；
 *   - 例外：命中公开读白名单 → 可选鉴权，游客可匿名访问、登录用户拿 req.auth 个性化。
 * 强制/可选都复用 @gri/jwt-verifier 的同一核心，无双份校验逻辑。
 */
@Injectable()
export class AuthRouterMiddleware implements NestMiddleware {
  private readonly mandatory: JwtVerifier;
  private readonly optional: JwtVerifier;

  constructor() {
    this.mandatory = makeVerifier(false);
    this.optional = makeVerifier(true);
  }

  use(req: Request, res: Response, next: NextFunction) {
    const path = req.path ?? '/';
    const verifier = isPublicRoute(req.method, path) ? this.optional : this.mandatory;
    return verifier(req, res, next);
  }
}

/**
 * 全局 JWT 强制鉴权中间件：把 @gri/jwt-verifier 的 Express 中间件包成 Nest 中间件。
 * 校验通过后 req.auth = { sub, domain, externalId, ... }，其中 externalId === public.users.id。
 * 无/坏/过期 token → 401（无降级）。
 */
@Injectable()
export class JwtAuthMiddleware implements NestMiddleware {
  private verifier: JwtVerifier;

  constructor() {
    this.verifier = makeVerifier(false);
  }

  use(req: Request, res: Response, next: NextFunction) {
    return this.verifier(req, res, next);
  }
}

/**
 * 可选鉴权中间件：无 token 放行（游客访问公开目录），有 token 则校验并注入 req.auth。
 * 用于「读匿名可见、登录后个性化」的端点（如公开菜单目录）。
 */
@Injectable()
export class OptionalJwtAuthMiddleware implements NestMiddleware {
  private verifier: JwtVerifier;

  constructor() {
    this.verifier = makeVerifier(true);
  }

  use(req: Request, res: Response, next: NextFunction) {
    return this.verifier(req, res, next);
  }
}