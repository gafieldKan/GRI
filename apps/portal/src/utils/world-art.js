/**
 * 人本世界 · 矢量拟真图形真源（W2）
 *
 * 口径（N2/N4/N7）：
 *  - 只产出**几何**（点/路径/圆），颜色一律以类名表达，由组件样式表映射到
 *    `--world-*` 令牌；本文件不含任何色值（零裸色在几何层即成立）。
 *  - 场景位置只由 W1 `GET /api/world` 的 `posX/posY` 决定，前端不另造坐标真源。
 *  - 等距（isometric）受光：每个体块三面（顶面受光 / 左面半侧光 / 右面背光），
 *    地面三层厚土，植被四阶，软阴影落地——「拟真插画」而非卡通扁平。
 *
 * 约定：primitive = { k, c, s, ...coords }
 *   k: poly | path | circle | ellipse | rect | line
 *   c: 填充类名（见 LifeWorld.vue 的 .w-* 样式）
 *   s: 描边类名（可选）
 *   o: 不透明度（可选，非色值）
 */

/** 画布（viewBox）尺寸；场景坐标按 posX/posY 百分比映射进内圈安全区。 */
export const MAP = { w: 1000, h: 680 }

const INSET_X = 100
const INSET_Y = 150
const SPAN_X = 800
const SPAN_Y = 400

/** 场景百分比坐标 → 画布坐标（唯一映射，标签与热区共用）。 */
export function scenePoint(scene) {
  const px = Number(scene?.posX)
  const py = Number(scene?.posY)
  const x = Number.isFinite(px) ? px : 50
  const y = Number.isFinite(py) ? py : 50
  return {
    x: Math.round(INSET_X + (x / 100) * SPAN_X),
    y: Math.round(INSET_Y + (y / 100) * SPAN_Y)
  }
}

// ── 等距体块 ───────────────────────────────────────────────────────────────
const pt = (x, y) => `${Math.round(x)},${Math.round(y)}`

/**
 * 等距立方体三面。x/y 为体块「顶点」参考（顶面后角），w 进深宽、d 左进深、h 高。
 * 与原型 C1 的 isoBox 同构（同一视觉语言的延续），此处只返回几何串。
 */
export function isoBox(x, y, w, d, h) {
  const a = [x, y - h]
  const b = [x + w, y + w * 0.53 - h]
  const c = [x + w - d, y + w * 0.53 + d * 0.53 - h]
  const z = [x - d, y + d * 0.53 - h]
  return {
    top: [a, b, c, z].map((p) => pt(p[0], p[1])).join(' '),
    left: [z, c, [c[0], c[1] + h], [z[0], z[1] + h]].map((p) => pt(p[0], p[1])).join(' '),
    right: [b, c, [c[0], c[1] + h], [b[0], b[1] + h]].map((p) => pt(p[0], p[1])).join(' ')
  }
}

/** 一个体块 → 三面（tone 决定三面类名后缀；opts.top 可换顶面材质，如台地/站台）。 */
function block(x, y, w, d, h, tone, opts = {}) {
  const f = isoBox(x, y, w, d, h)
  return [
    { k: 'poly', c: `${tone}-left`, points: f.left },
    { k: 'poly', c: `${tone}-right`, points: f.right },
    { k: 'poly', c: opts.top || `${tone}-top`, points: f.top }
  ]
}

/** 落地阴影（拟真：所有结构都有软阴影，光源当作左上方）。 */
function groundShadow(x, y, rx, ry, cls = 'w-shadow') {
  return [{ k: 'ellipse', c: cls, cx: x, cy: y, rx, ry }]
}

/** 树（四阶树冠 + 树干 + 落影）。s 为尺度。 */
export function tree(x, y, s = 1) {
  return [
    ...groundShadow(x, y + 4 * s, 16 * s, 7 * s, 'w-shadow-soft'),
    { k: 'path', c: 'w-trunk', d: `M${x} ${y + 5 * s}V${y - 16 * s}`, w: 4 * s },
    { k: 'ellipse', c: 'w-leaf-3', cx: x, cy: y - 26 * s, rx: 17 * s, ry: 23 * s },
    { k: 'ellipse', c: 'w-leaf-2', cx: x - 4 * s, cy: y - 31 * s, rx: 12 * s, ry: 18 * s },
    { k: 'ellipse', c: 'w-leaf-1', cx: x + 5 * s, cy: y - 29 * s, rx: 7 * s, ry: 15 * s, o: 0.55 }
  ]
}

