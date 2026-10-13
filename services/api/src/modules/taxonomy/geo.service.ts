import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseService } from '../../database/database.service';
import {
  GeoFeature,
  GeoFeatureCollection,
  RegionHierarchyRow,
} from './geo.types';

export const GEO_DATA_PATHS = Symbol('GEO_DATA_PATHS');

export interface GeoDataPaths {
  world: string;
  maps: string;
}

type Position = [number, number];

const COUNTRY_ID_PATTERN = /^\d{3,18}$/;
const DEFAULT_TOLERANCE = 0.02;
const WORLD_TOLERANCE = 0.08;

@Injectable()
export class GeoService {
  private worldPromise?: Promise<GeoFeatureCollection>;
  private countrySlicesPromise?: Promise<Map<string, GeoFeatureCollection>>;

  constructor(
    private readonly db: DatabaseService,
    @Optional() @Inject(GEO_DATA_PATHS) private readonly paths?: GeoDataPaths,
  ) {}

  async getRegionSlice(countryId: string): Promise<GeoFeatureCollection> {
    const normalized = typeof countryId === 'string' ? countryId.trim() : '';
    if (normalized === 'world') return this.loadWorld();
    if (!COUNTRY_ID_PATTERN.test(normalized)) {
      throw new BadRequestException('countryId 非法');
    }

    const slices = await this.loadCountrySlices();
    const slice = slices.get(normalized);
    if (!slice) throw new NotFoundException('该国暂无下级几何数据');
    return slice;
  }

  private async loadWorld(): Promise<GeoFeatureCollection> {
    if (!this.worldPromise) {
      this.worldPromise = this.readCollection(this.dataPaths().world)
        .then((collection) => this.simplifyCollection(collection, WORLD_TOLERANCE))
        .catch((error) => {
          this.worldPromise = undefined;
          throw error;
        });
    }
    return this.worldPromise;
  }

  private async loadCountrySlices(): Promise<Map<string, GeoFeatureCollection>> {
    if (!this.countrySlicesPromise) {
      this.countrySlicesPromise = this.buildCountrySlices().catch((error) => {
        this.countrySlicesPromise = undefined;
        throw error;
      });
    }
    return this.countrySlicesPromise;
  }

  private async buildCountrySlices(): Promise<Map<string, GeoFeatureCollection>> {
    const [collection, hierarchyResult] = await Promise.all([
      this.readCollection(this.dataPaths().maps),
      this.db.query(
        `SELECT r.node_id,
                r.level,
                parent.node_id AS parent_id
           FROM ontology.region r
           LEFT JOIN ontology.region parent ON parent.id = r.parent_id
          WHERE r.status = 'active' OR r.status IS NULL`,
      ),
    ]);

    const hierarchy = new Map<string, RegionHierarchyRow>();
    for (const row of hierarchyResult.rows as RegionHierarchyRow[]) {
      hierarchy.set(String(row.node_id), row);
    }

    const grouped = new Map<string, GeoFeature[]>();
    for (const sourceFeature of collection.features) {
      const countryId = this.countryForFeature(sourceFeature, hierarchy);
      if (!countryId) continue;
      const next = this.simplifyFeature(sourceFeature, DEFAULT_TOLERANCE);
      const features = grouped.get(countryId);
      if (features) features.push(next);
      else grouped.set(countryId, [next]);
    }

    const slices = new Map<string, GeoFeatureCollection>();
    for (const [countryId, features] of grouped) {
      slices.set(countryId, { type: 'FeatureCollection', features });
    }
    return slices;
  }

  private countryForFeature(
    feature: GeoFeature,
    hierarchy: Map<string, RegionHierarchyRow>,
  ): string | null {
    const adcode = feature.properties?.adcode;
    let current = adcode === undefined || adcode === null ? '' : String(adcode);
    let guard = 0;

    while (current && hierarchy.has(current) && guard++ < 30) {
      const node = hierarchy.get(current)!;
      if (node.level === 'country') return current;
      current = node.parent_id ? String(node.parent_id) : '';
    }
    return null;
  }

