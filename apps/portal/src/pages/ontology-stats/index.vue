<template>
  <ErrorBoundary :showDetails="true" :logError="true">
    <view class="page">
      <PageHeader title="开发全流程统计" subtitle="方案 · 设计 · 实现 · 开发过程 —— 本体驱动的项目全景" :actions="headerActions" />

      <view class="panel" v-if="loading"><text class="muted">加载中…</text></view>

      <view v-else-if="loaded && error && !stats" class="no-access">
        <EmptyState title="统计加载失败" :description="error" icon="⚠️" :actions="[{ label: '重试', handler: init, class: 'primary' }]" />
      </view>

      <template v-if="stats">
        <!-- ── §0 建设原则（中心思想） ── -->
        <view class="section-title">建设原则 —— 以人为本</view>
        <view class="card principle-card">
          <view class="principle-statement">{{ stats.humanCentricPrinciple.statement }}</view>
          <view class="chain">
            <view class="chain-item" v-for="(c, i) in stats.humanCentricPrinciple.chain" :key="c.step">
              <view class="chain-step">
                <text class="chain-num">{{ i + 1 }}</text>
                <text class="chain-name">{{ c.step }}</text>
              </view>
              <text class="chain-detail">{{ c.detail }}</text>
            </view>
          </view>
        </view>

        <!-- ── §1 方案 ── -->
        <view class="section-title">方案</view>
        <view class="card">
          <view class="stat-grid">
            <view class="stat">
              <text class="stat-num">{{ stats.devProcess.plans.active.length }}</text>
              <text class="stat-label">现役方案</text>
            </view>
            <view class="stat">
              <text class="stat-num">{{ stats.devProcess.plans.archivedCount }}</text>
              <text class="stat-label">归档方案</text>
            </view>
            <view class="stat">
              <text class="stat-num">{{ stats.devProcess.plans.aiTutorDocsCount }}</text>
              <text class="stat-label">AI 教师文档</text>
            </view>
          </view>
          <view class="list">
            <view class="row" v-for="p in stats.devProcess.plans.active" :key="p.name">
              <text class="row-main">{{ p.name }}</text>
              <text class="row-sub">{{ p.desc }}</text>
            </view>
          </view>
        </view>

        <!-- ── §2 设计阶段 ── -->
        <view class="section-title">设计阶段 —— 现实世界的事物 → 本体</view>

        <view class="card">
          <view class="list">
            <view class="row col" v-for="m in stats.realWorldMappings" :key="m.domain">
              <view class="row-line">
                <text class="row-main">{{ m.domain }}</text>
                <Chip :label="m.ontology.split('（')[0]" color="blue" variant="soft" size="small" />
              </view>
              <text class="row-sub">{{ m.things }}</text>
              <text class="row-sub muted">{{ m.note }}</text>
            </view>
          </view>
        </view>

        <view class="card" v-for="o in stats.ontologies" :key="o.name">
          <view class="row-line">
            <text class="row-main">{{ o.name }}</text>
            <Chip :label="'v' + o.schemaVersion" color="purple" variant="outlined" size="small" />
          </view>
          <text class="row-sub muted">{{ o.description }}</text>
          <view class="stat-grid">
            <view class="stat"><text class="stat-num">{{ o.objectCount }}</text><text class="stat-label">对象</text></view>
            <view class="stat"><text class="stat-num">{{ o.abstractClasses.length }}</text><text class="stat-label">抽象基类</text></view>
            <view class="stat"><text class="stat-num">{{ o.subclassCount }}</text><text class="stat-label">子类</text></view>
            <view class="stat"><text class="stat-num">{{ o.discriminatorCount }}</text><text class="stat-label">判别列</text></view>
            <view class="stat"><text class="stat-num">{{ o.interfaces.length }}</text><text class="stat-label">接口</text></view>
            <view class="stat"><text class="stat-num">{{ o.stateMachineCount }}</text><text class="stat-label">状态机</text></view>
            <view class="stat"><text class="stat-num">{{ o.linkCount }}</text><text class="stat-label">关系</text></view>
          </view>
          <view class="list" v-if="o.abstractClasses.length">
            <view class="row">
              <text class="row-sub">抽象基类：</text>
              <Chip v-for="a in o.abstractClasses" :key="a" :label="a" color="green" variant="soft" size="small" />
            </view>
          </view>
          <view class="list" v-if="o.links.length">
            <view class="row" v-for="(l, i) in o.links" :key="o.name + i">
              <text class="row-main small">{{ l.source }} → {{ l.target }}</text>
              <text class="row-sub">
                {{ l.cardinality === 'many' ? '一对多' : '一对一' }}
                <text v-if="l.foreignKey" class="muted">（FK: {{ l.foreignKey }}）</text>
              </text>
            </view>
          </view>
          <view class="row" v-if="o.singleTable">
            <text class="row-sub">单表继承：基表 {{ o.singleTable.baseName }}{{ o.singleTable.baseTable ? '（' + o.singleTable.baseTable + '）' : '' }}，判别列 {{ o.singleTable.discriminatorColumn }}，{{ o.singleTable.subclassCount }} 子类并存</text>
          </view>
        </view>

        <view class="card">
          <view class="row-line"><text class="card-title">设计模式（GoF，实际落点）</text>
            <Chip :label="patternTotal + ' 条'" color="orange" variant="soft" size="small" />
          </view>
          <view class="pattern-group" v-for="g in patternGroups" :key="g.key">
            <view class="group-title">{{ g.label }}</view>
            <view class="row col" v-for="p in g.items" :key="p.name">
              <view class="row-line">
                <text class="row-main small">{{ p.name }}</text>
              </view>
              <text class="row-sub">落点：{{ p.sites }}</text>
              <text class="row-sub muted">{{ p.why }}</text>
            </view>
          </view>
        </view>

        <!-- ── §3 实现阶段 ── -->
        <view class="section-title">实现阶段 —— 生成的对象或接口与 OO 落点</view>

        <view class="card">
          <view class="row-line"><text class="card-title">生成产物</text></view>
          <view class="stat-grid">
            <view class="stat"><text class="stat-num">{{ stats.migrations.fileCount }}</text><text class="stat-label">迁移</text></view>
            <view class="stat"><text class="stat-num">{{ stats.database.schemaCount }}</text><text class="stat-label">schema</text></view>
            <view class="stat"><text class="stat-num">{{ stats.database.tableCount }}</text><text class="stat-label">表</text></view>
          </view>
          <view class="list" v-if="stats.migrations.files.length">
            <view class="row">
              <text class="row-sub">迁移文件（applied {{ stats.migrations.appliedCount }}）：</text>
            </view>
            <view class="row">
              <text class="row-sub muted">{{ stats.migrations.files.join(' · ') }}</text>
              <text class="row-sub muted">011/012/013 = codegen 样板（本体→SQL）</text>
            </view>
            <view class="row">
              <text class="row-sub">TS 类型生成器（packages/codegen/src/typescript.js）+ SQL 生成器（sql.js 混合模式）</text>
            </view>
          </view>
        </view>

        <view class="card">
          <view class="row-line"><text class="card-title">OO 四特性体现</text></view>
          <view class="list">
            <view class="row col" v-for="f in stats.ooFeatures" :key="f.name">
              <text class="row-main small">{{ f.name }}</text>
              <text class="row-sub">落点：{{ f.sites }}</text>
              <text class="row-sub muted">{{ f.how }}</text>
            </view>
          </view>
        </view>

        <!-- ── §4 开发过程 ── -->
        <view class="section-title">开发过程</view>

        <view class="card">
          <view class="list">
            <view class="row" v-for="m in stats.devProcess.milestones" :key="m.stage">
              <Chip :label="m.stage" color="green" variant="soft" size="small" />
              <text class="row-main small">{{ m.name }}</text>
              <text class="row-sub">{{ m.status }}</text>
            </view>
          </view>
          <view class="stat-grid">
            <view class="stat"><text class="stat-num">{{ stats.devProcess.commits.total }}</text><text class="stat-label">commits</text></view>
            <view class="stat"><text class="stat-num">{{ stats.devProcess.commits.feat }}</text><text class="stat-label">feat</text></view>
            <view class="stat"><text class="stat-num">{{ stats.devProcess.commits.fix }}</text><text class="stat-label">fix</text></view>
            <view class="stat"><text class="stat-num">{{ stats.devProcess.tests.jestApi }}</text><text class="stat-label">api jest</text></view>
            <view class="stat"><text class="stat-num">{{ stats.devProcess.tests.nodeTest }}</text><text class="stat-label">node --test</text></view>
          </view>
          <view class="row">
            <text class="row-sub muted">快照 {{ stats.devProcess.snapshotDate }}（容器无 git/docs，开发过程为内置清单）</text>
          </view>
        </view>
      </template>
    </view>
  </ErrorBoundary>
