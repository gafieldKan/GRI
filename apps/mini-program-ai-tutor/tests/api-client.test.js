/**
 * Mini-Program API Client 测试
 * 验证 uni.request 封装层和所有 API 函数
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock uni global for mini-program environment
const mockUni = {
  request: vi.fn(),
  connectSocket: vi.fn(),
  uploadFile: vi.fn(),
}
global.uni = mockUni

describe('Mini-Program API Client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('createSession', () => {
    it('should create session via uni.request and return sessionId', async () => {
      mockUni.request.mockImplementation((opts) => {
        opts.success({ statusCode: 200, data: { sessionId: 'sess_mp_001', state: { state: 'WAIT_START' } } })
      })

      const { createSession } = await import('../api/index.js')
      const result = await createSession('student_001', 'math_pythagorean')

      expect(result.sessionId).toBe('sess_mp_001')
      expect(mockUni.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('/api/tuition/sessions'),
          method: 'POST'
        })
      )
    })

    it('should handle request failure', async () => {
      mockUni.request.mockImplementation((opts) => {
        opts.success({ statusCode: 500, data: { error: 'Server error' } })
      })

      const { createSession } = await import('../api/index.js')
      await expect(createSession('student_001', 'math')).rejects.toThrow()
    })

    it('should handle network failure', async () => {
      mockUni.request.mockImplementation((opts) => {
        opts.fail({ errMsg: 'request:fail timeout' })
      })

      const { createSession } = await import('../api/index.js')
      await expect(createSession('student_001', 'math')).rejects.toThrow('网络请求失败')
    })
  })

  describe('sendSessionMessage', () => {
    it('should send message and return AI response', async () => {
      mockUni.request.mockImplementation((opts) => {
        opts.success({
          statusCode: 200,
          data: { success: true, state: 'TEACHING', message: '很好，让我们继续' }
        })
      })

      const { sendSessionMessage } = await import('../api/index.js')
      const result = await sendSessionMessage('sess_001', '我想学勾股定理')

      expect(result.success).toBe(true)
      expect(result.state).toBe('TEACHING')
      expect(mockUni.request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('/api/tuition/sessions/sess_001/message'),
          method: 'POST'
        })
      )
    })
  })

  describe('getReport', () => {
    it('should fetch report for student', async () => {
      mockUni.request.mockImplementation((opts) => {
        opts.success({
          statusCode: 200,
          data: [{ studentId: 'student_001', stats: { studyDays: 7 }, masteryByKnowledge: [] }]
        })
      })

      const { getReport } = await import('../api/index.js')
      const result = await getReport('student_001')

      expect(result).toHaveLength(1)
      expect(result[0].studentId).toBe('student_001')
    })

    it('should throw on 404', async () => {
      mockUni.request.mockImplementation((opts) => {
        opts.success({ statusCode: 404, data: { error: 'Not found' } })
      })

      const { getReport } = await import('../api/index.js')
      await expect(getReport('unknown')).rejects.toThrow()
    })
  })

  describe('checkHealth', () => {
    it('should return health status', async () => {
      mockUni.request.mockImplementation((opts) => {
        opts.success({ statusCode: 200, data: { status: 'ok', version: '2.0.0' } })
      })

      const { checkHealth } = await import('../api/index.js')
      const result = await checkHealth()

      expect(result.status).toBe('ok')
      expect(result.version).toBe('2.0.0')
    })
  })

  describe('getKnowledgePoints', () => {
    it('should fetch knowledge points list', async () => {
      mockUni.request.mockImplementation((opts) => {
        opts.success({
          statusCode: 200,
          data: [{ id: 'math_pythagorean', name: '勾股定理', grade: 8 }]
        })
      })

      const { getKnowledgePoints } = await import('../api/index.js')
      const result = await getKnowledgePoints()

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('勾股定理')
    })
  })

  describe('WebSocket', () => {
    it('WS 已按 M5 拍板移除——不再通过 uni.connectSocket 建连', async () => {
      expect(mockUni.connectSocket).toBeDefined()
      const mod = await import('../api/index.js')
      expect(mod.createWebSocket).toBeUndefined()
      expect(mod.sendWebSocketMessage).toBeUndefined()
    })
  })

  describe('uploadExamImage', () => {
    it('should upload image and return parsed questions', async () => {
      mockUni.uploadFile.mockImplementation((opts) => {
        opts.success({
          statusCode: 200,
          data: JSON.stringify({ success: true, parsedQuestions: [{ id: 'q1', content: 'test' }] })
        })
      })

      const { uploadExamImage } = await import('../api/index.js')
      const result = await uploadExamImage('/tmp/photo.jpg', 'math', '8')

      expect(result.success).toBe(true)
      expect(result.parsedQuestions).toHaveLength(1)
    })
  })
})