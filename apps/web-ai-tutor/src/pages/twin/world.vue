<template>
  <!--
    学习世界（W3 · N4）：把「虚拟世界 · 登峰」套入统一世界外壳 + 统一世界令牌。
    学科登顶的功能与交互一律保留（登峰地图渲染 / 营地选中 / 进度与登顶态 / 学科切换），
    本卡不重做登顶 UX（那是 W4）——只换世界语言：同 --world-* 令牌、同几何类、同一道过关之门。
  -->
  <WorldShell
    module-code="tutor"
    kicker="学习世界"
    title="学习世界 · 登峰"
    subtitle="每门学科都是一座山——每个知识域是一个营地；点一个营地，看你从山脚一路攀到它。"
    app-home-url="/pages/index/index"
    app-home-label="回智学慧眼"
    :entering="entering"
    entry-from="人本世界"
    @entered="entering = false"
  >
    <!-- 世界顶栏右侧：当前所在 + 学科切换（模块自己的动作，留在世界顶栏里） -->
    <template #actions>
      <text class="tag green" data-here>
        <svg class="twin-ico sm"><use href="#i-pin" /></svg>当前：{{ scene ? scene.name : '未踏入' }}
      </text>
      <button class="tbtn" data-subject-toggle @click="showSubjectBar = !showSubjectBar">
        <svg class="twin-ico sm"><use href="#i-world" /></svg>切换学科
      </button>
    </template>

    <view class="twin-page">
      <!-- 学科切换条 -->
      <view class="subject-bar" v-if="showSubjectBar" data-subject-bar>
        <button
          v-for="s in knowledgeStore.subjectList"
          :key="s.id"
          class="s-tab"
          :class="{ active: isCurrentSubject(s) }"
          :data-subject="s.id"
          :data-subject-active="isCurrentSubject(s) ? 'yes' : undefined"
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
            <view class="ws-cell" data-status="mastery">
              <text class="ws-label">掌握度</text>
              <text class="ws-value num" data-mastery>{{ masteryAvg }}<text class="ws-unit"> /100</text></text>
              <view class="ws-bar"><view class="ws-fill" :style="{ width: Math.min(100, masteryAvg) + '%' }" /></view>
            </view>
            <view class="ws-cell" data-status="level">
              <text class="ws-label">经历等级</text>
              <text class="ws-value num" data-level>LV.{{ level }}<text class="ws-unit"> · {{ xp }} XP</text></text>
              <view class="ws-bar"><view class="ws-fill amber" :style="{ width: (xp % 1000) / 10 + '%' }" /></view>
            </view>
            <view class="ws-cell" data-status="ascent">
              <text class="ws-label">已登顶营地</text>
              <text class="ws-value num" data-ascent>{{ masteredCount }}<text class="ws-unit"> / {{ k12Count }}</text></text>
              <view class="ws-bar"><view class="ws-fill" :style="{ width: (k12Count ? (masteredCount / k12Count) * 100 : 0) + '%' }" /></view>
            </view>
          </view>

          <!-- 登峰地图（世界画法：几何类 w-* → --world-* 令牌，与门户人本世界同一套色） -->
          <view class="map-panel">
            <view class="map-scene">
              <svg
                class="map-svg"
                data-map
                viewBox="0 0 700 1000"
                preserveAspectRatio="xMidYMid meet"
                role="img"
                aria-label="学科登峰地图：展示各知识域营地的学习进度与登峰路线"
              >
                <defs>
                  <pattern id="grid" width="26" height="26" patternUnits="userSpaceOnUse">
                    <circle cx="2" cy="2" r="0.8" class="w-grid-dot" />
                  </pattern>
                  <!-- 天光四阶：与人本世界的天光同一组令牌（同一天空） -->
                  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" class="w-gg-sky-top" />
                    <stop offset="0.3" class="w-gg-sky-mid" />
                    <stop offset="0.7" class="w-gg-sky-low" />
                    <stop offset="1" class="w-gg-sky-haze" />
                  </linearGradient>
                  <radialGradient id="sunG" cx="0.5" cy="0.5">
                    <stop offset="0" class="w-gg-sun" stop-opacity="0.95" />
                    <stop offset="1" class="w-gg-sun" stop-opacity="0" />
                  </radialGradient>
                  <radialGradient id="peakG" cx="0.5" cy="0.5">
                    <stop offset="0" class="w-gg-peak" stop-opacity="0.75" />
                    <stop offset="1" class="w-gg-peak" stop-opacity="0" />
                  </radialGradient>
                  <linearGradient id="climbBeam" x1="0" y1="0" x2="0" y2="1">
                    <stop class="w-gg-climb" stop-opacity="0" />
                    <stop offset="1" class="w-gg-climb" stop-opacity="0.14" />
                  </linearGradient>
                  <linearGradient id="ridgeG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" class="w-gg-hill" />
                    <stop offset="1" class="w-gg-hill-deep" />
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
                <circle cx="596" cy="112" r="19" class="w-sun-glow" />

                <!-- 远峰群（大气透视：越远越冷越淡，与人本世界的远山同色） -->
                <path :d="leftPeakPath" class="w-ridge-far" opacity="0.7" />
                <path :d="rightPeakPath" class="w-ridge-near" opacity="0.62" />
                <path d="M505 196 549 274 532 269 515 285 499 265 470 274Z" class="w-snow" opacity="0.9" />

                <!-- 飞鸟 -->
                <g class="birds" opacity="0.5">
                  <path d="M262 208q7-7 14 0M280 200q6-6 12 0" class="w-bird" stroke-width="1.6" />
                </g>

                <!-- 云带 -->
                <g class="cloud cloud-a">
                  <path d="M170 154q14-26 44-18 16-24 46-10 26-6 30 20 22 4 16 24H176q-24 0-6-16Z" class="w-cloud" opacity="0.92" />
                </g>
                <g class="cloud cloud-b">
                  <path d="M414 190q12-22 38-15 14-20 40-8 22-5 26 17 18 4 13 20H418q-20 0-4-14Z" class="w-cloud" opacity="0.82" />
                </g>
                <g class="cloud cloud-c">
                  <path d="M300 118q10-18 32-12 12-16 33-6 18-4 21 14 15 3 11 16H303q-17 0-3-12Z" class="w-cloud" opacity="0.7" />
                </g>

                <!-- 主峰（多段山脊 + 雪顶 + 等高线） -->
                <path :d="ridgePath" fill="url(#ridgeG)" />
                <path v-for="(c, i) in contours" :key="'c' + i" :d="c" class="w-hill-line" stroke-width="1" opacity="0.65" />
                <path :d="snowCap" class="w-snow" opacity="0.92" />
                <circle cx="350" cy="150" r="60" fill="url(#peakG)" />

                <!-- 分层台地 -->
                <polygon
                  v-for="t in terraces"
                  :key="t.g"
                  :points="t.points"
                  :class="['w-terrace', 'w-terrace-' + t.state]"
                />

                <!-- 植被与岩石（与人本世界同一套植被四阶 / 落影 / 木色） -->
                <g
                  v-for="(f, i) in flora"
                  :key="'f' + i"
                  :class="{ flora: f.sway }"
                  :style="f.sway ? { '--td': (i * 0.37) + 's' } : {}"
                  :transform="`translate(${f.x} ${f.y}) scale(${f.s})`"
                >
                  <!-- 针叶 -->
                  <template v-if="f.type === 'pine'">
                    <ellipse cx="0" cy="6" rx="15" ry="6" class="w-shadow-soft" />
                    <g :class="{ sway: f.sway }"><path d="M0-17v23" class="w-trunk" stroke-width="4" /><path d="M0-52 14-14H-14Z" class="w-leaf-3" /><path d="M0-64 11-30H-11Z" class="w-leaf-2" /><path d="M0-74 8-46H-8Z" class="w-leaf-4" /></g>
                  </template>
                  <!-- 阔叶 -->
                  <template v-else-if="f.type === 'oak'">
                    <ellipse cx="0" cy="6" rx="17" ry="7" class="w-shadow-soft" />
                    <g :class="{ sway: f.sway }"><path d="M0-8v-18" class="w-trunk" stroke-width="4" /><ellipse cx="-8" cy="-34" rx="15" ry="13" class="w-leaf-3" /><ellipse cx="9" cy="-33" rx="14" ry="12" class="w-leaf-2" /><ellipse cx="0" cy="-44" rx="14" ry="12" class="w-leaf-1" /></g>
                  </template>
                  <!-- 灌木 -->
                  <template v-else-if="f.type === 'shrub'">
                    <ellipse cx="0" cy="4" rx="14" ry="5" class="w-shadow-soft" />
                    <g :class="{ sway: f.sway }"><ellipse cx="-7" cy="-6" rx="11" ry="8" class="w-leaf-2" /><ellipse cx="7" cy="-5" rx="10" ry="7" class="w-leaf-1" /></g>
                  </template>
                  <!-- 岩石 -->
                  <template v-else>
                    <polygon points="-12,4 -7,-9 4,-12 12,-3 8,5" class="w-rock" />
                    <polygon points="-7,-9 4,-12 2,-4 -5,-3" class="w-rock-light" />
                  </template>
                </g>

                <!-- 登山路：路基 + 流动导向虚线 -->
                <polyline :points="trailPoints" class="w-trail" stroke-width="9" opacity="0.55" />
                <polyline class="w-trail-dash trail-dash" :points="trailPoints" stroke-width="1.7" stroke-dasharray="3 7" opacity="0.85" />

                <!-- 攀爬轨迹（点击营地后逐段生长） -->
                <polyline :points="climbedPoints" class="w-climb" stroke-width="3.4" filter="url(#glow)" opacity="0.9" />

                <!-- 孪生人物（外层定位，内层浮动）：画法取共享原语 personMarker，
                     与人本世界里的「我」是同一套画法与同一个人的外观 -->
                <g v-if="climber" :transform="`translate(${climber.x} ${climber.y}) scale(1.15)`" data-climber>
                  <path d="M0 4 V-100" stroke="url(#climbBeam)" stroke-width="22" />
                  <g class="climber-fig">
                    <template v-for="(p, i) in climberPrims" :key="'cp' + i">
                      <polygon v-if="p.k === 'poly'" :class="p.c" :points="p.points" :opacity="p.o" />
                      <path
                        v-else-if="p.k === 'path'"
                        :class="p.c"
                        :d="p.d"
                        :opacity="p.o"
                        :stroke-width="p.w"
                        :stroke-dasharray="p.dash"
                      />
                      <circle v-else-if="p.k === 'circle'" :class="p.c" :cx="p.cx" :cy="p.cy" :r="p.r" :opacity="p.o" />
                      <ellipse v-else :class="p.c" :cx="p.cx" :cy="p.cy" :rx="p.rx" :ry="p.ry" :opacity="p.o" />
                    </template>
                  </g>
                </g>

                <!-- 峰顶旗帜 -->
                <g transform="translate(350 118)">
                  <path d="M0 0 V-40" class="w-lamp-pole" stroke-width="2" />
                  <path class="flag-cloth w-flag" d="M0-40h22l-6 7 6 7H0Z" />
                </g>

                <text x="350" y="978" text-anchor="middle" font-size="11" class="w-map-note">
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
                :data-camp="n.code"
                :data-camp-state="n.state"
                :data-camp-mastered="n.mastered ? 'yes' : 'no'"
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
                    <path d="M12 9 8 20h8Z" class="w-glyph-cut" opacity="0.7" />
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
          <view class="side-card" data-legend>
            <text class="side-title">图例</text>
            <view class="legend-list">
              <view class="lg-row"><view class="lg-dot here-dot" /><text>当前位置（脉冲环）</text></view>
              <view class="lg-row"><view class="lg-dot won-dot" /><text>已登顶营地</text></view>
              <view class="lg-row"><view class="lg-dot ahead-dot" /><text>未至营地</text></view>
              <view class="lg-row"><view class="lg-route" /><text>攀爬轨迹（会生长）</text></view>
            </view>
            <text class="side-hint">点任意营地 → 看从山脚攀到它的路径</text>
          </view>

          <view class="side-card" v-if="twinStore.recentEvents.length" data-events>
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
        <view class="detail-card" data-camp-detail @click.stop>
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
                <button class="tbtn primary block" data-practice @click="practiceHere(selected.code)">开始练习 <svg class="twin-ico sm"><use href="#i-arrow" /></svg></button>
              </view>
              <view class="action-item">
                <text class="ai-title">💬 请教 AI 教师</text>
                <text class="ai-desc">就这个知识域向你的 AI 教师提问。</text>
                <button class="tbtn soft block" data-ask-teacher @click="askTeacher()">去求教 <svg class="twin-ico sm"><use href="#i-arrow" /></svg></button>
              </view>
              <view class="action-item">
                <text class="ai-title">🧠 知识图谱</text>
                <text class="ai-desc">展开该领域的知识点与前置关系。</text>
                <button class="tbtn block" data-graph @click="goGraph">展开图谱 <svg class="twin-ico sm"><use href="#i-arrow" /></svg></button>
              </view>
            </view>
          </template>
        </view>
      </view>
    </view>
  </WorldShell>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { useKnowledgeStore } from '@/store/knowledge'
