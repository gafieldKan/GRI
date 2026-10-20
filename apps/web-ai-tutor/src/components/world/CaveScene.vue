<template>
  <!--
    M3 洞窟即闭环（W5-b）：探入一座洞（= 一节），洞内是**平铺 SVG 生活场景**
    （承接 LifeWorld 语言：同一份 @gri/world-art 画法、同一批 --world-* 令牌），
    洞内主线**全部复用智学慧眼现成能力**（不重造）：
      讲解 lesson.current(stage=teach) → 出题 课程题库(knowledge-points/:id/questions)
      → 作答&判 练习页同一条判定（normalizeQuestion/checkAnswer）+ practice.answer 落库
      → 掌握 诊断刷新掌握度快照（mastery_snapshots 唯一真源）→ 错题/复习（kp-cave 的 due 聚合，
        接入既有两个闭环）→ 掌握 ≥ 80 → 出洞亮灯 + 奖励（成就数据缺失时降级为视觉 + 文案，不伪造计数）。
    操作 ≤2 步：① 点洞口进洞（页面侧）② 洞内一键推进（看讲解 → 练一练 → 出洞）。
  -->
  <view v-if="open" class="cave-mask" data-cave-scene @click="onMask">
    <view class="cave-card">
      <view class="cave-head">
        <text class="cave-title">探入洞窟</text>
        <text class="cave-door-word" :data-cave-door-state="doorState">{{ doorStateWord(doorState) }}</text>
        <text class="cave-close" data-cave-close @click="$emit('close')">✕</text>
      </view>

      <view class="cave-meta">
        <text class="cm-item" data-cave-node>{{ node ? node.name : '' }}</text>
        <text class="cm-item">{{ gradeShort(node && node.grade) }} · {{ (node && node.chapterName) || '—' }}</text>
        <text class="cm-item">掌握度 <text class="num" data-cave-mastery-now>{{ masteryText }}</text></text>
      </view>

      <!-- 平铺洞内生活场景（画法 = 共享件 caveScene，零色值） -->
      <view class="cave-stage">
        <svg
          class="cave-svg"
          data-cave-scene-svg
          :viewBox="`0 0 ${W} ${H}`"
          preserveAspectRatio="xMidYMid slice"
          role="img"
          :aria-label="`洞窟场景：${node ? node.name : ''}`"
        >
          <defs>
            <linearGradient id="caveVeil" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" class="w-gg-fog" stop-opacity="0.85" />
              <stop offset="1" class="w-gg-fog" stop-opacity="0" />
            </linearGradient>
            <radialGradient id="caveLit" cx="0.5" cy="0.5">
              <stop offset="0" class="w-gg-dawn" stop-opacity="0.9" />
              <stop offset="1" class="w-gg-dawn" stop-opacity="0" />
            </radialGradient>
          </defs>
          <template v-for="(p, i) in scenePrims" :key="'cs' + i">
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
            <ellipse v-else-if="p.k === 'ellipse'" :class="p.c" :cx="p.cx" :cy="p.cy" :rx="p.rx" :ry="p.ry" :opacity="p.o" />
            <rect v-else :class="p.c" :x="p.x" :y="p.y" :width="p.w" :height="p.h" :rx="p.rx" :opacity="p.o" />
          </template>
          <template v-for="(p, i) in seedPrims" :key="'sd' + i">
            <circle v-if="p.k === 'circle'" :class="p.c" :cx="p.cx" :cy="p.cy" :r="p.r" :opacity="p.o" />
            <ellipse v-else :class="p.c" :cx="p.cx" :cy="p.cy" :rx="p.rx" :ry="p.ry" :opacity="p.o" />
          </template>
          <!-- 出洞亮灯：洞内曙光扩散 -->
          <circle v-if="reached" :cx="W / 2" :cy="H - 150" :r="AURA" fill="url(#caveLit)" />
        </svg>

        <!-- 洞内展开到的知识点（灯位）：HTML 叠层，与 SVG 同坐标真源 -->
        <button
          v-for="s in kpSeeds"
          :key="'kp' + s.code"
          class="kp-seed"
          :class="[`is-${s.state}`, { on: s.code === activeCode }]"
          :style="{ left: (s.x / W) * 100 + '%', top: (s.y / H) * 100 + '%' }"
          :data-cave-kp="s.code"
          :data-cave-kp-id="s.id || ''"
          :data-cave-kp-state="s.state"
          :aria-label="`知识点 ${s.name}，${s.id ? '可练' : '未落题'}`"
          @click="pickKp(s)"
        >
          <span class="kp-name">{{ s.name }}</span>
        </button>
      </view>

      <!-- 洞内闭环（复用智学慧眼；≤2 步一键推进） -->
      <view class="cave-loop" data-cave-loop :data-cave-stage="stage" :data-cave-active-kp="(activeKp && activeKp.id) || ''" :data-cave-active-code="activeKp ? activeKp.code : ''">
        <view v-if="!loggedIn" class="loop-card" data-cave-guest>
          <text class="lc-title">洞内此刻无人应答</text>
          <text class="lc-text">登录后，你的 AI 教师会在这里陪你走完「讲解 → 练一练 → 判题 → 掌握」，答对即点亮此洞。</text>
          <text class="lc-text">洞口仍暗着——它只被你的作答点亮。</text>
        </view>

        <view v-else-if="stage === 'idle'" class="loop-card" data-cave-idle>
          <text class="lc-title">洞内 · {{ activeKp ? activeKp.name : '本节的第一个知识点' }}</text>
          <text class="lc-text">{{ activeKp && activeKp.state === 'lit' ? '这个知识点你已经掌握——可以再练一道，或出洞去点下一处。' : '洞壁刻着这一步的来路：先听你的 AI 教师讲，再动手一道真题。' }}</text>
          <button class="tbtn primary block" data-cave-start @click="startTeach">
            看讲解<text class="arr">→</text>
          </button>
        </view>

        <view v-else-if="stage === 'teach'" class="loop-card" data-cave-teach>
          <text class="lc-title">讲解 · {{ activeKp ? activeKp.name : '' }}</text>
          <text v-if="teach.wrongAnswer" class="lc-wrong">上一次你写的是「{{ teach.wrongAnswer }}」——这一处要重看。</text>
          <text v-else class="lc-text">这一步还没有你的作答记录——正好从干净的一题开始。</text>
          <text v-if="baseline != null" class="lc-text">当前掌握基线：{{ baseline }} / 100（低于 80 即洞门未亮）。</text>
          <text class="lc-hint">{{ teach.hint || '听完就动手，一题定这一步。' }}</text>
          <button class="tbtn primary block" data-cave-drill @click="startDrill">
            练一练<text class="arr">→</text>
          </button>
        </view>

        <view v-else-if="stage === 'drill'" class="loop-card" data-cave-drill-panel>
          <text class="lc-title">真题 · {{ activeKp ? activeKp.name : '' }}</text>
          <text v-if="loading" class="lc-text">正在从你的题库取一道真题…</text>
          <template v-else-if="question">
            <text class="lc-question" data-cave-question>{{ question.content }}</text>
            <view class="opt-list" v-if="opts.length">
              <button
                v-for="o in opts"
                :key="o.label"
                class="opt-btn"
                :data-cave-opt="o.label"
                :disabled="submitting"
                @click="submit(o.label)"
              >
                <text class="opt-key">{{ o.label }}</text>
                <text class="opt-text">{{ o.text }}</text>
              </button>
            </view>
            <view v-else class="fill-row">
              <input
                class="fill-input"
                data-cave-fill
                v-model="fill"
                placeholder="写下你的答案"
                :disabled="submitting"
                @confirm="submit(fill)"
              />
              <button class="tbtn primary" data-cave-submit-fill :disabled="submitting || !fill" @click="submit(fill)">作答</button>
            </view>
          </template>
          <text v-else class="lc-text">这一节暂时取不到真题——换个知识点，或出洞稍后再来。</text>
        </view>

        <!-- 答对且掌握 ≥ 80：出洞亮灯（M2 光脉由此前移） -->
        <view v-else-if="stage === 'correct' && reached" class="loop-card is-lit" data-cave-reward data-cave-lit="yes">
          <text class="lc-title">出洞 · 洞口亮灯</text>
          <text class="lc-text" data-cave-mastery>这一步的掌握度到了 {{ mastery }} / 100——洞门由此点亮。</text>
          <text v-if="deltaText" class="lc-text">{{ deltaText }}</text>
          <text class="lc-text">{{ nextText }}</text>
          <!-- 奖励：成就数据缺失即降级为视觉 + 文案，绝不伪造计数 -->
          <text class="lc-reward" data-cave-reward-note>{{ rewardNote }}</text>
          <text v-if="rewardItems.length" class="lc-text" data-cave-achievements>{{ rewardItems.join(' · ') }}</text>
          <button v-if="nextUnlit" class="tbtn block" data-cave-next-kp @click="pickKp(nextUnlit)">
            续点这一节的「{{ nextUnlit.name }}」<text class="arr">→</text>
          </button>
          <button class="tbtn primary block" data-cave-exit @click="exitLit">
            带着这点亮光出洞<text class="arr">→</text>
          </button>
        </view>

        <!-- 答对但未满 80：光前移了一格（不谎报「亮灯」） -->
        <view v-else-if="stage === 'correct'" class="loop-card is-progress" data-cave-progress>
          <text class="lc-title">答对了 · 光前移了一格</text>
          <text class="lc-text">这一步的掌握度 {{ mastery == null ? '—' : mastery }} / 100（满 80 洞门才亮）。答对的每一次都记在光脉上。</text>
          <text v-if="question && question.explanation" class="lc-analysis" data-cave-analysis>{{ question.explanation }}</text>
          <view class="fix-row">
            <button class="tbtn primary sm" data-cave-retry @click="startDrill">再练一道</button>
            <button class="tbtn sm" data-cave-exit-soft @click="$emit('close')">先出洞</button>
          </view>
        </view>

        <view v-else-if="stage === 'wrong'" class="loop-card is-dim" data-cave-wrong data-cave-sway="yes">
          <text class="lc-title">这一处还差一点</text>
          <text class="lc-text">答错了不扣什么——洞口只是暗了下去，光脉也没有前移。把它记进错题，回头再来。</text>
          <text v-if="correctWord" class="lc-text" data-cave-correct-answer>正确答案：{{ correctWord }}</text>
          <text v-if="question && question.explanation" class="lc-analysis" data-cave-analysis>{{ question.explanation }}</text>
          <text v-if="mastery != null" class="lc-text">当前掌握度 {{ mastery }} / 100（满 80 洞门才亮）。</text>
          <view class="fix-row">
            <button v-if="wrongRefs.length" class="tbtn soft sm" data-cave-wrong-list @click="$emit('goto-review', 'wrong')">去错题本 · {{ wrongRefs.length }}</button>
            <button v-else class="tbtn soft sm" data-cave-wrong-list @click="$emit('goto-review', 'wrong')">去错题本</button>
            <button v-if="reviewRefs.length" class="tbtn soft sm" data-cave-review-list @click="$emit('goto-review', 'review')">去复习（间隔）· {{ reviewRefs.length }}</button>
            <button class="tbtn sm" data-cave-retry @click="startTeach">再讲一次</button>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { caveScene, caveSeed, GRADE_TICKS } from '@world-art'
