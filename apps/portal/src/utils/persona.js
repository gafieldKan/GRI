/**
 * 人本世界 · 展示字典与格式化（W2）
 *
 * 口径：本文件只做**呈现层翻译与格式化**，不含任何业务真源、不发请求、不派生状态。
 *  - 角色 / 组织类型 / 组织角色的中文名，镜像本体种子（role 枚举、organization_type 表）；
 *    未知取值一律原样回显，绝不臆造中文。
 *  - 真正的取值真源是 W1：`/api/context/me`（角色）、`/api/organizations/mine`（类型/角色）。
 */

/** 业务角色（public.users.role 闭集 → 中文）。 */
export const ROLE_LABELS = {
  consumer: '消费者',
  student: '学生',
  teacher: '教师',
  parent: '家长',
  merchant: '商家',
  operator: '运营',
  admin: '管理员'
}

/** 组织类型（ontology.organization_type 种子 → 中文）。 */
export const ORG_TYPE_LABELS = {
  family: '家庭',
  school: '学校',
  company: '单位',
  'social-group': '社会团体',
  department: '部门',
  community: '社区',
  other: '其他'
}

/** 组织内角色（ontology.org_member.role 闭集 → 中文）。 */
export const ORG_ROLE_LABELS = {
  owner: '创建者',
  admin: '管理员',
  member: '成员'
}

export function roleLabel(role) {
  return ROLE_LABELS[role] || role || '未识别角色'
}

export function orgTypeLabel(type) {
  return ORG_TYPE_LABELS[type] || type || '组织'
}

export function orgRoleLabel(role) {
  return ORG_ROLE_LABELS[role] || role || '成员'
}

/** 相对时间（仅用于「最近经历」一句，够用即可）。 */
export function relativeTime(iso) {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return ''
  const diff = Date.now() - t
  const hour = 3600000
  const day = 86400000
  if (diff < 0) return '刚刚'
  if (diff < hour) return '刚刚'
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`
  if (diff < day * 30) return `${Math.floor(diff / day)} 天前`
  return new Date(t).toLocaleDateString()
}

/** 数字安全取整（缺数据时回 null，供 UI 显示「—」而不是 0）。 */
export function safeInt(value) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n) : null
}