import { usePracticeStore } from '@/store/practice'
import { useTwinStore } from '@/store/twin'
import { useUserStore } from '@/store/user'
import { useAuthStore } from '@gri/auth-client'
import EmptyState from '@/components/ui/EmptyState.vue'
import LoadingSkeleton from '@/components/ui/LoadingSkeleton.vue'
import { getActivationContext } from '@/api/index.js'
// 世界语言共享件（W3 · N1/N2）：外壳（世界顶栏 + 过关式过场）与人物画法都从同一份取，
// 与门户人本世界不是「两套像的皮肤」，而是同一套世界语言。
import WorldShell from '@world-art/WorldShell.vue'
import { personMarker } from '@world-art'

const knowledgeStore = useKnowledgeStore()
const practiceStore = usePracticeStore()
const twinStore = useTwinStore()
const userStore = useUserStore()
const auth = useAuthStore()
auth.restore()

const showSubjectBar = ref(true)
const selected = ref(null)
const climbFrac = ref(0)
const focusedNodeIndex = ref(-1)
const hnButtons = ref([])

/** 从人本世界走来（门户「学习」意向带 `?from=world`）→ 承接开场过场，过关式不中断（N5）。 */
const entering = ref(false)
onLoad((options) => {
  entering.value = options && options.from === 'world'
})

