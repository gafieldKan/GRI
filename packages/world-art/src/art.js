/**
 * 世界画法原语 · 矢量拟真图形真源（W2 立，W3 抽为共享件）
 *
 * 一份画法、两处复用（N2）：人本世界（apps/portal 生活全景/人物卡/组织徽记）与
 * 模块内容世界（apps/web-ai-tutor 学习世界的人物标记）都从这里取图，不各写一套。
 * 消费方式：vite 别名 `@world-art`（两个前端的 vite.config.js 各配一次，指向同一路径）。
 *
 * 口径（N2/N4/N7）：
 *  - 只产出**几何**（点/路径/圆），颜色一律以类名表达，由样式表
 *    （styles/world.css，全局单份）映射到 `--world-*` 令牌；本文件不含任何色值
 *    （零裸色在几何层即成立）。
 *  - 场景位置只由 W1 `GET /api/world` 的 `posX/posY` 决定，前端不另造坐标真源。
 *  - 等距（isometric）受光：每个体块三面（顶面受光 / 左面半侧光 / 右面背光），
 *    地面三层厚土，植被四阶，软阴影落地——「拟真插画」而非卡通扁平。
 *
 * 约定：primitive = { k, c, s, ...coords }
 *   k: poly | path | circle | ellipse | rect | line
 *   c: 填充类名（见 styles/world.css 的 .w-* 样式，世界语言的色彩映射单份）
 *   s: 描边类名（可选）
 *   o: 不透明度（可选，非色值）
 *   w: 描边宽度（存在即描边）
 *
 * 渲染链（**规范的唯一一份**就在这里；消费页面照抄这条链）：
 *   SVG 命名空间在编译期绑定——原语必须与 <svg> 同处一个模板，跨组件边界会丢
 *   命名空间（子组件里的裸 <polygon> 会变成 HTML 元素而画不出来）。故「画法」唯一
 *   （本文件），「渲染链」是 12 行命名空间胶水，两个前端各抄一遍：
 *     <polygon v-if="p.k === 'poly'" :class="p.c" :points="p.points" :opacity="p.o" />
 *     <path v-else-if="p.k === 'path'" :class="p.c" :d="p.d" :opacity="p.o"
 *           :stroke-width="p.w" :stroke-dasharray="p.dash" />
 *     <circle v-else-if="p.k === 'circle'" :class="p.c" :cx="p.cx" :cy="p.cy" :r="p.r" :opacity="p.o" />
 *     <ellipse v-else-if="p.k === 'ellipse'" :class="p.c" :cx="p.cx" :cy="p.cy" :rx="p.rx" :ry="p.ry" :opacity="p.o" />
 *     <rect v-else :class="p.c" :x="p.x" :y="p.y" :width="p.w2" :height="p.h" :opacity="p.o" />
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

// ═══════════════════════════════════════════════════════════════════════════
// ⛰ 学科登峰世界（W4-b）：年级海拔轴 + 多峰群山 + K12／学科纵深延续带
//
//  维度 A（学科知识体系：一科 N 峰）与维度 B（K12 阶段：学段→年级→册/章）
//  共用同一条「年级海拔轴」——同一海拔即同一年级，故两维度可互相照应（延续性）。
//  一座峰 = 一个学科分支：山脚落在它的 K12 起始年级、峰顶即它的 K12 终止年级；
//  峰顶之上再起一段「学科纵深」雾脊 —— K12 之外仍属该分支，通向学科之巅。
//  口径与前文一致：只产几何，颜色一律 `w-*` 类名，**本文件零色值**。
// ═══════════════════════════════════════════════════════════════════════════

/** 登峰世界画布与海拔真源（两维度共用；改此一处即两维度同步）。 */
export const SUMMIT = {
  w: 1200,
  h: 820,
  groundTopY: 772, // 山脚落点（地面台顶）
  gradeY1: 726, // 一年级海拔
  gradeY12: 212, // 高三年级海拔
  zenithY: 100 // 学科纵深之巅
}

/** 年级（1–12）→ 海拔 y（越小越高）。 */
export function gradeY(g) {
  const gg = Math.max(1, Math.min(12, Number(g) || 1))
  return Math.round(SUMMIT.gradeY1 - ((gg - 1) / 11) * (SUMMIT.gradeY1 - SUMMIT.gradeY12))
}

/** 学段划分（维度 B 的分段带；与 ontology.school_stage 同口径）。 */
export const STAGE_SPANS = [
  { code: 'PRIMARY', name: '小学', min: 1, max: 6 },
  { code: 'JUNIOR', name: '初中', min: 7, max: 9 },
  { code: 'SENIOR', name: '高中', min: 10, max: 12 }
]

/** 山体在海拔 y 处的半宽（峰顶尖 → 山脚宽；与山体轮廓同一收窄律，带/径据此贴合山面）。 */
function halfWidthAt(y, apexY, baseY, halfW) {
  const span = baseY - apexY
  if (span <= 0) return halfW
  const t = Math.max(0, Math.min(1, (baseY - y) / span)) // 山脚 0 → 峰顶 1
  return halfW * (1 - t)
}

/** 峰顶小旗（登顶标记；旗布由 .w-flag 升势摆动）。 */
export function summitFlag(x, y, s = 1) {
  return [
    { k: 'path', c: 'w-lamp-pole', d: `M${x} ${y}V${y - 32 * s}`, w: 2 },
    { k: 'poly', c: 'w-flag', points: `${pt(x, y - 32 * s)} ${pt(x + 22 * s, y - 25 * s)} ${pt(x, y - 18 * s)}` }
  ]
}

/**
 * 一座学科分支峰：受光面 / 背光面 / 山脊 + 延续带（未开始段｜K12 在读段）+ 雪冠。
 * @returns {{prims, trail, apex}} trail 为登山径折点串（供攀爬动画）；apex 为峰顶坐标。
 */
