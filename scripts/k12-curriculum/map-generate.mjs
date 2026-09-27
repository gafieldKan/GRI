/**
 * k12-curriculum 数据管线 —— map-generate.mjs（学科知识版图 LLM 草拟）
 *
 * 职责：按学科调 LLM 产出「学科整体知识」全学段版图草案（staging 性质）：
 *  - 领域分组（3–6 组，学科主干领域）
 *  - 每组知识域节点：k12 落位（gradeLevel 1–12）+ frontier 峰外地带（大学/学科前沿）
 *  - 节点间前置边（DAG：哪片知识域先于哪片）
 * 输出 maps-draft/<subject>.draft.json（status=draft——人工审核门禁，审核通过才可入 git 真源）。
 *
 * 用法：node scripts/k12-curriculum/map-generate.mjs [--subject math|phys|chem|chn|eng|bio] [--all]
 * 环境：LLM_API_KEY（nvapi- 前缀，NVIDIA 网关）/ LLM_API_URL / LLM_MODEL。
 * 红线：草案是「人工审核」的输入；审核通过后写 maps/<subject>.map.json（status=published）入 git。
 *
 * 编码约定（code 锚点，import 幂等灌库依赖）：
 *  <subject>.map.f.NN            领域（field，一级）
 *  <subject>.map.a.NN.MM         知识域（area，二级；NN=领域序，MM=域内序）
 * 前置边引用知识域 code（a 类）；import 侧未命中即跳过不报错（同 kp_prerequisite 容错）。
 */

import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const args = process.argv.slice(2)
const argOf = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt)
const SUBJECT = argOf('--subject', '')
const ALL = args.includes('--all')

const LLM = {
  apiKey: process.env.LLM_API_KEY ?? '',
  apiUrl: process.env.LLM_API_URL ?? 'https://integrate.api.nvidia.com/v1/chat/completions',
  model: process.env.LLM_MODEL ?? 'nvidia/nemotron-3-super-120b-a12b',
}

if (!LLM.apiKey) {
  console.error('[map-generate] 缺 LLM_API_KEY（nvapi- 前缀）—— refusing')
  process.exit(1)
}

// 六学科（与 k12 本体判别值闭集对齐；import 侧同闭集门禁）
const SUBJECTS = [
  { code: 'math', name: '数学' },
  { code: 'chn', name: '语文' },
  { code: 'eng', name: '英语' },
  { code: 'phys', name: '物理' },
  { code: 'chem', name: '化学' },
  { code: 'bio', name: '生物' },
]

const SYSTEM = `你是资深 K12 课程专家兼学科史研究者，精通人民教育出版社课程体系与学科知识全景。
任务：为给定学科绘制「学科整体知识版图」——从一年级到高三（G1–G12）学生学习的知识域，加上 K12 之外的学科前沿地带，构成该学科完整的知识地图，用于登山式知识图谱展示。
要求：
1. 领域分组：把学科主干知识划成 4-6 个「领域」（一级），领域是学科知识版图的主脉（如数学：数与代数/图形与几何/统计与概率/综合与实践）
2. 知识域节点：每个领域下 5-12 个「知识域」（二级），粒度是"一学期到一学年的知识单元"，不要细到单个知识点
3. 年级落位：每个知识域标 gradeLevel（1-12，该知识域主要掌握年级）；小学段（1-6）与中学段（7-9）、高中段（10-12）都要有节点，覆盖全学段
4. 峰外地带：areas 数组中必须含 3-6 个 frontier=true 的知识域——该学科在 K12 之后才学的核心地带（大学主干/学科前沿），让登山者看到顶峰之外还有什么。frontier 知识域不得写成纯文字提示，必须是 areas 中的结构化节点（有 name/description/frontier:true，无 gradeLevel）
5. 前置边：标出知识域之间的先后依赖（如"一元一次方程"先于"一元二次方程"），用知识域 code 互相引用
6. 严格输出 JSON，不要多余文字：
{
  "fields": [{ "name": "领域名", "description": "一句话该领域覆盖什么" }],
  "areas": [{
    "field": 0,
    "name": "知识域名",
    "description": "一句话说明学生要学会什么",
    "gradeLevel": 7,
    "frontier": false,
    "prerequisites": ["其他知识域的引用"]
  }],
  "frontierHints": ["每条 frontier 的大学课程/前沿方向归属，一句话"]
}
说明：areas 中 frontier=true 的节点不标 gradeLevel；prerequisites 引用同 JSON 中其他 area 的序号（如 "a3" 表示第 4 个 area），本脚本会换算成稳定 code。`

