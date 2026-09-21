<template>
  <ErrorBoundary :showDetails="true" :logError="true">
    <view class="page">
      <PageHeader title="组织管理台" subtitle="组织树 · 成员 · 角色 · 邀请 · 审计" :actions="headerActions" />

      <!-- 非运营：无权限空态（不加载任何 admin 资源） -->
      <view v-if="loaded && !isOperator" class="no-access">
        <EmptyState
          title="无运营权限"
          description="站点运营（根组织 owner|admin）才能访问组织管理台。没有权限请勿尝试——后端仍会强制校验。"
          icon="🔒"
        />
      </view>

      <template v-if="isOperator">
        <!-- 组织选择器 -->
        <view class="org-bar">
          <scroll-view class="org-scroll" scroll-x="true">
            <view class="org-scroll-body">
              <Chip
                v-for="o in orgs"
                :key="o.id"
                :label="o.name"
                :count="o.level"
                color="blue"
                variant="outlined"
                :selected="o.id === selectedId"
                @click="selectOrg(o.id)"
              />
            </view>
          </scroll-view>
          <button class="mini-btn" size="mini" @click="openOrgForm()">新建</button>
        </view>

        <template v-if="selected">
          <!-- Tab 切换 -->
          <view class="tabs">
            <view
              v-for="t in tabs"
              :key="t.key"
              class="tab"
              :class="{ on: tab === t.key }"
              @click="switchTab(t.key)"
            >{{ t.label }}</view>
          </view>

          <view class="panel" v-if="loading"><text class="muted">加载中…</text></view>

          <!-- ── tab1 组织信息 ── -->
          <view class="panel" v-else-if="tab === 'info'">
            <view class="field" v-for="(lbl, k) in infoLabels" :key="k">
              <text class="field-label">{{ lbl }}</text>
              <text class="field-val">{{ displayOrg(k) }}</text>
            </view>
            <view class="btn-row">
              <button class="mini-btn" size="mini" @click="openOrgForm(selected)">编辑</button>
              <button class="mini-btn danger" size="mini" @click="onDeleteOrg">删除组织</button>
            </view>
          </view>

          <!-- ── tab2 成员 ── -->
          <view class="panel" v-else-if="tab === 'members'">
            <view class="btn-row">
              <button class="mini-btn" size="mini" @click="showMemberForm = true">添加成员</button>
              <text class="muted small">角色：{{ myRole || '—' }}</text>
            </view>

            <view v-if="showMemberForm" class="form-card">
              <view class="form-title">添加成员（在 public.users 中选人）</view>
              <input class="row-input" :value="memberSearch" @input="onSearchInput" placeholder="输入用户名/邮箱/姓名搜索" />
              <view class="user-list" v-if="userResults.length">
                <view
                  class="user-row"
                  v-for="u in userResults"
                  :key="u.id"
                  @click="pickUser(u)"
                >{{ u.username || u.email || u.name }} <text class="muted">{{ u.email }}</text></view>
              </view>
              <view class="field" v-if="memberForm.username">
                <text class="field-label">选中</text>
                <text class="field-val">{{ memberForm.username }}</text>
              </view>
              <view class="field">
                <text class="field-label">角色</text>
                <picker :range="rolesOpts" @change="e => (memberForm.role = rolesOpts[e.detail.value])">
                  <view class="picker-val">{{ memberForm.role }}</view>
                </picker>
              </view>
              <view class="btn-row">
                <button class="mini-btn" size="mini" :disabled="!memberForm.userId" @click="doAddMember">确认添加</button>
                <button class="mini-btn" size="mini" @click="closeMemberForm">取消</button>
              </view>
            </view>

            <view class="list">
              <view class="row" v-for="m in members" :key="m.id">
                <text class="row-main">{{ shortId(m.user_id) }}</text>
                <text class="row-sub">{{ m.role }}</text>
                <view class="row-actions">
                  <picker :range="rolesOpts" @change="e => doChangeRole(m, rolesOpts[e.detail.value])">
                    <text class="link">改角色</text>
                  </picker>
                  <text class="link danger" @click="doRemoveMember(m)">移除</text>
                </view>
              </view>
              <EmptyState v-if="!members.length" title="暂无成员" />
            </view>
          </view>

          <!-- ── tab3 角色 ── -->
          <view class="panel" v-else-if="tab === 'roles'">
            <view class="btn-row">
              <button class="mini-btn" size="mini" @click="openRoleForm()">新增角色</button>
            </view>
            <view v-if="showRoleForm" class="form-card">
              <view class="form-title">{{ roleForm.id ? '编辑角色' : '新增角色' }}</view>
              <input class="row-input" v-model="roleForm.name" placeholder="名称（必填）" />
              <input class="row-input" v-model="roleForm.code" placeholder="编码（必填，唯一）" />
              <input class="row-input" v-model="roleForm.description" placeholder="描述" />
              <input class="row-input" v-model="roleForm.permissions" placeholder="权限（逗号分隔）" />
              <view class="btn-row">
                <button class="mini-btn" size="mini" @click="saveRole">保存</button>
                <button class="mini-btn" size="mini" @click="showRoleForm = false">取消</button>
              </view>
            </view>
            <view class="list">
              <view class="row" v-for="r in roles" :key="r.id">
                <text class="row-main">{{ r.name }}</text>
                <text class="row-sub">{{ r.code }}</text>
                <view class="row-actions">
                  <text class="link" @click="openRoleForm(r)">编辑</text>
                </view>
              </view>
              <EmptyState v-if="!roles.length" title="暂无自定义角色" />
            </view>
          </view>

          <!-- ── tab4 邀请 ── -->
          <view class="panel" v-else-if="tab === 'invites'">
            <view class="btn-row">
              <button class="mini-btn" size="mini" @click="showInviteForm = true">发起邀请</button>
            </view>
            <view v-if="showInviteForm" class="form-card">
              <view class="form-title">邀请加入该组织（接受后成为 member）</view>
              <input class="row-input" v-model="inviteForm.email" placeholder="受邀邮箱（必填）" />
              <input class="row-input" v-model="inviteForm.message" placeholder="留言（可选）" />
              <view class="btn-row">
                <button class="mini-btn" size="mini" @click="sendInvite">发送</button>
                <button class="mini-btn" size="mini" @click="showInviteForm = false">取消</button>
              </view>
            </view>
            <view class="list">
              <view class="row" v-for="iv in invites" :key="iv.id">
                <text class="row-main">{{ iv.email }}</text>
                <text class="row-sub">{{ iv.status }}</text>
                <text class="row-sub">{{ shortId(iv.token) }}</text>
                <view class="row-actions">
                  <text class="link danger" v-if="iv.status === 'pending'" @click="cancelInvite(iv)">取消</text>
                </view>
              </view>
              <EmptyState v-if="!invites.length" title="暂无邀请" />
            </view>
          </view>

          <!-- ── tab5 审计 ── -->
          <view class="panel" v-else-if="tab === 'audit'">
            <view class="list">
              <view class="row col" v-for="a in auditRows" :key="a.id">
                <view class="row-line">
                  <text class="row-main">{{ a.action }}</text>
                  <text class="row-sub">{{ a.actor_name || shortId(a.actor_id) }}</text>
                </view>
                <view class="row-line">
                  <text class="row-sub">{{ a.entity_type }} · {{ shortId(a.entity_id) }}</text>
                  <text class="row-sub">{{ fmtTime(a.created_at) }}</text>
                </view>
                <view class="row-line" v-if="a.changes"><text class="muted small">{{ trunc(a.changes) }}</text></view>
              </view>
              <EmptyState v-if="!auditRows.length" title="暂无审计记录" />
            </view>
          </view>
        </template>
      </template>

      <!-- 新建/编辑组织表单 -->
      <view v-if="showOrgForm" class="org-mask">
        <view class="org-form">
          <view class="form-title">{{ orgForm.id ? '编辑组织' : '新建组织' }}</view>
          <input class="row-input" v-model="orgForm.name" placeholder="组织名（必填）" />
          <input class="row-input" v-model="orgForm.short_name" placeholder="简称" />
          <picker :range="orgTypes" @change="e => (orgForm.type = orgTypes[e.detail.value])">
            <view class="row-input picker-val">类型：{{ orgForm.type || 'other' }}</view>
          </picker>
          <input class="row-input" v-model="orgForm.code" placeholder="编码" />
          <input class="row-input" v-model="orgForm.description" placeholder="描述" />
          <text v-if="!orgForm.id" class="muted small">父组织：{{ parentName || '（根）' }}</text>
          <view class="btn-row">
            <button class="mini-btn" size="mini" @click="saveOrg">保存</button>
            <button class="mini-btn" size="mini" @click="showOrgForm = false">取消</button>
          </view>
        </view>
      </view>
    </view>
  </ErrorBoundary>