export function peakMassif(x, apexY, baseY, halfW, opts = {}) {
  const { k12Min = null, k12Max = null, reached = false, depth = false, alt = false } = opts
  const faceL = depth ? 'w-peak-depth-l' : alt ? 'w-peak-face-alt-l' : 'w-peak-face-l'
  const faceR = depth ? 'w-peak-depth-r' : alt ? 'w-peak-face-alt-r' : 'w-peak-face-r'
  const out = []
  const N = 16
  const leftEdge = []
  const rightEdge = []
  for (let i = 0; i <= N; i += 1) {
    const t = i / N
    const y = baseY - (baseY - apexY) * t
    const hw = halfW * (1 - t)
    const wobble = (Math.sin(t * Math.PI * 2.6) * 0.15 + Math.sin(t * Math.PI * 5.1) * 0.06) * (1 - t)
    leftEdge.push([x - hw * (1 + wobble), y])
    rightEdge.push([x + hw * (1 - wobble), y])
  }
  // 山脚落影（拟真：山也有软阴影落地）
  out.push({ k: 'ellipse', c: 'w-shadow', cx: x, cy: baseY + 8, rx: halfW * 1.22, ry: halfW * 0.34, o: 0.4 })
  // 两面山体（先立山形：受光面 → 一侧边缘 → 山脚中点；重叠的群山因此各有立体感）
  const leftPts = [`${x},${apexY}`, ...leftEdge.slice(1).map(([a, b]) => pt(a, b)), `${x},${baseY}`].join(' ')
  const rightPts = [`${x},${apexY}`, ...rightEdge.slice(1).map(([a, b]) => pt(a, b)), `${x},${baseY}`].join(' ')
  out.push({ k: 'poly', c: faceL, points: leftPts })
  out.push({ k: 'poly', c: faceR, points: rightPts })

  // 延续带（半透明色层压在受光/背光**之上**：既读得出「哪一段在 K12 里」，
  // 又看得见山体自身的明暗。同海拔即同年级——两维度据此互相对照）
  // 带沿山面内收 12%：两侧留出一线山体本色，相邻峰因此各见受光/背光，重叠也不糊成一片。
  const INSET = 0.88
  if (k12Max != null) {
    const yTop = gradeY(k12Max)
    const yBot = gradeY(k12Min != null ? k12Min : 1)
    const hwTop = halfWidthAt(yTop, apexY, baseY, halfW) * INSET
    const hwBot = halfWidthAt(yBot, apexY, baseY, halfW) * INSET
    const hwFoot = halfWidthAt(baseY, apexY, baseY, halfW) * INSET
    // ① K12 起点之下的「未开始」段（该分支在 K12 里更早的年级尚未涉及）
    if (yBot < baseY - 2) {
      out.push({
        k: 'poly',
        c: 'w-band-idle',
        o: 0.62,
        points: `${pt(x - hwFoot, baseY)} ${pt(x + hwFoot, baseY)} ${pt(x + hwBot, yBot)} ${pt(x - hwBot, yBot)}`
      })
    }
    // ② K12 在读段（起始年级 → 终止年级）。跨度不足约半个年级刻度时保底 7px：
    //    否则「这门学科 K12 学在哪一段」会缩成一条线读不出来（只保可见，不放大数据）。
    const yTopD = Math.min(yTop, yBot - 7)
    if (yTopD < yBot - 1) {
      const hwTopD = halfWidthAt(yTopD, apexY, baseY, halfW) * INSET || hwTop
      out.push({
        k: 'poly',
        c: alt ? 'w-band-k12-alt' : 'w-band-k12',
        o: 0.88,
        points: `${pt(x - hwBot, yBot)} ${pt(x + hwBot, yBot)} ${pt(x + hwTopD, yTopD)} ${pt(x - hwTopD, yTopD)}`
      })
    }
    // ③ 起学线：该分支在 K12 里「从哪一年级开始」的横切线。
    //    它必落在某条年级格线上——不是装饰，是把「从几年级开始」钉在海拔轴上给读数。
    const hwLine = halfWidthAt(yBot, apexY, baseY, halfW)
    out.push({ k: 'path', c: 'w-band-start', d: `M${(x - hwLine).toFixed(1)} ${yBot}H${(x + hwLine).toFixed(1)}`, w: 2 })
  }

  // 山脊 + 山形轮廓（压在色层之上：山不被带吃掉；群峰重叠时也一眼分得开）
  out.push({ k: 'path', c: 'w-peak-ridge', d: `M${x} ${apexY}Q${x + halfW * 0.06} ${(apexY + baseY) / 2} ${x} ${baseY}`, w: 1 })
  out.push({
    k: 'path',
    c: 'w-peak-edge',
    w: 1.2,
    o: 0.5,
    d: `M${pt(leftEdge[0][0], leftEdge[0][1])}${leftEdge
      .slice(1)
      .map(([a, b]) => `L${pt(a, b)}`)
      .join('')}${rightEdge
      .slice()
      .reverse()
      .map(([a, b]) => `L${pt(a, b)}`)
      .join('')}Z`
  })

  // 雪冠（登顶态：峰顶覆雪）
  if (reached) {
    const capY = apexY + Math.max(24, (baseY - apexY) * 0.16)
    const hwCap = halfWidthAt(capY, apexY, baseY, halfW) * 0.92
    out.push({ k: 'poly', c: 'w-peak-snow', points: `${pt(x - hwCap, capY)} ${pt(x, apexY - 2)} ${pt(x + hwCap, capY)}` })
  }
  // 之字登山径（沿正面向上；同一条路每一座峰都有）
  const sweeps = 5
  const trail = []
  for (let k = 0; k <= sweeps; k += 1) {
    const y = baseY - (k / sweeps) * (baseY - apexY)
    const hw = halfWidthAt(y, apexY, baseY, halfW) * 0.72
    const x1 = k % 2 === 0 ? x - hw : x + hw
    const x2 = k % 2 === 0 ? x + hw : x - hw
    trail.push({ x: x1, y })
    if (Math.abs(x2 - x1) > 1) trail.push({ x: x2, y })
  }
  return { prims: out, trail, apex: { x, y: apexY } }
}

/** 学科纵深雾脊：峰顶之上延伸至天顶的一段（K12 之外仍属该分支）。 */
export function depthSpire(x, fromY, toY, halfW) {
  const w = Math.max(8, halfW)
  return [
    { k: 'poly', c: 'w-band-depth', points: `${pt(x, toY)} ${pt(x + w, fromY)} ${pt(x - w, fromY)}` },
    { k: 'poly', c: 'w-band-depth-light', points: `${pt(x, toY + 10)} ${pt(x + w * 0.42, fromY)} ${pt(x - w * 0.5, fromY)}` },
    { k: 'path', c: 'w-band-depth-edge', d: `M${x - w} ${fromY}L${x} ${toY}L${x + w} ${fromY}`, w: 1 }
  ]
}

