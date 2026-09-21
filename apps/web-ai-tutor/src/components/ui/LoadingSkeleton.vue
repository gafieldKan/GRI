<template>
  <view class="loading-skeleton" v-if="loading">
    <template v-if="variant === 'card'">
      <view class="skeleton-card">
        <view v-for="i in rows" :key="i" class="skeleton-row">
          <view v-if="i === 1 && hasAvatar" class="skeleton-avatar" />
          <view class="skeleton-lines">
            <view class="skeleton-line" :style="{ width: titleWidth }" />
            <view v-if="i > 1" class="skeleton-line" :style="{ width: contentWidth }" />
            <view v-if="i > 1" class="skeleton-line" :style="{ width: contentWidth * 0.7 }" />
          </view>
        </view>
      </view>
    </template>

    <template v-else-if="variant === 'list'">
      <view class="skeleton-list">
        <view v-for="i in rows" :key="i" class="skeleton-list-item">
          <view v-if="hasAvatar" class="skeleton-avatar" />
          <view class="skeleton-lines">
            <view class="skeleton-line" :style="{ width: titleWidth }" />
            <view class="skeleton-line" :style="{ width: contentWidth }" />
          </view>
        </view>
      </view>
    </template>

    <template v-else-if="variant === 'chart'">
      <view class="skeleton-chart">
        <view class="skeleton-line" style="width: 100%; height: 200px; border-radius: 12px;" />
      </view>
    </template>

    <template v-else>
      <view class="skeleton-default">
        <view v-for="i in rows" :key="i" class="skeleton-line" :style="{ width: i === 1 ? titleWidth : contentWidth }" />
      </view>
    </template>
  </view>
</template>

<script>
export default {
  name: 'LoadingSkeleton',
  props: {
    loading: {
      type: Boolean,
      default: true
    },
    variant: {
      type: String,
      default: 'card' // 'card' | 'list' | 'chart' | 'default'
    },
    rows: {
      type: Number,
      default: 3
    },
    hasAvatar: {
      type: Boolean,
      default: true
    },
    titleWidth: {
      type: String,
      default: '40%'
    },
    contentWidth: {
      type: String,
      default: '60%'
    }
  }
}
</script>

<style scoped>
.loading-skeleton {
  width: 100%;
}

.skeleton-card {
  background: var(--color-bg-card, #fff);
  border-radius: var(--radius-lg, 16px);
  padding: 16px;
  box-shadow: var(--shadow-sm, 0 2px 8px rgba(0,0,0,0.06));
  border: 1px solid var(--color-border, #e8e8f0);
}

.skeleton-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.skeleton-list-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--color-bg-card, #fff);
  border-radius: var(--radius-md, 10px);
  box-shadow: var(--shadow-sm, 0 2px 8px rgba(0,0,0,0.06));
}

.skeleton-chart {
  background: var(--color-bg-card, #fff);
  border-radius: var(--radius-lg, 16px);
  padding: 16px;
  box-shadow: var(--shadow-sm, 0 2px 8px rgba(0,0,0,0.06));
}

.skeleton-default {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.skeleton-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.skeleton-row:last-child {
  margin-bottom: 0;
}

.skeleton-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  flex-shrink: 0;
}

.skeleton-lines {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skeleton-line {
  height: 12px;
  border-radius: 6px;
  background: linear-gradient(
    90deg,
    var(--color-border, #e8e8f0) 25%,
    var(--color-border-light, #f0f0f5) 50%,
    var(--color-border, #e8e8f0) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .skeleton-card,
  .skeleton-list-item,
  .skeleton-chart {
    background: var(--color-bg-card, #252542);
    border-color: var(--color-border, #3d3d5c);
  }

  .skeleton-line {
    background: linear-gradient(
      90deg,
      var(--color-border, #3d3d5c) 25%,
      var(--color-border-light, #33334d) 50%,
      var(--color-border, #3d3d5c) 75%
    );
    background-size: 200% 100%;
  }
}
</style>