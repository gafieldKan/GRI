import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  RESOURCE_TYPES,
  ResourceDimension,
  ResourceDimensionInput,
  ResourceDimensionRow,
  ResourceFilter,
  ResourceRow,
  ResourceType,
} from './resource.types';

interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class ResourceService {
  constructor(private readonly db: DatabaseService) {}

  /** 公开读：按区域 node_id、行业 code 与资源类型过滤已绑定资源。 */
  async list(filter: ResourceFilter = {}): Promise<ResourceDimension[]> {
    const type = filter.type === undefined ? null : this.requireType(filter.type);
    const region = this.normalizeFilterValue(filter.region, 'region');
    const industry = this.normalizeFilterValue(filter.industry, 'industry');

    let regionId: string | null = null;
    let industryId: string | null = null;
    if (region !== null || industry !== null) {
      const resolved = await this.resolveDimensions(this.db, region, industry);
      regionId = resolved.regionId;
      industryId = resolved.industryId;
    }

    const result = await this.db.query(
      `SELECT rd.resource_type,
              rd.resource_id,
              COALESCE(r.name, o.name) AS label,
              rg.node_id AS region_id,
              ind.code AS industry_id
         FROM ontology.resource_dimension rd
         LEFT JOIN public.restaurants r
           ON rd.resource_type = 'restaurant'
          AND r.id = rd.resource_id
         LEFT JOIN tenant.organizations o
           ON rd.resource_type = 'organization'
          AND o.id = rd.resource_id
         LEFT JOIN ontology.region rg ON rg.id = rd.region_id
         LEFT JOIN ontology.industry ind ON ind.id = rd.industry_id
        WHERE (
                (rd.resource_type = 'restaurant' AND r.id IS NOT NULL)
             OR (rd.resource_type = 'organization' AND o.id IS NOT NULL)
              )
          AND ($1::uuid IS NULL OR rd.region_id = $1)
          AND ($2::uuid IS NULL OR rd.industry_id = $2)
          AND ($3::text IS NULL OR rd.resource_type = $3)
        ORDER BY rd.resource_type ASC, label ASC NULLS LAST, rd.resource_id ASC`,
      [regionId, industryId, type],
    );

    return (result.rows as ResourceRow[]).map((row) => ({
      type: row.resource_type,
      id: row.resource_id,
      label: row.label ?? '',
      regionId: row.region_id,
      industryId: row.industry_id,
    }));
  }

  /** operator 写：设置/替换资源绑定的区域与行业维度，并写维度变更审计。 */
  async setDimension(
    rawType: string,
    resourceId: string,
    input: ResourceDimensionInput,
    actorId: string,
  ): Promise<ResourceDimension> {
    const type = this.requireType(rawType);
    const id = this.requireUuid(resourceId, 'id');
    if (!input || typeof input !== 'object') {
      throw new BadRequestException('dimension 请求体必须是对象');
    }

    const hasRegion = Object.prototype.hasOwnProperty.call(input, 'regionId');
    const hasIndustry = Object.prototype.hasOwnProperty.call(input, 'industryId');
    if (!hasRegion && !hasIndustry) {
      throw new BadRequestException('至少提供 regionId 或 industryId');
    }

    const rawRegion = hasRegion
      ? this.normalizeNullableInput(input.regionId, 'regionId')
      : undefined;
    const rawIndustry = hasIndustry
      ? this.normalizeNullableInput(input.industryId, 'industryId')
      : undefined;

    const client = await this.db.getPool().connect();
    let transactionOpen = false;
    try {
      await client.query('BEGIN');
      transactionOpen = true;

      const resource = await this.findResource(client, type, id);
      if (!resource) throw new NotFoundException('资源不存在');

      const existingResult = await client.query(
        `SELECT rd.region_id, rd.industry_id,
                rg.node_id AS region_node_id,
                ind.code AS industry_code
           FROM ontology.resource_dimension rd
           LEFT JOIN ontology.region rg ON rg.id = rd.region_id
           LEFT JOIN ontology.industry ind ON ind.id = rd.industry_id
          WHERE rd.resource_type = $1
            AND rd.resource_id = $2
          FOR UPDATE OF rd`,
        [type, id],
      );
      const existing = existingResult.rows[0] as ResourceDimensionRow | undefined;

      const regionId = hasRegion
        ? await this.resolveRegionId(client, rawRegion ?? null)
        : existing?.region_id ?? null;
      const industryId = hasIndustry
        ? await this.resolveIndustryId(client, rawIndustry ?? null)
        : existing?.industry_id ?? null;

      const regionAnchor: string | null = hasRegion
        ? rawRegion ?? null
        : existing?.region_node_id ?? null;
      const industryAnchor: string | null = hasIndustry
        ? rawIndustry ?? null
        : existing?.industry_code ?? null;

      await client.query(
        `INSERT INTO ontology.resource_dimension
           (resource_type, resource_id, region_id, industry_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (resource_type, resource_id)
         DO UPDATE SET region_id = EXCLUDED.region_id,
                       industry_id = EXCLUDED.industry_id`,
        [type, id, regionId, industryId],
      );

      const before = existing
        ? {
            regionId: existing.region_node_id ?? null,
            industryId: existing.industry_code ?? null,
          }
        : {};
      const after = { regionId: regionAnchor, industryId: industryAnchor };
      await client.query(
        `INSERT INTO ontology.dimension_change_log
           (dimension, target_id, op, before, after, actor_id, source)
         VALUES ($1, $2, 'update', $3, $4, $5, $6)`,
        [
          'resource_dimension',
          `${type}:${id}`,
          JSON.stringify(before),
          JSON.stringify(after),
          actorId,
          'manual',
        ],
      );

      await client.query('COMMIT');
      transactionOpen = false;
      return {
        type,
        id,
        label: resource.name,
        regionId: regionAnchor,
        industryId: industryAnchor,
      };
    } catch (error) {
      if (transactionOpen) await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private requireType(value: string | undefined): ResourceType {
    const type = String(value ?? '').trim();
    if (!RESOURCE_TYPES.includes(type as ResourceType)) {
      throw new BadRequestException(
        `type 必须是 ${RESOURCE_TYPES.join('|')}`,
      );
    }
    return type as ResourceType;
  }

  private requireUuid(value: string, field: string): string {
    if (!UUID_RE.test(value)) {
      throw new BadRequestException(`${field} 必须是合法 UUID`);
    }
    return value;
  }

  private normalizeFilterValue(
    value: string | undefined,
    field: string,
  ): string | null {
    if (value === undefined) return null;
    const normalized = String(value).trim();
    if (!normalized) throw new BadRequestException(`${field} 不能为空`);
    return normalized;
  }

  private normalizeNullableInput(
    value: string | null | undefined,
    field: string,
  ): string | null {
    if (value === null) return null;
    if (typeof value !== 'string') {
      throw new BadRequestException(`${field} 必须是 string 或 null`);
    }
    const normalized = value.trim();
    if (!normalized) throw new BadRequestException(`${field} 不能为空`);
    return normalized;
  }

  private async resolveDimensions(
    queryable: Queryable,
    region: string | null,
    industry: string | null,
  ): Promise<{ regionId: string | null; industryId: string | null }> {
    const result = await queryable.query(
      `SELECT (
                SELECT id FROM ontology.region
                 WHERE node_id = $1
                   AND level IN ('country', 'province')
              ) AS region_id,
              (
                SELECT id FROM ontology.industry
                 WHERE code = $2
                   AND level = 'section'
              ) AS industry_id`,
      [region, industry],
    );
    const row = result.rows[0] as
      | { region_id: string | null; industry_id: string | null }
      | undefined;
    if (region !== null && !row?.region_id) {
      throw new BadRequestException('region 必须是 country/province 层级的有效节点');
    }
    if (industry !== null && !row?.industry_id) {
      throw new BadRequestException('industry 必须是 section 层级的有效编码');
    }
    return {
      regionId: row?.region_id ?? null,
      industryId: row?.industry_id ?? null,
    };
  }

  private async resolveRegionId(
    queryable: Queryable,
    regionAnchor: string | null,
  ): Promise<string | null> {
    if (regionAnchor === null) return null;
    const result = await queryable.query(
      `SELECT id, node_id
         FROM ontology.region
        WHERE node_id = $1
          AND level IN ('country', 'province')`,
      [regionAnchor],
    );
    const row = result.rows[0] as { id: string } | undefined;
    if (!row) {
      throw new BadRequestException('regionId 必须是 country/province 层级的有效节点');
    }
    return row.id;
  }

  private async resolveIndustryId(
    queryable: Queryable,
    industryAnchor: string | null,
  ): Promise<string | null> {
    if (industryAnchor === null) return null;
    const result = await queryable.query(
      `SELECT id, code
         FROM ontology.industry
        WHERE code = $1
          AND level = 'section'`,
      [industryAnchor],
    );
    const row = result.rows[0] as { id: string } | undefined;
    if (!row) {
      throw new BadRequestException('industryId 必须是 section 层级的有效编码');
    }
    return row.id;
  }

  private async findResource(
    queryable: Queryable,
    type: ResourceType,
    id: string,
  ): Promise<{ id: string; name: string } | null> {
    const table =
      type === 'restaurant' ? 'public.restaurants' : 'tenant.organizations';
    const result = await queryable.query(
      `SELECT id, name FROM ${table} WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const row = result.rows[0] as { id: string; name: string } | undefined;
    return row ?? null;
  }
}
