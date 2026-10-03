/**
 * 练习中心状态管理 (Pinia Store)
 * 管理题库、练习模式、间隔重复队列、练习记录
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getQuestionBank, submitPracticeAnswer, getSpacedRepetitionQueue, startPracticeSession, completePracticeSession, getPracticeHistory } from '@/api/index.js'
import { useUserStore } from './user.js'
import { useTwinStore } from './twin.js'

// 学生业务主键统一从 user store 解出
function currentStudentId() {
  return useUserStore().studentId
}

// 练习模式
const PRACTICE_MODES = {
  quick: { name: '快速练习', desc: '5-10道随机题目', icon: '⚡', questions: 10 },
  topic: { name: '专项突破', desc: '针对特定知识点', icon: '🎯', questions: 15 },
  mock: { name: '模拟考试', desc: '限时混合题目', icon: '📝', questions: 20, timed: true },
  review: { name: '间隔复习', desc: '到期复习卡片', icon: '🔄', questions: 20 },
  weakness: { name: '薄弱攻克', desc: '针对错题薄弱点', icon: '💪', questions: 15 }
}

export const usePracticeStore = defineStore('practice', () => {
  // ─── State ───
  const currentMode = ref('quick')
  const currentSubject = ref('math')
  const currentTopicId = ref(null)
  const questionBank = ref([])
  const currentSession = ref(null)
  const currentQuestionIndex = ref(0)
  const sessionAnswers = ref([])
  const sessionStartTime = ref(null)
  const sessionTimeLimit = ref(0) // 秒，0 表示不限时
  const loading = ref(false)
  const error = ref(null)

  // 间隔重复队列
  const srQueue = ref([])
  const srLoading = ref(false)

  // 练习历史
  const history = ref([])

  // ─── Getters ───
  const modeInfo = computed(() => PRACTICE_MODES[currentMode.value])
  const currentQuestion = computed(() =>
    currentSession.value?.questions?.[currentQuestionIndex.value] || null
  )
  const sessionProgress = computed(() => {
    if (!currentSession.value?.questions?.length) return 0
    return ((currentQuestionIndex.value + 1) / currentSession.value.questions.length) * 100
  })
  const totalQuestions = computed(() =>
    currentSession.value?.questions?.length || 0
  )
  const isSessionComplete = computed(() =>
    currentSession.value &&
    currentQuestionIndex.value >= currentSession.value.questions.length - 1 &&
    sessionAnswers.value.length > currentQuestionIndex.value
  )
  const sessionStats = computed(() => {
    if (!currentSession.value) return { correct: 0, total: 0, accuracy: 0 }
    const total = sessionAnswers.value.length
    const correct = sessionAnswers.value.filter(a => a.isCorrect).length
    return {
      correct,
      total,
      accuracy: total > 0 ? Math.round((correct / total) * 100) : 0
    }
  })
  const remainingTime = computed(() => {
    if (!sessionTimeLimit.value || !sessionStartTime.value) return null
    const elapsed = Math.floor((Date.now() - sessionStartTime.value) / 1000)
    return Math.max(0, sessionTimeLimit.value - elapsed)
  })
  const isTimeUp = computed(() => remainingTime.value === 0 && sessionTimeLimit.value > 0)

  // ─── Actions ───
  async function loadQuestionBank(params = {}) {
    loading.value = true
    error.value = null
    try {
      const data = await getQuestionBank({
        subject: currentSubject.value,
        topicId: currentTopicId.value,
        ...params
      })
      questionBank.value = data || []
      return data
    } catch (e) {
      error.value = e.message
      console.error('[Practice] Load question bank failed:', e)
      throw e
    } finally {
      loading.value = false
    }
  }

  async function startSession(mode, options = {}) {
    currentMode.value = mode
    if (options.subject) currentSubject.value = options.subject
    if (options.topicId) currentTopicId.value = options.topicId

    // 确保题库已加载
    if (!questionBank.value.length) {
      await loadQuestionBank()
    }

    // 根据模式选择题目
    let questions = selectQuestionsForMode(mode, options.count)

    // 打乱顺序（复习模式保持 SM-2 排序）
    if (mode !== 'review') {
      questions = shuffleArray([...questions])
    }

    currentSession.value = {
      id: 'session_' + Date.now(),
      mode,
      subject: currentSubject.value,
      topicId: currentTopicId.value,
      questions,
      startTime: Date.now()
    }
    currentQuestionIndex.value = 0
    sessionAnswers.value = []
    sessionStartTime.value = Date.now()
    sessionTimeLimit.value = modeInfo.value.timed ? (options.timeLimit || 30 * 60) : 0

    // 后端记录会话开始
    try {
      await startPracticeSession({
        studentId: currentStudentId(),
        mode,
        subject: currentSubject.value,
        topicId: currentTopicId.value,
        questions: questions.map(q => ({ id: q.id, content: q.content, type: q.type, answer: q.answer, options: q.options, difficulty: q.difficulty }))
      })
    } catch (e) {
      console.warn('[Practice] Start session backend sync failed:', e)
    }

    return currentSession.value
  }

  function selectQuestionsForMode(mode, count) {
    const pool = questionBank.value.filter(q => {
      if (currentSubject.value && q.subject !== currentSubject.value) return false
      if (currentTopicId.value && q.topicId !== currentTopicId.value) return false
      return true
    })

    const limit = count || PRACTICE_MODES[mode]?.questions || 10

    switch (mode) {
      case 'topic':
      case 'weakness':
        return pool.slice(0, limit)
      case 'mock':
        // 混合各难度
        return pool.slice(0, limit)
      case 'review':
        return srQueue.value.slice(0, limit).map(item => item.question)
      default:
        return pool.slice(0, limit)
    }
  }

  function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[array[i], array[j]] = [array[j], array[i]]
    }
    return array
  }

  async function submitAnswer(answer, timeSpent = 0) {
    const question = currentQuestion.value
    if (!question) return

    const isCorrect = checkAnswer(question, answer)

    const answerRecord = {
      questionId: question.id,
      question: question.content,
      userAnswer: answer,
      correctAnswer: question.answer,
      isCorrect,
      timeSpent,
      timestamp: Date.now()
    }

    sessionAnswers.value.push(answerRecord)

    // 同步到后端
    try {
      await submitPracticeAnswer({
        sessionId: currentSession.value.id,
        questionId: question.id,
        answer,
        isCorrect,
        timeSpent
      })
      // 行动挂钩：答完一题即一次「经历」（孪生时间线生长；不阻塞主流程）
      try {
        useTwinStore().performAction('practice', currentTopicId.value, {
          title: '完成练习 1 题',
          text: isCorrect ? '答对了，掌握度累积中。' : '答错了——它已进入错题本，稍后可复习。'
        })
      } catch (e) {
        /* 孪生不可用不致命 */
      }
    } catch (e) {
      console.warn('[Practice] Submit answer failed:', e)
    }

    return answerRecord
  }

  function checkAnswer(question, answer) {
    if (question.type === 'choice' || question.type === 'multiple') {
      if (Array.isArray(answer) && Array.isArray(question.answer)) {
        return answer.sort().join(',') === question.answer.sort().join(',')
      }
      return answer === question.answer
    }
    // 填空/简答 - 模糊匹配或关键词
    if (question.type === 'fill' || question.type === 'short') {
      const keywords = question.keywords || [question.answer]
      const userText = String(answer).toLowerCase()
      return keywords.some(k => userText.includes(String(k).toLowerCase()))
    }
    return String(answer).trim() === String(question.answer).trim()
  }

  function nextQuestion() {
    if (currentSession.value &&
        currentQuestionIndex.value < currentSession.value.questions.length - 1) {
      currentQuestionIndex.value++
      return true
    }
    return false
  }

  function prevQuestion() {
    if (currentQuestionIndex.value > 0) {
      currentQuestionIndex.value--
      return true
    }
    return false
  }

  function goToQuestion(index) {
    if (currentSession.value &&
        index >= 0 &&
        index < currentSession.value.questions.length) {
      currentQuestionIndex.value = index
      return true
    }
    return false
  }

  async function completeSession() {
    if (!currentSession.value) return null

    const endTime = Date.now()
    const duration = Math.floor((endTime - currentSession.value.startTime) / 1000)

    const result = {
      sessionId: currentSession.value.id,
      mode: currentMode.value,
      subject: currentSubject.value,
      topicId: currentTopicId.value,
      questions: currentSession.value.questions,
      answers: sessionAnswers.value,
      stats: sessionStats.value,
      duration,
      completedAt: new Date().toISOString()
    }

    // 保存到历史
    history.value.unshift(result)
    if (history.value.length > 100) history.value.pop()

    // 更新间隔重复队列
    updateSRQueue(result)

    // 后端保存会话完成
    try {
      await completePracticeSession({
        sessionId: currentSession.value.id,
        studentId: currentStudentId(),
        answers: sessionAnswers.value.map(a => ({
          questionId: a.questionId,
          question: a.question,
          userAnswer: a.userAnswer,
          correctAnswer: a.correctAnswer,
          isCorrect: a.isCorrect,
          timeSpent: a.timeSpent
        })),
        stats: sessionStats.value,
        duration
      })
    } catch (e) {
      console.warn('[Practice] Complete session backend sync failed:', e)
    }

    // 清理当前会话
    const completedSession = { ...currentSession.value }
    currentSession.value = null
    currentQuestionIndex.value = 0
    sessionAnswers.value = []
    sessionStartTime.value = null
    sessionTimeLimit.value = 0

    return result
  }

  function updateSRQueue(sessionResult) {
    sessionResult.answers.forEach(a => {
      const existingIndex = srQueue.value.findIndex(item => item.questionId === a.questionId)
      const interval = calculateSM2Interval(a.isCorrect, existingIndex >= 0 ? srQueue.value[existingIndex] : null)

      const srItem = {
        questionId: a.questionId,
        question: sessionResult.questions.find(q => q.id === a.questionId),
        lastReviewed: Date.now(),
        interval, // 天数
        easeFactor: existingIndex >= 0 ? srQueue.value[existingIndex].easeFactor : 2.5,
        repetitions: existingIndex >= 0 ? srQueue.value[existingIndex].repetitions + 1 : 1,
        nextReview: Date.now() + interval * 86400000
      }

      if (existingIndex >= 0) {
        srQueue.value[existingIndex] = srItem
      } else {
        srQueue.value.push(srItem)
      }
    })

    // 按下次复习时间排序
    srQueue.value.sort((a, b) => a.nextReview - b.nextReview)
  }

  // SM-2 算法简化版
  function calculateSM2Interval(isCorrect, existingItem) {
    if (!isCorrect) return 0 // 重置为当天复习

    const reps = existingItem?.repetitions || 0
    const ef = existingItem?.easeFactor || 2.5

    let newInterval
    if (reps === 0) newInterval = 1
    else if (reps === 1) newInterval = 6
    else newInterval = Math.round((existingItem?.interval || 6) * ef)

    // 更新 ease factor（简化）
    // 实际 SM-2 会根据质量评分调整，这里简化处理
    return Math.min(newInterval, 365) // 最大一年
  }

  async function loadSRQueue() {
    srLoading.value = true
    try {
      const data = await getSpacedRepetitionQueue(currentStudentId())
      srQueue.value = data || []
    } catch (e) {
      console.error('[Practice] Load SR queue failed:', e)
      srQueue.value = []
    } finally {
      srLoading.value = false
    }
  }

  function getDueReviews() {
    const now = Date.now()
    return srQueue.value.filter(item => item.nextReview <= now)
  }

  function getUpcomingReviews(days = 7) {
    const now = Date.now()
    const limit = now + days * 86400000
    return srQueue.value
      .filter(item => item.nextReview > now && item.nextReview <= limit)
      .sort((a, b) => a.nextReview - b.nextReview)
  }

  async function loadHistory() {
    try {
      const data = await getPracticeHistory(currentStudentId(), { limit: 100 })
      if (data?.sessions) {
        history.value = data.sessions
      }
    } catch (e) {
      console.error('[Practice] Load history failed:', e)
    }
  }

  function setMode(mode) {
    currentMode.value = mode
  }

  function setSubject(subject) {
    currentSubject.value = subject
    currentTopicId.value = null
  }

  function setTopic(topicId) {
    currentTopicId.value = topicId
  }

  function resetSession() {
    currentSession.value = null
    currentQuestionIndex.value = 0
    sessionAnswers.value = []
    sessionStartTime.value = null
    sessionTimeLimit.value = 0
  }

  function reset() {
    currentMode.value = 'quick'
    currentSubject.value = 'math'
    currentTopicId.value = null
    questionBank.value = []
    currentSession.value = null
    currentQuestionIndex.value = 0
    sessionAnswers.value = []
    sessionStartTime.value = null
    sessionTimeLimit.value = 0
    srQueue.value = []
    history.value = []
    loading.value = false
    error.value = null
  }

  return {
    // State
    currentMode,
    currentSubject,
    currentTopicId,
    questionBank,
    currentSession,
    currentQuestionIndex,
    sessionAnswers,
    sessionStartTime,
    sessionTimeLimit,
    loading,
    error,
    srQueue,
    srLoading,
    history,

    // Getters
    modeInfo,
    currentQuestion,
    sessionProgress,
    totalQuestions,
    isSessionComplete,
    sessionStats,
    remainingTime,
    isTimeUp,

    // Actions
    loadQuestionBank,
    startSession,
    submitAnswer,
    nextQuestion,
    prevQuestion,
    goToQuestion,
    completeSession,
    loadSRQueue,
    getDueReviews,
    getUpcomingReviews,
    loadHistory,
    setMode,
    setSubject,
    setTopic,
    resetSession,
    reset
  }
})

// 持久化配置
usePracticeStore.persist = {
  key: 'gri-practice',
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
        console.error('practice store persist failed:', e)
      }
    }
  },
  paths: [
    'currentMode', 'currentSubject', 'currentTopicId',
    'srQueue', 'history',
    'questionBank', 'currentSession', 'currentQuestionIndex',
    'sessionAnswers', 'sessionStartTime', 'sessionTimeLimit'
  ]
}

export default usePracticeStore