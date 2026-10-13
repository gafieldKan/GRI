import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseService } from '../../database/database.service';
import { GeoService, GeoDataPaths } from './geo.service';

function feature(adcode: number, name: string, level = 'province') {
  return {
    type: 'Feature',
    properties: { adcode, name, level },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [116.0, 39.0],
          [117.0, 39.0],
          [117.0, 40.0],
          [116.0, 39.0],
        ],
      ],
    },
  };
}

function writeCollection(path: string, features: unknown[]) {
  writeFileSync(path, JSON.stringify({ type: 'FeatureCollection', features }));
}

describe('GeoService', () => {
  let dir: string;
  let paths: GeoDataPaths;
  let query: jest.Mock;
  let db: DatabaseService;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gri-geo-'));
    paths = {
      world: join(dir, 'world.geo.json'),
      maps: join(dir, 'maps.geo.json'),
    };
    query = jest.fn().mockResolvedValue({
      rows: [
        { node_id: '100000', level: 'country', parent_id: '9000030' },
        { node_id: '110000', level: 'province', parent_id: '100000' },
        { node_id: '9000030', level: 'subregion', parent_id: '9000142' },
      ],
    });
    db = { query } as unknown as DatabaseService;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('world → 返回国界 FeatureCollection，且只从世界源懒加载一次', async () => {
    writeCollection(paths.world, [feature(100000, '中国', 'country')]);
    const service = new GeoService(db, paths);

    const first = await service.getRegionSlice('world');
    unlinkSync(paths.world);
    const second = await service.getRegionSlice('world');

    expect(first.type).toBe('FeatureCollection');
    expect(first.features).toHaveLength(1);
    expect(second.features).toHaveLength(1);
    expect(query).not.toHaveBeenCalled();
  });

  it('国家切片按 ontology.region 祖先归组并缓存', async () => {
    writeCollection(paths.maps, [
      feature(110000, '北京市'),
      feature(120000, '天津市'),
      feature(310000, '上海市'),
    ]);
    query.mockResolvedValue({
      rows: [
        { node_id: '100000', level: 'country', parent_id: '9000030' },
        { node_id: '110000', level: 'province', parent_id: '100000' },
        { node_id: '120000', level: 'province', parent_id: '100000' },
        { node_id: '310000', level: 'province', parent_id: '200000' },
      ],
    });
    const service = new GeoService(db, paths);

    const first = await service.getRegionSlice('100000');
    const second = await service.getRegionSlice('100000');

    expect(first).toEqual({
      type: 'FeatureCollection',
      features: [feature(110000, '北京市'), feature(120000, '天津市')],
    });
    expect(second).toEqual(first);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql] = query.mock.calls[0] as [string];
    expect(sql).toContain('ontology.region');
    expect(sql).not.toContain('public.users');
    expect(sql).not.toContain('tenant.');
  });

  it('未知国家 → 404，非法 countryId → 400 且不读源文件', async () => {
    writeCollection(paths.maps, [feature(110000, '北京市')]);
    const service = new GeoService(db, paths);

    await expect(service.getRegionSlice('999999')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.getRegionSlice('../world')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.getRegionSlice('china')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
