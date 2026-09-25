import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useKnowledgeStore } from '@/store/knowledge'

describe('Knowledge Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should initialize with default values', () => {
    const store = useKnowledgeStore()
    expect(store.currentSubject).toBe('math')
    expect(store.currentGrade).toBe(7) // 数字年级（≡ ontology.grade code G7 后缀）
    expect(store.knowledgePoints).toEqual([])
    expect(store.masteryMap).toEqual({})
  })

  it('should calculate mastery stats correctly', () => {
    const store = useKnowledgeStore()
    store.masteryMap = {
      'point1': 0.9,
      'point2': 0.7,
      'point3': 0.3,
      'point4': 0.95
    }

    expect(store.masteryStats.mastered).toBe(2) // >= 0.8
    expect(store.masteryStats.learning).toBe(1) // 0.5-0.8
    expect(store.masteryStats.weak).toBe(1) // < 0.5
    expect(store.masteryStats.total).toBe(4)
    expect(store.masteryStats.avg).toBe(71) // (0.9+0.7+0.3+0.95)/4 * 100 = 71.25 -> 71
  })

  it('should identify weak points correctly', () => {
    const store = useKnowledgeStore()
    store.knowledgePoints = [
      { id: 'point1', name: 'Point 1', mastery: 0.9 },
      { id: 'point2', name: 'Point 2', mastery: 0.4 },
      { id: 'point3', name: 'Point 3', mastery: 0.7 },
      { id: 'point4', name: 'Point 4', mastery: 0.2 }
    ]
    store.masteryMap = {
      'point1': 0.9,
      'point2': 0.4,
      'point3': 0.7,
      'point4': 0.2
    }

    const weakPoints = store.weakPoints
    expect(weakPoints.length).toBe(2)
    expect(weakPoints[0].id).toBe('point4') // 0.2 < 0.6, lowest first
    expect(weakPoints[1].id).toBe('point2') // 0.4 < 0.6
  })

  it('should filter by subject', () => {
    const store = useKnowledgeStore()
    store.knowledgePoints = [
      { id: '1', subject: 'math', name: 'Math 1' },
      { id: '2', subject: 'physics', name: 'Physics 1' },
      { id: '3', subject: 'math', name: 'Math 2' }
    ]

    store.setSubject('math')
    expect(store.currentSubject).toBe('math')
    expect(store.pointsByTopic).toBeDefined()
  })
})