/**
 * 知识图谱状态管理 (Pinia Store)
 * 管理学科知识树、知识点详情、掌握度、学习路径
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getKnowledgePoints, getKnowledgeGraph } from '@/api/index.js'

// 学科配置
const SUBJECTS = {
  math: { name: '数学', icon: '📐', color: '#4a6cf7' },
  physics: { name: '物理', icon: '⚡', color: '#faad14' },
  chemistry: { name: '化学', icon: '🧪', color: '#ff4d4f' },
  biology: { name: '生物', icon: '🧬', color: '#52c41a' },
  english: { name: '英语', icon: '📖', color: '#722ed1' },
  chinese: { name: '语文', icon: '📝', color: '#eb2f96' }
}

export const useKnowledgeStore = defineStore('knowledge', () => {
  // ─── State ───
  const currentSubject = ref('math')
  const currentGrade = ref('八年级')
  const knowledgeTree = ref([])
  const knowledgePoints = ref([])
  const masteryMap = ref({}) // { pointId: masteryValue 0-1 }
  const graphData = ref({ nodes: [], edges: [] })
  const selectedPointId = ref(null)
  const loading = ref(false)
  const error = ref(null)

  // 学习路径推荐
  const learningPath = ref([])
  const nextRecommended = ref(null)

  // ─── Getters ───
  const subjectInfo = computed(() => SUBJECTS[currentSubject.value] || SUBJECTS.math)

  const subjectList = computed(() => Object.entries(SUBJECTS).map(([key, val]) => ({
    id: key,
    ...val
  })))

  const pointsByTopic = computed(() => {
    const grouped = {}
    knowledgePoints.value.forEach(p => {
      const topic = p.topic || p.chapter || '未分类'
      if (!grouped[topic]) grouped[topic] = []
      grouped[topic].push(p)
    })
    return grouped
  })

  const masteryStats = computed(() => {
    const values = Object.values(masteryMap.value)
    if (values.length === 0) return { avg: 0, mastered: 0, learning: 0, weak: 0, total: 0 }
    const avg = values.reduce((a, b) => a + b, 0) / values.length
    return {
      avg: Math.round(avg * 100),
      mastered: values.filter(v => v >= 0.8).length,
      learning: values.filter(v => v >= 0.5 && v < 0.8).length,
      weak: values.filter(v => v < 0.5).length,
      total: values.length
    }
  })

  const weakPoints = computed(() =>
    knowledgePoints.value
      .filter(p => (masteryMap.value[p.id] || 0) < 0.6)
      .sort((a, b) => (masteryMap.value[a.id] || 0) - (masteryMap.value[b.id] || 0))
      .slice(0, 10)
  )

  const getMastery = (pointId) => masteryMap.value[pointId] || 0

  const selectedPoint = computed(() =>
    knowledgePoints.value.find(p => p.id === selectedPointId.value)
  )

  // ─── Actions ───
  async function loadKnowledgePoints(subject = currentSubject.value, grade = currentGrade.value) {
    loading.value = true
    error.value = null
    try {
      const data = await getKnowledgePoints({ subject, grade })
      knowledgePoints.value = data || []
      // 初始化 masteryMap
      data?.forEach(p => {
        if (!(p.id in masteryMap.value)) {
          masteryMap.value[p.id] = p.mastery || 0
        }
      })
    } catch (e) {
      error.value = e.message
      console.error('[Knowledge] Load points failed:', e)
    } finally {
      loading.value = false
    }
  }

  async function loadKnowledgeGraph(subject = currentSubject.value, grade = currentGrade.value) {
    loading.value = true
    error.value = null
    try {
      const data = await getKnowledgeGraph(subject, grade)
      if (data) {
        graphData.value = {
          nodes: data.nodes || [],
          edges: data.edges || []
        }
        // 同步 knowledgeTree
        knowledgeTree.value = buildTree(data.nodes, data.edges)
      }
    } catch (e) {
      error.value = e.message
      console.error('[Knowledge] Load graph failed:', e)
    } finally {
      loading.value = false
    }
  }

  function buildTree(nodes, edges) {
    const nodeMap = {}
    nodes.forEach(n => {
      nodeMap[n.id] = { ...n, children: [] }
    })
    edges.forEach(e => {
      if (nodeMap[e.source] && nodeMap[e.target]) {
        nodeMap[e.source].children.push(nodeMap[e.target])
      }
    })
    // 返回根节点（没有被指向的节点）
    const hasParent = new Set(edges.map(e => e.target))
    return nodes.filter(n => !hasParent.has(n.id)).map(n => nodeMap[n.id])
  }

  function setSubject(subject, grade) {
    currentSubject.value = subject
    currentGrade.value = grade
    loadKnowledgePoints(subject, grade)
    loadKnowledgeGraph(subject, grade)
  }

  function selectPoint(pointId) {
    selectedPointId.value = pointId
  }

  function updateMastery(pointId, value) {
    masteryMap.value[pointId] = Math.max(0, Math.min(1, value))
    // 同步到 knowledgePoints
    const point = knowledgePoints.value.find(p => p.id === pointId)
    if (point) point.mastery = masteryMap.value[pointId]
  }

  function batchUpdateMastery(updates) {
    updates.forEach(({ id, mastery }) => {
      updateMastery(id, mastery)
    })
  }

  function calculateLearningPath() {
    // 基于掌握度和前置关系计算推荐学习路径
    const nodes = graphData.value.nodes
    const edges = graphData.value.edges

    if (!nodes.length) return []

    // 找出掌握度 < 0.6 的节点
    const weakNodes = nodes.filter(n => (masteryMap.value[n.id] || 0) < 0.6)

    // 简单拓扑排序：优先推荐前置节点已掌握的弱节点
    const path = weakNodes
      .filter(n => {
        const prereqs = edges
          .filter(e => e.target === n.id)
          .map(e => e.source)
        return prereqs.every(p => (masteryMap.value[p] || 0) >= 0.6)
      })
      .sort((a, b) => (masteryMap.value[a.id] || 0) - (masteryMap.value[b.id] || 0))
      .slice(0, 5)

    learningPath.value = path
    nextRecommended.value = path[0] || null
    return path
  }

  function getPrerequisites(pointId) {
    return graphData.value.edges
      .filter(e => e.target === pointId)
      .map(e => graphData.value.nodes.find(n => n.id === e.source))
      .filter(Boolean)
  }

  function getDependents(pointId) {
    return graphData.value.edges
      .filter(e => e.source === pointId)
      .map(e => graphData.value.nodes.find(n => n.id === e.target))
      .filter(Boolean)
  }

  async function syncMasteryFromReport(reportData) {
    if (!reportData?.masteryByKnowledge) return

    reportData.masteryByKnowledge.forEach(k => {
      updateMastery(k.name, k.mastery / 100)
    })

    calculateLearningPath()
  }

  function reset() {
    currentSubject.value = 'math'
    currentGrade.value = '八年级'
    knowledgeTree.value = []
    knowledgePoints.value = []
    masteryMap.value = {}
    graphData.value = { nodes: [], edges: [] }
    selectedPointId.value = null
    learningPath.value = []
    nextRecommended.value = null
    loading.value = false
    error.value = null
  }

  return {
    // State
    currentSubject,
    currentGrade,
    knowledgeTree,
    knowledgePoints,
    masteryMap,
    graphData,
    selectedPointId,
    loading,
    error,
    learningPath,
    nextRecommended,

    // Getters
    subjectInfo,
    subjectList,
    pointsByTopic,
    masteryStats,
    weakPoints,
    getMastery,
    selectedPoint,

    // Actions
    loadKnowledgePoints,
    loadKnowledgeGraph,
    setSubject,
    selectPoint,
    updateMastery,
    batchUpdateMastery,
    calculateLearningPath,
    getPrerequisites,
    getDependents,
    syncMasteryFromReport,
    reset
  }
})

// 持久化配置
useKnowledgeStore.persist = {
  key: 'gri-knowledge',
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
        console.error('knowledge store persist failed:', e)
      }
    }
  },
  paths: [
    'currentSubject', 'currentGrade',
    'masteryMap', 'learningPath', 'nextRecommended',
    'knowledgePoints', 'graphData', 'knowledgeTree',
    'selectedPointId', 'loading', 'error'
  ]
}

export default useKnowledgeStore