</template>

<script>
import { ref, computed } from 'vue'
import { onShow, onPullDownRefresh } from '@dcloudio/uni-app'
import ErrorBoundary from '@/components/ErrorBoundary.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Chip from '@/components/ui/Chip.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { ontologyStats } from '@/api'

export default {
  name: 'OntologyStats',
  components: { ErrorBoundary, PageHeader, Chip, EmptyState },
  setup() {
    const loading = ref(false)
    const loaded = ref(false)
    const error = ref('')
    const stats = ref(null)

    const headerActions = computed(() => [{ label: '刷新', handler: refresh }])

    const patternGroups = computed(() => {
      if (!stats.value) return []
      return [
        { key: 'creational', label: '创建型', items: stats.value.designPatterns.creational },
        { key: 'structural', label: '结构型', items: stats.value.designPatterns.structural },
        { key: 'behavioral', label: '行为型', items: stats.value.designPatterns.behavioral },
      ]
    })
    const patternTotal = computed(() => {
      if (!stats.value) return 0
      const d = stats.value.designPatterns
      return d.creational.length + d.structural.length + d.behavioral.length
    })

    const toast = (title, icon = 'none') => uni.showToast({ title, icon })

    const init = async () => {
      loading.value = true
      error.value = ''
      try {
        stats.value = await ontologyStats()
      } catch (e) {
        error.value = (e && e.message) || '请求失败'
        toast(error.value)
      } finally {
        loading.value = false
        loaded.value = true
      }
    }

    const refresh = async () => {
      await init()
    }

    onShow(init)
    onPullDownRefresh(async () => { await refresh(); uni.stopPullDownRefresh() })

    return {
      loading, loaded, error, stats, headerActions, patternGroups, patternTotal, init, refresh
    }
  }
}
</script>

