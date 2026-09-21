import { Controller, Get, Param, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { IdentityAdminService } from './identity-admin.service';

/**
 * 身份目录服务间面（/auth/admin/...）。所有端点要求 X-Service-Token 头，
 * 浏览器侧不可直连；业务后端 api 在 assertSiteOperator 后携带该头代查。
 */
@Controller('auth/admin')
export class IdentityAdminController {
  constructor(private readonly svc: IdentityAdminService) {}

  @Get('identities/lookup')
  async lookup(
    @Req() req: Request,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ) {
    this.svc.authorize(req.headers['x-service-token'] as string | undefined);
    return { success: true, identities: await this.svc.lookup(q, limit ? Number(limit) : 10) };
  }

  @Get('identities/:businessId')
  async byId(@Req() req: Request, @Param('businessId') businessId: string) {
    this.svc.authorize(req.headers['x-service-token'] as string | undefined);
    return { success: true, identity: await this.svc.byBusinessId(businessId) };
  }
}