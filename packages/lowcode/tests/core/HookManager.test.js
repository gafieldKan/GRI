/**
 * HookManager 钩子管理器测试
 */

import { describe, it, expect } from 'vitest'
import { HookManager } from '../../lowcode/core/BaseEntity.js'

describe('HookManager', () => {
  it('应该创建包含默认钩子的 HookManager', () => {
    const manager = new HookManager()
    expect(manager).toBeDefined()
  })

  it('应该注册钩子', () => {
    const manager = new HookManager()
    const callback = () => {}
    manager.register('beforeCreate', callback)
    expect(manager.getHookCount()).toBe(1)
  })

  it('应该按优先级排序钩子', () => {
    const manager = new HookManager()
    const results = []

    manager.register('test', () => results.push(2), 1)
    manager.register('test', () => results.push(1), 2)
    manager.register('test', () => results.push(3), 0)

    return manager.trigger('test').then(() => {
      expect(results).toEqual([1, 2, 3])
    })
  })

  it('应该触发同步钩子', () => {
    const manager = new HookManager()
    let called = false
    manager.register('test', () => {
      called = true
    })
    manager.triggerSync('test')
    expect(called).toBe(true)
  })

  it('应该触发异步钩子', async () => {
    const manager = new HookManager()
    let called = false
    manager.register('test', async () => {
      called = true
    })
    await manager.trigger('test')
    expect(called).toBe(true)
  })

  it('应该清空所有钩子', () => {
    const manager = new HookManager()
    manager.register('test', () => {})
    manager.register('test', () => {})
    manager.clear()
    expect(manager.getHookCount()).toBe(0)
  })

  it('应该验证参数类型', () => {
    const manager = new HookManager()
    expect(() => manager.register(123, () => {})).toThrow()
    expect(() => manager.register('test', 'not a function')).toThrow()
  })

  it('应该在钩子执行失败时抛出错误', async () => {
    const manager = new HookManager()
    manager.register('test', () => {
      throw new Error('test error')
    })
    await expect(manager.trigger('test')).rejects.toThrow('test error')
  })

  it('应该支持多个钩子按顺序执行', async () => {
    const manager = new HookManager()
    const results = []

    manager.register('test', () => results.push('a'))
    manager.register('test', () => results.push('b'))
    manager.register('test', () => results.push('c'))

    await manager.trigger('test')
    expect(results).toEqual(['a', 'b', 'c'])
  })
})
