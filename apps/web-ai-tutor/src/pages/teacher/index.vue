<template>
  <ErrorBoundary :showDetails="true" :logError="true">
    <view class="page">
      <PageHeader title="我的 AI 教师" subtitle="专属你的独立教师 · 长期记忆陪伴" :actions="headerActions" />

      <!-- 教师状态卡：显示大模型能力与已开教师 -->
      <view class="teacher-card">
        <view class="teacher-avatar">🎓</view>
        <view class="teacher-meta">
          <text class="teacher-title">专属 AI 教师</text>
          <text class="teacher-sub" v-if="status">{{ status }} · 已为你建立独立记忆</text>
          <text class="teacher-sub" v-else>正在为你开通专属教师…</text>
          <view class="chips" v-if="skills.length">
            <Chip
              v-for="s in skills"
              :key="s"
              :label="s"
              color="blue"
              variant="outlined"
              size="small"
            />
          </view>
        </view>
      </view>

      <!-- 学情总览：真实掌握度 / 错题本 / 复习序列（读工具逻辑,不经 LLM） -->
      <view class="insights-card">
        <view class="section-head">
          <text class="section-label">📊 学情总览</text>
          <text class="refresh" @click="loadInsights">{{ insightsLoading ? '更新中…' : '↻ 刷新' }}</text>
        </view>
        <view v-if="insightsLoading" class="insight-empty">正在读取你的真实学情…</view>
        <template v-else-if="overview && (overview.knowledgePoints || []).length">
          <view class="kp-bars">
            <view class="kp-row" v-for="kp in overview.knowledgePoints" :key="kp.kpId">
              <text class="kp-name">{{ kp.kpName }}</text>
              <view class="kp-track"><view class="kp-fill" :style="{ width: kp.mastery + '%' }"></view></view>
              <text class="kp-mastery">{{ kp.mastery }}%</text>
              <text class="kp-delta" :class="kpDeltaClass(kp)" v-if="kpDeltaText(kp)">{{ kpDeltaText(kp) }}</text>
              <text class="kp-count">{{ kp.correct }}/{{ kp.attempts }}<text class="kp-time" v-if="kp.avgTimeSec"> · {{ kp.avgTimeSec }}s/题</text></text>
              <text class="kp-drill" @click="startKpDrill(kp)" v-if="!reviewSession">专项练</text>
            </view>
          </view>
          <view class="insight-stats">
            <text class="stat-chip">🧮 未解决错题 <b>{{ overview.totalUnresolved }}</b> 道</text>
            <text class="stat-chip">🎯 总准确率 <b>{{ overview.accuracy }}%</b></text>
          </view>
        </template>
        <view v-else-if="overview" class="insight-empty">还没有足够作答数据，聊几道题就能出掌握度了。</view>

        <view class="sub-block" v-if="(wrongBook.questions || []).length">
          <text class="sub-title">错题本</text>
          <view class="wq-item" v-for="(w, i) in wrongBook.questions.slice(0, 3)" :key="w.questionId">
            <text class="wq-n">{{ i + 1 }}</text>
            <text class="wq-content">{{ w.content || '题 ' + w.questionId }}</text>
            <text class="wq-kp" v-if="w.knowledgePoint">{{ w.knowledgePoint }}</text>
            <text class="redo" @click="startAnswer(w)">重做</text>
          </view>
        </view>

        <view class="sub-block" v-if="(reviewSeq.questions || []).length && !reviewSession">
          <text class="sub-title">🔁 今日待复习（缺口 + SM-2 记忆曲线）</text>
          <view class="wq-item" v-for="(q, i) in reviewSeq.questions.slice(0, 4)" :key="q.questionId">
            <text class="wq-n">{{ i + 1 }}</text>
            <text class="wq-content">{{ q.content || '题 ' + q.questionId }}</text>
            <view class="rv-badges">
              <text class="rv-badge" v-for="b in reviewBadges(q)" :key="b">{{ b }}</text>
            </view>
            <text class="wq-kp" v-if="q.kpName">{{ q.kpName }} {{ q.masteryPct }}%</text>
            <text class="redo" @click="startAnswer(q)">做</text>
          </view>
          <view class="sprint-start">
            <text class="redo" @click="startReview">🏃 开始复习冲刺（{{ reviewSeq.questions.length }} 道待复习）</text>
          </view>
        </view>

        <!-- 复习冲刺会话：把今日待复习题组成连续题组, 一道一道做, 自动推进 + 收尾回顾（纯前端组合既有薄端点） -->
        <view class="sub-block" v-else-if="reviewSession">
          <view class="sprint-head">
            <text class="sub-title">{{ reviewTitleFull }}</text>
            <text class="redo" v-if="!reviewFinished" @click="skipReview">跳过</text>
          </view>

          <template v-if="reviewFinished">
            <view class="sprint-recap">
              <text class="recap-title">🏁 {{ drillKp ? '专项练习完成！' : '冲刺完成！' }}</text>
              <text class="recap-sub">正确 {{ reviewCorrect }} · 跳过 {{ reviewSkipped }}（共 {{ reviewDeck.length }} 题）· 正确率 {{ reviewRate }}%</text>
              <text class="recap-sub" v-if="reviewHadWrong.length">笨磕 {{ reviewHadWrong.length }} 题，已巩固——可再练一次。</text>
            </view>
            <view class="sprint-actions">
              <text class="redo" @click="drillKp ? startDrillAgain() : startReview()">{{ drillKp ? '🔁 再练一次' : '🔁 再冲刺一次' }}</text>
              <text class="redo" @click="exitReview">退出，返回</text>
            </view>
          </template>

          <template v-else>
            <view class="sprint-q">
              <text class="sprint-text">{{ (currentReviewQ || {}).content || '' }}</text>
              <view class="rv-badges" v-if="currentReviewQ">
                <text class="rv-badge" v-for="b in reviewBadges(currentReviewQ)" :key="b">{{ b }}</text>
              </view>
              <text class="wq-kp" v-if="currentReviewQ && currentReviewQ.kpName">{{ currentReviewQ.kpName }} {{ currentReviewQ.masteryPct }}%</text>
              <view class="sprint-answer" @click="startAnswer(currentReviewQ)">✍️ 作答 / 重答</view>
              <text class="sprint-tip">在下方输入框作答，答对自动进入下一题；答错可重试或「跳过」。</text>
            </view>
          </template>
        </view>

        <!-- 作答判题浮层（点重做后出现）：答对即消错题 + 回灌作答 -->
        <view class="answer-bar" v-if="activeQ">
          <view class="answer-head">
            <text class="sub-title">作答：{{ (activeQ.content || activeQ.questionId || '').slice(0, 40) }}…</text>
            <text class="redo" @click="cancelAnswer">取消</text>
          </view>
          <view class="answer-input-row">
            <input class="answer-input" v-model="answerDraft" placeholder="输入你的答案…" :confirm-type="'send'" @confirm="submitAnswer" />
            <view class="answer-btn" :class="{ disabled: grading }" @click="submitAnswer">{{ grading ? '判读中…' : '判读' }}</view>
          </view>
          <text class="grading-msg" v-if="gradingMsg">{{ gradingMsg }}</text>
        </view>
      </view>

      <!-- 我的 AI 学习计划：plan.generate 生成的活动计划, 面板内完成 -->
      <view class="insights-card" v-if="activePlan">
        <view class="section-head">
          <text class="section-label">📋 我的 AI 学习计划</text>
          <text class="plan-progress">{{ planLoading ? '…' : Math.round(activePlan.progress || 0) + '%' }}</text>
        </view>
        <text class="plan-title">{{ activePlan.title || '个性化学习计划' }}</text>
        <view class="plan-track"><view class="plan-fill" :style="{ width: Math.round(activePlan.progress || 0) + '%' }"></view></view>
        <view class="plan-tasks">
          <view class="plan-task" v-for="t in planTasks(activePlan)" :key="t.__idx">
            <text class="plan-task-title">{{ t.title || t.kpName || ('任务 ' + (t.__idx + 1)) }}</text>
            <text class="plan-do" v-if="!t.completed" @click="completeTask(activePlan, t.__idx)">{{ completingIdx === t.__idx ? '完成中…' : '✓ 完成' }}</text>
            <text class="plan-done" v-else>已学</text>
          </view>
        </view>
      </view>

      <!-- 授课卡：手把手一节课（讲→答→推进，答对自动收束），驱动 lesson.current 状态机,判题走 lesson.submit -->
      <view class="insights-card lesson-card">
        <view class="section-head">
          <text class="section-label">🎓 上一节课</text>
          <text class="refresh" v-if="!reviewSession" @click="lessonSession ? exitLesson() : openWeakestLesson()">{{ lessonBusy ? '…' : (lessonSession ? '✕ 退出本课' : '开始上课') }}</text>
        </view>

        <template v-if="!reviewSession && !lessonSession">
          <text class="lesson-intro" v-if="weakestKp">按最薄弱的知识点开课：<b>{{ weakestKp.kpName }}</b>（{{ weakestKp.mastery }}%）——先摸底，再讲解，再做题手把手弄懂。</text>
          <text class="lesson-intro" v-else>控制台还没你的作答数据——先聊几道题，就能为最薄弱的知识点上这节课。</text>
          <text class="redo lesson-go" @click="openWeakestLesson" v-if="weakestKp">🎓 开始一节「{{ weakestKp.kpName }}」</text>
        </template>

        <template v-else-if="!reviewSession && lessonSession">
          <view class="lesson-head">
            <text class="lesson-kp">{{ lessonKp.kpName || '' }}</text>
            <text class="lesson-stage">{{ stageLabel(lessonStage) }}</text>
          </view>

          <view v-if="lessonStage === 'assess'" class="lesson-body">
            <text class="lesson-line">📊 该知识点的真实掌握度：<b>{{ lesson.mastery }}%</b>（{{ lesson.attempts }} 次作答），仍有 <b>{{ lesson.unresolvedWrong }}</b> 道未解决错题。</text>
            <text class="lesson-line">先弄清你卡在哪，再对症下药。</text>
            <text class="redo lesson-cta" @click="lessonGo('teach')">▶ 开始讲解</text>
          </view>

          <view v-else-if="lessonStage === 'teach'" class="lesson-body">
            <text class="lesson-line" v-if="lesson.targeted">🧑‍🏫 专讲你这次答错的：</text>
            <text class="lesson-line" v-else>🧑‍🏫 讲解「{{ lesson.kpName }}」核心原理。你最近一次做错的写法是：</text>
            <text class="lesson-wrong">“{{ lesson.wrongAnswer || '（还没有答错的记录）' }}”</text>
            <text class="lesson-line">分清每一步的类型与依据，别再把这类关系弄反。</text>
            <text class="redo lesson-cta" @click="lessonGo('example')">▶ 看一道例题</text>
          </view>

          <view v-else-if="lessonStage === 'example'" class="lesson-body">
            <text class="lesson-line">🧮 例题示包容你的类型：</text>
            <text class="lesson-example">{{ (lesson.content || '题 ' + lesson.questionId).replace(/^solve:\s*/i, '') }}</text>
            <text class="lesson-line">看懂了就到你来——下面跟着做一道同类型。</text>
            <text class="redo lesson-cta" @click="lessonGo('drill')">✍️ 轮到你了，做一练</text>
          </view>

          <view v-else-if="lessonStage === 'drill'" class="lesson-body">
            <text class="lesson-line">💪 再练一题巩固：</text>
            <text class="lesson-example">{{ (lesson.content || '题 ' + (lesson.questionId || activeQ && activeQ.questionId)).replace(/^solve:\s*/i, '') }}</text>
            <text class="lesson-tip">在下方作答框输入答案——答对即收束本节；答错会专门重讲你这次错在哪。</text>
            <text class="redo lesson-cta" @click="lessonGo('teach')">💡 重讲再练（讲这次的错）</text>
          </view>

          <view v-else-if="lessonStage === 'complete'" class="lesson-body">
            <text class="lesson-line">🎉 这节「{{ lessonKp.kpName }}」上完啦——最后一道再练你答对了！</text>
            <text class="lesson-line" v-if="lesson && lesson.practiceMastery != null">现在这个知识点的真实掌握度 <b>{{ lesson.practiceMastery }}%</b><text v-if="lesson.baseline != null">（摸底 {{ lesson.baseline }}%<text v-if="lesson.delta != null">，提升 <b class="up">{{ lesson.delta >= 0 ? '+' : '' }}{{ lesson.delta }}%</b></text>）</text>。</text>
            <view class="sprint-actions">
              <text class="redo" @click="openWeakestLesson(false)">🔁 再练一节</text>
              <text class="redo" @click="exitLesson">退出，返回</text>
            </view>
          </view>

          <text class="grading-msg" v-if="gradingMsg && lessonStage !== 'drill'">{{ gradingMsg }}</text>
        </template>

        <text class="lesson-intro" v-if="reviewSession">正在复习冲刺中——先完成或退出冲刺，再来上课。</text>
      </view>

      <!-- 上课历史：lesson.record 落盘的一节课记录（每课含摸底→提升真实结果） -->
      <view class="insights-card" v-if="lessonHistory.length">
        <view class="section-head">
          <text class="section-label">📚 上课记录</text>
          <text class="stat-chip">共 <b>{{ lessonHistory.length }}</b> 节</text>
        </view>
        <view class="lh-item" v-for="l in lessonHistory.slice(0, 5)" :key="l.id">
          <text class="lh-title">{{ l.kpName || l.title }}</text>
          <text class="lh-outcome" :class="l.outcome === 'abandoned' ? 'down' : 'up'">{{ lessonOutcomeText(l) }}</text>
          <text class="lh-delta" v-if="l.outcome === 'completed' && l.delta != null">{{ l.baseline != null ? l.baseline + '%' : '' }}→{{ l.practiceMastery != null ? l.practiceMastery + '%' : '' }}（{{ l.delta >= 0 ? '+' : '' }}{{ l.delta }}）</text>
          <text class="lh-meta" v-if="l.missedCount">{{ l.missedCount }} 次答错后弄懂</text>
        </view>
      </view>

      <!-- 长期记忆条：教师记住了什么（跨会话） -->
      <view class="memory-section" v-if="facts.length">
        <text class="section-label">教师记得你 🧠 <text class="mem-hint">（过时的点 ✕ 让教师忘掉）</text></text>
        <view class="memory-list">
          <view class="memory-item" v-for="f in facts" :key="f.key">
            <text class="mem-key">{{ prettifyKey(f.key) }}</text>
            <text class="mem-val">{{ f.value }}</text>
            <text class="mem-forget" :class="{ busy: forgetting === f.key }" @click="forgetFact(f.key)">{{ forgetting === f.key ? '…' : '✕' }}</text>
          </view>
        </view>
      </view>

      <!-- 对话区 -->
      <scroll-view class="chat-scroll" scroll-y="true" :scroll-into-view="scrollAnchor" scroll-with-animation>
        <view class="chat-body">
          <view v-if="!messages.length" class="chat-empty">
            <EmptyState
              title="和你的 AI 教师聊聊吧"
              description="讲讲你想学的知识点、说说你的偏好，教师会记住并个性化辅导你。"
              icon="💬"
            />
          </view>

          <view
            v-for="(m, i) in messages"
            :key="i"
            :id="'msg-' + i"
            class="msg-row"
            :class="m.role === 'user' ? 'from-user' : 'from-teacher'"
          >
            <view class="bubble" :class="m.role">
              <text class="bubble-text">{{ m.text }}</text>
            </view>
          </view>

          <view
            v-if="loading"
            id="msg-loading"
            class="msg-row from-teacher"
          >
            <view class="bubble teacher typing">
              <text>教师正在思考…</text>
            </view>
          </view>
        </view>
      </scroll-view>

      <!-- 输入区 -->
      <view class="input-bar">
        <input
          class="chat-input"
          v-model="draft"
          :adjust-position="true"
          placeholder="输入消息，和专属教师对话…"
          :confirm-type="'send'"
          @confirm="onSend"
          @input="onInputHeight"
        />
        <button class="send-btn" :disabled="loading || !draft.trim()" @click="onSend">发送</button>
      </view>
    </view>
  </ErrorBoundary>
