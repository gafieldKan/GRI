<template>
  <ErrorBoundary :showDetails="true" :logError="true">
    <view class="page">
      <PageHeader title="个人中心" subtitle="记录成长的每一步" />

      <scroll-view class="profile-content" scroll-y="true" :scroll-into-view="scrollIntoView">
      <!-- 用户信息卡片 -->
      <view class="profile-header">
        <view class="avatar-section">
          <view class="avatar-wrapper">
            <image v-if="userStore.avatar" :src="userStore.avatar" class="avatar-image" mode="aspectFill" />
            <text v-else class="avatar-text">{{ userStore.name.charAt(0) }}</text>
            <view class="avatar-ring" :style="{ background: levelGradient }" />
          </view>
        </view>

        <view class="user-info">
          <text class="user-name">{{ userStore.name }}</text>
          <view class="user-meta">
            <Chip
              :label="`Lv.${userStore.level}`"
              color="purple"
              variant="filled"
              size="small"
            />
            <Chip
              :label="`${userStore.grade}`"
              color="blue"
              variant="outlined"
              size="small"
            />
            <Chip
              :label="`${getSubjectName(userStore.subject)}`"
              color="green"
              variant="outlined"
              size="small"
            />
          </view>

          <!-- XP 进度条 -->
          <view class="xp-progress">
            <view class="xp-header">
              <text class="xp-label">经验值</text>
              <text class="xp-value">{{ userStore.xp }} / {{ userStore.xpToNextLevel }}</text>
            </view>
            <ProgressRing
              :value="userStore.xpProgress"
              :max="100"
              :size="80"
              :stroke-width="6"
              :gradient="true"
              :gradient-colors="['#4a6cf7', '#7c94ff']"
            />
          </view>

          <!-- 连续学习 -->
          <view class="streak-card">
            <view class="streak-flame">🔥</view>
            <view class="streak-info">
              <text class="streak-count">{{ userStore.streak }}</text>
              <text class="streak-label">天连续学习</text>
            </view>
            <view class="streak-status">
              <text>{{ userStore.streakStatus }}</text>
              <text v-if="userStore.longestStreak > userStore.streak" class="longest">最长 {{ userStore.longestStreak }} 天</text>
            </view>
            <view class="streak-calendar" v-if="showCalendar">
              <CalendarHeatmap :streak="userStore.streak" :lastDate="userStore.lastStudyDate" />
            </view>
          </view>
        </view>

        <view class="profile-actions">
          <Chip label="编辑资料" color="blue" variant="outlined" @click="editProfile" />
          <Chip label="我的成就" color="purple" variant="outlined" @click="scrollToAchievements" />
          <Chip label="学习记录" color="green" variant="outlined" @click="goToHistory" />
        </view>

        <!-- 我的 AI 教师：每生独立 agent + 跨会话记忆 -->
        <view class="teacher-entry" @click="goToTeacher">
          <view class="teacher-entry-icon">🎓</view>
          <view class="teacher-entry-text">
            <text class="teacher-entry-title">我的 AI 教师</text>
            <text class="teacher-entry-sub">专属独立教师 · 长期记忆陪伴你的学习</text>
          </view>
          <text class="teacher-entry-arrow">›</text>
        </view>
      </view>

      <!-- 统计概览 -->
      <view class="stats-section">
        <text class="section-title">学习数据</text>
        <view class="stats-grid">
          <StatCard
            label="总学习时长"
            :value="formatTime(userStore.totalStudyTime)"
            icon="⏱"
            icon-bg="#4a6cf7"
          />
          <StatCard
            label="今日学习"
            :value="formatTime(userStore.todayStudyTime)"
            icon="📅"
            icon-bg="#faad14"
          />
          <StatCard
            label="完成题目"
            :value="reportStore.latestReport?.stats?.totalQuestions || 0"
            icon="✏️"
            icon-bg="#52c41a"
          />
          <StatCard
            label="整体正确率"
            :value="reportStore.latestReport?.stats?.correctRate || 0"
            :sublabel="percentSign"
            icon="🎯"
            icon-bg="#722ed1"
            :progress="reportStore.latestReport?.stats?.correctRate || 0"
            progress-color="#722ed1"
          />
        </view>
      </view>

      <!-- 掌握度雷达图 -->
      <view class="radar-section" v-if="reportStore.latestReport?.abilityDims">
        <PageHeader title="能力维度分析" subtitle="五维能力雷达图" />
        <view class="radar-container">
          <canvas
            canvas-id="profileRadar"
            id="profileRadar"
            class="radar-canvas"
          ></canvas>
        </view>
      </view>

      <!-- 成就徽章 -->
      <view class="achievements-section" id="achievements">
        <PageHeader
          title="成就徽章"
          subtitle="已解锁 {{ userStore.unlockedAchievements.length }} / {{ userStore.achievements.length }}"
        />
        <view class="achievements-tabs">
          <Chip
            label="全部"
            :variant="achievementTab === 'all' ? 'filled' : 'outlined'"
            color="blue"
            size="small"
            @click="achievementTab = 'all'"
          />
          <Chip
            label="已解锁"
            :variant="achievementTab === 'unlocked' ? 'filled' : 'outlined'"
            color="green"
            size="small"
            @click="achievementTab = 'unlocked'"
          />
          <Chip
            label="未解锁"
            :variant="achievementTab === 'locked' ? 'filled' : 'outlined'"
            color="orange"
            size="small"
            @click="achievementTab = 'locked'"
          />
        </view>

        <view
            v-for="achievement in filteredAchievements"
            :key="achievement.id"
            class="achievement-card"
            :class="{ locked: !achievement.unlocked, 'just-unlocked': achievement.unlocked && achievement.newlyUnlocked }"
          >
            <view class="achievement-icon">{{ achievement.icon }}</view>
            <text class="achievement-name">{{ achievement.name }}</text>
            <text class="achievement-desc">{{ achievement.desc }}</text>
            <view class="achievement-reward" v-if="achievement.unlocked">
              <text>+{{ achievement.xp }} XP</text>
              <text class="unlock-time" v-if="achievement.unlockedAt">{{ formatUnlockTime(achievement.unlockedAt) }}</text>
            </view>
            <view class="achievement-locked" v-else>
              <text>{{ getProgressText(achievement) }}</text>
            </view>
          </view>
      </view>

      <!-- 学习热力图 -->
      <view class="heatmap-section">
        <PageHeader title="学习热力图" subtitle="最近 365 天的学习轨迹" />
        <view class="heatmap-container">
          <CalendarHeatmap :streak="userStore.streak" :fullYear="true" />
        </view>
      </view>

      <!-- 最近活动 -->
      <view class="activity-section">
        <PageHeader title="最近活动" subtitle="查看完整历史" :actions="[{ label: '全部', handler: goToHistory }]" />
        <view class="activity-list">
          <view
            v-for="(activity, index) in recentActivity"
            :key="index"
            class="activity-item"
          >
            <view class="activity-icon" :style="{ background: activity.color }">
              <text>{{ activity.icon }}</text>
            </view>
            <view class="activity-content">
              <text class="activity-title">{{ activity.title }}</text>
              <text class="activity-time">{{ activity.time }}</text>
            </view>
            <view class="activity-reward" v-if="activity.xp">
              <text>+{{ activity.xp }} XP</text>
            </view>
          </view>
        </view>
      </view>

      <view class="safe-area" />
    </scroll-view>
  </view>
