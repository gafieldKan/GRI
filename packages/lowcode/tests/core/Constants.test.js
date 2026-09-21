/**
 * Constants 常量测试
 */

import { describe, it, expect } from 'vitest'
import * as Constants from '../../lowcode/core/Constants.js'

describe('Constants', () => {
  it('应该导出所有枚举常量', () => {
    expect(Constants.EntityState).toBeDefined()
    expect(Constants.ModuleState).toBeDefined()
    expect(Constants.ModuleLevel).toBeDefined()
    expect(Constants.TenantState).toBeDefined()
    expect(Constants.PluginState).toBeDefined()
    expect(Constants.PluginType).toBeDefined()
    expect(Constants.MarketState).toBeDefined()
    expect(Constants.Operations).toBeDefined()
    expect(Constants.PermissionLevel).toBeDefined()
    expect(Constants.DataScope).toBeDefined()
  })

  it('EntityState 应该包含正确的状态值', () => {
    expect(Constants.EntityState.ACTIVE).toBe('active')
    expect(Constants.EntityState.INACTIVE).toBe('inactive')
    expect(Constants.EntityState.ARCHIVED).toBe('archived')
    expect(Constants.EntityState.PENDING).toBe('pending')
    expect(Constants.EntityState.SUSPENDED).toBe('suspended')
  })

  it('ModuleLevel 应该包含正确的层级值', () => {
    expect(Constants.ModuleLevel.INDUSTRY).toBe(1)
    expect(Constants.ModuleLevel.FUNCTION).toBe(2)
    expect(Constants.ModuleLevel.SERVICE).toBe(3)
    expect(Constants.ModuleLevel.APP).toBe(4)
  })

  it('Operations 应该包含所有操作类型', () => {
    expect(Constants.Operations.READ).toBe('read')
    expect(Constants.Operations.WRITE).toBe('write')
    expect(Constants.Operations.CREATE).toBe('create')
    expect(Constants.Operations.DELETE).toBe('delete')
    expect(Constants.Operations.UPDATE).toBe('update')
  })

  it('所有枚举对象应该被冻结', () => {
    expect(Object.isFrozen(Constants.EntityState)).toBe(true)
    expect(Object.isFrozen(Constants.ModuleState)).toBe(true)
    expect(Object.isFrozen(Constants.Operations)).toBe(true)
  })
})
