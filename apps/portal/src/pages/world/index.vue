<template>
  <view class="world-page">
    <view class="wp-container">
      <!-- ── 顶栏：身份 + 世界之外的出口 ── -->
      <view class="wp-header">
        <view class="wp-head-main">
          <BrandMark size="md" variant="brand" :show-wordmark="false" />
          <view class="wp-ident">
            <text class="wp-kicker">GRI 人本世界</text>
            <text class="wp-title">{{ displayName }}</text>
            <view class="wp-meta">
              <text class="wp-role">{{ roleLabel }}</text>
              <text v-if="entityId" class="wp-id">人物 {{ shortId }}</text>
            </view>
          </view>
        </view>

        <view class="wp-actions">
          <!-- 运营后台：独立入口，留在世界之外（世界内不出现运营模块） -->
          <button
            v-for="tool in consoleModules"
            :key="tool.code"
            class="wp-btn is-console"
            :data-console="tool.code"
            @click="openConsole(tool)"
          >
            {{ tool.code === 'org-admin' ? '运营后台' : tool.name }}
          </button>
          <button class="wp-btn" :disabled="loggingOut" @click="handleLogout">
            {{ loggingOut ? '退出中' : '退出登录' }}
          </button>
        </view>
      </view>

      <!-- ── 降级告警（按来源分别说明）── -->
      <view v-if="degradedNotes.length" class="wp-alert" role="alert">
        <text class="wp-alert-title">部分数据未取到</text>
        <text v-for="note in degradedNotes" :key="note" class="wp-alert-line">{{ note }}</text>
      </view>

      <!-- ── 人物卡 ── -->
      <PersonaCard
        class="wp-block"
        :profile="profile"
        :context="context?.twin"
        :overview="overview"
        :loading="loading"
      />

      <!-- ── 生活全景 ── -->
      <view class="wp-block">
        <LifeWorld
          :scenes="scenes"
          :open-codes="openCodes"
          :profile="profile"
          :active-code="activeSceneCode"
          :person-scene="personScene"
          :pending="loading"
          :degraded="worldFailed"
          @pick="openScene"
        />
      </view>

      <!-- ── 组织 / 常去的地方 ── -->
      <view class="wp-cols wp-block">
        <!-- 我的组织：静态摘要入口卡 → 组织孪生占位页 -->
        <view class="wp-col">
          <view class="wp-section-head">
            <text class="wp-section-title">我的组织</text>
            <text class="wp-section-count">{{ orgs.length }}</text>
          </view>

          <view v-if="orgs.length" class="wp-orgs">
            <OrgCard
              v-for="org in orgs"
              :key="org.id"
              :org="org"
              :parent-name="parentNameOf(org)"
              @open="openOrgTwin"
            />
          </view>
          <view v-else class="wp-empty">
            <text class="wp-empty-text">
              {{ orgsFailed ? '组织归属暂不可用' : '还没有组织归属——建一个组织，或等一份邀请' }}
            </text>
          </view>
        </view>

        <!-- 常去的地方：原工作台模块卡的并入形态 -->
        <view class="wp-col">
          <view class="wp-section-head">
            <text class="wp-section-title">常去的地方</text>
            <text class="wp-section-count">{{ places.length }}</text>
            <text v-if="moduleLoading" class="wp-section-note" aria-live="polite">更新中…</text>
          </view>
          <text class="wp-section-desc">从场景进去更自然；这里是你的常去清单</text>

          <view class="wp-scope">
            <picker
              class="wp-picker"
              :range="regionLabels"
              :value="regionIndex"
              :disabled="moduleLoading"
              @change="handleRegionChange"
            >
              <view class="wp-field">
                <text class="wp-field-label">区域</text>
                <text class="wp-field-value">{{ selectedRegionLabel }}</text>
              </view>
            </picker>
            <picker
              class="wp-picker"
              :range="industryLabels"
              :value="industryIndex"
              :disabled="moduleLoading"
              @change="handleIndustryChange"
            >
              <view class="wp-field">
                <text class="wp-field-label">行业</text>
                <text class="wp-field-value">{{ selectedIndustryLabel }}</text>
              </view>
            </picker>
            <button v-if="hasScopeFilter" class="wp-reset" :disabled="moduleLoading" @click="clearScopeFilters">
              重置
            </button>
          </view>

          <view v-if="places.length" class="wp-places">
            <view
              v-for="module in places"
              :key="module.code"
              class="wp-place"
              :class="{ 'is-gated': !module.entryUrl }"
              :data-place="module.code"
              role="button"
              :aria-label="module.entryUrl ? `走进${module.name}` : `${module.name} 即将接入`"
              @click="openPlace(module)"
            >
              <text class="wp-place-icon" aria-hidden="true">{{ module.icon || '·' }}</text>
              <view class="wp-place-copy">
                <text class="wp-place-name">{{ module.name }}</text>
                <text class="wp-place-desc">{{ module.short || module.description }}</text>
              </view>
              <text class="wp-place-verb">{{ module.entryUrl ? '走进' : '即将接入' }}</text>
            </view>
          </view>
          <view v-else class="wp-empty">
            <text class="wp-empty-text">
              {{ modulesFailed ? '模块目录暂不可用' : '当前身份暂无可用模块' }}
            </text>
          </view>

          <!-- 世界扩展：可选模块的开通 / 收起（原插件区并入） -->
          <template v-if="extensions.length">
            <view class="wp-section-head is-sub">
              <text class="wp-section-title">世界扩展</text>
              <text class="wp-section-count">{{ selectedCount }}</text>
            </view>
            <view class="wp-exts">
              <view v-for="module in extensions" :key="module.code" class="wp-ext">
                <view class="wp-ext-copy">
                  <text class="wp-ext-name">{{ module.name }}</text>
                  <text class="wp-ext-desc">{{ module.description }}</text>
                </view>
                <button
                  class="wp-ext-btn"
                  :class="{ 'is-on': module.selected }"
                  :disabled="pendingCode === module.code"
                  :data-ext="module.code"
                  @click="toggleModule(module)"
                >
                  {{ module.selected ? '已开通' : '开通' }}
                </button>
              </view>
            </view>
          </template>
        </view>
      </view>
    </view>

    <!-- ── 场景 → 意向 → 模块 ── -->
    <IntentSheet
      :scene="activeScene"
      :modules="modules"
      :pending-code="pendingCode"
      @close="closeScene"
      @open="openModule"
      @apply="toggleModule"
      @console="openConsole(consoleFirst)"
    />

    <!-- ── 过关式过场（同风格 + SSO 跳转）── -->
    <WorldTransition
      :open="transition.open"
      :label="transition.label"
      :from="transition.from"
      @go="runTransition"
    />
  </view>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import BrandMark from '@/components/ui/BrandMark.vue'
