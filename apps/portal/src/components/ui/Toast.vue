<template>
  <transition-group name="toast" tag="div" class="toast-container">
    <div
      v-for="toast in toasts"
      :key="toast.id"
      :class="[
        'toast-item',
        'toast-' + toast.type,
        'toast-' + toast.position,
        toast.customClass
      ]"
      :style="toastStyle(toast)"
      @click="toast.type !== 'loading' && removeToast(toast.id)"
    >
      <div class="toast-content">
        <div v-if="toast.loading" class="toast-loading">
          <div class="spinner" :style="{ borderTopColor: toast.color }"></div>
        </div>
        <div v-else-if="toast.icon" class="toast-icon" :style="{ color: toast.color }">
          {{ toast.icon }}
        </div>
        <text class="toast-message" :style="{ color: toast.color }">{{ toast.message }}</text>
      </div>
      <div v-if="toast.duration > 0" class="toast-progress" :style="progressStyle(toast)"></div>
    </div>
  </transition-group>
</template>

<script>
import { ref, computed } from 'vue'

// Toast 类型
const ToastType = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
  LOADING: 'loading',
  CUSTOM: 'custom'
}

// Toast 位置
const ToastPosition = {
  TOP: 'top',
  CENTER: 'center',
  BOTTOM: 'bottom'
}

// 单例状态
const toasts = ref([])
let toastId = 0

// 默认配置
const defaultOptions = {
  duration: 2500,
  position: ToastPosition.CENTER,
  mask: false,
  onClose: null
}

// 图标映射
const typeIcons = {
  [ToastType.SUCCESS]: '✓',
  [ToastType.ERROR]: '✕',
  [ToastType.WARNING]: '⚠',
  [ToastType.INFO]: 'ℹ',
  [ToastType.LOADING]: '⟳',
  [ToastType.CUSTOM]: ''
}

// 主题色映射
const typeColors = {
  [ToastType.SUCCESS]: '#52c41a',
  [ToastType.ERROR]: '#ff4d4f',
  [ToastType.WARNING]: '#faad14',
  [ToastType.INFO]: '#4a6cf7',
  [ToastType.LOADING]: '#4a6cf7',
  [ToastType.CUSTOM]: '#4a6cf7'
}

// 创建 Toast 实例
function createToast(options = {}) {
  const id = ++toastId
  const opts = { ...defaultOptions, ...options }

  const toast = {
    id,
    type: opts.type || ToastType.INFO,
    message: opts.message || '',
    duration: opts.duration,
    position: opts.position,
    mask: opts.mask,
    icon: opts.icon || typeIcons[opts.type],
    color: opts.color || typeColors[opts.type],
    loading: opts.type === ToastType.LOADING,
    customClass: opts.customClass,
    onClose: opts.onClose,
    visible: true,
    createdAt: Date.now()
  }

  toasts.value.push(toast)

  // 自动关闭
  if (toast.duration > 0) {
    setTimeout(() => {
      removeToast(id)
    }, toast.duration)
  }

  return {
    id,
    close: () => removeToast(id),
    update: (opts) => updateToast(id, opts)
  }
}

// 移除 Toast
function removeToast(id) {
  const index = toasts.value.findIndex(t => t.id === id)
  if (index >= 0) {
    const toast = toasts.value[index]
    if (toast.onClose) toast.onClose()
    toasts.value.splice(index, 1)
  }
}

// 更新 Toast
function updateToast(id, options) {
  const toast = toasts.value.find(t => t.id === id)
  if (toast) {
    Object.assign(toast, options)
  }
}

// 清除所有
function clearAll() {
  toasts.value.forEach(t => {
    if (t.onClose) t.onClose()
  })
  toasts.value = []
}

// 便捷方法
const toast = {
  success: (message, options = {}) => createToast({ ...options, message, type: 'success' }),
  error: (message, options = {}) => createToast({ ...options, message, type: 'error' }),
  warning: (message, options = {}) => createToast({ ...options, message, type: 'warning' }),
  info: (message, options = {}) => createToast({ ...options, message, type: 'info' }),
  loading: (message, options = {}) => createToast({ ...options, message, type: 'loading', duration: 0 }),
  custom: (options = {}) => createToast({ ...options, type: 'custom' }),
  clear: clearAll,
  remove: removeToast,
  update: updateToast
}

