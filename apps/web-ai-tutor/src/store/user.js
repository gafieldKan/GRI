/**
 * 用户状态管理 (Pinia Store) — Web AI Tutor 版
 * 管理学生档案、学习进度、偏好设置、成就系统
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAuthStore } from '@gri/auth-client'
import { getAchievements, getUserStats, updateProfile, updatePreferences, getUserPreferences } from '@/api/index.js'

export const useUserStore = defineStore('user', () => {
  // ─── State ───
  // 学生业务主键：由统一登录态（@gri/auth-client 的 user.externalId）解出。
  // 未登录为空（null），不再硬编码 student_001。
  const studentId = ref(null)
  const name = ref('学习者')
  const avatar = ref('')
  const grade = ref('八年级')
  const subject = ref('math')
  const textbookVersion = ref('人教版')

  // 学习进度
  const xp = ref(0)
  const level = ref(1)
  const streak = ref(0)
  const longestStreak = ref(0)
  const lastStudyDate = ref(null)
  const totalStudyTime = ref(0) // 秒
  const todayStudyTime = ref(0)

  // 学习偏好 (从settings store移过来，因为需要在loadUserProfile中使用)
  const preferredSubjects = ref(['math'])
  const preferredDifficulty = ref('adaptive')
  const autoPlayAudio = ref(false)
  const showHints = ref(true)
  const showExplanations = ref(true)
  const dailyGoal = ref(15) // 分钟
  const reminderTime = ref('20:00')

  // 外观设置 (从settings store移过来，因为需要在applyTheme/applyFontSize中使用)
  const theme = ref('light')
  const fontSize = ref('medium')
  const reducedMotion = ref(false)

  // 成就系统（由 loadUserProfile 从后端拉取，unlockAchievement/checkAchievements 更新）
  const achievements = ref([
    { id: 'streak_3', icon: '🔥', name: '初露锋芒', desc: '连续学习 3 天', xp: 50, unlocked: false, unlockedAt: null },
    { id: 'streak_7', icon: '⚡', name: '习惯养成', desc: '连续学习 7 天', xp: 100, unlocked: false, unlockedAt: null },
    { id: 'streak_30', icon: '🏆', name: '坚持不懈', desc: '连续学习 30 天', xp: 500, unlocked: false, unlockedAt: null },
    { id: 'questions_10', icon: '✏️', name: '勤学苦练', desc: '累计答题 10 道', xp: 50, unlocked: false, unlockedAt: null },
    { id: 'questions_100', icon: '📝', name: '百题斩', desc: '累计答题 100 道', xp: 200, unlocked: false, unlockedAt: null },
    { id: 'questions_1000', icon: '🎯', name: '千题大王', desc: '累计答题 1000 道', xp: 1000, unlocked: false, unlockedAt: null },
    { id: 'mastery_80', icon: '📈', name: '融会贯通', desc: '掌握度达到 80%', xp: 200, unlocked: false, unlockedAt: null },
    { id: 'perfect_session', icon: '💯', name: '一次全对', desc: '一次练习全部答对', xp: 150, unlocked: false, unlockedAt: null },
    { id: 'night_owl', icon: '🦉', name: '夜猫子', desc: '深夜仍在学习', xp: 50, unlocked: false, unlockedAt: null },
    { id: 'early_bird', icon: '🌅', name: '早起鸟', desc: '清晨开始学习', xp: 50, unlocked: false, unlockedAt: null }
  ])

  // 通知设置 (从settings store移过来，因为需要在loadUserProfile中使用)
  const pushEnabled = ref(true)
  const emailEnabled = ref(false)
  const streakReminder = ref(true)
  const weeklyReport = ref(true)
  const achievementAlerts = ref(true)
  const quietHoursStart = ref('22:00')
  const quietHoursEnd = ref('07:00')

  // 声音与触觉 (从settings store移过来，因为需要在loadUserProfile中使用)
  const soundEnabled = ref(true)
  const soundVolume = ref(0.5)
  const hapticEnabled = ref(true)

  // 数据与隐私 (从settings store移过来，因为需要在loadUserProfile中使用)
  const analyticsEnabled = ref(true)
  const crashReporting = ref(true)
  const personalizedAds = ref(false)
  const dataSync = ref(true) // 云端同步

  // 账号 (从settings store移过来，因为需要在loadUserProfile中使用)
  const autoLogin = ref(true)
  const biometricAuth = ref(false)
  const sessionTimeout = ref(30) // 天

  // ─── Getters ───
  const isLoggedIn = computed(() => !!studentId.value)
  const displayName = computed(() => name.value || '学习者')
  const xpToNextLevel = computed(() => level.value * 1000)
  const xpProgress = computed(() => (xp.value % 1000) / 10)
  const streakStatus = computed(() => {
    if (streak.value === 0) return '未开始'
    if (streak.value < 7) return '起步阶段'
    if (streak.value < 30) return '习惯养成'
    if (streak.value < 100) return '坚持不懈'
    return '学霸级别'
  })

  const unlockedAchievements = computed(() =>
    achievements.value.filter(a => a.unlocked)
  )
  const lockedAchievements = computed(() =>
    achievements.value.filter(a => !a.unlocked)
  )

  // ─── Actions ───
  function setStudent(id, profile = {}) {
    studentId.value = id
    name.value = profile.name || name.value
    avatar.value = profile.avatar || avatar.value
    grade.value = profile.grade || grade.value
    subject.value = profile.subject || subject.value
    textbookVersion.value = profile.textbookVersion || textbookVersion.value

    if (profile.xp !== undefined) xp.value = profile.xp
    if (profile.level !== undefined) level.value = profile.level
    if (profile.streak !== undefined) streak.value = profile.streak
    if (profile.totalStudyTime !== undefined) totalStudyTime.value = profile.totalStudyTime
  }

  function addXP(amount, reason = '') {
    xp.value += amount
    checkLevelUp()
    checkAchievements('xp', amount)
    console.log(`[User] +${amount} XP (${reason}) Total: ${xp.value}`)
  }

  function checkLevelUp() {
    const newLevel = Math.floor(xp.value / 1000) + 1
    if (newLevel > level.value) {
      level.value = newLevel
      checkAchievements('level', newLevel)
      uni.showToast({
        title: `升级啦！达到 Lv.${newLevel}`,
        icon: 'success',
        duration: 2000
      })
    }
  }

  function recordStudySession(durationMinutes, questionsAnswered = 0, correctCount = 0) {
    const now = new Date()
    const today = now.toDateString()
    const lastDate = lastStudyDate.value ? new Date(lastStudyDate.value).toDateString() : null

    // 更新学习时间
    totalStudyTime.value += durationMinutes * 60
    todayStudyTime.value += durationMinutes * 60

    // 更新连续天数
    if (lastDate !== today) {
      if (lastDate === new Date(now - 86400000).toDateString()) {
        // 连续
        streak.value += 1
      } else if (lastDate) {
        // 中断
        streak.value = 1
      } else {
        // 首次
        streak.value = 1
      }

      if (streak.value > longestStreak.value) {
        longestStreak.value = streak.value
      }
      lastStudyDate.value = now.toISOString()
      todayStudyTime.value = durationMinutes * 60

      checkAchievements('streak', streak.value)
    }

    // 检查成就
    if (questionsAnswered > 0) {
      checkAchievements('questions', questionsAnswered)
      if (correctCount === questionsAnswered && questionsAnswered >= 5) {
        checkAchievements('perfect', true)
      }
    }

    // 时间成就
    const hour = now.getHours()
    if (hour >= 22 || hour < 5) checkAchievements('night', true)
    if (hour >= 5 && hour < 7) checkAchievements('early', true)

    // 每日目标完成
    if (todayStudyTime.value >= dailyGoal.value) {
      addXP(50, '完成每日目标')
    }
  }

  function checkAchievements(type, value) {
    achievements.value.forEach(a => {
      if (a.unlocked) return

      let shouldUnlock = false
      switch (type) {
        case 'streak':
          if (a.id === 'streak_3' && value >= 3) shouldUnlock = true
          if (a.id === 'streak_7' && value >= 7) shouldUnlock = true
          if (a.id === 'streak_30' && value >= 30) shouldUnlock = true
          break
        case 'questions':
          if (a.id === 'questions_10' && value >= 10) shouldUnlock = true
          if (a.id === 'questions_100' && value >= 100) shouldUnlock = true
          if (a.id === 'questions_1000' && value >= 1000) shouldUnlock = true
          break
        case 'level':
          if (a.id === 'mastery_80' && value >= 8) shouldUnlock = true // 简化映射
          break
        case 'perfect':
          if (a.id === 'perfect_session' && value) shouldUnlock = true
          break
        case 'night':
          if (a.id === 'night_owl' && value) shouldUnlock = true
          break
        case 'early':
          if (a.id === 'early_bird' && value) shouldUnlock = true
          break
        case 'xp':
          // XP 累计成就可以在这里扩展
          break
      }

      if (shouldUnlock) {
        unlockAchievement(a.id)
      }
    })
  }

  function unlockAchievement(id) {
    const a = achievements.value.find(a => a.id === id)
    if (a && !a.unlocked) {
      a.unlocked = true
      a.unlockedAt = new Date().toISOString()
      addXP(a.xp, `成就：${a.name}`)

      if (soundEnabled.value) {
        // 播放成就音效
        playAchievementSound()
      }

      uni.showModal({
        title: '🎉 解锁成就！',
        content: `${a.icon} ${a.name}\n${a.desc}\n奖励 ${a.xp} XP`,
        showCancel: false,
        confirmText: '太棒了'
      })
    }
  }

  function playAchievementSound() {
    // 简单的 Web Audio API 提示音
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(880, ctx.currentTime)
      osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.1)
      osc.frequency.setValueAtTime(1760, ctx.currentTime + 0.2)
      gain.gain.setValueAtTime(0.1, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.5)
    } catch (e) {
      // 忽略音频错误
    }
  }

  function updatePreferences(prefs) {
    Object.keys(prefs).forEach(key => {
      if (key in this) {
        this[key].value = prefs[key]
      }
    })
    // 应用主题
    if (prefs.theme) applyTheme()
    // 应用字体大小
    if (prefs.fontSize) applyFontSize()
    // 应用减少动画
    if (prefs.reducedMotion !== undefined) applyReducedMotion()
  }

  function applyTheme() {
    // #ifdef H5
    const root = document.documentElement
    if (theme.value === 'dark' || (theme.value === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    // #endif
    // #ifdef MP-WEIXIN
    uni.setStorageSync('theme', theme.value)
    // #endif
  }

  function applyFontSize() {
    // #ifdef H5
    const root = document.documentElement
    root.classList.remove('font-small', 'font-medium', 'font-large')
    root.classList.add(`font-${fontSize.value}`)
    // #endif
  }

  function applyReducedMotion() {
    // #ifdef H5
    if (reducedMotion.value) {
      document.documentElement.classList.add('reduce-motion')
    } else {
      document.documentElement.classList.remove('reduce-motion')
    }
    // #endif
  }

  function resetTodayStudyTime() {
    todayStudyTime.value = 0
  }

  // 从统一登录态解出学生业务主键（外部在 App.onLaunch 调 authStore.restore 后调用）
  function syncFromAuth() {
    const authStore = useAuthStore()
    const externalId = authStore.externalId
    if (externalId) {
      studentId.value = externalId
      if (authStore.user) {
        name.value = authStore.user.name || authStore.user.username || name.value
      }
    }
  }

  function reset() {
    studentId.value = null
    name.value = '学习者'
    avatar.value = ''
    grade.value = '八年级'
    subject.value = 'math'
    textbookVersion.value = '人教版'
    xp.value = 0
    level.value = 1
    streak.value = 0
    longestStreak.value = 0
    lastStudyDate.value = null
    totalStudyTime.value = 0
    todayStudyTime.value = 0
    achievements.value.forEach(a => {
      a.unlocked = false
      delete a.unlockedAt
    })
  }

  // 初始化
  function init() {
    applyTheme()
    applyFontSize()
    applyReducedMotion()
    syncFromAuth()

    // 监听系统主题变化
    // #ifdef H5
    if (theme.value === 'auto') {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme)
    }
    // #endif

    // Load user profile from backend
    loadUserProfile()
  }

  // Load user profile from backend
  async function loadUserProfile() {
    try {
      const profile = await getUserStats(studentId.value)
      if (profile && profile.studentId) {
        // Update local state with server data
        xp.value = profile.xp || 0
        level.value = profile.level || 1
        streak.value = profile.streak || 0
        longestStreak.value = profile.longestStreak || 0
        totalStudyTime.value = profile.totalStudyTime || 0
        todayStudyTime.value = profile.todayStudyTime || 0
        lastStudyDate.value = profile.lastStudyDate || null
      }

      // Load achievements
      const achievementsData = await getAchievements(studentId.value)
      if (achievementsData && achievementsData.length > 0) {
        // Merge with local achievements
        achievementsData.forEach(serverAch => {
          const localAch = achievements.value.find(a => a.id === serverAch.id)
          if (localAch) {
            localAch.unlocked = serverAch.unlocked
            localAch.unlockedAt = serverAch.unlockedAt
          }
        })
      }

      // Load stats
      const stats = await getUserStats(studentId.value)
      if (stats) {
        xp.value = stats.xp || 0
        level.value = stats.level || 1
        streak.value = stats.streak || 0
        totalStudyTime.value = stats.totalStudyTime || 0
      }

      // Load user preferences from backend
      const prefs = await getUserPreferences(studentId.value)
      if (prefs && Object.keys(prefs).length > 0) {
        dailyGoal.value = prefs.daily_goal || prefs.dailyGoal || 15
        reminderTime.value = prefs.reminder_time || prefs.reminderTime || '20:00'
        preferredSubjects.value = prefs.preferred_subjects || prefs.preferredSubjects || ['math']
        preferredDifficulty.value = prefs.preferred_difficulty || prefs.preferredDifficulty || 'adaptive'
        autoPlayAudio.value = prefs.auto_play_audio || prefs.autoPlayAudio || false
        showHints.value = prefs.show_hints || prefs.showHints !== false
        showExplanations.value = prefs.show_explanations || prefs.showExplanations !== false
        pushEnabled.value = prefs.push_enabled !== false
        emailEnabled.value = prefs.email_enabled || false
        streakReminder.value = prefs.streak_reminder !== false
        weeklyReport.value = prefs.weekly_report !== false
        achievementAlerts.value = prefs.achievement_alerts !== false
        quietHoursStart.value = prefs.quiet_hours_start || prefs.quietHoursStart || '22:00'
        quietHoursEnd.value = prefs.quiet_hours_end || prefs.quietHoursEnd || '07:00'
        soundEnabled.value = prefs.sound_enabled !== false
        soundVolume.value = prefs.sound_volume || prefs.soundVolume || 0.5
        hapticEnabled.value = prefs.haptic_enabled !== false
        analyticsEnabled.value = prefs.analytics_enabled !== false
        crashReporting.value = prefs.crash_reporting !== false
        personalizedAds.value = prefs.personalized_ads || false
        dataSync.value = prefs.data_sync !== false
        autoLogin.value = prefs.auto_login !== false
        biometricAuth.value = prefs.biometric_auth || false
        sessionTimeout.value = prefs.session_timeout || prefs.sessionTimeout || 30
      }
    } catch (e) {
      console.error('[UserStore] Failed to load user profile:', e)
    }
  }

  // Sync user data to backend
  async function syncToBackend() {
    try {
      await updateProfile({
        studentId: studentId.value,
        name: name.value,
        grade: grade.value,
        subject: subject.value,
        textbookVersion: textbookVersion.value,
        xp: xp.value,
        level: level.value,
        streak: streak.value,
        longestStreak: longestStreak.value,
        lastStudyDate: lastStudyDate.value,
        totalStudyTime: totalStudyTime.value,
        todayStudyTime: todayStudyTime.value
      })

      // Sync preferences
      await updatePreferences({
        dailyGoal: dailyGoal.value,
        reminderTime: reminderTime.value,
        theme: theme.value,
        fontSize: fontSize.value,
        reducedMotion: reducedMotion.value,
        soundEnabled: soundEnabled.value,
        hapticEnabled: hapticEnabled.value,
        pushEnabled: pushEnabled.value,
        emailEnabled: emailEnabled.value,
        streakReminder: streakReminder.value,
        weeklyReport: weeklyReport.value,
        achievementAlerts: achievementAlerts.value,
        reminderTime: reminderTime.value,
        quietHoursStart: quietHoursStart.value,
        quietHoursEnd: quietHoursEnd.value,
        soundEnabled: soundEnabled.value,
        soundVolume: soundVolume.value,
        hapticEnabled: hapticEnabled.value,
        preferredSubjects: preferredSubjects.value,
        preferredDifficulty: preferredDifficulty.value,
        autoPlayAudio: autoPlayAudio.value,
        showHints: showHints.value,
        showExplanations: showExplanations.value,
        pushEnabled: pushEnabled.value,
        emailEnabled: emailEnabled.value,
        streakReminder: streakReminder.value,
        weeklyReport: weeklyReport.value,
        achievementAlerts: achievementAlerts.value,
        quietHoursStart: quietHoursStart.value,
        quietHoursEnd: quietHoursEnd.value,
        soundVolume: soundVolume.value,
        hapticEnabled: hapticEnabled.value,
        analyticsEnabled: analyticsEnabled.value,
        crashReporting: crashReporting.value,
        personalizedAds: personalizedAds.value,
        dataSync: dataSync.value,
        autoLogin: autoLogin.value,
        biometricAuth: biometricAuth.value,
        sessionTimeout: sessionTimeout.value
      })
    } catch (e) {
      console.error('[UserStore] Failed to sync to backend:', e)
    }
  }

  // 选科持久化（我的页 subject chip → PUT profile；K12 全学科，code 与后端对齐）
  async function setSubject(subj) {
    subject.value = subj
    try {
      await updateProfile({ studentId: studentId.value, subject: subj })
    } catch (e) {
      console.error('[UserStore] Failed to set subject:', e)
    }
  }

  return {
    // State
    studentId,
    name,
    avatar,
    grade,
    subject,
    textbookVersion,
    xp,
    level,
    streak,
    longestStreak,
    lastStudyDate,
    totalStudyTime,
    todayStudyTime,
    dailyGoal,
    reminderTime,
    theme,
    fontSize,
    reducedMotion,
    soundEnabled,
    hapticEnabled,
    pushEnabled,
    emailEnabled,
    streakReminder,
    weeklyReport,
    achievementAlerts,
    achievements,

    // Getters
    isLoggedIn,
    displayName,
    xpToNextLevel,
    xpProgress,
    streakStatus,
    unlockedAchievements,
    lockedAchievements,

    // Actions
    setStudent,
    setSubject,
    addXP,
    recordStudySession,
    updatePreferences,
    applyTheme,
    applyFontSize,
    applyReducedMotion,
    resetTodayStudyTime,
    syncFromAuth,
    reset,
    init,
    unlockAchievement,
    checkAchievements
  }
})

// 持久化配置
useUserStore.persist = {
  key: 'gri-user',
  storage: {
    getItem: (key) => {
      try {
        return uni.getStorageSync(key)
      } catch (e) {
        return null
      }
    },
    setItem: (key, value) => {
      try {
        uni.setStorageSync(key, value)
      } catch (e) {
        console.error('user store persist failed:', e)
      }
    }
  },
  paths: [
    'studentId', 'name', 'avatar', 'grade', 'subject', 'textbookVersion',
    'xp', 'level', 'streak', 'longestStreak', 'lastStudyDate',
    'totalStudyTime', 'todayStudyTime', 'dailyGoal', 'reminderTime', 'theme', 'fontSize',
    'reducedMotion', 'soundEnabled', 'hapticEnabled',
    'pushEnabled', 'emailEnabled', 'streakReminder', 'weeklyReport',
    'achievementAlerts', 'achievements',
    // Preferences
    'autoPlayAudio', 'showHints', 'showExplanations',
    'preferredSubjects', 'preferredDifficulty',
    // Notifications
    'quietHoursStart', 'quietHoursEnd',
    'soundEnabled', 'soundVolume', 'hapticEnabled',
    // Privacy & Data
    'analyticsEnabled', 'crashReporting', 'personalizedAds', 'dataSync',
    // Account
    'autoLogin', 'biometricAuth', 'sessionTimeout'
  ]
}

export default useUserStore