<template>
  <view v-if="scene" class="intent-sheet" role="dialog" aria-modal="true" :aria-label="`${scene.name}的意向`">
    <view class="is-scrim" aria-hidden="true" @click="close" />

    <view class="is-panel">
      <!-- ── 抬头 ── -->
      <view class="is-head">
        <view class="is-head-main">
          <text class="is-scene">{{ scene.icon || '•' }} {{ scene.name }}</text>
          <text class="is-sub">{{ headSub }}</text>
        </view>
        <button class="is-close" aria-label="回到世界" @click="close">回到世界</button>
      </view>

      <!-- ── 意向 → 去处 ── -->
      <view class="is-body">
        <view v-for="group in groups" :key="group.code" class="is-intent">
          <text class="is-intent-label">{{ group.label }}</text>
          <text v-if="group.description" class="is-intent-desc">{{ group.description }}</text>

          <view class="is-options">
            <view
              v-for="opt in group.options"
              :key="opt.code"
              class="is-option"
              :class="`is-${opt.state}`"
              role="button"
              :data-module="opt.code"
              :aria-label="`${opt.verb}${opt.name}`"
              @click="act(opt)"
            >
              <view class="is-option-copy">
                <text class="is-option-name">{{ opt.name }}</text>
                <text class="is-option-desc">{{ opt.desc }}</text>
              </view>
              <text class="is-option-verb">{{ opt.verb }}</text>
            </view>
          </view>
        </view>

        <view v-if="!groups.length" class="is-empty">
          <text class="is-empty-title">这一处还在建设中</text>
          <text class="is-empty-text">{{ emptyHint }}</text>
        </view>

        <!-- 运营/工具类去处不在世界之内（N1）：只给一个世界之外的出口 -->
        <view v-if="hiddenCount" class="is-outside">
          <text class="is-outside-text">
            这一处另有 {{ hiddenCount }} 个运营 / 工具类去处——它们不在人本世界里，从世界的门外进。
          </text>
          <button class="is-outside-btn" @click="toConsole">去运营后台</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  /** W1 `/api/world` 中被选中的场景 */
  scene: { type: Object, default: null },
  /** W1 `/api/modules` 全量列表（已按登录角色过滤；这里只做交集） */
  modules: { type: Array, default: () => [] },
  /** 正在开通中的模块码 */
  pendingCode: { type: String, default: '' },
  /**
   * 世界之内不呈现的模块类别（N1：运营后台独立入口留在世界之外）。
   * 命中的去处不计入意向，只在面板底部留一个世界之外的出口。
   */
  excludeCategories: { type: Array, default: () => ['admin', 'tool'] }
})

const emit = defineEmits(['close', 'open', 'apply', 'console'])

const byCode = computed(() => {
  const map = new Map()
  props.modules.forEach((m) => map.set(m.code, m))
  return map
})

const isOutside = (module) => props.excludeCategories.includes(module.category)

/** 一处去处可否直接走进：有权（在列表里）且入口已接通；核心模块无需选用。 */
function resolve(link) {
  const module = byCode.value.get(link.moduleCode)
  if (!module) return null
  if (isOutside(module)) return null
  if (!module.entryUrl) {
    return { code: module.code, name: module.name, desc: module.description || '', state: 'gated', verb: '即将接入' }
  }
  if (link.requiresOptIn && !module.isCore && !module.selected) {
    return { code: module.code, name: module.name, desc: module.description || '', state: 'optin', verb: '开通' }
  }
  return { code: module.code, name: module.name, desc: module.description || '', state: 'open', verb: '走进' }
}

/** 场景里指向「世界之外」的去处条数（用于底部出口提示）。 */
const hiddenCount = computed(() => {
  const scene = props.scene
  if (!scene) return 0
  const links = []
  ;(scene.intents || []).forEach((i) => (i.modules || []).forEach((l) => links.push(l)))
  ;(scene.modules || []).forEach((l) => links.push(l))
  const seen = new Set()
  links.forEach((link) => {
    const module = byCode.value.get(link.moduleCode)
    if (module && isOutside(module)) seen.add(module.code)
  })
  return seen.size
})

const groups = computed(() => {
  const scene = props.scene
  if (!scene) return []
  const intents = Array.isArray(scene.intents) ? scene.intents : []
  const out = []

  intents.forEach((intent) => {
    const options = (intent.modules || []).map(resolve).filter(Boolean)
    if (options.length) {
      out.push({ code: intent.code, label: intent.label, description: intent.description, options })
    }
  })

  // 场景级直连去处（不经意向）
  const direct = (scene.modules || []).map(resolve).filter(Boolean)
  if (direct.length) {
    out.push({ code: '__direct', label: `${scene.name}的去处`, description: '', options: direct })
  }
  return out
})

/** 只数真的走得进去的去处（「即将接入」的只算在册，不算可用）。 */
const usableCount = computed(
  () => groups.value.reduce((n, g) => n + g.options.filter((o) => o.state !== 'gated').length, 0)
)

const headSub = computed(() => {
  if (!props.scene) return ''
  return usableCount.value ? `${usableCount.value} 个去处可用` : '这一处尚未接通'
})

const emptyHint = computed(
  () => '世界的去处由后端统一下发；这一处还没接通入口，先回世界走走，或去「常去的地方」。'
)