/** 灌木 / 绿篱。 */
function shrub(x, y, s = 1) {
  return [
    ...groundShadow(x, y + 3 * s, 12 * s, 5 * s, 'w-shadow-soft'),
    { k: 'ellipse', c: 'w-leaf-3', cx: x, cy: y - 6 * s, rx: 12 * s, ry: 9 * s },
    { k: 'ellipse', c: 'w-leaf-2', cx: x - 3 * s, cy: y - 10 * s, rx: 8 * s, ry: 6 * s }
  ]
}

/** 路灯（拟真城市感：细杆 + 发光头）。 */
function lamp(x, y, s = 1) {
  return [
    { k: 'path', c: 'w-lamp-pole', d: `M${x} ${y}V${y - 34 * s}`, w: 2.2 * s },
    { k: 'circle', c: 'w-lamp-glow', cx: x, cy: y - 38 * s, r: 6 * s, o: 0.4 },
    { k: 'circle', c: 'w-lamp-head', cx: x, cy: y - 37 * s, r: 3.2 * s }
  ]
}

/** 条凳。 */
function bench(x, y, s = 1) {
  return [
    ...groundShadow(x, y + 2 * s, 12 * s, 4 * s, 'w-shadow-soft'),
    { k: 'rect', c: 'w-bench', x: x - 11 * s, y: y - 7 * s, w: 22 * s, h: 4 * s, rx: 2 * s },
    { k: 'path', c: 'w-wood-line', d: `M${x - 9 * s} ${y - 3 * s}v${5 * s}M${x + 9 * s} ${y - 3 * s}v${5 * s}`, w: 2.4 * s }
  ]
}

