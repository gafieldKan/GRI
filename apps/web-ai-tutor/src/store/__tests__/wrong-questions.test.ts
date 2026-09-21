import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useWrongQuestionsStore } from '@/store/wrong-questions'

describe('Wrong Questions Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should initialize with default values', () => {
    const store = useWrongQuestionsStore()
    expect(store.allQuestions).toEqual([])
    expect(store.currentFilter).toBe('all')
    expect(store.reviewMode).toBe(false)
  })

  it('should filter questions by status', () => {
    const store = useWrongQuestionsStore()
    store.allQuestions = [
      { id: '1', reviewStatus: 'review', content: 'Q1' },
      { id: '2', reviewStatus: 'mastered', content: 'Q2' },
      { id: '3', content: 'Q3' } // no reviewStatus defaults to review
    ]

    store.setFilter('review')
    expect(store.filteredQuestions.length).toBe(2)

    store.setFilter('mastered')
    expect(store.filteredQuestions.length).toBe(1)

    store.setFilter('all')
    expect(store.filteredQuestions.length).toBe(3)
  })

  it('should calculate stats correctly', () => {
    const store = useWrongQuestionsStore()
    store.allQuestions = [
      { reviewStatus: 'review' },
      { reviewStatus: 'mastered' },
      { reviewStatus: 'review' },
      { reviewStatus: 'mastered' },
      { reviewStatus: 'mastered' }
    ]

    expect(store.stats.total).toBe(5)
    expect(store.stats.toReview).toBe(2)
    expect(store.stats.mastered).toBe(3)
  })

  it('should start review mode correctly', () => {
    const store = useWrongQuestionsStore()
    store.allQuestions = [
      { id: '1', reviewStatus: 'review' },
      { id: '2', reviewStatus: 'review' }
    ]

    store.startReviewMode('review')
    expect(store.reviewMode).toBe(true)
    expect(store.reviewQueue.length).toBe(2)
    expect(store.currentReviewIndex).toBe(0)
  })

  it('should mark question as mastered', async () => {
    const store = useWrongQuestionsStore()
    store.allQuestions = [
      { id: '1', reviewStatus: 'review', mastery: 0.3 }
    ]

    await store.markReviewed('1', 0.9)
    const q = store.allQuestions.find(q => q.id === '1')
    expect(q?.reviewStatus).toBe('mastered')
    expect(q?.mastery).toBe(0.9)
  })
})