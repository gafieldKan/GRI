import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api/index.js', () => ({
  getQuestionBank: vi.fn(async () => []),
  submitPracticeAnswer: vi.fn(async () => ({ success: true })),
  getSpacedRepetitionQueue: vi.fn(async () => []),
  getWeaknessQuestions: vi.fn(async () => ({ questions: [] })),
  startPracticeSession: vi.fn(async () => ({ id: 'uuid-session-1' })),
  completePracticeSession: vi.fn(async () => ({ id: 'uuid-session-1' })),
  getPracticeHistory: vi.fn(async () => ({ sessions: [] }))
}))

vi.mock('@/store/twin.js', () => ({
  useTwinStore: () => ({ performAction: vi.fn(async () => ({})) })
}))

import { usePracticeStore, normalizeQuestion } from '@/store/practice'

describe('normalizeQuestion', () => {
  it('normalizes multiple-choice + [{text}] + letter answer', () => {
    const q = normalizeQuestion({
      id: 'q1',
      type: 'multiple-choice',
      content: '题干',
      options: [{ text: 'A. 3' }, { text: 'B. 4' }, { text: 'C. 5' }, { text: 'D. 6' }],
      answer: 'C',
      analysis: '解析文本'
    })
    expect(q.type).toBe('choice')
    expect(q.options).toEqual(['A. 3', 'B. 4', 'C. 5', 'D. 6'])
    expect(q.answerIndex).toBe(2)
    expect(q.explanation).toBe('解析文本')
  })

  it('handles legacy string[] options and letter answer', () => {
    const q = normalizeQuestion({ type: 'choice', options: ['x', 'y', 'z'], answer: 'B' })
    expect(q.options).toEqual(['x', 'y', 'z'])
    expect(q.answerIndex).toBe(1)
  })
})

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

  it('should start a session with normalized questions', async () => {
    const store = usePracticeStore()
    store.questionBank = [
      { id: '1', content: 'Q1', type: 'multiple-choice', answer: 'A', options: [{ text: 'A. a' }, { text: 'B. b' }], subject: 'math' },
      { id: '2', content: 'Q2', answer: '42', type: 'fill', subject: 'math' }
    ]

    await store.startSession('quick', { subject: 'math' })
    expect(store.currentSession).toBeDefined()
    expect(store.currentSession.questions.length).toBeGreaterThan(0)
    // 顺序被随机打乱 → 断言归一化后存在 choice 题型
    expect(store.currentSession.questions.some(q => q.type === 'choice')).toBe(true)
    expect(store.currentQuestionIndex).toBe(0)
  })

  it('grades a choice answer by option index (uses letter-derived answerIndex)', async () => {
    const store = usePracticeStore()
    store.questionBank = [
      { id: '1', content: 'Q1', type: 'multiple-choice', answer: 'C', options: [{ text: 'A. 3' }, { text: 'B. 4' }, { text: 'C. 5' }, { text: 'D. 6' }], subject: 'math' }
    ]
    await store.startSession('topic', { subject: 'math' })

    const correct = await store.submitAnswer(2) // 下标 2 == 选项 C
    expect(correct.isCorrect).toBe(true)
    expect(store.sessionAnswers.length).toBe(1)
  })

  it('marks a wrong choice index as incorrect', async () => {
    const store = usePracticeStore()
    store.questionBank = [
      { id: '1', content: 'Q1', type: 'choice', answer: 'A', options: ['x', 'y'], subject: 'math' }
    ]
    await store.startSession('quick', { subject: 'math' })
    const result = await store.submitAnswer(1)
    expect(result.isCorrect).toBe(false)
  })

  it('tracks session progress correctly', () => {
    const store = usePracticeStore()
    store.currentSession = {
      id: 'test',
      questions: [{ id: '1' }, { id: '2' }, { id: '3' }]
    }
    store.currentQuestionIndex = 1
    store.sessionAnswers = [{ questionId: '1' }]

    expect(store.sessionProgress).toBeCloseTo(66.67, 1)
    expect(store.totalQuestions).toBe(3)
  })
})
