/**
 * k12-curriculum 数据管线 —— `knowledge.content` provider（P-2：自 `import.mjs` 抽出，**逻辑逐字迁入**）。
 *
 * 职责（与抽出前逐字相同）：
 *  1. catalog/*.yaml → 幂等 upsert ontology 六表（Subject/SchoolStage/Grade/Textbook/TextbookChapter）
 *     + master_data 同源刷新（单一真源仍是 YAML）
 *  2. staging/*.json（人工审核通过 status:reviewed|published）→ 幂等灌库 edu.knowledge_points（按 code 锚点）
 *     + 前置建议解析进 ontology.kp_prerequisite + edu.questions
 *  3. maps/*.map.json（版图真源）→ ontology.knowledge_area + area_prerequisite
 *
 * 形态：`knowledge.content` 插件（`plugin.json` 同目录随件走）——宿主（`import.mjs`）注入 DB 事务查询口 `Q`，
 * 本模块只做**领域灌库**，不建连接/不管事务（传输无关，与 P-0/EnginePort 同范式）。
 * 幂等锚点：`code`（六表 UNIQUE）+ `knowledge_points.code` UNIQUE。
 */
import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const yaml = require('js-yaml')

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 事务查询口，由宿主 `importAll(Q)` 注入（模块级：helpers 逐字沿用原 `Q(...)` 调用形，零改动搬迁）。
let Q = null

// 判别值闭集（本体驱动）：textbook_type 合法值从 k12-curriculum.ontology.yaml 推导，
// 不依赖 catalog 约定巧合——subject LOWER 后未命中即 fail-fast（早于 DB CHECK 约束报错）。
const fsSync = require('fs')
const k12Onto = yaml.load(
  fsSync.readFileSync(require.resolve('@gri/ontology/ontologies/k12-curriculum.ontology.yaml'), 'utf8'),
)
const TEXTBOOK_TYPES = new Set(
  (k12Onto.objects ?? [])
    .map((o) => o.discriminator)
    .filter((d) => d?.field === 'textbook_type')
    .map((d) => String(d.value).toLowerCase()),
)
if (TEXTBOOK_TYPES.size === 0) {
  throw new Error('k12-curriculum.ontology.yaml 中未找到 textbook_type 判别声明——本体真源结构变更需同步本闭集推导')
}

// ---------------------------------------------------------------------------
// 学段/年级目录（Grade.code 数值后缀 ≡ grade_level；本目录是 catalog 的隐含约定）
// ---------------------------------------------------------------------------
const STAGES = [
  { code: 'PRIMARY', name: '小学', order: 1 },
  { code: 'JUNIOR', name: '初中', order: 2 },
  { code: 'SENIOR', name: '高中', order: 3 },
]
const GRADES = [
  { code: 'G1', name: '一年级', stage: 'PRIMARY', order: 1 },
  { code: 'G2', name: '二年级', stage: 'PRIMARY', order: 2 },
  { code: 'G3', name: '三年级', stage: 'PRIMARY', order: 3 },
  { code: 'G4', name: '四年级', stage: 'PRIMARY', order: 4 },
  { code: 'G5', name: '五年级', stage: 'PRIMARY', order: 5 },
  { code: 'G6', name: '六年级', stage: 'PRIMARY', order: 6 },
  { code: 'G7', name: '七年级', stage: 'JUNIOR', order: 7 },
  { code: 'G8', name: '八年级', stage: 'JUNIOR', order: 8 },
  { code: 'G9', name: '九年级', stage: 'JUNIOR', order: 9 },
  { code: 'G10', name: '高一', stage: 'SENIOR', order: 10 },
  { code: 'G11', name: '高二', stage: 'SENIOR', order: 11 },
  { code: 'G12', name: '高三', stage: 'SENIOR', order: 12 },
]
// gradeLevel 数值 = G 编号（G7 ↔ 7）
const gradeLevelOf = (code) => parseInt(String(code).replace(/^G/i, ''), 10)

// ---------------------------------------------------------------------------
// 1. 目录/字典幂等灌库
// ---------------------------------------------------------------------------

