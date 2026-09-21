<!--
  FooterLinks.vue
  Bottom-of-login-page links: Register, Forgot Password, Terms, Language switch
-->
<template>
  <view class="footer-links">
    <view class="flex justify-center items-center gap-4 text-24rpx">
      <!-- Register link -->
      <text
        class="footer-link"
        @click="$emit('navigate', 'register')"
      >
        注册账号
      </text>

      <text class="text-[var(--color-border)]">|</text>

      <!-- Forgot password -->
      <text
        class="footer-link"
        @click="$emit('navigate', 'forgot')"
      >
        忘记密码
      </text>
    </view>

    <!-- Secondary row: Terms, Privacy, Language -->
    <view class="flex justify-center items-center gap-3 mt-3 text-20rpx">
      <text class="footer-link-secondary" @click="openTerms">
        服务条款
      </text>
      <text class="footer-link-secondary">
        •
      </text>
      <text class="footer-link-secondary" @click="openPrivacy">
        隐私政策
      </text>

      <!-- Language switcher -->
      <text class="footer-link-secondary">
        •
      </text>
      <text
        class="footer-link-secondary"
        @click="toggleLanguage"
      >
        {{ currentLang === 'zh' ? 'EN' : '中文' }}
      </text>
    </view>
  </view>
</template>

<script>
export default {
  name: 'FooterLinks',

  emits: ['navigate', 'toggle-language'],

  data() {
    return {
      currentLang: 'zh'
    }
  },

  methods: {
    openTerms() {
      uni.showToast({ title: '服务条款 — 开发中', icon: 'none' })
    },
    openPrivacy() {
      uni.showToast({ title: '隐私政策 — 开发中', icon: 'none' })
    },
    toggleLanguage() {
      this.currentLang = this.currentLang === 'zh' ? 'en' : 'zh'
      this.$emit('toggle-language', this.currentLang)
    }
  }
}
</script>

<style>
.footer-link {
  color: var(--color-brand-green, #1B7A3D);
  cursor: pointer;
  font-weight: 500;
  transition: opacity 0.2s;
}

.footer-link:hover {
  text-decoration: underline;
  opacity: 0.85;
}

.footer-link-secondary {
  color: var(--color-text-tertiary, #999999);
  cursor: pointer;
  transition: color 0.2s;
}

.footer-link-secondary:hover {
  color: var(--color-text-secondary);
}

.footer-separator {
  color: var(--color-border);
}
</style>