// ── 场景结构（局部坐标：原点 = 该场景地面落点）─────────────────────────────
const STRUCTURES = {
  /** 居所：坡顶小屋 + 烟囱 + 门廊 + 庭院绿篱。 */
  home() {
    const out = []
    out.push(...block(0, 0, 62, 50, 46, 'w-wall'))
    // 坡屋顶（两片斜屋面）
    out.push({ k: 'poly', c: 'w-roof-right', points: `${pt(-50, -46)} ${pt(12, -79)} ${pt(12, -66)} ${pt(-50, -33)}` })
    out.push({ k: 'poly', c: 'w-roof-top', points: `${pt(-50, -33)} ${pt(12, -66)} ${pt(74, -33)} ${pt(12, 0)}` })
    out.push({ k: 'poly', c: 'w-roof-left', points: `${pt(12, -79)} ${pt(74, -46)} ${pt(74, -33)} ${pt(12, -66)}` })
    // 烟囱
    out.push(...block(-30, -58, 13, 10, 24, 'w-wall'))
    // 门 + 窗（亮灯）
    out.push({ k: 'poly', c: 'w-door', points: `${pt(-6, -8)} ${pt(6, -1)} ${pt(6, -22)} ${pt(-6, -29)}` })
    out.push({ k: 'poly', c: 'w-window-lit', points: `${pt(20, -16)} ${pt(32, -9)} ${pt(32, -25)} ${pt(20, -32)}` })
    out.push({ k: 'poly', c: 'w-window-dark', points: `${pt(-34, -24)} ${pt(-24, -18)} ${pt(-24, -32)} ${pt(-34, -38)}` })
    // 门前石阶 + 庭院
    out.push({ k: 'poly', c: 'w-step', points: `${pt(-10, 2)} ${pt(10, 12)} ${pt(24, 4)} ${pt(4, -6)}` })
    out.push(...shrub(-62, 12, 1.1), ...shrub(58, 20, 0.9), ...tree(74, -6, 0.85))
    return out
  },

  /** 餐饮：餐馆 + 条纹遮阳篷 + 露天桌椅 + 暖色招牌。 */
  dining() {
    const out = []
    out.push(...block(0, 0, 74, 58, 44, 'w-wall'))
    out.push(...block(6, -44, 62, 48, 8, 'w-roof'))
    // 遮阳篷（前檐，红白相间用两阶令牌表达）
    out.push({ k: 'poly', c: 'w-awning-a', points: `${pt(-58, 8)} ${pt(16, 47)} ${pt(16, 34)} ${pt(-58, -5)}` })
    out.push({ k: 'poly', c: 'w-awning-b', points: `${pt(-58, -5)} ${pt(16, 34)} ${pt(52, 15)} ${pt(-22, -24)}` })
    // 门 + 亮灯窗
    out.push({ k: 'poly', c: 'w-door', points: `${pt(24, 14)} ${pt(38, 21)} ${pt(38, -6)} ${pt(24, -13)}` })
    out.push({ k: 'poly', c: 'w-window-lit', points: `${pt(-30, 2)} ${pt(-14, 10)} ${pt(-14, -12)} ${pt(-30, -20)}` })
    out.push({ k: 'poly', c: 'w-window-lit', points: `${pt(-8, -9)} ${pt(6, -2)} ${pt(6, -22)} ${pt(-8, -29)}` })
    // 招牌（悬挑 + 暖光）
    out.push({ k: 'path', c: 'w-sign-pole', d: `M${pt(46, 4)}L${pt(64, 8)}`, w: 2.4 })
    out.push({ k: 'poly', c: 'w-sign-warm', points: `${pt(62, 8)} ${pt(84, 18)} ${pt(84, 4)} ${pt(62, -6)}` })
    out.push({ k: 'poly', c: 'w-sign-soft', points: `${pt(66, 6)} ${pt(80, 13)} ${pt(80, 5)} ${pt(66, -2)}`, o: 0.7 })
    // 露天咖啡座：两桌四椅
    out.push(...groundShadow(-52, 44, 22, 9, 'w-shadow-soft'))
    out.push({ k: 'ellipse', c: 'w-table-top', cx: -52, cy: 40, rx: 15, ry: 7 })
    out.push({ k: 'ellipse', c: 'w-parasol', cx: -52, cy: 12, rx: 21, ry: 10 })
    out.push({ k: 'path', c: 'w-wood-line', d: 'M-52 40V16', w: 2.4 })
    out.push({ k: 'circle', c: 'w-chair', cx: -68, cy: 46, r: 4 })
    out.push({ k: 'circle', c: 'w-chair', cx: -36, cy: 50, r: 4 })
    out.push(...tree(88, 26, 0.9), ...shrub(-86, 30, 0.9))
    return out
  },

  /** 学习：书院主楼 + 钟塔 + 拱窗 + 台阶 + 大树。 */
  academy() {
    const out = []
    out.push(...block(-6, 12, 96, 62, 16, 'w-ground', { top: 'w-terrace' }))
    out.push(...block(10, 0, 78, 54, 74, 'w-wall'))
    out.push(...block(14, -74, 70, 48, 10, 'w-roof'))
    // 钟塔
    out.push(...block(64, -10, 30, 22, 104, 'w-wall'))
    out.push(...block(66, -114, 26, 18, 12, 'w-roof'))
    out.push({ k: 'circle', c: 'w-clock', cx: 86, cy: -74, r: 7 })
    out.push({ k: 'path', c: 'w-clock-hand', d: 'M86 -74v-4M86 -74h3', w: 1.4 })
    // 拱窗三排
    for (let i = 0; i < 3; i += 1) {
      const dy = i * 19
      out.push({ k: 'path', c: 'w-window-arch', d: `M-24 ${-18 - dy}a10 10 0 0 1 20 0v13h-20Z` })
      out.push({ k: 'path', c: 'w-window-arch', d: `M14 ${-30 - dy}a10 10 0 0 1 20 0v13h-20Z` })
      out.push({ k: 'path', c: 'w-window-arch', d: `M46 ${-40 - dy}a10 10 0 0 1 20 0v13h-20Z` })
    }
    // 台阶
    out.push({ k: 'poly', c: 'w-step', points: `${pt(-26, 22)} ${pt(2, 37)} ${pt(16, 30)} ${pt(-12, 15)}` })
    out.push({ k: 'poly', c: 'w-step-deep', points: `${pt(-26, 26)} ${pt(2, 41)} ${pt(16, 34)} ${pt(-12, 19)}` })
    // 旗杆 + 树
    out.push({ k: 'path', c: 'w-lamp-pole', d: 'M-70 6V-58', w: 2.2 })
    out.push({ k: 'poly', c: 'w-flag', points: `${pt(-70, -58)} ${pt(-44, -52)} ${pt(-70, -44)}` })
    out.push(...tree(96, 34, 1.1), ...tree(-92, 30, 0.9), ...shrub(-56, 16, 0.8))
    return out
  },

  /** 工作：玻璃幕墙办公楼（两级退台）+ 天线 + 前庭。 */
  work() {
    const out = []
    out.push(...block(0, 0, 84, 60, 118, 'w-glass'))
    out.push(...block(10, -118, 62, 44, 10, 'w-roof'))
    out.push(...block(16, -128, 44, 32, 42, 'w-wall'))
    out.push(...block(22, -170, 32, 24, 8, 'w-roof'))
    // 幕墙分格（明暗窗带）
    for (let r = 0; r < 6; r += 1) {
      const dy = r * 17
      out.push({ k: 'path', c: 'w-mullion', d: `M-38 ${-14 - dy}L4 ${6 - dy}`, w: 1.1, o: 0.5 })
      out.push({ k: 'poly', c: 'w-window-lit', points: `${pt(14, -46 - dy)} ${pt(40, -33 - dy)} ${pt(40, -45 - dy)} ${pt(14, -58 - dy)}`, o: 0.55 })
      out.push({ k: 'poly', c: 'w-window-dark', points: `${pt(-44, -30 - dy)} ${pt(-18, -17 - dy)} ${pt(-18, -27 - dy)} ${pt(-44, -40 - dy)}`, o: 0.5 })
    }
    // 入口雨棚 + 旋转门
    out.push({ k: 'poly', c: 'w-canopy', points: `${pt(-24, 24)} ${pt(10, 42)} ${pt(46, 24)} ${pt(12, 6)}` })
    out.push({ k: 'poly', c: 'w-door', points: `${pt(2, 20)} ${pt(20, 29)} ${pt(20, 6)} ${pt(2, -3)}` })
    out.push({ k: 'path', c: 'w-lamp-pole', d: 'M34 -178V-192', w: 2 })
    out.push({ k: 'circle', c: 'w-sign-warm', cx: 34, cy: -194, r: 3.2 })
    out.push(...tree(-84, 26, 0.95), ...shrub(84, 30, 1), ...lamp(62, 44, 1))
    return out
  },

  /** 社交：喷泉广场（同心铺装 + 水柱 + 长凳 + 亭子）。 */
  social() {
    const out = []
    out.push({ k: 'ellipse', c: 'w-plaza-outer', cx: 6, cy: 16, rx: 84, ry: 42 })
    out.push({ k: 'ellipse', c: 'w-plaza-mid', cx: 6, cy: 12, rx: 62, ry: 31 })
    out.push({ k: 'ellipse', c: 'w-water', cx: 6, cy: 6, rx: 34, ry: 17 })
    out.push({ k: 'ellipse', c: 'w-water-light', cx: 6, cy: 4, rx: 24, ry: 11 })
    out.push({ k: 'path', c: 'w-water-deep', d: 'M6 4V-30', w: 3 })
    out.push({ k: 'ellipse', c: 'w-water-light', cx: 6, cy: -32, rx: 9, ry: 4 })
    out.push({ k: 'path', c: 'w-fountain-jet', d: 'M6 -30q-14 -12 -20 2M6 -30q14 -12 20 2', w: 1.2 })
    out.push(...bench(-72, 6, 1), ...bench(78, 26, 1))
    // 小亭子（矮台 + 四柱 + 顶）
    out.push(...block(-6, -8, 26, 20, 3, 'w-ground', { top: 'w-terrace' }))
    out.push(...block(-10, -34, 30, 22, 6, 'w-roof'))
    out.push({ k: 'path', c: 'w-wood-line', d: 'M-4 -8v-22M18 3v-22', w: 2.6 })
    out.push(...tree(-96, 26, 0.85), ...tree(92, -6, 0.8), ...shrub(40, 40, 0.8))
    return out
  },

  /** 出行·旅游：站台雨棚 + 观景船 + 路标 + 石板路。 */
  travel() {
    const out = []
    out.push(...block(-4, 6, 78, 54, 12, 'w-ground', { top: 'w-platform' }))
    out.push({ k: 'poly', c: 'w-awning-a', points: `${pt(-56, -6)} ${pt(14, 30)} ${pt(14, 18)} ${pt(-56, -18)}` })
    out.push({ k: 'poly', c: 'w-awning-b', points: `${pt(-56, -18)} ${pt(14, 18)} ${pt(52, 0)} ${pt(-18, -36)}` })
    out.push({ k: 'path', c: 'w-wood-line', d: 'M-40 18V-12M22 12V-18M46 4V-26', w: 3 })
    // 帆船（水面意象：水色船身 + 白帆）
    out.push({ k: 'ellipse', c: 'w-water', cx: 88, cy: 46, rx: 62, ry: 24 })
    out.push({ k: 'ellipse', c: 'w-water-light', cx: 82, cy: 40, rx: 40, ry: 14, o: 0.75 })
    out.push({ k: 'poly', c: 'w-sail', points: `${pt(78, 6)} ${pt(108, 22)} ${pt(78, 30)}` })
    out.push({ k: 'poly', c: 'w-hull', points: `${pt(56, 30)} ${pt(116, 30)} ${pt(104, 42)} ${pt(66, 42)}` })
    // 路标（指向牌）
    out.push({ k: 'path', c: 'w-sign-pole', d: `M-74 24V-34`, w: 2.6 })
    out.push({ k: 'poly', c: 'w-sign-warm', points: `${pt(-74, -34)} ${pt(-44, -26)} ${pt(-44, -14)} ${pt(-74, -22)}` })
    out.push({ k: 'poly', c: 'w-sign-soft', points: `${pt(-72, -46)} ${pt(-46, -39)} ${pt(-46, -30)} ${pt(-72, -37)}`, o: 0.9 })
    out.push(...tree(-100, 34, 0.8), ...shrub(34, 40, 0.85), ...lamp(-16, 34, 0.9))
    return out
  },

  /** 健康：公园 + 诊所（十字标）+ 环形步道 + 湖畔。 */
  wellness() {
    const out = []
    out.push({ k: 'ellipse', c: 'w-lawn', cx: 0, cy: 18, rx: 92, ry: 40 })
    out.push({ k: 'ellipse', c: 'w-track', cx: 0, cy: 16, rx: 74, ry: 30 })
    out.push({ k: 'ellipse', c: 'w-lawn-deep', cx: 0, cy: 15, rx: 60, ry: 22 })
    out.push(...block(-58, -22, 52, 38, 34, 'w-wall'))
    out.push(...block(-54, -56, 48, 34, 8, 'w-roof'))
    out.push({ k: 'path', c: 'w-cross', d: 'M-32 -34h8v-8h8v8h8v8h-8v8h-8v-8h-8Z' })
    out.push({ k: 'poly', c: 'w-window-lit', points: `${pt(-14, -22)} ${pt(0, -15)} ${pt(0, -29)} ${pt(-14, -36)}` })
    out.push({ k: 'ellipse', c: 'w-water', cx: 58, cy: 40, rx: 54, ry: 21 })
    out.push({ k: 'ellipse', c: 'w-water-light', cx: 52, cy: 35, rx: 34, ry: 12, o: 0.7 })
    out.push(...tree(44, -18, 1.05), ...tree(-4, -6, 0.7), ...shrub(26, 26, 0.9), ...bench(14, 6, 0.8))
    out.push(...lamp(70, 8, 0.9))
    return out
  }
}

