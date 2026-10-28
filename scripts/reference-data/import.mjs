/**
 * reference-data 数据管线 —— CLI 宿主（P-2：领域逻辑已抽出为 `knowledge.taxonomy` provider）。
 *
 * 本文件**只剩宿主面**：建 DB 连接 → 调 `provider.importAll(client, {dryRun})` → 释放。**零 SQL**。
 * 领域灌库逻辑（ontology.region/industry/resource 的 upsert + parent 回填）全在 `./provider.mjs`。
 *
 * 用法：node scripts/reference-data/import.mjs [--dry-run]
 * 幂等锚点：ontology.region.node_id / ontology.industry.code（全局唯一）
 * 环境：DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD（默认 localhost:5432/gri）
 */
import { createRequire } from 'module'
import { provider } from './provider.mjs'

const require = createRequire(import.meta.url)
const pg = require('pg')

const DRY_RUN = process.argv.includes('--dry-run')

const db = new pg.Pool({
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  database: process.env.DB_NAME ?? 'gri',
  user: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
})

async function run() {
  const client = await db.connect()
  try {
    await provider.importAll(client, { dryRun: DRY_RUN })
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
    await db.end()
  }
}

run().catch((e) => {
  console.error('[import] failed:', e.message)
  process.exit(1)
})
