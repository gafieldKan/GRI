/**
 * 数据库迁移脚本
 *
 * 使用方法:
 *   node src/migrate.js init     - 初始化数据库
 *   node src/migrate.js reset    - 重置数据库
 */

import { Client } from 'pg';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
// 权威迁移目录（与 docker-compose 挂载到 /docker-entrypoint-initdb.d 的目录保持一致）
const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

async function migrate(action) {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'smartlens',
    user: process.env.DB_USER || 'admin',
    password: process.env.DB_PASSWORD || 'password'
  });

  try {
    await client.connect();
    console.log('数据库连接成功');

    if (action === 'reset') {
      console.log('开始重置数据库...');
      // 删除当前 schema 下所有表（通过 catalog 动态获取，避免遗漏新增表）
      const { rows } = await client.query(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
      );
      for (const { tablename } of rows) {
        await client.query(`DROP TABLE IF EXISTS "${tablename}" CASCADE`);
      }
      console.log(`已删除 ${rows.length} 张表`);
    }

    // 按文件名顺序执行权威 migrations/ 目录下所有 SQL 脚本
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      throw new Error(`迁移目录为空: ${MIGRATIONS_DIR}`);
    }

    for (const file of files) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8');
      await client.query(sql);
      console.log(`已执行: ${file}`);
    }
    console.log('数据库初始化完成');
  } catch (error) {
    console.error('迁移失败:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// CLI 执行
const action = process.argv[2];
if (action === 'init' || action === 'reset') {
  migrate(action);
} else {
  console.log('用法：node src/migrate.js [init|reset]');
  console.log('  init  - 初始化数据库');
  console.log('  reset - 重置数据库 (删除所有表)');
}
