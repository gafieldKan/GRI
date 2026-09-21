<template>
  <ErrorBoundary :showDetails="true" :logError="true" :fallback="fallbackContent">
    <view class="page">
      <!-- 状态栏占位 -->
      <view class="status-bar" />

      <!-- 主内容区 -->
      <scroll-view class="main-content" scroll-y="true" :scroll-into-view="scrollIntoView">

        <!-- 顶部欢迎卡片 -->
        <view class="welcome-card">
          <view class="welcome-header">
            <view class="user-info">
              <text class="greeting">{{ greeting }}{{ userStore.name }}</text>
              <text class="subtitle">今日学习时长 {{ formatStudyTime(userStore.todayStudyTime) }}</text>
            </view>
            <view class="streak-xp">
              <view class="streak-item">
                <ProgressRing :value="userStore.streak" :max="7" :size="48" :stroke-width="4" color="#faad14" :show-value="false" />
                <view class="streak-label">
                  <text class="streak-value">{{ userStore.streak }}</text>
                  <text class="streak-text">天连续</text>
                </view>
              </view>
              <view class="divider-line" />
              <view class="xp-item">
                <ProgressRing :value="userStore.xpProgress" :max="100" :size="48" :stroke-width="4" :gradient="true" :gradient-colors="xpGradientColors" :show-value="false" />
                <view class="xp-label">
                  <text class="xp-value">{{ userStore.level }}</text>
                  <text class="xp-text">级</text>
                </view>
              </view>
            </view>
          </view>

          <!-- 每日目标进度 -->
          <view class="daily-goal">
            <view class="goal-header">
              <text class="goal-title">每日目标</text>
              <text class="goal-progress">{{ userStore.todayStudyTime }} / {{ userStore.dailyGoal }} 分钟</text>
            </view>
            <ProgressRing
              :value="goalPercentage"
              :max="100"
              :size="50"
              :stroke-width="8"
              :color="goalColor"
              :show-value="true"
            />
            <view class="goal-reward" v-if="userStore.todayStudyTime >= userStore.dailyGoal">
              <text>🎉 目标达成！+50 XP</text>
            </view>
          </view>
        </view>

        <!-- 继续学习卡片 -->
        <view v-if="continueLearning" class="continue-card" @click="goToChat">
          <view class="continue-content">
            <view class="continue-icon">💬</view>
            <view class="continue-info">
              <text class="continue-title">继续学习</text>
              <text class="continue-topic">{{ continueLearning.topic }}</text>
            </view>
            <view class="continue-progress">
              <ProgressRing
                :value="continueLearning.progress"
                :max="100"
                :size="50"
                :stroke-width="4"
                color="#4a6cf7"
                :show-value="true"
              />
            </view>
          </view>
          <view class="continue-arrow">→</view>
        </view>

        <!-- 快速入口网格 -->
        <PageHeader title="快速入口" subtitle="选择开始你的学习" />

        <view class="quick-grid">
          <QuickAction
            v-for="(action, index) in quickActions"
            :key="index"
            :icon="action.icon"
            :label="action.label"
            :desc="action.desc"
            :color="action.color"
            :badge="action.badge"
            @click="action.handler"
          />
        </view>

        <!-- 学习统计概览 -->
        <PageHeader
          title="学习概览"
          subtitle="你的进步看得见"
          :actions="[{ label: '详细报告', handler: goToReport }]"
        />
        <LoadingSkeleton v-if="reportStore.loading" variant="card" rows="4" />
        <view v-else class="stats-grid">
          <StatCard
            label="学习天数"
            :value="reportStore.latestReport?.stats?.studyDays || userStore.streak"
            icon="📅"
            icon-bg="#4a6cf7"
            :trend="statsTrend.studyDays"
            variant="highlight"
          />
          <StatCard
            label="总练习题数"
            :value="reportStore.latestReport?.stats?.totalQuestions || 0"
            icon="✏️"
            icon-bg="#52c41a"
            :trend="statsTrend.questions"
          />
          <StatCard
            label="整体正确率"
            :value="reportStore.latestReport?.stats?.correctRate || 0"
            :sublabel="percentSign"
            icon="🎯"
            icon-bg="#faad14"
            :trend="statsTrend.accuracy"
            :progress="reportStore.latestReport?.stats?.correctRate || 0"
            progress-color="#faad14"
          />
          <StatCard
            label="掌握知识点"
            :value="knowledgeStore.masteryStats.mastered"
            :sublabel="slashTotal"
            icon="📚"
            icon-bg="#722ed1"
            :trend="statsTrend.mastered"
          />
        </view>

        <!-- 薄弱知识点预警 -->
        <view v-if="knowledgeStore.weakPoints.length > 0" class="weakness-alert">
          <PageHeader title="需要关注" subtitle="以下知识点掌握度较低" />
          <LoadingSkeleton v-if="knowledgeStore.loading" variant="list" rows="3" />
          <view v-else class="weakness-list">
            <view
              v-for="(point, index) in knowledgeStore.weakPoints.slice(0, 3)"
              :key="index"
              class="weakness-item"
            >
              <view class="weakness-info">
                <text class="weakness-name">{{ point.name }}</text>
                <text class="weakness-mastery">{{ Math.round((masteryMap[point.id] || 0) * 100) }}% 掌握度</text>
              </view>
              <Chip
                label="练习"
                color="red"
                variant="soft"
                size="small"
                @click="() => practiceWeakPoint(point)"
              />
            </view>
          </view>
        </view>

        <!-- 今日推荐 -->
        <PageHeader
          title="今日推荐"
          subtitle="基于你的学习情况精选"
          :actions="[{ label: '查看全部', handler: () => uni.switchTab({ url: '/pages/practice/index' }) }]"
        />
        <LoadingSkeleton v-if="practiceStore.loading" variant="card" rows="3" />
        <view v-else class="recommend-carousel">
          <view
            v-for="(item, index) in recommendations"
            :key="index"
            class="recommend-card"
            @click="goToPractice(item)"
          >
            <view class="recommend-badge" v-if="item.badge">{{ item.badge }}</view>
            <view class="recommend-header">
              <Chip
                :label="item.subject"
                :color="item.color"
                variant="soft"
                size="small"
              />
              <Chip
                v-if="item.difficulty"
                :label="item.difficulty"
                color="gray"
                variant="outlined"
                size="small"
              />
            </view>
            <text class="recommend-title">{{ item.title }}</text>
            <text class="recommend-desc">{{ item.description }}</text>
            <view class="recommend-meta">
              <text class="recommend-time">⏱ {{ item.estimatedTime }} 分钟</text>
              <text class="recommend-xp">⭐ +{{ item.xpReward }} XP</text>
            </view>
          </view>
        </view>

        <!-- 成就进度 -->
        <view v-if="userStore.unlockedAchievements.length > 0 || userStore.lockedAchievements.length > 0" class="achievements-section">
          <PageHeader
            title="成就徽章"
            subtitle="解锁更多成就"
            :actions="[{ label: '全部', handler: goToAchievements }]"
          />
          <view class="achievements-grid">
            <view
              v-for="(achievement, index) in displayAchievements"
              :key="achievement.id"
              class="achievement-item"
              :class="{ locked: !achievement.unlocked }"
            >
              <text class="achievement-icon">{{ achievement.icon }}</text>
              <text class="achievement-name">{{ achievement.name }}</text>
              <text v-if="achievement.unlocked" class="achievement-unlocked">✓ 已解锁</text>
              <text v-else class="achievement-locked">{{ achievement.desc }}</text>
            </view>
          </view>
        </view>

        <!-- 底部安全区 -->
        <view class="safe-area" />
      </scroll-view>
    </view>
  </ErrorBoundary>
