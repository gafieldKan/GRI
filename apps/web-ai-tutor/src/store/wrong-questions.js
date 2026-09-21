/**
 * 错题本状态管理 (Pinia Store)
 * 管理错题收集、复习队列、标签分类、掌握度追踪
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getWrongQuestionList, markQuestionReviewed, retryWrongQuestion, updateSM2ForWrongQuestion } from '@/api/index.js'
import { useUserStore } from './user.js'

// 学生业务主键统一从 user store 解出
function currentStudentId() {
  return useUserStore().studentId
}

export const useWrongQuestionsStore = defineStore('wrongQuestions', () => {
  // ─── State ───
  const allQuestions = ref([])
  const currentFilter = ref('all') // 'all' | 'review' | 'mastered'
  const currentSubject = ref(null)
  const currentTag = ref(null)
  const searchKeyword = ref('')
  const loading = ref(false)
  const error = ref(null)
  const reviewMode = ref(false)
  const currentReviewIndex = ref(0)
  const reviewQueue = ref([])

  // 标签体系
  const availableTags = ref([
    '计算错误', '概念混淆', '公式记错', '审题不清',
    '单位换算', '符号错误', '逻辑跳跃', '图形理解',
    '步骤缺失', '粗心大意'
  ])

  // ─── Getters ───
  const filteredQuestions = computed(() => {
    let result = allQuestions.value

    // 筛选器
    if (currentFilter.value === 'review') {
      result = result.filter(q => q.reviewStatus === 'review' || !q.reviewStatus)
    } else if (currentFilter.value === 'mastered') {
      result = result.filter(q => q.reviewStatus === 'mastered')
    }

    // 学科筛选
    if (currentSubject.value) {
      result = result.filter(q => q.subject === currentSubject.value)
    }

    // 标签筛选
    if (currentTag.value) {
      result = result.filter(q => q.tags?.includes(currentTag.value))
    }

    // 搜索
    if (searchKeyword.value.trim()) {
      const kw = searchKeyword.value.toLowerCase()
      result = result.filter(q =>
        q.content?.toLowerCase().includes(kw) ||
        q.knowledgePoint?.toLowerCase().includes(kw) ||
        q.tags?.some(t => t.toLowerCase().includes(kw))
      )
    }

    // 排序：待复习优先，按时间倒序
    return result.sort((a, b) => {
      const aReview = a.reviewStatus === 'review' || !a.reviewStatus
      const bReview = b.reviewStatus === 'review' || !b.reviewStatus
      if (aReview !== bReview) return aReview ? -1 : 1
      return new Date(b.createdAt) - new Date(a.createdAt)
    })
  })

  const stats = computed(() => {
    const total = allQuestions.value.length
    const toReview = allQuestions.value.filter(q =>
      q.reviewStatus === 'review' || !q.reviewStatus
    ).length
    const mastered = allQuestions.value.filter(q =>
      q.reviewStatus === 'mastered'
    ).length
    const thisWeek = allQuestions.value.filter(q =>
      new Date(q.createdAt) > new Date(Date.now() - 7 * 86400000)
    ).length

    // 按学科统计
    const bySubject = {}
    allQuestions.value.forEach(q => {
      bySubject[q.subject] = (bySubject[q.subject] || 0) + 1
    })

    return { total, toReview, mastered, thisWeek, bySubject }
  })

  const subjects = computed(() => [...new Set(allQuestions.value.map(q => q.subject).filter(Boolean))])
  const tags = computed(() => [...new Set(allQuestions.value.flatMap(q => q.tags || []))])

  const currentReviewItem = computed(() =>
    reviewQueue.value[currentReviewIndex.value] || null
  )
  const reviewProgress = computed(() =>
    reviewQueue.value.length > 0
      ? ((currentReviewIndex.value + 1) / reviewQueue.value.length) * 100
      : 0
  )

  // ─── Actions ───
  async function loadQuestions(studentId = currentStudentId(), force = false) {
    if (allQuestions.value.length > 0 && !force) return

    loading.value = true
    error.value = null
    try {
      const data = await getWrongQuestionList(studentId)
      allQuestions.value = (data?.wrongQuestions || data || []).map(q => ({
        ...q,
        id: q.id || `wq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        reviewStatus: q.reviewStatus || 'review',
        reviewCount: q.reviewCount || 0,
        lastReviewed: q.lastReviewed || null,
        mastery: q.mastery || 0,
        createdAt: q.createdAt || new Date().toISOString()
      }))
    } catch (e) {
      error.value = e.message
      console.error('[WrongQuestions] Load failed:', e)
    } finally {
      loading.value = false
    }
  }

  function addQuestion(question) {
    const newQ = {
      ...question,
      id: question.id || `wq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      reviewStatus: 'review',
      reviewCount: 0,
      mastery: 0,
      createdAt: new Date().toISOString()
    }
    allQuestions.value.unshift(newQ)
    return newQ
  }

  function addQuestionsFromSession(sessionResult) {
    sessionResult.answers
      .filter(a => !a.isCorrect)
      .forEach(a => {
        addQuestion({
          content: a.question,
          userAnswer: a.userAnswer,
          correctAnswer: a.correctAnswer,
          subject: sessionResult.subject,
          topicId: a.topicId,
          knowledgePoint: a.knowledgePoint,
          tags: a.tags || ['待分类'],
          source: 'practice',
          sessionId: sessionResult.sessionId
        })
      })
  }

  async function markReviewed(questionId, mastery = 0.8) {
    const question = allQuestions.value.find(q => q.id === questionId)
    if (!question) return

    question.reviewStatus = mastery >= 0.8 ? 'mastered' : 'review'
    question.reviewCount = (question.reviewCount || 0) + 1
    question.lastReviewed = new Date().toISOString()
    question.mastery = Math.max(question.mastery || 0, mastery)

    try {
      await markQuestionReviewed(questionId, { mastery, reviewStatus: question.reviewStatus, studentId: currentStudentId() })
      // 同步更新 SM-2 间隔重复队列
      await updateSM2ForWrongQuestion(questionId, { studentId: currentStudentId(), mastery })
    } catch (e) {
      console.warn('[WrongQuestions] Mark reviewed failed:', e)
    }
  }

  async function retryQuestion(questionId) {
    const question = allQuestions.value.find(q => q.id === questionId)
    if (!question) return null

    try {
      const result = await retryWrongQuestion(questionId)
      // 重试通常会创建新的练习会话，返回题目供练习
      return {
        ...question,
        ...result
      }
    } catch (e) {
      console.error('[WrongQuestions] Retry failed:', e)
      throw e
    }
  }

  function startReviewMode(filter = 'review') {
    currentFilter.value = filter
    reviewQueue.value = filteredQuestions.value.slice()
    currentReviewIndex.value = 0
    reviewMode.value = true
  }

  function exitReviewMode() {
    reviewMode.value = false
    reviewQueue.value = []
    currentReviewIndex.value = 0
  }

  function nextReview() {
    if (currentReviewIndex.value < reviewQueue.value.length - 1) {
      currentReviewIndex.value++
      return true
    }
    return false
  }

  function prevReview() {
    if (currentReviewIndex.value > 0) {
      currentReviewIndex.value--
      return true
    }
    return false
  }

  function setFilter(filter) {
    currentFilter.value = filter
  }

  function setSubject(subject) {
    currentSubject.value = subject
  }

  function setTag(tag) {
    currentTag.value = tag
  }

  function setSearch(keyword) {
    searchKeyword.value = keyword
  }

  function clearSearch() {
    searchKeyword.value = ''
  }

  function updateQuestionTags(questionId, tags) {
    const question = allQuestions.value.find(q => q.id === questionId)
    if (question) {
      question.tags = tags
    }
  }

  function addCustomTag(tag) {
    if (!availableTags.value.includes(tag)) {
      availableTags.value.push(tag)
    }
  }

  function deleteQuestion(questionId) {
    const index = allQuestions.value.findIndex(q => q.id === questionId)
    if (index >= 0) {
      allQuestions.value.splice(index, 1)
    }
  }

  function bulkAction(action, questionIds) {
    questionIds.forEach(id => {
      const q = allQuestions.value.find(q => q.id === id)
      if (!q) return

      switch (action) {
        case 'markMastered':
          q.reviewStatus = 'mastered'
          q.mastery = Math.max(q.mastery || 0, 0.8)
          break
        case 'markReview':
          q.reviewStatus = 'review'
          break
        case 'delete':
          deleteQuestion(id)
          break
      }
    })
  }

  function reset() {
    allQuestions.value = []
    currentFilter.value = 'all'
    currentSubject.value = null
    currentTag.value = null
    searchKeyword.value = ''
    reviewMode.value = false
    currentReviewIndex.value = 0
    reviewQueue.value = []
    loading.value = false
    error.value = null
  }

  return {
    // State
    allQuestions,
    currentFilter,
    currentSubject,
    currentTag,
    searchKeyword,
    loading,
    error,
    reviewMode,
    currentReviewIndex,
    reviewQueue,
    availableTags,

    // Getters
    filteredQuestions,
    stats,
    subjects,
    tags,
    currentReviewItem,
    reviewProgress,

    // Actions
    loadQuestions,
    addQuestion,
    addQuestionsFromSession,
    markReviewed,
    retryQuestion,
    startReviewMode,
    exitReviewMode,
    nextReview,
    prevReview,
    setFilter,
    setSubject,
    setTag,
    setSearch,
    clearSearch,
    updateQuestionTags,
    addCustomTag,
    deleteQuestion,
    bulkAction,
    reset
  }
})

// 持久化配置
useWrongQuestionsStore.persist = {
  key: 'gri-wrong-questions',
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
        console.error('wrongQuestions store persist failed:', e)
      }
    }
  },
  paths: [
    'allQuestions', 'availableTags',
    'currentFilter', 'currentSubject', 'currentTag',
    'searchKeyword', 'reviewMode'
  ]
}

export default useWrongQuestionsStore