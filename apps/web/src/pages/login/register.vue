<!--
  pages/login/register.vue
  Registration sub-page for the GRI platform.
  Fields: username, email, phone, password, confirm password.
  Inline validation + "Already have an account? Login" link back.
-->
<template>
  <view class="min-h-screen bg-[var(--color-bg-primary)] flex flex-col">
    <!-- Custom header -->
    <view class="flex items-center px-6 h-12 border-b border-[var(--color-border)] bg-[var(--color-bg-card)]">
      <text class="text-lg cursor-pointer" @click="goBack">←</text>
      <text class="flex-1 text-center font-bold text-[var(--color-text-emphasis)]">创建账号</text>
      <view class="w-8"></view>
    </view>

    <!-- Scrollable form -->
    <view class="flex-1 overflow-y-auto px-6 py-8">
      <view class="max-w-md mx-auto w-full">

        <!-- Intro -->
        <text class="block text-3xl font-bold text-center mb-2 text-[var(--color-text-emphasis)]">
          注册 GRI 账号
        </text>
        <text class="block text-sm text-center mb-8 text-[var(--color-text-secondary)]">
          一个账号即可使用美食营收、AI 辅导和低码平台
        </text>

        <!-- Server error -->
        <view v-if="serverError" class="server-error">
          <text>⚠️</text><text>{{ serverError }}</text>
        </view>

        <!-- Success message -->
        <view v-if="success" class="mb-6 p-4 rounded-xl bg-sustainable-50 dark:bg-sustainable-800/20 border border-sustainable-200 dark:border-sustainable-700/30">
          <text class="block text-center text-lg mb-2">✅</text>
          <text class="block text-center text-sustainable-700 dark:text-sustainable-400 font-semibold">
            注册成功！
          </text>
          <text class="block text-center text-sm text-text-secondary mt-2">
            您现在可以登录了
          </text>
          <view class="btn-primary mt-4 !bg-success" @click="goToLogin">
            返回登录
          </view>
        </view>

        <!-- Form (hidden on success) -->
        <view v-if="!success">
          <!-- Username -->
          <view class="mb-4">
            <text class="block text-24rpx font-medium text-[var(--color-text-emphasis)] mb-2">用户名</text>
            <input
              v-model="form.username"
              class="input-field"
              :class="{ 'border-danger': errors.username }"
              placeholder="请输入用户名（3-30个字符）"
              :aria-labelledby="'username'"
              @input="handleValidate('username')"
            />
            <text v-if="errors.username" class="text-xs text-danger mt-1 block">{{ errors.username }}</text>
          </view>

          <!-- Email -->
          <view class="mb-4">
            <text class="block text-24rpx font-medium text-[var(--color-text-emphasis)] mb-2">邮箱</text>
            <input
              v-model="form.email"
              class="input-field"
              :class="{ 'border-danger': errors.email }"
              type="email"
              placeholder="请 输入邮箱地址"
              autocomplete="email"
              @input="handleValidate('email')"
            />
            <text v-if="errors.email" class="text-xs text-danger mt-1 block">{{ errors.email }}</text>
          </view>

          <!-- Phone -->
          <view class="mb-4">
            <text class="block text-24rpx font-medium text-[var(--color-text-emphasis)] mb-2">
              手机号 <text class="text-text-tertiary">(选填)</text>
            </text>
            <input
              v-model="form.phone"
              class="input-field"
              :class="{ 'border-danger': errors.phone }"
              type="tel"
              placeholder="请输入手机号码"
              autocomplete="tel"
              @input="handleValidate('phone')"
            />
            <text v-if="errors.phone" class="text-xs text-danger mt-1 block">{{ errors.phone }}</text>
          </view>

          <!-- Password -->
          <view class="mb-4">
            <text class="block text-24rpx font-medium text-[var(--color-text-emphasis)] mb-2">密码</text>
            <input
              v-model="form.password"
              class="input-field"
              :class="{ 'border-danger': errors.password }"
              type="password"
              placeholder="8位以上，包含英文字母和数字"
              autocomplete="new-password"
              @input="handleValidate('password')"
            />
            <text v-if="errors.password" class="text-xs text-danger mt-1 block">{{ errors.password }}</text>

            <!-- Password strength while typing -->
            <view v-if="form.password && form.password.length > 0 && !errors.password" class="mt-2">
              <view class="h-1 rounded-full bg-gray-200 dark:bg-gray-700">
                <view
                  class="h-1 rounded-full transition-all duration-300"
                  :class="{
                    'w-1/3 bg-danger': pwStrength.level === 'weak',
                    'w-2/3 bg-warning': pwStrength.level === 'medium',
                    'w-full bg-success': pwStrength.level === 'strong'
                  }"
                />
              </view>
              <text class="text-20rpx mt-1 block" :class="{
                'text-danger': pwStrength.level === 'weak',
                'text-warning': pwStrength.level === 'medium',
                'text-success': pwStrength.level === 'strong'
              }">{{ pwStrength.message }}</text>
            </view>
          </view>

          <!-- Confirm Password -->
          <view class="mb-6">
            <text class="block text-24rpx font-medium text-[var(--color-text-emphasis)] mb-2">
              确认密码
            </text>
            <input
              v-model="form.confirmPassword"
              class="input-field"
              :class="{ 'border-danger': errors.confirmPassword }"
              type="password"
              placeholder="请再次输入密码"
              autocomplete="new-password"
              @input="handleValidate('confirmPassword')"
            />
            <text v-if="errors.confirmPassword" class="text-xs text-danger mt-1 block">
              {{ errors.confirmPassword }}
            </text>
          </view>

          <!-- Submit -->
          <view
            class="btn-primary text-center mb-4"
            :class="{ 'opacity-50 pointer-events-none': !canSubmit || submitting }"
            @click="handleRegister"
            role="button"
            :aria-disabled="(!canSubmit || submitting) ? 'true' : 'false'"
          >
            <text v-if="submitting">注册中...</text>
            <text v-else>注册</text>
          </view>

          <!-- Terms -->
          <text class="block text-center text-22rpx text-text-tertiary mb-4">
            注册 即表示同意 GRI
            <text class="text-brand-blue-500">服务条款</text>
            和
            <text class="text-brand-blue-500">隐私政策</text>
          </text>
        </view>

        <!-- Footer: Already have account? -->
        <view class="text-center" v-if="!success">
          <text class="text-24rpx text-text-secondary">
            已有账号？
          </text>
          <text
            class="text-primary font-medium ml-2 cursor-pointer hover:underline"
            @click="goToLogin"
          >
            立即登录
          </text>
        </view>

      </view>
    </view>
  </view>
