<!--
  OAuthProviders.vue
  WeChat, Alipay, Apple SSO login buttons with platform conditional compilation.
  Uses #ifdef for platform-specific behavior (WeChat mini-program vs H5).
-->
<template>
  <view class="oauth-providers">
    <!-- Divider -->
    <view class="flex items-center gap-4 my-6">
      <view class="flex-1 h-px bg-[var(--color-border)]" />
      <text class="text-22rpx text-text-tertiary">其他登录方式</text>
      <view class="flex-1 h-px bg-[var(--color-border)]" />
    </view>

    <!-- Provider buttons -->
    <view class="flex justify-center gap-6">

      <!-- WeChat Login (primary for Chinese market) -->
      <!-- #ifdef MP-WEIXIN -->
      <button
        class="oauth-btn oauth-wechat"
        :disabled="loadingProvider === 'wechat'"
        aria-label="微信登录"
        @click="handleWeChatLogin"
      >
        <view v-if="loadingProvider === 'wechat'" class="loading-spinner-sm" />
        <text v-else class="text-3xl">💬</text>
        <text class="block text-20rpx mt-1 text-[var(--color-text-secondary)]">微信</text>
      </button>
      <!-- #endif -->

      <!-- #ifdef H5 -->
      <button
        class="oauth-btn oauth-wechat"
        :disabled="loadingProvider === 'wechat'"
        aria-label="微信登录"
        @click="handleWeChatLoginH5"
      >
        <text class="text-3xl">💬</text>
        <text class="block text-20rpx mt-1 text-[var(--color-text-secondary)]">微信</text>
      </button>
      <!-- #endif -->

      <!-- Alipay -->
      <button
        class="oauth-btn oauth-alipay"
        :disabled="loadingProvider === 'alipay'"
        aria-label="支付宝登录"
        @click="handleAlipayLogin"
      >
        <text class="text-3xl">🔵</text>
        <text class="block text-20rpx mt-1 text-[var(--color-text-secondary)]">支付宝</text>
      </button>

      <!-- Apple (only on supported platforms) -->
      <!-- #ifdef APP-PLUS || H5 -->
      <button
        v-if="showAppleLogin"
        class="oauth-btn oauth-apple"
        :disabled="loadingProvider === 'apple'"
        aria-label="Apple 登录"
        @click="handleAppleLogin"
      >
        <text class="text-3xl">🍎</text>
        <text class="block text-20rpx mt-1 text-[var(--color-text-secondary)]">Apple</text>
      </button>
      <!-- #endif -->
    </view>
  </view>
</template>

<script>
export default {
  name: 'OAuthProviders',

  emits: ['wechat-success', 'alipay-success', 'apple-success'],

  data() {
    return {
      loadingProvider: null
    }
  },

  computed: {
    showAppleLogin() {
      // Only show Apple login on iOS devices via H5 or native app
      // #ifdef H5
      try {
        return /iPhone|iPad|iPod|Macintosh|Mac OS X/.test(navigator.userAgent)
      } catch (e) {
        return false
      }
      // #endif
      // #ifdef APP-PLUS
      return plus.os.name === 'iOS' || plus.os.name === 'Mac OS'
      // #endif
      return false
    }
  },

  methods: {
    // ── WeChat Login (mini-program) ──
    handleWeChatLogin() {
      this.loadingProvider = 'wechat'
      // #ifdef MP-WEIXIN
      uni.login({
        provider: 'weixin',
        scopes: 'auth_user',
        success: (res) => {
          this.$emit('wechat-success', { code: res.code })
          this.loadingProvider = null
        },
        fail: (err) => {
          console.error('WeChat login failed:', err)
          uni.showToast({ title: '微信登录失败', icon: 'none' })
          this.loadingProvider = null
        }
      })
      // #endif

      // #ifndef MP-WEIXIN
      setTimeout(() => {
        this.loadingProvider = null
        uni.showToast({ title: '微信登录仅支持小程序端', icon: 'none' })
      }, 300)
      // #endif
    },

    // ── WeChat Login (H5) ──
    handleWechatLoginH5() {
      this.loadingProvider = 'wechat'
      uni.showModal({
        title: '微信登录',
        content: '浏览器端微信登录需要授权跳转，开发中。',
        showCancel: false,
        success: () => {
          this.loadingProvider = null
        }
      })
    },

    // ── Alipay Login ──
    handleAlipayLogin() {
      this.loadingProvider = 'alipay'
      uni.showModal({
        title: '支付宝登录',
        content: '企业支付宝登录接入中，敬请期待。',
        showCancel: false,
        success: () => {
          this.loadingProvider = null
        }
      })
    },

    // ── Apple Login ──
    handleAppleLogin() {
      this.loadingProvider = 'apple'
      uni.showModal({
        title: 'Apple 登录',
        content: 'Apple 登录接入中，敬请期待。',
        showCancel: false,
        success: () => {
          this.loadingProvider = null
        }
      })
    }
  }
}
</script>

<style>
.oauth-providers {
  width: 100%;
}

.oauth-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 120rpx;
  height: 120rpx;
  border-radius: 50%;
  border: 2px solid var(--color-border, #e0e0e0);
  background: var(--color-bg-card, #ffffff);
  transition: all 0.2s ease;
  cursor: pointer;
}

.oauth-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.1);
}

.oauth-btn:active {
  transform: scale(0.97);
}

.oauth-wechat:hover {
  border-color: #07C160;
  background: #ecfef5;
}

.oauth-alipay:hover {
  border-color: #1677FF;
  background: #e6f4ff;
}

.oauth-apple:hover {
  border-color: #000000;
  background: #f5f5f5;
}

.loading-spinner-sm {
  width: 32rpx;
  height: 32rpx;
  border: 3rpx solid #e0e0e0;
  border-top-color: #07C160;
  border-radius: 50%;
  animation: spin 0.5s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>