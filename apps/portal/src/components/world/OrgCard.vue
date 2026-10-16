<template>
  <view
    class="org-card"
    role="button"
    :aria-label="`${org.name}（${typeLabel}），我的角色：${roleLabel}，查看组织孪生`"
    :data-org="org.id"
    @click="open"
  >
    <!-- 组织徽记：以组织名派生稳定色阶（与人物外观同一散列，不引入新真源） -->
    <view class="oc-mark" :class="markClass">
      <text class="oc-mark-text">{{ initial }}</text>
    </view>

    <view class="oc-body">
      <view class="oc-title-row">
        <text class="oc-name">{{ org.name }}</text>
        <text class="oc-type">{{ typeLabel }}</text>
      </view>
      <view class="oc-meta">
        <text class="oc-role">我的角色：{{ roleLabel }}</text>
        <text v-if="parentHint" class="oc-parent">{{ parentHint }}</text>
      </view>
      <view v-if="tags.length" class="oc-tags">
        <text v-for="tag in tags" :key="tag" class="oc-tag">{{ tag }}</text>
      </view>
    </view>

    <view class="oc-action">
      <text class="oc-action-text">组织孪生</text>
      <text class="oc-arrow">›</text>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { stableHash } from '@world-art'
import { orgTypeLabel, orgRoleLabel } from '@/utils/persona'

const props = defineProps({
  /** W1 `GET /api/organizations/mine` 的一条归属 */
  org: { type: Object, required: true },
  /** 同一批组织里按 id 取父组织名，用于展示归属链 */
  parentName: { type: String, default: '' }
})

const emit = defineEmits(['open'])

const typeLabel = computed(() => orgTypeLabel(props.org.type))
const roleLabel = computed(() => orgRoleLabel(props.org.role))
const initial = computed(() => (props.org.name || '组').trim().slice(0, 1))
const markClass = computed(() => `oc-mark-${(stableHash(props.org.id || props.org.name) % 4) + 1}`)
const tags = computed(() => (Array.isArray(props.org.tags) ? props.org.tags.filter(Boolean).slice(0, 4) : []))
const parentHint = computed(() => (props.parentName ? `隶属 ${props.parentName}` : ''))

function open() {
  emit('open', props.org)
}
</script>

<style scoped>
.org-card {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  border: 1px solid var(--world-node-border);
  border-radius: var(--radius-xl);
  background: var(--world-panel);
  box-shadow: 0 2rpx 10rpx var(--world-node-shadow);
  cursor: pointer;
  transition: transform var(--transition-fast), border-color var(--transition-fast),
    box-shadow var(--transition-fast);
}

.org-card:active {
  transform: translateY(2rpx);
}

.org-card:focus-visible {
  outline: 4rpx solid var(--world-node-on-bg);
  outline-offset: 2rpx;
}

@media (hover: hover) {
  .org-card:hover {
    border-color: var(--world-node-on-bg);
    box-shadow: var(--shadow-hover);
    transform: translateY(-2rpx);
  }
}

/* ── 徽记 ── */
.oc-mark {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 88rpx;
  height: 88rpx;
  border-radius: var(--radius-lg);
}

.oc-mark-text {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--world-node-on-text);
}

.oc-mark-1 { background: var(--world-wear-1); }
.oc-mark-2 { background: var(--world-wear-2); }
.oc-mark-3 { background: var(--world-wear-3); }
.oc-mark-4 { background: var(--world-wear-4); }

/* ── 主体 ── */
.oc-body {
  flex: 1;
  min-width: 0;
}

.oc-title-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}

.oc-name {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--world-node-text);
}

.oc-type {
  padding: 2rpx 14rpx;
  border-radius: var(--radius-round);
  background: var(--world-node-bg);
  border: 1px solid var(--world-node-border);
  color: var(--world-node-sub);
  font-size: var(--font-size-xs);
}

.oc-meta {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
  margin-top: 6rpx;
}

.oc-role,
.oc-parent {
  font-size: var(--font-size-xs);
  color: var(--world-node-sub);
}

.oc-tags {
  display: flex;
  gap: 8rpx;
  flex-wrap: wrap;
  margin-top: 8rpx;
}

.oc-tag {
  padding: 2rpx 12rpx;
  border-radius: var(--radius-round);
  background: var(--world-node-on-bg);
  color: var(--world-node-on-text);
  font-size: var(--font-size-xs);
}

/* ── 行动 ── */
.oc-action {
  flex: none;
  display: flex;
  align-items: center;
  gap: 4rpx;
}

.oc-action-text {
  font-size: var(--font-size-sm);
  color: var(--world-node-on-bg);
  font-weight: var(--font-weight-medium);
}

.oc-arrow {
  font-size: var(--font-size-base);
  color: var(--world-node-on-bg);
}
</style>
