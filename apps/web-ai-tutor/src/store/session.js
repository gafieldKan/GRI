// 学习会话状态管理
import { defineStore } from 'pinia'
import { createSession, sendSessionMessage } from '@/api/index.js'

export const useSessionStore = defineStore('session', {
  state: () => ({
    sessionId: '',
    sessionState: 'WAIT_START',
    currentSubject: '数学',
    messages: [],
    isThinking: false
  }),

  getters: {
    currentState: (state) => state.sessionState,
    messageHistory: (state) => state.messages
  },

  actions: {
    setSessionId(id) {
      this.sessionId = id
    },

    setSessionState(state) {
      this.sessionState = state
    },

    setSubject(subject) {
      this.currentSubject = subject
    },

    setThinking(thinking) {
      this.isThinking = thinking
    },

    setModel(model) {
      // 可以用于切换模型
    },

    setAgentId(agentId) {
      // 用于多代理模式
    },

    addMessage(message) {
      this.messages.push(message)
    },

    clearMessages() {
      this.messages = []
    },

    resetSession() {
      this.sessionId = ''
      this.sessionState = 'WAIT_START'
      this.messages = []
      this.isThinking = false
    },

    async createSession(studentId, knowledgePointId) {
      try {
        const result = await createSession({
          studentId,
          knowledgePointId,
          subject: this.currentSubject
        })
        this.sessionId = result.sessionId
        this.sessionState = result.state || result.phase || 'WAIT_START'
        return result
      } catch (e) {
        console.error('创建会话失败:', e)
        // 离线模式
        this.sessionId = 'offline-' + Date.now()
        this.sessionState = 'WAIT_START'
        return { sessionId: this.sessionId, state: { phase: 'WAIT_START' } }
      }
    },

    async sendMessage(content) {
      this.isThinking = true
      try {
        // 先添加用户消息
        this.addMessage({ role: 'user', content, type: 'text', timestamp: Date.now() })

        if (this.sessionId) {
          const result = await sendSessionMessage({ content }, this.sessionId)

          // 处理响应
          if (result && result.message) {
            const aiMessage = {
              role: 'assistant',
              content: result.message,
              type: result.phase === 'teaching' ? 'teaching' : 'text',
              teachingContent: this.extractTeachingContent(result.message, result.phase),
              timestamp: Date.now()
            }
            this.addMessage(aiMessage)
          }

          // 更新状态
          if (result && result.phase) {
            this.sessionState = result.phase
          } else if (result && result.state) {
            this.sessionState = result.state
          }

          return result
        } else {
          throw new Error('No session ID')
        }
      } catch (e) {
        console.error('发送消息失败:', e)
        // 离线模式
        this.addMessage({
          role: 'assistant',
          content: '抱歉，网络连接失败，请检查后端服务是否启动。',
          type: 'text',
          timestamp: Date.now()
        })
        throw e
      } finally {
        this.isThinking = false
      }
    },

    extractTeachingContent(message, phase) {
      // 如果是教学阶段，尝试从消息中提取结构化内容
      if (phase !== 'teaching') return null

      // 尝试解析 LaTeX 公式和结构化内容
      // 这里可以根据实际的 AI 返回格式进行解析
      // 暂时返回基本结构，后续可以增强
      const content = {
        title: '知识点讲解',
        definition: '',
        formula: '',
        examples: [],
        commonMistakes: []
      }

      // 简单提取公式 (LaTeX 格式)
      const formulaMatches = message.match(/\$\$([^$]+)\$\$|\$([^$]+)\$/g)
      if (formulaMatches) {
        content.formula = formulaMatches.join(' ')
      }

      // 将完整消息作为定义
      content.definition = message

      return content
    }
  }
})

// 持久化配置
useSessionStore.persist = {
  key: 'gri-session',
  storage: {
    getItem: (key) => {
      try {
        return uni.getStorageSync(key)
      } catch (e) {
        return null
      }
    },
    setItem: (key, value) => {
      try {
        uni.setStorageSync(key, value)
      } catch (e) {
        console.error('session store persist failed:', e)
      }
    }
  },
  paths: [
    'sessionId', 'sessionState', 'currentSubject', 'messages'
  ]
}

export default useSessionStore