import PersonaCard from '@/components/world/PersonaCard.vue'
import LifeWorld from '@/components/world/LifeWorld.vue'
import OrgCard from '@/components/world/OrgCard.vue'
import IntentSheet from '@/components/world/IntentSheet.vue'
import WorldTransition from '@world-art/WorldTransition.vue'
import {
  activationContext,
  disableModule,
  enableModule,
  listModuleDimensions,
  listModules,
  myOrganizations,
  twinMe,
  worldScenes
} from '@/api'
import { useAuthStore } from '@gri/auth-client'
import { HOME_SCENE } from '@world-art'
import { roleLabel as toRoleLabel } from '@/utils/persona'

const auth = useAuthStore()
auth.restore()

/** 世界只收「生活/经营」类模块；运营与工具类留在世界之外的运营后台入口。 */
const WORLD_CATEGORIES = ['business']
const CONSOLE_CATEGORIES = ['admin', 'tool']

/**
 * 「走进模块」= 走进**该模块的世界**（W3 · N3/N5）。
 * 注册表给的 `entry_url` 是应用根（后端契约，不动）；模块世界的 app 内路由属于前端约定，
 * 只在这里补一段 hash 路由，并带 `from=world` 让模块侧承接开场过场（过关式不中断）。
 */
const MODULE_WORLD_ROUTES = { tutor: '/pages/twin/world' }

function moduleEntry(module) {
  const base = module?.entryUrl || ''
  if (!base || base.startsWith('/pages/')) return base
  const world = MODULE_WORLD_ROUTES[module.code]
  return world ? `${base}#${world}?from=world` : base
}

const context = ref(null)
const overview = ref(null)
const scenes = ref([])
const modules = ref([])
const orgs = ref([])
const dimensions = ref({ regions: [], industries: [] })

const loading = ref(true)
const moduleLoading = ref(false)
const loggingOut = ref(false)
const pendingCode = ref('')

