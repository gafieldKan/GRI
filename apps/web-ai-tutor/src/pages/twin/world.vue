<template>
  <view class="twin-page">
    <view class="page-head">
      <view class="ph-main">
        <text class="ph-title">虚拟世界 · 登峰</text>
        <text class="ph-sub">每门学科都是一座山——每个知识域是一个营地；点一个营地，看你从山脚一路攀到它。</text>
      </view>
      <view class="ph-actions">
        <text class="tag green"><svg class="twin-ico sm"><use href="#i-pin" /></svg>当前：{{ scene ? scene.name : '未踏入' }}</text>
        <button class="tbtn" @click="showSubjectBar = !showSubjectBar"><svg class="twin-ico sm"><use href="#i-world" /></svg>切换学科</button>
      </view>
    </view>

    <!-- 学科切换条 -->
    <view class="subject-bar" v-if="showSubjectBar">
      <button
        v-for="s in knowledgeStore.subjectList"
        :key="s.id"
        class="s-tab"
        :class="{ active: knowledgeStore.currentSubject === s.id }"
        @click="switchSubject(s.id)"
      >{{ s.icon }} {{ s.name }}</button>
    </view>

    <LoadingSkeleton v-if="knowledgeStore.loading" />

    <EmptyState
      v-else-if="!stats.total"
      icon="🏔"
      title="该学科版图尚未就绪"
      description="版图数据由教研侧审核后灌库——换一门学科看看，或稍后再来"
    />

    <!-- 世界：地图 + 侧栏 -->
    <view v-else class="world-layout">
      <view class="col-main">
        <!-- 世界状态 -->
        <view class="world-status">
          <view class="ws-cell">
            <text class="ws-label">掌握度</text>
            <text class="ws-value num">{{ masteryAvg }}<text class="ws-unit"> /100</text></text>
            <view class="ws-bar"><view class="ws-fill" :style="{ width: Math.min(100, masteryAvg) + '%' }" /></view>
          </view>
          <view class="ws-cell">
            <text class="ws-label">经历等级</text>
            <text class="ws-value num">LV.{{ level }}<text class="ws-unit"> · {{ xp }} XP</text></text>
            <view class="ws-bar"><view class="ws-fill amber" :style="{ width: (xp % 1000) / 10 + '%' }" /></view>
          </view>
          <view class="ws-cell">
            <text class="ws-label">已登顶营地</text>
            <text class="ws-value num">{{ masteredCount }}<text class="ws-unit"> / {{ k12Count }}</text></text>
            <view class="ws-bar"><view class="ws-fill" :style="{ width: (k12Count ? (masteredCount / k12Count) * 100 : 0) + '%' }" /></view>
          </view>
        </view>

        <!-- 登峰地图 -->
        <view class="map-panel">
          <view class="map-scene">
            <svg
              class="map-svg"
              viewBox="0 0 700 1000"
              preserveAspectRatio="xMidYMid meet"
              role="img"
              aria-label="学科登峰地图：展示各知识域营地的学习进度与登峰路线"
            >
              <defs>
                <pattern id="grid" width="26" height="26" patternUnits="userSpaceOnUse">
                  <circle cx="2" cy="2" r="0.8" fill="#9fbf94" />
                </pattern>
                <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stop-color="#ffe4b5" /> <!-- 墙光 -->
                  <stop offset="0.3" stop-color="#ffdab9" /> <!-- 桃金 -->
                  <stop offset="0.7" stop-color="#87ceeb" /> <!-- 天蓝 -->
                  <stop offset="1" stop-color="#b0e0e6" /> <!-- 柔和青 -->
                </linearGradient>
                <radialGradient id="sunG" cx="0.5" cy="0.5">
                  <stop offset="0" stop-color="#fff2cf" stop-opacity="0.95" />
                  <stop offset="1" stop-color="#ffe9b8" stop-opacity="0" />
                </radialGradient>
                <radialGradient id="peakG" cx="0.5" cy="0.5">
                  <stop offset="0" stop-color="#ffffff" stop-opacity="0.75" />
                  <stop offset="1" stop-color="#ffffff" stop-opacity="0" />
                </radialGradient>
                <linearGradient id="climbBeam" x1="0" y1="0" x2="0" y2="1">
                  <stop stop-color="#247b68" stop-opacity="0" />
                  <stop offset="1" stop-color="#247b68" stop-opacity="0.14" />
                </linearGradient>
                <linearGradient id="ridgeG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stop-color="#e9f1df" />
                  <stop offset="1" stop-color="#d4e2c5" />
                </linearGradient>
                <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="2.4" result="b" />
                  <feMerge>
                    <feMergeNode in="b" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              <!-- 天空 + 点阵 -->
              <rect width="700" height="1000" fill="url(#sky)" />
              <rect width="700" height="1000" fill="url(#grid)" opacity="0.13" />
              <circle cx="596" cy="112" r="86" fill="url(#sunG)" />
              <circle cx="596" cy="112" r="19" fill="#fdf3d6" />

              <!-- 远峰群 -->
              <path :d="leftPeakPath" fill="#dce8ce" opacity="0.7" />
              <path :d="rightPeakPath" fill="#d3e1c5" opacity="0.62" />
              <path d="M505 196 549 274 532 269 515 285 499 265 470 274Z" fill="#fbfdf6" opacity="0.9" />

              <!-- 飞鸟 -->
              <g class="birds" opacity="0.5">
                <path d="M262 208q7-7 14 0M280 200q6-6 12 0" fill="none" stroke="#8fa883" stroke-width="1.6" stroke-linecap="round" />
              </g>

              <!-- 云带 -->
              <g class="cloud cloud-a">
                <path d="M170 154q14-26 44-18 16-24 46-10 26-6 30 20 22 4 16 24H176q-24 0-6-16Z" fill="#ffffff" opacity="0.92" />
              </g>
              <g class="cloud cloud-b">
                <path d="M414 190q12-22 38-15 14-20 40-8 22-5 26 17 18 4 13 20H418q-20 0-4-14Z" fill="#ffffff" opacity="0.82" />
              </g>
              <g class="cloud cloud-c">
                <path d="M300 118q10-18 32-12 12-16 33-6 18-4 21 14 15 3 11 16H303q-17 0-3-12Z" fill="#ffffff" opacity="0.7" />
              </g>

              <!-- 主峰（多段山脊 + 雪顶 + 等高线） -->
              <path :d="ridgePath" fill="url(#ridgeG)" />
              <path v-for="(c, i) in contours" :key="'c' + i" :d="c" fill="none" stroke="#c8d8b2" stroke-width="1" opacity="0.65" />
              <path :d="snowCap" fill="#fbfdf8" opacity="0.92" />
              <circle cx="350" cy="150" r="60" fill="url(#peakG)" />

              <!-- 分层台地 -->
              <polygon
                v-for="t in terraces"
                :key="t.g"
                :points="t.points"
                :class="['terrace', 'terrace-' + t.state]"
              />

              <!-- 植被与岩石 -->
              <g
                v-for="(f, i) in flora"
                :key="'f' + i"
                :class="{ flora: f.sway }"
                :style="f.sway ? { '--td': (i * 0.37) + 's' } : {}"
                :transform="`translate(${f.x} ${f.y}) scale(${f.s})`"
              >
                <!-- 针叶 -->
                <template v-if="f.type === 'pine'">
                  <ellipse cx="0" cy="6" rx="15" ry="6" fill="#6d8a5c" opacity="0.14" />
                  <g :class="{ sway: f.sway }"><path d="M0-17v23" stroke="#9bb182" stroke-width="4" /><path d="M0-52 14-14H-14Z" fill="#9db67c" /><path d="M0-64 11-30H-11Z" fill="#b3c795" /><path d="M0-74 8-46H-8Z" fill="#8fab6c" /></g>
                </template>
                <!-- 阔叶 -->
                <template v-else-if="f.type === 'oak'">
                  <ellipse cx="0" cy="6" rx="17" ry="7" fill="#6d8a5c" opacity="0.14" />
                  <g :class="{ sway: f.sway }"><path d="M0-8v-18" stroke="#8c7a5a" stroke-width="4" /><ellipse cx="-8" cy="-34" rx="15" ry="13" fill="#87a86a" /><ellipse cx="9" cy="-33" rx="14" ry="12" fill="#9bb87a" /><ellipse cx="0" cy="-44" rx="14" ry="12" fill="#a8c286" /></g>
                </template>
                <!-- 灌木 -->
                <template v-else-if="f.type === 'shrub'">
                  <ellipse cx="0" cy="4" rx="14" ry="5" fill="#6d8a5c" opacity="0.12" />
                  <g :class="{ sway: f.sway }"><ellipse cx="-7" cy="-6" rx="11" ry="8" fill="#9db87a" /><ellipse cx="7" cy="-5" rx="10" ry="7" fill="#aec98c" /></g>
                </template>
                <!-- 岩石 -->
                <template v-else>
                  <polygon points="-12,4 -7,-9 4,-12 12,-3 8,5" fill="#b9b09c" />
                  <polygon points="-7,-9 4,-12 2,-4 -5,-3" fill="#cbc3b0" />
                </template>
              </g>

              <!-- 登山路：路基 + 流动导向虚线 -->
              <polyline :points="trailPoints" fill="none" stroke="#e7ded0" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" opacity="0.55" />
              <polyline class="trail-dash" :points="trailPoints" fill="none" stroke="#a9c095" stroke-width="1.7" stroke-dasharray="3 7" stroke-linecap="round" opacity="0.85" />

              <!-- 攀爬轨迹（点击营地后逐段生长） -->
              <polyline :points="climbedPoints" fill="none" stroke="#247b68" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)" opacity="0.9" />

              <!-- 孪生人物（外层定位，内层浮动） -->
              <g v-if="climber" :transform="`translate(${climber.x} ${climber.y})`">
                <g class="climber-fig">
                  <path d="M0 4 V-100" stroke="url(#climbBeam)" stroke-width="22" />
                  <ellipse cx="0" cy="26" rx="26" ry="10" fill="#5b8b68" opacity="0.16" />
                  <circle cx="0" cy="2" r="24" fill="none" stroke="#247b68" stroke-width="1.6" opacity="0.5" />
                  <path d="M-6-19-5 0m11-19L5 0" stroke="#5f7168" stroke-width="5" />
                  <path d="M-10-33-14-16m24-17 5 17" stroke="#c5d9b6" stroke-width="5" />
                  <path d="M-8-34h16l2 18h-20Z" fill="#247b68" />
                  <circle cx="0" cy="-44" r="8" fill="#d2aa88" />
                  <path d="M-8-45q0-12 10-8 8 2 6 9" fill="#495443" />
                  <path d="M0-66v-9" stroke="#54826a" stroke-width="1.4" />
                  <circle cx="0" cy="-79" r="4" fill="#247b68" />
                </g>
              </g>

              <!-- 峰顶旗帜 -->
              <g transform="translate(350 118)">
                <path d="M0 0 V-40" stroke="#7c8f6f" stroke-width="2" />
                <path class="flag-cloth" d="M0-40h22l-6 7 6 7H0Z" fill="#247b68" />
              </g>

              <text x="350" y="978" text-anchor="middle" font-size="11" fill="#8b9a80">
                山脚 · {{ gradeShort(1) }}起步 · 峰顶 {{ gradeShort(12) }}
              </text>
            </svg>

            <!-- 每个知识域一个可动热点 -->
            <button
              v-for="(n, i) in nodes"
              ref="hnButtons"
              :key="n.code"
              class="hn"
              :class="[`hn-${n.state}`, { selected: selected && selected.code === n.code, here: n.here, mastered: n.mastered }]"
              :style="{ left: n.left + '%', top: n.top + '%', '--d': ((i % 9) * 0.35) + 's' }"
              :aria-label="`知识域 ${n.name}，状态：${stateLabel(n.state)}`"
              @click="pick(n)" @click.native="createRipple($event)"
            >
              <span class="hn-badge">
                <span v-if="n.here" class="hn-ring" />
                <svg v-if="n.mastered" class="hn-glyph" viewBox="0 0 24 24">
                  <path d="M7 21V3" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                  <path d="M7 4h10l-3 4 3 4H7Z" fill="currentColor" />
                </svg>
                <svg v-else-if="n.state === 'current'" class="hn-glyph" viewBox="0 0 24 24">
                  <path d="M12 3 3 20h18Z" fill="currentColor" />
                  <path d="M12 9 8 20h8Z" fill="#fff" opacity="0.7" />
                </svg>
                <svg v-else class="hn-glyph" viewBox="0 0 24 24">
                  <circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="2" />
                  <path d="M12 12v9" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                </svg>
              </span>
              <text v-if="n.here || (selected && selected.code === n.code)" class="hn-label">{{ n.name }}</text>
              <text v-else-if="isVeryNear(n)" class="hn-label hn-label-full">{{ n.name }}</text>
              <text v-else-if="isNear(n)" class="hn-label hn-label-short">{{ n.name.slice(0, 2) }}</text>
              <text v-else-if="isMedium(n)" class="hn-label hn-label-one">{{ n.name.slice(0, 1) }}</text>
              <text v-else class="hn-label hn-label-dot">●</text>
            </button>
          </view>
        </view>
      </view>

      <!-- 侧栏 -->
      <view class="col-side">
        <view class="side-card">
          <text class="side-title">图例</text>
          <view class="legend-list">
            <view class="lg-row"><view class="lg-dot here-dot" /><text>当前位置（脉冲环）</text></view>
            <view class="lg-row"><view class="lg-dot won-dot" /><text>已登顶营地</text></view>
            <view class="lg-row"><view class="lg-dot ahead-dot" /><text>未至营地</text></view>
            <view class="lg-row"><view class="lg-route" /><text>攀爬轨迹（会生长）</text></view>
          </view>
          <text class="side-hint">点任意营地 → 看从山脚攀到它的路径</text>
        </view>

        <view class="side-card" v-if="twinStore.recentEvents.length">
          <view class="side-head">
            <text class="side-title">世界里的最近经历</text>
            <button class="tbtn ghost sm" @click="goMemory">全部 <svg class="twin-ico sm"><use href="#i-arrow" /></svg></button>
          </view>
          <view class="mini-events">
            <view v-for="ev in twinStore.recentEvents.slice(0, 4)" :key="ev.id" class="mini-event">
              <text class="me-icon"><svg class="twin-ico sm"><use href="#i-spark" /></svg></text>
              <view class="me-text">
                <text class="me-title">{{ ev.title }}</text>
                <text class="me-sub">{{ ev.source || '系统' }}</text>
              </view>
              <text class="me-time">{{ relTime(ev.at) }}</text>
            </view>
          </view>
        </view>

        <text class="world-notice">
          地图为学科版图的示意——每个营地是一处知识域，沿登山路由山脚向峰顶排布；掌握度来自答题记录，为近似值。
        </text>
      </view>
    </view>

    <view class="safe-area" />

    <!-- 详情面板 -->
    <view class="detail-mask" v-if="selected" @click="selected = null">
      <view class="detail-card" @click.stop>
        <!-- 峰外 -->
        <template v-if="selected.code === '__frontier__'">
          <view class="detail-head">
            <text class="detail-title">峰外地带</text>
            <text class="tag">峰外</text>
            <text class="detail-close" @click="selected = null">✕</text>
          </view>
          <text class="detail-desc">越过 K12 峰顶之后的学科前沿——不是终点，而是更高的山脊。</text>
          <view class="camp-list">
            <view v-for="a in frontierAreas" :key="a.code" class="camp-chip" @click="openArea(a)">
              <view class="camp-main">
                <text class="camp-name">{{ a.name }}</text>
                <view class="camp-bar" v-if="a.mastery != null"><view class="camp-fill" :style="{ width: Math.min(100, a.mastery) + '%' }" /></view>
              </view>
              <text class="camp-val" v-if="a.mastery != null">{{ Math.round(a.mastery) }}%</text>
              <svg class="twin-ico sm"><use href="#i-arrow" /></svg>
            </view>
          </view>
        </template>

        <!-- 营地详情 -->
        <template v-else-if="selected.code">
          <view class="detail-head">
            <text class="detail-title">{{ selected.name }}</text>
            <text class="tag" :class="selected.scope === 'frontier' ? '' : 'green'">{{ selected.scope === 'frontier' ? '峰外' : '营地' }}</text>
            <text class="detail-close" @click="selected = null">✕</text>
          </view>

          <!-- 主信息：掌握度 -->
          <view class="hero-metric" v-if="selected.mastery != null">
            <view class="hm-head">
              <text class="hm-label">掌握度</text>
              <text class="hm-val num">{{ Math.round(selected.mastery) }}<text class="hm-pct">%</text></text>
            </view>
            <view class="hm-bar"><view class="hm-fill" :style="{ width: Math.min(100, selected.mastery) + '%' }" /></view>
            <text class="hm-note">{{ masteryWord(selected.mastery) }}（近似值）</text>
          </view>

          <text class="detail-desc" v-if="selected.description">{{ selected.description }}</text>

          <view class="route">
            <text class="route-label">航线（前置依赖）</text>
            <view class="route-chain" v-if="routeSteps.length">
              <text v-for="(r, i) in routeSteps" :key="i" class="route-node">
                <text v-if="i > 0" class="route-arrow">→ </text>{{ r }}
              </text>
              <text class="route-node current"><text class="route-arrow">→ </text>{{ selected.name }}</text>
            </view>
            <text class="route-none" v-else>起点营地 —— 无前置依赖，可直接挑战</text>
          </view>

          <!-- 次要信息 -->
          <view class="detail-rows">
            <view class="detail-row" v-if="selected.scope === 'k12'">
              <text class="row-key">落位年级</text>
              <text class="row-val">{{ gradeName(selected.gradeLevel) }}</text>
            </view>
            <view class="detail-row" v-else>
              <text class="row-key">地带</text>
              <text class="row-val">峰外 · K12 之后的学科前沿</text>
            </view>
            <view class="detail-row">
              <text class="row-key">所属领域</text>
              <text class="row-val">{{ fieldName(selected.fieldCode) }}</text>
            </view>
            <view class="detail-row" v-if="selected.kpCount > 0">
              <text class="row-key">已入库知识点</text>
              <text class="row-val">{{ selected.kpCount }} 个（可在知识图谱页展开）</text>
            </view>
          </view>

          <view class="action-list">
            <view class="action-item">
              <text class="ai-title">🏋 练一练</text>
              <text class="ai-desc">按该营地开一次练习，答题记录会写入你的经历。</text>
              <button class="tbtn primary block" @click="practiceHere(selected.code)">开始练习 <svg class="twin-ico sm"><use href="#i-arrow" /></svg></button>
            </view>
            <view class="action-item">
              <text class="ai-title">💬 请教 AI 教师</text>
              <text class="ai-desc">就这个知识域向你的 AI 教师提问。</text>
              <button class="tbtn soft block" @click="askTeacher()">去求教 <svg class="twin-ico sm"><use href="#i-arrow" /></svg></button>
            </view>
            <view class="action-item">
              <text class="ai-title">🧠 知识图谱</text>
              <text class="ai-desc">展开该领域的知识点与前置关系。</text>
              <button class="tbtn block" @click="goGraph">展开图谱 <svg class="twin-ico sm"><use href="#i-arrow" /></svg></button>
            </view>
          </view>
        </template>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useKnowledgeStore } from '@/store/knowledge'
