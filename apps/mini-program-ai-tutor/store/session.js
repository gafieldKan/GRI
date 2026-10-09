/**
 * 会话状态管理 (Pinia Store) — 小程序版
 * 管理 AI 教学会话的状态转移。聊天走 REST（POST /api/tuition/sessions/:id/message），
 * WS 已按 M5 AI 垂直拍板移除。
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  createSession as apiCreateSession,
  getSessionState as apiGetSessionState,
  sendSessionMessage
} from '../api/index.js'

export const useSessionStore = defineStore('session', () => {
  const sessionId = ref(null)
  const currentState = ref('WAIT_START')
  const messages = ref([])
  const questions = ref([])
  const quizResult = ref(null)
  const isLoading = ref(false)
  const error = ref(null)

  // camera → chat 跨页带参：chat 是 tabBar 页（switchTab 不带参、onLoad 只触发一次），
  // 用这枚「待发送题目文本」在页面间传递，chat 会话就绪后消费一次。
  const pendingPrompt = ref('')

  const isActive = computed(() => !!sessionId.value)

  async function createSession(studentId, knowledgePointId) {
    isLoading.value = true
    error.value = null
    try {
      const result = await apiCreateSession(studentId, knowledgePointId || 'math_pythagorean')
      sessionId.value = result.sessionId
      currentState.value = result.state || 'WAIT_START'
      return result
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function sendMessage(content) {
    if (!sessionId.value) throw new Error('无活跃会话')

    isLoading.value = true
    error.value = null
    try {
      messages.value.push({ role: 'user', content, timestamp: Date.now() })

      const result = await sendSessionMessage(sessionId.value, content)
      currentState.value = result.state || currentState.value

      if (result.message) {
        messages.value.push({ role: 'assistant', content: result.message, timestamp: Date.now() })
      }

      if (result.questions) {
        questions.value = result.questions
      }
      if (result.quizResult) {
        quizResult.value = result.quizResult
      }

      return result
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function refreshState() {
    if (!sessionId.value) return
    try {
      const state = await apiGetSessionState(sessionId.value)
      currentState.value = state.state || currentState.value
      return state
    } catch (e) {
      error.value = e.message
    }
  }

  function reset() {
    sessionId.value = null
    currentState.value = 'WAIT_START'
    messages.value = []
    questions.value = []
    quizResult.value = null
    error.value = null
  }

  /** 请求 chat 页在下次展示时自动发送的题目文本（camera 识别结果等） */
  function setPendingPrompt(text) {
    pendingPrompt.value = text || ''
  }

  /** 取出并清空待发题目；无则返回 '' */
  function takePendingPrompt() {
    const t = pendingPrompt.value
    pendingPrompt.value = ''
    return t
  }

  return {
    sessionId,
    currentState,
    messages,
    questions,
    quizResult,
    isLoading,
    error,
    isActive,
    createSession,
    sendMessage,
    refreshState,
    reset,
    pendingPrompt,
    setPendingPrompt,
    takePendingPrompt
  }
})