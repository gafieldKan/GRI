/**
 * 低代码平台核心能力验证测试
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { moduleManager, Module, ModuleState, ModuleLevel } from '../../lowcode/core/ModuleManager.js'
import { tenantManager, TenantState } from '../../lowcode/core/TenantManager.js'
import { permissionManager } from '../../lowcode/core/PermissionManager.js'
import { pluginRegistry } from '../../lowcode/core/PluginRegistry.js'
import { pluginMarket } from '../../lowcode/plugins/PluginMarket.js'
import { eventEngine, EventPriority } from '../../lowcode/engine/EventEngine.js'
import { workflowEngine } from '../../lowcode/engine/WorkflowEngine.js'

describe('低代码平台核心能力验证', () => {
  beforeEach(() => {
    pluginRegistry.clear()
    tenantManager.clear()
    permissionManager.clear()
    eventEngine.clear()
    // 不清除 moduleManager，因为它需要重新初始化
  })

  describe('1. 模块管理能力', () => {
    it('应该获取所有一级模块 (行业维度)', () => {
      const modules = moduleManager.getIndustryModules()
      expect(modules.length).toBeGreaterThan(0)
      expect(modules.some(m => m.id === 'catering')).toBe(true)
      expect(modules.some(m => m.id === 'agriculture')).toBe(true)
      expect(modules.some(m => m.id === 'logistics')).toBe(true)
    })

    it('应该获取模块树', () => {
      const tree = moduleManager.getModuleTree()
      expect(Array.isArray(tree)).toBe(true)
      expect(tree.length).toBeGreaterThan(0)
    })

    it('应该通过 ID 获取模块', () => {
      const catering = moduleManager.getModule('catering')
      expect(catering).toBeDefined()
      expect(catering.id).toBe('catering')
    })

    it('应该支持模块层级结构', () => {
      const catering = moduleManager.getModule('catering')
      expect(catering.level).toBe(1) // INDUSTRY = 1
    })
  })

  describe('2. 插件管理能力', () => {
    it('应该注册和获取插件', () => {
      const plugin = {
        name: 'test-plugin',
        type: 'component',
        version: '1.0.0'
      }
      pluginRegistry.register(plugin)
      const retrieved = pluginRegistry.get('test-plugin')
      expect(retrieved).toBeDefined()
      expect(retrieved.name).toBe('test-plugin')
    })

    it('应该按类型获取插件', () => {
      pluginRegistry.register({ name: 'plugin1', type: 'component' })
      pluginRegistry.register({ name: 'plugin2', type: 'formComponent' })

      const components = pluginRegistry.getByType('component')
      expect(components.length).toBe(1)
    })

    it('插件市场应该获取内置插件', () => {
      const plugins = pluginMarket.getAllPlugins()
      expect(plugins.length).toBeGreaterThan(0)
    })
  })

  describe('3. 事件驱动能力', () => {
    it('应该发布和订阅事件', async () => {
      let called = false
      eventEngine.on('test:event', () => {
        called = true
      })
      await eventEngine.emit('test:event')
      expect(called).toBe(true)
    })

    it('应该支持事件优先级', async () => {
      const results = []
      eventEngine.on('test:priority', () => results.push(1), EventPriority.LOW)
      eventEngine.on('test:priority', () => results.push(2), EventPriority.HIGH)
      eventEngine.on('test:priority', () => results.push(3), EventPriority.NORMAL)

      await eventEngine.emit('test:priority')
      expect(results).toEqual([2, 3, 1])
    })

    it('应该支持事件拦截器', async () => {
      let intercepted = false
      eventEngine.addInterceptor('test:intercept', () => {
        intercepted = true
        return false
      })

      let called = false
      eventEngine.on('test:intercept', () => {
        called = true
      })

      await eventEngine.emit('test:intercept')
      expect(intercepted).toBe(true)
    })
  })

  describe('4. 多租户能力', () => {
    it('应该创建租户', () => {
      const tenant = tenantManager.createTenant({
        id: 'tenant-1',
        name: '测试租户',
        slug: 'test-tenant'
      })
      expect(tenant).toBeDefined()
      expect(tenant.slug).toBe('test-tenant')
    })

    it('应该检查配额', () => {
      tenantManager.createTenant({
        id: 'tenant-1',
        name: '测试租户',
        slug: 'test-tenant',
        maxUsers: 10
      })
      const tenant_1 = tenantManager.getTenant('tenant-1')
      tenant_1.activate()
      tenantManager.setCurrentTenant('tenant-1')
      expect(tenantManager.checkQuota('maxUsers', 1)).toBe(true)
    })

    it('应该获取配额使用率', () => {
      tenantManager.createTenant({
        id: 'tenant-1',
        name: '测试租户',
        slug: 'test-tenant',
        maxUsers: 100
      })
      const tenant_1 = tenantManager.getTenant('tenant-1')
      tenant_1.activate()
      tenantManager.setCurrentTenant('tenant-1')
      const usage = tenantManager.getQuotaUsage()
      expect(usage).toBeDefined()
    })
  })

  describe('5. 权限管理能力', () => {
    it('应该注册角色', () => {
      const roleId = 'test-role'
      permissionManager.registerRole({
        id: roleId,
        name: '测试角色',
        code: 'TEST_ROLE',
        permissions: ['model:*:read']
      })
      const role = permissionManager.getRole(roleId)
      expect(role).toBeDefined()
    })

    it('应该为用户分配角色', () => {
      const roleId = 'test-role-2'
      const userId = 'user-1'

      permissionManager.registerRole({
        id: roleId,
        name: '测试角色',
        code: 'TEST_ROLE',
        permissions: ['model:*:read']
      })

      permissionManager.assignRole(userId, roleId)
      const userRoles = permissionManager.getUserRoles(userId)
      expect(userRoles.length).toBeGreaterThan(0)
    })

    it('应该检查权限', () => {
      const roleId = 'admin-role'
      const userId = 'admin-user'

      permissionManager.registerRole({
        id: roleId,
        name: '管理员',
        code: 'ADMIN',
        permissions: ['*']
      })
      permissionManager.assignRole(userId, roleId)

      expect(permissionManager.hasPermission(userId, 'model:user:read')).toBe(true)
    })
  })

  describe('6. 工作流引擎能力', () => {
    it('应该获取内置模板', () => {
      const templates = workflowEngine.getTemplates()
      expect(templates).toBeDefined()
      expect(Object.keys(templates).length).toBeGreaterThan(0)
    })

    it('应该注册工作流', () => {
      const workflow = workflowEngine.registerWorkflow({
        id: 'test-workflow',
        name: '测试工作流',
        nodes: [
          { id: 'start', name: '开始', type: 'start' },
          { id: 'end', name: '结束', type: 'end' }
        ],
        transitions: [
          { from: 'start', to: 'end' }
        ]
      })
      expect(workflow).toBeDefined()
      expect(workflow.id).toBe('test-workflow')
    })
  })
})
