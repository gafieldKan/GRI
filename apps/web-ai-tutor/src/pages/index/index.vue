<template>
  <ErrorBoundary :showDetails="true" :logError="true" :fallback="fallbackContent">
    <view class="page">
      <view class="status-bar" />

      <scroll-view class="main-content" scroll-y="true">
        <LoadingSkeleton v-if="twinStore.loading && !twinStore.loaded" variant="card" :rows="4" />

        <template v-else>
          <!-- 孪生主体：数字人物 + 身份 + 当前接地 -->
          <view class="hero">
            <view class="hero-top">
              <AvatarTwin :name="twinStore.displayName" :avatar-url="twinStore.avatarUrl" :size="72" />
              <view class="hero-ident">
                <text class="hero-greeting">{{ greeting }}</text>
                <text class="hero-name">{{ twinStore.displayName }}</text>
                <view class="hero-meta">
                  <text v-if="twinStore.gradeName" class="meta-chip">{{ twinStore.gradeName }}</text>
                  <text v-if="worldName" class="meta-chip">{{ worldName }}</text>
                  <text v-if="profileSchool" class="meta-chip">{{ profileSchool }}</text>
                </view>
              </view>
            </view>
            <view class="hero-scene" v-if="twinStore.scene">
              <text class="scene-label">当前营地</text>
              <text class="scene-name">{{ twinStore.scene.name }}</text>
            </view>
            <view class="hero-scene empty" v-else>
              <text class="scene-label">尚未踏入版图</text>
              <text class="scene-name" @click="goWorld">去学科登峰 →</text>
            </view>
          </view>

          <!-- 状态环 -->
          <view class="rings-row">
            <view class="ring-item">
              <ProgressRing :value="twinStore.mastery.avg" :max="100" :size="64" :stroke-width="6" color="#4a6cf7" />
              <text class="ring-label">掌握度</text>
            </view>
            <view class="ring-item">
              <ProgressRing :value="twinStore.progress.accuracy" :max="100" :size="64" :stroke-width="6" color="#52c41a" />
              <text class="ring-label">正确率</text>
            </view>
            <view class="ring-item">
              <ProgressRing :value="userStore.streak" :max="7" :size="64" :stroke-width="6" color="#faad14" />
              <text class="ring-label">连续天数</text>
            </view>
            <view class="ring-item">
              <ProgressRing :value="twinStore.teacherBond.bond" :max="100" :size="64" :stroke-width="6" color="#722ed1" />
              <text class="ring-label">师生关系</text>
            </view>
          </view>

          <!-- 能力雷达 -->
          <view class="card">
            <PageHeader title="能力雷达" subtitle="按知识版图领域聚合的掌握度" />
            <SkillRadar :skills="twinStore.skills" color="#4a6cf7" />
          </view>

          <!-- 世界概览 -->
          <view class="card">
            <PageHeader
              title="我的世界"
              :subtitle="worldName ? worldName + '知识版图' : '学科知识版图'"
              :actions="[{ label: '进入世界', handler: goWorld }]"
            />
            <view class="world-stats">
              <StatCard label="知识域" :value="worldStats.total || 0" icon="🧭" icon-bg="#4a6cf7" />
              <StatCard label="营地(k12)" :value="worldStats.k12 || 0" icon="⛺" icon-bg="#52c41a" />
              <StatCard label="云上远峰" :value="worldStats.frontier || 0" icon="🏔" icon-bg="#722ed1" />
              <StatCard
                label="掌握(已/总)"
                :value="twinStore.mastery.mastered"
                :sublabel="'/' + (twinStore.mastery.total || 0)"
                icon="📚"
                icon-bg="#faad14"
              />
            </view>
          </view>

          <!-- 最近经历 -->
          <view class="card">
            <PageHeader title="最近经历" subtitle="你的行为时间线" />
            <EmptyState
              v-if="!twinStore.recentEvents.length"
              title="还没有经历"
              description="在世界里执行一次学习行动，时间线就会生长"
              icon="🕓"
            />
            <view v-else class="timeline">
              <view v-for="ev in twinStore.recentEvents" :key="ev.id" class="tl-item">
                <view class="tl-dot" :style="{ backgroundColor: kindColor(ev.kind) }" />
                <view class="tl-body">
                  <view class="tl-head">
                    <text class="tl-title">{{ ev.title }}</text>
                    <text class="tl-time">{{ relTime(ev.at) }}</text>
                  </view>
                  <text v-if="ev.text" class="tl-text">{{ ev.text }}</text>
                  <view v-if="ev.diffs && ev.diffs.length" class="tl-diffs">
                    <text v-for="(d, i) in ev.diffs" :key="i" class="tl-diff">
                      {{ d.label }}：{{ d.before }} → {{ d.after }}
                    </text>
                  </view>
                  <text v-if="ev.source" class="tl-source">{{ ev.source }}</text>
                </view>
              </view>
            </view>
          </view>

          <!-- 长期记忆 -->
          <view class="card" v-if="twinStore.memories.length">
            <PageHeader title="长期记忆" subtitle="AI 教师对你的跨会话记忆" />
            <view class="memory-list">
              <view v-for="m in twinStore.memories.slice(0, 4)" :key="m.key" class="memory-item">
                <text class="memory-key">{{ memoryLabel(m.key) }}</text>
                <text class="memory-value">{{ memoryValue(m.value) }}</text>
              </view>
            </view>
          </view>

          <!-- 快捷行动（学习动词闭集） -->
          <PageHeader title="行动" subtitle="选择一件事，让孪生生长" />
          <view class="quick-grid">
            <QuickAction
              v-for="(a, i) in quickActions"
              :key="i"
              :icon="a.icon"
              :label="a.label"
              :desc="a.desc"
              :color="a.color"
              @click="a.handler"
            />
          </view>

          <!-- 诚实声明（打破第四面墙） -->
          <view class="honest-note">
            <text class="honest-title">关于这个孪生</text>
            <text class="honest-body">
              身份来自你填写的资料与学生档案；状态由学习记录推导（掌握度/正确率按知识域聚合，为节点粒度近似值）；
              关系值为教学互动轮次的派生，并非情感度量。AI 从这里认识你，但它仍是你自己的映像，不是真人。
            </text>
          </view>

          <view class="safe-area" />
        </template>
      </scroll-view>
    </view>
  </ErrorBoundary>
