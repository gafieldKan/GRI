<template>
  <view class="page">
    <PageHeader title="数据与设置" subtitle="你的孪生档案：可导出、可携带、由你掌控" />

    <!-- 档案概览 -->
    <view class="card">
      <PageHeader title="孪生档案" subtitle="gri-student-digital-twin · v1" />
      <view class="stat-row">
        <view class="stat-item">
          <text class="stat-value">{{ eventCount }}</text>
          <text class="stat-label">条经历</text>
        </view>
        <view class="stat-item">
          <text class="stat-value">{{ memoryCount }}</text>
          <text class="stat-label">条记忆</text>
        </view>
        <view class="stat-item">
          <text class="stat-value">{{ profileName }}</text>
          <text class="stat-label">身份</text>
        </view>
      </view>
      <text class="hint">
        档案只含**个人**部件：身份 + 状态 + 经历 + 记忆；世界（知识版图）来自共享本体，不随档案搬运。
      </text>
    </view>

    <!-- 导出 -->
    <view class="card">
      <PageHeader title="导出" subtitle="把孪生带走（JSON）" />
      <text class="hint">导出的档案不含任何密码/令牌等敏感信息（记忆已按隐私键守卫过滤）。</text>
      <button class="btn primary" :disabled="exporting" @click="onExport">
        {{ exporting ? '导出中…' : '导出孪生档案' }}
      </button>
    </view>

    <!-- 导入 -->
    <view class="card">
      <PageHeader title="导入" subtitle="合并一份档案（追加经历 + 更新身份）" />
      <text class="hint">
        导入为**合并**语义：按 时间+类别+标题 去重后追加经历，并按白名单更新人物画像；
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
        <button class="btn ghost" @click="onPickFile">选择文件</button>
        <button class="btn primary" :disabled="importing || !importText.trim()" @click="onImport">
          {{ importing ? '导入中…' : '导入档案' }}
        </button>
      </view>
      <input ref="fileInput" class="hidden-input" type="file" accept="application/json,.json" @change="onFileChange" />
    </view>

    <!-- 设置 -->
    <view class="card">
      <PageHeader title="设置" subtitle="本地偏好" />
      <view class="switch-row">
        <view class="switch-text">
          <text class="switch-title">自动记录学习行动</text>
          <text class="switch-desc">开启后，练习/上课等行动会自动写入你的经历时间线；关闭则不再自动记录（仅保留手动行动）。</text>
        </view>
        <switch :checked="twinStore.autoRecord" color="#4a6cf7" @change="onToggleAuto" />
      </view>
    </view>

    <view class="honest-note">
      <text class="honest-title">关于数据</text>
      <text class="honest-body">
        孪生镜像的是一个真实的人——档案里每一条都来自你自己的学习记录或你填写的资料。
        导出即复制，导入即合并，二者都不改变真源；你可以随时把档案带走。
      </text>
    </view>

    <view class="safe-area" />
  </view>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useTwinStore } from '@/store/twin'
import { useKnowledgeStore } from '@/store/knowledge'
import PageHeader from '@/components/ui/PageHeader.vue'

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
.page {
  min-height: 100vh;
  background: var(--color-bg-primary, #f7f8fa);
  padding-bottom: 40px;
}

.card {
  margin: 16px;
  background: #fff;
  border-radius: 16px;
  padding: 4px 16px 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  border: 1px solid var(--color-border, #e8e8f0);
}

.stat-row {
  display: flex;
  justify-content: space-around;
  padding: 8px 0 4px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: #4a6cf7;
}

.stat-label {
  font-size: 11px;
  color: var(--color-text-tertiary, #999);
}

.hint {
  display: block;
  font-size: 12px;
  color: var(--color-text-tertiary, #999);
  line-height: 1.6;
  margin: 8px 0;
}

.btn {
  margin-top: 8px;
  border-radius: 10px;
  font-size: 14px;
  line-height: 2.6;
  border: none;
}

.btn::after {
  border: none;
}

.btn.primary {
  color: #fff;
  background: #4a6cf7;
}

.btn.primary[disabled] {
  opacity: 0.5;
}

.btn.ghost {
  color: #4a6cf7;
  background: rgba(74, 108, 247, 0.1);
}

.btn-row {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

.btn-row .btn {
  flex: 1;
}

.import-box {
  width: 100%;
  box-sizing: border-box;
  min-height: 96px;
  margin-top: 6px;
  padding: 10px 12px;
  font-size: 12px;
  color: var(--color-text-secondary, #666);
  background: var(--color-bg-secondary, #f7f8fc);
  border: 1px solid var(--color-border, #e8e8f0);
  border-radius: 10px;
}

.hidden-input {
  display: none;
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
}

.switch-text {
  flex: 1;
  min-width: 0;
}

.switch-title {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary, #1a1a2e);
}

.switch-desc {
  display: block;
  font-size: 11px;
  color: var(--color-text-tertiary, #999);
  line-height: 1.6;
  margin-top: 4px;
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