import { getAgentLesson, getKpQuestions, getKpCave, getAgentDiagnosis, submitPracticeAnswer } from '@/api/index.js'
// 判题口径与「练一练」页同一条（normalizeQuestion 抹平题型/选项/答案字母→下标），不另写一套判定。
import { normalizeQuestion, checkAnswer } from '@/store/practice'

const props = defineProps({
  open: { type: Boolean, default: false },
  node: { type: Object, default: null }, // 链上的节：{code,name,grade,chapterName,kps,state}
  kps: { type: Array, default: () => [] }, // 洞内知识点：[{code,name,state,mastery,id?}]
  cave: { type: Object, default: null }, // W5-a kp-cave 聚合（掌握度/态/前置边/题入口/下一节）
  activeCode: { type: String, default: '' },
  loggedIn: { type: Boolean, default: false }
})
const emit = defineEmits(['close', 'lit', 'lit-kp', 'pick-kp', 'goto-review'])

const W = 900
const H = 520
const AURA = 300

const stage = ref('idle')
const loading = ref(false)
const submitting = ref(false)
const question = ref(null)
const raw = ref(null) // 归一化后仍保留原始题（含 analysis）
const teach = ref({})
const result = ref({})
const fill = ref('')
const localActive = ref('')
const localCave = ref(null) // 本次进洞后读到的最新 kp-cave（优先于 props.cave）
const litCodes = ref([]) // 本次进洞点亮的灯位（本地即时记，不等链重取）
const baseline = ref(null)