async function upsertDictionary() {
  let n = 0
  for (const s of STAGES) {
    await Q(
      `INSERT INTO ontology.school_stage (code, name, sort_order) VALUES ($1,$2,$3)
       ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, sort_order=EXCLUDED.sort_order`,
      [s.code, s.name, s.order],
    )
    await Q(
      `INSERT INTO ontology.master_data (kind, label, code, value, is_builtin, sort_order) VALUES ('SchoolStage', $1, $2, $3::jsonb, true, $4)
       ON CONFLICT (kind, code) DO NOTHING`,
      [s.name, s.code, JSON.stringify({ sort: s.order }), s.order],
    )
    n++
  }
  const stageIdByCode = new Map(
    (await Q(`SELECT id, code FROM ontology.school_stage`)).rows.map((r) => [r.code, r.id]),
  )
  for (const g of GRADES) {
    await Q(
      `INSERT INTO ontology.grade (code, name, sort_order, stage_id) VALUES ($1,$2,$3,$4)
       ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, sort_order=EXCLUDED.sort_order, stage_id=EXCLUDED.stage_id`,
      [g.code, g.name, g.order, stageIdByCode.get(g.stage)],
    )
    await Q(
      `INSERT INTO ontology.master_data (kind, label, code, value, is_builtin, sort_order) VALUES ('Grade', $1, $2, $3::jsonb, true, $4)
       ON CONFLICT (kind, code) DO NOTHING`,
      [g.name, g.code, JSON.stringify({ stage: g.stage, order: g.order }), g.order],
    )
    n++
  }
  return n
}

async function upsertSubject(subject) {
  await Q(
    `INSERT INTO ontology.subject (code, name, domain) VALUES ($1,$2,$3)
     ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, domain=EXCLUDED.domain`,
    [subject.code, subject.name, subject.domain ?? null],
  )
  await Q(
    `INSERT INTO ontology.master_data (kind, label, code, value, is_builtin, sort_order) VALUES ('Subject', $1, $2, $3::jsonb, true, 20)
     ON CONFLICT (kind, code) DO NOTHING`,
    [subject.name, subject.code, JSON.stringify({ domain: subject.domain ?? '' })],
  )
}

async function upsertCatalog(catalog) {
  const t = catalog.textbook
  // 判别值门禁（本体闭集）：subject code LOWER 后必须命中 k12 本体判别值，否则 fail-fast
  const discValue = String(t.subject).toLowerCase()
  if (!TEXTBOOK_TYPES.has(discValue)) {
    throw new Error(
      `教材 ${t.code} 的 subject "${t.subject}" → 判别值 "${discValue}" 不在 k12 本体闭集 [${[...TEXTBOOK_TYPES].join('/')}] 内——` +
      `请改 catalog 的 subject 编码（如物理用 PHYS）或扩本体判别值`,
    )
  }
  await Q(
    `INSERT INTO ontology.textbook (code, name, version, publisher, status, textbook_type, subject_id, grade_id)
     SELECT $1::varchar, $2::varchar, $3::varchar, $4::varchar, 'published', LOWER($5::varchar), s.id, g.id
     FROM ontology.subject s, ontology.grade g
     WHERE s.code=$5::varchar AND g.code=$6::varchar
     ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, version=EXCLUDED.version, publisher=EXCLUDED.publisher,
       status='published', textbook_type=LOWER($5::varchar)`,
    [t.code, t.name, t.version, t.publisher, t.subject, t.grade],
  )
  const textbookId = (await Q(`SELECT id FROM ontology.textbook WHERE code = $1`, [t.code])).rows[0]?.id
  if (!textbookId) throw new Error(`textbook upsert 失败：${t.code}（subject/grade 行缺失？）`)

  let n = 0
  for (const ch of catalog.chapters ?? []) {
    await upsertChapter(textbookId, ch, null)
    n++
  }
  return { textbookId, chapters: n }
}

function gradeStageOf(gradeCode) {
  const g = GRADES.find((x) => x.code === gradeCode)
  if (!g) throw new Error(`未知年级：${gradeCode}`)
  return g.stage
}

async function upsertChapter(textbookId, ch, parentId) {
  await Q(
    `INSERT INTO ontology.textbook_chapter (code, name, sort_order, textbook_id, parent_id)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, sort_order=EXCLUDED.sort_order, textbook_id=EXCLUDED.textbook_id, parent_id=EXCLUDED.parent_id`,
    [ch.code, ch.name, ch.order ?? 0, textbookId, parentId],
  )
  const id = (await Q(`SELECT id FROM ontology.textbook_chapter WHERE code = $1`, [ch.code])).rows[0]?.id
  for (const child of ch.children ?? []) {
    await upsertChapter(textbookId, child, id)
  }
}

// ---------------------------------------------------------------------------
// 2. staging 审核通过 → knowledge_points / kp_prerequisite / questions
// ---------------------------------------------------------------------------