/** 人教版册（维度 B 的「营地」）：等距木箱营地 + 软阴影。x/y 为落点（底面中心）。 */
export function bookCamp(x, y, s = 1) {
  const f = isoBox(x - 18 * s, y - 30 * s, 36 * s, 28 * s, 24 * s)
  return [
    { k: 'ellipse', c: 'w-shadow-soft', cx: x, cy: y + 2, rx: 22 * s, ry: 8 * s },
    { k: 'poly', c: 'w-book-left', points: f.left },
    { k: 'poly', c: 'w-book-right', points: f.right },
    { k: 'poly', c: 'w-book-top', points: f.top }
  ]
}

/**
 * 登峰世界的天光与地景（两维度共用底图；山峰/营地由上层叠加）。
 * @param {{sky?: boolean}} opts `sky:false` = 天空交由调用方以渐变绘制（见 world.vue 的 #sky），
 *        其余天光/远山/云鸟/地景/海拔刻度照旧——渐变只能由调用方给 id，故此处让出一层。
 */
export function summitScaffold(opts = {}) {
  const { sky = true } = opts
  const W = SUMMIT.w
  const out = []
  // 天光四阶 + 暖阳 + 近地雾（与人本世界同一天空）
  if (sky) out.push({ k: 'rect', c: 'w-sky', x: 0, y: 0, w: W, h: SUMMIT.h })
  out.push({ k: 'ellipse', c: 'w-sun-glow', cx: 1018, cy: 130, rx: 178, ry: 120, o: 0.8 })
  out.push({ k: 'circle', c: 'w-sun-glow', cx: 1018, cy: 130, r: 26, o: 0.9 })
  out.push({ k: 'rect', c: 'w-haze', x: 0, y: 110, w: W, h: 250, o: 0.5 })
  // 远山两道（大气透视：越远越冷越淡）
  out.push({ k: 'path', c: 'w-ridge-far', d: 'M0 268 96 176 208 240 330 150 470 236 604 160 742 232 880 158 1010 236 1120 178 1200 224V330H0Z', o: 0.75 })
  out.push({ k: 'path', c: 'w-ridge-near', d: 'M0 300 120 236 236 296 372 226 512 292 648 232 792 296 918 240 1052 292 1200 244V372H0Z', o: 0.85 })
  // 云带三组
  out.push({ k: 'path', c: 'w-cloud', d: 'M198 176q20-32 56-22 22-28 58-13 32-9 37 26 28 6 19 30H214q-30 0-16-21Z', o: 0.9 })
  out.push({ k: 'path', c: 'w-cloud', d: 'M742 128q16-26 46-17 18-22 48-10 26-7 30 21 23 5 15 24H754q-24 0-12-18Z', o: 0.78 })
  out.push({ k: 'path', c: 'w-cloud', d: 'M420 96q12-20 36-13 14-18 37-7 20-4 23 15 16 4 12 18H432q-18 0-12-13Z', o: 0.62 })
  // 飞鸟
  out.push({ k: 'path', c: 'w-bird', d: 'M300 196q8-8 16 0M322 186q7-7 14 0M900 168q7-7 14 0', w: 1.5 })
  // 厚土台原（等距地块：顶面 + 左右断面）
  out.push({ k: 'poly', c: 'w-ground-side-l', points: '0,772 600,772 600,820 0,820' })
  out.push({ k: 'poly', c: 'w-ground-side-r', points: '600,772 1200,772 1200,820 600,820' })
  out.push({ k: 'rect', c: 'w-ground-top', x: 0, y: 744, w: W, h: 30 })
  out.push({ k: 'rect', c: 'w-lawn', x: 0, y: 744, w: W, h: 12, o: 0.5 })
  // 年级海拔格线 + 左缘标尺（延续性刻度的共用真源）
  for (let g = 1; g <= 12; g += 1) {
    const y = gradeY(g)
    const major = g % 3 === 0
    out.push({ k: 'path', c: 'w-axis-grid', d: `M104 ${y}H1188`, w: 1, dash: major ? '' : '3 10', o: major ? 0.85 : 0.5 })
  }
  out.push({ k: 'path', c: 'w-axis-grid', d: `M104 ${SUMMIT.zenithY}H1188`, w: 1, dash: '2 8', o: 0.7 })
  out.push({ k: 'path', c: 'w-axis-rail', d: `M80 ${SUMMIT.zenithY}V${gradeY(1) + 6}`, w: 2 })
  for (let g = 1; g <= 12; g += 1) {
    out.push({ k: 'path', c: 'w-axis-rail', d: `M72 ${gradeY(g)}H88`, w: 2 })
  }
  return out
}

/** 海拔刻度标签（供页面渲染为 SVG 文本；与 gradeY 同一点位真源）。 */
export const GRADE_TICKS = [
  { g: 1, y: gradeY(1), short: '小一' },
  { g: 2, y: gradeY(2), short: '小二' },
  { g: 3, y: gradeY(3), short: '小三' },
  { g: 4, y: gradeY(4), short: '小四' },
  { g: 5, y: gradeY(5), short: '小五' },
  { g: 6, y: gradeY(6), short: '小六' },
  { g: 7, y: gradeY(7), short: '初一' },
  { g: 8, y: gradeY(8), short: '初二' },
  { g: 9, y: gradeY(9), short: '初三' },
  { g: 10, y: gradeY(10), short: '高一' },
  { g: 11, y: gradeY(11), short: '高二' },
  { g: 12, y: gradeY(12), short: '高三' }
]

// ═══════════════════════════════════════════════════════════════════════════
// 🌅 学科登顶 v4（W5-b）：黎明破晓 × 光脉传导
//
//   三大机制：M1 晨雾即未知 / M2 光脉传导即因果（灵魂）/ M3 洞窟即闭环。
//   本段与前文同口径：**只产几何**，颜色一律 `w-*` 类名（styles/world.css 映射到
//   `--world-*` 令牌），**本文件零色值**；另附一组**纯派生函数**（有效状态 / 传导后继 /
//   年级聚合 / 节洞排布），不触 DOM、不猜数据——只在 API 真值（state/mastery）之上做
//   一层「相邻点亮」的可见性推导，故可被脚本直接断言。
// ═══════════════════════════════════════════════════════════════════════════

