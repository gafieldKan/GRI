/**
 * reference-data 数据管线 —— `knowledge.taxonomy` provider（P-2：自 `import.mjs` 抽出，**逻辑逐字迁入**）。
 *
 * 职责（与抽出前逐字相同）：把《联合国区域划分地图》《ISIC Rev.5 行业分类》《UN CPC Ver.3.0 资源分类》
 * 逐层展开 JSON 幂等灌入 ontology.region / ontology.industry / ontology.resource。
 *   结构轨/数据轨分离：结构由 packages/ontology/ontologies/{un-regions,isic-rev5,un-cpc}.ontology.yaml → 迁移建表；
 *   数据轨即本 provider 读 `data/*.json` 幂等 upsert。
 *
 * 形态：`knowledge.taxonomy` 插件（`plugin.json` 同目录随件走）——宿主（`import.mjs`）注入 DB 连接 `client`，
 * 本模块只做**领域灌库**（不建连接；每数据集自开 BEGIN/COMMIT），传输无关（与 P-0/EnginePort 同范式）。
 * 幂等锚点：`ontology.region.node_id` / `ontology.industry.code` / `ontology.resource.code`。
 */
import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, 'data')

/** 数据集配置：源文件 → 目标表 + 字段映射 + 锚点 + 父链解析方式。 */
const DATASETS = [
  {
    file: 'un-regions.json',
    table: 'ontology.region',
    anchor: 'node_id', // 唯一键列
    // 源节点 → 目标列（缺省列清单；值为函数或 null）
    columns: ['node_id', 'code', 'name', 'short', 'english', 'level', 'iso2', 'iso3', 'center', 'admin_type', 'alias', 'note', 'source', 'sort_order'],
    map: (n) => [
      String(n.id),
      n.code ?? null,
      n.name ?? null,
      n.short ?? null,
      n.english ?? null,
      n.level ?? null,
      n.iso2 ?? null,
      n.iso3 ?? null,
      n.center ? JSON.stringify(n.center) : null,
      n.adminType ?? null,
      n.alias ?? null,
      n.note ?? null,
      n.source ?? null,
      n.sortOrder ?? null,
    ],
    // 源 parent 引用的是源「数字 id」；本集锚点 = node_id = String(id)（恒等映射）
    parentKey: (n) => (n.parent === null || n.parent === undefined ? null : String(n.parent)),
    anchorOf: (n) => String(n.id),
  },
  {
    file: 'isic-rev5.json',
    table: 'ontology.industry',
    anchor: 'code',
    columns: ['code', 'name', 'short', 'en', 'level', 'section', 'intro', 'includes', 'also', 'excludes', 'refs', 'updated', 'sort_order'],
    map: (n) => [
      n.code ?? null,
      n.name ?? null,
      n.short ?? null,
      n.en ?? null,
      n.level ?? null,
      n.section ?? null,
      n.intro ?? null,
      n.includes ?? null,
      n.also ?? null,
      n.excludes ?? null,
      n.refs ? JSON.stringify(n.refs) : null,
      typeof n.updated === 'boolean' ? n.updated : false,
      n.sortOrder ?? null,
    ],
    // 源 parent 引用的是源「id」（如 ISIC5），而本集锚点是 code（如 'ISIC Rev.5'）——
    // 二者对 system 节点不一致，故经 id→锚点 索引换算（见 wireParents）。
    parentKey: (n) => (n.parent === null || n.parent === undefined ? null : String(n.parent)),
    anchorOf: (n) => n.code,
  },
  {
    file: 'un-cpc.json',
    table: 'ontology.resource',
    anchor: 'code',
    columns: ['code', 'name', 'level', 'status', 'sort_order'],
    map: (n) => [
      String(n.code),
      n.name ?? null,
      n.level ?? null,
      'active',
      n.sortOrder ?? null,
    ],
    // CPC 源节点的 parent 与 code 同构；根节点 parent=null。
    parentKey: (n) => (n.parent === null || n.parent === undefined ? null : String(n.parent)),
    anchorOf: (n) => String(n.code),
  },
]

/** 分块 upsert（锚点冲突则更新非锚点列）。返回 { inserted, updated } 近似计数。 */
async function upsertNodes(client, ds, nodes) {
  const cols = ds.columns
  const anchor = ds.anchor
  const CHUNK = 400
  let n = 0
  for (let i = 0; i < nodes.length; i += CHUNK) {
    const slice = nodes.slice(i, i + CHUNK)
    const values = []
    const placeholders = slice.map((node, r) => {
      const row = ds.map(node)
      const base = r * cols.length
      values.push(...row)
      return '(' + cols.map((_, c) => `$${base + c + 1}`).join(',') + ')'
    })
    // 冲突更新：除锚点外全部覆盖（EXCLUDED）
    const updates = cols.filter((c) => c !== anchor).map((c) => `${c} = EXCLUDED.${c}`)
    const sql =
      `INSERT INTO ${ds.table} (${cols.join(',')}) VALUES ${placeholders.join(',')}\n` +
      `ON CONFLICT (${anchor}) DO UPDATE SET ${updates.join(', ')}`
    await client.query(sql, values)
    n += slice.length
  }
  return n
}

/**
 * 回填 parent_id：把源 parent 引用映射到目标表 uuid。
 * 两段映射：源 parent(源 id) → 源节点的锚点(anchorOf) → 目标表 uuid。
 */
async function wireParents(client, ds, nodes) {
  const { rows } = await client.query(`SELECT id, ${ds.anchor} AS a FROM ${ds.table}`)
  const anchorToUuid = new Map(rows.map((r) => [String(r.a), r.id]))
  // 源 id → 锚点（应对「parent 引用源 id，而锚点是其它列」的情形，如 ISIC 的 system 节点）
  const idToAnchor = new Map(nodes.map((n) => [String(n.id), ds.anchorOf(n)]))
  let wired = 0
  let dangling = 0
  for (const node of nodes) {
    const pkRaw = ds.parentKey(node)
    if (pkRaw === null) continue
    const pk = idToAnchor.get(pkRaw) ?? pkRaw
    const parentUuid = anchorToUuid.get(pk)
    if (!parentUuid) {
      dangling++
      continue
    }
    await client.query(`UPDATE ${ds.table} SET parent_id = $1 WHERE ${ds.anchor} = $2`, [parentUuid, ds.anchorOf(node)])
    wired++
  }
  return { wired, dangling }
}

/** 灌库主流程（DB 连接 `client` 由宿主注入；每数据集自开 BEGIN/COMMIT）。 */
export async function importAll(client, { dryRun = false } = {}) {
  for (const ds of DATASETS) {
    const raw = await fs.readFile(path.join(DATA_DIR, ds.file), 'utf8')
    const nodes = JSON.parse(raw).nodes
    if (dryRun) {
      console.log(`[dry-run] ${ds.file}: ${nodes.length} 节点 → ${ds.table}`)
      continue
    }
    await client.query('BEGIN')
    const upserted = await upsertNodes(client, ds, nodes)
    const { wired, dangling } = await wireParents(client, ds, nodes)
    await client.query('COMMIT')
    console.log(`[import] ${ds.table}: upsert ${upserted}, parent 回填 ${wired}, 悬空 ${dangling}`)
  }
  console.log('[import] done')
}

/** `knowledge.taxonomy` provider（P-2）：宿主只认此面；领域 SQL 全在本模块（不再散在 CLI）。 */
export const provider = Object.freeze({
  id: 'reference-data',
  kind: 'knowledge.taxonomy',
  apiVersion: '1',
  provides: ['knowledge.taxonomy'],
  importAll,
})

export default provider
