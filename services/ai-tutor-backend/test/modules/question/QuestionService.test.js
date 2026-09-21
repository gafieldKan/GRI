/**
 * QuestionService 单元测试
 * 测试题目 CRUD、答案验证、按类型获取题目
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { QuestionService } from '../../../src/modules/question/QuestionService.js'

describe('QuestionService', () => {
  let qs

  beforeEach(() => {
    qs = new QuestionService(null)
  })

  describe('verifyAnswer', () => {
    it('should mark correct answer as correct', async () => {
      const result = await qs.verifyAnswer('q1', '5')
      assert.strictEqual(result.correct, true)
      assert.strictEqual(result.correctAnswer, '5')
    })

    it('should mark incorrect answer as incorrect', async () => {
      const result = await qs.verifyAnswer('q1', 'wrong answer')
      assert.strictEqual(result.correct, false)
    })

    it('should handle case-insensitive matching for choice', async () => {
      // q2 has answer 'A'
      const result = await qs.verifyAnswer('q2', 'a')
      assert.strictEqual(result.correct, true)
    })

    it('should return error for non-existent question', async () => {
      const result = await qs.verifyAnswer('nonexistent', 'anything')
      assert.strictEqual(result.correct, false)
      assert.ok(result.error)
    })
  })

  describe('getDiagnosisQuestions', () => {
    it('should return diagnosis questions for pythagorean', async () => {
      const questions = await qs.getDiagnosisQuestions('pythagorean')
      assert.ok(Array.isArray(questions))
      assert.ok(questions.length > 0)
    })
  })

  describe('getQuizQuestions', () => {
    it('should return specified count of quiz questions', async () => {
      const questions = await qs.getQuizQuestions('pythagorean', 2)
      assert.ok(Array.isArray(questions))
      assert.ok(questions.length <= 2)
    })
  })

  describe('getTeachingQuestions', () => {
    it('should return teaching questions', async () => {
      const questions = await qs.getTeachingQuestions('pythagorean')
      assert.ok(Array.isArray(questions))
    })
  })

  describe('addQuestion', () => {
    it('should add a new question and return it with generated id', async () => {
      const q = await qs.addQuestion({
        knowledgePointId: 'test_kp',
        content: 'Test question?',
        answer: 'test_answer',
        type: 'fill',
      })
      assert.ok(q.id)
      assert.strictEqual(q.content, 'Test question?')
    })
  })

  describe('deleteQuestion', () => {
    it('should delete existing question by id', async () => {
      await qs.addQuestion({ knowledgePointId: 'kp', content: 'to delete', answer: 'x', type: 'fill' })
      const result = await qs.deleteQuestion('q1')
      // q1 is from mock init, should be deleted
      assert.strictEqual(result, true)
    })
  })

  describe('updateQuestion', () => {
    it('should update existing question fields', async () => {
      const updated = await qs.updateQuestion('q1', { difficulty: 3, content: 'updated content' })
      assert.ok(updated)
      assert.strictEqual(updated.difficulty, 3)
      assert.strictEqual(updated.content, 'updated content')
    })

    it('should return null for non-existent question', async () => {
      const result = await qs.updateQuestion('no_such_q', { difficulty: 1 })
      assert.strictEqual(result, null)
    })
  })
})