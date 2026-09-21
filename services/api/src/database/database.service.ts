import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { loadConfig } from '../config/config';

/**
 * 连接单一业务库 gri（多 schema：auth/public/edu/tenant/ontology）。
 * 提供原始 Pool，供 repository 层直接执行 SQL。
 */
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private pool: Pool;

  constructor() {
    const db = loadConfig().db;
    this.pool = new Pool({
      host: db.host,
      port: db.port,
      database: db.database,
      user: db.user,
      password: db.password,
      max: 10,
    });
  }

  getPool(): Pool {
    return this.pool;
  }

  async query(text: string, params?: unknown[]) {
    return this.pool.query(text, params);
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}