/** 世界里的「我」：取人本世界同一身份真源（W1 `GET /api/context/me`），失败退化为登录态本身。 */
const activation = ref(null)
const selfProfile = computed(() => {
  const p = activation.value && activation.value.profile
  if (p) return p
  const u = auth.user || {}
  return { id: u.externalId || u.id || '', name: u.name || u.username || userStore.name, role: u.role || 'student' }
})
/** 孪生人物的几何：共享原语 personMarker（与人本世界地图上的人物标记同一份画法）。 */
const climberPrims = computed(() => personMarker(selfProfile.value))
async function loadSelf() {
  activation.value = await getActivationContext()
}

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

/**
 * 学科条的当前项：学科码有两制——课程注册表给的是 `MATH`，页面默认态是 `math`，
 * 后端两者都收（实测知识版图接口两制同源）。故按码归一比较：
 * 原严格全等（`currentSubject === s.id`）在两制并存下永远不亮，学科条看不出「现在在哪一门」。
 */
function isCurrentSubject(s) {
  return String(s?.id || '').toLowerCase() === String(knowledgeStore.currentSubject || '').toLowerCase()
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
  await loadSelf()
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
/* 世界面（页面内层）：颜色一律取世界令牌 —— 与人本世界同一套色（N1） */
.twin-page {
  color: var(--color-text-primary);
  padding-bottom: 40px;
  box-sizing: border-box;
}

.num { font-variant-numeric: tabular-nums; }

/* 布局：桌面双栏，移动单栏 */
.world-layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; }
@media (min-width: 900px) {
  .world-layout { grid-template-columns: minmax(0, 1fr) 296px; }
}
.col-main { min-width: 0; }
.col-side { display: flex; flex-direction: column; gap: 14px; min-width: 0; }

