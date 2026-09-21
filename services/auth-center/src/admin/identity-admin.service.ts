import { Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { DatabaseService } from '../database/database.service';

/**
 * 身份目录管理（服务间内部面）。不对外开放浏览器访问：
 * 由业务后端 api 在 assertSiteOperator 通过后，携带共享 SERVICE_TOKEN 代查，
 * 从而把「谁能枚举身份(PII)」的单点权威仍握在业务端（站点运营门槛）。
 */
@Injectable()
export class IdentityAdminService {
  constructor(private readonly db: DatabaseService) {}

  private serviceToken(): string {
    return process.env.SERVICE_TOKEN ?? 'gri-service-token';
  }

  /** 校验服务间令牌（时序安全比对）。浏览器侧无此头 → 一律 401。 */
  authorize(tokenHeader: string | undefined | null): void {
    const expected = Buffer.from(this.serviceToken());
    const got = Buffer.from(String(tokenHeader ?? ''));
    if (expected.length !== got.length || !timingSafeEqual(expected, got)) {
      throw new UnauthorizedException('Invalid service token');
    }
  }

  /** 按 username/email/name 模糊查身份（PII，仅运营可经 api 代查）。 */
  async lookup(q?: string, limit = 10): Promise<Record<string, unknown>[]> {
    if (!Number.isFinite(limit) || limit < 1 || limit > 100) limit = 10;
    const cols = 'id, username, email, name, external_id, status';
    const trimmed = (q ?? '').trim();
    if (!trimmed) {
      const { rows } = await this.db.query(
        `SELECT ${cols} FROM identities ORDER BY created_at DESC LIMIT $1`,
        [limit],
      );
      return rows;
    }
    const like = `%${trimmed}%`;
    const { rows } = await this.db.query(
      `SELECT ${cols} FROM identities
         WHERE username ILIKE $1 OR email ILIKE $1 OR name ILIKE $1
         ORDER BY created_at DESC LIMIT $2`,
      [like, limit],
    );
    return rows;
  }

  /** 业务主键（external_id ?? id）→ 身份。api 侧按 userId 供给 public.users 时用。 */
  async byBusinessId(
    businessId: string,
  ): Promise<Record<string, unknown> | null> {
    const { rows } = await this.db.query(
      `SELECT id, username, email, name, external_id, status FROM identities
         WHERE id = $1::uuid OR external_id = $2 LIMIT 1`,
      [businessId, businessId],
    );
    return rows.length ? rows[0] : null;
  }
}