<template>
  <view class="workbench-page">
    <view class="wb-ambient" aria-hidden="true" />

    <view class="wb-container">
      <!-- ── 顶栏：品牌 + 身份 ── -->
      <view class="wb-header">
        <view class="wb-head-main">
          <BrandMark size="md" variant="brand" :show-wordmark="false" />
          <view class="identity-block">
            <text class="workbench-kicker">GRI 统一工作台</text>
            <text class="workbench-title">{{ displayName }}</text>
            <view class="identity-meta">
              <text class="role-pill">{{ roleLabel }}</text>
              <text v-if="auth.externalId" class="identity-id">{{ auth.externalId }}</text>
            </view>
          </view>
        </view>
        <button class="logout-btn" :disabled="loggingOut" @click="handleLogout">
          {{ loggingOut ? '退出中' : '退出登录' }}
        </button>
      </view>

      <!-- ── 加载骨架 ── -->
      <view v-if="loading" class="wb-skeleton" aria-busy="true" aria-live="polite">
        <text class="skeleton-hint">正在加载工作台…</text>
        <view class="skeleton-toolbar" />
        <view class="skeleton-grid">
          <view v-for="n in 3" :key="n" class="skeleton-card" />
        </view>
      </view>

      <!-- ── 错误态 ── -->
      <view v-else-if="error" class="workbench-state error-state" role="alert">
        <text class="state-icon" aria-hidden="true">⚠</text>
        <text class="state-text">{{ error }}</text>
        <button class="retry-btn" @click="loadIdentity">重试</button>
      </view>

      <template v-else>
        <!-- ── 作用域筛选 ── -->
        <view class="scope-toolbar">
          <view class="scope-toolbar-head">
            <view class="scope-head-copy">
              <text class="scope-title">作用域</text>
              <text class="scope-desc">按区域与行业过滤可用模块</text>
            </view>
            <button
              v-if="hasScopeFilter"
              class="scope-reset"
              :disabled="moduleLoading"
              @click="clearScopeFilters"
            >
              重置
            </button>
          </view>
          <view class="scope-fields">
            <picker
              class="scope-picker"
              :range="regionLabels"
              :value="regionIndex"
              :disabled="moduleLoading"
              @change="handleRegionChange"
            >
              <view class="scope-field">
                <text class="scope-label">区域</text>
                <view class="scope-value-row">
                  <text class="scope-value">{{ selectedRegionLabel }}</text>
                  <text class="scope-chevron" aria-hidden="true">⌄</text>
                </view>
              </view>
            </picker>
            <picker
              class="scope-picker"
              :range="industryLabels"
              :value="industryIndex"
              :disabled="moduleLoading"
              @change="handleIndustryChange"
            >
              <view class="scope-field">
                <text class="scope-label">行业</text>
                <view class="scope-value-row">
                  <text class="scope-value">{{ selectedIndustryLabel }}</text>
                  <text class="scope-chevron" aria-hidden="true">⌄</text>
                </view>
              </view>
            </picker>
          </view>
        </view>

        <!-- ── 可用模块 ── -->
        <view class="section-heading">
          <text class="section-title">可用模块</text>
          <text class="section-count">{{ visibleModules.length }}</text>
          <text v-if="moduleLoading" class="scope-loading" aria-live="polite">更新中…</text>
        </view>

        <view v-if="visibleModules.length" class="module-grid">
          <view
            v-for="(module, index) in visibleModules"
            :key="module.code"
            class="module-card"
            :class="{ disabled: !module.entryUrl }"
            :style="{ animationDelay: `${Math.min(index, 8) * 60}ms` }"
            :role="module.entryUrl ? 'button' : undefined"
            :aria-label="module.name"
            @click="openModule(module)"
          >
            <view class="module-card-head">
              <text class="module-icon" aria-hidden="true">{{ module.icon }}</text>
              <text v-if="module.isCore" class="core-pill">核心</text>
            </view>
            <text class="module-name">{{ module.name }}</text>
            <text v-if="module.description || module.short" class="module-desc">
              {{ module.description || module.short }}
            </text>
            <view class="module-action">
              <text class="module-action-text">{{ module.entryUrl ? '进入模块' : '即将接入' }}</text>
              <text v-if="module.entryUrl" class="module-arrow" aria-hidden="true">→</text>
            </view>
          </view>
        </view>

        <EmptyState
          v-else-if="!moduleLoading"
          title="当前还没有已启用模块"
          description="调整作用域筛选，或在下方的选用插件中加入新模块。"
          icon="❖"
        />

        <!-- ── 选用插件 ── -->
        <view v-if="optionalModules.length" class="plugin-section">
          <view class="section-heading plugin-heading">
            <text class="section-title">选用插件</text>
            <text class="section-count">{{ selectedOptionalCount }}/{{ optionalModules.length }}</text>
          </view>

          <view class="plugin-list">
            <view v-for="module in optionalModules" :key="module.code" class="plugin-row">
              <view class="plugin-copy">
                <view class="plugin-title-row">
                  <text class="plugin-icon" aria-hidden="true">{{ module.icon }}</text>
                  <text class="plugin-name">{{ module.name }}</text>
                </view>
                <text class="plugin-description">
                  {{ module.description || module.short || '按需加入工作台' }}
                </text>
              </view>
              <switch
                class="plugin-switch"
                :checked="module.selected"
                :disabled="isModulePending(module.code)"
                :color="switchColor"
                @change="toggleModule(module, $event)"
              />
            </view>
          </view>
        </view>
      </template>
    </view>
  </view>
