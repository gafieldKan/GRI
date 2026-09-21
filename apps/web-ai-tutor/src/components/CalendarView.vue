<template>
  <view class="calendar-view">
    <!-- 月份导航 -->
    <view class="calendar-header">
      <t-button variant="text" size="small" @click="prevMonth" :disabled="isCurrentMonth">
        ◀
      </t-button>
      <text class="month-title">{{ formatMonth(currentMonth) }}</text>
      <t-button variant="text" size="small" @click="nextMonth" :disabled="isFutureMonth">
        ▶
      </t-button>
    </view>

    <!-- 周标题 -->
    <view class="week-header">
      <view v-for="day in weekDays" :key="day" class="week-day">{{ day }}</view>
    </view>

    <!-- 日期网格 -->
    <view class="days-grid">
      <view
        v-for="day in calendarDays"
        :key="day.date"
        class="day-cell"
        :class="{
          'other-month': !day.isCurrentMonth,
          today: day.isToday,
          'has-events': day.events.length > 0,
          'has-completed': day.hasCompleted,
          selected: day.isSelected
        }"
        @click="selectDay(day)"
      >
        <text class="day-number">{{ day.day }}</text>
        <view class="day-events" v-if="day.events.length > 0">
          <view
            v-for="event in day.events.slice(0, 3)"
            :key="event.id"
            class="event-dot"
            :class="[event.type, { completed: event.completed }]"
            @click.stop="openEventDetail(event)"
          />
          <text v-if="day.events.length > 3" class="more-events">+{{ day.events.length - 3 }}</text>
        </view>
      </view>
    </view>

    <!-- 选中日期详情 -->
    <view class="day-detail" v-if="selectedDay && selectedDay.events.length > 0">
      <text class="detail-title">{{ formatDate(selectedDay.date) }} 的安排</text>
      <view class="event-list">
        <view
          v-for="event in selectedDay.events"
          :key="event.id"
          class="event-item"
          :class="[event.type, { completed: event.completed }]"
        >
          <view class="event-icon" :class="event.type"></view>
          <view class="event-info">
            <text class="event-title">{{ event.title }}</text>
            <text class="event-meta">
              {{ event.type === 'practice' ? '练习' : event.type === 'review' ? '复习' : event.type === 'test' ? '测试' : event.type === 'milestone' ? '里程碑' : '其他' }}
              · {{ event.estimatedTime ? event.estimatedTime + '分钟' : '' }}
              {{ event.questionCount ? '· ' + event.questionCount + '题' : '' }}
            </text>
          </view>
          <view class="event-actions">
            <Chip
              v-if="!event.completed"
              label="开始"
              color="blue"
              variant="filled"
              size="small"
              @click="startEvent(event)"
            />
            <Chip
              v-else
              label="已完成"
              color="green"
              variant="filled"
              size="small"
            />
          </view>
        </view>
      </view>
    </view>

    <!-- 底部统计 -->
    <view class="calendar-stats">
      <StatCard label="本月任务" :value="monthlyTotalTasks" icon="📋" icon-bg="#4a6cf7" />
      <StatCard label="已完成" :value="monthlyCompletedTasks" icon="✅" icon-bg="#52c41a" />
      <StatCard label="完成率" :value="monthlyProgress + '%'" icon="📈" icon-bg="#faad14" />
    </view>
  </view>
</template>

<script>
import { ref, computed, onMounted, watch } from 'vue'
import { usePlanStore } from '@/store/plan'
import { useUserStore } from '@/store/user'
import PageHeader from '@/components/ui/PageHeader.vue'
import Chip from '@/components/ui/Chip.vue'
import StatCard from '@/components/ui/StatCard.vue'
import ProgressRing from '@/components/ui/ProgressRing.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import LoadingSkeleton from '@/components/ui/LoadingSkeleton.vue'