import { usePracticeStore } from '@/store/practice'
import { useTwinStore } from '@/store/twin'
import { useUserStore } from '@/store/user'
import EmptyState from '@/components/ui/EmptyState.vue'
import LoadingSkeleton from '@/components/ui/LoadingSkeleton.vue'

const knowledgeStore = useKnowledgeStore()
const practiceStore = usePracticeStore()
const twinStore = useTwinStore()
const userStore = useUserStore()
const showSubjectBar = ref(true)
const selected = ref(null)
const climbFrac = ref(0)
const focusedNodeIndex = ref(-1)
const hnButtons = ref([])

const GRADE_NAMES = {
  1: '一年级', 2: '二年级', 3: '三年级', 4: '四年级', 5: '五年级', 6: '六年级',
  7: '七年级', 8: '八年级', 9: '九年级', 10: '高一', 11: '高二', 12: '高三'
}
const GRADE_SHORT = {
  1: '小一', 2: '小二', 3: '小三', 4: '小四', 5: '小五', 6: '小六',
  7: '初一', 8: '初二', 9: '初三', 10: '高一', 11: '高二', 12: '高三'
}
const gradeName = (g) => GRADE_NAMES[g] ?? `G${g}`
const gradeShort = (g) => GRADE_SHORT[g] ?? `G${g}`
function stateLabel(s) {
  return s === 'current' ? '当前学习' : s === 'passed' ? '已翻越' : '待抵达'
}

