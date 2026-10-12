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
      <view class="section-heading">
        <text class="section-title">可用模块</text>
        <text class="section-count">{{ modules.length }}</text>
      </view>

      <view class="module-grid">
        <view
          v-for="module in modules"
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

      <view v-if="!modules.length" class="workbench-state">
        <text class="state-text">当前角色暂无可用模块</text>
      </view>
    </template>
  </view>
</template>

<script>
import { computed, ref } from 'vue'
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import { useAuthStore } from '@gri/auth-client'
import api, { listModules } from '@/api'

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
    const loading = ref(true)
    const loggingOut = ref(false)
    const error = ref('')

    const role = computed(() => identity.value?.user?.role || '')
    const roleLabel = computed(() => ROLE_LABELS[role.value] || role.value || '未识别角色')
    const displayName = computed(() => (
      identity.value?.user?.name
      || identity.value?.user?.username
      || auth.user?.name
      || auth.user?.username
      || '已登录用户'
    ))
    const currentIdentity = async () => api.get('/api/identity/me')

    const loadIdentity = async () => {
      if (!auth.isAuthenticated) {
        uni.reLaunch({ url: '/pages/login/login' })
        return
      }

      loading.value = true
      error.value = ''
      try {
        const [identityData, moduleData] = await Promise.all([
          currentIdentity(),
          listModules()
        ])
        identity.value = identityData
        modules.value = Array.isArray(moduleData) ? moduleData : []
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
      displayName,
      error,
      handleLogout,
      loadIdentity,
      loading,
      loggingOut,
      modules,
      openModule,
      roleLabel
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
