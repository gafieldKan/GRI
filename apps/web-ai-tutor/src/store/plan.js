/**
 * 学习计划状态管理 (Pinia Store)
 * 管理日/周/月计划、任务进度、计划生成
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getPlans, generatePlan, getPlanCalendar, getParentReport, completePlanTask, updatePlanProgress } from '@/api/index.js'
import { useUserStore } from './user.js'

// 学生业务主键统一从 user store 解出（登录态），不再硬编码 student_001
function currentStudentId() {
  return useUserStore().studentId
}

export const usePlanStore = defineStore('plan', () => {
  // ─── State ───
  const plans = ref([])
  const currentPlan = ref(null)
  const currentPlanType = ref('daily') // 'daily' | 'weekly' | 'monthly'
  const loading = ref(false)
  const error = ref(null)

  // ─── Getters ───
  const currentPlanData = computed(() => currentPlan.value?.plan || null)
  const dailyPlan = computed(() => plans.value.find(p => p.plan_type === 'daily' && p.status !== 'archived') || null)
  const weeklyPlan = computed(() => plans.value.find(p => p.plan_type === 'weekly' && p.status !== 'archived') || null)
  const monthlyPlan = computed(() => plans.value.find(p => p.plan_type === 'monthly' && p.status !== 'archived') || null)

  // 个性化学习计划（agent plan.generate 生成，plan_type='personalized'）
  const personalizedPlans = computed(() => plans.value.filter(p => p.plan_type === 'personalized'))

  const dailyTasks = computed(() => {
    if (!dailyPlan.value?.plan_data) return []
    return dailyPlan.value.plan_data.tasks || []
  })

  const weeklyTasks = computed(() => {
    if (!weeklyPlan.value?.plan_data) return []
    return weeklyPlan.value.plan_data.weeklyTasks || []
  })

  const monthlyFocus = computed(() => {
    if (!monthlyPlan.value?.plan_data) return []
    return monthlyPlan.value.plan_data.weeklyFocus || []
  })

  const dailyProgress = computed(() => {
    if (!dailyPlan.value) return 0
    return Number(dailyPlan.value.progress) || 0
  })

  const weeklyProgress = computed(() => {
    if (!weeklyPlan.value) return 0
    return Number(weeklyPlan.value.progress) || 0
  })

  const monthlyProgress = computed(() => {
    if (!monthlyPlan.value) return 0
    return Number(monthlyPlan.value.progress) || 0
  })

  // 日历事件缓存
  const calendarEvents = ref({})
  const calendarLoading = ref(false)
  const calendarError = ref(null)

  const completedDailyTasks = computed(() => dailyTasks.value.filter(t => t.completed))
  const pendingDailyTasks = computed(() => dailyTasks.value.filter(t => !t.completed))

  const completedWeeklyTasks = computed(() =>
    weeklyTasks.value.reduce((sum, day) => sum + (day.tasks || []).filter(t => t.completed).length, 0)
  )
  const totalWeeklyTasks = computed(() =>
    weeklyTasks.value.reduce((sum, day) => sum + (day.tasks || []).length, 0)
  )

  // ─── Actions ───
  async function loadPlans(studentId = currentStudentId()) {
    loading.value = true
    error.value = null
    try {
      const data = await getPlans(studentId)
      // 后端 /api/tuition/plans 直接返回数组（getLearningPlans → res.rows）；兼容 {plans:[…]} 形态。
      plans.value = Array.isArray(data) ? data : (data?.plans || [])
    } catch (e) {
      error.value = e.message
      console.error('[PlanStore] Load plans failed:', e)
    } finally {
      loading.value = false
    }
  }

  async function loadCalendarEvents(studentId, planType, month) {
    calendarLoading.value = true
    calendarError.value = null
    try {
      const data = await getPlanCalendar(studentId, planType, month)
      if (data?.events) {
        calendarEvents.value = {}
        data.events.forEach(event => {
          if (!calendarEvents.value[event.date]) {
            calendarEvents.value[event.date] = []
          }
          calendarEvents.value[event.date].push(event)
        })
      }
    } catch (e) {
      calendarError.value = e.message
      console.error('[PlanStore] Load calendar events failed:', e)
    } finally {
      calendarLoading.value = false
    }
  }

  async function generatePlanAction(planType, options = {}) {
    loading.value = true
    error.value = null
    try {
      const data = await generatePlan({
        studentId: currentStudentId(),
        planType,
        startDate: options.startDate || new Date().toISOString().split('T')[0],
        endDate: options.endDate,
        subjects: options.subjects
      })
      if (data.success) {
        // 重新加载计划列表
        await loadPlans(currentStudentId())
        return data
      }
      throw new Error(data.error || '生成计划失败')
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function updateProgress(planId, completedTaskIds) {
    try {
      // 真实落库：后端按 id 在 plan_data 标记 completed 并重算 progress，返回更新后的整行。
      const res = await updatePlanProgress(planId, completedTaskIds)
      if (res && res.success && res.plan) {
        const idx = plans.value.findIndex(p => p.id === planId)
        if (idx >= 0) plans.value[idx] = { ...res.plan }
        if (currentPlan.value?.id === planId && idx >= 0) currentPlan.value = plans.value[idx]
      }
      return res
    } catch (e) {
      console.error('[PlanStore] Update progress failed:', e)
      return { success: false }
    }
  }

  function setCurrentPlan(plan) {
    currentPlan.value = plan
  }

  function setPlanType(type) {
    currentPlanType.value = type
    if (type === 'daily') currentPlan.value = dailyPlan.value
    else if (type === 'weekly') currentPlan.value = weeklyPlan.value
    else if (type === 'monthly') currentPlan.value = monthlyPlan.value
  }

  // 完成个性化学习计划的一条任务（真实 plan.complete 落库 → 回灌掌握度/消错题）。以服务端返回为准刷新本地。
  async function completePersonalizedPlanTask(planId, taskIndex, correct = true) {
    const res = await completePlanTask(planId, taskIndex, correct)
    if (res && res.success) {
      const plan = plans.value.find(p => p.id === planId)
      if (plan && res.completedTasks != null) {
        plan.completed_tasks = res.completedTasks
        plan.progress = res.progress != null ? res.progress : plan.progress
        if (res.status) plan.status = res.status
        if (res.taskIndex != null && Array.isArray(plan.plan_data?.tasks)) {
          const t = plan.plan_data.tasks[res.taskIndex]
          if (t) { t.completed = true; if (res.taskTitle) t.title = res.taskTitle }
        }
      }
    } else {
      throw new Error((res && res.reason) || '完成任务失败')
    }
    return res
  }

  function toggleTaskComplete(planId, taskId, completed) {
    const plan = plans.value.find(p => p.id === planId)
    if (!plan || !plan.plan_data) return

    // 处理不同类型计划的任务结构
    const findAndUpdate = (tasks) => {
      for (const task of tasks) {
        if (task.id === taskId) {
          task.completed = completed
          return true
        }
        // 处理嵌套任务（周计划）
        if (task.tasks) {
          for (const subtask of task.tasks) {
            if (subtask.id === taskId) {
              subtask.completed = completed
              return true
            }
          }
        }
      }
      return false
    }

    if (plan.plan_data.tasks) {
      findAndUpdate(plan.plan_data.tasks)
    }
    if (plan.plan_data.weeklyTasks) {
      for (const day of plan.plan_data.weeklyTasks) {
        if (day.tasks) findAndUpdate(day.tasks)
      }
    }

    // 更新进度
    const allTasks = getAllTasks(plan)
    const completedCount = allTasks.filter(t => t.completed).length
    plan.completed_tasks = completedCount
    plan.progress = allTasks.length > 0 ? (completedCount / allTasks.length) * 100 : 0
  }

  function getAllTasks(plan) {
    const tasks = []
    if (plan?.plan_data?.tasks) {
      tasks.push(...plan.plan_data.tasks)
    }
    if (plan?.plan_data?.weeklyTasks) {
      for (const day of plan.plan_data.weeklyTasks) {
        if (day.tasks) tasks.push(...day.tasks)
      }
    }
    return tasks
  }

  function formatTime(minutes) {
    if (!minutes) return '0分钟'
    if (minutes < 60) return `${minutes}分钟`
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return mins > 0 ? `${hours}小时${mins}分钟` : `${hours}小时`
  }

  function getPriorityColor(priority) {
    return priority === 'high' ? '#ff4d4f' : priority === 'medium' ? '#faad14' : '#52c41a'
  }

  function getPriorityLabel(priority) {
    return priority === 'high' ? '高' : priority === 'medium' ? '中' : '低'
  }

  function formatDate(dateStr) {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return `${date.getMonth() + 1}月${date.getDate()}日`
  }

  function reset() {
    plans.value = []
    currentPlan.value = null
    currentPlanType.value = 'daily'
    loading.value = false
    error.value = null
  }

  return {
    // State
    plans,
    currentPlan,
    currentPlanType,
    loading,
    error,
    calendarEvents,
    calendarLoading,
    calendarError,

    // Getters
    currentPlanData,
    dailyPlan,
    weeklyPlan,
    monthlyPlan,
    personalizedPlans,
    dailyTasks,
    weeklyTasks,
    monthlyFocus,
    dailyProgress,
    weeklyProgress,
    monthlyProgress,
    completedDailyTasks,
    pendingDailyTasks,
    completedWeeklyTasks,
    totalWeeklyTasks,

    // Actions
    loadPlans,
    loadCalendarEvents,
    generatePlan: generatePlanAction,
    updateProgress,
    setCurrentPlan,
    setPlanType,
    toggleTaskComplete,
    completePersonalizedPlanTask,
    formatTime,
    getPriorityColor,
    getPriorityLabel,
    formatDate,
    reset
  }
})

// 持久化配置
usePlanStore.persist = {
  key: 'gri-plan',
  storage: {
    getItem: (key) => {
      try {
        return uni.getStorageSync(key)
      } catch (e) {
        return null
      }
    },
    setItem: (key, value) => {
      try {
        uni.setStorageSync(key, value)
      } catch (e) {
        console.error('plan store persist failed:', e)
      }
    }
  },
  paths: [
    'currentPlanType'
  ]
}

export default usePlanStore