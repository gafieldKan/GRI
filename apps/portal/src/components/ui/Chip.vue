<template>
  <view class="chip" :class="chipClasses" @click="$emit('click')" :style="chipStyles">
    <text v-if="icon" class="chip-icon">{{ icon }}</text>
    <text class="chip-label">{{ label }}</text>
    <text v-if="count !== undefined" class="chip-count">{{ count }}</text>
    <text v-if="removable" class="chip-remove" @click.stop="$emit('remove')">✕</text>
  </view>
</template>

<script>
export default {
  name: 'Chip',
  props: {
    label: {
      type: String,
      required: true
    },
    icon: {
      type: String,
      default: ''
    },
    count: {
      type: Number,
      default: undefined
    },
    color: {
      type: String,
      default: 'blue' // 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'gray'
    },
    variant: {
      type: String,
      default: 'filled' // 'filled' | 'outlined' | 'soft'
    },
    size: {
      type: String,
      default: 'medium' // 'small' | 'medium' | 'large'
    },
    removable: {
      type: Boolean,
      default: false
    },
    selected: {
      type: Boolean,
      default: false
    },
    disabled: {
      type: Boolean,
      default: false
    }
  },
  emits: ['click', 'remove'],
  computed: {
    chipClasses() {
      return [
        `chip--${this.variant}`,
        `chip--${this.size}`,
        `chip--${this.color}`,
        { 'chip--selected': this.selected },
        { 'chip--disabled': this.disabled }
      ]
    },
    chipStyles() {
      if (this.variant === 'outlined') {
        return { borderColor: this.getColorValue(this.color) }
      }
      if (this.variant === 'soft') {
        return { backgroundColor: this.getColorValue(this.color, 0.15) }
      }
      if (this.selected && this.variant !== 'filled') {
        return { backgroundColor: this.getColorValue(this.color) }
      }
      return {}
    }
  },
  methods: {
    getColorValue(color, alpha = 1) {
      const colors = {
        blue: [74, 108, 247],
        green: [82, 196, 26],
        orange: [250, 173, 20],
        red: [255, 77, 79],
        purple: [114, 46, 209],
        gray: [153, 153, 166]
      }
      const rgb = colors[color] || colors.blue
      return alpha === 1 ? `rgb(${rgb.join(',')})` : `rgba(${rgb.join(',')}, ${alpha})`
    }
  }
}
</script>

<style scoped>
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
  border-radius: 999px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all var(--transition-fast, 150ms ease);
  user-select: none;
}

.chip:active:not(.chip--disabled) {
  transform: scale(0.98);
}

.chip--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Sizes */
.chip--small {
  padding: 4px 10px;
  font-size: 11px;
  height: 24px;
}

.chip--medium {
  padding: 6px 12px;
  font-size: 13px;
  height: 28px;
}

.chip--large {
  padding: 8px 16px;
  font-size: 14px;
  height: 36px;
}

/* Variants - Filled */
.chip--filled {
  color: #fff;
  background: var(--color-primary, #4a6cf7);
}

.chip--filled.chip--blue { background: #4a6cf7; }
.chip--filled.chip--green { background: #52c41a; }
.chip--filled.chip--orange { background: #faad14; color: #1a1a2e; }
.chip--filled.chip--red { background: #ff4d4f; }
.chip--filled.chip--purple { background: #722ed1; }
.chip--filled.chip--gray { background: #999; }

.chip--filled.chip--selected {
  box-shadow: 0 0 0 2px rgba(74, 108, 247, 0.3);
}

/* Variants - Outlined */
.chip--outlined {
  background: transparent;
  color: var(--color-primary, #4a6cf7);
}

.chip--outlined.chip--blue { color: #4a6cf7; }
.chip--outlined.chip--green { color: #52c41a; }
.chip--outlined.chip--orange { color: #faad14; }
.chip--outlined.chip--red { color: #ff4d4f; }
.chip--outlined.chip--purple { color: #722ed1; }
.chip--outlined.chip--gray { color: #999; }

.chip--outlined.chip--selected {
  background: var(--color-primary, #4a6cf7);
  color: #fff;
}

/* Variants - Soft */
.chip--soft {
  background: rgba(74, 108, 247, 0.1);
  color: var(--color-primary, #4a6cf7);
}

.chip--soft.chip--blue { color: #4a6cf7; background: rgba(74, 108, 247, 0.1); }
.chip--soft.chip--green { color: #52c41a; background: rgba(82, 196, 26, 0.1); }
.chip--soft.chip--orange { color: #faad14; background: rgba(250, 173, 20, 0.1); }
.chip--soft.chip--red { color: #ff4d4f; background: rgba(255, 77, 79, 0.1); }
.chip--soft.chip--purple { color: #722ed1; background: rgba(114, 46, 209, 0.1); }
.chip--soft.chip--gray { color: #999; background: rgba(153, 153, 166, 0.1); }

.chip--soft.chip--selected {
  background: var(--color-primary, #4a6cf7);
  color: #fff;
}

/* Elements */
.chip-icon {
  font-size: 1em;
  line-height: 1;
}

.chip-count {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  font-size: 10px;
  font-weight: 700;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.15);
  color: inherit;
}

.chip--outlined .chip-count {
  background: currentColor;
}

.chip--soft .chip-count {
  background: currentColor;
}

.chip-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin-left: 2px;
  font-size: 10px;
  border-radius: 50%;
  color: inherit;
  opacity: 0.7;
  transition: opacity var(--transition-fast);
}

.chip-remove:hover {
  opacity: 1;
  background: rgba(0, 0, 0, 0.1);
}

.chip--disabled .chip-remove {
  display: none;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .chip--filled.chip--orange {
    color: #1a1a2e;
  }

  .chip--outlined {
    color: var(--color-primary, #7c94ff);
  }

  .chip--outlined.chip--blue { color: #7c94ff; }
  .chip--outlined.chip--green { color: #95de64; }
  .chip--outlined.chip--orange { color: #ffc53d; }
  .chip--outlined.chip--red { color: #ff7875; }
  .chip--outlined.chip--purple { color: #b39aff; }
  .chip--outlined.chip--gray { color: #aaa; }

  .chip--outlined.chip--selected {
    background: var(--color-primary, #7c94ff);
    color: #1a1a2e;
  }

  .chip--soft {
    color: var(--color-primary, #7c94ff);
  }

  .chip--soft.chip--blue { color: #7c94ff; background: rgba(124, 148, 255, 0.15); }
  .chip--soft.chip--green { color: #95de64; background: rgba(149, 222, 100, 0.15); }
  .chip--soft.chip--orange { color: #ffc53d; background: rgba(255, 197, 61, 0.15); }
  .chip--soft.chip--red { color: #ff7875; background: rgba(255, 120, 117, 0.15); }
  .chip--soft.chip--purple { color: #b39aff; background: rgba(179, 154, 255, 0.15); }
  .chip--soft.chip--gray { color: #aaa; background: rgba(170, 170, 170, 0.15); }

  .chip--soft.chip--selected {
    background: var(--color-primary, #7c94ff);
    color: #1a1a2e;
  }
}
</style>