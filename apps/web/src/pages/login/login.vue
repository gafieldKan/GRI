<!--
  pages/login/login.vue
  GRI Multi-Industry SaaS Login Page
  Unified layout: Hero on top → Auth card below (mobile), side-by-side (desktop)
-->
<template>
  <view class="login-page">
    <!-- Hero Section -->
    <HeroSection />

    <!-- Auth Card -->
    <view class="auth-container">
      <view class="auth-card">

        <!-- Brand heading -->
        <text class="auth-title">欢迎回来</text>
        <text class="auth-subtitle">登录您的 GRI 智能平台账号</text>

        <!-- Server error -->
        <view v-if="serverError" class="error-banner">
          <text>⚠️</text>
          <text>{{ serverError }}</text>
        </view>

        <!-- Email Login Form -->
        <EmailLoginForm
          ref="emailForm"
          @submit="handleLogin"
          @forgot-password="goToForgot"
        />

        <!-- Divider -->
        <view class="divider-row">
          <view class="divider-line" />
          <text class="divider-text">其他登录方式</text>
          <view class="divider-line" />
        </view>

        <!-- OAuth -->
        <OAuthProviders @wechat-success="handleWeChatSuccess" />

        <!-- Trust -->
        <TrustBar />

        <!-- Product Preview -->
        <ProductPreviewCards />

        <!-- Footer Links -->
        <FooterLinks @navigate="handleFooterNavigate" />
      </view>
    </view>

    <!-- Dark mode toggle -->
    <view class="dark-toggle" @click="toggleDarkMode">
      <text>{{ isDark ? '☀️' : '🌙' }}</text>
    </view>
  </view>
</template>

<script>
import HeroSection from '../../components/login/HeroSection.vue'
import EmailLoginForm from '../../components/login/EmailLoginForm.vue'
import OAuthProviders from '../../components/login/OAuthProviders.vue'
import TrustBar from '../../components/login/TrustBar.vue'
import ProductPreviewCards from '../../components/login/ProductPreviewCards.vue'
import FooterLinks from '../../components/login/FooterLinks.vue'
import { useAuthStore } from '../../store/auth.js'

export default {
  name: 'LoginPage',

  components: {
    HeroSection,
    EmailLoginForm,
    OAuthProviders,
    TrustBar,
    ProductPreviewCards,
    FooterLinks
  },

  data() {
    return {
      authStore: null,
      serverError: null
    }
  },

  computed: {
    isDark() {
      return this.authStore ? this.authStore.darkMode : false
    }
  },

  created() {
    this.authStore = useAuthStore()
  },

  methods: {
    async handleLogin(credentials) {
      this.serverError = null
      uni.showLoading({ title: '登录中...' })
      try {
        const result = await this.authStore.login(credentials.email, credentials.password)
        uni.hideLoading()
        if (result && result.code === 200) {
          uni.reLaunch({ url: '/pages/index/index' })
        } else {
          this.serverError = (result && result.message) || '登录失败，请检查邮箱和密码'
        }
      } catch (err) {
        uni.hideLoading()
        // Dev fallback — backend might not have /api/auth/login yet
        console.log('[GRI Dev] 后端不可用，使用开发模式登录:', err.message)
        this._devLogin(credentials.email, credentials.password)
      }
    },

    _devLogin(email, password) {
      if (!email.includes('@')) {
        uni.showToast({ title: '请输入有效的邮箱地址', icon: 'none' })
        return
      }
      if (password.length < 4) {
        uni.showToast({ title: '开发模式：密码至少4位', icon: 'none' })
        return
      }
      this.authStore.setLogin({
        token: 'dev-token-' + Date.now(),
        user: {
          id: 'u-dev-001',
          username: email.split('@')[0] || '开发者',
          email: email,
          avatarUrl: 'https://picsum.photos/100/100?random=42',
          memberLevel: 'VIP 会员'
        },
        method: 'email'
      })
      uni.showToast({ title: '登录成功 (Dev)', icon: 'success', duration: 1000 })
      setTimeout(() => {
        uni.reLaunch({ url: '/pages/index/index' })
      }, 800)
    },

    async handleWeChatSuccess({ code }) {
      this.serverError = null
      uni.showLoading({ title: '微信登录中...' })
      try {
        const result = await this.authStore.loginWithWeChat(code)
        uni.hideLoading()
        if (result && result.code === 200) {
          uni.reLaunch({ url: '/pages/index/index' })
        } else {
          this.serverError = '微信登录失败，请稍后重试'
        }
      } catch (err) {
        this.authStore.setLogin({
          token: 'dev-wx-' + Date.now(),
          user: {
            id: 'wx-dev-001',
            username: '微信用户',
            avatarUrl: 'https://picsum.photos/100/100?random=43',
            memberLevel: '普通会员'
          },
          method: 'wechat'
        })
        uni.showToast({ title: '微信登录成功 (Dev)', icon: 'success' })
        setTimeout(() => { uni.reLaunch({ url: '/pages/index/index' }) }, 800)
      }
    },

    goToRegister() {
      uni.navigateTo({ url: '/pages/login/register' })
    },

    goToForgot() {
      uni.navigateTo({ url: '/pages/login/forgot-password' })
    },

    handleFooterNavigate(page) {
      if (page === 'register') this.goToRegister()
      else if (page === 'forgot') this.goToForgot()
    },

    toggleDarkMode() {
      if (this.authStore) this.authStore.toggleDarkMode()
    }
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  background-color: var(--color-bg-primary, #F4FCF5);
  padding-bottom: 40rpx;
}

/* Auth card container */
.auth-container {
  display: flex;
  justify-content: center;
  padding: 0 32rpx;
  margin-top: -40rpx;
}

.auth-card {
  position: relative;
  z-index: 10;
  width: 100%;
  max-width: 480rpx;
  background: var(--color-bg-card, #ffffff);
  border-radius: 32rpx;
  padding: 48rpx 40rpx;
  box-shadow: 0 8rpx 48rpx rgba(0, 0, 0, 0.08);
  margin-bottom: 32rpx;
}

/* Typography */
.auth-title {
  display: block;
  text-align: center;
  font-size: 40rpx;
  font-weight: 700;
  color: var(--color-text-emphasis, #1A1A2E);
  margin-bottom: 8rpx;
}

.auth-subtitle {
  display: block;
  text-align: center;
  font-size: 26rpx;
  color: var(--color-text-secondary, #5F6B65);
  margin-bottom: 40rpx;
}

/* Error banner */
.error-banner {
  background: rgba(255, 77, 79, 0.08);
  border: 1rpx solid rgba(255, 77, 79, 0.2);
  border-radius: 16rpx;
  padding: 16rpx 24rpx;
  margin-bottom: 32rpx;
  color: #ff4d4f;
  font-size: 24rpx;
  display: flex;
  align-items: center;
  gap: 12rpx;
}

/* Divider */
.divider-row {
  display: flex;
  align-items: center;
  margin: 32rpx 0;
}

.divider-text {
  font-size: 24rpx;
  color: var(--color-text-tertiary, #999);
  padding: 0 20rpx;
  white-space: nowrap;
}

.divider-line {
  flex: 1;
  height: 1rpx;
  background: var(--color-border, #E8E8E8);
}

/* Dark mode toggle */
.dark-toggle {
  position: fixed;
  top: 24rpx;
  right: 24rpx;
  z-index: 999;
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  /* backdrop-filter: blur(10rpx); */
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32rpx;
}
</style>