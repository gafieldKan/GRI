/**
 * reference-data 数据管线 —— extract.mjs（从源 HTML 抽取 JSON 数据）
 *
 * 两份《逐层展开》交互图的分类数据内嵌在 HTML 的 <script type="application/json"> 中：
 *   - 联合国区域划分地图_逐层展开_V1.0.html   → <script id="atlas-data">    → data/un-regions.json
 *   - 联合国行业分类_ISIC_Rev5_逐层展开_V1.0.html → <script id="industry-data"> → data/isic-rev5.json
 *
 * 本脚本抽取并「瘦身」为 { meta, nodes }（丢弃 maps/countryShapes 等地图几何，只留骨架数据）。
 * 源文件在仓库外（用户微信目录），故抽取产物 checked-in，保证 import 可脱离源文件重现。
 *
 * 用法：node scripts/reference-data/extract.mjs <源目录>
 *   例：node scripts/reference-data/extract.mjs "/home/ubantu/文档/xwechat_files/kanlifeng_bfe0/msg/file/2026-10"
 */
import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, 'data')

const SOURCES = [
  { html: '联合国行业分类_ISIC_Rev5_逐层展开_V1.0.html', scriptId: 'industry-data', out: 'isic-rev5.json' },
  { html: '联合国区域划分地图_逐层展开_V1.0.html', scriptId: 'atlas-data', out: 'un-regions.json' },
]

async function main() {
  const srcDir = process.argv[2]
  if (!srcDir) {
    console.error('用法：node scripts/reference-data/extract.mjs <源目录>')
    process.exit(1)
  }
  await fs.mkdir(OUT_DIR, { recursive: true })
  for (const s of SOURCES) {
    const raw = await fs.readFile(path.join(srcDir, s.html), 'utf8')
    const re = new RegExp(`<script id="${s.scriptId}" type="application/json">([\\s\\S]*?)</script>`)
    const m = raw.match(re)
    if (!m) throw new Error(`未在 ${s.html} 找到 <script id="${s.scriptId}">`)
    const obj = JSON.parse(m[1])
    const slim = { meta: obj.meta ?? {}, nodes: obj.nodes }
    await fs.writeFile(path.join(OUT_DIR, s.out), JSON.stringify(slim), 'utf8')
    console.log(`[extract] ${s.html} → data/${s.out}（${slim.nodes.length} 节点）`)
  }
  console.log('[extract] done')
}

main().catch((e) => {
  console.error('[extract] failed:', e.message)
  process.exit(1)
})
