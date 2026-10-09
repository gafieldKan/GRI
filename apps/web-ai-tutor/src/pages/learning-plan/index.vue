<template>
  <ErrorBoundary :showDetails="true" :logError="true">
    <view class="page">
      <PageHeader
        title="学习计划"
        subtitle="科学规划，高效执行"
        :actions="[{ label: '生成计划', handler: showGenerateDialog }]"
      />

      <!-- 计划类型切换 -->
      <view class="plan-tabs">
        <view
          v-for="tab in planTabs"
          :key="tab.key"
          class="plan-tab"
          :class="{ active: planStore.currentPlanType === tab.key }"
          @click="planStore.setPlanType(tab.key)"
        >
          <text class="tab-icon">{{ tab.icon }}</text>
          <text class="tab-label">{{ tab.label }}</text>
          <view v-if="getProgress(tab.key) > 0" class="tab-progress">
            <ProgressRing
              :value="getProgress(tab.key)"
              :max="100"
              :size="32"
              :stroke-width="3"
              :color="getProgressColor(getProgress(tab.key))"
            />
          </view>
        </view>
      </view>

      <!-- 加载中 -->
      <LoadingSkeleton v-if="planStore.loading" variant="list" rows="5" />

      <!-- 日历视图 -->
      <view v-else-if="planStore.currentPlanType === 'calendar'" class="plan-content">
        <CalendarView :studentId="userStore.studentId" />
      </view>

      <!-- 日计划 -->
      <view v-else-if="planStore.currentPlanType === 'daily'" class="plan-content">
        <EmptyState
          v-if="!planStore.dailyPlan"
          title="暂无日计划"
          description="点击右上角生成今日计划"
          icon="📅"
          :actions="[{ label: '生成计划', handler: showGenerateDialog }]"
        />

        <view v-else class="daily-plan">
          <!-- 进度概览 -->
          <view class="progress-overview">
            <view class="progress-ring-wrapper">
              <ProgressRing
                :value="planStore.dailyProgress"
                :max="100"
                :size="80"
                :stroke-width="8"
                :color="getProgressColor(planStore.dailyProgress)"
                :gradient="true"
                :gradient-colors="['#4a6cf7', '#7c94ff']"
              />
              <view class="progress-center">
                <text class="progress-percent">{{ Math.round(planStore.dailyProgress) }}%</text>
                <text class="progress-text">{{ planStore.completedDailyTasks.length }} / {{ planStore.dailyTasks.length }} 任务</text>
              </view>
            </view>
            <view class="progress-stats">
              <StatCard label="预计用时" :value="formatTotalTime(planStore.dailyTasks)" icon="⏱" icon-bg="#4a6cf7" />
              <StatCard label="已完成" :value="planStore.completedDailyTasks.length" icon="✅" icon-bg="#52c41a" />
              <StatCard label="待完成" :value="planStore.pendingDailyTasks.length" icon="📋" icon-bg="#faad14" />
            </view>
          </view>

          <!-- 任务列表 -->
          <view class="tasks-section">
            <view class="section-header">
              <text class="section-title">今日任务</text>
              <view class="section-actions">
                <Chip label="全部完成" color="green" variant="soft" size="small" @click="completeAllDaily" :disabled="planStore.pendingDailyTasks.length === 0" />
              </view>
            </view>

            <view class="task-list">
              <view
                v-for="task in planStore.dailyTasks"
                :key="task.id"
                class="task-item"
                :class="{ completed: task.completed }"
              >
                <view class="task-checkbox-wrapper">
                  <checkbox
                    :checked="task.completed"
                    @change="() => toggleTask(task, planStore.dailyPlan.id)"
                    class="task-checkbox"
                  />
                </view>
                <view class="task-content">
                  <view class="task-header">
                    <text class="task-title">{{ task.title }}</text>
                    <Chip
                      v-if="task.priority"
                      :label="getPriorityLabel(task.priority)"
                      :color="getPriorityColor(task.priority)"
                      variant="soft"
                      size="small"
                    />
                  </view>
                  <text v-if="task.description" class="task-desc">{{ task.description }}</text>
                  <view class="task-meta">
                    <text class="task-time">{{ formatTime(task.estimatedTime) }}</text>
                    <text class="task-type">{{ task.type === 'practice' ? '练习' : task.type === 'review' ? '复习' : task.type === 'test' ? '测试' : '建议' }}</text>
                    <text v-if="task.knowledgePoints" class="task-kps">{{ task.knowledgePoints.join('、') }}</text>
                  </view>
                </view>
              </view>
            </view>

            <!-- 练习题目预览 -->
            <view class="questions-preview" v-if="planStore.dailyPlan?.plan_data?.practiceQuestions?.length">
              <text class="section-title">推荐练习题</text>
              <view class="question-cards">
                <view
                  v-for="q in planStore.dailyPlan.plan_data.practiceQuestions.slice(0, 3)"
                  :key="q.id"
                  class="question-card"
                >
                  <rich-text :nodes="q.content" class="q-content" />
                  <view class="q-meta">
                    <Chip :label="q.type === 'choice' ? '单选' : '填空'" color="blue" variant="soft" size="small" />
                    <text class="q-difficulty">难度 {{ '⭐'.repeat(q.difficulty || 1) }}</text>
                  </view>
                </view>
              </view>
            </view>
          </view>
        </view>
      </view>

      <!-- 周计划 -->
      <view v-else-if="planStore.currentPlanType === 'weekly'" class="plan-content">
        <EmptyState
          v-if="!planStore.weeklyPlan"
          title="暂无周计划"
          description="生成本周计划，合理安排每日任务"
          icon="📅"
          :actions="[{ label: '生成计划', handler: showGenerateDialog }]"
        />

        <view v-else class="weekly-plan">
          <view class="progress-overview">
            <view class="progress-ring-wrapper">
              <ProgressRing
                :value="planStore.weeklyProgress"
                :max="100"
                :size="80"
                :stroke-width="8"
                :color="getProgressColor(planStore.weeklyProgress)"
                :gradient="true"
                :gradient-colors="['#faad14', '#ffc53d']"
              />
              <view class="progress-center">
                <text class="progress-percent">{{ Math.round(planStore.weeklyProgress) }}%</text>
                <text class="progress-text">{{ planStore.completedWeeklyTasks }} / {{ planStore.totalWeeklyTasks }} 任务</text>
              </view>
            </view>
          </view>

          <view class="weekly-days">
            <view
              v-for="(day, index) in planStore.weeklyTasks"
              :key="index"
              class="day-card"
            >
              <view class="day-header">
                <text class="day-name">{{ day.day }}</text>
                <text class="day-date">{{ formatDate(day.date) }}</text>
              </view>
              <view class="day-tasks">
                <view
                  v-for="task in day.tasks"
                  :key="task.id"
                  class="day-task"
                  :class="{ completed: task.completed }"
                >
                  <checkbox
                    :checked="task.completed"
                    @change="() => toggleWeeklyTask(day, task)"
                    class="day-checkbox"
                  />
                  <view class="day-task-info">
                    <text class="day-task-title">{{ task.title }}</text>
                    <text class="day-task-meta">{{ task.questionCount || '' }}题 · {{ formatTime(task.estimatedTime) }}</text>
                  </view>
                </view>
              </view>
            </view>
          </view>
        </view>
      </view>

      <!-- 月计划 -->
      <view v-else-if="planStore.currentPlanType === 'monthly'" class="plan-content">
        <EmptyState
          v-if="!planStore.monthlyPlan"
          title="暂无月计划"
          description="制定月度目标，系统化提升"
          icon="📅"
          :actions="[{ label: '生成计划', handler: showGenerateDialog }]"
        />

        <view v-else class="monthly-plan">
          <view class="progress-overview">
            <view class="progress-ring-wrapper">
              <ProgressRing
                :value="planStore.monthlyProgress"
                :max="100"
                :size="80"
                :stroke-width="8"
                :color="getProgressColor(planStore.monthlyProgress)"
                :gradient="true"
                :gradient-colors="['#722ed1', '#9254de']"
              />
              <view class="progress-center">
                <text class="progress-percent">{{ Math.round(planStore.monthlyProgress) }}%</text>
                <text class="progress-text">月度进度</text>
              </view>
            </view>
          </view>

          <!-- 月度目标 -->
          <view class="monthly-goals" v-if="planStore.monthlyPlan?.plan_data?.monthlyGoals">
            <text class="section-title">🎯 月度目标</text>
            <view class="goals-list">
              <view v-for="(goal, index) in planStore.monthlyPlan.plan_data.monthlyGoals" :key="index" class="goal-item">
                <text class="goal-index">{{ index + 1 }}.</text>
                <text class="goal-text">{{ goal }}</text>
              </view>
            </view>
          </view>

          <!-- 周重点 -->
          <view class="weekly-focus" v-if="planStore.monthlyFocus.length">
            <text class="section-title">📅 每周重点</text>
            <view class="focus-weeks">
              <view v-for="(week, index) in planStore.monthlyFocus" :key="index" class="focus-week">
                <view class="week-header">
                  <text class="week-name">{{ week.week }}</text>
                  <text class="week-focus">{{ week.focusPoint }}</text>
                </view>
                <view class="week-goals">
                  <view v-for="(goal, gIndex) in week.goals" :key="gIndex" class="week-goal">
                    <text class="goal-bullet">•</text>
                    <text class="goal-text">{{ goal }}</text>
                  </view>
                </view>
              </view>
            </view>
          </view>

          <!-- 里程碑测试 -->
          <view class="milestones" v-if="planStore.monthlyPlan?.plan_data?.milestoneTests">
            <text class="section-title">📝 里程碑测试</text>
            <view class="milestone-list">
              <view v-for="m in planStore.monthlyPlan.plan_data.milestoneTests" :key="m.week" class="milestone-item">
                <text class="milestone-week">{{ m.week }}</text>
                <text class="milestone-type">{{ m.type }}</text>
                <Chip label="准备中" color="blue" variant="soft" size="small" />
              </view>
            </view>
          </view>
        </view>
      </view>

      <!-- 我的 AI 个性化计划（agent plan.generate 生成；完成走 plan.complete 落库回灌） -->
      <view v-if="activePersonalizedPlans.length" class="plan-content personalized-section">
        <view class="section-header">
          <text class="section-title">🤖 我的 AI 个性化计划</text>
          <Chip label="AI 生成" color="purple" variant="soft" size="small" />
        </view>
        <view v-for="plan in activePersonalizedPlans" :key="plan.id" class="personalized-card">
          <view class="personalized-head">
            <text class="personalized-title">{{ plan.title }}</text>
            <Chip
              :label="plan.status === 'completed' ? '✅ 已完成' : '进行中'"
              :color="plan.status === 'completed' ? 'green' : 'blue'"
              variant="soft"
              size="small"
            />
          </view>
          <view class="personalized-progress">
            <view class="personalized-ring">
              <ProgressRing
                :value="plan.progress || 0"
                :max="100"
                :size="56"
                :stroke-width="6"
                :color="getProgressColor(plan.progress || 0)"
                :gradient="true"
                :gradient-colors="['#7c4df7', '#a06bff']"
              />
              <view class="progress-center">
                <text class="progress-percent">{{ Math.round(plan.progress || 0) }}%</text>
                <text class="progress-text">{{ plan.completed_tasks || 0 }} / {{ plan.total_tasks || (plan.plan_data?.tasks || []).length }} 任务</text>
              </view>
            </view>
          </view>
          <view class="task-list">
            <view
              v-for="(task, idx) in (plan.plan_data?.tasks || [])"
              :key="idx"
              class="task-item"
              :class="{ completed: task.completed }"
            >
              <view class="task-checkbox-wrapper">
                <checkbox
                  :checked="task.completed"
                  :disabled="task.completed || completingTask"
                  @change="() => completePersonalizedTask(plan, idx)"
                  class="task-checkbox"
                />
              </view>
              <view class="task-content">
                <view class="task-header">
                  <text class="task-title">{{ task.title || task.kpName }}</text>
                </view>
                <text v-if="task.kpName" class="task-desc">知识点：{{ task.kpName }}</text>
              </view>
            </view>
          </view>
        </view>
      </view>

      <!-- 生成计划弹窗 -->
      <view class="generate-modal" v-if="showGenerateModal">
        <view class="modal-overlay" @click="showGenerateModal = false"></view>
        <view class="modal-panel">
          <view class="modal-header">
            <text class="modal-title">生成学习计划</text>
            <text class="modal-close" @click="showGenerateModal = false">✕</text>
          </view>

          <view class="modal-body">
            <view class="modal-option">
              <text class="option-label">计划类型</text>
              <view class="option-tabs">
                <Chip
                  v-for="tab in generateTabs"
                  :key="tab.key"
                  :label="`${tab.icon} ${tab.label}`"
                  :variant="generateForm.type === tab.key ? 'filled' : 'outlined'"
                  :color="tab.key === 'daily' ? 'blue' : tab.key === 'weekly' ? 'orange' : 'purple'"
                  @click="generateForm.type = tab.key"
                />
              </view>
            </view>

            <view class="modal-option">
              <text class="option-label">开始日期</text>
              <input class="date-input" v-model="generateForm.startDate" type="date" />
            </view>

            <view class="modal-option" v-if="generateForm.type !== 'daily'">
              <text class="option-label">结束日期</text>
              <input class="date-input" v-model="generateForm.endDate" type="date" />
            </view>

            <view class="modal-option">
              <text class="option-label">侧重学科</text>
              <view class="subject-chips">
                <Chip
                  v-for="sub in subjects"
                  :key="sub.id"
                  :label="`${sub.icon} ${sub.name}`"
                  :variant="generateForm.subjects.includes(sub.id) ? 'filled' : 'outlined'"
                  :color="sub.id"
                  size="small"
                  @click="toggleSubject(sub.id)"
                />
              </view>
            </view>
          </view>

          <view class="modal-footer">
            <Chip label="取消" color="gray" variant="outlined" size="large" @click="showGenerateModal = false" />
            <Chip
              :label="planStore.loading ? '生成中...' : '生成计划'"
              color="blue"
              variant="filled"
              size="large"
              @click="generatePlan"
              :disabled="planStore.loading"
            />
          </view>
        </view>
      </view>

      <view class="safe-area" />
    </view>
  </ErrorBoundary>
