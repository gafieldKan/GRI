<template>
  <view class="container">
    <!-- 顶部欢迎区域 -->
    <view class="header">
      <view class="welcome-text">
        <text class="title">智学慧眼</text>
        <text class="subtitle">AI 智能学情分析辅导系统</text>
      </view>
    </view>

    <!-- 功能入口卡片 -->
    <view class="function-grid">
      <!-- AI 互动辅导 -->
      <view class="function-card" @click="goToChat">
        <view class="card-icon icon-ai"></view>
        <text class="card-title">AI 互动辅导</text>
        <text class="card-desc">苏格拉底式启发教学</text>
      </view>

      <!-- 拍照搜题 -->
      <view class="function-card" @click="goToCamera">
        <view class="card-icon icon-camera"></view>
        <text class="card-title">拍照搜题</text>
        <text class="card-desc">拍照立即诊断</text>
      </view>

      <!-- 学情报告 -->
      <view class="function-card" @click="goToReport">
        <view class="card-icon icon-report"></view>
        <text class="card-title">学情报告</text>
        <text class="card-desc">掌握度动态追踪</text>
      </view>

      <!-- 知识点图谱 -->
      <view class="function-card">
        <view class="card-icon icon-map"></view>
        <text class="card-title">知识图谱</text>
        <text class="card-desc">构建知识体系</text>
      </view>
    </view>

    <!-- 学习数据概览 -->
    <view class="stats-card">
      <view class="stats-header">
        <text class="stats-title">学习概览</text>
        <text class="stats-more" @click="goToReport">查看更多 ></text>
      </view>
      <view class="stats-content">
        <view class="stat-item">
          <text class="stat-value">{{ stats.studyDays }}</text>
          <text class="stat-label">学习天数</text>
        </view>
        <view class="stat-item">
          <text class="stat-value">{{ stats.totalQuestions }}</text>
          <text class="stat-label">总题目数</text>
        </view>
        <view class="stat-item">
          <text class="stat-value">{{ stats.accuracyRate }}%</text>
          <text class="stat-label">正确率</text>
        </view>
      </view>
    </view>

    <!-- 推荐学习内容 -->
    <view class="recommend-card">
      <view class="card-header">
        <text class="card-title">今日推荐</text>
      </view>
      <view class="recommend-list">
        <view class="recommend-item">
          <text class="recommend-subject">数学</text>
          <text class="recommend-content">勾股定理的应用</text>
          <text class="recommend-difficulty">难度：⭐⭐⭐</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { getReport, checkHealth } from '../../api/index.js'
import { useUserStore } from '../../store/user.js'

const stats = reactive({
  studyDays: 0,
  totalQuestions: 0,
  accuracyRate: 0,
  improvement: 0
})

const backendOnline = ref(false)

const goToChat = () => {
  uni.navigateTo({ url: '/pages/chat/chat' })
}

const goToCamera = () => {
  uni.navigateTo({ url: '/pages/camera/camera' })
}

const goToReport = () => {
  uni.navigateTo({ url: '/pages/report/report' })
}

const loadStats = async () => {
  try {
    const health = await checkHealth()
    backendOnline.value = true

    try {
      const report = await getReport(useUserStore().studentId)
      if (report && report.length > 0) {
        const latest = report[0]
        stats.studyDays = latest.stats?.studyDays || 0
        stats.totalQuestions = latest.stats?.totalQuestions || 0
        stats.accuracyRate = latest.stats?.correctRate || 0
        stats.improvement = latest.stats?.improvement || 0
        return
      }
    } catch (e) {
      console.log('[Index] Backend report not available, using defaults')
    }
  } catch (e) {
    backendOnline.value = false
    console.log('[Index] Backend offline, using defaults')
  }

  stats.studyDays = 0
  stats.totalQuestions = 0
  stats.accuracyRate = 0
  stats.improvement = 0
}

onMounted(() => {
  loadStats()
})
</script>

<style scoped>
.container {
  padding: 20px;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.header {
  margin-bottom: 24px;
}

.welcome-text {
  color: #fff;
}

.title {
  font-size: 32px;
  font-weight: bold;
  display: block;
}

.subtitle {
  font-size: 14px;
  opacity: 0.9;
  margin-top: 4px;
  display: block;
}

.function-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.function-card {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  text-align: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.card-icon {
  width: 48px;
  height: 48px;
  margin: 0 auto 12px;
  border-radius: 12px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.card-title {
  display: block;
  font-size: 16px;
  font-weight: 500;
  color: #333;
  margin-bottom: 4px;
}

.card-desc {
  display: block;
  font-size: 12px;
  color: #999;
}

.stats-card {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.stats-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.stats-title {
  font-size: 18px;
  font-weight: 600;
  color: #333;
}

.stats-more {
  font-size: 13px;
  color: #667eea;
}

.stats-content {
  display: flex;
  justify-content: space-around;
}

.stat-item {
  text-align: center;
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

.recommend-card {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.card-header {
  margin-bottom: 16px;
}

.card-title {
  font-size: 18px;
  font-weight: 600;
  color: #333;
}

.recommend-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.recommend-item {
  padding: 12px;
  background: #f5f5f5;
  border-radius: 8px;
}

.recommend-subject {
  font-weight: 600;
  color: #667eea;
  margin-right: 8px;
}

.recommend-content {
  color: #333;
  margin: 0 8px;
}

.recommend-difficulty {
  font-size: 12px;
  color: #999;
}
</style>