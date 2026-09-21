<template>
  <ErrorBoundary :showDetails="true" :logError="true">
    <view class="page">
      <PageHeader
        title="错题本"
        subtitle="复盘错题，查漏补缺"
        :actions="[{ label: '批量操作', handler: showBulkActions }]"
      />

    <!-- 筛选栏 -->
    <view class="filter-bar">
      <view class="filter-chips" :class="{ expanded: showAllFilters }">
        <Chip
          v-for="filter in filters"
          :key="filter.key"
          :label="filter.label"
          :count="filter.count"
          :color="filter.color"
          :variant="currentFilter === filter.key ? 'filled' : 'outlined'"
          size="small"
          @click="() => setFilter(filter.key)"
        />
        <Chip
          v-if="!showAllFilters && filters.length > 4"
          label="更多"
          color="gray"
          variant="outlined"
          size="small"
          @click="showAllFilters = true"
        />
      </view>
      <view class="filter-actions">
        <Chip
          v-if="showAllFilters"
          label="收起"
          color="gray"
          variant="soft"
          size="small"
          @click="showAllFilters = false"
        />
        <view class="search-btn" @click="focusSearch">
          <text>🔍</text>
        </view>
      </view>
    </view>

    <!-- 搜索框 -->
    <view class="search-bar" v-if="searchFocused">
      <input
        class="search-input"
        v-model="searchKeyword"
        placeholder="搜索题目内容、知识点..."
        @confirm="onSearch"
        @blur="searchFocused = false"
      />
      <view class="search-cancel" @click="clearSearch">取消</view>
    </view>

    <!-- 学科/标签筛选 -->
    <view class="secondary-filters" v-if="showAllFilters">
      <view class="filter-group">
        <text class="filter-group-label">学科</text>
        <view class="filter-chips-inline">
          <Chip
            label="全部"
            :variant="!currentSubject ? 'filled' : 'outlined'"
            color="blue"
            size="small"
            @click="setSubject(null)"
          />
          <Chip
            v-for="sub in subjects"
            :key="sub"
            :label="sub"
            :variant="currentSubject === sub ? 'filled' : 'outlined'"
            color="blue"
            size="small"
            @click="() => setSubject(sub)"
          />
        </view>
      </view>
      <view class="filter-group">
        <text class="filter-group-label">标签</text>
        <view class="filter-chips-inline">
          <Chip
            label="全部"
            :variant="!currentTag ? 'filled' : 'outlined'"
            color="gray"
            size="small"
            @click="setTag(null)"
          />
          <Chip
            v-for="tag in tags"
            :key="tag"
            :label="tag"
            :variant="currentTag === tag ? 'filled' : 'outlined'"
            color="orange"
            size="small"
            @click="() => setTag(tag)"
          />
        </view>
      </view>
    </view>

    <!-- 统计概览 -->
    <LoadingSkeleton v-if="wrongStore.loading" variant="card" rows="4" />
    <view v-else class="stats-overview">
      <StatCard
        label="错题总数"
        :value="stats.total"
        icon="📝"
        icon-bg="#ff4d4f"
        variant="outline"
      />
      <StatCard
        label="待复习"
        :value="stats.toReview"
        icon="🔄"
        icon-bg="#faad14"
        variant="outline"
      />
      <StatCard
        label="已掌握"
        :value="stats.mastered"
        icon="✅"
        icon-bg="#52c41a"
        variant="outline"
      />
      <StatCard
        label="本周新增"
        :value="stats.thisWeek"
        icon="📈"
        icon-bg="#722ed1"
        variant="outline"
      />
    </view>

    <!-- 错题列表 -->
    <view class="questions-section">
      <view class="section-header">
        <text class="section-title">{{ filterLabels[currentFilter] }}</text>
        <text class="section-count">{{ filteredQuestions.length }} 道</text>
      </view>

      <EmptyState
        v-if="filteredQuestions.length === 0"
        title="暂无错题"
        :description="emptyDescriptions[currentFilter]"
        :icon="emptyIcons[currentFilter]"
        :actions="emptyActions[currentFilter]"
      />

      <LoadingSkeleton v-if="wrongStore.loading" variant="list" rows="5" />
      <view v-else class="questions-list">
        <view
          v-for="(question, index) in filteredQuestions"
          :key="question.id"
          class="question-card"
          @click="openQuestion(question)"
        >
          <view class="question-main">
            <view class="question-status">
              <Chip
                :label="getStatusLabel(question.reviewStatus)"
                :color="getStatusColor(question.reviewStatus)"
                variant="soft"
                size="small"
              />
              <text class="question-subject" v-if="question.subject">{{ getSubjectName(question.subject) }}</text>
            </view>

            <text class="question-content">{{ truncate(question.content, 80) }}</text>

            <view class="question-meta">
              <text class="question-kp" v-if="question.knowledgePoint">{{ question.knowledgePoint }}</text>
              <view class="question-tags" v-if="question.tags && question.tags.length">
                <Chip
                  v-for="(tag, i) in question.tags.slice(0, 2)"
                  :key="i"
                  :label="tag"
                  color="gray"
                  variant="outlined"
                  size="small"
                />
                <Chip
                  v-if="question.tags.length > 2"
                  :label="remainingTagsCount(question)"
                  color="gray"
                  variant="outlined"
                  size="small"
                />
              </view>
              <text class="question-time">{{ formatDate(question.createdAt) }}</text>
            </view>
          </view>

          <view class="question-actions">
            <Chip
              v-if="question.reviewStatus !== 'mastered'"
              label="复习"
              color="blue"
              variant="soft"
              size="small"
              @click.stop="() => startReview(question)"
            />
            <Chip
              v-if="question.reviewStatus !== 'mastered'"
              label="标记掌握"
              color="green"
              variant="outlined"
              size="small"
              @click.stop="() => markMastered(question)"
            />
            <Chip
              v-else
              label="已掌握"
              color="green"
              variant="filled"
              size="small"
            />
            <view class="question-menu" @click.stop="showQuestionMenu(question)">⋮</view>
          </view>
        </view>
      </view>
    </view>

    <!-- 复习模式 -->
    <view class="review-overlay" v-if="reviewMode">
      <LoadingSkeleton v-if="wrongStore.loading" variant="card" rows="5" />
      <view v-else class="review-container">
        <view class="review-header">
          <text class="review-title">错题复习</text>
          <text class="review-progress">{{ currentReviewIndex + 1 }} / {{ reviewQueue.length }}</text>
          <view class="review-close" @click="exitReviewMode">✕</view>
        </view>

        <ProgressRing
          :value="reviewProgress"
          :max="100"
          :size="60"
          :stroke-width="5"
          :color="reviewProgressColor"
        />

        <view class="review-question" v-if="currentReviewItem">
          <text class="review-question-text">{{ currentReviewItem.content }}</text>

          <view class="review-answer">
            <text class="review-answer-label">你的答案：</text>
            <text class="review-answer-user" :class="{ correct: currentReviewItem.userAnswer === currentReviewItem.correctAnswer }">{{ currentReviewItem.userAnswer }}</text>
            <text class="review-answer-label">正确答案：</text>
            <text class="review-answer-correct">{{ currentReviewItem.correctAnswer }}</text>
            <text v-if="currentReviewItem.explanation" class="review-explanation">{{ currentReviewItem.explanation }}</text>
          </view>

          <view class="review-mastery">
            <text class="review-mastery-label">当前掌握度：{{ Math.round((currentReviewItem.mastery || 0) * 100) }}%</text>
            <slider
              class="mastery-slider"
              :min="0"
              :max="100"
              :step="5"
              v-model="reviewMastery"
              @change="onMasteryChange"
            />
          </view>
        </view>

        <view class="review-actions">
          <Chip
            v-if="currentReviewIndex > 0"
            label="上一题"
            color="gray"
            variant="outlined"
            @click="prevReview"
          />
          <Chip
            label="标记掌握"
            color="green"
            variant="filled"
            @click="markReviewedAndNext"
          />
          <Chip
            v-if="currentReviewIndex < reviewQueue.length - 1"
            label="下一题"
            color="blue"
            variant="filled"
            @click="nextReview"
          />
          <Chip
            v-else
            label="完成复习"
            color="blue"
            variant="filled"
            @click="completeReview"
          />
        </view>
      </view>
    </view>

    <!-- 底部安全区 -->
    <view class="safe-area" />
  </view>