function handleKeyDown(event, index, node) {
  const { key } = event
  if (key === 'Enter' || key === ' ') {
    event.preventDefault()
    pick(node)
    focusedNodeIndex.value = index
  } else if (key === 'ArrowRight') {
    event.preventDefault()
    focusedNodeIndex.value = (index + 1) % nodes.value.length
  } else if (key === 'ArrowLeft') {
    event.preventDefault()
    focusedNodeIndex.value = (index + nodes.value.length - 1) % nodes.value.length
  } else if (key === 'Home') {
    event.preventDefault()
    focusedNodeIndex.value = 0
  } else if (key === 'End') {
    event.preventDefault()
    focusedNodeIndex.value = nodes.value.length - 1
  }
}
function masteryWord(m) {
  if (m >= 80) return '已登顶'
  if (m >= 60) return '接近峰顶'
  if (m >= 40) return '半山'
  if (m >= 15) return '初上路'
  return '尚在山脚'
}


const MAP_W = 700
const MAP_H = 1000
const APEX = { x: 350, y: 118 }
const BASE_Y = 940
const HALF_W = 282
const SWEEPS = 6
const hwAt = (y) => (HALF_W * (y - APEX.y)) / (BASE_Y - APEX.y)
const levelY = (g) => BASE_Y - ((g - 1) / 12) * (BASE_Y - APEX.y)

