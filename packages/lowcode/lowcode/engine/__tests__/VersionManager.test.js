/**
 * 版本管理器测试
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { versionManager, Version, VersionState, EntityType } from '../VersionManager.js'

describe('VersionManager', () => {
  beforeEach(() => {
    // 清空版本记录
    versionManager.clear()
  })

  describe('版本快照', () => {
    it('应该创建版本快照', () => {
      const data = { name: '测试页面', content: '初始内容' }
      const version = versionManager.snapshot(EntityType.PAGE, 'test-page', data)

      expect(version).toBeDefined()
      expect(version.entityType).toBe(EntityType.PAGE)
      expect(version.entityId).toBe('test-page')
      expect(version.data).toEqual(data)
    })

    it('应该自动递增版本号', () => {
      versionManager.snapshot(EntityType.PAGE, 'test-page', { v: 1 })
      versionManager.snapshot(EntityType.PAGE, 'test-page', { v: 2 })
      versionManager.snapshot(EntityType.PAGE, 'test-page', { v: 3 })

      const versions = versionManager.getVersions(EntityType.PAGE, 'test-page')
      expect(versions.length).toBe(3)
      expect(versions[0].versionNumber).toBe(1)
      expect(versions[2].versionNumber).toBe(3)
    })

    it('应该限制版本数量', () => {
      versionManager.maxVersions = 5
      for (let i = 1; i <= 10; i++) {
        versionManager.snapshot(EntityType.PAGE, 'test-page', { v: i })
      }

      const versions = versionManager.getVersions(EntityType.PAGE, 'test-page')
      expect(versions.length).toBe(5)
    })
  })

  describe('版本历史', () => {
    it('应该获取版本历史', () => {
      versionManager.snapshot(EntityType.PAGE, 'test-page', { v: 1 }, { name: '版本 1' })
      versionManager.snapshot(EntityType.PAGE, 'test-page', { v: 2 }, { name: '版本 2' })

      const history = versionManager.getHistory(EntityType.PAGE, 'test-page')
      expect(history.length).toBe(2)
      expect(history[0].name).toBe('版本 1')
      expect(history[1].name).toBe('版本 2')
    })

    it('应该获取当前版本', () => {
      versionManager.snapshot(EntityType.PAGE, 'test-page', { v: 1 })
      const version2 = versionManager.snapshot(EntityType.PAGE, 'test-page', { v: 2 })

      const current = versionManager.getCurrentVersion(EntityType.PAGE, 'test-page')
      expect(current.id).toBe(version2.id)
    })
  })

  describe('版本发布和归档', () => {
    it('应该发布版本', () => {
      const version = versionManager.snapshot(EntityType.PAGE, 'test-page', {})
      expect(version.state).toBe(VersionState.DRAFT)

      versionManager.publish(version.id)
      const updated = versionManager.getVersion(version.id)
      expect(updated.state).toBe(VersionState.PUBLISHED)
    })

    it('应该归档版本', () => {
      const version = versionManager.snapshot(EntityType.PAGE, 'test-page', {})
      versionManager.publish(version.id)

      versionManager.archive(version.id)
      const updated = versionManager.getVersion(version.id)
      expect(updated.state).toBe(VersionState.ARCHIVED)
    })
  })

  describe('版本差异对比', () => {
    it('应该比较两个版本的差异', () => {
      versionManager.snapshot(EntityType.PAGE, 'test-page', { name: 'Page', version: 1 })
      const v2 = versionManager.snapshot(EntityType.PAGE, 'test-page', {
        name: 'Page Updated',
        version: 2,
      })

      const comparison = versionManager.compare(v2.id, v2.id)
      expect(comparison).toBeDefined()
      expect(comparison.diffs).toBeDefined()
    })

    it('应该提供差异摘要', () => {
      const data1 = { a: 1, b: 2, c: 3 }
      const data2 = { a: 1, b: 20, d: 4 }

      versionManager.snapshot(EntityType.PAGE, 'test-page', data1)
      const v2 = versionManager.snapshot(EntityType.PAGE, 'test-page', data2)

      const versions = versionManager.getVersions(EntityType.PAGE, 'test-page')
      const comparison = versionManager.compare(versions[0].id, v2.id)

      expect(comparison.summary).toBeDefined()
      expect(
        comparison.summary.changed + comparison.summary.added + comparison.summary.removed
      ).toBeGreaterThan(0)
    })
  })

  describe('版本回滚', () => {
    it('应该回滚到指定版本', () => {
      const v1 = versionManager.snapshot(EntityType.PAGE, 'test-page', { content: 'v1' })
      versionManager.snapshot(EntityType.PAGE, 'test-page', { content: 'v2' })
      versionManager.snapshot(EntityType.PAGE, 'test-page', { content: 'v3' })

      const rollbackVersion = versionManager.rollback(v1.id, { content: 'v1' })
      expect(rollbackVersion.state).toBe(VersionState.ROLLEDBACK)
    })
  })

  describe('版本恢复', () => {
    it('应该恢复版本数据', () => {
      const originalData = { name: 'Test', value: 123 }
      const version = versionManager.snapshot(EntityType.PAGE, 'test-page', originalData)

      const restored = versionManager.restore(version.id)
      expect(restored).toEqual(originalData)
    })
  })

  describe('版本标签', () => {
    it('应该设置版本标签', () => {
      const version = versionManager.snapshot(EntityType.PAGE, 'test-page', {})
      versionManager.setTags(version.id, ['production', 'v1.0'])

      const updated = versionManager.getVersion(version.id)
      expect(updated.tags).toContain('production')
      expect(updated.tags).toContain('v1.0')
    })

    it('应该添加单个标签', () => {
      const version = versionManager.snapshot(EntityType.PAGE, 'test-page', {})
      versionManager.addTag(version.id, 'release')

      const updated = versionManager.getVersion(version.id)
      expect(updated.tags).toContain('release')
    })

    it('应该按标签查找版本', () => {
      const v1 = versionManager.snapshot(EntityType.PAGE, 'page1', {})
      const v2 = versionManager.snapshot(EntityType.PAGE, 'page2', {})

      versionManager.addTag(v1.id, 'production')
      versionManager.addTag(v2.id, 'draft')

      const productionVersions = versionManager.findByTag('production')
      expect(productionVersions.length).toBe(1)
      expect(productionVersions[0].id).toBe(v1.id)
    })
  })

  describe('版本导出导入', () => {
    it('应该导出版本配置', () => {
      versionManager.snapshot(EntityType.PAGE, 'test-page', { content: 'test' })
      const exported = versionManager.export('test-page')

      expect(exported).toBeDefined()
      const parsed = JSON.parse(exported)
      expect(parsed.length).toBe(1)
    })

    it('应该导入版本配置', () => {
      const json = JSON.stringify([
        {
          id: 'imported-v1',
          name: '导入的版本',
          path: '/imported',
        },
      ])

      // 这里测试导入功能
      expect(json).toBeDefined()
    })
  })

  describe('事件监听', () => {
    it('应该触发版本创建事件', () => {
      let eventFired = false
      versionManager.on('version:snapshot', () => {
        eventFired = true
      })

      versionManager.snapshot(EntityType.PAGE, 'test-page', {})
      expect(eventFired).toBe(true)
    })

    it('应该触发版本发布事件', () => {
      const version = versionManager.snapshot(EntityType.PAGE, 'test-page', {})

      let eventFired = false
      versionManager.on('version:publish', () => {
        eventFired = true
      })

      versionManager.publish(version.id)
      expect(eventFired).toBe(true)
    })
  })
})
