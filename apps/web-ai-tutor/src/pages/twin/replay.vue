<template>
  <view class="tw-page">
    <view class="tw-head">
      <text class="tw-title">状态回放</text>
      <text class="tw-sub">拖动滑杆，回看孪生如何一路长成——只读历史快照，不改动你此刻的真实状态。</text>
    </view>

    <LoadingSkeleton v-if="loading && !frames.length" variant="list" :rows="4" />

    <EmptyState
      v-else-if="!frames.length"
      icon="⏳"
      title="还没有可回放的经历"
      description="在世界里做一件事，经历会被如实记录，这里就能回看每一步"
    />

    <template v-else>
      <!-- 当前帧 -->
      <view class="tw-panel">
        <view class="frame-head">
          <text class="frame-title">{{ current.title }}</text>
          <text class="tw-tag green tw-num">{{ position }}</text>
        </view>
        <text class="frame-time"><svg class="twin-ico sm"><use href="#i-clock" /></svg> {{ absTime(current.at) }} · {{ relTime(current.at) }}</text>
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
            <text class="snap-val tw-num">{{ v }}</text>
          </view>
        </view>
      </view>

      <!-- 滑杆 -->
      <view class="tw-panel">
        <slider
          class="scrub-slider"
          :min="0"
          :max="Math.max(0, frames.length - 1)"
          :value="index"
          activeColor="#247b68"
          backgroundColor="#e2e9e3"
          block-color="#247b68"
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
          <button class="tw-btn soft" @click="step(-1)">← 上一步</button>
          <button class="tw-btn soft" @click="step(1)">下一步 →</button>
        </view>
      </view>

      <view class="tw-help">
        <text class="tw-help-title">关于回放</text>
        <text class="tw-help-body">
          回放只读——拖动滑杆查看的是历史快照，不会改动你此刻的真实状态；
          快照取自每次行动后的既成学习记录，只增不改，如实可溯。
        </text>
      </view>
    </template>

    <view class="tw-safe" />
  </view>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useTwinStore } from '@/store/twin'
import { useKnowledgeStore } from '@/store/knowledge'
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
.frame-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.frame-title { font-size: 17px; font-weight: 700; }
.frame-time { display: flex; align-items: center; gap: 5px; font-size: 12px; color: var(--twin-sub); margin-top: 6px; }
.frame-text { display: block; font-size: 13px; color: var(--twin-sub); margin-top: 8px; line-height: 1.7; }

.frame-diffs { margin-top: 10px; padding: 10px 12px; background: var(--twin-mint); border-radius: 10px; }
.frame-diff { display: block; font-size: 12px; color: var(--twin-teal); line-height: 1.8; }

.frame-snapshot { margin-top: 12px; border-top: 1px dashed var(--twin-line); padding-top: 10px; }
.snap-title { display: block; font-size: 12px; font-weight: 700; color: var(--twin-sub); margin-bottom: 6px; }
.snap-row { display: flex; justify-content: space-between; padding: 4px 0; }
.snap-key { font-size: 12px; color: #9caa93; }
.snap-val { font-size: 13px; font-weight: 600; color: var(--twin-ink); }

.scrub-slider { margin: 4px 0; }
.scrub-meta { display: flex; justify-content: space-between; align-items: center; padding: 0 6px; }
.scrub-label { font-size: 11px; color: #a0aa97; }
.scrub-count { font-size: 12px; color: var(--twin-sub); }
.scrub-btns { display: flex; gap: 12px; margin-top: 12px; }
.scrub-btns .tw-btn { flex: 1; }
</style>