</template>

<script>
import { ref, computed, onMounted } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { usePlanStore } from '@/store/plan'
import { useUserStore } from '@/store/user'
import { listSubjects } from '@/api/index.js'
import PageHeader from '@/components/ui/PageHeader.vue'
import Chip from '@/components/ui/Chip.vue'
import StatCard from '@/components/ui/StatCard.vue'
import ProgressRing from '@/components/ui/ProgressRing.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import LoadingSkeleton from '@/components/ui/LoadingSkeleton.vue'
import CalendarView from '@/components/CalendarView.vue'

export default {
  name: 'LearningPlan',
  components: {
    PageHeader,
    Chip,
    StatCard,
    ProgressRing,
    EmptyState,
    LoadingSkeleton
  },
  setup() {
    const planStore = usePlanStore()
    const userStore = useUserStore()

    const showGenerateModal = ref(false)
    const generateForm = ref({
      type: 'daily',
      startDate: new Date().toISOString().split('T')[0],
      endDate: '',
      subjects: []
    })

    const planTabs = [
      { key: 'daily', label: '日计划', icon: '📅' },
      { key: 'weekly', label: '周计划', icon: '📊' },
      { key: 'monthly', label: '月计划', icon: '🗓' },
      { key: 'calendar', label: '日历', icon: '📅' }
    ]

    // 生成弹窗只允许日/周/月（calendar 非可生成类型，避免落库类型错乱）
    const generateTabs = planTabs.filter(t => t.key !== 'calendar')

    // 学科取自真实数据（DB code 大写 → 小写 id），与练习中心一致
    const subjects = ref([])
    const SUBJECT_ICONS = { math: '📐', phys: '⚡', chem: '🧪', bio: '🧬', eng: '📖', chn: '📝' }
    const loadSubjects = async () => {
      try {
        const list = await listSubjects()
        const arr = Array.isArray(list) ? list : (list?.subjects || [])
        subjects.value = arr.map(s => {
          const id = String(s.code || s.id || '').toLowerCase()
          return { id, name: s.name || id, icon: SUBJECT_ICONS[id] || '📘' }
        })
      } catch (e) {
        subjects.value = [
          { id: 'math', name: '数学', icon: '📐' },
          { id: 'phys', name: '物理', icon: '⚡' },
          { id: 'chem', name: '化学', icon: '🧪' },
          { id: 'bio', name: '生物', icon: '🧬' },
          { id: 'eng', name: '英语', icon: '📖' },
          { id: 'chn', name: '语文', icon: '📝' }
        ]
      }
    }

    const getProgress = (type) => {
      if (type === 'daily') return planStore.dailyProgress
      if (type === 'weekly') return planStore.weeklyProgress
      if (type === 'monthly') return planStore.monthlyProgress
      return 0
    }

    const getProgressColor = (progress) => {
      if (progress >= 80) return '#52c41a'
      if (progress >= 50) return '#faad14'
      return '#4a6cf7'
    }

    const showGenerateDialog = () => {
      const t = planStore.currentPlanType
      generateForm.value = {
        type: ['daily', 'weekly', 'monthly'].includes(t) ? t : 'daily',
        startDate: new Date().toISOString().split('T')[0],
        endDate: '',
        subjects: []
      }
      showGenerateModal.value = true
    }

    const generatePlan = async () => {
      const startDate = generateForm.value.startDate
      let endDate = generateForm.value.endDate

      if (generateForm.value.type === 'weekly') {
        const start = new Date(startDate)
        const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000)
        endDate = end.toISOString().split('T')[0]
      } else if (generateForm.value.type === 'monthly') {
        const start = new Date(startDate)
        const end = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000)
        endDate = end.toISOString().split('T')[0]
      }

      const subjectNames = generateForm.value.subjects
        .map(id => subjects.value.find(s => s.id === id)?.name)
        .filter(Boolean)

      try {
        await planStore.generatePlan(generateForm.value.type, { startDate, endDate, subjects: subjectNames })
        showGenerateModal.value = false
        uni.showToast({ title: '计划生成成功', icon: 'success' })
      } catch (e) {
        uni.showToast({ title: e.message || '生成失败', icon: 'none' })
      }
    }

    const toggleSubject = (subjectId) => {
      const idx = generateForm.value.subjects.indexOf(subjectId)
      if (idx >= 0) {
        if (generateForm.value.subjects.length > 1) {
          generateForm.value.subjects.splice(idx, 1)
        }
      } else {
        generateForm.value.subjects.push(subjectId)
      }
    }

    // 勾选任务 → 收集“已完成任务 id”集合 → 落库（后端按 id 在 plan_data 标记 completed 并重算进度，写回 JSONB）
    const toggleTask = async (task, planId) => {
      if (!planId || !planStore.dailyPlan) return
      task.completed = !task.completed
      const ids = (planStore.dailyPlan.plan_data?.tasks || []).filter(t => t.completed).map(t => t.id)
      try {
        await planStore.updateProgress(planId, ids)
      } catch (e) {
        uni.showToast({ title: '同步失败，请重试', icon: 'none' })
      }
    }

    const toggleWeeklyTask = async (day, task) => {
      const plan = planStore.weeklyPlan
      if (!plan) return
      task.completed = !task.completed
      const ids = []
      for (const d of (plan.plan_data?.weeklyTasks || [])) {
        for (const t of (d.tasks || [])) if (t.completed) ids.push(t.id)
      }
      try {
        await planStore.updateProgress(plan.id, ids)
      } catch (e) {
        uni.showToast({ title: '同步失败，请重试', icon: 'none' })
      }
    }

    const completeAllDaily = async () => {
      const plan = planStore.dailyPlan
      if (!plan) return
      const ids = (plan.plan_data?.tasks || []).map(t => t.id)
      try {
        await planStore.updateProgress(plan.id, ids)
      } catch (e) {
        uni.showToast({ title: '同步失败，请重试', icon: 'none' })
      }
    }

    const completingTask = ref(false)
    const activePersonalizedPlans = computed(() =>
      planStore.personalizedPlans.filter(p => p.status !== 'archived')
    )
    // 完成个性化计划的一条任务：真实 plan.complete 落库（回灌掌握度/消错题），随后与后端对齐。
    const completePersonalizedTask = async (plan, taskIndex) => {
      if (completingTask.value) return
      completingTask.value = true
      try {
        const res = await planStore.completePersonalizedPlanTask(plan.id, taskIndex, true)
        uni.showToast({ title: res?.isComplete ? '整份个性化计划已完成！' : '任务完成，掌握度已更新', icon: 'none' })
        await planStore.loadPlans()
      } catch (e) {
        uni.showToast({ title: (e && e.message) || '完成失败', icon: 'none' })
      } finally {
        completingTask.value = false
      }
    }

    const formatTime = (minutes) => {
      if (!minutes) return '0分钟'
      if (minutes < 60) return `${minutes}分钟`
      const hours = Math.floor(minutes / 60)
      const mins = minutes % 60
      return mins > 0 ? `${hours}小时${mins}分钟` : `${hours}小时`
    }

    const formatTotalTime = (tasks) => {
      const total = tasks.reduce((sum, t) => sum + (t.estimatedTime || 0), 0)
      return formatTime(total)
    }

    const getPriorityColor = (priority) => {
      return priority === 'high' ? '#ff4d4f' : priority === 'medium' ? '#faad14' : '#52c41a'
    }

    const getPriorityLabel = (priority) => {
      return priority === 'high' ? '高' : priority === 'medium' ? '中' : '低'
    }

    const formatDate = (dateStr) => {
      if (!dateStr) return ''
      const date = new Date(dateStr)
      return `${date.getMonth() + 1}月${date.getDate()}日`
    }

    onMounted(() => {
      loadSubjects()
      planStore.loadPlans()
    })

    onShow(() => {
      planStore.loadPlans()
    })

    return {
      planStore,
      userStore,
      showGenerateModal,
      generateForm,
      planTabs,
      generateTabs,
      subjects,
      getProgress,
      getProgressColor,
      showGenerateDialog,
      generatePlan,
      toggleSubject,
      toggleTask,
      toggleWeeklyTask,
      completeAllDaily,
      completingTask,
      activePersonalizedPlans,
      completePersonalizedTask,
      formatTime,
      formatTotalTime,
      getPriorityColor,
      getPriorityLabel,
      formatDate
    }
  }
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: var(--color-bg-primary, #f7f8fa);
  display: flex;
  flex-direction: column;
}