</ErrorBoundary>
</template>

<script>
import { ref, computed, onMounted, nextTick } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user'
import { useReportStore } from '@/store/report'
import PageHeader from '@/components/ui/PageHeader.vue'
import Chip from '@/components/ui/Chip.vue'
import StatCard from '@/components/ui/StatCard.vue'
import CalendarHeatmap from '@/components/ui/CalendarHeatmap.vue'
import ProgressRing from '@/components/ui/ProgressRing.vue'

export default {
  name: 'Profile',
  components: {
    PageHeader,
    Chip,
    StatCard,
    CalendarHeatmap,
    ProgressRing
  },
  setup() {
    const userStore = useUserStore()
    const reportStore = useReportStore()

    const scrollIntoView = ref('')
    const achievementTab = ref('all')
    const showCalendar = ref(false)

    const filteredAchievements = computed(() => {
      switch (achievementTab.value) {
        case 'unlocked':
          return userStore.unlockedAchievements
        case 'locked':
          return userStore.lockedAchievements
        default:
          return [...userStore.unlockedAchievements, ...userStore.lockedAchievements.slice(0, 6)]
      }
    })

    const levelGradient = computed(() => {
      const level = userStore.level
      if (level >= 50) return 'linear-gradient(135deg, #ffd700 0%, #ff8c00 100%)'
      if (level >= 30) return 'linear-gradient(135deg, #c0c0c0 0%, #808080 100%)'
      if (level >= 15) return 'linear-gradient(135deg, #cd7f32 0%, #8b4513 100%)'
      return 'linear-gradient(135deg, #4a6cf7 0%, #7c94ff 100%)'
    })

    const getSubjectName = (subject) => {
      const names = { math: '数学', physics: '物理', chemistry: '化学', biology: '生物', english: '英语', chinese: '语文' }
      return names[subject] || subject
    }

    const formatTime = (seconds) => {
      if (!seconds) return '0分钟'
      const hours = Math.floor(seconds / 3600)
      const minutes = Math.floor((seconds % 3600) / 60)
      if (hours > 0) return hours + '小时' + (minutes > 0 ? minutes + '分' : '')
      return minutes + '分钟'
    }

    const formatUnlockTime = (isoString) => {
      if (!isoString) return ''
      const date = new Date(isoString)
      return `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`
    }

    const getProgressText = (achievement) => {
      if (achievement.id.startsWith('streak_')) {
        const target = parseInt(achievement.id.split('_')[1])
        return `还需 ${target - userStore.streak} 天`
      }
      if (achievement.id.startsWith('questions_')) {
        const target = parseInt(achievement.id.split('_')[1])
        const current = reportStore.latestReport?.stats?.totalQuestions || 0
        return `还需 ${target - current} 道`
      }
      return '继续努力'
    }

    const recentActivity = computed(() => {
      // 从历史记录生成活动流
      const activities = []

      if (userStore.streak > 0) {
        activities.push({
          icon: '🔥',
          color: '#faad14',
          title: `连续学习 ${userStore.streak} 天`,
          time: '进行中',
          xp: userStore.streak * 10
        })
      }

      if (reportStore.latestReport) {
        activities.push({
          icon: '📊',
          color: '#4a6cf7',
          title: '生成学情报告',
          time: reportStore.latestReport.generatedAt ? new Date(reportStore.latestReport.generatedAt).toLocaleDateString() : '最近',
          xp: 50
        })
      }

      // 从练习历史获取
      // 这里简化处理

      return activities.slice(0, 5)
    })

    const editProfile = () => {
      uni.showModal({
        title: '编辑昵称',
        editable: true,
        placeholderText: userStore.name,
        success: (res) => {
          if (res.confirm && res.content.trim()) {
            userStore.setStudent(userStore.studentId, { name: res.content.trim() })
            uni.showToast({ title: '修改成功', icon: 'success' })
          }
        }
      })
    }

    const scrollToAchievements = () => {
      achievementTab.value = 'all'
      setTimeout(() => {
        scrollIntoView.value = 'achievements'
      }, 50)
    }

    const goToHistory = () => {
      uni.navigateTo({ url: '/pages/practice/history' })
    }

    const goToTeacher = () => {
      uni.navigateTo({ url: '/pages/teacher/index' })
    }

    const percentSign = '%'

    const loadData = async () => {
      await reportStore.fetchReports()
    }

    onMounted(async () => {
      userStore.init()
      await loadData()
    })

    onShow(async () => {
      await loadData()
    })

    return {
      userStore,
      reportStore,
      scrollIntoView,
      achievementTab,
      showCalendar,
      filteredAchievements,
      levelGradient,
      getSubjectName,
      formatTime,
      formatUnlockTime,
      getProgressText,
      recentActivity,
      editProfile,
      scrollToAchievements,
      goToHistory,
      goToTeacher,
      percentSign
    }
  }
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: var(--color-bg-primary, #f7f8fa);
}

.profile-content {
  flex: 1;
  padding-bottom: 40px;
}

/* 用户信息卡片 */
.profile-header {
  margin: 12px 16px 16px;
  background: #fff;
  border-radius: 20px;
  padding: 24px 16px 20px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  border: 1px solid var(--color-border, #e8e8f0);
}

.avatar-section {
  display: flex;
  justify-content: center;
  margin-bottom: 16px;
}

.avatar-wrapper {
  position: relative;
  width: 96px;
  height: 96px;
}

.avatar-image,
.avatar-text {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  object-fit: cover;
}

.avatar-text {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #4a6cf7 0%, #7c94ff 100%);
}

.avatar-ring {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 3px solid #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  font-size: 12px;
  color: #fff;
}

.user-info {
  text-align: center;
}

.user-name {
  display: block;
  font-size: 22px;
  font-weight: 700;
  color: #1a1a2e;
  margin-bottom: 12px;
}

.user-meta {
  display: flex;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

/* XP 进度 */
.xp-progress {
  background: var(--color-bg-secondary, #f0f0f5);
  border-radius: 12px;
  padding: 16px;
  margin: 0 16px 16px;
}

.xp-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.xp-label {
  font-size: 13px;
  font-weight: 600;
  color: #666;
}

.xp-value {
  font-size: 13px;
  font-weight: 600;
  color: #4a6cf7;
}

/* 连续学习卡片 */
.streak-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  margin: 0 16px 16px;
  background: linear-gradient(135deg, #fff9e6 0%, #fff3c4 100%);
  border-radius: 16px;
  border: 1px solid #ffe58f;
}

.streak-flame {
  font-size: 36px;
  animation: flicker 1.5s infinite;
}

@keyframes flicker {
  0%, 100% { transform: scale(1) rotate(-2deg); }
  50% { transform: scale(1.1) rotate(2deg); }
}

.streak-info {
  flex: 1;
}

.streak-count {
  display: block;
  font-size: 28px;
  font-weight: 800;
  color: #faad14;
  line-height: 1;
  margin-bottom: 2px;
}

.streak-label {
  display: block;
  font-size: 13px;
  color: #999;
}

.streak-status {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  text-align: right;
}

.streak-status text:first-child {
  font-size: 12px;
  font-weight: 600;
  color: #faad14;
}

.longest {
  font-size: 11px;
  color: #999 !important;
}

.streak-calendar {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #ffe58f;
}

.profile-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
  padding-top: 8px;
}

/* 统计区域 */
.stats-section {
  padding: 0 16px 16px;
}

.section-title {
  display: block;
  padding: 8px 0;
  font-size: 16px;
  font-weight: 600;
  color: #1a1a2e;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

/* 雷达图 */
.radar-section {
  padding: 0 16px 16px;
}

.radar-container {
  height: 220px;
  background: #fff;
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  border: 1px solid var(--color-border, #e8e8f0);
}

.radar-canvas {
  width: 100%;
  height: 100%;
}

/* 成就区域 */
.achievements-section {
  padding: 0 16px 16px;
}

.achievements-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  overflow-x: auto;
}

.achievements-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.achievement-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 12px;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  border: 1px solid var(--color-border, #e8e8f0);
  transition: all var(--transition-base);
}

.achievement-card:active {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(74, 108, 247, 0.15);
}

.achievement-card.locked {
  opacity: 0.5;
  filter: grayscale(1);
  background: #fafafa;
}

.achievement-card.just-unlocked {
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
  font-size: 36px;
  margin-bottom: 8px;
}

.achievement-name {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #1a1a2e;
  text-align: center;
  margin-bottom: 4px;
}

.achievement-desc {
  display: block;
  font-size: 11px;
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

/* 热力图 */
.heatmap-section {
  padding: 0 16px 16px;
}

.heatmap-container {
  background: #fff;
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  border: 1px solid var(--color-border, #e8e8f0);
  overflow-x: auto;
}

/* 活动记录 */
.activity-section {
  padding: 0 16px 16px;
}

.activity-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.activity-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  border: 1px solid var(--color-border, #e8e8f0);
}

.activity-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  font-size: 16px;
  flex-shrink: 0;
}

.activity-content {
  flex: 1;
  min-width: 0;
}

.activity-title {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: #1a1a2e;
  margin-bottom: 2px;
}

.activity-time {
  display: block;
  font-size: 12px;
  color: #999;
}

.activity-reward {
  font-size: 13px;
  font-weight: 600;
  color: #722ed1;
}

/* 安全区 */
.safe-area {
  height: 40px;
}

/* 我的 AI 教师入口 */
.teacher-entry {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
  padding: 14px 16px;
  background: linear-gradient(135deg, #4a6cf7 0%, #7c94ff 100%);
  border-radius: 14px;
  box-shadow: 0 4px 16px rgba(74, 108, 247, 0.2);
}

.teacher-entry:active {
  opacity: 0.9;
}

.teacher-entry-icon {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.22);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}

.teacher-entry-text {
  flex: 1;
  min-width: 0;
}

.teacher-entry-title {
  display: block;
  font-size: 15px;
  font-weight: 700;
  color: #fff;
  margin-bottom: 2px;
}

.teacher-entry-sub {
  display: block;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.85);
}

.teacher-entry-arrow {
  font-size: 26px;
  color: rgba(255, 255, 255, 0.9);
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .page {
    background: var(--color-bg-primary, #1a1a2e);
  }

  .profile-header,
  .radar-container,
  .achievement-card,
  .heatmap-container,
  .activity-item {
    background: var(--color-bg-card, #252542);
    border-color: var(--color-border, #3d3d5c);
  }

  .achievement-card.locked {
    background: var(--color-bg-elevated, #2d2d4a);
  }

  .user-name,
  .achievement-name,
  .activity-title {
    color: var(--color-text-primary, #e8e8f0);
  }

  .streak-label,
  .achievement-desc,
  .activity-time,
  .unlock-time {
    color: var(--color-text-tertiary, #888);
  }

  .xp-progress {
    background: var(--color-bg-elevated, #2d2d4a);
  }

  .streak-card {
    background: linear-gradient(135deg, #3d3600 0%, #4a4000 100%);
    border-color: #665500;
  }

  .stat-card {
    background: var(--color-bg-card, #252542);
    border-color: var(--color-border, #3d3d5c);
  }

  .stat-card.outline {
    background: transparent;
  }
}
</style>