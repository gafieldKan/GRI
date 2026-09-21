/**
 * 学情报告状态管理 (Pinia Store)
 * 缓存报告数据、分析结果、导出功能
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getReport, getWrongQuestionList } from '@/api/index.js'
import { useUserStore } from './user.js'

// 学生业务主键统一从 user store 解出
function currentStudentId() {
  return useUserStore().studentId
}

export const useReportStore = defineStore('report', () => {
  // ─── State ───
  const reports = ref([])
  const currentReport = ref(null)
  const loading = ref(false)
  const error = ref(null)
  const lastFetched = ref(null)

  // 分析维度
  const abilityDimensions = ref([
    { key: 'memory', name: '记忆', desc: '基础知识记忆与回忆' },
    { key: 'understanding', name: '理解', desc: '概念理解与解释能力' },
    { key: 'application', name: '应用', desc: '知识迁移与解题应用' },
    { key: 'analysis', name: '分析', desc: '问题分解与逻辑推理' },
    { key: 'synthesis', name: '综合', desc: '综合运用与创新解题' }
  ])

  // ─── Getters ───
  const latestReport = computed(() => reports.value[0] || null)
  const hasReports = computed(() => reports.value.length > 0)

  const masteryTrend = computed(() => {
    // 返回最近 7 次报告的掌握度趋势
    return reports.value.slice(0, 7).reverse().map(r => ({
      date: r.generatedAt?.split('T')[0] || '',
      mastery: r.masteryScore || r.stats?.correctRate || 0
    }))
  })

  const topicMasteryTrend = computed(() => {
    // 按知识点的掌握度趋势
    const trends = {}
    reports.value.slice(0, 10).reverse().forEach(r => {
      r.masteryByKnowledge?.forEach(k => {
        if (!trends[k.name]) trends[k.name] = []
        trends[k.name].push({
          date: r.generatedAt?.split('T')[0] || '',
          mastery: k.mastery
        })
      })
    })
    return trends
  })

  // ─── Actions ───
  async function fetchReports(studentId = currentStudentId(), force = false) {
    if (reports.value.length > 0 && !force && lastFetched.value) {
      const age = Date.now() - new Date(lastFetched.value).getTime()
      if (age < 5 * 60 * 1000) return // 5分钟缓存
    }

    loading.value = true
    error.value = null
    try {
      const data = await getReport(studentId)
      reports.value = data || []
      if (reports.value.length > 0) {
        currentReport.value = reports.value[0]
      }
      lastFetched.value = new Date().toISOString()
      return reports.value
    } catch (e) {
      error.value = e.message
      console.error('[Report] Fetch failed:', e)
      throw e
    } finally {
      loading.value = false
    }
  }

  async function refreshCurrentReport(studentId = currentStudentId()) {
    return fetchReports(studentId, true)
  }

  function setCurrentReport(report) {
    currentReport.value = report
  }

  function clearReports() {
    reports.value = []
    currentReport.value = null
    lastFetched.value = null
  }

  // 导出报告
  function exportReport(format = 'json') {
    if (!currentReport.value) return null

    const data = {
      ...currentReport.value,
      exportedAt: new Date().toISOString(),
      version: '1.0'
    }

    if (format === 'json') {
      return JSON.stringify(data, null, 2)
    }

    // 可扩展 CSV、PDF 等格式
    return data
  }

  function downloadReport(format = 'json') {
    const content = exportReport(format)
    if (!content) return

    // #ifdef H5
    const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `学情报告_${new Date().toISOString().split('T')[0]}.${format === 'json' ? 'json' : 'txt'}`
    a.click()
    URL.revokeObjectURL(url)
    // #endif
  }

  // 生成分享卡片数据
  function generateShareCard() {
    if (!currentReport.value) return null

    const r = currentReport.value
    return {
      title: '我的学情报告',
      subtitle: `${r.subject || '数学'} · ${r.generatedAt?.split('T')[0] || '今日'}`,
      mastery: r.masteryScore || r.stats?.correctRate || 0,
      streak: r.stats?.studyDays || 0,
      totalQuestions: r.stats?.totalQuestions || 0,
      weakCount: r.masteryByKnowledge?.filter(k => k.mastery < 60).length || 0,
      strongCount: r.masteryByKnowledge?.filter(k => k.mastery >= 80).length || 0,
      topWeakness: r.masteryByKnowledge
        ?.filter(k => k.mastery < 60)
        .sort((a, b) => a.mastery - b.mastery)
        .slice(0, 3)
        .map(k => k.name) || [],
      suggestions: r.suggestions?.slice(0, 2) || []
    }
  }

  function reset() {
    reports.value = []
    currentReport.value = null
    loading.value = false
    error.value = null
    lastFetched.value = null
  }

  return {
    // State
    reports,
    currentReport,
    loading,
    error,
    lastFetched,
    abilityDimensions,

    // Getters
    latestReport,
    hasReports,
    masteryTrend,
    topicMasteryTrend,

    // Actions
    fetchReports,
    refreshCurrentReport,
    setCurrentReport,
    clearReports,
    exportReport,
    downloadReport,
    generateShareCard,
    reset
  }
})

// 持久化配置
useReportStore.persist = {
  key: 'gri-report',
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
        console.error('report store persist failed:', e)
      }
    }
  },
  paths: ['reports', 'currentReport']
}

export default useReportStore