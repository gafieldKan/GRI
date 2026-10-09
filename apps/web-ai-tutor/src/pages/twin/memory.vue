<template>
  <view class="tw-page">
    <view class="tw-head">
      <text class="tw-title">行为与记忆</text>
      <text class="tw-sub">你的经历与 AI 教师对你的长期记忆——世界里的每一步都留痕，可回溯、可收藏。</text>
    </view>

    <LoadingSkeleton v-if="twinStore.loading && !twinStore.loaded" variant="list" :rows="4" />

    <template v-else>
      <!-- 概览 -->
      <view class="tw-panel">
        <view class="tw-stat-row">
          <view class="tw-stat">
            <text class="tw-stat-v">{{ events.length }}</text>
            <text class="tw-stat-l">条经历</text>
          </view>
          <view class="tw-stat">
            <text class="tw-stat-v">{{ memories.length }}</text>
            <text class="tw-stat-l">条记忆</text>
          </view>
          <view class="tw-stat">
            <text class="tw-stat-v">{{ actionCount }}</text>
            <text class="tw-stat-l">次学习行动</text>
          </view>
        </view>
      </view>

      <!-- 人物关系：与 AI 教师 -->
      <view class="tw-panel">
        <view class="tw-panel-head">
          <text class="tw-panel-title"><svg class="twin-ico sm"><use href="#i-chat" /></svg> 人物关系</text>
          <text class="tw-tag green">引导 NPC</text>
        </view>
        <view class="rel-row">
          <view class="rel-avatar"><svg class="twin-ico"><use href="#i-person" /></svg></view>
          <view class="rel-info">
            <text class="rel-name">你的 AI 教师</text>
            <text class="rel-sub">师生关系值</text>
          </view>
          <view class="rel-bond">
            <view class="rel-bar"><view class="rel-fill" :style="{ width: bondPct + '%' }" /></view>
            <text class="rel-num">{{ bond }}</text>
          </view>
        </view>
        <text class="rel-note">共 {{ interactions }} 次教学互动——关系值由共同行动（请教、答题、授课）生长。</text>
      </view>

      <!-- 经历时间线 -->
      <view class="tw-panel">
        <view class="tw-panel-head">
          <view>
            <text class="tw-panel-title"><svg class="twin-ico sm"><use href="#i-clock" /></svg> 经历</text>
            <text class="tw-panel-sub">append-only · 由学习行为生长</text>
          </view>
          <button v-if="!events.length" class="tw-btn soft" @click="onBackfill">回填历史</button>
        </view>
        <EventTimeline :events="events" />
      </view>

      <!-- 长期记忆 -->
      <view class="tw-panel">
        <view class="tw-panel-head">
          <view>
            <text class="tw-panel-title"><svg class="twin-ico sm"><use href="#i-memory" /></svg> 长期记忆</text>
            <text class="tw-panel-sub">AI 教师的跨会话记忆（每生隔离）</text>
          </view>
        </view>
        <view v-if="!memories.length" class="mem-empty">
          <text>AI 教师还没有积累关于你的记忆——多与它交流，它会记住你</text>
        </view>
        <view v-else>
          <MemoryCard v-for="m in memories" :key="m.key" :memory="m" />
        </view>
      </view>

      <view class="tw-help">
        <text class="tw-help-title">关于经历与记忆</text>
        <text class="tw-help-body">
          经历是你每一次学习行动的如实记录（探索、练习、请教、复习……），只增不改，前后差异取自真实学习记录；
          记忆是 AI 教师对你在对话中形成的跨会话印象（受隐私键守卫过滤，绝不含密码/令牌等敏感信息）。
        </text>
      </view>
    </template>

    <view class="tw-safe" />
  </view>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useTwinStore } from '@/store/twin'
import { useKnowledgeStore } from '@/store/knowledge'
import LoadingSkeleton from '@/components/ui/LoadingSkeleton.vue'
import EventTimeline from '@/components/twin/EventTimeline.vue'
import MemoryCard from '@/components/twin/MemoryCard.vue'

const twinStore = useTwinStore()
const knowledgeStore = useKnowledgeStore()

const events = computed(() => twinStore.events)
const memories = computed(() => twinStore.memories)
const actionCount = computed(() => events.value.filter((e) => e.kind === 'action').length)

const bond = computed(() => twinStore.teacherBond?.bond ?? 0)
const interactions = computed(() => twinStore.teacherBond?.interactions ?? 0)
const bondPct = computed(() => Math.max(4, Math.min(100, Number(bond.value) || 0)))

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
.mem-empty {
  padding: 24px 8px;
  font-size: 13px;
  color: var(--twin-sub);
  text-align: center;
}

/* 人物关系 */
.rel-row { display: flex; align-items: center; gap: 12px; }
.rel-avatar {
  display: flex; align-items: center; justify-content: center;
  width: 44px; height: 44px; border-radius: 12px;
  background: var(--twin-mint); color: var(--twin-teal); flex-shrink: 0;
}
.rel-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.rel-name { font-size: 14px; font-weight: 650; }
.rel-sub { font-size: 11px; color: var(--twin-sub); margin-top: 2px; }
.rel-bond { display: flex; align-items: center; gap: 8px; }
.rel-bar { width: 64px; height: 6px; border-radius: 6px; background: var(--twin-line); overflow: hidden; }
.rel-fill { height: 100%; border-radius: 6px; background: var(--twin-teal); }
.rel-num { font-size: 13px; font-weight: 700; color: var(--twin-teal); font-variant-numeric: tabular-nums; }
.rel-note { display: block; font-size: 11px; color: var(--twin-sub); line-height: 1.8; margin-top: 12px; }
</style>
