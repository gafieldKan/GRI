// API request module — 统一收敛到网关 /api（services/api，Nest）。
// 课程体系走 /api/curriculum/*（K12 全学科，本体驱动）；个人学情走 /api/tuition/*、/api/agent/*。
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
    // 注入统一登录态 Authorization 头（access token 存在则加）
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
  error => {
    // For 404 errors, return empty data instead of rejecting
    if (error?.response?.status === 404) {
      return { nodes: [], edges: [] }
    }
    // Use unified error handler
    return Promise.reject(handleApiError(error, { phase: 'response' }))
  }
)

export default api

// /health 探针留在 /api 前缀外（main.ts exclude），天然豁免。
export async function checkHealth() {
  try { return await api.get('/health') } catch (e) { return { status: 'ok' } }
}

export async function getReport(studentId) {
  try { return await api.get(`/api/tuition/analysis/report/latest/${studentId}`) } catch (e) { return [] }
}

// K12 课程体系（/api/curriculum/*，本体驱动）：目录公开读，knowledge-graph 带个人掌握度。
export async function listSubjects() {
  try { return await api.get('/api/curriculum/subjects') } catch (e) { return [] }
}

export async function listGrades(stage) {
  try { return await api.get('/api/curriculum/grades', { params: stage ? { stage } : {} }) } catch (e) { return [] }
}

export async function listTextbooks(subject, grade) {
  try { return await api.get('/api/curriculum/textbooks', { params: { subject, grade } }) } catch (e) { return [] }
}

export async function listChapters(textbookId, textbook) {
  try { return await api.get('/api/curriculum/chapters', { params: { textbookId, textbook } }) } catch (e) { return [] }
}

export async function getKnowledgePoints(params = {}) {
  try { return await api.get('/api/curriculum/knowledge-points', { params }) } catch (e) { return [] }
}

export async function getKnowledgeGraph(params = {}) {
  try {
    return await api.get('/api/curriculum/knowledge-graph', { params })
  } catch (e) {
    return { nodes: [], edges: [] }
  }
}

// 学科知识版图（0.4.0 登峰视图数据源）：领域→知识域两级树 + 前置 DAG + 覆盖比重；
// 登录后叠加各知识域掌握度均值（匿名仅出结构）。
export async function getKnowledgeMap(subject) {
  try {
    return await api.get('/api/curriculum/knowledge-map', { params: { subject } })
  } catch (e) {
    return { subject: null, fields: [], areas: [], stats: { total: 0, k12: 0, frontier: 0, coverageRatio: 0, byGrade: {} } }
  }
}

// 学习路径（目标驱动）：goalId 的全先修闭包，拓扑序去重（先修在前）；登录叠加各步骤掌握度。
// 404（目标不存在）会被响应拦截器转成 {nodes:[],edges:[]}，故此处统一规整为 steps 形态。
export async function getLearningPath(goalId) {
  const FALLBACK = { goal: null, steps: [] }
  try {
    const data = await api.get('/api/curriculum/learning-path', { params: { goalId } })
    if (data && Array.isArray(data.steps)) return data
    return FALLBACK
  } catch (e) {
    return FALLBACK
  }
}

// 知识点随堂练习（选择题含选项/答案/解析，公开读）。
export async function getKpQuestions(kpId, limit = 5) {
  try {
    return await api.get(`/api/curriculum/knowledge-points/${kpId}/questions`, { params: { limit } })
  } catch (e) {
    return []
  }
}

const TOPIC_KNOWLEDGE_MAP = {
  'math_pythagorean': 'math_pythagorean',
  'math_quadratic': 'math_quadratic',
  'math_trigonometry': 'math_trigonometry',
  'physics_newton': 'physics_newton',
  'chemistry_periodic': 'chemistry_periodic'
}

export async function createSession(data) {
  try {
    const topic = data.topic || data.knowledgePoint || ''
    const knowledgePointId = data.knowledgePointId || TOPIC_KNOWLEDGE_MAP[topic] || topic || 'math_pythagorean'
    return await api.post('/api/tuition/sessions', { knowledgePointId })
  } catch (e) {
    return {
      sessionId: 'offline-' + Date.now(),
      state: { state: 'WAIT_START' }
    }
  }
}

