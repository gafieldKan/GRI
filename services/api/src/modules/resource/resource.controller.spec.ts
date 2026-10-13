import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';
import { OrganizationService } from '../organization/organization.service';
import { ResourceController } from './resource.controller';
import { ResourceService } from './resource.service';

describe('ResourceController', () => {
  let controller: ResourceController;
  let service: jest.Mocked<ResourceService>;
  let org: jest.Mocked<OrganizationService>;

  const mockReq = (auth: Record<string, unknown>): Request =>
    ({ auth } as unknown as Request);

  beforeEach(async () => {
    service = {
      list: jest.fn(),
      setDimension: jest.fn(),
    } as unknown as jest.Mocked<ResourceService>;
    org = {
      assertSiteOperator: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<OrganizationService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ResourceController],
      providers: [
        { provide: ResourceService, useValue: service },
        { provide: OrganizationService, useValue: org },
      ],
    }).compile();

    controller = module.get(ResourceController);
  });

  afterEach(() => jest.clearAllMocks());

  it('GET 将 region/industry/type query 原样交给服务层', async () => {
    service.list.mockResolvedValue([]);

    await expect(controller.list('100000', 'I', 'restaurant')).resolves.toEqual([]);
    expect(service.list).toHaveBeenCalledWith({
      region: '100000',
      industry: 'I',
      type: 'restaurant',
    });
  });

  it('PUT 先 assertSiteOperator，再把 actor 作为审计身份写入', async () => {
    service.setDimension.mockResolvedValue({
      type: 'restaurant',
      id: 'b0000000-0000-0000-0000-000000000001',
      label: '示例食堂',
      regionId: '100000',
      industryId: 'I',
    });

    await expect(
      controller.putDimension(
        mockReq({
          externalId: 'a0000000-0000-0000-0000-000000000001',
          roles: ['operator'],
        }),
        'restaurant',
        'b0000000-0000-0000-0000-000000000001',
        { regionId: '100000', industryId: 'I' },
      ),
    ).resolves.toMatchObject({ type: 'restaurant', regionId: '100000' });

    expect(org.assertSiteOperator).toHaveBeenCalledWith(
      'a0000000-0000-0000-0000-000000000001',
    );
    expect(service.setDimension).toHaveBeenCalledWith(
      'restaurant',
      'b0000000-0000-0000-0000-000000000001',
      { regionId: '100000', industryId: 'I' },
      'a0000000-0000-0000-0000-000000000001',
    );
  });

  it('PUT 缺少 req.auth.externalId → 403，且不调用服务', async () => {
    await expect(
      controller.putDimension(
        mockReq({ sub: 'identity-1', roles: ['operator'] }),
        'restaurant',
        'b0000000-0000-0000-0000-000000000001',
        { regionId: '100000' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(org.assertSiteOperator).not.toHaveBeenCalled();
    expect(service.setDimension).not.toHaveBeenCalled();
  });

  it('非 operator → 403，且不写入维度绑定', async () => {
    org.assertSiteOperator.mockRejectedValue(new ForbiddenException());

    await expect(
      controller.putDimension(
        mockReq({ externalId: 'consumer-1', roles: ['operator'] }),
        'restaurant',
        'b0000000-0000-0000-0000-000000000001',
        { regionId: '100000' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(service.setDimension).not.toHaveBeenCalled();
  });
});
