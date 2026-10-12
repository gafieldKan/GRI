import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';
import { OrganizationService } from '../organization/organization.service';
import { ModuleRegistryController } from './module-registry.controller';
import { ModuleRegistryService } from './module-registry.service';

describe('ModuleRegistryController', () => {
  let controller: ModuleRegistryController;
  let service: jest.Mocked<ModuleRegistryService>;
  let org: jest.Mocked<OrganizationService>;

  const mockReq = (auth: Record<string, unknown>): Request => ({ auth } as unknown as Request);

  beforeEach(async () => {
    service = {
      listAvailableModules: jest.fn(),
      listDimensionOptions: jest.fn(),
      getModuleBindings: jest.fn(),
      replaceModuleBindings: jest.fn(),
      enableModule: jest.fn(),
      disableModule: jest.fn(),
    } as any;
    org = {
      assertSiteOperator: jest.fn().mockResolvedValue(undefined),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ModuleRegistryController],
      providers: [
        { provide: ModuleRegistryService, useValue: service },
        { provide: OrganizationService, useValue: org },
      ],
    }).compile();

    controller = module.get(ModuleRegistryController);
  });

  afterEach(() => jest.clearAllMocks());

  it('只使用 req.auth.externalId 查询可用模块', async () => {
    service.listAvailableModules.mockResolvedValue([]);

    await expect(
      controller.list(mockReq({ externalId: 'u1', roles: ['operator'] })),
    ).resolves.toEqual([]);

    expect(service.listAvailableModules).toHaveBeenCalledWith('u1', {
      region: undefined,
      industry: undefined,
    });
    expect(service.listAvailableModules).not.toHaveBeenCalledWith('operator');
  });

  it('GET /api/modules 把区域/行业 query 原样交给服务层过滤', async () => {
    service.listAvailableModules.mockResolvedValue([]);

    await controller.list(mockReq({ externalId: 'u1' }), '156', 'A');

    expect(service.listAvailableModules).toHaveBeenCalledWith('u1', {
      region: '156',
      industry: 'A',
    });
  });

  it('externalId 缺失 → ForbiddenException，且不查目录', async () => {
    await expect(
      controller.list(mockReq({ sub: 'identity-1', roles: ['operator'] })),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(service.listAvailableModules).not.toHaveBeenCalled();
  });

  it('维度选择器走登录门禁且只取服务端闭集', async () => {
    service.listDimensionOptions.mockResolvedValue({ regions: [], industries: [] });

    await expect(controller.dimensions()).resolves.toEqual({
      regions: [],
      industries: [],
    });
    expect(service.listDimensionOptions).toHaveBeenCalledTimes(1);
  });

  it('GET bindings 先 assertSiteOperator，再读取绑定', async () => {
    service.getModuleBindings.mockResolvedValue({
      code: 'food',
      regionNodeIds: ['156'],
      industryCodes: ['A'],
    });

    await expect(
      controller.getBindings(mockReq({ externalId: 'operator-1', roles: ['consumer'] }), 'food'),
    ).resolves.toEqual({
      code: 'food',
      regionNodeIds: ['156'],
      industryCodes: ['A'],
    });

    expect(org.assertSiteOperator).toHaveBeenCalledWith('operator-1');
    expect(service.getModuleBindings).toHaveBeenCalledWith('food');
  });

  it('PUT bindings 先 assertSiteOperator，再整体替换绑定', async () => {
    service.replaceModuleBindings.mockResolvedValue({
      code: 'food',
      regionNodeIds: ['156'],
      industryCodes: ['A'],
    });

    await expect(
      controller.putBindings(
        mockReq({ externalId: 'operator-1', roles: ['consumer'] }),
        'food',
        { regionNodeIds: ['156'], industryCodes: ['A'] },
      ),
    ).resolves.toEqual({
      code: 'food',
      regionNodeIds: ['156'],
      industryCodes: ['A'],
    });

    expect(org.assertSiteOperator).toHaveBeenCalledWith('operator-1');
    expect(service.replaceModuleBindings).toHaveBeenCalledWith('food', {
      regionNodeIds: ['156'],
      industryCodes: ['A'],
    });
  });

  it('bindings 门禁失败 → service 不被调用', async () => {
    org.assertSiteOperator.mockRejectedValue(new ForbiddenException());

    await expect(
      controller.getBindings(mockReq({ externalId: 'consumer-1' }), 'food'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      controller.putBindings(mockReq({ externalId: 'consumer-1' }), 'food', {}),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(service.getModuleBindings).not.toHaveBeenCalled();
    expect(service.replaceModuleBindings).not.toHaveBeenCalled();
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
