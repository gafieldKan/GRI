import { Controller, Get, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { TwinService } from './twin.service';

/** req.auth 载荷的精简断言（与 @gri/jwt-verifier VerifierAuth 对齐）。 */
interface ReqAuth {
  sub: string;
  externalId: string | null;
  roles: string[];
}

/**
 * twin 门面 —— 学生数字孪生（人本论：人本体的可执行运行时）。
 *
 * 鉴权：/api/twin/* 未入 public-routes 白名单 → 全局 AuthRouterMiddleware 强制鉴权
 * （个人数据，绝不匿名）。孪生一律按 req.auth.externalId（≡ public.users.id）隔离。
 * 端点：
 *   GET  /api/twin/me            孪生总览（profile + state + world + 近期经历 + 记忆）
 *   GET  /api/twin/me/events     行为时间线（分页）
 *   POST /api/twin/me/backfill   历史经历回填（幂等，仅空时间线时执行）
 */
@Controller('twin')
export class TwinController {
  constructor(private readonly twinService: TwinService) {}

  private entity(req: Request): string {
    const auth = (req as any).auth as ReqAuth | undefined;
    // 中间件已强制鉴权；externalId ≡ users.id 为孪生隔离主键（缺失时退回 sub 兜底）。
    return auth?.externalId || auth?.sub || '';
  }

  @Get('me')
  me(@Req() req: Request, @Query('subject') subject?: string) {
    return this.twinService.assembleOverview(this.entity(req), subject || 'math');
  }

  @Get('me/events')
  events(@Req() req: Request, @Query('limit') limit?: string) {
    return this.twinService.listEvents(
      this.entity(req),
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Post('me/backfill')
  backfill(@Req() req: Request) {
    return this.twinService.backfill(this.entity(req));
  }
}
