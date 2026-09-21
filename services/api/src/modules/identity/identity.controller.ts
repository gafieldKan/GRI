import {
  Controller,
  Get,
  Put,
  Body,
  Req,
  Param,
  ParseUUIDPipe,
  ForbiddenException,
} from '@nestjs/common';
import { IdentityService } from './identity.service';
import { Request } from 'express';
import { User } from './identity.types';

/** req.auth 载荷的精简断言（与 @gri/jwt-verifier VerifierAuth 对齐） */
interface ReqAuth {
  sub: string;
  externalId: string | null;
  roles: string[];
}

/** 有权按 id 读他人档案的角色（M4 权限收敛前的临时粗粒度门槛） */
const READ_ANY_ELEVATED_ROLES = new Set(['operator', 'merchant']);

@Controller('identity')
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  private auth(req: Request): ReqAuth {
    return req.auth as ReqAuth;
  }

  /**
   * 当前登录用户档案。
   * 路径：GET /api/identity/me
   * 契约：从 req.auth.externalId 定位 public.users.id，读回本人才档案。
   */
  @Get('me')
  getMe(@Req() req: Request) {
    const externalId = this.auth(req).externalId;
    if (!externalId) throw new ForbiddenException('缺少外部身份标识');
    return this.identityService.getProfileByExternalId(externalId);
  }

  /**
   * 按 id 读档案。防 IDOR：默认只允许读自己；读他人需 operator/merchant 角色。
   * 路径：GET /api/identity/:id
   */
  @Get(':id')
  getById(@Req() req: Request, @Param('id', new ParseUUIDPipe()) id: string) {
    const a = this.auth(req);
    const ownExternalId = a.externalId;
    if (id !== ownExternalId && !(a.roles ?? []).some((r) => READ_ANY_ELEVATED_ROLES.has(r))) {
      throw new ForbiddenException('无权读取他人档案');
    }
    return this.identityService.getProfileByExternalId(id);
  }

  /**
   * 更新本人档案（服务层有字段白名单，role/status/password 等不可自助改）。
   * 路径：PUT /api/identity/me
   */
  @Put('me')
  updateMe(@Req() req: Request, @Body() data: Partial<User>) {
    const externalId = this.auth(req).externalId;
    if (!externalId) throw new ForbiddenException('缺少外部身份标识');
    return this.identityService.updateProfile(externalId, data);
  }
}