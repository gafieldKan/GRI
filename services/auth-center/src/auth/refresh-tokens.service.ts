import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { loadConfig } from '../config/config';

@Injectable()
export class RefreshTokensService {
  private readonly ttl: number;

  constructor(private readonly db: DatabaseService) {
    this.ttl = loadConfig().jwt.refreshTokenTtl;
  }

  /** 生成 opaque refresh token（明文返回客户端，DB 只存 hash） */
  async issue(identityId: string, device?: string): Promise<string> {
    const token = randomBytes(48).toString('base64url');
    const hash = this.hash(token);
    const expiresAt = new Date(Date.now() + this.ttl * 1000);
    await this.db.query(
      `INSERT INTO refresh_tokens (identity_id, token_hash, device, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [identityId, hash, device ?? null, expiresAt],
    );
    return token;
  }

  /** 校验 refresh token，返回所属 identity id；无效返回 null */
  async validate(token: string): Promise<string | null> {
    const hash = this.hash(token);
    const { rows } = await this.db.query(
      `SELECT identity_id FROM refresh_tokens
       WHERE token_hash = $1 AND expires_at > NOW() LIMIT 1`,
      [hash],
    );
    return rows.length ? (rows[0].identity_id as string) : null;
  }

  /** 吊销单条 refresh token（登出用） */
  async revoke(token: string): Promise<void> {
    const hash = this.hash(token);
    await this.db.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [
      hash,
    ]);
  }

  /** 轮转：吊销旧 token，签发新 token（返回新明文 token） */
  async rotate(oldToken: string, identityId: string, device?: string) {
    await this.revoke(oldToken);
    const newToken = await this.issue(identityId, device);
    return newToken;
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}