// 选项归一化：staging 形态 [{text:"A. …"}] → ["…"]（剥掉行首 A./A、标签，与存量 39 题 string[] 形态一致）。
// 兼容已为 string[] 的输入；空串/非数组 → []（该题 options 存 NULL）。
function normalizeOptions(opts) {
  return (Array.isArray(opts) ? opts : [])
    .map((o) => (typeof o === 'string' ? o : (o?.text ?? '')))
    .map((t) => String(t).replace(/^[A-Da-d][.、)．]\s*/, '').trim())
    .filter((t) => t !== '')
}

async function upsertStaging(staging) {
  // staging 形态：{ code, chapter, name, description, gradeLevel, subject,
  //   prerequisites?: string[](kp code 列表), examples?: [{content, answer, analysis?, difficulty?}], status }
  let n = 0
  for (const kp of staging.knowledgePoints ?? []) {
    if (kp.status !== 'published' && kp.status !== 'reviewed') continue // 审核门禁
    const chapter = (await Q(`SELECT id FROM ontology.textbook_chapter WHERE code = $1`, [kp.chapter])).rows[0]?.id
    if (!chapter) {
      console.warn(`  ⚠ 跳过（章节不存在）：${kp.code} → ${kp.chapter}`)
      continue
    }
    const res = await Q(
      `INSERT INTO edu.knowledge_points (name, description, subject, grade_level, code, chapter_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description,
         subject=EXCLUDED.subject, grade_level=EXCLUDED.grade_level, chapter_id=EXCLUDED.chapter_id, status=EXCLUDED.status
       RETURNING id`,
      [kp.name, kp.description ?? null, String(kp.subject).toLowerCase(), kp.gradeLevel, kp.code, chapter, kp.status],
    )
    const kpId = res.rows[0].id

    // 前置依赖（code → 关联表；先删后插保持幂等）
    // 短引用补零解析：LLM 产出的前置短引用 kp1 是「同节内锚点」，与实际 code kp01 有零填充差——
    // 先按完整 code 查，查不到再按本节 code 前缀 + 去零编号兜底（两级解析，幻觉值跳过不报错）。
    const m = kp.code.match(/^(.+\.s\d+)\.kp(\d+)$/)
    const sectionPrefix = m?.[1] ?? kp.code
    await Q(`DELETE FROM ontology.kp_prerequisite WHERE from_kp = $1`, [kpId])
    for (const preCode of kp.prerequisites ?? []) {
      let pre = (await Q(`SELECT id FROM edu.knowledge_points WHERE code = $1`, [preCode])).rows[0]
      if (!pre) {
        const pm = preCode.match(/^kp(\d+)$/i)
        if (pm) {
          const padded = `${sectionPrefix}.kp${pm[1].padStart(2, '0')}`
          pre = (await Q(`SELECT id FROM edu.knowledge_points WHERE code = $1`, [padded])).rows[0]
        }
      }
      if (!pre) continue // 前置未入库（可能是后续批次）或幻觉值，跳过不报错
      await Q(
        `INSERT INTO ontology.kp_prerequisite (from_kp, to_kp) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [kpId, pre.id],
      )
    }

    // 例题（按 content 锚点幂等；status=published 才带题）
    if (kp.status === 'published') {
      for (const ex of kp.examples ?? []) {
        const analysis = ex.analysis ?? null
        const options = normalizeOptions(ex.options)
        const optionsJson = options.length ? JSON.stringify(options) : null
        await Q(
          `INSERT INTO edu.questions (knowledge_point_id, content, answer, analysis, explanation, difficulty, type, options)
           SELECT $1,$2,$3,$4,$4,$5,'multiple-choice',$6::jsonb
           WHERE NOT EXISTS (SELECT 1 FROM edu.questions WHERE knowledge_point_id = $1 AND content = $2)`,
          [kpId, ex.content, ex.answer, analysis, ex.difficulty ?? 'medium', optionsJson],
        )
        // 回灌：存量行（早前 INSERT 未带 options/explanation）按 content 锚点补齐选项与解析。
        await Q(
          `UPDATE edu.questions SET options = COALESCE($3::jsonb, options), explanation = COALESCE($4, explanation)
             WHERE knowledge_point_id = $1 AND content = $2`,
          [kpId, ex.content, optionsJson, analysis],
        )
      }
    }
    n++
  }
  return n
}

// ---------------------------------------------------------------------------
// 5. 学科知识版图（maps/*.map.json，人工审核后入 git 的真源）→ 幂等灌库
//    code 锚点（f.NN 领域 / a.NN.MM 知识域）；scope 闭集门禁；前置按 code 解析（未命中跳过）。
//    更新机制：改 map json → 重跑 import——比重/图谱/登峰页运行时直读 DB 自动跟随。
// ---------------------------------------------------------------------------

const AREA_SCOPES = new Set(['k12', 'frontier'])

async function upsertKnowledgeMap(mapFile) {
  const map = JSON.parse(await fs.readFile(mapFile, 'utf8'))
  const subject = map.subject
  if (!subject) throw new Error(`${mapFile} 缺 subject`)
  let subjectId = (await Q(`SELECT id FROM ontology.subject WHERE code = $1`, [String(subject).toUpperCase()])).rows[0]?.id
  if (!subjectId) {
    // 学科自举：版图六学科是完整学科集，不能依赖教材批次先行（chn/eng/chem/bio 无教材时也要有版图）。
    // map 文件自报 subjectName，与 upsertSubject 同源逻辑灌 subject 行。
    if (!map.subjectName) throw new Error(`学科 ${subject} 不在 ontology.subject 且 map 缺 subjectName，无法自举`)
    await Q(
      `INSERT INTO ontology.subject (code, name) VALUES ($1,$2)
       ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name`,
      [String(subject).toUpperCase(), map.subjectName],
    )
    await Q(
      `INSERT INTO ontology.master_data (kind, label, code, value, is_builtin, sort_order) VALUES ('Subject', $1, $2, '{}'::jsonb, true, 20)
       ON CONFLICT (kind, code) DO NOTHING`,
      [map.subjectName, String(subject).toUpperCase()],
    )
    subjectId = (await Q(`SELECT id FROM ontology.subject WHERE code = $1`, [String(subject).toUpperCase()])).rows[0].id
    console.log(`  + 学科自举：${String(subject).toUpperCase()}（${map.subjectName}）——版图先于教材批次`)
  }

  let n = 0
  const areaIdByCode = new Map()
  // 领域（f.NN，一级）
  for (const f of map.fields ?? []) {
    if (!f.code || !f.name) continue
    await Q(
      `INSERT INTO ontology.knowledge_area (code, name, description, scope, grade_level, status, subject_id, sort_order)
       VALUES ($1,$2,$3,'k12',NULL,'published',$4,$5)
       ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, subject_id=EXCLUDED.subject_id`,
      [f.code, f.name, f.description ?? null, subjectId, f.sortOrder ?? null],
    )
    areaIdByCode.set(f.code, (await Q(`SELECT id FROM ontology.knowledge_area WHERE code = $1`, [f.code])).rows[0].id)
    n++
  }
  // 知识域（a.NN.MM，二级；frontier 不落年级）
  for (const a of map.areas ?? []) {
    if (!a.code || !a.name) continue
    const scope = a.frontier ? 'frontier' : 'k12'
    if (!AREA_SCOPES.has(scope)) throw new Error(`版图 ${a.code} scope "${scope}" 不在闭集 [k12/frontier]`)
    // 父领域推导：fieldIdx 是领域序（生成器赋锚形态）——按 code 前缀 a.NN.MM → f.NN 对位（key 名不依赖生成器内部字段名）
    const am = a.code.match(/\.a\.(\d{2})\./)
    const parentCode = am ? `${subject}.map.f.${am[1]}` : null
    const parentId = parentCode ? areaIdByCode.get(parentCode) ?? null : null
    await Q(
      `INSERT INTO ontology.knowledge_area (code, name, description, scope, grade_level, status, subject_id, parent_id, sort_order)
       VALUES ($1,$2,$3,$4,$5,'published',$6,$7,$8)
       ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description,
         scope=EXCLUDED.scope, grade_level=EXCLUDED.grade_level, parent_id=EXCLUDED.parent_id`,
      [a.code, a.name, a.description ?? null, scope, a.frontier ? null : (a.gradeLevel ?? null), subjectId, parentId, a.sortOrder ?? null],
    )
    areaIdByCode.set(a.code, (await Q(`SELECT id FROM ontology.knowledge_area WHERE code = $1`, [a.code])).rows[0].id)
    n++
  }
  // 前置边（按 code 解析；未命中跳过不报错——同 kp_prerequisite 容错）
  const fromAreas = new Set((map.areas ?? []).map((a) => a.code))
  for (const a of map.areas ?? []) {
    for (const pre of a.prerequisites ?? []) {
      const toId = areaIdByCode.get(pre)
      const fromId = areaIdByCode.get(a.code)
      if (!toId || !fromId || !fromAreas.has(pre)) continue
      await Q(
        `INSERT INTO ontology.area_prerequisite (from_area, to_area) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [fromId, toId],
      )
    }
  }
  // 真源对齐（可变本体红线）：map 是版图真源——真源中消失的节点归档（archived）而非物理删，
  // 保历史掌握度/打卡记录可关联；其前置边物理删（边无历史语义）。先查存量再比对。
  const liveRows = (await Q(
    `SELECT id, code, status FROM ontology.knowledge_area WHERE subject_id = $1 AND code LIKE $2`,
    [subjectId, `${subject}.map.%`],
  )).rows
  const mapCodes = new Set([...(map.fields ?? []), ...(map.areas ?? [])].map((x) => x.code).filter(Boolean))
  let archived = 0, edgesRemoved = 0
  for (const row of liveRows) {
    if (mapCodes.has(row.code)) continue
    await Q(`DELETE FROM ontology.area_prerequisite WHERE from_area = $1 OR to_area = $1`, [row.id])
    edgesRemoved += 1 // 保守计（实际边数可能为 0，此处计节点数口径）
    await Q(`UPDATE ontology.knowledge_area SET status = 'archived' WHERE id = $1`, [row.id])
    archived++
  }
  if (archived) console.log(`  ↯ 真源对齐：${archived} 个真源已删节点转 archived（掌握度/打卡历史保留）`)
  return { subject, nodes: n }
}