// 自然山脊：左右对称、含肩部起伏（非生硬三角形）
const ridgePath = (() => {
  const N = 16
  const left = []
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const x = 60 + (APEX.x - 60) * t
    const base = BASE_Y - (BASE_Y - APEX.y) * t
    const bump = (Math.sin(t * Math.PI * 2.4) * 26 + Math.sin(t * Math.PI * 5) * 11) * (1 - t)
    left.push([x, base - Math.abs(bump)])
  }
  const right = left.slice(0, -1).reverse().map(([x, y]) => [700 - x, y])
  const pts = [...left, ...right]
  return `M${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L')} Z`
})()

// 峰顶雪冠
const snowCap = (() => {
  const y0 = 190
  const hw = hwAt(y0) * 0.9
  return `M${APEX.x - hw} ${y0} Q${APEX.x - hw * 0.45} ${y0 - 24} ${APEX.x} ${APEX.y} Q${APEX.x + hw * 0.45} ${y0 - 24} ${APEX.x + hw} ${y0} Q${APEX.x} ${y0 + 14} ${APEX.x - hw} ${y0} Z`
})()

// 等高线（含地形扰动）
const contours = (() => {
  const out = []
  for (let g = 2; g <= 11; g += 2) {
    const y = levelY(g)
    const hw = hwAt(y) * 0.9
    // Multi-frequency noise for more natural contours
    const n = Math.sin(g * 0.7) * 9 + Math.sin(g * 1.3) * 4 + Math.sin(g * 2.1) * 2
    out.push(`M${APEX.x - hw + n} ${y + n * 0.4} Q${APEX.x} ${y - 16 + n * 0.5} ${APEX.x + hw + n} ${y + n * 0.4}`)
  }
  return out
})()

// Flora / Rocks (diversified)
const flora = [
  { type: 'pine', x: 74, y: 872, s: 1.0, sway: true },
  { type: 'oak', x: 132, y: 908, s: 0.92, sway: true },
  { type: 'pine', x: 196, y: 882, s: 0.82, sway: true },
  { type: 'shrub', x: 246, y: 924, s: 0.9, sway: true },
  { type: 'rock', x: 300, y: 934, s: 0.85, sway: false },
  { type: 'rock', x: 404, y: 936, s: 0.78, sway: false },
  { type: 'shrub', x: 452, y: 926, s: 0.72, sway: true },
  { type: 'oak', x: 512, y: 878, s: 0.96, sway: true },
  { type: 'pine', x: 568, y: 912, s: 1.05, sway: true },
  { type: 'shrub', x: 622, y: 886, s: 0.8, sway: true },
  { type: 'pine', x: 648, y: 928, s: 0.88, sway: true },
  // Added plant types
  { type: 'cactus', x: 100, y: 910, s: 0.7, sway: false },
  { type: 'mushroom', x: 550, y: 900, s: 0.6, sway: false },
  { type: 'cactus', x: 300, y: 920, s: 0.8, sway: false },
  { type: 'mushroom', x: 450, y: 930, s: 0.5, sway: false }
]
// 右侧远峰（自然山脊）
const rightPeakPath = (() => {
  const N = 20
  const points = []
  const x0 = 340
  const x1 = 680
  const yBase = 500
  const yPeak = 190
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const x = x0 + (x1 - x0) * t
    const bump = Math.sin(t * Math.PI * 2.2) * 18 + Math.sin(t * Math.PI * 5) * 10
    const y = yBase - (yBase - yPeak) * t - bump
    points.push([x, y])
  }
  let path = 'M'
  for (let i = 0; i < points.length; i++) {
    const [x, y] = points[i]
    path += x + ',' + y
    if (i < points.length - 1) path += ' L'
  }
  path += ' L' + x1 + ' ' + yBase + ' Z'
  return path
})()

