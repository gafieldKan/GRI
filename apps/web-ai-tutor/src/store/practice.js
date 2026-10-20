/**
 * 练习中心状态管理 (Pinia Store)
 * 管理题库、练习模式、间隔重复队列、练习记录
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getQuestionBank, submitPracticeAnswer, getSpacedRepetitionQueue, getWeaknessQuestions, startPracticeSession, completePracticeSession, getPracticeHistory } from '@/api/index.js'
import { useUserStore } from './user.js'
import { useTwinStore } from './twin.js'

// 学生业务主键统一从 user store 解出
function currentStudentId() {
  return useUserStore().studentId
}

/**
 * 题面归一化：抹平后端/历史数据形态差异。
 *  - 题型：multiple-choice → choice（种子题 type='multiple-choice'，UI 用 'choice'）
 *  - 选项：['x'] 或 [{text:'A. x'}] → ['x']（兼容两种历史形态）
 *  - 答案：字母 'C' → 下标 answerIndex（A=0,B=1…）；否则按选项文本兜底匹配
 *  - 解析：explanation 优先，回退 analysis（库内两列并存）
 */
export function normalizeQuestion(raw) {
  if (!raw) return null
  const options = (Array.isArray(raw.options) ? raw.options : [])
    .map((o) => (typeof o === 'string' ? o : (o?.text ?? '')))
    .filter((t) => t !== '')

  let type = raw.type || 'choice'
  if (type === 'multiple-choice' || type === 'choice') type = 'choice'
  else if (type === 'fill' || type === 'fill-blank') type = 'fill'
  else if (type === 'short-answer' || type === 'short' || type === 'essay') type = 'short'

  const rawAnswer = raw.answer == null ? '' : String(raw.answer)
  let answerIndex = -1
  if (options.length) {
    const letter = rawAnswer.trim()
    if (/^[A-Za-z]$/.test(letter)) answerIndex = letter.toUpperCase().charCodeAt(0) - 65
    if (answerIndex < 0 || answerIndex >= options.length) {
      answerIndex = options.findIndex((o) => o === rawAnswer || o.includes(rawAnswer) || rawAnswer.includes(o))
    }
  }

  return {
    ...raw,
    type,
    options,
    answer: rawAnswer,
    answerIndex,
    explanation: raw.explanation || raw.analysis || ''
  }
}

/**
 * 判题（与题面归一化同源）：判定必须只有一条口径——练习页与洞窟闭环共用本函数，
 * 任何第二套判定都会让「掌握度 / 光脉」撒谎。纯函数（不依赖 store 状态），故提到模块层导出。
 *  - 选择：下标直比；字母 A/B/C… → 下标；否则退回选项文本 / 答案文本比对
 *  - 填空/简答：关键词包含
 */
