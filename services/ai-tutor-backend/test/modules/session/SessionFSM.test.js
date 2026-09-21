/**
 * Session 4-Phase 模型测试
 * welcome → diagnosis → teaching → quizzing → done
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { SessionFSM } from '../../../src/modules/session/SessionFSM.js'

describe('SessionFSM (4-Phase)', () => {
  let session
  let mockAIService
  let mockQuestionService
  let mockValidateAnswer

  beforeEach(() => {
    mockValidateAnswer = { correct: true, explanation: 'correct!' }
    mockAIService = {
      validateAnswer: () => mockValidateAnswer,
      generateTeachingResponse: async () => null  // null = LLM unavailable → fallback
    }
    mockQuestionService = {
      getDiagnosisQuestions: async () => [
        { id: 'q1', content: '3和4，斜边=?', type: 'fill', answer: '5', difficulty: 1 },
        { id: 'q2', content: '勾股定理选择题', type: 'choice', answer: 'A', difficulty: 2, options: ['A','B','C','D'] },
      ],
      getQuizQuestions: async () => [
        { id: 'qz1', content: '测验题1', type: 'fill', answer: '10', difficulty: 2 },
        { id: 'qz2', content: '测验题2', type: 'choice', answer: 'B', difficulty: 3, options: ['A','B','C','D'] },
      ],
    }
    session = new SessionFSM('sess_1', 'student_1', 'math_pythagorean', mockAIService, mockQuestionService)
  })

  describe('construction', () => {
    it('should start in welcome phase', () => {
      assert.strictEqual(session.phase, 'welcome')
    })

    it('should store sessionId, studentId, knowledgePointId', () => {
      assert.strictEqual(session.sessionId, 'sess_1')
      assert.strictEqual(session.studentId, 'student_1')
      assert.strictEqual(session.knowledgePointId, 'math_pythagorean')
    })
  })

  describe('getState', () => {
    it('should return session snapshot with phase', () => {
      const state = session.getState()
      assert.strictEqual(state.sessionId, 'sess_1')
      assert.strictEqual(state.state, 'welcome')
      assert.strictEqual(state.phase, 'welcome')
      assert.ok(state.context)
      assert.strictEqual(state.context.knowledgePointId, 'math_pythagorean')
    })
  })

  describe('fallback flow (LLM unavailable)', () => {
    it('welcome → diagnosis on first message', async () => {
      const result = await session.handleUserMessage('你好，我想学习勾股定理')
      assert.strictEqual(result.success, true)
      assert.strictEqual(session.phase, 'diagnosis')
      assert.strictEqual(result.state, 'diagnosis')
      assert.ok(result.questions)
      assert.strictEqual(result.questions.length, 2)
    })

    it('should record answers in diagnosis phase', async () => {
      // Move to diagnosis
      await session.handleUserMessage('你好')
      assert.strictEqual(session.phase, 'diagnosis')

      // Submit an answer
      const result = await session.handleUserMessage('答案是5')
      assert.strictEqual(result.success, true)
      assert.strictEqual(result.state, 'diagnosis')
      assert.strictEqual(session.diagnosisAnswers.length, 1)
      assert.strictEqual(session.diagnosisAnswers[0].isCorrect, true)
    })

    it('should complete diagnosis after all answers', async () => {
      await session.handleUserMessage('你好')
      assert.strictEqual(session.phase, 'diagnosis')

      await session.handleUserMessage('答案是5')
      assert.strictEqual(session.phase, 'diagnosis')

      mockValidateAnswer = { correct: true, explanation: '正确!' }
      const result = await session.handleUserMessage('我选择A')
      assert.strictEqual(result.success, true)
      assert.strictEqual(session.phase, 'teaching')
      assert.strictEqual(result.state, 'teaching')
      assert.ok(result.diagnosisResult)
      assert.strictEqual(result.diagnosisResult.correctCount, 2)
    })

    it('should skip diagnosis when student demands direct teaching', async () => {
      await session.handleUserMessage('你好')
      assert.strictEqual(session.phase, 'diagnosis')

      const result = await session.handleUserMessage('不能，请直接教学')
      assert.strictEqual(result.success, true)
      assert.strictEqual(session.phase, 'teaching')
      assert.strictEqual(result.state, 'teaching')
    })

    it('should move from teaching to quizzing when student says understood', async () => {
      session.phase = 'teaching'
      const result = await session.handleUserMessage('我理解了')
      assert.strictEqual(result.success, true)
      assert.strictEqual(session.phase, 'quizzing')
      assert.ok(result.questions)
    })

    it('should record quiz answers', async () => {
      session.phase = 'quizzing'
      const result = await session.handleUserMessage('答案是10')
      assert.strictEqual(result.success, true)
      assert.strictEqual(session.phase, 'quizzing')
      assert.strictEqual(session.quizAnswers.length, 1)
    })

    it('should complete quiz after all answers', async () => {
      session.phase = 'quizzing'
      await session.handleUserMessage('答案是10')
      assert.strictEqual(session.phase, 'quizzing')

      mockValidateAnswer = { correct: true, explanation: '正确!' }
      const result = await session.handleUserMessage('我选择B')
      assert.strictEqual(result.success, true)
      assert.strictEqual(session.phase, 'done')
      assert.strictEqual(result.state, 'done')
      assert.ok(result.quizResult)
    })

    it('should stay in teaching for non-understanding messages', async () => {
      session.phase = 'teaching'
      const result = await session.handleUserMessage('这是什么意思')
      assert.strictEqual(result.success, true)
      assert.strictEqual(session.phase, 'teaching')
      assert.strictEqual(result.state, 'teaching')
    })

    it('should detect answer and move to diagnosis from welcome', async () => {
      const result = await session.handleUserMessage('答案是5')
      assert.strictEqual(result.success, true)
      // "答案是" prefix triggers answer handling → welcome falls through to diagnosis
      assert.strictEqual(session.phase, 'diagnosis')
    })
  })

  describe('getCurrentQuestion', () => {
    it('should return first diagnosis question', async () => {
      session.phase = 'diagnosis'
      const q = session.getCurrentQuestion()
      assert.ok(q)
      assert.strictEqual(q.id, 'q1')
    })

    it('should return second after one answer', async () => {
      session.phase = 'diagnosis'
      session.diagnosisAnswers.push({})
      const q = session.getCurrentQuestion()
      assert.ok(q)
      assert.strictEqual(q.id, 'q2')
    })

    it('should return null when no more', async () => {
      session.phase = 'diagnosis'
      session.diagnosisAnswers.push({}, {})
      assert.strictEqual(session.getCurrentQuestion(), null)
    })

    it('should return null in welcome/teaching/done', () => {
      session.phase = 'welcome'
      assert.strictEqual(session.getCurrentQuestion(), null)
      session.phase = 'teaching'
      assert.strictEqual(session.getCurrentQuestion(), null)
    })
  })

  describe('LLM-driven flow', () => {
    let llmAIService

    beforeEach(() => {
      llmAIService = {
        validateAnswer: (q, a) => ({ correct: true, explanation: 'correct!' }),
        generateTeachingResponse: async (ctx) => ({
          phase: 'diagnosis',
          action: 'ask_question',
          answerCorrect: null,
          studentAnswer: ctx.userMessage,
          suggestedResponse: '你好！让我们开始诊断测试吧。',
          analysis: '学生打招呼'
        })
      }
      session = new SessionFSM('sess_llm', 'st1', 'math_pythagorean', llmAIService, mockQuestionService)
    })

    it('should start diagnosis via LLM', async () => {
      const result = await session.handleUserMessage('你好')
      assert.strictEqual(result.success, true)
      assert.strictEqual(session.phase, 'diagnosis')
      assert.strictEqual(result.message, '你好！让我们开始诊断测试吧。')
      assert.ok(result.questions)  // ask_question → push question
    })

    it('should record LLM-evaluated answer', async () => {
      session.phase = 'diagnosis'
      llmAIService.generateTeachingResponse = async () => ({
        phase: 'diagnosis',
        action: 'evaluate_answer',
        answerCorrect: true,
        studentAnswer: '5',
        suggestedResponse: '回答正确！下一题。',
        analysis: '正确'
      })
      const result = await session.handleUserMessage('答案是5')
      assert.strictEqual(result.success, true)
      assert.strictEqual(session.diagnosisAnswers.length, 1)
      assert.strictEqual(session.diagnosisAnswers[0].isCorrect, true)
      assert.strictEqual(result.message, '回答正确！下一题。')
    })

    it('should skip diagnosis when LLM detects skip_diagnosis', async () => {
      session.phase = 'diagnosis'
      llmAIService.generateTeachingResponse = async () => ({
        phase: 'teaching',
        action: 'teach',
        answerCorrect: null,
        suggestedResponse: '勾股定理是a²+b²=c²。你理解吗？',
        analysis: '学生要求直接教学'
      })
      const result = await session.handleUserMessage('不能，请直接教学')
      assert.strictEqual(result.success, true)
      assert.strictEqual(session.phase, 'teaching')
      assert.strictEqual(result.message, '勾股定理是a²+b²=c²。你理解吗？')
    })

    it('should not skip to teaching unless student explicitly demands', async () => {
      session.phase = 'diagnosis'
      // LLM says teaching but student didn't say skip keywords
      llmAIService.generateTeachingResponse = async () => ({
        phase: 'teaching',
        action: 'teach',
        answerCorrect: null,
        suggestedResponse: '很好',
        analysis: 'generic'
      })
      const result = await session.handleUserMessage('好的')
      // Still has unanswered diagnosis questions, no skip keyword → stays
      assert.strictEqual(session.phase, 'diagnosis')
    })

    it('should transition teaching→quizzing when LLM says so', async () => {
      session.phase = 'teaching'
      llmAIService.generateTeachingResponse = async () => ({
        phase: 'quizzing',
        action: 'give_quiz',
        answerCorrect: null,
        suggestedResponse: '来做题验证一下吧！',
        analysis: '学生理解'
      })
      const result = await session.handleUserMessage('我理解了')
      assert.strictEqual(session.phase, 'quizzing')
      assert.ok(result.questions)
    })

    it('should complete quiz flow', async () => {
      session.phase = 'quizzing'
      llmAIService.generateTeachingResponse = async () => ({
        phase: 'done',
        action: 'complete',
        answerCorrect: true,
        studentAnswer: '10',
        suggestedResponse: '太棒了！全部完成。',
        analysis: '测验完成'
      })
      const result = await session.handleUserMessage('答案是10')
      assert.strictEqual(session.phase, 'done')
      assert.strictEqual(result.state, 'done')
    })

    it('should passthrough LLM analysis in result', async () => {
      session.phase = 'teaching'
      llmAIService.generateTeachingResponse = async () => ({
        phase: 'teaching',
        action: 'teach',
        suggestedResponse: '勾股定理是...',
        analysis: '学生在提问概念'
      })
      const result = await session.handleUserMessage('什么是勾股定理')
      assert.strictEqual(result._analysis, '学生在提问概念')
    })
  })
})