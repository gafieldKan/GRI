/**
 * Mini-Program Session Store 测试 (Pinia)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

describe('useSessionStore (MP)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mock('../api/index.js', () => ({
      createSession: async () => ({
        sessionId: 'sess_mp_123',
        state: 'WAIT_START',
      }),
      sendSessionMessage: async () => ({
        success: true,
        state: 'DIAGNOSING',
        message: 'AI 正在分析你的水平...',
        questions: [{ id: 'q1', content: '诊断题', type: 'choice' }],
      }),
      getSessionState: async () => ({
        sessionId: 'sess_mp_123',
        state: 'TEACHING',
      }),
    }))
  })

  it('should import and define the store', async () => {
    const { useSessionStore } = await import('../store/session.js')
    const store = useSessionStore()
    expect(store).toBeDefined()
    expect(store.sessionId).toBeNull()
  })

  it('should start with isActive false', async () => {
    const { useSessionStore } = await import('../store/session.js')
    const store = useSessionStore()
    expect(store.isActive).toBe(false)
    expect(store.currentState).toBe('WAIT_START')
  })

  it('should create session and transition state', async () => {
    const { useSessionStore } = await import('../store/session.js')
    const store = useSessionStore()

    await store.createSession('student_001', 'math_pythagorean')

    expect(store.sessionId).toBe('sess_mp_123')
    expect(store.currentState).toBe('WAIT_START')
    expect(store.isActive).toBe(true)
  })

  it('should send message and update state/messages', async () => {
    const { useSessionStore } = await import('../store/session.js')
    const store = useSessionStore()

    await store.createSession('student_001', 'math_pythagorean')
    await store.sendMessage('我想学勾股定理')

    expect(store.messages.length).toBeGreaterThanOrEqual(1)
    expect(store.currentState).toBe('DIAGNOSING')
    expect(store.questions.length).toBeGreaterThanOrEqual(1)
  })

  it('should add user message before AI response', async () => {
    const { useSessionStore } = await import('../store/session.js')
    const store = useSessionStore()

    await store.createSession('student_001', 'math_pythagorean')
    await store.sendMessage('hello')

    const userMsg = store.messages.find(m => m.role === 'user')
    expect(userMsg).toBeDefined()
    expect(userMsg.content).toBe('hello')
  })

  it('should reset to initial state', async () => {
    const { useSessionStore } = await import('../store/session.js')
    const store = useSessionStore()

    await store.createSession('student_001', 'math_pythagorean')
    await store.sendMessage('hello')
    store.reset()

    expect(store.sessionId).toBeNull()
    expect(store.messages.length).toBe(0)
    expect(store.isActive).toBe(false)
  })

  it('should throw on sendMessage without active session', async () => {
    const { useSessionStore } = await import('../store/session.js')
    const store = useSessionStore()

    await expect(store.sendMessage('test')).rejects.toThrow('无活跃会话')
  })
})