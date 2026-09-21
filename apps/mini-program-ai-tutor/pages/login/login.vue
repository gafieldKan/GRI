<template>
  <view class="login-page">
    <view class="login-card">
      <text class="login-title">智学慧眼</text>
      <text class="login-subtitle">AI 智能学情分析与互动辅导</text>

      <view class="form-item">
        <text class="form-label">账号（邮箱 / 用户名）</text>
        <input
          class="form-input"
          v-model="identifier"
          type="text"
          placeholder="请输入邮箱或用户名"
          confirm-type="next"
        />
      </view>

      <view class="form-item">
        <text class="form-label">密码</text>
        <input
          class="form-input"
          v-model="password"
          type="password"
          placeholder="请输入密码"
          confirm-type="done"
          @confirm="handleLogin"
        />
      </view>

      <text v-if="error" class="form-error">{{ error }}</text>

      <button class="login-btn" :loading="loading" :disabled="loading" @click="handleLogin">
        {{ loading ? '登录中...' : '登录' }}
      </button>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { useAuthStore } from '../../store/auth.js'
import { useUserStore } from '../../store/user.js'

const identifier = ref('')
const password = ref('')
const loading = ref(false)
const error = ref(null)

async function handleLogin() {
  if (!identifier.value.trim() || !password.value) {
    error.value = '请输入账号和密码'
    return
  }
  loading.value = true
  error.value = null
  try {
    const auth = useAuthStore()
    await auth.login(identifier.value.trim(), password.value)
    useUserStore().setStudent(auth.externalId, auth.user || {})
    uni.reLaunch({ url: '/pages/index/index' })
  } catch (err) {
    error.value = err?.message || '登录失败，请检查账号和密码'
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-primary);
  padding: 48rpx 32rpx;
}

.login-card {
  width: 100%;
  max-width: 560rpx;
  background: var(--color-bg-card);
  border-radius: var(--radius-md);
  padding: 48rpx 40rpx;
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--color-border);
}

.login-title {
  display: block;
  text-align: center;
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-text-primary);
  margin-bottom: 8rpx;
}

.login-subtitle {
  display: block;
  text-align: center;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin-bottom: 40rpx;
}

.form-item {
  margin-bottom: var(--spacing-md);
}

.form-label {
  display: block;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-xs);
}

.form-input {
  width: 100%;
  padding: 16rpx 24rpx;
  font-size: var(--font-size-base);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg-card);
  color: var(--color-text-primary);
}

.form-error {
  display: block;
  color: var(--color-danger);
  font-size: var(--font-size-sm);
  margin-bottom: var(--spacing-md);
}

.login-btn {
  width: 100%;
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-active) 100%);
  color: white;
  border: none;
  padding: 20rpx 0;
  border-radius: var(--radius-md);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
}
</style>