<template>
  <view class="memory-card">
    <view class="mc-head">
      <text class="mc-label">{{ label }}</text>
      <view class="mc-strength">
        <view class="mc-strength-bar">
          <view class="mc-strength-fill" :style="{ width: strengthPct + '%' }" />
        </view>
        <text class="mc-strength-num">{{ strength }}</text>
      </view>
    </view>
    <text class="mc-value">{{ displayValue }}</text>
    <text v-if="timeText" class="mc-time">更新于 {{ timeText }}</text>
  </view>
</template>

<script>
export default {
  name: 'MemoryCard',
  props: {
    memory: { type: Object, required: true }
  },
  computed: {
    label() {
      const key = this.memory.key || ''
      const map = {
        'setting.preferredDifficulty': '偏好难度',
        'setting.preferredSubjects': '偏好学科'
      }
      if (map[key]) return map[key]
      if (key.startsWith('mastery.')) return '掌握 · ' + key.slice(8)
      if (key.startsWith('setting.')) return '偏好 · ' + key.slice(8)
      if (key.startsWith('fact.')) return '事实 · ' + key.slice(5)
      return key || '记忆'
    },
    displayValue() {
      const v = this.memory.value
      if (v == null) return '—'
      if (typeof v === 'string') return v
      try {
        return JSON.stringify(v)
      } catch (e) {
        return String(v)
      }
    },
    strength() {
      return Number(this.memory.strength ?? 1)
    },
    strengthPct() {
      return Math.max(4, Math.min(100, this.strength * 20))
    },
    timeText() {
      const t = this.memory.updatedAt
      if (!t) return ''
      const d = new Date(t)
      if (isNaN(d.getTime())) return ''
      return `${d.getMonth() + 1}月${d.getDate()}日`
    }
  }
}
</script>

<style scoped>
.memory-card {
  padding: 12px 14px;
  background: var(--twin-soft, #f7f9f6);
  border: 1px solid var(--twin-line, #e2e9e3);
  border-radius: 12px;
  margin-bottom: 10px;
}

.mc-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.mc-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--twin-sub, #74857f);
}

.mc-strength {
  display: flex;
  align-items: center;
  gap: 6px;
}

.mc-strength-bar {
  width: 48px;
  height: 4px;
  background: var(--twin-line, #e2e9e3);
  border-radius: 4px;
  overflow: hidden;
}

.mc-strength-fill {
  height: 100%;
  background: var(--twin-teal, #247b68);
  border-radius: 4px;
}

.mc-strength-num {
  font-size: 11px;
  color: #9caa93;
}

.mc-value {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: var(--twin-ink, #203e3a);
  margin-top: 6px;
  word-break: break-all;
}

.mc-time {
  display: block;
  font-size: 11px;
  color: #9caa93;
  margin-top: 4px;
}
</style>