</template>

<script>
import { ref, computed, onMounted, h } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user'
import { useKnowledgeStore } from '@/store/knowledge'
import { usePracticeStore } from '@/store/practice'
import { useReportStore } from '@/store/report'
import PageHeader from '@/components/ui/PageHeader.vue'
import StatCard from '@/components/ui/StatCard.vue'
import Chip from '@/components/ui/Chip.vue'
import ProgressRing from '@/components/ui/ProgressRing.vue'
import QuickAction from '@/components/ui/QuickAction.vue'
import LoadingSkeleton from '@/components/ui/LoadingSkeleton.vue'
import ErrorBoundary from '@/components/ErrorBoundary.vue'
import EmptyState from '@/components/ui/EmptyState.vue'

export default {
  name: 'Index',
  components: {
    PageHeader,
    StatCard,
    Chip,
    ProgressRing,
    QuickAction
  },
  setup() {
    const userStore = useUserStore()
    const knowledgeStore = useKnowledgeStore()
    const practiceStore = usePracticeStore()
    const reportStore = useReportStore()

    const scrollIntoView = ref('')
    const continueLearning = ref(null)
    const masteryMap = computed(() => knowledgeStore.masteryMap)

    // 问候语
    const greeting = computed(() => {
      const hour = new Date().getHours()
      if (hour < 6) return '深夜还在学习，'
      if (hour < 9) return '早安，'
      if (hour < 12) return '上午好，'
      if (hour < 14) return '中午好，'
      if (hour < 18) return '下午好，'
      return '晚上好，'
    })

    // 格式化学习时间
    const formatStudyTime = (minutes) => {
      if (minutes < 60) return minutes + '分钟'
      const hours = Math.floor(minutes / 60)
      const mins = minutes % 60
      return mins > 0 ? hours + '小时' + mins + '分钟' : hours + '小时'
    }

    // 每日目标进度
    const goalPercentage = computed(() => {
      return Math.min(100, (userStore.todayStudyTime / userStore.dailyGoal) * 100)
    })

    const goalColor = computed(() => {
      const pct = goalPercentage.value
      if (pct >= 100) return '#52c41a'
      if (pct >= 70) return '#faad14'
      return '#4a6cf7'
    })

    // XP 渐变色
    const xpGradientColors = computed(() => ['#4a6cf7', '#7c94ff'])

    // 百分号（避免模板解析问题）
    const percentSign = '%'

    // 斜杠总数
    const slashTotal = computed(() => '/' + (knowledgeStore.masteryStats.total || 0))

    // 错题本角标
    const wrongQuestionsBadge = computed(() => {
      return null
    })

    // 快速入口
    const quickActions = [
      {
        icon: '💬',
        label: 'AI 辅导',
        desc: '智能对话教学',
        color: '#4a6cf7',
        badge: null,
        handler: () => uni.switchTab({ url: '/pages/chat/chat' })
      },
      {
        icon: '📸',
        label: '拍照解题',
        desc: '拍照即得解析',
        color: '#faad14',
        badge: null,
        handler: () => uni.navigateTo({ url: '/pages/camera/camera' })
      },
      {
        icon: '📊',
        label: '学情报告',
        desc: '掌握度全景图',
        color: '#52c41a',
        badge: '新',
        handler: () => uni.navigateTo({ url: '/pages/report/report' })
      },
      {
        icon: '🧠',
        label: '知识图谱',
        desc: '构建知识体系',
        color: '#722ed1',
        badge: null,
        handler: () => uni.switchTab({ url: '/pages/knowledge-graph/index' })
      },
      {
        icon: '✏️',
        label: '练习中心',
        desc: '自适应刷题',
        color: '#eb2f96',
        badge: '热',
        handler: () => uni.switchTab({ url: '/pages/practice/index' })
      },
      {
        icon: '📝',
        label: '错题本',
        desc: '错题复盘复习',
        color: '#ff4d4f',
        badge: wrongQuestionsBadge,
        handler: () => uni.navigateTo({ url: '/pages/wrong-questions/index' })
      }
    ]

    // 统计趋势（模拟）
    const statsTrend = computed(() => ({
      studyDays: userStore.streak > 0 ? 12 : 0,
      questions: 8,
      accuracy: userStore.streak > 5 ? 5 : 0,
      mastered: knowledgeStore.masteryStats.mastered > 0 ? 15 : 0
    }))

    // 今日推荐
    const recommendations = ref([
      {
        id: 'rec_1',
        badge: '为你推荐',
        subject: '数学',
        color: 'blue',
        difficulty: '⭐⭐⭐',
        title: '勾股定理的综合应用',
        description: '针对你在直角三角形中的薄弱点，推荐专项练习',
        estimatedTime: 15,
        xpReward: 100,
        topicId: 'pythagorean_advanced'
      },
      {
        id: 'rec_2',
        badge: '复习提醒',
        subject: '数学',
        color: 'orange',
        difficulty: '⭐⭐',
        title: '二次函数图像性质',
        description: '该知识点距离上次练习已超过 7 天，建议复习巩固',
        estimatedTime: 10,
        xpReward: 80,
        topicId: 'quadratic_properties'
      },
      {
        id: 'rec_3',
        badge: '新挑战',
        subject: '物理',
        color: 'purple',
        difficulty: '⭐⭐⭐⭐',
        title: '牛顿第二定律应用',
        description: '解锁物理学科新章节，从基础概念开始',
        estimatedTime: 20,
        xpReward: 150,
        topicId: 'newton_second_law'
      },
      {
        id: 'rec_4',
        badge: '薄弱攻克',
        subject: '数学',
        color: 'red',
        difficulty: '⭐⭐⭐',
        title: '圆的性质与位置关系',
        description: '你在该知识点正确率仅 45%，建议专项突破',
        estimatedTime: 15,
        xpReward: 120,
        topicId: 'circle_properties'
      }
    ])

    // 成就展示（已解锁 + 部分未解锁）
    const displayAchievements = computed(() => {
      const unlocked = userStore.unlockedAchievements.slice(0, 3)
      const locked = userStore.lockedAchievements.slice(0, 4 - unlocked.length)
      return [...unlocked, ...locked]
    })

    // 加载数据
    const loadData = async () => {
      await Promise.all([
        knowledgeStore.loadKnowledgePoints(),
        knowledgeStore.loadKnowledgeGraph(),
        reportStore.fetchReports()
      ])

      // 计算继续学习
      if (knowledgeStore.nextRecommended) {
        continueLearning.value = {
          topic: knowledgeStore.nextRecommended.name || '推荐知识点',
          progress: Math.round((1 - (knowledgeStore.getMastery(knowledgeStore.nextRecommended.id) || 0)) * 100)
        }
      }
    }

    const practiceWeakPoint = (point) => {
      practiceStore.setTopic(point.id)
      practiceStore.startSession('weakness', { subject: knowledgeStore.currentSubject })
      uni.navigateTo({ url: '/pages/practice/index' })
    }

    const goToReport = () => {
      uni.switchTab({ url: '/pages/report/report' })
    }

    const goToPractice = (item) => {
      if (item.topicId) {
        practiceStore.setTopic(item.topicId)
      }
      practiceStore.startSession('topic', { subject: item.subject.toLowerCase() })
      uni.navigateTo({ url: '/pages/practice/index' })
    }

    const goToAchievements = () => {
      uni.navigateTo({ url: '/pages/profile/index#achievements' })
    }

    onMounted(() => {
      userStore.init()
      loadData()
    })

    onShow(() => {
      loadData()
    })

    return {
      userStore,
      knowledgeStore,
      practiceStore,
      reportStore,
      scrollIntoView,
      continueLearning,
      masteryMap,
      greeting,
      formatStudyTime,
      goalPercentage,
      goalColor,
      quickActions,
      statsTrend,
      recommendations,
      displayAchievements,
      practiceWeakPoint,
      goToReport,
      goToPractice,
      goToAchievements,
      wrongQuestionsBadge,
      xpGradientColors,
      percentSign,
      slashTotal,
      fallbackContent: () => h(EmptyState, {
        title: '首页加载失败',
        description: '无法加载首页内容，请稍后重试',
        icon: '🏠',
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

/* 主内容 */
.main-content {
  flex: 1;
  padding-bottom: 40px;
}

/* 欢迎卡片 */
.welcome-card {
  background: linear-gradient(135deg, #4a6cf7 0%, #3b5bd9 100%);
  border-radius: 0 0 24px 24px;
  padding: 20px 16px 24px;
  margin: -20px -16px 16px;
  box-shadow: 0 4px 20px rgba(74, 108, 247, 0.3);
}

.welcome-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 20px;
}

.user-info {
  flex: 1;
}

.greeting {
  display: block;
  font-size: 22px;
  font-weight: 700;
  color: #fff;
  margin-bottom: 4px;
}

.subtitle {
  display: block;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.85);
}

.streak-xp {
  display: flex;
  align-items: center;
  gap: 0;
}

.streak-item,
.xp-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 16px;
}

.streak-label,
.xp-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 6px;
}

.streak-value,
.xp-value {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  line-height: 1;
}

.streak-text,
.xp-text {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.8);
  margin-top: 2px;
}

.divider-line {
  width: 1px;
  height: 40px;
  background: rgba(255, 255, 255, 0.2);
  margin: 0 8px;
}

.daily-goal {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  padding: 16px;
  backdrop-filter: blur(10px);
}

.goal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.goal-title {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
}

.goal-progress {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.9);
}