const worldFailed = ref(false)
const modulesFailed = ref(false)
const orgsFailed = ref(false)
const twinsFailed = ref(false)

const activeSceneCode = ref('')
const personScene = ref(HOME_SCENE)

const selectedRegion = ref('')
const selectedIndustry = ref('')

const transition = reactive({ open: false, label: '', from: '', target: null })

/* ── 派生 ───────────────────────────────────────────── */

const displayName = computed(
  () => context.value?.profile?.name || context.value?.profile?.username || auth.user?.name || '已登录用户'
)
const entityId = computed(() => context.value?.twin?.entityId || context.value?.profile?.id || '')
const shortId = computed(() => (entityId.value ? entityId.value.slice(0, 8) : ''))
const roleLabel = computed(() => toRoleLabel(context.value?.profile?.role || auth.user?.role))

const profile = computed(() => context.value?.profile || auth.user || { id: entityId.value, name: displayName.value })

const byCategory = (cats) => modules.value.filter((m) => cats.includes(m.category))
const consoleModules = computed(() =>
  byCategory(CONSOLE_CATEGORIES).filter((m) => m.entryUrl && m.isCore)
)
const consoleFirst = computed(() => consoleModules.value[0] || null)

/** 现在就能走进的模块码：世界之内（业务类）+ 入口已接通。场景标签的「N 个去处」只认这个集合。 */
const openCodes = computed(() =>
  modules.value
    .filter((m) => WORLD_CATEGORIES.includes(m.category) && m.entryUrl)
    .map((m) => m.code)
)

const places = computed(() =>
  byCategory(WORLD_CATEGORIES).filter((m) => m.isCore || m.selected)
)
const extensions = computed(() => byCategory(WORLD_CATEGORIES).filter((m) => !m.isCore))
const selectedCount = computed(() => extensions.value.filter((m) => m.selected).length)

const activeScene = computed(() => scenes.value.find((s) => s.code === activeSceneCode.value) || null)

const regionLabels = computed(() => dimensions.value.regions.map((r) => r.name))
const industryLabels = computed(() => dimensions.value.industries.map((i) => i.name))
const regionIndex = computed(() => dimensions.value.regions.findIndex((r) => r.nodeId === selectedRegion.value))
const industryIndex = computed(() => dimensions.value.industries.findIndex((i) => i.code === selectedIndustry.value))
const selectedRegionLabel = computed(
  () => dimensions.value.regions.find((r) => r.nodeId === selectedRegion.value)?.name || '全部区域'
)
const selectedIndustryLabel = computed(
  () => dimensions.value.industries.find((i) => i.code === selectedIndustry.value)?.name || '全部行业'
)
const hasScopeFilter = computed(() => Boolean(selectedRegion.value || selectedIndustry.value))

/** 降级清单：哪个源断了就说哪个源（不把「空」当成「断」）。 */
const degradedNotes = computed(() => {
  const notes = []
  if (worldFailed.value) notes.push('生活场景（GET /api/world）未取到——全景暂时是空世界')
  if (!context.value) notes.push('人物上下文（GET /api/context/me）未取到——身份与权限以本地登录态为准')
  if (modulesFailed.value) notes.push('模块目录（GET /api/modules）未取到——常去的地方暂时为空')
  if (orgsFailed.value) notes.push('组织归属（GET /api/organizations/mine）未取到——我的组织暂时为空')
  if (twinsFailed.value) notes.push('孪生状态（GET /api/twin/me）未取到——状态环与经历暂缺')
  return notes
})

/* ── 载入 ───────────────────────────────────────────── */

function parentNameOf(org) {
  if (!org?.parentId) return ''
  return orgs.value.find((o) => o.id === org.parentId)?.name || ''
}

async function loadModules(options = {}) {
  moduleLoading.value = true
  try {
    const params = {}
    if (selectedRegion.value) params.region = selectedRegion.value
    if (selectedIndustry.value) params.industry = selectedIndustry.value
    const data = await listModules(params)
    modules.value = Array.isArray(data) ? data : []
    modulesFailed.value = false
  } catch (e) {
    modulesFailed.value = true
    if (!options.silent) {
      uni.showToast({ title: e?.message || '模块目录加载失败', icon: 'none' })
    }
  } finally {
    moduleLoading.value = false
  }
}

