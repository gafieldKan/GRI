<template>
  <view class="org-twin-page">
    <view class="ot-container">
      <!-- ── 顶部 ── -->
      <view class="ot-head">
        <button class="ot-back" aria-label="回到人本世界" @click="back">‹ 回到世界</button>
        <BrandMark size="sm" variant="brand" :show-wordmark="false" />
      </view>

      <view v-if="loading" class="ot-state">
        <text class="ot-state-text">正在读取组织…</text>
      </view>

      <view v-else-if="error" class="ot-state is-error" role="alert">
        <text class="ot-state-title">{{ error }}</text>
        <text class="ot-state-text">组织归属以身份域为准；回世界后稍后再试。</text>
      </view>

      <template v-else>
        <!-- ── 组织摘要（W1 /api/organizations/mine 真源）── -->
        <view class="ot-card">
          <view class="ot-mark" :class="markClass">
            <text class="ot-mark-text">{{ initial }}</text>
          </view>
          <view class="ot-body">
            <view class="ot-title-row">
              <text class="ot-name">{{ org.name }}</text>
              <text class="ot-type">{{ typeLabel }}</text>
            </view>
            <view class="ot-meta">
              <text class="ot-role">我的角色：{{ roleLabel }}</text>
              <text v-if="parentName" class="ot-parent">隶属 {{ parentName }}</text>
            </view>
            <view v-if="tags.length" class="ot-tags">
              <text v-for="tag in tags" :key="tag" class="ot-tag">{{ tag }}</text>
            </view>
          </view>
        </view>

        <!-- ── 孪生框架草案（占位；本体后续期）── -->
        <view class="ot-placeholder" role="note">
          <view class="ot-ph-head">
            <text class="ot-ph-title">组织孪生 · 建设中</text>
            <text class="ot-ph-badge">本体后续期</text>
          </view>
          <text class="ot-ph-text">
            组织孪生不是组织树，也不是人的孪生镜像——它描述组织自身的状态与能力。
            组织本体（组织 / 成员 / 类型）已在人本世界内核落地；孪生面与资质验证随后续期接入。
          </text>
        </view>

        <view class="ot-facets">
          <view v-for="face in facets" :key="face.code" class="ot-facet">
            <text class="ot-facet-name">{{ face.name }}</text>
            <text class="ot-facet-desc">{{ face.desc }}</text>
            <text class="ot-facet-state">待建</text>
          </view>
        </view>

        <view class="ot-foot">
          <text class="ot-foot-text">
            口径：本页只呈现 {{ orgSource }} 的静态摘要；不写入、不派生任何状态。
          </text>
        </view>
      </template>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import BrandMark from '@/components/ui/BrandMark.vue'
import { myOrganizations } from '@/api'
import { stableHash } from '@world-art'
import { orgTypeLabel, orgRoleLabel } from '@/utils/persona'

/**
 * 孪生面草案（对齐 PERSONA_WORLD_LANDING_PLAN §11.3）。
 * 六面均为占位：不落库、不取数、不展示未有的状态。
 */
const facets = [
  { code: 'identity', name: '身份面', desc: '组织是谁：名称、类型、成立与沿革（本体已备）' },
  { code: 'relations', name: '关系面', desc: '与其它组织的关系（隶属/合作）——关系是组织的属性' },
  { code: 'members', name: '成员面', desc: '成员与角色分布（本体已备 org_member）' },
  { code: 'resources', name: '资源面', desc: '组织可支配的资源清册' },
  { code: 'capabilities', name: '能力面', desc: '组织能提供什么、能承接什么' },
  { code: 'state', name: '状态面', desc: '组织当前运行状态（不含经历与记忆——那是人的）' }
]

const orgId = ref('')
const orgs = ref([])
const loading = ref(true)
const error = ref('')

onLoad((query) => {
  orgId.value = query?.id ? decodeURIComponent(query.id) : ''
  load()
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await myOrganizations()
    orgs.value = Array.isArray(data) ? data : []
    if (orgId.value && !orgs.value.some((o) => o.id === orgId.value)) {
      error.value = '找不到这个组织归属'
    }
  } catch (e) {
    error.value = e?.message || '组织信息暂不可用'
  } finally {
    loading.value = false
  }
}

const org = computed(
  () => orgs.value.find((o) => o.id === orgId.value) || { id: '', name: '未知组织', type: '', role: '', tags: [] }
)

const typeLabel = computed(() => orgTypeLabel(org.value.type))
const roleLabel = computed(() => orgRoleLabel(org.value.role))
const initial = computed(() => (org.value.name || '组').trim().slice(0, 1))
const markClass = computed(() => `ot-mark-${(stableHash(org.value.id || org.value.name) % 4) + 1}`)
const tags = computed(() => (Array.isArray(org.value.tags) ? org.value.tags.filter(Boolean) : []))
const orgSource = computed(() => 'GET /api/organizations/mine')

/** 上级组织名（同一份 mine 列表内解析；取不到就留空，不臆造）。 */
const parentName = computed(() => {
  const pid = org.value.parentId
  if (!pid) return ''
  return orgs.value.find((o) => o.id === pid)?.name || ''
})