/** 场景结构几何（未知场景给一个通用「营地」占位，保证世界不留空洞）。 */
export function structureFor(code) {
  const build = STRUCTURES[code]
  if (build) return build()
  return [
    ...block(-20, 0, 48, 36, 30, 'w-wall'),
    ...block(-16, -30, 44, 32, 8, 'w-roof'),
    ...tree(44, 16, 0.9)
  ]
}

/** 有结构美术的场景码（供降级态与自检使用）。 */
export const STRUCTURE_CODES = Object.keys(STRUCTURES)

// ── 世界底图（天空 / 厚土地块 / 水域 / 路径 / 散布）────────────────────────
function terrain() {
  const out = []
  // 天光三层
  out.push({ k: 'rect', c: 'w-sky', x: 0, y: 0, w: MAP.w, h: MAP.h })
  out.push({ k: 'ellipse', c: 'w-sun-glow', cx: 176, cy: 132, rx: 132, ry: 96, o: 0.75 })
  out.push({ k: 'rect', c: 'w-haze', x: 0, y: 96, w: MAP.w, h: 200, o: 0.55 })
  // 远山（两道，冷色后退）
  out.push({ k: 'path', c: 'w-ridge-far', d: 'M0 214 132 138 244 202 366 122 486 196 610 130 742 200 866 142 1000 208V300H0Z' })
  out.push({ k: 'path', c: 'w-ridge-near', d: 'M0 246 118 190 236 240 372 178 508 236 640 186 780 240 900 196 1000 242V320H0Z', o: 0.9 })
  // 厚土地块（等距岛：顶面 + 左右断面）
  out.push({ k: 'poly', c: 'w-ground-side-l', points: '96,392 500,178 500,240 96,454' })
  out.push({ k: 'poly', c: 'w-ground-side-r', points: '500,240 904,392 904,454 500,302' })
  out.push({ k: 'poly', c: 'w-ground-far-l', points: '96,392 500,178 500,206 96,420', o: 0.55 })
  out.push({ k: 'poly', c: 'w-ground-far-r', points: '500,206 904,392 904,420 500,234', o: 0.55 })
  // 湖（远景水环 + 近景水面）
  out.push({ k: 'ellipse', c: 'w-water', cx: 866, cy: 318, rx: 148, ry: 52, o: 0.9 })
  out.push({ k: 'ellipse', c: 'w-water-deep', cx: 866, cy: 330, rx: 120, ry: 36, o: 0.5 })
  out.push({ k: 'ellipse', c: 'w-ground-top', cx: 500, cy: 322, rx: 404, ry: 172 })
  out.push({ k: 'ellipse', c: 'w-lawn', cx: 500, cy: 316, rx: 388, ry: 162, o: 0.75 })
  // 草坪地块（各场景下的绿地台）
  out.push({ k: 'ellipse', c: 'w-lawn-deep', cx: 470, cy: 330, rx: 176, ry: 68, o: 0.45 })
  // 路径网（主环 + 四条放射，先铺路面再压虚线中线）
  const roads = [
    'M244 262 436 358', 'M372 238 436 358', 'M516 222 436 358', 'M660 270 436 358',
    'M436 358 612 382', 'M436 358 756 342', 'M244 262 372 238', 'M372 238 516 222',
    'M516 222 660 270', 'M660 270 756 342', 'M756 342 612 382', 'M612 382 436 358'
  ]
  roads.forEach((d) => {
    out.push({ k: 'path', c: 'w-path', d, w: 18 })
    out.push({ k: 'path', c: 'w-path-edge', d, w: 20, o: 0.55, z: -1 })
  })
  roads.forEach((d) => out.push({ k: 'path', c: 'w-path-dash', d, w: 1, dash: '4 6', o: 0.85 }))
  // 散布植被与路灯（拟真：绿地不是空的）
  const scatter = [
    [-46, 232, 0.9], [-6, 292, 0.8], [286, 168, 0.75], [330, 300, 0.9], [402, 176, 0.7],
    [560, 300, 0.85], [596, 168, 0.7], [704, 142, 0.75], [820, 236, 0.8], [900, 268, 0.7],
    [180, 372, 0.85], [262, 430, 0.75], [700, 462, 0.8], [560, 470, 0.7], [820, 434, 0.75],
    [352, 452, 0.65], [112, 300, 0.6], [470, 486, 0.7]
  ]
  scatter.forEach(([x, y, s]) => out.push(...tree(x, y, s)))
  ;[[140, 336, 0.9], [648, 216, 0.85], [840, 388, 0.8], [316, 372, 0.8]].forEach(
    ([x, y, s]) => out.push(...lamp(x, y, s))
  )
  ;[[-30, 344, 0.9], [24, 208, 0.8], [612, 452, 0.85], [880, 316, 0.8]].forEach(
    ([x, y, s]) => out.push(...shrub(x, y, s))
  )
  // 云（高远天光里的软白带）
  out.push({ k: 'path', c: 'w-cloud', d: 'M232 96q18-30 52-20 20-26 54-12 30-8 34 24 26 6 18 28H248q-28 0-16-20Z', o: 0.85 })
  out.push({ k: 'path', c: 'w-cloud', d: 'M648 62q14-24 42-16 16-20 44-9 24-6 28 19 21 5 14 22H660q-22 0-12-16Z', o: 0.7 })
  // 飞鸟
  out.push({ k: 'path', c: 'w-bird', d: 'M392 118q7-7 14 0M412 110q6-6 12 0M860 128q6-6 12 0', w: 1.4 })
  return out
}

