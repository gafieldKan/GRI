<template>
  <view class="persona-card" :class="{ 'is-loading': loading }">
    <!-- ── 人物形象（拟真描摹；外观由身份稳定派生）── -->
    <view class="pc-figure">
      <svg class="pc-portrait" viewBox="0 0 300 290" role="img" :aria-label="figureLabel">
        <template v-for="(p, i) in portrait" :key="i">
          <path v-if="p.k === 'path'" :class="p.c" :d="p.d" :opacity="p.o" :stroke-width="p.w" />
          <circle v-else-if="p.k === 'circle'" :class="p.c" :cx="p.cx" :cy="p.cy" :r="p.r" :opacity="p.o" />
          <polygon v-else-if="p.k === 'poly'" :class="p.c" :points="p.points" :opacity="p.o" />
          <ellipse v-else :class="p.c" :cx="p.cx" :cy="p.cy" :rx="p.rx" :ry="p.ry" :opacity="p.o" />
        </template>
      </svg>
      <text class="pc-entity" v-if="entityId">人物 {{ shortId }}</text>
    </view>

    <!-- ── 身份 + 状态 ── -->
    <view class="pc-body">
      <view class="pc-ident">
        <text class="pc-name">{{ displayName }}</text>
        <view class="pc-meta">
          <text class="pc-role">{{ roleLabel }}</text>
          <text v-if="identityLine" class="pc-line">{{ identityLine }}</text>
        </view>
      </view>

      <!-- 状态环（掌握 / 学习中 / 薄弱 三分；真源：twin/me.state.mastery） -->
      <view class="pc-ring-wrap">
        <svg class="pc-ring" viewBox="0 0 120 120" role="img" :aria-label="ringLabel">
          <circle class="w-ring-track" cx="60" cy="60" :r="RING.r" :stroke-width="RING.w" />
          <g :transform="`rotate(-90 60 60)`">
            <circle
              v-for="seg in ring"
              :key="seg.key"
              :class="seg.cls"
              cx="60"
              cy="60"
              :r="RING.r"
              :stroke-width="RING.w"
              :stroke-dasharray="seg.dash"
              :stroke-dashoffset="seg.offset"
            />
          </g>
        </svg>
        <view class="pc-ring-center">
          <text class="pc-ring-value">{{ mastery.avg === null ? '—' : mastery.avg }}</text>
          <text class="pc-ring-unit">掌握度</text>
        </view>
      </view>

      <!-- 状态格 -->
      <view class="pc-stats">
        <view v-for="cell in cells" :key="cell.key" class="pc-cell">
          <text class="pc-cell-label">{{ cell.label }}</text>
          <text class="pc-cell-value">{{ cell.value }}</text>
          <text class="pc-cell-note">{{ cell.note }}</text>
        </view>
      </view>

      <!-- 最近经历（真源：twin.event 时间线） -->
      <view class="pc-recent">
        <text class="pc-recent-label">最近经历</text>
        <text v-if="recent" class="pc-recent-text">
          {{ recent.title }}<text class="pc-recent-at">· {{ recent.at }}</text>
        </text>
        <text v-else class="pc-recent-text is-muted">{{ recentHint }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { buildPortrait } from '@/utils/world-art'
import { roleLabel as toRoleLabel, relativeTime } from '@/utils/persona'

const props = defineProps({
  /** W1 `context/me.profile` */
  profile: { type: Object, default: null },
  /** W1 `context/me.twin`（实体锚点 / 场景 / 组织数） */
  context: { type: Object, default: null },
  /** W1 `GET /api/twin/me`（状态 / 经历真源；不可用时为 null 并降级） */
  overview: { type: Object, default: null },
  loading: { type: Boolean, default: false }
})

const RING = { r: 46, w: 10 }
const CIRC = 2 * Math.PI * RING.r

const displayName = computed(
  () => props.profile?.name || props.profile?.username || '已登录用户'
)

const shortId = computed(() => {
  const id = props.context?.entityId || props.profile?.id || ''
  return id ? id.slice(0, 8) : ''
})

const entityId = computed(() => props.context?.entityId || props.profile?.id || '')

const roleLabel = computed(() => toRoleLabel(props.profile?.role))

/** 身份副行：年级/学校/教材优先（twin/me.profile），退化为邮箱。 */
const identityLine = computed(() => {
  const tp = props.overview?.profile
  const bits = []
  if (tp?.gradeName) bits.push(tp.gradeName)
  else if (tp?.gradeLevel) bits.push(`学段 ${tp.gradeLevel}`)
  if (tp?.school) bits.push(tp.school)
  if (tp?.textbookVersion) bits.push(tp.textbookVersion)
  if (bits.length) return bits.join(' · ')
  return props.profile?.email || ''
})

const mastery = computed(() => {
  const m = props.overview?.state?.mastery
  return {
    avg: Number.isFinite(m?.avg) ? Math.round(m.avg) : null,
    mastered: Number(m?.mastered) || 0,
    learning: Number(m?.learning) || 0,
    weak: Number(m?.weak) || 0,
    total: Number(m?.total) || 0
  }
})

/** 掌握档位：掌握度的本地分档呈现（1–6 档），不引入新的状态真源。 */
const gradeBand = computed(() => {
  const avg = mastery.value.avg
  if (avg === null) return '—'
  return `LV.${Math.min(6, Math.max(1, Math.floor(avg / 17) + 1))}`
})

const events = computed(() => (Array.isArray(props.overview?.events) ? props.overview.events : []))

const cells = computed(() => [
  { key: 'band', label: '掌握档位', value: gradeBand.value, note: '按掌握度分档' },
  { key: 'events', label: '经历', value: `${events.value.length} 条`, note: '人物时间线' },
  { key: 'orgs', label: '组织', value: `${Number(props.context?.orgCount) || 0} 个`, note: '我的归属' }
])

const ring = computed(() => {
  const m = mastery.value
  if (!m.total) return []
  const segs = [
    { key: 'mastered', cls: 'w-ring-mastered', n: m.mastered },
    { key: 'learning', cls: 'w-ring-learning', n: m.learning },
    { key: 'weak', cls: 'w-ring-weak', n: m.weak }
  ]
  let cursor = 0
  return segs
    .filter((s) => s.n > 0)
    .map((s) => {
      const frac = s.n / m.total
      const seg = {
        ...s,
        dash: `${(frac * CIRC).toFixed(2)} ${(CIRC - frac * CIRC).toFixed(2)}`,
        offset: (-cursor * CIRC).toFixed(2)
      }
      cursor += frac
      return seg
    })
})

const ringLabel = computed(() => {
  const m = mastery.value
  if (!m.total) return '掌握状态环：暂无学习数据'
  return `掌握状态环：掌握 ${m.mastered}，学习中 ${m.learning}，薄弱 ${m.weak}，共 ${m.total}`
})

const figureLabel = computed(() => `${displayName.value} 的人物形象`)

const recent = computed(() => {
  const first = events.value[0]
  if (!first) return null
  return { title: first.title || '（无标题）', at: relativeTime(first.at) }
})

const recentHint = computed(() => {
  if (props.loading) return '正在读取人物时间线…'
  if (!props.overview) return '经历时间线暂不可用'
  return '还没有经历——进入场景走一走'
})

const portrait = computed(() =>
  buildPortrait(props.profile || { id: entityId.value, name: displayName.value, role: props.profile?.role })
)
</script>

<style scoped>
.persona-card {
  display: flex;
  gap: var(--spacing-lg);
  padding: var(--spacing-lg);
  border: 1px solid var(--world-node-border);
  border-radius: var(--radius-2xl);
  background: var(--world-panel);
  box-shadow: var(--shadow-card);
}

/* ── 人物形象 ── */
.pc-figure {
  position: relative;
  flex: none;
  width: 180rpx;
  align-self: flex-end;
}

.pc-portrait {
  display: block;
  width: 100%;
  height: auto;
}

.pc-entity {
  display: block;
  margin-top: -6rpx;
  font-size: var(--font-size-xs);
  color: var(--world-node-sub);
  font-family: var(--font-mono, monospace);
  text-align: center;
}

/* ── 主体 ── */
.pc-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.pc-name {
  display: block;
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  color: var(--world-node-text);
  line-height: var(--line-height-tight);
}

.pc-meta {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
  margin-top: var(--spacing-sm);
}

.pc-role {
  padding: 4rpx 16rpx;
  border-radius: var(--radius-round);
  background: var(--world-node-on-bg);
  color: var(--world-node-on-text);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
}

.pc-line {
  font-size: var(--font-size-xs);
  color: var(--world-node-sub);
}

/* ── 状态环 ── */
.pc-ring-wrap {
  position: relative;
  width: 168rpx;
  height: 168rpx;
  align-self: flex-start;
}

.pc-ring {
  display: block;
  width: 100%;
  height: 100%;
}

.pc-ring-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2rpx;
}

