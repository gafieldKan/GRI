<template>
  <ErrorBoundary :showDetails="true" :logError="true">
    <view class="report-container">
      <!-- 刷新按钮 -->
      <view class="refresh-bar">
        <text class="report-title">学情报告</text>
        <t-button size="small" variant="outline" @click="refresh">
          刷新
        </t-button>
        <!-- 导出 PDF 仅 H5（后端无 PDF 端点，小程序无 fetch 无端点必失败） -->
        <!-- #ifdef H5 -->
        <t-button size="small" variant="primary" @click="exportPDF">
          导出 PDF
        </t-button>
        <!-- #endif -->
      </view>

      <!-- 加载骨架屏 -->
      <LoadingSkeleton v-if="loading" variant="card" rows="5" />

      <!-- 整体掌握度 -->
      <view v-else class="mastery-card">
      <view class="mastery-header">
        <text class="card-title">整体掌握度</text>
        <text class="update-time">更新于：{{ lastUpdateTime }}</text>
      </view>
      <view class="mastery-content">
        <view class="mastery-score">
          <text class="score-value">{{ masteryScore }}</text>
          <text class="score-label">分</text>
        </view>
        <view class="mastery-progress">
          <t-progress
            :percentage="masteryScore"
            :color="progressColor"
          ></t-progress>
        </view>
        <view class="mastery-level">
          <t-tag :theme="masteryLevelTheme">
            {{ masteryLevelText }}
          </t-tag>
        </view>
      </view>
    </view>

    <!-- 知识点雷达图 -->
    <view class="radar-card">
      <view class="card-header">
        <text class="card-title">知识点掌握分析</text>
      </view>
      <view class="radar-content">
        <canvas
          canvas-id="radarCanvas"
          id="radarCanvas"
          class="radar-canvas"
          @touchstart="noop"
        ></canvas>
      </view>
    </view>

    <!-- 学习统计 -->
    <view class="stats-card">
      <view class="card-header">
        <text class="card-title">学习统计</text>
      </view>
      <view class="stats-content">
        <view class="stat-item">
          <text class="stat-value">{{ stats.studyDays }}</text>
          <text class="stat-label">学习天数</text>
        </view>
        <view class="stat-item">
          <text class="stat-value">{{ stats.totalQuestions }}</text>
          <text class="stat-label">总题目</text>
        </view>
        <view class="stat-item">
          <text class="stat-value">{{ stats.correctRate }}%</text>
          <text class="stat-label">正确率</text>
        </view>
        <view class="stat-item">
          <text class="stat-value">{{ stats.improvement }}%</text>
          <text class="stat-label">进步幅度</text>
        </view>
      </view>
    </view>

    <!-- 薄弱知识点 -->
    <view class="weakness-card">
      <view class="card-header">
        <text class="card-title">薄弱知识点</text>
        <t-button size="small" theme="primary" @click="goToPractice">
          专项练习
        </t-button>
      </view>
      <view class="weakness-list">
        <view
          v-for="(item, index) in weaknessList"
          :key="index"
          class="weakness-item"
        >
          <view class="weakness-info">
            <text class="weakness-name">{{ item.name }}</text>
            <text class="weakness-reason">{{ item.reason }}</text>
          </view>
          <t-tag :theme="getWeaknessTheme(item.mastery)">
            {{ item.mastery }}%
          </t-tag>
        </view>
      </view>
    </view>

    <!-- 学习建议 -->
    <ErrorBoundary :showDetails="true" :logError="true">
      <view class="suggestion-card">
        <view class="card-header">
          <text class="card-title">AI 学习建议</text>
        </view>
        <view class="suggestion-content">
          <text class="suggestion-text">{{ suggestionText }}</text>
        </view>
      </view>
      <template #fallback>
        <EmptyState
          title="建议加载失败"
          description="无法获取学习建议，请稍后重试"
          icon="💡"
          :actions="[{ label: '重试', handler: refresh }]"
        />
      </template>
    </ErrorBoundary>
  </view>
  </ErrorBoundary>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getReport, getWrongQuestionList, getAgentDiagnosis } from '../../api/index.js'
import { useUserStore } from '@/store/user'
import LoadingSkeleton from '@/components/ui/LoadingSkeleton.vue'
import ErrorBoundary from '@/components/ErrorBoundary.vue'
import EmptyState from '@/components/ui/EmptyState.vue'