.side-card {
  background: var(--world-panel);
  border: 1px solid var(--world-node-border);
  border-radius: 14px;
  padding: 16px;
  box-shadow: var(--shadow-card);
}
.side-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
.side-title { display: block; font-size: 13px; font-weight: 650; color: var(--world-node-text); }
.side-head .side-title { margin: 0; }
.side-hint { display: block; font-size: 10px; color: var(--world-node-sub); margin-top: 10px; line-height: 1.7; }

.legend-list { display: flex; flex-direction: column; gap: 11px; margin-top: 12px; }
.lg-row { display: flex; align-items: center; gap: 9px; font-size: 11px; color: var(--world-node-sub); }
.lg-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
.here-dot { background: var(--world-node-on-bg); box-shadow: 0 0 0 3px var(--world-portrait-ring); }
.won-dot { background: var(--world-ring-mastered); }
.ahead-dot { background: var(--world-terrace-ahead); border: 1px solid var(--world-terrace-line); }
.lg-route { width: 20px; border-top: 2px dashed var(--world-node-on-bg); flex-shrink: 0; }

.tag {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11px; padding: 3px 8px; border-radius: 5px;
  background: var(--world-node-bg); color: var(--world-node-sub); white-space: nowrap;
}
.tag.green { background: var(--color-primary-light); color: var(--color-primary); }