// 左侧远峰（自然山脊）
const leftPeakPath = (() => {
  const N = 20
  const points = []
  const x0 = 20
  const x1 = 180
  const yBase = 500
  const yPeak = 230
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const x = x0 + (x1 - x0) * t
    const bump = Math.sin(t * Math.PI * 2) * 15 + Math.sin(t * Math.PI * 4) * 8
    const y = yBase - (yBase - yPeak) * t - bump
    points.push([x, y])
  }
  let path = 'M'
  for (let i = 0; i < points.length; i++) {
    const [x, y] = points[i]
    path += x + ',' + y
    if (i < points.length - 1) path += ' L'
  }
  path += ' L' + x1 + ' ' + yBase + ' Z'
  return path
})()


// 之字形登山路折点
function buildTrailPoints() {
  const pts = []
  for (let k = 0; k <= SWEEPS; k++) {
    const y = BASE_Y - (k / SWEEPS) * (BASE_Y - APEX.y)
    const hw = hwAt(y) * 0.84
    const startX = k % 2 === 0 ? APEX.x - hw : APEX.x + hw
    const endX = k % 2 === 0 ? APEX.x + hw : APEX.x - hw
    pts.push({ x: startX, y })
    if (Math.abs(endX - startX) > 1) pts.push({ x: endX, y })
  }
  return pts
}

// 按弧长细采样，供 f∈[0,1] 取点
const pathSamples = (() => {
  const pts = buildTrailPoints()
  const out = [{ x: pts[0].x, y: pts[0].y, f: 0 }]
  let total = 0
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  let acc = 0
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
    const steps = Math.max(1, Math.round(seg / 8))
    for (let s = 1; s <= steps; s++) {
      const t = s / steps
      acc += seg / steps
      out.push({
        x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t,
        y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t,
        f: total ? acc / total : 0
      })
    }
  }
  return out
})()

function pointAtF(f) {
  const arr = pathSamples
  const ff = Math.max(0, Math.min(1, f))
  for (let i = 1; i < arr.length; i++) {
    if (arr[i].f >= ff) {
      const a = arr[i - 1]
      const b = arr[i]
      const t = (ff - a.f) / (b.f - a.f || 1)
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    }
  }
  const last = arr[arr.length - 1]
  return { x: last.x, y: last.y }
}

// ── 数据 ──
const stats = computed(() => knowledgeStore.mapData.stats || { total: 0, k12: 0, frontier: 0, mastered: 0 })
const masteryAvg = computed(() => twinStore.mastery.avg || 0)
const level = computed(() => userStore.level || Math.floor((twinStore.progress.totalAnswered || 0) / 50) + 1)
const xp = computed(() => userStore.xp || twinStore.progress.correctCount || 0)
const areas = computed(() => knowledgeStore.mapData.areas || [])
const frontierAreas = computed(() => areas.value.filter((a) => a.scope === 'frontier'))
const k12Count = computed(() => areas.value.filter((a) => a.scope === 'k12').length)
const masteredCount = computed(() => areas.value.filter((a) => a.scope === 'k12' && a.mastery != null && a.mastery >= 80).length)
const currentGrade = computed(() => knowledgeStore.currentGrade)
const scene = computed(() => twinStore.scene)

const areasByGrade = computed(() => {
  const by = {}
  for (let g = 1; g <= 12; g++) by[g] = []
  for (const a of areas.value) {
    if (a.scope === 'k12' && a.gradeLevel && by[a.gradeLevel]) by[a.gradeLevel].push(a)
  }
  return by
})

const orderedAreas = computed(() => {
  const list = []
  for (let g = 1; g <= 12; g++) for (const a of areasByGrade.value[g]) list.push({ ...a, grade: g })
  return list
})

function layerState(grade) {
  const me = currentGrade.value
  if (!me) return 'ahead'
  if (grade < me) return 'passed'
  if (grade === me) return 'current'
  return 'ahead'
}

// 每个知识域 = 一个独立热点，沿登山路按弧长均匀落位
const nodes = computed(() => {
  const list = orderedAreas.value
  const n = list.length
  if (!n) return []
  return list.map((a, i) => {
    const f = (i + 0.5) / n
    const p = pointAtF(f)
    return {
      code: a.code,
      name: a.name,
      f,
      grade: a.grade,
      state: layerState(a.grade),
      mastered: a.mastery != null && a.mastery >= 80,
      here: !!scene.value && scene.value.code === a.code,
      left: (p.x / MAP_W) * 100,
      top: (p.y / MAP_H) * 100
    }
  })
})

const terraces = computed(() => {
  const out = []
  for (let g = 1; g <= 12; g++) {
    const y1 = levelY(g)
    const y2 = levelY(g + 1)
    const w1 = hwAt(y1)
    const w2 = hwAt(y2)
    out.push({
      g,
      state: layerState(g),
      points: `${APEX.x - w1},${y1} ${APEX.x + w1},${y1} ${APEX.x + w2},${y2} ${APEX.x - w2},${y2}`
    })
  }
  return out
})

const trailPoints = computed(() => buildTrailPoints().map((p) => `${p.x},${p.y}`).join(' '))

const climbedPoints = computed(() => {
  const fmax = climbFrac.value
  if (fmax <= 0) return ''
  const pts = []
  for (const s of pathSamples) {
    if (s.f <= fmax) pts.push(`${s.x},${s.y}`)
  }
  const end = pointAtF(fmax)
  pts.push(`${end.x},${end.y}`)
  return pts.join(' ')
})

const climber = computed(() => (climbFrac.value > 0 ? pointAtF(climbFrac.value) : null))

const routeSteps = computed(() => {
  const a = selected.value?.code && selected.value.code !== '__frontier__' ? selected.value : null
  if (!a) return []
  const byCode = new Map(areas.value.map((x) => [x.code, x]))
  return (a.prerequisites || []).map((c) => byCode.get(c)?.name ?? c).slice(0, 3)
})

// 当前年级所在的路线位置（默认停靠点）
const currentF = computed(() => {
  const g = currentGrade.value
  if (!g) return 0
  const hit = nodes.value.filter((n) => n.grade === g)
  if (!hit.length) return Math.min(1, g / 12)
  return hit[hit.length - 1].f
})

function fieldName(fieldCode) {
  const f = (knowledgeStore.mapData.fields || []).find((x) => x.code === fieldCode)
  return f ? f.name : '—'
}

