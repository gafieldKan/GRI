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
});
