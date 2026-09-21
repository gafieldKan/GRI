<template>
  <transition-group name="modal" tag="div" class="modal-container">
    <div
      v-for="modal in modalStack"
      :key="modal.id"
      :class="[
        'modal-overlay',
        'modal-' + modal.type,
        modal.visible ? 'visible' : ''
      ]"
      @click.self="modal.maskClosable && removeModal(modal.id)"
    >
      <!-- Alert / Confirm / Prompt -->
      <div v-if="modal.type !== 'action_sheet' && modal.type !== 'bottom_sheet'" class="modal-dialog">
        <div class="modal-header" v-if="modal.title">
          <text class="modal-title">{{ modal.title }}</text>
          <view class="modal-close" v-if="modal.closable" @click="removeModal(modal.id)">✕</view>
        </div>
        <div class="modal-body">
          <text class="modal-message" v-if="modal.message">{{ modal.message }}</text>
          <input
            v-if="modal.type === 'prompt'"
            v-model="modal.inputValue"
            :placeholder="modal.placeholder"
            class="modal-input"
          />
        </div>
        <div class="modal-footer">
          <view
            v-if="modal.type === 'confirm' || modal.type === 'prompt'"
            class="modal-btn modal-btn-cancel"
            :style="{ color: modal.cancelColor }"
            @click="handleCancel(modal)"
          >
            {{ modal.cancelText }}
          </view>
          <view
            class="modal-btn modal-btn-confirm"
            :style="{ backgroundColor: modal.confirmColor }"
            @click="handleConfirm(modal)"
          >
            {{ modal.confirmText }}
          </view>
        </div>
      </div>

      <!-- Action Sheet / Bottom Sheet -->
      <div v-else class="modal-sheet">
        <view class="modal-sheet-handle" @click="removeModal(modal)"></view>
        <view class="modal-sheet-content">
          <view class="modal-sheet-title" v-if="modal.title">{{ modal.title }}</view>
          <slot v-if="modal.type === 'bottom_sheet'" :modal="modal"></slot>
          <view v-else class="action-sheet-items">
            <view
              v-for="(item, index) in modal.items"
              :key="index"
              class="action-sheet-item"
              :class="{ destructive: item.destructive, disabled: item.disabled }"
              @click="handleActionSheetItem(modal, item, index)"
            >
              <text class="action-sheet-item-label">{{ item.label }}</text>
              <text v-if="item.description" class="action-sheet-item-desc">{{ item.description }}</text>
            </view>
          </view>
          <view class="action-sheet-cancel" @click="removeModal(modal)">
            <text>取消</text>
          </view>
        </view>
      </div>
    </div>
  </transition-group>
</template>

<script>
import { ref, computed } from 'vue'

// Modal 类型
const ModalType = {
  ALERT: 'alert',
  CONFIRM: 'confirm',
  PROMPT: 'prompt',
  ACTION_SHEET: 'action_sheet',
  BOTTOM_SHEET: 'bottom_sheet'
}

// 单例状态
const modalStack = ref([])
let modalId = 0

// 默认配置
const defaultOptions = {
  title: '',
  message: '',
  type: ModalType.ALERT,
  confirmText: '确定',
  cancelText: '取消',
  confirmColor: '#4a6cf7',
  cancelColor: '#999',
  placeholder: '',
  inputValue: '',
  items: [],
  closable: true,
  maskClosable: true,
  onConfirm: null,
  onCancel: null,
  onClose: null
}

function createModal(options = {}) {
  const id = Date.now() + Math.random()
  const opts = { ...defaultOptions, ...options }

  const modal = {
    id,
    ...opts,
    visible: true,
    inputValue: ref(opts.inputValue || ''),
    resolved: false
  }

  modalStack.value.push(modal)

  return new Promise((resolve, reject) => {
    modal._resolve = resolve
    modal._reject = reject
  })
}

// 移除 Modal
function removeModal(id) {
  const index = modalStack.value.findIndex(m => m.id === id)
  if (index >= 0) {
    const modal = modalStack.value[index]
    if (!modal.resolved) {
      if (modal.onClose) modal.onClose()
      modal._reject(new Error('Modal dismissed'))
    }
    modalStack.value.splice(index, 1)
  }
}

// 关闭最上层
function closeTop() {
  if (modalStack.value.length > 0) {
    removeModal(modalStack.value[modalStack.value.length - 1].id)
  }
}