let requestId = 0

async function loadWorld() {
  const rid = ++requestId
  loading.value = true

  const [ctxRes, worldRes, orgRes, twinRes, dimRes] = await Promise.allSettled([
    activationContext(),
    worldScenes(),
    myOrganizations(),
    twinMe(),
    listModuleDimensions()
  ])

  if (rid !== requestId) return

  context.value = ctxRes.status === 'fulfilled' ? ctxRes.value : null

  if (worldRes.status === 'fulfilled') {
    const list = worldRes.value?.scenes
    scenes.value = Array.isArray(list) ? list : []
    worldFailed.value = false
  } else {
    scenes.value = []
    worldFailed.value = true
  }

  if (orgRes.status === 'fulfilled') {
    orgs.value = Array.isArray(orgRes.value) ? orgRes.value : []
    orgsFailed.value = false
  } else if (Array.isArray(context.value?.orgs)) {
    // 同一真源的降级路径：个人上下文里也带组织归属（W1 同源）
    orgs.value = context.value.orgs
    orgsFailed.value = false
  } else {
    orgs.value = []
    orgsFailed.value = true
  }

  if (twinRes.status === 'fulfilled') {
    overview.value = twinRes.value
    twinsFailed.value = false
  } else {
    overview.value = null
    twinsFailed.value = true
  }

  dimensions.value = dimRes.status === 'fulfilled'
    ? {
        regions: Array.isArray(dimRes.value?.regions) ? dimRes.value.regions : [],
        industries: Array.isArray(dimRes.value?.industries) ? dimRes.value.industries : []
      }
    : { regions: [], industries: [] }

  await loadModules({ silent: true })

  if (rid === requestId) loading.value = false
}

/* ── 场景 / 意向 ────────────────────────────────────── */

function openScene(scene) {
  if (!scene) return
  activeSceneCode.value = scene.code
  // 人物随你走进场景（纯视图态：世界位置不落库，不造状态真源）
  personScene.value = scene.code
}

function closeScene() {
  activeSceneCode.value = ''
}

function openConsole(module) {
  if (!module) {
    uni.showToast({ title: '运营后台暂不可用', icon: 'none' })
    return
  }
  openModule(module)
}

/* ── 走进模块（过关式：先过场，再交接导航）──────────────── */

function openPlace(module) {
  if (!module?.entryUrl) {
    uni.showToast({ title: '模块正在接入', icon: 'none' })
    return
  }
  openModule(module)
}

function openModule(module) {
  if (!module?.entryUrl) {
    uni.showToast({ title: '模块正在接入', icon: 'none' })
    return
  }
  transition.target = module
  transition.label = module.name
  transition.from = activeScene.value?.name || '生活全景'
  transition.open = true
}

function runTransition() {
  const module = transition.target
  transition.open = false
  if (!module?.entryUrl) return

  const entry = moduleEntry(module)
  // 让过场先卸下（H5 下 navigateTo 会把旧页面留在下层，fixed 幕布会挡住新页面）
  setTimeout(() => {
    if (entry.startsWith('/pages/')) {
      uni.navigateTo({
        url: entry,
        fail: () => uni.reLaunch({ url: entry })
      })
      return
    }
    if (typeof window !== 'undefined') {
      // 同源 SSO：令牌已在本地存储，直接跳即免二登
      window.location.assign(entry)
      return
    }
    uni.showToast({ title: '当前端暂不支持该入口', icon: 'none' })
  }, 60)
}

/* ── 模块开通 / 收起 ───────────────────────────────── */

async function toggleModule(module) {
  if (!module?.code || pendingCode.value) return
  const next = !module.selected
  pendingCode.value = module.code
  try {
    const result = next ? await enableModule(module.code) : await disableModule(module.code)
    const selected = typeof result?.selected === 'boolean' ? result.selected : next
    modules.value = modules.value.map((m) => (m.code === module.code ? { ...m, selected } : m))
    uni.showToast({ title: selected ? `${module.name} 已开通` : `${module.name} 已收起`, icon: 'none' })
  } catch (e) {
    uni.showToast({ title: e?.message || '模块状态更新失败', icon: 'none' })
  } finally {
    pendingCode.value = ''
  }
}

/* ── 作用域筛选 ────────────────────────────────────── */

