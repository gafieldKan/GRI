/**
 * GRI 组织与角色管理领域模型导出
 *
 * @author GRI Team
 * @version 1.0
 */

// 组织实体
export {
  Organization,
  OrganizationConfig,
  OrganizationMetadata,
  OrganizationType,
  ORG_LEVEL_LIMITS,
  ORG_TYPE_LABELS,
  ORG_TYPE_ICONS,
  OrganizationUtils,
} from './Organization.js'

// 组织成员
export {
  OrganizationMember,
  MemberRole,
  MemberStatus,
  MemberTitle,
  MemberRoleUtils,
} from './OrganizationMember.js'

// 角色与权限
export {
  Role,
  PermissionDescriptor,
  PermissionAction,
  PermissionResource,
  DataScope,
  DATA_SCOPE_LEVEL,
  RoleTemplates,
  RoleFactory,
} from './Role.js'

/**
 * 组织领域服务
 * 提供组织相关的业务操作
 */
export class OrganizationDomainService {
  constructor(organizationRepository, memberRepository) {
    this.organizationRepository = organizationRepository
    this.memberRepository = memberRepository
  }

  /**
   * 创建组织
   */
  async createOrganization(config) {
    const { Organization } = await import('./Organization.js')
    const org = new Organization(config)

    // 验证
    const validation = org.validate()
    if (!validation.valid) {
      throw new Error(validation.errors.join(', '))
    }

    // 应用业务规则
    org.applyBusinessRules()

    // 触发创建前钩子
    await this._triggerHook('beforeCreateOrganization', { organization: org })

    // 持久化
    await this.organizationRepository.save(org)

    // 触发创建后钩子
    await this._triggerHook('afterCreateOrganization', { organization: org })

    return org
  }

  /**
   * 添加组织成员
   */
  async addMember(organizationId, userId, role, title) {
    const { OrganizationMember } = await import('./OrganizationMember.js')

    const member = new OrganizationMember({
      organizationId,
      userId,
      role,
      title,
    })

    const validation = member.validate()
    if (!validation.valid) {
      throw new Error(validation.errors.join(', '))
    }

    await this.memberRepository.save(member)
    return member
  }

  /**
   * 获取组织的完整层级路径
   */
  async getOrganizationPath(organizationId) {
    const path = []
    let currentId = organizationId
    let maxDepth = 100 // 防止无限循环

    while (currentId && maxDepth > 0) {
      const org = await this.organizationRepository.findById(currentId)
      if (!org) break

      path.unshift(org)
      currentId = org.parentId
      maxDepth--
    }

    return path
  }

  /**
   * 获取组织的子组织列表
   */
  async getChildOrganizations(parentId) {
    return this.organizationRepository.findByParentId(parentId)
  }

  /**
   * 获取用户在某组织中的角色
   */
  async getUserRoleInOrg(userId, organizationId) {
    const member = await this.memberRepository.findByUserAndOrg(userId, organizationId)
    if (!member) return null

    const { Role } = await import('./Role.js')
    return Role.fromDTO({
      name: member.role,
      code: member.role,
      type: 'organization',
    })
  }

  // 钩子触发（简化版）
  async _triggerHook(name, context) {
    console.log(`[OrganizationDomainService] Hook: ${name}`, context)
  }
}

export default OrganizationDomainService
