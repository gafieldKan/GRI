<template>
  <view class="page">
    <PageHeader
      title="知识图谱"
      subtitle="可视化知识体系，构建完整认知网络"
      :actions="[{ label: '切换学科', handler: showSubjectPicker }, { label: '🏔 登峰视图', handler: () => uni.navigateTo({ url: '/pages/knowledge-map/index' }) }]"
    />

    <!-- 学科选择器（三级联动：学段 → 年级 → 学科） -->
    <view class="subject-tabs" v-if="showSubjectSelector">
      <!-- 顶层：学段 -->
      <view class="cascade-row" v-if="knowledgeStore.stageList.length">
        <Chip
          v-for="stage in knowledgeStore.stageList"
          :key="stage.id"
          :label="stage.name"
          color="gray"
          :variant="knowledgeStore.currentStage === stage.id ? 'filled' : 'outlined'"
          @click="() => knowledgeStore.setStage(stage.id)"
        />
      </view>
      <!-- 中层：年级（当前学段内，数字年级） -->
      <view class="cascade-row" v-if="knowledgeStore.gradesOfStage.length">
        <Chip
          v-for="g in knowledgeStore.gradesOfStage"
          :key="g.id"
          :label="g.name"
          color="gray"
          :variant="knowledgeStore.currentGrade === Number(g.code.replace('G', '')) ? 'filled' : 'outlined'"
          @click="() => knowledgeStore.setGrade(Number(g.code.replace('G', '')))"
        />
      </view>
      <!-- 底层：学科 -->
      <view class="cascade-row">
        <Chip
          v-for="subject in knowledgeStore.subjectList"
          :key="subject.id"
          :label="`${subject.icon} ${subject.name}`"
          :color="subject.id"
          :variant="knowledgeStore.currentSubject === subject.id ? 'filled' : 'outlined'"
          @click="() => selectSubject(subject.id)"
        />
      </view>
    </view>

    <!-- 图谱容器 -->
    <view class="graph-container">
      <LoadingSkeleton v-if="knowledgeStore.loading" variant="chart" />
      <canvas
        canvas-id="knowledgeGraph"
        id="knowledgeGraph"
        class="graph-canvas"
        @touchstart="onTouchStart"
        @touchmove="onTouchMove"
        @touchend="onTouchEnd"
      ></canvas>

      <!-- 图例 -->
      <view class="graph-legend">
        <view class="legend-item" v-for="item in legendItems" :key="item.label">
          <view class="legend-color" :style="{ background: item.color }" />
          <text class="legend-label">{{ item.label }}</text>
        </view>
      </view>

      <!-- 控制按钮 -->
      <view class="graph-controls">
        <view class="control-btn" @click="zoomIn" :disabled="zoom >= maxZoom">
          <text>+</text>
        </view>
        <view class="control-btn" @click="zoomOut" :disabled="zoom <= minZoom">
          <text>-</text>
        </view>
        <view class="control-btn" @click="resetView">
          <text>Home</text>
        </view>
        <view class="control-btn" @click="togglePhysics">
          <text>{{ physicsEnabled ? 'Pause' : 'Play' }}</text>
        </view>
      </view>

      <!-- 空状态 -->
      <view class="graph-empty" v-if="!hasGraphData">
        <EmptyState
          title="暂无知识图谱数据"
          description="请先在练习中心完成一些题目，或等待后端生成知识图谱"
          icon="Brain"
          :actions="[{ label: '去练习', handler: () => uni.switchTab({ url: '/pages/practice/index' }) }, { label: '刷新', handler: loadGraph }]"
        />
      </view>
    </view>

    <!-- 知识点详情面板 -->
    <view class="detail-panel" v-if="selectedNode" :class="{ visible: showDetail }">
      <view class="panel-header">
        <text class="panel-title">{{ selectedNode.name }}</text>
        <text class="panel-close" @click="closeDetail">X</text>
      </view>
      <view class="panel-content">
        <view class="detail-section">
          <text class="section-label">所属学科</text>
          <text class="section-value">{{ getSubjectName(selectedNode.subject) }}</text>
        </view>
        <view class="detail-section">
          <text class="section-label">所属章节</text>
          <text class="section-value">{{ getNodeChapterName(selectedNode) }}</text>
        </view>
        <view class="detail-section">
          <text class="section-label">难度等级</text>
          <view class="difficulty-stars">
            <text v-for="i in 5" :key="i" :class="{ filled: i <= selectedNode.difficulty }">★</text>
          </view>
        </view>
        <view class="detail-section" v-if="selectedNode.mastery !== undefined">
          <text class="section-label">掌握度</text>
          <view class="mastery-bar">
            <ProgressRing
              :value="Math.round(selectedNode.mastery * 100)"
              :max="100"
              :size="50"
              :stroke-width="5"
              :color="getMasteryColor(selectedNode.mastery)"
            />
            <text class="mastery-text">{{ Math.round(selectedNode.mastery * 100) }}%</text>
          </view>
        </view>
        <view class="detail-section" v-if="selectedNode.description">
          <text class="section-label">知识点描述</text>
          <text class="section-value desc-text">{{ selectedNode.description }}</text>
        </view>
        <view class="detail-section" v-if="selectedNode.formula">
          <text class="section-label">核心公式</text>
          <rich-text :nodes="selectedNode.formula" class="formula-text" />
        </view>
        <view class="detail-actions">
          <Chip
            label="开始练习"
            color="blue"
            variant="filled"
            size="large"
            @click="practiceThisPoint"
          />
          <Chip
            label="查看相关"
            color="gray"
            variant="outlined"
            size="large"
            @click="showRelated"
          />
        </view>
      </view>
    </view>

    <!-- 学习路径推荐 -->
    <view v-if="knowledgeStore.learningPath.length > 0" class="learning-path">
      <PageHeader title="推荐学习路径" subtitle="按前置依赖智能排序" />
      <view class="path-list">
        <view
          v-for="(node, index) in knowledgeStore.learningPath"
          :key="node.id"
          class="path-item"
          @click="() => selectAndPractice(node)"
        >
          <view class="path-index">{{ index + 1 }}</view>
          <view class="path-info">
            <text class="path-name">{{ node.name }}</text>
            <text class="path-mastery">{{ Math.round((masteryMap[node.id] || 0) * 100) }}% 掌握度</text>
          </view>
          <Chip
            label="练习"
            color="blue"
            variant="soft"
            size="small"
          />
        </view>
      </view>
    </view>

    <!-- 底部安全区 -->
    <view class="safe-area" />
  </view>