// 关闭所有
function closeAll() {
  modalStack.value.forEach(m => {
    if (!m.resolved) {
      m._reject(new Error('All modals dismissed'))
    }
  })
  modalStack.value = []
}

// 便捷方法
const modal = {
  alert: (message, options = {}) => createModal({
    type: ModalType.ALERT,
    message,
    ...options
  }),

  confirm: (message, options = {}) => createModal({
    type: ModalType.CONFIRM,
    message,
    ...options
  }),

  prompt: (message, options = {}) => createModal({
    type: ModalType.PROMPT,
    message,
    ...options
  }),

  actionSheet: (items, options = {}) => createModal({
    type: ModalType.ACTION_SHEET,
    items,
    ...options
  }),

  bottomSheet: (content, options = {}) => createModal({
    type: ModalType.BOTTOM_SHEET,
    ...options,
    ...content
  }),

  close: closeTop,
  closeAll
}

// Vue 组件
export default {
  name: 'ModalContainer',
  setup() {
    return { modalStack, ModalType }
  },
  methods: {
    removeModal,
    handleConfirm(modal) {
      if (modal.type === 'prompt') {
        modal._resolve({ confirmed: true, value: modal.inputValue.value })
      } else {
        modal._resolve({ confirmed: true })
      }
      modal.resolved = true
      removeModal(modal.id)
    },
    handleCancel(modal) {
      modal._resolve({ confirmed: false })
      modal.resolved = true
      removeModal(modal.id)
    },
    handleActionSheetItem(modal, item, index) {
      if (item.disabled) return
      modal._resolve({ index, item })
      modal.resolved = true
      removeModal(modal.id)
    }
  }
}

export const useModal = () => modal
</script>

<style scoped>
.modal-container {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  z-index: 9990;
}

.modal-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.modal-overlay.visible {
  opacity: 1;
  pointer-events: auto;
}

.modal-overlay:not(.visible) {
  pointer-events: none;
}

