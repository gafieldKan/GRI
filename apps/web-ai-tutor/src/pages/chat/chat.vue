<template>
  <ErrorBoundary :showDetails="true" :logError="true">
    <web-chat
      title="AI 智学数学老师"
      placeholder="请输入你的问题或答案..."
      :enableMemory="true"
      :initialMessage="initialMessage"
    />
    <template #fallback>
      <EmptyState
        title="聊天加载失败"
        description="无法加载聊天组件，请稍后重试"
        icon="💬"
        :actions="[{ label: '重试', handler: () => location.reload() }]"
      />
    </template>
  </ErrorBoundary>
</template>

<script>
import WebChat from './components/WebChat.vue'
import ErrorBoundary from '@/components/ErrorBoundary.vue'
import EmptyState from '@/components/ui/EmptyState.vue'

export default {
  components: {
    WebChat,
    ErrorBoundary,
    EmptyState
  },
  data() {
    return { initialMessage: '' }
  },
  // camera 等跨页带参：解析 ocrResult（识别结果 JSON）/ image（图片路径）/ text（题目文本）
  // → 拼成首条消息交给 WebChat 自动送出。uni-app H5 用 onLoad 拿页面参数。
  onLoad(query) {
    if (!query) return
    if (query.ocrResult) {
      try {
        const parsed = JSON.parse(decodeURIComponent(query.ocrResult))
        const qs = (parsed.parsedQuestions || parsed.ocr?.questions || [])
          .map((q) => q.content)
          .filter(Boolean)
        if (qs.length) {
          this.initialMessage = '请帮我解答这道题：' + qs.join('\n')
        } else {
          const raw = parsed.ocr?.rawText || parsed.rawText
          if (raw) this.initialMessage = '请帮我解答这道题：' + raw
        }
      } catch (e) {
        console.error('解析 OCR 参数失败:', e)
      }
    } else if (query.text) {
      this.initialMessage = '请帮我解答这道题：' + decodeURIComponent(query.text)
    } else if (query.image) {
      // 纯图片路径（识别失败降级）：提示用户手动输入（H5 无法直接把 blob 路径传给 LLM）
      this.initialMessage = ''
    }
  }
}
</script>

<style scoped>
/* No additional styles needed */
</style>