export function checkAnswer(question, answer) {
  if (!question) return false
  if (question.type === 'choice') {
    // 前端以选项「下标」作答；归一化后 answerIndex 由字母答案推导而来
    if (typeof answer === 'number') return answer === question.answerIndex
    const norm = String(answer ?? '').trim().toUpperCase()
    if (question.answerIndex >= 0) {
      if (/^[A-Z]$/.test(norm)) return norm.charCodeAt(0) - 65 === question.answerIndex
      return answer === question.options?.[question.answerIndex]
    }
    return norm === String(question.answer).trim().toUpperCase()
  }
  // 填空/简答 - 模糊匹配或关键词
  if (question.type === 'fill' || question.type === 'short') {
    const keywords = question.keywords || [question.answer]
    const userText = String(answer).toLowerCase()
    return keywords.some(k => userText.includes(String(k).toLowerCase()))
  }
  return String(answer).trim() === String(question.answer).trim()
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

  // 薄弱攻克池（未解决错题 → 完整题面）
  const weaknessPool = ref([])

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
        // 主题=教材章节：章节 uuid 作为 chapterId 过滤；未选主题则不出该条件
        chapterId: currentTopicId.value || undefined,
        limit: 50,
        ...params
      })
      questionBank.value = (data || []).map(normalizeQuestion)
      return questionBank.value
    } catch (e) {
      error.value = e.message
      console.error('[Practice] Load question bank failed:', e)
      throw e
    } finally {
      loading.value = false
    }
  }

  /** 薄弱攻克池：未解决错题 → 完整题面（含选项/答案/解析）。 */
  async function loadWeaknessPool(params = {}) {
    try {
      const data = await getWeaknessQuestions(currentStudentId(), params.limit || 30)
      const list = Array.isArray(data) ? data : (data?.questions || [])
      weaknessPool.value = list.map(normalizeQuestion)
    } catch (e) {
      console.warn('[Practice] Load weakness pool failed:', e)
      weaknessPool.value = []
    }
    return weaknessPool.value
  }

  async function startSession(mode, options = {}) {
    currentMode.value = mode
    if (options.subject) currentSubject.value = options.subject
    if (Object.prototype.hasOwnProperty.call(options, 'topicId')) currentTopicId.value = options.topicId

    // 按模式准备题目来源：薄弱=错题池，复习=SM-2 队列，其余=题库（后端已按 学科+章节 过滤）
    if (mode === 'weakness') {
      await loadWeaknessPool()
    } else if (mode === 'review') {
      if (!srQueue.value.length) await loadSRQueue()
    } else if (!questionBank.value.length) {
      await loadQuestionBank()
    }

    // 根据模式选择题目
    let questions = selectQuestionsForMode(mode, options.count)

    // 打乱顺序（复习模式保持 SM-2 排序）
    if (mode !== 'review') {
      questions = shuffleArray([...questions])
    }

    currentSession.value = {
      id: 'session_' + Date.now(), // 后端同步成功后覆盖为真实 practice_sessions uuid
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

    // 后端建真实 practice_sessions 行，回带 uuid —— 后续 submit/complete 以它为 sessionId
    try {
      const res = await startPracticeSession({
        mode,
        subject: currentSubject.value,
        topicId: currentTopicId.value || undefined,
        questions: questions.map(q => ({ id: q.id, content: q.content, type: q.type, answer: q.answer, options: q.options, difficulty: q.difficulty }))
      })
      if (res?.id) currentSession.value.id = res.id
    } catch (e) {
      console.warn('[Practice] Start session backend sync failed:', e)
    }

    return currentSession.value
  }

  function selectQuestionsForMode(mode, count) {
    const limit = count || PRACTICE_MODES[mode]?.questions || 10
    let picked

    // 薄弱攻克：未解决错题（完整题面）
    if (mode === 'weakness') {
      picked = weaknessPool.value.slice(0, limit)
    } else if (mode === 'review') {
      // 间隔复习：到期的 SM-2 卡片（无到期则退化为全队列）
      const now = Date.now()
      const due = srQueue.value.filter(item => item.nextReview <= now)
      const src = due.length ? due : srQueue.value
      picked = src.slice(0, limit).map(item => item.question).filter(Boolean)
    } else {
      picked = questionBank.value
        .filter(q => !(currentSubject.value && q.subject && q.subject !== currentSubject.value))
        .slice(0, limit)
    }

    // 统一归一化（幂等）——即便题库被直接注入（测试）也保证题型/选项/答案下标正确
    return picked.map(normalizeQuestion).filter(Boolean)
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

    // 同步到后端（后端信任前端判定；answer 落可读文本，选择题存选项文本而非下标）
    try {
      const answerText = typeof answer === 'number' ? (question.options?.[answer] ?? String(answer)) : answer
      await submitPracticeAnswer({
        sessionId: currentSession.value.id,
        questionId: question.id,
        answer: answerText,
        isCorrect,
        timeSpentMs: timeSpent > 0 ? Math.round(timeSpent * 1000) : undefined
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

    // 后端保存会话完成（sessionId=后端 start 回带的 practice_sessions uuid）
    try {
      await completePracticeSession({
        sessionId: currentSession.value.id,
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
      const rows = Array.isArray(data) ? data : []
      // 后端蛇形 → 前端驼峰；题面经归一化（含选项/解析）
      srQueue.value = rows.map(r => ({
        questionId: r.question_id,
        interval: r.interval ?? 0,
        easeFactor: r.ease_factor ?? 2.5,
        repetitions: r.repetitions ?? 0,
        nextReview: r.next_review ? new Date(r.next_review).getTime() : 0,
        question: normalizeQuestion({
          id: r.question_id,
          content: r.content,
          answer: r.answer,
          type: r.type,
          options: r.options,
          explanation: r.analysis
        })
      })).filter(item => item.question && item.question.content)
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
      const sessions = Array.isArray(data) ? data : (data?.sessions || [])
      // 后端 practice_sessions 行（蛇形）→ UI 形态；stats/answers 为 JSONB（pg 已解析为对象/数组）
      history.value = sessions.map(s => {
        const stats = s.stats || {}
        const answers = Array.isArray(s.answers) ? s.answers : []
        const correct = stats.correct ?? answers.filter(a => a.isCorrect).length
        return {
          id: s.id,
          mode: s.mode,
          subject: s.subject,
          topicId: s.topic_id ?? null,
          questions: Array.isArray(s.questions) ? s.questions : [],
          answers,
          duration: s.duration ?? 0,
          status: s.status,
          completedAt: s.completed_at || s.start_time,
          stats: {
            correct,
            total: stats.total ?? answers.length,
            accuracy: stats.accuracy ?? 0,
            earnedXP: correct * 10
          }
        }
      })
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
    weaknessPool.value = []
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
    weaknessPool,

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
    loadWeaknessPool,
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