<template>
  <!-- 过关式过场：门户「走进模块」与模块世界「从人本世界走来」共用同一道门（N1/N3） -->
  <view v-if="open" class="world-transition" :class="{ 'is-ready': ready }" role="status" aria-live="polite">
    <view class="wt-veil" aria-hidden="true" />

    <view class="wt-stage">
      <!-- 过关之门（与生活全景同一套世界色） -->
      <svg class="wt-door" viewBox="0 0 240 220" aria-hidden="true">
        <ellipse class="w-shadow-soft" cx="120" cy="206" rx="92" ry="16" />
        <polygon class="w-plaza-mid" points="22,206 120,150 218,206 120,262" />
        <polygon class="w-wall-left" points="58,96 120,63 120,189 58,156" />
        <polygon class="w-wall-right" points="182,96 120,63 120,189 182,156" />
        <polygon class="w-roof-top" points="46,84 120,45 194,84 120,123" />
        <polygon class="w-roof-left" points="34,96 46,84 120,123 120,135" />
        <polygon class="w-roof-right" points="206,96 194,84 120,123 120,135" />
        <path class="w-portrait-halo" d="M92 156v-38a28 28 0 0 1 56 0v38Z" />
        <path class="w-door" d="M92 156v-38a28 28 0 0 1 56 0v38Z" opacity="0.35" />
        <path class="w-lamp-pole" d="M56 152v-52M184 152v-52" :stroke-width="3" />
        <circle class="w-sign-warm" cx="56" cy="96" r="5" />
        <circle class="w-sign-warm" cx="184" cy="96" r="5" />
      </svg>

      <text class="wt-scene">{{ sceneLabel }}</text>
      <text class="wt-title">{{ title }}</text>
      <text class="wt-hint">{{ ready ? '已就绪，正在进入…' : '正在穿过世界之门…' }}</text>
    </view>
  </view>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  /** 目的地名（模块名） */
  label: { type: String, default: '' },
  /** 出发地（场景名），用于「从 X 走进 Y」 */
  from: { type: String, default: '' },
  /** 过场时长（毫秒）——过关式：先演过场，再交接给导航 */
  duration: { type: Number, default: 900 }
})

const emit = defineEmits(['go'])

const ready = ref(false)
let timer = null
let readied = null

// 随 open 重算：同一次会话里可能连走两趟（门户 → 模块 → 回门户 → 再走），
// 目的地/出发地是每趟的（写成 setup 常量会永远念第一趟的词）。
const sceneLabel = computed(() => (props.from ? `从 ${props.from} 出发` : '世界之门'))
const title = computed(() => (props.label ? `走进 ${props.label}` : '回到世界'))

function clear() {
  if (timer) clearTimeout(timer)
  if (readied) clearTimeout(readied)
  timer = null
  readied = null
}

watch(
  () => props.open,
  (isOpen) => {
    clear()
    ready.value = false
    if (!isOpen) return
    readied = setTimeout(() => {
      ready.value = true
    }, Math.max(120, Math.round(props.duration * 0.55)))
    timer = setTimeout(() => {
      emit('go')
    }, props.duration)
  },
  { immediate: true }
)

onBeforeUnmount(clear)
</script>

<style scoped>
.world-transition {
  position: fixed;
  inset: 0;
  z-index: var(--z-toast);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: all;
}

.wt-veil {
  position: absolute;
  inset: 0;
  background: var(--world-transition-veil);
  backdrop-filter: blur(3px);
  animation: wt-fade var(--transition-base) both;
}

.wt-stage {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
  animation: wt-in var(--transition-slow) both;
}

.wt-door {
  display: block;
  width: 480rpx;
  height: auto;
  animation: wt-glow 1.2s ease-in-out infinite;
}

.wt-scene {
  font-size: var(--font-size-xs);
  color: var(--world-node-sub);
}

.wt-title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--world-node-text);
}

.wt-hint {
  font-size: var(--font-size-sm);
  color: var(--world-node-sub);
}

.world-transition.is-ready .wt-door {
  animation: none;
}

@keyframes wt-fade {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@keyframes wt-in {
  from { opacity: 0; transform: translate3d(0, 24rpx, 0) scale(0.96); }
  to   { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
}

@keyframes wt-glow {
  0%,
  100% { opacity: 0.86; }
  50%  { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .wt-veil,
  .wt-stage,
  .wt-door {
    animation: none;
  }
}
</style>
