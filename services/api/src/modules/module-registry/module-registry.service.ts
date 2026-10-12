import { ForbiddenException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { IdentityService } from '../identity/identity.service';
import { AppModule, AppModuleRow, ModuleSelection } from './module-registry.types';

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
  async listAvailableModules(externalId: string): Promise<AppModule[]> {
    const profile = await this.identityService.getProfileByExternalId(externalId);
    const role = profile.user.role;

    const result = await this.db.query(
      `SELECT code, name, short, description, icon, entry_url, category,
              allowed_roles, is_core, status, sort_order,
              (um.user_id IS NOT NULL) AS selected
         FROM ontology.app_module
         LEFT JOIN ontology.user_module um
           ON um.module_code = code
          AND um.user_id = $2
        WHERE status = 'active'
          AND jsonb_typeof(allowed_roles) = 'array'
          AND (jsonb_array_length(allowed_roles) = 0 OR allowed_roles ? $1)
        ORDER BY sort_order ASC NULLS LAST, code ASC`,
      [role, profile.user.id],
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
}