function act(opt) {
  if (opt.state === 'open') {
    emit('open', byCode.value.get(opt.code))
    return
  }
  if (opt.state === 'optin') {
    emit('apply', byCode.value.get(opt.code))
    return
  }
}

function close() {
  emit('close')
}

function toConsole() {
  emit('console')
}
</script>

<style scoped>
.intent-sheet {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.is-scrim {
  position: absolute;
  inset: 0;
  background: var(--world-scrim);
}

.is-panel {
  position: relative;
  width: 100%;
  max-width: 720px;
  max-height: 78vh;
  display: flex;
  flex-direction: column;
  border-top-left-radius: var(--radius-2xl);
  border-top-right-radius: var(--radius-2xl);
  background: var(--world-panel);
  border: 1px solid var(--world-panel-edge);
  box-shadow: var(--shadow-lg);
  animation: is-rise var(--transition-base) both;
  overflow: hidden;
}

/* ── 抬头 ── */
.is-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-md);
  padding: var(--spacing-lg);
  border-bottom: 1px solid var(--world-panel-edge);
}

.is-head-main {
  min-width: 0;
}

.is-scene {
  display: block;
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--world-node-text);
}

.is-sub {
  display: block;
  margin-top: 4rpx;
  font-size: var(--font-size-xs);
  color: var(--world-node-sub);
}

.is-close {
  flex: none;
  padding: 8rpx 22rpx;
  border-radius: var(--radius-round);
  border: 1px solid var(--world-node-border);
  background: var(--world-node-bg);
  color: var(--world-node-text);
  font-size: var(--font-size-xs);
  line-height: 1.5;
}

.is-close::after {
  border: none;
}

.is-close:active {
  background: var(--world-node-on-bg);
  color: var(--world-node-on-text);
}

/* ── 意向 ── */
.is-body {
  padding: var(--spacing-lg);
  overflow-y: auto;
}

.is-intent + .is-intent {
  margin-top: var(--spacing-lg);
}

.is-intent-label {
  display: block;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--world-node-text);
}

.is-intent-desc {
  display: block;
  margin-top: 4rpx;
  font-size: var(--font-size-xs);
  color: var(--world-node-sub);
}

.is-options {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-sm);
}

/* ── 去处 ── */
.is-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  border: 1px solid var(--world-node-border);
  border-radius: var(--radius-xl);
  background: var(--world-node-bg);
  cursor: pointer;
  transition: transform var(--transition-fast), border-color var(--transition-fast),
    background var(--transition-fast);
}

.is-option:active {
  transform: translateY(2rpx);
}

.is-option:focus-visible {
  outline: 4rpx solid var(--world-node-on-bg);
  outline-offset: 2rpx;
}

.is-option-copy {
  min-width: 0;
}

.is-option-name {
  display: block;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--world-node-text);
}

.is-option-desc {
  display: block;
  margin-top: 4rpx;
  font-size: var(--font-size-xs);
  color: var(--world-node-sub);
  overflow-wrap: anywhere;
}

.is-option-verb {
  flex: none;
  padding: 8rpx 24rpx;
  border-radius: var(--radius-round);
  background: var(--world-node-on-bg);
  color: var(--world-node-on-text);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}

.is-option.is-gated {
  cursor: default;
  opacity: 0.72;
  background: var(--world-panel);
}

.is-option.is-gated .is-option-verb {
  background: var(--world-node-sub);
}

.is-option.is-optin .is-option-verb {
  background: var(--world-sign-warm);
}

@media (hover: hover) {
  .is-option.is-open:hover,
  .is-option.is-optin:hover {
    border-color: var(--world-node-on-bg);
    box-shadow: var(--shadow-sm);
  }
}

/* ── 建设中 ── */
.is-empty {
  padding: var(--spacing-xl) var(--spacing-md);
  text-align: center;
}

.is-empty-title {
  display: block;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--world-node-text);
}

.is-empty-text {
  display: block;
  margin-top: var(--spacing-sm);
  font-size: var(--font-size-xs);
  color: var(--world-node-sub);
  line-height: var(--line-height-base);
}

/* ── 世界之外的出口（运营 / 工具类去处）── */
.is-outside {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  margin-top: var(--spacing-lg);
  padding: var(--spacing-md);
  border: 1px dashed var(--world-node-border);
  border-radius: var(--radius-xl);
  background: var(--world-panel);
}

.is-outside-text {
  flex: 1;
  min-width: 0;
  color: var(--world-node-sub);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-base);
}

.is-outside-btn {
  flex: none;
  padding: 8rpx 24rpx;
  border: 1px solid var(--world-node-on-bg);
  border-radius: var(--radius-round);
  background: var(--world-node-on-bg);
  color: var(--world-node-on-text);
  font-size: var(--font-size-xs);
  line-height: 1.5;
}

.is-outside-btn::after {
  border: none;
}

/* ── 桌面：居中弹卡 ── */
@media (min-width: 760px) {
  .intent-sheet {
    align-items: center;
  }

  .is-panel {
    border-radius: var(--radius-2xl);
    max-height: 72vh;
  }
}

@media (prefers-reduced-motion: reduce) {
  .is-panel {
    animation: none;
  }
}

@keyframes is-rise {
  from { opacity: 0; transform: translate3d(0, 40rpx, 0); }
  to   { opacity: 1; transform: translate3d(0, 0, 0); }
}
</style>
