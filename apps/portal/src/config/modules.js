/**
 * 门户本地模块目录。
 *
 * S2 会迁移到后端模块注册表；本卡先按 public.users.role 的闭集做前端展示过滤。
 */
export const PORTAL_ROLES = Object.freeze([
  'consumer',
  'student',
  'merchant',
  'operator'
])

export const portalModules = Object.freeze([
  {
    code: 'food',
    name: '订餐平台',
    icon: '餐',
    entryUrl: '/food/',
    allowedRoles: ['consumer', 'student', 'merchant', 'operator'],
    isCore: true
  },
  {
    code: 'tutor',
    name: '智学慧眼',
    icon: '学',
    entryUrl: '/tutor/',
    allowedRoles: ['student', 'operator'],
    isCore: true
  },
  {
    code: 'org-admin',
    name: '组织管理台',
    icon: '组',
    entryUrl: '/pages/console/index',
    allowedRoles: ['operator'],
    isCore: true
  },
  {
    code: 'ontology-stats',
    name: '开发全流程统计',
    icon: '统',
    entryUrl: '/pages/ontology-stats/index',
    allowedRoles: ['operator'],
    isCore: true
  },
  {
    code: 'identity',
    name: '身份中心',
    icon: '身',
    entryUrl: '',
    allowedRoles: ['operator'],
    isCore: false
  },
  {
    code: 'curriculum',
    name: '课程与学情',
    icon: '课',
    entryUrl: '',
    allowedRoles: ['student', 'operator'],
    isCore: false
  },
  {
    code: 'dashboard',
    name: '经营看板',
    icon: '经',
    entryUrl: '',
    allowedRoles: ['merchant', 'operator'],
    isCore: false
  },
  {
    code: 'agent',
    name: 'AI 教师',
    icon: '智',
    entryUrl: '',
    allowedRoles: ['student', 'operator'],
    isCore: false
  },
  {
    code: 'twin',
    name: '学习孪生',
    icon: '孪',
    entryUrl: '',
    allowedRoles: ['student', 'operator'],
    isCore: false
  }
])

const ROLE_SET = new Set(PORTAL_ROLES)

/**
 * 按角色过滤模块卡片。
 * 前端仅礼貌隐藏，安全由服务端；本卡不把这里的过滤当作授权边界。
 */
export function modulesForRole(role) {
  if (!ROLE_SET.has(role)) return []
  return portalModules.filter((module) => (
    module.allowedRoles.length === 0 || module.allowedRoles.includes(role)
  ))
}