function handleRegionChange(event) {
  const index = Number(event?.detail?.value)
  selectedRegion.value = dimensions.value.regions[index]?.nodeId || ''
  loadModules({ silent: true })
}

function handleIndustryChange(event) {
  const index = Number(event?.detail?.value)
  selectedIndustry.value = dimensions.value.industries[index]?.code || ''
  loadModules({ silent: true })
}

function clearScopeFilters() {
  selectedRegion.value = ''
  selectedIndustry.value = ''
  loadModules({ silent: true })
}

/* ── 组织孪生 / 退出 ───────────────────────────────── */

function openOrgTwin(org) {
  if (!org?.id) return
  uni.navigateTo({
    url: `/pages/org-twin/index?id=${encodeURIComponent(org.id)}`,
    fail: () => uni.showToast({ title: '组织孪生页暂不可用', icon: 'none' })
  })
}

async function handleLogout() {
  loggingOut.value = true
  try {
    await auth.logout()
  } finally {
    loggingOut.value = false
    uni.reLaunch({ url: '/pages/login/login' })
  }
}

/* ── 生命周期 ──────────────────────────────────────── */

onShow(() => {
  if (!auth.isAuthenticated) {
    uni.reLaunch({ url: '/pages/login/login' })
    return
  }
  loadWorld()
})

onPullDownRefresh(async () => {
  await loadWorld()
  uni.stopPullDownRefresh()
})
</script>

<style scoped>
.world-page {
  position: relative;
  min-height: 100vh;
  padding: var(--spacing-md);
  background: var(--color-bg-primary);
  box-sizing: border-box;
}

.wp-container {
  max-width: 1180px;
  margin: 0 auto;
}

.wp-block + .wp-block {
  margin-top: var(--spacing-md);
}

/* ── 顶栏 ── */
.wp-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-md);
  padding: var(--spacing-lg);
  margin-bottom: var(--spacing-md);
  border: 1px solid var(--world-node-border);
  border-radius: var(--radius-2xl);
  background: var(--world-panel);
  box-shadow: var(--shadow-card);
}

.wp-head-main {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  min-width: 0;
  flex: 1;
}

.wp-ident {
  min-width: 0;
  flex: 1;
}

.wp-kicker {
  display: block;
  font-size: var(--font-size-xs);
  letter-spacing: 0.16em;
  color: var(--world-node-sub);
}

.wp-title {
  display: block;
  overflow: hidden;
  margin-top: 2rpx;
  color: var(--world-node-text);
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-tight);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wp-meta {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-sm);
}

.wp-role {
  padding: 4rpx 16rpx;
  border-radius: var(--radius-round);
  background: var(--world-node-on-bg);
  color: var(--world-node-on-text);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
}

.wp-id {
  color: var(--world-node-sub);
  font-size: var(--font-size-xs);
  font-family: var(--font-mono, monospace);
}

.wp-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}

.wp-btn {
  flex: none;
  padding: 12rpx 28rpx;
  border: 1px solid var(--world-node-border);
  border-radius: var(--radius-round);
  background: var(--world-node-bg);
  color: var(--world-node-text);
  font-size: var(--font-size-sm);
  line-height: 1.4;
}

.wp-btn::after {
  border: none;
}

.wp-btn.is-console {
  border-color: var(--world-node-on-bg);
  background: var(--world-node-on-bg);
  color: var(--world-node-on-text);
}

.wp-btn:active {
  opacity: 0.85;
}

/* ── 降级告警 ── */
.wp-alert {
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-md);
  border: 1px solid var(--color-warning);
  border-radius: var(--radius-xl);
  background: var(--color-warning-light);
}

.wp-alert-title {
  display: block;
  color: var(--color-warning);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
}

.wp-alert-line {
  display: block;
  margin-top: 4rpx;
  color: var(--world-node-sub);
  font-size: var(--font-size-xs);
}

/* ── 两栏 ── */
.wp-cols {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--spacing-md);
}

.wp-col {
  min-width: 0;
}

.wp-section-head {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: 6rpx;
}

.wp-section-head.is-sub {
  margin-top: var(--spacing-lg);
}

.wp-section-title {
  color: var(--world-node-text);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
}

.wp-section-count {
  min-width: 40rpx;
  padding: 2rpx 12rpx;
  border-radius: var(--radius-round);
  background: var(--world-node-on-bg);
  color: var(--world-node-on-text);
  font-size: var(--font-size-xs);
  text-align: center;
}

