/**
 * 旧业务库（gri_db users）→ 身份库（gri_auth identities）迁移脚本（独立脚本，非 Nest 模块）。
 * 用法：node dist/migrate/seed-from-legacy.js
 *
 * 语义：把订餐后端旧 users 表一行行迁入统一 identity。
 *  - 保留旧主键 UUID 作为 identity.external_id（food 域），原订餐表外键 users.id 继续兼容；
 *  - identity_links 建立 (domain='food', external_id=旧id) 幂等映射；
 *  - 旧 password_hash 原样保留（若为明文，登录时由 AuthService 惰性升级为 bcrypt）。
 *
 * 幂等：重复执行不重复插入（按 domain+external_id 已存在则跳过）。
 *
 * 环境变量（区分两库）：
 *  - 新身份库：DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD（默认 gri_auth@5434）
 *  - 旧业务库：LEGACY_DB_HOST/LEGACY_DB_PORT/LEGACY_DB_NAME/LEGACY_DB_USER/LEGACY_DB_PASSWORD
 *              （默认 gri_db@5432）
 */
import { Pool } from 'pg';
import { loadConfig } from '../config/config';

const LegacyConfig = {
  host: process.env.LEGACY_DB_HOST ?? 'localhost',
  port: parseInt(process.env.LEGACY_DB_PORT ?? '5432', 10),
  database: process.env.LEGACY_DB_NAME ?? 'gri_db',
  user: process.env.LEGACY_DB_USER ?? 'postgres',
  password: process.env.LEGACY_DB_PASSWORD ?? 'postgres',
};

async function run() {
  const auth = loadConfig().db;
  const authPool = new Pool({
    host: auth.host,
    port: auth.port,
    database: auth.database,
    user: auth.user,
    password: auth.password,
  });
  const legacyPool = new Pool(LegacyConfig);

  // 读取旧 users（列名以订餐后端 001_create_core_tables.sql 为准）
  const { rows: users } = await legacyPool.query(
    'SELECT id, username, email, phone, password_hash, status, created_at, updated_at FROM users',
  );

  let inserted = 0;
  let skipped = 0;

  for (const u of users) {
    // 幂等：已存在则跳过
    const { rows: existing } = await authPool.query(
      `SELECT id FROM identities WHERE domain = 'food' AND external_id = $1 LIMIT 1`,
      [u.id],
    );
    if (existing.length > 0) {
      skipped++;
      continue;
    }

    // 避免 username/email/phone 冲突：ON CONFLICT DO NOTHING（无 target，任意唯一约束冲突即跳过）
    const { rows: identity } = await authPool.query(
      `INSERT INTO identities
         (domain, username, email, phone, password_hash, name, external_id, status, created_at, updated_at)
       VALUES ('food', $1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [
        u.username ?? null,
        u.email ?? null,
        u.phone ?? null,
        u.password_hash ?? null,
        null, // name：旧 users 无 name 列，留空（订餐昵称另行映射）
        u.id, // external_id = 旧主键
        u.status && u.status !== 'active' ? u.status : 'active',
        u.created_at ?? new Date(),
        u.updated_at ?? new Date(),
      ],
    );

    // ON CONFLICT DO NOTHING 可能因唯一冲突未插入，此时尝试仅外部映射（不留身份）
    let identityId = identity.length ? identity[0].id : null;

    if (!identityId) {
      // 尝试以外部 id 为独立身份插入（不带可能冲突的唯一字段）
      const { rows: fallback } = await authPool.query(
        `INSERT INTO identities (domain, name, external_id, status, created_at, updated_at)
         VALUES ('food', NULL, $1, 'active', $2, $3)
         RETURNING id`,
        [u.id, u.created_at ?? new Date(), u.updated_at ?? new Date()],
      );
      identityId = fallback.length ? fallback[0].id : null;
    }

    if (!identityId) {
      skipped++;
      continue;
    }

    // 建立 identity_links 映射
    await authPool.query(
      `INSERT INTO identity_links (identity_id, domain, external_id)
       VALUES ($1, 'food', $2)
       ON CONFLICT DO NOTHING`,
      [identityId, u.id],
    );
    inserted++;
  }

  await legacyPool.end();
  await authPool.end();
  // eslint-disable-next-line no-console
  console.log(
    `[seed:legacy] 迁移完成：插入 ${inserted}，跳过 ${skipped}（共 ${users.length}）`,
  );
}

run().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[seed:legacy] failed:', e.message);
  process.exit(1);
});