</template>

<script>
import { computed, onMounted, h } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useTwinStore } from '@/store/twin'
import { useUserStore } from '@/store/user'
import { useKnowledgeStore } from '@/store/knowledge'
import AvatarTwin from '@/components/twin/AvatarTwin.vue'
import SkillRadar from '@/components/twin/SkillRadar.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import StatCard from '@/components/ui/StatCard.vue'
import ProgressRing from '@/components/ui/ProgressRing.vue'
import QuickAction from '@/components/ui/QuickAction.vue'
import LoadingSkeleton from '@/components/ui/LoadingSkeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorBoundary from '@/components/ErrorBoundary.vue'

const KIND_COLORS = {
  system: '#999',
  session: '#4a6cf7',
  profile: '#722ed1',
  world: '#52c41a',
  action: '#faad14',
  memory: '#eb2f96',
  settings: '#8c8c8c'
}

export default {
  name: 'Index',
  components: {
    AvatarTwin,
    SkillRadar,
    PageHeader,
    StatCard,
    ProgressRing,
    QuickAction,
    LoadingSkeleton,
    EmptyState
  },
  setup() {
    const twinStore = useTwinStore()
    const userStore = useUserStore()
    const knowledgeStore = useKnowledgeStore()

    const worldName = computed(() => twinStore.world?.subjectName || '')
    const worldStats = computed(() => twinStore.worldStats)
    const profileSchool = computed(() => twinStore.profile?.school || '')

    const greeting = computed(() => {
      const hour = new Date().getHours()
      if (hour < 6) return '深夜好，'
      if (hour < 9) return '早安，'
      if (hour < 12) return '上午好，'
      if (hour < 14) return '中午好，'
      if (hour < 18) return '下午好，'
      return '晚上好，'
    })

    const kindColor = (k) => KIND_COLORS[k] || '#4a6cf7'

    // 相对时间（刚刚/几分钟前/几小时前/几天前/日期）
    const relTime = (iso) => {
      if (!iso) return ''
      const t = new Date(iso).getTime()
      const diff = Date.now() - t
      const min = Math.floor(diff / 60000)
      if (min < 1) return '刚刚'
      if (min < 60) return `${min} 分钟前`
      const hr = Math.floor(min / 60)
      if (hr < 24) return `${hr} 小时前`
      const day = Math.floor(hr / 24)
      if (day < 30) return `${day} 天前`
      const d = new Date(iso)
      return `${d.getMonth() + 1}月${d.getDate()}日`
    }

    // 记忆键展示名（setting.* / mastery.* / fact.* 等约定）
    const memoryLabel = (key) => {
      if (!key) return '记忆'
      const map = {
        'setting.preferredDifficulty': '偏好难度',
        'setting.preferredSubjects': '偏好学科'
      }
      if (map[key]) return map[key]
      if (key.startsWith('mastery.')) return '掌握 · ' + key.slice(8)
      if (key.startsWith('setting.')) return '偏好 · ' + key.slice(8)
      if (key.startsWith('fact.')) return '事实 · ' + key.slice(5)
      return key
    }

    const memoryValue = (v) => {
      if (v == null) return ''
      if (typeof v === 'string') return v
      try {
        return JSON.stringify(v)
      } catch (e) {
        return String(v)
      }
    }

    const quickActions = [
      { icon: '💬', label: 'AI 辅导', desc: '向 AI 教师求教', color: '#4a6cf7', handler: () => uni.switchTab({ url: '/pages/chat/chat' }) },
      { icon: '✏️', label: '练习中心', desc: '自适应刷题', color: '#eb2f96', handler: () => uni.switchTab({ url: '/pages/practice/index' }) },
      { icon: '📝', label: '错题本', desc: '复盘未解决', color: '#ff4d4f', handler: () => uni.navigateTo({ url: '/pages/wrong-questions/index' }) },
      { icon: '📸', label: '拍照解题', desc: '拍照即解析', color: '#faad14', handler: () => uni.navigateTo({ url: '/pages/camera/camera' }) },
      { icon: '🏔', label: '学科登峰', desc: '进入我的世界', color: '#1B7A3D', handler: goWorld },
      { icon: '🧬', label: '人物画像', desc: '编辑稳定身份', color: '#722ed1', handler: () => uni.navigateTo({ url: '/pages/twin/profile' }) }
    ]

    function goWorld() {
      uni.navigateTo({ url: '/pages/twin/world' })
    }

    async function loadData() {
      userStore.init()
      knowledgeStore.loadCatalog()
      twinStore.loadOverview(knowledgeStore.currentSubject || 'math')
    }

    onMounted(loadData)
    onShow(loadData)

    return {
      twinStore,
      userStore,
      worldName,
      worldStats,
      profileSchool,
      greeting,
      kindColor,
      relTime,
      memoryLabel,
      memoryValue,
      quickActions,
      goWorld,
      fallbackContent: () => h(EmptyState, {
        title: '孪生加载失败',
        description: '无法装配你的数字孪生，请稍后重试',
        icon: '🧬',
        actions: [{ label: '重试', handler: () => location.reload() }]
      })
    }
  }
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: var(--color-bg-primary, #f7f8fa);
}

.status-bar {
  height: 20px;
  background: transparent;
}

.main-content {
  flex: 1;
  padding-bottom: 40px;
}

/* Hero */
.hero {
  background: linear-gradient(135deg, #4a6cf7 0%, #3b5bd9 100%);
  border-radius: 0 0 24px 24px;
  padding: 20px 18px 24px;
  margin: -20px -16px 16px;
  box-shadow: 0 4px 20px rgba(74, 108, 247, 0.3);
}

.hero-top {
  display: flex;
  align-items: center;
  gap: 14px;
}

.hero-ident {
  flex: 1;
  min-width: 0;
}

.hero-greeting {
  display: block;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.85);
}

.hero-name {
  display: block;
  font-size: 22px;
  font-weight: 700;
  color: #fff;
  margin: 2px 0 8px;
}

.hero-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.meta-chip {
  font-size: 11px;
  color: #fff;
  background: rgba(255, 255, 255, 0.18);
  border-radius: 8px;
  padding: 2px 8px;
}

.hero-scene {
  margin-top: 16px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  padding: 12px 16px;
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.scene-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
}

.scene-name {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
}

.hero-scene.empty .scene-name {
  font-size: 14px;
  text-decoration: underline;
}

/* 状态环 */
.rings-row {
  display: flex;
  justify-content: space-around;
  background: #fff;
  border-radius: 16px;
  margin: 0 16px 16px;
  padding: 16px 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  border: 1px solid var(--color-border, #e8e8f0);
}

.ring-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.ring-label {
  font-size: 11px;
  color: var(--color-text-tertiary, #999);
}

/* 卡片 */
.card {
  margin: 0 16px 16px;
  background: #fff;
  border-radius: 16px;
  padding: 4px 12px 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  border: 1px solid var(--color-border, #e8e8f0);
}

.world-stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  padding: 0 4px;
}

/* 时间线 */
.timeline {
  padding: 4px 4px 0;
}

.tl-item {
  display: flex;
  gap: 10px;
  padding-bottom: 16px;
  position: relative;
}

.tl-item:not(:last-child)::before {
  content: '';
  position: absolute;
  left: 4px;
  top: 14px;
  bottom: 0;
  width: 1px;
  background: var(--color-border, #e8e8f0);
}

.tl-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  margin-top: 5px;
  flex-shrink: 0;
  z-index: 1;
}

.tl-body {
  flex: 1;
  min-width: 0;
}

.tl-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}

.tl-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary, #1a1a2e);
}

.tl-time {
  font-size: 11px;
  color: var(--color-text-tertiary, #999);
  flex-shrink: 0;
}

.tl-text {
  display: block;
  font-size: 12px;
  color: var(--color-text-secondary, #666);
  margin-top: 3px;
  line-height: 1.5;
}

.tl-diffs {
  margin-top: 4px;
}

.tl-diff {
  display: block;
  font-size: 11px;
  color: #4a6cf7;
}

.tl-source {
  display: block;
  font-size: 10px;
  color: var(--color-text-tertiary, #aaa);
  margin-top: 4px;
}

/* 记忆 */
.memory-list {
  padding: 0 4px;
}

.memory-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--color-border, #f0f0f5);
}

.memory-item:last-child {
  border-bottom: none;
}

.memory-key {
  font-size: 13px;
  color: var(--color-text-secondary, #666);
  flex-shrink: 0;
}

.memory-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary, #1a1a2e);
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 快捷行动 */
.quick-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  padding: 0 16px 16px;
}

/* 诚实声明 */
.honest-note {
  margin: 8px 16px 16px;
  padding: 14px 16px;
  background: var(--color-bg-secondary, #f0f2f7);
  border-radius: 12px;
  border: 1px dashed var(--color-border, #dcdfe8);
}

.honest-title {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-secondary, #666);
  margin-bottom: 6px;
}

.honest-body {
  display: block;
  font-size: 11px;
  color: var(--color-text-tertiary, #999);
  line-height: 1.7;
}

.safe-area {
  height: 40px;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .page {
    background: var(--color-bg-primary, #1a1a2e);
  }

  .rings-row,
  .card {
    background: var(--color-bg-card, #252542);
    border-color: var(--color-border, #3d3d5c);
  }

  .hero {
    background: linear-gradient(135deg, #3b5bd9 0%, #2d2d4a 100%);
  }

  .honest-note {
    background: var(--color-bg-card, #252542);
  }
}
</style>
