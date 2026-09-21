/**
 * 插件注册中心测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { pluginRegistry, registerPlugin } from '../../lowcode/core/PluginRegistry.js'
import { PluginType } from '../../lowcode/core/Constants.js'

describe('PluginRegistry', () => {
  // 每个测试前清空注册表
  beforeEach(() => {
    pluginRegistry.clear()
  })

  describe('register', () => {
    it('应该成功注册插件', () => {
      const plugin = {
        name: 'test-plugin',
        type: PluginType.COMPONENT,
        version: '1.0.0',
      }

      expect(() => pluginRegistry.register(plugin)).not.toThrow()
      expect(pluginRegistry.get('test-plugin')).toBeDefined()
    })

    it('应该抛出错误当插件缺少 name', () => {
      const plugin = { type: PluginType.COMPONENT }
      expect(() => pluginRegistry.register(plugin)).toThrow()
    })

    it('应该抛出错误当插件缺少 type', () => {
      const plugin = { name: 'test-plugin' }
      expect(() => pluginRegistry.register(plugin)).toThrow()
    })

    it('应该抛出错误当 type 无效', () => {
      const plugin = { name: 'test-plugin', type: 'invalid-type' }
      expect(() => pluginRegistry.register(plugin)).toThrow()
    })
  })

  describe('getByType', () => {
    beforeEach(() => {
      pluginRegistry.register({
        name: 'component-1',
        type: PluginType.COMPONENT,
      })
      pluginRegistry.register({
        name: 'component-2',
        type: PluginType.COMPONENT,
      })
      pluginRegistry.register({
        name: 'form-1',
        type: PluginType.FORM_COMPONENT,
      })
    })

    it('应该按类型获取所有插件', () => {
      const components = pluginRegistry.getByType(PluginType.COMPONENT)
      expect(components).toHaveLength(2)
      expect(components.map(c => c.name)).toEqual(
        expect.arrayContaining(['component-1', 'component-2'])
      )
    })

    it('空类型返回空数组', () => {
      const result = pluginRegistry.getByType('unknown-type')
      expect(result).toEqual([])
    })
  })

  describe('lifecycle', () => {
    it('应该调用插件的生命周期方法', async () => {
      const initFn = vi.fn()
      const loadFn = vi.fn()
      const saveFn = vi.fn()
      const destroyFn = vi.fn()

      pluginRegistry.register({
        name: 'lifecycle-plugin',
        type: PluginType.COMPONENT,
        init: initFn,
        onLoad: loadFn,
        onSave: saveFn,
        onDestroy: destroyFn,
      })

      await pluginRegistry.init('lifecycle-plugin')
      await pluginRegistry.load('lifecycle-plugin', { data: 'test' })
      await pluginRegistry.save('lifecycle-plugin', { id: 1 })
      await pluginRegistry.destroy('lifecycle-plugin')

      expect(initFn).toHaveBeenCalled()
      expect(loadFn).toHaveBeenCalledWith({ data: 'test' })
      expect(saveFn).toHaveBeenCalledWith({ id: 1 })
      expect(destroyFn).toHaveBeenCalled()
    })
  })

  describe('activate/deactivate', () => {
    it('应该激活和停用插件', async () => {
      const activateFn = vi.fn()
      const deactivateFn = vi.fn()

      pluginRegistry.register({
        name: 'toggle-plugin',
        type: PluginType.COMPONENT,
        onActivate: activateFn,
        onDeactivate: deactivateFn,
      })

      await pluginRegistry.activate('toggle-plugin')
      expect(activateFn).toHaveBeenCalled()

      await pluginRegistry.deactivate('toggle-plugin')
      expect(deactivateFn).toHaveBeenCalled()
    })
  })

  describe('getAll', () => {
    it('应该返回所有已注册的插件', () => {
      pluginRegistry.register({ name: 'plugin-1', type: PluginType.COMPONENT })
      pluginRegistry.register({ name: 'plugin-2', type: PluginType.FORM_COMPONENT })

      const all = pluginRegistry.getAll()
      expect(all).toHaveLength(2)
    })
  })
})
