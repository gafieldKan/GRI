/**
 * Mini-Program Report Store 测试 (Pinia)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

describe('useReportStore (MP)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mock('../api/index.js', () => ({
      getReport: async () => ({
        stats: { studyDays: 10, totalQuestions: 50, accuracyRate: 78, improvement: 15 },
        masteryByKnowledge: [
          { name: '勾股定理', mastery: 85, totalQuestions: 10, correctAnswers: 8 },
          { name: '二次函数', mastery: 45, totalQuestions: 10, correctAnswers: 4 },
          { name: '相似三角形', mastery: 35, totalQuestions: 10, correctAnswers: 3 },
        ],
        suggestions: [
          { type: 'weakness', priority: 'high', content: '重点复习二次函数' },
          { type: 'weakness', priority: 'high', content: '相似三角形需要加强基础' },
        ],
      }),
    }))
  })

  it('should start with empty stats', async () => {
    const { useReportStore } = await import('../store/report.js')
    const store = useReportStore()
    expect(store.stats.studyDays).toBe(0)
    expect(store.averageMastery).toBe(0)
  })

  it('should load report and populate data', async () => {
    const { useReportStore } = await import('../store/report.js')
    const store = useReportStore()

    await store.loadReport('student_001')

    expect(store.stats.studyDays).toBe(10)
    expect(store.stats.totalQuestions).toBe(50)
    expect(store.stats.accuracyRate).toBe(78)
    expect(store.masteryByKnowledge).toHaveLength(3)
    expect(store.suggestions).toHaveLength(2)
  })

  it('should compute average mastery', async () => {
    const { useReportStore } = await import('../store/report.js')
    const store = useReportStore()

    await store.loadReport('student_001')

    // (85 + 45 + 35) / 3 = 55
    expect(store.averageMastery).toBe(55)
  })

  it('should filter weak points below 60%', async () => {
    const { useReportStore } = await import('../store/report.js')
    const store = useReportStore()

    await store.loadReport('student_001')

    // 二次函数 (45%) and 相似三角形 (35%) below 60%, 勾股定理 (85%) not
    expect(store.weakPointsHighlight).toHaveLength(2)
    expect(store.weakPointsHighlight[0].name).toBe('二次函数')
    expect(store.weakPointsHighlight[1].name).toBe('相似三角形')
  })

  it('should reset to empty state', async () => {
    const { useReportStore } = await import('../store/report.js')
    const store = useReportStore()

    await store.loadReport('student_001')
    store.reset()

    expect(store.stats.studyDays).toBe(0)
    expect(store.masteryByKnowledge).toHaveLength(0)
    expect(store.suggestions).toHaveLength(0)
  })
})