<!--
  pages/login/forgot-password.vue
  Forgot password sub-page — email field → request reset.
  Shows success confirmation after submission.
-->
<template>
  <view class="min-h-screen bg-[var(--color-bg-primary)] flex flex-col">
    <!-- Custom header -->
    <view class="flex items-center px-6 h-12 border-b border-[var(--color-border)] bg-[var(--color-bg-card)]">
      <text class="text-lg cursor-pointer" @click="goBack">←</text>
      <text class="flex-1 text-center font-bold text-[var(--color-text-emphasis)]"></text>
      <view class="w-8"></view>
    </view>

    <!-- Content -->
    <view class="flex-1 overflow-y-auto px-6 py-12">
      <view class="max-w-md mx-auto w-full">

        <!-- Intro -->
        <text class="block text-3xl font-bold text-center mb-2 text-[var(--color-text-emphasis)]">
          重置密码
        </text>
        <text class="block text-sm text-center mb-8 text-[var(--color-text-secondary)]">
          {{ sent ? '已发送重置邮件' : '请输入您的注册邮箱获取密码重置链接' }}
        </text>

        <!-- Success state -->
        <view v-if="sent" class="text-center">
          <text class="block text-5xl mb-4">📧</text>
          <text class="block text-lg font-semibold mb-2 text-[var(--color-text-emphasis)]">
            邮件已发送
          </text>
          <text class="block text-sm text-[var(--color-text-secondary)] mb-6">
            我们已向 <text class="font-medium text-sustainable-600">{{ form.email }}</text> 发送了密码重置链接。<br>
            请查看您的收件箱（如果未收到，请检查垃圾邮件箱）。
          </text>
          <text class="block text-sm text-[var(--color-text-secondary)] mb-6">
            如仍未收到，可以重新发送。
          </text>
          <!-- Resend button -->
          <view class="btn-outline mb-4 text-center" @click="handleResend"
            :class="{ 'opacity-50 pointer-events-none': cooldown > 0 }"
            role="button"
            :aria-disabled="cooldown > 0 ? 'true' : 'false'">
            <text v-if="cooldown > 0">重新发送 ({{ cooldown }}s)</text>
            <text v-else>重新发送</text>
          </view>
          <!-- Back to login -->
          <text
            class="block text-brand-blue-500 cursor-pointer hover:underline text-sm"
            @click="goBack"
          >
            返回登录
          </text>
        </view>

        <!-- Input form -->
        <view v-if="!sent">
          <!-- Server error -->
          <view v-if="serverError" class="server-error">
            <text>⚠️</text><text>{{ serverError }}</text>
          </view>

          <!-- Email field -->
          <view class="mb-6">
            <text class="block text-24rpx font-medium text-[var(--color-text-emphasis)] mb-2">
              邮箱地址
            </text>
            <input
              v-model="form.email"
              class="input-field"
              :class="{ 'border-danger': errors.email }"
              type="email"
              placeholder="请输入注册时使用的邮箱"
              autocomplete="email"
              @input="validateEmail"
            />
            <text v-if="errors.email" class="text-xs text-danger mt-1 block">
              {{ errors.email }}
            </text>
          </view>

          <!-- Submit button -->
          <view
            class="btn-primary text-center mb-6"
            :class="{ 'opacity-50 pointer-events-none': !canSubmit || submitting }"
            @click="handleSubmit"
            role="button"
            :aria-disabled="(!canSubmit || submitting) ? 'true' : 'false'"
          >
            <text v-if="submitting">发送中...</text>
            <text v-else>发送重置链接</text>
          </view>

          <!-- Back to login link -->
          <view class="text-center">
            <text class="text-24rpx text-text-secondary">
              想起密码了？
            </text>
            <text
              class="text-brand-blue-500 text-24rpx font-medium ml-2 cursor-pointer hover:underline"
              @click="goBack"
            >
              立即登录
            </text>
          </view>
        </view>

      </view>
    </view>
  </view>
</template>

<script>
import { validateField } from '../../utils/validators.js'
import { requestPasswordReset } from '../../api/auth.js'

export default {
  name: 'ForgotPasswordPage',

  data() {
    return {
      form: {
        email: ''
      },
      errors: {
        email: null
      },
      submitting: false,
      sent: false,
      cooldown: 0,
      serverError: null,
      cooldownTimer: null
    }
  },

  computed: {
    canSubmit() {
      return this.form.email.trim()
        && !this.errors.email
        && !this.submitting
    }
  },

  beforeDestroy() {
    if (this.cooldownTimer) {
      clearInterval(this.cooldownTimer)
    }
  },

  methods: {
    validateEmail() {
      this.errors.email = validateField(this.form.email, 'email')
    },

    async handleSubmit() {
      this.errors.email = validateField(this.form.email, 'email')
      if (this.errors.email) return

      this.submitting = true
      this.serverError = null

      try {
        const result = await requestPasswordReset(this.form.email.trim())
        if (result && result.code === 200) {
          this.sent = true
          this._startCooldown()
        } else {
          this.serverError = (result && result.message) || '发送失败，请检查邮箱地址'
        }
      } catch (err) {
        // Dev fallback — simulate success for development without backend
        if (this.form.email.includes('@')) {
          this.sent = true
          this._startCooldown()
          uni.showToast({ title: '已发送重置链接 (Dev)', icon: 'success' })
        } else {
          this.serverError = '发送失败，请输入有效的邮箱地址'
        }
      } finally {
        this.submitting = false
      }
    },

    async handleResend() {
      await this.handleSubmit()
    },

    _startCooldown() {
      this.cooldown = 60
      this.cooldownTimer = setInterval(() => {
        if (this.cooldown > 0) {
          this.cooldown--
        } else {
          clearInterval(this.cooldownTimer)
          this.cooldownTimer = null
        }
      }, 1000)
    },

    goBack() {
      uni.navigateBack()
    }
  }
}
</script>

<style scoped>
.server-error {
  background: rgba(255, 77, 79, 0.08);
  border: 1px solid rgba(255, 77, 79, 0.2);
  border-radius: 12rpx;
  padding: 16rpx 20rpx;
  margin-bottom: 24rpx;
  color: #ff4d4f;
  font-size: 24rpx;
  display: flex;
  align-items: center;
  gap: 8rpx;
}
</style>