<template>
  <view class="chat-container">
    <!-- 顶部状态栏 -->
    <view class="status-bar">
      <view class="status-left">
        <uni-tag
          :type="getSessionType(sessionState)"
          :text="getSessionStateText(sessionState)"
          size="small"
          :circle="true"
        ></uni-tag>
        <text class="subject-text">{{ currentSubject }}</text>
      </view>
      <button size="mini" class="plan-btn" @click="showPlan">
        学习计划
      </button>
    </view>

    <!-- 消息列表 -->
    <scroll-view
      scroll-y
      class="message-list"
      :scroll-into-view="scrollIntoView"
      scroll-with-animation="true"
    >
      <view v-for="(msg, index) in messages" :key="index" :id="'msg-' + index">
        <view :class="['message-row', msg.role]">
          <!-- 头像 -->
          <view :class="['avatar', msg.role]">
            <text>{{ msg.role === 'user' ? '学' : 'AI' }}</text>
          </view>

          <!-- 消息内容 -->
          <view class="message-content">
            <!-- 文本内容（支持数学公式标记） -->
            <rich-text
              v-if="msg.type === 'text' || msg.type === 'feedback'"
              :nodes="renderContent(msg.content)"
              class="message-text"
            ></rich-text>

            <!-- 题目卡片 -->
            <view v-if="msg.type === 'question'" class="question-card">
              <rich-text :nodes="renderContent(msg.content)"></rich-text>
              <view class="question-options" v-if="msg.options">
                <view
                  v-for="(opt, i) in msg.options"
                  :key="i"
                  :class="['option', { selected: msg.selected === i }]"
                  @click="selectOption(index, i)"
                >
                  <text>{{ optionLabels[i] }}. </text>
                  <rich-text :nodes="renderContent(opt)"></rich-text>
                </view>
              </view>
            </view>

            <!-- 输入框（可编辑题目） -->
            <!-- MathInput 组件已删除（原为未 import/注册的断裂引用），待恢复时重新接线 -->
          </view>
        </view>
      </view>

      <!-- 加载中 -->
      <view v-if="isThinking" class="thinking">
        <view class="thinking-spinner"></view>
        <text class="thinking-text">{{ thinkingText }}</text>
      </view>

      <!-- 底部占位 -->
      <view style="height: 100px;"></view>
    </scroll-view>

    <!-- 底部输入区 -->
    <view class="input-area">
      <!-- MathInput 组件已删除（原为未 import/注册的断裂引用），待恢复时重新接线 -->
      <view class="action-buttons">
        <button
          type="primary"
          class="send-btn"
          :disabled="!canSend"
          @click="handleSend"
        >
          发送
        </button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, reactive, computed, nextTick, onMounted } from 'vue'
import { onLoad, onUnload } from '@dcloudio/uni-app'
import { createSession, sendSessionMessage } from '../../api/index.js'
import { toRichTextNodes } from '../../utils/katex-helper.js'
import { useSessionStore } from '../../store/session.js'
import { useUserStore } from '../../store/user.js'

// 状态
const sessionState = ref('WAIT_START')
const currentSubject = ref('数学')
const isThinking = ref(false)
const thinkingText = ref('AI 老师思考中...')
const scrollIntoView = ref('')
const inputValue = ref('')
const sessionId = ref('')

const optionLabels = ['A', 'B', 'C', 'D', 'E', 'F']

// 消息列表
const messages = reactive([
  {
    role: 'assistant',
    type: 'text',
    content: '你好！我是你的 AI 数学老师。今天想学习什么知识点呢？\n你可以选择"勾股定理"或告诉我你想学习的内容。'
  }
])

// 已渲染的题目 ID 集合（防止重复显示）
const renderedQuestionIds = new Set()

const canSend = computed(() => {
  return inputValue.value.trim() !== '' && !isThinking.value
})

onMounted(async () => {
  await initSession()
})

