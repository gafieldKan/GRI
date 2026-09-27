<template>
  <view class="page">
    <PageHeader
      title="学科登峰"
      subtitle="每门学科都是一座山——从一年级到高三，一路登顶，峰外还有更远的风景"
      :actions="[{ label: '切换学科', handler: () => (showSubjectBar = !showSubjectBar) }]"
    />

    <!-- 学科切换条（六学科直达） -->
    <view class="subject-bar" v-if="showSubjectBar">
      <Chip
        v-for="s in knowledgeStore.subjectList"
        :key="s.id"
        :label="`${s.icon} ${s.name}`"
        color="gray"
        :variant="knowledgeStore.currentSubject === s.id ? 'filled' : 'outlined'"
        @click="switchSubject(s.id)"
      />
    </view>

    <!-- 山顶统计条：覆盖比重 + 版图规模（诚实口径页面明示） -->
    <view class="stats-bar" v-if="stats.total > 0">
      <view class="stat-chip">
        <text class="stat-value">{{ coveragePct }}%</text>
        <text class="stat-label">K12 覆盖比</text>
      </view>
      <view class="stat-chip">
        <text class="stat-value">{{ stats.k12 }}</text>
        <text class="stat-label">已学知识域</text>
      </view>
      <view class="stat-chip">
        <text class="stat-value">{{ stats.frontier }}</text>
        <text class="stat-label">峰外地带</text>
      </view>
      <view class="stat-chip">
        <text class="stat-value">{{ stats.total }}</text>
        <text class="stat-label">学科全图</text>
      </view>
    </view>
    <view class="method-note" v-if="stats.total > 0">
      <text>覆盖比 = K12 知识域 ÷ 学科全图（按版图节点粒度估算的近似值）</text>
    </view>

    <view class="map-body">
      <!-- 载入中 -->
      <LoadingSkeleton v-if="knowledgeStore.loading" />

      <!-- 空态：版图未灌库或接口失败 -->
      <EmptyState
        v-else-if="!stats.total"
        icon="🏔"
        title="该学科版图尚未就绪"
        description="版图数据由教研侧审核后灌库——换一门学科看看，或稍后再来"
      />

      <!-- 金字塔分层山体：G1 底层 → G12 顶峰 → 云上远峰（frontier） -->
      <view v-else class="mountain">
        <!-- 峰外地带（云上远峰：渲染在最上，云雾样式） -->
        <view class="cloud-zone" v-if="frontierAreas.length">
          <view class="zone-label">
            <text>☁️ 峰外地带 · K12 之后</text>
          </view>
          <view class="zone-areas">
            <view
              v-for="a in frontierAreas"
              :key="a.code"
              class="area-chip area-frontier"
              @click="openDetail(a)"
            >
              <text>{{ a.name }}</text>
            </view>
          </view>
        </view>

        <!-- K12 山体：G12 顶峰在顶 → G1 底层在底（登高自下而上） -->
        <view
          v-for="layer in layers"
          :key="layer.grade"
          class="mountain-layer"
          :class="layerState(layer.grade)"
        >
          <view class="layer-head">
            <text class="layer-grade">{{ gradeName(layer.grade) }}</text>
            <text class="layer-count">{{ layer.areas.length }} 个知识域</text>
          </view>
          <view class="layer-areas">
            <view
              v-for="a in layer.areas"
              :key="a.code"
              class="area-chip"
              :class="`area-${layerState(layer.grade)}`"
              :style="areaMasteryStyle(a)"
              @click="openDetail(a)"
            >
              <text class="area-flag" v-if="layerState(layer.grade) === 'passed'">✔</text>
              <text class="area-flag" v-else-if="layerState(layer.grade) === 'current'">📍</text>
              <text>{{ a.name }}</text>
            </view>
          </view>
        </view>

        <!-- 山脚注：登峰即打卡——每层都是一段学途 -->
        <view class="base-note">
          <text>🚩 {{ knowledgeStore.subjectInfo?.name }}之山 · 由 {{ gradeName(1) }} 起步，{{ gradeName(12) }} 登顶</text>
        </view>
      </view>
    </view>

    <!-- 营地详情弹层 -->
    <view class="detail-mask" v-if="detailArea" @click="detailArea = null">
      <view class="detail-card" @click.stop>
        <view class="detail-head">
          <text class="detail-title">{{ detailArea.name }}</text>
          <text class="detail-close" @click="detailArea = null">✕</text>
        </view>
        <text class="detail-desc" v-if="detailArea.description">{{ detailArea.description }}</text>
        <view class="detail-rows">
          <view class="detail-row" v-if="detailArea.scope === 'k12'">
            <text class="row-key">落位年级</text>
            <text class="row-val">{{ gradeName(detailArea.gradeLevel) }}</text>
          </view>
          <view class="detail-row" v-else>
            <text class="row-key">地带</text>
            <text class="row-val">峰外 · K12 之后的学科前沿</text>
          </view>
          <view class="detail-row">
            <text class="row-key">所属领域</text>
            <text class="row-val">{{ fieldName(detailArea.fieldCode) }}</text>
          </view>
          <view class="detail-row" v-if="detailArea.prerequisites && detailArea.prerequisites.length">
            <text class="row-key">前置</text>
            <text class="row-val">{{ prereqNames(detailArea).join(' → ') }}</text>
          </view>
          <view class="detail-row" v-if="detailArea.kpCount > 0">
            <text class="row-key">已入库知识点</text>
            <text class="row-val">{{ detailArea.kpCount }} 个（可在知识图谱页展开）</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useKnowledgeStore } from '@/store/knowledge'