/** 学习态三分（与 W5-a 端点同口径）。 */
export const LIGHT_STATES = ['dim', 'half', 'lit']

/**
 * M2 光脉传导的有效态（纯函数）：在 API 给出的 `node.state` 之上叠加「相邻点亮」——
 * `dim` 节点若经任一入边（from 已点亮）被照到，则升为 `half`（微光可进，即 N6①
 * 「晨雾只被相邻的光驱散」）。**不推定掌握度**：`half` 只是「够得着」，不等于已掌握。
 * @param {Array<{code:string,state:string}>} nodes
 * @param {Array<{from:string,to:string,kind?:string}>} edges
 * @returns {Record<string,'dim'|'half'|'lit'>} code → 有效态
 */
export function deriveLightState(nodes, edges) {
  const lit = new Set((nodes || []).filter((n) => n && n.state === 'lit').map((n) => n.code))
  const indirect = new Set()
  for (const e of edges || []) {
    if (e && lit.has(e.from)) indirect.add(e.to)
  }
  const out = {}
  for (const n of nodes || []) {
    if (!n || !n.code) continue
    out[n.code] = n.state === 'lit' ? 'lit' : indirect.has(n.code) ? 'half' : n.state === 'half' ? 'half' : 'dim'
  }
  return out
}

/** 入边表（to → [from…]）：光脉只顺「前 → 后」传导，故按边方向建索引。 */
export function predecessorMap(edges) {
  const map = new Map()
  for (const e of edges || []) {
    if (!e) continue
    const list = map.get(e.to) || []
    list.push(e.from)
    map.set(e.to, list)
  }
  return map
}

/** 某点的后继（沿链向前的一个个点）：光脉答对后要流向这些点。 */
export function successorsOf(code, edges) {
  return (edges || []).filter((e) => e && e.from === code).map((e) => e.to)
}

/** 边型 → 视觉类（N5：soft 弱化为「引导路径」，与 explicit/seq 一眼可辨）。 */
export function edgeToneClass(kind) {
  if (kind === 'explicit') return 'w-edge-explicit'
  if (kind === 'seq') return 'w-edge-seq'
  return 'w-edge-soft'
}

/** 边型 → 中文口径（UI 可读处引用；soft 明说「引导性·非精确前置」）。 */
export function edgeKindWord(kind) {
  if (kind === 'explicit') return '显式前置'
  if (kind === 'seq') return '课程序列'
  return '引导路径'
}

/** 态统计（掌握/微光/未明）→ 进度读数（N9 信息密度的诚实口径）。 */
export function lightProgress(states) {
  const list = Object.values(states || {})
  const lit = list.filter((s) => s === 'lit').length
  const half = list.filter((s) => s === 'half').length
  return { total: list.length, lit, half, dim: list.length - lit - half, ratio: list.length ? lit / list.length : 0 }
}

/** 按年级分组（升序）；同年级内保持输入的课程序列次序（N11：大分支按年级分段渲染）。 */
export function gradeGroups(nodes) {
  const map = new Map()
  for (const n of nodes || []) {
    if (!n) continue
    if (!map.has(n.grade)) map.set(n.grade, [])
    map.get(n.grade).push(n)
  }
  return [...map.entries()]
    .map(([grade, list]) => ({ grade, nodes: list }))
    .sort((a, b) => (Number(String(a.grade).replace(/\D/g, '')) || 99) - (Number(String(b.grade).replace(/\D/g, '')) || 99))
}

/**
 * N6③ 洞门三态聚合：把一个年级下的节态收成「年级洞口」的三态。
 * 点亮占比 ≥ threshold → `lit`（亮灯）／有任一点亮或微光 → `half`（半亮）／全暗 → `dim`（暗门）。
 */
export function gradeDoorState(states, threshold = 0.8) {
  const list = Object.values(states || {})
  if (!list.length) return 'dim'
  const lit = list.filter((s) => s === 'lit').length
  if (lit / list.length >= threshold) return 'lit'
  return list.some((s) => s !== 'dim') ? 'half' : 'dim'
}

/** 洞门三态 → 中文（洞内文案与 aria 共用，口径一致）。 */
export function doorStateWord(state) {
  if (state === 'lit') return '已亮灯'
  if (state === 'half') return '半亮'
  return '暗门'
}

/** 登峰径带（节洞带）画布常量：洞带单独成画（各峰各带，横向可滚，不动宏观群山）。 */
export const CAVE_BAND = { h: 260, yMid: 118, amp: 46, nodeW: 132, padX: 64 }

/**
 * 节洞带排布（纯几何）：把一节一节按课程序列自左向右排成一条上下起伏的山径
 * （隔一节换一侧，读者一眼看出「沿链向前」的方向）。超出画布宽时由调用方横向滚动。
 * @returns {{w:number,h:number,points:Array<{node:object,x:number,y:number,index:number}>}}
 */
export function caveTrailLayout(nodes, opts = {}) {
  const nodeW = opts.nodeW ?? CAVE_BAND.nodeW
  const padX = opts.padX ?? CAVE_BAND.padX
  const yMid = opts.yMid ?? CAVE_BAND.yMid
  const amp = opts.amp ?? CAVE_BAND.amp
  const list = nodes || []
  const w = padX * 2 + Math.max(0, list.length - 1) * nodeW
  const points = list.map((node, index) => ({
    node,
    index,
    x: padX + index * nodeW,
    y: Math.round(yMid + (index % 2 === 0 ? -amp : amp))
  }))
  return { w, h: opts.h ?? CAVE_BAND.h, points }
}

/** M1 晨雾一团（覆盖未明的点；雾色分近实/远虚两层，同一世界语言）。 */
export function fogPuff(x, y, s = 1, tone = 'near') {
  const c = tone === 'far' ? 'w-fog-far' : 'w-fog-near'
  return [
    { k: 'ellipse', c, cx: x - 12 * s, cy: y + 5 * s, rx: 42 * s, ry: 22 * s, o: 0.5 },
    { k: 'ellipse', c, cx: x + 14 * s, cy: y - 3 * s, rx: 36 * s, ry: 19 * s, o: 0.55 },
    { k: 'ellipse', c, cx: x + 2 * s, cy: y + 11 * s, rx: 30 * s, ry: 15 * s, o: 0.42 }
  ]
}

