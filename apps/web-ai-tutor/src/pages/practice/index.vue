<template>
  <ErrorBoundary :showDetails="true" :logError="true" :fallback="fallbackContent">
    <view class="page">
      <PageHeader
        title="练习中心"
        subtitle="自适应练习，精准提分"
        :actions="[{ label: '练习记录', handler: goToHistory }]"
      />

      <!-- 模式选择 -->
      <view class="mode-selector">
        <view
          v-for="(mode, key) in practiceModes"
          :key="key"
          class="mode-card"
          :class="{ active: practiceStore.currentMode === key, 'touch-active': touchModeKey === key }"
          @click="selectMode(key)"
          @touchstart="onModeTouchStart(key)"
          @touchend="onModeTouchEnd"
        >
          <view class="mode-icon">{{ mode.icon }}</view>
          <view class="mode-info">
            <text class="mode-name">{{ mode.name }}</text>
            <text class="mode-desc">{{ mode.desc }}</text>
          </view>
          <view class="mode-check" v-if="practiceStore.currentMode === key">✓</view>
        </view>
      </view>

      <!-- 学科/主题选择 -->
      <view class="topic-selector">
        <view class="selector-label">学科</view>
        <view class="selector-row">
          <view
            v-for="subject in subjects"
            :key="subject.id"
            class="chip-wrapper"
            :class="{ 'chip-selected': practiceStore.currentSubject === subject.id }"
            @click="selectSubject(subject.id)"
          >
            <Chip
              :label="`${subject.icon} ${subject.name}`"
              :color="subject.id"
              :variant="practiceStore.currentSubject === subject.id ? 'filled' : 'outlined'"
              size="small"
            />
          </view>
        </view>

        <view class="selector-row" v-if="topics.length > 0">
          <view class="selector-label">主题</view>
          <view
            class="chip-wrapper"
            :class="{ 'chip-selected': !practiceStore.currentTopicId }"
            @click="selectTopic(null)"
          >
            <Chip
              label="全部主题"
              :variant="!practiceStore.currentTopicId ? 'filled' : 'outlined'"
              color="blue"
              size="small"
            />
          </view>
          <view
            v-for="topic in topics"
            :key="topic.id"
            class="chip-wrapper"
            :class="{ 'chip-selected': practiceStore.currentTopicId === topic.id }"
            @click="selectTopic(topic.id)"
          >
            <Chip
              :label="topic.name"
              :color="topic.id"
              variant="outlined"
              size="small"
            />
          </view>
        </view>
      </view>

      <!-- 开始练习按钮 -->
      <view class="start-section" v-if="!practiceStore.currentSession">
        <LoadingSkeleton v-if="practiceStore.loading" variant="card" rows="4" />
        <view v-else class="session-preview">
          <view class="preview-item">
            <text class="preview-label">题目数量</text>
            <text class="preview-value">{{ currentModeInfo.questions }}</text>
          </view>
          <view class="preview-item" v-if="currentModeInfo.timed">
            <text class="preview-label">时间限制</text>
            <text class="preview-value">{{ formatTime(currentModeInfo.timeLimit || 30 * 60) }}</text>
          </view>
          <view class="preview-item">
            <text class="preview-label">预计耗时</text>
            <text class="preview-value">{{ currentModeInfo.questions * 1.5 }} 分钟</text>
          </view>
          <view class="preview-item">
            <text class="preview-label">可获得 XP</text>
            <text class="preview-value">{{ currentModeInfo.questions * 10 }}</text>
          </view>
        </view>

        <Chip
          class="start-btn"
          :label="practiceStore.loading ? '加载中...' : `开始 ${currentModeInfo.name}`"
          color="blue"
          variant="filled"
          size="large"
          @click="startPractice"
          :disabled="practiceStore.loading"
        />
      </view>

      <!-- 练习进行中 -->
      <view class="session-active" v-if="practiceStore.currentSession">
        <LoadingSkeleton v-if="practiceStore.loading" variant="card" rows="5" />
        <view v-else>
          <!-- 顶部进度栏 -->
        <view class="session-header">
          <view class="session-progress-bar">
            <ProgressRing
              :value="sessionProgress"
              :max="100"
              :size="44"
              :stroke-width="4"
              :color="primaryColor"
              :show-value="true"
            />
          </view>
          <view class="session-info">
            <text class="session-mode">{{ currentModeInfo.name }}</text>
            <text class="session-count">{{ currentQuestionIndex + 1 }} / {{ totalQuestions }}</text>
          </view>
          <view class="session-timer" v-if="remainingTime !== null">
            <text :class="['timer-text', isTimeUp ? 'time-up' : '']">{{ formatTime(remainingTime) }}</text>
          </view>
        </view>

        <!-- 题目区域 -->
        <scroll-view class="question-area" scroll-y="true" style="flex: 1;">
          <view class="question-card" v-if="currentQuestion">
            <view class="question-header">
              <Chip
                :label="getQuestionTypeLabel(currentQuestion.type)"
                color="blue"
                variant="soft"
                size="small"
              />
              <Chip
                v-if="currentQuestion.difficulty"
                :label="`难度 ${'⭐'.repeat(currentQuestion.difficulty)}`"
                color="orange"
                variant="soft"
                size="small"
              />
            </view>

            <rich-text class="question-content" :nodes="formatQuestionContent(currentQuestion.content)" />

            <!-- 选项 -->
            <view class="options-area" v-if="currentQuestion.options && currentQuestion.options.length > 0">
              <view
                v-for="(option, optIndex) in currentQuestion.options"
                :key="optIndex"
                class="option-item"
                :class="{
                  selected: selectedOption === optIndex,
                  correct: showAnswer && optIndex === correctOptionIndex,
                  incorrect: showAnswer && selectedOption === optIndex && optIndex !== correctOptionIndex
                }"
                @click="selectOption(optIndex)"
              >
                <view class="option-marker">
                  <text v-if="showAnswer && optIndex === correctOptionIndex">✓</text>
                  <text v-else-if="showAnswer && selectedOption === optIndex && optIndex !== correctOptionIndex">✕</text>
                  <text v-else>{{ String.fromCharCode(65 + optIndex) }}</text>
                </view>
                <rich-text class="option-text" :nodes="option" />
              </view>
            </view>

            <!-- 填空输入 -->
            <view class="input-area" v-else-if="currentQuestion.type === 'fill' || currentQuestion.type === 'short'">
              <input
                class="answer-input"
                v-model="fillAnswer"
                :placeholder="currentQuestion.type === 'fill' ? '填写答案...' : '输入解答...'"
                @confirm="submitFillAnswer"
                :disabled="showAnswer"
              />
            </view>

            <!-- 答案解析 -->
            <view class="explanation-area" v-if="showAnswer">
              <view class="explanation-header">
                <text class="explanation-title">解析</text>
                <Chip
                  :label="isCorrect ? '回答正确' : '回答错误'"
                  :color="isCorrect ? 'green' : 'red'"
                  variant="filled"
                  size="small"
                />
              </view>
              <view class="explanation-content">
                <rich-text v-if="currentQuestion.explanation" :nodes="currentQuestion.explanation" />
                <text v-else>暂无解析</text>
              </view>
              <view class="explanation-related" v-if="currentQuestion.relatedKnowledge">
                <text class="explanation-title">相关知识点</text>
                <Chip
                  v-for="kp in currentQuestion.relatedKnowledge"
                  :key="kp.id || kp"
                  :label="kp.name || kp"
                  color="blue"
                  variant="outlined"
                  size="small"
                />
              </view>
            </view>
          </view>
        </scroll-view>

        <!-- 底部操作栏 -->
        <view class="session-actions">
          <Chip
            v-if="currentQuestionIndex > 0"
            label="上一题"
            color="gray"
            variant="outlined"
            @click="prevQuestion"
          />
          <Chip
            v-if="!showAnswer"
            :label="currentQuestionIndex === totalQuestions - 1 ? '提交' : '下一题'"
            color="blue"
            variant="filled"
            @click="handleNext"
          />
          <Chip
            v-else
            :label="currentQuestionIndex === totalQuestions - 1 ? '完成练习' : '下一题'"
            color="blue"
            variant="filled"
            @click="handleNext"
          />
          <Chip
            v-if="showAnswer && currentQuestion.explanation"
            label="查看解析"
            color="purple"
            variant="soft"
            @click="scrollToExplanation"
          />
        </view>

        <!-- 题目导航 -->
        <view class="question-nav">
          <text class="nav-label">题目导航</text>
          <view class="nav-dots">
            <view
              v-for="(q, idx) in practiceStore.currentSession.questions"
              :key="idx"
              class="nav-dot"
              :class="{
                current: idx === currentQuestionIndex,
                answered: sessionAnswers[idx] !== undefined,
                correct: sessionAnswers[idx]?.isCorrect,
                incorrect: sessionAnswers[idx] && !sessionAnswers[idx].isCorrect
              }"
              @click="goToQuestion(idx)"
            />
          </view>
        </view>
      </view>
      </view>

      <!-- 练习完成 -->
      <view class="session-complete" v-if="showComplete">
        <view class="complete-card">
          <view class="complete-icon">{{ completeIcon }}</view>
          <text class="complete-title">{{ completeTitle }}</text>
          <text class="complete-subtitle">{{ completeSubtitle }}</text>

          <view class="complete-stats">
            <StatCard
              label="正确率"
              :value="sessionStats.accuracy"
              :sublabel="percentSign"
              icon="🎯"
              :icon-bg="successColor"
            />
            <StatCard
              label="用时"
              :value="formatTime(sessionDuration)"
              icon="⏱"
              :icon-bg="primaryIconBg"
            />
            <StatCard
              label="获得 XP"
              :value="earnedXP"
              icon="⭐"
              :icon-bg="purpleIconBg"
            />
          </view>

          <view class="complete-actions">
            <Chip
              label="再练一组"
              color="blue"
              variant="filled"
              size="large"
              @click="restartSameMode"
            />
            <Chip
              label="查看错题"
              color="red"
              variant="outlined"
              size="large"
              @click="goToWrongQuestions"
            />
            <Chip
              label="返回首页"
              color="gray"
              variant="outlined"
              size="large"
              @click="goHome"
            />
          </view>
        </view>
      </view>

      <!-- 练习历史入口 -->
      <view class="history-section" v-if="practiceStore.history.length > 0">
        <PageHeader title="最近练习" subtitle="查看历史记录" :actions="[{ label: '全部', handler: goToHistory }]" />
        <view class="history-list">
          <view
            v-for="(session, index) in practiceStore.history.slice(0, 5)"
            :key="index"
            class="history-item"
          >
            <view class="history-icon" :style="{ background: modeColors[session.mode] }">
              <text>{{ modeIcons[session.mode] }}</text>
            </view>
            <view class="history-info">
              <text class="history-mode">{{ modeNames[session.mode] }}</text>
              <text class="history-detail">{{ session.subject }} · {{ session.answers.length }}题 · {{ formatDate(session.completedAt) }}</text>
            </view>
            <view class="history-stats">
              <text :class="['history-accuracy', session.stats.accuracy >= 80 ? 'good' : session.stats.accuracy >= 60 ? 'ok' : 'bad']">
                {{ session.stats.accuracy }}%
              </text>
              <text class="history-xp">+{{ session.stats.correct * 10 }} XP</text>
            </view>
          </view>
        </view>
      </view>

      <view class="safe-area" />
    </view>
  </ErrorBoundary>
