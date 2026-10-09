<template>
  <view class="report-container">
    <!-- 刷新按钮 -->
    <view class="refresh-bar">
      <text class="report-title">学情报告</text>
      <button size="mini" class="refresh-btn" @click="refresh">
        刷新
      </button>
    </view>

    <!-- 整体掌握度 -->
    <view class="mastery-card">
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
          <progress
            :percent="masteryScore"
            :stroke-width="8"
            activeColor="#1890ff"
            backgroundColor="#e6f2ff"
          ></progress>
        </view>
        <view class="mastery-level">
          <uni-tag :type="masteryLevelType" :text="masteryLevelText" :circle="true"></uni-tag>
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
        <button size="mini" type="primary" class="practice-btn" @click="goToPractice">
          专项练习
        </button>
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
          <uni-tag :type="getWeaknessType(item.mastery)" :text="item.mastery + '%'" :circle="true"></uni-tag>
        </view>
      </view>
    </view>

    <!-- 学习建议 -->
    <view class="suggestion-card">
      <view class="card-header">
        <text class="card-title">AI 学习建议</text>
      </view>
      <view class="suggestion-content">
        <text class="suggestion-text">{{ suggestionText }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getReport, getWrongQuestionList } from '../../api/index.js'
import { useUserStore } from '../../store/user.js'

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

// 雷达图绘制（Canvas 2D 自绘五维能力图，适配小程序和 H5）
const drawRadar = (abilityDims) => {
  // #ifdef H5
  const canvas = document.getElementById('radarCanvas')
  if (!canvas) return
  canvas.width = canvas.offsetWidth
  canvas.height = canvas.offsetHeight
  const ctx = canvas.getContext('2d')
  // #endif
  // #ifdef MP-WEIXIN
  const query = uni.createSelectorQuery()
  query.select('#radarCanvas').boundingClientRect()
  query.exec((res) => {
    if (!res[0]) return
    const canvas = { width: res[0].width, height: res[0].height }
    const ctx = uni.createCanvasContext('radarCanvas')
    _draw(ctx, canvas, abilityDims)
  })
  return
  // #endif
  // #ifdef H5
  _draw(ctx, canvas, abilityDims)
  // #endif
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

  ctx.clearRect?.(0, 0, w, h)

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
    ;(ctx.setStrokeStyle || ((v) => { ctx.strokeStyle = v })).call(ctx, '#e0e0e0')
    ctx.stroke()
  }

  for (let i = 0; i < count; i++) {
    const angle = angleStep * i - Math.PI / 2
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle))
    ;(ctx.setStrokeStyle || ((v) => { ctx.strokeStyle = v })).call(ctx, '#e0e0e0')
    ctx.stroke()
  }

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
  if (ctx.setFillStyle) {
    ctx.setFillStyle('rgba(102, 126, 234, 0.3)')
    ctx.fill()
    ctx.setStrokeStyle('rgba(102, 126, 234, 0.8)')
    ctx.setLineWidth(2)
    ctx.stroke()
  } else {
    ctx.fillStyle = 'rgba(102, 126, 234, 0.3)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(102, 126, 234, 0.8)'
    ctx.lineWidth = 2
    ctx.stroke()
  }

  for (let i = 0; i < count; i++) {
    const val = abilityDims?.[keys[i]] || 0.5
    const angle = angleStep * i - Math.PI / 2
    const labelR = r + 24
    const lx = cx + labelR * Math.cos(angle)
    const ly = cy + labelR * Math.sin(angle)
    const text = `${labels[i]} ${Math.round(val * 100)}%`
    if (ctx.font) {
      ctx.font = '11px sans-serif'
      ctx.fillText(text, lx - ctx.measureText(text).width / 2, ly)
    } else {
      ctx.setFontSize?.(11)
      ctx.fillText?.(text, lx - 20, ly)
    }
  }

  ctx.draw?.()
}

const noop = () => {}

const progressColor = computed(() => {
  if (masteryScore.value < 60) return '#ff4d4f'
  if (masteryScore.value < 80) return '#faad14'
  return '#52c41a'
})

const masteryLevelType = computed(() => {
  if (masteryScore.value < 60) return 'error'
  if (masteryScore.value < 80) return 'warning'
  return 'success'
})

const masteryLevelText = computed(() => {
  if (masteryScore.value < 60) return '待提升'
  if (masteryScore.value < 80) return '良好'
  return '优秀'
})

const getWeaknessType = (mastery) => {
  if (mastery < 60) return 'error'
  if (mastery < 80) return 'warning'
  return 'success'
}

const refresh = async () => {
  uni.showLoading({ title: '刷新中...' })

  try {
    let reportData = null
    try {
      const reports = await getReport(useUserStore().studentId)
      if (reports && reports.length > 0) {
        const latestReport = reports[0]
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
    } catch (e) {
      console.log('[Report] Report data not available')
    }

    let wrongQuestions = []
    try {
      const wrongData = await getWrongQuestionList(useUserStore().studentId, false)
      wrongQuestions = wrongData.wrongQuestions || []
    } catch (e) {
      console.log('[Report] Wrong question data not available')
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
      const avgMastery = reportData.masteryByKnowledge.length > 0
        ? Math.round(reportData.masteryByKnowledge.reduce((s, k) => s + k.mastery, 0) / reportData.masteryByKnowledge.length)
        : reportData.stats?.correctRate || 0
      masteryScore.value = avgMastery

      weaknessList.value = reportData.masteryByKnowledge
        .filter(k => k.mastery < 60)
        .map(k => ({
          name: k.name,
          reason: `正确率 ${k.mastery}%，${k.totalQuestions}题中仅对${k.correctAnswers}题`,
          mastery: k.mastery
        }))
    }

    if (weaknessList.value.length === 0 && wrongQuestions.length > 0) {
      weaknessList.value = wrongQuestions.slice(0, 5).map(w => ({
        name: w.knowledgePoint || w.subject || '未知知识点',
        reason: w.errorType || '掌握不稳定',
        mastery: 50
      }))
    }

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
    setTimeout(() => drawRadar(reportData?.abilityDims), 300)
  } catch (error) {
    console.error('刷新失败:', error)
    uni.showToast({ title: '获取数据失败', icon: 'none' })
  } finally {
    uni.hideLoading()
  }
}

const goToPractice = () => {
  // chat 是 tabBar 页：必须 switchTab（navigateTo 会 fail: can not navigateTo a tabbar page）
  uni.switchTab({ url: '/pages/chat/chat' })
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

.refresh-btn,
.practice-btn {
  margin: 0;
  padding: 0 12px;
  line-height: 2;
  font-size: 12px;
  border-radius: 32rpx;
}

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

.suggestion-content {
  line-height: 1.8;
  color: #666;
}
</style>