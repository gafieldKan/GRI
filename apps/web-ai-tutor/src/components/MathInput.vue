<template>
  <view class="math-input-wrapper">
    <textarea
      class="math-input"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      @input="handleInput"
      @confirm="handleSend"
      confirm-type="send"
      auto-height
      :maxlength="maxlength"
    ></textarea>
  </view>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '请输入...' },
  disabled: { type: Boolean, default: false },
  maxlength: { type: Number, default: 200 }
})

const emit = defineEmits(['update:modelValue', 'send'])

const inputValue = ref(props.modelValue)

const handleInput = (e) => {
  const val = e.detail?.value || e.target?.value || ''
  inputValue.value = val
  emit('update:modelValue', val)
}

const handleSend = () => {
  if (inputValue.value.trim()) {
    emit('send', inputValue.value)
    inputValue.value = ''
  }
}
</script>

<style scoped>
.math-input-wrapper {
  flex: 1;
}

.math-input {
  width: 100%;
  min-height: 36px;
  max-height: 80px;
  padding: 8px 12px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.5;
  background: #f8f9fa;
  outline: none;
  box-sizing: border-box;
}

.math-input:focus {
  border-color: #667eea;
  background: #fff;
}
</style>
