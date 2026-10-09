import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';
import { User } from './identity.types';

describe('IdentityController', () => {
  let controller: IdentityController;
  let service: jest.Mocked<IdentityService>;

  const mockReq = (auth: Partial<{ sub: string; externalId: string; roles: string[] }>): Request => ({
    auth,
  } as Request);

  beforeEach(async () => {
    service = {
      getProfileByExternalId: jest.fn(),
      updateProfile: jest.fn(),
      deleteProfile: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [IdentityController],
      providers: [{ provide: IdentityService, useValue: service }],
    }).compile();

    controller = module.get(IdentityController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getMe', () => {
    it('返回当前用户档案（students 聚合）', async () => {
      service.getProfileByExternalId.mockResolvedValue({
        user: { id: 'u1', username: 'testuser', role: 'student', name: 'Test' } as User,
        student: { user_id: 'u1', grade: 9 },
      });

      const result = await controller.getMe(mockReq({ externalId: 'u1' }));

      expect(result.user.id).toBe('u1');
      expect(result.student!.grade).toBe(9);
      expect(service.getProfileByExternalId).toHaveBeenCalledWith('u1');
    });

    it('externalId 缺失 → ForbiddenException', async () => {
      await expect(controller.getMe(mockReq({}))).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('getById', () => {
    it('读自己档案 → 成功', async () => {
      service.getProfileByExternalId.mockResolvedValue({
        user: { id: 'u1', username: 'testuser', role: 'student' } as User,
      });

      const result = await controller.getById(mockReq({ externalId: 'u1', roles: [] }), 'u1');

      expect(result.user.id).toBe('u1');
    });

    it('读他人档案无特权角色 → ForbiddenException', async () => {
      service.getProfileByExternalId.mockResolvedValue({ user: { id: 'u2', username: 'u2', role: 'student' } as User });

      await expect(
        controller.getById(mockReq({ externalId: 'u1', roles: ['consumer'] }), 'u2'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('读他人档案有 operator 角色 → 成功', async () => {
      service.getProfileByExternalId.mockResolvedValue({ user: { id: 'u2', username: 'u2', role: 'student' } as User });

      const result = await controller.getById(
        mockReq({ externalId: 'u1', roles: ['operator'] }),
        'u2',
      );

      expect(result.user.id).toBe('u2');
    });

    it('用户不存在 → NotFoundException', async () => {
      service.getProfileByExternalId.mockRejectedValue(new NotFoundException());

      await expect(
        controller.getById(mockReq({ externalId: 'u1', roles: ['operator'] }), 'u999'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateMe', () => {
    it('更新白名单字段 → 返回更新后档案', async () => {
      service.updateProfile.mockResolvedValue({ id: 'u1', username: 'testuser', name: '新名', role: 'student' } as User);

      const result = await controller.updateMe(
        mockReq({ externalId: 'u1' }),
        { name: '新名' },
      );

      expect(result.name).toBe('新名');
      expect(service.updateProfile).toHaveBeenCalledWith('u1', { name: '新名' });
    });

    it('尝试更新受保护字段 role → Controller 透传给 Service，Service 层白名单过滤', async () => {
      service.updateProfile.mockResolvedValue({ id: 'u1', username: 'testuser', role: 'student', name: '新名' } as User);

      const result = await controller.updateMe(
        mockReq({ externalId: 'u1' }),
        { role: 'merchant', name: '新名' } as any,
      );

      // Controller 透传原始 DTO 给 Service（含 role），Service 内部白名单过滤（已在 service.spec.ts 覆盖）
      expect(service.updateProfile).toHaveBeenCalledWith('u1', { role: 'merchant', name: '新名' });
      expect(result.role).toBe('student'); // Service 过滤后 role 未变
    });

    it('externalId 缺失 → ForbiddenException', async () => {
      await expect(controller.updateMe(mockReq({}), { name: 'x' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('deleteMe', () => {
    it('仅使用 req.auth.externalId 删除本人档案，防止 IDOR', async () => {
      service.deleteProfile.mockResolvedValue(undefined);

      await expect(controller.deleteMe(mockReq({ externalId: 'u1', sub: 'identity-1' }))).resolves
        .toBeUndefined();

      expect(service.deleteProfile).toHaveBeenCalledWith('u1');
      expect(service.deleteProfile).not.toHaveBeenCalledWith('identity-1');
    });

    it('externalId 缺失 → ForbiddenException，且不调用删除服务', async () => {
      await expect(controller.deleteMe(mockReq({ sub: 'identity-1' }))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(service.deleteProfile).not.toHaveBeenCalled();
    });
  });
});
