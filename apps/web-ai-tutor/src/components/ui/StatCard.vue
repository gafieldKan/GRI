<template>
  <view class="stat-card" :class="variant">
    <view class="stat-icon" v-if="icon" :style="{ backgroundColor: iconBg }">
      <text>{{ icon }}</text>
    </view>
    <view class="stat-content">
      <view class="stat-value-wrapper">
        <text class="stat-value" :style="{ color: valueColor }">{{ formattedValue }}</text>
        <text v-if="trend !== null" :class="['stat-trend', trend > 0 ? 'up' : trend < 0 ? 'down' : 'neutral']">
          {{ trend > 0 ? '+' : '' }}{{ trend }}%
        </text>
      </view>
      <text class="stat-label">{{ label }}</text>
      <text v-if="sublabel" class="stat-sublabel">{{ sublabel }}</text>
    </view>
    <view class="stat-progress" v-if="progress !== undefined">
      <view class="progress-bar" :style="{ width: progress + '%', backgroundColor: progressColor }"></view>
    </view>
  </view>
</template>

<script>
export default {
  name: 'StatCard',
  props: {
    label: {
      type: String,
      required: true
    },
    value: {
      type: [Number, String],
      required: true
    },
    sublabel: {
      type: String,
      default: ''
    },
    icon: {
      type: String,
      default: ''
    },
    iconBg: {
      type: String,
      default: '#4a6cf7'
    },
    valueColor: {
      type: String,
      default: ''
    },
    trend: {
      type: Number,
      default: null
    },
    progress: {
      type: Number,
      default: undefined
    },
    progressColor: {
      type: String,
      default: '#4a6cf7'
    },
    variant: {
      type: String,
      default: 'default' // 'default' | 'highlight' | 'outline'
    }
  },
  computed: {
    formattedValue() {
      const val = this.value
      if (typeof val === 'number') {
        if (val >= 10000) return (val / 10000).toFixed(1) + '万'
        if (val >= 1000) return (val / 1000).toFixed(1) + 'k'
      }
      return val
    }
  }
}
</script>

<style scoped>
.stat-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  background: var(--color-bg-card, #fff);
  border-radius: var(--radius-lg, 16px);
  box-shadow: var(--shadow-sm, 0 2px 8px rgba(0,0,0,0.06));
  border: 1px solid var(--color-border, #e8e8f0);
  transition: all var(--transition-base, 250ms ease);
}

.stat-card.highlight {
  border-color: var(--color-primary, #4a6cf7);
  box-shadow: var(--shadow-md, 0 4px 16px rgba(74, 108, 247, 0.15));
}

.stat-card.outline {
  background: transparent;
  border-width: 2px;
}

.stat-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md, 10px);
  flex-shrink: 0;
}

.stat-icon text {
  font-size: 20px;
}

.stat-content {
  flex: 1;
  min-width: 0;
}

.stat-value-wrapper {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 4px;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text-primary, #1a1a2e);
  line-height: 1.2;
}

.stat-trend {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 10px;
}

.stat-trend.up {
  color: var(--color-success, #52c41a);
  background: rgba(82, 196, 26, 0.1);
}

.stat-trend.down {
  color: var(--color-error, #ff4d4f);
  background: rgba(255, 77, 79, 0.1);
}

.stat-trend.neutral {
  color: var(--color-text-tertiary, #999);
  background: var(--color-bg-secondary, #f0f0f5);
}

.stat-label {
  display: block;
  font-size: 13px;
  color: var(--color-text-secondary, #59596b);
  font-weight: 500;
  margin-bottom: 2px;
}

.stat-sublabel {
  display: block;
  font-size: 11px;
  color: var(--color-text-tertiary, #999);
}

.stat-progress {
  width: 60px;
  height: 4px;
  flex-shrink: 0;
  margin-top: 8px;
  background: var(--color-border, #e8e8f0);
  border-radius: 2px;
  overflow: hidden;
}

.stat-progress .progress-bar {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s ease;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .stat-card {
    background: var(--color-bg-card, #252542);
    border-color: var(--color-border, #3d3d5c);
  }

  .stat-value {
    color: var(--color-text-primary, #e8e8f0);
  }

  .stat-label {
    color: var(--color-text-secondary, #a8a8c0);
  }

  .stat-sublabel {
    color: var(--color-text-tertiary, #888);
  }

  .stat-trend.neutral {
    background: var(--color-bg-elevated, #2d2d4a);
  }

  .stat-card.outline {
    background: transparent;
  }
}
</style>