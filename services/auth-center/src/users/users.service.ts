import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Identity, Domain, mapRow } from './identity.entity';

@Injectable()
export class UsersService {
  constructor(private readonly db: DatabaseService) {}

  /** 按 email 查找（订餐密码账户） */
  async findByEmail(email: string): Promise<Identity | null> {
    const { rows } = await this.db.query(
      'SELECT * FROM identities WHERE email = $1 LIMIT 1',
      [email.toLowerCase()],
    );
    return rows.length ? mapRow(rows[0]) : null;
  }

  /** 按 username 查找 */
  async findByUsername(username: string): Promise<Identity | null> {
    const { rows } = await this.db.query(
      'SELECT * FROM identities WHERE username = $1 LIMIT 1',
      [username],
    );
    return rows.length ? mapRow(rows[0]) : null;
  }

  /** 按统一主体 id 查找 */
  async findById(id: string): Promise<Identity | null> {
    const { rows } = await this.db.query(
      'SELECT * FROM identities WHERE id = $1 LIMIT 1',
      [id],
    );
    return rows.length ? mapRow(rows[0]) : null;
  }

  /** 按原域外部 id 查找（迁移/关联用） */
  async findByExternalId(
    domain: Domain,
    externalId: string,
  ): Promise<Identity | null> {
    const { rows } = await this.db.query(
      'SELECT * FROM identities WHERE domain = $1 AND external_id = $2 LIMIT 1',
      [domain, externalId],
    );
    return rows.length ? mapRow(rows[0]) : null;
  }

  /** 创建身份（订餐账户或 AI 学生） */
  async create(data: {
    domain: Domain;
    username?: string | null;
    email?: string | null;
    phone?: string | null;
    passwordHash?: string | null;
    name?: string | null;
    externalId?: string | null;
  }): Promise<Identity> {
    const { rows } = await this.db.query(
      `INSERT INTO identities
         (domain, username, email, phone, password_hash, name, external_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        data.domain,
        data.username ?? null,
        data.email ?? null,
        data.phone ?? null,
        data.passwordHash ?? null,
        data.name ?? null,
        data.externalId ?? null,
      ],
    );
    return mapRow(rows[0]);
  }

  /** 惰性升级明文密码为 bcrypt hash（登录时触发） */
  async updatePasswordHash(id: string, hash: string): Promise<void> {
    await this.db.query(
      'UPDATE identities SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [hash, id],
    );
  }
}