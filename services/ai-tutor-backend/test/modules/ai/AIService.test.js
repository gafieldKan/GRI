/**
 * AIService 单元测试
 * 测试答案校验、文本标准化、数字提取、mock 响应
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { AIService } from '../../../src/modules/ai/AIService.js'

describe('AIService', () => {
  const ai = new AIService()

  describe('validateAnswer - choice questions', () => {
    it('should mark correct choice answer as correct', () => {
      const question = { id: 'q1', type: 'choice', answer: 'A', options: ['A', 'B', 'C', 'D'] }
      const result = ai.validateAnswer(question, 'A')
      assert.strictEqual(result.correct, true)
      assert.strictEqual(result.valid, true)
      assert.ok(result.explanation.includes('正确'))
    })

    it('should mark wrong choice answer as incorrect', () => {
      const question = { id: 'q1', type: 'choice', answer: 'A' }
      const result = ai.validateAnswer(question, 'B')
      assert.strictEqual(result.correct, false)
      assert.ok(result.explanation.includes('正确答案'))
    })

    it('should handle lowercase choice', () => {
      const question = { id: 'q1', type: 'choice', answer: 'A' }
      const result = ai.validateAnswer(question, 'a')
      assert.strictEqual(result.correct, true)
    })

    it('should handle answer with prefix text', () => {
      const question = { id: 'q1', type: 'choice', answer: 'C' }
      const result = ai.validateAnswer(question, '答案是C')
      assert.strictEqual(result.correct, true)
    })
  })

  describe('validateAnswer - fill/numeric questions', () => {
    it('should match exact numeric answer', () => {
      const question = { id: 'q2', type: 'fill', answer: '5' }
      const result = ai.validateAnswer(question, '5')
      assert.strictEqual(result.correct, true)
    })

    it('should match approximate numeric answer within 1%', () => {
      const question = { id: 'q2', type: 'fill', answer: '100' }
      const result = ai.validateAnswer(question, '100.5')
      assert.strictEqual(result.correct, true)
    })

    it('should reject significantly different numeric answer', () => {
      const question = { id: 'q2', type: 'fill', answer: '100' }
      const result = ai.validateAnswer(question, '50')
      assert.strictEqual(result.correct, false)
    })
  })

  describe('validateAnswer - text questions', () => {
    it('should mark essay-type answers as correct by default', () => {
      const question = { id: 'q3', type: 'essay', answer: 'long expected answer' }
      const result = ai.validateAnswer(question, 'some answer')
      assert.strictEqual(result.correct, true)
    })

    it('should match exact text answer', () => {
      const question = { id: 'q4', type: 'text', answer: '勾股定理' }
      const result = ai.validateAnswer(question, '勾股定理')
      assert.strictEqual(result.correct, true)
    })
  })

  describe('validateAnswer - edge cases', () => {
    it('should handle null question', () => {
      const result = ai.validateAnswer(null, 'anything')
      assert.strictEqual(result.valid, false)
      assert.strictEqual(result.correct, false)
    })

    it('should handle undefined student answer', () => {
      const question = { id: 'q1', type: 'choice', answer: 'A' }
      const result = ai.validateAnswer(question, undefined)
      assert.strictEqual(result.correct, false)
    })
  })

  describe('extractNumber', () => {
    it('should extract integer from string', () => {
      assert.strictEqual(ai.extractNumber('42'), 42)
    })

    it('should extract decimal from string', () => {
      assert.strictEqual(ai.extractNumber('3.14'), 3.14)
    })

    it('should extract number from text', () => {
      assert.strictEqual(ai.extractNumber('答案是 12'), 12)
    })

    it('should extract negative number', () => {
      assert.strictEqual(ai.extractNumber('-5'), -5)
    })

    it('should return null for non-numeric text', () => {
      assert.strictEqual(ai.extractNumber('hello'), null)
    })

    it('should return null for empty input', () => {
      assert.strictEqual(ai.extractNumber(''), null)
      assert.strictEqual(ai.extractNumber(null), null)
    })
  })

  describe('normalizeText', () => {
    it('should lowercase text', () => {
      assert.strictEqual(ai.normalizeText('HELLO'), 'hello')
    })

    it('should remove spaces', () => {
      assert.strictEqual(ai.normalizeText('a b c'), 'abc')
    })

    it('should remove punctuation', () => {
      assert.strictEqual(ai.normalizeText('hello, world!'), 'helloworld')
    })

    it('should handle empty input', () => {
      assert.strictEqual(ai.normalizeText(''), '')
      assert.strictEqual(ai.normalizeText(null), '')
    })
  })

  describe('_getMockResponse', () => {
    it('should return state-specific mock response', () => {
      const resp = ai._getMockResponse('WAIT_START')
      assert.ok(resp.content)
      assert.ok(resp.content.length > 0)
    })

    it('should return fallback for unknown state', () => {
      const resp = ai._getMockResponse('UNKNOWN_STATE')
      assert.ok(resp.content)
      assert.ok(resp.content.length > 0)
    })

    it('should include mock metadata', () => {
      const resp = ai._getMockResponse('TEACHING')
      assert.strictEqual(resp.metadata.model, 'mock')
    })
  })

  describe('generateVariantQuestion', () => {
    it('should return a question object', async () => {
      const result = await ai.generateVariantQuestion(
        { content: '3+4=?', answer: '7', type: 'fill' },
        2
      )
      assert.ok(result.question)
      assert.ok(result.answer)
      assert.ok(result.explanation)
    })
  })

  describe('generateResponse', () => {
    it('should return mock response when no API key configured', async () => {
      const result = await ai.generateResponse({
        currentState: 'WAIT_START',
        knowledgePoint: '勾股定理',
      })
      assert.ok(result.content)
      assert.strictEqual(result.metadata.model, 'mock')
    })
  })

  describe('retrieveKnowledge', () => {
    it('should return pythagorean theorem knowledge', async () => {
      const kp = await ai.retrieveKnowledge('math_pythagorean')
      assert.ok(kp.definition)
      assert.ok(kp.formula)
      assert.ok(kp.examples)
      assert.ok(kp.commonMistakes)
    })

    it('should return fallback for unknown knowledge point', async () => {
      const kp = await ai.retrieveKnowledge('unknown_kp')
      assert.strictEqual(kp.definition, '知识点定义')
    })
  })

  describe('analyzeUserMessage', () => {
    it('should return null when no API key configured', async () => {
      const result = await ai.analyzeUserMessage({
        currentState: 'TEACHING',
        userMessage: '我理解了'
      })
      assert.strictEqual(result, null)
    })

    it('should return null when userMessage is empty', async () => {
      const result = await ai.analyzeUserMessage({
        currentState: 'WAIT_START',
        userMessage: ''
      })
      assert.strictEqual(result, null)
    })
  })

  describe('_parseAnalysisJSON', () => {
    it('should parse valid JSON directly', () => {
      const json = '{"intent":"answer","answerCorrect":true,"confidence":0.9}'
      const result = ai._parseAnalysisJSON(json)
      assert.strictEqual(result.intent, 'answer')
      assert.strictEqual(result.answerCorrect, true)
      assert.strictEqual(result.confidence, 0.9)
    })

    it('should parse JSON wrapped in text via regex fallback', () => {
      const text = '分析结果如下：\n{"intent":"confused","answerCorrect":null,"confidence":0.8}\n希望对你有帮助'
      const result = ai._parseAnalysisJSON(text)
      assert.strictEqual(result.intent, 'confused')
      assert.strictEqual(result.answerCorrect, null)
      assert.strictEqual(result.confidence, 0.8)
    })

    it('should return null for text without JSON', () => {
      const result = ai._parseAnalysisJSON('这是一段普通的文字回复')
      assert.strictEqual(result, null)
    })

    it('should return null for malformed JSON', () => {
      const result = ai._parseAnalysisJSON('{intent: broken,}')
      assert.strictEqual(result, null)
    })

    it('should return null for empty input', () => {
      assert.strictEqual(ai._parseAnalysisJSON(''), null)
      assert.strictEqual(ai._parseAnalysisJSON(null), null)
    })
  })
})