/** 世界底图 primitives（常量几何，随组件挂载一次）。 */
export const TERRAIN = terrain()

// ── 人物外观（同一人稳定不漂移；只由 W1 profile 派生，不引入第二真源）────────
const WEAR_KEYS = ['w-wear-1', 'w-wear-2', 'w-wear-3', 'w-wear-4']
const SKIN_KEYS = ['w-skin-1', 'w-skin-2', 'w-skin-3']
const HAIR_KEYS = ['w-hair-1', 'w-hair-2', 'w-hair-3']

/** 稳定散列（同一个人的外观每次一致；不引入随机真源）。 */
export function stableHash(input) {
  const s = String(input || '')
  let h = 0
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) % 100000
  return h
}

/** 人物的稳定外观：衣色 / 肤色 / 发色 / 发型四元组。 */
export function personaLook(profile) {
  const key = `${profile?.role || ''}|${profile?.name || profile?.username || ''}|${profile?.id || ''}`
  const h = stableHash(key)
  return {
    wear: WEAR_KEYS[h % WEAR_KEYS.length],
    skin: SKIN_KEYS[Math.floor(h / 7) % SKIN_KEYS.length],
    hair: HAIR_KEYS[Math.floor(h / 11) % HAIR_KEYS.length],
    long: h % 2 === 0
  }
}