</template>

<script>
import { ref, computed, onMounted, nextTick, h } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { usePracticeStore } from '@/store/practice'
import { useUserStore } from '@/store/user'
import { listSubjects, getKnowledgePoints } from '@/api/index.js'
import PageHeader from '@/components/ui/PageHeader.vue'
import Chip from '@/components/ui/Chip.vue'
import StatCard from '@/components/ui/StatCard.vue'
import ProgressRing from '@/components/ui/ProgressRing.vue'
import LoadingSkeleton from '@/components/ui/LoadingSkeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorBoundary from '@/components/ErrorBoundary.vue'

export default {
  name: 'Practice',
  components: {
    PageHeader,
    Chip,
    StatCard,
    ProgressRing,
    LoadingSkeleton,
    EmptyState,
    ErrorBoundary
  },
  setup() {
    const practiceStore = usePracticeStore()
    const userStore = useUserStore()

    const showComplete = ref(false)
    const selectedOption = ref(null)
    const fillAnswer = ref('')
    const showAnswer = ref(false)
    const isCorrect = ref(false)
    const correctOptionIndex = ref(-1)
    const sessionDuration = ref(0)
    const earnedXP = ref(0)

    // 练习模式配置
    const practiceModes = {
      quick: { name: '快速练习', desc: '5-10道随机题目，适合碎片时间', icon: '⚡', questions: 10 },
      topic: { name: '专项突破', desc: '针对特定知识点深度练习', icon: '🎯', questions: 15 },
      mock: { name: '模拟考试', desc: '限时混合题目，实战演练', icon: '📝', questions: 20, timed: true, timeLimit: 30 * 60 },
      review: { name: '间隔复习', desc: '基于遗忘曲线的智能复习', icon: '🔄', questions: 20 },
      weakness: { name: '薄弱攻克', desc: '针对错题薄弱点专项训练', icon: '💪', questions: 15 }
    }

    // 学科清单：真源 /api/curriculum/subjects（DB code 为大写 MATH/PHYS/…，前端用小写 code 与题库对齐）
    const SUBJECT_ICONS = { math: '📐', phys: '⚡', chem: '🧪', bio: '🧬', eng: '📖', chn: '📝' }
    const subjects = ref([
      { id: 'math', name: '数学', icon: '📐' },
      { id: 'phys', name: '物理', icon: '⚡' },
      { id: 'chem', name: '化学', icon: '🧪' },
      { id: 'bio', name: '生物', icon: '🧬' },
      { id: 'eng', name: '英语', icon: '📖' },
      { id: 'chn', name: '语文', icon: '📝' }
    ])

    // 主题 = 教材章节（由知识点 chapter_id 去重；后端按 chapterId 过滤题库）
    const topics = ref([])

    const loadSubjects = async () => {
      try {
        const list = await listSubjects()
        if (Array.isArray(list) && list.length) {
          subjects.value = list.map(s => {
            const code = String(s.code || '').toLowerCase()
            return { id: code, name: s.name, icon: SUBJECT_ICONS[code] || '📘' }
          })
        }
      } catch (e) { /* 保持默认静态清单 */ }
    }

    const loadTopics = async (subjectId) => {
      try {
        const kps = await getKnowledgePoints({ subject: subjectId })
        const seen = new Map()
        for (const kp of (kps || [])) {
          if (kp.chapter_id && !seen.has(kp.chapter_id)) {
            seen.set(kp.chapter_id, { id: kp.chapter_id, name: kp.chapter_name || '未命名章节' })
          }
        }
        topics.value = Array.from(seen.values())
      } catch (e) {
        topics.value = []
      }
    }

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

    const currentModeInfo = computed(() => practiceModes[practiceStore.currentMode])
    const currentQuestion = computed(() => practiceStore.currentQuestion)
    const currentQuestionIndex = computed(() => practiceStore.currentQuestionIndex)
    const totalQuestions = computed(() => practiceStore.currentSession?.questions?.length || 0)
    const sessionProgress = computed(() => practiceStore.sessionProgress)
    const remainingTime = computed(() => practiceStore.remainingTime)
    const isTimeUp = computed(() => practiceStore.isTimeUp)
    const sessionAnswers = computed(() => practiceStore.sessionAnswers)
    const sessionStats = computed(() => practiceStore.sessionStats)

    const primaryColor = computed(() => '#4a6cf7')

    // 百分号（避免模板解析问题）
    const percentSign = '%'

    // 触摸状态
    const touchModeKey = ref(null)
    const touchSubjectId = ref(null)
    const touchTopicId = ref(null)

    const successColor = computed(() => '#52c41a')
    const primaryIconBg = computed(() => '#4a6cf7')
    const purpleIconBg = computed(() => '#722ed1')

    const selectMode = (mode) => {
      practiceStore.setMode(mode)
      showComplete.value = false
      // 题库预览（薄弱/复习模式走各自数据源，不用题库）
      if (mode !== 'weakness' && mode !== 'review') practiceStore.loadQuestionBank()
    }

    const selectSubject = (subjectId) => {
      practiceStore.setSubject(subjectId) // 同时清空已选主题
      loadTopics(subjectId)
      practiceStore.loadQuestionBank()
    }

    const selectTopic = (topicId) => {
      practiceStore.setTopic(topicId)
      practiceStore.loadQuestionBank()
    }

    // 触摸处理 - 增加触摸反馈
    const onModeTouchStart = (key) => {
      touchModeKey.value = key
    }

    const onModeTouchEnd = () => {
      touchModeKey.value = null
    }

    const emptyHints = {
      weakness: '暂无错题，先去练习几道吧',
      review: '暂无待复习内容',
      topic: '该章节暂无题目，换个主题试试',
      default: '暂无可用题目，换个学科试试'
    }

    const startPractice = async () => {
      showComplete.value = false
      selectedOption.value = null
      fillAnswer.value = ''
      showAnswer.value = false

      try {
        await practiceStore.startSession(practiceStore.currentMode)
        if (!practiceStore.currentSession?.questions?.length) {
          practiceStore.resetSession()
          uni.showToast({ title: emptyHints[practiceStore.currentMode] || emptyHints.default, icon: 'none' })
        }
      } catch (e) {
        uni.showToast({ title: '加载题目失败', icon: 'none' })
      }
    }

    const selectOption = (index) => {
      if (showAnswer.value) return
      selectedOption.value = index
    }

    const submitFillAnswer = () => {
      if (!fillAnswer.value.trim() || showAnswer.value) return
      handleNext()
    }

    const handleNext = async () => {
      if (!practiceStore.currentQuestion) return

      if (!showAnswer.value) {
        // 提交答案
        let answer
        if (practiceStore.currentQuestion.type === 'choice') {
          if (selectedOption.value === null) {
            uni.showToast({ title: '请选择答案', icon: 'none' })
            return
          }
          answer = selectedOption.value
          correctOptionIndex.value = practiceStore.currentQuestion.answerIndex
        } else {
          answer = fillAnswer.value.trim()
        }

        const result = await practiceStore.submitAnswer(answer)
        isCorrect.value = result.isCorrect
        showAnswer.value = true
        selectedOption.value = null
        fillAnswer.value = ''

        // 更新用户进度
        if (isCorrect.value) {
          userStore.addXP(10, '练习答题正确')
        } else {
          userStore.addXP(2, '练习答题')
        }
      } else {
        // 下一题或完成
        if (currentQuestionIndex.value >= totalQuestions.value - 1) {
          await completeSession()
        } else {
          practiceStore.nextQuestion()
          showAnswer.value = false
          selectedOption.value = null
          fillAnswer.value = ''
        }
      }
    }

    const prevQuestion = () => {
      practiceStore.prevQuestion()
      showAnswer.value = false
      selectedOption.value = null
      fillAnswer.value = ''
    }

    const goToQuestion = (index) => {
      if (practiceStore.goToQuestion(index)) {
        showAnswer.value = false
        selectedOption.value = null
        fillAnswer.value = ''
      }
    }

    const completeSession = async () => {
      const result = await practiceStore.completeSession()
      if (result) {
        sessionDuration.value = result.duration
        earnedXP.value = result.stats.correct * 10 + (result.stats.accuracy >= 100 ? 100 : 0)
        showComplete.value = true

        // 记录学习会话
        userStore.recordStudySession(
          Math.ceil(result.duration / 60),
          result.answers.length,
          result.stats.correct
        )
      }
    }

    const scrollToExplanation = () => {
      // 滚动到解析区域
      uni.pageScrollTo({
        selector: '.explanation-area',
        duration: 300
      })
    }

    const restartSameMode = () => {
      showComplete.value = false
      startPractice()
    }

    const goToWrongQuestions = () => {
      uni.navigateTo({ url: '/pages/wrong-questions/index' })
    }

    const goHome = () => {
      showComplete.value = false
      uni.switchTab({ url: '/pages/index/index' })
    }

    const goToHistory = () => {
      uni.navigateTo({ url: '/pages/practice/history' })
    }

    const formatTime = (seconds) => {
      if (seconds < 60) return `${seconds}秒`
      const mins = Math.floor(seconds / 60)
      const secs = seconds % 60
      return secs > 0 ? `${mins}分${secs}秒` : `${mins}分钟`
    }

    const formatDate = (dateStr) => {
      if (!dateStr) return ''
      const date = new Date(dateStr)
      const now = new Date()
      const diff = now - date

      if (diff < 86400000) return '今天'
      if (diff < 172800000) return '昨天'
      return `${date.getMonth() + 1}月${date.getDate()}日`
    }

    const getQuestionTypeLabel = (type) => {
      const labels = {
        choice: '单选题',
        multiple: '多选题',
        fill: '填空题',
        short: '简答题'
      }
      return labels[type] || '题目'
    }

    const formatQuestionContent = (content) => {
      if (!content) return ''
      // 简单的 HTML 转义和格式化
      return content
        .replace(/&/g, '&')
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/\n/g, '<br/>')
        .replace(/\$\$(.*?)\$\$/g, '<div class="math-block">$1</div>')
        .replace(/\$(.*?)\$/g, '<span class="math-inline">$1</span>')
    }

    const completeIcon = computed(() => sessionStats.value.accuracy >= 80 ? '🎉' : sessionStats.value.accuracy >= 60 ? '👍' : '💪')
    const completeTitle = computed(() => sessionStats.value.accuracy >= 80 ? '太棒了！' : sessionStats.value.accuracy >= 60 ? '不错哦' : '继续加油')
    const completeSubtitle = computed(() => `正确率 ${sessionStats.value.accuracy}% · ${sessionStats.value.correct}/${sessionStats.value.total}`)

    onMounted(async () => {
      await loadSubjects()
      loadTopics(practiceStore.currentSubject)
      practiceStore.loadQuestionBank()
      practiceStore.loadSRQueue()
      practiceStore.loadHistory()
    })

    onShow(() => {
      if (practiceStore.currentSession) {
        // 恢复会话状态
      }
    })

    return {
      practiceStore,
      userStore,
      showComplete,
      selectedOption,
      fillAnswer,
      showAnswer,
      isCorrect,
      correctOptionIndex,
      sessionDuration,
      earnedXP,
      practiceModes,
      subjects,
      topics,
      modeColors,
      modeIcons,
      modeNames,
      currentModeInfo,
      currentQuestion,
      currentQuestionIndex,
      totalQuestions,
      sessionProgress,
      remainingTime,
      isTimeUp,
      sessionAnswers,
      sessionStats,
      selectMode,
      selectSubject,
      selectTopic,
      startPractice,
      selectOption,
      submitFillAnswer,
      handleNext,
      prevQuestion,
      goToQuestion,
      completeSession,
      scrollToExplanation,
      restartSameMode,
      goToWrongQuestions,
      goHome,
      goToHistory,
      formatTime,
      formatDate,
      getQuestionTypeLabel,
      formatQuestionContent,
      completeIcon,
      completeTitle,
      completeSubtitle,
      onModeTouchStart,
      onModeTouchEnd,
      touchModeKey,
      fallbackContent: () => h(EmptyState, {
        title: '练习中心加载失败',
        description: '无法加载练习页面，请稍后重试',
        icon: '📝',
        actions: [{ label: '重试', handler: () => location.reload() }]
      })
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

/* 学科/主题选择器 */
.topic-selector {
  padding: 0 16px 16px;
}

.selector-label {
  font-size: 12px;
  color: #999;
  margin: 16px 16px 8px;
  font-weight: 500;
}

.selector-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
  padding: 0 16px;
}

.chip-wrapper {
  display: inline-flex;
  align-items: center;
  transition: transform var(--transition-fast);
}

.chip-wrapper:active {
  transform: scale(0.96);
}

.chip-wrapper.chip-selected .chip--outlined {
  background: var(--color-primary, #4a6cf7);
  color: #fff;
  border-color: var(--color-primary, #4a6cf7);
}

.mode-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  border: 1px solid var(--color-border, #e8e8f0);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.mode-card:active,
.mode-card.touch-active {
  background: #f0f4ff;
  border-color: #4a6cf7;
  transform: scale(0.98);
}

.mode-card.active {
  border-color: #4a6cf7;
  box-shadow: 0 2px 12px rgba(74, 108, 247, 0.15);
}

.mode-icon {
  font-size: 28px;
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-primary-light, rgba(74, 108, 247, 0.1));
  border-radius: 14px;
}

.mode-info {
  flex: 1;
  min-width: 0;
}

.mode-name {
  display: block;
  font-size: 15px;
  font-weight: 600;
  color: #1a1a2e;
  margin-bottom: 2px;
}

.mode-desc {
  display: block;
  font-size: 12px;
  color: #999;
}

.mode-check {
  font-size: 20px;
  color: #4a6cf7;
  font-weight: 700;
}

/* 主题选择器 */
.topic-selector {
  padding: 0 16px 16px;
}

.selector-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
  padding: 0 16px;
}

/* 开始区域 */
.start-section {
  padding: 0 16px 24px;
}

.session-preview {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}

.preview-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 14px;
  background: #fff;
  border-radius: 12px;
  border: 1px solid var(--color-border, #e8e8f0);
}

.preview-label {
  display: block;
  font-size: 11px;
  color: #999;
  margin-bottom: 4px;
}

.preview-value {
  display: block;
  font-size: 18px;
  font-weight: 700;
  color: #4a6cf7;
}

.start-btn {
  width: 100%;
  justify-content: center;
}

/* 练习进行中 */
.session-active {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.session-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #fff;
  border-bottom: 1px solid var(--color-border, #e8e8f0);
  position: sticky;
  top: 0;
  z-index: 10;
}

.session-progress-bar {
  flex-shrink: 0;
}

.session-info {
  flex: 1;
  text-align: center;
  padding: 0 16px;
}

.session-mode {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: #1a1a2e;
}

.session-count {
  display: block;
  font-size: 12px;
  color: #999;
}

.session-timer {
  flex-shrink: 0;
}

.timer-text {
  font-size: 16px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: #4a6cf7;
}

.timer-text.time-up {
  color: #ff4d4f;
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* 题目区域 */
.question-area {
  flex: 1;
  padding: 16px;
}

.question-card {
  background: #fff;
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  border: 1px solid var(--color-border, #e8e8f0);
}

.question-header {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.question-content {
  font-size: 16px;
  line-height: 1.7;
  color: #1a1a2e;
  margin-bottom: 20px;
}

.question-content .math-block {
  display: block;
  text-align: center;
  padding: 12px;
  background: #f5f5f5;
  border-radius: 8px;
  font-family: 'Times New Roman', serif;
  font-size: 18px;
  margin: 8px 0;
}

.question-content .math-inline {
  font-family: 'Times New Roman', serif;
  background: #f5f5f5;
  padding: 2px 6px;
  border-radius: 4px;
}

/* 选项 */
.options-area {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.option-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: #f8f9fa;
  border-radius: 12px;
  border: 1px solid var(--color-border, #e8e8f0);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.option-item:active {
  background: #e9edf5;
}

.option-item.selected {
  background: var(--color-primary-light, rgba(74, 108, 247, 0.1));
  border-color: #4a6cf7;
}

.option-item.correct {
  background: #f6ffed;
  border-color: #52c41a;
}

.option-item.incorrect {
  background: #fff1f0;
  border-color: #ff4d4f;
}

.option-marker {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 13px;
  font-weight: 600;
  flex-shrink: 0;
}

.option-item:not(.selected):not(.correct):not(.incorrect) .option-marker {
  background: #fff;
  border: 2px solid #d9d9d9;
  color: #999;
}

.option-item.selected .option-marker {
  background: #4a6cf7;
  color: #fff;
}

.option-item.correct .option-marker {
  background: #52c41a;
  color: #fff;
}

.option-item.incorrect .option-marker {
  background: #ff4d4f;
  color: #fff;
}

.option-text {
  flex: 1;
  font-size: 15px;
  color: #1a1a2e;
  line-height: 1.5;
}

/* 填空输入 */
.input-area {
  margin-top: 16px;
}

.answer-input {
  width: 100%;
  height: 48px;
  padding: 0 16px;
  background: #fff;
  border: 2px solid var(--color-border, #e8e8f0);
  border-radius: 12px;
  font-size: 16px;
  color: #1a1a2e;
  outline: none;
  transition: border-color var(--transition-fast);
}

.answer-input:focus {
  border-color: #4a6cf7;
  box-shadow: 0 0 0 3px rgba(74, 108, 247, 0.15);
}

/* 解析区域 */
.explanation-area {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--color-border, #e8e8f0);
  animation: slideDown 0.3s ease;
}

@keyframes slideDown {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

.explanation-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.explanation-title {
  font-size: 15px;
  font-weight: 600;
  color: #1a1a2e;
}

.explanation-content {
  font-size: 14px;
  line-height: 1.7;
  color: #333;
  background: #f5f5f5;
  padding: 16px;
  border-radius: 12px;
}

.explanation-related {
  margin-top: 16px;
}

/* 底部操作栏 */
.session-actions {
  display: flex;
  gap: 8px;
  padding: 16px;
  background: #fff;
  border-top: 1px solid var(--color-border, #e8e8f0);
  position: sticky;
  bottom: 0;
  z-index: 10;
}

.session-actions .chip {
  flex: 1;
  text-align: center;
  justify-content: center;
}

/* 题目导航 */
.question-nav {
  padding: 16px;
  background: #fff;
  border-top: 1px solid var(--color-border, #e8e8f0);
}

.nav-label {
  display: block;
  font-size: 12px;
  color: #999;
  margin-bottom: 10px;
}

.nav-dots {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.nav-dot {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 600;
  color: #999;
  background: #f5f5f5;
  border: 1px solid var(--color-border, #e8e8f0);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.nav-dot:active {
  transform: scale(0.95);
}

.nav-dot.current {
  background: #4a6cf7;
  border-color: #4a6cf7;
  color: #fff;
  box-shadow: 0 0 0 3px rgba(74, 108, 247, 0.2);
}

.nav-dot.answered.correct {
  background: #52c41a;
  border-color: #52c41a;
  color: #fff;
}

.nav-dot.answered.incorrect {
  background: #ff4d4f;
  border-color: #ff4d4f;
  color: #fff;
}

.nav-dot.answered {
  background: #e8e8f5;
  border-color: #4a6cf7;
  color: #4a6cf7;
}

/* 完成界面 */
.session-complete {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
}

.complete-card {
  width: 100%;
  max-width: 400px;
  background: #fff;
  border-radius: 24px;
  padding: 32px 24px;
  text-align: center;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

.complete-icon {
  font-size: 64px;
  margin-bottom: 16px;
  animation: bounceIn 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

@keyframes bounceIn {
  from { opacity: 0; transform: scale(0.5); }
  to { opacity: 1; transform: scale(1); }
}

.complete-title {
  display: block;
  font-size: 24px;
  font-weight: 700;
  color: #1a1a2e;
  margin-bottom: 8px;
}

.complete-subtitle {
  display: block;
  font-size: 14px;
  color: #999;
  margin-bottom: 24px;
}

.complete-stats {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
}

.complete-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.complete-actions .chip {
  width: 100%;
  justify-content: center;
}

/* 历史记录 */
.history-section {
  padding-bottom: 16px;
}

.history-list {
  padding: 0 16px;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: #fff;
  border-radius: 12px;
  margin-bottom: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  border: 1px solid var(--color-border, #e8e8f0);
}

.history-icon {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  font-size: 18px;
  flex-shrink: 0;
}

.history-info {
  flex: 1;
  min-width: 0;
}

.history-mode {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: #1a1a2e;
  margin-bottom: 2px;
}

.history-detail {
  display: block;
  font-size: 12px;
  color: #999;
}

.history-stats {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.history-accuracy {
  font-size: 16px;
  font-weight: 700;
}

.history-accuracy.good { color: #52c41a; }
.history-accuracy.ok { color: #faad14; }
.history-accuracy.bad { color: #ff4d4f; }

.history-xp {
  font-size: 12px;
  color: #722ed1;
  font-weight: 600;
}

.safe-area {
  height: 40px;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .page {
    background: var(--color-bg-primary, #1a1a2e);
  }

  .mode-card,
  .question-card,
  .complete-card,
  .history-item,
  .session-header,
  .session-actions,
  .question-nav,
  .preview-item {
    background: var(--color-bg-card, #252542);
    border-color: var(--color-border, #3d3d5c);
  }

  .mode-card:active,
  .question-card:active {
    background: var(--color-bg-elevated, #2d2d4a);
  }

  .mode-name,
  .question-content,
  .option-text,
  .complete-title,
  .history-mode {
    color: var(--color-text-primary, #e8e8f0);
  }

  .mode-desc,
  .session-count,
  .history-detail {
    color: var(--color-text-tertiary, #888);
  }

  .answer-input {
    background: var(--color-bg-card, #252542);
    border-color: var(--color-border, #3d3d5c);
    color: var(--color-text-primary, #e8e8f0);
  }

  .answer-input:focus {
    border-color: #7c94ff;
    box-shadow: 0 0 0 3px rgba(124, 148, 255, 0.15);
  }

  .explanation-content {
    background: var(--color-bg-elevated, #2d2d4a);
  }

  .nav-dot {
    background: var(--color-bg-elevated, #2d2d4a);
    border-color: var(--color-border, #3d3d5c);
    color: var(--color-text-tertiary, #888);
  }

  .nav-dot.answered {
    background: rgba(124, 148, 255, 0.15);
    border-color: #7c94ff;
    color: #7c94ff;
  }

  .timer-text {
    color: #7c94ff;
  }

  .timer-text.time-up {
    color: #ff7875;
  }

  .preview-value {
    color: #7c94ff;
  }
}
</style>