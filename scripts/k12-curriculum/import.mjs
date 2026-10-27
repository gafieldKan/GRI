/**
 * k12-curriculum 数据管线 —— CLI 宿主（P-2：领域逻辑已抽出为 `knowledge.content` provider）。
 *
 * 本文件**只剩宿主面**：建 DB 连接 + 单事务 + 注入事务查询口 `Q` → 调 `provider.importAll(Q)` → COMMIT/ROLLBACK。
 * 领域灌库逻辑（ontology 六表 / edu.knowledge_points / knowledge_area 等 SQL）全在 `./provider.mjs`——**本文件零 SQL**。
 *
 * 用法：node scripts/k12-curriculum/import.mjs [--dry-run]
 * 幂等锚点：`code`（六表 UNIQUE）+ `knowledge_points.code` UNIQUE。
 * 环境：DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD（默认 localhost:5432/gri）。
 */
import pg from 'pg'
import { provider } from './provider.mjs'

const DRY_RUN = process.argv.includes('--dry-run')

const db = new pg.Pool({
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  database: process.env.DB_NAME ?? 'gri',
  user: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
})

// 整体单事务（原子导入，全或无）；--dry-run = 全链路彩排后 ROLLBACK，库无痕——
// catalog/staging 人工校对通过前的无写入演练路径。
let tx = null
const Q = (text, params) => (tx ? tx.query(text, params) : db.query(text, params))

async function main() {
  tx = await db.connect()
  await Q('BEGIN')
  if (DRY_RUN) console.log('（dry-run 模式：全链路彩排后 ROLLBACK，库无痕）')
  try {
    const { kpN } = await provider.importAll(Q, { dryRun: DRY_RUN })

    if (DRY_RUN) {
      await Q('ROLLBACK')
      console.log('\n（dry-run ROLLBACK 完成——以上为彩排输出，库无变更）')
    } else {
      await Q('COMMIT')
      console.log(`\n完成：${kpN ? `知识点/题已灌库（staging ${kpN} 条）` : 'staging 无审核通过数据（仅结构/字典）'}`)
    }
  } catch (e) {
    await Q('ROLLBACK').catch(() => {})
    throw e
  } finally {
    tx.release()
    await db.end()
  }
}

main().catch((e) => {
  console.error('[import] 失败：', e.message)
  process.exit(1)
})
