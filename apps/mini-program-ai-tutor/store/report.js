/**
 * 学情报告状态管理 (Pinia Store) — 小程序版
 * 管理学习统计数据、知识点掌握度和学习建议
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getReport } from '../api/index.js'

export const useReportStore = defineStore('report', () => {
  const stats = ref({
    studyDays: 0,
    totalQuestions: 0,
    accuracyRate: 0,
    improvement: 0
  })
  const masteryByKnowledge = ref([])
  const suggestions = ref([])
  const weaknessList = ref([])
  const isLoading = ref(false)
  const error = ref(null)

  const averageMastery = computed(() => {
    if (masteryByKnowledge.value.length === 0) return 0
    const sum = masteryByKnowledge.value.reduce((s, k) => s + k.mastery, 0)
    return Math.round(sum / masteryByKnowledge.value.length)
  })

  const weakPointsHighlight = computed(() => {
    return masteryByKnowledge.value.filter(k => k.mastery < 60)
  })

  async function loadReport(studentId) {
    isLoading.value = true
    error.value = null
    try {
      const data = await getReport(studentId)
      if (data.stats) {
        stats.value = data.stats
      }
      if (data.masteryByKnowledge) {
        masteryByKnowledge.value = data.masteryByKnowledge
      }
      if (data.suggestions) {
        suggestions.value = data.suggestions
      }
      if (data.weaknessList) {
        weaknessList.value = data.weaknessList
      }
      return data
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      isLoading.value = false
    }
  }

  function reset() {
    stats.value = { studyDays: 0, totalQuestions: 0, accuracyRate: 0, improvement: 0 }
    masteryByKnowledge.value = []
    suggestions.value = []
    weaknessList.value = []
    error.value = null
  }

  return {
    stats,
    masteryByKnowledge,
    suggestions,
    weaknessList,
    isLoading,
    error,
    averageMastery,
    weakPointsHighlight,
    loadReport,
    reset
  }
})