const lastUpdateTime = ref('')
const masteryScore = ref(0)
const stats = ref({
  studyDays: 0,
  totalQuestions: 0,
  correctRate: 0,
  improvement: 0
})
const weaknessList = ref([])
const suggestionText = ref('')
const knowledgeMasteryList = ref([])

// 雷达图绘制（Canvas 2D 自绘五维能力图）
const drawRadar = (abilityDims) => {
  // 使用 uni.createSelectorQuery 统一处理 H5 和小程序
  const query = uni.createSelectorQuery()
  query.select('#radarCanvas').fields({ node: true, size: true })
  query.exec((res) => {
    if (!res || !res[0] || !res[0].node) {
      console.warn('[Report] Canvas not ready')
      return
    }

    const canvas = res[0].node
    const ctx = canvas.getContext('2d')
    const width = res[0].width
    const height = res[0].height

    // 设置 canvas 实际绘制尺寸（考虑 dpr）
    const dpr = uni.getSystemInfoSync().pixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)

    _draw(ctx, { width, height }, abilityDims)
  })
}

const _draw = (ctx, canvas, abilityDims) => {
  const w = canvas.width
  const h = canvas.height
  const cx = w / 2
  const cy = h / 2
  const r = Math.min(w, h) * 0.35
  const labels = ['记忆', '理解', '应用', '分析', '综合']
  const keys = ['memory', 'understanding', 'application', 'analysis', 'synthesis']
  const count = labels.length
  const angleStep = (Math.PI * 2) / count

  // 清空画布
  ctx.clearRect(0, 0, w, h)

  // 绘制背景网格
  for (let level = 1; level <= 4; level++) {
    ctx.beginPath()
    for (let i = 0; i < count; i++) {
      const angle = angleStep * i - Math.PI / 2
      const rr = r * (level / 4)
      const x = cx + rr * Math.cos(angle)
      const y = cy + rr * Math.sin(angle)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.strokeStyle = '#e0e0e0'
    ctx.stroke()
  }

  // 绘制轴线
  for (let i = 0; i < count; i++) {
    const angle = angleStep * i - Math.PI / 2
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle))
    ctx.strokeStyle = '#e0e0e0'
    ctx.stroke()
  }

  // 绘制数据区域
  ctx.beginPath()
  for (let i = 0; i < count; i++) {
    const val = abilityDims?.[keys[i]] || 0.5
    const angle = angleStep * i - Math.PI / 2
    const rr = r * val
    const x = cx + rr * Math.cos(angle)
    const y = cy + rr * Math.sin(angle)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fillStyle = 'rgba(102, 126, 234, 0.3)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(102, 126, 234, 0.8)'
  ctx.lineWidth = 2
  ctx.stroke()

  // 绘制标签和数值
  ctx.font = '11px sans-serif'
  ctx.fillStyle = '#333'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (let i = 0; i < count; i++) {
    const val = abilityDims?.[keys[i]] || 0.5
    const angle = angleStep * i - Math.PI / 2
    const labelR = r + 24
    const lx = cx + labelR * Math.cos(angle)
    const ly = cy + labelR * Math.sin(angle)
    const text = `${labels[i]} ${Math.round(val * 100)}%`
    ctx.fillText(text, lx, ly)
  }
}

const noop = () => {}

// 进度条颜色
const progressColor = computed(() => {
  if (masteryScore.value < 60) return '#ff4d4f'
  if (masteryScore.value < 80) return '#faad14'
  return '#52c41a'
})

// 等级主题
const masteryLevelTheme = computed(() => {
  if (masteryScore.value < 60) return 'danger'
  if (masteryScore.value < 80) return 'warning'
  return 'success'
})

// 等级文本
const masteryLevelText = computed(() => {
  if (masteryScore.value < 60) return '待提升'
  if (masteryScore.value < 80) return '良好'
  return '优秀'
})

// 薄弱知识点主题
const getWeaknessTheme = (mastery) => {
  if (mastery < 60) return 'danger'
  if (mastery < 80) return 'warning'
  return 'success'
}

