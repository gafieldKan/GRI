<template>
  <view class="workbench-page">
    <view class="workbench-topbar">
      <view class="identity-block">
        <text class="workbench-kicker">GRI 统一工作台</text>
        <text class="workbench-title">{{ displayName }}</text>
        <view class="identity-meta">
          <text class="role-pill">{{ roleLabel }}</text>
          <text v-if="auth.externalId" class="identity-id">{{ auth.externalId }}</text>
        </view>
      </view>
      <button class="logout-btn" :disabled="loggingOut" @click="handleLogout">
        {{ loggingOut ? '退出中' : '退出登录' }}
      </button>
    </view>

    <view v-if="loading" class="workbench-state">
      <text class="state-text">正在加载工作台</text>
    </view>

    <view v-else-if="error" class="workbench-state error-state">
      <text class="state-text">{{ error }}</text>
      <button class="retry-btn" @click="loadIdentity">重试</button>
    </view>

    <template v-else>
      <view class="scope-toolbar">
        <view class="scope-toolbar-head">
          <text class="scope-title">作用域</text>
          <button
            v-if="hasScopeFilter"
            class="scope-reset"
            :disabled="moduleLoading"
            @click="clearScopeFilters"
          >
            全部
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
              <text class="scope-value">{{ selectedRegionLabel }}</text>
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
              <text class="scope-value">{{ selectedIndustryLabel }}</text>
            </view>
          </picker>
        </view>
      </view>

      <view class="section-heading">
        <text class="section-title">可用模块</text>
        <text class="section-count">{{ visibleModules.length }}</text>
        <text v-if="moduleLoading" class="scope-loading">更新中</text>
      </view>

      <view class="module-grid">
        <view
          v-for="module in visibleModules"
          :key="module.code"
          class="module-card"
          :class="{ disabled: !module.entryUrl }"
          @click="openModule(module)"
        >
          <view class="module-card-head">
            <text class="module-icon">{{ module.icon }}</text>
            <text v-if="module.isCore" class="core-pill">核心</text>
          </view>
          <text class="module-name">{{ module.name }}</text>
          <text class="module-action">{{ module.entryUrl ? '进入模块' : '即将接入' }}</text>
        </view>
      </view>

      <view v-if="!visibleModules.length && !moduleLoading" class="workbench-state">
        <text class="state-text">当前还没有已启用模块</text>
      </view>

      <view v-if="optionalModules.length" class="plugin-section">
        <view class="section-heading plugin-heading">
          <text class="section-title">选用插件</text>
          <text class="section-count">{{ selectedOptionalCount }}/{{ optionalModules.length }}</text>
        </view>

        <view class="plugin-list">
          <view v-for="module in optionalModules" :key="module.code" class="plugin-row">
            <view class="plugin-copy">
              <view class="plugin-title-row">
                <text class="plugin-icon">{{ module.icon }}</text>
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
              color="#1b7a3d"
              @change="toggleModule(module, $event)"
            />
          </view>
        </view>
      </view>
    </template>
  </view>
</template>

<script>
import { computed, ref } from 'vue'
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import { useAuthStore } from '@gri/auth-client'
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
    let moduleRequestId = 0

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
      toggleModule,
      visibleModules
    }
  }
}
</script>

