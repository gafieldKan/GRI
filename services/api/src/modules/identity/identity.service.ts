import {
  Injectable,
  Logger,
  NotFoundException,
  BadGatewayException,
  HttpException,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { loadConfig } from '../../config/config';
import { User, Student, UserProfile } from './identity.types';

/**
 * 允许用户自助更新的个人资料字段（白名单）。
 * 严禁用户改 id / role / status / password / created_at / updated_at——防提权与越权。
 * status/role 仅可经审计的操作员接口变更（M4 organization 权限收敛时补）。
 */
const SELF_UPDATEABLE_FIELDS = new Set(['username', 'email', 'phone', 'name', 'avatar_url']);

@Injectable()
export class IdentityService {
  private readonly logger = new Logger(IdentityService.name);
  private readonly identityCfg = loadConfig().identity;

  constructor(private readonly db: DatabaseService) {}

  /**
   * 根据 external_id (public.users.id) 获取完整档案。
   * 契约：external_id ≡ users.id；已注销（deleted_at 非空）视为不存在。
   */
  async getProfileByExternalId(externalId: string): Promise<UserProfile> {
    const userRes = await this.db.query(
      'SELECT * FROM public.users WHERE id = $1 AND deleted_at IS NULL',
      [externalId],
    );

    if (userRes.rows.length === 0) {
      throw new NotFoundException(`User not found with externalId: ${externalId}`);
    }

    const user = userRes.rows[0] as User;

    // 若角色是 student，则尝试拉取 edu.students 扩展档案
    let student: Student | undefined;
    if (user.role === 'student') {
      const studentRes = await this.db.query(
        'SELECT * FROM edu.students WHERE user_id = $1',
        [externalId],
      );
      if (studentRes.rows.length > 0) {
        student = studentRes.rows[0] as Student;
      }
    }

    return { user, student };
  }

  async updateProfile(externalId: string, data: Partial<User>): Promise<User> {
    // 白名单过滤：只允许自助更新安全字段，丢弃 role/status/password/id 等受保护列
    const updateData = Object.fromEntries(
      Object.entries(data).filter(([k]) => SELF_UPDATEABLE_FIELDS.has(k)),
    );
    const keys = Object.keys(updateData);
    if (keys.length === 0) {
      // 没有可更新字段：读回当前档案返回（幂等，不报错）
      const res = await this.db.query(
        'SELECT * FROM public.users WHERE id = $1 AND deleted_at IS NULL',
        [externalId],
      );
      if (res.rows.length === 0) {
        throw new NotFoundException(`User not found with externalId: ${externalId}`);
      }
      return res.rows[0];
    }

    // 列名全部来自白名单集合，无注入风险；$1 恒为 externalId（唯一身份入口）
    const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const values = [externalId, ...keys.map((k) => (updateData as any)[k])];

    const res = await this.db.query(
      `UPDATE public.users SET ${setClause}, updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      values,
    );
    if (res.rows.length === 0) {
      throw new NotFoundException(`User not found with externalId: ${externalId}`);
    }
    return res.rows[0] as User;
  }

  /**
   * 注销本人档案（`DELETE /api/identity/me`）——编排两段，安全优先：
   *   1. 先停用 auth-center 凭证（status='disabled' + 吊销 refresh token）：失败则中止 502，不动 users；
   *   2. 再**软删** public.users（status='deleted' + deleted_at）：不硬删（跨库 CASCADE 触达不到
   *      gri_auth.identities，硬删会留可登录的孤儿身份）。
   * 幂等：已注销再删 → NotFoundException（外部可当成功处理）。
   */
  async deleteProfile(externalId: string): Promise<void> {
    await this.disableAuthIdentity(externalId);

    const res = await this.db.query(
      `UPDATE public.users SET status = 'deleted', deleted_at = NOW(), updated_at = NOW()
        WHERE id = $1 AND deleted_at IS NULL`,
      [externalId],
    );
    if (res.rowCount === 0) {
      throw new NotFoundException(`User not found with externalId: ${externalId}`);
    }
  }

  /** 调 auth-center 服务间面停用身份（按 external_id，防 IDOR）。404=本就不存在，视为成功。 */
  private async disableAuthIdentity(externalId: string): Promise<void> {
    try {
      const res = await fetch(
        `${this.identityCfg.authCenterUrl}/auth/admin/identities/${encodeURIComponent(externalId)}`,
        {
          method: 'DELETE',
          headers: { 'x-service-token': this.identityCfg.serviceToken },
          signal: AbortSignal.timeout(5000),
        },
      );
      if (!res.ok && res.status !== 404) {
        throw new BadGatewayException('身份停用失败');
      }
    } catch (e) {
      if (e instanceof HttpException) throw e;
      this.logger.error(`停用 auth-center 身份失败 externalId=${externalId}: ${(e as Error).message}`);
      throw new BadGatewayException('身份服务不可达');
    }
  }
}
