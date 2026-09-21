/**
 * 版本管理器
 * 实现页面/模型/配置的版本快照、差异对比、回滚功能
 *
 * @author GRI Team
 * @version 1.0
 */

import { EventEmitter } from 'events'

/**
 * 版本状态枚举
 */
export const VersionState = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
  ROLLEDBACK: 'rolledback',
}

/**
 * 实体类型枚举
 */
export const EntityType = {
  PAGE: 'page',
  MODEL: 'model',
  CONFIG: 'config',
  COMPONENT: 'component',
  WORKFLOW: 'workflow',
}

/**
 * 版本类型枚举（用于测试导入）
 */
export const VersionType = {
  MANUAL: 'manual',
  AUTO_SAVE: 'auto_save',
  PUBLISH: 'publish',
  ROLLBACK: 'rollback',
}

/**
 * 版本类
 */
export class Version {
  constructor(config = {}) {
    this.id = config.id || this.#generateId()
    this.entityType = config.entityType || ''
    this.entityId = config.entityId || ''
    this.versionNumber = config.versionNumber || 1
    this.name = config.name || ''
    this.description = config.description || ''
    this.state = config.state || VersionState.DRAFT
    this.data = config.data || null
    this.parentId = config.parentId || null
    this.tags = config.tags || []
    this.metadata = config.metadata || {}
    this.createdAt = config.createdAt || Date.now()
    this.createdBy = config.createdBy || 'system'
  }

