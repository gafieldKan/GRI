<template>
  <!--
    模块内容世界外壳（W3 · N3）
    「进入模块 = 走进该模块的世界」：与门户人本世界同一套世界观感
    （同 `--world-*` 令牌 + 同几何类 + 同一道过关之门）。
    首个接入：智学慧眼「学习世界」（apps/web-ai-tutor/pages/twin/world.vue）。

    零色值：本组件只允许 var(--world-*) / var(--color-*) 等令牌取值。
  -->
  <view class="world-shell" :data-world-shell="moduleCode">
    <!-- ── 世界顶栏：我在哪个世界 + 走出这个世界的两条路 ── -->
    <view class="ws-bar">
      <view class="ws-bar-main">
        <text class="ws-kicker">{{ kicker }}</text>
        <text class="ws-title">{{ title }}</text>
        <text v-if="subtitle" class="ws-sub">{{ subtitle }}</text>
      </view>

      <view class="ws-bar-actions">
        <!-- 模块自己的动作（学科切换等）留在这里 -->
        <slot name="actions" />

        <!-- 回本模块的功能导航：不把用户困在单页（N5） -->
        <button v-if="appHomeUrl" class="ws-btn" data-app-home @click="goAppHome">
          {{ appHomeLabel }}
        </button>

        <!-- 返回人本世界：世界之间的门（N3/N5） -->
        <button class="ws-btn is-world" data-world-home @click="goWorldHome">
          {{ worldHomeLabel }}
        </button>
      </view>
    </view>

    <!-- ── 该模块的内容世界 ── -->
    <view class="ws-body">
      <slot />
    </view>

    <!-- ── 过场承接：过关式不中断（门户演完过场 → 这边接着开场）── -->
    <WorldTransition
      :open="tour.open"
      :label="tour.label"
      :from="tour.from"
      :duration="enterDuration"
      @go="endTour"
    />
  </view>
</template>

<script setup>
import { reactive, watch } from 'vue'
import WorldTransition from './WorldTransition.vue'

const props = defineProps({
  /** 模块码（data-world-shell，供自检定位；也是未来的世界注册键） */
  moduleCode: { type: String, default: '' },
  /** 世界名（模块名），如「学习世界」 */
  title: { type: String, default: '' },
  /** 抬头小字（世界语境） */
  kicker: { type: String, default: '模块世界' },
  /** 一句话说明这个世界的口径 */
  subtitle: { type: String, default: '' },
  /** 回本模块功能导航的目的地（空 = 不显示该按钮） */
  appHomeUrl: { type: String, default: '' },
  appHomeLabel: { type: String, default: '回功能导航' },
  /** 返回人本世界的地址（网关子路径，同源，令牌在册 → 免二登） */
  worldHomeUrl: { type: String, default: '/portal/' },
  worldHomeLabel: { type: String, default: '返回人本世界' },
  /** 是否承接开场过场（门户带 `?from=world` 走来时为真） */
  entering: { type: Boolean, default: false },
  /** 过场里的出发地 */
  entryFrom: { type: String, default: '人本世界' },
  /** 过场时长（毫秒）——与门户那半程同一时长（900），「一道门」承接不落差 */
  enterDuration: { type: Number, default: 900 }
})

const emit = defineEmits(['entered'])

const tour = reactive({ open: false, label: '', from: '' })

function startTour() {
  tour.label = props.title
  tour.from = props.entryFrom
  tour.open = true
}

function endTour() {
  tour.open = false
  emit('entered')
}

watch(
  () => props.entering,
  (on) => {
    if (on) startTour()
    else tour.open = false
  },
  { immediate: true }
)

/** 返回人本世界：跨应用同源整页导航（SSO 令牌已在本地存储，免二登）。 */
function goWorldHome() {
  const url = props.worldHomeUrl
  // #ifdef H5
  if (typeof window !== 'undefined' && window.location) {
    window.location.assign(url)
    return
  }
  // #endif
  uni.reLaunch({ url })
}

/** 回本模块功能导航：tabBar 页用 switchTab，普通页退化为 reLaunch。 */
function goAppHome() {
  if (!props.appHomeUrl) return
  uni.switchTab({
    url: props.appHomeUrl,
    fail: () => uni.reLaunch({ url: props.appHomeUrl })
  })
}

defineExpose({ startTour })
</script>

<style scoped>
.world-shell {
  min-height: 100vh;
  background: var(--color-bg-primary);
  box-sizing: border-box;
}

/* ── 顶栏（与门户人本世界顶栏同一套几何与令牌）── */
.ws-bar {
  position: sticky;
  top: 0;
  z-index: var(--z-sticky);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-md);
  padding: var(--spacing-lg);
  border-bottom: 1px solid var(--world-node-border);
  background: var(--world-panel);
  box-shadow: var(--shadow-card);
}

.ws-bar-main {
  min-width: 0;
  flex: 1;
}

.ws-kicker {
  display: block;
  color: var(--world-node-sub);
  font-size: var(--font-size-xs);
  letter-spacing: 0.16em;
}

.ws-title {
  display: block;
  margin-top: 2rpx;
  color: var(--world-node-text);
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-bold);
  line-height: var(--line-height-tight);
}

.ws-sub {
  display: block;
  max-width: 620px;
  margin-top: var(--spacing-sm);
  color: var(--world-node-sub);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-relaxed);
}

.ws-bar-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}

.ws-btn {
  flex: none;
  padding: 12rpx 28rpx;
  border: 1px solid var(--world-node-border);
  border-radius: var(--radius-round);
  background: var(--world-node-bg);
  color: var(--world-node-text);
  font-size: var(--font-size-sm);
  line-height: 1.4;
}

.ws-btn::after {
  border: none;
}

.ws-btn.is-world {
  border-color: var(--world-node-on-bg);
  background: var(--world-node-on-bg);
  color: var(--world-node-on-text);
}

.ws-btn:active {
  opacity: 0.85;
}

.ws-body {
  max-width: 1180px;
  margin: 0 auto;
  padding: var(--spacing-md);
  box-sizing: border-box;
}

@media (max-width: 720px) {
  .ws-bar {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