export function wearClass(profile) {
  return personaLook(profile).wear
}

/** 地图人物（局部原点 = 脚下）：落影环 + 立姿小人 + 定位针。 */
export function personMarker(profile) {
  const look = personaLook(profile)
  return [
    { k: 'ellipse', c: 'w-marker-halo', cx: 0, cy: 4, rx: 26, ry: 11 },
    { k: 'ellipse', c: 'w-marker-ring', cx: 0, cy: 3, rx: 17, ry: 7 },
    { k: 'path', c: 'w-trouser-line', d: 'M-5 3V-14M5 3V-14', w: 4.4 },
    { k: 'poly', c: look.wear, points: '-13,-32 -9,-32 -3,-16 -7,-16' },
    { k: 'poly', c: look.wear, points: '13,-32 9,-32 3,-16 7,-16' },
    { k: 'path', c: look.wear, d: 'M-11 -14h22l-2 -20h-18Z' },
    { k: 'circle', c: look.skin, cx: 0, cy: -38, r: 8 },
    { k: 'path', c: look.hair, d: 'M-8 -39q0-11 8-11t8 11q-8 -6 -16 0Z' },
    { k: 'path', c: 'w-marker-line', d: 'M0 -56V-66', w: 1.6 },
    { k: 'circle', c: 'w-marker', cx: 0, cy: -70, r: 4.2 },
    { k: 'circle', c: 'w-marker-halo', cx: 0, cy: -70, r: 7.6, o: 0.7 }
  ]
}

