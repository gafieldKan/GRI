/**
 * map-translate.mjs —— 版图草案节点名中文化（研发阶段 AI 衔接）
 *
 * 背景：LLM 整图生成对 math/eng 两学科产出了英文领域/节点名（系统提示未锁语言），
 * 中文产品须中文化。英语学科保留「中文（English）」形态——学科语境天然双语。
 * 只译 name（description 保留原文意，不破坏信息量）；code/结构不变。
 *
 * 用法：LLM_API_KEY=… node scripts/k12-curriculum/map-translate.mjs
 * 幂等：节点名已是中文（无 ASCII 字母）则跳过。
 * 红线：产物仍 status=draft——人工审核门禁不变。
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
  console.error('[map-translate] 缺 LLM_API_KEY —— refusing')
  process.exit(1)
}

const SYSTEM = `你是 K12 课程术语翻译专家。把输入的学科知识域名称翻译为简洁的中文教学术语。
规则：
1. 数学学科：译为标准中文数学教学术语（如 "Place Value up to 1000" → "千以内数的认识"）
2. 英语学科：译为「中文（English）」形态——中文教学术语在前，括号保留英文原词（如 "Tenses Overview" → "时态总览（Tenses Overview）"）
3. 保持教育性命名风格（对应中国课标术语），避免直译腔
4. 严格输出 JSON 对象：{"原名": "译名", ...}，键与输入一一对应，不要多余文字`

async function chat(messages, maxTokens = 8000) {
  let lastErr
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(LLM.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LLM.apiKey}` },
        body: JSON.stringify({ model: LLM.model, messages, max_tokens: maxTokens, temperature: 0.2 }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`LLM ${res.status}: ${text.slice(0, 300) }`)
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
  const start = raw.search(/[{[]/)
  if (start < 0) throw new Error('回复中未找到 JSON')
  const slice = raw.slice(start)
  for (let end = slice.length; end > 2; end--) {
    try {
      return JSON.parse(slice.slice(0, end))
    } catch { /* 缩短重试 */ }
  }
  throw new Error('JSON 解析失败')
}

async function main() {
  const dir = path.join(__dirname, 'maps-draft')
  for (const f of (await fs.readdir(dir)).filter((x) => x.endsWith('.draft.json'))) {
    const p = path.join(dir, f)
    const d = JSON.parse(await fs.readFile(p, 'utf8'))
    const isEng = d.subject === 'eng'
    // 收集含 ASCII 字母的 name（领域 + 节点）
    const enNames = [...d.fields.map((x) => x.name), ...d.areas.map((x) => x.name)]
      .filter((n) => /[a-zA-Z]/.test(n))
    if (!enNames.length) {
      console.log(`  ${d.subject}: 已全中文，跳过`)
      continue
    }
    console.log(`\n=== ${d.subjectName}（${d.subject}）: ${enNames.length} 个名称待中文化 ===`)
    let map
    try {
      map = extractJson(await chat([
        { role: 'system', content: SYSTEM },
        { role: 'user', content: JSON.stringify({ 学科: d.subjectName, 待译名称: enNames }) },
      ]))
    } catch (e) {
      console.error(`  ✗ ${d.subject} 翻译失败：${e.message}`)
      process.exit(1)
    }
    let n = 0
    for (const x of [...d.fields, ...d.areas]) {
      if (map[x.name] && typeof map[x.name] === 'string') {
        x.name = map[x.name].slice(0, 150)
        n++
      }
    }
    await fs.writeFile(p, JSON.stringify(d, null, 2), 'utf8')
    console.log(`  ✓ 中文化 ${n} 名称 → ${p}`)
  }
  console.log('\n（中文化完成——草案仍 status=draft，人工审核门禁不变）')
}

main().catch((e) => {
  console.error('[map-translate] 失败：', e.message)
  process.exit(1)
})
