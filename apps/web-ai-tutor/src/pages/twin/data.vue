<template>
  <view class="tw-page">
    <view class="tw-head">
      <text class="tw-title">数据与设置</text>
      <text class="tw-sub">你的孪生档案：可导出、可携带、由你掌控——档案只含「你」的部分，世界来自共享本体。</text>
    </view>

    <!-- 档案概览 -->
    <view class="tw-panel">
      <view class="tw-panel-head">
        <view>
          <text class="tw-panel-title"><svg class="twin-ico sm"><use href="#i-data" /></svg> 孪生档案</text>
          <text class="tw-panel-sub">gri-student-digital-twin · v1</text>
        </view>
        <text class="tw-tag green">个人部件</text>
      </view>
      <view class="tw-stat-row">
        <view class="tw-stat">
          <text class="tw-stat-v">{{ eventCount }}</text>
          <text class="tw-stat-l">条经历</text>
        </view>
        <view class="tw-stat">
          <text class="tw-stat-v">{{ memoryCount }}</text>
          <text class="tw-stat-l">条记忆</text>
        </view>
        <view class="tw-stat">
          <text class="tw-stat-v name">{{ profileName }}</text>
          <text class="tw-stat-l">身份</text>
        </view>
      </view>
      <text class="hint">档案只含「个人」部件：身份 + 状态 + 经历 + 记忆；世界（知识版图）来自共享本体，不随档案搬运。</text>
    </view>

    <!-- 导出 -->
    <view class="tw-panel">
      <view class="tw-panel-head">
        <view>
          <text class="tw-panel-title"><svg class="twin-ico sm"><use href="#i-download" /></svg> 导出</text>
          <text class="tw-panel-sub">把孪生带走（JSON）</text>
        </view>
      </view>
      <text class="hint">导出的档案不含任何密码/令牌等敏感信息（记忆已按隐私键守卫过滤）。</text>
      <button class="tw-btn primary block" :disabled="exporting" @click="onExport">
        {{ exporting ? '导出中…' : '导出孪生档案' }}
      </button>
    </view>

    <!-- 导入 -->
    <view class="tw-panel">
      <view class="tw-panel-head">
        <view>
          <text class="tw-panel-title"><svg class="twin-ico sm"><use href="#i-upload" /></svg> 导入</text>
          <text class="tw-panel-sub">合并一份档案（追加经历 + 更新身份）</text>
        </view>
      </view>
      <text class="hint">
        导入为「合并」语义：按 时间+类别+标题 去重后追加经历，并按白名单更新人物画像；
        当前状态由真实学习记录装配，不会被档案覆盖（诚实口径）。
      </text>
      <textarea
        class="import-box"
        v-model="importText"
        placeholder="在此粘贴导出的档案 JSON…"
        :maxlength="-1"
        auto-height
      />
      <view class="btn-row">
        <button class="tw-btn ghost" @click="onPickFile">选择文件</button>
        <button class="tw-btn primary" :disabled="importing || !importText.trim()" @click="onImport">
          {{ importing ? '导入中…' : '导入档案' }}
        </button>
      </view>
      <input ref="fileInput" class="hidden-input" type="file" accept="application/json,.json" @change="onFileChange" />
    </view>

    <!-- 设置 -->
    <view class="tw-panel">
      <view class="tw-panel-head">
        <view>
          <text class="tw-panel-title"><svg class="twin-ico sm"><use href="#i-edit" /></svg> 设置</text>
          <text class="tw-panel-sub">本地偏好</text>
        </view>
      </view>
      <view class="switch-row">
        <view class="switch-text">
          <text class="switch-title">自动记录学习行动</text>
          <text class="switch-desc">开启后，练习/上课等行动会自动写入你的经历时间线；关闭则不再自动记录（仅保留手动行动）。</text>
        </view>
        <switch :checked="twinStore.autoRecord" color="#247b68" @change="onToggleAuto" />
      </view>
    </view>

    <view class="tw-help">
      <text class="tw-help-title">关于数据</text>
      <text class="tw-help-body">
        孪生镜像的是一个真实的人——档案里每一条都来自你自己的学习记录或你填写的资料。
        导出即复制，导入即合并，二者都不改变真源；你可以随时把档案带走。
      </text>
    </view>

    <view class="tw-safe" />
  </view>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useTwinStore } from '@/store/twin'