// ── 人物卡肖像（较大，含肩身与地台光环）──────────────────────────────────
export function buildPortrait(profile) {
  const look = personaLook(profile)
  const out = [
    { k: 'ellipse', c: 'w-portrait-halo', cx: 150, cy: 262, rx: 112, ry: 30 },
    { k: 'ellipse', c: 'w-portrait-ring-2', cx: 150, cy: 254, rx: 108, ry: 25 },
    { k: 'ellipse', c: 'w-portrait-ring', cx: 150, cy: 254, rx: 78, ry: 18 }
  ]
  // 双腿 + 鞋
  out.push({ k: 'path', c: 'w-trouser', d: 'M132 196 128 246q10 6 20 1l5-51Z' })
  out.push({ k: 'path', c: 'w-trouser', d: 'M168 196 172 246q10 5 20-1l-4-50Z' })
  out.push({ k: 'path', c: 'w-shoe', d: 'M126 246q12 8 26 1l1 10h-29Z' })
  out.push({ k: 'path', c: 'w-shoe-deep', d: 'M168 246q12 7 26-1l1 9h-27Z' })
  // 躯干（外衣）
  out.push({ k: 'path', c: look.wear, d: 'M118 122q32-16 64 0l7 78-38 7-40-7Z' })
  // 双臂（同款衣袖）
  out.push({ k: 'path', c: look.wear, d: 'M120 126q-16 6-19 28l-9 62 18 5 15-58Z' })
  out.push({ k: 'path', c: look.wear, d: 'M180 126q16 6 19 28l9 62-18 5-15-58Z' })
  // 手
  out.push({ k: 'circle', c: look.skin, cx: 102, cy: 224, r: 8 })
  out.push({ k: 'circle', c: look.skin, cx: 198, cy: 224, r: 8 })
  // 领口 + 门襟
  out.push({ k: 'path', c: 'w-collar', d: 'M132 118l18 16 18-16 4 12-22 16-22-16Z' })
  out.push({ k: 'path', c: 'w-seam', d: 'M150 150v50', w: 1.4 })
  // 颈 + 头
  out.push({ k: 'path', c: look.skin, d: 'M138 96h24v26l-12 8-12-8Z' })
  out.push({ k: 'ellipse', c: look.skin, cx: 150, cy: 70, rx: 30, ry: 36 })
  // 发
  out.push({ k: 'path', c: look.hair, d: 'M120 76q-4-38 30-38t30 38l-6 8-5-30q-19 10-38 0l-6 30Z' })
  if (look.long) {
    out.push({ k: 'path', c: look.hair, d: 'M120 74q-5 30 2 62l8-2-1-52Zm60 0q5 30-2 62l-8-2 1-52Z' })
  }
  // 五官（描摹，不做表情包）
  out.push({ k: 'path', c: 'w-brow', d: 'M134 64q7-4 13-1M153 63q7-3 13 1', w: 1.8 })
  out.push({ k: 'circle', c: 'w-eye', cx: 139, cy: 74, r: 2.4 })
  out.push({ k: 'circle', c: 'w-eye', cx: 161, cy: 74, r: 2.4 })
  out.push({ k: 'path', c: 'w-nose', d: 'M150 74l-2 10 5 1', w: 1.2 })
  out.push({ k: 'path', c: 'w-mouth', d: 'M143 91q7 4 14 0', w: 1.6 })
  return out
}

/** 生活全景：底图 + 各场景结构（供 LifeWorld 单次渲染）。 */
export function buildWorldScenes(scenes) {
  return (scenes || []).map((scene) => {
    const p = scenePoint(scene)
    return { scene, x: p.x, y: p.y, prims: structureFor(scene.code) }
  })
}

/** 人物当前位置（W2 口径：登录激活即「在居所出发」，随用户进入场景而移动）。 */
export const HOME_SCENE = 'home'