</template>

<script>
import { ref, computed, onMounted, nextTick } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useKnowledgeStore } from '@/store/knowledge'
import { usePracticeStore } from '@/store/practice'
import PageHeader from '@/components/ui/PageHeader.vue'
import Chip from '@/components/ui/Chip.vue'
import ProgressRing from '@/components/ui/ProgressRing.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import LoadingSkeleton from '@/components/ui/LoadingSkeleton.vue'

export default {
  name: 'KnowledgeGraph',
  components: {
    PageHeader,
    Chip,
    ProgressRing,
    EmptyState
  },
  setup() {
    const knowledgeStore = useKnowledgeStore()
    const practiceStore = usePracticeStore()

    const showSubjectSelector = ref(false)
    const showDetail = ref(false)
    const selectedNode = ref(null)
    const hasGraphData = ref(false)
    const masteryMap = computed(() => knowledgeStore.masteryMap)

    // 图谱渲染状态
    const graphCtx = ref(null)
    const graphCanvas = ref(null)
    const zoom = ref(1)
    const pan = ref({ x: 0, y: 0 })
    const minZoom = 0.3
    const maxZoom = 3
    const physicsEnabled = ref(true)
    const animationFrame = ref(null)
    const lastTouch = ref({ x: 0, y: 0 })

    // 图例
    const legendItems = [
      { label: '已掌握 (>=80%)', color: '#52c41a' },
      { label: '学习中 (50-80%)', color: '#faad14' },
      { label: '薄弱 (<50%)', color: '#ff4d4f' },
      { label: '未学习', color: '#d9d9d9' },
      { label: '前置依赖', color: '#4a6cf7' }
    ]

    const selectSubject = async (subjectId) => {
      showSubjectSelector.value = false
      await knowledgeStore.setSubject(subjectId)
      await nextTick()
      loadGraph()
    }

    const loadGraph = async () => {
      await knowledgeStore.loadCatalog() // 三级联动数据源（学段/年级/学科，幂等）
      await knowledgeStore.loadKnowledgeGraph()
      await knowledgeStore.calculateLearningPath()
      hasGraphData.value = knowledgeStore.graphData.nodes.length > 0
      await nextTick()
      initCanvas()
    }

    const initCanvas = async () => {
      // #ifdef H5
      const canvas = document.getElementById('knowledgeGraph')
      if (!canvas) return

      const query = uni.createSelectorQuery()
      query.select('#knowledgeGraph').fields({ node: true, size: true })
      query.exec((res) => {
        if (!res || !res[0] || !res[0].node) return

        graphCanvas.value = res[0].node
        graphCtx.value = graphCanvas.value.getContext('2d')

        const width = res[0].width
        const height = res[0].height
        const dpr = uni.getSystemInfoSync().pixelRatio || 1

        graphCanvas.value.width = width * dpr
        graphCanvas.value.height = height * dpr
        graphCtx.value.scale(dpr, dpr)

        drawGraph()
        startAnimation()
      })
      // #endif
      // #ifdef MP-WEIXIN
      // 小程序使用 uni.createCanvasContext
      const ctx = uni.createCanvasContext('knowledgeGraph')
      drawGraphMP(ctx)
      // #endif
    }

    const startAnimation = () => {
      if (!physicsEnabled.value) return

      const animate = () => {
        if (!physicsEnabled.value) return
        updatePhysics()
        drawGraph()
        animationFrame.value = requestAnimationFrame(animate)
      }
      animate()
    }

    const updatePhysics = () => {
      const nodes = knowledgeStore.graphData.nodes || []
      const edges = knowledgeStore.graphData.edges || []

      if (!nodes.length) return

      const k = 0.01
      const repulsion = 1000

      for (let i = 0; i < nodes.length; i++) {
        nodes[i].fx = 0
        nodes[i].fy = 0
        nodes[i].vx = nodes[i].vx || 0
        nodes[i].vy = nodes[i].vy || 0
      }

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x
          const dy = nodes[j].y - nodes[i].y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const force = repulsion / (dist * dist)
          const fx = (dx / dist) * force
          const fy = (dy / dist) * force
          nodes[i].fx -= fx
          nodes[i].fy -= fy
          nodes[j].fx += fx
          nodes[j].fy += fy
        }
      }

      for (let eIdx = 0; eIdx < edges.length; eIdx++) {
        const e = edges[eIdx]
        const source = nodes.find(n => n.id === e.source)
        const target = nodes.find(n => n.id === e.target)
        if (!source || !target) continue
        const dx = target.x - source.x
        const dy = target.y - source.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const force = k * (dist - 100)
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        source.fx += fx
        source.fy += fy
        target.fx -= fx
        target.fy -= fy
      }

      for (let nIdx = 0; nIdx < nodes.length; nIdx++) {
        const n = nodes[nIdx]
        n.vx = (n.vx + n.fx) * 0.9
        n.vy = (n.vy + n.fy) * 0.9
        n.x += n.vx
        n.y += n.vy
        if (graphCanvas.value) {
          const w = graphCanvas.value.width / (uni.getSystemInfoSync().pixelRatio || 1)
          const h = graphCanvas.value.height / (uni.getSystemInfoSync().pixelRatio || 1)
          n.x = Math.max(50, Math.min(w - 50, n.x))
          n.y = Math.max(50, Math.min(h - 50, n.y))
        }
      }
    }

    const drawGraph = () => {
      if (!graphCtx.value || !graphCanvas.value) return

      const ctx = graphCtx.value
      const width = graphCanvas.value.width / (uni.getSystemInfoSync().pixelRatio || 1)
      const height = graphCanvas.value.height / (uni.getSystemInfoSync().pixelRatio || 1)

      ctx.clearRect(0, 0, width, height)

      ctx.save()
      ctx.translate(pan.value.x, pan.value.y)
      ctx.scale(zoom.value, zoom.value)

      const nodes = knowledgeStore.graphData.nodes
      const edges = knowledgeStore.graphData.edges

      edges.forEach(e => {
        const source = nodes.find(n => n.id === e.source)
        const target = nodes.find(n => n.id === e.target)
        if (!source || !target) return

        ctx.beginPath()
        ctx.moveTo(source.x, source.y)
        ctx.lineTo(target.x, target.y)
        ctx.strokeStyle = '#4a6cf7'
        ctx.lineWidth = 1.5 / zoom.value
        ctx.setLineDash([5 / zoom.value, 5 / zoom.value])
        ctx.stroke()
        ctx.setLineDash([])
      })

      nodes.forEach(node => {
        const mastery = masteryMap.value[node.id] || 0
        let fillColor
        if (mastery >= 0.8) fillColor = '#52c41a'
        else if (mastery >= 0.5) fillColor = '#faad14'
        else if (mastery > 0) fillColor = '#ff4d4f'
        else fillColor = '#d9d9d9'

        const isSelected = selectedNode.value?.id === node.id
        const radius = (isSelected ? 28 : 22) / zoom.value

        ctx.beginPath()
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2)
        ctx.fillStyle = fillColor
        ctx.fill()

        if (isSelected) {
          ctx.strokeStyle = '#4a6cf7'
          ctx.lineWidth = 3 / zoom.value
          ctx.stroke()
        }

        ctx.font = `${12 / zoom.value}px sans-serif`
        ctx.fillStyle = '#333'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(node.name, node.x, node.y)

        if (mastery > 0) {
          ctx.beginPath()
          ctx.arc(node.x + radius * 0.7, node.y - radius * 0.7, 6 / zoom.value, 0, Math.PI * 2)
          ctx.fillStyle = fillColor
          ctx.fill()
          ctx.fillStyle = '#fff'
          ctx.font = `${9 / zoom.value}px sans-serif`
          ctx.fillText(`${Math.round(mastery * 100)}%`, node.x + radius * 0.7, node.y - radius * 0.7 + 3)
        }
      })

      ctx.restore()
    }

    // 小程序版绘制（简化）
    const drawGraphMP = (ctx) => {
      // 类似逻辑，使用 ctx.draw()
    }

    // 交互事件
    const onTouchStart = (e) => {
      const touch = e.touches[0]
      lastTouch.value = { x: touch.clientX, y: touch.clientY }

      const nodes = knowledgeStore.graphData.nodes
      const rect = e.target.getBoundingClientRect?.() || { left: 0, top: 0 }
      const x = (touch.clientX - rect.left - pan.value.x) / zoom.value
      const y = (touch.clientY - rect.top - pan.value.y) / zoom.value

      nodes.forEach(node => {
        const dx = node.x - x
        const dy = node.y - y
        if (dx * dx + dy * dy < 800) {
          selectedNode.value = node
          showDetail.value = true
        }
      })
    }

    const onTouchMove = (e) => {
      if (e.touches.length === 1) {
        const touch = e.touches[0]
        const dx = touch.clientX - lastTouch.value.x
        const dy = touch.clientY - lastTouch.value.y
        pan.value.x += dx
        pan.value.y += dy
        lastTouch.value = { x: touch.clientX, y: touch.clientY }
        drawGraph()
      } else if (e.touches.length === 2) {
        const touch1 = e.touches[0]
        const touch2 = e.touches[1]
        const dist = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY)
        if (lastTouch.value.dist) {
          const scale = dist / lastTouch.value.dist
          zoom.value = Math.max(minZoom, Math.min(maxZoom, zoom.value * scale))
          drawGraph()
        }
        lastTouch.value.dist = dist
      }
    }

    const onTouchEnd = () => {
      delete lastTouch.value.dist
    }

    const zoomIn = () => {
      zoom.value = Math.min(maxZoom, zoom.value * 1.2)
      drawGraph()
    }

    const zoomOut = () => {
      zoom.value = Math.max(minZoom, zoom.value / 1.2)
      drawGraph()
    }

    const resetView = () => {
      zoom.value = 1
      pan.value = { x: 0, y: 0 }
      drawGraph()
    }

    const togglePhysics = () => {
      physicsEnabled.value = !physicsEnabled.value
      if (physicsEnabled.value) startAnimation()
    }

    const closeDetail = () => {
      showDetail.value = false
      selectedNode.value = null
      drawGraph()
    }

    const practiceThisPoint = () => {
      if (!selectedNode.value) return
      practiceStore.setTopic(selectedNode.value.id)
      practiceStore.startSession('topic', { subject: knowledgeStore.currentSubject })
      uni.navigateTo({ url: '/pages/practice/index' })
      closeDetail()
    }

    const showRelated = () => {
      if (!selectedNode.value) return
      const prereqs = knowledgeStore.getPrerequisites(selectedNode.value.id)
      const dependents = knowledgeStore.getDependents(selectedNode.value.id)
      uni.showModal({
        title: '相关知识点',
        content: '前置: ' + prereqs.map(p => p.name).join(', ') + '\n后续: ' + dependents.map(p => p.name).join(', '),
        showCancel: false
      })
    }

    const selectAndPractice = (node) => {
      practiceStore.setTopic(node.id)
      practiceStore.startSession('topic', { subject: knowledgeStore.currentSubject })
      uni.navigateTo({ url: '/pages/practice/index' })
    }

    const showSubjectPicker = () => {
      showSubjectSelector.value = true
    }

    const getSubjectName = (subjectId) => {
      // K12 全学科 code 兜底表；真源清单优先（subjectList 接 /api/curriculum/subjects）
      const names = { math: '数学', chn: '语文', eng: '英语', phys: '物理', chem: '化学', bio: '生物', hist: '历史', geo: '地理', pol: '政治' }
      const real = knowledgeStore.subjectList.find(s => s.id === subjectId)
      if (real) return real.name
      return names[subjectId] || subjectId
    }

    // 知识点所属章节名：图谱节点只有 chapterId，从章节节点（type=chapter）反查
    const getNodeChapterName = (node) => {
      if (!node) return '未分类'
      if (node.chapterName || node.chapter) return node.chapterName || node.chapter
      if (node.chapterId) {
        const ch = knowledgeStore.graphData.nodes.find(n => n.type === 'chapter' && n.id === node.chapterId)
        if (ch) return ch.name
      }
      return '未分类'
    }

    const getMasteryColor = (mastery) => {
      if (mastery >= 0.8) return '#52c41a'
      if (mastery >= 0.5) return '#faad14'
      return '#ff4d4f'
    }

    onMounted(async () => {
      await knowledgeStore.loadKnowledgePoints()
      await loadGraph()
    })

    onShow(async () => {
      await loadGraph()
    })

    return {
      knowledgeStore,
      practiceStore,
      showSubjectSelector,
      showDetail,
      selectedNode,
      hasGraphData,
      masteryMap,
      legendItems,
      zoom,
      minZoom,
      maxZoom,
      physicsEnabled,
      selectSubject,
      loadGraph,
      zoomIn,
      zoomOut,
      resetView,
      togglePhysics,
      closeDetail,
      practiceThisPoint,
      showRelated,
      showSubjectPicker,
      getSubjectName,
      getNodeChapterName,
      getMasteryColor,
      selectAndPractice,
      onTouchStart,
      onTouchMove,
      onTouchEnd
    }
  }
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: var(--color-bg-primary, #f7f8fa);
  display: flex;
  flex-direction: column;
}