</template>

<script>
import { ref, computed, nextTick } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import ErrorBoundary from '@/components/ErrorBoundary.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Chip from '@/components/ui/Chip.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { openAgent, sendAgentMessage, getAgentMemory, forgetAgentMemory, adminCapability, getAgentDiagnosis, getAgentWrongQuestions, getAgentReviewSequence, getAgentMasteryTrend, gradeAgentAnswer, getAgentKpQuestions, getAgentLesson, getAgentLessonSubmit, getPlans, completePlanTask } from '@/api'
import { useUserStore } from '@/store/user'

export default {
  name: 'TeacherAgent',
  components: {
    ErrorBoundary,
    PageHeader,
    Chip,
    EmptyState
  },
  setup() {
    const messages = ref([])
    const draft = ref('')
    const loading = ref(false)
    const status = ref('')
    const skills = ref([])
    const tools = ref([])
    const facts = ref([])
    const scrollAnchor = ref('')
    const isOperator = ref(false)
    // 只读学情面板数据
    const overview = ref(null)
    const wrongBook = ref({ questions: [] })
    const reviewSeq = ref({ questions: [] })
    const trend = ref(null) // 掌握度趋势(按天累计,判断进步/退步)
    const insightsLoading = ref(false)
    // 面板作答判题（消错题）
    const activeQ = ref(null)
    const answerDraft = ref('')
    const grading = ref(false)
    const gradingMsg = ref('')
    const qShownAt = ref(0) // 本道上一次展示时间戳（用于上报答题耗时）
    // 我的 AI 学习计划
    const plans = ref([])
    const planLoading = ref(false)
    const completingIdx = ref(null)
    // 复习冲刺会话（纯前端组合既有薄端点：review-sequence 作有序题组 + gradeAgentAnswer 逐题判读）
    const reviewSession = ref(false)
    const reviewFinished = ref(false)
    const reviewDeck = ref([])
    const reviewIdx = ref(0)
    const reviewCorrect = ref(0)
    const reviewSkipped = ref(0)
    const reviewHadWrong = ref([])
    const drillKp = ref(null) // 专项练习：当前在练的知识点({ kpName });非空即"专项练习"模式的复习冲刺
    const reviewTitle = computed(() => drillKp.value ? '🎯 专项练习 · ' + drillKp.value.kpName : '🏃 复习冲刺')
    const reviewTitleFull = computed(() => drillKp.value ? '🎯 专项练习 · ' + drillKp.value.kpName + (reviewFinished.value ? ' 完成' : ' · 第 ' + (reviewIdx.value + 1) + '/' + reviewDeck.value.length + ' 题') : (reviewFinished.value ? '🏃 复习冲刺完成' : '🏃 复习冲刺 · 第 ' + (reviewIdx.value + 1) + '/' + reviewDeck.value.length + ' 题'))
    const currentReviewQ = computed(() => reviewDeck.value[reviewIdx.value])
    const reviewRate = computed(() => {
      const done = reviewCorrect.value + reviewSkipped.value
      return done ? Math.round((reviewCorrect.value / done) * 100) : 0
    })
    // 授课卡（lesson.current 状态机）：摸底→讲解→例题→再练→完成，判题走 lesson.submit 自动推进
    const lessonSession = ref(false)
    const lessonFinished = ref(false)
    const lessonBusy = ref(false)
    const lessonKp = ref(null) // {kpId, kpName}
    const lessonStage = ref('') // assess/teach/example/drill/complete
    const lesson = ref(null) // 最近一次 lesson.current/lesson.submit 返回(供各阶段渲染真实数据)
    const lessonMode = ref(false) // 当前作答条是否服务于"授课再练"（提交走 lesson.submit 而非裸 grade）
    const weakestKp = computed(() => {
      const kps = (overview.value && overview.value.knowledgePoints) || []
      if (!kps.length) return null
      return [...kps].sort((a, b) => (a.mastery || 0) - (b.mastery || 0))[0]
    })
    const stageLabels = { assess: '📊 摸底', teach: '🧑‍🏫 讲解', example: '🧮 例题', drill: '💪 再练', complete: '🎉 完成' }
    const stageLabel = (s) => stageLabels[s] || s || ''
    const activePlan = computed(() => {
      const ps = (plans.value || []).filter((p) => p.plan_type === 'personalized' && p.status === 'active')
      return ps.length ? ps[0] : null
    })
    // 上课历史：lesson.record 落盘的一节课记录（最新在前,每课含摸底→提升真实结果）
    const lessonHistory = computed(() =>
      (plans.value || [])
        .filter((p) => p.plan_type === 'lesson')
        .map((p) => {
          const pd = typeof p.plan_data === 'string' ? (p.plan_data ? JSON.parse(p.plan_data) : {}) : p.plan_data || {}
          return { id: p.id, title: p.title, status: p.status, recordedAt: p.created_at, ...pd }
        })
    )
    const lessonOutcomeText = (l) => (l.outcome === 'abandoned' ? '未完成' : l.outcome === 'completed' ? '已完成' : (l.status === 'completed' ? '已完成' : '未完成'))
    const planTasks = (plan) => {
      const pd = plan && plan.plan_data
      const tasks = (typeof pd === 'string' ? JSON.parse(pd) : pd)?.tasks || []
      return tasks.map((t, i) => ({ ...t, __idx: i }))
    }

    // 头部操作：站点运营（根组织 owner|admin）才显示「运营台」入口，去管理 MCP server/模型路由/审计。
    // 后端 assertSiteOperator 仍强校验，此处仅做展示开关（非运营不进面板）。
    const headerActions = computed(() =>
      isOperator.value
        ? [{ label: '运营台', handler: () => uni.navigateTo({ url: '/pages/agent-admin/index' }) }]
        : []
    )

    const scrollToBottom = async () => {
      await nextTick()
      const last = messages.value.length - 1
      scrollAnchor.value = last >= 0 ? 'msg-' + last : 'msg-loading'
    }

    const prettifyKey = (k) => {
      const short = String(k).replace(/^pref\./, '').replace(/_/g, ' ')
      return short.charAt(0).toUpperCase() + short.slice(1)
    }

    const open = async () => {
      const res = await openAgent()
      if (res?.success) {
        status.value = res.kind === 'student' ? '独立教师' : res.status
        skills.value = res.skills || []
        tools.value = res.tools || []
      }
    }

    const loadMemory = async () => {
      const res = await getAgentMemory()
      facts.value = res?.facts || []
    }

    // 面板显式管理记忆：忘掉一条过时/记错的记忆（复用后端 memory.forget 逻辑，不经 LLM）
    const forgetting = ref(null)
    const forgetFact = async (key) => {
      if (forgetting.value === key) return
      forgetting.value = key
      try {
        const res = await forgetAgentMemory(key)
        if (res && res.success) {
          facts.value = facts.value.filter((f) => f.key !== key)
          uni.showToast({ title: '已让教师忘掉', icon: 'none' })
        } else {
          uni.showToast({ title: '忘记失败', icon: 'none' })
        }
      } catch (e) {
        uni.showToast({ title: '忘记失败', icon: 'none' })
      } finally {
        forgetting.value = null
      }
    }

    // 只读学情总览：并行拉 掌握度诊断 / 错题本 / 复习序列预览（复用工具逻辑，不经 LLM）
    const loadInsights = async () => {
      insightsLoading.value = true
      try {
        const [d, w, r, t] = await Promise.all([getAgentDiagnosis(), getAgentWrongQuestions(10), getAgentReviewSequence(5), getAgentMasteryTrend()])
        overview.value = d
        wrongBook.value = w
        reviewSeq.value = r
        trend.value = t
      } finally {
        insightsLoading.value = false
      }
    }

    // 掌握度趋势：每 KP 的首末掌握度差值(↑进步/↓退步/null 无历史)
    const kpDelta = (kp) => {
      const kps = (trend.value && trend.value.knowledgePoints) || []
      const t = kps.find((k) => k.kpId === kp.kpId)
      return t && typeof t.deltaPts === 'number' ? t.deltaPts : null
    }
    const kpDeltaText = (kp) => {
      const d = kpDelta(kp)
      if (d === null) return ''
      if (d === 0) return '→ 0'
      return d > 0 ? `▲+${d}` : `▼${d}`
    }
    const kpDeltaClass = (kp) => {
      const d = kpDelta(kp)
      if (d === null) return ''
      return d > 0 ? 'up' : d < 0 ? 'down' : 'flat'
    }

    // 面板作答判题：点开一道题 → 输入答案 → 判读(答对即消错题)
    const startAnswer = (q) => {
      activeQ.value = { ...q }
      answerDraft.value = ''
      gradingMsg.value = ''
      qShownAt.value = Date.now()
    }
    const cancelAnswer = () => {
      activeQ.value = null
      answerDraft.value = ''
      gradingMsg.value = ''
      qShownAt.value = 0
    }
    const submitAnswer = async () => {
      if (!activeQ.value || grading.value) return
      const answer = answerDraft.value.trim()
      if (!answer) return
      grading.value = true
      gradingMsg.value = ''
      const inLesson = lessonMode.value
      const inReview = reviewSession.value && !reviewFinished.value && !inLesson
      const elapsed = qShownAt.value ? Date.now() - qShownAt.value : undefined
      qShownAt.value = Date.now() // 重试/下一题计时重新开始
      const timeNote = elapsed != null ? ` · 用时 ${Math.round(elapsed / 1000)}s` : ''
      try {
        if (inLesson) { await submitLessonAnswer(answer, timeNote); return }
        const res = await gradeAgentAnswer(activeQ.value.questionId, answer, true, elapsed)
        grading.value = false
        if (res && res.isCorrect) {
          const next = res.sm2 && res.sm2.interval > 0 ? ` · ${res.sm2.interval} 天后再带你复习这块` : ''
          if (inReview) {
            reviewCorrect.value++
            gradingMsg.value = (res.resolved ? '✅ 答对，已消除该错题！' : '✅ 答对了！') + next + timeNote
            answerDraft.value = ''
            advanceReview() // 自动进下一题或收尾
          } else {
            gradingMsg.value = (res.resolved ? '✅ 答对，已消除该错题！' : '✅ 答对了！') + next + timeNote
            if (res.resolved && wrongBook.value.questions) {
              wrongBook.value.questions = wrongBook.value.questions.filter((w) => w.questionId !== activeQ.value.questionId)
            }
            activeQ.value = null
            answerDraft.value = ''
            await loadInsights()
          }
        } else {
          const next = res && res.sm2 ? ' · 尽快会带你重练' : ''
          if (inReview) {
            if (!reviewHadWrong.value.includes(activeQ.value.questionId)) {
              reviewHadWrong.value.push(activeQ.value.questionId)
            }
            gradingMsg.value = (res && res.explanation) ? `❌ 再想想：${res.explanation} · 可重答或跳过` + timeNote : '❌ 答错了，再试一次或跳过。' + next + timeNote
            answerDraft.value = ''
          } else {
            gradingMsg.value = (res && res.explanation) ? `❌ 再想想：${res.explanation}` + timeNote : '❌ 答错了，再试一次或去和教师聊聊。' + next + timeNote
            answerDraft.value = ''
          }
        }
      } catch (e) {
        grading.value = false
        gradingMsg.value = '判题失败，请稍后再试。'
      }
    }

    // 我的 AI 学习计划：拉取 + 面板内完成一条任务（复用后端 plan.complete 端点,答对回灌掌握度）
    const loadPlans = async () => {
      planLoading.value = true
      try {
        const data = await getPlans('')
        plans.value = (data?.plans || [])
      } finally {
        planLoading.value = false
      }
    }
    const completeTask = async (plan, idx) => {
      if (completingIdx.value !== null) return
      completingIdx.value = idx
      try {
        await completePlanTask(plan.id, idx, true)
        await Promise.all([loadPlans(), loadInsights()]) // 掌握度/错题实时刷新
      } finally {
        completingIdx.value = null
      }
    }

    // 欢迎语：非空消息即进入对话
    const ensureGreeting = () => {
      if (messages.value.length === 0) {
        messages.value.push({
          role: 'teacher',
          text: '你好！我是你的专属 AI 教师。你可以跟我聊聊想学的学科/知识点，也可以告诉我你的偏好（例如「记住：最喜欢的学科=数学」），我会放进长期记忆，一直陪伴你的学习。'
        })
      }
    }

    const onSend = async () => {
      const content = draft.value.trim()
      if (!content || loading.value) return
      ensureGreeting()
      messages.value.push({ role: 'user', text: content })
      draft.value = ''
      loading.value = true
      await scrollToBottom()

      const res = await sendAgentMessage(content, useUserStore().subject) // subject 兜底：AI 教师感知所选学科
      loading.value = false

      const reply = String(res?.message || content).trim()
      messages.value.push({ role: 'teacher', text: reply })
      await Promise.all([scrollToBottom(), loadMemory()])
    }

    // 输入框在 H5 回车后可复位滚动（多端兼容）
    const onInputHeight = () => {}

    onShow(async () => {
      // 并行：起教师 + 读记忆 + 探运营身份 + 拉只读学情 + 拉我的学习计划
      const [, , c] = await Promise.all([open(), loadMemory(), adminCapability(), loadInsights(), loadPlans()])
      isOperator.value = !!c.isOperator
    })

    // 复习序列每道的推荐原因徽标（SM-2 到期 + 短期答错 + 掌握度缺口，让学生看懂"为什么推荐这道"）
    const reviewBadges = (q) => {
      const b = []
      if (q.recentWrong) b.push('⚡刚答错')
      if (typeof q.dueDays === 'number' && q.dueDays <= 0) b.push('📅今日到期')
      else if (typeof q.dueDays === 'number' && q.dueDays > 0 && q.dueDays <= 3) b.push(`📅${q.dueDays}天后`)
      if (typeof q.masteryPct === 'number' && q.masteryPct <= 50) b.push('🔻掌握度低')
      return b.slice(0, 3)
    }

    // 复习冲刺会话：开题、自动推进、跳过、收尾、退出
    const startReview = async () => {
      const r = await getAgentReviewSequence(10)
      const deck = (r && r.questions) || []
      if (!deck.length) {
        gradingMsg.value = '暂没有待复习题目，先去做几道题吧。'
        return
      }
      reviewDeck.value = deck
      reviewIdx.value = 0
      reviewSession.value = true
      reviewFinished.value = false
      reviewCorrect.value = 0
      reviewSkipped.value = 0
      reviewHadWrong.value = []
      startAnswer(deck[0])
    }
    const advanceReview = () => {
      reviewIdx.value += 1
      if (reviewIdx.value >= reviewDeck.value.length) {
        finishReview()
        return
      }
      startAnswer(reviewDeck.value[reviewIdx.value])
    }
    const finishReview = () => {
      reviewFinished.value = true
      reviewIdx.value = reviewDeck.value.length
      activeQ.value = null
      answerDraft.value = ''
      grading.value = false
      loadInsights() // 掌握度/错题实时刷新
    }
    const skipReview = () => {
      if (!reviewSession.value || reviewFinished.value) return
      reviewSkipped.value++
      activeQ.value = null
      answerDraft.value = ''
      grading.value = false
      advanceReview()
    }
    // 专项练习：针对选中的一个知识点,抽一组题连练（复用复习冲刺的题组/判题/自动推进）。
    // 判题/落库/错题/消错题/SM-2 副作用统一走 gradeAgentAnswer —— 与复习冲刺同一条判读管线。
    const startKpDrill = async (kp) => {
      drillKp.value = null
      const r = await getAgentKpQuestions(kp.kpId, 6)
      const deck = (r && r.questions) || []
      if (!deck.length) {
        gradingMsg.value = '该知识点还没有练习题，换个知识点或去找 AI 教师聊聊。'
        return
      }
      reviewDeck.value = deck.map((q) => ({ questionId: q.questionId, content: q.content, kpName: kp.kpName, difficulty: q.difficulty }))
      reviewIdx.value = 0
      reviewSession.value = true
      reviewFinished.value = false
      reviewCorrect.value = 0
      reviewSkipped.value = 0
      reviewHadWrong.value = []
      drillKp.value = { kpName: kp.kpName, kpId: kp.kpId }
      startAnswer(reviewDeck.value[0])
    }
    const startDrillAgain = () => {
      if (drillKp.value) startKpDrill({ kpId: drillKp.value.kpId, kpName: drillKp.value.kpName })
    }
    const exitReview = () => {
      reviewSession.value = false
      reviewFinished.value = false
      reviewDeck.value = []
      reviewIdx.value = 0
      reviewCorrect.value = 0
      reviewSkipped.value = 0
      reviewHadWrong.value = []
      drillKp.value = null
      cancelAnswer()
      loadInsights()
    }

    // ===== 授课卡：lesson.current 状态机驱动一节课（摸底→讲解→例题→再练→完成），判题走 lesson.submit =====
    const openWeakestLesson = async (reuse = true) => {
      const kp = weakestKp.value
      if (!kp) {
        uni.showToast({ title: '还没有作答数据，先聊几道题', icon: 'none' })
        return
      }
      await openLesson(kp)
    }
    const openLesson = async (kp) => {
      // 与复习冲刺互斥：开课先关掉冲刺会话（仅本地复位，不重拉）
      reviewSession.value = false
      reviewFinished.value = false
      reviewDeck.value = []
      reviewIdx.value = 0
      reviewCorrect.value = 0
      reviewSkipped.value = 0
      reviewHadWrong.value = []
      drillKp.value = null
      lessonKp.value = { kpId: kp.kpId, kpName: kp.kpName }
      lessonSession.value = true
      lessonFinished.value = false
      lessonMode.value = false
      cancelAnswer()
      await lessonFetch('assess')
      loadInsights() // 开课即刷新真实学情，作摸底依据
    }
    const lessonFetch = async (stage) => {
      lessonBusy.value = true
      try {
        const res = await getAgentLesson(lessonKp.value.kpId, stage)
        lesson.value = res && res.success !== false ? res : {}
        lessonStage.value = (res && res.stage) || (res && res.success === false ? 'error' : stage)
        if (res && res.success === false) gradingMsg.value = res.error || '上课失败'
      } finally {
        lessonBusy.value = false
      }
    }
    const lessonGo = async (stage) => {
      if (!lessonSession.value || lessonBusy.value) return
      gradingMsg.value = ''
      if (stage === 'drill') {
        // 进入再练：拉 drill 真题并弹起共用作答条（提交走 lesson.submit，答对即收束）
        await lessonFetch('drill')
        const q = lesson.value && lesson.value.questionId ? lesson.value : null
        if (!q) return
        lessonMode.value = true
        startAnswer({ questionId: q.questionId, content: q.content, kpName: lessonKp.value.kpName, difficulty: q.difficulty })
        return
      }
      if (stage === 'example' || stage === 'teach') lessonMode.value = false
      await lessonFetch(stage)
    }
    const submitLessonAnswer = async (answer, timeNote) => {
      try {
        const res = await getAgentLessonSubmit(lessonKp.value.kpId, activeQ.value.questionId, answer)
        lesson.value = res && res.success !== false ? res : {}
        grading.value = false
        if (res && res.isCorrect) {
          // 答对 → 后端已把状态推成 complete，前端随之收束
          lessonStage.value = 'complete'
          lessonFinished.value = true
          lessonMode.value = false
          const bump = typeof res.delta === 'number' ? ` · 掌握度 ${res.baseline != null ? res.baseline + '%' : ''}→${res.practiceMastery}%（${res.delta >= 0 ? '+' : ''}${res.delta}）` : ''
          gradingMsg.value = '✅ ' + (res.hint || '这节课完成！') + bump + timeNote
          activeQ.value = null
          answerDraft.value = ''
          loadInsights()
          loadPlans() // 答对落盘后,上课记录卡实时出现新的一节
        } else if (res && res.success) {
          // 答错 → 留在再练并提示本次错法；后端建议回讲(suggestedNext:'teach') → 自动跳 teach 专讲这次的错。
          // 只 lessonFetch 渲染（不动 lessonGo：保留 lessonMode/作答条/错法提示，学生读完直接在下方再答，仍走 lesson.submit）。
          lessonStage.value = 'drill'
          lessonMode.value = true
          const wrong = res.wrongAnswer ? `你的答案「${res.wrongAnswer}」不对。` : ''
          gradingMsg.value = '❌ ' + (res.hint || '') + (wrong ? ' ' + wrong : '') + timeNote
          answerDraft.value = ''
          if (res.suggestedNext === 'teach') await lessonFetch('teach')
        } else {
          gradingMsg.value = (res && res.error) || '判题失败，请稍后再试。'
        }
      } catch (e) {
        grading.value = false
        gradingMsg.value = '判题失败，请稍后再试。'
      }
    }
    const exitLesson = () => {
      lessonSession.value = false
      lessonFinished.value = false
      lessonBusy.value = false
      lessonKp.value = null
      lessonStage.value = ''
      lesson.value = null
      lessonMode.value = false
      cancelAnswer()
      loadInsights()
    }

    return {
      messages,
      draft,
      loading,
      status,
      skills,
      tools,
      facts,
      scrollAnchor,
      headerActions,
      overview,
      wrongBook,
      reviewSeq,
      reviewBadges,
      kpDelta,
      kpDeltaText,
      kpDeltaClass,
      insightsLoading,
      loadInsights,
      activeQ,
      answerDraft,
      grading,
      gradingMsg,
      startAnswer,
      cancelAnswer,
      submitAnswer,
      reviewSession,
      reviewFinished,
      reviewDeck,
      reviewIdx,
      reviewCorrect,
      reviewSkipped,
      reviewHadWrong,
      currentReviewQ,
      reviewRate,
      startReview,
      startKpDrill,
      startDrillAgain,
      drillKp,
      reviewTitleFull,
      skipReview,
      exitReview,
      lessonSession,
      lessonFinished,
      lessonBusy,
      lessonKp,
      lessonStage,
      lesson,
      lessonMode,
      weakestKp,
      stageLabel,
      openWeakestLesson,
      lessonGo,
      exitLesson,
      plans,
      planLoading,
      completingIdx,
      activePlan,
      lessonHistory,
      lessonOutcomeText,
      planTasks,
      loadPlans,
      completeTask,
      prettifyKey,
      forgetFact,
      forgetting,
      onSend,
      onInputHeight
    }
  }
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: var(--color-bg-primary, #f7f8fa);
  display: flex;
  flex-direction: column;
}

/* 教师状态卡 */
.teacher-card {
  margin: 12px 16px;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  background: #fff;
  border-radius: 16px;
  border: 1px solid var(--color-border, #e8e8f0);
  box-shadow: 0 4px 16px rgba(74, 108, 247, 0.08);
  background: linear-gradient(135deg, #4a6cf7 0%, #7c94ff 100%);
}

.teacher-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.22);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  flex-shrink: 0;
}

.teacher-meta {
  flex: 1;
  min-width: 0;
}

.teacher-title {
  display: block;
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  margin-bottom: 2px;
}

.teacher-sub {
  display: block;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.9);
  margin-bottom: 8px;
}

.chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

/* 记忆条 */
.memory-section {
  margin: 0 16px 12px;
  background: #fff;
  border-radius: 14px;
  padding: 12px 14px;
  border: 1px solid var(--color-border, #e8e8f0);
}

/* 学情总览 */
.insights-card {
  margin: 0 16px 12px;
  background: #fff;
  border-radius: 14px;
  padding: 12px 14px;
  border: 1px solid var(--color-border, #e8e8f0);
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.refresh {
  font-size: 12px;
  color: #4a6cf7;
}
.insight-empty {
  font-size: 12px;
  color: #999;
  padding: 6px 0;
}
.kp-bars {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.kp-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.kp-name {
  width: 92px;
  font-size: 12px;
  color: #333;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  flex-shrink: 0;
}
.kp-track {
  flex: 1;
  height: 8px;
  background: #f0f0f5;
  border-radius: 4px;
  overflow: hidden;
}
.kp-fill {
  height: 100%;
  background: linear-gradient(135deg, #4a6cf7 0%, #7c94ff 100%);
  border-radius: 4px;
}
.kp-mastery {
  width: 38px;
  font-size: 12px;
  font-weight: 700;
  color: #4a6cf7;
  text-align: right;
  flex-shrink: 0;
}
.kp-delta {
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
  min-width: 26px;
  text-align: right;
}
.kp-delta.up {
  color: #52c41a;
}
.kp-delta.down {
  color: #f5222d;
}
.kp-delta.flat {
  color: #bbb;
  font-weight: 400;
}
.kp-count {
  min-width: 44px;
  font-size: 11px;
  color: #999;
  text-align: right;
  flex-shrink: 0;
}
.kp-time {
  color: #b98;
  font-weight: 400;
}
.kp-drill {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  color: #4a6cf7;
  background: #eef1fe;
  border-radius: 8px;
  padding: 3px 8px;
}
.kp-drill:active { opacity: 0.7; }
.insight-stats {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  flex-wrap: wrap;
}
.stat-chip {
  font-size: 12px;
  color: #555;
  background: #f5f6fb;
  padding: 3px 8px;
  border-radius: 6px;
}
.stat-chip b {
  color: #4a6cf7;
}
.sub-block {
  margin-top: 12px;
  border-top: 1px dashed #eee;
  padding-top: 10px;
}
.sub-title {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #722ed1;
  margin-bottom: 6px;
}
.wq-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}
.wq-n {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #4a6cf7;
  color: #fff;
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.wq-content {
  flex: 1;
  font-size: 12px;
  color: #333;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.wq-kp {
  font-size: 11px;
  color: #999;
  flex-shrink: 0;
}
.rv-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}
.rv-badge {
  font-size: 11px;
  line-height: 1.2;
  color: #7c5cf0;
  background: #f1ecff;
  border-radius: 8px;
  padding: 2px 7px;
  flex-shrink: 0;
}
/* 复习冲刺会话 */
.sprint-start {
  margin-top: 8px;
  border-top: 1px dashed #eee;
  padding-top: 8px;
}
.sprint-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.sprint-q {
  background: #fbfaff;
  border: 1px solid #eee6ff;
  border-radius: 10px;
  padding: 10px 12px;
  margin-top: 4px;
}
.sprint-text {
  display: block;
  font-size: 13px;
  color: #222;
  line-height: 1.6;
}
.sprint-answer {
  display: inline-block;
  margin-top: 8px;
  font-size: 12px;
  font-weight: 600;
  color: #722ed1;
  background: #f1ecff;
  padding: 3px 10px;
  border-radius: 6px;
}
.sprint-tip {
  display: block;
  margin-top: 8px;
  font-size: 11px;
  color: #999;
}
.sprint-recap {
  padding: 6px 2px;
}
.recap-title {
  display: block;
  font-size: 15px;
  font-weight: 700;
  color: #52c41a;
  margin-bottom: 6px;
}
.recap-sub {
  display: block;
  font-size: 12px;
  color: #555;
  line-height: 1.6;
}
.sprint-actions {
  display: flex;
  gap: 16px;
  margin-top: 10px;
}
.redo {
  font-size: 12px;
  color: #4a6cf7;
  font-weight: 600;
  flex-shrink: 0;
  padding: 2px 6px;
}
.answer-bar {
  margin-top: 10px;
  border-top: 1px dashed #eee;
  padding-top: 10px;
}
.answer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.answer-input-row {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  align-items: center;
}
.answer-input {
  flex: 1;
  height: 38px;
  background: #f5f6fb;
  border-radius: 8px;
  padding: 0 12px;
  font-size: 13px;
  color: #333;
}
.answer-btn {
  height: 38px;
  padding: 0 16px;
  background: linear-gradient(135deg, #4a6cf7 0%, #7c94ff 100%);
  color: #fff;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}
.answer-btn.disabled {
  opacity: 0.6;
}
.grading-msg {
  display: block;
  margin-top: 8px;
  font-size: 12px;
  color: #555;
  line-height: 1.5;
}
/* 我的 AI 学习计划 */
.plan-progress {
  font-size: 14px;
  font-weight: 700;
  color: #52c41a;
}
.plan-title {
  display: block;
  font-size: 14px;
  font-weight: 700;
  color: #222;
  margin-bottom: 8px;
}
.plan-track {
  height: 8px;
  background: #f0f0f5;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 10px;
}
.plan-fill {
  height: 100%;
  background: linear-gradient(135deg, #52c41a 0%, #85e07a 100%);
  border-radius: 4px;
}
.plan-tasks {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.plan-task {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
}
.plan-task-title {
  flex: 1;
  font-size: 12px;
  color: #333;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.plan-do {
  font-size: 12px;
  font-weight: 600;
  color: #52c41a;
  flex-shrink: 0;
  padding: 2px 6px;
}
.plan-done {
  font-size: 11px;
  color: #aaa;
  flex-shrink: 0;
}

.section-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #722ed1;
  margin-bottom: 8px;
}

.memory-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.memory-item {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #f6f6fb;
  border-radius: 10px;
  padding: 6px 10px;
  font-size: 12px;
}

.mem-key {
  font-weight: 600;
  color: #1a1a2e;
}

.mem-val {
  color: #666;
}

.mem-hint {
  font-size: 11px;
  color: #aaa;
  font-weight: 400;
}

.mem-forget {
  margin-left: auto;
  font-size: 14px;
  color: #bbb;
  padding: 0 2px;
  flex-shrink: 0;
}
.mem-forget.busy {
  color: #4a6cf7;
}

/* 对话区 */
.chat-scroll {
  flex: 1;
  min-height: 200px;
}

.chat-body {
  padding: 12px 16px 24px;
}

.chat-empty {
  padding: 40px 0;
}

.msg-row {
  display: flex;
  margin-bottom: 14px;
}

.msg-row.from-user {
  justify-content: flex-end;
}

.msg-row.from-teacher {
  justify-content: flex-start;
}

.bubble {
  max-width: 78%;
  padding: 12px 14px;
  border-radius: 16px;
  font-size: 15px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.bubble.user {
  background: #4a6cf7;
  color: #fff;
  border-bottom-right-radius: 4px;
}

.bubble.teacher {
  background: #fff;
  color: #1a1a2e;
  border: 1px solid var(--color-border, #e8e8f0);
  border-bottom-left-radius: 4px;
}

.bubble.typing {
  color: #999;
  font-style: italic;
}

/* 输入区 */
.input-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  padding-bottom: calc(10px + env(safe-area-inset-bottom));
  background: #fff;
  border-top: 1px solid var(--color-border, #e8e8f0);
}

.chat-input {
  flex: 1;
  height: 42px;
  background: var(--color-bg-secondary, #f0f0f5);
  border-radius: 22px;
  padding: 0 16px;
  font-size: 15px;
  color: #1a1a2e;
}

.send-btn {
  height: 42px;
  padding: 0 22px;
  line-height: 42px;
  background: #4a6cf7;
  color: #fff;
  font-size: 15px;
  border-radius: 22px;
  border: none;
  margin: 0;
}

.send-btn[disabled] {
  opacity: 0.5;
}

/* 授课卡 */
.lesson-intro {
  display: block;
  font-size: 12px;
  color: #666;
  line-height: 1.6;
}
.lesson-intro b {
  color: #722ed1;
}
.lesson-go {
  display: inline-block;
  margin-top: 8px;
  background: linear-gradient(135deg, #4a6cf7 0%, #7c94ff 100%);
  color: #fff;
  font-weight: 700;
  font-size: 12px;
  padding: 6px 14px;
  border-radius: 8px;
}
.lesson-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.lesson-kp {
  font-size: 14px;
  font-weight: 700;
  color: #222;
}
.lesson-stage {
  font-size: 11px;
  color: #722ed1;
  background: #f1ecff;
  border-radius: 8px;
  padding: 2px 8px;
}
.lesson-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.lesson-line {
  font-size: 13px;
  color: #333;
  line-height: 1.6;
}
.lesson-line b {
  color: #722ed1;
}
.lesson-wrong {
  font-size: 14px;
  font-weight: 700;
  color: #f5222d;
  background: #fff2f0;
  border: 1px solid #ffd4d0;
  border-radius: 8px;
  padding: 8px 10px;
}
.lesson-example {
  font-size: 15px;
  font-weight: 600;
  color: #1a1a2e;
  background: #fbfaff;
  border: 1px solid #eee6ff;
  border-radius: 10px;
  padding: 10px 12px;
  line-height: 1.6;
}
.lesson-cta {
  align-self: flex-start;
  margin-top: 6px;
  font-size: 12px;
  font-weight: 700;
  color: #4a6cf7;
}
.lesson-tip {
  font-size: 11px;
  color: #999;
}
/* 上课历史 */
.lh-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
  flex-wrap: wrap;
}
.lh-title {
  font-size: 12px;
  font-weight: 600;
  color: #333;
}
.lh-outcome {
  font-size: 11px;
  border-radius: 8px;
  padding: 2px 7px;
  flex-shrink: 0;
}
.lh-outcome.up {
  color: #52c41a;
  background: #f0fbe6;
}
.lh-outcome.down {
  color: #999;
  background: #f5f5f5;
}
.lh-delta {
  font-size: 11px;
  font-weight: 700;
  color: #52c41a;
}
.lh-meta {
  font-size: 11px;
  color: #999;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .page {
    background: var(--color-bg-primary, #1a1a2e);
  }

  .memory-section,
  .bubble.teacher,
  .input-bar {
    background: var(--color-bg-card, #252542);
    border-color: var(--color-border, #3d3d5c);
  }

  .memory-item {
    background: var(--color-bg-elevated, #2d2d4a);
  }

  .mem-key,
  .bubble.teacher {
    color: var(--color-text-primary, #e8e8f0);
  }

  .mem-val {
    color: var(--color-text-tertiary, #888);
  }

  .chat-input {
    background: var(--color-bg-elevated, #2d2d4a);
    color: var(--color-text-primary, #e8e8f0);
  }
}
</style>