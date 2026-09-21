<template>
  <view class="quick-action" @click="onClick">
    <view class="quick-action-icon" :style="{ backgroundColor: color + '20' }">
      <text>{{ icon }}</text>
    </view>
    <text class="quick-action-label">{{ label }}</text>
    <text class="quick-action-desc">{{ desc }}</text>
    <view v-if="badge" class="quick-action-badge">{{ String(badge) }}</view>
  </view>
</template>

<script>
export default {
  name: 'QuickAction',
  props: {
    icon: {
      type: String,
      required: true
    },
    label: {
      type: String,
      required: true
    },
    desc: {
      type: String,
      required: true
    },
    color: {
      type: String,
      required: true
    },
    badge: {
      type: [String, Boolean, Object],
      default: null
    },
    handler: {
      type: Function,
      required: false,
      default: () => {}
    }
  },
  methods: {
    onClick() {
      if (this.handler) {
        this.handler()
      }
    }
  }
}
</script>

<style scoped>
.quick-action {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 12px;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  border: 1px solid var(--color-border, #e8e8f0);
  cursor: pointer;
  transition: all var(--transition-fast);
  position: relative;
}

.quick-action:active {
  transform: scale(0.97);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}

.quick-action-icon {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  font-size: 20px;
  margin-bottom: 10px;
}

.quick-action-label {
  font-size: 13px;
  font-weight: 600;
  color: #1a1a2e;
  text-align: center;
  margin-bottom: 2px;
}

.quick-action-desc {
  font-size: 11px;
  color: #999;
  text-align: center;
}

.quick-action-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 2px 6px;
  font-size: 9px;
  font-weight: 700;
  color: #fff;
  background: #ff4d4f;
  border-radius: 8px;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .quick-action {
    background: var(--color-bg-card, #252542);
    border-color: var(--color-border, #3d3d5c);
  }

  .quick-action:active {
    background: var(--color-bg-elevated, #2d2d4a);
  }

  .quick-action-label {
    color: var(--color-text-primary, #e8e8f0);
  }

  .quick-action-desc {
    color: var(--color-text-tertiary, #888);
  }
}
</style>