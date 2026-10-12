import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';
import { ModuleRegistryController } from './module-registry.controller';
import { ModuleRegistryService } from './module-registry.service';

describe('ModuleRegistryController', () => {
  let controller: ModuleRegistryController;
  let service: jest.Mocked<ModuleRegistryService>;

  const mockReq = (auth: Record<string, unknown>): Request => ({ auth } as unknown as Request);

  beforeEach(async () => {
    service = {
      listAvailableModules: jest.fn(),
      enableModule: jest.fn(),
      disableModule: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ModuleRegistryController],
      providers: [{ provide: ModuleRegistryService, useValue: service }],
    }).compile();

    controller = module.get(ModuleRegistryController);
  });

  afterEach(() => jest.clearAllMocks());

  it('只使用 req.auth.externalId 查询可用模块', async () => {
    service.listAvailableModules.mockResolvedValue([]);

    await expect(
      controller.list(mockReq({ externalId: 'u1', roles: ['operator'] })),
    ).resolves.toEqual([]);

    expect(service.listAvailableModules).toHaveBeenCalledWith('u1');
    expect(service.listAvailableModules).not.toHaveBeenCalledWith('operator');
  });

  it('externalId 缺失 → ForbiddenException，且不查目录', async () => {
    await expect(
      controller.list(mockReq({ sub: 'identity-1', roles: ['operator'] })),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(service.listAvailableModules).not.toHaveBeenCalled();
  });

  it('enable 只使用 req.auth.externalId 与路径 code', async () => {
    service.enableModule.mockResolvedValue({ code: 'tutor', selected: true });

    await expect(
      controller.enable(mockReq({ externalId: 'u1', roles: ['operator'] }), 'tutor'),
    ).resolves.toEqual({ code: 'tutor', selected: true });

    expect(service.enableModule).toHaveBeenCalledWith('u1', 'tutor');
  });

  it('disable 只使用 req.auth.externalId 与路径 code', async () => {
    service.disableModule.mockResolvedValue({ code: 'tutor', selected: false });

    await expect(
      controller.disable(mockReq({ externalId: 'u1', roles: ['operator'] }), 'tutor'),
    ).resolves.toEqual({ code: 'tutor', selected: false });

    expect(service.disableModule).toHaveBeenCalledWith('u1', 'tutor');
  });

  it('enable/disable externalId 缺失 → ForbiddenException，且不写偏好', async () => {
    await expect(
      controller.enable(mockReq({ sub: 'identity-1' }), 'tutor'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      controller.disable(mockReq({ sub: 'identity-1' }), 'tutor'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(service.enableModule).not.toHaveBeenCalled();
    expect(service.disableModule).not.toHaveBeenCalled();
  });
});
