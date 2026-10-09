<!--
  EmailLoginForm.vue
  Account + password login form. 账号统一为 identifier（邮箱 / 用户名），
  与 AI 辅导 / 组织管理台两模块入口一致（auth-center 通用登录）。
  Uses :value + @input pattern instead of v-model to avoid
  uni-app's event ordering issue where @input fires before v-model updates.
-->
<template>
  <view class="login-form">

    <!-- Account field（邮箱 / 用户名） -->
    <view class="form-field">
      <text class="field-label">账号（邮箱 / 用户名）</text>
      <input
        class="field-input"
        :class="{ 'field-input-error': errors.identifier, 'field-input-valid': !errors.identifier && identifier }"
        type="text"
        :value="identifier"
        placeholder="请输入邮箱或用户名"
        @input="onIdentifierInput"
        @blur="validateIdentifier"
      />
      <text v-if="errors.identifier" class="field-error">{{ errors.identifier }}</text>
    </view>

    <!-- Password field -->
    <view class="form-field">
      <text class="field-label">密码</text>
      <view class="password-wrapper">
        <input
          class="field-input field-input-password"
          :class="{ 'field-input-error': errors.password, 'field-input-success': !errors.password && password.length >= 8 }"
          :type="showPassword ? 'text' : 'password'"
          :value="password"
          placeholder="请输入密码"
          @input="onPasswordInput"
          @blur="validatePassword"
        />
        <text class="password-toggle" @click="showPassword = !showPassword">
          {{ showPassword ? '🙈' : '👁️' }}
        </text>
      </view>
      <text v-if="errors.password" class="field-error">{{ errors.password }}</text>

      <!-- Password strength meter -->
      <view v-if="password && !errors.password" class="strength-meter">
        <view class="strength-bar">
          <view
            class="strength-fill"
            :class="{
              'fill-weak': pwStrength.level === 'weak',
              'fill-medium': pwStrength.level === 'medium',
              'fill-strong': pwStrength.level === 'strong'
            }"
            :style="{ width: pwStrength.score + '%' }"
          />
        </view>
        <text class="strength-label"
          :class="{
            'text-weak': pwStrength.level === 'weak',
            'text-medium': pwStrength.level === 'medium',
            'text-strong': pwStrength.level === 'strong'
          }"
        >{{ pwStrength.message }}</text>
      </view>
    </view>

    <!-- Remember me + Forgot password -->
    <view class="form-options">
      <view class="remember-row" @click="rememberMe = !rememberMe">
        <view class="checkbox" :class="{ 'checkbox-checked': rememberMe }">
          <text v-if="rememberMe" class="checkbox-mark">✓</text>
        </view>
        <text class="remember-text">记住登录</text>
      </view>
      <text class="forgot-link" @click="$emit('forgot-password')">忘记密码?</text>
    </view>

    <!-- Submit button -->
    <text v-if="serverError" class="form-server-error">{{ serverError }}</text>

    <view
      class="submit-btn"
      :class="{ 'submit-btn-disabled': !canSubmit || submitting }"
      @click="handleSubmit"
    >
      <text v-if="submitting" class="submit-text">登录中...</text>
      <text v-else class="submit-text">登录</text>
    </view>
  </view>
</template>

<script>
import { getPasswordStrength } from '../../utils/validators.js'

export default {
  name: 'EmailLoginForm',

  props: {
    submitting: {
      type: Boolean,
      default: false
    },
    serverError: {
      type: String,
      default: ''
    }
  },

  emits: ['submit', 'forgot-password', 'clear-error'],

  data() {
    return {
      identifier: '',
      password: '',
      showPassword: false,
      rememberMe: false,
      errors: {
        identifier: null,
        password: null
      }
    }
  },

  computed: {
    pwStrength() {
      return getPasswordStrength(this.password)
    },
    canSubmit() {
      return this.identifier.trim().length > 0
        && this.password.length >= 8
        && !this.errors.identifier
        && !this.errors.password
        && !this.submitting
    }
  },

  methods: {
    // ── Input handlers (capture value before v-model sync) ──
    onIdentifierInput(e) {
      // uni-app passes event with e.detail.value; also try e.target.value
      const val = (e && e.detail && e.detail.value != null) ? e.detail.value
        : (e && e.target && e.target.value != null) ? e.target.value
        : (typeof e === 'string') ? e : ''
      this.identifier = val
      // Clear error on typing
      if (this.errors.identifier) this.errors.identifier = null
      if (this.serverError) this.$emit('clear-error')
    },

    onPasswordInput(e) {
      const val = (e && e.detail && e.detail.value != null) ? e.detail.value
        : (e && e.target && e.target.value != null) ? e.target.value
        : (typeof e === 'string') ? e : ''
      this.password = val
      // Clear error on typing
      if (this.errors.password) this.errors.password = null
      if (this.serverError) this.$emit('clear-error')
    },

    // ── Validation (on blur) ──
    validateIdentifier() {
      if (!this.identifier.trim()) {
        this.errors.identifier = '请输入邮箱或用户名'
      } else {
        this.errors.identifier = null
      }
    },

    validatePassword() {
      if (!this.password) {
        this.errors.password = '请输入密码'
      } else if (this.password.length < 8) {
        this.errors.password = '密码长度不能少于8个字符'
      } else {
        this.errors.password = null
      }
    },

    // ── Submit ──
    handleSubmit() {
      if (this.submitting) return

      this.validateIdentifier()
      this.validatePassword()

      if (this.errors.identifier || this.errors.password) {
        return
      }

      this.$emit('submit', {
        identifier: this.identifier.trim(),
        password: this.password,
        rememberMe: this.rememberMe
      })
    }
  }
}
</script>

