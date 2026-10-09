<template>
  <view class="page">
    <PageHeader
      title="练习历史"
      subtitle="查看你的练习记录"
      :actions="[{ label: '清空记录', handler: showClearConfirm }]"
    />

    <!-- 筛选栏 -->
    <view class="filter-bar">
      <view class="filter-tabs">
        <Chip
          v-for="(tab, key) in historyTabs"
          :key="key"
          :label="tab.label"
          :color="tab.color"
          :variant="currentTab === key ? 'filled' : 'outlined'"
          size="small"
          @click="setTab(key)"
        />
      </view>
    </view>

    <!-- 统计概览 -->
    <view class="stats-overview">
      <StatCard
        label="总练习次数"
        :value="stats.totalSessions"
        icon="📊"
        icon-bg="#4a6cf7"
        variant="outline"
      />
      <StatCard
        label="总题目数"
        :value="stats.totalQuestions"
        icon="✏️"
        icon-bg="#52c41a"
        variant="outline"
      />
      <StatCard
        label="平均正确率"
        :value="stats.avgAccuracy + percentSign"
        icon="🎯"
        icon-bg="#faad14"
        variant="outline"
      />
      <StatCard
        label="累计学习时长"
        :value="formatTime(stats.totalTime)"
        icon="⏱"
        icon-bg="#722ed1"
        variant="outline"
      />
    </view>

    <!-- 筛选栏（展开） -->
    <view class="filter-section" v-if="showFilters">
      <view class="filter-group">
        <text class="filter-label">模式</text>
        <view class="filter-chips">
          <Chip
            v-for="mode in practiceModes"
            :key="mode.key"
            :label="mode.name"
            :color="mode.color"
            :variant="modeFilter === mode.key ? 'filled' : 'outlined'"
            size="small"
            @click="setModeFilter(mode.key)"
          />
        </view>
      </view>
      <view class="filter-group">
        <text class="filter-label">学科</text>
        <view class="filter-chips">
          <Chip
            label="全部"
            :variant="!subjectFilter ? 'filled' : 'outlined'"
            color="blue"
            size="small"
            @click="setSubjectFilter(null)"
          />
          <Chip
            v-for="subject in subjects"
            :key="subject.id"
            :label="subject.name"
            :variant="subjectFilter === subject.id ? 'filled' : 'outlined'"
            :color="subject.color"
            size="small"
            @click="() => setSubjectFilter(subject.id)"
          />
        </view>
      </view>
      <view class="filter-group">
        <text class="filter-label">时间范围</text>
        <view class="filter-chips">
          <Chip
            label="全部"
            :variant="!timeFilter ? 'filled' : 'outlined'"
            color="blue"
            size="small"
            @click="setTimeFilter(null)"
          />
          <Chip
            label="今日"
            :variant="timeFilter === 'today' ? 'filled' : 'outlined'"
            color="green"
            size="small"
            @click="() => setTimeFilter('today')"
          />
          <Chip
            label="本周"
            :variant="timeFilter === 'week' ? 'filled' : 'outlined'"
            color="orange"
            size="small"
            @click="() => setTimeFilter('week')"
          />
          <Chip
            label="本月"
            :variant="timeFilter === 'month' ? 'filled' : 'outlined'"
            color="purple"
            size="small"
            @click="() => setTimeFilter('month')"
          />
        </view>
      </view>
    </view>

    <Chip
      v-if="!showFilters"
      label="展开筛选"
      color="blue"
      variant="outlined"
      size="small"
      @click="showFilters = true"
      class="expand-filters"
    />

    <!-- 空状态 -->
    <EmptyState
      v-if="filteredSessions.length === 0"
      :title="emptyState.title"
      :description="emptyState.description"
      :icon="emptyState.icon"
      :actions="emptyState.actions"
    />

    <!-- 历史记录列表 -->
    <view class="history-list" v-else>
      <view
        v-for="(session, index) in paginatedSessions"
        :key="session.id || index"
        class="history-item"
        @click="openSessionDetail(session)"
      >
        <view class="history-header">
          <view class="history-mode-info">
            <view class="mode-badge" :style="{ background: modeColors[session.mode] }">
              <text>{{ modeIcons[session.mode] }}</text>
            </view>
            <view class="mode-text">
              <text class="mode-name">{{ modeNames[session.mode] }}</text>
              <text class="mode-subject">{{ getSubjectName(session.subject) }}</text>
            </view>
          </view>
          <view class="history-date">{{ formatDate(session.completedAt) }}</view>
        </view>

        <view class="history-stats">
          <view class="stat-item">
            <text class="stat-label">题数</text>
            <text class="stat-value">{{ session.questions?.length || 0 }} 道</text>
          </view>
          <view class="stat-item">
            <text class="stat-label">正确率</text>
            <text :class="['stat-value', session.stats?.accuracy >= 80 ? 'good' : session.stats?.accuracy >= 60 ? 'ok' : 'bad']">
              {{ session.stats?.accuracy || 0 }}%
            </text>
          </view>
          <view class="stat-item">
            <text class="stat-label">用时</text>
            <text class="stat-value">{{ formatTime(session.duration) }}</text>
          </view>
          <view class="stat-item">
            <text class="stat-label">XP</text>
            <text class="stat-value xp">+{{ session.stats?.earnedXP || 0 }}</text>
          </view>
        </view>

        <view class="history-tags" v-if="session.topicId">
          <Chip
            :label="session.topicName || session.topicId"
            color="blue"
            variant="soft"
            size="small"
          />
        </view>
      </view>

      <!-- 分页 -->
      <view class="pagination" v-if="totalPages > 1">
        <Chip
          label="上一页"
          color="gray"
          variant="outlined"
          size="small"
          @click="prevPage"
          :disabled="currentPage === 1"
        />
        <view class="page-numbers">
          <Chip
            v-for="page in pageNumbers"
            :key="page"
            :label="page"
            :variant="page === currentPage ? 'filled' : 'outlined'"
            color="blue"
            size="small"
            @click="() => goToPage(page)"
          />
        </view>
        <Chip
          label="下一页"
          color="gray"
          variant="outlined"
          size="small"
          @click="nextPage"
          :disabled="currentPage === totalPages"
        />
      </view>
    </view>

    <!-- 会话详情弹窗 -->
    <view class="detail-modal" v-if="showDetail">
      <view class="detail-overlay" @click="closeDetail"></view>
      <view class="detail-panel">
        <view class="detail-header">
          <text class="detail-title">练习详情</text>
          <view class="detail-close" @click="closeDetail">✕</view>
        </view>
        <scroll-view class="detail-content" scroll-y="true">
          <view class="detail-section">
            <text class="section-title">基本信息</text>
            <view class="detail-grid">
              <view class="detail-item">
                <text class="detail-label">模式</text>
                <text class="detail-value">{{ modeNames[detailSession?.mode] }}</text>
              </view>
              <view class="detail-item">
                <text class="detail-label">学科</text>
                <text class="detail-value">{{ getSubjectName(detailSession?.subject) }}</text>
              </view>
              <view class="detail-item">
                <text class="detail-label">完成时间</text>
                <text class="detail-value">{{ formatDateTime(detailSession?.completedAt) }}</text>
              </view>
              <view class="detail-item">
                <text class="detail-label">用时</text>
                <text class="detail-value">{{ formatTime(detailSession?.duration) }}</text>
              </view>
            </view>
          </view>

          <view class="detail-section">
            <text class="section-title">答题统计</text>
            <view class="detail-grid">
              <view class="detail-item">
                <text class="detail-label">题目总数</text>
                <text class="detail-value">{{ detailSession?.questions?.length || 0 }}</text>
              </view>
              <view class="detail-item">
                <text class="detail-label">答对题数</text>
                <text class="detail-value good">{{ detailSession?.stats?.correct || 0 }}</text>
              </view>
              <view class="detail-item">
                <text class="detail-label">答错题数</text>
                <text class="detail-value bad">{{ detailSession?.stats?.incorrect || 0 }}</text>
              </view>
              <view class="detail-item">
                <text class="detail-label">正确率</text>
                <text class="detail-value" :class="{ good: (detailSession?.stats?.accuracy || 0) >= 80, ok: (detailSession?.stats?.accuracy || 0) >= 60, bad: (detailSession?.stats?.accuracy || 0) < 60 }">
                  {{ detailSession?.stats?.accuracy || 0 }}%
                </text>
              </view>
            </view>
          </view>

          <view class="detail-section" v-if="detailSession?.duration">
            <text class="section-title">时间分析</text>
            <view class="detail-grid">
              <view class="detail-item">
                <text class="detail-label">总用时</text>
                <text class="detail-value">{{ formatTime(detailSession?.duration) }}</text>
              </view>
              <view class="detail-item">
                <text class="detail-label">平均每题</text>
                <text class="detail-value">{{ detailSession?.questions?.length ? Math.round((detailSession?.duration || 0) / detailSession?.questions?.length) : 0 }} 秒</text>
              </view>
              <view class="detail-item">
                <text class="detail-label">获得 XP</text>
                <text class="detail-value xp">+{{ detailSession?.stats?.earnedXP || 0 }}</text>
              </view>
            </view>
          </view>

          <view class="detail-section" v-if="detailSession?.questions?.length">
            <text class="section-title">答题明细</text>
            <view class="question-detail-list">
              <view
                v-for="(q, index) in detailSession.questions"
                :key="q.id || index"
                class="question-detail-item"
              >
                <view class="question-header">
                  <text class="question-number">{{ index + 1 }}.</text>
                  <Chip
                    :label="getQuestionTypeLabel(q.type)"
                    color="blue"
                    variant="soft"
                    size="small"
                  />
                  <Chip
                    v-if="q.difficulty"
                    :label="'难度 ' + '⭐'.repeat(q.difficulty)"
                    color="orange"
                    variant="soft"
                    size="small"
                  />
                </view>
                <rich-text class="question-content" :nodes="q.content" />
                <view class="answer-info">
                  <view class="answer-row">
                    <text class="answer-label">你的答案：</text>
                    <text :class="['answer-value', q.isCorrect ? 'correct' : 'incorrect']">
                      {{ q.userAnswer || '(未作答)' }}
                    </text>
                  </view>
                  <view class="answer-row">
                    <text class="answer-label">正确答案：</text>
                    <text class="answer-value correct">{{ q.correctAnswer }}</text>
                  </view>
                  <text v-if="q.explanation" class="explanation">{{ q.explanation }}</text>
                </view>
              </view>
            </view>
          </view>

          <view class="detail-actions">
            <Chip
              label="再练一遍"
              color="blue"
              variant="filled"
              size="large"
              @click="restartSameSession"
            />
            <Chip
              label="查看错题"
              color="red"
              variant="outlined"
              size="large"
              @click="goToWrongQuestions"
            />
            <Chip
              label="关闭"
              color="gray"
              variant="outlined"
              size="large"
              @click="closeDetail"
            />
          </view>
        </scroll-view>
      </view>
    </view>

    <view class="safe-area" />
  </view>
