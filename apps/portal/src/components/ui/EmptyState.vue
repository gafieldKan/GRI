<template>
  <view class="empty-state">
    <view class="empty-illustration" v-if="illustration">
      <component :is="illustration" />
    </view>
    <view class="empty-icon" v-else-if="icon">{{ icon }}</view>
    <view class="empty-image" v-else-if="image">
      <image :src="image" mode="aspectFit" />
    </view>

    <text class="empty-title">{{ title }}</text>
    <text class="empty-description" v-if="description">{{ description }}</text>
    <slot name="description" />

    <view class="empty-actions" v-if="actions.length || $slots.actions">
      <component
        v-for="(action, index) in actions"
        :key="index"
        :is="action.component || 'button'"
        :class="['empty-action', action.class]"
        @click="action.handler"
        v-bind="action.props"
      >
        {{ action.label }}
      </component>
      <slot name="actions" />
    </view>
  </view>
</template>

<script>
export default {
  name: 'EmptyState',
  props: {
    title: {
      type: String,
      required: true
    },
    description: {
      type: String,
      default: ''
    },
    icon: {
      type: String,
      default: ''
    },
    image: {
      type: String,
      default: ''
    },
    illustration: {
      type: [Object, String],
      default: null
    },
    actions: {
      type: Array,
      default: () => []
    }
  }
}
</script>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
  background: var(--color-bg-card, #fff);
  border-radius: var(--radius-lg, 16px);
}

.empty-illustration {
  width: 120px;
  height: 120px;
  margin-bottom: 20px;
  opacity: 0.8;
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 20px;
  opacity: 0.7;
}

.empty-image {
  width: 120px;
  height: 120px;
  margin-bottom: 20px;
  opacity: 0.8;
}

.empty-title {
  display: block;
  font-size: 17px;
  font-weight: 600;
  color: var(--color-text-primary, #1a1a2e);
  margin-bottom: 8px;
}

.empty-description {
  display: block;
  font-size: 14px;
  color: var(--color-text-secondary, #59596b);
  line-height: 1.6;
  max-width: 280px;
  margin-bottom: 24px;
}

.empty-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
}

.empty-action {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  border: none;
  border-radius: 20px;
  cursor: pointer;
  transition: all var(--transition-fast, 150ms ease);
}

.empty-action.primary {
  color: #fff;
  background: var(--color-primary, #4a6cf7);
}

.empty-action.primary:active {
  background: var(--color-primary-hover, #3b5bd9);
  transform: scale(0.98);
}

.empty-action.secondary {
  color: var(--color-text-secondary, #59596b);
  background: var(--color-bg-secondary, #f0f0f5);
}

.empty-action.secondary:active {
  background: var(--color-border, #e8e8f0);
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .empty-state {
    background: var(--color-bg-card, #252542);
  }

  .empty-title {
    color: var(--color-text-primary, #e8e8f0);
  }

  .empty-description {
    color: var(--color-text-secondary, #a8a8c0);
  }

  .empty-action.secondary {
    color: var(--color-text-secondary, #a8a8c0);
    background: var(--color-bg-elevated, #2d2d4a);
  }

  .empty-action.secondary:active {
    background: var(--color-border, #3d3d5c);
  }
}
</style>