<style scoped>
.page { min-height: 100vh; background: var(--color-bg-primary); padding-bottom: 40rpx; }

.panel { padding: 24rpx; }
.muted { color: var(--color-text-secondary); }
.small { font-size: var(--font-size-sm); }

.section-title { font-weight: var(--font-weight-medium); font-size: var(--font-size-base); color: var(--color-text-primary); padding: 24rpx 24rpx 8rpx; }

.principle-card { border-left: 6rpx solid var(--color-primary); }
.principle-statement { font-size: var(--font-size-base); color: var(--color-text-primary); line-height: 1.7; font-weight: var(--font-weight-medium); margin-bottom: 16rpx; }
.chain { display: flex; flex-direction: column; gap: 12rpx; }
.chain-item { background: var(--color-bg-secondary, #f0f0f5); border-radius: var(--radius-sm); padding: 12rpx 16rpx; }
.chain-step { display: flex; align-items: center; gap: 10rpx; margin-bottom: 4rpx; }
.chain-num { display: flex; align-items: center; justify-content: center; min-width: 32rpx; height: 32rpx; border-radius: 50%; background: var(--color-primary); color: #fff; font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); }
.chain-name { font-size: var(--font-size-base); font-weight: var(--font-weight-medium); color: var(--color-primary); }
.chain-detail { font-size: var(--font-size-sm); color: var(--color-text-secondary); line-height: 1.6; }

.card { background: var(--color-bg-card); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 20rpx; margin: 0 24rpx 16rpx; }
.card-title { font-weight: var(--font-weight-medium); color: var(--color-primary); }
.row-line { display: flex; align-items: center; justify-content: space-between; gap: 12rpx; margin-bottom: 8rpx; }

.stat-grid { display: flex; flex-wrap: wrap; gap: 12rpx; margin: 12rpx 0; }
.stat { flex: 1; min-width: 120rpx; background: var(--color-bg-secondary, #f0f0f5); border-radius: var(--radius-sm); padding: 12rpx 16rpx; display: flex; flex-direction: column; align-items: center; }
.stat-num { font-size: 32rpx; font-weight: var(--font-weight-medium); color: var(--color-primary); }
.stat-label { font-size: var(--font-size-sm); color: var(--color-text-secondary); }

.list { display: flex; flex-direction: column; gap: 12rpx; }
.row { display: flex; align-items: center; gap: 12rpx; background: var(--color-bg-secondary, #f0f0f5); border-radius: var(--radius-sm); padding: 12rpx 16rpx; }
.row.col { flex-direction: column; align-items: stretch; }
.row-main { font-size: var(--font-size-base); color: var(--color-text-primary); }
.row-sub { font-size: var(--font-size-sm); color: var(--color-text-secondary); }

.pattern-group { margin-top: 12rpx; }
.group-title { font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); color: var(--color-text-primary); margin-bottom: 8rpx; }
</style>