</template>

<script>
import { ref, computed, onMounted, nextTick } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { usePracticeStore } from '@/store/practice'
import { useUserStore } from '@/store/user'
import PageHeader from '@/components/ui/PageHeader.vue'
import Chip from '@/components/ui/Chip.vue'
import StatCard from '@/components/ui/StatCard.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ProgressRing from '@/components/ui/ProgressRing.vue'

export default {
  name: 'PracticeHistory',
  components: {
    PageHeader,
    Chip,
    StatCard,
    EmptyState,
    ProgressRing
  },
  setup() {
    const practiceStore = usePracticeStore()
    const userStore = useUserStore()

    const currentTab = ref('all')
    const showFilters = ref(false)
    const modeFilter = ref(null)
    const subjectFilter = ref(null)
    const timeFilter = ref(null)
    const searchKeyword = ref('')
    const currentPage = ref(1)
    const pageSize = 10
    const showDetail = ref(false)
    const detailSession = ref(null)

    const practiceModes = {
      quick: { name: '快速练习', icon: '⚡', color: '#4a6cf7' },
      topic: { name: '专项突破', icon: '🎯', color: '#faad14' },
      mock: { name: '模拟考试', icon: '📝', color: '#52c41a', timed: true },
      review: { name: '间隔复习', icon: '🔄', color: '#722ed1' },
      weakness: { name: '薄弱攻克', icon: '💪', color: '#ff4d4f' }
    }

    const historyTabs = {
      all: { label: '全部', color: 'blue' },
      completed: { label: '已完成', color: 'green' },
      incomplete: { label: '未完成', color: 'orange' }
    }

    const subjects = [
      { id: 'math', name: '数学', icon: '📐', color: '#4a6cf7' },
      { id: 'phys', name: '物理', icon: '⚡', color: '#faad14' },
      { id: 'chem', name: '化学', icon: '🧪', color: '#ff4d4f' },
      { id: 'bio', name: '生物', icon: '🧬', color: '#52c41a' },
      { id: 'eng', name: '英语', icon: '📖', color: '#722ed1' },
      { id: 'chn', name: '语文', icon: '📝', color: '#eb2f96' }
    ]

    const modeColors = {
      quick: '#4a6cf7',
      topic: '#faad14',
      mock: '#52c41a',
      review: '#722ed1',
      weakness: '#ff4d4f'
    }

    const modeIcons = {
      quick: '⚡',
      topic: '🎯',
      mock: '📝',
      review: '🔄',
      weakness: '💪'
    }

    const modeNames = {
      quick: '快速练习',
      topic: '专项突破',
      mock: '模拟考试',
      review: '间隔复习',
      weakness: '薄弱攻克'
    }

    const filteredSessions = computed(() => {
      let result = practiceStore.history

      // Tab 筛选（以 practice_sessions.status 为准）
      if (currentTab.value === 'completed') {
        result = result.filter(s => s.status === 'completed')
      } else if (currentTab.value === 'incomplete') {
        result = result.filter(s => s.status && s.status !== 'completed')
      }

      // 模式筛选
      if (modeFilter.value) {
        result = result.filter(s => s.mode === modeFilter.value)
      }

      // 学科筛选
      if (subjectFilter.value) {
        result = result.filter(s => s.subject === subjectFilter.value)
      }

      // 时间筛选
      if (timeFilter.value) {
        const now = Date.now()
        const dayMs = 86400000
        const weekMs = 7 * dayMs
        const monthMs = 30 * dayMs
        let cutoff = 0
        if (timeFilter.value === 'today') cutoff = now - dayMs
        else if (timeFilter.value === 'week') cutoff = now - weekMs
        else if (timeFilter.value === 'month') cutoff = now - monthMs
        result = result.filter(s => new Date(s.completedAt).getTime() >= cutoff)
      }

      // 搜索
      if (searchKeyword.value.trim()) {
        const kw = searchKeyword.value.toLowerCase()
        result = result.filter(s =>
          s.mode?.toLowerCase().includes(kw) ||
          s.subject?.toLowerCase().includes(kw) ||
          s.topicId?.toLowerCase().includes(kw)
        )
      }

      return result
    })

    const stats = computed(() => {
      const sessions = practiceStore.history
      if (!sessions.length) {
        return { totalSessions: 0, totalQuestions: 0, avgAccuracy: 0, totalTime: 0 }
      }
      const completed = sessions.filter(s => s.stats?.accuracy !== undefined)
      const totalQuestions = sessions.reduce((sum, s) => sum + (s.questions?.length || 0), 0)
      const avgAccuracy = completed.length
        ? Math.round(completed.reduce((sum, s) => sum + (s.stats?.accuracy || 0), 0) / completed.length)
        : 0
      const totalTime = sessions.reduce((sum, s) => sum + (s.duration || 0), 0)
      return {
        totalSessions: sessions.length,
        totalQuestions,
        avgAccuracy,
        totalTime
      }
    })

    const emptyState = computed(() => {
      const states = {
        all: {
          title: '暂无练习记录',
          description: '去练习中心完成第一次练习吧',
          icon: '📊',
          actions: [{ label: '去练习', handler: () => uni.switchTab({ url: '/pages/practice/index' }) }]
        },
        completed: {
          title: '暂无已完成记录',
          description: '完成练习后会显示在这里',
          icon: '✅',
          actions: [{ label: '去练习', handler: () => uni.switchTab({ url: '/pages/practice/index' }) }]
        },
        incomplete: {
          title: '没有未完成的练习',
          description: '所有练习都已完成',
          icon: '🎉',
          actions: [{ label: '去练习', handler: () => uni.switchTab({ url: '/pages/practice/index' }) }]
        }
      }
      return states[currentTab.value] || states.all
    })

    const percentSign = '%'

    const totalPages = computed(() => Math.ceil(filteredSessions.value.length / pageSize) || 1)
    const paginatedSessions = computed(() => {
      const start = (currentPage.value - 1) * pageSize
      return filteredSessions.value.slice(start, start + pageSize)
    })

    const pageNumbers = computed(() => {
      const pages = []
      const total = totalPages.value
      const current = currentPage.value
      if (total <= 5) {
        for (let i = 1; i <= total; i++) pages.push(i)
      } else {
        pages.push(1)
        if (current > 3) pages.push('...')
        for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
          pages.push(i)
        }
        if (current < total - 2) pages.push('...')
        pages.push(total)
      }
      return pages
    })

    const setTab = (tab) => {
      currentTab.value = tab
      currentPage.value = 1
    }

    const setModeFilter = (mode) => {
      modeFilter.value = modeFilter.value === mode ? null : mode
      currentPage.value = 1
    }

    const setSubjectFilter = (subject) => {
      subjectFilter.value = subjectFilter.value === subject ? null : subject
      currentPage.value = 1
    }

    const setTimeFilter = (time) => {
      timeFilter.value = timeFilter.value === time ? null : time
      currentPage.value = 1
    }

    const onSearch = () => {
      currentPage.value = 1
    }

    const clearSearch = () => {
      searchKeyword.value = ''
      currentPage.value = 1
    }

    const goToPage = (page) => {
      if (page === '...') return
      currentPage.value = page
    }

    const prevPage = () => {
      if (currentPage.value > 1) currentPage.value--
    }

    const nextPage = () => {
      if (currentPage.value < totalPages.value) currentPage.value++
    }

    const getSubjectName = (subject) => {
      const names = { math: '数学', phys: '物理', chem: '化学', bio: '生物', eng: '英语', chn: '语文' }
      return names[subject] || subject
    }

    const formatDate = (dateStr) => {
      if (!dateStr) return ''
      const date = new Date(dateStr)
      const now = new Date()
      const diff = now - date
      if (diff < 86400000) return '今天'
      if (diff < 172800000) return '昨天'
      if (diff < 604800000) return Math.floor(diff / 86400000) + '天前'
      return `${date.getMonth() + 1}月${date.getDate()}日`
    }

    const formatDateTime = (dateStr) => {
      if (!dateStr) return ''
      const date = new Date(dateStr)
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    }

    const formatTime = (seconds) => {
      if (!seconds) return '0秒'
      if (seconds < 60) return `${seconds}秒`
      const mins = Math.floor(seconds / 60)
      const secs = seconds % 60
      if (mins < 60) return `${mins}分${secs > 0 ? secs + '秒' : ''}`
      const hours = Math.floor(mins / 60)
      const mins2 = mins % 60
      return `${hours}小时${mins2 > 0 ? mins2 + '分' : ''}`
    }

    const openSessionDetail = (session) => {
      detailSession.value = session
      showDetail.value = true
    }

    const closeDetail = () => {
      showDetail.value = false
      detailSession.value = null
    }

    const restartSameSession = () => {
      if (!detailSession.value) return
      uni.switchTab({ url: '/pages/practice/index' })
      setTimeout(() => {
        // 触发重新开始相同模式
        uni.$emit('restart-practice', {
          mode: detailSession.value.mode,
          subject: detailSession.value.subject,
          topicId: detailSession.value.topicId
        })
      }, 100)
      closeDetail()
    }

    const goToWrongQuestions = () => {
      closeDetail()
      uni.switchTab({ url: '/pages/wrong-questions/index' })
    }

    const showClearConfirm = () => {
      uni.showModal({
        title: '确认清空？',
        content: '将清空所有练习历史记录，此操作不可撤销',
        confirmColor: '#ff4d4f',
        success: (res) => {
          if (res.confirm) {
            practiceStore.history = []
            uni.showToast({ title: '已清空', icon: 'success' })
          }
        }
      })
    }

    const getQuestionTypeLabel = (type) => {
      const labels = { choice: '单选题', multiple: '多选题', fill: '填空题', short: '简答题' }
      return labels[type] || '题目'
    }

    onMounted(() => {
      practiceStore.loadHistory()
    })

    onShow(() => {
      practiceStore.loadHistory()
    })

    return {
      practiceStore,
      userStore,
      currentTab,
      showFilters,
      modeFilter,
      subjectFilter,
      timeFilter,
      searchKeyword,
      currentPage,
      pageSize,
      showDetail,
      detailSession,
      historyTabs,
      practiceModes,
      subjects,
      modeColors,
      modeIcons,
      modeNames,
      filteredSessions,
      stats,
      emptyState,
      totalPages,
      paginatedSessions,
      pageNumbers,
      currentTab,
      setTab,
      setModeFilter,
      setSubjectFilter,
      setTimeFilter,
      onSearch,
      clearSearch,
      goToPage,
      prevPage,
      nextPage,
      getSubjectName,
      formatDate,
      formatDateTime,
      formatTime,
      getSubjectName,
      formatDate,
      formatDateTime,
      formatTime,
      getQuestionTypeLabel,
      openSessionDetail,
      closeDetail,
      restartSameSession,
      goToWrongQuestions,
      showClearConfirm,
      goToPage,
      prevPage,
      nextPage,
      percentSign
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

/* 筛选栏 */
.filter-bar {
  padding: 0 16px 12px;
}

.filter-tabs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 8px;
}

.filter-section {
  padding: 0 16px 16px;
  animation: slideDown 0.2s ease;
}

@keyframes slideDown {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

.filter-group {
  margin-bottom: 12px;
}

.filter-label {
  display: block;
  font-size: 12px;
  color: #999;
  margin-bottom: 8px;
  font-weight: 500;
}

.filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.filter-chips-inline {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 16px;
}

.expand-filters {
  margin: 0 16px 16px;
  width: 100%;
}

/* 统计概览 */
.stats-overview {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  padding: 0 16px 16px;
}

/* 列表 */
.history-list {
  flex: 1;
  padding: 0 16px 16px;
}

.history-item {
  background: #fff;
  border-radius: 12px;
  padding: 14px 16px;
  margin-bottom: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  border: 1px solid var(--color-border, #e8e8f0);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.history-item:active {
  background: #f5f5f5;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.history-mode-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mode-badge {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
}

.mode-text {
  flex: 1;
  min-width: 0;
}

.mode-name {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: #1a1a2e;
}

.mode-subject {
  display: block;
  font-size: 11px;
  color: #999;
  text-transform: capitalize;
}

.history-date {
  font-size: 11px;
  color: #999;
  white-space: nowrap;
}

.history-stats {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.stat-item {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 60px;
}

.stat-label {
  display: block;
  font-size: 10px;
  color: #999;
  margin-bottom: 2px;
}

.stat-value {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: #1a1a2e;
}

.stat-value.good { color: #52c41a; }
.stat-value.ok { color: #faad14; }
.stat-value.bad { color: #ff4d4f; }
.stat-value.xp { color: #722ed1; font-weight: 700; }

.history-tags {
  margin-top: 10px;
}

.section-title {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: #1a1a2e;
  margin-bottom: 8px;
}

/* 分页 */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px 0;
}

.page-numbers {
  display: flex;
  gap: 4px;
}

.page-numbers .chip {
  min-width: 32px;
}

/* 筛选展开按钮 */
.expand-filters {
  display: block;
  text-align: center;
  margin: 16px 16px 0;
}

/* 详情弹窗 */
.detail-modal {
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
}

.detail-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}

.detail-panel {
  width: 100%;
  max-width: 400px;
  max-height: 90vh;
  background: #fff;
  border-radius: 20px 20px 0 0;
  padding: 24px;
  overflow-y: auto;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.1);
  animation: slideUp 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--color-border, #e8e8f0);
  margin-bottom: 16px;
}

.detail-title {
  font-size: 17px;
  font-weight: 600;
  color: #1a1a2e;
}

.detail-close {
  font-size: 20px;
  color: #999;
  padding: 4px;
  cursor: pointer;
}

.detail-content {
  padding: 0;
}

.detail-section {
  margin-bottom: 20px;
}

.section-title {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: #1a1a2e;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border, #e8e8f0);
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-label {
  font-size: 11px;
  color: #999;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.detail-value {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a2e;
}

.detail-value.good { color: #52c41a; }
.detail-value.bad { color: #ff4d4f; }
.detail-value.xp { color: #722ed1; font-weight: 700; }

.question-detail-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.question-detail-item {
  background: #fafafa;
  border-radius: 12px;
  padding: 16px;
}

.question-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.question-number {
  font-size: 14px;
  font-weight: 600;
  color: #4a6cf7;
}

.question-content {
  font-size: 15px;
  line-height: 1.7;
  color: #1a1a2e;
  margin-bottom: 12px;
}

.answer-info {
  background: #f5f5f5;
  border-radius: 10px;
  padding: 12px;
}

.answer-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
  align-items: flex-start;
}

.answer-label {
  font-size: 12px;
  color: #999;
  white-space: nowrap;
  min-width: 60px;
}

.answer-value {
  flex: 1;
  font-size: 13px;
  color: #1a1a2e;
}

.answer-value.correct { color: #52c41a; font-weight: 600; }
.answer-value.incorrect { color: #ff4d4f; }

.explanation {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--color-border, #e8e8f0);
  font-size: 13px;
  color: #666;
  line-height: 1.6;
}

.detail-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border, #e8e8f0);
  margin-top: 16px;
}

.detail-actions .chip {
  width: 100%;
  justify-content: center;
}

/* 分页 */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px 0;
}

.page-numbers {
  display: flex;
  gap: 4px;
}

.page-numbers .chip {
  min-width: 32px;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .page {
    background: var(--color-bg-primary, #1a1a2e);
  }

  .history-item,
  .detail-panel,
  .question-detail-item {
    background: var(--color-bg-card, #252542);
    border-color: var(--color-border, #3d3d5c);
  }

  .history-item:active {
    background: var(--color-bg-elevated, #2d2d4a);
  }

  .detail-value,
  .section-title,
  .detail-title,
  .mode-name {
    color: var(--color-text-primary, #e8e8f0);
  }

  .mode-subject,
  .history-date,
  .detail-label,
  .stat-label {
    color: var(--color-text-tertiary, #888);
  }

  .stat-value.xp { color: #b39aff; }

  .detail-grid .detail-item {
    background: var(--color-bg-elevated, #2d2d4a);
    border-radius: 8px;
    padding: 12px;
  }

  .question-detail-item {
    background: var(--color-bg-elevated, #2d2d4a);
  }

  .answer-value.correct { color: #95de64; }
  .answer-value.incorrect { color: #ff7875; }

  .detail-panel {
    background: var(--color-bg-card, #252542);
  }

  .question-content {
    color: var(--color-text-primary, #e8e8f0);
  }

  .explanation {
    border-color: var(--color-border, #3d3d5c);
  }

  .detail-header,
  .detail-section {
    border-color: var(--color-border, #3d3d5c);
  }

  .detail-actions {
    border-color: var(--color-border, #3d3d5c);
  }

  .answer-row .answer-label {
    color: var(--color-text-tertiary, #888);
  }

  .filter-group-label {
    color: var(--color-text-tertiary, #888);
  }

  .detail-actions .chip,
  .pagination .chip {
    background: var(--color-bg-card, #252542);
    border-color: var(--color-border, #3d3d5c);
  }
}
</style>