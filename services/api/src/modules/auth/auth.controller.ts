import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

/**
 * Auth 模块：
 * - 登录/刷新/登出/当前用户/改密/JWKS：透传给 auth-center（签发与私钥仅在 auth-center）；
 * - 注册：**编排**（业务库先建 public.users → 以 uuid 作 external_id 调 auth-center 服务间写面），
 *   不再是纯透传——这是 external_id ≡ public.users.id 唯一映射的落点（见 AuthService.register）。
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly config: ConfigService,
    private readonly auth: AuthService,
  ) {}

  private getAuthCenterBase(): string {
    return this.config.get<string>('AUTH_CENTER_URL') ?? 'http://localhost:3004';
  }

  private async proxy(
    method: string,
    path: string,
    req: Request,
    res: Response,
    body?: any,
    extraHeaders?: Record<string, string>,
  ) {
    const base = this.getAuthCenterBase();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...extraHeaders,
    };

    // 透传 Cookie（refresh_token 等）
    if (req.headers.cookie) {
      headers.Cookie = req.headers.cookie;
    }
    // 透传 Authorization（access_token）
    if (req.headers.authorization) {
      headers.Authorization = req.headers.authorization;
    }

    const response = await fetch(`${base}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(5000),
    });

    // 透传状态码
    res.status(response.status);

    // 透传 Set-Cookie
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      res.setHeader('Set-Cookie', setCookie);
    }

    // 返回 JSON（或空）
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      return response.json();
    }
    return response.text();
  }

  /**
   * 登录代理：POST /api/auth/login
   */
  @Post('login')
  async login(
    @Body() dto: { username: string; password: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.proxy('POST', '/auth/login', req, res, dto);
  }

  /**
   * 注册（编排，公开端点）：POST /api/auth/register
   * 成功 201；入参非法 400；账号已存在 409；auth-center 不可达 502（已补偿）。
   */
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  /**
   * 改密代理（需登录 Bearer）：POST /api/auth/password → auth-center /auth/password。
   * 未入公开白名单 → 无 token 即 401。透传 Authorization，身份由 auth-center meFromBearer 解析。
   */
  @Post('password')
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.proxy('POST', '/auth/password', req, res, dto);
  }

  /**
   * 刷新令牌代理：POST /api/auth/refresh
   */
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Body() dto: { refresh_token?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.refresh_token ?? dto.refresh_token;
    return this.proxy('POST', '/auth/refresh', req, res, { refresh_token: refreshToken });
  }

  /**
   * 登出代理：POST /api/auth/logout
   */
  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.proxy('POST', '/auth/logout', req, res, {});
  }

  /**
   * 当前用户信息代理：GET /api/auth/me
   */
  @Get('me')
  async me(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.proxy('GET', '/auth/me', req, res);
  }

  /**
   * JWKS 透传：GET /api/auth/jwks
   */
  @Get('jwks')
  async jwks(@Res({ passthrough: true }) res: Response) {
    // JWKS 不需要鉴权，直接透传
    const base = this.getAuthCenterBase();
    const response = await fetch(`${base}/auth/jwks`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });

    res.status(response.status);
    return response.json();
  }
}