watch(() => props.open, (v) => { if (!v) litCodes.value = []; reset() })
watch(() => props.activeCode, (v) => { if (v) localActive.value = v })
watch(() => props.cave, (v) => { if (v) localCave.value = v }, { immediate: true })

function reset() {
  stage.value = 'idle'
  loading.value = false
  submitting.value = false
  question.value = null
  raw.value = null
  teach.value = {}
  result.value = {}
  fill.value = ''
  baseline.value = props.cave && props.cave.mastery != null ? props.cave.mastery : null
}

const seeds = computed(() => props.kps || [])
const activeCode = computed(() => localActive.value || props.activeCode || seeds.value[0]?.code || '')
const activeKp = computed(() => seeds.value.find((s) => s.code === activeCode.value) || seeds.value[0] || null)
const caveData = computed(() => localCave.value || props.cave || null)
const mastery = computed(() => {
  const m = result.value.mastery != null ? result.value.mastery : caveData.value && caveData.value.mastery
  return m == null ? null : Number(m)
})
const reached = computed(() => mastery.value != null && mastery.value >= 80)
const deltaText = computed(() => {
  if (baseline.value == null || mastery.value == null) return ''
  const d = mastery.value - baseline.value
  if (!d) return ''
  return d > 0 ? `比进洞前高了 ${d} 分——光脉记住这一次。` : `比进洞前低了 ${Math.abs(d)} 分——它还会再亮的。`
})

