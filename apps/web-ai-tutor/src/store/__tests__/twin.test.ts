import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api/index.js', () => ({
  getTwinOverview: vi.fn(),
  getTwinEvents: vi.fn(),
  updateTwinProfile: vi.fn(),
  backfillTwin: vi.fn(),
  recordTwinAction: vi.fn(),
  getTwinReplay: vi.fn(),
  exportTwinArchive: vi.fn(),
  importTwinArchive: vi.fn()
}))

import { useTwinStore } from '@/store/twin'
import {
  getTwinOverview,
  updateTwinProfile,
  recordTwinAction,
  getTwinReplay,
  exportTwinArchive,
  importTwinArchive
} from '@/api/index.js'

const OVERVIEW = {
  profile: { id: 'u1', name: '小智', gradeName: '八年级', avatarUrl: 'a.png', school: '实验中学' },
  state: {
    subject: 'math',
    skills: [{ fieldCode: 'math.map.f.01', name: '数与代数', mastery: 80 }],
    mastery: { avg: 80, mastered: 1, learning: 0, weak: 0, total: 1 },
    progress: { totalAnswered: 20, correctCount: 15, accuracy: 75, practiceSessions: 3, unresolvedWrong: 2 },
    scene: { code: 'math.map.a.01.05', name: '一次式' },
    relations: { teacher: { interactions: 4, bond: 18 } }
  },
  world: { subject: 'math', subjectName: '数学', fields: [], areas: [], stats: { total: 3, k12: 2, frontier: 1 } },
  events: [
    { id: 'e2', kind: 'action', title: '甲', at: '2026-10-02T10:00:00Z' },
    { id: 'e1', kind: 'system', title: '乙', at: '2026-10-01T10:00:00Z' }
  ],
  memories: [{ key: 'setting.preferredDifficulty', value: 'adaptive', strength: 2, updatedAt: null }]
}

describe('Twin Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('初始为空壳（未装配）', () => {
    const store = useTwinStore()
    expect(store.loaded).toBe(false)
    expect(store.profile).toBe(null)
    expect(store.skills).toEqual([])
    expect(store.recentEvents).toEqual([])
  })

  it('loadOverview 装配五件并派生可读字段', async () => {
    getTwinOverview.mockResolvedValueOnce(OVERVIEW)
    const store = useTwinStore()
    await store.loadOverview('math')

    expect(store.loaded).toBe(true)
    expect(store.displayName).toBe('小智')
    expect(store.gradeName).toBe('八年级')
    expect(store.skills).toHaveLength(1)
    expect(store.mastery.avg).toBe(80)
    expect(store.scene.name).toBe('一次式')
    expect(store.teacherBond.bond).toBe(18)
    expect(store.worldStats.total).toBe(3)
    expect(store.recentEvents).toHaveLength(2)
    expect(getTwinOverview).toHaveBeenCalledWith('math')
  })

  it('loadOverview 失败时兜底不抛错', async () => {
    getTwinOverview.mockRejectedValueOnce(new Error('down'))
    const store = useTwinStore()
    const r = await store.loadOverview('math')
    expect(r).toBe(null)
    expect(store.error).toBeTruthy()
  })

  it('saveProfile 调后端并刷新总览', async () => {
    updateTwinProfile.mockResolvedValueOnce({ success: true })
    getTwinOverview.mockResolvedValue(OVERVIEW)
    const store = useTwinStore()
    await store.loadOverview('math')
    const ok = await store.saveProfile({ gradeLevel: 9 })

    expect(ok).toBe(true)
    expect(updateTwinProfile).toHaveBeenCalledWith({ gradeLevel: 9 })
    expect(getTwinOverview).toHaveBeenCalledTimes(2) // 初次 + 保存后刷新
  })

  it('loadReplay 装配回放帧', async () => {
    getTwinReplay.mockResolvedValueOnce({
      entityId: 'u1',
      frames: [{ index: 0, id: 'e1', kind: 'system', title: '建立', at: '2026-10-01T10:00:00Z' }]
    })
    const store = useTwinStore()
    const frames = await store.loadReplay(200)
    expect(frames).toHaveLength(1)
    expect(store.replayFrames[0].title).toBe('建立')
    expect(getTwinReplay).toHaveBeenCalledWith(200)
  })

  it('exportArchive 透传档案，importArchive 后刷新总览', async () => {
    exportTwinArchive.mockResolvedValueOnce({ format: 'gri-student-digital-twin', version: 1, events: [] })
    importTwinArchive.mockResolvedValueOnce({ events: 2, profileUpdated: true })
    getTwinOverview.mockResolvedValue(OVERVIEW)
    const store = useTwinStore()

    const a = await store.exportArchive()
    expect(a.format).toBe('gri-student-digital-twin')

    const r = await store.importArchive(a)
    expect(r.events).toBe(2)
    expect(getTwinOverview).toHaveBeenCalledTimes(1) // 导入后刷新
  })

  it('autoRecord 关闭时 performAction 不写经历', async () => {
    const store = useTwinStore()
    store.setAutoRecord(false)
    const r = await store.performAction('practice', 'math.map.a.01.05')
    expect(r).toBe(null)
    expect(recordTwinAction).not.toHaveBeenCalled()

    store.setAutoRecord(true)
    recordTwinAction.mockResolvedValueOnce({ id: 'new', kind: 'action', title: '完成练习 1 题' })
    const ev = await store.performAction('practice', null, { title: '完成练习 1 题' })
    expect(ev.id).toBe('new')
    expect(store.events[0].id).toBe('new')
  })
})