  private async readCollection(filePath: string): Promise<GeoFeatureCollection> {
    try {
      const raw = await readFile(filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<GeoFeatureCollection>;
      if (parsed.type !== 'FeatureCollection' || !Array.isArray(parsed.features)) {
        throw new Error('invalid collection');
      }
      return {
        type: 'FeatureCollection',
        features: parsed.features as GeoFeature[],
      };
    } catch {
      throw new ServiceUnavailableException('几何数据暂不可用');
    }
  }

  private simplifyCollection(
    collection: GeoFeatureCollection,
    tolerance: number,
  ): GeoFeatureCollection {
    return {
      type: 'FeatureCollection',
      features: collection.features.map((feature) =>
        this.simplifyFeature(feature, tolerance),
      ),
    };
  }

  private simplifyFeature(feature: GeoFeature, tolerance: number): GeoFeature {
    const geometry = feature.geometry;
    if (!geometry) return feature;

    if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
      return {
        ...feature,
        geometry: {
          type: geometry.type,
          coordinates: geometry.coordinates.map((ring) =>
            this.simplifyRing(ring, tolerance),
          ),
        },
      };
    }

    if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
      return {
        ...feature,
        geometry: {
          type: geometry.type,
          coordinates: geometry.coordinates.map((polygon) =>
            Array.isArray(polygon)
              ? polygon.map((ring) => this.simplifyRing(ring, tolerance))
              : polygon,
          ),
        },
      };
    }

    return feature;
  }

  private simplifyRing(ring: unknown, tolerance: number): unknown {
    if (!Array.isArray(ring) || !ring.every(this.isPosition)) return ring;
    if (ring.length < 3) return ring;

    const keep = new Array<boolean>(ring.length).fill(false);
    keep[0] = true;
    keep[ring.length - 1] = true;
    const stack: Array<[number, number]> = [[0, ring.length - 1]];

    while (stack.length > 0) {
      const [start, end] = stack.pop()!;
      if (end <= start + 1) continue;

      const [ax, ay] = ring[start];
      const [bx, by] = ring[end];
      const dx = bx - ax;
      const dy = by - ay;
      const segmentLengthSquared = dx * dx + dy * dy;
      let maxDistanceSquared = tolerance * tolerance;
      let maxIndex = -1;

      for (let index = start + 1; index < end; index++) {
        const [px, py] = ring[index];
        let distanceSquared: number;
        if (segmentLengthSquared === 0) {
          distanceSquared = (px - ax) ** 2 + (py - ay) ** 2;
        } else {
          const projection = Math.max(
            0,
            Math.min(
              1,
              ((px - ax) * dx + (py - ay) * dy) / segmentLengthSquared,
            ),
          );
          const qx = ax + projection * dx;
          const qy = ay + projection * dy;
          distanceSquared = (px - qx) ** 2 + (py - qy) ** 2;
        }
        if (distanceSquared > maxDistanceSquared) {
          maxDistanceSquared = distanceSquared;
          maxIndex = index;
        }
      }

      if (maxIndex > 0) {
        keep[maxIndex] = true;
        stack.push([start, maxIndex], [maxIndex, end]);
      }
    }

    return ring.filter((_, index) => keep[index]);
  }

  private isPosition(value: unknown): value is Position {
    return (
      Array.isArray(value) &&
      value.length >= 2 &&
      typeof value[0] === 'number' &&
      typeof value[1] === 'number'
    );
  }

  private dataPaths(): GeoDataPaths {
    if (this.paths) return this.paths;
    const dataDir = resolve(
      __dirname,
      '../../../../..',
      'scripts',
      'reference-data',
      'data',
    );
    return {
      world: resolve(dataDir, 'un-regions.geo.json'),
      maps: resolve(dataDir, 'un-regions-maps.geo.json'),
    };
  }
}
