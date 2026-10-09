/**
 * 知识图谱确定性布局（无物理模拟、可复现）。
 *
 * buildDomainLayout：知识点按「领域」(groupOf 解析，通常为根章节) 分簇，
 * 领域按网格排列并给出可绘制的区域椭圆；节点在领域内环形排布。
 * 纯函数、无副作用、单元可测。
 */

/** 一跳邻居集合（含自身），基于任意关系边。 */
export function neighborSet(id, edges) {
  const set = new Set(id ? [id] : [])
  for (const e of edges) {
    if (e.source === id) set.add(e.target)
    else if (e.target === id) set.add(e.source)
  }
  return set
}

/** 邻接度（节点半径用）。 */
export function degreeMap(edges) {
  const deg = new Map()
  for (const e of edges) {
    deg.set(e.source, (deg.get(e.source) || 0) + 1)
    deg.set(e.target, (deg.get(e.target) || 0) + 1)
  }
  return deg
}

function radiusOf(deg) {
  return Math.min(16, 7 + Math.sqrt(deg || 0) * 2.4)
}

/**
 * @param kps 知识点数组（含 id/code/name/...）
 * @param edges 关系边（用于度数 + 相邻）
 * @param groupOf (kp) => { id, name }  领域解析
 * @returns {{ nodes: Array, domains: Array, bounds: Object }}
 */
export function buildDomainLayout(kps, edges, groupOf, opts = {}) {
  const deg = degreeMap(edges)
  const groups = new Map()
  for (const kp of kps) {
    const g = (groupOf && groupOf(kp)) || { id: '__none__', name: '未分领域' }
    if (!groups.has(g.id)) groups.set(g.id, { id: g.id, name: g.name, list: [] })
    groups.get(g.id).list.push(kp)
  }
  const entries = [...groups.values()].sort(
    (a, b) => String(a.name).localeCompare(String(b.name), 'zh') || String(a.id).localeCompare(String(b.id))
  )

  const maxCount = Math.max(1, ...entries.map((e) => e.list.length))
  const cell = Math.max(opts.cell || 150, Math.round(maxCount * 13))
  const cols = Math.max(1, Math.ceil(Math.sqrt(entries.length)))

  const nodes = []
  const domains = []
  entries.forEach((g, gi) => {
    const cx = (gi % cols) * cell
    const cy = Math.floor(gi / cols) * cell
    const n = g.list.length
    g.list.sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')) || String(a.id).localeCompare(String(b.id)))
    let maxR = 0
    g.list.forEach((kp, i) => {
      let x = cx
      let y = cy
      if (n > 1) {
        const ring = Math.floor(i / 12)
        const rings = Math.ceil(n / 12)
        const r = cell * 0.34 * ((ring + 1) / Math.max(1, rings))
        const idxInRing = i % 12
        const countInRing = Math.min(12, n - ring * 12)
        const a = (idxInRing / Math.max(1, countInRing)) * Math.PI * 2 - Math.PI / 2
        x = cx + Math.cos(a) * r
        y = cy + Math.sin(a) * r
        maxR = Math.max(maxR, r)
      }
      nodes.push({ ...kp, x, y, r: radiusOf(deg.get(kp.id)), domainId: g.id })
    })
    const rr = Math.max(70, maxR + 46)
    domains.push({ id: g.id, name: g.name, x: cx, y: cy, rx: rr, ry: rr * 0.82, count: n })
  })

  return { nodes, domains, bounds: boundsOf(nodes, domains) }
}

/** 选中节点 + 其一跳邻居的环形布局（聚焦视图）。 */
export function buildFocusLayout(selectedId, kps, edges) {
  const byId = new Map(kps.map((k) => [k.id, k]))
  const sel = byId.get(selectedId) || kps[0]
  if (!sel) return { nodes: [], domains: [], bounds: emptyBounds() }
  const near = neighborSet(sel.id, edges)
  const others = []
  for (const id of near) if (id !== sel.id && byId.has(id)) others.push(byId.get(id))
  others.sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh') || String(a.id).localeCompare(String(b.id)))
  const deg = degreeMap(edges)
  const n = others.length
  const R = Math.max(150, 60 + n * 9)
  const nodes = [{ ...sel, x: 0, y: 0, r: radiusOf(deg.get(sel.id)) }]
  others.forEach((kp, i) => {
    const a = (i / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2
    nodes.push({ ...kp, x: Math.cos(a) * R, y: Math.sin(a) * R, r: 11 })
  })
  return { nodes, domains: [{ id: '__focus__', name: sel.name, x: 0, y: 0, rx: R + 70, ry: R + 50, count: nodes.length }], bounds: boundsOf(nodes, []) }
}

function boundsOf(nodes, domains) {
  if (!nodes.length && !domains.length) return emptyBounds()
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  const push = (x, y) => {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
  }
  nodes.forEach((n) => push(n.x, n.y))
  ;(domains || []).forEach((d) => {
    push(d.x - d.rx, d.y - d.ry)
    push(d.x + d.rx, d.y + d.ry)
  })
  push(0, 0)
  const pad = 60
  return {
    minX: minX - pad,
    maxX: maxX + pad,
    minY: minY - pad,
    maxY: maxY + pad,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2
  }
}

function emptyBounds() {
  return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 1, height: 1 }
}