</template>

<script>
import { ref, reactive, computed } from 'vue'
import { onShow, onPullDownRefresh } from '@dcloudio/uni-app'
import ErrorBoundary from '@/components/ErrorBoundary.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import Chip from '@/components/ui/Chip.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import {
  adminCapability, myMemberships, listOrganizations,
  createOrganization, updateOrganization, deleteOrganization,
  listMembers, addMember, removeMember, updateMemberRole,
  listRoles, createRole, updateRole,
  listInvitations, createInvitation, cancelInvitation,
  audit, lookupUsers
} from '@/api'

export default {
  name: 'PortalConsole',
  components: { ErrorBoundary, PageHeader, Chip, EmptyState },
  setup() {
    const loading = ref(false)
    const loaded = ref(false)
    const isOperator = ref(false)
    const orgs = ref([])
    const memberships = ref([])
    const selectedId = ref('')
    const tab = ref('info')
    const members = ref([])
    const roles = ref([])
    const invites = ref([])
    const auditRows = ref([])

    const orgForm = reactive({ id: '', name: '', short_name: '', type: 'other', code: '', description: '' })
    const showOrgForm = ref(false)
    const memberSearch = ref('')
    const userResults = ref([])
    const memberForm = reactive({ userId: '', username: '', role: 'member' })
    const showMemberForm = ref(false)
    const roleForm = reactive({ id: '', name: '', code: '', description: '', permissions: '' })
    const showRoleForm = ref(false)
    const inviteForm = reactive({ email: '', message: '' })
    const showInviteForm = ref(false)

    const tabs = [
      { key: 'info', label: '组织信息' },
      { key: 'members', label: '成员' },
      { key: 'roles', label: '角色' },
      { key: 'invites', label: '邀请' },
      { key: 'audit', label: '审计' }
    ]
    const orgTypes = ['school', 'university', 'institute', 'company', 'other']
    const rolesOpts = ['member', 'admin', 'owner']
    const infoLabels = { name: '名称', code: '编码', short_name: '简称', type: '类型', description: '描述', level: '层级', parent_id: '父组织' }

    const selected = computed(() => orgs.value.find(o => o.id === selectedId.value) || null)
    const myRole = computed(() => {
      const m = memberships.value.find(x => x.organization?.id === selectedId.value)
      return m ? m.role : null
    })
    const parentName = computed(() => {
      if (!orgForm.id && selectedId.value) {
        const p = orgs.value.find(o => o.id === selectedId.value)
        return p ? p.name : '（根）'
      }
      return ''
    })
    const headerActions = computed(() => [
      { label: '刷新', handler: refresh }
    ])

    const shortId = (s) => (s || '—').slice(0, 8) + '…'
    const trunc = (x) => {
      const s = typeof x === 'string' ? x : JSON.stringify(x)
      return (s || '').length > 60 ? s.slice(0, 60) + '…' : s
    }
    const fmtTime = (t) => (t ? String(t).replace('T', ' ').slice(0, 19) : '—')
    const displayOrg = (k) => {
      if (k === 'parent_id') return (selected.value?.parent_id && shortId(selected.value.parent_id)) || '（根）'
      return selected.value?.[k] || '—'
    }

    const toast = (title, icon = 'none') => uni.showToast({ title, icon })

    const loadTab = async () => {
      if (!selectedId.value) return
      loading.value = true
      try {
        if (tab.value === 'members') {
          const r = await listMembers(selectedId.value)
          members.value = Array.isArray(r) ? r : []
        } else if (tab.value === 'roles') {
          const r = await listRoles(selectedId.value)
          roles.value = Array.isArray(r) ? r : []
        } else if (tab.value === 'invites') {
          const r = await listInvitations(selectedId.value)
          invites.value = Array.isArray(r) ? r : []
        } else if (tab.value === 'audit') {
          const r = await audit(selectedId.value)
          auditRows.value = (r && r.rows) || []
        }
      } finally {
        loading.value = false
      }
    }

    const refresh = async () => {
      const res = await listOrganizations()
      if (Array.isArray(res)) {
        const was = selectedId.value
        orgs.value = res
        if (!res.some(o => o.id === was)) selectedId.value = res[0]?.id || ''
      }
      await loadTab()
    }

    const init = async () => {
      loading.value = true
      try {
        const [cap, orgRes, mem] = await Promise.all([adminCapability(), listOrganizations(), myMemberships()])
        isOperator.value = !!cap.isOperator
        loaded.value = true
        if (!isOperator.value) return
        orgs.value = Array.isArray(orgRes) ? orgRes : []
        memberships.value = Array.isArray(mem) ? mem : (mem.memberships || [])
        if (!selectedId.value && orgs.value.length) selectedId.value = orgs.value[0].id
        await loadTab()
      } finally {
        loading.value = false
      }
    }

    const selectOrg = (id) => {
      if (selectedId.value !== id) {
        selectedId.value = id
        loadTab()
      }
    }

    const switchTab = (k) => {
      tab.value = k
      loadTab()
    }

    // 组织信息
    const openOrgForm = (o) => {
      Object.assign(orgForm, {
        id: o?.id || '',
        name: o?.name || '',
        short_name: o?.short_name || '',
        type: o?.type || 'other',
        code: o?.code || '',
        description: o?.description || ''
      })
      showOrgForm.value = true
    }

    const saveOrg = async () => {
      if (!orgForm.name.trim()) { toast('组织名必填'); return }
      if (orgForm.id) {
        const r = await updateOrganization(orgForm.id, {
          name: orgForm.name.trim(), short_name: orgForm.short_name || undefined,
          code: orgForm.code || undefined, description: orgForm.description || undefined
        })
        if (r && r.id) { toast('已更新'); showOrgForm.value = false; await refresh() }
        else toast((r && r.error) || '更新失败')
      } else {
        const r = await createOrganization({
          name: orgForm.name.trim(), short_name: orgForm.short_name || undefined,
          type: orgForm.type || 'other', code: orgForm.code || undefined,
          description: orgForm.description || undefined, parent_id: selectedId.value || undefined
        })
        if (r && r.id) { toast('已创建'); showOrgForm.value = false; await refresh() }
        else toast((r && r.error) || '创建失败')
      }
    }

    const onDeleteOrg = () => {
      uni.showModal({
        title: '删除组织',
        content: '将级联删除成员/角色/邀请/审计，不可恢复。确认删除？',
        confirmColor: '#e5484d',
        success: async (res) => {
          if (!res.confirm) return
          const r = await deleteOrganization(selectedId.value)
          if (r.success) { toast('已删除'); selectedId.value = ''; await refresh() }
          else toast(r.error || '删除失败')
        }
      })
    }

    // 成员
    const onSearchInput = (e) => {
      memberSearch.value = (e.detail && e.detail.value) || ''
      searchUsers()
    }
    const searchUsers = async () => {
      const r = await lookupUsers(memberSearch.value.trim())
      userResults.value = (r && r.users) || []
    }
    const pickUser = (u) => {
      memberForm.userId = u.id
      memberForm.username = u.username || u.email || u.name
      userResults.value = []
      memberSearch.value = u.username || u.email || ''
    }
    const closeMemberForm = () => {
      showMemberForm.value = false
      memberForm.userId = ''; memberForm.username = ''; memberForm.role = 'member'
      memberSearch.value = ''; userResults.value = []
    }
    const doAddMember = async () => {
      if (!memberForm.userId) { toast('请先选择用户'); return }
      const r = await addMember(selectedId.value, { userId: memberForm.userId, role: memberForm.role })
      if ((r && r.id) || r.success) { toast('已添加'); closeMemberForm(); await loadTab() }
      else toast((r && r.error) || '添加失败')
    }
    const doChangeRole = async (m, role) => {
      const r = await updateMemberRole(selectedId.value, m.user_id, role)
      if ((r && r.id) || r.success) { toast('角色已更新'); await loadTab() }
      else toast((r && r.error) || '更新失败')
    }
    const doRemoveMember = (m) => {
      uni.showModal({
        title: '移除成员',
        content: `确认移除 ${shortId(m.user_id)}？`,
        confirmColor: '#e5484d',
        success: async (res) => {
          if (!res.confirm) return
          const r = await removeMember(selectedId.value, m.user_id)
          if (r.success) { toast('已移除'); await loadTab() }
          else toast(r.error || '移除失败')
        }
      })
    }

    // 角色
    const openRoleForm = (r) => {
      Object.assign(roleForm, {
        id: r?.id || '', name: r?.name || '', code: r?.code || '',
        description: r?.description || '', permissions: Array.isArray(r?.permissions) ? r.permissions.join(',') : ''
      })
      showRoleForm.value = true
    }
    const saveRole = async () => {
      if (!roleForm.name.trim() || !roleForm.code.trim()) { toast('name/code 必填'); return }
      const permissions = roleForm.permissions.split(',').map(s => s.trim()).filter(Boolean)
      if (roleForm.id) {
        const r = await updateRole(selectedId.value, roleForm.id, { name: roleForm.name.trim(), code: roleForm.code.trim(), description: roleForm.description || undefined, permissions })
        if ((r && r.id) || r.success) { toast('已保存'); showRoleForm.value = false; await loadTab() }
        else toast((r && r.error) || '保存失败')
      } else {
        const r = await createRole(selectedId.value, { name: roleForm.name.trim(), code: roleForm.code.trim(), description: roleForm.description || undefined, permissions })
        if ((r && r.id) || r.success) { toast('已创建'); showRoleForm.value = false; await loadTab() }
        else toast((r && r.error) || '创建失败')
      }
    }

    // 邀请
    const sendInvite = async () => {
      if (!inviteForm.email.trim()) { toast('邮箱必填'); return }
      const r = await createInvitation(selectedId.value, { email: inviteForm.email.trim(), message: inviteForm.message || undefined })
      if ((r && r.id) || r.success) { toast('已发送'); showInviteForm.value = false; inviteForm.email = ''; inviteForm.message = ''; await loadTab() }
      else toast((r && r.error) || '发送失败')
    }
    const cancelInvite = (iv) => {
      uni.showModal({
        title: '取消邀请',
        content: `取消对 ${iv.email} 的邀请？`,
        confirmColor: '#e5484d',
        success: async (res) => {
          if (!res.confirm) return
          const r = await cancelInvitation(selectedId.value, iv.id)
          if (r.success) { toast('已取消'); await loadTab() }
          else toast(r.error || '取消失败')
        }
      })
    }

    onShow(init)
    onPullDownRefresh(async () => { await refresh(); uni.stopPullDownRefresh() })

    return {
      loading, loaded, isOperator, orgs, memberships, selectedId, tab,
      members, roles, invites, auditRows,
      orgForm, showOrgForm, memberSearch, userResults, memberForm, showMemberForm,
      roleForm, showRoleForm, inviteForm, showInviteForm,
      tabs, orgTypes, rolesOpts, infoLabels,
      selected, myRole, parentName, headerActions,
      shortId, trunc, fmtTime, displayOrg,
      selectOrg, switchTab, refresh,
      openOrgForm, saveOrg, onDeleteOrg,
      searchUsers, onSearchInput, pickUser, closeMemberForm, doAddMember, doChangeRole, doRemoveMember,
      openRoleForm, saveRole, sendInvite, cancelInvite
    }
  }
}
</script>

