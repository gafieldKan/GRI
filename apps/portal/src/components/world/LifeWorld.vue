<template>
  <view class="life-world">
    <!-- ── 世界抬头 ── -->
    <view class="lw-head">
      <view class="lw-head-main">
        <text class="lw-kicker">人本世界</text>
        <text class="lw-title">{{ title }}</text>
        <text class="lw-sub">{{ subtitle }}</text>
      </view>
      <view class="lw-head-side">
        <slot name="side" />
      </view>
    </view>

    <!-- ── 生活全景 ── -->
    <view class="lw-frame" :class="{ 'is-pending': pending }">
      <view class="lw-scroll">
        <view class="lw-canvas">
          <svg
            class="lw-svg"
            :viewBox="viewBox"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            :aria-label="ariaLabel"
          >
            <!-- 地形 → 各场景结构 → 我的位置（一组一条链路，顺序即层序） -->
            <g
              v-for="group in groups"
              :key="group.key"
              :transform="group.transform"
              :data-person="group.key === 'person' ? 'me' : undefined"
            >
              <template v-for="(p, i) in group.prims" :key="i">
                <polygon v-if="p.k === 'poly'" :class="p.c" :points="p.points" :opacity="p.o" />
                <path
                  v-else-if="p.k === 'path'"
                  :class="p.c"
                  :d="p.d"
                  :opacity="p.o"
                  :stroke-width="p.w"
                  :stroke-dasharray="p.dash"
                />
                <circle v-else-if="p.k === 'circle'" :class="p.c" :cx="p.cx" :cy="p.cy" :r="p.r" :opacity="p.o" />
                <ellipse
                  v-else-if="p.k === 'ellipse'"
                  :class="p.c"
                  :cx="p.cx"
                  :cy="p.cy"
                  :rx="p.rx"
                  :ry="p.ry"
                  :opacity="p.o"
                />
                <rect
                  v-else
                  :class="p.c"
                  :x="p.x"
                  :y="p.y"
                  :width="p.w"
                  :height="p.h"
                  :rx="p.rx"
                  :opacity="p.o"
                />
              </template>
            </g>

            <!-- 场景热区（覆盖在结构之上，唯一可点区域） -->
            <g v-for="s in placed" :key="'hot-' + s.scene.code" :transform="s.transform">
              <ellipse
                class="lw-hot"
                :class="{ 'is-on': activeCode === s.scene.code, 'is-empty': !s.openCount }"
                cx="0"
                cy="-44"
                :rx="HOT.rx"
                :ry="HOT.ry"
                :data-scene="s.scene.code"
                role="button"
                :aria-label="sceneLabel(s.scene)"
                @click="pick(s.scene)"
              />
            </g>
          </svg>

          <!-- 场景标签（HTML 叠层，随画布等比缩放；与热区同一坐标真源） -->
          <view
            v-for="s in placed"
            :key="'chip-' + s.scene.code"
            class="lw-chip"
            :class="{ 'is-on': activeCode === s.scene.code, 'is-empty': !s.openCount }"
            :style="s.chip"
            :data-scene-chip="s.scene.code"
            role="button"
            :aria-label="sceneLabel(s.scene)"
            @click="pick(s.scene)"
          >
            <text class="lw-chip-name">{{ s.scene.icon || '•' }} {{ s.scene.name }}</text>
            <text class="lw-chip-sub">{{ s.openCount ? s.openCount + ' 个去处' : '建设中' }}</text>
          </view>

          <!-- 我的位置 -->
          <view v-if="person" class="lw-me" :style="person.chip" aria-hidden="true">
            <text class="lw-me-text">我在这里</text>
          </view>

          <!-- 降级态 / 加载态 -->
          <view v-if="pending" class="lw-veil">
            <text class="lw-veil-text">正在铺开你的世界…</text>
          </view>
          <view v-else-if="degraded" class="lw-veil is-warn" role="alert">
            <text class="lw-veil-title">世界数据暂不可用</text>
            <text class="lw-veil-text">{{ degradedHint }}</text>
          </view>
        </view>
      </view>

      <view class="lw-legend">
        <text class="lw-legend-item"><text class="lw-dot is-open" />已开放</text>
        <text class="lw-legend-item"><text class="lw-dot is-soon" />建设中</text>
        <text class="lw-legend-note">点场景 → 选意向 → 走进模块</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { MAP, TERRAIN, buildWorldScenes, personMarker, scenePoint, HOME_SCENE } from '@world-art'

