<!--
  TrustBar.vue
  Security/trust badge strip below the login form.
-->
<template>
  <view class="trust">
    <view class="trust-badges">
      <view class="trust-badge">
        <text class="trust-icon">🔒</text>
        <text class="trust-label">端到端加密</text>
      </view>
      <view class="trust-badge">
        <text class="trust-icon">🛡</text>
        <text class="trust-label">企业级安全</text>
      </view>
      <view class="trust-badge">
        <text class="trust-icon">✅</text>
        <text class="trust-label">隐私优先</text>
      </view>
    </view>
    <text class="trust-terms">
      登录即表示您同意 <text class="trust-link">服务条款</text> 和 <text class="trust-link">隐私政策</text>
    </text>
  </view>
</template>

<script>
export default { name: 'TrustBar' }
</script>

<style scoped>
.trust {
  padding: 24rpx 0;
}

.trust-badges {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 16rpx;
  margin-bottom: 20rpx;
}

.trust-badge {
  display: flex;
  align-items: center;
  gap: 8rpx;
  padding: 10rpx 20rpx;
  border-radius: 40rpx;
  background: var(--color-primary-light);
}

.trust-icon {
  font-size: 22rpx;
}

.trust-label {
  font-size: 22rpx;
  color: var(--color-primary);
}

.trust-terms {
  display: block;
  text-align: center;
  font-size: 22rpx;
  color: var(--color-text-tertiary);
}

.trust-link {
  color: var(--color-primary);
}
</style>