/* 计划类型标签 */
.plan-tabs {
  display: flex;
  padding: 0 16px 8px;
  border-bottom: 1px solid var(--color-border, #e8e8f0);
  background: var(--color-bg-primary, #f7f8fa);
  position: sticky;
  top: 0;
  z-index: 10;
}

.plan-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 8px;
  cursor: pointer;
  transition: all var(--transition-fast);
  border-bottom: 2px solid transparent;
}

.plan-tab.active {
  border-bottom-color: var(--color-primary, #4a6cf7);
}

.plan-tab.active .tab-label {
  color: var(--color-primary, #4a6cf7);
  font-weight: 600;
}

.tab-icon {
  font-size: 20px;
}

.tab-label {
  font-size: 13px;
  color: #999;
  font-weight: 500;
}

.tab-progress {
  margin-top: 4px;
}

/* 计划内容 */
.plan-content {
  flex: 1;
  padding-bottom: 40px;
  overflow-y: auto;
}

/* 进度概览 */
.progress-overview {
  padding: 20px 16px;
  display: flex;
  align-items: center;
  gap: 16px;
}

.progress-ring-wrapper {
  position: relative;
  width: 80px;
  height: 80px;
  flex-shrink: 0;
}

.progress-center {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
}

.progress-percent {
  display: block;
  font-size: 18px;
  font-weight: 700;
  color: #1a1a2e;
}

.progress-text {
  display: block;
  font-size: 10px;
  color: #999;
}

.progress-stats {
  flex: 1;
  display: flex;
  gap: 8px;
}

/* 任务区域 */
.tasks-section {
  padding: 0 16px;
}

/* 我的 AI 个性化计划（agent plan.generate + plan.complete 闭环） */
.personalized-section {
  gap: 12px;
}
.personalized-card {
  background: var(--color-bg-card, #fff);
  border-radius: 16px;
  border: 1px solid var(--color-border, #eee);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  overflow: hidden;
  margin-bottom: 12px;
}
.personalized-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 14px 16px 4px;
}
.personalized-title {
  font-size: 15px;
  font-weight: 600;
  color: #1a1a2e;
  flex: 1;
}
.personalized-progress {
  display: flex;
  align-items: center;
  padding: 8px 16px 12px;
}
.personalized-ring {
  position: relative;
  width: 56px;
  height: 56px;
  flex-shrink: 0;
}
.personalized-ring .progress-percent { font-size: 13px; }

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 16px 0 12px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a2e;
}

.section-actions {
  display: flex;
  gap: 8px;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0 16px 16px;
}

.task-item {
  display: flex;
  gap: 12px;
  padding: 14px 16px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  border: 1px solid var(--color-border, #e8e8f0);
  transition: all var(--transition-fast);
}

.task-item.completed {
  opacity: 0.6;
  background: #f6ffed;
  border-color: #b7eb8f;
}

.task-checkbox-wrapper {
  flex-shrink: 0;
  margin-top: 2px;
}

.task-checkbox {
  width: 22px;
  height: 22px;
  accent-color: #52c41a;
}

.task-content {
  flex: 1;
  min-width: 0;
}

.task-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.task-title {
  font-size: 15px;
  font-weight: 500;
  color: #1a1a2e;
}

.task-desc {
  display: block;
  font-size: 12px;
  color: #999;
  margin-bottom: 6px;
}

.task-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 11px;
  color: #999;
}

.task-time {
  background: var(--color-bg-secondary, #f0f0f5);
  padding: 2px 6px;
  border-radius: 4px;
}

.task-type {
  color: #4a6cf7;
  font-weight: 500;
}

.task-kps {
  color: #faad14;
  font-size: 10px;
}

/* 题目预览 */
.questions-preview {
  padding: 0 16px 16px;
}

.question-cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.question-card {
  background: #fff;
  border-radius: 10px;
  padding: 12px 16px;
  border: 1px solid var(--color-border, #e8e8f0);
}

.q-content {
  font-size: 14px;
  color: #333;
  margin-bottom: 8px;
}

.q-meta {
  display: flex;
  gap: 8px;
}

.q-difficulty {
  font-size: 11px;
  color: #faad14;
}

/* 周计划 */
.weekly-days {
  padding: 0 16px 16px;
}

.day-card {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  border: 1px solid var(--color-border, #e8e8f0);
}

.day-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border, #e8e8f0);
}

.day-name {
  font-size: 15px;
  font-weight: 600;
  color: #1a1a2e;
}

.day-date {
  font-size: 12px;
  color: #999;
}

.day-tasks {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.day-task {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: #f8f9fa;
  border-radius: 8px;
  transition: all var(--transition-fast);
}

.day-task.completed {
  opacity: 0.6;
  background: #f6ffed;
}

.day-checkbox {
  width: 18px;
  height: 18px;
  accent-color: #52c41a;
}

.day-task-info {
  flex: 1;
  min-width: 0;
}

.day-task-title {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: #1a1a2e;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.day-task-meta {
  display: block;
  font-size: 11px;
  color: #999;
}

/* 月计划 */
.monthly-goals {
  padding: 0 16px 16px;
}

.goals-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0 16px;
}

.goal-item {
  display: flex;
  gap: 10px;
  padding: 12px 16px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  border: 1px solid var(--color-border, #e8e8f0);
}

.goal-index {
  font-size: 14px;
  font-weight: 700;
  color: #4a6cf7;
  width: 24px;
  flex-shrink: 0;
}

.goal-text {
  flex: 1;
  font-size: 14px;
  color: #333;
  line-height: 1.5;
}

.weekly-focus {
  padding: 0 16px 16px;
}

.focus-weeks {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0 16px;
}

.focus-week {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  border: 1px solid var(--color-border, #e8e8f0);
}

.week-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.week-name {
  font-size: 14px;
  font-weight: 600;
  color: #4a6cf7;
}

.week-focus {
  font-size: 13px;
  color: #faad14;
  font-weight: 500;
}

.week-goals {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.week-goal {
  display: flex;
  gap: 8px;
  font-size: 12px;
  color: #666;
}

.goal-bullet {
  color: #999;
  flex-shrink: 0;
}

.goal-text {
  flex: 1;
}

.milestones {
  padding: 0 16px 16px;
}

.milestone-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0 16px;
}

.milestone-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  border: 1px solid var(--color-border, #e8e8f0);
}

.milestone-week {
  font-size: 13px;
  font-weight: 600;
  color: #722ed1;
  width: 60px;
  flex-shrink: 0;
}

.milestone-type {
  flex: 1;
  font-size: 13px;
  color: #333;
}

/* 生成计划弹窗 */
.generate-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: 20px;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal-panel {
  width: 100%;
  max-width: 360px;
  background: #fff;
  border-radius: 20px;
  padding: 24px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  animation: slideUp 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.modal-title {
  font-size: 18px;
  font-weight: 600;
  color: #1a1a2e;
}

.modal-close {
  font-size: 22px;
  color: #999;
  padding: 4px;
  cursor: pointer;
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.modal-option {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.option-label {
  font-size: 13px;
  font-weight: 600;
  color: #666;
}

.option-tabs {
  display: flex;
  gap: 8px;
}

.option-tabs .chip {
  flex: 1;
  text-align: center;
  justify-content: center;
}

.date-input {
  height: 44px;
  padding: 0 12px;
  border: 1px solid var(--color-border, #e8e8f0);
  border-radius: 8px;
  font-size: 15px;
  outline: none;
}

.date-input:focus {
  border-color: #4a6cf7;
  box-shadow: 0 0 0 3px rgba(74, 108, 247, 0.15);
}

.subject-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.modal-footer {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}

.modal-footer .chip {
  flex: 1;
  text-align: center;
  justify-content: center;
}

.safe-area {
  height: 40px;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .page {
    background: var(--color-bg-primary, #1a1a2e);
  }

  .task-item,
  .day-card,
  .goal-item,
  .focus-week,
  .milestone-item,
  .modal-panel {
    background: var(--color-bg-card, #252542);
    border-color: var(--color-border, #3d3d5c);
  }

  .task-item.completed {
    background: rgba(82, 196, 26, 0.1);
    border-color: #3a7d1a;
  }

  .task-title,
  .day-name,
  .goal-text,
  .week-name,
  .milestone-week {
    color: var(--color-text-primary, #e8e8f0);
  }

  .task-desc,
  .day-task-meta,
  .week-goal,
  .day-date {
    color: var(--color-text-tertiary, #888);
  }

  .task-type {
    color: #7c94ff;
  }

  .day-task {
    background: var(--color-bg-elevated, #2d2d4a);
  }

  .day-task.completed {
    background: rgba(82, 196, 26, 0.1);
  }

  .focus-week,
  .milestone-item {
    background: var(--color-bg-card, #252542);
    border-color: var(--color-border, #3d3d5c);
  }

  .date-input {
    background: var(--color-bg-card, #252542);
    border-color: var(--color-border, #3d3d5c);
    color: var(--color-text-primary, #e8e8f0);
  }

  .modal-panel {
    background: var(--color-bg-card, #252542);
  }
}
</style>