import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePracticeStore } from '@/store/practice'

describe('Practice Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should initialize with default values', () => {
    const store = usePracticeStore()
    expect(store.currentMode).toBe('quick')
    expect(store.currentSubject).toBe('math')
    expect(store.currentSession).toBeNull()
  })

  it('should start a session with correct parameters', async () => {
    const store = usePracticeStore()
    store.questionBank = [
      { id: '1', content: 'Q1', type: 'choice', answer: 'A', options: ['A', 'B', 'C', 'D'], subject: 'math' },
      { id: '2', content: 'Q2', answer: '42', type: 'fill', subject: 'math' }
    ]

    await store.startSession('quick', { subject: 'math' })
    expect(store.currentSession).toBeDefined()
    expect(store.currentSession.questions.length).toBeGreaterThan(0)
    expect(store.currentQuestionIndex).toBe(0)
  })

  it('should submit answer correctly', async () => {
    const store = usePracticeStore()
    store.questionBank = [
      { id: '1', content: 'Q1', type: 'choice', answer: 'A', options: ['A', 'B', 'C', 'D'], subject: 'math' }
    ]

    await store.startSession('topic', { subject: 'math' })

    const result = await store.submitAnswer('A')
    expect(result.isCorrect).toBe(true)
    expect(store.sessionAnswers.length).toBe(1)
  })

  it('should track session progress correctly', () => {
    const store = usePracticeStore()
    store.currentSession = {
      id: 'test',
      questions: [
        { id: '1' },
        { id: '2' },
        { id: '3' }
      ]
    }
    store.currentQuestionIndex = 1
    store.sessionAnswers = [{ questionId: '1' }]

    expect(store.sessionProgress).toBeCloseTo(66.67, 1)
    expect(store.totalQuestions).toBe(3)
  })
})