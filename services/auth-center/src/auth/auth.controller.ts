import { Body, Controller, Get, Post, Req, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto, RefreshDto } from './dto/auth.dto';

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

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
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