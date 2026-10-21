import { describe, it, expect } from 'vitest'
import {
  CITY,
  cityScaffold,
  cityGridLayout,
  cityDoorRow,
  cityRoad
} from '@world-art/art.js'

/**
 * W6-c「学科城区」街区网格的几何回归。
 *
 * 这批断言来自两个**真实崩过**的缺陷（v6 首版在浏览器里白屏那一回）：
 *
 *  1. `cityGridLayout` 只回坐标不回 `chapters`，而页面选楼 / 图例 / 读数读的是
 *     `rows[i].chapters.length` → `Cannot read properties of undefined (reading 'length')`
 *     → 整个维度 C 的渲染中止、画布一块都不挂（N1 场景分离反被它打成三块全空）。
 *     → 现在数据（chapters）与几何（buildings/x/y）分家：几何函数不回填数据，
 *     页面因此单独持有 `cityRows`。这里断言几何函数的返回形状，锁住「不会再把
 *     chapters 偷偷从 layout 里读」这个约定的两端。
 *
 *  2. `cityScaffold` 拿 `CITY.w = 1600` 当底图宽，而城区画布宽是楼栋列数算出来的
 *     （一支跨 G1–G12 有 ~50 章 → ~8600px）→ 1600px 之后只剩楼、没有街面/路灯/绿化。
 *     → 现在底图宽由调用方按 `cityGridLayout().w` 传入。
 */

/** 造一支「跨 3 个年级、每章 2 节」的分支数据（与真实 learning-chain 的节节点同形） */
function branchWith(chapterCount, perChapter = 2) {
  const chapters = []
  for (let i = 0; i < chapterCount; i += 1) {
    chapters.push({
      code: `math.gX.pep.ch${String(i + 1).padStart(2, '0')}`,
      name: `第${i + 1}章`,
      kpCount: perChapter * 3,
      state: i % 5 === 0 ? 'lit' : i % 3 === 0 ? 'half' : 'dim'
    })
  }
  return { branch: 'math.num', branchName: '数与算术', clc: 'O1', chapters }
}

describe('cityGridLayout（城区几何：章 → 楼，只回坐标不回数据）', () => {
  it('一行一支（行 = 分支数），每栋一章（列 = 章顺序等距）', () => {
    const rows = [branchWith(6), { branch: 'math.alg', branchName: '代数', clc: 'O2', chapters: [] }]
    const L = cityGridLayout(rows)
    expect(L.rows).toHaveLength(2)
    expect(L.rows[0].branch).toBe('math.num')
    expect(L.rows[0].buildings).toHaveLength(6)
    // 空街也要占一行（街名牌在，但一栋楼都不铺——不造假楼）
    expect(L.rows[1].buildings).toHaveLength(0)
    // 楼 x 严格递增进位（等距，不重叠）
    const xs = L.rows[0].buildings.map((b) => b.x)
    for (let i = 1; i < xs.length; i += 1) expect(xs[i] - xs[i - 1]).toBeCloseTo(CITY.colW, 5)
  })

  it('**带街牌要读的展示字段**（街名牌读 branchName，漏带 = 一排空白街牌）', () => {
    const rows = [branchWith(4), { branch: 'math.alg', branchName: '代数', chapters: [] }]
    const L = cityGridLayout(rows)
    // 街牌文本：有 branchName 就照抄，页面不会因为拿不到而降级成空串
    expect(L.rows[0].branchName).toBe('数与算术')
    expect(L.rows[1].branchName).toBe('代数')
    // 只传 branch 没传 branchName 时兜底到码（不能送 undefined 进模板）
    const fallback = cityGridLayout([{ branch: 'math.num', chapters: [] }])
    expect(fallback.rows[0].branchName).toBe('math.num')
    expect(fallback.rows[0].branchName).not.toBeUndefined()
  })

  it('**不回填 chapters**（数据与几何分家：页面数据真源是 cityRows，不是 layout）', () => {
    const L = cityGridLayout([branchWith(4)])
    expect(L.rows[0].chapters).toBeUndefined()
    // 几何该有的都在
    expect(L.rows[0]).toHaveProperty('buildings')
    expect(L.rows[0].buildings[0]).toMatchObject({ code: expect.any(String), x: expect.any(Number), y: expect.any(Number), state: expect.any(String) })
  })

  it('画布宽随章数增长（横向可滚的根：N10 不硬缩）', () => {
    const narrow = cityGridLayout([branchWith(3)])
    const wide = cityGridLayout([branchWith(50)])
    expect(wide.w).toBeGreaterThan(narrow.w * 5)
    // 宽的至少铺得下一个都不漏
    const last = wide.rows[0].buildings[wide.rows[0].buildings.length - 1]
    expect(last.x).toBeLessThan(wide.w)
    // 画布不小于设计稿基线
    expect(wide.w).toBeGreaterThanOrEqual(CITY.w)
    expect(wide.h).toBeGreaterThanOrEqual(CITY.h)
  })

  it('空数据不炸（一栋楼都没有 → 仍回一张合法画布）', () => {
    const L = cityGridLayout([])
    expect(L.rows).toEqual([])
    expect(L.w).toBeGreaterThanOrEqual(CITY.w)
    expect(L.h).toBeGreaterThanOrEqual(CITY.h)
  })
})

