<template>
  <view class="register-page">
    <view class="register-card">
      <text class="register-title">创建 GRI 账号</text>
      <text class="register-subtitle">注册后将以消费者身份进入工作台</text>

      <view class="form-item">
        <text class="form-label">用户名</text>
        <input
          class="form-input"
          v-model="username"
          type="text"
          maxlength="32"
          placeholder="至少 3 个字符"
          confirm-type="next"
        />
      </view>

      <view class="form-item">
        <text class="form-label">邮箱</text>
        <input
          class="form-input"
          v-model="email"
          type="text"
          maxlength="128"
          placeholder="name@example.com"
          confirm-type="next"
        />
      </view>

      <view class="form-item">
        <text class="form-label">姓名（选填）</text>
        <input
          class="form-input"
          v-model="name"
          type="text"
          maxlength="64"
          placeholder="请输入姓名"
          confirm-type="next"
        />
      </view>

      <view class="form-item">
        <text class="form-label">密码</text>
        <input
          class="form-input"
          v-model="password"
          type="password"
          maxlength="128"
          placeholder="至少 8 个字符"
          confirm-type="next"
        />
      </view>

      <view class="form-item">
        <text class="form-label">确认密码</text>
        <input
          class="form-input"
          v-model="confirmPassword"
          type="password"
          maxlength="128"
          placeholder="再次输入密码"
          confirm-type="done"
          @confirm="handleRegister"
        />
      </view>

      <text v-if="error" class="form-error">{{ error }}</text>

      <button class="register-btn" :loading="loading" :disabled="loading" @click="handleRegister">
        {{ loading ? '注册中...' : '注册并进入工作台' }}
      </button>

      <view class="login-link" @click="goLogin">
        <text>已有账号，返回登录</text>
      </view>
    </view>
  </view>
</template>

<script>
import { useAuthStore } from '@gri/auth-client'

export default {
  name: 'PortalRegister',
  data() {
    return {
      username: '',
      email: '',
      name: '',
      password: '',
      confirmPassword: '',
      loading: false,
      error: null
    }
  },
  methods: {
    validate() {
      const username = this.username.trim()
      const email = this.email.trim()
      const name = this.name.trim()

      if (username.length < 3) return '用户名至少 3 个字符'
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '请输入有效邮箱'
      if (this.password.length < 8) return '密码至少 8 个字符'
      if (this.password !== this.confirmPassword) return '两次输入的密码不一致'

      return ''
    },
    goLogin() {
      uni.reLaunch({ url: '/pages/login/login' })
    },
    async handleRegister() {
      const validationError = this.validate()
      if (validationError) {
        this.error = validationError
        return
      }

      this.loading = true
      this.error = null
      try {
        const auth = useAuthStore()
        await auth.register({
          username: this.username.trim(),
          email: this.email.trim(),
          password: this.password,
          name: this.name.trim() || undefined
        })
        await auth.login(this.email.trim(), this.password)
        uni.reLaunch({ url: '/pages/workbench/index' })
      } catch (err) {
        this.error = err?.message || '注册失败，请稍后重试'
      } finally {
        this.loading = false
      }
    }
  }
}
</script>

<style scoped>
.register-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48rpx 32rpx;
  background: var(--color-bg-primary, #f5f7f6);
  box-sizing: border-box;
}

.register-card {
  width: 100%;
  max-width: 600rpx;
  padding: 48rpx 40rpx;
  background: var(--color-bg-card, #fff);
  border: 1px solid var(--color-border, #e8e8e8);
  border-radius: var(--radius-md, 12rpx);
  box-shadow: var(--shadow-sm, 0 4rpx 16rpx rgba(0, 0, 0, 0.05));
  box-sizing: border-box;
}

.register-title {
  display: block;
  color: var(--color-text-primary, #1a1a2e);
  font-size: 40rpx;
  font-weight: 700;
  text-align: center;
}

.register-subtitle {
  display: block;
  margin: 12rpx 0 40rpx;
  color: var(--color-text-secondary, #59596b);
  font-size: 26rpx;
  text-align: center;
}

.form-item {
  margin-bottom: 24rpx;
}

.form-label {
  display: block;
  margin-bottom: 10rpx;
  color: var(--color-text-primary, #1a1a2e);
  font-size: 26rpx;
  font-weight: 600;
}

.form-input {
  width: 100%;
  padding: 18rpx 22rpx;
  color: var(--color-text-primary, #1a1a2e);
  background: var(--color-bg-card, #fff);
  border: 1px solid var(--color-border, #e8e8e8);
  border-radius: var(--radius-sm, 8rpx);
  font-size: 28rpx;
  box-sizing: border-box;
}

.form-error {
  display: block;
  margin-bottom: 24rpx;
  color: var(--color-danger, #d93025);
  font-size: 24rpx;
}

.register-btn {
  width: 100%;
  padding: 20rpx 0;
  color: #fff;
  background: var(--color-primary, #1b7a3d);
  border: none;
  border-radius: var(--radius-md, 12rpx);
  font-size: 28rpx;
  font-weight: 600;
}

.login-link {
  margin-top: 28rpx;
  color: var(--color-primary, #1b7a3d);
  font-size: 26rpx;
  text-align: center;
}
</style>