/* Dialog */
.modal-dialog {
  position: relative;
  margin: auto;
  max-width: 320px;
  width: calc(100% - 32px);
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  transform: scale(0.9) translateY(20px);
  opacity: 0;
  transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.modal-overlay.visible .modal-dialog {
  transform: scale(1) translateY(0);
  opacity: 1;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid #e8e8f0;
}

.modal-title {
  font-size: 17px;
  font-weight: 600;
  color: #1a1a2e;
}

.modal-close {
  font-size: 20px;
  color: #999;
  padding: 4px;
  cursor: pointer;
  border-radius: 50%;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-close:active {
  background: #f5f5f5;
}

.modal-body {
  padding: 16px;
}

.modal-message {
  font-size: 15px;
  line-height: 1.6;
  color: #1a1a2e;
}

.modal-input {
  width: 100%;
  padding: 12px;
  border: 1px solid #e8e8f0;
  border-radius: 8px;
  font-size: 15px;
  outline: none;
}

.modal-input:focus {
  border-color: #4a6cf7;
  box-shadow: 0 0 0 3px rgba(74, 108, 247, 0.15);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid #e8e8f0;
}

.modal-btn {
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.modal-btn:active {
  transform: scale(0.98);
}

.modal-btn-cancel {
  background: transparent;
  color: #999;
}

.modal-btn-cancel:active {
  background: #f5f5f5;
}

.modal-btn-confirm {
  background: #4a6cf7;
  color: #fff;
  border: none;
}

.modal-btn-confirm:active {
  background: #3b5bd9;
}

.modal-btn.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Sheet */
.modal-sheet {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  max-height: 80vh;
  background: #fff;
  border-radius: 20px 20px 0 0;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.1);
  transform: translateY(100%);
  transition: transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  overflow-y: auto;
}

.modal-overlay.visible .modal-sheet {
  transform: translateY(0);
}

.modal-sheet-handle {
  width: 36px;
  height: 5px;
  background: #d9d9d9;
  border-radius: 3px;
  margin: 12px auto 8px;
  cursor: pointer;
}

.modal-sheet-content {
  padding: 0 16px 24px;
}

.modal-sheet-title {
  font-size: 17px;
  font-weight: 600;
  color: #1a1a2e;
  text-align: center;
  margin: 8px 0 16px;
}

.action-sheet-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.action-sheet-item {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 14px 16px;
  background: #fff;
  border: 1px solid #e8e8f0;
  border-radius: 12px;
  font-size: 16px;
  color: #1a1a2e;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.action-sheet-item:active {
  background: #f5f5f5;
}

.action-sheet-item.destructive {
  color: #ff4d4f;
  border-color: #ffccc7;
}

.action-sheet-item.disabled {
  color: #999;
  cursor: not-allowed;
}

.action-sheet-cancel {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: #fff;
  border-top: 1px solid #e8e8f0;
  margin-top: 8px;
  border-radius: 0 0 16px 16px;
  color: #4a6cf7;
  font-size: 16px;
  font-weight: 600;
}

.action-sheet-cancel:active {
  background: #f5f5f5;
}

.action-sheet-item-label {
  font-size: 16px;
  font-weight: 500;
  color: #1a1a2e;
}

.action-sheet-item-desc {
  font-size: 12px;
  color: #999;
  margin-top: 2px;
}

.action-sheet-cancel text {
  font-size: 16px;
  font-weight: 600;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .modal-dialog {
    background: var(--color-bg-card, #252542);
    border-color: var(--color-border, #3d3d5c);
  }

  .modal-header {
    border-color: var(--color-border, #3d3d5c);
  }

  .modal-title {
    color: var(--color-text-primary, #e8e8f0);
  }

  .modal-close {
    color: var(--color-text-tertiary, #888);
  }

  .modal-close:active {
    background: var(--color-bg-elevated, #2d2d4a);
  }

  .modal-body {
    background: var(--color-bg-card, #252542);
  }

  .modal-message {
    color: var(--color-text-primary, #e8e8f0);
  }

  .modal-input {
    background: var(--color-bg-elevated, #2d2d4a);
    border-color: var(--color-border, #3d3d5c);
    color: var(--color-text-primary, #e8e8f0);
  }

  .modal-input:focus {
    border-color: #7c94ff;
    box-shadow: 0 0 0 3px rgba(124, 148, 255, 0.15);
  }

  .modal-footer {
    border-color: var(--color-border, #3d3d5c);
  }

  .modal-btn-cancel {
    color: var(--color-text-tertiary, #888);
  }

  .modal-btn-cancel:active {
    background: var(--color-bg-elevated, #2d2d4a);
  }

  .modal-sheet {
    background: var(--color-bg-card, #252542);
    border-color: var(--color-border, #3d3d5c);
  }

  .modal-sheet-handle {
    background: #3d3d5c;
  }

  .modal-sheet-content {
    background: var(--color-bg-card, #252542);
  }

  .modal-sheet-title {
    color: var(--color-text-primary, #e8e8f0);
  }

  .action-sheet-item {
    background: var(--color-bg-card, #252542);
    border-color: var(--color-border, #3d3d5c);
    color: var(--color-text-primary, #e8e8f0);
  }

  .action-sheet-item:active {
    background: var(--color-bg-elevated, #2d2d4a);
  }

  .action-sheet-item.destructive {
    color: #ff7875;
    border-color: #ff7875;
  }

  .action-sheet-item.disabled {
    color: var(--color-text-tertiary, #888);
  }

  .action-sheet-cancel {
    background: var(--color-bg-card, #252542);
    border-color: var(--color-border, #3d3d5c);
    color: #7c94ff;
  }

  .action-sheet-cancel:active {
    background: var(--color-bg-elevated, #2d2d4a);
  }

  .action-sheet-item-label {
    color: var(--color-text-primary, #e8e8f0);
  }

  .action-sheet-item-desc {
    color: var(--color-text-tertiary, #888);
  }

  .action-sheet-cancel text {
    color: #7c94ff;
  }

  .modal-header {
    border-color: var(--color-border, #3d3d5c);
  }

  .modal-body {
    background: var(--color-bg-card, #252542);
  }

  .modal-message {
    color: var(--color-text-primary, #e8e8f0);
  }

  .modal-input {
    background: var(--color-bg-elevated, #2d2d4a);
    border-color: var(--color-border, #3d3d5c);
    color: var(--color-text-primary, #e8e8f0);
  }

  .modal-footer {
    border-color: var(--color-border, #3d3d5c);
  }

  .modal-btn-cancel:active {
    background: var(--color-bg-elevated, #2d2d4a);
  }
}
</style>