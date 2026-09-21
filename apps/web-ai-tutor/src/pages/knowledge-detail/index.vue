<template>
  <ErrorBoundary :showDetails="true" :logError="true">
    <view class="page">
      <PageHeader
        title="知识点详情"
        subtitle="深度解析核心概念"
      />

      <scroll-view class="detail-content" scroll-y="true">
        <EmptyState v-if="!knowledgePoint" title="知识点不存在" description="该知识点可能已被移除或不存在" icon="🔍" :actions="[{ label: '返回图谱', handler: () => uni.navigateBack() }]" />
        <view v-else class="detail-card">
        <!-- 头部信息 -->
        <view class="kp-header">
          <view class="kp-meta">
            <Chip :label="getSubjectName(knowledgePoint.subject)" :color="subjectColor" variant="filled" size="small" />
            <Chip v-if="knowledgePoint.chapter" :label="knowledgePoint.chapter" color="blue" variant="outlined" size="small" />
            <Chip v-if="knowledgePoint.difficulty" :label="difficultyLabel" color="orange" variant="soft" size="small" />
          </view>
          <text class="kp-title">{{ knowledgePoint.name }}</text>
        </view>

        <!-- 掌握度进度 -->
        <view class="mastery-section" v-if="knowledgePoint.mastery !== undefined">
          <view class="mastery-header">
            <text class="mastery-label">当前掌握度</text>
            <text class="mastery-value">{{ masteryPercent }}</text>
          </view>
          <ProgressRing
            :value="masteryValue"
            :max="100"
            :size="80"
            :stroke-width="8"
            :color="getMasteryColor(knowledgePoint.mastery)"
          />
          <Chip
            :label="getMasteryLabel(knowledgePoint.mastery)"
            :color="getMasteryLabelColor(knowledgePoint.mastery)"
            variant="soft"
          />
        </view>

        <!-- 知识点定义 -->
        <view class="detail-section" v-if="knowledgePoint.definition">
          <text class="section-title">📖 知识点定义</text>
          <rich-text :nodes="knowledgePoint.definition" class="section-content" />
        </view>

        <!-- 核心公式 -->
        <view class="detail-section formula-section" v-if="knowledgePoint.formula">
          <text class="section-title">🧮 核心公式</text>
          <view class="formula-box">
            <rich-text :nodes="knowledgePoint.formula" class="formula-content" />
          </view>
        </view>

        <!-- 典型例题 -->
        <view class="detail-section" v-if="knowledgePoint.examples && knowledgePoint.examples.length > 0">
          <text class="section-title">📝 典型例题</text>
          <view class="examples-list">
            <view v-for="(example, index) in knowledgePoint.examples" :key="index" class="example-card">
              <rich-text :nodes="example" class="example-content" />
            </view>
          </view>
        </view>

        <!-- 易错点 -->
        <view class="detail-section warning-section" v-if="knowledgePoint.commonMistakes && knowledgePoint.commonMistakes.length > 0">
          <text class="section-title">⚠️ 常见易错点</text>
          <view class="mistakes-list">
            <view v-for="(mistake, index) in knowledgePoint.commonMistakes" :key="index" class="mistake-card">
              <text class="mistake-index">{{ index + 1 }}.</text>
              <rich-text :nodes="mistake" class="mistake-content" />
            </view>
          </view>
        </view>

        <!-- 相关知识点 -->
        <view class="detail-section" v-if="knowledgePoint.relatedKnowledge && knowledgePoint.relatedKnowledge.length > 0">
          <text class="section-title">🔗 相关知识点</text>
          <view class="related-chips">
            <Chip
              v-for="kp in knowledgePoint.relatedKnowledge"
              :key="kp.id || kp"
              :label="kp.name || kp"
              color="blue"
              variant="outlined"
              size="small"
              @click="navigateToKnowledgePoint(kp.id || kp)"
            />
          </view>
        </view>

        <!-- 推荐练习 -->
        <view class="detail-section">
          <text class="section-title">🎯 推荐练习</text>
          <view class="practice-buttons">
            <Chip label="专项突破" color="blue" variant="filled" size="large" @click="startTopicPractice" />
            <Chip label="间隔复习" color="green" variant="outlined" size="large" @click="startReviewPractice" />
            <Chip label="加入错题本" color="red" variant="outlined" size="large" @click="addToWrongQuestions" />
          </view>
        </view>
      </view>

    </scroll-view>
  </view>
