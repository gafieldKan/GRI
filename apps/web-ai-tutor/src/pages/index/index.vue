<template>
  <ErrorBoundary :showDetails="true" :logError="true" :fallback="fallbackContent">
    <view class="twin-page">
      <scroll-view class="twin-scroll" scroll-y="true">
        <LoadingSkeleton v-if="twinStore.loading && !twinStore.loaded" variant="card" :rows="4" />

        <template v-else>
          <!-- 状态条 -->
          <view class="status-bar">
            <text class="sb-left"><text class="dot" /> {{ twinStore.displayName }}的孪生体已激活 · 独立人物</text>
            <text class="sb-right">属性保留 / 记忆保留 / 上次位置已恢复</text>
          </view>

          <!-- 页标题 -->
          <view class="page-head">
            <view class="ph-main">
              <text class="ph-title">人物孪生总览</text>
              <text class="ph-sub">数字身份、行为记忆与虚拟世界，持续属于同一个你。</text>
            </view>
            <view class="ph-actions">
              <button class="tbtn" @click="goMemory"><svg class="twin-ico"><use href="#i-chat" /></svg>与孪生体对话</button>
              <button class="tbtn primary" @click="goWorld"><svg class="twin-ico"><use href="#i-world" /></svg>进入虚拟世界</button>
            </view>
          </view>

          <view class="ov-grid">
            <!-- 数字人物 -->
            <view class="panel avatar-panel">
              <view class="panel-head between">
                <view class="ap-head-l">
                  <text class="panel-title">我的数字人物</text>
                  <text class="twin-id mono">{{ twinId }}</text>
                </view>
                <text class="tag green">已激活</text>
              </view>
              <view class="avatar-stage">
                <view class="avatar-box">
                  <view class="floor-ring" />
                  <AvatarTwin :name="twinStore.displayName" :avatar-url="twinStore.avatarUrl" :energy="vigor" :mode="avatarMode" />
                  <view class="scan-label"><svg class="twin-ico sm"><use href="#i-person" /></svg> 身份已锚定</view>
                  <view class="scan-label right">模拟状态 {{ vigor }}/100</view>
                </view>
              </view>
              <view class="avatar-base">
                <text class="avatar-name">{{ twinStore.displayName }}</text>
                <text class="avatar-role">{{ roleLine }}</text>
                <view class="avatar-tools">
                  <button :class="{ active: avatarMode === 'person' }" @click="avatarMode = 'person'">人物视图</button>
                  <button :class="{ active: avatarMode === 'mapping' }" @click="avatarMode = 'mapping'">属性映射</button>
                </view>
                <view class="avatar-bottom between">
                  <text>LV. {{ level }} · 持续成长</text>
                  <text class="row-tight">{{ mood }} <text class="dot play" /></text>
                </view>
              </view>
            </view>

            <view class="ov-middle">
              <!-- 指标 -->
              <view class="metric-row">
                <view class="metric">
                  <view class="metric-label"><svg class="twin-ico sm"><use href="#i-spark" /></svg> 学习行动</view>
                  <text class="metric-value num">{{ actionCount }}<text class="mv-unit">次</text></text>
                  <text class="metric-bottom">每次行动都有历史快照</text>
                </view>
                <view class="metric">
                  <view class="metric-label"><svg class="twin-ico sm"><use href="#i-memory" /></svg> 长期记忆</view>
                  <text class="metric-value num">{{ twinStore.memories.length }}<text class="mv-unit">条</text></text>
                  <text class="metric-bottom">AI 教师的跨会话记忆</text>
                </view>
              </view>

              <!-- 实时状态 -->
              <view class="panel state-panel">
                <view class="panel-head between">
                  <text class="panel-title">人物实时状态</text>
                  <text class="tag">模拟状态</text>
                </view>
                <view class="state-top">
                  <view class="energy-circle">
                    <svg viewBox="0 0 76 76">
                      <circle cx="38" cy="38" r="31" stroke="#edf2e6" stroke-width="5" fill="none" />
                      <circle
                        cx="38" cy="38" r="31"
                        :stroke="energyColor" stroke-width="5" fill="none"
                        :stroke-dasharray="energyDash" :stroke-dashoffset="energyOffset"
                        stroke-linecap="round"
                      />
                    </svg>
                    <view class="ec-inner">
                      <text class="ec-value num">{{ twinStore.mastery.avg }}</text>
                      <text class="ec-sub">掌握/100</text>
                    </view>
                  </view>
                  <view class="state-detail">
                    <text class="sd-title">{{ mood }} · {{ moodHint }}</text>
                    <text class="sd-body">当前在{{ sceneName }}<br />正确率 {{ accuracy }}% · LV. {{ level }}</text>
                  </view>
                </view>
                <view class="state-strip">
                  <view>
                    <text class="ss-label">已掌握知识域</text>
                    <text class="ss-value num">{{ twinStore.mastery.mastered }} <text class="ss-unit">/ {{ twinStore.mastery.total }}</text></text>
                  </view>
                  <view>
                    <text class="ss-label">未解决错题</text>
                    <text class="ss-value num">{{ twinStore.progress.unresolvedWrong }} <text class="ss-unit">题</text></text>
                  </view>
                </view>
              </view>

              <!-- 能力画像 -->
              <view class="panel skills-panel">
                <view class="panel-head between">
                  <text class="panel-title">能力画像</text>
                  <text class="tag">行为驱动</text>
                </view>
                <SkillRadar :skills="twinStore.skills" color="#247b68" />
                <text class="help">能力值由掌握度按知识领域聚合；可在历史快照中追溯。</text>
              </view>
            </view>

            <view class="ov-right">
              <!-- 当前场景 -->
              <view class="panel scene-card">
                <view class="scene-visual">
                  <svg viewBox="0 0 300 150" aria-hidden="true">
                    <rect width="300" height="150" fill="#ecf2e5" />
                    <ellipse cx="150" cy="122" rx="118" ry="26" fill="#d3dfbe" opacity="0.5" />
                    <path d="M150 26 L216 122 H84 Z" fill="#c4d4ae" />
                    <path d="M150 26 L182 78 H118 Z" fill="#eef3e1" />
                    <path d="M150 26 L84 122 H118 Z" fill="#b7cba0" />
                    <path d="M150 26 L150 60 L138 40 Z" fill="#fafcf4" />
                    <path d="M60 122 l14 -8 10 6 -12 8 Z" fill="#a9c08d" />
                    <ellipse cx="66" cy="116" rx="14" ry="9" fill="#bace9d" />
                    <ellipse cx="238" cy="118" rx="12" ry="8" fill="#bace9d" />
                    <path d="M232 122 l6 -6 6 6 Z" fill="#a9c08d" />
                  </svg>
                  <text class="tag">当前所在场景</text>
                </view>
                <view class="scene-info">
                  <text class="scene-name">{{ sceneName }}</text>
                  <text class="scene-desc">从上次停下的位置，继续新的经历。</text>
                  <button class="tbtn soft block" @click="goWorld">继续探索 <svg class="twin-ico sm"><use href="#i-arrow" /></svg></button>
                </view>
              </view>

              <!-- 下一段经历 -->
              <view class="panel quick-panel">
                <view class="panel-head between">
                  <text class="panel-title">下一段经历</text>
                  <svg class="twin-ico sm panel-ico"><use href="#i-spark" /></svg>
                </view>
                <view class="quick-actions">
                  <button v-for="(q, i) in nextActions" :key="i" class="quick-action-line" @click="q.handler">
                    <text class="qa-symbol"><svg class="twin-ico"><use :href="'#i-' + q.icon" /></svg></text>
                    <view class="qa-text">
                      <text class="qa-strong">{{ q.label }}</text>
                      <text class="qa-small">{{ q.desc }}</text>
                    </view>
                    <svg class="twin-ico sm qa-arrow"><use href="#i-arrow" /></svg>
                  </button>
                </view>
                <view class="divider" />
                <text class="help">选择一段经历，进入对应功能。执行后才会更新你的状态与时间线。</text>
              </view>
            </view>

            <!-- 最近经历 -->
            <view class="panel events-panel">
              <view class="panel-head between">
                <text class="panel-title">最近的记忆链</text>
                <button class="tbtn ghost sm" @click="goMemory">全部记录 <svg class="twin-ico sm"><use href="#i-arrow" /></svg></button>
              </view>
              <EmptyState v-if="!twinStore.recentEvents.length" title="还没有经历" description="展开一次学习行动，时间线就会生长" icon="🕓" />
              <view v-else class="mini-events">
                <view v-for="ev in twinStore.recentEvents" :key="ev.id" class="mini-event" @click="goMemory">
                  <text class="mini-event-icon"><svg class="twin-ico sm"><use :href="'#i-' + kindIcon(ev.kind)" /></svg></text>
                  <view class="me-text">
                    <text class="me-title">{{ ev.title }}</text>
                    <text class="me-sub">{{ kindName(ev.kind) }} · {{ ev.source || '系统' }}</text>
                  </view>
                  <text class="me-time">{{ relTime(ev.at) }}</text>
                </view>
              </view>
            </view>
          </view>

          <!-- 全部功能 -->
          <view class="panel entries-panel">
            <view class="panel-head">
              <text class="panel-title">全部功能</text>
            </view>
            <view class="entry-grid">
              <button v-for="(e, i) in entries" :key="i" class="entry" @click="e.handler">
                <text class="entry-ico"><svg class="twin-ico"><use :href="'#i-' + e.icon" /></svg></text>
                <text class="entry-label">{{ e.label }}</text>
              </button>
            </view>
          </view>

          <!-- 诚实声明 -->
          <view class="panel scope-panel">
            <view class="panel-head between">
              <text class="panel-title">孪生的实现范围</text>
              <text class="tag">诚实声明</text>
            </view>
            <view class="scope-list">
              <view><svg class="twin-ico sm scope-ico"><use href="#i-check" /></svg><text>已实现：孪生总览、人物画像、虚拟世界（学科登峰）、行为与记忆、状态回放、数据与设置；身份 / 状态 / 记忆复用既成真源，仅新增 append-only 的「经历」。</text></view>
              <view><svg class="twin-ico sm scope-ico"><use href="#i-world" /></svg><text>虚拟世界以知识版图（领域 → 知识域）呈现，人物形象采用矢量绘制；状态由答题 / 练习 / 掌握度推导，为节点粒度近似值。</text></view>
              <view><svg class="twin-ico sm scope-ico"><use href="#i-data" /></svg><text>正式系统需接入真实身份认证与服务端画像；若孪生真实学生，还需界定经授权的数据来源。敏感字段（口令 / 密钥 / 令牌）不进入孪生。</text></view>
            </view>
          </view>

          <view class="safe-area" />
        </template>
      </scroll-view>
    </view>
  </ErrorBoundary>