<style scoped>
.login-form {
  width: 100%;
}

/* ── Field ── */
.form-field {
  margin-bottom: 28rpx;
}

.field-label {
  display: block;
  font-size: 26rpx;
  font-weight: 500;
  color: var(--color-text-primary);
  margin-bottom: 12rpx;
}

.field-input {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  background: var(--color-bg-input);
  border: 2rpx solid var(--color-border);
  border-radius: 16rpx;
  padding: 0 24rpx;
  font-size: 28rpx;
  color: var(--color-text-primary);
  box-sizing: border-box;
}

.field-input:focus {
  border-color: var(--color-primary);
  background: var(--color-bg-card);
}

.field-input-error {
  border-color: var(--color-danger);
}

.field-input-success {
  border-color: var(--color-success);
}

.field-error {
  display: block;
  font-size: 22rpx;
  color: var(--color-danger);
  margin-top: 8rpx;
}

/* ── Password ── */
.password-wrapper {
  position: relative;
}

.field-input-password {
  padding-right: 100rpx;
}

.password-toggle {
  position: absolute;
  right: 24rpx;
  top: 22rpx;
  font-size: 32rpx;
  z-index: 2;
}

/* ── Strength meter ── */
.strength-meter {
  margin-top: 12rpx;
}

.strength-bar {
  height: 8rpx;
  border-radius: 4rpx;
  background: var(--color-border-light);
  overflow: hidden;
}

.strength-fill {
  height: 100%;
  border-radius: 4rpx;
  transition: width 0.3s ease;
}

.fill-weak { background: var(--color-danger); }
.fill-medium { background: var(--color-warning); }
.fill-strong { background: var(--color-success); }

.strength-label {
  font-size: 22rpx;
  margin-top: 6rpx;
  display: block;
}

.text-weak { color: var(--color-danger); }
.text-medium { color: var(--color-warning); }
.text-strong { color: var(--color-success); }

/* ── Options (remember me + forgot) ── */
.form-options {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 32rpx;
}

.remember-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.checkbox {
  width: 40rpx;
  height: 40rpx;
  border: 2rpx solid var(--color-border);
  border-radius: 8rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.checkbox-checked {
  background: var(--color-primary);
  border-color: var(--color-primary);
}

.checkbox-mark {
  color: var(--color-text-inverse);
  font-size: 24rpx;
}

.remember-text {
  font-size: 26rpx;
  color: var(--color-text-secondary);
}

.forgot-link {
  font-size: 26rpx;
  color: var(--color-primary);
}

/* ── Submit ── */
.submit-btn {
  width: 100%;
  height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-primary-gradient);
  border-radius: 16rpx;
  cursor: pointer;
  transition: opacity 0.2s;
}

.submit-btn:active {
  opacity: 0.9;
}

.submit-btn-disabled {
  opacity: 0.45;
  pointer-events: none;
}

.submit-text {
  color: var(--color-text-inverse);
  font-size: 30rpx;
  font-weight: 600;
}

.form-server-error {
  display: block;
  padding: 16rpx 20rpx;
  margin-bottom: 20rpx;
  border: 2rpx solid rgba(255, 77, 79, 0.2);
  border-radius: 12rpx;
  background: rgba(255, 77, 79, 0.08);
  color: var(--color-danger);
  font-size: 24rpx;
}
</style>
