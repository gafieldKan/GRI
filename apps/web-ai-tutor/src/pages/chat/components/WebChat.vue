<template>
  <view class="page" @mouseenter="showTabbar" @mouseleave="hideTabbar">
    <!-- 顶部状态栏 -->
    <view class="topbar">
      <view class="topbar-left">
        <text class="topbar-title">{{ title }}</text>
        <text class="topbar-status">{{ statusText }}</text>
      </view>
      <view class="topbar-right">
        <view class="topbar-action" @click="clearChat">
          <text>清空</text>
        </view>
      </view>
    </view>

    <!-- 消息列表 -->
    <scroll-view
      class="chat-list"
      scroll-y="true"
      :scroll-top="scrollTop"
      :scroll-into-view="scrollIntoView"
      scroll-with-animation="true"
    >
      <view v-for="(group, groupIndex) in messageGroups" :key="groupIndex" class="message-group">
        <!-- 日期分隔符 -->
        <view v-if="group.showDate" class="date-divider">
          <text>{{ group.dateLabel }}</text>
        </view>

        <view v-for="(item, idx) in group.messages" :key="idx" class="msg-wrap" :id="'msg-' + groupIndex + '-' + idx">
          <!-- AI 消息 -->
          <view v-if="item.role === 'assistant'" class="msg-row ai-row">
            <view class="avatar ai-avatar">AI</view>
            <view class="bubble-wrapper ai-wrapper">
              <view class="bubble ai-bubble">
                <!-- 教学卡片展示 -->
                <teaching-card
                  v-if="item.type === 'teaching' && item.teachingContent"
                  :title="item.teachingContent.title"
                  :definition="item.teachingContent.definition"
                  :formula="item.teachingContent.formula"
                  :examples="item.teachingContent.examples"
                  :common-mistakes="item.teachingContent.commonMistakes"
                  @next="handleTeachingNext"
                />
                <rich-text v-else :nodes="formatContent(item.content)"></rich-text>
              </view>
              <view class="msg-meta">
                <text class="msg-time">{{ formatTime(item.timestamp) }}</text>
              </view>
            </view>
          </view>

          <!-- 用户消息 -->
          <view v-else class="msg-row user-row">
            <view class="bubble-wrapper user-wrapper">
              <view class="bubble user-bubble">
                <rich-text :nodes="formatContent(item.content)"></rich-text>
              </view>
              <view class="msg-meta">
                <text class="msg-time">{{ formatTime(item.timestamp) }}</text>
              </view>
            </view>
            <view class="avatar user-avatar">我</view>
          </view>
        </view>
      </view>

      <!-- 加载中 -->
      <view v-if="isLoading" class="loading" id="loading-indicator">
        <LoadingSkeleton variant="list" rows="3" />
      </view>

      <!-- 底部锚点 -->
      <view id="bottom-anchor" style="height: 20px;"></view>
    </scroll-view>

    <!-- 底部TabBar - 隐藏模式，悬停显示 -->
    <view class="tabbar" :class="{ 'tabbar-visible': tabbarVisible }">
      <view class="tabbar-item" @click="switchTab(0)">
        <text class="tabbar-icon">💬</text>
        <text class="tabbar-text">聊天</text>
      </view>
      <view class="tabbar-item" @click="switchTab(1)">
        <text class="tabbar-icon">📚</text>
        <text class="tabbar-text">知识库</text>
      </view>
      <view class="tabbar-item" @click="switchTab(2)">
        <text class="tabbar-icon">📝</text>
        <text class="tabbar-text">错题本</text>
      </view>
      <view class="tabbar-item" @click="switchTab(3)">
        <text class="tabbar-icon">👤</text>
        <text class="tabbar-text">我的</text>
      </view>
    </view>

    <!-- 底部输入区 -->
    <view class="input-area" :class="{ 'input-area-with-tabbar': tabbarVisible }">
      <view class="input-wrapper">
        <view class="input-actions">
          <view class="action-btn" @click="showMoreActions">
            <text>+</text>
          </view>
        </view>
        <input
          class="msg-input"
          v-model="inputMsg"
          :placeholder="placeholder"
          confirm-type="send"
          @confirm="handleSend"
          :disabled="isLoading"
          @focus="onInputFocus"
          @blur="onInputBlur"
        />
        <view class="input-actions">
          <view class="action-btn send-btn" @click="handleSend" :class="{ disabled: !inputMsg.trim() || isLoading }">
            <text>发送</text>
          </view>
        </view>
      </view>
      <view v-if="showSuggestions" class="suggestions-bar">
        <view class="suggestion-chip" v-for="(s, i) in suggestions" :key="i" @click="useSuggestion(s)">
          {{ s }}
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { ref, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { useSessionStore } from '@/store/session'
import { useUserStore } from '@/store/user'
import TeachingCard from '@/components/TeachingCard.vue'
import LoadingSkeleton from '@/components/ui/LoadingSkeleton.vue'

export default {
  name: 'WebChat',
  components: {
    TeachingCard
  },
  props: {
    title: {
      type: String,
      default: 'AI 对话'
    },
    placeholder: {
      type: String,
      default: '请输入消息...'
    },
    model: {
      type: String,
      default: ''
    },
    enableMemory: {
      type: Boolean,
      default: true
    },
    multiAgent: {
      type: Boolean,
      default: false
    },
    agentId: {
      type: String,
      default: 'default'
    }
  },
  setup(props) {
    const sessionStore = useSessionStore()
    const inputMsg = ref('')
    const chatList = ref([])
    const isLoading = ref(false)
    const scrollTop = ref(0)
    const scrollIntoView = ref('')
    const showSuggestions = ref(false)
    const inputFocused = ref(false)

    // 建议回复
    const suggestions = [
      '请解释一下这个概念',
      '给我一个例子',
      '我还不太理解',
      '继续讲解',
      '有什么练习题吗？'
    ]

    // 应用配置到 store（REST 唯一，无 WS base）
    if (props.model) {
      sessionStore.setModel(props.model)
    }

    // 设置 agentId
    if (props.multiAgent) {
      sessionStore.setAgentId(props.agentId)
    } else {
      sessionStore.setAgentId('default')
    }

    // Storage key for chat history
    const storageKey = `chat_history_${props.agentId}`

    // 消息分组计算属性（按日期分组）
    const messageGroups = computed(() => {
      const groups = []
      let currentGroup = null

      chatList.value.forEach((msg, index) => {
        const date = new Date(msg.timestamp || Date.now())
        const dateLabel = formatDateLabel(date)

        if (!currentGroup || currentGroup.dateLabel !== dateLabel) {
          currentGroup = {
            dateLabel,
            showDate: true,
            messages: []
          }
          groups.push(currentGroup)
        } else {
          currentGroup.showDate = false
        }
        currentGroup.messages.push({ ...msg, index })
      })

      return groups
    })

    // 格式化日期标签
    function formatDateLabel(date) {
      const today = new Date()
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)

      if (date.toDateString() === today.toDateString()) {
        return '今天'
      } else if (date.toDateString() === yesterday.toDateString()) {
        return '昨天'
      } else {
        return date.getFullYear() === today.getFullYear()
          ? `${date.getMonth() + 1}月${date.getDate()}日`
          : `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
      }
    }

    // 格式化时间
    function formatTime(timestamp) {
      if (!timestamp) return ''
      const date = new Date(timestamp)
      return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
    }

    // 格式化内容（支持简单的markdown）
    function formatContent(content) {
      if (!content) return ''
      // 简单转义 HTML
      let html = content
        .replace(/&/g, '&')
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/\n/g, '<br/>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code>$1</code>')
      return html
    }

    // Load chat history
    const loadHistory = () => {
      if (!props.enableMemory) return
      try {
        const history = uni.getStorageSync(storageKey)
        if (history) {
          chatList.value = history
        }
      } catch (e) {
        console.warn('Failed to load chat history', e)
      }
    }

    // Save chat history
    const saveHistory = () => {
      if (!props.enableMemory) return
      try {
        uni.setStorageSync(storageKey, chatList.value)
      } catch (e) {
        console.warn('Failed to save chat history', e)
      }
    }

    // 创建会话
    const createSession = async (knowledgePointId) => {
      try {
        await sessionStore.createSession(useUserStore().studentId, knowledgePointId)
      } catch (e) {
        console.error('创建会话失败:', e)
      }
    }

    // 发送消息
    const sendMessage = async (content) => {
      if (!sessionStore.sessionId) {
        await createSession(content.substring(0, 20))
      }
      isLoading.value = true
      try {
        await sessionStore.sendMessage(content)
        // 更新本地聊天列表
        chatList.value = sessionStore.messages.map(m => ({
          role: m.role,
          content: m.content,
          type: m.type,
          teachingContent: m.teachingContent,
          timestamp: m.timestamp
        }))
      } catch (e) {
        console.error('发送消息失败:', e)
        chatList.value.push({ role: 'assistant', content: '抱歉，服务暂时不可用，请稍后重试。', timestamp: Date.now() })
      } finally {
        isLoading.value = false
        await nextTick(() => {
          scrollToBottom()
        })
        saveHistory()
      }
    }

    const handleSend = async () => {
      const text = inputMsg.value.trim()
      if (!text || isLoading.value) return
      inputMsg.value = ''
      showSuggestions.value = false
      // 乐观更新
      chatList.value.push({ role: 'user', content: text, timestamp: Date.now() })
      await nextTick(() => {
        scrollToBottom()
      })
      try {
        await sendMessage(text)
      } catch (e) {
        // error already handled
      }
    }

    const handleTeachingNext = () => {
      sendMessage('我明白了')
    }

    const scrollToBottom = () => {
      nextTick(() => {
        scrollIntoView.value = 'bottom-anchor'
      })
    }

    const clearChat = () => {
      chatList.value = []
      sessionStore.clearMessages()
      saveHistory()
      // 重新添加欢迎消息
      chatList.value.push({
        role: 'assistant',
        content: '你好！我是你的 AI 助手。有什么我可以帮助你的？',
        timestamp: Date.now()
      })
    }

    const useSuggestion = (suggestion) => {
      inputMsg.value = suggestion
      handleSend()
    }

    const onInputFocus = () => {
      inputFocused.value = true
      showSuggestions.value = chatList.value.length <= 1 // 只在开始时显示建议
      nextTick(() => {
        scrollToBottom()
      })
    }

    const onInputBlur = () => {
      inputFocused.value = false
      // 延迟隐藏建议，允许点击
      setTimeout(() => {
        showSuggestions.value = false
      }, 200)
    }

    onMounted(() => {
      loadHistory()
      if (chatList.value.length === 0) {
        chatList.value.push({
          role: 'assistant',
          content: '你好！我是你的 AI 助手。有什么我可以帮助你的？',
          timestamp: Date.now()
        })
        saveHistory()
      }
      // 初始滚动到底部
      nextTick(() => {
        scrollToBottom()
      })
    })

    onUnmounted(() => {
      saveHistory()
    })

    // 状态文本映射
    const statusText = computed(() => {
      const map = {
        'WAIT_START': '准备开始',
        'DIAGNOSING': '诊断中',
        'TEACHING': '讲解中',
        'QUIZZING': '测验中',
        'REMEDIATING': '补救中',
        'MASTERED': '已掌握'
      }
      return map[sessionStore.currentState] || sessionStore.currentState
    })

    // Tabbar 状态
    const tabbarVisible = ref(false)

    const showTabbar = () => {
      tabbarVisible.value = true
    }

    const hideTabbar = () => {
      tabbarVisible.value = false
    }

    const switchTab = (index) => {
      // tabBar 配置页面（与 pages.json 一致）：
      // 0: pages/index/index (首页)
      // 1: pages/chat/chat (AI 辅导) - 当前页面
      // 2: pages/knowledge-graph/index (知识图谱)
      // 3: pages/practice/index (练习)
      // 4: pages/profile/index (我的)
      const tabs = ['/pages/index/index', '/pages/chat/chat', '/pages/knowledge-graph/index', '/pages/practice/index', '/pages/profile/index']
      if (index >= 0 && index < tabs.length) {
        uni.switchTab({ url: tabs[index] })
      }
    }

    const showMoreActions = () => {
      uni.showActionSheet({
        itemList: ['清空聊天记录', '导出聊天记录', '设置'],
        success: (res) => {
          if (res.tapIndex === 0) {
            clearChat()
          } else if (res.tapIndex === 1) {
            // 导出聊天记录
            const data = chatList.value.map(m => ({
              role: m.role,
              content: m.content,
              time: formatTime(m.timestamp)
            }))
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `聊天记录_${new Date().toISOString().split('T')[0]}.json`
            a.click()
            URL.revokeObjectURL(url)
          } else if (res.tapIndex === 2) {
            uni.navigateTo({ url: '/pages/settings/index' })
          }
        }
      })
    }

    const title = ref(props.title)
    const placeholder = ref(props.placeholder)

    return {
      title,
      placeholder,
      inputMsg,
      chatList,
      isLoading,
      scrollTop,
      scrollIntoView,
      showSuggestions,
      inputFocused,
      suggestions,
      handleSend,
      handleTeachingNext,
      statusText,
      tabbarVisible,
      showTabbar,
      hideTabbar,
      switchTab,
      messageGroups,
      formatTime,
      formatContent,
      clearChat,
      useSuggestion,
      onInputFocus,
      onInputBlur,
      showMoreActions
    }
  }
}
</script>

<style scoped>
/* ============ 页面布局 ============ */
.page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f7f8fa;
  position: relative;
}

/* ============ 顶部栏 ============ */
.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: linear-gradient(135deg, #4a6cf7 0%, #3b5bd9 100%);
  box-shadow: 0 2px 8px rgba(74, 108, 247, 0.3);
  z-index: 50;
}

.topbar-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.topbar-title {
  font-size: 17px;
  color: #fff;
  font-weight: 600;
  letter-spacing: -0.3px;
}

.topbar-status {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.85);
  display: flex;
  align-items: center;
  gap: 6px;
}

.topbar-status::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #4ade80;
  box-shadow: 0 0 8px #4ade80;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.topbar-action {
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 16px;
  color: #fff;
  font-size: 13px;
  backdrop-filter: blur(10px);
  transition: background 0.2s;
}

.topbar-action:active {
  background: rgba(255, 255, 255, 0.25);
}

/* ============ 消息列表 ============ */
.chat-list {
  flex: 1;
  padding: 16px;
  padding-bottom: 140px; /* 为输入区 + tabbar 预留空间 */
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 日期分隔符 */
.date-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 8px 0;
  padding: 0 16px;
}

.date-divider text {
  background: rgba(0, 0, 0, 0.05);
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  color: #999;
  font-weight: 500;
}

/* 消息行 */
.msg-row {
  display: flex;
  gap: 8px;
  max-width: 85%;
  animation: fadeInUp 0.3s ease;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* AI 消息行 - 左对齐 */
.ai-row {
  align-self: flex-start;
  flex-direction: row;
}

/* 用户消息行 - 右对齐 */
.user-row {
  align-self: flex-end;
  flex-direction: row-reverse;
}

/* 头像 */
.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 2px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
}

.ai-avatar {
  background: linear-gradient(135deg, #4a6cf7 0%, #3b5bd9 100%);
}

.user-avatar {
  background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%);
}

/* 气泡包装器 */
.bubble-wrapper {
  display: flex;
  flex-direction: column;
  max-width: 100%;
}

.ai-wrapper {
  align-items: flex-start;
}

.user-wrapper {
  align-items: flex-end;
}

/* 气泡 */
.bubble {
  padding: 12px 16px;
  border-radius: 18px;
  font-size: 15px;
  line-height: 1.6;
  word-break: break-word;
  position: relative;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

/* AI 气泡 */
.ai-bubble {
  background: #fff;
  color: #1a1a2e;
  border-bottom-left-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.04);
}

.ai-bubble::before {
  content: '';
  position: absolute;
  left: -8px;
  bottom: 0;
  width: 16px;
  height: 16px;
  background: #fff;
  border-left: 1px solid rgba(0, 0, 0, 0.04);
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);
  border-radius: 0 0 0 18px;
  transform: rotate(45deg);
}

/* 用户气泡 */
.user-bubble {
  background: linear-gradient(135deg, #4a6cf7 0%, #3b5bd9 100%);
  color: #fff;
  border-bottom-right-radius: 4px;
}

.user-bubble::before {
  content: '';
  position: absolute;
  right: -8px;
  bottom: 0;
  width: 16px;
  height: 16px;
  background: linear-gradient(135deg, #4a6cf7 0%, #3b5bd9 100%);
  border-right: 1px solid rgba(74, 108, 247, 0.3);
  border-bottom: 1px solid rgba(74, 108, 247, 0.3);
  border-radius: 0 0 18px 0;
  transform: rotate(45deg);
}

/* 消息内容富文本 */
.bubble rich-text {
  width: 100%;
}

.bubble rich-text ::v-deep {
  font-size: 15px;
  line-height: 1.6;
}

.bubble rich-text ::v-deep strong {
  font-weight: 600;
}

.bubble rich-text ::v-deep em {
  font-style: italic;
}

.bubble rich-text ::v-deep code {
  background: rgba(0, 0, 0, 0.06);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 13px;
}

.user-bubble rich-text ::v-deep code {
  background: rgba(255, 255, 255, 0.2);
}

/* 消息元信息（时间） */
.msg-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  padding: 0 4px;
}

.msg-time {
  font-size: 10px;
  color: #999;
  opacity: 0.8;
}

.ai-wrapper .msg-time {
  color: #aaa;
}

.user-wrapper .msg-time {
  color: rgba(255, 255, 255, 0.7);
}

/* 加载状态 */
.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  gap: 12px;
  align-self: center;
}

.loading-dots {
  display: flex;
  gap: 4px;
}

.loading-dots .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #4a6cf7;
  animation: bounce 1.4s infinite ease-in-out both;
}

.loading-dots .dot:nth-child(1) { animation-delay: -0.32s; }
.loading-dots .dot:nth-child(2) { animation-delay: -0.16s; }

@keyframes bounce {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
}

.loading text {
  font-size: 13px;
  color: #999;
}

/* ============ 底部输入区 ============ */
.input-area {
  background: #fff;
  border-top: 1px solid #e9ecef;
  padding: 10px 16px;
  padding-bottom: calc(10px + env(safe-area-inset-bottom));
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 100;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.04);
  transition: bottom 0.3s ease, transform 0.3s ease;
}

.input-area.input-area-with-tabbar {
  bottom: 50px;
}

.input-wrapper {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  background: #f1f3f5;
  border-radius: 24px;
  padding: 6px 8px;
  padding-right: 4px;
  transition: background 0.2s;
}

.input-wrapper:focus-within {
  background: #e9edf5;
  box-shadow: 0 0 0 3px rgba(74, 108, 247, 0.15);
}

.input-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.action-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: #666;
  font-size: 18px;
  font-weight: 500;
  transition: all 0.2s;
}

.action-btn:active {
  transform: scale(0.95);
}

.send-btn {
  background: #4a6cf7;
  color: #fff !important;
  width: auto;
  padding: 0 18px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 600;
}

.send-btn:active {
  background: #3b5bd9;
}

.send-btn.disabled {
  background: #ccc;
  color: #999 !important;
}

.msg-input {
  flex: 1;
  min-height: 24px;
  max-height: 120px;
  padding: 8px 12px;
  background: transparent;
  border: none;
  font-size: 15px;
  line-height: 1.5;
  color: #1a1a2e;
  outline: none;
  font-family: inherit;
}

.msg-input::placeholder {
  color: #aaa;
}

/* 建议栏 */
.suggestions-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 4px 0;
  max-height: 60px;
  overflow-y: auto;
}

.suggestion-chip {
  padding: 6px 12px;
  background: #f1f3f5;
  border-radius: 16px;
  font-size: 13px;
  color: #4a6cf7;
  white-space: nowrap;
  transition: all 0.2s;
}

.suggestion-chip:active {
  background: #e9edf5;
  transform: scale(0.98);
}

/* ============ Tabbar ============ */
.tabbar {
  display: flex;
  justify-content: space-around;
  align-items: center;
  height: 50px;
  background: #fff;
  border-top: 1px solid #e9ecef;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 99;
  transform: translateY(100%);
  opacity: 0;
  transition: transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.3s ease;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.06);
}

.tabbar.tabbar-visible {
  transform: translateY(0);
  opacity: 1;
}

.tabbar-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4px 12px;
  color: #999;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 60px;
  border-radius: 12px;
}

.tabbar-item:active {
  background: #f1f3f5;
  transform: scale(0.95);
}

.tabbar-item:hover,
.tabbar-item.active {
  color: #4a6cf7;
}

.tabbar-icon {
  font-size: 22px;
  margin-bottom: 2px;
  line-height: 1;
}

.tabbar-text {
  font-size: 10px;
  font-weight: 500;
}

/* 响应式调整 */
@media (max-width: 480px) {
  .msg-row {
    max-width: 90%;
  }

  .topbar-title {
    font-size: 16px;
  }

  .input-area {
    padding: 8px 12px;
  }

  .msg-input {
    font-size: 16px; /* 防止iOS缩放 */
  }
}

/* 暗色模式适配 */
@media (prefers-color-scheme: dark) {
  .page {
    background: #1a1a2e;
  }

  .chat-list {
    background: transparent;
  }

  .ai-bubble {
    background: #252542;
    color: #e8e8f0;
    border-color: rgba(255, 255, 255, 0.05);
  }

  .ai-bubble::before {
    background: #252542;
    border-color: rgba(255, 255, 255, 0.05);
  }

  .input-area {
    background: #1a1a2e;
    border-color: #2d2d4a;
  }

  .input-wrapper {
    background: #252542;
  }

  .input-wrapper:focus-within {
    background: #2d2d4a;
  }

  .msg-input {
    color: #e8e8f0;
  }

  .msg-input::placeholder {
    color: #666;
  }

  .suggestion-chip {
    background: #252542;
    color: #7c94ff;
  }

  .suggestion-chip:active {
    background: #2d2d4a;
  }

  .tabbar {
    background: #1a1a2e;
    border-color: #2d2d4a;
  }

  .tabbar-item:active {
    background: #252542;
  }

  .date-divider text {
    background: rgba(255, 255, 255, 0.05);
    color: #888;
  }

  .loading text {
    color: #888;
  }

  .loading-dots .dot {
    background: #7c94ff;
  }
}
</style>