.wp-section-note,
.wp-section-desc {
  color: var(--world-node-sub);
  font-size: var(--font-size-xs);
}

.wp-section-desc {
  display: block;
  margin-bottom: var(--spacing-sm);
}

/* ── 组织卡列表 ── */
.wp-orgs {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

/* ── 作用域 ── */
.wp-scope {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-sm);
}

.wp-picker {
  flex: 1;
  min-width: 0;
}

.wp-field {
  padding: 8rpx var(--spacing-md);
  border: 1px solid var(--world-node-border);
  border-radius: var(--radius-md);
  background: var(--world-node-bg);
}

.wp-field-label {
  display: block;
  color: var(--world-node-sub);
  font-size: var(--font-size-xs);
}

.wp-field-value {
  display: block;
  overflow: hidden;
  color: var(--world-node-text);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wp-reset {
  flex: none;
  padding: 8rpx 22rpx;
  border: 1px solid transparent;
  border-radius: var(--radius-round);
  background: var(--world-node-bg);
  color: var(--world-node-on-bg);
  font-size: var(--font-size-xs);
  line-height: 1.5;
}

.wp-reset::after {
  border: none;
}

/* ── 常去的地方 ── */
.wp-places {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.wp-place {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  border: 1px solid var(--world-node-border);
  border-radius: var(--radius-xl);
  background: var(--world-panel);
  cursor: pointer;
  transition: transform var(--transition-fast), border-color var(--transition-fast);
}

.wp-place:active {
  transform: translateY(2rpx);
}

.wp-place.is-gated {
  opacity: 0.7;
}

@media (hover: hover) {
  .wp-place:not(.is-gated):hover {
    border-color: var(--world-node-on-bg);
    box-shadow: var(--shadow-sm);
  }
}

.wp-place-icon {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64rpx;
  height: 64rpx;
  border-radius: var(--radius-lg);
  background: var(--world-node-bg);
  border: 1px solid var(--world-node-border);
  color: var(--world-node-text);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-bold);
}

.wp-place-copy {
  flex: 1;
  min-width: 0;
}

.wp-place-name {
  display: block;
  color: var(--world-node-text);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
}

.wp-place-desc {
  display: block;
  margin-top: 2rpx;
  color: var(--world-node-sub);
  font-size: var(--font-size-xs);
  overflow-wrap: anywhere;
}

.wp-place-verb {
  flex: none;
  color: var(--world-node-on-bg);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}

/* ── 世界扩展 ── */
.wp-exts {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.wp-ext {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid var(--world-node-border);
  border-radius: var(--radius-lg);
  background: var(--world-node-bg);
}

.wp-ext-copy {
  flex: 1;
  min-width: 0;
}

.wp-ext-name {
  display: block;
  color: var(--world-node-text);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}

.wp-ext-desc {
  display: block;
  margin-top: 2rpx;
  color: var(--world-node-sub);
  font-size: var(--font-size-xs);
  overflow-wrap: anywhere;
}

.wp-ext-btn {
  flex: none;
  padding: 6rpx 22rpx;
  border: 1px solid var(--world-node-on-bg);
  border-radius: var(--radius-round);
  background: var(--world-panel);
  color: var(--world-node-on-bg);
  font-size: var(--font-size-xs);
  line-height: 1.5;
}

.wp-ext-btn::after {
  border: none;
}

.wp-ext-btn.is-on {
  background: var(--world-node-on-bg);
  color: var(--world-node-on-text);
}

/* ── 空态 ── */
.wp-empty {
  padding: var(--spacing-lg);
  border: 1px dashed var(--world-node-border);
  border-radius: var(--radius-xl);
  background: var(--world-panel);
  text-align: center;
}

.wp-empty-text {
  color: var(--world-node-sub);
  font-size: var(--font-size-sm);
}

/* ── 移动端：单列 ── */
@media (max-width: 900px) {
  .wp-cols {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 720px) {
  .wp-header {
    flex-direction: column;
    align-items: stretch;
  }

  .wp-actions {
    width: 100%;
  }

  .wp-btn {
    flex: 1;
  }

  .wp-scope {
    flex-wrap: wrap;
  }

  .wp-picker {
    flex: 1 1 100%;
  }
}

@media (min-width: 760px) {
  .world-page {
    padding: var(--spacing-xl);
  }
}
</style>