/** 洞门三态：掌握 ≥80 亮灯；有作答记录（掌握度有值）半亮；否则暗门。 */
const doorState = computed(() => {
  const m = caveData.value && caveData.value.mastery
  if (m != null && m >= 80) return 'lit'
  if (m != null && m > 0) return 'half'
  const ns = props.node && (props.node.light || props.node.state)
  if (ns && ns !== 'dim') return 'half'
  return 'dim'
})
function doorStateWord(s) {
  return s === 'lit' ? '已亮灯' : s === 'half' ? '半亮 · 可探入' : '暗门 · 可探入'
}
const masteryText = computed(() => {
  const m = caveData.value && caveData.value.mastery
  return m == null ? '暂无作答' : `${m} / 100`
})
function gradeShort(g) {
  return GRADE_TICKS.find((t) => t.g === Number(g))?.short ?? (g ? `G${g}` : 'K12')
}

/** 洞内底景（共享画法；常量几何，随洞展开一次）。 */
const scenePrims = computed(() => caveScene(W, H))
/** 洞内知识点灯位（按知识点数沿洞地面铺开）。 */
const kpSeeds = computed(() => {
  const list = seeds.value
  const n = list.length
  const baseY = H - 96
  return list.map((s, i) => {
    const x = n > 1 ? 150 + (i * (W - 300)) / (n - 1) : W / 2
    const m = caveData.value && localActive.value === s.code ? mastery.value : s.mastery
    let state = m != null && m >= 80 ? 'lit' : m != null && m > 0 ? 'half' : (s.state || 'dim')
    // 本次进洞即时点亮的灯位：不等链重取就先亮起来（灯随作答走，不拖到出洞）
    if (litCodes.value.includes(s.code)) state = 'lit'
    return { ...s, x: Math.round(x), y: baseY, state }
  })
})
const seedPrims = computed(() => kpSeeds.value.flatMap((s) => caveSeed(s.x, s.y, 1, s.state)))

