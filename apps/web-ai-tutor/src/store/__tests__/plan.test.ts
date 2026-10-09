import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api/index.js', () => ({
  getPlans: vi.fn(async () => []),
  generatePlan: vi.fn(async () => ({ success: true })),
  getPlanCalendar: vi.fn(async () => ({ events: [] })),
  getParentReport: vi.fn(async () => ({ success: true })),
  completePlanTask: vi.fn(async () => ({ success: true })),
  updatePlanProgress: vi.fn(async () => ({ success: false }))
}))

vi.mock('@/store/user.js', () => ({
  useUserStore: () => ({ studentId: 'a0000000-0000-0000-0000-000000000001' })
}))

import { usePlanStore } from '@/store/plan'
import { getPlans, updatePlanProgress, completePlanTask } from '@/api/index.js'

describe('Plan Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('loadPlans unwraps a bare array from the backend', async () => {
    getPlans.mockResolvedValueOnce([
      { id: 'p1', plan_type: 'daily', status: 'active', progress: '0.00', plan_data: { tasks: [{ id: 'd0', completed: false }] } }
    ])
    const store = usePlanStore()
    await store.loadPlans()

    expect(store.plans).toHaveLength(1)
    expect(store.dailyPlan.id).toBe('p1')
    // numeric 列回字符串 → 进度归一为数字
    expect(store.dailyProgress).toBe(0)
  })

  it('dailyPlan getter ignores archived plans', async () => {
    getPlans.mockResolvedValueOnce([
      { id: 'gone', plan_type: 'daily', status: 'archived', progress: '100.00', plan_data: { tasks: [] } },
      { id: 'live', plan_type: 'daily', status: 'active', progress: '0.00', plan_data: { tasks: [] } }
    ])
    const store = usePlanStore()
    await store.loadPlans()
    expect(store.dailyPlan.id).toBe('live')
  })

  it('updateProgress persists via API and adopts the returned plan', async () => {
    const store = usePlanStore()
    store.plans = [{ id: 'p1', plan_type: 'daily', status: 'active', progress: '0.00', plan_data: { tasks: [{ id: 'd0', completed: false }] } }]
    updatePlanProgress.mockResolvedValueOnce({
      success: true,
      plan: { id: 'p1', plan_type: 'daily', status: 'completed', progress: 100, plan_data: { tasks: [{ id: 'd0', completed: true }] } }
    })

    const res = await store.updateProgress('p1', ['d0'])

    expect(updatePlanProgress).toHaveBeenCalledWith('p1', ['d0'])
    expect(res.success).toBe(true)
    expect(store.dailyProgress).toBe(100)
    expect(store.dailyTasks[0].completed).toBe(true)
    expect(store.dailyPlan.status).toBe('completed')
  })

  it('completePersonalizedPlanTask calls the agent endpoint and syncs local', async () => {
    const store = usePlanStore()
    store.plans = [{ id: 'pp1', plan_type: 'personalized', status: 'active', progress: 0, total_tasks: 2, plan_data: { tasks: [{ title: 'a' }, { title: 'b' }] } }]
    completePlanTask.mockResolvedValueOnce({ success: true, completedTasks: 1, progress: 50, status: 'active', taskIndex: 0, taskTitle: 'a' })

    await store.completePersonalizedPlanTask('pp1', 0, true)

    expect(completePlanTask).toHaveBeenCalledWith('pp1', 0, true)
    expect(store.plans[0].progress).toBe(50)
    expect(store.plans[0].plan_data.tasks[0].completed).toBe(true)
  })
})
