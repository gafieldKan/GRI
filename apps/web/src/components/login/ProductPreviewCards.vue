<!--
  ProductPreviewCards.vue
  3 product-line feature cards: 美食营收, AI 辅导, 低代码 Forge.
-->
<template>
  <view class="previews">
    <text class="previews-heading">GRI 智能平台 — 一个账号，三套产品</text>
    <view class="previews-grid">
      <!-- Food -->
      <view class="preview-card">
        <view class="preview-icon-wrap preview-icon-food">
          <text class="preview-icon">🍽</text>
        </view>
        <text class="preview-title">美食营收</text>
        <text class="preview-subtitle">智能 Revenue Platform</text>
        <view class="preview-features">
          <text class="preview-feature">· 智能点餐 & 多行业适配</text>
          <text class="preview-feature">· 微信 & 支付宝支付</text>
          <text class="preview-feature">· 实时订单追踪</text>
        </view>
      </view>

      <!-- AI Tutor -->
      <view class="preview-card">
        <view class="preview-icon-wrap preview-icon-tutor">
          <text class="preview-icon">🧠</text>
        </view>
        <text class="preview-title">AI 辅导</text>
        <text class="preview-subtitle">Personalized Learning</text>
        <view class="preview-features">
          <text class="preview-feature">· 苏格拉底式启发教学</text>
          <text class="preview-feature">· 10 状态会话引擎</text>
          <text class="preview-feature">· 拍照解题 & 知识图谱</text>
        </view>
      </view>

      <!-- Low-code -->
      <view class="preview-card">
        <view class="preview-icon-wrap preview-icon-forge">
          <text class="preview-icon">⚙</text>
        </view>
        <text class="preview-title">低代码 Forge</text>
        <text class="preview-subtitle">Cloud Studio</text>
        <view class="preview-features">
          <text class="preview-feature">· 可视化拖拽搭建</text>
          <text class="preview-feature">· NAT 穿透远程管理</text>
          <text class="preview-feature">· 企业级工作流引擎</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
export default { name: 'ProductPreviewCards' }
</script>

<style scoped>
.previews {
  padding: 32rpx 0;
}

.previews-heading {
  display: block;
  text-align: center;
  font-size: 28rpx;
  font-weight: 700;
  color: var(--color-text-emphasis, #1A1A2E);
  margin-bottom: 32rpx;
}

.previews-grid {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.preview-card {
  background: #F9FAF9;
  border: 1rpx solid #ECF0EC;
  border-radius: 20rpx;
  padding: 28rpx;
}

.preview-icon-wrap {
  width: 64rpx;
  height: 64rpx;
  border-radius: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16rpx;
}

.preview-icon {
  font-size: 32rpx;
}

.preview-icon-food { background: #FFF4E6; }
.preview-icon-tutor { background: #F3F0FF; }
.preview-icon-forge { background: #E0F7FA; }

.preview-title {
  display: block;
  font-size: 30rpx;
  font-weight: 700;
  color: #1A1A2E;
  margin-bottom: 4rpx;
}

.preview-subtitle {
  display: block;
  font-size: 22rpx;
  color: #999;
  margin-bottom: 16rpx;
}

.preview-features {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.preview-feature {
  font-size: 24rpx;
  color: #5F6B65;
}
</style>