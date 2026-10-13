import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { GeoController } from './geo.controller';
import { GeoService } from './geo.service';

describe('GeoController', () => {
  let controller: GeoController;
  let service: jest.Mocked<GeoService>;

  beforeEach(async () => {
    service = {
      getRegionSlice: jest.fn(),
    } as unknown as jest.Mocked<GeoService>;
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GeoController],
      providers: [{ provide: GeoService, useValue: service }],
    }).compile();
    controller = module.get(GeoController);
  });

  it('GET /geo/regions/:countryId 透传国家 id', async () => {
    service.getRegionSlice.mockResolvedValue({
      type: 'FeatureCollection',
      features: [],
    });

    await expect(controller.regionSlice('100000')).resolves.toEqual({
      type: 'FeatureCollection',
      features: [],
    });
    expect(service.getRegionSlice).toHaveBeenCalledWith('100000');
  });

  it('服务层 404 原样透传', async () => {
    service.getRegionSlice.mockRejectedValue(new NotFoundException());
    await expect(controller.regionSlice('999999')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
