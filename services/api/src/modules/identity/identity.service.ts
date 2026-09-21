import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { User, Student, UserProfile } from './identity.types';

/**
 * 允许用户自助更新的个人资料字段（白名单）。
 * 严禁用户改 id / role / status / password / created_at / updated_at——防提权与越权。
 * status/role 仅可经审计的操作员接口变更（M4 organization 权限收敛时补）。
 */
const SELF_UPDATEABLE_FIELDS = new Set(['username', 'email', 'phone', 'name', 'avatar_url']);

@Injectable()
export class IdentityService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * 根据 external_id (public.users.id) 获取完整档案。
   * 契约：external_id ≡ users.id
   */
  async getProfileByExternalId(externalId: string): Promise<UserProfile> {
    const userRes = await this.db.query(
      'SELECT * FROM public.users WHERE id = $1',
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
      const res = await this.db.query('SELECT * FROM public.users WHERE id = $1', [externalId]);
      if (res.rows.length === 0) {
        throw new NotFoundException(`User not found with externalId: ${externalId}`);
      }
      return res.rows[0];
    }

    // 列名全部来自白名单集合，无注入风险；$1 恒为 externalId（唯一身份入口）
    const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const values = [externalId, ...keys.map((k) => (updateData as any)[k])];

    const res = await this.db.query(
      `UPDATE public.users SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      values,
    );
    if (res.rows.length === 0) {
      throw new NotFoundException(`User not found with externalId: ${externalId}`);
    }
    return res.rows[0] as User;
  }
}
