/**
 * 回填脚本（一次性，幂等）：把历史 auth-center 身份补齐 external_id ≡ public.users.id。
 *
 * 背景：注册链路修复前，`gri_auth.identities.external_id` 落空（除 testuser 外全为 NULL），
 *   故 JWT 的 external_id 退化为 sub，services/api 身份端点全失效。本脚本处理**存量**数据：
 *   为每条 external_id IS NULL 的身份，在业务库建/复用一个 public.users 行，再回填外键。
 *
 * 用法：node dist/migrate/backfill-external-id.js      （DRY_RUN=1 只打印不改库）
 * 目标：gri（业务库，读 DB_*）+ gri_auth（身份库，读 AUTH_DB_*，默认 localhost:5434）。
 *
 * 幂等：仅处理 external_id IS NULL 的行；已回填者跳过。可反复安全执行。
 */
import { Pool, PoolClient } from 'pg';
import { loadConfig } from '../config/config';

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

interface IdentityRow {
  id: string;
  domain: string;
  username: string | null;
  email: string | null;
  phone: string | null;
  name: string | null;
}

/** 身份库连接配置（对齐 services/auth-center 的 .env 口径）。 */
function authDbConfig() {
  return {
    host: process.env.AUTH_DB_HOST ?? 'localhost',
    port: parseInt(process.env.AUTH_DB_PORT ?? '5434', 10),
    database: process.env.AUTH_DB_NAME ?? 'gri_auth',
    user: process.env.AUTH_DB_USER ?? process.env.DB_USER ?? 'postgres',
    password: process.env.AUTH_DB_PASSWORD ?? process.env.DB_PASSWORD ?? 'postgres',
  };
}

/** 生成一个满足 public.users 约束（username ≥ 3、UNIQUE）的回填用户名。 */
function fallbackUsername(identity: IdentityRow): string {
  const base = (identity.username || identity.email || identity.phone || 'user')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .slice(0, 40);
  return `${base.slice(0, 32)}_${identity.id.replace(/-/g, '').slice(0, 8)}`;
}

/**
 * 为单条身份找/建 public.users 行（同事务内），返回 users.id。
 * 优先按 username → email → phone 命中存量行（复用），否则插入新行。
 */
async function findOrCreateUser(pool: PoolClient, identity: IdentityRow): Promise<string> {
  // 1) 复用：按 username / email / phone 任一命中（与 UNIQUE 约束同序）
  const match = await pool.query(
    `SELECT id FROM public.users
      WHERE deleted_at IS NULL
        AND ( ($1::text IS NOT NULL AND username = $1)
           OR ($2::text IS NOT NULL AND email = $2)
           OR ($3::text IS NOT NULL AND phone = $3) )
      ORDER BY created_at ASC
      LIMIT 1`,
    [identity.username, identity.email, identity.phone],
  );
  if (match.rows.length > 0) return match.rows[0].id as string;

  // 2) 新建：沿用身份侧资料；username 缺失/过短则兜底生成
  const username =
    identity.username && identity.username.length >= 3 ? identity.username : fallbackUsername(identity);
  const ins = await pool.query(
    `INSERT INTO public.users (username, email, phone, name, role, status)
     VALUES ($1, $2, $3, $4, 'consumer', 'active')
     RETURNING id`,
    [username, identity.email, identity.phone, identity.name],
  );
  return ins.rows[0].id as string;
}

async function run() {
  const db = loadConfig().db;
  const business = new Pool({
    host: db.host, port: db.port, database: db.database, user: db.user, password: db.password,
  });
  const auth = new Pool(authDbConfig());

  const { rows } = await auth.query<IdentityRow>(
    `SELECT id, domain, username, email, phone, name
       FROM identities
      WHERE external_id IS NULL
      ORDER BY created_at ASC`,
  );

  console.log(`[backfill] 待处理身份 ${rows.length} 条${DRY_RUN ? '（DRY_RUN，不改库）' : ''}`);

  let done = 0;
  let failed = 0;
  for (const identity of rows) {
    const client = await business.connect();
    try {
      await client.query('BEGIN');
      const userId = await findOrCreateUser(client, identity);
      if (!DRY_RUN) {
        // 身份库写入无法与业务库同事务（跨库），故业务库提交后再回写身份库
        await client.query('COMMIT');
        await auth.query('UPDATE identities SET external_id = $1, updated_at = NOW() WHERE id = $2', [
          userId,
          identity.id,
        ]);
      } else {
        await client.query('ROLLBACK');
      }
      done += 1;
      console.log(`[backfill] identity=${identity.id} → users.id=${userId}${DRY_RUN ? ' (dry)' : ''}`);
    } catch (e) {
      await client.query('ROLLBACK');
      failed += 1;
      console.error(`[backfill] 失败 identity=${identity.id}: ${(e as Error).message}`);
    } finally {
      client.release();
    }
  }

  await business.end();
  await auth.end();
  console.log(`[backfill] done：成功 ${done}，失败 ${failed}${DRY_RUN ? '（DRY_RUN 未落库）' : ''}`);
  if (failed > 0) process.exit(1);
}

run().catch((e) => {
  console.error('[backfill] failed:', (e as Error).message);
  process.exit(1);
});