<style scoped>
.workbench-page {
  min-height: 100vh;
  padding: 32rpx;
  background: var(--color-bg-primary, #f5f7f6);
  box-sizing: border-box;
}

.workbench-topbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24rpx;
  padding: 32rpx;
  margin-bottom: 32rpx;
  background: var(--color-bg-card, #fff);
  border: 1px solid var(--color-border, #e8e8e8);
  border-radius: var(--radius-md, 12rpx);
  box-shadow: var(--shadow-sm, 0 4rpx 16rpx rgba(0, 0, 0, 0.05));
}

.identity-block {
  min-width: 0;
  flex: 1;
}

.workbench-kicker {
  display: block;
  margin-bottom: 8rpx;
  color: var(--color-text-tertiary, #8a8f98);
  font-size: 24rpx;
}

.workbench-title {
  display: block;
  overflow: hidden;
  color: var(--color-text-primary, #1a1a2e);
  font-size: 40rpx;
  font-weight: 700;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.identity-meta {
  display: flex;
  align-items: center;
  gap: 16rpx;
  min-width: 0;
  margin-top: 16rpx;
}

.role-pill,
.core-pill {
  flex-shrink: 0;
  padding: 6rpx 16rpx;
  color: var(--color-primary, #1b7a3d);
  background: var(--color-primary-light, rgba(27, 122, 61, 0.1));
  border-radius: 999rpx;
  font-size: 22rpx;
  font-weight: 600;
}

.identity-id {
  overflow: hidden;
  color: var(--color-text-tertiary, #8a8f98);
  font-size: 22rpx;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.logout-btn,
.retry-btn {
  flex-shrink: 0;
  padding: 12rpx 24rpx;
  color: var(--color-text-secondary, #59596b);
  background: var(--color-bg-secondary, #f0f0f5);
  border: 1px solid var(--color-border, #e8e8e8);
  border-radius: var(--radius-sm, 8rpx);
  font-size: 26rpx;
  line-height: 1.4;
}

.section-heading {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 20rpx;
}

.scope-toolbar {
  padding: 24rpx 28rpx 28rpx;
  margin-bottom: 32rpx;
  background: var(--color-bg-card, #fff);
  border: 1px solid var(--color-border, #e8e8e8);
  border-radius: var(--radius-md, 12rpx);
  box-shadow: var(--shadow-sm, 0 4rpx 16rpx rgba(0, 0, 0, 0.05));
}

.scope-toolbar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20rpx;
}

.scope-title {
  color: var(--color-text-primary, #1a1a2e);
  font-size: 28rpx;
  font-weight: 650;
}

.scope-reset {
  min-width: 112rpx;
  padding: 8rpx 20rpx;
  margin: 0;
  color: var(--color-text-secondary, #59596b);
  background: var(--color-bg-secondary, #f0f0f5);
  border: 1px solid var(--color-border, #e8e8e8);
  border-radius: var(--radius-sm, 8rpx);
  font-size: 24rpx;
  line-height: 1.4;
}

.scope-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20rpx;
}

.scope-picker {
  min-width: 0;
}

.scope-field {
  min-height: 92rpx;
  padding: 16rpx 20rpx;
  background: var(--color-bg-secondary, #f0f0f5);
  border: 1px solid var(--color-border, #e8e8e8);
  border-radius: var(--radius-sm, 8rpx);
  box-sizing: border-box;
}

.scope-label {
  display: block;
  margin-bottom: 6rpx;
  color: var(--color-text-tertiary, #8a8f98);
  font-size: 22rpx;
}

.scope-value {
  display: block;
  overflow: hidden;
  color: var(--color-text-primary, #1a1a2e);
  font-size: 26rpx;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scope-loading {
  margin-left: auto;
  color: var(--color-text-tertiary, #8a8f98);
  font-size: 22rpx;
}

.section-title {
  color: var(--color-text-primary, #1a1a2e);
  font-size: 30rpx;
  font-weight: 650;
}

.section-count {
  min-width: 36rpx;
  padding: 2rpx 10rpx;
  color: var(--color-text-secondary, #59596b);
  background: var(--color-bg-secondary, #f0f0f5);
  border-radius: 999rpx;
  font-size: 22rpx;
  text-align: center;
}

.module-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280rpx, 1fr));
  gap: 24rpx;
}

.module-card {
  min-height: 220rpx;
  padding: 28rpx;
  background: var(--color-bg-card, #fff);
  border: 1px solid var(--color-border, #e8e8e8);
  border-radius: var(--radius-md, 12rpx);
  box-shadow: var(--shadow-sm, 0 4rpx 16rpx rgba(0, 0, 0, 0.05));
  box-sizing: border-box;
}

.module-card:active {
  border-color: var(--color-primary, #1b7a3d);
  transform: translateY(2rpx);
}

.module-card.disabled {
  opacity: 0.58;
}

.module-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24rpx;
}

.module-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64rpx;
  height: 64rpx;
  color: var(--color-primary, #1b7a3d);
  background: var(--color-primary-light, rgba(27, 122, 61, 0.1));
  border-radius: 14rpx;
  font-size: 28rpx;
  font-weight: 700;
}

.module-name {
  display: block;
  color: var(--color-text-primary, #1a1a2e);
  font-size: 32rpx;
  font-weight: 650;
}

.module-action {
  display: block;
  margin-top: 16rpx;
  color: var(--color-text-tertiary, #8a8f98);
  font-size: 24rpx;
}

.plugin-section {
  margin-top: 40rpx;
}

.plugin-heading {
  margin-bottom: 20rpx;
}

.plugin-list {
  overflow: hidden;
  background: var(--color-bg-card, #fff);
  border: 1px solid var(--color-border, #e8e8e8);
  border-radius: var(--radius-md, 12rpx);
  box-shadow: var(--shadow-sm, 0 4rpx 16rpx rgba(0, 0, 0, 0.05));
}

.plugin-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24rpx;
  min-height: 132rpx;
  padding: 24rpx 28rpx;
  border-bottom: 1px solid var(--color-border, #e8e8e8);
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
  gap: 14rpx;
}

.plugin-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48rpx;
  height: 48rpx;
  flex-shrink: 0;
  color: var(--color-primary, #1b7a3d);
  background: var(--color-primary-light, rgba(27, 122, 61, 0.1));
  border-radius: 12rpx;
  font-size: 24rpx;
  font-weight: 700;
}

.plugin-name {
  min-width: 0;
  overflow: hidden;
  color: var(--color-text-primary, #1a1a2e);
  font-size: 28rpx;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plugin-description {
  display: block;
  margin-top: 12rpx;
  color: var(--color-text-tertiary, #8a8f98);
  font-size: 24rpx;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.plugin-switch {
  flex-shrink: 0;
}

.workbench-state {
  padding: 72rpx 32rpx;
  color: var(--color-text-secondary, #59596b);
  background: var(--color-bg-card, #fff);
  border: 1px solid var(--color-border, #e8e8e8);
  border-radius: var(--radius-md, 12rpx);
  text-align: center;
}

.error-state {
  color: var(--color-danger, #d93025);
}

.state-text {
  display: block;
  margin-bottom: 24rpx;
}
</style>