import PageHeader from '@/components/ui/PageHeader.vue'
import Chip from '@/components/ui/Chip.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import LoadingSkeleton from '@/components/ui/LoadingSkeleton.vue'

const knowledgeStore = useKnowledgeStore()
const showSubjectBar = ref(true)
const detailArea = ref(null)

const GRADE_NAMES = {
  1: '一年级', 2: '二年级', 3: '三年级', 4: '四年级', 5: '五年级', 6: '六年级',
  7: '七年级', 8: '八年级', 9: '九年级', 10: '高一', 11: '高二', 12: '高三'
}
const gradeName = (g) => GRADE_NAMES[g] ?? `G${g}`

const stats = computed(() => knowledgeStore.mapData.stats || { total: 0, k12: 0, frontier: 0, coverageRatio: 0, byGrade: {} })
const coveragePct = computed(() => Math.round((stats.value.coverageRatio || 0) * 100))
const frontierAreas = computed(() => (knowledgeStore.mapData.areas || []).filter((a) => a.scope === 'frontier'))

// 山体分层：G1 → G12（渲染时 G12 在顶；无节点年级也保留薄层，山的连续性）
const layers = computed(() => {
  const k12 = (knowledgeStore.mapData.areas || []).filter((a) => a.scope === 'k12')
  const byGrade = {}
  for (let g = 1; g <= 12; g++) byGrade[g] = []
  for (const a of k12) {
    if (a.gradeLevel && byGrade[a.gradeLevel]) byGrade[a.gradeLevel].push(a)
  }
  return Object.entries(byGrade)
    .map(([g, areas]) => ({ grade: Number(g), areas }))
    .sort((x, y) => y.grade - x.grade) // G12 顶峰在前（页面顶部）
})

// 打卡态：已过=亮 / 在学=闪 / 未至=暗
function layerState(grade) {
  const me = knowledgeStore.currentGrade
  if (grade < me) return 'passed'
  if (grade === me) return 'current'
  return 'ahead'
}

// 有掌握度数据的营地按均值着色（绿意深浅 = 掌握高低）
function areaMasteryStyle(a) {
  if (a.mastery == null || a.scope !== 'k12') return ''
  const alpha = Math.max(0.12, Math.min(a.mastery / 100, 0.85))
  return `background: rgba(82, 196, 26, ${alpha.toFixed(2)}); color: ${alpha > 0.5 ? '#fff' : 'inherit'};`
}

function fieldName(fieldCode) {
  const f = (knowledgeStore.mapData.fields || []).find((x) => x.code === fieldCode)
  return f ? f.name : '—'
}

function prereqNames(area) {
  const byCode = new Map((knowledgeStore.mapData.areas || []).map((a) => [a.code, a]))
  return (area.prerequisites || []).map((c) => byCode.get(c)?.name ?? c)
}

function openDetail(a) {
  detailArea.value = a
}

function switchSubject(subj) {
  knowledgeStore.setSubject(subj)
  loadMap(subj)
}

async function loadMap(subj) {
  await knowledgeStore.loadKnowledgeMap(subj || knowledgeStore.currentSubject)
}

onMounted(async () => {
  await knowledgeStore.loadCatalog()
  loadMap()
})

