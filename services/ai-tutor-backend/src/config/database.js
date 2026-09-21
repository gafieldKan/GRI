/**
 * 数据库连接配置
 */

import { Client } from 'pg';

let client = null;

export async function getDbClient() {
  if (client) {
    return client;
  }

  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'smartlens',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres'
  };

  client = new Client(dbConfig);
  await client.connect();
  console.log('数据库连接成功');

  return client;
}

export async function query(sql, params = []) {
  const db = await getDbClient();
  return db.query(sql, params);
}
