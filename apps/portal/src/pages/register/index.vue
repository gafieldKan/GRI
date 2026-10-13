<template>
  <AuthShell
    title="创建账号"
    subtitle="注册后将以消费者身份进入工作台"
    brand-title="GRI 组织管理台"
    brand-subtitle="以人为本 · 组织树 · 成员 · 角色 · 邀请 · 审计"
    :points="brandPoints"
    foot="GRI · 统一身份与组织域"
    secure-hint="密码至少 8 位，请勿使用弱口令"
  >
    <view class="register-form">
      <FormField
        v-model="username"
        label="用户名"
        placeholder="至少 3 个字符"
        :maxlength="32"
        confirm-type="next"
      />

      <FormField
        v-model="email"
        label="邮箱"
        placeholder="name@example.com"
        :maxlength="128"
        confirm-type="next"
      />

      <FormField
        v-model="name"
        label="姓名"
        placeholder="请输入姓名"
        :maxlength="64"
        optional
        confirm-type="next"
      />

      <view class="field-row">
        <FormField
          v-model="password"
          label="密码"
          type="password"
          placeholder="至少 8 个字符"
          :maxlength="128"
          confirm-type="next"
        />

        <FormField
          v-model="confirmPassword"
          label="确认密码"
          type="password"
          placeholder="再次输入密码"
          :maxlength="128"
          confirm-type="done"
          @confirm="handleRegister"
        />
      </view>

      <text v-if="error" class="form-error" role="alert" aria-live="polite">{{ error }}</text>

      <button
        class="submit-btn"
        :loading="loading"
        :disabled="loading"
        :aria-busy="loading ? 'true' : 'false'"
        @click="handleRegister"
      >
        {{ loading ? '注册中…' : '注册并进入工作台' }}
      </button>

      <view class="form-foot">
        <text class="form-foot-label">已有账号？</text>
        <button class="link-btn" @click="goLogin">返回登录</button>
      </view>
    </view>
  </AuthShell>
</template>

<script>
import AuthShell from '@/components/ui/AuthShell.vue'
import FormField from '@/components/ui/FormField.vue'
import { useAuthStore } from '@gri/auth-client'

export default {
  name: 'PortalRegister',
  components: { AuthShell, FormField },
  data() {
    return {
      username: '',
      email: '',
      name: '',
      password: '',
      confirmPassword: '',
      loading: false,
      error: null,
      brandPoints: [
        { icon: '❖', label: '即刻可用的工作台', desc: '注册即开通消费者身份与模块入口' },
        { icon: '✦', label: '按需启用模块', desc: '核心模块默认就绪，插件随需加入' },
        { icon: '◈', label: '随时升级为组织', desc: '后续可被邀请加入组织并切换角色' }
      ]
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
.field-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--spacing-md);
}

.field-row :deep(.field) {
  margin-bottom: var(--spacing-md);
}

@media (max-width: 560px) {
  .field-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }
}

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