.goal-reward {
  display: block;
  margin-top: 10px;
  text-align: center;
  font-size: 12px;
  color: #fff;
  font-weight: 600;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

/* 继续学习卡片 */
.continue-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 16px 16px;
  padding: 16px;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  border: 1px solid var(--color-border, #e8e8f0);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.continue-card:active {
  transform: scale(0.98);
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.08);
}

.continue-content {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.continue-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #4a6cf7 0%, #7c94ff 100%);
  border-radius: 12px;
  font-size: 22px;
}

.continue-info {
  flex: 1;
}

.continue-title {
  display: block;
  font-size: 15px;
  font-weight: 600;
  color: #1a1a2e;
  margin-bottom: 2px;
}

.continue-topic {
  display: block;
  font-size: 13px;
  color: #999;
}

.continue-progress {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100px;
}

.progress-text {
  font-size: 12px;
  font-weight: 600;
  color: #4a6cf7;
}

.continue-arrow {
  font-size: 20px;
  color: #ccc;
  margin-left: 8px;
}

/* 快速入口网格 */
.quick-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  padding: 0 16px 16px;
}

.quick-action {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 12px;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  border: 1px solid var(--color-border, #e8e8f0);
  cursor: pointer;
  transition: all var(--transition-fast);
  position: relative;
}

.quick-action:active {
  transform: scale(0.97);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}

.quick-action-icon {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  font-size: 20px;
  margin-bottom: 10px;
}

.quick-action-label {
  font-size: 13px;
  font-weight: 600;
  color: #1a1a2e;
  text-align: center;
  margin-bottom: 2px;
}

.quick-action-desc {
  font-size: 11px;
  color: #999;
  text-align: center;
}

.quick-action-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 2px 6px;
  font-size: 9px;
  font-weight: 700;
  color: #fff;
  background: #ff4d4f;
  border-radius: 8px;
}