</ErrorBoundary>
</template>

<script>
import { ref, computed, onMounted } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useKnowledgeStore } from '@/store/knowledge'
import { usePracticeStore } from '@/store/practice'
import PageHeader from '@/components/ui/PageHeader.vue'
import Chip from '@/components/ui/Chip.vue'
import ProgressRing from '@/components/ui/ProgressRing.vue'
import EmptyState from '@/components/ui/EmptyState.vue'

export default {
  name: 'KnowledgeDetail',
  components: {
    PageHeader,
    Chip,
    ProgressRing,
    EmptyState
  },
  setup(props, { route }) {
    const knowledgeStore = useKnowledgeStore()
    const practiceStore = usePracticeStore()

    const knowledgePointId = route.params?.id || route.query?.id
    const knowledgePoint = ref(null)

    const loadKnowledgePoint = async () => {
      if (!knowledgePointId) return

      // 先确保知识点数据已加载
      if (!knowledgeStore.knowledgePoints.length) {
        await knowledgeStore.loadKnowledgePoints()
      }

      // 查找知识点
      const kp = knowledgeStore.knowledgePoints.find(p => p.id === knowledgePointId)
      if (kp) {
        knowledgePoint.value = kp
      } else {
        // 尝试从图谱节点查找
        const node = knowledgeStore.graphData.nodes.find(n => n.id === knowledgePointId)
        if (node) knowledgePoint.value = node
      }
    }

    const subjectColor = computed(() => {
      const colors = {
        math: '#4a6cf7',
        physics: '#faad14',
        chemistry: '#ff4d4f',
        biology: '#52c41a',
        english: '#722ed1',
        chinese: '#eb2f96'
      }
      return colors[knowledgePoint.value?.subject] || '#4a6cf7'
    })

    const getSubjectName = (subject) => {
      const names = { math: '数学', physics: '物理', chemistry: '化学', biology: '生物', english: '英语', chinese: '语文' }
      return names[subject] || subject
    }

    const getMasteryColor = (mastery) => {
      if (mastery >= 0.8) return '#52c41a'
      if (mastery >= 0.5) return '#faad14'
      return '#ff4d4f'
    }

    const getMasteryLabel = (mastery) => {
      if (mastery >= 0.9) return '精通'
      if (mastery >= 0.8) return '掌握'
      if (mastery >= 0.6) return '熟悉'
      if (mastery >= 0.4) return '薄弱'
      return '陌生'
    }

    const difficultyLabel = computed(() => {
      if (!knowledgePoint.value?.difficulty) return ''
      const stars = '⭐'.repeat(knowledgePoint.value.difficulty)
      return '难度 ' + stars
    })

    const getMasteryLabelColor = (mastery) => {
      if (mastery >= 0.8) return 'green'
      if (mastery >= 0.5) return 'orange'
      return 'red'
    }

    const masteryPercent = computed(() => {
      if (!knowledgePoint.value?.mastery) return '0%'
      return Math.round(knowledgePoint.value.mastery * 100) + '%'
    })

    const masteryValue = computed(() => {
      if (!knowledgePoint.value?.mastery) return 0
      return Math.round(knowledgePoint.value.mastery * 100)
    })

    const startTopicPractice = () => {
      if (!knowledgePoint.value) return
      practiceStore.setTopic(knowledgePoint.value.id)
      practiceStore.startSession('topic', { subject: knowledgePoint.value.subject })
      uni.navigateTo({ url: '/pages/practice/index' })
    }

    const startReviewPractice = () => {
      if (!knowledgePoint.value) return
      practiceStore.setTopic(knowledgePoint.value.id)
      practiceStore.startSession('review', { subject: knowledgePoint.value.subject })
      uni.navigateTo({ url: '/pages/practice/index' })
    }

    const addToWrongQuestions = () => {
      uni.showToast({ title: '已加入错题本待复习', icon: 'success' })
    }

    const navigateToKnowledgePoint = (id) => {
      uni.navigateTo({ url: '/pages/knowledge-detail/index?id=' + id })
    }

    onMounted(() => {
      loadKnowledgePoint()
    })

    onShow(() => {
      loadKnowledgePoint()
    })

    return {
      knowledgeStore,
      practiceStore,
      knowledgePoint,
      subjectColor,
      getSubjectName,
      getMasteryColor,
      getMasteryLabel,
      getMasteryLabelColor,
      startTopicPractice,
      startReviewPractice,
      addToWrongQuestions,
      navigateToKnowledgePoint
    }
  }
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: var(--color-bg-primary, #f7f8fa);
}

.detail-content {
  flex: 1;
  padding: 0 16px 40px;
}

.detail-card {
  background: #fff;
  border-radius: 16px;
  padding: 20px 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  border: 1px solid var(--color-border, #e8e8f0);
}

.kp-header {
  margin-bottom: 20px;
}

.kp-meta {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.kp-title {
  display: block;
  font-size: 22px;
  font-weight: 700;
  color: #1a1a2e;
  line-height: 1.3;
}

.mastery-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 20px;
  background: var(--color-bg-secondary, #f0f0f5);
  border-radius: 16px;
  margin-bottom: 20px;
}

.mastery-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.mastery-label {
  font-size: 14px;
  color: #999;
}

.mastery-value {
  font-size: 28px;
  font-weight: 700;
  color: #1a1a2e;
}

.detail-section {
  margin-bottom: 24px;
}

.detail-section:last-child {
  margin-bottom: 0;
}

.section-title {
  display: block;
  font-size: 16px;
  font-weight: 600;
  color: #1a1a2e;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border, #e8e8f0);
}

.section-content {
  font-size: 15px;
  line-height: 1.7;
  color: #333;
}

.formula-section {
  background: #fafafa;
  padding: 16px;
  border-radius: 12px;
  border: 1px solid var(--color-border, #e8e8f0);
}

.formula-box {
  text-align: center;
  background: #fff;
  padding: 16px;
  border-radius: 8px;
  border: 1px solid var(--color-border, #e8e8f0);
}

.formula-content {
  font-family: 'Times New Roman', serif;
  font-size: 18px;
  color: #4a6cf7;
}

.examples-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.example-card {
  padding: 14px 16px;
  background: #f8f9fa;
  border-radius: 10px;
  border: 1px solid var(--color-border, #e8e8f0);
}

.example-content {
  font-size: 14px;
  line-height: 1.6;
  color: #333;
}

.warning-section {
  background: #fffbe6;
  border: 1px solid #ffd591;
  border-radius: 12px;
  padding: 16px;
}

.mistakes-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.mistake-card {
  display: flex;
  gap: 10px;
  padding: 12px;
  background: #fff;
  border-radius: 8px;
  border: 1px solid #ffe58f;
}

.mistake-index {
  font-size: 13px;
  font-weight: 700;
  color: #faad14;
  flex-shrink: 0;
  width: 20px;
}

.mistake-content {
  flex: 1;
  font-size: 14px;
  color: #333;
  line-height: 1.6;
}

.related-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.practice-buttons {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.practice-buttons .chip {
  width: 100%;
  justify-content: center;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  .page {
    background: var(--color-bg-primary, #1a1a2e);
  }

  .detail-card {
    background: var(--color-bg-card, #252542);
    border-color: var(--color-border, #3d3d5c);
  }

  .kp-title {
    color: var(--color-text-primary, #e8e8f0);
  }

  .mastery-section {
    background: var(--color-bg-elevated, #2d2d4a);
  }

  .mastery-value {
    color: var(--color-text-primary, #e8e8f0);
  }

  .section-title {
    color: var(--color-text-primary, #e8e8f0);
    border-color: var(--color-border, #3d3d5c);
  }

  .section-content {
    color: var(--color-text-secondary, #a8a8c0);
  }

  .formula-section {
    background: var(--color-bg-elevated, #2d2d4a);
    border-color: var(--color-border, #3d3d5c);
  }

  .formula-box {
    background: var(--color-bg-card, #252542);
    border-color: var(--color-border, #3d3d5c);
  }

  .example-card {
    background: var(--color-bg-elevated, #2d2d4a);
    border-color: var(--color-border, #3d3d5c);
  }

  .example-content {
    color: var(--color-text-secondary, #a8a8c0);
  }

  .warning-section {
    background: rgba(250, 173, 20, 0.1);
    border-color: #665500;
  }

  .mistake-card {
    background: var(--color-bg-card, #252542);
    border-color: #665500;
  }

  .mistake-content {
    color: var(--color-text-secondary, #a8a8c0);
  }
}
</style>