/* 学科标签 */
.subject-tabs {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 16px 12px;
}

/* 三级联动每行（学段/年级/学科 chips 横排滚动） */
.cascade-row {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

/* 图谱容器 */
.graph-container {
  flex: 1;
  position: relative;
  margin: 0 16px 16px;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  border: 1px solid var(--color-border, #e8e8f0);
  overflow: hidden;
}

.graph-canvas {
  width: 100%;
  height: 100%;
  min-height: 400px;
  display: block;
}

.graph-legend {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 60px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 12px;
  backdrop-filter: blur(10px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  z-index: 10;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: #666;
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 3px;
}

.legend-label {
  white-space: nowrap;
}

.graph-controls {
  position: absolute;
  bottom: 12px;
  right: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 10;
}

.control-btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
  border-radius: 50%;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  font-size: 16px;
  font-weight: 600;
  color: #333;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.control-btn:active:not(:disabled) {
  transform: scale(0.95);
  background: #f5f5f5;
}

.control-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.graph-empty {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

/* 详情面板 */
.detail-panel {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  max-height: 70vh;
  background: #fff;
  border-radius: 20px 20px 0 0;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.1);
  transform: translateY(100%);
  transition: transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  z-index: 100;
  overflow-y: auto;
}

.detail-panel.visible {
  transform: translateY(0);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--color-border, #e8e8f0);
  position: sticky;
  top: 0;
  background: #fff;
  z-index: 1;
}

.panel-title {
  font-size: 17px;
  font-weight: 600;
  color: #1a1a2e;
}

.panel-close {
  font-size: 20px;
  color: #999;
  padding: 4px;
  cursor: pointer;
}

.panel-content {
  padding: 16px;
}

.detail-section {
  margin-bottom: 16px;
}

.section-label {
  display: block;
  font-size: 12px;
  color: #999;
  margin-bottom: 4px;
}

.section-value {
  display: block;
  font-size: 14px;
  color: #1a1a2e;
  font-weight: 500;
}

.difficulty-stars {
  display: flex;
  gap: 4px;
  color: #d9d9d9;
}

.difficulty-stars text.filled {
  color: #faad14;
}

.mastery-bar {
  display: flex;
  align-items: center;
  gap: 12px;
}

.mastery-text {
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.desc-text {
  line-height: 1.6;
  color: #555;
}

.formula-text {
  font-family: monospace;
  background: #f5f5f5;
  padding: 8px 12px;
  border-radius: 8px;
  display: block;
}

.detail-actions {
  display: flex;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border, #e8e8f0);
}

/* 学习路径 */
.learning-path {
  padding: 0 16px 24px;
}

.path-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.path-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  border: 1px solid var(--color-border, #e8e8f0);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.path-item:active {
  background: #f5f5f5;
}

.path-index {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #4a6cf7 0%, #7c94ff 100%);
  border-radius: 50%;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  flex-shrink: 0;
}

.path-info {
  flex: 1;
  min-width: 0;
}

.path-name {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: #1a1a2e;
  margin-bottom: 2px;
}

.path-mastery {
  display: block;
  font-size: 12px;
  color: #999;
}

.safe-area {
  height: 40px;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .page {
    background: var(--color-bg-primary, #1a1a2e);
  }

  .graph-container,
  .detail-panel,
  .path-item {
    background: var(--color-bg-card, #252542);
    border-color: var(--color-border, #3d3d5c);
  }

  .graph-legend {
    background: rgba(37, 37, 66, 0.95);
  }

  .legend-item {
    color: #aaa;
  }

  .control-btn {
    background: var(--color-bg-card, #252542);
    color: var(--color-text-primary, #e8e8f0);
  }

  .control-btn:active:not(:disabled) {
    background: var(--color-bg-elevated, #2d2d4a);
  }

  .panel-header {
    background: var(--color-bg-card, #252542);
    border-color: var(--color-border, #3d3d5c);
  }

  .panel-title,
  .section-value,
  .path-name {
    color: var(--color-text-primary, #e8e8f0);
  }

  .section-label,
  .path-mastery {
    color: var(--color-text-tertiary, #888);
  }

  .desc-text {
    color: var(--color-text-secondary, #a8a8c0);
  }

  .formula-text {
    background: var(--color-bg-elevated, #2d2d4a);
  }
}
</style>