const props = defineProps({
  /** W1 `GET /api/world` 的场景列表（唯一真源，不二次加工） */
  scenes: { type: Array, default: () => [] },
  /** 现在就能走进的模块码：业务类（world 之内）且入口已接通（由 parent 依 W1 数据推导） */
  openCodes: { type: Array, default: () => [] },
  /** 人物（W1 `context/me.profile`） */
  profile: { type: Object, default: null },
  /** 高亮的场景码（意向面板打开时） */
  activeCode: { type: String, default: '' },
  /** 人物所在场景码；缺省时停在居所 */
  personScene: { type: String, default: HOME_SCENE },
  title: { type: String, default: '你的生活全景' },
  subtitle: {
    type: String,
    default: '一处一景，一景一意向——想去哪里，世界就打开哪里'
  },
  pending: { type: Boolean, default: false },
  degraded: { type: Boolean, default: false },
  degradedHint: {
    type: String,
    default: '场景由后端统一下发；稍后重试即可，你的身份与模块不受影响'
  }
})

const emit = defineEmits(['pick'])

const HOT = { rx: 78, ry: 54 }
const viewBox = `0 0 ${MAP.w} ${MAP.h}`

const ariaLabel = computed(
  () => `人本世界生活全景：${props.scenes.length} 个生活场景，当前有 ${props.scenes.filter((s) => openCountOf(s)).length} 处已开放`
)

/** 场景可去处数：只数「现在就走得进」的模块——业务类、入口已接通（运营类不在世界里；未接通的不谎报去处）。 */
function openCountOf(scene) {
  const allowed = new Set(props.openCodes)
  const codes = new Set()
  ;(scene.intents || []).forEach((intent) => {
    ;(intent.modules || []).forEach((link) => {
      if (link?.moduleCode && allowed.has(link.moduleCode)) codes.add(link.moduleCode)
    })
  })
  ;(scene.modules || []).forEach((link) => {
    if (link?.moduleCode && allowed.has(link.moduleCode)) codes.add(link.moduleCode)
  })
  return codes.size
}

/** 百分比定位（HTML 叠层与 SVG 同一映射；画布与 viewBox 等比，故可共用）。 */
function chipStyle(x, y) {
  return {
    left: `${((x / MAP.w) * 100).toFixed(3)}%`,
    top: `${((y / MAP.h) * 100).toFixed(3)}%`
  }
}

const placed = computed(() =>
  buildWorldScenes(props.scenes).map((item) => ({
    scene: item.scene,
    prims: item.prims,
    transform: `translate(${item.x} ${item.y})`,
    openCount: openCountOf(item.scene),
    chip: chipStyle(item.x, item.y)
  }))
)

const person = computed(() => {
  if (!props.profile) return null
  const target =
    props.scenes.find((s) => s.code === props.personScene) ||
    props.scenes.find((s) => s.code === HOME_SCENE) ||
    props.scenes[0]
  if (!target) return null
  const p = scenePoint(target)
  return {
    transform: `translate(${p.x} ${p.y})`,
    chip: chipStyle(p.x, p.y),
    prims: personMarker(props.profile)
  }
})

/** 层序：底图 → 场景结构 → 人物（人物永远在最上层）。 */
const groups = computed(() => {
  const out = [{ key: 'terrain', transform: '', prims: TERRAIN }]
  placed.value.forEach((item) => {
    out.push({ key: `scene-${item.scene.code}`, transform: item.transform, prims: item.prims })
  })
  if (person.value) out.push({ key: 'person', transform: person.value.transform, prims: person.value.prims })
  return out
})

function sceneLabel(scene) {
  const n = placed.value.find((p) => p.scene.code === scene.code)
  const state = n && n.openCount ? `${n.openCount} 个去处可用` : '建设中'
  return `${scene.name}：${state}`
}

function pick(scene) {
  emit('pick', scene)
}
</script>

<style scoped>
.life-world {
  position: relative;
}

/* ── 抬头 ── */
.lw-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-sm);
}

.lw-kicker {
  display: block;
  font-size: var(--font-size-xs);
  letter-spacing: 0.16em;
  color: var(--world-node-sub);
  text-transform: uppercase;
}

.lw-title {
  display: block;
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold, 700);
  color: var(--world-node-text);
  margin-top: 2rpx;
}

.lw-sub {
  display: block;
  font-size: var(--font-size-sm);
  color: var(--world-node-sub);
  margin-top: 4rpx;
}

