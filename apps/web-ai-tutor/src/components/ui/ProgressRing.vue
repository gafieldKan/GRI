<template>
  <view class="progress-ring" :style="{ width: size + 'px', height: size + 'px' }">
    <svg :viewBox="viewBoxValue" class="progress-svg">
      <circle
        class="progress-bg"
        :cx="center"
        :cy="center"
        :r="radius"
        :stroke-width="strokeWidth"
        :stroke="bgColor"
        fill="none"
      />
      <circle
        class="progress-ring-circle"
        :cx="center"
        :cy="center"
        :r="radius"
        :stroke-width="strokeWidth"
        :stroke="color"
        fill="none"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="strokeDashoffset"
        :style="{ transform: 'rotate(-90deg)', transformOrigin: 'center' }"
      />
    </svg>

    <view class="progress-content" v-if="$slots.default || label || value !== undefined">
      <slot>
        <view class="progress-default-content">
          <text v-if="value !== undefined" class="progress-value" :style="{ fontSize: valueSize + 'px' }">
            {{ formattedValue }}
          </text>
          <text v-if="label" class="progress-label">{{ label }}</text>
        </view>
      </slot>
    </view>
  </view>
</template>

<script>
export default {
  name: 'ProgressRing',
  props: {
    value: {
      type: Number,
      default: 0
    },
    max: {
      type: Number,
      default: 100
    },
    size: {
      type: Number,
      default: 80
    },
    strokeWidth: {
      type: Number,
      default: 6
    },
    color: {
      type: String,
      default: '#4a6cf7'
    },
    bgColor: {
      type: String,
      default: '#e8e8f0'
    },
    label: {
      type: String,
      default: ''
    },
    showValue: {
      type: Boolean,
      default: true
    },
    gradient: {
      type: Boolean,
      default: false
    },
    gradientColors: {
      type: Array,
      default: () => ['#4a6cf7', '#7c94ff']
    }
  },
  computed: {
    radius() {
      return (this.size - this.strokeWidth) / 2
    },
    center() {
      return this.size / 2
    },
    circumference() {
      return 2 * Math.PI * this.radius
    },
    viewBoxValue() {
      return '0 0 ' + this.size + ' ' + this.size
    },
    percentage() {
      return Math.max(0, Math.min(100, (this.value / this.max) * 100))
    },
    strokeDashoffset() {
      return this.circumference * (1 - this.percentage / 100)
    },
    formattedValue() {
      return this.showValue ? `${this.percentage.toFixed(0)}%` : ''
    },
    valueSize() {
      return Math.max(16, this.size * 0.22)
    }
  },
  mounted() {
    if (this.gradient) {
      this.applyGradient()
    }
  },
  methods: {
    applyGradient() {
      // #ifdef H5
      const svg = this.$el.querySelector('.progress-svg')
      if (svg) {
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
        const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient')
        gradient.setAttribute('id', `progress-gradient-${this._uid}`)
        gradient.setAttribute('x1', '0%')
        gradient.setAttribute('y1', '100%')
        gradient.setAttribute('x2', '0%')
        gradient.setAttribute('y2', '0%')

        this.gradientColors.forEach((color, index) => {
          const stop = document.createElementNS('http://www.w3.org/2000/svg', 'stop')
          stop.setAttribute('offset', `${(index / (this.gradientColors.length - 1)) * 100}%`)
          stop.setAttribute('stop-color', color)
          gradient.appendChild(stop)
        })

        defs.appendChild(gradient)
        svg.insertBefore(defs, svg.firstChild)

        const circle = svg.querySelector('.progress-ring-circle')
        if (circle) {
          circle.setAttribute('stroke', `url(#progress-gradient-${this._uid})`)
        }
      }
      // #endif
    }
  }
}
</script>

<style scoped>
.progress-ring {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.progress-svg {
  display: block;
  width: 100%;
  height: 100%;
}

.progress-bg {
  opacity: 0.5;
}

.progress-ring-circle {
  transition: stroke-dashoffset 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  stroke-linecap: round;
}

.progress-content {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.progress-default-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.progress-value {
  font-weight: 700;
  color: var(--color-text-primary, #1a1a2e);
  line-height: 1;
}

.progress-label {
  font-size: 12px;
  color: var(--color-text-tertiary, #999);
  font-weight: 500;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .progress-bg {
    stroke: var(--color-border, #3d3d5c);
    opacity: 0.3;
  }

  .progress-value {
    color: var(--color-text-primary, #e8e8f0);
  }

  .progress-label {
    color: var(--color-text-tertiary, #888);
  }
}
</style>