</ErrorBoundary>
</template>

<script>
import { ref, computed, onMounted } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useWrongQuestionsStore } from '@/store/wrong-questions'
import PageHeader from '@/components/ui/PageHeader.vue'
import Chip from '@/components/ui/Chip.vue'
import StatCard from '@/components/ui/StatCard.vue'
import ProgressRing from '@/components/ui/ProgressRing.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import LoadingSkeleton from '@/components/ui/LoadingSkeleton.vue'
import ErrorBoundary from '@/components/ErrorBoundary.vue'

export default {
  name: 'WrongQuestions',
  components: {
    PageHeader,
    Chip,
    StatCard,
    ProgressRing,
    EmptyState,
    LoadingSkeleton,
    ErrorBoundary
  },
  setup() {
    const wrongStore = useWrongQuestionsStore()

    const searchFocused = ref(false)
    const searchKeyword = ref('')
    const showAllFilters = ref(false)
    const reviewMode = ref(false)
    const reviewMastery = ref(70)

    // 筛选器配置
    const filters = [
      { key: 'all', label: '全部', color: 'blue' },
      { key: 'review', label: '待复习', color: 'orange' },
      { key: 'mastered', label: '已掌握', color: 'green' }
    ]

    const filterLabels = {
      all: '全部错题',
      review: '待复习',
      mastered: '已掌握'
    }

    const emptyDescriptions = {
      all: '还没有错题记录，去练习积累吧',
      review: '太棒了！暂时没有待复习的错题',
      mastered: '继续加油，掌握更多知识点'
    }

    const emptyIcons = {
      all: '📝',
      review: '🎉',
      mastered: '💪'
    }

    const emptyActions = {
      all: [{ label: '去练习', handler: () => uni.switchTab({ url: '/pages/practice/index' }) }],
      review: [],
      mastered: [{ label: '去练习', handler: () => uni.switchTab({ url: '/pages/practice/index' }) }]
    }

    const currentFilter = computed({
      get: () => wrongStore.currentFilter,
      set: (val) => wrongStore.setFilter(val)
    })

    const currentSubject = computed({
      get: () => wrongStore.currentSubject,
      set: (val) => wrongStore.setSubject(val)
    })

    const currentTag = computed({
      get: () => wrongStore.currentTag,
      set: (val) => wrongStore.setTag(val)
    })

    const subjects = computed(() => wrongStore.subjects)
    const tags = computed(() => wrongStore.tags)
    const stats = computed(() => wrongStore.stats)

    const filteredQuestions = computed(() => {
      let result = wrongStore.filteredQuestions

      if (searchKeyword.value.trim()) {
        const kw = searchKeyword.value.toLowerCase()
        result = result.filter(q =>
          q.content?.toLowerCase().includes(kw) ||
          q.knowledgePoint?.toLowerCase().includes(kw) ||
          q.tags?.some(t => t.toLowerCase().includes(kw))
        )
      }

      return result
    })

    const reviewQueue = computed(() => wrongStore.reviewQueue)
    const currentReviewIndex = computed(() => wrongStore.currentReviewIndex)
    const currentReviewItem = computed(() => wrongStore.currentReviewItem)
    const reviewProgress = computed(() => wrongStore.reviewProgress)

    const setFilter = (filter) => {
      wrongStore.setFilter(filter)
      searchKeyword.value = ''
    }

    const setSubject = (subject) => {
      wrongStore.setSubject(subject)
    }

    const setTag = (tag) => {
      wrongStore.setTag(tag)
    }

    const focusSearch = () => {
      searchFocused.value = true
    }

    const clearSearch = () => {
      searchKeyword.value = ''
      searchFocused.value = false
    }

    const onSearch = () => {
      searchFocused.value = false
    }

    const reviewProgressColor = computed(() => '#4a6cf7')

    const getStatusLabel = (status) => {
      return status === 'mastered' ? '已掌握' : '待复习'
    }

    const getStatusColor = (status) => {
      return status === 'mastered' ? 'green' : 'orange'
    }

    const getSubjectName = (subject) => {
      const names = { math: '数学', physics: '物理', chemistry: '化学', biology: '生物' }
      return names[subject] || subject
    }

    const truncate = (text, len) => {
      if (!text) return ''
      return text.length > len ? text.substring(0, len) + '...' : text
    }

    const formatDate = (dateStr) => {
      if (!dateStr) return ''
      const date = new Date(dateStr)
      const now = new Date()
      const diff = now - date

      if (diff < 86400000) return '今天'
      if (diff < 172800000) return '昨天'
      if (diff < 604800000) return Math.floor(diff / 86400000) + '天前'
      return date.getMonth() + 1 + '月' + date.getDate() + '日'
    }

    const remainingTagsCount = (question) => {
      return '+' + (question.tags.length - 2)
    }

    const openQuestion = (question) => {
      // 打开题目详情或进入复习
      startReview(question)
    }

    const startReview = (question) => {
      wrongStore.startReviewMode(currentFilter.value)
      // 找到该题在队列中的位置
      const index = wrongStore.reviewQueue.findIndex(q => q.id === question.id)
      if (index >= 0) {
        // 需要跳转到该位置 - 这里简化处理
        for (let i = 0; i < index; i++) {
          wrongStore.nextReview()
        }
      }
      reviewMode.value = true
      reviewMastery.value = Math.round((question.mastery || 0) * 100)
    }

    const startReviewAll = () => {
      wrongStore.startReviewMode(currentFilter.value)
      reviewMode.value = true
      reviewMastery.value = 70
    }

    const showBulkActions = () => {
      uni.showActionSheet({
        itemList: ['全部标记掌握', '全部标记待复习', '删除已掌握', '导出错题'],
        success: (res) => {
          const actions = ['markAllMastered', 'markAllReview', 'deleteMastered', 'export']
          handleBulkAction(actions[res.tapIndex])
        }
      })
    }

    const handleBulkAction = (action) => {
      const ids = wrongStore.filteredQuestions.map(q => q.id)
      switch (action) {
        case 'markAllMastered':
          wrongStore.bulkAction('markMastered', ids)
          uni.showToast({ title: '已全部标记掌握', icon: 'success' })
          break
        case 'markAllReview':
          wrongStore.bulkAction('markReview', ids)
          uni.showToast({ title: '已全部标记待复习', icon: 'success' })
          break
        case 'deleteMastered':
          const masteredIds = wrongStore.filteredQuestions.filter(q => q.reviewStatus === 'mastered').map(q => q.id)
          wrongStore.bulkAction('delete', masteredIds)
          uni.showToast({ title: `已删除 ${masteredIds.length} 道已掌握题目`, icon: 'success' })
          break
        case 'export':
          exportQuestions()
          break
      }
    }

    const exportQuestions = () => {
      const data = wrongStore.filteredQuestions.map(q => ({
        题目: q.content,
        你的答案: q.userAnswer,
        正确答案: q.correctAnswer,
        知识点: q.knowledgePoint,
        学科: q.subject,
        标签: q.tags?.join('、'),
        状态: q.reviewStatus === 'mastered' ? '已掌握' : '待复习',
        掌握度: `${Math.round((q.mastery || 0) * 100)}%`,
        创建时间: new Date(q.createdAt).toLocaleString()
      }))

      // #ifdef H5
      const csv = [
        Object.keys(data[0] || {}).join(','),
        ...data.map(row => Object.values(row).map(v => `"${v}"`).join(','))
      ].join('\n')

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `错题本_${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
      // #endif

      uni.showToast({ title: '导出成功', icon: 'success' })
    }

    const showQuestionMenu = (question) => {
      uni.showActionSheet({
        itemList: ['编辑标签', '标记掌握', '重新练习', '删除'],
        success: (res) => {
          const actions = ['editTags', 'markMastered', 'retry', 'delete']
          handleQuestionAction(actions[res.tapIndex], question)
        }
      })
    }

    const handleQuestionAction = (action, question) => {
      switch (action) {
        case 'editTags':
          uni.showModal({
            title: '编辑标签',
            content: '当前标签：' + (question.tags || []).join('、'),
            editable: true,
            placeholderText: '输入标签，用逗号分隔',
            success: (res) => {
              if (res.confirm && res.content) {
                const tags = res.content.split('、').map(t => t.trim()).filter(Boolean)
                wrongStore.updateQuestionTags(question.id, tags)
                uni.showToast({ title: '标签已更新', icon: 'success' })
              }
            }
          })
          break
        case 'markMastered':
          wrongStore.markReviewed(question.id, 0.8)
          uni.showToast({ title: '已标记掌握', icon: 'success' })
          break
        case 'retry':
          wrongStore.retryQuestion(question.id).then(result => {
            if (result) {
              // 进入练习
              uni.navigateTo({ url: '/pages/practice/index' })
            }
          })
          break
        case 'delete':
          uni.showModal({
            title: '确认删除',
            content: '删除后无法恢复',
            success: (res) => {
              if (res.confirm) {
                wrongStore.deleteQuestion(question.id)
                uni.showToast({ title: '已删除', icon: 'success' })
              }
            }
          })
          break
      }
    }

    const markMastered = (question) => {
      wrongStore.markReviewed(question.id, 0.8)
      uni.showToast({ title: '已标记掌握', icon: 'success' })
    }

    const exitReviewMode = () => {
      wrongStore.exitReviewMode()
      reviewMode.value = false
      reviewMastery.value = 70
    }

    const nextReview = () => {
      if (wrongStore.nextReview()) {
        reviewMastery.value = Math.round((wrongStore.currentReviewItem?.mastery || 0) * 100)
      } else {
        completeReview()
      }
    }

    const prevReview = () => {
      if (wrongStore.prevReview()) {
        reviewMastery.value = Math.round((wrongStore.currentReviewItem?.mastery || 0) * 100)
      }
    }

    const onMasteryChange = (e) => {
      reviewMastery.value = e.detail.value
    }

    const markReviewedAndNext = () => {
      if (wrongStore.currentReviewItem) {
        wrongStore.markReviewed(wrongStore.currentReviewItem.id, reviewMastery.value / 100)
      }
      nextReview()
    }

    const completeReview = () => {
      uni.showModal({
        title: '复习完成！',
        content: `本次复习 ${reviewQueue.value.length} 道题目`,
        showCancel: false,
        confirmText: '太棒了',
        success: () => {
          exitReviewMode()
        }
      })
    }

    onMounted(() => {
      wrongStore.loadQuestions()
    })

    onShow(() => {
      wrongStore.loadQuestions()
    })

    return {
      wrongStore,
      searchFocused,
      searchKeyword,
      showAllFilters,
      reviewMode,
      reviewMastery,
      filters,
      filterLabels,
      emptyDescriptions,
      emptyIcons,
      emptyActions,
      currentFilter,
      currentSubject,
      currentTag,
      subjects,
      tags,
      stats,
      filteredQuestions,
      reviewQueue,
      currentReviewIndex,
      currentReviewItem,
      reviewProgress,
      setFilter,
      setSubject,
      setTag,
      focusSearch,
      clearSearch,
      onSearch,
      getStatusLabel,
      getStatusColor,
      getSubjectName,
      truncate,
      formatDate,
      openQuestion,
      startReview,
      startReviewAll,
      showBulkActions,
      showQuestionMenu,
      markMastered,
      exitReviewMode,
      nextReview,
      prevReview,
      onMasteryChange,
      markReviewedAndNext,
      completeReview
    }
  }
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: var(--color-bg-primary, #f7f8fa);
}

/* 筛选栏 */
.filter-bar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 16px 8px;
}

.filter-chips {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: 8px;
}

.filter-chips.expanded {
  flex-wrap: wrap;
}

.filter-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: flex-end;
}

.search-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-secondary, #f0f0f5);
  border-radius: 50%;
  font-size: 16px;
  cursor: pointer;
}

.search-btn:active {
  background: var(--color-border, #e8e8f0);
}

/* 搜索框 */
.search-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px 8px;
  animation: slideDown 0.2s ease;
}

@keyframes slideDown {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

.search-input {
  flex: 1;
  height: 36px;
  padding: 0 12px;
  background: #fff;
  border: 1px solid var(--color-border, #e8e8f0);
  border-radius: 18px;
  font-size: 14px;
  outline: none;
}

.search-cancel {
  padding: 0 12px;
  font-size: 14px;
  color: var(--color-primary, #4a6cf7);
  font-weight: 500;
}

/* 二级筛选 */
.secondary-filters {
  padding: 8px 16px 0;
  animation: slideDown 0.2s ease;
}

.filter-group {
  margin-bottom: 12px;
}

.filter-group-label {
  display: block;
  font-size: 12px;
  color: #999;
  margin-bottom: 8px;
}

.filter-chips-inline {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* 统计概览 */
.stats-overview {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  padding: 0 16px 16px;
}

/* 题目列表 */
.questions-section {
  padding: 0 16px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a2e;
}

.section-count {
  font-size: 13px;
  color: #999;
}

.questions-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.question-card {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  border: 1px solid var(--color-border, #e8e8f0);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.question-card:active {
  background: #f5f5f5;
}

.question-main {
  flex: 1;
  min-width: 0;
}

.question-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.question-subject {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  background: var(--color-primary-light, rgba(74, 108, 247, 0.1));
  color: var(--color-primary, #4a6cf7);
  border-radius: 6px;
}

.question-content {
  font-size: 14px;
  color: #1a1a2e;
  line-height: 1.5;
  margin-bottom: 8px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.question-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.question-kp {
  font-size: 11px;
  color: #4a6cf7;
  background: var(--color-primary-light, rgba(74, 108, 247, 0.1));
  padding: 2px 8px;
  border-radius: 8px;
}

.question-time {
  font-size: 11px;
  color: #999;
  margin-left: auto;
}

.question-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
  align-items: flex-end;
}

.question-menu {
  font-size: 18px;
  color: #ccc;
  padding: 4px;
  cursor: pointer;
}

.question-menu:active {
  color: #999;
}

/* 复习模式 */
.review-overlay {
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

.review-container {
  width: 100%;
  max-width: 400px;
  max-height: 90vh;
  background: #fff;
  border-radius: 20px;
  padding: 24px;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  animation: slideUp 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

.review-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.review-title {
  font-size: 18px;
  font-weight: 600;
  color: #1a1a2e;
}

.review-progress {
  font-size: 13px;
  color: #999;
}

.review-close {
  font-size: 22px;
  color: #999;
  padding: 4px;
  cursor: pointer;
}

.review-question {
  margin: 16px 0;
}

.review-question-text {
  display: block;
  font-size: 16px;
  color: #1a1a2e;
  line-height: 1.6;
  margin-bottom: 16px;
}

.review-answer {
  background: #f5f5f5;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
}

.review-answer-label {
  display: block;
  font-size: 12px;
  color: #999;
  margin-bottom: 4px;
}

.review-answer-user {
  display: block;
  font-size: 15px;
  font-weight: 500;
  color: #ff4d4f;
  margin-bottom: 12px;
}

.review-answer-user.correct {
  color: #52c41a;
}

.review-answer-correct {
  display: block;
  font-size: 15px;
  font-weight: 600;
  color: #52c41a;
  margin-bottom: 8px;
}

.review-explanation {
  display: block;
  font-size: 13px;
  color: #666;
  line-height: 1.6;
  padding-top: 12px;
  border-top: 1px solid var(--color-border, #e8e8f0);
}

.review-mastery {
  margin-bottom: 20px;
}

.review-mastery-label {
  display: block;
  font-size: 13px;
  color: #666;
  margin-bottom: 8px;
}

.mastery-slider {
  width: 100%;
}

.review-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.review-actions .chip {
  flex: 1;
  min-width: 80px;
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

  .question-card,
  .review-container {
    background: var(--color-bg-card, #252542);
    border-color: var(--color-border, #3d3d5c);
  }

  .question-card:active {
    background: var(--color-bg-elevated, #2d2d4a);
  }

  .question-content,
  .review-title,
  .review-question-text {
    color: var(--color-text-primary, #e8e8f0);
  }

  .question-kp {
    background: rgba(124, 148, 255, 0.15);
    color: #7c94ff;
  }

  .question-time {
    color: var(--color-text-tertiary, #888);
  }

  .search-input {
    background: var(--color-bg-card, #252542);
    border-color: var(--color-border, #3d3d5c);
    color: var(--color-text-primary, #e8e8f0);
  }

  .review-answer {
    background: var(--color-bg-elevated, #2d2d4a);
  }

  .review-explanation {
    border-color: var(--color-border, #3d3d5c);
  }

  .stats-overview .stat-card {
    background: var(--color-bg-card, #252542);
    border-color: var(--color-border, #3d3d5c);
  }

  .stat-card.outline {
    background: transparent;
  }
}
</style>