function relTime(iso) {
  if (!iso) return ''
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小时前`
  return `${Math.floor(hr / 24)} 天前`
}

// ── 攀爬动画（逐段生长）──
const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now())
const raf = (cb) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(cb) : setTimeout(() => cb(nowMs()), 16))
const caf = (id) => { if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id); else clearTimeout(id) }
let animId = null

function animateClimb(target) {
  caf(animId)
  const start = climbFrac.value
  const t0 = nowMs()
  const dur = Math.max(420, Math.abs(target - start) * 1600)
  const step = () => {
    const p = Math.min(1, (nowMs() - t0) / dur)
    const e = 1 - Math.pow(1 - p, 3) // easeOutCubic
    climbFrac.value = start + (target - start) * e
    if (p < 1) animId = raf(step)
  }
  animId = raf(step)
}

function pick(n) {
  selected.value = areas.value.find((a) => a.code === n.code) || { code: n.code, name: n.name }
  animateClimb(n.f)
  // Update focused node index
  focusedNodeIndex.value = nodes.value.findIndex(node => node.code === n.code)
}

function createRipple(event) {
  const button = event.currentTarget
  const ripple = document.createElement('div')
  ripple.classList.add('ripple')
  const rect = button.getBoundingClientRect()
  const size = Math.max(rect.width, rect.height)
  ripple.style.width = ripple.style.height = `${size}px`
  ripple.style.left = `${event.clientX - rect.left - size / 2}px`
  ripple.style.top = `${event.clientY - rect.top - size / 2}px`
  button.appendChild(ripple)
  ripple.addEventListener('animationend', () => {
    ripple.remove()
  })
}
function selectFrontier() {
  selected.value = { code: '__frontier__' }
  animateClimb(1)
}
function openArea(a) {
  selected.value = a
}

function switchSubject(subj) {
  knowledgeStore.setSubject(subj)
  selected.value = null
  climbFrac.value = 0
  loadMap(subj)
}

function practiceHere(campCode) {
  practiceStore.startSession('topic', { subject: knowledgeStore.currentSubject, topicId: campCode })
  selected.value = null
  uni.switchTab({ url: '/pages/practice/index' })
}
function askTeacher() {
  selected.value = null
  uni.switchTab({ url: '/pages/chat/chat' })
}
function goGraph() {
  selected.value = null
  uni.switchTab({ url: '/pages/knowledge-graph/index' })
}
function goMemory() {
  uni.navigateTo({ url: '/pages/twin/memory' })
}

async function loadMap(subj) {
  await knowledgeStore.loadKnowledgeMap(subj || knowledgeStore.currentSubject)
}

// 掌握度跨越里程碑时给一次正反馈
watch(masteryAvg, (nv, ov) => {
  if (!(nv > ov)) return
  const hit = [25, 50, 75, 90].find((m) => ov < m && nv >= m)
  if (hit) uni.showToast({ title: `掌握度突破 ${hit}%！`, icon: 'none' })
})

watch(selected, (newVal) => {
  if (newVal && newVal.code !== '__frontier__') {
    const idx = nodes.value.findIndex(node => node.code === newVal.code)
    if (idx !== -1) focusedNodeIndex.value = idx
  } else {
    focusedNodeIndex.value = -1
  }
})


watch(nodes, () => {
  focusedNodeIndex.value = -1
})

watch(focusedNodeIndex, (idx) => {
  if (idx >= 0 && idx < hnButtons.value.length) {
    hnButtons.value[idx]?.focus()
  }
})
onMounted(async () => {
  await knowledgeStore.loadCatalog()
  await loadMap()
  if (!twinStore.loaded) twinStore.loadOverview(knowledgeStore.currentSubject || 'math')
  setTimeout(() => animateClimb(currentF.value), 260)
})

onShow(() => {
  if (knowledgeStore.mapData?.stats?.total) loadMap()
  twinStore.loadOverview(knowledgeStore.currentSubject || 'math')
})

onBeforeUnmount(() => caf(animId))

// Determine node distance level for progressive disclosure
function isNear(n) {
  // Simplified Euclidean distance, actual should consider map projection
  const dx = (n.left - 50) / 50
  const dy = (n.top - 50) / 50
  return Math.sqrt(dx * dx + dy * dy) < 0.3
}
function isVeryNear(n) {
  const dx = (n.left - 50) / 50
  const dy = (n.top - 50) / 50
  return Math.sqrt(dx * dx + dy * dy) < 0.1
}
function isMedium(n) {
  const dx = (n.left - 50) / 50
  const dy = (n.top - 50) / 50
  const dist = Math.sqrt(dx * dx + dy * dy)
  return dist >= 0.3 && dist < 0.6
}
</script>

<style scoped>
.twin-page {
  min-height: 100vh;
  background: var(--twin-bg, #f3f5f2);
  color: var(--twin-ink, #203e3a);
  padding: 14px 0 40px;
  box-sizing: border-box;
}

.num { font-variant-numeric: tabular-nums; }

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin: 0 14px 16px;
}
.ph-title { display: block; font-size: 24px; font-weight: 650; letter-spacing: -0.6px; }
.ph-sub { display: block; font-size: 12px; color: var(--twin-sub, #74857f); margin-top: 6px; max-width: 560px; }
.ph-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }

/* 布局：桌面双栏，移动单栏 */
.world-layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; margin: 0 14px; align-items: start; }
@media (min-width: 900px) {
  .world-layout { grid-template-columns: minmax(0, 1fr) 296px; }
}
.col-main { min-width: 0; }
.col-side { display: flex; flex-direction: column; gap: 14px; min-width: 0; }

.side-card {
  background: var(--twin-paper, #fff);
  border: 1px solid var(--twin-line, #e2e9e3);
  border-radius: 14px;
  padding: 16px;
  box-shadow: var(--twin-shadow, 0 6px 24px rgba(41, 73, 59, 0.06));
}
.side-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
.side-title { display: block; font-size: 13px; font-weight: 650; color: var(--twin-ink, #203e3a); }
.side-head .side-title { margin: 0; }
.side-hint { display: block; font-size: 10px; color: #8b9a80; margin-top: 10px; line-height: 1.7; }

.legend-list { display: flex; flex-direction: column; gap: 11px; margin-top: 12px; }
.lg-row { display: flex; align-items: center; gap: 9px; font-size: 11px; color: #66796e; }
.lg-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
.here-dot { background: var(--twin-teal, #247b68); box-shadow: 0 0 0 3px rgba(36, 123, 104, 0.18); }
.won-dot { background: #6f9c5c; }
.ahead-dot { background: #cdddbc; border: 1px solid #b7cba0; }
.lg-route { width: 20px; border-top: 2px dashed var(--twin-teal, #247b68); flex-shrink: 0; }

.tag {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11px; padding: 3px 8px; border-radius: 5px;
  background: #f0f4ef; color: #566f63; white-space: nowrap;
}
.tag.green { background: #dcefe2; color: #1d6a58; }

.tbtn {
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  border: 1px solid var(--twin-line, #e2e9e3); border-radius: 9px;
  padding: 9px 14px; background: var(--twin-paper, #fff);
  color: var(--twin-ink, #203e3a); font-size: 12px; font-weight: 550;
}
.tbtn.primary { background: var(--twin-teal, #247b68); color: #fff; border-color: var(--twin-teal, #247b68); }
.tbtn.soft { background: #dcefe2; border-color: transparent; color: #1d6a58; }
.tbtn.ghost { background: transparent; border-color: transparent; padding: 6px 9px; }
.tbtn.sm { padding: 6px 10px; font-size: 12px; }
.tbtn.block { width: 100%; margin-top: 8px; }

.subject-bar { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 14px 16px; }
.s-tab {
  border: 1px solid #dfe8da; background: #fff; border-radius: 999px;
  padding: 7px 14px; font-size: 12px; color: #5f7a49;
}
.s-tab.active { background: var(--twin-teal, #247b68); color: #fff; border-color: var(--twin-teal, #247b68); }

/* 世界状态 */
.world-status { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }
.ws-cell {
  background: #fff; border: 1px solid var(--twin-line, #e2e9e3); border-radius: 12px; padding: 13px 15px;
  box-shadow: var(--twin-shadow, 0 6px 24px rgba(41, 73, 59, 0.06));
}
.ws-label { display: block; font-size: 10px; color: var(--twin-sub, #74857f); }
.ws-value { display: block; font-size: 18px; font-weight: 650; margin-top: 4px; }
.ws-unit { font-size: 11px; color: #8b9a80; font-weight: 400; }
.ws-bar { height: 4px; margin-top: 8px; border-radius: 4px; background: #e6ede0; overflow: hidden; }
.ws-fill { height: 100%; border-radius: 4px; background: var(--twin-teal, #247b68); transition: width 0.5s ease; }
.ws-fill.amber { background: var(--twin-amber, #b78140); }

/* ── 登峰地图 ── */
.map-panel {
  background: var(--twin-paper, #fff);
  border: 1px solid var(--twin-line, #e2e9e3);
  border-radius: 16px;
  box-shadow: var(--twin-shadow, 0 6px 24px rgba(41, 73, 59, 0.06));
  overflow: hidden;
}
.map-scene {
  position: relative;
  width: 100%;
  max-width: none;
  min-width: 280px;
  margin: 0 auto;
  aspect-ratio: 700 / 1000;
  overflow: hidden;
}
.map-svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }

.terrace { stroke: #cfdcbf; stroke-width: 0.8; transition: fill 0.35s ease; }
.terrace-passed { fill: #c6dbb1; }
.terrace-current { fill: #a6cda8; }
.terrace-ahead { fill: #e9efdd; }

/* 风景动效 */
.cloud { will-change: transform; }
.cloud-a { animation: cloud-drift 15s ease-in-out infinite; }
.cloud-b { animation: cloud-drift 19s ease-in-out infinite reverse; }
.cloud-c { animation: cloud-drift 24s ease-in-out infinite; }
.birds { will-change: transform; animation: bird-glide 22s ease-in-out infinite; }
.flora { will-change: transform; }
.flora .sway { transform-box: fill-box; transform-origin: 50% 100%; animation: sway 5.5s ease-in-out infinite; animation-delay: var(--td, 0s); }
.flag-cloth { transform-box: fill-box; transform-origin: 0% 50%; animation: flag-wave 2.6s ease-in-out infinite; }
.climber-fig { will-change: transform; animation: climber-bob 3.2s ease-in-out infinite; }
.trail-dash { animation: dash-flow 1.4s linear infinite; }

/* 热点节点 */
.hn {
  position: absolute;
  transform: translate(-50%, -50%);
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0;
  margin: 0;
  background: transparent;
  border: none;
  overflow: visible;
  line-height: 1;
}
.hn::after { border: none; }
.hn-badge {
  position: relative;
  display: flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border-radius: 50%;
  background: rgba(252, 255, 249, 0.96);
  border: 1.5px solid #cdddbc;
  box-shadow: 0 3px 10px rgba(71, 103, 48, 0.14);
  will-change: transform;
  animation: hn-bob 5s ease-in-out infinite;
  animation-delay: var(--d, 0s);
  transition: transform 0.18s ease, background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}
.hn-glyph { width: 13px; height: 13px; color: #5f8a53; }

.hn-passed .hn-badge { background: #e6f2d9; border-color: #b6d4aa; }
.hn-passed .hn-glyph { color: #5f8a53; }
.hn-current .hn-badge { background: #d3eadf; border-color: var(--twin-teal, #247b68); }
.hn-current .hn-glyph { color: var(--twin-teal, #247b68); }
.hn-ahead .hn-badge { background: rgba(250, 252, 247, 0.9); border-color: #d6e2ca; }
.hn-ahead .hn-glyph { color: #9db08c; }
.hn.mastered .hn-badge { box-shadow: 0 0 0 3px rgba(111, 156, 92, 0.2), 0 3px 10px rgba(71, 103, 48, 0.14); }

.hn:hover .hn-badge { transform: translateY(-3px) scale(1.06); border-color: #6f9c5c; }
.hn:active .hn-badge { transform: scale(0.9); }
.hn:focus-visible {
  outline: 2px solid var(--twin-teal, #247b68);
  outline-offset: 2px;
}

.hn.selected { z-index: 6; }
.hn.selected .hn-badge {
  background: var(--twin-teal, #247b68);
  border-color: var(--twin-teal, #247b68);
  box-shadow: 0 0 0 4px rgba(36, 123, 104, 0.22), 0 6px 16px rgba(36, 123, 104, 0.32);
  animation: hn-bob 5s ease-in-out infinite, sel-pulse 1.6s ease-in-out infinite;
}
.hn.selected .hn-glyph { color: #fff; }

.hn-ring {
  position: absolute; inset: -5px; border-radius: 50%;
  border: 1.5px solid var(--twin-teal, #247b68);
  animation: hn-pulse 2.4s ease-out infinite;
}

.hn-label {
  margin-top: 3px; max-width: 96px; padding: 2px 6px;
  font-size: 9px; color: #33513f;
  background: rgba(252, 255, 249, 0.96);
  border: 1px solid #dbe6d0; border-radius: 5px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  box-shadow: 0 2px 6px rgba(71, 103, 48, 0.1);
}
.hn-label-short { font-size: 8px; opacity: 0.82; padding: 1px 5px; }

.hn-frontier .hn-badge { border-style: dashed; border-color: #8fb8cf; background: rgba(238, 247, 252, 0.96); }
.hn-frontier .hn-glyph { color: #3f7796; }
.hn-frontier .hn-label { color: #3f7796; }

@keyframes hn-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2.5px); } }
@keyframes hn-pulse { 0% { transform: scale(0.85); opacity: 0.7; } 100% { transform: scale(1.7); opacity: 0; } }
@keyframes sel-pulse { 0%, 100% { box-shadow: 0 0 0 4px rgba(36, 123, 104, 0.22), 0 6px 16px rgba(36, 123, 104, 0.32); } 50% { box-shadow: 0 0 0 7px rgba(36, 123, 104, 0.1), 0 6px 16px rgba(36, 123, 104, 0.32); } }
@keyframes cloud-drift { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(22px); } }
@keyframes bird-glide { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(26px, -14px); } }
@keyframes sway { 0%, 100% { transform: rotate(-2.2deg); } 50% { transform: rotate(2.2deg); } }
@keyframes flag-wave { 0%, 100% { transform: skewY(0deg) scaleX(1); } 50% { transform: skewY(-4deg) scaleX(0.93); } }
@keyframes climber-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
@keyframes dash-flow { to { stroke-dashoffset: -20; } }

/* 最近经历 */
.mini-events { display: flex; flex-direction: column; gap: 12px; }
.mini-event { display: flex; gap: 11px; align-items: center; }
.me-icon {
  display: flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; background: #eef4e9; border-radius: 9px; color: #748f62; flex-shrink: 0;
}
.me-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.me-title { font-size: 12px; font-weight: 550; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.me-sub { font-size: 10px; color: #93a086; }
.me-time { font-size: 10px; color: #a0aa97; white-space: nowrap; }

.world-notice { font-size: 10px; color: #93a086; line-height: 1.9; padding: 0 4px; }

/* 详情 */
.detail-mask {
  position: fixed; inset: 0; background: rgba(35, 60, 54, 0.42);
  display: flex; align-items: flex-end; justify-content: center; z-index: 100;
}
.detail-card {
  width: 100%; max-width: 560px; max-height: 82vh; overflow-y: auto;
  padding: 20px 20px 28px; background: #fff;
  border-radius: 22px 22px 0 0; box-sizing: border-box;
}
.detail-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.detail-title { font-size: 19px; font-weight: 650; flex: 1; }
.detail-close { font-size: 18px; color: #9caa93; padding: 4px 8px; }
.detail-desc { display: block; font-size: 12px; color: var(--twin-sub, #74857f); line-height: 1.9; margin-bottom: 16px; }

/* 主信息：掌握度 */
.hero-metric { padding: 14px 16px; background: #f2f8ee; border: 1px solid #dfead4; border-radius: 13px; margin-bottom: 14px; }
.hm-head { display: flex; align-items: baseline; justify-content: space-between; }
.hm-label { font-size: 12px; color: #5b7669; }
.hm-val { font-size: 26px; font-weight: 700; color: var(--twin-teal, #247b68); }
.hm-pct { font-size: 13px; font-weight: 500; margin-left: 1px; }
.hm-bar { height: 8px; margin-top: 8px; border-radius: 8px; background: #e0ebd7; overflow: hidden; }
.hm-fill { height: 100%; border-radius: 8px; background: linear-gradient(90deg, #3d9a7f, #6f9c5c); transition: width 0.5s ease; }
.hm-note { display: block; font-size: 10px; color: #809071; margin-top: 7px; }

.camp-list { display: flex; flex-direction: column; gap: 8px; }
.camp-chip {
  display: flex; align-items: center; gap: 10px;
  padding: 11px 14px; border-radius: 11px;
  background: #f6f9f3; border: 1px solid #e5edde;
}
.camp-main { flex: 1; min-width: 0; }
.camp-name { display: block; font-size: 13px; font-weight: 550; color: #33513f; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.camp-bar { height: 4px; margin-top: 6px; border-radius: 4px; background: #e2ebd9; overflow: hidden; }
.camp-fill { height: 100%; border-radius: 4px; background: #6f9c5c; }
.camp-val { font-size: 11px; color: #6f9c5c; font-weight: 600; }
.camp-chip .twin-ico { color: #9bb182; }

.route { margin-bottom: 16px; }
.route-label { display: block; font-size: 10px; color: #9caa93; margin-bottom: 7px; }
.route-chain { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.route-node { font-size: 12px; color: #5b7669; }
.route-node.current { color: var(--twin-teal, #247b68); font-weight: 700; }
.route-arrow { color: #b3c2a8; }
.route-none { font-size: 12px; color: #9caa93; }

.detail-rows { display: flex; flex-direction: column; gap: 10px; margin-bottom: 18px; }
.detail-row { display: flex; gap: 12px; font-size: 12px; }
.row-key { flex-shrink: 0; width: 90px; color: #93a086; }
.row-val { color: var(--twin-ink, #203e3a); }

.action-list { display: flex; flex-direction: column; gap: 12px; }
.action-item { background: #f6f9f3; border: 1px solid #e5edde; border-radius: 11px; padding: 14px; }
.ai-title { display: block; font-size: 13px; font-weight: 600; }
.ai-desc { display: block; font-size: 11px; color: #849477; margin: 6px 0 0; line-height: 1.7; }

.safe-area { height: 30px; }

@media (max-width: 420px) {
  .ws-cell { padding: 11px 12px; }
  .ws-value { font-size: 16px; }
  .hn-badge { width: 19px; height: 19px; }
  .hn-glyph { width: 11px; height: 11px; }
  .hn-label { font-size: 8px; max-width: 78px; }
}

@media (prefers-reduced-motion: reduce) {
  .hn-badge, .hn-ring, .cloud, .birds, .flora .sway, .flag-cloth, .climber-fig, .trail-dash { animation: none !important; }
}

.ripple {
  position: absolute;
  background: rgba(36, 123, 104, 0.4);
  border-radius: 50%;
  transform: scale(0);
  animation: ripple-effect 0.6s ease-out;
  pointer-events: none;
}
@keyframes ripple-effect {
  to {
    transform: scale(2);
    opacity: 0;
  }
}

.hn-label-full { font-size: 8px; }.hn-label-one { font-size: 8px; }.hn-label-dot { font-size: 8px; }
</style>
