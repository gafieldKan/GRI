/**
 * 权限管理器测试
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  permissionManager,
  PermissionLevel,
  PermissionType,
  defaultRoles,
} from '../../lowcode/core/PermissionManager.js'

describe('PermissionManager', () => {
  beforeEach(() => {
    permissionManager.clear()
    // 重新注册默认角色
    Object.values(defaultRoles).forEach((role) => {
      permissionManager.registerRole(role)
    })
  })

  describe('角色管理', () => {
    it('应该注册角色', () => {
      const role = { id: 'test', name: '测试角色' }
      expect(() => permissionManager.registerRole(role)).not.toThrow()
      expect(permissionManager.getRole('test')).toBeDefined()
    })

    it('应该抛出错误当角色缺少必要字段', () => {
      expect(() => permissionManager.registerRole({})).toThrow()
    })

    it('应该为用户分配角色', () => {
      permissionManager.assignRole('user1', 'admin')
      const roles = permissionManager.getUserRoles('user1')
      expect(roles[0]?.id).toBe('admin')
    })
  })

  describe('模型权限', () => {
    beforeEach(() => {
      permissionManager.setModelPermission('test_model', 'admin', ['read', 'write', 'create', 'delete'])
      permissionManager.setModelPermission('test_model', 'user', ['read'])
    })

    it('应该正确检查管理员权限', () => {
      expect(
        permissionManager.hasModelPermission('test_model', 'admin', 'write')
      ).toBe(true)
    })

    it('应该拒绝用户的写权限', () => {
      expect(
        permissionManager.hasModelPermission('test_model', 'user', 'write')
      ).toBe(false)
    })

    it('应该允许用户的读权限', () => {
      expect(
        permissionManager.hasModelPermission('test_model', 'user', 'read')
      ).toBe(true)
    })
  })

  describe('字段权限', () => {
    beforeEach(() => {
      permissionManager.setModelPermission('user', 'user', PermissionLevel.READ)
      permissionManager.setFieldPermission('user', 'salary', 'user', {
        visible: false,
        editable: false,
      })
      permissionManager.setFieldPermission('user', 'name', 'user', {
        visible: true,
        editable: true,
      })
    })

    it('应该返回字段可见性', () => {
      const perm = permissionManager.getFieldPermission('user', 'name', 'user')
      expect(perm.visible).toBe(true)
    })

    it('应该返回字段不可见', () => {
      const perm = permissionManager.getFieldPermission('user', 'salary', 'user')
      expect(perm.visible).toBe(false)
    })
  })

  describe('操作权限', () => {
    beforeEach(() => {
      permissionManager.setActionPermission('create', 'admin', true)
      permissionManager.setActionPermission('delete', 'admin', true)
      permissionManager.setActionPermission('delete', 'user', false)
    })

    it('应该允许管理员创建', () => {
      expect(permissionManager.hasActionPermission('create', 'admin')).toBe(true)
    })

    it('应该拒绝用户删除', () => {
      expect(permissionManager.hasActionPermission('delete', 'user')).toBe(false)
    })
  })

  describe('菜单权限', () => {
    beforeEach(() => {
      permissionManager.setMenuPermission('settings', 'admin', true)
      permissionManager.setMenuPermission('settings', 'user', false)
    })

    it('应该允许管理员访问设置菜单', () => {
      expect(permissionManager.hasMenuPermission('settings', 'admin')).toBe(true)
    })

    it('应该拒绝用户访问设置菜单', () => {
      expect(permissionManager.hasMenuPermission('settings', 'user')).toBe(false)
    })
  })
})
