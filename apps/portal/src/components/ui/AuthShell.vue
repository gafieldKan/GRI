<template>
  <view class="auth-page">
    <view class="auth-atmosphere" aria-hidden="true">
      <view class="auth-orb auth-orb--a" />
      <view class="auth-orb auth-orb--b" />
      <view class="auth-leaf auth-leaf--a" />
      <view class="auth-leaf auth-leaf--b" />
    </view>

    <view class="auth-shell">
      <!-- 品牌主视觉：桌面居左整幅，移动端收敛为紧凑抬头 -->
      <view class="auth-brand">
        <view class="auth-brand-head">
          <BrandMark variant="inverse" size="lg" :show-wordmark="false" />
          <view class="auth-brand-copy">
            <text class="auth-brand-title">{{ brandTitle }}</text>
            <text class="auth-brand-sub">{{ brandSubtitle }}</text>
          </view>
        </view>

        <view v-if="points.length" class="auth-points">
          <view
            v-for="(point, index) in points"
            :key="point.label"
            class="auth-point"
            :style="{ animationDelay: `${index * 90}ms` }"
          >
            <text class="auth-point-icon" aria-hidden="true">{{ point.icon }}</text>
            <view class="auth-point-copy">
              <text class="auth-point-label">{{ point.label }}</text>
              <text v-if="point.desc" class="auth-point-desc">{{ point.desc }}</text>
            </view>
          </view>
        </view>

        <text v-if="foot" class="auth-foot">{{ foot }}</text>
      </view>

      <!-- 表单区 -->
      <view class="auth-form-col">
        <view class="auth-card">
          <text class="auth-card-title">{{ title }}</text>
          <text v-if="subtitle" class="auth-card-sub">{{ subtitle }}</text>
          <view class="auth-card-body">
            <slot />
          </view>
        </view>
        <text v-if="secureHint" class="auth-secure">
          <text class="auth-secure-dot" aria-hidden="true">●</text>
          {{ secureHint }}
        </text>
      </view>
    </view>
  </view>
</template>

<script>
import BrandMark from './BrandMark.vue'

/**
 * 登录 / 注册共用的认证外壳：品牌主视觉 + 表单卡槽。
 * 布局：移动端单列（品牌收敛为抬头），≥900px 双列（品牌居左、表单居右）。
 * 仅视觉层，不介入任何认证逻辑（N3：行为不变）。
 */
export default {
  name: 'AuthShell',
  components: { BrandMark },
  props: {
    title: {
      type: String,
      required: true
    },
    subtitle: {
      type: String,
      default: ''
    },
    brandTitle: {
      type: String,
      default: 'GRI 组织管理台'
    },
    brandSubtitle: {
      type: String,
      default: '组织树 · 成员 · 角色 · 邀请 · 审计'
    },
    points: {
      type: Array,
      default: () => []
    },
    foot: {
      type: String,
      default: ''
    },
    secureHint: {
      type: String,
      default: ''
    }
  }
}
</script>

<style scoped>
.auth-page {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: var(--spacing-lg) var(--spacing-md);
  background: var(--color-bg-primary);
  box-sizing: border-box;
  overflow-x: hidden;
}

/* ── 背景氛围：令牌色柔和光斑（纯装饰，aria-hidden）── */
.auth-atmosphere {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.auth-orb {
  position: absolute;
  border-radius: var(--radius-round);
  background: var(--color-primary-light);
  opacity: 0.7;
  filter: blur(60rpx);
}

.auth-orb--a {
  top: -180rpx;
  right: -120rpx;
  width: 520rpx;
  height: 520rpx;
  animation: auth-float 11s var(--transition-slow) infinite alternate;
}

.auth-orb--b {
  bottom: -220rpx;
  left: -140rpx;
  width: 460rpx;
  height: 460rpx;
  background: var(--color-accent-light);
  animation: auth-float 14s var(--transition-slow) infinite alternate-reverse;
}

.auth-leaf {
  position: absolute;
  border-radius: var(--radius-round);
  border: 2rpx solid var(--color-primary-light);
  opacity: 0.55;
}

.auth-leaf--a {
  top: 18%;
  left: 12%;
  width: 20rpx;
  height: 20rpx;
}

.auth-leaf--b {
  bottom: 22%;
  right: 16%;
  width: 14rpx;
  height: 14rpx;
  border-color: var(--color-accent-light);
}

@keyframes auth-float {
  from { transform: translate3d(0, 0, 0) scale(1); }
  to   { transform: translate3d(0, -40rpx, 0) scale(1.08); }
}

/* ── 外壳 ── */
.auth-shell {
  position: relative;
  z-index: var(--z-base);
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 760rpx;
  gap: var(--spacing-lg);
}

/* ── 品牌区 ── */
.auth-brand {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  animation: auth-rise var(--transition-slow) both;
}

.auth-brand-head {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.auth-brand-copy {
  min-width: 0;
  flex: 1;
}

.auth-brand-title {
  display: block;
  color: var(--color-text-primary);
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-tight);
  letter-spacing: -0.5rpx;
}

.auth-brand-sub {
  display: block;
  margin-top: 8rpx;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

/* 移动端：品牌收敛为抬头，要点列表让位给表单（保证首屏可见登录按钮） */
.auth-points {
  display: none;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.auth-point {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-bg-card);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  animation: auth-rise var(--transition-slow) both;
}

.auth-point-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56rpx;
  height: 56rpx;
  flex-shrink: 0;
  background: var(--color-primary-light);
  color: var(--color-primary);
  border-radius: var(--radius-md);
  font-size: var(--font-size-lg);
}

.auth-point-copy {
  min-width: 0;
  flex: 1;
}

.auth-point-label {
  display: block;
  color: var(--color-text-primary);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
}

.auth-point-desc {
  display: block;
  margin-top: 4rpx;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs);
}