function back() {
  uni.navigateBack({
    fail: () => uni.reLaunch({ url: '/pages/world/index' })
  })
}
</script>

<style scoped>
.org-twin-page {
  min-height: 100vh;
  padding: var(--spacing-md);
  background: var(--color-bg-primary);
  box-sizing: border-box;
}

.ot-container {
  max-width: 960px;
  margin: 0 auto;
}

/* ── 顶部 ── */
.ot-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-md);
}

.ot-back {
  padding: 10rpx 24rpx;
  border: 1px solid var(--world-node-border);
  border-radius: var(--radius-round);
  background: var(--world-panel);
  color: var(--world-node-text);
  font-size: var(--font-size-sm);
  line-height: 1.5;
}

.ot-back::after {
  border: none;
}

/* ── 状态 ── */
.ot-state {
  padding: var(--spacing-xl);
  border: 1px solid var(--world-node-border);
  border-radius: var(--radius-xl);
  background: var(--world-panel);
  text-align: center;
}

.ot-state.is-error {
  border-color: var(--color-danger);
  background: var(--color-danger-light);
}

.ot-state-title {
  display: block;
  color: var(--color-danger);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
}

.ot-state-text {
  display: block;
  margin-top: var(--spacing-sm);
  color: var(--world-node-sub);
  font-size: var(--font-size-sm);
}

/* ── 摘要卡 ── */
.ot-card {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-lg);
  border: 1px solid var(--world-node-border);
  border-radius: var(--radius-2xl);
  background: var(--world-panel);
  box-shadow: var(--shadow-card);
}

.ot-mark {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 120rpx;
  height: 120rpx;
  border-radius: var(--radius-xl);
}

.ot-mark-text {
  color: var(--world-node-on-text);
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
}

.ot-mark-1 { background: var(--world-wear-1); }
.ot-mark-2 { background: var(--world-wear-2); }
.ot-mark-3 { background: var(--world-wear-3); }
.ot-mark-4 { background: var(--world-wear-4); }

.ot-body {
  min-width: 0;
}

.ot-title-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}

.ot-name {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  color: var(--world-node-text);
}

.ot-type {
  padding: 2rpx 14rpx;
  border: 1px solid var(--world-node-border);
  border-radius: var(--radius-round);
  background: var(--world-node-bg);
  color: var(--world-node-sub);
  font-size: var(--font-size-xs);
}

.ot-meta {
  display: flex;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
  margin-top: 6rpx;
}

.ot-role,
.ot-parent {
  color: var(--world-node-sub);
  font-size: var(--font-size-xs);
}

.ot-tags {
  display: flex;
  gap: 8rpx;
  flex-wrap: wrap;
  margin-top: 8rpx;
}

.ot-tag {
  padding: 2rpx 12rpx;
  border-radius: var(--radius-round);
  background: var(--world-node-on-bg);
  color: var(--world-node-on-text);
  font-size: var(--font-size-xs);
}

/* ── 占位说明 ── */
.ot-placeholder {
  margin-top: var(--spacing-lg);
  padding: var(--spacing-lg);
  border: 1px dashed var(--world-node-border);
  border-radius: var(--radius-xl);
  background: var(--world-panel);
}

.ot-ph-head {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.ot-ph-title {
  color: var(--world-node-text);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
}

.ot-ph-badge {
  padding: 2rpx 14rpx;
  border-radius: var(--radius-round);
  background: var(--world-sign-warm);
  color: var(--world-node-on-text);
  font-size: var(--font-size-xs);
}

.ot-ph-text {
  display: block;
  margin-top: var(--spacing-sm);
  color: var(--world-node-sub);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-base);
}

/* ── 六面 ── */
.ot-facets {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--spacing-md);
  margin-top: var(--spacing-md);
}

.ot-facet {
  position: relative;
  padding: var(--spacing-md);
  border: 1px solid var(--world-node-border);
  border-radius: var(--radius-xl);
  background: var(--world-panel);
}

.ot-facet-name {
  display: block;
  color: var(--world-node-text);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
}

.ot-facet-desc {
  display: block;
  margin-top: 6rpx;
  color: var(--world-node-sub);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-base);
}

.ot-facet-state {
  display: inline-block;
  margin-top: var(--spacing-sm);
  padding: 2rpx 12rpx;
  border-radius: var(--radius-round);
  background: var(--world-node-bg);
  border: 1px solid var(--world-node-border);
  color: var(--world-node-sub);
  font-size: var(--font-size-xs);
}

/* ── 页脚口径 ── */
.ot-foot {
  margin-top: var(--spacing-lg);
  padding-top: var(--spacing-md);
  border-top: 1px solid var(--world-panel-edge);
}

.ot-foot-text {
  color: var(--world-node-sub);
  font-size: var(--font-size-xs);
}

@media (min-width: 760px) {
  .org-twin-page {
    padding: var(--spacing-xl);
  }
}
</style>