</template>

<script>
import { computed, onMounted, ref } from 'vue'
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import { useAuthStore } from '@gri/auth-client'
import BrandMark from '@/components/ui/BrandMark.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import api, {
  disableModule,
  enableModule,
  listModuleDimensions,
  listModules
} from '@/api'

const ROLE_LABELS = {
  consumer: '消费者',
  student: '学生',
  merchant: '商家',
  operator: '运营'
}

export default {
  name: 'PortalWorkbench',
  components: { BrandMark, EmptyState },
  setup() {
    const auth = useAuthStore()
    auth.restore()

    const identity = ref(null)
    const modules = ref([])
    const dimensions = ref({ regions: [], industries: [] })
    const selectedRegion = ref('')
    const selectedIndustry = ref('')
    const pendingModuleCodes = ref([])
    const loading = ref(true)
    const moduleLoading = ref(false)
    const loggingOut = ref(false)
    const error = ref('')
    // 插件开关色取自设计令牌（--color-primary），不在模板里写裸色。
    const switchColor = ref('')
    let moduleRequestId = 0

    onMounted(() => {
      if (typeof window === 'undefined' || !window.getComputedStyle) return
      const token = window.getComputedStyle(document.documentElement)
        .getPropertyValue('--color-primary')
        .trim()
      if (token) switchColor.value = token
    })

    const role = computed(() => identity.value?.user?.role || '')
    const roleLabel = computed(() => ROLE_LABELS[role.value] || role.value || '未识别角色')
    const displayName = computed(() => (
      identity.value?.user?.name
      || identity.value?.user?.username
      || auth.user?.name
      || auth.user?.username
      || '已登录用户'
    ))
    const visibleModules = computed(() => (
      modules.value.filter(module => module.isCore || module.selected)
    ))
    const optionalModules = computed(() => (
      modules.value.filter(module => !module.isCore)
    ))
    const selectedOptionalCount = computed(() => (
      optionalModules.value.filter(module => module.selected).length
    ))
    const regionLabels = computed(() => (
      dimensions.value.regions.map(region => region.name)
    ))
    const industryLabels = computed(() => (
      dimensions.value.industries.map(industry => industry.name)
    ))
    const regionIndex = computed(() => (
      dimensions.value.regions.findIndex(region => region.nodeId === selectedRegion.value)
    ))
    const industryIndex = computed(() => (
      dimensions.value.industries.findIndex(industry => industry.code === selectedIndustry.value)
    ))
    const selectedRegionLabel = computed(() => (
      dimensions.value.regions.find(region => region.nodeId === selectedRegion.value)?.name
      || '全部区域'
    ))
    const selectedIndustryLabel = computed(() => (
      dimensions.value.industries.find(industry => industry.code === selectedIndustry.value)?.name
      || '全部行业'
    ))
    const hasScopeFilter = computed(() => (
      Boolean(selectedRegion.value || selectedIndustry.value)
    ))
    const currentIdentity = async () => api.get('/api/identity/me')

    const scopeFilters = () => ({
      region: selectedRegion.value || undefined,
      industry: selectedIndustry.value || undefined
    })

    const loadModules = async (options = {}) => {
      const requestId = ++moduleRequestId
      moduleLoading.value = true
      try {
        const moduleData = await listModules(scopeFilters())
        if (requestId !== moduleRequestId) return
        modules.value = Array.isArray(moduleData) ? moduleData : []
      } catch (err) {
        if (!options.silent) throw err
        uni.showToast({
          title: err?.message || '模块筛选失败',
          icon: 'none'
        })
      } finally {
        if (requestId === moduleRequestId) moduleLoading.value = false
      }
    }

    const loadIdentity = async () => {
      if (!auth.isAuthenticated) {
        uni.reLaunch({ url: '/pages/login/login' })
        return
      }

      loading.value = true
      error.value = ''
      try {
        const [identityData, dimensionData] = await Promise.all([
          currentIdentity(),
          listModuleDimensions()
        ])
        identity.value = identityData
        dimensions.value = {
          regions: Array.isArray(dimensionData?.regions) ? dimensionData.regions : [],
          industries: Array.isArray(dimensionData?.industries) ? dimensionData.industries : []
        }
        await loadModules()
      } catch (err) {
        error.value = err?.message || '工作台加载失败'
      } finally {
        loading.value = false
      }
    }

    const handleLogout = async () => {
      loggingOut.value = true
      try {
        await auth.logout()
      } finally {
        loggingOut.value = false
        uni.reLaunch({ url: '/pages/login/login' })
      }
    }

    const setModuleSelected = (code, selected) => {
      modules.value = modules.value.map(module => (
        module.code === code ? { ...module, selected } : module
      ))
    }

    const isModulePending = code => pendingModuleCodes.value.includes(code)

    const handleRegionChange = (event) => {
      const index = Number(event?.detail?.value)
      selectedRegion.value = dimensions.value.regions[index]?.nodeId || ''
      loadModules({ silent: true })
    }

    const handleIndustryChange = (event) => {
      const index = Number(event?.detail?.value)
      selectedIndustry.value = dimensions.value.industries[index]?.code || ''
      loadModules({ silent: true })
    }

    const clearScopeFilters = () => {
      selectedRegion.value = ''
      selectedIndustry.value = ''
      loadModules({ silent: true })
    }

    const toggleModule = async (module, event) => {
      const selected = Boolean(event?.detail?.value)
      if (isModulePending(module.code) || module.selected === selected) return

      const previous = Boolean(module.selected)
      pendingModuleCodes.value = [...pendingModuleCodes.value, module.code]
      setModuleSelected(module.code, selected)

      try {
        const result = selected
          ? await enableModule(module.code)
          : await disableModule(module.code)
        if (typeof result?.selected === 'boolean') {
          setModuleSelected(module.code, result.selected)
        }
      } catch (err) {
        setModuleSelected(module.code, previous)
        uni.showToast({
          title: err?.message || '插件状态更新失败',
          icon: 'none'
        })
      } finally {
        pendingModuleCodes.value = pendingModuleCodes.value.filter(code => code !== module.code)
      }
    }

    const openModule = (module) => {
      if (!module.entryUrl) {
        uni.showToast({ title: '模块正在接入', icon: 'none' })
        return
      }

      if (module.entryUrl.startsWith('/pages/')) {
        uni.navigateTo({ url: module.entryUrl })
        return
      }

      if (typeof window !== 'undefined') {
        window.location.assign(module.entryUrl)
        return
      }

      uni.showToast({ title: '当前端暂不支持该入口', icon: 'none' })
    }

    onShow(loadIdentity)
    onPullDownRefresh(async () => {
      await loadIdentity()
      uni.stopPullDownRefresh()
    })

    return {
      auth,
      clearScopeFilters,
      dimensions,
      displayName,
      error,
      handleIndustryChange,
      handleRegionChange,
      hasScopeFilter,
      handleLogout,
      industryIndex,
      industryLabels,
      isModulePending,
      loadIdentity,
      loading,
      loggingOut,
      modules,
      moduleLoading,
      optionalModules,
      openModule,
      regionIndex,
      regionLabels,
      roleLabel,
      selectedOptionalCount,
      selectedIndustryLabel,
      selectedRegionLabel,
      switchColor,
      toggleModule,
      visibleModules
    }
  }
}
</script>