.auth-foot {
  display: block;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs);
  letter-spacing: 1rpx;
}

/* ── 表单区 ── */
.auth-form-col {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  width: 100%;
}

.auth-card {
  padding: var(--spacing-xl) var(--spacing-lg);
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  box-sizing: border-box;
  animation: auth-rise var(--transition-slow) both;
  animation-delay: 90ms;
}

@keyframes auth-rise {
  from { opacity: 0; transform: translate3d(0, 24rpx, 0); }
  to   { opacity: 1; transform: translate3d(0, 0, 0); }
}

.auth-card-title {
  display: block;
  color: var(--color-text-primary);
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-tight);
}

.auth-card-sub {
  display: block;
  margin-top: 8rpx;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-base);
}

.auth-card-body {
  margin-top: var(--spacing-lg);
}

.auth-secure {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs);
}

.auth-secure-dot {
  color: var(--color-success);
  font-size: 14rpx;
}

/* ── 桌面：双列 ── */
@media (min-width: 900px) {
  .auth-page {
    padding: 64rpx;
  }

  .auth-shell {
    flex-direction: row;
    align-items: stretch;
    max-width: 1180rpx;
    gap: 0;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-2xl);
    box-shadow: var(--shadow-lg);
    overflow: hidden;
  }

  .auth-brand {
    position: relative;
    justify-content: center;
    flex: 1.05;
    padding: 72rpx 56rpx;
    background: var(--color-primary-gradient, var(--color-primary));
    overflow: hidden;
  }

  .auth-brand::after {
    content: '';
    position: absolute;
    right: -160rpx;
    bottom: -160rpx;
    width: 420rpx;
    height: 420rpx;
    border-radius: var(--radius-round);
    background: var(--color-bg-overlay);
    opacity: 0.16;
  }

  .auth-brand-title {
    color: var(--color-text-inverse);
    font-size: var(--font-size-3xl);
  }

  .auth-brand-sub {
    color: var(--color-text-inverse);
    opacity: 0.86;
  }

  .auth-points {
    display: flex;
  }

  .auth-point {
    /* 品牌面板上的玻璃拟态卡片：令牌色 + 透明度，不引入裸色。
       不支持 color-mix 的环境回退到令牌遮罩色，文字对比度不受影响。 */
    background: var(--color-bg-overlay);
    background: color-mix(in srgb, var(--color-text-inverse) 16%, transparent);
    border-color: transparent;
    box-shadow: none;
  }

  .auth-point-icon {
    background: var(--color-text-inverse);
    color: var(--color-primary);
  }

  .auth-point-label {
    color: var(--color-text-inverse);
  }

  .auth-point-desc {
    color: var(--color-text-inverse);
    opacity: 0.78;
  }

  .auth-foot {
    color: var(--color-text-inverse);
    opacity: 0.7;
  }

  .auth-form-col {
    justify-content: center;
    flex: 1;
    padding: 64rpx 56rpx;
  }

  .auth-card {
    padding: 0;
    border: none;
    border-radius: 0;
    box-shadow: none;
    background: transparent;
  }
}

@media (prefers-reduced-motion: reduce) {
  .auth-brand,
  .auth-card,
  .auth-point,
  .auth-orb {
    animation: none;
  }
}
</style>