/** M1 晨雾带（某一海拔上横铺的一道雾，罩住「这一段还没走到」）。 */
export function fogBank(y, fromX, toX, thickness = 34) {
  const out = []
  const steps = 7
  for (let i = 0; i < steps; i += 1) {
    const t = i / (steps - 1)
    const x = fromX + (toX - fromX) * t
    out.push({ k: 'ellipse', c: i % 2 ? 'w-fog-far' : 'w-fog-near', cx: Math.round(x), cy: y + (i % 3 ? 4 : -5), rx: 96, ry: thickness, o: 0.34 })
  }
  return out
}

/** M1 山脊轮廓微光：雾中仍隐约可辨的一道脊线（「山还在，只是还没亮」）。 */
export function ridgeGlow(d, w = 1.4) {
  return [
    { k: 'path', c: 'w-ridge-glow', d, w: w + 1.8, o: 0.4 },
    { k: 'path', c: 'w-ridge-glow', d, w, o: 0.85 }
  ]
}

/** M2 光脉：一条沿链行进的亮束（底色辉光 + 流动虚线，动画在 CSS 里跑，不逐帧重建 DOM）。 */
export function lightBeam(d, opts = {}) {
  const w = opts.w ?? 3
  return [
    { k: 'path', c: 'w-light-trail', d, w: w + 3.4, o: 0.4 },
    { k: 'path', c: 'w-light-pulse', d, w, dash: opts.dash || '10 12', o: 0.95 }
  ]
}

/** M2 路口提示光（该往上走的那一段）：细亮束 + 呼吸（CSS），即「下一个最佳目标」。 */
export function lightHint(d, w = 2) {
  return [{ k: 'path', c: 'w-light-hint', d, w }]
}

/** 山洞洞口（三态）：岩拱 + 洞腔 + 洞口辉光 + 门前石阶。state ∈ dim|half|lit。 */
export function caveDoor(x, y, s = 1, state = 'dim') {
  const w = 13 * s
  const h = 19 * s
  const arch = (ww, hh) => {
    const r = ww
    return `M${(x - ww).toFixed(1)} ${y}V${(y - hh + r).toFixed(1)}A${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${(x + ww).toFixed(1)} ${(y - hh + r).toFixed(1)}V${y}Z`
  }
  const inner = state === 'lit' ? 'w-cave-inner-lit' : state === 'half' ? 'w-cave-inner-half' : 'w-cave-inner-dim'
  const glow = state === 'lit' ? 'w-cave-glow-lit' : state === 'half' ? 'w-cave-glow-half' : 'w-cave-glow-dim'
  return [
    { k: 'ellipse', c: glow, cx: x, cy: y - h * 0.34, rx: w * 2.1, ry: h * 0.72, o: state === 'dim' ? 0.16 : 0.34 },
    { k: 'ellipse', c: 'w-shadow-soft', cx: x, cy: y + 1.5 * s, rx: 17 * s, ry: 5 * s },
    { k: 'path', c: 'w-cave-rock', d: arch(w * 1.5, h) },
    { k: 'path', c: inner, d: arch(w, h * 0.86) },
    { k: 'path', c: 'w-cave-step', d: `M${(x - w * 1.8).toFixed(1)} ${(y + 2 * s).toFixed(1)}H${(x + w * 1.8).toFixed(1)}`, w: 2.4 * s }
  ]
}

/** 节洞带上的一个「洞位」（点）：外环 + 内芯 + 点亮时的光尘。state ∈ dim|half|lit。 */
export function caveNode(x, y, s = 1, state = 'dim') {
  const core = state === 'lit' ? 'w-node-lit' : state === 'half' ? 'w-node-half' : 'w-node-dim'
  const halo = state === 'lit' ? 'w-node-halo-lit' : state === 'half' ? 'w-node-halo-half' : 'w-node-halo-dim'
  const out = [
    { k: 'circle', c: 'w-node-track', cx: x, cy: y, r: 17 * s },
    { k: 'circle', c: halo, cx: x, cy: y, r: 24 * s, o: state === 'lit' ? 0.5 : 0.26 },
    { k: 'circle', c: core, cx: x, cy: y, r: 11 * s }
  ]
  if (state === 'lit') out.push({ k: 'circle', c: 'w-node-spark', cx: x, cy: y - 2 * s, r: 4.2 * s, o: 0.9 })
  return out
}

/** 节洞带上的边（相邻洞位之间）：explicit/seq 实，soft 虚且淡（N5 不误导）。 */
export function caveEdge(a, b, kind) {
  const cls = edgeToneClass(kind)
  const d = `M${a.x} ${a.y}L${b.x} ${b.y}`
  const soft = kind === 'soft'
  return {
    wide: { k: 'path', c: cls, d, w: soft ? 1.2 : 5, dash: soft ? '4 8' : '', o: soft ? 0.5 : 0.22 },
    core: { k: 'path', c: cls, d, w: soft ? 1.2 : 2.2, dash: soft ? '4 8' : '', o: soft ? 0.75 : 0.95 }
  }
}

/**
 * M3 洞内平铺生活场景（承接 LifeWorld 语言：同一套令牌、同一批体块/植被/水/灯画法）。
 * 平铺（平面层叠）表达纵深：洞壁三环退晕 → 洞顶垂石 → 石台书案 → 水潭 → 洞门光柱。
 * 只产几何；颜色仍走 `w-*` 类。w/h 为洞内画布尺寸。
 */
