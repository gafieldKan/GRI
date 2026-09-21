/**
 * GRI 重写 ETL 收敛脚本（独立脚本，非 Nest 模块）。
 * 用法：node dist/migrate/etl-converge.js（在 M0 骨架编译后运行）
 *
 * 把旧三库收敛到新单库 gri 三表：
 *   - 旧 gri_db.users  (uuid)      → public.users（保留 uuid，role='consumer'）
 *   - 旧 smartlens.students (varchar) → public.users（生成新 uuid，role='student'）
 *                                    + edu.students(user_id) 学习档案
 *   - 旧 gri_auth.identities (external_id varchar) → auth.identities (external_id uuid)
 *
 * 核心转换点（根治字符分叉）：
 *   旧学情表用 student_id(varchar) 引用学生，本脚本建立
 *     varchar_student_id → uuid_user_id 的映射，供后续 002_ 迁移重建学情表 FK 用。
 *
 * 幂等：重复执行不重复插入（按唯一键已存在则跳过）。
 *
 * 环境变量（区隔四库）：
 *   - 新单库 gri：DB_HOST/DB_PORT/DB_NAME(默认 gri)/DB_USER/DB_PASSWORD
 *   - 旧订餐库：LEGACY_FOOD_HOST/PORT/NAME(默认 gri_db)/USER/PASSWORD
 *   - 旧学情库：LEGACY_EDU_HOST/PORT/NAME(默认 smartlens)/USER/PASSWORD
 *   - 旧身份库：LEGACY_AUTH_HOST/PORT/NAME(默认 gri_auth)/USER/PASSWORD
 */
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';