import { useKnowledgeStore } from '@/store/knowledge'

const twinStore = useTwinStore()
const knowledgeStore = useKnowledgeStore()

const exporting = ref(false)
const importing = ref(false)
const importText = ref('')
const fileInput = ref(null)

const eventCount = computed(() => twinStore.events.length)
const memoryCount = computed(() => twinStore.memories.length)
const profileName = computed(() => twinStore.displayName)

function toast(title, icon = 'none') {
  uni.showToast({ title, icon })
}

async function onExport() {
  exporting.value = true
  try {
    const archive = await twinStore.exportArchive()
    if (!archive) {
      toast('导出失败，请稍后重试')
      return
    }
    const json = JSON.stringify(archive, null, 2)
    const name = `twin-${archive.profile?.username || archive.profile?.id || 'me'}-${Date.now()}.json`
    downloadJson(json, name)
    toast('已导出孪生档案')
  } finally {
    exporting.value = false
  }
}

function downloadJson(json, filename) {
  // H5：Blob 下载；非 H5 退回剪贴板。
  try {
    if (typeof document !== 'undefined' && typeof Blob !== 'undefined') {
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 2000)
      return
    }
  } catch (e) {
    /* 落到剪贴板兜底 */
  }
  uni.setClipboardData({ data: json, success: () => toast('档案已复制到剪贴板') })
}

function onPickFile() {
  const el = fileInput.value?.$el || fileInput.value
  if (el && typeof el.click === 'function') el.click()
}

function onFileChange(e) {
  const file = e?.target?.files?.[0] || e?.detail?.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    importText.value = String(reader.result || '')
  }
  reader.readAsText(file)
}

async function onImport() {
  let archive
  try {
    archive = JSON.parse(importText.value)
  } catch (e) {
    toast('JSON 解析失败，请检查档案格式')
    return
  }
  importing.value = true
  try {
    const r = await twinStore.importArchive(archive)
    toast(`已导入 ${r?.events ?? 0} 条经历`)
    importText.value = ''
  } catch (e) {
    toast(e?.message || '导入失败：格式或版本不匹配')
  } finally {
    importing.value = false
  }
}

function onToggleAuto(e) {
  const v = e?.detail?.value
  twinStore.setAutoRecord(v)
  toast(v ? '已开启自动记录' : '已关闭自动记录')
}

onMounted(async () => {
  if (!twinStore.loaded) {
    await twinStore.loadOverview(knowledgeStore.currentSubject || 'math')
  }
  await twinStore.loadEvents(500)
})
</script>

<style scoped>
.tw-stat-v.name { font-size: 16px; }

.hint {
  display: block;
  font-size: 12px;
  color: var(--twin-sub);
  line-height: 1.7;
  margin: 8px 0;
}

.tw-btn.block { margin-top: 8px; }

.btn-row { display: flex; gap: 12px; margin-top: 8px; }
.btn-row .tw-btn { flex: 1; }

.import-box {
  width: 100%;
  box-sizing: border-box;
  min-height: 96px;
  margin-top: 6px;
  padding: 10px 12px;
  font-size: 12px;
  color: var(--twin-ink);
  background: var(--twin-soft);
  border: 1px solid var(--twin-line);
  border-radius: 10px;
}

.hidden-input { display: none; }

.switch-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 4px 0; }
.switch-text { flex: 1; min-width: 0; }
.switch-title { display: block; font-size: 14px; font-weight: 600; color: var(--twin-ink); }
.switch-desc { display: block; font-size: 11px; color: var(--twin-sub); line-height: 1.7; margin-top: 4px; }
</style>
