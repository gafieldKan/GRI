import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { IdentityService } from '../identity/identity.service';
import { AppModule, AppModuleRow } from './module-registry.types';

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
              allowed_roles, is_core, status, sort_order
         FROM ontology.app_module
        WHERE status = 'active'
          AND jsonb_typeof(allowed_roles) = 'array'
          AND (jsonb_array_length(allowed_roles) = 0 OR allowed_roles ? $1)
        ORDER BY sort_order ASC NULLS LAST, code ASC`,
      [role],
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
    }));
  }
}
