import { Body, Controller, Delete, Get, Param, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { IdentityAdminService } from './identity-admin.service';
import { CreateIdentityDto } from '../auth/dto/auth.dto';

/**
 * 身份目录服务间面（/auth/admin/...）。所有端点要求 X-Service-Token 头，
 * 浏览器侧不可直连；业务后端 api 在 assertSiteOperator 后携带该头代查。
 */
@Controller('auth/admin')
export class IdentityAdminController {
  constructor(private readonly svc: IdentityAdminService) {}

  /** 创建身份（注册编排第二步）：external_id 由 api 注入（= public.users.id）。 */
  @Post('identities')
  async create(@Req() req: Request, @Body() dto: CreateIdentityDto) {
    this.svc.authorize(req.headers['x-service-token'] as string | undefined);
    return { success: true, identity: await this.svc.createIdentity(dto) };
  }

  /** 停用身份（注销编排第一步）：按 external_id 定位，置 disabled + 吊销 refresh token。 */
  @Delete('identities/:externalId')
  async disable(@Req() req: Request, @Param('externalId') externalId: string) {
    this.svc.authorize(req.headers['x-service-token'] as string | undefined);
    await this.svc.disableIdentityByExternalId(externalId);
    return { success: true };
  }

  /** 启用身份（suspended → active 恢复闭环）：按 external_id 定位，置 active。 */
  @Post('identities/:externalId/enable')
  async enable(@Req() req: Request, @Param('externalId') externalId: string) {
    this.svc.authorize(req.headers['x-service-token'] as string | undefined);
    await this.svc.enableIdentityByExternalId(externalId);
    return { success: true };
  }

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