.lw-head-side {
  flex: none;
}

/* ── 画框 ── */
.lw-frame {
  position: relative;
  border: 1px solid var(--world-node-border);
  border-radius: var(--radius-2xl);
  background: var(--world-panel);
  box-shadow: var(--shadow-card);
  overflow: hidden;
}

.lw-scroll {
  overflow: hidden;
}

.lw-canvas {
  position: relative;
  width: 100%;
  aspect-ratio: 1000 / 680;
}

.lw-svg {
  display: block;
  width: 100%;
  height: 100%;
}

/* ── 图例 ── */
.lw-legend {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  flex-wrap: wrap;
  padding: 10rpx var(--spacing-md);
  border-top: 1px solid var(--world-panel-edge);
  background: var(--world-panel);
}

.lw-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  font-size: var(--font-size-xs);
  color: var(--world-node-sub);
}

.lw-dot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
}

.lw-dot.is-open {
  background: var(--world-node-on-bg);
}

.lw-dot.is-soon {
  background: var(--world-node-sub);
}

.lw-legend-note {
  margin-left: auto;
  font-size: var(--font-size-xs);
  color: var(--world-node-sub);
}

/* ── 场景标签（HTML 叠层）── */
.lw-chip {
  position: absolute;
  transform: translate(-50%, 12%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2rpx;
  padding: 6rpx 14rpx;
  min-width: 96rpx;
  border: 1px solid var(--world-node-border);
  border-radius: var(--radius-lg);
  background: var(--world-node-bg);
  box-shadow: 0 2rpx 10rpx var(--world-node-shadow);
  cursor: pointer;
  transition: transform var(--transition-base), box-shadow var(--transition-base), background var(--transition-base);
}

.lw-chip-name {
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--world-node-text);
  white-space: nowrap;
}

.lw-chip-sub {
  font-size: var(--font-size-xs);
  color: var(--world-node-sub);
  white-space: nowrap;
}

.lw-chip.is-empty .lw-chip-name {
  color: var(--world-node-sub);
}

.lw-chip.is-on,
.lw-chip:hover {
  background: var(--world-node-on-bg);
  box-shadow: 0 6rpx 18rpx var(--world-node-shadow);
}

.lw-chip.is-on .lw-chip-name,
.lw-chip.is-on .lw-chip-sub,
.lw-chip:hover .lw-chip-name,
.lw-chip:hover .lw-chip-sub {
  color: var(--world-node-on-text);
}

/* ── 我的位置标记（HTML 气泡；SVG 里有小人本体）── */
.lw-me {
  position: absolute;
  transform: translate(-50%, -100%) translateY(-64rpx);
  padding: 4rpx 12rpx;
  border-radius: var(--radius-lg);
  background: var(--world-node-on-bg);
  box-shadow: 0 2rpx 10rpx var(--world-node-shadow);
  pointer-events: none;
}

.lw-me-text {
  font-size: var(--font-size-xs);
  color: var(--world-node-on-text);
  white-space: nowrap;
}

/* ── 幕布 ── */
.lw-veil {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  background: var(--world-transition-veil);
  backdrop-filter: blur(2px);
}

.lw-veil.is-warn {
  background: var(--world-scrim-soft);
}

.lw-veil-title {
  font-size: var(--font-size-md);
  font-weight: 600;
  color: var(--world-node-text);
}

.lw-veil-text {
  font-size: var(--font-size-sm);
  color: var(--world-node-sub);
  padding: 0 var(--spacing-lg);
  text-align: center;
}

/* ── 场景热区（透明可点；悬停一道柔光）──
   几何类的颜色映射见 styles/world.css（共享单份，人本世界与模块世界共用同一套世界色）。 */
.lw-hot {
  fill: var(--world-hot);
  cursor: pointer;
  transition: fill var(--transition-base);
  outline: none;
}

.lw-hot:hover,
.lw-hot:focus-visible,
.lw-hot.is-on {
  fill: var(--world-hot-glow);
}

/* ── 移动端：单列 + 画布横向滚动（保持等比，标签不错位）── */
@media (max-width: 720px) {
  .lw-head {
    flex-direction: column;
    align-items: flex-start;
  }

  .lw-head-side {
    width: 100%;
  }

  .lw-scroll {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .lw-canvas {
    min-width: 640px;
  }

  .lw-legend-note {
    margin-left: 0;
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .lw-chip,
  .lw-hot {
    transition: none;
  }
}
</style>
