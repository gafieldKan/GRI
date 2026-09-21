<template>
  <view class="page-header">
    <view class="header-main">
      <text class="header-title">{{ title }}</text>
      <text v-if="subtitle" class="header-subtitle">{{ subtitle }}</text>
    </view>
    <view class="header-actions" v-if="$slots.actions">
      <slot name="actions" />
    </view>
    <view class="header-actions" v-else-if="actions.length">
      <component
        v-for="(action, index) in actions"
        :key="index"
        :is="action.component || 'button'"
        :class="['header-action', action.class]"
        @click="action.handler"
        v-bind="action.props"
      >
        {{ action.label }}
      </component>
    </view>
  </view>
</template>

<script>
export default {
  name: 'PageHeader',
  props: {
    title: {
      type: String,
      required: true
    },
    subtitle: {
      type: String,
      default: ''
    },
    actions: {
      type: Array,
      default: () => []
    }
  }
}
</script>

<style scoped>
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 16px;
  background: #fff;
  border-bottom: 1px solid var(--color-border, #e8e8f0);
  position: sticky;
  top: 0;
  z-index: 10;
}

.header-main {
  flex: 1;
  min-width: 0;
}

.header-title {
  display: block;
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text-primary, #1a1a2e);
  line-height: 1.3;
  margin-bottom: 2px;
}

.header-subtitle {
  display: block;
  font-size: 13px;
  color: var(--color-text-tertiary, #999);
  line-height: 1.4;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  margin-left: 16px;
}

.header-action {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-primary, #4a6cf7);
  background: var(--color-primary-light, rgba(74, 108, 247, 0.1));
  border: none;
  border-radius: 20px;
  cursor: pointer;
  transition: all var(--transition-fast, 150ms ease);
}

.header-action:active {
  transform: scale(0.98);
  background: var(--color-primary-hover, #3b5bd9);
  color: #fff;
}

.header-action.secondary {
  color: var(--color-text-secondary, #59596b);
  background: var(--color-bg-secondary, #f0f0f5);
}

.header-action.secondary:active {
  background: var(--color-border, #e8e8f0);
}

.header-action.icon-only {
  padding: 8px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  justify-content: center;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .page-header {
    background: var(--color-bg-card, #252542);
    border-color: var(--color-border, #3d3d5c);
  }

  .header-title {
    color: var(--color-text-primary, #e8e8f0);
  }

  .header-subtitle {
    color: var(--color-text-tertiary, #888);
  }

  .header-action {
    color: var(--color-primary, #7c94ff);
    background: rgba(124, 148, 255, 0.15);
  }

  .header-action:active {
    background: var(--color-primary, #7c94ff);
    color: #1a1a2e;
  }

  .header-action.secondary {
    color: var(--color-text-secondary, #a8a8c0);
    background: var(--color-bg-elevated, #2d2d4a);
  }

  .header-action.secondary:active {
    background: var(--color-border, #3d3d5c);
  }
}
</style>