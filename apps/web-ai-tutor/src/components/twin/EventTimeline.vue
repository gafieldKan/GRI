<template>
  <view class="timeline">
    <view v-if="!events.length" class="tl-empty">
      <text class="tl-empty-icon">🕓</text>
      <text class="tl-empty-text">还没有经历——在世界里做一件事，时间线就会生长</text>
    </view>
    <view v-for="ev in events" :key="ev.id" class="tl-item">
      <view class="tl-dot" :style="{ backgroundColor: kindColor(ev.kind) }" />
      <view class="tl-body">
        <view class="tl-head">
          <text class="tl-title">{{ ev.title }}</text>
          <text class="tl-time">{{ relTime(ev.at) }}</text>
        </view>
        <text v-if="ev.text" class="tl-text">{{ ev.text }}</text>
        <view v-if="ev.diffs && ev.diffs.length" class="tl-diffs">
          <text v-for="(d, i) in ev.diffs" :key="i" class="tl-diff">
            {{ d.label }}：{{ d.before }} → {{ d.after }}
          </text>
        </view>
        <text v-if="ev.source" class="tl-source">{{ ev.source }}</text>
      </view>
    </view>
  </view>
</template>

<script>
const KIND_COLORS = {
  system: '#999',
  session: '#4a6cf7',
  profile: '#722ed1',
  world: '#52c41a',
  action: '#faad14',
  memory: '#eb2f96',
  settings: '#8c8c8c'
}

export default {
  name: 'EventTimeline',
  props: {
    events: { type: Array, default: () => [] }
  },
  methods: {
    kindColor(k) {
      return KIND_COLORS[k] || '#4a6cf7'
    },
    relTime(iso) {
      if (!iso) return ''
      const diff = Date.now() - new Date(iso).getTime()
      const min = Math.floor(diff / 60000)
      if (min < 1) return '刚刚'
      if (min < 60) return `${min} 分钟前`
      const hr = Math.floor(min / 60)
      if (hr < 24) return `${hr} 小时前`
      const day = Math.floor(hr / 24)
      if (day < 30) return `${day} 天前`
      const d = new Date(iso)
      return `${d.getMonth() + 1}月${d.getDate()}日`
    }
  }
}
</script>

<style scoped>
.timeline {
  padding: 4px;
}

.tl-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 16px;
}

.tl-empty-icon {
  font-size: 32px;
}

.tl-empty-text {
  font-size: 13px;
  color: var(--color-text-tertiary, #999);
  text-align: center;
}

.tl-item {
  display: flex;
  gap: 10px;
  padding-bottom: 16px;
  position: relative;
}

.tl-item:not(:last-child)::before {
  content: '';
  position: absolute;
  left: 4px;
  top: 14px;
  bottom: 0;
  width: 1px;
  background: var(--color-border, #e8e8f0);
}

.tl-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  margin-top: 5px;
  flex-shrink: 0;
  z-index: 1;
}

.tl-body {
  flex: 1;
  min-width: 0;
}

.tl-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}

.tl-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary, #1a1a2e);
}

.tl-time {
  font-size: 11px;
  color: var(--color-text-tertiary, #999);
  flex-shrink: 0;
}

.tl-text {
  display: block;
  font-size: 12px;
  color: var(--color-text-secondary, #666);
  margin-top: 3px;
  line-height: 1.5;
}

.tl-diffs {
  margin-top: 4px;
}

.tl-diff {
  display: block;
  font-size: 11px;
  color: #4a6cf7;
}

.tl-source {
  display: block;
  font-size: 10px;
  color: var(--color-text-tertiary, #aaa);
  margin-top: 4px;
}
</style>
