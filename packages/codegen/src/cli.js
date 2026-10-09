/**
 * @gri/codegen —— CLI（编译期生成器的命令入口）
 *
 * 用法：
 *   node src/cli.js <ontology.yaml|json> [--tracks sql,typescript] [--out-dir <dir>]
 *
 * 读取本体 DSL 文件，确定性产出迁移 SQL / TS 类型，写盘可审阅、可回滚。
 */

import { promises as fs } from 'fs'
import path from 'path'
import { loadOntologyFile, generate } from './index.js'

async function main() {
  const args = process.argv.slice(2)
  const input = args.find((a) => !a.startsWith('--'))
  if (!input) {
    console.error('用法：node src/cli.js <ontology.yaml|json> [--tracks sql,typescript] [--out-dir <dir>]')
    process.exit(1)
  }

  const loaded = await loadOntologyFile(path.resolve(input))
  if (!loaded.ok) {
    console.error('本体校验失败：')
    for (const e of loaded.errors) console.error(`  ${e.path}: ${e.message}`)
    process.exit(1)
  }

  const tracksArg = args[args.indexOf('--tracks') + 1] ?? 'sql,typescript'
  const tracks = tracksArg.split(',').map((s) => s.trim())
  const outDir = args[args.indexOf('--out-dir') + 1] ?? process.cwd()

  const outputs = generate(loaded.ontology, tracks)
  await fs.mkdir(outDir, { recursive: true })

  const ext = { sql: '.sql', typescript: '.ts', twin: '.json' }
  for (const [track, content] of Object.entries(outputs)) {
    const file = path.join(outDir, `generated.${ext[track] ?? '.' + track}`)
    await fs.writeFile(file, content, 'utf-8')
    console.log(`[codegen] 生成 ${track} → ${file}`)
  }
}

main().catch((e) => {
  console.error('[codegen] 失败：', e)
  process.exit(1)
})