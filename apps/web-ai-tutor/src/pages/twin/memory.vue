<template>
  <view class="page">
    <PageHeader title="行为与记忆" subtitle="你的经历与 AI 教师对你的长期记忆" />

    <!-- 概览 -->
    <view class="summary">
      <view class="sum-item">
        <text class="sum-value">{{ events.length }}</text>
        <text class="sum-label">条经历</text>
      </view>
      <view class="sum-item">
        <text class="sum-value">{{ memories.length }}</text>
        <text class="sum-label">条记忆</text>
      </view>
      <view class="sum-item">
        <text class="sum-value">{{ actionCount }}</text>
        <text class="sum-label">次学习行动</text>
      </view>
    </view>

    <LoadingSkeleton v-if="twinStore.loading && !twinStore.loaded" variant="list" :rows="4" />

    <template v-else>
      <!-- 经历时间线 -->
      <view class="card">
        <PageHeader title="经历" subtitle="append-only · 由学习行为生长">
          <template #actions>
            <Chip
              v-if="!events.length"
              label="回填历史"
              color="blue"
              variant="soft"
              size="small"
              @click="onBackfill"
            />
          </template>
        </PageHeader>
        <EventTimeline :events="events" />
      </view>

      <!-- 长期记忆 -->
      <view class="card">
        <PageHeader title="长期记忆" subtitle="AI 教师的跨会话记忆（每生隔离）" />
        <view v-if="!memories.length" class="mem-empty">
          <text>AI 教师还没有积累关于你的记忆——多与它交流，它会记住你</text>
        </view>
        <view v-else>
          <MemoryCard v-for="m in memories" :key="m.key" :memory="m" />
        </view>
      </view>

      <view class="honest-note">
        <text class="honest-title">关于经历与记忆</text>
        <text class="honest-body">
          经历是你每一次学习行动的如实记录（探索、练习、请教、复习……），只增不改，前后差异取自真实学习记录；
          记忆是 AI 教师对你在对话中形成的跨会话印象（受隐私键守卫过滤，绝不含密码/令牌等敏感信息）。
        </text>
      </view>
    </template>

    <view class="safe-area" />
  </view>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useTwinStore } from '@/store/twin'
import { useKnowledgeStore } from '@/store/knowledge'
import PageHeader from '@/components/ui/PageHeader.vue'
import Chip from '@/components/ui/Chip.vue'
import LoadingSkeleton from '@/components/ui/LoadingSkeleton.vue'
import EventTimeline from '@/components/twin/EventTimeline.vue'
import MemoryCard from '@/components/twin/MemoryCard.vue'

const twinStore = useTwinStore()
const knowledgeStore = useKnowledgeStore()

const events = computed(() => twinStore.events)
const memories = computed(() => twinStore.memories)
const actionCount = computed(() => events.value.filter((e) => e.kind === 'action').length)

async function onBackfill() {
  const r = await twinStore.backfill()
  await twinStore.loadEvents(100)
  uni.showToast({
    title: r && !r.skipped ? `已回填 ${r.created} 条经历` : '时间线已非空',
    icon: 'none'
  })
}

onMounted(async () => {
  if (!twinStore.loaded) {
    await twinStore.loadOverview(knowledgeStore.currentSubject || 'math')
  }
  await twinStore.loadEvents(100)
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: var(--color-bg-primary, #f7f8fa);
  padding-bottom: 40px;
}

.summary {
  display: flex;
  margin: 16px;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  border: 1px solid var(--color-border, #e8e8f0);
}

.sum-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 4px;
}

.sum-value {
  font-size: 22px;
  font-weight: 700;
  color: #4a6cf7;
}

.sum-label {
  font-size: 11px;
  color: var(--color-text-tertiary, #999);
  margin-top: 4px;
}

.card {
  margin: 0 16px 16px;
  background: #fff;
  border-radius: 16px;
  padding: 4px 14px 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  border: 1px solid var(--color-border, #e8e8f0);
}

.mem-empty {
  padding: 24px 8px;
  font-size: 13px;
  color: var(--color-text-tertiary, #999);
  text-align: center;
}

.honest-note {
  margin: 8px 16px 16px;
  padding: 14px 16px;
  background: var(--color-bg-secondary, #f0f2f7);
  border-radius: 12px;
  border: 1px dashed var(--color-border, #dcdfe8);
}

.honest-title {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-secondary, #666);
  margin-bottom: 6px;
}

.honest-body {
  display: block;
  font-size: 11px;
  color: var(--color-text-tertiary, #999);
  line-height: 1.7;
}

.safe-area {
  height: 24px;
}
</style>
