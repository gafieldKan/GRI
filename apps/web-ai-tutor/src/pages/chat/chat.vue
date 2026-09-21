<template>
  <ErrorBoundary :showDetails="true" :logError="true">
    <web-chat
      title="AI 智学数学老师"
      placeholder="请输入你的问题或答案..."
      :enableMemory="true"
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
  }
}
</script>

<style scoped>
/* No additional styles needed */
</style>