interface PoolOpts {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

function poolOf(prefix: string, defDb: string): Pool {
  return new Pool({
    host: process.env[`${prefix}_HOST`] ?? 'localhost',
    port: parseInt(process.env[`${prefix}_PORT`] ?? '5432', 10),
    database: process.env[`${prefix}_NAME`] ?? defDb,
    user: process.env[`${prefix}_USER`] ?? 'postgres',
    password: process.env[`${prefix}_PASSWORD`] ?? 'postgres',
  } as PoolOpts);
}

// 旧 varchar student_id → 新 uuid user_id 映射（供后续迁移复用）
interface StudentMap {
  [legacyStudentId: string]: string; // uuid user_id
}

async function run() {
  const self = new Pool({
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    database: process.env.DB_NAME ?? 'gri',
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
  });
  const food = poolOf('LEGACY_FOOD', 'gri_db');
  const edu = poolOf('LEGACY_EDU', 'smartlens');
  const auth = poolOf('LEGACY_AUTH', 'gri_auth');

  // 用于学情表 FK 重建的映射（落表，供 002_ 脚本 + 业务代码双重消费）
  await self.query(`
    CREATE TABLE IF NOT EXISTS _etl_student_map (
      legacy_student_id VARCHAR PRIMARY KEY,
      user_id           UUID NOT NULL
    );
  `);

  const studentMap: StudentMap = {};

  // ----------------------------------------------------------------------
  // 1. 旧订餐 users → public.users（保留 uuid）
  // ----------------------------------------------------------------------
  const foodUsers = await food.query(
    `SELECT id, username, email, phone, avatar_url, status,
            username AS name, created_at, updated_at
       FROM users
      WHERE deleted_at IS NULL`,
  );
  for (const u of foodUsers.rows) {
    const exists = await self.query(
      `SELECT 1 FROM public.users WHERE id = $1`,
      [u.id],
    );
    if (exists.rows.length > 0) continue;
    await self.query(
      `INSERT INTO public.users (id, username, email, phone, name, avatar_url, role, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'consumer', $7, $8, $9)
       ON CONFLICT (id) DO NOTHING`,
      [u.id, u.username, u.email, u.phone, u.name, u.avatar_url, u.status ?? 'active', u.created_at, u.updated_at],
    );
  }
  console.log(`[etl] 订餐 users → public.users 完成（${foodUsers.rowCount ?? 0} 行）`);

  // ----------------------------------------------------------------------
  // 2. 旧学情 students(varchar) → public.users(新 uuid) + edu.students(user_id)
  //    —— 核心转换：生成新 uuid 主键，记录 varchar→uuid 映射
  // ----------------------------------------------------------------------
  const students = await edu.query(`SELECT * FROM students`);
  for (const s of students.rows) {
    const legacyId: string = s.id;
    // 已有映射则跳过（幂等）
    const mapped = await self.query(
      `SELECT user_id FROM _etl_student_map WHERE legacy_student_id = $1`,
      [legacyId],
    );
    let userId: string;
    if (mapped.rows.length > 0) {
      userId = mapped.rows[0].user_id;
    } else {
      userId = randomUUID();
      // public.users：学生也是「人」
      await self.query(
        `INSERT INTO public.users (id, username, name, avatar_url, role, status)
         VALUES ($1, $2, $3, $4, 'student', 'active')
         ON CONFLICT (id) DO NOTHING`,
        [userId, legacyId, s.name, s.avatar_url],
      );
      // edu.students：学习档案（1:0..1 扩展）
      await self.query(
        `INSERT INTO edu.students (user_id, name, grade, parent_id, avatar_url, textbook_version, school, created_at, updated_at)
         VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8)
         ON CONFLICT (user_id) DO NOTHING`,
        [userId, s.name, s.grade, s.avatar_url, s.textbook_version, s.school, s.created_at, s.updated_at],
      );
      // 记录映射
      await self.query(
        `INSERT INTO _etl_student_map (legacy_student_id, user_id) VALUES ($1, $2)
         ON CONFLICT (legacy_student_id) DO NOTHING`,
        [legacyId, userId],
      );
    }
    studentMap[legacyId] = userId;
  }
  console.log(`[etl] 学情 students(varchar) → public.users(uuid) + edu.students 完成（${students.rowCount ?? 0} 行）`);

  // ----------------------------------------------------------------------
  // 3. 旧身份 identities(external_id varchar) → auth.identities(external_id uuid)
  //    —— external_id 曾是 varchar 存 uuid 字符串，现收紧为 UUID 类型
  // ----------------------------------------------------------------------
  const identities = await auth.query(`SELECT * FROM identities`);
  for (const id of identities.rows) {
    // external_id 旧值是 uuid 字符串，转 UUID 类型；无效则跳过并告警
    let extUuid: string | null = null;
    try {
      extUuid = id.external_id ?? null;
      if (extUuid && !/[0-9a-fA-F-]{36}/.test(extUuid)) extUuid = null;
    } catch {
      extUuid = null;
    }
    if (!extUuid) {
      console.warn(`[etl] 跳过 identities ${id.username}（external_id 非法 uuid 字符串）`);
      continue;
    }
    // 新库 auth.identities.external_id 必须 FK 到真实的 public.users.id
    const userExists = await self.query(`SELECT 1 FROM public.users WHERE id = $1`, [extUuid]);
    if (userExists.rows.length === 0) {
      console.warn(`[etl] 跳过 identities ${id.username}（external_id 无对应 public.users）`);
      continue;
    }
    await self.query(
      `INSERT INTO auth.identities (id, domain, username, email, phone, password_hash, name, external_id, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       -- 以 username 合并（seed 已建 testuser 身份，id 不同）：保留既有 id，回填 external_id + 空白字段
       ON CONFLICT (username) DO UPDATE SET
         external_id  = EXCLUDED.external_id,
         email        = COALESCE(EXCLUDED.email, auth.identities.email),
         phone        = COALESCE(EXCLUDED.phone, auth.identities.phone),
         password_hash= COALESCE(EXCLUDED.password_hash, auth.identities.password_hash),
         name         = COALESCE(EXCLUDED.name, auth.identities.name),
         updated_at   = NOW()`,
      [id.id, id.domain, id.username, id.email, id.phone, id.password_hash, id.name, extUuid, id.status ?? 'active', id.created_at, id.updated_at],
    );
  }
  console.log(`[etl] 身份 identities → auth.identities 完成（${identities.rowCount ?? 0} 行）`);

  await self.end();
  await food.end();
  await edu.end();
  await auth.end();
  console.log('[etl] done');
}

run().catch((e) => {
  console.error('[etl] failed:', e.message);
  process.exit(1);
});