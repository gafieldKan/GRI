/**
 * 学生数字孪生状态管理 (Pinia Store)
 *
 * 人本论：孪生是「人本体」的运行时。前端只做「读取 + 触发」，全部真源在后端装配：
 *   profile(身份) / state(状态) / world(世界) / events(经历) / memories(记忆)。
 * 语义镜像原型 PERSONA C1 的孪生引擎（此处为读侧 + 触发侧，写侧由后端事件溯源）。
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getTwinOverview, getTwinEvents, updateTwinProfile, backfillTwin } from '@/api/index.js'

const EMPTY_STATE = {
  subject: 'math',
  gradeLevel: null,
  gradeName: null,
  scene: null,
  progress: { totalAnswered: 0, correctCount: 0, accuracy: 0, practiceSessions: 0, unresolvedWrong: 0 },
  mastery: { avg: 0, mastered: 0, learning: 0, weak: 0, total: 0 },
  skills: [],
  relations: { teacher: { interactions: 0, bond: 0 } }
}

export const useTwinStore = defineStore('twin', () => {
  // ─── State ───
  const profile = ref(null)      // 身份（稳定属性）
  const state = ref(null)        // 状态（可变属性，行动驱动）
  const world = ref(null)        // 世界（学科版图：节点=知识域，航线=前置）
  const events = ref([])         // 经历（append-only 时间线）
  const memories = ref([])       // 长期记忆（agent.memory）
  const generatedAt = ref(null)  // 装配时间戳
  const loading = ref(false)
  const error = ref(null)

  // ─── Getters ───
  const loaded = computed(() => !!profile.value)
  const skills = computed(() => state.value?.skills ?? [])
  const mastery = computed(() => state.value?.mastery ?? EMPTY_STATE.mastery)
  const progress = computed(() => state.value?.progress ?? EMPTY_STATE.progress)
  const scene = computed(() => state.value?.scene ?? null)
  const teacherBond = computed(() => state.value?.relations?.teacher ?? EMPTY_STATE.relations.teacher)
  const fields = computed(() => world.value?.fields ?? [])
  const areas = computed(() => world.value?.areas ?? [])

  // 世界概览统计（诚实口径：节点粒度近似）
  const worldStats = computed(() => world.value?.stats ?? { total: 0, k12: 0, frontier: 0, coverageRatio: 0, byGrade: {} })

  // 近期经历（装配已按时间的倒序返回）
  const recentEvents = computed(() => events.value.slice(0, 5))

  // 显示名兜底
  const displayName = computed(() => profile.value?.name || '学习者')
  const gradeName = computed(() => profile.value?.gradeName || '')
  const avatarUrl = computed(() => profile.value?.avatarUrl || '')

  // ─── Actions ───

  // 装配总览（登录后/首页 onShow 调用；subject 缺省用当前学科）
  async function loadOverview(subject) {
    loading.value = true
    error.value = null
    try {
      const data = await getTwinOverview(subject)
      profile.value = data?.profile ?? null
      state.value = data?.state ?? null
      world.value = data?.world ?? null
      events.value = Array.isArray(data?.events) ? data.events : []
      memories.value = Array.isArray(data?.memories) ? data.memories : []
      generatedAt.value = data?.generatedAt ?? null
      return data
    } catch (e) {
      error.value = e?.message || '孪生装配失败'
      console.error('[Twin] Load overview failed:', e)
      return null
    } finally {
      loading.value = false
    }
  }

  // 拉取更长的行为时间线（memory 页翻页用）
  async function loadEvents(limit = 50) {
    try {
      const list = await getTwinEvents(limit)
      if (Array.isArray(list) && list.length) events.value = list
      return events.value
    } catch (e) {
      console.error('[Twin] Load events failed:', e)
      return events.value
    }
  }

  // 更新人物画像 → 后端落库 + 记 profile 经历；成功后刷新总览
  async function saveProfile(patch) {
    try {
      await updateTwinProfile(patch)
      await loadOverview(state.value?.subject)
      return true
    } catch (e) {
      console.error('[Twin] Save profile failed:', e)
      return false
    }
  }

  // 历史经历回填（老账号的「行为与记忆」不空白；幂等）
  async function backfill() {
    try {
      const r = await backfillTwin()
      if (r && !r.skipped) await loadOverview(state.value?.subject)
      return r
    } catch (e) {
      console.error('[Twin] Backfill failed:', e)
      return { created: 0, skipped: true }
    }
  }

  function reset() {
    profile.value = null
    state.value = null
    world.value = null
    events.value = []
    memories.value = []
    generatedAt.value = null
    loading.value = false
    error.value = null
  }

  return {
    // State
    profile, state, world, events, memories, generatedAt, loading, error,
    // Getters
    loaded, skills, mastery, progress, scene, teacherBond, fields, areas, worldStats,
    recentEvents, displayName, gradeName, avatarUrl,
    // Actions
    loadOverview, loadEvents, saveProfile, backfill, reset
  }
})

export default useTwinStore
