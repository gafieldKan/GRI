<template>
  <view class="field" :class="{ 'field--invalid': !!error, 'field--disabled': disabled }">
    <view class="field-head">
      <text class="field-label" :id="labelId">{{ label }}</text>
      <text v-if="optional" class="field-optional">选填</text>
    </view>

    <view class="field-control">
      <input
        class="field-input"
        :value="modelValue"
        :type="type"
        :password="type === 'password'"
        :placeholder="placeholder"
        :maxlength="maxlength"
        :disabled="disabled"
        :confirm-type="confirmType"
        :aria-label="label"
        :aria-invalid="error ? 'true' : 'false'"
        :aria-describedby="describedBy"
        @input="onInput"
        @confirm="$emit('confirm')"
      />
    </view>

    <text v-if="error" class="field-error" role="alert">{{ error }}</text>
    <text v-else-if="hint" class="field-hint" :id="hintId">{{ hint }}</text>
  </view>
</template>

<script>
let uid = 0

/**
 * 带标签 / 提示 / 错误态的输入项。
 * v-model 透传（update:modelValue）与 @confirm 事件，语义与裸 <input> 一致。
 * 视觉全部走设计令牌。
 */
export default {
  name: 'FormField',
  props: {
    modelValue: {
      type: [String, Number],
      default: ''
    },
    label: {
      type: String,
      required: true
    },
    type: {
      type: String,
      default: 'text'
    },
    placeholder: {
      type: String,
      default: ''
    },
    maxlength: {
      type: [Number, String],
      default: -1 // -1 = 不限制（与 uni-app <input> 语义一致，保持登录页原行为）
    },
    confirmType: {
      type: String,
      default: 'next'
    },
    hint: {
      type: String,
      default: ''
    },
    error: {
      type: String,
      default: ''
    },
    optional: {
      type: Boolean,
      default: false
    },
    disabled: {
      type: Boolean,
      default: false
    }
  },
  emits: ['update:modelValue', 'confirm'],
  data() {
    const id = ++uid
    return {
      labelId: `gri-field-label-${id}`,
      hintId: `gri-field-hint-${id}`
    }
  },
  computed: {
    describedBy() {
      if (this.error || this.hint) return this.hintId
      return undefined
    }
  },
  mounted() {
    this.syncNativeAria()
  },
  updated() {
    this.syncNativeAria()
  },
  methods: {
    onInput(event) {
      const value = event?.detail?.value ?? event?.target?.value ?? ''
      this.$emit('update:modelValue', value)
    },
    /**
     * uni-app H5 会把额外属性挂在 `uni-input` 宿主上，内层原生 <input> 拿不到，
     * 读屏因而无法取到字段名/错误态。这里把 aria-* 补写到原生 input（仅 H5 生效，
     * 其它端无 $el.querySelector 时直接 no-op）。
     */
    syncNativeAria() {
      if (typeof window === 'undefined' || !this.$el?.querySelector) return
      const native = this.$el.querySelector('input')
      if (!native) return
      native.setAttribute('aria-label', this.label)
      native.setAttribute('aria-invalid', this.error ? 'true' : 'false')
      if (this.error || this.hint) native.setAttribute('aria-describedby', this.hintId)
    }
  }
}
</script>

<style scoped>
.field {
  margin-bottom: var(--spacing-md);
}

.field-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-xs);
  margin-bottom: var(--spacing-xs);
}

.field-label {
  color: var(--color-text-primary);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}

.field-optional {
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs);
}

.field-control {
  position: relative;
  display: flex;
  align-items: center;
  padding: 0 var(--spacing-sm);
  background: var(--color-bg-input);
  border: 1px solid var(--color-border-input);
  border-radius: var(--radius-md);
  transition: border-color var(--transition-fast), background var(--transition-fast),
    box-shadow var(--transition-fast);
}

.field-control:hover {
  border-color: var(--color-primary);
}

.field-control:focus-within {
  background: var(--color-bg-card);
  border-color: var(--color-primary);
  box-shadow: 0 0 0 4rpx var(--color-primary-light);
}

.field--invalid .field-control {
  border-color: var(--color-danger);
}

.field--invalid .field-control:focus-within {
  box-shadow: 0 0 0 4rpx var(--color-danger-light);
}

.field--disabled .field-control {
  opacity: 0.6;
}

.field-input {
  width: 100%;
  height: 88rpx;
  color: var(--color-text-primary);
  font-size: var(--font-size-base);
  background: transparent;
  border: none;
}

.field-input:focus-visible {
  outline: none;
}

.field-error,
.field-hint {
  display: block;
  margin-top: var(--spacing-xs);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-base);
}

.field-error {
  color: var(--color-danger);
}

.field-hint {
  color: var(--color-text-tertiary);
}
</style>
