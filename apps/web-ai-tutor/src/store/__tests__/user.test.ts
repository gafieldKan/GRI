import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useUserStore } from '@/store/user'

describe('User Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should initialize with default values', () => {
    const store = useUserStore()
    expect(store.studentId).toBe(null)
    expect(store.name).toBe('学习者')
    expect(store.level).toBe(1)
    expect(store.xp).toBe(0)
    expect(store.streak).toBe(0)
  })

  it('should calculate xpProgress correctly', () => {
    const store = useUserStore()
    store.xp = 500
    expect(store.xpProgress).toBe(50)

    store.xp = 1500
    expect(store.xpProgress).toBe(50)

    store.xp = 999
    expect(store.xpProgress).toBe(99.9)
  })

  it('should add XP and check level up', () => {
    const store = useUserStore()
    store.xp = 950
    store.level = 1
    store.addXP(100)
    expect(store.xp).toBe(1050)
    expect(store.level).toBe(2)
  })

  it('should track streak correctly', () => {
    const store = useUserStore()
    store.streak = 0
    store.lastStudyDate = null

    // First study session (30 minutes → 1800 seconds)
    store.recordStudySession(30, 10, 8)
    expect(store.streak).toBe(1)
    expect(store.todayStudyTime).toBe(1800)

    // Same day - streak shouldn't increase (20 minutes → +1200 seconds)
    store.recordStudySession(20, 5, 4)
    expect(store.streak).toBe(1)
    expect(store.todayStudyTime).toBe(3000)
  })

  it('should unlock achievements correctly', () => {
    const store = useUserStore()
    store.streak = 3
    store.checkAchievements('streak', 3)

    const streak3Achievement = store.achievements.find(a => a.id === 'streak_3')
    expect(streak3Achievement?.unlocked).toBe(true)
  })

  it('should calculate streak status correctly', () => {
    const store = useUserStore()

    store.streak = 0
    expect(store.streakStatus).toBe('未开始')

    store.streak = 5
    expect(store.streakStatus).toBe('起步阶段')

    store.streak = 15
    expect(store.streakStatus).toBe('习惯养成')

    store.streak = 50
    expect(store.streakStatus).toBe('坚持不懈')

    store.streak = 150
    expect(store.streakStatus).toBe('学霸级别')
  })

  it('should unlock perfect_session achievement', () => {
    const store = useUserStore()
    store.checkAchievements('perfect', true)

    const perfectAchievement = store.achievements.find(a => a.id === 'perfect_session')
    expect(perfectAchievement?.unlocked).toBe(true)
  })
})