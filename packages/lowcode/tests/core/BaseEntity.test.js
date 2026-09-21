/**
 * BaseEntity 基础实体测试
 */

import { describe, it, expect } from 'vitest'
import { BaseEntity, EntityState } from '../../lowcode/core/BaseEntity.js'
import { ValidationError } from '../../lowcode/core/TypeValidator.js'

describe('BaseEntity', () => {
  it('应该创建具有默认值的实体', () => {
    const entity = new BaseEntity()
    expect(entity.id).toBeDefined()
    expect(entity.createdAt).toBeDefined()
    expect(entity.updatedAt).toBeDefined()
    expect(entity.status).toBe('active')
    expect(entity.metadata).toEqual({})
  })

  it('应该接受自定义配置', () => {
    const config = {
      id: 'custom_id',
      status: 'inactive',
      metadata: { key: 'value' }
    }
    const entity = new BaseEntity(config)
    expect(entity.id).toBe('custom_id')
    expect(entity.status).toBe('inactive')
    expect(entity.metadata).toEqual({ key: 'value' })
  })

  it('应该自动生成唯一 ID', () => {
    const entity1 = new BaseEntity()
    const entity2 = new BaseEntity()
    expect(entity1.id).not.toBe(entity2.id)
  })

  it('应该深拷贝元数据', () => {
    const metadata = { key: 'value' }
    const entity = new BaseEntity({ metadata })
    metadata.key = 'modified'
    expect(entity.metadata.key).toBe('value')
  })

  it('应该在验证失败时抛出 ValidationError', () => {
    expect(() => new BaseEntity('invalid')).toThrow(ValidationError)
  })

  it('应该更新 updatedAt 当 status 改变时', () => {
    const entity = new BaseEntity()
    const oldUpdatedAt = entity.updatedAt
    entity.status = 'inactive'
    expect(entity.updatedAt).toBeGreaterThanOrEqual(oldUpdatedAt)
  })

  it('应该激活实体', () => {
    const entity = new BaseEntity({ status: 'pending' })
    entity.activate()
    expect(entity.status).toBe('active')
  })

  it('应该停用实体', () => {
    const entity = new BaseEntity()
    entity.deactivate()
    expect(entity.status).toBe('inactive')
  })

  it('应该归档实体', () => {
    const entity = new BaseEntity()
    entity.archive()
    expect(entity.status).toBe('archived')
  })

  it('应该检查是否活跃', () => {
    const activeEntity = new BaseEntity({ status: 'active' })
    const inactiveEntity = new BaseEntity({ status: 'inactive' })
    expect(activeEntity.isActive()).toBe(true)
    expect(inactiveEntity.isActive()).toBe(false)
  })

  it('应该序列化为 JSON', () => {
    const entity = new BaseEntity({
      id: 'test_id',
      status: 'active',
      metadata: { key: 'value' }
    })
    const json = entity.toJSON()
    expect(json.id).toBe('test_id')
    expect(json.status).toBe('active')
    expect(json.metadata).toEqual({ key: 'value' })
    expect(json.createdAt).toBeDefined()
    expect(json.updatedAt).toBeDefined()
  })

  it('应该转换为字符串表示', () => {
    const entity = new BaseEntity()
    const str = entity.toString()
    expect(str).toContain('BaseEntity')
    expect(str).toContain(entity.id)
  })

  it('应该支持钩子注册', () => {
    const entity = new BaseEntity()
    let called = false
    entity.on('test', () => {
      called = true
    })
    entity.triggerHook('test')
    expect(called).toBe(true)
  })

  it('应该验证状态枚举值', () => {
    const validStatus = ['active', 'inactive', 'archived', 'pending', 'suspended']
    validStatus.forEach((status) => {
      const entity = new BaseEntity({ status })
      expect(entity.status).toBe(status)
    })
  })
})

describe('BaseEntity 钩子', () => {
  it('应该在状态变化前触发钩子', () => {
    const entity = new BaseEntity()
    let beforeValue = null
    entity.on('beforeUpdate', (data) => {
      if (data.field === 'status') {
        beforeValue = data.newValue
      }
    })
    entity.status = 'inactive'
    expect(beforeValue).toBe('inactive')
  })

  it('应该在状态变化后触发钩子', () => {
    const entity = new BaseEntity()
    let afterValue = null
    entity.on('afterUpdate', (data) => {
      if (data.field === 'status') {
        afterValue = data.newValue
      }
    })
    entity.status = 'archived'
    expect(afterValue).toBe('archived')
  })
})