</template>

<script>
import { computed, ref, onMounted, h } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useTwinStore } from '@/store/twin'
import { useUserStore } from '@/store/user'
import { useKnowledgeStore } from '@/store/knowledge'
import AvatarTwin from '@/components/twin/AvatarTwin.vue'
import SkillRadar from '@/components/twin/SkillRadar.vue'
import LoadingSkeleton from '@/components/ui/LoadingSkeleton.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import ErrorBoundary from '@/components/ErrorBoundary.vue'

const KIND_ICON = {
  system: 'grid',
  session: 'person',
  profile: 'person',
  world: 'pin',
  action: 'spark',
  memory: 'memory',
  settings: 'shield'
}
const KIND_NAME = {
  system: '初始化',
  session: '会话',
  profile: '人物设定',
  world: '世界',
  action: '学习行动',
  memory: '记忆',
  settings: '设置'
}

export default {
  name: 'Index',
  components: { AvatarTwin, SkillRadar, LoadingSkeleton, EmptyState, ErrorBoundary },
  setup() {
    const twinStore = useTwinStore()
    const userStore = useUserStore()
    const knowledgeStore = useKnowledgeStore()

    const avatarMode = ref('person')

    const sceneName = computed(() => twinStore.scene?.name || '尚未踏入版图')
    const accuracy = computed(() => twinStore.progress.accuracy ?? 0)
    const vigor = computed(() => Math.max(0, Math.min(100, Math.round(twinStore.mastery.avg || 0))))
    const level = computed(() => userStore.level || Math.floor((twinStore.progress.totalAnswered || 0) / 50) + 1)

    const actionCount = computed(() => twinStore.events.filter((e) => e.kind === 'action').length)

    const twinId = computed(() => {
      const id = twinStore.profile?.id
      return id ? 'T-' + String(id).replace(/-/g, '').slice(0, 10).toUpperCase() : 'T-—'
    })

    const roleLine = computed(() => {
      const g = twinStore.gradeName || '未设定年级'
      const s = twinStore.profile?.school || '未设定学校'
      return g + ' · ' + s
    })

    const mood = computed(() => {
      const v = vigor.value
      if (v >= 80) return '专注'
      if (v >= 60) return '稳定'
      if (v >= 40) return '积累中'
      return '起步'
    })
    const moodHint = computed(() => {
      const v = vigor.value
      if (v >= 70) return '适合学习与行动'
      if (v >= 40) return '适合轻量探索'
      return '适合打基础'
    })

    const energyColor = computed(() => (vigor.value < 40 ? '#b78140' : '#247b68'))
    const energyDash = 2 * Math.PI * 31
    const energyOffset = computed(() => energyDash * (1 - vigor.value / 100))

    const kindIcon = (k) => KIND_ICON[k] || 'grid'
    const kindName = (k) => KIND_NAME[k] || k

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

    const nextActions = [
      { icon: 'book', label: '参加一节课程', desc: '向 AI 教师求教', handler: () => uni.switchTab({ url: '/pages/chat/chat' }) },
      { icon: 'target', label: '完成一次练习', desc: '自适应刷题', handler: () => uni.switchTab({ url: '/pages/practice/index' }) },
      { icon: 'memory', label: '复习错题', desc: '复盘未解决', handler: () => uni.navigateTo({ url: '/pages/wrong-questions/index' }) }
    ]

    const entries = [
      { icon: 'chat', label: 'AI 辅导', handler: () => uni.switchTab({ url: '/pages/chat/chat' }) },
      { icon: 'target', label: '练习中心', handler: () => uni.switchTab({ url: '/pages/practice/index' }) },
      { icon: 'book', label: '学习计划', handler: () => uni.navigateTo({ url: '/pages/learning-plan/index' }) },
      { icon: 'memory', label: '错题本', handler: () => uni.navigateTo({ url: '/pages/wrong-questions/index' }) },
      { icon: 'camera', label: '拍照解题', handler: () => uni.navigateTo({ url: '/pages/camera/camera' }) },
      { icon: 'world', label: '虚拟世界', handler: goWorld },
      { icon: 'person', label: '人物画像', handler: () => uni.navigateTo({ url: '/pages/twin/profile' }) },
      { icon: 'clock', label: '行为与记忆', handler: goMemory },
      { icon: 'replay', label: '状态回放', handler: () => uni.navigateTo({ url: '/pages/twin/replay' }) },
      { icon: 'data', label: '数据与设置', handler: () => uni.navigateTo({ url: '/pages/twin/data' }) }
    ]

    function goWorld() {
      uni.navigateTo({ url: '/pages/twin/world' })
    }
    function goMemory() {
      uni.navigateTo({ url: '/pages/twin/memory' })
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
      avatarMode,
      sceneName,
      accuracy,
      vigor,
      level,
      actionCount,
      twinId,
      roleLine,
      mood,
      moodHint,
      energyColor,
      energyDash,
      energyOffset,
      kindIcon,
      kindName,
      relTime,
      nextActions,
      entries,
      goWorld,
      goMemory,
      fallbackContent: () =>
        h(EmptyState, {
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
/* ── PERSONA 范式：鼠尾草绿孪生面 ── */
.twin-page {
  min-height: 100vh;
  background: var(--twin-bg, #f3f5f2);
  color: var(--twin-ink, #203e3a);
}

.twin-scroll {
  height: 100vh;
  padding: 14px 14px 0;
  box-sizing: border-box;
}

.mono {
  font-family: 'SFMono-Regular', Consolas, monospace;
}

.num {
  font-variant-numeric: tabular-nums;
}

.help {
  display: block;
  font-size: 12px;
  color: var(--twin-sub, #74857f);
  line-height: 1.7;
}

.row-tight {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  vertical-align: middle;
}

.dot.play {
  color: #247b68;
  animation: twin-glow 2s infinite;
}

@keyframes twin-glow {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 0.9; }
}

/* 状态条 */
.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  background: #eaf3e8;
  border: 1px solid #dae9d7;
  border-radius: 10px;
  padding: 10px 16px;
  font-size: 12px;
  color: #5d7b61;
  margin-bottom: 18px;
}

.sb-left {
  color: #2d8867;
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.sb-right {
  font-size: 11px;
  color: #81977c;
}

/* 页标题 */
.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}

.ph-title {
  display: block;
  font-size: 24px;
  font-weight: 650;
  letter-spacing: -0.6px;
  color: var(--twin-ink, #203e3a);
}

.ph-sub {
  display: block;
  font-size: 12px;
  color: var(--twin-sub, #74857f);
  margin-top: 6px;
}

.ph-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

/* 通用面板 */
.panel {
  background: var(--twin-paper, #fff);
  border: 1px solid var(--twin-line, #e2e9e3);
  border-radius: 16px;
  padding: 18px;
  box-shadow: var(--twin-shadow, 0 6px 24px rgba(41, 73, 59, 0.06));
  box-sizing: border-box;
  min-width: 0;
  margin-bottom: 16px;
}

.panel-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.panel-head.between {
  justify-content: space-between;
}

.panel-title {
  font-size: 15px;
  font-weight: 650;
  color: var(--twin-ink, #203e3a);
}

.panel-ico {
  color: var(--twin-teal, #247b68);
}

.divider {
  height: 1px;
  background: var(--twin-line, #e2e9e3);
  margin: 14px 0;
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 5px;
  background: #f0f4ef;
  color: #5e786d;
  white-space: nowrap;
}

.tag.green {
  background: var(--twin-mint, #e8f4ec);
  color: var(--twin-teal, #247b68);
}

/* 按钮 */
.tbtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid var(--twin-line, #e2e9e3);
  border-radius: 9px;
  padding: 9px 14px;
  background: var(--twin-paper, #fff);
  color: var(--twin-ink, #203e3a);
  font-size: 12px;
  font-weight: 550;
  line-height: 1.5;
}

.tbtn.primary {
  background: var(--twin-teal, #247b68);
  color: #fff;
  border-color: var(--twin-teal, #247b68);
}

.tbtn.soft {
  background: var(--twin-mint, #e8f4ec);
  border-color: transparent;
  color: var(--twin-teal, #247b68);
}

.tbtn.ghost {
  background: transparent;
  border-color: transparent;
  padding: 6px 9px;
}

.tbtn.sm {
  padding: 6px 10px;
  font-size: 12px;
}

.tbtn.block {
  width: 100%;
  margin-top: 12px;
}

/* 网格 */
.ov-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0;
}

/* 数字人物面板 */
.avatar-panel {
  padding: 0;
  overflow: hidden;
  background: linear-gradient(165deg, #f8faf3, #edf3e8);
}

.avatar-panel .panel-head {
  padding: 18px 18px 0;
  margin-bottom: 0;
}

.ap-head-l {
  display: flex;
  flex-direction: column;
}

.twin-id {
  font-size: 10px;
  color: #9aaa93;
  margin-top: 4px;
  letter-spacing: 0.6px;
}

.avatar-stage {
  position: relative;
  padding: 6px 10px 0;
}

/* 收窄数字人物：不占满整卡，居中留白，避免过高 */
.avatar-box {
  position: relative;
  max-width: 158px;
  margin: 0 auto;
}

.avatar-stage .floor-ring {
  position: absolute;
  left: -14px;
  right: -14px;
  height: 34px;
  border: 1px solid #bbd4b0;
  border-radius: 50%;
  bottom: 2px;
  background: radial-gradient(ellipse, rgba(204, 225, 189, 0.31), transparent 75%);
}

.scan-label {
  position: absolute;
  left: -18px;
  top: 22px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(248, 251, 243, 0.85);
  border: 1px solid #dbe7d4;
  border-radius: 6px;
  padding: 4px 7px;
  font-size: 9px;
  color: #6f8e6a;
  white-space: nowrap;
}

.scan-label.right {
  left: auto;
  right: -18px;
  top: auto;
  bottom: 40px;
}

.avatar-base {
  padding: 4px 22px 20px;
  text-align: center;
}

.avatar-name {
  display: block;
  font-size: 22px;
  font-weight: 650;
  letter-spacing: -0.5px;
  color: var(--twin-ink, #203e3a);
}

.avatar-role {
  display: block;
  font-size: 12px;
  color: #89a081;
  margin-top: 2px;
}

.avatar-tools {
  display: flex;
  justify-content: center;
  gap: 7px;
  margin: 14px 0 18px;
}

.avatar-tools button {
  padding: 6px 12px;
  border: 1px solid #dce6d5;
  background: #f8fbf5;
  border-radius: 7px;
  font-size: 11px;
  color: #7a9372;
}

.avatar-tools button.active {
  background: #dfeeda;
  border-color: #cfe0c5;
  color: #3c7b59;
}

.avatar-bottom {
  display: flex;
  justify-content: space-between;
  border-top: 1px solid #dce7d5;
  padding-top: 13px;
  font-size: 11px;
  color: #7e9276;
}

/* 指标 */
.metric-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.metric {
  background: var(--twin-paper, #fff);
  border: 1px solid var(--twin-line, #e2e9e3);
  border-radius: 14px;
  padding: 15px 16px;
  box-shadow: var(--twin-shadow, 0 6px 24px rgba(41, 73, 59, 0.06));
}

.metric-label {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 11px;
  color: var(--twin-sub, #74857f);
  color: #74857f;
}

.metric-value {
  display: block;
  font-size: 28px;
  line-height: 1.35;
  margin-top: 6px;
  color: #345e50;
  font-weight: 650;
  letter-spacing: -1px;
}

.mv-unit {
  font-size: 11px;
  color: #91a18f;
  font-weight: 400;
  margin-left: 4px;
}

.metric-bottom {
  display: block;
  font-size: 10px;
  color: #9caa93;
  margin-top: 3px;
}

/* 状态 */
.state-top {
  display: flex;
  align-items: center;
  gap: 16px;
}

.energy-circle {
  width: 76px;
  height: 76px;
  position: relative;
  flex-shrink: 0;
}

.energy-circle svg {
  transform: rotate(-90deg);
  width: 100%;
  height: 100%;
}

.ec-inner {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.ec-value {
  font-size: 22px;
  font-weight: 650;
  color: var(--twin-ink, #203e3a);
  line-height: 1.1;
}

.ec-sub {
  font-size: 9px;
  color: var(--twin-sub, #74857f);
  margin-top: 2px;
}

.state-detail {
  flex: 1;
  min-width: 0;
}

.sd-title {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: var(--twin-ink, #203e3a);
  margin-bottom: 6px;
}

.sd-body {
  display: block;
  font-size: 11px;
  color: var(--twin-sub, #74857f);
  line-height: 1.8;
}

.state-strip {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-top: 16px;
  padding-top: 15px;
  border-top: 1px solid var(--twin-line, #e2e9e3);
}

.ss-label {
  display: block;
  font-size: 10px;
  color: var(--twin-sub, #74857f);
}

.ss-value {
  display: block;
  font-size: 18px;
  font-weight: 600;
  color: var(--twin-ink, #203e3a);
  margin-top: 4px;
}

.ss-unit {
  font-size: 11px;
  color: #91a18f;
  font-weight: 400;
}

/* 能力 */
.skills-panel .help {
  margin-top: 10px;
}

/* 场景 */
.scene-card {
  padding: 0;
  overflow: hidden;
}

.scene-visual {
  height: 128px;
  position: relative;
  overflow: hidden;
}

.scene-visual svg {
  width: 100%;
  height: 100%;
  display: block;
}

.scene-visual .tag {
  position: absolute;
  top: 12px;
  left: 15px;
  background: rgba(255, 255, 255, 0.8);
}

.scene-info {
  padding: 16px 18px;
}

.scene-name {
  display: block;
  font-size: 17px;
  font-weight: 650;
  color: var(--twin-ink, #203e3a);
}

.scene-desc {
  display: block;
  font-size: 11px;
  color: var(--twin-sub, #74857f);
  margin: 6px 0 0;
}

/* 下一段经历 */
.quick-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.quick-action-line {
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
  background: #f8faf5;
  border: 1px solid #e7ede1;
  border-radius: 9px;
  padding: 10px;
  width: 100%;
  color: var(--twin-ink, #203e3a);
}

.qa-symbol {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: #e6eee0;
  color: #719062;
  flex-shrink: 0;
}

.qa-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.qa-strong {
  font-size: 12px;
  font-weight: 550;
}

.qa-small {
  font-size: 10px;
  color: #8d9c84;
}

.qa-arrow {
  color: #99ac90;
}

/* 最近经历 */
.mini-events {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mini-event {
  display: flex;
  gap: 12px;
  align-items: center;
  width: 100%;
  text-align: left;
}

.mini-event-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: #f0f5ed;
  border-radius: 9px;
  color: #86a178;
  flex-shrink: 0;
}

.me-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.me-title {
  font-size: 12px;
  font-weight: 550;
  color: var(--twin-ink, #203e3a);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.me-sub {
  font-size: 10px;
  color: #96a08d;
}

.me-time {
  font-size: 10px;
  color: #a0aa97;
  white-space: nowrap;
}

/* 全部功能 */
.entry-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.entry {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  padding: 13px 6px;
  background: #f8faf5;
  border: 1px solid #e7ede1;
  border-radius: 11px;
  color: var(--twin-ink, #203e3a);
}

.entry-ico {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 9px;
  background: #e6eee0;
  color: #5f8668;
}

.entry-label {
  font-size: 11px;
  color: #4f6d5b;
}

/* 诚实声明 */
.scope-list {
  display: flex;
  flex-direction: column;
  gap: 11px;
  font-size: 12px;
  color: #839276;
  line-height: 1.75;
}

.scope-list > view {
  display: flex;
  gap: 9px;
  align-items: flex-start;
}

.scope-ico {
  color: #7ba466;
  margin-top: 2px;
}

.safe-area {
  height: 40px;
}

/* 窄屏：指标保持两列，功能保持三列 */
@media (max-width: 360px) {
  .entry-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