// 刷新数据
const refresh = async () => {
  uni.showLoading({ title: '刷新中...' })

  try {
    // Load report from backend
    // ⚠️ getReport 返回单对象（analysis/report/latest 端点回 res.rows[0]，无报告抛 404 → []），
    // 不是数组 —— 旧代码判断 reports.length > 0 恒 undefined → reportData 恒 null → 整页全 0
    //（有 exam 报告也不显示，报告页"全空"的真正根因）。
    const report = await getReport(useUserStore().studentId)
    let reportData = null

    if (report && report.id) {
      // Use the most recent report and map backend JSONB format
      const latestReport = report
      const kp = latestReport.knowledge_points || []
      const suggestions = latestReport.ai_suggestions || []
      const abilityDims = latestReport.ability_dims || null

      reportData = {
        stats: {
          studyDays: 0,
          totalQuestions: kp.reduce((s, k) => s + (k.totalQuestions || k.total_questions || 0), 0),
          correctRate: Math.round((latestReport.student_score || 0) * 100),
          improvement: 0
        },
        masteryByKnowledge: kp.map(k => ({
          name: k.name,
          mastery: Math.round((k.mastery || 0) * 100),
          totalQuestions: k.totalQuestions || k.total_questions || 0,
          correctAnswers: k.correctCount || k.correct_count || 0
        })),
        suggestions: suggestions.map(s => typeof s === 'string' ? { content: s } : s),
        abilityDims,
        generatedAt: latestReport.created_at || new Date().toISOString()
      }
    }

    // Also try to load wrong question data for weakness analysis
    let wrongQuestions = []
    try {
      const wrongData = await getWrongQuestionList(useUserStore().studentId, false)
      wrongQuestions = wrongData.wrongQuestions || []
    } catch (e) {
      console.log('[Report] Wrong question data not available')
    }

    // 报告线接真数：analysis_reports 只有 exam 流水线才写（exam/upload→TutorAgent），
    // 只在聊天/面板做题的学生其报告要么空要么陈旧。真掌握度在 /api/agent/me/diagnosis
    // （diagnosis.state 每次 UPSERT mastery_snapshots，0-100 按 kpName）。此处融合：
    // 按名称覆盖/合并进 masteryByKnowledge，无 exam 报告时直接用真数生成一份。
    try {
      const d = await getAgentDiagnosis()
      const realKps = Array.isArray(d?.knowledgePoints) ? d.knowledgePoints : []
      if (realKps.length > 0) {
        const realList = realKps.map(kp => ({
          name: kp.kpName,
          mastery: kp.mastery || 0,
          totalQuestions: kp.attempts || 0,
          correctAnswers: kp.correct || 0
        }))
        if (reportData && Array.isArray(reportData.masteryByKnowledge)) {
          // 有 exam 报告：按名称合并（同名以真数覆盖，真数独有的追加）
          const byName = new Map(reportData.masteryByKnowledge.map(k => [k.name, { ...k }]))
          realList.forEach(rk => byName.set(rk.name, rk))
          reportData.masteryByKnowledge = [...byName.values()]
          // 总题数/正确率同步真数（student_score 是 exam 口径 0-1，作答口径更实时）
          if (reportData.stats) {
            const total = reportData.masteryByKnowledge.reduce((s, k) => s + (k.totalQuestions || 0), 0)
            const correct = reportData.masteryByKnowledge.reduce((s, k) => s + (k.correctAnswers || 0), 0)
            reportData.stats.totalQuestions = total
            reportData.stats.correctRate = total > 0 ? Math.round((correct / total) * 100) : reportData.stats.correctRate
          }
        } else {
          // 无 exam 报告：真数直接生成一份（报告页不再空）
          reportData = {
            stats: {
              studyDays: 0,
              totalQuestions: realList.reduce((s, k) => s + (k.totalQuestions || 0), 0),
              correctRate: realList.length > 0
                ? Math.round(realList.reduce((s, k) => s + k.mastery, 0) / realList.length)
                : 0,
              improvement: 0
            },
            masteryByKnowledge: realList,
            suggestions: [],
            abilityDims: null,
            generatedAt: new Date().toISOString()
          }
        }
      }
    } catch (e) {
      console.error('[Report] Load real diagnosis failed:', e)
    }

    if (reportData && reportData.stats) {
      stats.value = {
        studyDays: reportData.stats.studyDays || 0,
        totalQuestions: reportData.stats.totalQuestions || 0,
        correctRate: reportData.stats.correctRate || 0,
        improvement: reportData.stats.improvement || 0
      }
    }

    if (reportData && reportData.masteryByKnowledge) {
      knowledgeMasteryList.value = reportData.masteryByKnowledge
      // Calculate overall mastery from knowledge point mastery
      const avgMastery = reportData.masteryByKnowledge.length > 0
        ? Math.round(reportData.masteryByKnowledge.reduce((s, k) => s + k.mastery, 0) / reportData.masteryByKnowledge.length)
        : reportData.stats?.correctRate || 0
      masteryScore.value = avgMastery

      // Build weakness list from mastery data + wrong questions
      weaknessList.value = reportData.masteryByKnowledge
        .filter(k => k.mastery < 60)
        .map(k => ({
          name: k.name,
          reason: `正确率 ${k.mastery}%，${k.totalQuestions}题中仅对${k.correctAnswers}题`,
          mastery: k.mastery
        }))
    }

    // Fall back to wrong question analysis if no mastery data
    if (weaknessList.value.length === 0 && wrongQuestions.length > 0) {
      weaknessList.value = wrongQuestions.slice(0, 5).map(w => ({
        name: w.knowledgePoint || w.subject || '未知知识点',
        reason: w.errorType || '掌握不稳定',
        mastery: 50
      }))
    }

    // Build suggestions from report or generate from data
    if (reportData && reportData.suggestions && reportData.suggestions.length > 0) {
      suggestionText.value = reportData.suggestions
        .map(s => s.content)
        .join('\n')
    } else if (weaknessList.value.length > 0) {
      suggestionText.value = `你在以下知识点上需要加强：${weaknessList.value.map(w => w.name).join('、')}。建议每天花15分钟进行专项练习。`
    } else {
      suggestionText.value = '当前没有足够的学习数据来生成详细建议。继续完成更多练习以获得个性化建议。'
    }

    lastUpdateTime.value = new Date().toLocaleTimeString()

    uni.showToast({ title: '刷新成功', icon: 'success' })
    // 绘制雷达图
    setTimeout(() => drawRadar(reportData?.abilityDims), 300)
  } catch (error) {
    console.error('刷新失败:', error)
    // Show last known data or defaults
    uni.showToast({ title: '获取数据失败', icon: 'none' })
  } finally {
    uni.hideLoading()
  }
}

