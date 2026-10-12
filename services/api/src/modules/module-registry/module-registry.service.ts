import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { IdentityService } from '../identity/identity.service';
import {
  AppModule,
  AppModuleRow,
  ModuleBindingInput,
  ModuleBindings,
  ModuleBindingsRow,
  ModuleDimensionOptions,
  ModuleFilter,
  ModuleIndustryOptionRow,
  ModuleRegionOptionRow,
  ModuleSelection,
} from './module-registry.types';

const REGION_BINDING_LEVELS = ['country', 'province'] as const;
const INDUSTRY_BINDING_LEVEL = 'section';

@Injectable()
export class ModuleRegistryService {
  constructor(
    private readonly identityService: IdentityService,
    private readonly db: DatabaseService,
  ) {}

  /**
   * 登录人的可用模块目录。
   * 业务角色由 externalId 对应的数据库身份决定；空 allowed_roles 表示所有登录角色可见。
   */
  async listAvailableModules(
    externalId: string,
    filter: ModuleFilter = {},
  ): Promise<AppModule[]> {
    const profile = await this.identityService.getProfileByExternalId(externalId);
    const role = profile.user.role;
    const { regionId, industryId } = await this.resolveDimensionIds(filter);

    const result = await this.db.query(
      `SELECT am.code, am.name, am.short, am.description, am.icon,
              am.entry_url, am.category, am.allowed_roles, am.is_core,
              am.status, am.sort_order,
              (um.user_id IS NOT NULL) AS selected
         FROM ontology.app_module am
         LEFT JOIN ontology.user_module um
           ON um.module_code = am.code
          AND um.user_id = $2
        WHERE am.status = 'active'
          AND jsonb_typeof(allowed_roles) = 'array'
          AND (jsonb_array_length(allowed_roles) = 0 OR allowed_roles ? $1)
          AND (
            $3::uuid IS NULL
            OR NOT EXISTS (SELECT 1 FROM ontology.module_region scope
                            WHERE scope.module_id = am.id)
            OR EXISTS (
              SELECT 1 FROM ontology.module_region mr
               WHERE mr.module_id = am.id
                 AND mr.region_id = $3
            )
          )
          AND (
            $4::uuid IS NULL
            OR NOT EXISTS (SELECT 1 FROM ontology.module_industry scope
                            WHERE scope.module_id = am.id)
            OR EXISTS (
              SELECT 1 FROM ontology.module_industry mi
               WHERE mi.module_id = am.id
                 AND mi.industry_id = $4
            )
          )
        ORDER BY sort_order ASC NULLS LAST, code ASC`,
      [role, profile.user.id, regionId, industryId],
    );

    return (result.rows as AppModuleRow[]).map((row) => ({
      code: row.code,
      name: row.name,
      short: row.short,
      description: row.description,
      icon: row.icon,
      entryUrl: row.entry_url,
      category: row.category,
      allowedRoles: row.allowed_roles ?? [],
      isCore: row.is_core === true,
      status: row.status,
      sortOrder: row.sort_order,
      selected: row.selected === true,
    }));
  }

  /** 门户选择器可用的维度节点闭集。 */
  async listDimensionOptions(): Promise<ModuleDimensionOptions> {
    const [regionResult, industryResult] = await Promise.all([
      this.db.query(
        `SELECT node_id, code, name, level, parent_id
           FROM ontology.region
          WHERE level IN ('country', 'province')
            AND (status = 'active' OR status IS NULL)
          ORDER BY CASE level WHEN 'country' THEN 0 ELSE 1 END,
                   sort_order ASC NULLS LAST, name ASC, node_id ASC`,
      ),
      this.db.query(
        `SELECT code, name, level, section
           FROM ontology.industry
          WHERE level = 'section'
            AND (status = 'active' OR status IS NULL)
          ORDER BY sort_order ASC NULLS LAST, code ASC`,
      ),
    ]);

    return {
      regions: (regionResult.rows as ModuleRegionOptionRow[]).map((row) => ({
        nodeId: row.node_id,
        code: row.code,
        name: row.name,
        level: row.level,
        parentId: row.parent_id,
      })),
      industries: (industryResult.rows as ModuleIndustryOptionRow[]).map((row) => ({
        code: row.code,
        name: row.name,
        level: row.level,
        section: row.section,
      })),
    };
  }