.tbtn {
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  border: 1px solid var(--world-node-border); border-radius: 9px;
  padding: 9px 14px; background: var(--world-node-bg);
  color: var(--world-node-text); font-size: 12px; font-weight: 550;
}
.tbtn.primary { background: var(--world-node-on-bg); color: var(--world-node-on-text); border-color: var(--world-node-on-bg); }
.tbtn.soft { background: var(--color-primary-light); border-color: transparent; color: var(--color-primary); }
.tbtn.ghost { background: transparent; border-color: transparent; padding: 6px 9px; }
.tbtn.sm { padding: 6px 10px; font-size: 12px; }
.tbtn.block { width: 100%; margin-top: 8px; }

.subject-bar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.s-tab {
  border: 1px solid var(--world-node-border); background: var(--world-node-bg); border-radius: 999px;
  padding: 7px 14px; font-size: 12px; color: var(--world-node-text);
}
.s-tab.active { background: var(--world-node-on-bg); color: var(--world-node-on-text); border-color: var(--world-node-on-bg); }

/* 世界状态 */
.world-status { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }
.ws-cell {
  background: var(--world-panel); border: 1px solid var(--world-node-border); border-radius: 12px; padding: 13px 15px;
  box-shadow: var(--shadow-card);
}
.ws-label { display: block; font-size: 10px; color: var(--world-node-sub); }
.ws-value { display: block; font-size: 18px; font-weight: 650; margin-top: 4px; color: var(--world-node-text); }
.ws-unit { font-size: 11px; color: var(--world-node-sub); font-weight: 400; }
.ws-bar { height: 4px; margin-top: 8px; border-radius: 4px; background: var(--world-ring-track); overflow: hidden; }
.ws-fill { height: 100%; border-radius: 4px; background: var(--world-node-on-bg); transition: width 0.5s ease; }
.ws-fill.amber { background: var(--world-ring-learning); }