const goToPractice = () => {
  uni.navigateTo({ url: '/pages/practice/index' })
}

// 导出 PDF —— 后端无 /report/pdf 端点、无 PDF 库，走浏览器打印（打印对话框自带另存为 PDF）
const exportPDF = async () => {
  // #ifdef H5
  window.print()
  // #endif
}

onMounted(() => {
  refresh()
})
</script>

<style scoped>
.report-container {
  min-height: 100vh;
  background: #f5f5f5;
  padding: 16px;
}

.refresh-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.report-title {
  font-size: 20px;
  font-weight: 600;
  color: #333;
}

/* 卡片通用样式 */
.mastery-card,
.radar-card,
.stats-card,
.weakness-card,
.suggestion-card {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.update-time {
  font-size: 12px;
  color: #999;
}

/* 掌握度卡片 */
.mastery-content {
  text-align: center;
}

.mastery-score {
  margin-bottom: 16px;
}

.score-value {
  font-size: 48px;
  font-weight: bold;
  color: #333;
}

.score-label {
  font-size: 14px;
  color: #999;
}

.mastery-level {
  margin-top: 12px;
}

/* 雷达图 */
.radar-content {
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.radar-placeholder {
  text-align: center;
  color: #999;
}

.radar-placeholder .hint {
  display: block;
  font-size: 12px;
  margin-top: 8px;
}

/* 统计卡片 */
.stats-content {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.stat-item {
  text-align: center;
  padding: 12px;
  background: #f5f5f5;
  border-radius: 8px;
}

.stat-value {
  display: block;
  font-size: 24px;
  font-weight: bold;
  color: #667eea;
}

.stat-label {
  display: block;
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}

/* 薄弱知识点 */
.weakness-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.weakness-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: #f5f5f5;
  border-radius: 8px;
}

.weakness-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.weakness-name {
  font-weight: 500;
  color: #333;
}

.weakness-reason {
  font-size: 12px;
  color: #999;
}

/* 学习建议 */
.suggestion-content {
  line-height: 1.8;
  color: #666;
}
</style>