const opts = computed(() => {
  const q = question.value
  if (!q || !q.options || !q.options.length) return []
  return q.options.map((t, i) => ({ label: String.fromCharCode(65 + i), text: t }))
})
const correctWord = computed(() => {
  const q = question.value
  if (!q || !q.options || q.answerIndex == null || q.answerIndex < 0) return ''
  const label = String.fromCharCode(65 + q.answerIndex)
  return `${label}. ${q.options[q.answerIndex]}`
})

/** 本节里下一个还没亮的灯位（洞内闭环一路把这一节点完，无需反复出洞重进）。 */
const nextUnlit = computed(() => {
  const list = seeds.value
  const i = list.findIndex((s) => s.code === activeCode.value)
  const after = [...list.slice(i + 1), ...list.slice(0, i < 0 ? 0 : i)]
  return after.find((s) => (s.state || 'dim') !== 'lit' && !litCodes.value.includes(s.code)) || null
})

const wrongRefs = computed(() => (caveData.value && caveData.value.wrongQuestions && caveData.value.wrongQuestions.items) || [])
const reviewRefs = computed(() => (caveData.value && caveData.value.reviews && caveData.value.reviews.items) || [])
const rewardItems = computed(() => ((caveData.value && caveData.value.achievements && caveData.value.achievements.items) || []).map((a) => a.name || a.code).filter(Boolean))
const rewardNote = computed(() => {
  const items = rewardItems.value
  if (items.length) return `奖励已记入你的成就（${items.length} 项）。`
  // 成就库现为 0 条：降级为视觉（亮灯 + 曙光扩散）+ 文案，不编造计数
  return '洞口亮灯 · 这一段的曙光扩散开来（成就数据暂未收录，先以亮灯为记）。'
})
const nextText = computed(() => {
  const next = caveData.value && caveData.value.next
  if (!next) return '这是本链的末节——光脉已到尽头。'
  return `下一个最佳目标：${next.name}${next.firstKp ? `（${next.firstKp.name}）` : ''}——光脉正朝它去。`
})

function pickKp(s) {
  localActive.value = s.code
  localCave.value = null // 换灯位即作废上一点的掌握度读数（等 world 回灌新的 kp-cave）
  reset()
  emit('pick-kp', s.code)
}

/** 讲解：复用 AI 教师授课状态机的第一拍（不重复造讲解）。 */
async function startTeach() {
  const kp = activeKp.value
  stage.value = 'teach'
  teach.value = {}
  if (!kp || !kp.id) return
  loading.value = true
  try {
    const r = await getAgentLesson(kp.id, 'teach')
    teach.value = r && r.success ? r : {}
  } catch (e) {
    teach.value = {}
  } finally {
    loading.value = false
  }
}

/** 练一练：取该知识点课程题库的一道真题（与「练一练」页同一题库读面）。 */
async function startDrill() {
  const kp = activeKp.value
  stage.value = 'drill'
  question.value = null
  raw.value = null
  if (!kp || !kp.id) return
  loading.value = true
  try {
    const list = await getKpQuestions(kp.id, 5)
    const arr = Array.isArray(list) ? list : (list && list.items) || []
    const pick = arr[Math.floor(Math.random() * arr.length)] || null
    raw.value = pick
    question.value = pick ? normalizeQuestion(pick) : null
  } catch (e) {
    question.value = null
  } finally {
    loading.value = false
  }
}

