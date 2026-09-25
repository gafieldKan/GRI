/**
 * 智学慧眼 小程序 - API 接口封装（M5 AI 垂直收敛到统一 /api/tuition）
 * 使用 uni.request 替代 fetch，适配微信小程序网络 API。
 * 聊天走 REST（POST /api/tuition/sessions/:id/message）—— WS 已按拍板移除。
 */
import { useAuthStore } from '../store/auth.js'

// 后端服务地址 — 小程序需配置 HTTPS（开发环境可使用内网 IP）；统一走网关 /api
const BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

/**
 * 通用请求封装
 */
function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    // 注入统一登录态 Authorization 头（无 active pinia 时静默跳过，适配单测/降级场景）
    const headers = { 'Content-Type': 'application/json', ...options.headers }
    try {
      const auth = useAuthStore()
      if (auth?.accessToken) {
        headers.Authorization = `Bearer ${auth.accessToken}`
      }
    } catch {
      /* 无 pinia 上下文时跳过鉴权头注入 */
    }

    uni.request({
      url: BASE_URL + url,
      method: options.method || 'GET',
      data: options.body ? JSON.parse(options.body) : undefined,
      header: headers,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
        } else {
          reject(new Error((res.data && res.data.error) || `请求失败 ${res.statusCode}`))
        }
      },
      fail: (err) => {
        reject(new Error('网络请求失败'))
      }
    })
  })
}

/**
 * 创建学习会话
 */
export async function createSession(studentId, knowledgePointId, subject = 'math') {
  return request('/api/tuition/sessions', {
    method: 'POST',
    body: JSON.stringify({ knowledgePointId, subject })
  })
}

/**
 * 获取会话状态
 */
export async function getSessionState(sessionId) {
  return request(`/api/tuition/sessions/${sessionId}`)
}

/**
 * 发送会话消息（REST 唯一聊天传输）
 */
export async function sendSessionMessage(sessionId, content) {
  return request(`/api/tuition/sessions/${sessionId}/message`, {
    method: 'POST',
    body: JSON.stringify({ content })
  })
}

/**
 * 上传试卷图片（小程序二进制文件上传）
 * uni.uploadFile 自动使用 multipart/form-data
 */
export function uploadExamImage(filePath, subject, gradeLevel) {
  return new Promise((resolve, reject) => {
    uni.uploadFile({
      url: BASE_URL + '/api/tuition/exam/upload',
      filePath,
      name: 'image',
      formData: { subject, gradeLevel },
      success: (res) => {
        try {
          const data = JSON.parse(res.data)
          resolve(data)
        } catch {
          reject(new Error('解析响应失败'))
        }
      },
      fail: (err) => {
        reject(new Error('上传失败'))
      }
    })
  })
}

/**
 * 保存试卷记录
 */
export async function saveExam(data) {
  return request('/api/tuition/exam/save', {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

/**
 * 生成题目（题库统一复数命名空间 /api/tuition/questions/generate）
 */
export async function generateQuestions(params) {
  return request('/api/tuition/questions/generate', {
    method: 'POST',
    body: JSON.stringify(params)
  })
}

/**
 * 获取题库列表（复数统一 /api/tuition/questions）
 */
export async function getQuestionList(subject, knowledgePoint, limit = 20) {
  const params = []
  if (knowledgePoint) params.push(`knowledgePoint=${knowledgePoint}`)
  if (subject) params.push(`subject=${subject}`)
  params.push(`limit=${limit}`)
  return request(`/api/tuition/questions?${params.join('&')}`)
}

/**
 * 添加错题
 */
export async function addWrongQuestion(data) {
  return request('/api/tuition/wrong-questions', {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

/**
 * 获取错题列表（服务端以登录身份 externalId 定位，无需再传 studentId）
 */
export async function getWrongQuestionList(reviewed) {
  const params = []
  if (reviewed !== undefined) params.push(`reviewed=${String(reviewed)}`)
  const qs = params.length ? `?${params.join('&')}` : ''
  return request(`/api/tuition/wrong-questions${qs}`)
}

/**
 * 获取知识点列表（K12 全学科：/api/curriculum/*，本体驱动；可选 subject/gradeLevel 过滤）
 */
export async function getKnowledgePoints(subject, gradeLevel) {
  const params = []
  if (subject) params.push(`subject=${subject}`)
  if (gradeLevel) params.push(`gradeLevel=${gradeLevel}`)
  const qs = params.length ? `?${params.join('&')}` : ''
  return request(`/api/curriculum/knowledge-points${qs}`)
}

/**
 * 健康检查（/health 在 /api 前缀外）
 */
export async function checkHealth() {
  return request('/health')
}

/**
 * 获取学情报告
 */
export async function getReport(studentId) {
  return request(`/api/tuition/analysis/report/latest/${studentId}`)
}

/**
 * 获取学情分析
 */
export async function analyzeExam(data) {
  return request('/api/tuition/analysis/analyze', {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

export default {
  createSession,
  getSessionState,
  sendSessionMessage,
  getKnowledgePoints,
  getReport,
  uploadExamImage,
  saveExam,
  analyzeExam,
  generateQuestions,
  getQuestionList,
  addWrongQuestion,
  getWrongQuestionList,
  checkHealth
}