// camera 等跨页带参：解析 ocrResult（识别结果 JSON）/ text（题目文本）
// → 会话建好后作为首条用户消息自动送出（onLoad 拿参数，只送一次）。
let initialMessage = ''
let initialMessageSent = false
onLoad((query) => {
  if (!query) return
  if (query.ocrResult) {
    try {
      const parsed = JSON.parse(decodeURIComponent(query.ocrResult))
      const qs = (parsed.parsedQuestions || parsed.ocr?.questions || [])
        .map((q) => q.content)
        .filter(Boolean)
      const raw = qs.length ? qs.join('\n') : (parsed.ocr?.rawText || parsed.rawText)
      if (raw) initialMessage = '请帮我解答这道题：' + raw
    } catch (e) {
      console.error('解析 OCR 参数失败:', e)
    }
  } else if (query.text) {
    initialMessage = '请帮我解答这道题：' + decodeURIComponent(query.text)
  }
})

// 初始化会话
const initSession = async () => {
  try {
    const result = await createSession(useUserStore().studentId, 'math_pythagorean', 'math')
    sessionId.value = result.sessionId
    sessionState.value = result.state || 'WAIT_START'
    console.log('Session created:', sessionId.value, 'state:', sessionState.value)

    // 发送初始问候（REST 唯一聊天传输）
    const greeting = await sendSessionMessage(sessionId.value, '我想学习')
    handleServerMessage(greeting)

    // camera 跨页带参：OCR/题目文本作为首条消息自动送出（只送一次，重复进入不重放）
    if (initialMessage && !initialMessageSent) {
      initialMessageSent = true
      messages.push({ role: 'user', type: 'text', content: initialMessage })
      const reply = await sendSessionMessage(sessionId.value, initialMessage)
      handleServerMessage(reply)
    }
  } catch (error) {
    console.error('Session init failed:', error)
    messages.push({
      role: 'assistant',
      type: 'text',
      content: '连接服务器失败，请确保 AI 辅导后端服务已启动。'
    })
  }
}

// 处理服务端消息
const handleServerMessage = (data) => {
  console.log('Server message:', data)

  if (data.error || !data.success) {
    if (data.error) {
      messages.push({
        role: 'assistant',
        type: 'text',
        content: `${data.error}`
      })
    }
    isThinking.value = false
    return
  }

  if (data.state) {
    sessionState.value = data.state
  }

  if (data.message) {
    const isAnswerFeedback = data.message.includes('回答正确') || data.message.includes('回答错误') ||
      data.message.includes('诊断完成') || data.message.includes('正确率')

    messages.push({
      role: 'assistant',
      type: isAnswerFeedback ? 'feedback' : 'text',
      content: data.message,
      isCorrect: data.message.includes('回答正确') || (data.result?.masteryLevel === 'mastered'),
      result: data.result
    })
  }

  if (data.questions && data.questions.length > 0) {
    data.questions.forEach((q) => {
      if (q.id && renderedQuestionIds.has(q.id)) return;
      if (q.id) renderedQuestionIds.add(q.id);
      messages.push({
        role: 'assistant',
        type: 'question',
        content: q.content,
        options: q.options,
        questionId: q.id,
        questionType: q.type,
        difficulty: q.difficulty
      })
    })
  }

  isThinking.value = false
  nextTick(() => {
    scrollIntoView.value = 'msg-' + (messages.length - 1)
  })
}

// 获取状态主题色（uni-tag type 词汇表：default/primary/success/warning/error）
const getSessionType = (state) => {
  const typeMap = {
    'WAIT_START': 'default',
    'DIAGNOSING': 'warning',
    'TEACHING': 'primary',
    'QUIZZING': 'success',
    'REMEDIATING': 'error',
    'MASTERED': 'success',
    // 统一 /api/tuition 返回的 phase 小写形态（state=phase）
    'welcome': 'default',
    'diagnosis': 'warning',
    'teaching': 'primary',
    'quizzing': 'success',
    'done': 'success'
  }
  return typeMap[state] || 'default'
}

// 获取状态文本
const getSessionStateText = (state) => {
  const textMap = {
    'WAIT_START': '准备学习',
    'DIAGNOSING': '诊断中',
    'TEACHING': '讲解中',
    'QUIZZING': '测验中',
    'REMEDIATING': '补救中',
    'MASTERED': '已掌握',
    'welcome': '准备学习',
    'diagnosis': '诊断中',
    'teaching': '讲解中',
    'quizzing': '测验中',
    'done': '已掌握'
  }
  return textMap[state] || state
}