async function chat(messages, maxTokens = 8192) {
  let lastErr
  for (let attempt = 1; attempt <= 4; attempt++) {
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
      const retryable = /LLM 5\d{2}|fetch failed|network/.test(e.message)
      if (!retryable || attempt === 4) throw e
      const wait = 2000 * 2 ** (attempt - 1)
      console.warn(`  ⚠ ${e.message.slice(0, 80)}——${wait / 1000}s 后重试（${attempt}/4）`)
      await new Promise((r) => setTimeout(r, wait))
    }
  }
  throw lastErr
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced ? fenced[1] : text
  const start = raw.search(/[[{]/)
  if (start < 0) throw new Error('回复中未找到 JSON')
  const slice = raw.slice(start)
  // 截断兜底：max_tokens 掐尾（JSON 未闭合）时补 }/"] 收口再 parse——LLM 大版图常超 8k tokens
  const closures = ['"]}', '"], "areas": []}', '"], "frontierHints": []}']
  for (let end = slice.length; end > 2; end--) {
    const s = slice.slice(0, end).trim()
    try {
      return JSON.parse(s)
    } catch {
      for (const c of closures) {
        try {
          return JSON.parse(s + c)
        } catch { /* 换收口重试 */ }
      }
    }
  }
  throw new Error('JSON 解析失败')
}

async function generateSubject(sub) {
  console.log(`\n=== ${sub.name}（${sub.code}）===`)
  let draft = null
  // 解析重试环：503 过载 + 8k tokens 截断双重抖动下，单次重问不够——最多 3 轮，逐轮加压输出格式
  for (let attempt = 1; attempt <= 3 && !draft?.areas?.length; attempt++) {
    const nudge = attempt === 1
      ? ''
      : `\n\n（上次输出${attempt === 2 ? '不是合法 JSON' : '不完整——areas 为空'}，请严格只输出 JSON 本身，不要任何解释文字；frontier 节点也必须放进 areas 数组）`
    const reply = await chat(
      [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `学科：${sub.name}\n学科编码：${sub.code}\n${nudge}` },
      ],
      16000,
    )
    try {
      draft = extractJson(reply)
    } catch (e) {
      console.warn(`  ⚠ 第 ${attempt} 轮解析失败：${e.message}`)
    }
  }
  if (!draft || !Array.isArray(draft.areas) || draft.areas.length === 0) throw new Error('areas 为空（3 轮解析均失败）')

  // code 赋锚：领域 f.NN / 知识域 a.NN.MM（NN=领域序，MM=域内序）；areas[i] → 引用 "aN" 换算
  const fields = (draft.fields ?? []).map((f, i) => ({
    code: `${sub.code}.map.f.${String(i + 1).padStart(2, '0')}`,
    name: String(f.name ?? '').slice(0, 100),
    description: String(f.description ?? ''),
  }))
  const fCount = fields.length
  const areas = []
  draft.areas.forEach((a, i) => {
    // LLM 输出 field 序有 0 基（提示词示例 "field": 0）与 1 基两种形态——统一按 0 基解析：
    // 序号 ≥ 领域数时退 1 基（1..fCount），序号 0 是合法 0 基（旧 Math.max(1, x || 1) 的 0-falsy 钳位 bug 已修）
    const raw = Number(a.field)
    let fIdx
    if (Number.isFinite(raw) && raw < fCount) fIdx = Math.max(1, raw + 1)
    else fIdx = Math.min(Number.isFinite(raw) ? raw : 1, fCount)
    if (fIdx < 1) fIdx = 1
    const inField = areas.filter((x) => x.fieldIdx === fIdx).length + 1
    const code = `${sub.code}.map.a.${String(fIdx).padStart(2, '0')}.${String(inField).padStart(2, '0')}`
    const frontier = !!a.frontier
    areas.push({
      code,
      name: String(a.name ?? '').slice(0, 150),
      description: String(a.description ?? ''),
      frontier,
      gradeLevel: frontier ? null : Math.max(1, Math.min(Number(a.gradeLevel) || 7, 12)),
      fieldIdx: fIdx,
      fieldRef: `a${i}`, // LLM 前置引用形态（"a3"）→ 换算表
    })
  })
  // 前置引用换算："a3" → 对应 area code（越界/幻觉丢弃，import 侧再兜底）。
  // 按生成序 i 直接回查 draft.areas[i].prerequisites——旧版按 name+gradeLevel find，重名节点即错位
  const refToCode = new Map(areas.map((a) => [a.fieldRef, a.code]))
  let preFixed = 0, preDropped = 0
  areas.forEach((a, i) => {
    a.prerequisites = (draft.areas[i]?.prerequisites ?? [])
      .map(String).slice(0, 4)
      .map((p) => {
        if (refToCode.has(p)) { preFixed++; return refToCode.get(p) }
        preDropped++; return null
      })
      .filter(Boolean)
    delete a.fieldRef
  })
  console.log(`  领域 ${fields.length} + 知识域 ${areas.length}（frontier ${areas.filter((a) => a.frontier).length}）；前置换算 ${preFixed} / 丢弃 ${preDropped}`)

  const out = {
    subject: sub.code,
    subjectName: sub.name,
    generatedAt: new Date().toISOString(),
    model: LLM.model,
    status: 'draft',
    fields,
    areas,
    frontierHints: (draft.frontierHints ?? []).map(String).slice(0, 8),
  }
  return out
}

async function main() {
  const targets = ALL ? SUBJECTS : SUBJECTS.filter((s) => s.code === SUBJECT)
  if (!targets.length) {
    console.error('[map-generate] 未知学科——用 --subject math|chn|eng|phys|chem|bio 或 --all')
    process.exit(1)
  }
  const outDir = path.join(__dirname, 'maps-draft')
  await fs.mkdir(outDir, { recursive: true })
  let failed = []
  for (const sub of targets) {
    try {
      const draft = await generateSubject(sub)
      const outPath = path.join(outDir, `${sub.code}.draft.json`)
      await fs.writeFile(outPath, JSON.stringify(draft, null, 2), 'utf8')
      console.log(`  ✓ 草案输出：${outPath}`)
    } catch (e) {
      // 指数退避上限内未扛住（限流/网络抖动）——记名并继续跑完其余学科，最后以非零码告警
      failed.push(sub.code)
      console.error(`  ✗ ${sub.code} 失败：${e.message}`)
    }
  }
  console.log('\n（全部草案 status=draft——人工审核门禁：审核通过才写 maps/*.map.json 入 git）')
  if (failed.length) {
    console.error(`\n[map-generate] ${failed.length}/${targets.length} 学科失败（${failed.join('/')}）——请对失败学科重跑 --subject 增量补齐`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('[map-generate] 失败：', e.message)
  process.exit(1)
})