export default {
  name: 'CalendarView',
  components: {
    PageHeader,
    Chip,
    StatCard,
    ProgressRing,
    EmptyState,
    LoadingSkeleton
  },
  props: {
    studentId: {
      type: String,
      default: null
    },
    planType: {
      type: String,
      default: 'weekly'
    },
    month: {
      type: String,
      default: ''
    }
  },
  setup(props, { emit }) {
    const planStore = usePlanStore()
    const userStore = useUserStore()

    const currentMonth = ref(props.month ? new Date(props.month + '-01') : new Date())
    const selectedDay = ref(null)
    const isCurrentMonth = computed(() => {
      const now = new Date()
      return currentMonth.value.getMonth() === now.getMonth() && currentMonth.value.getFullYear() === now.getFullYear()
    })
    const isFutureMonth = computed(() => {
      const now = new Date()
      return currentMonth.value > now
    })

    const weekDays = ['日', '一', '二', '三', '四', '五', '六']

    const calendarDays = computed(() => {
      const year = currentMonth.value.getFullYear()
      const month = currentMonth.value.getMonth()
      const firstDay = new Date(year, month, 1)
      const lastDay = new Date(year, month + 1, 0)
      const startDay = firstDay.getDay()
      const daysInMonth = lastDay.getDate()
      const daysInPrevMonth = new Date(year, month, 0).getDate()

      const days = []

      // 上个月的尾部天数
      for (let i = startDay - 1; i >= 0; i--) {
        const day = daysInPrevMonth - i
        const date = new Date(year, month - 1, day)
        days.push({
          day,
          date: date.toISOString().split('T')[0],
          isCurrentMonth: false,
          isToday: false,
          events: [],
          isSelected: false
        })
      }

      // 当前月天数
      const today = new Date()
      const todayStr = today.toISOString().split('T')[0]
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day)
        const dateStr = date.toISOString().split('T')[0]
        days.push({
          day,
          date: dateStr,
          isCurrentMonth: true,
          isToday: dateStr === todayStr,
          events: getEventsForDate(dateStr),
          isSelected: false
        })
      }

      // 下个月的开头天数
      const totalCells = Math.ceil((days.length) / 7) * 7
      const remainingCells = totalCells - days.length
      for (let day = 1; day <= remainingCells; day++) {
        const date = new Date(year, month + 1, day)
        days.push({
          day,
          date: date.toISOString().split('T')[0],
          isCurrentMonth: false,
          isToday: false,
          events: [],
          isSelected: false
        })
      }

      return days
    })

    const getEventsForDate = (dateStr) => {
      // 从 planStore 获取该日期的事件
      if (!planStore.calendarEvents) return []
      return planStore.calendarEvents[dateStr] || []
    }

    const monthlyTotalTasks = computed(() => {
      if (!planStore.calendarEvents) return 0
      let total = 0
      Object.values(planStore.calendarEvents).forEach(events => {
        total += events.length
      })
      return total
    })

    const monthlyCompletedTasks = computed(() => {
      if (!planStore.calendarEvents) return 0
      let completed = 0
      Object.values(planStore.calendarEvents).forEach(events => {
        completed += events.filter(e => e.completed).length
      })
      return completed
    })

    const monthlyProgress = computed(() => {
      const total = monthlyTotalTasks.value
      return total > 0 ? Math.round((monthlyCompletedTasks.value / total) * 100) : 0
    })

    const selectDay = (day) => {
      if (day.isCurrentMonth) {
        selectedDay.value = day
      }
    }

    const prevMonth = () => {
      currentMonth.value = new Date(currentMonth.value.getFullYear(), currentMonth.value.getMonth() - 1, 1)
    }

    const nextMonth = () => {
      if (!isFutureMonth.value) {
        currentMonth.value = new Date(currentMonth.value.getFullYear(), currentMonth.value.getMonth() + 1, 1)
      }
    }

    const formatMonth = (date) => {
      return `${date.getFullYear()}年${date.getMonth() + 1}月`
    }

    const formatDate = (dateStr) => {
      const date = new Date(dateStr)
      return `${date.getMonth() + 1}月${date.getDate()}日 ${['周日','周一','周二','周三','周四','周五','周六'][date.getDay()]}`
    }

    const openEventDetail = (event) => {
      emit('event-click', event)
    }

    const startEvent = (event) => {
      emit('event-start', event)
    }

    onMounted(() => {
      // 加载日历事件数据
      loadCalendarEvents()
    })

    watch(() => currentMonth.value, () => {
      loadCalendarEvents()
    })

    const loadCalendarEvents = async () => {
      try {
        const data = await planStore.loadCalendarEvents(props.studentId || userStore.studentId, props.planType, currentMonth.value.toISOString().split('T')[0].substring(0, 7))
      } catch (e) {
        console.error('[CalendarView] 加载日历事件失败:', e)
      }
    }

    return {
      currentMonth,
      isCurrentMonth,
      isFutureMonth,
      weekDays,
      calendarDays,
      monthlyTotalTasks,
      monthlyCompletedTasks,
      monthlyProgress,
      selectedDay,
      prevMonth,
      nextMonth,
      formatMonth,
      formatDate,
      openEventDetail,
      startEvent
    }
  }
}
</script>