// ---------------------------------------------------------------------------
// 主流程（provider 入口）
// ---------------------------------------------------------------------------

/** 灌库主流程（事务查询口 `Q` 由宿主注入；DRY_RUN 的 COMMIT/ROLLBACK 由宿主管）。返回汇总。 */
export async function importAll(query, { dryRun = false } = {}) {
  Q = query
  const catalogDir = path.join(__dirname, 'catalog')
  const stagingDir = path.join(__dirname, 'staging')
  const mapsDir = path.join(__dirname, 'maps')

  // 1. 目录/字典
  const dictN = await upsertDictionary()
  console.log(`✓ 字典灌库：学段 3 + 年级 12（含 master_data 同源刷新，共 ${dictN} upsert）`)

  // 2. 先收集并灌学科（textbook FK 依赖 subject 行，须先于教材）
  const subjects = new Map() // code -> {code, name, domain}
  const files = (await fs.readdir(catalogDir, { recursive: true })).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
  for (const f of files) {
    const raw = await fs.readFile(path.join(catalogDir, f), 'utf8')
    const catalog = yaml.load(raw)
    if (!catalog?.textbook) continue
    if (!subjects.has(catalog.textbook.subject)) {
      subjects.set(catalog.textbook.subject, {
        code: catalog.textbook.subject,
        name: catalog.textbook.subjectName ?? catalog.textbook.subject, // 展示名（可由 catalog 补）
        domain: catalog.textbook.subjectDomain ?? null,
      })
    }
  }
  for (const s of subjects.values()) await upsertSubject(s)
  if (subjects.size) console.log(`✓ 学科灌库：${[...subjects.keys()].join('/')}`)

  // 3. catalog（教材/章节树）
  for (const f of files) {
    const raw = await fs.readFile(path.join(catalogDir, f), 'utf8')
    const catalog = yaml.load(raw)
    if (!catalog?.textbook) continue
    const { chapters } = await upsertCatalog(catalog)
    console.log(`✓ 教材灌库：${catalog.textbook.code}（章节 ${chapters}）← ${f}`)
  }

  // 4. staging（人工审核通过者）
  let stagingFiles = []
  try {
    stagingFiles = (await fs.readdir(stagingDir)).filter((f) => f.endsWith('.json'))
  } catch { /* staging 目录可不存在 */ }
  let kpN = 0
  for (const f of stagingFiles) {
    const staging = JSON.parse(await fs.readFile(path.join(stagingDir, f), 'utf8'))
    kpN += await upsertStaging(staging)
    console.log(`✓ staging 灌库：${f}`)
  }

  // 5. 学科知识版图（maps/*.map.json，人工审核通过者）
  let mapFiles = []
  try {
    mapFiles = (await fs.readdir(mapsDir)).filter((f) => f.endsWith('.map.json'))
  } catch { /* maps 目录可不存在 */ }
  let areaN = 0
  for (const f of mapFiles) {
    const { subject, nodes } = await upsertKnowledgeMap(path.join(mapsDir, f))
    areaN += nodes
    console.log(`✓ 版图灌库：${subject}（节点 ${nodes}）← ${f}`)
  }

  return { dictN, subjects: [...subjects.keys()], kpN, areaN }
}

/** `knowledge.content` provider（P-2）：宿主只认此面；领域 SQL 全在本模块（不再散在 CLI）。 */
export const provider = Object.freeze({
  id: 'k12-curriculum',
  kind: 'knowledge.content',
  apiVersion: '1',
  provides: ['knowledge.content'],
  importAll,
})

export default provider
