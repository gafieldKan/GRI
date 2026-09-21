import type { Request, Response, NextFunction } from 'express';
import { createJwtVerifier } from '@gri/jwt-verifier';
import { AuthRouterMiddleware } from './jwt-auth.middleware';

// mock @gri/jwt-verifier：按 optional 语义给行为——
// optional（白名单命中）→ 调 next() 放行游客；mandatory（受保护）→ 不调 next()（真实里 401 拦截）。
// 这样用「next 是否被调」断言 dispatch，不依赖中间件实例身份。
jest.mock('@gri/jwt-verifier', () => ({
  createJwtVerifier: jest.fn(() => (reqOpts?: { optional?: boolean }) => {
    return (req: Request, res: Response, next: NextFunction) => {
      if (reqOpts?.optional) next();
    };
  }),
}));

function fakeReq(method: string, path: string): Request {
  return { method, path } as unknown as Request;
}

describe('AuthRouterMiddleware（一处挂接：白名单收盘）', () => {
  it('公开读路径 → optional 放行，游客经 next 进入业务', () => {
    const mw = new AuthRouterMiddleware();
    const next = jest.fn();

    mw.use(fakeReq('GET', '/food/restaurants'), {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1); // 无 token 也放行
  });

  it('受保护路径 → mandatory 拦截，不让进业务', () => {
    const mw = new AuthRouterMiddleware();
    const next = jest.fn();

    mw.use(fakeReq('GET', '/identity/me'), {} as Response, next);

    expect(next).not.toHaveBeenCalled(); // 被拦截（真实 401）
  });

  it('方法不匹配白名单（POST 公开路径）→ mandatory 拦截', () => {
    const mw = new AuthRouterMiddleware();
    const next = jest.fn();

    mw.use(fakeReq('POST', '/food/restaurants'), {} as Response, next);

    expect(next).not.toHaveBeenCalled();
  });
});