<style scoped>
.calendar-view {
  min-height: 100vh;
  background: var(--color-bg-primary, #f7f8fa);
  display: flex;
  flex-direction: column;
}

.calendar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  background: #fff;
  border-bottom: 1px solid var(--color-border, #e8e8f0);
}

.month-title {
  font-size: 18px;
  font-weight: 600;
  color: #1a1a2e;
}

.week-header {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  padding: 12px 16px;
  background: var(--color-bg-secondary, #f0f0f5);
  font-size: 12px;
  color: #999;
  font-weight: 500;
}

.week-day {
  text-align: center;
}

.days-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 1px;
  background: var(--color-border, #e8e8f0);
  padding: 1px 16px 16px;
}

.day-cell {
  aspect-ratio: 1;
  background: #fff;
  border-radius: 8px;
  padding: 8px 4px;
  display: flex;
  flex-direction: column;
  min-height: 80px;
  transition: all var(--transition-fast);
}

.day-cell.other-month {
  opacity: 0.4;
  background: #fafafa;
}

.day-cell.today {
  border: 2px solid #4a6cf7;
  background: #f0f4ff;
}

.day-cell.has-events {
  background: #f0f4ff;
}

.day-cell.has-completed {
  background: #f6ffed;
}

.day-cell.selected {
  box-shadow: 0 0 0 2px #4a6cf7;
}

.day-number {
  font-size: 14px;
  font-weight: 500;
  color: #333;
  text-align: center;
  margin-bottom: 4px;
}

.day-cell.other-month .day-number {
  color: #ccc;
}

.day-cell.today .day-number {
  color: #4a6cf7;
  font-weight: 700;
}

.day-events {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  justify-content: center;
}

.event-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.event-dot.practice { background: #4a6cf7; }
.event-dot.review { background: #faad14; }
.event-dot.test { background: #ff4d4f; }
.event-dot.milestone { background: #722ed1; }
.event-dot.suggestion { background: #52c41a; }

.event-dot.completed {
  opacity: 0.5;
}

.more-events {
  font-size: 9px;
  color: #999;
  margin-top: 2px;
}

/* 选中日期详情 */
.day-detail {
  margin: 16px;
  padding: 16px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  border: 1px solid var(--color-border, #e8e8f0);
  animation: slideDown 0.3s ease;
}

@keyframes slideDown {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

.detail-title {
  display: block;
  font-size: 15px;
  font-weight: 600;
  color: #1a1a2e;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border, #e8e8f0);
}

.event-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.event-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 10px;
  border: 1px solid var(--color-border, #e8e8f0);
}

.event-item.practice { border-left: 3px solid #4a6cf7; }
.event-item.review { border-left: 3px solid #faad14; }
.event-item.test { border-left: 3px solid #ff4d4f; }
.event-item.milestone { border-left: 3px solid #722ed1; }
.event-item.suggestion { border-left: 3px solid #52c41a; }

.event-item.completed {
  opacity: 0.7;
  background: #f6ffed;
  border-left-color: #52c41a;
}

.event-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  flex-shrink: 0;
}

.event-item.practice .event-icon { background: rgba(74, 108, 247, 0.1); color: #4a6cf7; }
.event-item.review .event-icon { background: rgba(250, 173, 20, 0.1); color: #faad14; }
.event-item.test .event-icon { background: rgba(255, 77, 79, 0.1); color: #ff4d4f; }
.event-item.milestone .event-icon { background: rgba(114, 46, 209, 0.1); color: #722ed1; }
.event-item.suggestion .event-icon { background: rgba(82, 196, 26, 0.1); color: #52c41a; }

.event-info {
  flex: 1;
  min-width: 0;
}

.event-title {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: #1a1a2e;
  margin-bottom: 2px;
}

.event-meta {
  display: block;
  font-size: 11px;
  color: #999;
}

.event-actions {
  flex-shrink: 0;
}

/* 统计卡片 */
.calendar-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  padding: 16px;
  margin-top: auto;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .day-cell {
    background: var(--color-bg-card, #252542);
  }

  .day-cell.other-month {
    background: var(--color-bg-elevated, #2d2d4a);
  }

  .day-cell.today {
    background: rgba(74, 108, 247, 0.15);
    border-color: #7c94ff;
  }

  .day-cell.has-events {
    background: rgba(74, 108, 247, 0.1);
  }

  .day-cell.has-completed {
    background: rgba(82, 196, 26, 0.1);
  }

  .event-item {
    background: var(--color-bg-elevated, #2d2d4a);
    border-color: var(--color-border, #3d3d5c);
  }

  .event-item.completed {
    background: rgba(82, 196, 26, 0.1);
  }

  .day-detail {
    background: var(--color-bg-card, #252542);
    border-color: var(--color-border, #3d3d5c);
  }

  .detail-title {
    color: var(--color-text-primary, #e8e8f0);
    border-color: var(--color-border, #3d3d5c);
  }

  .event-title {
    color: var(--color-text-primary, #e8e8f0);
  }
}
</style>