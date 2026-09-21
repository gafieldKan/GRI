/**
 * 迁移运行器（独立脚本，非 Nest 模块）。
 * 用法：node dist/migrate/run-migrations.js
 * 读取 src/migrate/*.sql（按文件序）执行，幂等（IF NOT EXISTS）。
 */
import { readdirSync, readFileSync } from 'fs';
import { join, basename } from 'path';
import { Pool } from 'pg';
import { loadConfig } from '../config/config';

async function run() {
  const db = loadConfig().db;
  const pool = new Pool({
    host: db.host,
    port: db.port,
    database: db.database,
    user: db.user,
    password: db.password,
  });

  const dir = join(__dirname, '..', 'migrate');
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql') && /\d{3}_.+\.sql$/.test(f))
    .sort();

  // 迁移记录表
  await pool.query(
    `CREATE TABLE IF NOT EXISTS _auth_migrations (
       name TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ DEFAULT NOW()
     )`,
  );

  for (const file of files) {
    const { rows } = await pool.query(
      'SELECT 1 FROM _auth_migrations WHERE name = $1',
      [file],
    );
    if (rows.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[migrate] skip ${file} (已应用)`);
      continue;
    }

    const sql = readFileSync(join(dir, file), 'utf8');
    await pool.query(sql);
    await pool.query('INSERT INTO _auth_migrations (name) VALUES ($1)', [file]);
    // eslint-disable-next-line no-console
    console.log(`[migrate] applied ${file}`);
  }

  await pool.end();
  // eslint-disable-next-line no-console
  console.log('[migrate] done');
}

run().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[migrate] failed:', e.message);
  process.exit(1);
});