// 渲染内容（小程序版 — 标记 LaTeX 公式而不是客户端渲染）
const renderContent = (content) => {
  if (!content) return ''

  // 使用小程序兼容的公式标记
  try {
    const html = toRichTextNodes(content)
    return html
  } catch (e) {
    // 回退：直接返回原始内容
    return content.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }
}

// 发送消息
const handleSend = async () => {
  if (!inputValue.value.trim() || isThinking.value) return

  const userText = inputValue.value.trim()
  inputValue.value = ''

  messages.push({
    role: 'user',
    type: 'text',
    content: userText
  })

  await nextTick()
  scrollIntoView.value = 'msg-' + (messages.length - 1)

  await sendMessageToAI(userText)
}

// 选择选项
const selectOption = async (msgIndex, optionIndex) => {
  if (isThinking.value) return

  messages[msgIndex].selected = optionIndex
  const answer = optionLabels[optionIndex]

  messages.push({
    role: 'user',
    type: 'text',
    content: `我选择：${answer}`
  })

  await nextTick()
  scrollIntoView.value = 'msg-' + (messages.length - 1)

  await sendMessageToAI(`我选择：${answer}`)
}

// 发送答案
const sendAnswer = async (text) => {
  await sendMessageToAI(text)
}

// 发送消息到 AI（REST 唯一聊天传输）
const sendMessageToAI = async (text) => {
  isThinking.value = true
  thinkingText.value = 'AI 老师思考中...'

  try {
    if (!sessionId.value) {
      messages.push({
        role: 'assistant',
        type: 'text',
        content: '抱歉，尚未建立连接。请刷新页面重试。'
      })
      isThinking.value = false
      return
    }
    const result = await sendSessionMessage(sessionId.value, text)
    handleServerMessage(result)
  } catch (error) {
    console.error('Send failed:', error)
    messages.push({
      role: 'assistant',
      type: 'text',
      content: '抱歉，网络好像有点问题，请重试。'
    })
    isThinking.value = false
  }
}

const showPlan = () => {
  uni.showToast({
    title: '学习计划功能开发中',
    icon: 'none'
  })
}

// 清理
onUnload(() => {
  // REST 会话无长连接需显式关闭；状态由服务端持久化，重进页面按需重建
})
</script>

<style scoped>
.chat-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #f0f4ff 0%, #f5f5f5 100%);
}

.status-bar {
  padding: 12px 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
}

.status-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.subject-text {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.9);
}

.message-list {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
}

.message-row {
  display: flex;
  margin-bottom: 16px;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message-row.user {
  flex-direction: row-reverse;
}

.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: bold;
  color: #fff;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}

.avatar.assistant {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.avatar.user {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
}

.message-content {
  max-width: 70%;
  margin: 0 8px;
}

.message-row.user .message-content {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  border-radius: 16px 16px 0 16px;
  padding: 12px 16px;
  font-size: 15px;
  line-height: 1.5;
}

.message-row.assistant .message-content {
  background: #fff;
  border-radius: 16px 16px 16px 0;
  padding: 12px 16px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.08);
  font-size: 15px;
  line-height: 1.6;
  color: #333;
}

.question-card {
  margin-top: 12px;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 8px;
}

.question-options {
  margin-top: 12px;
}

.option {
  padding: 12px 16px;
  background: #fff;
  border: 2px solid #e9ecef;
  border-radius: 10px;
  margin-bottom: 8px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.option:active {
  transform: scale(0.98);
}

.option.selected {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  border-color: #667eea;
}

.thinking {
  padding: 16px;
  text-align: center;
  background: rgba(255,255,255,0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.thinking-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid #e6f2ff;
  border-top-color: #1890ff;
  border-radius: 50%;
  animation: gari-spin 0.8s linear infinite;
  display: inline-block;
}

.thinking-text {
  font-size: 12px;
  color: #999;
}

@keyframes gari-spin {
  to {
    transform: rotate(360deg);
  }
}

.plan-btn,
.send-btn {
  margin: 0;
  padding: 0 16px;
  line-height: 2;
  font-size: 14px;
  border-radius: 9999rpx;
}

.input-area {
  padding: 12px 16px;
  background: #fff;
  border-top: 1px solid #eee;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 -2px 8px rgba(0,0,0,0.05);
}

.action-buttons {
  flex-shrink: 0;
}
</style>