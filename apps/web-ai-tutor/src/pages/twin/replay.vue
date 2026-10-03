<template>
  <view class="page">
    <PageHeader title="状态回放" subtitle="拖动滑杆，回看孪生如何一路长成" />

    <LoadingSkeleton v-if="loading && !frames.length" variant="list" :rows="4" />

    <template v-else-if="!frames.length">
      <EmptyState
        title="还没有可回放的经历"
        description="在世界里做一件事，经历会被如实记录，这里就能回看每一步"
        icon="⏳"
      />
    </template>

    <template v-else>
      <!-- 当前帧 -->
      <view class="frame-card">
        <view class="frame-head">
          <text class="frame-title">{{ current.title }}</text>
          <text class="frame-index">{{ position }}</text>
        </view>
        <text class="frame-time">{{ absTime(current.at) }} · {{ relTime(current.at) }}</text>
        <text v-if="current.text" class="frame-text">{{ current.text }}</text>

        <!-- 差异 -->
        <view v-if="current.diffs && current.diffs.length" class="frame-diffs">
          <text v-for="(d, i) in current.diffs" :key="i" class="frame-diff">
            {{ d.label }}：{{ d.before }} → {{ d.after }}
          </text>
        </view>

        <!-- 状态快照（该次行动后的真实进度） -->
        <view v-if="snapshot" class="frame-snapshot">
          <text class="snap-title">行动后的状态快照</text>
          <view class="snap-row" v-for="(v, k) in snapshot" :key="k">
            <text class="snap-key">{{ k }}</text>
            <text class="snap-val">{{ v }}</text>
          </view>
        </view>
      </view>

      <!-- 滑杆 -->
      <view class="scrub">
        <slider
          class="scrub-slider"
          :min="0"
          :max="Math.max(0, frames.length - 1)"
          :value="index"
          activeColor="#4a6cf7"
          block-size="20"
          @changing="onScrub"
          @change="onScrub"
        />
        <view class="scrub-meta">
          <text class="scrub-label">最早</text>
          <text class="scrub-count">共 {{ frames.length }} 帧</text>
          <text class="scrub-label">最近</text>
        </view>
        <view class="scrub-btns">
          <button class="scrub-btn" @click="step(-1)">← 上一步</button>
          <button class="scrub-btn" @click="step(1)">下一步 →</button>
        </view>
      </view>

      <view class="honest-note">
        <text class="honest-title">关于回放</text>
        <text class="honest-body">
          回放只读——拖动滑杆查看的是历史快照，不会改动你此刻的真实状态；
          快照取自每次行动后的既成学习记录，只增不改，如实可溯。
        </text>
      </view>
    </template>

    <view class="safe-area" />
  </view>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useTwinStore } from '@/store/twin'
import { useKnowledgeStore } from '@/store/knowledge'
import PageHeader from '@/components/ui/PageHeader.vue'
import LoadingSkeleton from '@/components/ui/LoadingSkeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'

const twinStore = useTwinStore()
const knowledgeStore = useKnowledgeStore()

const loading = ref(false)
const index = ref(0)

const frames = computed(() => twinStore.replayFrames)
const current = computed(() => frames.value[index.value] || {})
const position = computed(() => `${index.value + 1} / ${frames.value.length}`)

// 只展示进度类快照（before/after 为数字对象时），避免渲染任意结构
const snapshot = computed(() => {
  const s = current.value?.after
  if (!s || typeof s !== 'object' || Array.isArray(s)) return null
  return s
})

function onScrub(e) {
  const v = e?.detail?.value
  if (typeof v === 'number') index.value = v
}

function step(delta) {
  const next = index.value + delta
  if (next >= 0 && next < frames.value.length) index.value = next
}

function absTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function relTime(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小时前`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day} 天前`
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

function pad(n) {
  return n < 10 ? '0' + n : '' + n
}

onMounted(async () => {
  loading.value = true
  if (!twinStore.loaded) {
    await twinStore.loadOverview(knowledgeStore.currentSubject || 'math')
  }
  await twinStore.loadReplay(200)
  index.value = Math.max(0, frames.value.length - 1) // 默认停在最近一帧
  loading.value = false
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: var(--color-bg-primary, #f7f8fa);
  padding-bottom: 40px;
}

.frame-card {
  margin: 16px;
  background: #fff;
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  border: 1px solid var(--color-border, #e8e8f0);
}

.frame-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 10px;
}

.frame-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--color-text-primary, #1a1a2e);
}

.frame-index {
  font-size: 12px;
  color: var(--color-text-tertiary, #999);
  flex-shrink: 0;
}

.frame-time {
  display: block;
  font-size: 12px;
  color: var(--color-text-tertiary, #999);
  margin-top: 4px;
}

.frame-text {
  display: block;
  font-size: 13px;
  color: var(--color-text-secondary, #666);
  margin-top: 8px;
  line-height: 1.6;
}

.frame-diffs {
  margin-top: 10px;
  padding: 10px 12px;
  background: rgba(74, 108, 247, 0.06);
  border-radius: 10px;
}

.frame-diff {
  display: block;
  font-size: 12px;
  color: #4a6cf7;
  line-height: 1.8;
}

.frame-snapshot {
  margin-top: 12px;
  border-top: 1px dashed var(--color-border, #e8e8f0);
  padding-top: 10px;
}

.snap-title {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-secondary, #666);
  margin-bottom: 6px;
}

.snap-row {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
}

.snap-key {
  font-size: 12px;
  color: var(--color-text-tertiary, #999);
}

.snap-val {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary, #1a1a2e);
}

.scrub {
  margin: 0 16px 16px;
  background: #fff;
  border-radius: 16px;
  padding: 8px 12px 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  border: 1px solid var(--color-border, #e8e8f0);
}

.scrub-slider {
  margin: 8px 0;
}

.scrub-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 6px;
}

.scrub-label {
  font-size: 11px;
  color: var(--color-text-tertiary, #aaa);
}

.scrub-count {
  font-size: 12px;
  color: var(--color-text-secondary, #666);
}

.scrub-btns {
  display: flex;
  gap: 12px;
  margin-top: 12px;
}

.scrub-btn {
  flex: 1;
  font-size: 13px;
  line-height: 2.4;
  color: #4a6cf7;
  background: rgba(74, 108, 247, 0.1);
  border-radius: 10px;
  border: none;
}

.scrub-btn::after {
  border: none;
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
