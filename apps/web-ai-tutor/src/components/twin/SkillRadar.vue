<template>
  <view class="skill-radar">
    <view v-if="!skills.length" class="radar-empty">暂无可显示的能力维度</view>
    <svg v-else class="radar-svg" :viewBox="`0 0 ${size} ${size}`">
      <!-- 网格：4 层同心多边形 -->
      <polygon
        v-for="(ring, ri) in rings"
        :key="'r' + ri"
        :points="ring"
        fill="none"
        stroke="var(--color-border, #e8e8f0)"
        stroke-width="1"
        opacity="0.7"
      />
      <!-- 轴线 -->
      <line
        v-for="(axis, ai) in axes"
        :key="'a' + ai"
        :x1="center"
        :y1="center"
        :x2="axis.x"
        :y2="axis.y"
        stroke="var(--color-border, #e8e8f0)"
        stroke-width="1"
        opacity="0.7"
      />
      <!-- 能力多边形 -->
      <polygon :points="polygonPoints" :fill="color + '33'" :stroke="color" stroke-width="2" />
      <!-- 顶点 -->
      <circle
        v-for="(p, pi) in points"
        :key="'p' + pi"
        :cx="p.x"
        :cy="p.y"
        r="3"
        :fill="color"
      />
    </svg>
    <!-- 维度标签（名称 + 掌握度） -->
    <view v-if="skills.length" class="radar-legend">
      <view v-for="s in skills" :key="s.fieldCode" class="legend-item">
        <view class="legend-dot" :style="{ backgroundColor: color }" />
        <text class="legend-name">{{ s.name }}</text>
        <text class="legend-value">{{ s.mastery == null ? '—' : s.mastery }}</text>
      </view>
    </view>
  </view>
</template>

<script>
export default {
  name: 'SkillRadar',
  props: {
    skills: { type: Array, default: () => [] },
    size: { type: Number, default: 220 },
    color: { type: String, default: '#4a6cf7' }
  },
  computed: {
    center() {
      return this.size / 2
    },
    radius() {
      return this.size / 2 - 24
    },
    count() {
      return this.skills.length
    },
    // 每个维度的角度（从正上方顺时针）
    angleAt() {
      return (i) => (-90 + (360 / this.count) * i) * (Math.PI / 180)
    },
    axes() {
      return this.skills.map((_, i) => {
        const a = this.angleAt(i)
        return {
          x: this.center + this.radius * Math.cos(a),
          y: this.center + this.radius * Math.sin(a)
        }
      })
    },
    // 4 层网格
    rings() {
      const levels = [0.25, 0.5, 0.75, 1]
      return levels.map((lv) =>
        this.skills
          .map((_, i) => {
            const a = this.angleAt(i)
            const rr = this.radius * lv
            return `${this.center + rr * Math.cos(a)},${this.center + rr * Math.sin(a)}`
          })
          .join(' ')
      )
    },
    points() {
      return this.skills.map((s, i) => {
        const a = this.angleAt(i)
        const m = Math.max(0, Math.min(100, Number(s.mastery ?? 0)))
        const rr = (this.radius * m) / 100
        return {
          x: this.center + rr * Math.cos(a),
          y: this.center + rr * Math.sin(a)
        }
      })
    },
    polygonPoints() {
      return this.points.map((p) => `${p.x},${p.y}`).join(' ')
    }
  }
}
</script>

<style scoped>
.skill-radar {
  padding: 8px 0;
}

.radar-svg {
  display: block;
  width: 100%;
  max-width: 260px;
  margin: 0 auto;
  overflow: visible;
}

.radar-empty {
  text-align: center;
  color: var(--color-text-tertiary, #999);
  font-size: 13px;
  padding: 32px 0;
}

.radar-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  justify-content: center;
  margin-top: 12px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.legend-name {
  font-size: 12px;
  color: var(--color-text-secondary, #666);
}

.legend-value {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-primary, #1a1a2e);
}
</style>