// 页面再现（tab/返回）时刷新版图（登录态可能变化 → 掌握度叠加）
onShow(() => {
  if (knowledgeStore.mapData?.stats?.total) loadMap()
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: var(--color-bg-primary, #f7f8fa);
}

.subject-bar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-xs, 8rpx);
  padding: var(--spacing-sm, 16rpx);
  background: var(--color-bg-card, #fff);
  border-bottom: 1px solid var(--color-border, #e8e8f0);
}

.stats-bar {
  display: flex;
  padding: var(--spacing-sm, 16rpx);
  gap: var(--spacing-xs, 8rpx);
}

.stat-chip {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--spacing-sm, 16rpx) var(--spacing-xs, 8rpx);
  background: var(--color-bg-card, #fff);
  border-radius: var(--radius-md, 12rpx);
  box-shadow: var(--shadow-sm, 0 2rpx 8rpx rgba(0, 0, 0, 0.06));
}

.stat-value {
  font-size: 40rpx;
  font-weight: 700;
  color: var(--color-primary, #1B7A3D);
}

.stat-label {
  font-size: 22rpx;
  color: var(--color-text-secondary, #5F6B65);
  margin-top: 4rpx;
}

.method-note {
  padding: 0 var(--spacing-sm, 16rpx) var(--spacing-sm, 16rpx);
  font-size: 22rpx;
  color: var(--color-text-tertiary, #999);
}

.map-body {
  padding: var(--spacing-sm, 16rpx);
}

/* ── 山体 ── */
.mountain {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm, 16rpx);
}

/* 云上远峰：frontier 域 */
.cloud-zone {
  padding: var(--spacing-md, 24rpx) var(--spacing-sm, 16rpx);
  background: linear-gradient(180deg, rgba(24, 144, 255, 0.08), rgba(24, 144, 255, 0.02));
  border: 2rpx dashed rgba(24, 144, 255, 0.35);
  border-radius: var(--radius-lg, 16rpx);
}

.zone-label {
  font-size: 24rpx;
  color: var(--color-secondary, #1890ff);
  margin-bottom: var(--spacing-sm, 16rpx);
}

.zone-areas,
.layer-areas {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-xs, 8rpx);
}

.area-chip {
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
  padding: 10rpx 18rpx;
  border-radius: var(--radius-round, 9999rpx);
  font-size: 24rpx;
  border: 1px solid var(--color-border, #e8e8f0);
  background: var(--color-bg-card, #fff);
  transition: all 0.15s ease;
}

.area-frontier {
  border-style: dashed;
  color: var(--color-secondary, #1890ff);
  background: transparent;
}

/* 分层：金字塔宽窄（顶层窄底层宽） */
.mountain-layer {
  padding: var(--spacing-sm, 16rpx);
  background: var(--color-bg-card, #fff);
  border-radius: var(--radius-md, 12rpx);
  box-shadow: var(--shadow-sm, 0 2rpx 8rpx rgba(0, 0, 0, 0.06));
}

.layer-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: var(--spacing-xs, 8rpx);
}

.layer-grade {
  font-size: 26rpx;
  font-weight: 700;
  color: var(--color-text-primary, #1A1A2E);
}

.layer-count {
  font-size: 20rpx;
  color: var(--color-text-tertiary, #999);
}

/* 打卡三态 */
.mountain-layer.passed {
  border-left: 6rpx solid var(--color-success, #52c41a);
}

.mountain-layer.current {
  border-left: 6rpx solid var(--color-primary, #1B7A3D);
  box-shadow: 0 0 0 4rpx rgba(27, 122, 61, 0.12);
}

.mountain-layer.ahead {
  border-left: 6rpx solid var(--color-border, #e8e8f0);
  opacity: 0.75;
}

.area-passed {
  background: var(--color-success-light, #e6ffe6);
  border-color: var(--color-success, #52c41a);
}

.area-current {
  background: var(--color-primary-light, #e6f4ec);
  border-color: var(--color-primary, #1B7A3D);
  font-weight: 600;
}

.area-ahead {
  background: var(--color-bg-secondary, #f8f8f8);
}

.area-flag {
  font-size: 20rpx;
}

.base-note {
  text-align: center;
  font-size: 22rpx;
  color: var(--color-text-tertiary, #999);
  padding: var(--spacing-sm, 16rpx) 0;
}

/* ── 详情弹层 ── */
.detail-mask {
  position: fixed;
  inset: 0;
  background: var(--color-bg-overlay, rgba(0, 0, 0, 0.5));
  display: flex;
  align-items: flex-end;
  z-index: 100;
}

.detail-card {
  width: 100%;
  max-height: 70vh;
  padding: var(--spacing-lg, 32rpx);
  background: var(--color-bg-card, #fff);
  border-radius: var(--radius-2xl, 32rpx) var(--radius-2xl, 32rpx) 0 0;
  box-sizing: border-box;
}

.detail-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-sm, 16rpx);
}

.detail-title {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--color-text-primary, #1A1A2E);
}

.detail-close {
  font-size: 32rpx;
  color: var(--color-text-tertiary, #999);
  padding: var(--spacing-xs, 8rpx);
}

.detail-desc {
  display: block;
  font-size: 26rpx;
  color: var(--color-text-secondary, #5F6B65);
  margin-bottom: var(--spacing-md, 24rpx);
}

.detail-rows {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm, 16rpx);
}

.detail-row {
  display: flex;
  gap: var(--spacing-sm, 16rpx);
  font-size: 26rpx;
}

.row-key {
  flex-shrink: 0;
  width: 160rpx;
  color: var(--color-text-tertiary, #999);
}

.row-val {
  color: var(--color-text-primary, #1A1A2E);
}
</style>
