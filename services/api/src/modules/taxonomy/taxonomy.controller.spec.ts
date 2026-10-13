import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TaxonomyController } from './taxonomy.controller';
import { TaxonomyService } from './taxonomy.service';

describe('TaxonomyController', () => {
  let controller: TaxonomyController;
  let service: jest.Mocked<TaxonomyService>;

  beforeEach(async () => {
    service = {
      children: jest.fn(),
      getNode: jest.fn(),
      search: jest.fn(),
      path: jest.fn(),
    } as unknown as jest.Mocked<TaxonomyService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TaxonomyController],
      providers: [{ provide: TaxonomyService, useValue: service }],
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
});