  /** 指定模块的真实 FK 作用域绑定。 */
  async getModuleBindings(code: string): Promise<ModuleBindings> {
    const result = await this.db.query(
      `SELECT am.code,
              COALESCE((
                SELECT jsonb_agg(r.node_id ORDER BY r.node_id)
                  FROM ontology.app_module scoped_region
                  JOIN ontology.module_region
                    ON module_region.module_id = scoped_region.id
                  JOIN ontology.region r ON r.id = module_region.region_id
                 WHERE scoped_region.id = am.id
              ), '[]'::jsonb) AS region_node_ids,
              COALESCE((
                SELECT jsonb_agg(i.code ORDER BY i.code)
                  FROM ontology.app_module scoped_industry
                  JOIN ontology.module_industry
                    ON module_industry.module_id = scoped_industry.id
                  JOIN ontology.industry i ON i.id = module_industry.industry_id
                 WHERE scoped_industry.id = am.id
              ), '[]'::jsonb) AS industry_codes
         FROM ontology.app_module am
        WHERE am.code = $1`,
      [code],
    );

    const row = result.rows[0] as ModuleBindingsRow | undefined;
    if (!row) throw new NotFoundException('模块不存在');
    return this.mapBindings(row);
  }

  /** operator 整体替换模块作用域；空数组表示清除该维度限定。 */
  async replaceModuleBindings(
    code: string,
    input: ModuleBindingInput,
  ): Promise<ModuleBindings> {
    const regionNodeIds = this.normalizeBindings(input.regionNodeIds, 'regionNodeIds');
    const industryCodes = this.normalizeBindings(input.industryCodes, 'industryCodes');
    const client = await this.db.getPool().connect();
    let transactionOpen = false;

    try {
      await client.query('BEGIN');
      transactionOpen = true;

      const moduleResult = await client.query(
        `SELECT id FROM ontology.app_module WHERE code = $1 FOR UPDATE`,
        [code],
      );
      const moduleId = moduleResult.rows[0]?.id as string | undefined;
      if (!moduleId) throw new NotFoundException('模块不存在');

      const regionIds = await this.resolveBindingRegionIds(client, regionNodeIds);
      const industryIds = await this.resolveBindingIndustryIds(client, industryCodes);

      await client.query(
        `DELETE FROM ontology.module_region WHERE module_id = $1`,
        [moduleId],
      );
      await client.query(
        `DELETE FROM ontology.module_industry WHERE module_id = $1`,
        [moduleId],
      );

      if (regionIds.length > 0) {
        await client.query(
          `INSERT INTO ontology.module_region (module_id, region_id)
           SELECT $1::uuid, selected.region_id
             FROM unnest($2::uuid[]) AS selected(region_id)
           ON CONFLICT (module_id, region_id) DO NOTHING`,
          [moduleId, regionIds],
        );
      }
      if (industryIds.length > 0) {
        await client.query(
          `INSERT INTO ontology.module_industry (module_id, industry_id)
           SELECT $1::uuid, selected.industry_id
             FROM unnest($2::uuid[]) AS selected(industry_id)
           ON CONFLICT (module_id, industry_id) DO NOTHING`,
          [moduleId, industryIds],
        );
      }

      await client.query('COMMIT');
      transactionOpen = false;
      return { code, regionNodeIds, industryCodes };
    } catch (error) {
      if (transactionOpen) await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async enableModule(externalId: string, code: string): Promise<ModuleSelection> {
    const profile = await this.identityService.getProfileByExternalId(externalId);
    const result = await this.db.query(
      `WITH available AS (
         SELECT code
           FROM ontology.app_module
          WHERE code = $3
            AND status = 'active'
            AND jsonb_typeof(allowed_roles) = 'array'
            AND (jsonb_array_length(allowed_roles) = 0 OR allowed_roles ? $2)
       ),
       inserted AS (
         INSERT INTO ontology.user_module (user_id, module_code)
         SELECT $1, code FROM available
         ON CONFLICT (user_id, module_code) DO NOTHING
         RETURNING module_code
       )
       SELECT EXISTS (SELECT 1 FROM available) AS available,
              (SELECT count(*)::int FROM inserted) AS changed`,
      [profile.user.id, profile.user.role, code],
    );

    this.assertAvailable(result.rows[0]);
    return { code, selected: true };
  }

  async disableModule(externalId: string, code: string): Promise<ModuleSelection> {
    const profile = await this.identityService.getProfileByExternalId(externalId);
    const result = await this.db.query(
      `WITH available AS (
         SELECT code
           FROM ontology.app_module
          WHERE code = $3
            AND status = 'active'
            AND jsonb_typeof(allowed_roles) = 'array'
            AND (jsonb_array_length(allowed_roles) = 0 OR allowed_roles ? $2)
       ),
       removed AS (
         DELETE FROM ontology.user_module
          WHERE user_id = $1
            AND module_code IN (SELECT code FROM available)
         RETURNING module_code
       )
       SELECT EXISTS (SELECT 1 FROM available) AS available,
              (SELECT count(*)::int FROM removed) AS changed`,
      [profile.user.id, profile.user.role, code],
    );

    this.assertAvailable(result.rows[0]);
    return { code, selected: false };
  }

  private assertAvailable(row: { available?: boolean } | undefined): void {
    if (row?.available !== true) {
      throw new ForbiddenException('模块当前角色不可用');
    }
  }

  private async resolveDimensionIds(
    filter: ModuleFilter,
  ): Promise<{ regionId: string | null; industryId: string | null }> {
    const region = filter.region?.trim() || null;
    const industry = filter.industry?.trim() || null;
    if (!region && !industry) return { regionId: null, industryId: null };

    const result = await this.db.query(
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

    if (region && !row?.region_id) {
      throw new BadRequestException('region 必须是 country/province 层级的有效节点');
    }
    if (industry && !row?.industry_id) {
      throw new BadRequestException('industry 必须是 section 层级的有效编码');
    }
    return {
      regionId: row?.region_id ?? null,
      industryId: row?.industry_id ?? null,
    };
  }

  private normalizeBindings(values: string[] | undefined, field: string): string[] {
    if (values === undefined) return [];
    if (
      !Array.isArray(values) ||
      values.some((value) => typeof value !== 'string' || value.trim().length === 0)
    ) {
      throw new BadRequestException(`${field} 必须是非空字符串数组`);
    }
    return [...new Set(values.map((value) => value.trim()))];
  }

  private async resolveBindingRegionIds(
    client: { query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> },
    nodeIds: string[],
  ): Promise<string[]> {
    if (nodeIds.length === 0) return [];
    const result = await client.query(
      `SELECT id, node_id, level
         FROM ontology.region
        WHERE node_id = ANY($1::text[])
          AND level IN ('country', 'province')`,
      [nodeIds],
    );
    const levelsValid = result.rows.every((row) =>
      REGION_BINDING_LEVELS.includes(
        row.level as (typeof REGION_BINDING_LEVELS)[number],
      ),
    );
    if (result.rows.length !== nodeIds.length || !levelsValid) {
      throw new BadRequestException('区域绑定仅接受有效的 country/province 节点');
    }
    return result.rows.map((row) => row.id as string);
  }

  private async resolveBindingIndustryIds(
    client: { query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> },
    codes: string[],
  ): Promise<string[]> {
    if (codes.length === 0) return [];
    const result = await client.query(
      `SELECT id, code, level
         FROM ontology.industry
        WHERE code = ANY($1::text[])
          AND level = 'section'`,
      [codes],
    );
    const levelsValid = result.rows.every(
      (row) => row.level === INDUSTRY_BINDING_LEVEL,
    );
    if (result.rows.length !== codes.length || !levelsValid) {
      throw new BadRequestException('行业绑定仅接受有效的 section 编码');
    }
    return result.rows.map((row) => row.id as string);
  }

  private mapBindings(row: ModuleBindingsRow): ModuleBindings {
    return {
      code: row.code,
      regionNodeIds: row.region_node_ids ?? [],
      industryCodes: row.industry_codes ?? [],
    };
  }
}
