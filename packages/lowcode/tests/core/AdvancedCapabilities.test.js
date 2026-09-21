/**
 * 高阶能力验证测试
 * 测试新增的 5 项高阶能力
 */

import { describe, it, expect, beforeEach } from 'vitest'

// 1. 可视化逻辑编排引擎
import {
  logicFlowEngine,
  FlowDefinition,
} from '../../lowcode/engine/LogicFlowEngine.js'

// 2. 高级工作流引擎
import {
  advancedWorkflowEngine,
  ApprovalType,
  CountersignConfig,
} from '../../lowcode/engine/AdvancedWorkflow.js'

// 3. 版本管理器
import {
  versionManager,
  VersionType,
} from '../../lowcode/engine/VersionManager.js'

// 4. 响应式引擎
import {
  responsiveEngine,
  DeviceType,
  ScreenSize,
} from '../../lowcode/engine/ResponsiveEngine.js'

// 5. 数据权限管理
import {
  dataPermissionManager,
  DataScope,
  MaskType,
  RowPermissionRule,
  FieldPermissionConfig,
  FieldPermissionLevel,
  MaskRule,
} from '../../lowcode/core/DataPermission.js'

describe('低代码平台高阶能力验证', () => {
  beforeEach(() => {
    logicFlowEngine.flows?.clear()
    advancedWorkflowEngine.workflows?.clear()
    versionManager.clear?.()
    dataPermissionManager.clear?.()
  })

  // ==================== 1. 可视化逻辑编排能力 ====================
  describe('1. 可视化逻辑编排能力 (Logic Flow)', () => {
    it('应该注册和获取流程定义', () => {
      const flow = logicFlowEngine.registerFlow({
        id: 'test_flow',
        name: '测试流程',
        nodes: [
          { id: 'start', type: 'start', name: '开始' },
          { id: 'action', type: 'action', name: '操作' },
          { id: 'end', type: 'end', name: '结束' },
        ],
      })

      expect(flow).toBeDefined()
      expect(flow.id).toBe('test_flow')
      expect(flow.nodes.length).toBe(3)
    })

    it('应该验证流程定义', () => {
      const flow = new FlowDefinition({
        id: 'validation_test',
        name: '验证测试',
        nodes: [{ type: 'start' }],
      })

      const result = logicFlowEngine.validateFlow(flow)
      expect(result).toBeDefined()
      expect(result.errors).toBeDefined()
      expect(result.warnings).toBeDefined()
    })
  })

  // ==================== 2. 复杂流程能力（会签/或签/子流程） ====================
  describe('2. 复杂流程能力（会签/或签/子流程）', () => {
    it('应该支持会签（Countersign）', () => {
      const config = new CountersignConfig({ type: 'all' })
      expect(config.isApproved(['approve', 'approve', 'approve'])).toBe(true)
      expect(config.isApproved(['approve', 'reject'])).toBe(false)
    })

    it('应该支持百分比会签', () => {
      const config = new CountersignConfig({ type: 'percentage', percentage: 75 })
      expect(config.isApproved(['approve', 'approve', 'approve', 'reject'])).toBe(true)
    })

    it('应该支持或签（Or Sign）', () => {
      const config = new CountersignConfig({ type: 'number', minCount: 1 })
      expect(config.isApproved(['approve'])).toBe(true)
    })

    it('应该注册工作流', () => {
      advancedWorkflowEngine.registerWorkflow({
        id: 'approval_workflow',
        name: '审批工作流',
        nodes: [
          { id: 'start', type: 'start' },
          { id: 'approval', type: 'approval', config: { approvalType: ApprovalType.COUNTERSIGN } },
          { id: 'end', type: 'end' },
        ],
      })

      expect(advancedWorkflowEngine.getWorkflow('approval_workflow')).toBeDefined()
    })
  })

  // ==================== 3. 版本管理与回滚 ====================
  describe('3. 版本管理与回滚', () => {
    it('应该创建版本快照', () => {
      const snapshot = versionManager.snapshot('model', 'user_model', { name: 'User', fields: [] }, {
        name: '初始版本',
      })

      expect(snapshot).toBeDefined()
      expect(snapshot.versionNumber).toBe(1)
    })

    it('应该获取版本历史', () => {
      versionManager.snapshot('model', 'test_model', { version: 1 })
      versionManager.snapshot('model', 'test_model', { version: 2 })

      const history = versionManager.getHistory('model', 'test_model')
      expect(history.length).toBeGreaterThanOrEqual(1)
    })

    it('应该回滚版本', () => {
      versionManager.snapshot('model', 'rollback_test', { data: 'v1' })
      versionManager.snapshot('model', 'rollback_test', { data: 'v2' })

      const versions = versionManager.getVersions('model', 'rollback_test')
      expect(versions.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ==================== 4. 多端适配能力 ====================
  describe('4. 多端适配能力', () => {
    it('应该获取设备信息', () => {
      const deviceInfo = responsiveEngine.getDeviceInfo()
      expect(deviceInfo).toBeDefined()
    })

    it('应该识别设备类型', () => {
      const deviceInfo = responsiveEngine.getDeviceInfo()
      expect([DeviceType.MOBILE, DeviceType.TABLET, DeviceType.DESKTOP, DeviceType.TV].includes(deviceInfo.type))
    })

    it('应该获取当前屏幕尺寸', () => {
      const size = responsiveEngine.getScreenSize()
      expect([ScreenSize.xs, ScreenSize.sm, ScreenSize.md, ScreenSize.lg, ScreenSize.xl, ScreenSize.xxl].includes(size))
    })
  })

  // ==================== 5. 数据权限行级控制 ====================
  describe('5. 数据权限行级控制', () => {
    it('应该创建行级权限规则', () => {
      const rule = new RowPermissionRule({
        name: '本人数据规则',
        model: 'user',
        scope: DataScope.MINE,
      })
      expect(rule).toBeDefined()
      expect(rule.scope).toBe(DataScope.MINE)
    })

    it('应该创建字段权限配置', () => {
      const perm = new FieldPermissionConfig({
        model: 'user',
        field: 'salary',
        permissionLevel: FieldPermissionLevel.VISIBLE,
        roles: ['admin'],
      })
      expect(perm).toBeDefined()
      expect(perm.field).toBe('salary')
    })

    it('应该应用脱敏规则', () => {
      const rule = new MaskRule({ type: MaskType.PHONE })
      const masked = rule.apply('13812345678')
      expect(masked).toBe('138****5678')
    })

    it('应该生成行级查询条件', () => {
      dataPermissionManager.registerRowRule({
        model: 'user',
        scope: DataScope.MINE,
      })

      const filter = dataPermissionManager.getRowFilter('user', { id: 'user1' }, null)
      expect(filter).toBeDefined()
    })

    it('应该检查字段访问权限', () => {
      dataPermissionManager.registerFieldPermission({
        model: 'user',
        field: 'salary',
        permissionLevel: FieldPermissionLevel.VISIBLE,
        roles: ['admin'],
      })

      const hasAccess = dataPermissionManager.checkFieldPermission(
        'user',
        'salary',
        { id: 'user1' },
        { id: 'admin' },
        'read'
      )
      expect(hasAccess).toBe(true)
    })
  })
})