<style scoped>
.workbench-page {
  position: relative;
  min-height: 100vh;
  padding: var(--spacing-md);
  background: var(--color-bg-primary);
  box-sizing: border-box;
}

/* 顶部氛围带（纯装饰） */
.wb-ambient {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 320rpx;
  background: var(--color-primary-gradient, var(--color-primary));
  opacity: 0.12;
  border-bottom-left-radius: var(--radius-2xl);
  border-bottom-right-radius: var(--radius-2xl);
  pointer-events: none;
}

.wb-container {
  position: relative;
  z-index: var(--z-base);
  max-width: 1180px;
  margin: 0 auto;
}

/* ── 顶栏 ── */
.wb-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-md);
  padding: var(--spacing-lg);
  margin-bottom: var(--spacing-md);
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-card);
  animation: wb-rise var(--transition-base) both;
}

.wb-head-main {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  min-width: 0;
  flex: 1;
}

.identity-block {
  min-width: 0;
  flex: 1;
}

.workbench-kicker {
  display: block;
  margin-bottom: 6rpx;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs);
  letter-spacing: 2rpx;
  text-transform: uppercase;
}

.workbench-title {
  display: block;
  overflow: hidden;
  color: var(--color-text-primary);
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-tight);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.identity-meta {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  min-width: 0;
  margin-top: var(--spacing-sm);
}