<style scoped>
.page { min-height: 100vh; background: var(--color-bg-primary); padding-bottom: 40rpx; }
.no-access { padding: 80rpx 32rpx; }

.org-bar { display: flex; align-items: center; gap: 12rpx; padding: 12rpx 24rpx; }
.org-scroll { flex: 1; white-space: nowrap; }
.org-scroll-body { display: inline-flex; gap: 12rpx; padding: 4rpx; }

.tabs { display: flex; gap: 8rpx; padding: 8rpx 24rpx; border-bottom: 1px solid var(--color-border); }
.tab { flex: 1; text-align: center; padding: 14rpx 0; font-size: var(--font-size-base); color: var(--color-text-secondary); border-bottom: 3rpx solid transparent; }
.tab.on { color: var(--color-primary); font-weight: var(--font-weight-medium); border-bottom-color: var(--color-primary); }

.panel { padding: 24rpx; }
.field { margin-bottom: 20rpx; }
.field-label { display: block; font-size: var(--font-size-sm); color: var(--color-text-secondary); margin-bottom: 4rpx; }
.field-val { font-size: var(--font-size-base); color: var(--color-text-primary); }

.btn-row { display: flex; align-items: center; gap: 16rpx; margin-bottom: 16rpx; flex-wrap: wrap; }
.mini-btn { margin: 0; }
.mini-btn.danger { background: #e5484d; color: #fff; }

.form-card { background: var(--color-bg-card); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 20rpx; margin-bottom: 16rpx; }
.form-title { font-weight: var(--font-weight-medium); margin-bottom: 16rpx; color: var(--color-primary); }
.row-input { width: 100%; box-sizing: border-box; padding: 14rpx 18rpx; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-bg-card); color: var(--color-text-primary); margin-bottom: 12rpx; }
.picker-val { line-height: 44rpx; }
.user-list { max-height: 320rpx; overflow-y: auto; margin-bottom: 12rpx; }
.user-row { padding: 12rpx 16rpx; border-bottom: 1px solid var(--color-border); }

.list { display: flex; flex-direction: column; gap: 12rpx; }
.row { display: flex; align-items: center; gap: 12rpx; background: var(--color-bg-card); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 16rpx 20rpx; }
.row.col { flex-direction: column; align-items: stretch; }
.row-line { display: flex; align-items: center; justify-content: space-between; gap: 12rpx; }
.row-main { font-size: var(--font-size-base); color: var(--color-text-primary); }
.row-sub { font-size: var(--font-size-sm); color: var(--color-text-secondary); }
.row-actions { margin-left: auto; display: flex; gap: 20rpx; }
.link { color: var(--color-primary); font-size: var(--font-size-sm); }
.link.danger { color: #e5484d; }
.muted { color: var(--color-text-secondary); }
.small { font-size: var(--font-size-sm); }

.org-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; padding: 40rpx; z-index: 100; }
.org-form { width: 100%; max-width: 640rpx; background: var(--color-bg-card); border-radius: var(--radius-lg); padding: 32rpx; }
</style>