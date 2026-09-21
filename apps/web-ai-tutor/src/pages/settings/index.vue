<template>
  <ErrorBoundary :showDetails="true" :logError="true" :fallback="fallbackContent">
    <view class="page">
      <PageHeader title="设置" subtitle="个性化你的学习体验" />

      <scroll-view class="settings-content" scroll-y="true">
      <!-- 账号与安全 -->
      <view class="settings-section">
        <text class="section-title">账号与安全</text>
        <view class="settings-list">
          <SettingItem
            label="账号管理"
            desc="修改密码、绑定手机/邮箱"
            icon="👤"
            @click="goToAccount"
          />
          <SettingItem
            label="自动登录"
            desc="启用后下次打开自动登录"
            icon="🔐"
            :switch="settingsStore.autoLogin"
            @change="settingsStore.autoLogin = $event"
          />
          <SettingItem
            label="生物识别"
            desc="使用指纹/面容快速解锁"
            icon="👆"
            :switch="settingsStore.biometricAuth"
            @change="settingsStore.biometricAuth = $event"
          />
          <SettingItem
            label="会话超时"
            desc="长时间未操作自动退出登录"
            icon="⏱"
            :value="`${settingsStore.sessionTimeout} 天`"
            @click="changeSessionTimeout"
          />
        </view>
      </view>

      <!-- 通用设置 -->
      <view class="settings-section">
        <text class="section-title">通用设置</text>
        <view class="settings-list">
          <SettingItem
            label="主题模式"
            desc="选择浅色、深色或跟随系统"
            icon="🌓"
            :value="themeLabels[settingsStore.theme]"
            @click="showThemePicker"
          />
          <SettingItem
            label="字体大小"
            desc="调整界面字体显示大小"
            icon="🔤"
            :value="fontLabels[settingsStore.fontSize]"
            @click="showFontSizePicker"
          />
          <SettingItem
            label="默认难度"
            desc="练习题目默认难度等级"
            icon="📊"
            :value="difficultyLabels[settingsStore.preferredDifficulty]"
            @click="showDifficultyPicker"
          />
          <SettingItem
            label="每日目标"
            desc="设置每日学习时长目标"
            icon="🎯"
            :value="`${settingsStore.dailyGoal} 分钟`"
            @click="changeDailyGoal"
          />
          <SettingItem
            label="偏好学科"
            desc="选择常练习的学科方向"
            icon="📚"
            :value="formatSubjects"
            @click="manageSubjects"
          />
        </view>
      </view>

      <!-- 通知设置 -->
      <view class="settings-section">
        <text class="section-title">通知提醒</text>
        <view class="settings-list">
          <SettingItem
            label="提醒时间"
            desc="设置每日学习提醒时间"
            icon="⏰"
            :value="settingsStore.reminderTime"
            @click="changeReminderTime"
          />
          <SettingItem
            label="免打扰时段"
            desc="设置不接收通知的时间段"
            icon="🌙"
            :value="`${settingsStore.quietHoursStart} - ${settingsStore.quietHoursEnd}`"
            @click="changeQuietHours"
          />
          <SettingItem
            label="连续学习提醒"
            desc="连续学习天数中断时提醒"
            icon="🔥"
            :switch="settingsStore.streakReminder"
            @change="settingsStore.streakReminder = $event"
          />
          <SettingItem
            label="周报推送"
            desc="每周发送学习周报"
            icon="📊"
            :switch="settingsStore.weeklyReport"
            @change="settingsStore.weeklyReport = $event"
          />
          <SettingItem
            label="成就解锁提醒"
            desc="解锁新成就时通知"
            icon="🏆"
            :switch="settingsStore.achievementAlerts"
            @change="settingsStore.achievementAlerts = $event"
          />
        </view>
      </view>

      <!-- 音效与振动 -->
      <view class="settings-section">
        <text class="section-title">音效与振动</text>
        <view class="settings-list">
          <SettingItem
            label="音效开启"
            desc="开启后答题等操作有声音反馈"
            icon="🔊"
            :switch="settingsStore.soundEnabled"
            @change="settingsStore.soundEnabled = $event"
          />
          <SettingItem
            label="音量大小"
            desc="调整音效音量大小"
            icon="🔊"
            :value="`${Math.round(settingsStore.soundVolume * 100)}%`"
            @click="changeSoundVolume"
          />
          <SettingItem
            label="振动反馈"
            desc="开启后操作有振动反馈"
            icon="📳"
            :switch="settingsStore.hapticEnabled"
            @change="settingsStore.hapticEnabled = $event"
          />
        </view>
      </view>

      <!-- 隐私与数据 -->
      <view class="settings-section">
        <text class="section-title">隐私与数据</text>
        <view class="settings-list">
          <SettingItem
            label="数据统计"
            desc="允许收集匿名使用数据以改进服务"
            icon="📈"
            :switch="settingsStore.analyticsEnabled"
            @change="settingsStore.analyticsEnabled = $event"
          />
          <SettingItem
            label="崩溃报告"
            desc="自动发送崩溃日志帮助修复问题"
            icon="🐛"
            :switch="settingsStore.crashReporting"
            @change="settingsStore.crashReporting = $event"
          />
          <SettingItem
            label="个性化推荐"
            desc="基于学习数据提供个性化内容"
            icon="🎯"
            :switch="settingsStore.personalizedAds"
            @change="settingsStore.personalizedAds = $event"
          />
          <SettingItem
            label="数据同步"
            desc="多端同步学习进度和设置"
            icon="☁️"
            :switch="settingsStore.dataSync"
            @change="settingsStore.dataSync = $event"
          />
        </view>
      </view>

      <!-- 账号安全 -->
      <view class="settings-section">
        <text class="section-title">账号安全</text>
        <view class="settings-list">
          <SettingItem
            label="自动登录"
            desc="启用后下次打开自动登录"
            icon="🔐"
            :switch="settingsStore.autoLogin"
            @change="settingsStore.autoLogin = $event"
          />
          <SettingItem
            label="生物识别"
            desc="使用指纹/面容快速解锁"
            icon="👆"
            :switch="settingsStore.biometricAuth"
            @change="settingsStore.biometricAuth = $event"
          />
          <SettingItem
            label="会话超时"
            desc="长时间未操作自动退出登录"
            icon="⏱"
            :value="`${settingsStore.sessionTimeout} 天`"
            @click="changeSessionTimeout"
          />
        </view>
      </view>

      <!-- 数据管理 -->
      <view class="settings-section">
        <text class="section-title">数据管理</text>
        <view class="settings-list">
          <SettingItem
            label="导出数据"
            desc="导出学习数据和设置配置"
            icon="📤"
            @click="exportData"
          />
          <SettingItem
            label="清除缓存"
            desc="清理图片缓存和临时文件"
            icon="🧹"
            @click="clearCache"
          />
          <SettingItem
            label="重置设置"
            desc="恢复所有设置为默认值"
            icon="🔄"
            @click="resetSettings"
          />
          <SettingItem
            label="注销账号"
            desc="永久删除账号及所有数据"
            icon="🗑️"
            @click="deleteAccount"
          />
        </view>
      </view>

      <!-- 关于我们 -->
      <view class="settings-section">
        <text class="section-title">关于我们</text>
        <view class="settings-list">
          <SettingItem
            label="用户协议"
            desc="查看服务条款和用户协议"
            icon="📄"
            @click="openAgreement"
          />
          <SettingItem
            label="隐私政策"
            desc="了解我们如何保护您的隐私"
            icon="🔒"
            @click="openPrivacy"
          />
          <SettingItem
            label="意见反馈"
            desc="向我们提交建议或报告问题"
            icon="💬"
            @click="openFeedback"
          />
          <SettingItem
            label="检查更新"
            desc="检查是否有新版本可用"
            icon="🔄"
            @click="checkUpdate"
          />
          <SettingItem
            label="加入我们"
            desc="查看招聘信息，加入团队"
            icon="💼"
            @click="openRecruit"
          />
        </view>
      </view>

      <!-- 应用信息 -->
      <view class="app-info">
        <text>智学慧眼 SmartLens AI Tutor</text>
        <text>让学习更智能，让成长看得见</text>
      </view>

      <view class="safe-area" />
    </scroll-view>
  </view>