/* ── 登峰地图（面板沿用世界纸面/边线）── */
.map-panel {
  background: var(--world-panel);
  border: 1px solid var(--world-node-border);
  border-radius: 16px;
  box-shadow: var(--shadow-card);
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

/* 台地：三态色取自世界令牌（已翻越 / 当前 / 未至） */
.w-terrace { stroke-width: 0.8; transition: fill 0.35s ease; }

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
  background: var(--world-node-bg);
  border: 1.5px solid var(--world-node-border);
  box-shadow: var(--world-node-shadow);
  will-change: transform;
  animation: hn-bob 5s ease-in-out infinite;
  animation-delay: var(--d, 0s);
  transition: transform 0.18s ease, background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}
.hn-glyph { width: 13px; height: 13px; color: var(--world-leaf-4); }

.hn-passed .hn-badge { background: var(--world-node-bg); border-color: var(--world-leaf-1); }
.hn-passed .hn-glyph { color: var(--world-leaf-3); }
.hn-current .hn-badge { background: var(--world-terrace-current); border-color: var(--world-node-on-bg); }
.hn-current .hn-glyph { color: var(--world-node-on-bg); }
.hn-ahead .hn-badge { background: var(--world-node-bg); border-color: var(--world-terrace-line); }
.hn-ahead .hn-glyph { color: var(--world-node-sub); }
.hn.mastered .hn-badge { box-shadow: 0 0 0 3px var(--world-portrait-ring), var(--world-node-shadow); }

.hn:hover .hn-badge { transform: translateY(-3px) scale(1.06); border-color: var(--world-ring-mastered); }
.hn:active .hn-badge { transform: scale(0.9); }
.hn:focus-visible {
  outline: 2px solid var(--world-node-on-bg);
  outline-offset: 2px;
}

.hn.selected { z-index: 6; }
.hn.selected .hn-badge {
  background: var(--world-node-on-bg);
  border-color: var(--world-node-on-bg);
  box-shadow: 0 0 0 4px var(--world-node-border), var(--world-node-shadow);
  animation: hn-bob 5s ease-in-out infinite, sel-pulse 1.6s ease-in-out infinite;
}
.hn.selected .hn-glyph { color: var(--world-node-on-text); }

.hn-ring {
  position: absolute; inset: -5px; border-radius: 50%;
  border: 1.5px solid var(--world-node-on-bg);
  animation: hn-pulse 2.4s ease-out infinite;
}

.hn-label {
  margin-top: 3px; max-width: 96px; padding: 2px 6px;
  font-size: 9px; color: var(--world-node-text);
  background: var(--world-node-bg);
  border: 1px solid var(--world-node-border); border-radius: 5px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  box-shadow: var(--world-node-shadow);
}
.hn-label-short { font-size: 8px; opacity: 0.82; padding: 1px 5px; }

.hn-frontier .hn-badge { border-style: dashed; border-color: var(--world-accent-cool); background: var(--world-node-bg); }
.hn-frontier .hn-glyph { color: var(--world-accent-cool); }
.hn-frontier .hn-label { color: var(--world-accent-cool); }

@keyframes hn-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2.5px); } }
@keyframes hn-pulse { 0% { transform: scale(0.85); opacity: 0.7; } 100% { transform: scale(1.7); opacity: 0; } }
@keyframes sel-pulse { 0%, 100% { box-shadow: 0 0 0 4px var(--world-node-border), var(--world-node-shadow); } 50% { box-shadow: 0 0 0 7px var(--world-portrait-ring-2), var(--world-node-shadow); } }
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
  width: 30px; height: 30px; background: var(--color-primary-light); border-radius: 9px; color: var(--color-primary); flex-shrink: 0;
}
.me-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.me-title { font-size: 12px; font-weight: 550; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--world-node-text); }
.me-sub { font-size: 10px; color: var(--world-node-sub); }
.me-time { font-size: 10px; color: var(--world-node-sub); white-space: nowrap; }