describe('cityScaffold（城区底图：宽 = 真实画布宽，不是 CITY.w 常量）', () => {
  const extract = (prims, cls) => prims.filter((p) => p.c === cls)

  it('街面/缘石铺满**传入的真实宽**（1600px 之后不许断街）', () => {
    const L = cityGridLayout([branchWith(50)])
    const prims = cityScaffold(L.rows.length, { w: L.w })
    const street = extract(prims, 'w-city-street')[0]
    expect(street.w).toBe(L.w)
    const curb = extract(prims, 'w-city-curb')[0]
    // 缘石路径的终点就是画布右缘
    expect(curb.d.endsWith(`H${L.w}`)).toBe(true)
  })

  it('不传 w 时退回 CITY.w（向后兼容：定宽画布的旧调用方）', () => {
    const prims = cityScaffold(1)
    expect(extract(prims, 'w-city-street')[0].w).toBe(CITY.w)
  })

  it('天际线是一条 path 铺到画布右缘（不靠 <g transform> 平铺，不再多上千节点）', () => {
    const L = cityGridLayout([branchWith(50)])
    const prims = cityScaffold(L.rows.length, { w: L.w })
    const sky = extract(prims, 'w-city-skyline-far')
    expect(sky).toHaveLength(1)
    // 收边到画布宽 + 落到视平线以下（H0 封口）
    expect(sky[0].d).toContain(`L${L.w} 60V96H0Z`)
    // 没有 path 数字是 NaN（程序化生成最容易掉的坑）
    expect(sky[0].d).not.toMatch(/NaN|undefined/)
  })

  it('一条街区一排绿化（shrub 走世界语言现成的 w-leaf-*）', () => {
    const L = cityGridLayout([branchWith(20)])
    const prims = cityScaffold(L.rows.length, { w: L.w })
    expect(extract(prims, 'w-leaf-2').length).toBeGreaterThan(3)
  })
})

describe('cityDoorRow（楼前门排：KP 顺序等距，夹在街范围内整排平移）', () => {
  const kps = (n) => Array.from({ length: n }, (_, i) => ({ code: `k${i}`, name: `知${i}`, light: i % 3 === 0 ? 'lit' : 'dim' }))

  it('等距连续：相邻门距 = CAVE_BAND.nodeW（一个不落、一个不挤）', () => {
    const { points } = cityDoorRow(kps(9), { x: 800, y: 400 }, { fromX: 100, toX: 1500 })
    expect(points).toHaveLength(9)
    const gaps = points.slice(1).map((p, i) => p.x - points[i].x)
    expect(new Set(gaps).size).toBe(1)
    expect(points[points.length - 1].x).toBeLessThanOrEqual(1500)
  })

  it('空排不炸', () => {
    expect(cityDoorRow([], { x: 0, y: 0 }).points).toEqual([])
    expect(cityDoorRow(undefined, { x: 0, y: 0 }).points).toEqual([])
  })
})

describe('cityRoad（楼间街道：kind 沿用 roadSegment 分级）', () => {
  it('seq 出宽路 + 主路两件', () => {
    const { wide, core } = cityRoad({ x: 0, y: 0 }, { x: 300, y: 0 }, 'seq')
    expect(wide).toBeTruthy()
    expect(core).toBeTruthy()
    expect(wide.d).toContain('M0 0')
  })
})
