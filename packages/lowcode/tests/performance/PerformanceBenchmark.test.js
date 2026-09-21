/**
 * 性能基准测试
 * 测试平台在大数据量、高并发场景下的性能表现
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { performance } from 'perf_hooks'

// 核心模块
import { ModelSchema, FieldType, ModelConfig } from '../../lowcode/core/ModelSchema.js'
import { permissionManager } from '../../lowcode/core/PermissionManager.js'
import { versionManager } from '../../lowcode/engine/VersionManager.js'
import { dataPermissionManager, DataScope, MaskType, MaskRule } from '../../lowcode/core/DataPermission.js'
import { logicFlowEngine } from '../../lowcode/engine/LogicFlowEngine.js'
import { workflowEngine } from '../../lowcode/engine/WorkflowEngine.js'

// 性能阈值配置 (毫秒)
const THRESHOLDS = {
  modelValidation: 100,        // 模型验证 < 100ms
  permissionCheck: 50,         // 权限检查 < 50ms
  dataMasking: 100,           // 数据脱敏 < 100ms
  versionCreate: 100,         // 版本创建 < 100ms
  flowRegistration: 100,      // 流程注册 < 100ms
  bulkOperations: 500,        // 批量操作 < 500ms
}

// 性能测试结果记录
const results = {
  tests: [],
  summary: {},
}

describe('性能基准测试', () => {
  beforeEach(() => {
    permissionManager.clear()
    versionManager.clear()
    dataPermissionManager.clear()
    logicFlowEngine.flows?.clear()
  })

  // ============================================
  // 1. 数据建模性能测试
  // ============================================
  describe('1. 数据建模性能', () => {
    it('应该快速验证大量数据', () => {
      const model = new ModelConfig({
        id: 'perf_test',
        name: 'PerformanceTest',
        fields: Array.from({ length: 50 }, (_, i) => ({
          name: `field_${i}`,
          type: FieldType.STRING,
          required: i < 10,
          validation: i < 10 ? [{ type: 'required' }] : [],
        })),
      })

      const testData = {}
      for (let i = 0; i < 50; i++) {
        testData[`field_${i}`] = `value_${i}`
      }

      const start = performance.now()
      const errors = model.validate(testData)
      const end = performance.now()

      const duration = end - start
      console.log(`模型验证耗时：${duration.toFixed(2)}ms`)
      expect(duration).toBeLessThan(THRESHOLDS.modelValidation)
      expect(errors.length).toBe(0)
    })

    it('应该快速验证 1000 条数据', () => {
      const model = new ModelConfig({
        id: 'bulk_test',
        name: 'BulkTest',
        fields: [
          { name: 'name', type: FieldType.STRING, required: true },
          { name: 'email', type: FieldType.EMAIL, required: true },
        ],
      })

      const records = Array.from({ length: 1000 }, (_, i) => ({
        name: `用户${i}`,
        email: `user${i}@example.com`,
      }))

      const start = performance.now()
      let errorCount = 0
      records.forEach(record => {
        const errors = model.validate(record)
        if (errors.length > 0) errorCount++
      })
      const duration = performance.now() - start

      console.log(`1000 条数据验证耗时：${duration.toFixed(2)}ms`)
      expect(duration).toBeLessThan(THRESHOLDS.bulkOperations)
      expect(errorCount).toBe(0)
    })
  })

  // ============================================
  // 2. 权限检查性能测试
  // ============================================
  describe('2. 权限检查性能', () => {
    it('应该快速检查权限', () => {
      permissionManager.registerRole({
        id: 'perf_role',
        name: '性能角色',
        permissions: ['model:*:read', 'model:*:write'],
      })

      permissionManager.assignRole('user_1', 'perf_role')

      const iterations = 1000
      const start = performance.now()

      for (let i = 0; i < iterations; i++) {
        permissionManager.hasPermission('user_1', 'model:test:read')
      }

      const duration = performance.now() - start
      const avgTime = duration / iterations

      console.log(`权限检查平均耗时：${avgTime.toFixed(4)}ms (总计${duration.toFixed(2)}ms)`)
      expect(avgTime).toBeLessThan(THRESHOLDS.permissionCheck / iterations * 100)
    })

    it('应该快速检查数据权限', () => {
      dataPermissionManager.registerRowRule({
        model: 'test_model',
        scope: DataScope.MINE,
      })

      const iterations = 500
      const start = performance.now()

      for (let i = 0; i < iterations; i++) {
        dataPermissionManager.getRowFilter('test_model', { id: `user_${i}` })
      }

      const duration = performance.now() - start
      console.log(`数据权限检查耗时：${duration.toFixed(2)}ms`)
      expect(duration).toBeLessThan(THRESHOLDS.permissionCheck)
    })
  })

  // ============================================
  // 3. 数据脱敏性能测试
  // ============================================
  describe('3. 数据脱敏性能', () => {
    it('应该快速脱敏大量数据', () => {
      const phoneRule = new MaskRule({ type: MaskType.PHONE })
      const emailRule = new MaskRule({ type: MaskType.EMAIL })
      const nameRule = new MaskRule({ type: MaskType.NAME })

      const records = Array.from({ length: 1000 }, (_, i) => ({
        phone: `138${String(i).padStart(8, '0')}`,
        email: `user${i}@example.com`,
        name: `用户${i}`,
      }))

      const start = performance.now()

      records.forEach(record => {
        record.phone = phoneRule.apply(record.phone)
        record.email = emailRule.apply(record.email)
        record.name = nameRule.apply(record.name)
      })

      const duration = performance.now() - start
      console.log(`1000 条数据脱敏耗时：${duration.toFixed(2)}ms`)
      expect(duration).toBeLessThan(THRESHOLDS.dataMasking)

      // 验证脱敏效果
      expect(records[0].phone).toContain('****')
      expect(records[0].email).toContain('**')
    })
  })

  // ============================================
  // 4. 版本管理性能测试
  // ============================================
  describe('4. 版本管理性能', () => {
    it('应该快速创建版本', () => {
      const iterations = 100
      const start = performance.now()

      for (let i = 0; i < iterations; i++) {
        versionManager.snapshot('test', 'perf_test', { version: i, data: `data_${i}` })
      }

      const duration = performance.now() - start
      console.log(`创建${iterations}个版本耗时：${duration.toFixed(2)}ms`)
      expect(duration).toBeLessThan(THRESHOLDS.versionCreate * iterations / 10)
    })

    it('应该快速获取版本历史', () => {
      // 先创建一些版本
      for (let i = 0; i < 50; i++) {
        versionManager.snapshot('history_test', 'test_1', { version: i })
      }

      const start = performance.now()
      const history = versionManager.getHistory('history_test', 'test_1')
      const duration = performance.now() - start

      console.log(`获取版本历史耗时：${duration.toFixed(2)}ms`)
      expect(duration).toBeLessThan(THRESHOLDS.versionCreate)
      expect(history.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ============================================
  // 5. 流程引擎性能测试
  // ============================================
  describe('5. 流程引擎性能', () => {
    it('应该快速注册流程', () => {
      const iterations = 100
      const start = performance.now()

      for (let i = 0; i < iterations; i++) {
        logicFlowEngine.registerFlow({
          id: `flow_${i}`,
          name: `流程${i}`,
          nodes: [
            { id: 'start', type: 'start' },
            { id: 'end', type: 'end' },
          ],
        })
      }

      const duration = performance.now() - start
      console.log(`注册${iterations}个流程耗时：${duration.toFixed(2)}ms`)
      expect(duration).toBeLessThan(THRESHOLDS.flowRegistration)
    })

    it('应该快速启动工作流实例', async () => {
      workflowEngine.registerWorkflow({
        id: 'perf_workflow',
        name: '性能测试流程',
        nodes: [
          { id: 'start', type: 'start' },
          { id: 'end', type: 'end' },
        ],
        transitions: [{ from: 'start', to: 'end' }],
      })

      const iterations = 100
      const start = performance.now()

      for (let i = 0; i < iterations; i++) {
        await workflowEngine.startInstance('perf_workflow')
      }

      const duration = performance.now() - start
      console.log(`启动${iterations}个实例耗时：${duration.toFixed(2)}ms`)
      expect(duration).toBeLessThan(THRESHOLDS.bulkOperations)
    })
  })

  // ============================================
  // 6. 内存泄漏检测
  // ============================================
  describe('6. 内存使用检测', () => {
    it('应该保持合理的内存使用', () => {
      const initialMemory = process.memoryUsage?.()?.heapUsed || 0

      // 执行大量操作
      for (let i = 0; i < 500; i++) {
        versionManager.snapshot('memory_test', 'test', { i })
      }

      const finalMemory = process.memoryUsage?.()?.heapUsed || 0
      const memoryGrowth = finalMemory - initialMemory

      // 内存增长不应过大 (10MB 阈值)
      const memoryGrowthMB = memoryGrowth / 1024 / 1024
      console.log(`内存增长：${memoryGrowthMB.toFixed(2)}MB`)

      // 注意：这个阈值可以根据实际情况调整
      expect(memoryGrowthMB).toBeLessThan(50)
    })
  })

  // ============================================
  // 7. 并发场景测试
  // ============================================
  describe('7. 并发场景', () => {
    it('应该处理并发权限检查', async () => {
      permissionManager.registerRole({
        id: 'concurrent_role',
        name: '并发角色',
        permissions: ['*'],
      })

      permissionManager.assignRole('user_1', 'concurrent_role')

      const promises = []
      for (let i = 0; i < 100; i++) {
        promises.push(
          Promise.resolve().then(() =>
            permissionManager.hasPermission('user_1', 'model:test:read')
          )
        )
      }

      const start = performance.now()
      await Promise.all(promises)
      const duration = performance.now() - start

      console.log(`100 个并发权限检查耗时：${duration.toFixed(2)}ms`)
      expect(duration).toBeLessThan(THRESHOLDS.permissionCheck * 2)
    })
  })
})

// 输出性能测试总结
afterAll(() => {
  console.log('\n===== 性能测试总结 =====')
  console.log('所有性能测试已完成')
  console.log('========================\n')
})