.pc-ring-value {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--world-node-text);
  line-height: 1;
}

.pc-ring-unit {
  font-size: var(--font-size-xs);
  color: var(--world-node-sub);
}

/* ── 状态格 ── */
.pc-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--spacing-sm);
}

.pc-cell {
  padding: var(--spacing-sm);
  border: 1px solid var(--world-panel-edge);
  border-radius: var(--radius-lg);
  background: var(--world-node-bg);
}

.pc-cell-label {
  display: block;
  font-size: var(--font-size-xs);
  color: var(--world-node-sub);
}

.pc-cell-value {
  display: block;
  margin-top: 4rpx;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--world-node-text);
}

.pc-cell-note {
  display: block;
  margin-top: 2rpx;
  font-size: var(--font-size-xs);
  color: var(--world-node-sub);
}

/* ── 最近经历 ── */
.pc-recent {
  display: flex;
  align-items: baseline;
  gap: var(--spacing-sm);
  padding-top: var(--spacing-sm);
  border-top: 1px solid var(--world-panel-edge);
}

.pc-recent-label {
  flex: none;
  font-size: var(--font-size-xs);
  color: var(--world-node-sub);
}

.pc-recent-text {
  font-size: var(--font-size-sm);
  color: var(--world-node-text);
  overflow-wrap: anywhere;
}

.pc-recent-text.is-muted {
  color: var(--world-node-sub);
}

.pc-recent-at {
  margin-left: 8rpx;
  font-size: var(--font-size-xs);
  color: var(--world-node-sub);
}

/* ── 移动端：单列 ── */
@media (max-width: 720px) {
  .persona-card {
    flex-direction: column;
    align-items: stretch;
    gap: var(--spacing-md);
  }

  .pc-figure {
    width: 140rpx;
    align-self: center;
  }

  .pc-ring-wrap {
    align-self: center;
  }
}

@media (max-width: 420px) {
  .pc-stats {
    grid-template-columns: 1fr;
  }
}
</style>
