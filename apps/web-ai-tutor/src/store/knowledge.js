/**
 * 知识图谱状态管理 (Pinia Store)
 * 管理学科知识树、知识点详情、掌握度、学习路径
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getKnowledgePoints, getKnowledgeGraph, listSubjects, listGrades } from '@/api/index.js'

// 前端图标/配色兜底（展示维度；学科清单真源是 /api/curriculum/subjects → ontology.subject）
const SUBJECTS = {
  math: { name: '数学', icon: '📐', color: '#4a6cf7' },
  phys: { name: '物理', icon: '⚡', color: '#faad14' },
  chem: { name: '化学', icon: '🧪', color: '#ff4d4f' },
  bio: { name: '生物', icon: '🧬', color: '#52c41a' },
  eng: { name: '英语', icon: '📖', color: '#722ed1' },
  chn: { name: '语文', icon: '📝', color: '#eb2f96' }
}

export const useKnowledgeStore = defineStore('knowledge', () => {
  // ─── State ───
  const currentSubject = ref('math')
  const currentGrade = ref(7)        // 数字年级（≡ ontology.grade code G7 后缀 / edu.knowledge_points.grade_level）
  const currentStage = ref('JUNIOR') // 学段（三级联动顶层）
  const subjects = ref([])           // /api/curriculum/subjects 真数
  const grades = ref([])             // /api/curriculum/grades 眤数（按学段分组）
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
  // 学科展示信息：真源清单优先，图标/配色前端兜底（新学科不丢展示）
  const subjectInfo = computed(() => {
    const real = subjects.value.find(s => s.code === currentSubject.value)
    const fallback = SUBJECTS[currentSubject.value] || SUBJECTS.math
    return { ...fallback, ...real, name: real?.name || fallback.name }
  })

  // 学科清单：真数优先（code 为 id，联动 subject= 参数），无真数时前端兜底
  const subjectList = computed(() => {
    if (subjects.value.length) {
      return subjects.value.map(s => ({
        id: s.code,
        ...(SUBJECTS[s.code] || { name: s.code, icon: '📚', color: '#4a6cf7' }),
        name: s.name || s.code
      }))
    }
    return Object.entries(SUBJECTS).map(([key, val]) => ({
      id: key,
      ...val
    }))
  })

  // 学段列表（真数；JUNIOR/SENIOR/PRIMARY）
  const stageList = computed(() => {
    const seen = new Map()
    for (const g of grades.value) {
      if (g.stage_code && !seen.has(g.stage_code)) seen.set(g.stage_code, { id: g.stage_code, name: g.stage_name })
    }
    return [...seen.values()]
  })

  // 当前学段的年级（三级联动中层）
  const gradesOfStage = computed(() =>
    grades.value.filter(g => !currentStage.value || g.stage_code === currentStage.value)
  )

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

  // 学段/年级/学科清单（三级联动数据源；游客可见目录端点）
  async function loadCatalog() {
    if (grades.value.length) return // 幂等
    try {
      const [subs, grs] = await Promise.all([listSubjects(), listGrades()])
      subjects.value = subs || []
      grades.value = grs || []
    } catch (e) {
      console.error('[Knowledge] Load catalog failed:', e)
    }
  }

  async function loadKnowledgePoints(subject = currentSubject.value, gradeLevel = currentGrade.value) {
    loading.value = true
    error.value = null
    try {
      const data = await getKnowledgePoints({ subject, gradeLevel })
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

  async function loadKnowledgeGraph(subject = currentSubject.value, gradeLevel = currentGrade.value) {
    loading.value = true
    error.value = null
    try {
      const data = await getKnowledgeGraph({ subject, gradeLevel })
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

  // 选科（三级联动动作）：学段→年级→学科，联动刷新知识点+图谱
  function setSubject(subject, gradeLevel = currentGrade.value) {
    currentSubject.value = subject
    currentGrade.value = gradeLevel
    loadKnowledgePoints(subject, gradeLevel)
    loadKnowledgeGraph(subject, gradeLevel)
  }

  function setStage(stage) {
    currentStage.value = stage
  }

  function setGrade(gradeLevel) {
    currentGrade.value = gradeLevel
    loadKnowledgePoints(currentSubject.value, gradeLevel)
    loadKnowledgeGraph(currentSubject.value, gradeLevel)
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
    currentGrade.value = 7
    currentStage.value = 'JUNIOR'
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
    currentStage,
    subjects,
    grades,
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
    stageList,
    gradesOfStage,
    pointsByTopic,
    masteryStats,
    weakPoints,
    getMastery,
    selectedPoint,

    // Actions
    loadCatalog,
    loadKnowledgePoints,
    loadKnowledgeGraph,
    setSubject,
    setStage,
    setGrade,
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