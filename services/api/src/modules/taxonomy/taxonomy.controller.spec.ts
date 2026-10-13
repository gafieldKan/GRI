import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationService } from '../organization/organization.service';
import { CommandService } from './command.service';
import { TaxonomyController } from './taxonomy.controller';
import { TaxonomyService } from './taxonomy.service';

// CommandService 依赖 @gri/agent-core（ESM）；jest 无法直接解析 → mock（同 T6/T7 惯例）。
jest.mock('@gri/agent-core', () => ({
  LlmClient: class {
    async chat() {
      return { content: '[]' };
    }
  },
}));

describe('TaxonomyController', () => {
  let controller: TaxonomyController;
  let service: jest.Mocked<TaxonomyService>;
  let org: { assertSiteOperator: jest.Mock };

  beforeEach(async () => {
    service = {
      children: jest.fn(),
      getNode: jest.fn(),
      search: jest.fn(),
      path: jest.fn(),
      createNode: jest.fn(),
    } as unknown as jest.Mocked<TaxonomyService>;
    org = { assertSiteOperator: jest.fn(async () => undefined) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TaxonomyController],
      providers: [
        { provide: TaxonomyService, useValue: service },
        { provide: OrganizationService, useValue: org },
        {
          provide: CommandService,
          useValue: { propose: jest.fn(), apply: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get(TaxonomyController);
  });

  it('children 将 name 与 parent 原样传到服务层', async () => {
    service.children.mockResolvedValue({ parent: {} as never, children: [] });

    await expect(controller.children('region', '100000')).resolves.toEqual({
      parent: {},
      children: [],
    });
    expect(service.children).toHaveBeenCalledWith('region', '100000');
  });

  it('node/search/path 使用对应路径参数和 query', async () => {
    service.getNode.mockResolvedValue({ id: 'A' } as never);
    service.search.mockResolvedValue({ query: '农业', limit: 5, items: [] });
    service.path.mockResolvedValue({ nodes: [] });

    await controller.node('industry', 'A');
    await controller.search('industry', '农业', '5');
    await controller.path('industry', 'A');

    expect(service.getNode).toHaveBeenCalledWith('industry', 'A');
    expect(service.search).toHaveBeenCalledWith('industry', '农业', '5');
    expect(service.path).toHaveBeenCalledWith('industry', 'A');
  });

  it('服务层 404 原样透传', async () => {
    service.getNode.mockRejectedValue(new NotFoundException('节点不存在'));

    await expect(controller.node('region', '999999')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('create：operator 门禁 + externalId 作操作者，body 原样下传', async () => {
    service.createNode.mockResolvedValue({ id: '990000' } as never);
    const body = { code: '990000', name: '测试国', parentId: '9000030' };

    await expect(
      controller.create({ auth: { externalId: 'op-1' } } as never, 'region', body),
    ).resolves.toEqual({ id: '990000' });
    expect(org.assertSiteOperator).toHaveBeenCalledWith('op-1');
    expect(service.createNode).toHaveBeenCalledWith('region', body, 'op-1');
  });

  it('create：缺外部身份标识 → 403，门禁与服务层均不触达', async () => {
    await expect(
      controller.create({ auth: {} } as never, 'region', {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(org.assertSiteOperator).not.toHaveBeenCalled();
    expect(service.createNode).not.toHaveBeenCalled();
  });

  it('create：非 operator（门禁抛 403）→ 逐字透传且不落库', async () => {
    org.assertSiteOperator.mockRejectedValueOnce(new ForbiddenException('需要站点运营权限'));

    await expect(
      controller.create({ auth: { externalId: 'u-9' } } as never, 'region', { code: '990000' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.createNode).not.toHaveBeenCalled();
  });
});