</template>

<script>
import { validateField, getPasswordStrength } from '../../utils/validators.js'
import { register } from '../../api/auth.js'
import { useAuthStore } from '../../store/auth.js'

export default {
  name: 'RegisterPage',

  data() {
    return {
      form: {
        username: '',
        email: '',
        phone: '',
        password: '',
        confirmPassword: ''
      },
      errors: {
        username: null,
        email: null,
        phone: null,
        password: null,
        confirmPassword: null
      },
      submitting: false,
      serverError: null,
      success: false,
      authStore: null
    }
  },

  computed: {
    pwStrength() {
      return getPasswordStrength(this.form.password)
    },
    canSubmit() {
      return this.form.username.trim()
        && this.form.email.trim()
        && this.form.password.length >= 8
        && this.form.confirmPassword
        && !this.errors.username
        && !this.errors.email
        && !this.errors.password
        && !this.errors.confirmPassword
        && !this.submitting
    }
  },

  created() {
    this.authStore = useAuthStore()
  },

  methods: {
    handleValidate(field) {
      if (field === 'confirmPassword') {
        this.errors.confirmPassword = validateField(this.form.confirmPassword, 'confirmPassword', this.form.password)
        return
      }
      this.errors[field] = validateField(this.form[field], field)
    },

    handleUsername() {
      this.errors.username = validateField(this.form.username, 'username')
    },

    async handleRegister() {
      // Validate all fields
      this.errors.username = validateField(this.form.username, 'username')
      this.errors.email = validateField(this.form.email, 'email')
      this.errors.phone = validateField(this.form.phone, 'phone')
      this.errors.password = validateField(this.form.password, 'password')
      this.errors.confirmPassword = validateField(this.form.confirmPassword, 'confirmPassword', this.form.password)

      if (
        this.errors.username ||
        this.errors.email ||
        this.errors.phone ||
        this.errors.password ||
        this.errors.confirmPassword
      ) {
        return
      }

      this.submitting = true
      this.serverError = null

      try {
        const result = await register({
          username: this.form.username.trim(),
          email: this.form.email.trim(),
          phone: this.form.phone.trim() || undefined,
          password: this.form.password
        })

        if (result.code === 201) {
          this.success = true
          // If backend auto-login (provides token), set auth
          if (result.data && result.data.token) {
            this.authStore.setLogin({
              token: result.data.token,
              refreshToken: result.data.refreshToken,
              user: result.data.user,
              method: 'email'
            })
          }
        } else {
          this.serverError = result.message || '注册失败'
        }
      } catch (err) {
        this.serverError = this.registerErrorMessage(err)
      } finally {
        this.submitting = false
      }
    },

    registerErrorMessage(err) {
      const status = err && err.status
      const backendMessage = err && err.data && err.data.message
      if (status === 409) return '该用户名、邮箱或手机号已被注册'
      if (status === 400) return backendMessage || '请检查注册信息是否符合要求'
      if (status === 502 || !status || status >= 500) {
        return '注册服务暂不可用，请稍后重试'
      }
      return backendMessage || err?.message || '注册失败，请稍后重试'
    },

    goBack() {
      uni.navigateBack()
    },

    goToLogin() {
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
