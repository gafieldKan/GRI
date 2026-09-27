/**
 * map-patch.mjs —— 版图草案补口轮（研发阶段 AI 衔接 · 人工审核门禁内）
 *
 * 背景：整图生成的小学段常有空洞（bio 缺 G1/2/4/5/6…）。整图重生成会打散已有 40+ 节点
 * （LLM 非确定性，二次生成丢好内容），补口轮只请 LLM 补缺口年级节点、合并进既有草案。
 *
 * 用法：LLM_API_KEY=… node scripts/k12-curriculum/map-patch.mjs
 * 输入：maps-draft/<subject>.draft.json + 脚本内 GAP 清单（缺哪些年级）
 * 输出：就地合并回同名草案文件（新增节点 fields 匹配 + code 续排 + 前置换算）
 *
 * 红线：产物仍 status=draft——人工审核通过才写 maps/*.map.json 入 git。
 */

import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LLM = {
  apiKey: process.env.LLM_API_KEY ?? '',
  apiUrl: process.env.LLM_API_URL ?? 'https://integrate.api.nvidia.com/v1/chat/completions',
  model: process.env.LLM_MODEL ?? 'nvidia/nemotron-3-super-120b-a12b',
}
if (!LLM.apiKey) {
  console.error('[map-patch] 缺 LLM_API_KEY —— refusing')
  process.exit(1)
}

// 缺口清单：动态计算（k12 节点未覆盖的年级）——重跑只补仍缺的年级，天然幂等；
// 静态清单的重跑会把已补年级再补一轮（LLM 非确定性 → 同年级双份不同名节点），此坑已修
function gapsOf(draft) {
  const covered = new Set(draft.areas.filter((a) => !a.frontier).map((a) => a.gradeLevel))
  return [...Array(12).keys()].map((i) => i + 1).filter((g) => !covered.has(g))
}

const SYSTEM = `你是资深 K12 课程专家，精通人民教育出版社课程体系。
任务：给定学科的既有知识版图与缺口年级清单，只为缺口年级补「知识域」节点。
要求：
1. 只补指定年级的节点，不要重复已有节点主题（给已有节点名清单，避免重复）
2. 每个缺口年级补 2-4 个知识域节点（若该年级在小学科学/课程中有该学科内容）
3. 节点归属既有领域之一（给领域名清单与序号）
4. 严格输出 JSON 数组，每个元素：
   {"field": 1, "name": "知识域名", "description": "一句话说明学生要学会什么", "gradeLevel": 4, "frontier": false, "prerequisites": []}
5. prerequisites 留空数组——补口节点的前置由既有节点自然承接，不新增交叉边
说明：若某缺口年级在真实 K12 课程中无该学科内容（如生物 G1 无独立生物课），返回空数组 []。`

async function chat(messages, maxTokens = 8000) {
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
  const start = raw.search(/\[/)
  if (start < 0) throw new Error('回复中未找到 JSON 数组')
  const slice = raw.slice(start)
  for (let end = slice.length; end > 2; end--) {
    try {
      return JSON.parse(slice.slice(0, end))
    } catch { /* 缩短重试 */ }
  }
  throw new Error('JSON 解析失败')
}

async function patchSubject(sub, gaps) {
  const draftPath = path.join(__dirname, 'maps-draft', `${sub}.draft.json`)
  const draft = JSON.parse(await fs.readFile(draftPath, 'utf8'))
  const fields = draft.fields
  const existing = draft.areas.filter((a) => !a.frontier)
  console.log(`\n=== ${draft.subjectName}（${sub}）: 补 G${gaps.join('/G')} ===`)
  const reply = await chat([
    { role: 'system', content: SYSTEM },
    { role: 'user', content: JSON.stringify({
      学科: draft.subjectName,
      领域: fields.map((f, i) => ({ 序号: i + 1, 名称: f.name })),
      缺口年级: gaps,
      已有知识域: existing.map((a) => a.name),
    }, null, 2) },
  ])
  let nodes
  try {
    nodes = extractJson(reply)
  } catch (e) {
    console.warn(`  ⚠ 解析失败：${e.message}——重问一次`)
    nodes = extractJson(await chat([
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `（上次输出不是合法 JSON 数组，请严格只输出 JSON 数组本身）` },
    ]))
  }
  if (!Array.isArray(nodes)) throw new Error('输出不是数组')

  // 合并：field 序 1 基→ 领域内续排 code；去重（name+gradeLevel 已有则跳过）
  let added = 0
  for (const n of nodes) {
    if (!n?.name || !n?.gradeLevel) continue
    if (n.frontier) continue // 补口轮只补 k12 节点
    if (existing.some((a) => a.name === n.name && a.gradeLevel === n.gradeLevel)) continue
    const fIdx = Math.max(1, Math.min(Number(n.field) || 1, fields.length))
    const inField = draft.areas.filter((x) => x.fieldIdx === fIdx).length + 1
    const code = `${sub}.map.a.${String(fIdx).padStart(2, '0')}.${String(inField).padStart(2, '0')}`
    draft.areas.push({
      code, name: String(n.name).slice(0, 150), description: String(n.description ?? ''),
      frontier: false, gradeLevel: Math.max(1, Math.min(Number(n.gradeLevel) || 7, 12)),
      fieldIdx: fIdx, prerequisites: [],
    })
    added++
  }
  // 同 code 幂等保护：draft 内 code 唯一（续排保证；此行只兜底报错）
  const codes = draft.areas.map((a) => a.code)
  if (codes.length !== new Set(codes).size) throw new Error('code 冲突（续排失守）')
  await fs.writeFile(draftPath, JSON.stringify(draft, null, 2), 'utf8')
  console.log(`  + 新增 ${added} 节点（合并后 ${draft.areas.length}）`)
  return added
}

async function main() {
  let failed = []
  for (const f of (await fs.readdir(path.join(__dirname, 'maps-draft'))).filter((x) => x.endsWith('.draft.json'))) {
    const sub = f.replace('.draft.json', '')
    try {
      const gaps = gapsOf(JSON.parse(await fs.readFile(path.join(__dirname, 'maps-draft', f), 'utf8')))
      if (!gaps.length) {
        console.log(`\n=== ${sub}：无年级缺口，跳过 ===`)
        continue
      }
      await patchSubject(sub, gaps)
    } catch (e) {
      failed.push(sub)
      console.error(`  ✗ ${sub} 补口失败：${e.message}`)
    }
  }
  if (failed.length) {
    console.error(`\n[map-patch] ${failed.length} 学科补口失败（${failed.join('/')}）——请重跑`)
    process.exit(1)
  }
  console.log('\n（补口完成——草案仍 status=draft，人工审核门禁不变）')
}

main().catch((e) => {
  console.error('[map-patch] 失败：', e.message)
  process.exit(1)
})