export function caveScene(w = 900, h = 520) {
  const cx = Math.round(w / 2)
  const baseY = h - 92
  const out = []
  // 洞壁三环（平面退晕 = 视差纵深，非 3D）
  out.push({ k: 'ellipse', c: 'w-cave-wall-1', cx, cy: baseY - 40, rx: w * 0.46, ry: 200 })
  out.push({ k: 'ellipse', c: 'w-cave-wall-2', cx, cy: baseY - 26, rx: w * 0.38, ry: 168 })
  out.push({ k: 'ellipse', c: 'w-cave-wall-3', cx, cy: baseY - 12, rx: w * 0.30, ry: 136 })
  // 洞顶垂石（stalactites）
  for (let i = 0; i < 9; i += 1) {
    const x = 90 + i * ((w - 180) / 8)
    const len = 26 + ((i * 37) % 40)
    out.push({ k: 'poly', c: 'w-cave-stalactite', points: `${pt(x - 13, 0)} ${pt(x + 13, 0)} ${pt(x, len)}` })
    out.push({ k: 'poly', c: 'w-cave-stalactite-light', points: `${pt(x - 5, 0)} ${pt(x + 4, 0)} ${pt(x, len * 0.68)}` })
  }
  // 洞地面 + 苔痕
  out.push({ k: 'rect', c: 'w-cave-floor', x: 0, y: baseY, w, h: h - baseY })
  out.push({ k: 'ellipse', c: 'w-cave-moss', cx: cx - 210, cy: baseY + 26, rx: 96, ry: 18, o: 0.6 })
  out.push({ k: 'ellipse', c: 'w-cave-moss', cx: cx + 240, cy: baseY + 40, rx: 120, ry: 22, o: 0.5 })
  // 石台（书案）：等距体块三面 + 摊开的书
  out.push(...block(cx - 34, baseY - 44, 68, 54, 30, 'w-cave-altar'))
  out.push({ k: 'poly', c: 'w-cave-book', points: `${pt(cx - 30, baseY - 44)} ${pt(cx - 2, baseY - 30)} ${pt(cx - 2, baseY - 40)} ${pt(cx - 30, baseY - 54)}` })
  out.push({ k: 'poly', c: 'w-cave-book-page', points: `${pt(cx - 2, baseY - 40)} ${pt(cx + 28, baseY - 54)} ${pt(cx + 28, baseY - 44)} ${pt(cx - 2, baseY - 30)}` })
  // 水潭（洞中滴水成潭）
  out.push({ k: 'ellipse', c: 'w-cave-pool', cx: cx + 250, cy: baseY + 30, rx: 92, ry: 26, o: 0.85 })
  out.push({ k: 'ellipse', c: 'w-cave-pool-light', cx: cx + 244, cy: baseY + 24, rx: 58, ry: 15, o: 0.7 })
  // 石笋小灯三盏（复用世界路灯画法：细杆 + 发光头）
  out.push(...lamp(cx - 280, baseY + 6, 1.05))
  out.push(...lamp(cx + 330, baseY - 6, 0.95))
  out.push({ k: 'path', c: 'w-cave-drip', d: `M${cx + 250} 0v120`, w: 1.2, dash: '3 9', o: 0.5 })
  // 洞门光柱（出口：掌握之后从这里出去）
  out.push({ k: 'poly', c: 'w-cave-shaft', points: `${pt(cx - 210, 0)} ${pt(cx - 96, 0)} ${pt(cx + 40, baseY)} ${pt(cx - 300, baseY)}`, o: 0.34 })
  out.push({ k: 'poly', c: 'w-cave-shaft-light', points: `${pt(cx - 176, 0)} ${pt(cx - 140, 0)} ${pt(cx - 24, baseY)} ${pt(cx - 120, baseY)}`, o: 0.34 })
  return out
}

/** 洞内「灯位」（洞内展开到的知识点位）：小圆座 + 态芯；页面在其上叠 HTML 标签。 */
export function caveSeed(x, y, s = 1, state = 'dim') {
  const core = state === 'lit' ? 'w-node-lit' : state === 'half' ? 'w-node-half' : 'w-node-dim'
  return [
    { k: 'ellipse', c: 'w-shadow-soft', cx: x, cy: y + 3 * s, rx: 12 * s, ry: 4 * s },
    { k: 'circle', c: 'w-node-track', cx: x, cy: y, r: 10 * s },
    { k: 'circle', c: core, cx: x, cy: y, r: 6 * s }
  ]
}

// ═══════════════════════════════════════════════════════════════════════════
// v5（W6-a）学科城区 —— 宏观叙事从「登山」换成「逛城」
//   因果 = 道路通断（M2 的物理化）：打通一间，门前那段路铺点亮，光顺路流向下一间；
//   连续 = 路是按课程序列铺的**同一条路**（未学的段仍连续，只是灯还没亮）；
//   双体系 = 横轴年级大道（K12）↔ 纵轴街区车道（学科完整体系），不再共用一根海拔轴。
//   画法仍只用本文件的 isoBox / block / tree / shrub / lamp / groundShadow 与
//   caveScene 的平面退晕手法——**不引进第二种画法**；本文件依旧零色值。
// ═══════════════════════════════════════════════════════════════════════════

/** 城区尺寸常量（与 CAVE_BAND 同属几何真源；P2 起多车道也只用这一处）。 */
export const DISTRICT = {
  avenueH: 220, // 大道带（路面 + 缘石 + 里程桩）的纵向占位
  laneW: 168, // 一条街区的车道宽（P1 只画一条）
  buildingW: 132, // 一间店（= 一 节）的进深
  roadW: 26, // 楼间路的宽
  blockH: 104, // 楼体在车道里立起的高度
  groundY: 430 // 街道地面基线（画布坐标系）
}

/**
 * 年级大道（K12 体系的物理化）：路基 + 两条路缘 + 虚线中线 + 里程碑。
 * marks 由页面的 `GRADE_TICKS` 同源派生（[{g,x,short}]），**不新建刻度表**。
 * @param {number} x0 大道左端
 * @param {number} x1 大道右端
 * @param {number} y  路面中线
 * @param {Array<{g:number|string,x:number,short:string}>} marks
 * @returns {object[]} primitives（几何零色值，颜色走 w-* 类）
 */
