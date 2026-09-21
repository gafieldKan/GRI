<template>
  <view v-if="hasError" class="error-boundary-fallback">
    <view class="error-icon">⚠️</view>
    <text class="error-title">出错了</text>
    <text class="error-message">{{ error?.message || '组件加载失败' }}</text>
    <view class="error-actions">
      <button class="retry-btn" @click="retry" :disabled="retryCount >= maxRetries">
        {{ retryCount >= maxRetries ? '重试次数已用完' : '重试' }}
      </button>
      <button class="reset-btn" @click="reset">重置</button>
    </view>
    <view class="error-details" v-if="showDetails && error">
      <text class="details-summary">错误详情</text>
      <text class="details-content">{{ error?.stack || error?.message }}</text>
    </view>
  </view>
  <component v-else-if="hasError && fallback" :is="fallback" />
  <slot v-else />
</template>

<script>
import { ref, onErrorCaptured, watch } from 'vue'
import { logError, normalizeError } from '@/utils/errorHandler.js'

export default {
  name: 'ErrorBoundary',
  inheritAttrs: false,
  props: {
    // 降级 UI
    fallback: {
      type: [String, Object, Function],
      default: null
    },
    // 自定义渲染函数
    fallbackRender: {
      type: Function,
      default: null
    },
    // 错误回调
    onError: {
      type: Function,
      default: null
    },
    // 是否记录日志
    logError: {
      type: Boolean,
      default: true
    },
    // 重置键（变化时重置错误状态）
    resetKeys: {
      type: Array,
      default: () => []
    },
    // 是否显示错误详情（开发环境）
    showDetails: {
      type: Boolean,
      default: false
    }
  },
  emits: ['error', 'reset', 'retry'],
  setup(props, { emit, slots }) {
    const hasError = ref(false)
    const error = ref(null)
    const errorInfo = ref(null)
    const retryCount = ref(0)
    const maxRetries = 3

    // 捕获后代组件错误
    const handleError = (err, instance, info) => {
      const appError = normalizeError(err, {
        component: instance?.$options?.name,
        lifecycle: info
      })

      hasError.value = true
      error.value = appError
      errorInfo.value = info

      if (props.logError) {
        logError(appError)
      }

      if (props.onError) {
        props.onError(appError, info)
      }

      emit('error', appError, info)

      // 阻止错误继续向上传播
      return true
    }

    onErrorCaptured(handleError)

    const retry = () => {
      if (retryCount.value >= maxRetries) {
        return
      }
      retryCount.value++
      hasError.value = false
      error.value = null
      errorInfo.value = null
      emit('retry', retryCount.value)
    }

    const reset = () => {
      hasError.value = false
      error.value = null
      errorInfo.value = null
      retryCount.value = 0
      emit('reset')
    }

    // 监听重置键变化
    watch(() => props.resetKeys.join(','), () => {
      reset()
    })

    // 暴露方法供插槽使用
    const expose = { retry, reset }

    return { hasError, error, errorInfo, retryCount, maxRetries, retry, reset, ...expose }
  }
}
</script>

<style scoped>
.error-boundary-fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  border: 1px solid #e8e8f0;
  text-align: center;
  gap: 16px;
  min-width: 200px;
}

.error-icon {
  font-size: 48px;
}

.error-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #1a1a2e;
}

.error-message {
  margin: 0;
  font-size: 14px;
  color: #666;
  line-height: 1.5;
}

.error-actions {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

.retry-btn,
.reset-btn {
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.retry-btn {
  background: #4a6cf7;
  color: #fff;
}

.retry-btn:active:not(:disabled) {
  background: #3b5bd9;
  transform: scale(0.98);
}

.retry-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.reset-btn {
  background: #f5f5f5;
  color: #666;
  border: 1px solid #e8e8f0;
}

.reset-btn:active {
  background: #e8e8f0;
}

.error-details {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid #e8e8f0;
  text-align: left;
  width: 100%;
}

.details-summary {
  cursor: pointer;
  font-size: 13px;
  color: #666;
  margin-bottom: 8px;
}

.details-content {
  margin: 0;
  padding: 12px;
  background: #f5f5f5;
  border-radius: 8px;
  font-size: 11px;
  color: #666;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .error-boundary-fallback {
    background: var(--color-bg-card, #252542);
    border-color: var(--color-border, #3d3d5c);
  }

  .error-title {
    color: var(--color-text-primary, #e8e8f0);
  }

  .error-message {
    color: var(--color-text-secondary, #a8a8c0);
  }

  .retry-btn {
    background: #7c94ff;
    color: #1a1a2e;
  }

  .retry-btn:active:not(:disabled) {
    background: #5a7cff;
  }

  .reset-btn {
    background: var(--color-bg-elevated, #2d2d4a);
    color: var(--color-text-secondary, #a8a8c0);
    border-color: var(--color-border, #3d3d5c);
  }

  .reset-btn:active {
    background: var(--color-bg-panel, #252542);
  }

  .details-content {
    background: var(--color-bg-elevated, #2d2d4a);
    color: var(--color-text-secondary, #a8a8c0);
  }

  .details-summary {
    color: var(--color-text-tertiary, #888);
  }
}
</style>