/**
 * 作答 → 判 → 落库 → 掌握。
 * 判题口径 = 练习页的 checkAnswer（同一函数）；落库 = practice.answer（后端信任前端判定，
 * 与「练一练」页完全同一条管线）；再用诊断面把最新掌握度吃进 mastery_snapshots
 * （学习链 / 洞门三态 / 光脉都以它为准），最后读 kp-cave 取权威掌握度与错题/复习 due。
 */
async function submit(answer) {
  const kp = activeKp.value
  const q = question.value
  if (!kp || !q || submitting.value) return
  submitting.value = true
  const isCorrect = checkAnswer(q, typeof answer === 'number' ? answer : String(answer || '').trim())
  const answerText = typeof answer === 'number' ? q.options[answer] : String(answer ?? '')
  try {
    await submitPracticeAnswer({ questionId: q.id, answer: answerText, isCorrect })
    // 掌握度真源刷新（诊断面既定副作用：答对即按 正确/作答 重算 mastery_snapshots）
    try { await getAgentDiagnosis() } catch (e) { /* 刷新失败不阻断本拍 */ }
    let fresh = null
    try { fresh = await getKpCave(kp.id) } catch (e) { fresh = null }
    if (fresh) {
      localCave.value = fresh
      result.value = { mastery: fresh.mastery != null ? Number(fresh.mastery) : null }
    } else {
      result.value = { mastery: null }
    }
    const m = result.value.mastery
    stage.value = isCorrect ? 'correct' : 'wrong'
    if (isCorrect && m != null && m >= 80) {
      litCodes.value = [...litCodes.value, kp.code]
      emit('lit-kp', kp.code)
    }
  } catch (e) {
    stage.value = 'wrong'
    result.value = { mastery: null }
  } finally {
    submitting.value = false
  }
}

function exitLit() {
  emit('lit', activeKp.value ? activeKp.value.code : '')
  emit('close')
}

function onMask(event) {
  if (event.target === event.currentTarget) emit('close')
}
</script>

<style scoped>
/* 洞内场景：颜色一律取世界令牌（与人本世界/登峰世界同一套色，N2） */
.cave-mask {
  position: fixed; inset: 0; background: var(--world-scrim);
  display: flex; align-items: center; justify-content: center; z-index: var(--z-modal); padding: 16px;
}
.cave-card {
  width: 100%; max-width: 720px; max-height: 90vh; overflow-y: auto;
  background: var(--world-panel); border: 1px solid var(--world-panel-edge);
  border-radius: 20px; padding: 18px 18px 22px; box-sizing: border-box;
  box-shadow: var(--shadow-card);
}
.cave-head { display: flex; align-items: center; gap: 10px; }
.cave-title { font-size: 17px; font-weight: 700; color: var(--world-node-text); flex: 1; }
.cave-door-word {
  font-size: 11px; padding: 3px 9px; border-radius: 999px;
  background: var(--world-node-bg); color: var(--world-node-sub); border: 1px solid var(--world-node-border);
}
.cave-door-word[data-cave-door-state="lit"] { background: var(--world-cave-glow-lit); color: var(--world-node-text); }
.cave-door-word[data-cave-door-state="half"] { background: var(--world-cave-glow-half); }
.cave-close { font-size: 18px; color: var(--world-node-sub); padding: 4px 8px; }
.cave-meta { display: flex; flex-wrap: wrap; gap: 12px; margin: 8px 0 12px; }
.cm-item { font-size: 11px; color: var(--world-node-sub); }
.cm-item .num { color: var(--world-node-on-bg); font-weight: 650; }

