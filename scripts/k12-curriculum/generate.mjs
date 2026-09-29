/**
 * k12-curriculum 数据管线 —— generate.mjs（LLM 批量生成）
 *
 * 职责：读 catalog/*.yaml，按章节调 LLM（NVIDIA 网关）批量生成：
 *  - 每章细化知识点（含年级定位、前置建议、易错点）
 *  - 每知识点 2–5 道例题（含答案+解析）
 * 输出 staging/*.json（status: draft——人工审核门禁，审核通过才可 import 灌库）。
 *
 * 用法：node scripts/k12-curriculum/generate.mjs [--catalog math/g7-pep.yaml] [--limit N]
 *       [--only ch12.s01,ch13.s02]（增量补生成：只重生命中章节，其余保留既有 staging）
 * 环境：LLM_API_KEY（nvapi- 前缀，NVIDIA 网关）/ LLM_API_URL / LLM_MODEL。
 * 红线：staging 产物是「人工审核」的输入，不直接落库（状态机 draft→reviewed→published）。
 */

import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const yaml = require('js-yaml')

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const args = process.argv.slice(2)
const argOf = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt)
const CATALOG = argOf('--catalog', 'math/g7-pep.yaml')
const LIMIT = parseInt(argOf('--limit', '0'), 10) || Infinity // 每知识点例题数上限调试用
const ONLY = (argOf('--only', '') || '').split(',').map((s) => s.trim()).filter(Boolean) // 增量补生成白名单（空=全量）

const LLM = {
  apiKey: process.env.LLM_API_KEY ?? '',
  apiUrl: process.env.LLM_API_URL ?? 'https://integrate.api.nvidia.com/v1/chat/completions',
  model: process.env.LLM_MODEL ?? 'nvidia/nemotron-3-super-120b-a12b',
}

if (!LLM.apiKey) {
  console.error('[generate] 缺 LLM_API_KEY（nvapi- 前缀）—— refusing')
  process.exit(1)
}

const GRADE_NAMES = {
  G1: '一年级', G2: '二年级', G3: '三年级', G4: '四年级', G5: '五年级', G6: '六年级',
  G7: '七年级', G8: '八年级', G9: '九年级', G10: '高一', G11: '高二', G12: '高三',
}
const gradeLevelOf = (code) => parseInt(String(code).replace(/^G/i, ''), 10)

// ---------------------------------------------------------------------------
// LLM 调用（OpenAI 兼容 chat/completions；nemotron 是 reasoning 模型，content/reasoning_content 兜底）
// ---------------------------------------------------------------------------