</ErrorBoundary>
</template>

<script>
import { ref, computed, onMounted, h } from 'vue'
import { useSettingsStore } from '@/store/settings'
import { useUserStore } from '@/store/user'
import PageHeader from '@/components/ui/PageHeader.vue'
import ErrorBoundary from '@/components/ErrorBoundary.vue'
import EmptyState from '@/components/ui/EmptyState.vue'

export default {
  name: 'Settings',
  components: {
    PageHeader,
    ErrorBoundary,
    EmptyState
  },
  setup() {
    const settingsStore = useSettingsStore()
    const userStore = useUserStore()

    const themeLabels = computed(() => ({
      light: '浅色模式',
      dark: '深色模式',
      auto: '跟随系统'
    }))

    const fontLabels = computed(() => ({
      small: '小',
      medium: '中',
      large: '大'
    }))

    const difficultyLabels = computed(() => ({
      easy: '简单',
      medium: '中等',
      hard: '困难'
    }))

    const formatSubjects = computed(() => {
      const subjectNames = {
        math: '数学',
        physics: '物理',
        chemistry: '化学',
        biology: '生物',
        english: '英语',
        chinese: '语文'
      }
      return settingsStore.preferredSubjects
        .map(id => subjectNames[id] || id)
        .join('、')
    })

    const showThemePicker = () => {
      uni.showActionSheet({
        itemList: Object.values(themeLabels.value),
        success: (res) => {
          const keys = Object.keys(themeLabels.value)
          settingsStore.setTheme(keys[res.tapIndex])
        }
      })
    }

    const showFontSizePicker = () => {
      uni.showActionSheet({
        itemList: Object.values(fontLabels.value),
        success: (res) => {
          const keys = Object.keys(fontLabels.value)
          settingsStore.setFontSize(keys[res.tapIndex])
        }
      })
    }

    const showDifficultyPicker = () => {
      uni.showActionSheet({
        itemList: Object.values(difficultyLabels.value),
        success: (res) => {
          const keys = Object.keys(difficultyLabels.value)
          settingsStore.setPreferredDifficulty(keys[res.tapIndex])
        }
      })
    }

    const changeDailyGoal = () => {
      uni.showModal({
        title: '设置每日目标',
        content: '建议 15-60 分钟',
        editable: true,
        placeholderText: String(settingsStore.dailyGoal),
        success: (res) => {
          if (res.confirm && res.content) {
            const val = parseInt(res.content)
            if (!isNaN(val) && val >= 5 && val <= 120) {
              settingsStore.setDailyGoal(val)
              uni.showToast({ title: '设置成功', icon: 'success' })
            } else {
              uni.showToast({ title: '请输入 5-120 之间的数字', icon: 'none' })
            }
          }
        }
      })
    }

    const manageSubjects = () => {
      const allSubjects = [
        { id: 'math', name: '数学', icon: '📐' },
        { id: 'physics', name: '物理', icon: '⚡' },
        { id: 'chemistry', name: '化学', icon: '🧪' },
        { id: 'biology', name: '生物', icon: '🧬' },
        { id: 'english', name: '英语', icon: '📖' },
        { id: 'chinese', name: '语文', icon: '📝' }
      ]

      uni.showActionSheet({
        itemList: allSubjects.map(s => `${settingsStore.preferredSubjects.includes(s.id) ? '✓ ' : ''}${s.icon} ${s.name}`),
        success: (res) => {
          const subject = allSubjects[res.tapIndex]
          settingsStore.toggleSubject(subject.id)
        }
      })
    }

    const changeReminderTime = () => {
      // 简化处理，实际应使用时间选择器
      uni.showModal({
        title: '设置提醒时间',
        editable: true,
        placeholderText: settingsStore.reminderTime,
        success: (res) => {
          if (res.confirm && res.content) {
            settingsStore.setReminderTime(res.content)
          }
        }
      })
    }

    const changeQuietHours = () => {
      uni.showModal({
        title: '设置免打扰时段',
        content: '格式：开始时间-结束时间，如 22:00-07:00',
        editable: true,
        placeholderText: `${settingsStore.quietHoursStart} - ${settingsStore.quietHoursEnd}`,
        success: (res) => {
          if (res.confirm && res.content) {
            const [start, end] = res.content.split('-').map(s => s.trim())
            if (start && end) {
              settingsStore.setQuietHours(start, end)
            }
          }
        }
      })
    }

    const changeSoundVolume = () => {
      uni.showModal({
        title: '设置音量',
        content: '0-100',
        editable: true,
        placeholderText: String(Math.round(settingsStore.soundVolume * 100)),
        success: (res) => {
          if (res.confirm && res.content) {
            const val = parseInt(res.content)
            if (!isNaN(val) && val >= 0 && val <= 100) {
              settingsStore.setSoundVolume(val / 100)
            }
          }
        }
      })
    }

    const changeSessionTimeout = () => {
      uni.showActionSheet({
        itemList: ['7天', '15天', '30天', '60天', '90天', '永不过期'],
        success: (res) => {
          const days = [7, 15, 30, 60, 90, 3650]
          settingsStore.sessionTimeout = days[res.tapIndex]
        }
      })
    }

    const exportData = () => {
      const data = {
        user: userStore.exportSettings ? userStore.exportSettings() : {},
        settings: settingsStore.exportSettings(),
        exportedAt: new Date().toISOString()
      }

      // #ifdef H5
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `智学慧眼数据_${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
      // #endif

      uni.showToast({ title: '导出成功', icon: 'success' })
    }

    const clearCache = () => {
      uni.showModal({
        title: '确认清除缓存？',
        content: '将清除图片缓存、临时文件等，不影响学习数据和云端同步',
        confirmColor: '#ff4d4f',
        success: (res) => {
          if (res.confirm) {
            // #ifdef H5
            if (typeof caches !== 'undefined') {
              caches.keys().then(names => {
                names.forEach(name => caches.delete(name))
              })
            }
            // #endif
            uni.clearStorageSync?.()
            uni.showToast({ title: '缓存已清除', icon: 'success' })
          }
        }
      })
    }

    const resetSettings = () => {
      uni.showModal({
        title: '确认重置所有设置？',
        content: '将恢复出厂默认配置，此操作不可撤销',
        confirmColor: '#ff4d4f',
        success: (res) => {
          if (res.confirm) {
            settingsStore.resetToDefaults()
            uni.showToast({ title: '已重置', icon: 'success' })
          }
        }
      })
    }

    const deleteAccount = () => {
      uni.showModal({
        title: '⚠️ 确认注销账号？',
        content: '此操作将永久删除你的账号、学习记录、成就、错题本等所有数据，不可恢复。请慎重考虑。',
        confirmText: '确认注销',
        confirmColor: '#ff4d4f',
        success: (res) => {
          if (res.confirm) {
            uni.showModal({
              title: '最后确认',
              content: '输入"DELETE"确认注销',
              editable: true,
              placeholderText: 'DELETE',
              success: (res2) => {
                if (res2.confirm && res2.content === 'DELETE') {
                  userStore.reset()
                  settingsStore.resetToDefaults()
                  uni.reLaunch({ url: '/pages/login/login' })
                  uni.showToast({ title: '账号已注销', icon: 'success' })
                }
              }
            })
          }
        }
      })
    }

    const openAgreement = () => uni.navigateTo({ url: '/webview?url=agreement' })
    const openPrivacy = () => uni.navigateTo({ url: '/webview?url=privacy' })
    const openFeedback = () => uni.navigateTo({ url: '/webview?url=feedback' })
    const checkUpdate = () => uni.showToast({ title: '当前已是最新版本', icon: 'success' })
    const openRecruit = () => uni.navigateTo({ url: '/webview?url=recruit' })

    onMounted(() => {
      settingsStore.init()
    })

    return {
      settingsStore,
      userStore,
      themeLabels,
      fontLabels,
      difficultyLabels,
      formatSubjects,
      showThemePicker,
      showFontSizePicker,
      showDifficultyPicker,
      changeDailyGoal,
      manageSubjects,
      changeReminderTime,
      changeQuietHours,
      changeSoundVolume,
      changeSessionTimeout,
      exportData,
      clearCache,
      resetSettings,
      deleteAccount,
      openAgreement,
      openPrivacy,
      openFeedback,
      checkUpdate,
      openRecruit,
      fallbackContent: () => h(EmptyState, {
        title: '设置加载失败',
        description: '无法加载设置页面，请稍后重试',
        icon: '⚙️',
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

.settings-content {
  flex: 1;
  padding-bottom: 40px;
}

.settings-section {
  background: #fff;
  border-radius: 16px;
  margin: 12px 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  border: 1px solid var(--color-border, #e8e8f0);
}

.section-title {
  display: block;
  padding: 16px;
  font-size: 14px;
  font-weight: 600;
  color: #999;
  background: var(--color-bg-secondary, #f0f0f5);
  border-top-left-radius: 16px;
  border-top-right-radius: 16px;
  border-bottom: 1px solid var(--color-border, #e8e8f0);
}

.settings-list {
  padding: 8px 0;
}

.setting-item {
  display: flex;
  align-items: center;
  padding: 14px 16px;
  background: #fff;
  cursor: pointer;
  transition: background var(--transition-fast);
}

.setting-item:active {
  background: var(--color-bg-secondary, #f0f0f5);
}

.setting-icon {
  font-size: 20px;
  margin-right: 12px;
  width: 28px;
  text-align: center;
}

.setting-content {
  flex: 1;
  min-width: 0;
}

.setting-label {
  display: block;
  font-size: 15px;
  font-weight: 500;
  color: #1a1a2e;
  margin-bottom: 2px;
}

.setting-desc {
  display: block;
  font-size: 12px;
  color: #999;
}

.setting-value {
  font-size: 13px;
  color: #4a6cf7;
  font-weight: 500;
  margin-left: auto;
}

.setting-switch {
  position: relative;
  width: 52px;
  height: 28px;
  margin-left: 12px;
}

.setting-switch-input {
  width: 100%;
  height: 100%;
  appearance: none;
  background: #d9d9d9;
  border-radius: 14px;
  outline: none;
  transition: background var(--transition-fast);
}

.setting-switch-input:checked {
  background: #4a6cf7;
}

.setting-switch-input::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 24px;
  height: 24px;
  background: #fff;
  border-radius: 50%;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: transform var(--transition-fast);
}

.setting-switch-input:checked::after {
  transform: translateX(24px);
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .page {
    background: var(--color-bg-primary, #1a1a2e);
  }

  .settings-section {
    background: var(--color-bg-card, #252542);
    border-color: var(--color-border, #3d3d5c);
  }

  .section-title {
    background: var(--color-bg-elevated, #2d2d4a);
    border-color: var(--color-border, #3d3d5c);
    color: var(--color-text-tertiary, #888);
  }

  .setting-item:active {
    background: var(--color-bg-elevated, #2d2d4a);
  }

  .setting-label {
    color: var(--color-text-primary, #e8e8f0);
  }

  .setting-desc {
    color: var(--color-text-tertiary, #888);
  }

  .setting-value {
    color: var(--color-primary, #7c94ff);
  }

  .setting-switch-input {
    background: #3d3d5c;
  }

  .setting-switch-input:checked {
    background: #7c94ff;
  }

  .app-info {
    color: var(--color-text-tertiary, #888);
  }
}

.app-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 16px;
  color: #999;
  font-size: 12px;
  gap: 4px;
}

.safe-area {
  height: 40px;
}
</style>