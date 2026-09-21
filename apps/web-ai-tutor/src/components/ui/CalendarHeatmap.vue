<template>
  <view class="calendar-heatmap">
    <view class="heatmap-header" v-if="showLegend">
      <text class="heatmap-year">{{ currentYear }}</text>
      <view class="heatmap-legend">
        <text>少</text>
        <view class="legend-colors">
          <view v-for="i in 5" :key="i" class="legend-color" :style="{ background: getColor(i) }" />
        </view>
        <text>多</text>
      </view>
    </view>

    <view class="heatmap-grid">
      <view class="heatmap-month-labels">
        <text v-for="month in months" :key="month" class="month-label">{{ month }}</text>
      </view>

      <view class="heatmap-weeks">
        <view
          v-for="(week, weekIndex) in weeks"
          :key="weekIndex"
          class="heatmap-week"
        >
          <view class="heatmap-day-labels" v-if="weekIndex === 0">
            <text v-for="day in dayLabels" :key="day" class="day-label">{{ day }}</text>
          </view>
          <view
            v-for="(day, dayIndex) in week"
            :key="dayIndex"
            class="heatmap-day"
            :class="{ today: isToday(day), 'has-data': day && day.count > 0 }"
            :style="{ backgroundColor: day ? getColor(day.count) : 'transparent' }"
            @click="day && onDayClick(day)"
          >
            <text v-if="day" class="day-number">{{ day.date.getDate() }}</text>
          </view>
        </view>
      </view>
    </view>

    <view class="heatmap-tooltip" v-if="hoveredDay" :style="{ left: tooltipX + 'px', top: tooltipY + 'px' }">
      <text class="tooltip-date">{{ formatDate(hoveredDay.date) }}</text>
      <text class="tooltip-count">{{ hoveredDay.count }} 分钟学习</text>
    </view>
  </view>
</template>

<script>
import { ref, computed } from 'vue'
export default {
  name: 'CalendarHeatmap',
  props: {
    streak: {
      type: Number,
      default: 0
    },
    lastDate: {
      type: [String, Date, null],
      default: null
    },
    fullYear: {
      type: Boolean,
      default: false
    },
    showLegend: {
      type: Boolean,
      default: true
    },
    data: {
      type: Array,
      default: () => []
    }
  },
  emits: ['day-click'],
  setup(props, { emit }) {
    const today = new Date()
    const currentYear = today.getFullYear()

    const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
    const dayLabels = ['日', '一', '二', '三', '四', '五', '六']

    // 生成周数据
    const weeks = computed(() => {
      const result = []
      const startDate = new Date(currentYear, 0, 1)
      const endDate = new Date(currentYear, 11, 31)

      // 调整到周日开始
      const dayOfWeek = startDate.getDay()
      startDate.setDate(startDate.getDate() - dayOfWeek)

      const currentDate = new Date(startDate)

      while (currentDate <= endDate) {
        const week = []
        for (let i = 0; i < 7; i++) {
          const date = new Date(currentDate)
          const isCurrentYear = date.getFullYear() === currentYear

          let count = 0
          if (isCurrentYear) {
            // 查找数据
            const dayData = props.data.find(item => {
              const itemDate = new Date(item.date)
              return itemDate.getFullYear() === date.getFullYear() &&
                     itemDate.getMonth() === date.getMonth() &&
                     itemDate.getDate() === date.getDate()
            })
            count = dayData?.count || 0

            // 如果没有数据但有 streak，模拟一些数据
            if (count === 0 && props.streak > 0 && props.lastDate) {
              const lastStudy = new Date(props.lastDate)
              const diffDays = Math.floor((lastStudy - date) / 86400000)
              if (diffDays >= 0 && diffDays < props.streak) {
                count = Math.floor(Math.random() * 30) + 15
              }
            }
          }

          week.push(isCurrentYear ? { date, count } : null)
          currentDate.setDate(currentDate.getDate() + 1)
        }
        result.push(week)
      }

      return result
    })

    const hoveredDay = ref(null)
    const tooltipX = ref(0)
    const tooltipY = ref(0)

    const getColor = (count) => {
      if (!count || count === 0) return '#ebedf0'
      if (count <= 10) return '#9be9a8'
      if (count <= 30) return '#40c463'
      if (count <= 60) return '#30a14e'
      return '#216e39'
    }

    const isToday = (day) => {
      if (!day) return false
      const today = new Date()
      return day.date.getFullYear() === today.getFullYear() &&
             day.date.getMonth() === today.getMonth() &&
             day.date.getDate() === today.getDate()
    }

    const formatDate = (date) => {
      return `${date.getMonth() + 1}月${date.getDate()}日`
    }

    const onDayClick = (day) => {
      hoveredDay.value = day
      tooltipX.value = 0
      tooltipY.value = 0
      emit('day-click', day)
    }

    return {
      currentYear,
      months,
      dayLabels,
      weeks,
      hoveredDay,
      tooltipX,
      tooltipY,
      getColor,
      isToday,
      formatDate,
      onDayClick
    }
  }
}
</script>

<style scoped>
.calendar-heatmap {
  font-family: inherit;
}

.heatmap-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.heatmap-year {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a2e;
}

.heatmap-legend {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: #999;
}

.legend-colors {
  display: flex;
  gap: 3px;
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 2px;
}

.heatmap-grid {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.heatmap-month-labels {
  display: grid;
  grid-template-columns: repeat(53, 1fr);
  gap: 2px;
  padding-left: 30px;
  margin-bottom: 4px;
}

.month-label {
  font-size: 10px;
  color: #999;
  text-align: center;
}

.heatmap-week {
  display: flex;
  align-items: center;
  gap: 2px;
}

.heatmap-day-labels {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 28px;
  text-align: right;
  padding-right: 6px;
  margin-right: 4px;
}

.day-label {
  font-size: 9px;
  color: #999;
  height: 12px;
  line-height: 12px;
}

.heatmap-day {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform var(--transition-fast);
}

.heatmap-day:active {
  transform: scale(1.2);
}

.heatmap-day.today {
  box-shadow: 0 0 0 1px #4a6cf7;
}

.day-number {
  font-size: 8px;
  color: #fff;
  font-weight: 600;
  text-shadow: 0 0 2px rgba(0,0,0,0.3);
}

.heatmap-day:not(.has-data) .day-number {
  color: #999;
}

.heatmap-tooltip {
  position: absolute;
  pointer-events: none;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.85);
  border-radius: 6px;
  font-size: 11px;
  color: #fff;
  z-index: 100;
  white-space: nowrap;
  transform: translate(-50%, -100%);
  margin-top: -8px;
}

.tooltip-date {
  display: block;
  font-weight: 600;
  margin-bottom: 2px;
}

.tooltip-count {
  display: block;
  color: #9be9a8;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .heatmap-year {
    color: var(--color-text-primary, #e8e8f0);
  }

  .heatmap-legend {
    color: var(--color-text-tertiary, #888);
  }

  .day-label {
    color: var(--color-text-tertiary, #888);
  }

  .heatmap-day:not(.has-data) {
    background: var(--color-border, #3d3d5c) !important;
  }

  .heatmap-day:not(.has-data) .day-number {
    color: var(--color-text-tertiary, #888);
  }
}
</style>