async function chat(messages, maxTokens = 4096) {
  let lastErr
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(LLM.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LLM.apiKey}` },
        body: JSON.stringify({ model: LLM.model, messages, max_tokens: maxTokens, temperature: 0.3 }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`LLM ${res.status}: ${text.slice(0, 300)}`)
      }
      const data = await res.json()
      const msg = data.choices?.[0]?.message ?? {}
      return msg.content || msg.reasoning_content || ''
    } catch (e) {
      lastErr = e
      // 5xx/网络抖动/429 限流指数退避重试；其余 4xx（如 key 无效）直接抛。
      // 429 是限流类（配额窗口）——退避等待是唯一正解，不重试则整批前功尽弃。
      const retryable = /LLM 5\d{2}|LLM 429|fetch failed|network/.test(e.message)
      if (!retryable || attempt === 5) throw e
      const wait = 2000 * 2 ** (attempt - 1)
      console.warn(`  ⚠ ${e.message.slice(0, 80)}——${wait / 1000}s 后重试（${attempt}/5）`)
      await new Promise((r) => setTimeout(r, wait))
    }
  }
  throw lastErr
}

// 从 LLM 回复中稳提取 JSON（容忍 ```json 围栏 / 前后杂文）
function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced ? fenced[1] : text
  const start = raw.search(/[[{]/)
  if (start < 0) throw new Error('回复中未找到 JSON')
  const slice = raw.slice(start)
  // 尝试从后往前截到配对闭合
  for (let end = slice.length; end > 2; end--) {
    try {
      return JSON.parse(slice.slice(0, end))
    } catch { /* 缩短重试 */ }
  }
  throw new Error('JSON 解析失败')
}

// ---------------------------------------------------------------------------
// 提示词（因材施教视角：知识点为「教什么」的骨架，例题为「学得会」的抓手）
// 学科/年级按 catalog 参数化（EX 模板占位 {SUBJECT}/{GRADE}）——二期多学科多年级不再硬编码。
// ---------------------------------------------------------------------------

const KP_SYSTEM = `你是资深 K12 课程设计专家，精通人民教育出版社教材体系。
任务：按给定章节，细化出该章节的核心知识点（5-8 个），供 AI 辅导系统使用。
要求：
1. 知识点要成体系、细化到具体内容（不是章节标题复读），粒度为一节课可讲完的单元
2. 每个知识点标注：年级定位（应掌握年级）、前置知识点（本章或之前章节的知识点编码）、易错点
3. 前置知识点用本输出中其他知识点的 code（若前置在本章外，用 "ch外部" 占位，import 时会跳过）
4. 严格输出 JSON 数组，不要多余文字：
[{
  "name": "知识点名",
  "description": "一句话说明学生要学会什么",
  "prerequisites": ["code1", "code2"],
  "commonMistakes": ["易错点1", "易错点2"]
}]`

const EX_SYSTEM_TEMPLATE = `你是资深 K12 {SUBJECT}命题专家，精通人民教育出版社教材。
任务：为给定知识点出 3 道例题（选择题），覆盖基础/进阶/应用三个难度。
要求：
1. 题目表述清晰，符合{GRADE}学生认知水平
2. 选择题 4 个选项（A/B/C/D），答案唯一
3. 解析要讲清思路（为什么对、其他选项为什么错）
4. 严格输出 JSON 数组，不要多余文字：
[{
  "content": "题干",
  "options": [{"text": "A. …"}, {"text": "B. …"}, {"text": "C. …"}, {"text": "D. …"}],
  "answer": "A",
  "analysis": "解析",
  "difficulty": "easy|medium|hard"
}]`

// ---------------------------------------------------------------------------
// 主流程：目录 → 每章生成 KP → 每 KP 生成例题 → staging/*.json
// ---------------------------------------------------------------------------

async function main() {
  const catalogPath = path.join(__dirname, 'catalog', CATALOG)
  const catalog = yaml.load(await fs.readFile(catalogPath, 'utf8'))
  if (!catalog?.textbook) throw new Error(`catalog 无 textbook：${CATALOG}`)

  const gradeLevel = gradeLevelOf(catalog.textbook.grade)
  const gradeName = GRADE_NAMES[catalog.textbook.grade] ?? catalog.textbook.grade
  const subjectName = catalog.textbook.subjectName ?? '综合'
  const EX_SYSTEM = EX_SYSTEM_TEMPLATE
    .replaceAll('{SUBJECT}', subjectName)
    .replaceAll('{GRADE}', gradeName)
  console.log(`生成目标：${catalog.textbook.name}（${subjectName}，${gradeName}，gradeLevel=${gradeLevel}）`)

  // 展平章节（章 → 节）
  const sections = []
  for (const ch of catalog.chapters ?? []) {
    sections.push({ code: ch.code, name: ch.name, isSection: false })
    for (const s of ch.children ?? []) {
      sections.push({ code: s.code, name: s.name, isSection: true, hint: s.hint })
    }
  }
  console.log(`章节展开：${sections.length} 个（含节）`)

  // 断点续跑 checkpoint：每节完成即落盘，重跑时跳过已完成节（429/503 中断后零浪费续跑）。
  // checkpoint 形态与 staging 同构（knowledgePoints 数组），中断后重跑自动从断点续。
  const outName = CATALOG.replace(/[/.]/g, '-').replace(/-yaml$/, '') + '.staging.json'
  const outPath = path.join(__dirname, 'staging', outName)
  const ckptPath = outPath.replace(/\.staging\.json$/, '.checkpoint.json')
  const knowledgePoints = []
  let doneSections = new Set()
  try {
    const ckpt = JSON.parse(await fs.readFile(ckptPath, 'utf8'))
    knowledgePoints.push(...(ckpt.knowledgePoints ?? []))
    doneSections = new Set(knowledgePoints.map((k) => k.chapter))
    console.log(`✓ 断点续跑：已有 ${doneSections.size} 节 ${knowledgePoints.length} KP（重跑自动跳过）`)
  } catch { /* 无 checkpoint → 全量 */ }
  const sectionByCode = new Map(sections.map((s) => [s.code, s]))

  for (const sec of sections) {
    // 章级生成 KP（挂在节上更细；章级只汇总）——只对「节」生成
    if (!sec.isSection) continue
    if (doneSections.has(sec.code)) continue
    if (ONLY.length && !ONLY.includes(sec.code.replace(`${catalog.textbook.code}.`, ''))) continue
    const hint = sec.hint ? `\n课题语境提示（务必遵守）：${sec.hint}` : ''
    const kpReply = await chat([
      { role: 'system', content: KP_SYSTEM },
      { role: 'user', content: `章节：${sec.name}\n教材：${catalog.textbook.name}（${gradeName}）\n本章上级章节：${sec.code}${hint}` },
    ])
    let kps
    try {
      kps = extractJson(kpReply)
    } catch {
      // 解析失败重问一次（LLM 偶发围栏/截断，一次重试能救回大部分；再失败才跳过）
      console.warn(`  ⚠ KP 首次解析失败（${sec.code}）——重问一次`)
      const retryReply = await chat([
        { role: 'system', content: KP_SYSTEM },
        { role: 'user', content: `章节：${sec.name}\n教材：${catalog.textbook.name}（${gradeName}）\n本章上级章节：${sec.code}${hint}\n\n（上次输出不是合法 JSON，请严格只输出 JSON 数组本身）` },
      ])
      try {
        kps = extractJson(retryReply)
      } catch (e) {
        console.warn(`  ⚠ KP 重问仍解析失败（${sec.code}）：${e.message}——跳过本节`)
        continue
      }
    }
    if (!Array.isArray(kps) || kps.length === 0) {
      console.warn(`  ⚠ KP 为空（${sec.code}）——跳过本章`)
      continue
    }

    for (const kp of kps.slice(0, 8)) {
      const code = `${sec.code}.kp${String(knowledgePoints.filter((k) => k.chapter === sec.code).length + 1).padStart(2, '0')}`
      const item = {
        code,
        chapter: sec.code,
        chapterName: sec.name,
        name: String(kp.name ?? '').slice(0, 150),
        description: String(kp.description ?? ''),
        subject: String(catalog.textbook.subject).toLowerCase(),
        gradeLevel,
        grade: catalog.textbook.grade,
        prerequisites: Array.isArray(kp.prerequisites) ? kp.prerequisites.map(String).slice(0, 5) : [],
        commonMistakes: Array.isArray(kp.commonMistakes) ? kp.commonMistakes.map(String).slice(0, 5) : [],
        status: 'draft',
        examples: [],
      }

      // 每 KP 生成例题（失败不阻塞：留空例题、人工可重生成）
      try {
        const exReply = await chat([
          { role: 'system', content: EX_SYSTEM },
          { role: 'user', content: `知识点：${item.name}\n说明：${item.description}\n年级：${gradeName}` },
        ])
        const exs = extractJson(exReply)
        if (Array.isArray(exs)) {
          item.examples = exs.slice(0, Math.min(5, LIMIT)).map((ex) => ({
            content: String(ex.content ?? ''),
            options: Array.isArray(ex.options) ? ex.options : [],
            answer: String(ex.answer ?? ''),
            analysis: String(ex.analysis ?? ''),
            difficulty: ['easy', 'medium', 'hard'].includes(ex.difficulty) ? ex.difficulty : 'medium',
          })).filter((ex) => ex.content && ex.answer)
        }
      } catch (e) {
        console.warn(`  ⚠ 例题生成失败（${code}）：${e.message}`)
      }

      knowledgePoints.push(item)
      console.log(`  ✓ ${code} ${item.name}（例题 ${item.examples.length}）`)
    }
    // 本节完成即落盘 checkpoint（原子替换：先写临时文件再 rename，防中断写半个 JSON）
    const tmp = ckptPath + '.tmp'
    await fs.writeFile(tmp, JSON.stringify({ catalog: catalog.textbook.code, knowledgePoints }, null, 1), 'utf8')
    await fs.rename(tmp, ckptPath)
  }

  // staging 输出（draft——人工审核门禁）
  // 前置引用规范化（LLM 产出的前置引用常有两类坏值，这里统一清洗成可入库形态）：
  //   1. 短引用 kp1 → 补零对齐本节实际 code（kp1 → math.g7.pep.ch01.s01.kp01；同节内锚点）
  //   2. 幻觉值（ch外部 等，既非 kpNN 也非完整 code）→ 丢弃（导入时前置缺失会跳过，不报错）
  // 锚点正则按 catalog textbook code 派生（二期多教材不再硬编码前缀）：
  const escCode = catalog.textbook.code.replace(/[.+?*^${}()|[\]\\]/g, '\\$&')
  const secPat = new RegExp(`^(${escCode}\\.ch\\d+\\.s\\d+)\\.kp(\\d+)$`)
  const fullPat = new RegExp(`^${escCode}\\.ch\\d+`)
  const bySection = {}
  for (const k of knowledgePoints) {
    const m = k.code.match(secPat)
    if (m) (bySection[m[1]] = bySection[m[1]] || new Set()).add(String(Number(m[2])))
  }
  let preFixed = 0, preDropped = 0
  for (const k of knowledgePoints) {
    const m = k.code.match(secPat)
    k.prerequisites = (k.prerequisites ?? []).filter((p) => {
      if (fullPat.test(p)) return true // 完整 code 原样保留
      const pm = p.match(/^kp(\d+)$/i)
      if (pm && m && bySection[m[1]]?.has(String(Number(pm[1])))) {
        preFixed++
        return true // 短引用→本节有锚点，导入时按 code 解析（import 侧同样做补零解析）
      }
      preDropped++
      return false // 幻觉值丢弃
    })
  }
  if (preFixed || preDropped) console.log(`✓ 前置引用规范化：补零对齐 ${preFixed} 处、丢弃幻觉 ${preDropped} 处`)

  // staging 输出（draft——人工审核门禁）
  // 增量补生成（--only）：保留既有 staging 中未被重命的节，重命节以新生成覆盖；
  // 其余情况为全量生成，直接整册覆盖。
  let knowledgePointsFinal = knowledgePoints
  if (ONLY.length) {
    try {
      const prev = JSON.parse(await fs.readFile(outPath, 'utf8'))
      const onlyCodes = new Set(ONLY.map((o) => `${catalog.textbook.code}.${o}`))
      const kept = (prev.knowledgePoints ?? []).filter((k) => !onlyCodes.has(k.chapter))
      knowledgePointsFinal = [...kept, ...knowledgePoints]
      console.log(`✓ 增量合并：保留既有 ${kept.length} 条 + 新生成 ${knowledgePoints.length} 条`)
    } catch { /* 无既有 staging → 全量 */ }
  }
  const data = {
    catalog: catalog.textbook.code,
    generatedAt: new Date().toISOString(),
    model: LLM.model,
    knowledgePoints: knowledgePointsFinal,
  }
  await fs.mkdir(path.dirname(outPath), { recursive: true })
  await fs.writeFile(outPath, JSON.stringify(data, null, 2), 'utf8')
  try { await fs.unlink(ckptPath) } catch { /* 无 checkpoint */ }
  console.log(`\n✓ staging 输出：${outPath}（${knowledgePointsFinal.length} 知识点，status=draft 待人工审核）`)
}

main().catch((e) => {
  console.error('[generate] 失败：', e.message)
  process.exit(1)
})
