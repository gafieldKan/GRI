import {
  Controller,
  Get,
  Patch,
  Put,
  Delete,
  Body,
  Req,
  Param,
  Query,
  ParseUUIDPipe,
  ForbiddenException,
} from '@nestjs/common';
import { IdentityService } from './identity.service';
import { Request } from 'express';
import { ChangeRoleDto, ChangeStatusDto, ListUsersQuery, User } from './identity.types';
import { OrganizationService } from '../organization/organization.service';

/** req.auth 载荷的精简断言（与 @gri/jwt-verifier VerifierAuth 对齐） */
interface ReqAuth {
  sub: string;
  externalId: string | null;
}

@Controller('identity')
export class IdentityController {
  constructor(
    private readonly identityService: IdentityService,
    private readonly org: OrganizationService,
  ) {}

  private auth(req: Request): ReqAuth {
    return req.auth as ReqAuth;
  }

  private externalId(req: Request): string {
    const id = this.auth(req).externalId;
    if (!id) throw new ForbiddenException('缺少外部身份标识');
    return id;
  }

  private async requireOperator(req: Request): Promise<string> {
    const actorId = this.externalId(req);
    await this.org.assertSiteOperator(actorId);
    return actorId;
  }

  private isSameIdentity(left: string, right: string): boolean {
    return left.toLowerCase() === right.toLowerCase();
  }

  /**
   * 当前登录用户档案。
   * 路径：GET /api/identity/me
   * 契约：从 req.auth.externalId 定位 public.users.id，读回本人才档案。
   */
  @Get('me')
  async getMe(@Req() req: Request) {
    const externalId = this.externalId(req);
    return this.identityService.getProfileByExternalId(externalId);
  }

  /**
   * 运营用户列表。
   * 路径：GET /api/identity
   */
  @Get()
  async list(@Req() req: Request, @Query() query: ListUsersQuery) {
    await this.requireOperator(req);
    return this.identityService.listUsers(query);
  }

  /**
   * 按 id 读档案。防 IDOR：本人恒允许；读他人必须由根组织运营身份放行。
   * 路径：GET /api/identity/:id
   */
  @Get(':id')
  async getById(@Req() req: Request, @Param('id', new ParseUUIDPipe()) id: string) {
    const actorId = this.externalId(req);
    if (!this.isSameIdentity(id, actorId)) await this.org.assertSiteOperator(actorId);
    return this.identityService.getProfileByExternalId(id);
  }

  /**
   * 更新本人档案（服务层有字段白名单，role/status/password 等不可自助改）。
   * 路径：PUT /api/identity/me
   */
  @Put('me')
  async updateMe(@Req() req: Request, @Body() data: Partial<User>) {
    const externalId = this.externalId(req);
    return this.identityService.updateProfile(externalId, data);
  }

  /** 运营变更他人角色。actor 仅取 req.auth.externalId，body/query 不参与授权。 */
  @Patch(':id/role')
  async updateRole(
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ChangeRoleDto,
    @Query() _query?: unknown,
  ) {
    const actorId = await this.requireOperator(req);
    if (this.isSameIdentity(id, actorId)) {
      throw new ForbiddenException('不得变更自己的角色或状态');
    }
    return this.identityService.updateRole(id, dto?.role);
  }

  /** 运营变更他人状态。actor 仅取 req.auth.externalId，body/query 不参与授权。 */
  @Patch(':id/status')
  async updateStatus(
    @Req() req: Request,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ChangeStatusDto,
  ) {
    const actorId = await this.requireOperator(req);
    if (this.isSameIdentity(id, actorId)) {
      throw new ForbiddenException('不得变更自己的角色或状态');
    }
    return this.identityService.updateStatus(id, dto?.status);
  }

  /**
   * 注销本人（停用凭证 + 软删档案）。防 IDOR：externalId 仅取自 req.auth，只能删自己。
   * 路径：DELETE /api/identity/me
   */
  @Delete('me')
  async deleteMe(@Req() req: Request): Promise<void> {
    const externalId = this.externalId(req);
    await this.identityService.deleteProfile(externalId);
  }
}