export default {
  name: 'ToastContainer',
  setup() {
    return { toasts, ToastType }
  },
  methods: {
    removeToast,
    toastStyle(toast) {
      const positions = {
        top: { top: '20px', bottom: 'auto' },
        center: { top: '50%', bottom: 'auto', transform: 'translateY(-50%)' },
        bottom: { bottom: '20px', top: 'auto' }
      }
      return {
        ...positions[toast.position],
        left: '16px',
        right: '16px',
        zIndex: 9999 + toast.id % 100
      }
    },
    progressStyle(toast) {
      const elapsed = Date.now() - toast.createdAt
      const progress = Math.min(100, (elapsed / toast.duration) * 100)
      return {
        width: `${100 - progress}%`,
        backgroundColor: toast.color
      }
    }
  }
}

export const useToast = () => toast
</script>

<style scoped>
.toast-container {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  z-index: 9999;
}

.toast-item {
  pointer-events: auto;
  display: flex;
  align-items: center;
  min-width: 200px;
  max-width: 320px;
  padding: 12px 16px;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  animation: slideIn 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.toast-item.toast-top {
  align-self: flex-start;
  margin-top: 20px;
}

.toast-item.toast-center {
  align-self: center;
}

.toast-item.toast-bottom {
  align-self: flex-end;
  margin-bottom: 20px;
}

.toast-content {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.toast-loading {
  display: flex;
  align-items: center;
  justify-content: center;
}

.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid transparent;
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.toast-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.toast-message {
  flex: 1;
  font-size: 14px;
  line-height: 1.5;
  word-break: break-word;
}

.toast-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 3px;
  border-radius: 0 0 8px 8px;
  transition: width 0.1s linear, opacity 0.3s;
}

.toast-container {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px;
}

.toast-container.toast-top {
  align-items: flex-start;
  padding-top: 20px;
}

.toast-container.toast-center {
  align-items: center;
  justify-content: center;
}

.toast-container.toast-bottom {
  align-items: flex-end;
  padding-bottom: 20px;
}

/* Toast type styles */
.toast-item.toast-success {
  background: #f6ffed;
  border: 1px solid #b7eb8f;
  color: #52c41a;
}

.toast-item.toast-error {
  background: #fff1f0;
  border: 1px solid #ffccc7;
  color: #ff4d4f;
}

.toast-item.toast-warning {
  background: #fffbe6;
  border: 1px solid #ffe58f;
  color: #faad14;
}

.toast-item.toast-info {
  background: #e6f7ff;
  border: 1px solid #91d5ff;
  color: #4a6cf7;
}

.toast-item.toast-loading {
  background: #e6f7ff;
  border: 1px solid #91d5ff;
  color: #4a6cf7;
}

.toast-item.toast-custom {
  background: #fafafa;
  border: 1px solid #e8e8f0;
}

.toast-content {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.toast-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.toast-message {
  flex: 1;
  font-size: 14px;
  line-height: 1.5;
  word-break: break-word;
}

.toast-loading {
  display: flex;
  align-items: center;
  justify-content: center;
}

.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid transparent;
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.toast-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 3px;
  border-radius: 0 0 8px 8px;
  transition: width 0.1s linear, opacity 0.3s;
}

.toast-item:not(.toast-loading):hover .toast-progress {
  opacity: 0;
}

/* Position variants */
.toast-top {
  margin-top: 20px;
}

.toast-center {
  margin: auto;
}

.toast-bottom {
  margin-bottom: 20px;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .toast-item.toast-success {
    background: rgba(82, 196, 26, 0.15);
    border-color: rgba(82, 196, 26, 0.3);
    color: #95de64;
  }

  .toast-item.toast-error {
    background: rgba(255, 77, 79, 0.15);
    border-color: rgba(255, 77, 79, 0.3);
    color: #ff7875;
  }

  .toast-item.toast-warning {
    background: rgba(250, 173, 20, 0.15);
    border-color: rgba(250, 173, 20, 0.3);
    color: #ffc53d;
  }

  .toast-item.toast-info {
    background: rgba(74, 108, 247, 0.15);
    border-color: rgba(74, 108, 247, 0.3);
    color: #7c94ff;
  }

  .toast-item.toast-loading {
    background: rgba(74, 108, 247, 0.15);
    border-color: rgba(74, 108, 247, 0.3);
    color: #7c94ff;
  }
}
</style>