import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';

const mockConfigService = {
  get: jest.fn((key: string) => {
    if (key === 'AUTH_CENTER_URL') return 'http://auth-center:3004';
    return undefined;
  }),
};

describe('AuthController', () => {
  let controller: AuthController;
  let service: jest.Mocked<AuthService>;

  const mockReq = (headers: Record<string, string> = {}, cookies: Record<string, string> = {}) => ({
    headers,
    cookies,
  } as Request);

  const mockRes = () => {
    const res: Partial<Response> = {
      status: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
      json: jest.fn(),
    };
    return res as Response;
  };

  beforeEach(async () => {
    service = {
      getAuthCenterBase: jest.fn().mockReturnValue('http://auth-center:3004'),
      buildAuthCenterUrl: jest.fn((path) => `http://auth-center:3004${path}`),
      checkAuthCenterHealth: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: service },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    controller = module.get(AuthController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('jwks', () => {
    it('透传 JWKS 响应', async () => {
      const res = mockRes();
      const mockJwks = { keys: [{ kid: 'test', kty: 'RSA' }] };
      
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve(mockJwks),
      });

      const result = await controller.jwks(res);

      expect(result).toEqual(mockJwks);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('login', () => {
    it('转发登录请求到 auth-center', async () => {
      const req = mockReq();
      const res = mockRes();
      const mockResponse = { access_token: 'abc', refresh_token: 'def' };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: (k: string) => k === 'set-cookie' ? 'refresh_token=def; HttpOnly' : 'application/json' },
        json: () => Promise.resolve(mockResponse),
      });

      const result = await controller.login({ username: 'test', password: 'pass' }, req, res);

      expect(result).toEqual(mockResponse);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.setHeader).toHaveBeenCalledWith('Set-Cookie', 'refresh_token=def; HttpOnly');
    });

    it('转发 auth-center 错误状态码', async () => {
      const req = mockReq();
      const res = mockRes();

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: { get: (k: string) => k === 'content-type' ? 'application/json' : null },
        json: () => Promise.resolve({ code: 401, message: 'Invalid credentials' }),
        text: () => Promise.resolve('Invalid credentials'),
      });

      const result = await controller.login({ username: 'test', password: 'wrong' }, req, res);

      expect(result).toEqual({ code: 401, message: 'Invalid credentials' });
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('register（编排，非透传）', () => {
    it('委托 AuthService.register 完成编排，并原样返回结果', async () => {
      const dto = {
        username: 'newuser',
        email: 'newuser@example.com',
        password: 'password123',
      };
      const mockUser = { id: 'uuid-1', username: dto.username, email: dto.email, role: 'consumer' };
      service.register = jest.fn().mockResolvedValue(mockUser);

      const result = await controller.register(dto);

      expect(result).toEqual(mockUser);
      // 编排职责下沉到 service，控制器不再是透传代理
      expect(service.register).toHaveBeenCalledWith(dto);
    });

    it('service 抛 ConflictException 时原样冒出（不吞错）', async () => {
      service.register = jest.fn().mockRejectedValue(new ConflictException('账户已存在'));

      await expect(
        controller.register({ username: 'existing', password: 'password123' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('changePassword', () => {
    it('携带 Bearer token 转发改密请求到 auth-center', async () => {
      const req = mockReq({ authorization: 'Bearer access-token-123' });
      const res = mockRes();
      const dto = { oldPassword: 'old-password', newPassword: 'new-password' };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ message: 'Password changed' }),
      });

      const result = await controller.changePassword(dto, req, res);

      expect(result).toEqual({ message: 'Password changed' });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://auth-center:3004/auth/password',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(dto),
          headers: expect.objectContaining({
            Authorization: 'Bearer access-token-123',
          }),
        }),
      );
    });

    it('转发 auth-center 改密错误状态码', async () => {
      const req = mockReq({ authorization: 'Bearer access-token-123' });
      const res = mockRes();

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        headers: { get: (k: string) => (k === 'content-type' ? 'application/json' : null) },
        json: () => Promise.resolve({ code: 400, message: '旧密码错误' }),
      });

      const result = await controller.changePassword(
        { oldPassword: 'wrong', newPassword: 'new-password' },
        req,
        res,
      );

      expect(result).toEqual({ code: 400, message: '旧密码错误' });
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('refresh', () => {
    it('从 cookie 读取 refresh_token 并转发', async () => {
      const req = mockReq({}, { refresh_token: 'from-cookie' });
      const res = mockRes();
      const mockResponse = { access_token: 'new-abc' };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: (k: string) => k === 'content-type' ? 'application/json' : null },
        json: () => Promise.resolve(mockResponse),
        text: () => Promise.resolve(JSON.stringify(mockResponse)),
      });

      const result = await controller.refresh(req, {}, res);

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://auth-center:3004/auth/refresh',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ refresh_token: 'from-cookie' }),
        }),
      );
    });

    it('从 body 读取 refresh_token 并转发', async () => {
      const req = mockReq();
      const res = mockRes();
      const mockResponse = { access_token: 'new-abc' };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: () => Promise.resolve(mockResponse),
        text: () => Promise.resolve(JSON.stringify(mockResponse)),
      });

      const result = await controller.refresh(req, { refresh_token: 'from-body' }, res);

      expect(global.fetch).toHaveBeenCalledWith(
        'http://auth-center:3004/auth/refresh',
        expect.objectContaining({
          body: JSON.stringify({ refresh_token: 'from-body' }),
        }),
      );
    });
  });

  describe('logout', () => {
    it('转发登出请求并透传 Set-Cookie', async () => {
      const req = mockReq({ cookie: 'refresh_token=abc' });
      const res = mockRes();

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: (k: string) => k === 'set-cookie' ? 'refresh_token=; Max-Age=0' : (k === 'content-type' ? 'application/json' : null) },
        json: () => Promise.resolve({ message: 'Logged out' }),
        text: () => Promise.resolve('Logged out'),
      });

      const result = await controller.logout(req, res);

      expect(result).toEqual({ message: 'Logged out' });
      expect(res.setHeader).toHaveBeenCalledWith('Set-Cookie', 'refresh_token=; Max-Age=0');
    });
  });

  describe('me', () => {
    it('透传 Authorization header 到 auth-center', async () => {
      const req = mockReq({ authorization: 'Bearer access-token-123' });
      const res = mockRes();
      const mockResponse = { sub: 'user-1', domain: 'tutor', externalId: 'ext-1' };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve(mockResponse),
      });

      const result = await controller.me(req, res);

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        'http://auth-center:3004/auth/me',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer access-token-123' }),
        }),
      );
    });
  });
});
