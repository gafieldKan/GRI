<template>
  <ErrorBoundary :showDetails="true" :logError="true">
    <view class="page">
      <PageHeader title="AI 运营台" subtitle="配置 MCP 服务 / 模型路由 · 查看工具审计（仅站点运营）" />

      <!-- 权限门槛：仅站点运营可见面板 -->
      <view v-if="!gateLoaded" class="gate">
        <text class="gate-text">正在校验运营权限…</text>
      </view>
      <view v-else-if="!isOperator" class="gate">
        <EmptyState title="无运营权限" description="此面板仅根组织 owner/admin 可用。你已登录但不是站点运营，无法查看或修改。" icon="🔒" />
      </view>

      <template v-else>
        <!-- 顶部分段 tab -->
        <view class="tabs">
          <view
            v-for="t in tabs"
            :key="t.key"
            class="tab"
            :class="{ active: activeTab === t.key }"
            @click="switchTab(t.key)"
          >{{ t.label }}</view>
        </view>

        <text v-if="error" class="page-error">{{ error }}</text>

        <!-- ============ 运营总览（只读聚合, 常驻顶部） ============ -->
        <view class="overview-card">
          <view class="section-bar">
            <text class="section-title">运营总览</text>
            <view class="ghost-btn" @click="loadOverview">↻ 刷新</view>
          </view>
          <view class="stats">
            <view class="stat"><text class="stat-n">{{ overview?.counts?.activeStudents ?? 0 }}</text><text class="stat-l">在用学生</text></view>
            <view class="stat"><text class="stat-n">{{ overview?.counts?.studentsWithData ?? 0 }}</text><text class="stat-l">有作答数据</text></view>
            <view class="stat"><text class="stat-n">{{ overview?.counts?.totalToolRuns ?? 0 }}</text><text class="stat-l">累计工具调用</text></view>
            <view class="stat"><text class="stat-n">{{ overview?.counts?.unresolvedWrong ?? 0 }}</text><text class="stat-l">未解决错题</text></view>
            <view class="stat"><text class="stat-n">{{ overview?.counts?.activePlans ?? 0 }}</text><text class="stat-l">活动计划</text></view>
          </view>
          <view v-if="(overview?.toolUsage || []).length" class="ov-block">
            <text class="ov-label">各工具调用次数</text>
            <view class="ov-rows">
              <view class="ov-row" v-for="u in overview.toolUsage.slice(0, 6)" :key="u.toolName">
                <text class="ov-name mono">{{ u.toolName }}</text>
                <text class="ov-n">{{ u.n }}</text>
              </view>
            </view>
          </view>
          <view v-if="(overview?.recent || []).length" class="ov-block">
            <text class="ov-label">最近动态</text>
            <view class="ov-recent">
              <view class="ov-recent-row" v-for="(r, i) in overview.recent.slice(0, 5)" :key="i">
                <text class="ov-tool mono">{{ r.toolName }}</text>
                <text class="ov-entity">{{ shortId(r.entityId) }}</text>
                <text class="ov-time">{{ (r.createdAt || '').slice(5, 16).replace('T', ' ') }}</text>
              </view>
            </view>
          </view>
          <text v-if="loadingOverview" class="ov-loading">加载中…</text>
        </view>

        <!-- ============ 全班学情（只读运营集合：观测"教到了什么"） ============ -->
        <view class="overview-card">
          <view class="section-bar">
            <text class="section-title">全班学情 🎯</text>
            <view class="ghost-btn" @click="loadClass">↻ 刷新</view>
          </view>
          <view class="stats">
            <view class="stat"><text class="stat-n">{{ classDiag?.totalStudents ?? 0 }}</text><text class="stat-l">在库学生</text></view>
            <view class="stat"><text class="stat-n">{{ classDiag?.hasData ? classDiag.knowledgePoints.length : 0 }}</text><text class="stat-l">有数据的知识点</text></view>
          </view>
          <view v-if="classDiag?.hasData" class="ov-block">
            <text class="ov-label">各知识点班级掌握度（弱→强）</text>
            <view class="ov-rows">
              <view class="cd-row" v-for="k in classDiag.knowledgePoints" :key="k.kpId" @click="loadDrill(k)">
                <text class="cd-name">{{ k.kpName }}</text>
                <view class="cd-bar-track">
                  <view class="cd-bar" :class="{ low: k.accuracy < 60, mid: k.accuracy >= 60 && k.accuracy < 85 }" :style="{ width: (k.accuracy || 0) + '%' }"></view>
                </view>
                <text class="cd-acc mono">{{ k.accuracy }}%</text>
                <text class="cd-meta mono">×{{ k.attempts }}({{ k.students }}人)</text>
                <text class="cd-drill">{{ drill?.kpId === k.kpId ? '▾' : '▸' }}</text>
              </view>
            </view>
            <view v-if="drill && drill.questions.length" class="cd-drilldown">
              <text class="ov-label">「{{ drill.kpName }}」—— 全班卡在哪些题（弱→强,不透答案）</text>
              <view class="cd-q-row" v-for="q in drill.questions" :key="q.questionId">
                <text class="cd-q-content">{{ q.content }}</text>
                <view class="cd-q-stats">
                  <text class="cd-q-acc" :class="{ bad: q.accuracy < 60 }">{{ q.accuracy }}%</text>
                  <text class="cd-q-meta mono">×{{ q.attempts }}{{ q.correct === 0 ? ' · 全员未答对' : '' }}</text>
                  <text class="cd-q-diff mono">{{ q.difficulty || '?' }}</text>
                  <text v-if="q.attempts" class="cd-cause-btn" @click="loadCause(q)">{{ cause?.questionId === q.questionId ? '▴ 收起' : '错因' }}</text>
                </view>
                <view v-if="cause && cause.questionId === q.questionId && cause.loading" class="cd-cause">归因加载中…</view>
                <view v-if="cause && cause.questionId === q.questionId && !cause.loading" class="cd-cause">
                  <text class="ov-label">「{{ cause.question }}」错因归因（{{ cause.wrongCount }} 人次答错）</text>
                  <text v-if="cause.topWrong.length" class="cd-cause-rule">最常见错法：{{ cause.topWrong.map(t => '「' + t.answer + '」×' + t.count).join(' · ') }}</text>
                  <view v-if="cause.wrongStudents.length" class="cd-cause-list">
                    <view class="cd-cause-row" v-for="(s, i) in cause.wrongStudents.slice(0, 12)" :key="i">
                      <text class="cd-cause-uid mono">{{ shortId(s.studentId) }}</text>
                      <text class="cd-cause-ans">→ {{ s.answer || '(空)' }}</text>
                    </view>
                  </view>
                  <text v-else class="cd-cause-empty">暂无答错作答记录。</text>
                </view>
              </view>
            </view>
            <view v-else-if="drill && !drill.loading && !drill.questions.length" class="cd-empty">该知识点暂无题目作答记录。</view>
            <view v-if="drill && drill.loading" class="ov-loading">钻取中…</view>
            <view v-if="(classDiag?.weakest || []).length" class="cd-weak">
              <text class="ov-label">最弱前 5（优先补教）</text>
              <text class="cd-weak-tags">{{ classDiag.weakest.map(w => w.kpName).join(' · ') }}</text>
            </view>
          </view>
          <view v-else-if="!loadingClass" class="empty-block inner">
            <EmptyState title="还没有学习数据" description="学生开始经由 AI 教师作答后，这里会显示全班每个知识点的掌握度。" icon="🎯" />
          </view>
          <text v-if="loadingClass" class="ov-loading">加载中…</text>
        </view>

        <!-- ============ MCP 服务 ============ -->
        <block v-if="activeTab === 'mcp'">
          <view class="section-bar">
            <text class="section-title">MCP Server（外部工具桥入每生 agent）</text>
            <view class="ghost-btn new-btn" @click="openMcpForm()">＋ 新增</view>
          </view>

          <view v-if="!servers.length" class="empty-block">
            <EmptyState title="暂无 MCP Server" description="点击「新增」接入外部工具。凭证永不入表，只配置连接形态。" icon="🔌" />
          </view>

          <view v-for="s in servers" :key="s.name" class="row-card">
            <view class="row-head">
              <text class="row-name">{{ s.name }}</text>
              <view class="row-chips">
                <Chip :label="s.transport || 'stdio'" color="purple" size="small" variant="soft" />
                <Chip :label="s.enabled ? '已启用' : '已停用'" :color="s.enabled ? 'green' : 'gray'" size="small" variant="filled" />
              </view>
            </view>
            <text class="row-sub">{{ mcpConfigSummary(s) }}</text>
            <view class="row-actions">
              <view class="ghost-btn" @click="openMcpForm(s)">编辑</view>
              <view class="ghost-btn danger" @click="removeServer(s)">删除</view>
            </view>
          </view>

          <!-- MCP 表单 -->
          <view v-if="mcpForm.show" class="form-card">
            <text class="form-title">{{ mcpForm.editingName ? '编辑 ' + mcpForm.editingName : '新增 MCP Server' }}</text>
            <view class="field">
              <text class="field-label">名称（唯一，≤64）</text>
              <input class="field-input" v-model="mcpForm.name" placeholder="如 demo" :disabled="!!mcpForm.editingName" />
            </view>
            <view class="field">
              <text class="field-label">传输</text>
              <view class="seg">
                <view class="seg-item" :class="{ on: mcpForm.transport === 'stdio' }" @click="mcpForm.transport = 'stdio'">stdio</view>
                <view class="seg-item" :class="{ on: mcpForm.transport === 'http' }" @click="mcpForm.transport = 'http'">http</view>
              </view>
            </view>
            <view class="field" v-if="mcpForm.transport === 'http'">
              <text class="field-label">URL（Streamable HTTP）</text>
              <input class="field-input" v-model="mcpForm.url" placeholder="https://host/path/mcp" />
            </view>
            <template v-else>
              <view class="field">
                <text class="field-label">命令（可执行文件）</text>
                <input class="field-input" v-model="mcpForm.command" placeholder="如 npx 或 node" />
              </view>
              <view class="field">
                <text class="field-label">参数（逗号分隔）</text>
                <input class="field-input" v-model="mcpForm.args" placeholder="/app/demo-server.mjs" />
              </view>
            </template>
            <view class="field row-field">
              <text class="field-label">启用</text>
              <view class="switch" :class="{ on: mcpForm.enabled }" @click="mcpForm.enabled = !mcpForm.enabled">
                <view class="switch-dot"></view>
              </view>
            </view>
            <text class="form-hint">凭证（apiKey/secret/token/password）永不入表、不回显；这里只存连接形态。</text>
            <view class="form-actions">
              <view class="ghost-btn" @click="closeForm('mcp')">取消</view>
              <view class="primary-btn" :class="{ disabled: saving }" @click="saveMcp">{{ saving ? '保存中…' : '保存' }}</view>
            </view>
          </view>
        </block>

        <!-- ============ 模型路由 ============ -->
        <block v-if="activeTab === 'routes'">
          <view class="section-bar">
            <text class="section-title">模型路由（写表即切换，下一轮生效）</text>
            <view class="ghost-btn new-btn" @click="openRouteForm()">＋ 新增</view>
          </view>

          <view v-if="!routes.length" class="empty-block">
            <EmptyState title="暂无自定义路由" description="留空则回退环境变量缺省模型。" icon="🛣️" />
          </view>

          <view v-for="r in routes" :key="r.route_key" class="row-card">
            <view class="row-head">
              <text class="row-name mono">{{ r.route_key }}</text>
              <Chip :label="r.enabled !== false ? '启用' : '停用'" :color="r.enabled !== false ? 'green' : 'gray'" size="small" variant="filled" />
            </view>
            <text class="row-sub">{{ routeSummary(r) }}</text>
          </view>

          <view v-if="routeForm.show" class="form-card">
            <text class="form-title">{{ routeForm.editingKey ? '编辑 ' + routeForm.editingKey : '新增模型路由' }}</text>
            <view class="field">
              <text class="field-label">route_key</text>
              <input class="field-input mono" v-model="routeForm.route_key" placeholder="default | kind=&lt;kind&gt; | entity=&lt;id&gt;" />
            </view>
            <view class="field">
              <text class="field-label">provider</text>
              <input class="field-input" v-model="routeForm.provider" placeholder="如 nvidia" />
            </view>
            <view class="field">
              <text class="field-label">model</text>
              <input class="field-input" v-model="routeForm.model" placeholder="如 deepseek-ai/deepseek-v4-flash-0731" />
            </view>
            <view class="field">
              <text class="field-label">multimodal_model</text>
              <input class="field-input" v-model="routeForm.multimodal_model" placeholder="可选" />
            </view>
            <view class="field">
              <text class="field-label">base_url</text>
              <input class="field-input mono" v-model="routeForm.base_url" placeholder="可选，覆盖 API 地址" />
            </view>
            <view class="field row-field">
              <text class="field-label">启用</text>
              <view class="switch" :class="{ on: routeForm.enabled }" @click="routeForm.enabled = !routeForm.enabled">
                <view class="switch-dot"></view>
              </view>
            </view>
            <text class="form-hint">apiKey 不经此面提交/存取，由部署 env/SecretRef 供给。</text>
            <view class="form-actions">
              <view class="ghost-btn" @click="closeForm('route')">取消</view>
              <view class="primary-btn" :class="{ disabled: saving }" @click="saveRoute">{{ saving ? '保存中…' : '保存' }}</view>
            </view>
          </view>
        </block>

        <!-- ============ 工具审计 ============ -->
        <block v-if="activeTab === 'runs'">
          <view class="section-bar">
            <text class="section-title">最近工具调用（可观测，只读）</text>
          </view>
          <view v-if="!runs.length" class="empty-block">
            <EmptyState title="暂无工具调用" description="学生与 agent 触发工具后这里会留痕。" icon="🔍" />
          </view>
          <view v-for="rn in runs" :key="rn.id" class="row-card">
            <view class="row-head">
              <text class="row-name mono">{{ rn.tool_name }}</text>
              <text class="row-lat" v-if="rn.latency_ms != null">{{ rn.latency_ms }}ms</text>
            </view>
            <text class="row-sub">{{ '(' + shortId(rn.entity_id) + ') ' + rn.created_at }}</text>
            <view class="run-detail" v-if="rn.args">
              <text class="run-label">args</text>
              <text class="run-text mono">{{ str(rn.args) }}</text>
            </view>
            <view class="run-detail" v-if="rn.result">
              <text class="run-label">result</text>
              <text class="run-text mono">{{ str(rn.result) }}</text>
            </view>
          </view>
        </block>
      </template>
    </view>
  </ErrorBoundary>
