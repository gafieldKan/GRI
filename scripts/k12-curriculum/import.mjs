/**
 * k12-curriculum 数据管线 —— import.mjs（幂等灌库）
 *
 * 职责：
 *  1. catalog/*.yaml → 幂等 upsert ontology 六表（Subject/SchoolStage/Grade/Textbook/TextbookChapter）
 *     + master_data 同源刷新（kind=Subject/Grade/SchoolStage 派生缓存，单一真源仍是 YAML）
 *  2. staging/*.json（人工审核通过 status:reviewed|published）→ 幂等灌库
 *     edu.knowledge_points（按 code 锚点）+ 前置建议解析进 ontology.kp_prerequisite
 *     + edu.questions
 *
 * 用法：node scripts/k12-curriculum/import.mjs [--dry-run]
 * 幂等锚点：code（六表 UNIQUE）+ knowledge_points.code UNIQUE。
 * 环境：DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD（默认 localhost:5432/gri）。
 */

import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'
import pg from 'pg'

const require = createRequire(import.meta.url)
const yaml = require('js-yaml')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DRY_RUN = process.argv.includes('--dry-run')

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
        await Q(
          `INSERT INTO edu.questions (knowledge_point_id, content, answer, analysis, difficulty, type)
           SELECT $1,$2,$3,$4,$5,'multiple-choice'
           WHERE NOT EXISTS (SELECT 1 FROM edu.questions WHERE knowledge_point_id = $1 AND content = $2)`,
          [kpId, ex.content, ex.answer, ex.analysis ?? null, ex.difficulty ?? 'medium'],
        )
      }
    }
    n++
  }
  return n
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function main() {
  const catalogDir = path.join(__dirname, 'catalog')
  const stagingDir = path.join(__dirname, 'staging')

  // 单事务：全链路（字典→学科→教材→章节→staging）一 BEGIN/COMMIT，全或无
  tx = await db.connect()
  await Q('BEGIN')
  if (DRY_RUN) console.log('（dry-run 模式：全链路彩排后 ROLLBACK，库无痕）')
  try {
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
