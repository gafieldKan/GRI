/**
 * 设置状态管理 (Pinia Store)
 * 管理应用偏好、通知、账号、数据、关于
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useSettingsStore = defineStore('settings', () => {
  // ─── State ───
  // 外观
  const theme = ref('auto') // 'light' | 'dark' | 'auto'
  const fontSize = ref('medium') // 'small' | 'medium' | 'large'
  const reducedMotion = ref(false)
  const compactMode = ref(false)
  const highContrast = ref(false)

  // 学习偏好
  const dailyGoal = ref(15) // 分钟
  const preferredSubjects = ref(['math'])
  const preferredDifficulty = ref('adaptive') // 'easy' | 'medium' | 'hard' | 'adaptive'
  const autoPlayAudio = ref(false)
  const showHints = ref(true)
  const showExplanations = ref(true)

  // 通知
  const pushEnabled = ref(true)
  const emailEnabled = ref(false)
  const streakReminder = ref(true)
  const weeklyReport = ref(true)
  const achievementAlerts = ref(true)
  const reminderTime = ref('20:00')
  const quietHoursStart = ref('22:00')
  const quietHoursEnd = ref('07:00')

  // 声音与触觉
  const soundEnabled = ref(true)
  const soundVolume = ref(0.5)
  const hapticEnabled = ref(true)

  // 数据与隐私
  const analyticsEnabled = ref(true)
  const crashReporting = ref(true)
  const personalizedAds = ref(false)
  const dataSync = ref(true) // 云端同步

  // 账号
  const autoLogin = ref(true)
  const biometricAuth = ref(false)
  const sessionTimeout = ref(30) // 天

  // ─── Getters ───
  const themeOptions = computed(() => [
    { value: 'light', label: '浅色模式', icon: '☀️' },
    { value: 'dark', label: '深色模式', icon: '🌙' },
    { value: 'auto', label: '跟随系统', icon: '💻' }
  ])

  const fontSizeOptions = computed(() => [
    { value: 'small', label: '小', scale: 0.9 },
    { value: 'medium', label: '中', scale: 1.0 },
    { value: 'large', label: '大', scale: 1.15 }
  ])

  const difficultyOptions = computed(() => [
    { value: 'easy', label: '简单', desc: '基础题为主' },
    { value: 'medium', label: '中等', desc: '均衡分布' },
    { value: 'hard', label: '困难', desc: '挑战题为主' },
    { value: 'adaptive', label: '自适应', desc: '根据表现调整' }
  ])

  const isDarkMode = computed(() => {
    if (theme.value === 'dark') return true
    if (theme.value === 'light') return false
    // auto
    // #ifdef H5
    return window.matchMedia('(prefers-color-scheme: dark)').matches
    // #endif
    // #ifdef MP-WEIXIN
    return uni.getStorageSync('theme') === 'dark'
    // #endif
  })

  const fontScale = computed(() => {
    const option = fontSizeOptions.value.find(o => o.value === fontSize.value)
    return option?.scale || 1.0
  })

  // ─── Actions ───
  function setTheme(value) {
    theme.value = value
    applyTheme()
  }

  function applyTheme() {
    // #ifdef H5
    const root = document.documentElement
    if (isDarkMode.value) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    // #endif
    // #ifdef MP-WEIXIN
    uni.setStorageSync('theme', theme.value)
    // #endif
  }

  function setFontSize(value) {
    fontSize.value = value
    applyFontSize()
  }

  function applyFontSize() {
    // #ifdef H5
    const root = document.documentElement
    root.classList.remove('font-small', 'font-medium', 'font-large')
    root.classList.add(`font-${fontSize.value}`)
    // #endif
  }

  function setReducedMotion(value) {
    reducedMotion.value = value
    applyReducedMotion()
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

  function setCompactMode(value) {
    compactMode.value = value
    // #ifdef H5
    if (value) {
      document.documentElement.classList.add('compact-mode')
    } else {
      document.documentElement.classList.remove('compact-mode')
    }
    // #endif
  }

  function setHighContrast(value) {
    highContrast.value = value
    // #ifdef H5
    if (value) {
      document.documentElement.classList.add('high-contrast')
    } else {
      document.documentElement.classList.remove('high-contrast')
    }
    // #endif
  }

  function setDailyGoal(value) {
    dailyGoal.value = Math.max(5, Math.min(120, value))
  }

  function toggleSubject(subject) {
    const idx = preferredSubjects.value.indexOf(subject)
    if (idx >= 0) {
      if (preferredSubjects.value.length > 1) {
        preferredSubjects.value.splice(idx, 1)
      }
    } else {
      preferredSubjects.value.push(subject)
    }
  }

  function setPreferredDifficulty(value) {
    preferredDifficulty.value = value
  }

  function setReminderTime(value) {
    reminderTime.value = value
  }

  function setQuietHours(start, end) {
    quietHoursStart.value = start
    quietHoursEnd.value = end
  }

  function setSoundVolume(value) {
    soundVolume.value = Math.max(0, Math.min(1, value))
  }

  function togglePush(enabled) {
    pushEnabled.value = enabled
    if (!enabled) {
      streakReminder.value = false
      weeklyReport.value = false
      achievementAlerts.value = false
    }
  }

  function toggleEmail(enabled) {
    emailEnabled.value = enabled
  }

  function resetToDefaults() {
    theme.value = 'auto'
    fontSize.value = 'medium'
    reducedMotion.value = false
    compactMode.value = false
    highContrast.value = false
    dailyGoal.value = 15
    preferredSubjects.value = ['math']
    preferredDifficulty.value = 'adaptive'
    autoPlayAudio.value = false
    showHints.value = true
    showExplanations.value = true
    pushEnabled.value = true
    emailEnabled.value = false
    streakReminder.value = true
    weeklyReport.value = true
    achievementAlerts.value = true
    reminderTime.value = '20:00'
    quietHoursStart.value = '22:00'
    quietHoursEnd.value = '07:00'
    soundEnabled.value = true
    soundVolume.value = 0.5
    hapticEnabled.value = true
    analyticsEnabled.value = true
    crashReporting.value = true
    personalizedAds.value = false
    dataSync.value = true
    autoLogin.value = true
    biometricAuth.value = false
    sessionTimeout.value = 30

    applyTheme()
    applyFontSize()
    applyReducedMotion()
    setCompactMode(false)
    setHighContrast(false)
  }

  function exportSettings() {
    return {
      theme: theme.value,
      fontSize: fontSize.value,
      reducedMotion: reducedMotion.value,
      compactMode: compactMode.value,
      highContrast: highContrast.value,
      dailyGoal: dailyGoal.value,
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
      reminderTime: reminderTime.value,
      quietHoursStart: quietHoursStart.value,
      quietHoursEnd: quietHoursEnd.value,
      soundEnabled: soundEnabled.value,
      soundVolume: soundVolume.value,
      hapticEnabled: hapticEnabled.value,
      analyticsEnabled: analyticsEnabled.value,
      crashReporting: crashReporting.value,
      personalizedAds: personalizedAds.value,
      dataSync: dataSync.value,
      autoLogin: autoLogin.value,
      biometricAuth: biometricAuth.value,
      sessionTimeout: sessionTimeout.value
    }
  }

  function importSettings(data) {
    Object.keys(data).forEach(key => {
      if (key in this) {
        this[key].value = data[key]
      }
    })
    applyTheme()
    applyFontSize()
    applyReducedMotion()
    setCompactMode(compactMode.value)
    setHighContrast(highContrast.value)
  }

  function init() {
    applyTheme()
    applyFontSize()
    applyReducedMotion()
    setCompactMode(compactMode.value)
    setHighContrast(highContrast.value)

    // 监听系统主题变化
    // #ifdef H5
    if (theme.value === 'auto') {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme)
    }
    // #endif
  }

  return {
    // State
    theme,
    fontSize,
    reducedMotion,
    compactMode,
    highContrast,
    dailyGoal,
    preferredSubjects,
    preferredDifficulty,
    autoPlayAudio,
    showHints,
    showExplanations,
    pushEnabled,
    emailEnabled,
    streakReminder,
    weeklyReport,
    achievementAlerts,
    reminderTime,
    quietHoursStart,
    quietHoursEnd,
    soundEnabled,
    soundVolume,
    hapticEnabled,
    analyticsEnabled,
    crashReporting,
    personalizedAds,
    dataSync,
    autoLogin,
    biometricAuth,
    sessionTimeout,

    // Getters
    themeOptions,
    fontSizeOptions,
    difficultyOptions,
    isDarkMode,
    fontScale,

    // Actions
    setTheme,
    setFontSize,
    setReducedMotion,
    setCompactMode,
    setHighContrast,
    setDailyGoal,
    toggleSubject,
    setPreferredDifficulty,
    setReminderTime,
    setQuietHours,
    setSoundVolume,
    togglePush,
    toggleEmail,
    resetToDefaults,
    exportSettings,
    importSettings,
    init,
    applyTheme,
    applyFontSize,
    applyReducedMotion
  }
})

// 持久化配置
useSettingsStore.persist = {
  key: 'gri-settings',
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
        console.error('settings store persist failed:', e)
      }
    }
  },
  paths: [
    'theme', 'fontSize', 'reducedMotion', 'compactMode', 'highContrast',
    'dailyGoal', 'preferredSubjects', 'preferredDifficulty',
    'autoPlayAudio', 'showHints', 'showExplanations',
    'pushEnabled', 'emailEnabled', 'streakReminder', 'weeklyReport',
    'achievementAlerts', 'reminderTime', 'quietHoursStart', 'quietHoursEnd',
    'soundEnabled', 'soundVolume', 'hapticEnabled',
    'analyticsEnabled', 'crashReporting', 'personalizedAds', 'dataSync',
    'autoLogin', 'biometricAuth', 'sessionTimeout'
  ]
}

export default useSettingsStore