.cave-stage { position: relative; width: 100%; aspect-ratio: 900 / 520; border-radius: 14px; overflow: hidden; background: var(--world-cave-wall-3); }
.cave-svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.kp-seed {
  position: absolute; transform: translate(-50%, 0); padding: 3px 8px; margin: 0;
  border-radius: 999px; border: 1px solid var(--world-node-border); background: var(--world-node-bg);
  font-size: 10px; color: var(--world-node-sub); max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.kp-seed::after { border: none; }
.kp-seed.is-lit { border-color: var(--world-node-lit); color: var(--world-node-text); background: var(--world-node-halo-lit); }
.kp-seed.is-half { border-color: var(--world-node-half); }
.kp-seed.on { box-shadow: 0 0 0 2px var(--world-node-on-bg); color: var(--world-node-on-bg); }

.cave-loop { margin-top: 14px; }
.loop-card {
  background: var(--world-node-bg); border: 1px solid var(--world-node-border);
  border-radius: 13px; padding: 14px 15px; display: flex; flex-direction: column; gap: 7px;
}
.loop-card.is-lit { border-color: var(--world-node-lit); background: var(--world-node-halo-lit); }
.loop-card.is-progress { border-color: var(--world-node-half); background: var(--world-node-halo-half); }
.loop-card.is-dim { border-style: dashed; opacity: 0.92; animation: cave-sway 1.1s ease-in-out; }
@keyframes cave-sway { 0%, 100% { transform: translateY(0); opacity: 0.92; } 35% { transform: translateY(3px); opacity: 0.62; } 70% { transform: translateY(-1px); opacity: 0.8; } }
.lc-title { font-size: 14px; font-weight: 650; color: var(--world-node-text); }
.lc-text { font-size: 12px; color: var(--world-node-sub); line-height: 1.8; }
.lc-hint { font-size: 11px; color: var(--world-node-sub); opacity: 0.8; }
.lc-wrong { font-size: 12px; color: var(--world-node-text); background: var(--world-cave-glow-half); border-radius: 8px; padding: 7px 10px; }
.lc-question { font-size: 13px; color: var(--world-node-text); line-height: 1.8; }
.lc-analysis { font-size: 11px; color: var(--world-node-sub); line-height: 1.8; background: var(--world-node-track); border-radius: 8px; padding: 7px 10px; }
.lc-reward { font-size: 11px; color: var(--world-node-on-bg); }
.arr { margin-left: 4px; }

.opt-list { display: flex; flex-direction: column; gap: 7px; margin-top: 4px; }
.opt-btn {
  display: flex; align-items: center; gap: 10px; text-align: left; margin: 0;
  padding: 9px 12px; border-radius: 10px; background: var(--world-node-bg);
  border: 1px solid var(--world-node-border); color: var(--world-node-text); font-size: 12px;
}
.opt-btn::after { border: none; }
.opt-btn[disabled] { opacity: 0.6; }
.opt-key {
  flex-shrink: 0; width: 20px; height: 20px; line-height: 20px; text-align: center;
  border-radius: 6px; background: var(--world-node-track); color: var(--world-node-text); font-size: 11px;
}
.opt-text { flex: 1; line-height: 1.6; }

.fill-row { display: flex; gap: 8px; align-items: center; }
.fill-input {
  flex: 1; padding: 9px 12px; border-radius: 10px; font-size: 12px;
  background: var(--world-node-bg); border: 1px solid var(--world-node-border); color: var(--world-node-text);
}
.fix-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }

.tbtn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  border: 1px solid var(--world-node-border); border-radius: 9px;
  padding: 9px 14px; background: var(--world-node-bg);
  color: var(--world-node-text); font-size: 12px; font-weight: 550; margin: 0;
}
.tbtn.primary { background: var(--world-node-on-bg); color: var(--world-node-on-text); border-color: var(--world-node-on-bg); }
.tbtn.soft { background: var(--color-primary-light); border-color: transparent; color: var(--color-primary); }
.tbtn.block { width: 100%; margin-top: 6px; }
.tbtn.sm { padding: 6px 11px; font-size: 11px; }
.num { font-variant-numeric: tabular-nums; }

@media (prefers-reduced-motion: reduce) {
  .loop-card.is-dim { animation: none; }
}
</style>