</template>

<script>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import ErrorBoundary from '@/components/ErrorBoundary.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Chip from '@/components/ui/Chip.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { useModal } from '@/components/ui/Modal.vue'
import {
  adminCapability,
  listMcpServers,
  upsertMcpServer,
  deleteMcpServer,
  listRoutes,
  upsertRoute,
  listToolRuns,
  getAdminOverview,
  getClassDiagnosis,
  getClassDiagnosisQuestions,
  getClassDiagnosisQuestion
} from '@/api'

// 客户端内联凭证预检：与后端 _assertNoInlineSecret 同语义，先挡一层，避免命中后端 500。
const SECRET_RE = /api_?key|secret|token|password|credential/i
function hasSecretKey(obj) {
  if (!obj || typeof obj !== 'object') return false
  return Object.keys(obj).some((k) => SECRET_RE.test(k) || (obj[k] && typeof obj[k] === 'object' && hasSecretKey(obj[k])))
}

const str = (v) => {
  if (v === null || v === undefined) return ''
  return typeof v === 'string' ? v : JSON.stringify(v)
}

export default {
  name: 'AgentAdmin',
  components: { ErrorBoundary, PageHeader, Chip, EmptyState },
  setup() {
    const modal = useModal()

    const gateLoaded = ref(false)
    const isOperator = ref(false)
    const activeTab = ref('mcp')
    const loading = ref(false)
    const saving = ref(false)
    const error = ref('')
    const tabs = [
      { key: 'mcp', label: 'MCP 服务' },
      { key: 'routes', label: '模型路由' },
      { key: 'runs', label: '工具审计' }
    ]

    const servers = ref([])
    const routes = ref([])
    const runs = ref([])

    const emptyMcpForm = () => ({
      show: false, editingName: null, name: '', transport: 'stdio', url: '', command: '', args: '', enabled: true
    })
    const mcpForm = ref(emptyMcpForm())

    const emptyRouteForm = () => ({
      show: false, editingKey: null, route_key: '', provider: '', model: '', multimodal_model: '', base_url: '', enabled: true
    })
    const routeForm = ref(emptyRouteForm())

    const shortId = (id) => String(id || '').slice(0, 8)

    const mcpConfigSummary = (s) => {
      const c = s.config || {}
      const parts = []
      if (s.transport === 'http') parts.push(s.url || '(http)')
      else {
        parts.push(c.command || '')
        if (Array.isArray(c.args)) parts.push(c.args.join(' '))
        else if (c.args) parts.push(c.args)
      }
      if (Array.isArray(c.env) && c.env.length) parts.push('env:' + c.env.join(','))
      return parts.filter(Boolean).join(' ') || '(无配置)'
    }

    const routeSummary = (r) => {
      const p = []
      if (r.model) p.push(r.model)
      if (r.provider) p.push(r.provider)
      if (r.multimodal_model) p.push('多模态:' + r.multimodal_model)
      if (r.base_url) p.push(r.base_url)
      return p.join(' · ') || '(缺省)'
    }

    const loadMcp = async () => {
      const res = await listMcpServers()
      if (res?.success) servers.value = res.servers || []
      else { servers.value = []; error.value = res?.error || 'MCP server 列表加载失败' }
    }

    const loadRoutes = async () => {
      const res = await listRoutes()
      if (res?.success) routes.value = res.routes || []
      else { routes.value = []; error.value = res?.error || '模型路由列表加载失败' }
    }

    const loadRuns = async () => {
      const res = await listToolRuns()
      if (res?.success) runs.value = res.runs || []
      else { runs.value = []; error.value = res?.error || '工具审计加载失败' }
    }

    // 运营总览（常驻顶部, 只读聚合）—— 在用/有数据学生/工具调用/错题/计划 + 排行 + 最近动态
    const overview = ref(null)
    const loadingOverview = ref(false)
    const loadOverview = async () => {
      loadingOverview.value = true
      try {
        const res = await getAdminOverview()
        if (res?.success) overview.value = res
      } catch (e) {
        overview.value = null
      } finally {
        loadingOverview.value = false
      }
    }

    // 全班学情（只读运营集合）—— 跨全体学生每题/每知识点作答准确率 + 最弱前5
    const classDiag = ref(null)
    const loadingClass = ref(false)
    const loadClass = async () => {
      loadingClass.value = true
      try {
        const res = await getClassDiagnosis()
        if (res?.success) classDiag.value = res
        else classDiag.value = null
      } catch (e) {
        classDiag.value = null
      } finally {
        loadingClass.value = false
      }
    }

    // 知识点题目钻取（只读运营）：点知识点 → 看该知识点每题的全班作答统计(弱→强,不透答案)
    const drill = ref(null) // { kpId, kpName, questions, loading }
    const loadDrill = async (kp) => {
      if (drill.value?.kpId === kp.kpId) { drill.value = null; return } // 再点收起
      drill.value = { kpId: kp.kpId, kpName: kp.kpName, loading: true, questions: [] }
      try {
        const res = await getClassDiagnosisQuestions(kp.kpId)
        drill.value = res?.success
          ? { kpId: kp.kpId, kpName: kp.kpName, loading: false, questions: res.questions || [] }
          : { kpId: kp.kpId, kpName: kp.kpName, loading: false, questions: [] }
      } catch (e) {
        drill.value = { kpId: kp.kpId, kpName: kp.kpName, loading: false, questions: [] }
      }
    }

    // 单题作答归因（只读运营）：点一道卡题 → 看全班最常见的错法分布 + 谁答错/写成什么
    const cause = ref(null) // { questionId, kpName, question, wrongCount, topWrong, wrongStudents, loading }
    const loadCause = async (q) => {
      if (cause.value?.questionId === q.questionId) { cause.value = null; return } // 再点收起
      cause.value = { questionId: q.questionId, loading: true, topWrong: [], wrongStudents: [] }
      try {
        const res = await getClassDiagnosisQuestion(q.questionId)
        cause.value = res?.success
          ? { questionId: q.questionId, kpName: res.kpName, question: res.question, wrongCount: res.wrongCount, topWrong: res.topWrong || [], wrongStudents: res.wrongStudents || [], loading: false }
          : { questionId: q.questionId, loading: false, topWrong: [], wrongStudents: [] }
      } catch (e) {
        cause.value = { questionId: q.questionId, loading: false, topWrong: [], wrongStudents: [] }
      }
    }

    const switchTab = async (key) => {
      activeTab.value = key
      error.value = ''
      if (key === 'mcp') await loadMcp()
      else if (key === 'routes') await loadRoutes()
      else if (key === 'runs') await loadRuns()
    }

    const refresh = () => switchTab(activeTab.value)

    // ---- MCP 表单 ----
    const openMcpForm = (s) => {
      error.value = ''
      mcpForm.value = s
        ? {
            show: true,
            editingName: s.name,
            name: s.name,
            transport: s.transport || 'stdio',
            url: s.url || '',
            command: (s.config && s.config.command) || '',
            args: Array.isArray(s.config && s.config.args) ? s.config.args.join(',') : '',
            enabled: s.enabled !== false
          }
        : emptyMcpForm()
      mcpForm.value.show = true
    }

    const saveMcp = async () => {
      const f = mcpForm.value
      if (!f.name || !String(f.name).trim()) { modal.alert('名称不能为空'); return }
      const name = String(f.name).trim()
      const transport = f.transport
      const config = {}
      if (transport === 'stdio') {
        if (!f.command || !String(f.command).trim()) { modal.alert('stdio 需要可执行命令'); return }
        config.command = String(f.command).trim()
        const args = String(f.args || '').split(',').map((x) => x.trim()).filter(Boolean)
        if (args.length) config.args = args
      }
      if (transport === 'http') {
        if (!f.url || !String(f.url).trim()) { modal.alert('http 需要 url'); return }
      }
      // 客户端凭证预检：config 任一键名命中 secret 语义即拒绝（后端会再兜底 500）
      if (hasSecretKey(config)) { modal.alert('config 不允许含 api_key/secret/token/password/credential 键（凭证走 env）。请只填端口/路径/命令。'); return }
      saving.value = true
      try {
        const res = await upsertMcpServer({ name, transport, url: transport === 'http' ? f.url : null, config, enabled: f.enabled })
        if (res?.success) {
          mcpForm.value = emptyMcpForm()
          await loadMcp()
        } else {
          modal.alert(res?.error || '保存失败')
        }
      } finally { saving.value = false }
    }

    const removeServer = async (s) => {
      try {
        const r = await modal.confirm(`确定删除 MCP server「${s.name}」？改表即停用，下一轮 agent 不再桥接其工具。`, { confirmText: '删除', confirmColor: '#ff4d4f' })
        if (!r.confirmed) return
        const res = await deleteMcpServer(s.name)
        if (res?.success) await loadMcp()
        else modal.alert(res?.error || '删除失败')
      } catch (e) { /* modal 关闭 */ }
    }

    // ---- 模型路由表单 ----
    const openRouteForm = (r) => {
      error.value = ''
      routeForm.value = r
        ? { show: true, editingKey: r.route_key, route_key: r.route_key, provider: r.provider || '', model: r.model || '', multimodal_model: r.multimodal_model || '', base_url: r.base_url || '', enabled: r.enabled !== false }
        : emptyRouteForm()
      routeForm.value.show = true
    }

    const saveRoute = async () => {
      const f = routeForm.value
      if (!f.route_key || !String(f.route_key).trim()) { modal.alert('route_key 必填'); return }
      saving.value = true
      try {
        const res = await upsertRoute({
          route_key: String(f.route_key).trim(),
          provider: f.provider || undefined,
          model: f.model || undefined,
          multimodal_model: f.multimodal_model || undefined,
          base_url: f.base_url || undefined,
          enabled: f.enabled
        })
        if (res?.success) {
          routeForm.value = emptyRouteForm()
          await loadRoutes()
        } else {
          modal.alert(res?.error || '保存失败')
        }
      } finally { saving.value = false }
    }

    const closeForm = (which) => {
      error.value = ''
      if (which === 'mcp') mcpForm.value = emptyMcpForm()
      else if (which === 'route') routeForm.value = emptyRouteForm()
    }

    onShow(async () => {
      gateLoaded.value = false
      const cap = await adminCapability()
      isOperator.value = cap.isOperator
      gateLoaded.value = true
      if (cap.isOperator) {
        await Promise.all([loadOverview(), loadClass(), switchTab(activeTab.value)])
      }
    })

    return {
      tabs, activeTab, gateLoaded, isOperator, error, saving,
      servers, routes, runs,
      mcpForm, routeForm,
      overview, loadingOverview, loadOverview, classDiag, loadingClass, loadClass, drill, loadDrill, cause, loadCause,
      str, shortId,
      mcpConfigSummary, routeSummary,
      switchTab, refresh,
      openMcpForm, saveMcp, removeServer,
      openRouteForm, saveRoute, closeForm
    }
  }
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: var(--color-bg-primary, #f7f8fa);
  padding-bottom: 40px;
}
.gate { padding: 60px 16px; }
.gate-text { display: block; text-align: center; color: #888; font-size: 14px; }

.tabs {
  display: flex;
  margin: 12px 16px;
  background: #fff;
  border-radius: 12px;
  padding: 4px;
  border: 1px solid var(--color-border, #e8e8f0);
}
.tab {
  flex: 1;
  text-align: center;
  padding: 8px 0;
  font-size: 14px;
  color: #666;
  border-radius: 9px;
}
.tab.active {
  background: #4a6cf7;
  color: #fff;
  font-weight: 600;
}

.page-error {
  display: block;
  margin: 0 16px 8px;
  padding: 10px 14px;
  background: #fff1f0;
  border: 1px solid #ffa39e;
  border-radius: 10px;
  color: #cf1322;
  font-size: 13px;
}

.section-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 6px 16px 10px;
}
.section-title { font-size: 15px; font-weight: 700; color: #1a1a2e; }
.new-btn { flex-shrink: 0; }

/* 运营总览（只读聚合） */
.overview-card {
  background: #fff;
  border-radius: 14px;
  padding: 12px 14px;
  margin: 0 0 12px;
  border: 1px solid var(--color-border, #e8e8f0);
}
.stats {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 4px;
}
.stat {
  flex: 1;
  min-width: 84px;
  background: #f5f6fb;
  border-radius: 10px;
  padding: 8px 6px;
  text-align: center;
}
.stat-n {
  display: block;
  font-size: 20px;
  font-weight: 800;
  color: #4a6cf7;
}
.stat-l {
  display: block;
  font-size: 11px;
  color: #888;
  margin-top: 2px;
}
.ov-block {
  margin-top: 12px;
  border-top: 1px dashed #eee;
  padding-top: 10px;
}
.ov-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #722ed1;
  margin-bottom: 6px;
}
.ov-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 0;
  font-size: 12px;
}
.ov-name { color: #333; }
.ov-n { color: #4a6cf7; font-weight: 700; }
.ov-recent-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
  font-size: 12px;
}
.ov-tool { color: #333; min-width: 88px; }
.ov-entity { color: #999; font-family: monospace; }
.ov-time { color: #bbb; margin-left: auto; flex-shrink: 0; }
.ov-loading {
  display: block;
  font-size: 12px;
  color: #999;
  padding: 6px 0;
}

/* 全班学情（只读运营集合）：知识点掌握度条带 */
.cd-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 12px;
}
.cd-name { color: #333; width: 96px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cd-bar-track { flex: 1; height: 8px; background: #eef0f6; border-radius: 6px; overflow: hidden; min-width: 40px; }
.cd-bar { height: 100%; border-radius: 6px; background: #52c41a; }
.cd-bar.low { background: #ff4d4f; }
.cd-bar.mid { background: #faad14; }
.cd-acc { color: #333; width: 40px; flex-shrink: 0; text-align: right; }
.cd-meta { color: #aaa; flex-shrink: 0; }
.cd-weak { margin-top: 10px; }
.cd-weak-tags { display: block; color: #722ed1; font-size: 12px; line-height: 1.6; }
.overview-card .inner { margin: 0; padding: 12px 0 4px; }
.cd-row { cursor: pointer; }
.cd-drill { color: #bbb; flex-shrink: 0; width: 12px; text-align: center; }
.cd-drilldown { margin-top: 8px; border-top: 1px dashed #eee; padding-top: 8px; }
.cd-q-row { padding: 5px 0; border-bottom: 1px solid #f5f5f8; }
.cd-q-content { display: block; font-size: 12px; color: #333; line-height: 1.5; }
.cd-q-stats { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
.cd-q-acc { font-size: 13px; font-weight: 800; color: #52c41a; }
.cd-q-acc.bad { color: #ff4d4f; }
.cd-q-meta { font-size: 11px; color: #999; }
.cd-q-diff { font-size: 11px; color: #bbb; border: 1px solid #eee; border-radius: 4px; padding: 1px 5px; }
.cd-empty { font-size: 12px; color: #999; padding: 8px 0; }
.cd-cause-btn { font-size: 11px; font-weight: 700; color: #722ed1; background: #f4f0fe; border-radius: 8px; padding: 2px 8px; flex-shrink: 0; }
.cd-cause { margin-top: 6px; background: #faf8ff; border-radius: 8px; padding: 8px 10px; font-size: 12px; }
.cd-cause-rule { display: block; color: #722ed1; font-weight: 600; line-height: 1.6; }
.cd-cause-list { margin-top: 6px; }
.cd-cause-row { display: flex; gap: 8px; align-items: center; padding: 2px 0; }
.cd-cause-uid { color: #999; font-family: monospace; flex-shrink: 0; min-width: 88px; }
.cd-cause-ans { color: #333; word-break: break-all; }
.cd-cause-empty { display: block; color: #aaa; padding: 4px 0; }

.empty-block { margin: 0 16px; padding: 20px 0; }

.row-card {
  margin: 0 16px 10px;
  background: #fff;
  border-radius: 14px;
  padding: 12px 14px;
  border: 1px solid var(--color-border, #e8e8f0);
}
.row-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.row-name { font-size: 15px; font-weight: 600; color: #1a1a2e; }
.mono { font-family: monospace; font-size: 13px; }
.row-chips { display: flex; gap: 6px; }
.row-sub { display: block; font-size: 12px; color: #888; margin-top: 6px; word-break: break-all; }
.row-lat { font-size: 12px; color: #722ed1; font-weight: 600; }
.row-actions { display: flex; gap: 8px; margin-top: 10px; }
.run-detail { margin-top: 8px; background: #f6f6fb; border-radius: 8px; padding: 8px 10px; }
.run-label { display: block; font-size: 11px; color: #999; margin-bottom: 2px; }
.run-text { display: block; font-size: 12px; color: #1a1a2e; word-break: break-all; }

.form-card {
  margin: 12px 16px;
  background: #fff;
  border-radius: 14px;
  padding: 14px;
  border: 1px solid var(--color-border, #e8e8f0);
}
.form-title { display: block; font-size: 15px; font-weight: 700; color: #1a1a2e; margin-bottom: 12px; }
.field { margin-bottom: 12px; }
.field-label { display: block; font-size: 12px; color: #666; margin-bottom: 6px; }
.field-input {
  width: 100%;
  box-sizing: border-box;
  height: 40px;
  background: #f6f6fb;
  border-radius: 10px;
  padding: 0 12px;
  font-size: 14px;
  color: #1a1a2e;
}
.field-input[disabled] { opacity: 0.6; }
.row-field { display: flex; align-items: center; justify-content: space-between; }
.seg { display: flex; gap: 8px; }
.seg-item {
  padding: 7px 18px;
  border-radius: 9px;
  background: #f0f0f5;
  color: #666;
  font-size: 13px;
}
.seg-item.on { background: #4a6cf7; color: #fff; }
.switch {
  width: 46px;
  height: 26px;
  border-radius: 13px;
  background: #d9d9d9;
  position: relative;
  transition: background 0.2s;
}
.switch.on { background: #4a6cf7; }
.switch-dot {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  transition: left 0.2s;
}
.switch.on .switch-dot { left: 23px; }
.form-hint { display: block; font-size: 12px; color: #999; margin-bottom: 12px; }
.form-actions { display: flex; gap: 10px; justify-content: flex-end; }

.ghost-btn {
  padding: 7px 14px;
  border-radius: 9px;
  border: 1px solid var(--color-border, #d5d5e0);
  color: #4a6cf7;
  font-size: 13px;
  font-weight: 500;
}
.ghost-btn.danger { color: #ff4d4f; border-color: #ffccc7; }
.ghost-btn:active { background: #f0f0f5; }
.primary-btn {
  padding: 7px 20px;
  border-radius: 9px;
  background: #4a6cf7;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
}
.primary-btn.disabled { opacity: 0.5; }

@media (prefers-color-scheme: dark) {
  .page { background: var(--color-bg-primary, #1a1a2e); }
  .tabs, .row-card, .form-card { background: var(--color-bg-card, #252542); border-color: var(--color-border, #3d3d5c); }
  .section-title, .row-name, .form-title { color: var(--color-text-primary, #e8e8f0); }
  .field-input { background: var(--color-bg-elevated, #2d2d4a); color: var(--color-text-primary, #e8e8f0); }
  .row-sub, .field-label, .form-hint { color: var(--color-text-tertiary, #888); }
  .run-detail { background: var(--color-bg-elevated, #2d2d4a); }
  .run-text { color: var(--color-text-primary, #e8e8f0); }
  .seg-item { background: var(--color-bg-elevated, #2d2d4a); color: #bbb; }
}
</style>