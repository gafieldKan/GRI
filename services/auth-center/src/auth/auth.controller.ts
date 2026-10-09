import {
  Body,
  Controller,
  Get,
  GoneException,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { ChangePasswordDto, LoginDto, RegisterDto, RefreshDto } from './dto/auth.dto';

/**
 * 签发中心对外端点（路径契约：/auth/...，与 nginx /auth/ 转发对齐）。
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request & { headers: Record<string, string> }) {
    return this.auth.login(dto.identifier, dto.password, this.deviceOf(req));
  }

  /**
   * @deprecated 公开注册已迁移至统一入口 `POST /api/auth/register`。
   * 旧路径会静默产出 external_id=NULL 的坏身份（本 bug 源头），故 fail-fast 关闭为 410。
   * auth-center 无法触达业务库 public.users，故不能内部转调。
   */
  @Post('register')
  register(@Body() _dto: RegisterDto): never {
    throw new GoneException('注册已迁移至 POST /api/auth/register（统一入口）');
  }

  /**
   * 改密（需登录 Bearer）。身份从 token 解析（meFromBearer），不接受 external 传 identityId。
   */
  @Post('password')
  async password(
    @Body() dto: ChangePasswordDto,
    @Req() req: Request & { headers: Record<string, string> },
  ) {
    return this.auth.changePassword(this.bearer(req), dto.oldPassword, dto.newPassword);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshDto, @Req() req: Request & { headers: Record<string, string> }) {
    return this.auth.refresh(dto.refreshToken, this.deviceOf(req));
  }

  @Post('logout')
  async logout(@Body() dto: RefreshDto) {
    await this.auth.logout(dto.refreshToken);
    return { message: 'Logged out' };
  }

  @Get('me')
  async me(@Req() req: Request & { headers: Record<string, string> }) {
    const identity = await this.auth.meFromBearer(this.bearer(req));
    if (!identity) throw new UnauthorizedException('Unauthorized');
    const { passwordHash: _ph, ...user } = identity;
    return user;
  }

  private bearer(req: Request & { headers: Record<string, string> }): string {
    const h = req.headers['authorization'] ?? '';
    return h.startsWith('Bearer ') ? h.substring(7) : '';
  }

  private deviceOf(req: Request & { headers: Record<string, string> }): string | undefined {
    return req.headers['user-agent'];
  }
}