  #generateId() {
    return `v_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 创建快照
   */
  static snapshot(entityType, entityId, data, options = {}) {
    return new Version({
      entityType,
      entityId,
      data: JSON.parse(JSON.stringify(data)), // 深拷贝
      name: options.name || `Version ${options.versionNumber || 1}`,
      description: options.description || '',
      state: options.state || VersionState.DRAFT,
      createdBy: options.createdBy || 'system',
      tags: options.tags || [],
      metadata: options.metadata || {},
    })
  }

  toJSON() {
    return {
      id: this.id,
      entityType: this.entityType,
      entityId: this.entityId,
      versionNumber: this.versionNumber,
      name: this.name,
      description: this.description,
      state: this.state,
      data: this.data,
      parentId: this.parentId,
      tags: this.tags,
      metadata: this.metadata,
      createdAt: this.createdAt,
      createdBy: this.createdBy,
    }
  }
}

/**
 * 差异比较工具
 */
class DiffUtil {
  /**
   * 比较两个对象
   */
  static diff(obj1, obj2, options = {}) {
    const diffs = []
    const { prefix = '' } = options

    // 检查 obj1 中有但 obj2 中没有的
    for (const key of Object.keys(obj1)) {
      if (!(key in obj2)) {
        diffs.push({
          path: prefix ? `${prefix}.${key}` : key,
          type: 'removed',
          oldValue: obj1[key],
          newValue: undefined,
        })
      }
    }

    // 检查 obj2 中有但 obj1 中没有的
    for (const key of Object.keys(obj2)) {
      if (!(key in obj1)) {
        diffs.push({
          path: prefix ? `${prefix}.${key}` : key,
          type: 'added',
          oldValue: undefined,
          newValue: obj2[key],
        })
      }
    }

    // 检查值变化
    for (const key of Object.keys(obj1)) {
      if (key in obj2) {
        const val1 = obj1[key]
        const val2 = obj2[key]
        const path = prefix ? `${prefix}.${key}` : key

        if (typeof val1 === 'object' && typeof val2 === 'object') {
          // 递归比较对象
          const nestedDiffs = this.diff(val1, val2, { prefix: path })
          diffs.push(...nestedDiffs)
        } else if (val1 !== val2) {
          diffs.push({
            path,
            type: 'changed',
            oldValue: val1,
            newValue: val2,
          })
        }
      }
    }

    return diffs
  }

  /**
   * 应用差异
   */
  static applyDiff(base, diffs) {
    const result = JSON.parse(JSON.stringify(base))

    for (const diff of diffs) {
      const parts = diff.path.split('.')
      let current = result
      let parent = null
      let lastKey = diff.path

      for (let i = 0; i < parts.length - 1; i++) {
        parent = current
        lastKey = parts[i]
        current = current[parts[i]]
      }

      switch (diff.type) {
        case 'added':
          if (parent) {
            parent[lastKey] = diff.newValue
          } else {
            result[diff.path] = diff.newValue
          }
          break
        case 'removed':
          if (parent && lastKey in parent) {
            delete parent[lastKey]
          } else {
            delete result[diff.path]
          }
          break
        case 'changed':
          if (parent) {
            parent[lastKey] = diff.newValue
          } else {
            result[diff.path] = diff.newValue
          }
          break
      }
    }

    return result
  }

  /**
   * 简化差异显示
   */
  static summarize(diffs) {
    const summary = {
      added: 0,
      removed: 0,
      changed: 0,
      total: 0,
    }

    for (const diff of diffs) {
      summary.total++
      if (diff.type === 'added') summary.added++
      else if (diff.type === 'removed') summary.removed++
      else if (diff.type === 'changed') summary.changed++
    }

    return summary
  }
}

/**
 * 版本管理器主类
 */
class VersionManagerClass extends EventEmitter {
  constructor() {
    super()
    this.versions = new Map() // versionId -> Version
    this.entityVersions = new Map() // entityType:entityId -> Version[]
    this.currentVersion = new Map() // entityType:entityId -> versionId
    this.autoSave = true
    this.maxVersions = 10
  }

  /**
   * 创建版本快照
   */
  snapshot(entityType, entityId, data, options = {}) {
    const key = `${entityType}:${entityId}`
    const entityVersions = this.entityVersions.get(key) || []
    const versionNumber = entityVersions.length + 1

    const version = Version.snapshot(entityType, entityId, data, {
      ...options,
      versionNumber,
    })

    // 存储版本
    this.versions.set(version.id, version)
    entityVersions.push(version)

    // 按版本号排序
    entityVersions.sort((a, b) => a.versionNumber - b.versionNumber)

    // 限制版本数量
    if (entityVersions.length > this.maxVersions) {
      const toRemove = entityVersions.shift()
      this.versions.delete(toRemove.id)
    }

    this.entityVersions.set(key, entityVersions)

    // 更新当前版本
    this.currentVersion.set(key, version.id)

    this.emit('version:snapshot', { version, entityType, entityId })
    return version
  }

  /**
   * 获取版本
   */
  getVersion(versionId) {
    return this.versions.get(versionId)
  }

  /**
   * 获取实体所有版本
   */
  getVersions(entityType, entityId) {
    const key = `${entityType}:${entityId}`
    return this.entityVersions.get(key) || []
  }

  /**
   * 获取版本历史
   */
  getHistory(entityType, entityId) {
    return this.getVersions(entityType, entityId).map((v) => ({
      id: v.id,
      versionNumber: v.versionNumber,
      name: v.name,
      description: v.description,
      state: v.state,
      createdAt: v.createdAt,
      createdBy: v.createdBy,
      tags: v.tags,
    }))
  }

  /**
   * 发布版本
   */
  publish(versionId) {
    const version = this.versions.get(versionId)
    if (!version) {
      throw new Error(`版本不存在：${versionId}`)
    }

    version.state = VersionState.PUBLISHED
    this.emit('version:publish', { version })
    return version
  }

  /**
   * 归档版本
   */
  archive(versionId) {
    const version = this.versions.get(versionId)
    if (!version) {
      throw new Error(`版本不存在：${versionId}`)
    }

    version.state = VersionState.ARCHIVED
    this.emit('version:archive', { version })
    return version
  }

  /**
   * 回滚到指定版本
   */
  rollback(versionId, data) {
    const version = this.versions.get(versionId)
    if (!version) {
      throw new Error(`版本不存在：${versionId}`)
    }

    // 创建回滚版本
    const rollbackVersion = this.snapshot(version.entityType, version.entityId, data, {
      name: `Rollback to ${version.name}`,
      description: `回滚到版本 ${version.versionNumber}`,
      state: VersionState.ROLLEDBACK,
    })

    this.emit('version:rollback', { version, rollbackVersion })
    return rollbackVersion
  }

  /**
   * 比较两个版本
   */
  compare(versionId1, versionId2) {
    const v1 = this.versions.get(versionId1)
    const v2 = this.versions.get(versionId2)

    if (!v1 || !v2) {
      throw new Error('版本不存在')
    }

    const diffs = DiffUtil.diff(v1.data, v2.data)
    return {
      version1: v1,
      version2: v2,
      diffs,
      summary: DiffUtil.summarize(diffs),
    }
  }

  /**
   * 恢复数据
   */
  restore(versionId) {
    const version = this.versions.get(versionId)
    if (!version) {
      throw new Error(`版本不存在：${versionId}`)
    }

    return JSON.parse(JSON.stringify(version.data))
  }

  /**
   * 删除版本
   */
  delete(versionId) {
    const version = this.versions.get(versionId)
    if (!version) {
      return false
    }

    const key = `${version.entityType}:${version.entityId}`
    const entityVersions = this.entityVersions.get(key) || []
    const index = entityVersions.findIndex((v) => v.id === versionId)

    if (index > -1) {
      entityVersions.splice(index, 1)
      this.entityVersions.set(key, entityVersions)
    }

    this.versions.delete(versionId)
    this.emit('version:delete', { versionId })
    return true
  }

  /**
   * 获取当前版本
   */
  getCurrentVersion(entityType, entityId) {
    const key = `${entityType}:${entityId}`
    const versionId = this.currentVersion.get(key)
    return versionId ? this.versions.get(versionId) : null
  }

  /**
   * 设置版本标签
   */
  setTags(versionId, tags) {
    const version = this.versions.get(versionId)
    if (!version) {
      throw new Error(`版本不存在：${versionId}`)
    }

    version.tags = tags
    this.emit('version:tags:update', { versionId, tags })
    return version
  }

  /**
   * 添加版本标签
   */
  addTag(versionId, tag) {
    const version = this.versions.get(versionId)
    if (!version) {
      throw new Error(`版本不存在：${versionId}`)
    }

    if (!version.tags.includes(tag)) {
      version.tags.push(tag)
    }

    this.emit('version:tag:add', { versionId, tag })
    return version
  }

  /**
   * 按标签查找版本
   */
  findByTag(tag) {
    const results = []
    for (const version of this.versions.values()) {
      if (version.tags.includes(tag)) {
        results.push(version)
      }
    }
    return results
  }

  /**
   * 清空所有版本
   */
  clear() {
    this.versions.clear()
    this.entityVersions.clear()
    this.currentVersion.clear()
    this.emit('clear')
  }
}

// 导出单例
export const versionManager = new VersionManagerClass()
export { DiffUtil }
export default versionManager
