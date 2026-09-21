// API 请求模块 —— 统一收敛到网关 /api/organizations/*（services/api，Nest）。
import axios from 'axios'
import { handleApiError, normalizeError, AppError } from '@/utils/errorHandler.js'
import { useAuthStore } from '@gri/auth-client'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
})

api.interceptors.request.use(
  config => {
    const authStore = useAuthStore()
    if (authStore?.accessToken) {
      config.headers = config.headers || {}
      config.headers.Authorization = `Bearer ${authStore.accessToken}`
    }
    return config
  },
  error => Promise.reject(normalizeError(error, { phase: 'request' }))
)

api.interceptors.response.use(
  response => response.data,
  error => Promise.reject(handleApiError(error, { phase: 'response' }))
)

export default api

// 统一错误兜底：{ success:false, error }（承载 200+success:false / 非 2xx reject 两种形态）
function toError(e) {
  const msg = (e && (e.message || e.error || e.response?.data?.error)) || '请求失败'
  return { success: false, error: msg }
}

// ===== 站点运营探询 / 组织树（portal 组织/运营台消费面，后端 assertSiteOperator 权威）=====

// 当前登录用户是否「站点运营」（根组织 owner|admin）—— 纯 DB 探询，零资源暴露。
export async function adminCapability() {
  try {
    const b = await api.get('/api/organizations/capability')
    return { isOperator: !!(b && b.isOperator) }
  } catch (e) { return { isOperator: false } }
}

// 我在哪些组织、什么角色（登入后展示态）。
export async function myMemberships() {
  try { return await api.get('/api/organizations/my') } catch (e) { return { success: false, memberships: [] } }
}

// 全部活跃组织（运营视角全局树）。
export async function listOrganizations() {
  try { return await api.get('/api/organizations') } catch (e) { return toError(e) }
}

// ===== 组织 CRUD =====

export async function createOrganization(payload) {
  try { return await api.post('/api/organizations', payload) } catch (e) { return toError(e) }
}

export async function updateOrganization(id, patch) {
  try { return await api.put(`/api/organizations/${id}`, patch) } catch (e) { return toError(e) }
}

export async function deleteOrganization(id) {
  try {
    const b = await api.delete(`/api/organizations/${id}`)
    return b && typeof b === 'object' ? { success: true, ...b } : { success: true, removed: true }
  } catch (e) { return toError(e) }
}

// ===== 成员管理 =====

export async function listMembers(id) {
  try { return await api.get(`/api/organizations/${id}/members`) } catch (e) { return toError(e) }
}

export async function addMember(id, payload) {
  try { return await api.post(`/api/organizations/${id}/members`, payload) } catch (e) { return toError(e) }
}

export async function removeMember(id, userId) {
  try {
    await api.delete(`/api/organizations/${id}/members/${userId}`)
    return { success: true }
  } catch (e) { return toError(e) }
}

export async function updateMemberRole(id, userId, role) {
  try { return await api.put(`/api/organizations/${id}/members/${userId}/role`, { role }) } catch (e) { return toError(e) }
}

// ===== 角色管理 =====

export async function listRoles(id) {
  try { return await api.get(`/api/organizations/${id}/roles`) } catch (e) { return toError(e) }
}

export async function createRole(id, payload) {
  try { return await api.post(`/api/organizations/${id}/roles`, payload) } catch (e) { return toError(e) }
}

export async function updateRole(id, roleId, patch) {
  try { return await api.put(`/api/organizations/${id}/roles/${roleId}`, patch) } catch (e) { return toError(e) }
}

// ===== 邀请 =====

export async function listInvitations(id) {
  try { return await api.get(`/api/organizations/${id}/invitations`) } catch (e) { return toError(e) }
}

export async function createInvitation(id, payload) {
  try { return await api.post(`/api/organizations/${id}/invitations`, payload) } catch (e) { return toError(e) }
}

export async function cancelInvitation(id, invitationId) {
  try {
    await api.delete(`/api/organizations/${id}/invitations/${invitationId}`)
    return { success: true }
  } catch (e) { return toError(e) }
}

export async function acceptInvitation(token) {
  try { return await api.put(`/api/organizations/invitations/accept/${token}`) } catch (e) { return toError(e) }
}

// ===== 审计日志 / 用户目录 =====

export async function audit(id) {
  try { return await api.get(`/api/organizations/${id}/audit`) } catch (e) { return toError(e) }
}

export async function lookupUsers(q) {
  try { return await api.get('/api/organizations/users/lookup', { params: { q } }) } catch (e) { return toError(e) }
}