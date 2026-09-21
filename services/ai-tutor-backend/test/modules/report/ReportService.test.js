/**
 * ReportService 单元测试
 * 测试学习记录、报告生成、掌握度计算、薄弱点识别
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { ReportService } from '../../../src/modules/report/ReportService.js'

describe('ReportService', () => {
  let rs

  beforeEach(() => {
    rs = new ReportService()
  })

  describe('recordLearning', () => {
    it('should record learning data and return the record', async () => {
      const record = await rs.recordLearning('sess_1', 'student_1', {
        type: 'quiz',
        knowledgePointId: 'kp1',
        correct: true,
      })
      assert.strictEqual(record.sessionId, 'sess_1')
      assert.strictEqual(record.studentId, 'student_1')
      assert.strictEqual(record.correct, true)
    })

    it('should append to existing student records', async () => {
      await rs.recordLearning('sess_1', 'student_1', { type: 'quiz', correct: true })
      await rs.recordLearning('sess_2', 'student_1', { type: 'quiz', correct: false })
      const records = rs.learningRecords.get('student_1')
      assert.strictEqual(records.length, 2)
    })
  })

  describe('generateReport', () => {
    it('should generate report with stats and suggestions', async () => {
      await rs.recordLearning('s1', 'st1', { type: 'quiz', correct: true, knowledgePointId: 'kp1', knowledgePointName: '勾股定理' })
      await rs.recordLearning('s2', 'st1', { type: 'quiz', correct: false, knowledgePointId: 'kp1', knowledgePointName: '勾股定理' })

      const report = await rs.generateReport('st1')
      assert.strictEqual(report.studentId, 'st1')
      assert.ok(report.stats)
      assert.ok(Array.isArray(report.masteryByKnowledge))
      assert.ok(Array.isArray(report.suggestions))
      assert.ok(report.generatedAt)
    })

    it('should return empty stats for unknown student', async () => {
      const report = await rs.generateReport('unknown_student')
      assert.strictEqual(report.stats.studyDays, 0)
      assert.strictEqual(report.stats.totalQuestions, 0)
      assert.strictEqual(report.stats.correctRate, 0)
    })

    it('should include weakness suggestion when mastery < 60%', async () => {
      // 3 wrong, 1 correct = 25% mastery
      for (let i = 0; i < 3; i++) {
        await rs.recordLearning(`s${i}`, 'st_low', { type: 'quiz', correct: false, knowledgePointId: 'kp1', knowledgePointName: '薄弱点' })
      }
      await rs.recordLearning('s4', 'st_low', { type: 'quiz', correct: true, knowledgePointId: 'kp1', knowledgePointName: '薄弱点' })

      const report = await rs.generateReport('st_low')
      const weaknessSuggestions = report.suggestions.filter(s => s.type === 'weakness')
      assert.ok(weaknessSuggestions.length > 0)
      assert.strictEqual(weaknessSuggestions[0].priority, 'high')
    })

    it('should include excellence suggestion when mastery >= 80%', async () => {
      for (let i = 0; i < 9; i++) {
        await rs.recordLearning(`s${i}`, 'st_high', { type: 'quiz', correct: true, knowledgePointId: 'kp1', knowledgePointName: '擅长点' })
      }
      await rs.recordLearning('s9', 'st_high', { type: 'quiz', correct: false, knowledgePointId: 'kp1', knowledgePointName: '擅长点' })

      const report = await rs.generateReport('st_high')
      const excelSuggestions = report.suggestions.filter(s => s.type === 'excellence')
      assert.ok(excelSuggestions.length > 0)
    })
  })

  describe('getWeaknessList', () => {
    it('should return weak knowledge points below threshold', async () => {
      await rs.recordLearning('s1', 'st1', { type: 'quiz', correct: false, knowledgePointId: 'kp1', knowledgePointName: '弱点A' })
      await rs.recordLearning('s2', 'st1', { type: 'quiz', correct: false, knowledgePointId: 'kp1', knowledgePointName: '弱点A' })
      await rs.recordLearning('s3', 'st1', { type: 'quiz', correct: true, knowledgePointId: 'kp2', knowledgePointName: '强点B' })

      const weakList = await rs.getWeaknessList('st1', 60)
      assert.ok(weakList.length > 0)
      weakList.forEach(w => {
        assert.ok(w.mastery < 60)
        assert.ok(w.reason)
      })
    })

    it('should return empty list when all above threshold', async () => {
      for (let i = 0; i < 5; i++) {
        await rs.recordLearning(`s${i}`, 'st_good', { type: 'quiz', correct: true, knowledgePointId: 'kp1', knowledgePointName: 'all good' })
      }
      const weakList = await rs.getWeaknessList('st_good', 60)
      assert.strictEqual(weakList.length, 0)
    })
  })

  describe('_calculateStats', () => {
    it('should calculate study days correctly', async () => {
      await rs.recordLearning('s1', 'st_days', {
        type: 'quiz', correct: true, knowledgePointId: 'kp1',
        timestamp: Date.now() - 86400000, // yesterday
      })
      await rs.recordLearning('s2', 'st_days', {
        type: 'quiz', correct: false, knowledgePointId: 'kp1',
        timestamp: Date.now(), // today
      })

      const report = await rs.generateReport('st_days')
      assert.strictEqual(report.stats.studyDays, 2)
    })
  })

  describe('generateReport (from analysis_reports DB)', () => {
    it('should map knowledge_points to mastery list sorted by mastery asc', async () => {
      const dbPool = {
        query: async () => ({
          rows: [{
            knowledge_points: [
              { id: 'kp_a', name: '勾股定理', mastery: 0.9, level: '熟练', totalQuestions: 10, correctCount: 9 },
              { id: 'kp_b', name: '二次函数', mastery: 0.4, level: '薄弱', totalQuestions: 10, correctCount: 4 }
            ],
            ai_suggestions: ['加强基础复习', '多做练习'],
            weak_points: ['二次函数'],
            created_at: new Date().toISOString()
          }]
        })
      }
      const dbRs = new ReportService(dbPool)
      const report = await dbRs.generateReport('st1')

      assert.strictEqual(report.studentId, 'st1')
      // mastery 0-100，升序
      assert.strictEqual(report.masteryByKnowledge[0].name, '二次函数')
      assert.strictEqual(report.masteryByKnowledge[0].mastery, 40)
      assert.strictEqual(report.masteryByKnowledge[1].mastery, 90)
      // stats 由答对率加权
      assert.strictEqual(report.stats.totalQuestions, 20)
      assert.strictEqual(report.stats.correctRate, Math.round(13 / 20 * 100))
      // suggestions 为字符串数组
      assert.deepStrictEqual(report.suggestions, ['加强基础复习', '多做练习'])
    })

    it('should return empty report when no analysis exists', async () => {
      const dbPool = { query: async () => ({ rows: [] }) }
      const dbRs = new ReportService(dbPool)
      const report = await dbRs.generateReport('unknown')

      assert.deepStrictEqual(report.masteryByKnowledge, [])
      assert.strictEqual(report.stats.correctRate, 0)
      assert.deepStrictEqual(report.suggestions, [])
    })
  })
})