.role-pill,
.core-pill {
  flex-shrink: 0;
  padding: 6rpx 18rpx;
  color: var(--color-primary);
  background: var(--color-primary-light);
  border-radius: var(--radius-round);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
}

.identity-id {
  overflow: hidden;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs);
  font-family: var(--font-mono, monospace);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.logout-btn,
.retry-btn {
  flex-shrink: 0;
  padding: 12rpx 28rpx;
  color: var(--color-text-secondary);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-round);
  font-size: var(--font-size-sm);
  line-height: 1.4;
  transition: color var(--transition-fast), background var(--transition-fast),
    border-color var(--transition-fast);
}

.logout-btn::after,
.retry-btn::after {
  border: none;
}

.logout-btn:active,
.retry-btn:active {
  color: var(--color-danger);
  background: var(--color-danger-light);
  border-color: var(--color-danger);
}

.logout-btn:focus-visible,
.retry-btn:focus-visible {
  outline: 4rpx solid var(--color-primary-light);
  outline-offset: 2rpx;
}

/* ── 加载骨架 ── */
.wb-skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.skeleton-hint {
  color: var(--color-text-tertiary);
  font-size: var(--font-size-sm);
}

.skeleton-toolbar,
.skeleton-card {
  background: var(--color-bg-card);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-lg);
  animation: skeleton-pulse 1.4s var(--transition-base) infinite;
}

.skeleton-toolbar {
  height: 180rpx;
}

.skeleton-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280rpx, 1fr));
  gap: var(--spacing-md);
}

.skeleton-card {
  height: 220rpx;
}

@keyframes skeleton-pulse {
  0%,
  100% { opacity: 1; }
  50%  { opacity: 0.55; }
}

/* ── 状态卡 ── */
.workbench-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 72rpx var(--spacing-lg);
  color: var(--color-text-secondary);
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-sm);
  text-align: center;
}

.error-state {
  color: var(--color-danger);
  border-color: var(--color-danger);
  background: var(--color-danger-light);
}

.state-icon {
  font-size: var(--font-size-3xl);
  margin-bottom: var(--spacing-sm);
}

.state-text {
  display: block;
  margin-bottom: var(--spacing-md);
  font-size: var(--font-size-base);
}

/* ── 作用域 ── */
.scope-toolbar {
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-lg);
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-card);
  animation: wb-rise var(--transition-base) both;
  animation-delay: 60ms;
}

.scope-toolbar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-sm);
}

.scope-head-copy {
  min-width: 0;
}

.scope-title {
  display: block;
  color: var(--color-text-primary);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
}

.scope-desc {
  display: block;
  margin-top: 4rpx;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs);
}

.scope-reset {
  min-width: 112rpx;
  padding: 8rpx 22rpx;
  margin: 0;
  color: var(--color-primary);
  background: var(--color-primary-light);
  border: 1px solid transparent;
  border-radius: var(--radius-round);
  font-size: var(--font-size-xs);
  line-height: 1.4;
}

.scope-reset::after {
  border: none;
}

.scope-reset:active {
  color: var(--color-text-inverse);
  background: var(--color-primary-hover);
}

.scope-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--spacing-sm);
}

.scope-picker {
  min-width: 0;
}

.scope-field {
  min-height: 96rpx;
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-bg-input);
  border: 1px solid var(--color-border-input);
  border-radius: var(--radius-md);
  box-sizing: border-box;
  transition: border-color var(--transition-fast);
}

