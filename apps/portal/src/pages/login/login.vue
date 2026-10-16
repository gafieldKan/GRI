<template>
  <AuthShell
    title="登录"
    subtitle="使用你的组织账号进入统一工作台"
    brand-title="GRI 组织管理台"
    brand-subtitle="以人为本 · 组织树 · 成员 · 角色 · 邀请 · 审计"
    :points="brandPoints"
    foot="GRI · 统一身份与组织域"
    secure-hint="登录凭据经网关加密传输"
  >
    <view class="login-form">
      <FormField
        v-model="identifier"
        label="账号"
        placeholder="请输入邮箱或用户名"
        hint="支持邮箱或用户名"
        confirm-type="next"
        :error="fieldErrors.identifier"
      />

      <FormField
        v-model="password"
        label="密码"
        type="password"
        placeholder="请输入密码"
        confirm-type="done"
        :error="fieldErrors.password"
        @confirm="handleLogin"
      />

      <text v-if="error" class="form-error" role="alert" aria-live="polite">{{ error }}</text>

      <button
        class="submit-btn"
        :loading="loading"
        :disabled="loading"
        :aria-busy="loading ? 'true' : 'false'"
        @click="handleLogin"
      >
        {{ loading ? '登录中…' : '登录' }}
      </button>

      <view class="form-foot">
        <text class="form-foot-label">还没有账号？</text>
        <button class="link-btn" @click="goRegister">立即注册</button>
      </view>
    </view>
  </AuthShell>
</template>

<script>
import AuthShell from '@/components/ui/AuthShell.vue'
import FormField from '@/components/ui/FormField.vue'
import { useAuthStore } from '@gri/auth-client'

export default {
  name: 'PortalLogin',
  components: { AuthShell, FormField },
  data() {
    return {
      identifier: '',
      password: '',
      loading: false,
      error: null,
      fieldErrors: { identifier: '', password: '' },
      brandPoints: [
        { icon: '❖', label: '组织树与成员', desc: '一屏管理组织层级、成员与角色' },
        { icon: '✦', label: '邀请与审计', desc: '邀请入组，操作留痕可追溯' },
        { icon: '◈', label: '统一入口', desc: '一次登录，跨模块直达已启用服务' }
      ]
    }
  },
  methods: {
    goRegister() {
      uni.navigateTo({ url: '/pages/register/index' })
    },
    async handleLogin() {
      this.fieldErrors = { identifier: '', password: '' }

      if (!this.identifier.trim() || !this.password) {
        this.fieldErrors = {
          identifier: this.identifier.trim() ? '' : '请输入账号',
          password: this.password ? '' : '请输入密码'
        }
        this.error = '请输入账号和密码'
        return
      }
      this.loading = true
      this.error = null
      try {
        const auth = useAuthStore()
        await auth.login(this.identifier.trim(), this.password)
        uni.reLaunch({ url: '/pages/world/index' })
      } catch (err) {
        this.error = err?.message || '登录失败，请检查账号和密码'
      } finally {
        this.loading = false
      }
    }
  }
}
</script>

<style scoped>
.form-error {
  display: block;
  margin-bottom: var(--spacing-md);
  padding: var(--spacing-sm) var(--spacing-md);
  color: var(--color-danger);
  background: var(--color-danger-light);
  border: 1px solid var(--color-danger);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-base);
}

.submit-btn {
  width: 100%;
  margin-top: var(--spacing-xs);
  padding: 0;
  color: var(--color-text-inverse);
  background: var(--color-primary-gradient, var(--color-primary));
  border: none;
  border-radius: var(--radius-md);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  line-height: 92rpx;
  box-shadow: var(--shadow-md);
  transition: transform var(--transition-fast), box-shadow var(--transition-fast),
    opacity var(--transition-fast);
}

.submit-btn::after {
  border: none;
}

.submit-btn:active {
  transform: translateY(2rpx) scale(0.995);
  box-shadow: var(--shadow-sm);
  opacity: 0.94;
}

.submit-btn[disabled] {
  opacity: 0.6;
}

@media (hover: hover) {
  .submit-btn:not([disabled]):hover {
    background: var(--color-primary-hover);
    box-shadow: var(--shadow-hover);
  }
}

.submit-btn:focus-visible {
  outline: 4rpx solid var(--color-primary-light);
  outline-offset: 4rpx;
}

.form-foot {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  margin-top: var(--spacing-lg);
}

.form-foot-label {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.link-btn {
  margin: 0;
  padding: 0;
  color: var(--color-primary);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  line-height: 1.6;
}

.link-btn::after {
  border: none;
}

.link-btn:active {
  color: var(--color-primary-active);
}

.link-btn:focus-visible {
  outline: 4rpx solid var(--color-primary-light);
  outline-offset: 4rpx;
}
</style>
