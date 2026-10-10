import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';
import { OrganizationService } from '../organization/organization.service';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';
import { User } from './identity.types';

describe('IdentityController', () => {
  let controller: IdentityController;
  let service: jest.Mocked<IdentityService>;
  let org: jest.Mocked<OrganizationService>;

  const mockReq = (auth: Record<string, unknown>): Request => ({ auth } as unknown as Request);

  beforeEach(async () => {
    service = {
      getProfileByExternalId: jest.fn(),
      updateProfile: jest.fn(),
      deleteProfile: jest.fn(),
      listUsers: jest.fn(),
      updateRole: jest.fn(),
      updateStatus: jest.fn(),
    } as any;
    org = {
      assertSiteOperator: jest.fn().mockResolvedValue(undefined),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [IdentityController],
      providers: [
        { provide: IdentityService, useValue: service },
        { provide: OrganizationService, useValue: org },
      ],
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
    it('C8 读自己 → 成功且不调用运营授权', async () => {
      service.getProfileByExternalId.mockResolvedValue({
        user: { id: 'u1', username: 'testuser', role: 'student' } as User,
      });

      const result = await controller.getById(mockReq({ externalId: 'u1' }), 'u1');

      expect(result.user.id).toBe('u1');
      expect(org.assertSiteOperator).not.toHaveBeenCalled();
      expect(service.getProfileByExternalId).toHaveBeenCalledWith('u1');
    });

    it('C6 读他人且非运营 → ForbiddenException，不读档案', async () => {
      org.assertSiteOperator.mockRejectedValue(new ForbiddenException());

      await expect(
        controller.getById(mockReq({ externalId: 'actor', roles: ['operator'] }), 'target'),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(org.assertSiteOperator).toHaveBeenCalledWith('actor');
      expect(service.getProfileByExternalId).not.toHaveBeenCalled();
    });

    it('C7 读他人且运营 → 成功', async () => {
      service.getProfileByExternalId.mockResolvedValue({
        user: { id: 'u2', username: 'u2', role: 'student' } as User,
      });

      const result = await controller.getById(mockReq({ externalId: 'actor' }), 'u2');

      expect(result.user.id).toBe('u2');
      expect(org.assertSiteOperator).toHaveBeenCalledWith('actor');
      expect(service.getProfileByExternalId).toHaveBeenCalledWith('u2');
    });

    it('用户不存在 → NotFoundException', async () => {
      service.getProfileByExternalId.mockRejectedValue(new NotFoundException());

      await expect(
        controller.getById(mockReq({ externalId: 'actor' }), 'missing'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('list', () => {
    it('C1 非运营 → ForbiddenException，不查列表', async () => {
      org.assertSiteOperator.mockRejectedValue(new ForbiddenException());

      await expect(controller.list(mockReq({ externalId: 'actor' }), {})).rejects.toBeInstanceOf(
        ForbiddenException,
      );

      expect(org.assertSiteOperator).toHaveBeenCalledWith('actor');
      expect(service.listUsers).not.toHaveBeenCalled();
    });

    it('C2 运营 → 原样委托分页 query', async () => {
      const query = { page: 2, pageSize: 10, role: 'student' as const, q: 'ali' };
      const result = { items: [], total: 0, page: 2, pageSize: 10 };
      service.listUsers.mockResolvedValue(result);

      await expect(controller.list(mockReq({ externalId: 'actor' }), query)).resolves.toEqual(
        result,
      );

      expect(org.assertSiteOperator).toHaveBeenCalledWith('actor');
      expect(service.listUsers).toHaveBeenCalledWith(query);
    });

    it('C3 externalId 缺失 → ForbiddenException，短路 org/service', async () => {
      await expect(controller.list(mockReq({}), {})).rejects.toBeInstanceOf(ForbiddenException);

      expect(org.assertSiteOperator).not.toHaveBeenCalled();
      expect(service.listUsers).not.toHaveBeenCalled();
    });
  });

  describe('updateRole', () => {
    it('C4 运营改自己 → ForbiddenException，不改库', async () => {
      await expect(
        controller.updateRole(mockReq({ externalId: 'actor' }), 'actor', { role: 'merchant' }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(org.assertSiteOperator).toHaveBeenCalledWith('actor');
      expect(service.updateRole).not.toHaveBeenCalled();
    });

    it('C4 UUID 大小写不同仍识别为本人并拒绝', async () => {
      await expect(
        controller.updateRole(mockReq({ externalId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }), 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA', {
          role: 'merchant',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(service.updateRole).not.toHaveBeenCalled();
    });

    it('B3 运营改他人 → 委托服务', async () => {
      service.updateRole.mockResolvedValue({
        id: 'target',
        username: 'target',
        role: 'merchant',
      } as User);

      const result = await controller.updateRole(
        mockReq({ externalId: 'actor' }),
        'target',
        { role: 'merchant' },
      );

      expect(result.role).toBe('merchant');
      expect(service.updateRole).toHaveBeenCalledWith('target', 'merchant');
    });
  });

  describe('updateStatus', () => {
    it('C5 运营改自己状态 → ForbiddenException，不改库', async () => {
      await expect(
        controller.updateStatus(mockReq({ externalId: 'actor' }), 'actor', { status: 'suspended' }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(org.assertSiteOperator).toHaveBeenCalledWith('actor');
      expect(service.updateStatus).not.toHaveBeenCalled();
    });

    it('运营改他人状态 → 委托服务', async () => {
      service.updateStatus.mockResolvedValue({
        id: 'target',
        username: 'target',
        role: 'consumer',
        status: 'suspended',
      } as User);

      const result = await controller.updateStatus(
        mockReq({ externalId: 'actor' }),
        'target',
        { status: 'suspended' },
      );

      expect(result.status).toBe('suspended');
      expect(service.updateStatus).toHaveBeenCalledWith('target', 'suspended');
    });
  });

  describe('updateMe', () => {
    it('更新白名单字段 → 返回更新后档案', async () => {
      service.updateProfile.mockResolvedValue({
        id: 'u1',
        username: 'testuser',
        name: '新名',
        role: 'student',
      } as User);

      const result = await controller.updateMe(mockReq({ externalId: 'u1' }), { name: '新名' });

      expect(result.name).toBe('新名');
      expect(service.updateProfile).toHaveBeenCalledWith('u1', { name: '新名' });
    });

    it('尝试更新受保护字段 role → Controller 透传给 Service，Service 层白名单过滤', async () => {
      service.updateProfile.mockResolvedValue({
        id: 'u1',
        username: 'testuser',
        role: 'student',
        name: '新名',
      } as User);

      const result = await controller.updateMe(
        mockReq({ externalId: 'u1' }),
        { role: 'merchant', name: '新名' } as any,
      );

      expect(service.updateProfile).toHaveBeenCalledWith('u1', { role: 'merchant', name: '新名' });
      expect(result.role).toBe('student');
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

      await expect(
        controller.deleteMe(mockReq({ externalId: 'u1', sub: 'identity-1' })),
      ).resolves.toBeUndefined();

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

  it('C9 actor 只取 req.auth.externalId，body/query 伪造值无效', async () => {
    service.updateRole.mockResolvedValue({ id: 'target', role: 'student' } as User);

    await controller.updateRole(
      mockReq({ externalId: 'actor-real' }),
      'target',
      { role: 'student', actorId: 'actor-fake', externalId: 'actor-fake' } as any,
      { actorId: 'actor-fake', externalId: 'actor-fake' } as any,
    );

    expect(org.assertSiteOperator).toHaveBeenCalledWith('actor-real');
    expect(org.assertSiteOperator).not.toHaveBeenCalledWith('actor-fake');
    expect(service.updateRole).toHaveBeenCalledWith('target', 'student');
  });
});
