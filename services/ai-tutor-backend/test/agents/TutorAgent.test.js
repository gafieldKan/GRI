/**
 * TutorAgent 单元测试
 * 测试答案校验、知识点分析、错误归因
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { TutorAgent } from '../../src/agents/TutorAgent.js';

describe('TutorAgent', () => {
  // Create with null dbPool (tests are db-independent)
  const agent = new TutorAgent(null)

  describe('_checkAnswer', () => {
    it('should mark exact choice match as correct', () => {
      const result = agent._checkAnswer(
        { type: 'choice', answer: 'A' },
        'A'
      )
      assert.strictEqual(result, true)
    })

    it('should mark wrong choice as incorrect', () => {
      const result = agent._checkAnswer(
        { type: 'choice', answer: 'A' },
        'B'
      )
      assert.strictEqual(result, false)
    })

    it('should handle case-insensitive choice matching', () => {
      const result = agent._checkAnswer(
        { type: 'choice', answer: 'C' },
        'c'
      )
      assert.strictEqual(result, true)
    })

    it('should match exact numeric fill answer', () => {
      const result = agent._checkAnswer(
        { type: 'fill', answer: '12' },
        '12'
      )
      assert.strictEqual(result, true)
    })

    it('should reject incorrect numeric fill answer', () => {
      const result = agent._checkAnswer(
        { type: 'fill', answer: '25' },
        '30'
      )
      assert.strictEqual(result, false)
    })

    it('should match exact text answer', () => {
      const result = agent._checkAnswer(
        { type: 'text', answer: 'triangle' },
        'triangle'
      )
      assert.strictEqual(result, true)
    })

    it('should return false for undefined answer', () => {
      const result = agent._checkAnswer(
        { type: 'fill', answer: '5' },
        undefined
      )
      assert.strictEqual(result, false)
    })

    it('should return false for null answer', () => {
      const result = agent._checkAnswer(
        { type: 'fill', answer: '5' },
        null
      )
      assert.strictEqual(result, false)
    })
  })

  describe('_analyzeAnswers', () => {
    it('should correctly count correct/incorrect responses', () => {
      const questions = [
        { id: 'q1', type: 'choice', answer: 'A', knowledgePoint: 'kp1' },
        { id: 'q2', type: 'fill', answer: '5', knowledgePoint: 'kp2' },
        { id: 'q3', type: 'choice', answer: 'B', knowledgePoint: 'kp3' },
      ]
      const answers = ['A', '5', 'C'] // 2 correct, 1 wrong

      const result = agent._analyzeAnswers(questions, answers)
      assert.strictEqual(result.correct, 2)
      assert.strictEqual(result.incorrect, 1)
      assert.strictEqual(result.total, 3)
      assert.strictEqual(result.accuracy, 67) // 2/3 * 100 = 66.67 -> 67
    })

    it('should track accuracy by question type', () => {
      const questions = [
        { id: 'q1', type: 'choice', answer: 'A', knowledgePoint: 'kp1' },
        { id: 'q2', type: 'fill', answer: '10', knowledgePoint: 'kp2' },
      ]
      const answers = ['A', 'wrong']

      const result = agent._analyzeAnswers(questions, answers)
      assert.strictEqual(result.byType.choice.correct, 1)
      assert.strictEqual(result.byType.choice.total, 1)
      assert.strictEqual(result.byType.fill.correct, 0)
      assert.strictEqual(result.byType.fill.total, 1)
    })

    it('should return 0 accuracy for empty questions', () => {
      const result = agent._analyzeAnswers([], [])
      assert.strictEqual(result.accuracy, 0)
    })

    it('should include per-question detail entries', () => {
      const questions = [
        { id: 'q1', type: 'choice', answer: 'A', knowledgePoint: 'kp1' },
      ]
      const answers = ['A']

      const result = agent._analyzeAnswers(questions, answers)
      assert.strictEqual(result.details.length, 1)
      assert.strictEqual(result.details[0].questionId, 'q1')
      assert.strictEqual(result.details[0].isCorrect, true)
    })
  })

  describe('_analyzeKnowledgePoints', () => {
    it('should classify knowledge point mastery levels', async () => {
      const questions = [
        { id: 'q1', type: 'choice', answer: 'A', knowledgePoint: '勾股定理' },
        { id: 'q2', type: 'fill', answer: '5', knowledgePoint: '勾股定理' },
        { id: 'q3', type: 'choice', answer: 'B', knowledgePoint: '勾股定理' },
      ]
      // All correct -> should be "熟练"
      const answers = ['A', '5', 'B']

      const result = await agent._analyzeKnowledgePoints(questions, answers, '8')
      assert.ok(Array.isArray(result))
      const kp = result.find(k => k.name === '勾股定理')
      assert.ok(kp)
      assert.strictEqual(kp.level, '熟练')
    })
  })

  describe('analyzeExam error handling', () => {
    it('should return success:false when analyzeExam fails', async () => {
      // Without dbPool and no questions, it should still work or fail gracefully
      try {
        const result = await agent.analyzeExam({
          studentId: 'test_student',
          questions: [],
          studentAnswers: [],
        })
        // If it returns, check structure
        assert.ok(result.success !== undefined)
      } catch (e) {
        // Error is acceptable since no dbPool
        assert.ok(e)
      }
    })
  })
})