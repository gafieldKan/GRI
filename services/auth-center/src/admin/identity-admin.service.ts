import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { DatabaseService } from '../database/database.service';
import { CreateIdentityDto } from '../auth/dto/auth.dto';

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

  /**
   * 创建身份（服务间写面）—— 注册编排第二步。
   * external_id 由业务后端注入（= public.users.id，唯一映射点）；本面永不接受空值。
   * bcrypt(12) 哈希密码；username/email/phone 命中既有 → 409（幂等门禁）。
   * 返回脱敏身份（不含 password_hash）。
   */
  async createIdentity(dto: CreateIdentityDto): Promise<Record<string, unknown>> {
    const email = dto.email ? dto.email.toLowerCase() : null;
    const dup = await this.db.query(
      `SELECT id FROM identities
         WHERE ($1::text IS NOT NULL AND username = $1)
            OR ($2::text IS NOT NULL AND email = $2)
            OR ($3::text IS NOT NULL AND phone = $3)
         LIMIT 1`,
      [dto.username ?? null, email, dto.phone ?? null],
    );
    if (dup.rows.length) throw new ConflictException('账户已存在');

    const hash = await bcrypt.hash(dto.password, 12);
    const { rows } = await this.db.query(
      `INSERT INTO identities (domain, username, email, phone, password_hash, name, external_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'active')
       RETURNING id, domain, username, email, phone, name, external_id, status, created_at`,
      [dto.domain, dto.username ?? null, email, dto.phone ?? null, hash, dto.name ?? null, dto.externalId],
    );
    return rows[0];
  }

  /**
   * 停用身份（服务间写面）—— 注销编排第一步（安全优先）。
   * 按 external_id 定位（= public.users.id），置 status='disabled' 并吊销其全部 refresh token。
   * 幂等：不存在/已停用也不报错。
   */
  async disableIdentityByExternalId(externalId: string): Promise<void> {
    await this.db.query(
      `UPDATE identities SET status = 'disabled', updated_at = NOW() WHERE external_id = $1`,
      [externalId],
    );
    await this.db.query(
      `DELETE FROM refresh_tokens
         WHERE identity_id IN (SELECT id FROM identities WHERE external_id = $1)`,
      [externalId],
    );
  }

  /**
   * 启用身份（服务间写面）—— suspended → active 的恢复闭环。
   * 幂等：不存在/已启用也不报错；不恢复已吊销的 refresh token。
   */
  async enableIdentityByExternalId(externalId: string): Promise<void> {
    await this.db.query(
      `UPDATE identities SET status = 'active', updated_at = NOW() WHERE external_id = $1`,
      [externalId],
    );
  }
}