export async function sendMessage(sessionId, content) {
  try {
    return await api.post(`/api/tuition/sessions/${sessionId}/message`, { content })
  } catch (e) {
    return { message: content }
  }
}

export async function sendSessionMessage(data, sessionId) {
  const content = typeof data === 'string' ? data : (data?.content || '')
  return sendMessage(sessionId, content)
}

export async function getSessionState(sessionId) {
  try {
    return await api.get(`/api/tuition/sessions/${sessionId}`)
  } catch (e) {
    return { state: 'WAIT_START' }
  }
}

export async function getWrongQuestionList(studentId) {
  try { return await api.get('/api/tuition/wrong-questions') } catch (e) { return { wrongQuestions: [] } }
}

export async function markQuestionReviewed(questionId, data) {
  try { return await api.post(`/api/tuition/wrong-questions/${questionId}/review`, data) } catch (e) { return { success: false } }
}

export async function updateSM2ForWrongQuestion(questionId, data) {
  try { return await api.post(`/api/tuition/wrong-questions/${questionId}/review`, data) } catch (e) { return { success: false } }
}

export async function retryWrongQuestion(questionId) {
  try { return await api.post(`/api/tuition/wrong-questions/${questionId}/retry`) } catch (e) { return { success: false } }
}

export async function uploadExamImage(file) {
  try {
    const formData = new FormData()
    formData.append('image', file)
    return await api.post('/api/tuition/exam/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  } catch (e) {
    return { success: false, parsedQuestions: [] }
  }
}

export async function saveExam(data) {
  try { return await api.post('/api/tuition/exam/save', data) } catch (e) { return { success: false } }
}

export async function analyzeExam(data) {
  try { return await api.post('/api/tuition/analysis/analyze', data) } catch (e) { return { success: false } }
}

export async function getPlans(studentId) {
  try { return await api.get('/api/tuition/plans') } catch (e) { return [] }
}

export async function generatePlan(data) {
  try { return await api.post('/api/tuition/plans/generate', data) } catch (e) { return { success: false } }
}

export async function updatePlanProgress(planId, completedTaskIds) {
  try { return await api.post(`/api/tuition/plans/${planId}/progress`, { completedTaskIds }) } catch (e) { return { success: false } }
}

// 新增：学习计划增强功能
export async function getParentReport(studentId, planType = 'weekly') {
  try { return await api.get(`/api/tuition/plans/parent-report/${studentId}`, { params: { planType } }) } catch (e) { return { success: false } }
}

export async function getPlanCalendar(studentId, planType = 'weekly', month) {
  try { return await api.get(`/api/tuition/plans/calendar/${studentId}`, { params: { planType, month } }) } catch (e) { return { events: [], progress: 0 } }
}

export async function createReminder(data) {
  try { return await api.post('/api/tuition/reminders', data) } catch (e) { return { success: false } }
}

export async function getReminders(studentId) {
  try { return await api.get('/api/tuition/reminders') } catch (e) { return { reminders: [] } }
}

export async function markReminderSent(reminderId) {
  try { return await api.put(`/api/tuition/reminders/${reminderId}/sent`) } catch (e) { return { success: false } }
}

// 新增：题库相关
export async function getQuestionBank(params = {}) {
  try { return await api.get('/api/tuition/questions', { params }) } catch (e) { return [] }
}

export async function submitPracticeAnswer(data) {
  try { return await api.post('/api/tuition/practice/answer', data) } catch (e) { return { success: false } }
}

export async function getSpacedRepetitionQueue(studentId) {
  try { return await api.get(`/api/tuition/practice/sr-queue/${studentId}`) } catch (e) { return [] }
}

// 薄弱攻克：未解决错题 → 完整题面（含选项/答案/解析）。
export async function getWeaknessQuestions(studentId, limit = 15) {
  try {
    return await api.get(`/api/tuition/practice/weakness/${studentId}`, { params: { limit } })
  } catch (e) { return { questions: [] } }
}

// 新增：练习历史相关
export async function startPracticeSession(data) {
  try { return await api.post('/api/tuition/practice/session/start', data) } catch (e) { return { success: false } }
}

export async function completePracticeSession(data) {
  try { return await api.post('/api/tuition/practice/session/complete', data) } catch (e) { return { success: false } }
}

export async function getPracticeHistory(studentId, params = {}) {
  try { return await api.get(`/api/tuition/practice/history/${studentId}`, { params }) } catch (e) { return { sessions: [] } }
}

export async function getPracticeStats(studentId) {
  try { return await api.get(`/api/tuition/practice/stats/${studentId}`) } catch (e) { return {} }
}

export async function getQuestionDetail(questionId) {
  try { return await api.get(`/api/tuition/questions/${questionId}`) } catch (e) { return null }
}

// 新增：用户/成就相关
export async function updateProfile(data) {
  try { return await api.post('/api/tuition/user/profile', data) } catch (e) { return { success: false } }
}

export async function updatePreferences(data) {
  try { return await api.post('/api/tuition/user/preferences', data) } catch (e) { return { success: false } }
}

export async function getUserPreferences(studentId) {
  try { return await api.get(`/api/tuition/user/preferences/${studentId}`) } catch (e) { return {} }
}

export async function getAchievements(studentId) {
  try { return await api.get(`/api/tuition/user/${studentId}/achievements`) } catch (e) { return [] }
}

export async function getUserStats(studentId) {
  try { return await api.get(`/api/tuition/user/${studentId}/stats`) } catch (e) { return {} }
}

// ===== 个人专属 AI 教师（/api/agent/*，@gri/agent-core：每生独立 agent + 跨会话记忆）=====
// 打开我的独立 AI 教师：建实体 + 返回可用工具/技能 + 记忆摘要。
export async function openAgent() {
  try { return await api.get('/api/agent/me') } catch (e) { return { success: false } }
}

// 给我的 AI 教师发消息（保持会话状态、可触发工具/记忆；subject 兜底让教师感知所选学科）。
export async function sendAgentMessage(content, subject) {
  try { return await api.post('/api/agent/me/message', subject ? { content, subject } : { content }) } catch (e) { return { success: false, message: content } }
}

// 读我的长期记忆（个人私有，跨会话）。
export async function getAgentMemory() {
  try { return await api.get('/api/agent/memory') } catch (e) { return { success: false, facts: [] } }
}

// 忘掉一条长期记忆（面板显式管理：记忆过时/记错时删除，复用 memory.forget 工具逻辑，不经 LLM）。
export async function forgetAgentMemory(key) {
  try { return await api.post('/api/agent/me/memory/forget', { key }) } catch (e) { return { success: false } }
}

// ===== 只读学情面板（薄端点：复用 Diagnosis/Wrong/review 工具逻辑，不经 LLM，学生可直观看到自己的真实学情）=====
// 学情总览：各知识点作答掌握度 + 未解决错题计数（会顺带刷新掌握度快照）。
export async function getAgentDiagnosis() {
  try { return await api.get('/api/agent/me/diagnosis') } catch (e) { return { success: false, knowledgePoints: [], totalUnresolved: 0 } }
}
// 错题本：未解决错题题面（不泄正确答案）。
export async function getAgentWrongQuestions(limit = 10) {
  try { return await api.get('/api/agent/me/wrong-questions', { params: { limit } }) } catch (e) { return { success: false, questions: [] } }
}
// 复习序列预览：按掌握度缺口+间隔排序的下一复习题。
export async function getAgentReviewSequence(size = 5) {
  try { return await api.get('/api/agent/me/review-sequence', { params: { size } }) } catch (e) { return { success: false, questions: [] } }
}
// 掌握度趋势：按天累计作答掌握度时间序列,判断进步/退步。
export async function getAgentMasteryTrend() {
  try { return await api.get('/api/agent/me/mastery-trend') } catch (e) { return { success: false, knowledgePoints: [] } }
}
// 授课状态机（lesson.current）：针对一个知识点开课/推进(assess→teach→example→drill→complete)，状态存该生记忆续课。
export async function getAgentLesson(kpId, stage) {
  try { return await api.get('/api/agent/me/lesson', { params: { kpId, stage } }) } catch (e) { return { success: false, error: e.message } }
}

// 提交授课抢时段作答（lesson.submit：判题落库 + 答对推进 complete/答错留 drill + 回授掌握度）。
export async function getAgentLessonSubmit(kpId, questionId, answer) {
  try { return await api.post('/api/agent/me/lesson/submit', { kpId, questionId, answer }) } catch (e) { return { success: false } }
}

// 按知识点专项练习：抽该知识点随机几道题（只回题面,不含答案;作答走 gradeAgentAnswer 判题/落库）。
export async function getAgentKpQuestions(kpId, size = 6) {
  try { return await api.get('/api/agent/me/kp-questions', { params: { kpId, size } }) } catch (e) { return { success: false, questions: [] } }
}
// 面板作答判读：复用 answer.grade(判题+作答落库,答对可消错题)。timeSpentMs 可传本道耗时(ms),判读落库作 time_spent_ms。
export async function gradeAgentAnswer(questionId, answer, resolveOnCorrect = true, timeSpentMs) {
  try { return await api.post('/api/agent/me/grade', { questionId, answer, resolveOnCorrect, timeSpentMs }) } catch (e) { return { success: false } }
}

// 完成个性化学习计划的一条任务（直接走 plan.complete 工具逻辑，不经 LLM）。
export async function completePlanTask(planId, taskIndex, correct = true) {
  try { return await api.post(`/api/agent/me/plans/${planId}/complete`, { taskIndex, correct }) } catch (e) { return { success: false, reason: e.message } }
}

// ===== AI 运营台（/api/agent/admin/*，仅站点运营 = 根组织 owner|admin，后端 assertSiteOperator 权威）=====
// 前端只有 isOperator 为真才显示入口/面板；写操作一律走后端 DB 角色守卫，任何 admin 请求不携带、不回显凭证。
// 响应约定不统一（成功 success:true / 校验失败 200+success:false / 内联 secret 500 / 非运营 403），
// 故下面每个函数都统一：优先透出 payload 侧 success/error，reject（非 2xx）时取 error.message 兜成 success:false。
function toError(e) {
  const msg = (e && (e.message || e.error || e.response?.data?.error)) || '请求失败'
  return { success: false, error: msg }
}

// 当前登录用户是否是「站点运营」（探询，纯只读；用于前端展示开关）
export async function adminCapability() {
  try {
    const b = await api.get('/api/agent/admin/capability')
    return { isOperator: !!(b && b.isOperator) }
  } catch (e) { return { isOperator: false } }
}

// MCP server 列表（含 disabled；config 只含 connection 形态，无凭证值）
export async function listMcpServers() {
  try { return await api.get('/api/agent/admin/mcp-servers') } catch (e) { return toError(e) }
}

// 新增/更新 MCP server。config 只允许 command/args/url/env-var 名引用；绝不传 apiKey/secret。
export async function upsertMcpServer(payload) {
  try { return await api.put('/api/agent/admin/mcp-servers', payload) } catch (e) { return toError(e) }
}

// 删除 MCP server（改表即停用，下一轮新生失效）
export async function deleteMcpServer(name) {
  try { return await api.delete(`/api/agent/admin/mcp-servers/${encodeURIComponent(name)}`) } catch (e) { return toError(e) }
}

// 大模型路由列表（model/provider；apiKey 永不经此面回显）
export async function listRoutes() {
  try { return await api.get('/api/agent/admin/routes') } catch (e) { return toError(e) }
}

// 新增/更新一条大模型路由。apiKey 不经此面提交/存取。
export async function upsertRoute(payload) {
  try { return await api.put('/api/agent/admin/routes', payload) } catch (e) { return toError(e) }
}

// 最近工具执行审计（可观测；只读）
export async function listToolRuns() {
  try { return await api.get('/api/agent/admin/tool-runs') } catch (e) { return toError(e) }
}

// 运营总览（只读聚合）：在用学生/有数据学生/工具调用/未解决错题/活动计划 + 工具排行 + 最近动态。
export async function getAdminOverview() {
  try { return await api.get('/api/agent/admin/overview') } catch (e) { return toError(e) }
}

// 全班学情（只读运营集合）：跨全体学生的每题/每知识点作答准确率 + 最弱前5 + 学生汇总。
export async function getClassDiagnosis() {
  try { return await api.get('/api/agent/admin/class-diagnosis') } catch (e) { return toError(e) }
}

// 知识点题目钻取（只读运营）：给定知识点下每题的全班作答统计(弱→强排)，不透答案。
export async function getClassDiagnosisQuestions(kpId) {
  try { return await api.get('/api/agent/admin/class-diagnosis/questions', { params: { kpId } }) } catch (e) { return toError(e) }
}

// 单题作答归因（只读运营）：该题答错分布(最热错法) + 答错学生(谁/写了什么)。供运营看"为什么做错"。
export async function getClassDiagnosisQuestion(questionId) {
  try { return await api.get('/api/agent/admin/class-diagnosis/question', { params: { questionId } }) } catch (e) { return toError(e) }
}

// ===== 人物激活上下文（W1 `GET /api/context/me`，只读；模块内容世界复用人本世界的身份真源）=====
// 返回 {version, profile{id,username,name,email,role,avatarUrl}, orgs[], permissions, twin}；
// 学习世界取 profile 作为「世界里的我」的外观真源（与门户人本世界同一人、同一外观）。
// 只在未取到时返回 null（调用方退化为本地登录态），绝不抛错阻断页面。
export async function getActivationContext() {
  try { return await api.get('/api/context/me') } catch (e) { return null }
}

// ===== 学生数字孪生（/api/twin/*，人本论：人本体的运行时）=====
// 孪生 = 身份+状态+世界+经历+记忆，读时装配既成真源；个人数据，强制鉴权、按 users.id 隔离。
export async function getTwinOverview(subject) {
  try {
    return await api.get('/api/twin/me', { params: subject ? { subject } : {} })
  } catch (e) {
    return { profile: null, state: null, world: null, events: [], memories: [], generatedAt: null }
  }
}

export async function getTwinEvents(limit = 50) {
  try { return await api.get('/api/twin/me/events', { params: { limit } }) } catch (e) { return [] }
}

// 记录一次学习行动（动词闭集 lesson|practice|review|chat|exam|rest → 一条经历）。
export async function recordTwinAction(payload) {
  try { return await api.post('/api/twin/me/action', payload) } catch (e) { return null }
}

// 更新人物画像（白名单字段落 edu.students；后端自动记一条 profile 经历）。
export async function updateTwinProfile(patch) {
  try { return await api.post('/api/twin/me/profile', patch) } catch (e) { return { success: false } }
}

// 历史经历回填（幂等：仅空时间线时执行）。
export async function backfillTwin() {
  try { return await api.post('/api/twin/me/backfill') } catch (e) { return { created: 0, skipped: true } }
}

// 状态回放序列（经历正序，最早在前；滑杆 scrubbing）。
export async function getTwinReplay(limit = 200) {
  try { return await api.get('/api/twin/me/replay', { params: { limit } }) } catch (e) { return { entityId: '', frames: [], generatedAt: null } }
}

// 导出孪生档案（gri-student-digital-twin v1；不含敏感记忆键）。
export async function exportTwinArchive() {
  try { return await api.get('/api/twin/me/export') } catch (e) { return null }
}

// 导入孪生档案（合并：追加经历 + 白名单更新身份）。
export async function importTwinArchive(archive) {
  return await api.post('/api/twin/me/import', archive)
}

export function closeWebSocket(ws) {
  try { if (ws && ws.readyState === WebSocket.OPEN) ws.close() } catch (e) {}
}

api.closeWebSocket = closeWebSocket