/* 统计网格 */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  padding: 0 16px 16px;
}

/* 薄弱知识点预警 */
.weakness-alert {
  margin-top: 8px;
}

.weakness-list {
  padding: 0 16px;
}

.weakness-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  background: #fff;
  border-radius: 12px;
  margin-bottom: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  border: 1px solid var(--color-border, #e8e8f0);
}

.weakness-item:last-child {
  margin-bottom: 16px;
}

.weakness-info {
  flex: 1;
}

.weakness-name {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: #1a1a2e;
  margin-bottom: 4px;
}

.weakness-mastery {
  display: block;
  font-size: 12px;
  color: #ff4d4f;
  font-weight: 500;
}

/* 今日推荐轮播 */
.recommend-carousel {
  display: flex;
  gap: 12px;
  padding: 0 16px 16px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
}

.recommend-card {
  flex: 0 0 280px;
  max-width: 280px;
  scroll-snap-align: start;
  background: #fff;
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  border: 1px solid var(--color-border, #e8e8f0);
  cursor: pointer;
  transition: all var(--transition-base);
  position: relative;
}

.recommend-card:active {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(74, 108, 247, 0.15);
}

.recommend-badge {
  position: absolute;
  top: 12px;
  left: 12px;
  padding: 4px 8px;
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  background: #4a6cf7;
  border-radius: 8px;
  z-index: 2;
}

.recommend-header {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.recommend-title {
  display: block;
  font-size: 15px;
  font-weight: 600;
  color: #1a1a2e;
  line-height: 1.4;
  margin-bottom: 6px;
}

.recommend-desc {
  display: block;
  font-size: 12px;
  color: #666;
  line-height: 1.6;
  margin-bottom: 12px;
}

.recommend-meta {
  display: flex;
  justify-content: space-between;
  padding-top: 10px;
  border-top: 1px solid var(--color-border, #e8e8f0);
}

.recommend-time,
.recommend-xp {
  font-size: 11px;
  color: #999;
}

.recommend-xp {
  color: #faad14;
  font-weight: 600;
}

/* 成就区域 */
.achievements-section {
  padding-bottom: 16px;
}

.achievements-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  padding: 0 16px 16px;
}

.achievement-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 14px 10px;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  border: 1px solid var(--color-border, #e8e8f0);
  transition: all var(--transition-base);
  opacity: 1;
}

.achievement-item.locked {
  opacity: 0.5;
  filter: grayscale(1);
}

.achievement-item.locked:active {
  opacity: 0.7;
}

.achievement-item.just-unlocked {
  animation: achievementPop 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  border-color: #faad14;
  box-shadow: 0 0 0 3px rgba(250, 173, 20, 0.3);
}

@keyframes achievementPop {
  0% { opacity: 0; transform: scale(0.5); }
  50% { transform: scale(1.1); }
  100% { opacity: 1; transform: scale(1); }
}

.achievement-icon {
  font-size: 28px;
  margin-bottom: 8px;
}

.achievement-name {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: #1a1a2e;
  text-align: center;
  margin-bottom: 4px;
}

.achievement-desc {
  display: block;
  font-size: 10px;
  color: #999;
  text-align: center;
  margin-bottom: 10px;
  line-height: 1.4;
}

.achievement-reward {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding-top: 8px;
  border-top: 1px solid var(--color-border, #e8e8f0);
}

.achievement-reward text:first-child {
  font-size: 12px;
  font-weight: 700;
  color: #faad14;
}

.unlock-time {
  font-size: 10px;
  color: #999;
}

.achievement-locked {
  display: flex;
  align-items: center;
  justify-content: center;
  padding-top: 8px;
  border-top: 1px solid var(--color-border, #e8e8f0);
  color: #999;
  font-size: 11px;
}

/* 底部安全区 */
.safe-area {
  height: 40px;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .page {
    background: var(--color-bg-primary, #1a1a2e);
  }

  .welcome-card {
    background: linear-gradient(135deg, #3b5bd9 0%, #2d2d4a 100%);
    box-shadow: 0 4px 20px rgba(74, 108, 247, 0.2);
  }

  .continue-card,
  .quick-action,
  .weakness-item,
  .recommend-card,
  .achievement-item {
    background: var(--color-bg-card, #252542);
    border-color: var(--color-border, #3d3d5c);
  }

  .continue-title,
  .quick-action-label,
  .recommend-title,
  .achievement-name,
  .weakness-name {
    color: var(--color-text-primary, #e8e8f0);
  }

  .continue-topic,
  .quick-action-desc,
  .recommend-desc,
  .recommend-time,
  .achievement-locked,
  .weakness-mastery {
    color: var(--color-text-tertiary, #888);
  }

  .recommend-xp {
    color: #ffc53d;
  }

  .continue-arrow {
    color: #555;
  }

  .goal-reward {
    color: #e8e8f0;
  }
}
</style>