export function gradeAvenue(x0, x1, y, marks) {
  const out = []
  const w = Math.max(0, x1 - x0)
  // 路基（薄条，压在路面中线上）+ 双缘石
  out.push({ k: 'rect', c: 'w-road', x: x0, y: y - 7, w, h: 14, rx: 7 })
  out.push({ k: 'path', c: 'w-curb', d: `M${x0} ${y - 9}H${x1}`, w: 1.2 })
  out.push({ k: 'path', c: 'w-curb', d: `M${x0} ${y + 9}H${x1}`, w: 1.2 })
  // 虚线中线（同 caveEdge 的 dash 语气，保持同一套「路」的语言）
  out.push({ k: 'path', c: 'w-road-dash', d: `M${x0} ${y}H${x1}`, w: 1.4, dash: '10 12', o: 0.55 })
  // 里程碑：小石桩 + 短横（页面在其上叠 HTML 年级标签）
  for (const m of marks || []) {
    const mx = Math.round(m.x)
    out.push({ k: 'rect', c: 'w-curb', x: mx - 1.5, y: y - 16, w: 3, h: 32, rx: 1.5 })
    out.push({ k: 'rect', c: 'w-road-edge', x: mx - 7, y: y - 17, w: 14, h: 3, rx: 1.5 })
  }
  return out
}

/**
 * 一间「店」= 一 节（section）：楼体 + 屋顶 + 橱窗（明暗随 state）+ 门阶 + 落影。
 * 橱窗三态与洞门三态同一组语义：dim=暗窗 / half=半亮（有作答未到 80）/ lit=亮灯。
 *
 * **刻意不调** `structureFor`/`STRUCTURES['academy']`：那是含钟塔 + 三排拱窗 + 旗杆 +
 * 三棵树的**全场景**画法（约 190 个 primitive），一间店面会挤爆画布；这里的正确粒度
 * 就是 block + 屋顶 poly + 单个橱窗——与 `isoBox`/`block` 是同一套画法、同一批令牌。
 *
 * @param {number} x 落点（楼底面前角中线）
 * @param {number} y 楼底基线
 * @param {number} w 进深
 * @param {number} h 楼体高
 * @param {'dim'|'half'|'lit'} state 学习态
 * @returns {object[]} primitives
 */
export function storefront(x, y, w, h, state = 'dim') {
  const d = w * 0.7
  const out = []
  out.push(...groundShadow(x, y, w * 0.62, w * 0.2, 'w-shadow-soft'))
  // 楼体三面（同一 block 画法）
  out.push(...block(x - w / 2, y, w, d, h, 'w-storefront'))
  // 双坡屋顶（承接 home()/dining() 的坡顶画法，收窄到铺面尺度）
  out.push({ k: 'poly', c: 'w-storefront-top', points: `${pt(x - w / 2 - 3, y - h)} ${pt(x + 3, y - h - 16)} ${pt(x + 3, y - h - 6)} ${pt(x - w / 2 - 3, y - h + 10)}` })
  out.push({ k: 'poly', c: 'w-roof-right', points: `${pt(x + 3, y - h - 16)} ${pt(x + w / 2 + 3, y - h)} ${pt(x + w / 2 + 3, y - h + 10)} ${pt(x + 3, y - h - 6)}` })
  out.push({ k: 'poly', c: 'w-storefront-top', points: `${pt(x - w / 2 - 3, y - h + 10)} ${pt(x + 3, y - h - 6)} ${pt(x + w / 2 + 3, y - h + 10)} ${pt(x + 3, y)}` })
  // 门阶
  out.push({ k: 'poly', c: 'w-step', points: `${pt(x - 13, y + 2)} ${pt(x + 5, y + 12)} ${pt(x + 17, y + 4)} ${pt(x - 1, y - 6)}` })
  // 橱窗（亮灯与否即 M2 的可读态）：半亮给描边、亮灯给发光芯
  const win = state === 'lit' ? 'w-storefront-lit' : 'w-storefront-dark'
  out.push({ k: 'poly', c: win, points: `${pt(x - 30, y - 26)} ${pt(x - 18, y - 19)} ${pt(x - 18, y - 37)} ${pt(x - 30, y - 44)}` })
  out.push({ k: 'poly', c: win, points: `${pt(x + 12, y - 30)} ${pt(x + 24, y - 23)} ${pt(x + 24, y - 41)} ${pt(x + 12, y - 48)}` })
  if (state === 'half') {
    out.push({ k: 'poly', c: 'w-window-lit', o: 0.5, points: `${pt(x - 30, y - 26)} ${pt(x - 18, y - 19)} ${pt(x - 18, y - 37)} ${pt(x - 30, y - 44)}` })
  }
  // 亮灯时楼前一盏路灯（复用世界路灯画法，光从这盏开始顺路走）
  if (state !== 'dim') out.push(...lamp(x + w / 2 + 14, y + 8, 0.72))
  return out
}

/**
 * 楼间的路段（前置链的物理化）。kind 决定语气，与 `caveEdge` 同一分级：
 *   seq      → 实线主路（课程序列；**未学段仍连续**，只是灯没亮）
 *   explicit → 粗实线（显式前置；实测全部落在同一节内 → 街道层很少出现）
 *   soft     → 虚线最淡（引导路径，非精确前置，不误导）
 * @param {{x:number,y:number}} a 前一间店的门阶落点
 * @param {{x:number,y:number}} b 后一间店的门阶落点
 * @param {'seq'|'explicit'|'soft'} kind
 * @returns {{wide:object,core:object}}
 */
export function roadSegment(a, b, kind) {
  const soft = kind === 'soft'
  const explicit = kind === 'explicit'
  const cls = edgeToneClass(kind)
  const d = `M${a.x} ${a.y}L${b.x} ${b.y}`
  return {
    wide: { k: 'path', c: cls, d, w: soft ? 1.2 : explicit ? 7 : 5, dash: soft ? '4 8' : '', o: soft ? 0.4 : 0.2 },
    core: { k: 'path', c: cls, d, w: soft ? 1.2 : explicit ? 3.6 : 2.4, dash: soft ? '4 8' : '', o: soft ? 0.7 : 0.92 }
  }
}

/**
 * 施工围挡（因果的负面态）：前置未满足时，门前那段路是封的。
 * 斜纹围挡带 + 一盏警示灯 + 两团晨雾。P1 不启用，P2 铺满时接入。
 * @param {number} x 路段左端
 * @param {number} y 路段中线
 * @param {number} w 路段宽
 * @returns {object[]}
 */
