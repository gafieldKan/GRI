/**
 * content-providers 宿主（P-2）—— 用 `@gri/plugin-host` **发现 + 装配 + 运行**「内容类」provider。
 *
 * 约定（P-2）：**一个 provider 目录** = 一个 `plugin.json`（kind `knowledge.content` | `knowledge.taxonomy`）
 * + 入口（默认 `provider.mjs`，见清单 `entry`）**默认导出须带 `run(client, { dryRun })`**（`run` 由 loader 的
 * `loaded.default || loaded` 取到——缺则跳过并告警，exit 仍 0）。
 * 宿主只 `loadPlugins(<本目录>)` → 按 kind 取**已装配**provider → 调 `run`——
 * **加一类内容源 = 加一个 provider 目录**（宿主零改动；坏插件只记诊断不崩，见 plugin-host P5）。
 *
 * 用法：node scripts/content-host.mjs [--dry-run]
 * 环境：DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD（默认 localhost:5432/gri）
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { loadPlugins } from '@gri/plugin-host'

const require = createRequire(import.meta.url)
const pg = require('pg')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DRY_RUN = process.argv.includes('--dry-run')
const PROVIDER_KINDS = ['knowledge.content', 'knowledge.taxonomy']

const db = new pg.Pool({
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  database: process.env.DB_NAME ?? 'gri',
  user: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
})

async function main() {
  // 发现 + 装配：不 pin 实现（同 kind 多 provider 共存）；坏插件只诊断不崩。
  const { host, diagnostics } = loadPlugins({ dir: __dirname })
  for (const e of diagnostics.errors) {
    console.warn(`  ⚠ 插件诊断：${e.dir ?? '?'} — ${e.error?.code ?? ''} ${e.error?.message ?? ''}`)
  }
  for (const e of diagnostics.ignored ?? []) {
    if (e?.dir) console.warn(`  ⚠ 未装配：${e.dir}（${e.reason ?? '无清单'}）`)
  }

  const providers = PROVIDER_KINDS.flatMap((k) => host.getByKind(k))
  if (!providers.length) {
    console.log('[host] 未发现内容 provider（kind ∈ knowledge.content / knowledge.taxonomy）')
    return
  }
  console.log(`[host] 已装配 ${providers.length} 个内容 provider：${providers.map((p) => p.manifest.id).join(', ')}`)

  const client = await db.connect()
  try {
    for (const { manifest, impl } of providers) {
      if (!impl || typeof impl.run !== 'function') {
        console.warn(`  ⚠ ${manifest.id}：入口未导出 run(client, {dryRun})，跳过`)
        continue
      }
      console.log(`[host] ▶ ${manifest.id}（${manifest.kind}）`)
      await impl.run(client, { dryRun: DRY_RUN })
    }
    console.log(`[host] done${DRY_RUN ? '（dry-run，库无痕）' : ''}`)
  } finally {
    client.release()
    await db.end()
  }
}

main().catch((e) => {
  console.error('[host] failed:', e.message)
  process.exit(1)
})