.world-notice { font-size: 10px; color: var(--world-node-sub); line-height: 1.9; padding: 0 4px; }

/* 详情 */
.detail-mask {
  position: fixed; inset: 0; background: var(--world-scrim);
  display: flex; align-items: flex-end; justify-content: center; z-index: var(--z-modal);
}
.detail-card {
  width: 100%; max-width: 560px; max-height: 82vh; overflow-y: auto;
  padding: 20px 20px 28px; background: var(--world-panel);
  border-radius: 22px 22px 0 0; box-sizing: border-box;
}
.detail-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.detail-title { font-size: 19px; font-weight: 650; flex: 1; color: var(--world-node-text); }
.detail-close { font-size: 18px; color: var(--world-node-sub); padding: 4px 8px; }
.detail-desc { display: block; font-size: 12px; color: var(--world-node-sub); line-height: 1.9; margin-bottom: 16px; }

/* 主信息：掌握度 */
.hero-metric { padding: 14px 16px; background: var(--world-node-bg); border: 1px solid var(--world-node-border); border-radius: 13px; margin-bottom: 14px; }
.hm-head { display: flex; align-items: baseline; justify-content: space-between; }
.hm-label { font-size: 12px; color: var(--world-node-sub); }
.hm-val { font-size: 26px; font-weight: 700; color: var(--world-node-on-bg); }
.hm-pct { font-size: 13px; font-weight: 500; margin-left: 1px; }
.hm-bar { height: 8px; margin-top: 8px; border-radius: 8px; background: var(--world-ring-track); overflow: hidden; }
.hm-fill { height: 100%; border-radius: 8px; background: linear-gradient(90deg, var(--world-ring-mastered), var(--world-leaf-3)); transition: width 0.5s ease; }
.hm-note { display: block; font-size: 10px; color: var(--world-node-sub); margin-top: 7px; }

.camp-list { display: flex; flex-direction: column; gap: 8px; }
.camp-chip {
  display: flex; align-items: center; gap: 10px;
  padding: 11px 14px; border-radius: 11px;
  background: var(--world-node-bg); border: 1px solid var(--world-node-border);
}
.camp-main { flex: 1; min-width: 0; }
.camp-name { display: block; font-size: 13px; font-weight: 550; color: var(--world-node-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.camp-bar { height: 4px; margin-top: 6px; border-radius: 4px; background: var(--world-ring-track); overflow: hidden; }
.camp-fill { height: 100%; border-radius: 4px; background: var(--world-ring-mastered); }
.camp-val { font-size: 11px; color: var(--world-ring-mastered); font-weight: 600; }
.camp-chip .twin-ico { color: var(--world-node-sub); }

.route { margin-bottom: 16px; }
.route-label { display: block; font-size: 10px; color: var(--world-node-sub); margin-bottom: 7px; }
.route-chain { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.route-node { font-size: 12px; color: var(--world-node-sub); }
.route-node.current { color: var(--world-node-on-bg); font-weight: 700; }
.route-arrow { color: var(--world-node-border); }
.route-none { font-size: 12px; color: var(--world-node-sub); }

.detail-rows { display: flex; flex-direction: column; gap: 10px; margin-bottom: 18px; }
.detail-row { display: flex; gap: 12px; font-size: 12px; }
.row-key { flex-shrink: 0; width: 90px; color: var(--world-node-sub); }
.row-val { color: var(--world-node-text); }

.action-list { display: flex; flex-direction: column; gap: 12px; }
.action-item { background: var(--world-node-bg); border: 1px solid var(--world-node-border); border-radius: 11px; padding: 14px; }
.ai-title { display: block; font-size: 13px; font-weight: 600; color: var(--world-node-text); }
.ai-desc { display: block; font-size: 11px; color: var(--world-node-sub); margin: 6px 0 0; line-height: 1.7; }

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
  background: var(--world-marker-ring);
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
