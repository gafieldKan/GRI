/**
 * GRI 组织仓库
 * 基于 BaseRepository 抽象，提供组织数据访问能力
 *
 * @author GRI Team
 * @version 1.0
 */

import { BaseRepository, DataSource } from './BaseRepository.js'
import { Organization } from '../domain/organization/Organization.js'
import { OrganizationMember } from '../domain/organization/OrganizationMember.js'

/**
 * 组织仓库实现
 */
export class OrganizationRepository extends BaseRepository {
  constructor(dataSource = null) {
    super(dataSource || new DataSource(), 'organization')
  }

  getEntityType() {
    return 'Organization'
  }

  /**
   * 根据父 ID 查找子组织
   */
  async findByParentId(parentId) {
    const organizations = await this.findAll()
    return organizations.filter((org) => {
      const orgObj = org instanceof Organization ? org : new Organization(org)
      return parentId ? orgObj.parentId === parentId : !orgObj.parentId
    })
  }

  /**
   * 根据层级路径查找
   */
  async findByParentPath(parentPath) {
    const organizations = await this.findAll()
    return organizations.filter((org) => {
      const orgObj = org instanceof Organization ? org : new Organization(org)
      return orgObj.parentPath?.startsWith(parentPath)
    })
  }

  /**
   * 根据类型筛选
   */
  async findByType(type) {
    const organizations = await this.findAll()
    return organizations.filter((org) => {
      const orgObj = org instanceof Organization ? org : new Organization(org)
      return orgObj.type === type
    })
  }

  /**
   * 获取组织树
   */
  async getOrganizationTree(rootId = null) {
    const allOrgs = await this.findAll()
    return this._buildTree(allOrgs, rootId)
  }

  /**
   * 构建树形结构
   */
  _buildTree(allOrgs, parentId = null) {
    const result = []
    const childrenMap = new Map()

    // 先建立父子关系映射
    allOrgs.forEach((org) => {
      const orgObj = org instanceof Organization ? org : new Organization(org)
      const pid = orgObj.parentId
      if (!childrenMap.has(pid)) {
        childrenMap.set(pid, [])
      }
      childrenMap.get(pid).push(orgObj)
    })

    // 从根节点开始构建树
    const rootNodes = childrenMap.get(parentId) || []
    const buildNode = (node) => {
      const children = childrenMap.get(node.id) || []
      return {
        ...node.toJSON(),
        children: children.map((child) => buildNode(child)),
      }
    }

    rootNodes.forEach((node) => result.push(buildNode(node)))
    return result
  }

  /**
   * 保存组织
   */
  async save(organization) {
    if (organization instanceof Organization) {
      return super.save(organization)
    }
    const org = new Organization(organization)
    return super.save(org)
  }
}

/**
 * 组织成员仓库实现
 */
export class OrganizationMemberRepository extends BaseRepository {
  constructor(dataSource = null) {
    super(dataSource || new DataSource(), 'organizationMember')
  }

  getEntityType() {
    return 'OrganizationMember'
  }

  /**
   * 根据组织 ID 查找成员
   */
  async findByOrganizationId(organizationId) {
    const members = await this.findAll()
    return members.filter((m) => m.organizationId === organizationId)
  }

  /**
   * 根据用户 ID 查找所属组织
   */
  async findByUserId(userId) {
    const members = await this.findAll()
    return members.filter((m) => m.userId === userId)
  }

  /**
   * 根据用户和组织查找成员关系
   */
  async findByUserAndOrg(userId, organizationId) {
    const members = await this.findAll()
    return members.find((m) => m.userId === userId && m.organizationId === organizationId)
  }

  /**
   * 根据角色筛选成员
   */
  async findByRole(role) {
    const members = await this.findAll()
    return members.filter((m) => m.role === role)
  }

  /**
   * 获取组织中的活跃成员
   */
  async getActiveMembers(organizationId) {
    const members = await this.findByOrganizationId(organizationId)
    return members.filter((m) => m.status === 'active')
  }

  /**
   * 保存成员
   */
  async save(member) {
    if (member instanceof OrganizationMember) {
      return super.save(member)
    }
    const orgMember = new OrganizationMember(member)
    return super.save(orgMember)
  }
}

/**
 * 角色仓库实现
 */
export class RoleRepository extends BaseRepository {
  constructor(dataSource = null) {
    super(dataSource || new DataSource(), 'role')
  }

  getEntityType() {
    return 'Role'
  }

  /**
   * 根据代码查找角色
   */
  async findByCode(code) {
    const roles = await this.findAll()
    return roles.find((r) => r.code === code)
  }

  /**
   * 根据类型筛选角色
   */
  async findByType(type) {
    const roles = await this.findAll()
    return roles.filter((r) => r.type === type)
  }

  /**
   * 保存角色
   */
  async save(role) {
    const { Role } = await import('../domain/organization/Role.js')
    if (role instanceof Role) {
      return super.save(role)
    }
    const r = new Role(role)
    return super.save(r)
  }
}

// 导出单例实例
export const organizationRepository = new OrganizationRepository()
export const organizationMemberRepository = new OrganizationMemberRepository()
export const roleRepository = new RoleRepository()

export default {
  OrganizationRepository,
  OrganizationMemberRepository,
  RoleRepository,
  organizationRepository,
  organizationMemberRepository,
  roleRepository,
}