export function barricade(x, y, w) {
  const out = []
  // 斜纹围挡（两阶令牌相间，承接遮阳篷的双色手法）
  const stripes = Math.max(2, Math.round(w / 14))
  for (let i = 0; i < stripes; i += 1) {
    const sx = x + (i * w) / stripes
    out.push({
      k: 'poly',
      c: i % 2 ? 'w-barricade-b' : 'w-barricade-a',
      points: `${pt(sx, y + 8)} ${pt(sx + w / stripes, y + 8)} ${pt(sx + w / stripes + 7, y - 8)} ${pt(sx + 7, y - 8)}`
    })
  }
  out.push({ k: 'path', c: 'w-barricade-lamp', d: `M${x - 4} ${y - 8}V${y - 26}`, w: 2.2 })
  out.push({ k: 'circle', c: 'w-barricade-lamp', cx: x, cy: y - 30, r: 3.6 })
  out.push(...fogPuff(x + w * 0.5, y - 12, 1.1, 'near'))
  out.push(...fogPuff(x + w * 0.5, y - 4, 0.8, 'far'))
  return out
}

/**
 * 楼内平面生活场景（**主 surface**；承接 `caveScene` 的平铺退晕手法，只是换成日间室内）。
 * theme ∈ 'study'|'studio'|'lab'|'library'；P1 只实现 'study'（书房）。
 * 平面层叠表达纵深：墙面三环退晕 → 地板 → 书柜 → 书桌椅 → 台灯 → 窗光。
 * @param {number} w 画布宽
 * @param {number} h 画布高
 * @param {'study'} theme 主题（P1 仅 study）
 * @returns {object[]} primitives（几何零色值）
 */
export function lifeScene(w = 900, h = 520, theme = 'study') {
  const cx = Math.round(w / 2)
  const floorY = h - 96
  const out = []
  // 墙面三环退晕（= caveScene 的同一手法：平面退晕即纵深，非 3D）
  out.push({ k: 'ellipse', c: 'w-room-wall-1', cx, cy: floorY - 120, rx: w * 0.44, ry: 210 })
  out.push({ k: 'ellipse', c: 'w-room-wall-2', cx, cy: floorY - 96, rx: w * 0.36, ry: 176 })
  out.push({ k: 'ellipse', c: 'w-room-wall-3', cx, cy: floorY - 70, rx: w * 0.28, ry: 142 })
  // 木地板
  out.push({ k: 'rect', c: 'w-room-floor', x: 0, y: floorY, w, h: h - floorY })
  // 地板缝（维持「同一套路的语言」：用 dash 表达分格）
  for (let i = 1; i < 6; i += 1) {
    const gx = (i * w) / 6
    out.push({ k: 'path', c: 'w-room-rug', d: `M${gx} ${floorY}V${h}`, w: 1, o: 0.25 })
  }
  // 窗（右侧，把外面的天光引进来）
  out.push({ k: 'rect', c: 'w-room-window', x: w - 190, y: 92, w: 120, h: 150, rx: 6, o: 0.5 })
  out.push({ k: 'rect', c: 'w-room-floor', x: w - 186, y: 98, w: 112, h: 138, rx: 4, o: 0.35 })
  out.push({ k: 'path', c: 'w-room-window', d: `M${w - 130} 92V242`, w: 1.6 })
  out.push({ k: 'path', c: 'w-room-window', d: `M${w - 190} 167H${w - 70}`, w: 1.6 })
  // 书柜（左侧：等距体块三面 + 分格）
  out.push(...block(84, floorY - 40, 150, 96, 150, 'w-storefront'))
  for (let i = 0; i < 4; i += 1) {
    const sy = floorY - 52 - i * 34
    out.push({ k: 'path', c: 'w-room-rug', d: `M${96} ${sy}H${222}`, w: 1, o: 0.3 })
  }
  // 书桌（工作台 = 智学慧眼闭环的落点）+ 台灯
  out.push(...block(cx - 20, floorY - 30, 190, 128, 26, 'w-storefront'))
  out.push({ k: 'poly', c: 'w-cave-book', points: `${pt(cx - 24, floorY - 30)} ${pt(cx + 6, floorY - 18)} ${pt(cx + 6, floorY - 27)} ${pt(cx - 24, floorY - 39)}` })
  out.push({ k: 'poly', c: 'w-cave-book-page', points: `${pt(cx + 6, floorY - 27)} ${pt(cx + 34, floorY - 39)} ${pt(cx + 34, floorY - 30)} ${pt(cx + 6, floorY - 18)}` })
  out.push({ k: 'path', c: 'w-room-rug', d: `M${cx - 78} ${floorY - 64}V${floorY - 96}`, w: 2.4 })
  out.push({ k: 'circle', c: 'w-room-window', cx: cx - 78, cy: floorY - 102, r: 8, o: 0.9 })
  // 地毯（给灯位一个共同的落座面）：面用 plaza-mid，与地板缝的线条用地毯描边分开类，
  // 否则同一类既当 stroke 又当 fill，两种形态必有一者不可见
  out.push({ k: 'ellipse', c: 'w-room-rug-plain', cx, cy: floorY + 46, rx: w * 0.3, ry: 40, o: 0.55 })
  // 门（= 出楼的门；也是「下地下室」暗门的位置）
  out.push({ k: 'poly', c: 'w-door', points: `${pt(66, floorY - 26)} ${pt(74, floorY - 20)} ${pt(74, floorY - 40)} ${pt(66, floorY - 46)}` })
  return out
}

/**
 * 楼内暗门（= 地下室入口钥孔）：地板上的一处暗门 + 两级台阶。
 * 用户裁决的两个 surface（楼上书房 / 楼下溶洞）由它衔接。
 * @param {number} x 落点
 * @param {number} y 地板线
 * @param {number} s 尺度
 * @returns {object[]}
 */
export function basementHatch(x, y, s = 1) {
  return [
    { k: 'ellipse', c: 'w-shadow-soft', cx: x, cy: y + 4 * s, rx: 22 * s, ry: 8 * s },
    { k: 'ellipse', c: 'w-cave-rock', cx: x, cy: y, rx: 20 * s, ry: 7 * s },
    { k: 'ellipse', c: 'w-cave-inner-dim', cx: x, cy: y, rx: 12 * s, ry: 4 * s },
    { k: 'poly', c: 'w-step', points: `${pt(x - 20, y + 2)} ${pt(x + 20, y + 2)} ${pt(x + 14, y + 12)} ${pt(x - 14, y + 12)}` }
  ]
}
