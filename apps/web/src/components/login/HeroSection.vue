<!--
  HeroSection.vue
  Green → cyan gradient hero with brand logo and tagline.
  No JS timer/carousel — pure CSS presentation, safe for uni-app.
-->
<template>
  <view class="hero">
    <view class="hero-bg">
      <!-- Logo -->
      <text class="hero-brand">GRI</text>
      <!-- Tagline -->
      <text class="hero-tagline">智慧运营 · 多行业智能平台</text>
      <!-- Product row -->
      <view class="hero-products">
        <view class="hero-product">
          <text class="hero-product-icon">🍽</text>
          <text class="hero-product-name">美食营收</text>
        </view>
        <view class="hero-divider" />
        <view class="hero-product">
          <text class="hero-product-icon">🧠</text>
          <text class="hero-product-name">AI 辅导</text>
        </view>
        <view class="hero-divider" />
        <view class="hero-product">
          <text class="hero-product-icon">⚙</text>
          <text class="hero-product-name">低代码Forge</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
export default {
  name: 'HeroSection'
}
</script>

<style scoped>
.hero {
  width: 100%;
  overflow: hidden;
}

.hero-bg {
  background: var(--hero-gradient);
  padding: 80rpx 40rpx 100rpx 40rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.hero-brand {
  font-size: 56rpx;
  font-weight: 800;
  color: var(--color-text-inverse);
  letter-spacing: 4rpx;
  margin-bottom: 16rpx;
}

.hero-tagline {
  font-size: 28rpx;
  color: rgba(255, 255, 255, 0.85);
  margin-bottom: 40rpx;
}

.hero-products {
  display: flex;
  align-items: center;
  gap: 24rpx;
}

.hero-product {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
}

.hero-product-icon {
  font-size: 40rpx;
}

.hero-product-name {
  font-size: 22rpx;
  color: rgba(255, 255, 255, 0.8);
  white-space: nowrap;
}

.hero-divider {
  width: 1rpx;
  height: 48rpx;
  background: rgba(255, 255, 255, 0.2);
}
</style>