.scope-field:active {
  border-color: var(--color-primary);
}

.scope-label {
  display: block;
  margin-bottom: 6rpx;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs);
}

.scope-value-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-xs);
}

.scope-value {
  overflow: hidden;
  color: var(--color-text-primary);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scope-chevron {
  flex-shrink: 0;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-base);
}

.scope-loading {
  margin-left: auto;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs);
}

/* ── 区块标题 ── */
.section-heading {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-sm);
}

.section-title {
  color: var(--color-text-primary);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
}

.section-count {
  min-width: 40rpx;
  padding: 2rpx 12rpx;
  color: var(--color-primary);
  background: var(--color-primary-light);
  border-radius: var(--radius-round);
  font-size: var(--font-size-xs);
  text-align: center;
}

/* ── 模块卡 ── */
.module-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280rpx, 1fr));
  gap: var(--spacing-md);
}

.module-card {
  display: flex;
  flex-direction: column;
  min-height: 240rpx;
  padding: var(--spacing-md);
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-card);
  box-sizing: border-box;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast),
    border-color var(--transition-fast);
  animation: wb-rise var(--transition-base) both;
}

.module-card:active {
  border-color: var(--color-primary);
  transform: translateY(2rpx);
}

.module-card.disabled {
  opacity: 0.6;
}

.module-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-md);
}

.module-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72rpx;
  height: 72rpx;
  color: var(--color-primary);
  background: var(--color-primary-light);
  border-radius: var(--radius-lg);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
}

.module-name {
  display: block;
  color: var(--color-text-primary);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-tight);
}

.module-desc {
  display: block;
  margin-top: 8rpx;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-base);
  overflow-wrap: anywhere;
}

.module-action {
  display: flex;
  align-items: center;
  gap: 6rpx;
  margin-top: auto;
  padding-top: var(--spacing-md);
}

.module-action-text {
  color: var(--color-primary);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}

.module-card.disabled .module-action-text {
  color: var(--color-text-tertiary);
}

.module-arrow {
  color: var(--color-primary);
  font-size: var(--font-size-sm);
  transition: transform var(--transition-fast);
}

@media (hover: hover) {
  .module-card:not(.disabled):hover {
    border-color: var(--color-primary);
    box-shadow: var(--shadow-hover);
    transform: translateY(-4rpx);
  }

  .module-card:not(.disabled):hover .module-arrow {
    transform: translateX(6rpx);
  }
}

.module-card:focus-visible {
  outline: 4rpx solid var(--color-primary-light);
  outline-offset: 2rpx;
}

/* ── 插件区 ── */
.plugin-section {
  margin-top: var(--spacing-xl);
}

.plugin-heading {
  margin-bottom: var(--spacing-sm);
}

.plugin-list {
  overflow: hidden;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-card);
}

.plugin-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  min-height: 132rpx;
  padding: var(--spacing-md);
  border-bottom: 1px solid var(--color-border-light);
  box-sizing: border-box;
}

.plugin-row:last-child {
  border-bottom: 0;
}

.plugin-copy {
  min-width: 0;
  flex: 1;
}

.plugin-title-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.plugin-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52rpx;
  height: 52rpx;
  flex-shrink: 0;
  color: var(--color-primary);
  background: var(--color-primary-light);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
}

.plugin-name {
  min-width: 0;
  overflow: hidden;
  color: var(--color-text-primary);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plugin-description {
  display: block;
  margin-top: 8rpx;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-base);
  overflow-wrap: anywhere;
}

.plugin-switch {
  flex-shrink: 0;
}

/* ── 桌面 ── */
@media (min-width: 760px) {
  .workbench-page {
    padding: var(--spacing-xl);
  }

  .wb-header {
    padding: var(--spacing-lg) var(--spacing-xl);
  }

  .module-grid {
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  }
}

@media (max-width: 480px) {
  .wb-head-main {
    align-items: flex-start;
  }

  .workbench-title {
    font-size: var(--font-size-xl);
  }
}

@media (prefers-reduced-motion: reduce) {
  .wb-header,
  .scope-toolbar,
  .module-card,
  .skeleton-toolbar,
  .skeleton-card {
    animation: none;
  }
}

@keyframes wb-rise {
  from { opacity: 0; transform: translate3d(0, 16rpx, 0); }
  to   { opacity: 1; transform: translate3d(0, 0, 0); }
}
</style>
