<template>
  <view class="brand" :class="[`brand--${size}`, { 'brand--inline': inline }]">
    <view class="brand-mark" :class="`brand-mark--${variant}`" aria-hidden="true">
      <text class="brand-glyph">GRI</text>
    </view>
    <view v-if="showWordmark" class="brand-word">
      <text class="brand-name" :class="`brand-name--${tone}`">{{ title }}</text>
      <text v-if="subtitle" class="brand-sub" :class="`brand-sub--${tone}`">{{ subtitle }}</text>
    </view>
  </view>
</template>

<script>
/**
 * 品牌标识：GRI 徽标 + 可选字标。
 * 颜色一律取自设计令牌（styles/tokens），无裸色。
 * variant: 'brand'   —— 渐变徽标（浅色底上用）
 *          'inverse' —— 反白徽标（渐变/深色底上用）
 */
export default {
  name: 'BrandMark',
  props: {
    size: {
      type: String,
      default: 'md' // 'sm' | 'md' | 'lg'
    },
    variant: {
      type: String,
      default: 'brand' // 'brand' | 'inverse'
    },
    tone: {
      type: String,
      default: 'default' // 'default' | 'inverse'
    },
    title: {
      type: String,
      default: 'GRI 组织管理台'
    },
    subtitle: {
      type: String,
      default: ''
    },
    showWordmark: {
      type: Boolean,
      default: true
    },
    inline: {
      type: Boolean,
      default: false
    }
  }
}
</script>

<style scoped>
.brand {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.brand--inline {
  flex-direction: row;
  align-items: center;
  gap: var(--spacing-sm);
}

.brand-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: var(--radius-lg);
  letter-spacing: 1rpx;
  transition: transform var(--transition-base), box-shadow var(--transition-base);
}

.brand-mark--brand {
  background: var(--color-primary-gradient, var(--color-primary));
  color: var(--color-text-inverse);
  box-shadow: var(--shadow-md);
}

.brand-mark--inverse {
  background: var(--color-text-inverse);
  color: var(--color-primary);
  box-shadow: var(--shadow-lg);
}

.brand--sm .brand-mark {
  width: 56rpx;
  height: 56rpx;
  border-radius: var(--radius-md);
}

.brand--md .brand-mark {
  width: 88rpx;
  height: 88rpx;
}

.brand--lg .brand-mark {
  width: 120rpx;
  height: 120rpx;
  border-radius: var(--radius-xl);
}

.brand-glyph {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-bold);
  letter-spacing: 2rpx;
}

.brand--md .brand-glyph {
  font-size: var(--font-size-xl);
}

.brand--lg .brand-glyph {
  font-size: var(--font-size-3xl);
}

.brand-word {
  min-width: 0;
}

.brand-name {
  display: block;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-tight);
}

.brand-name--default {
  color: var(--color-text-primary);
}

.brand-name--inverse {
  color: var(--color-text-inverse);
}

.brand-sub {
  display: block;
  margin-top: 6rpx;
  font-size: var(--font-size-xs);
  letter-spacing: 1rpx;
}

.brand-sub--default {
  color: var(--color-text-tertiary);
}

.brand-sub--inverse {
  color: var(--color-text-inverse);
  opacity: 0.82;
}
</style>
