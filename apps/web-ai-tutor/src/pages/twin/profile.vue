<template>
  <view class="tw-page">
    <view class="tw-head">
      <text class="tw-title">人物画像</text>
      <text class="tw-sub">身份 · 始终如一（稳定属性）——这是孪生体里最不常变的部分，由你填写、由统一身份背书。</text>
    </view>

    <LoadingSkeleton v-if="twinStore.loading && !twinStore.loaded" variant="card" :rows="4" />

    <template v-else>
      <!-- 身份卡 -->
      <view class="tw-panel ident-panel">
        <AvatarTwin :name="twinStore.displayName" :avatar-url="twinStore.avatarUrl" :size="96" />
        <text class="ident-name">{{ twinStore.displayName }}</text>
        <view class="ident-tags">
          <text class="tw-tag green">{{ twinStore.gradeName || '未设置年级' }}</text>
          <text class="tw-tag">{{ worldName || '学科' }}</text>
          <text class="tw-tag">孪生 {{ shortId }}</text>
        </view>
        <text class="ident-hint">程序化绘制 · 有头像则用真实头像</text>
      </view>

      <!-- 可编辑资料 -->
      <view class="tw-panel">
        <view class="tw-panel-head">
          <view>
            <text class="tw-panel-title">编辑资料</text>
            <text class="tw-panel-sub">保存即记入你的经历</text>
          </view>
        </view>

        <view class="tw-field">
          <text class="tw-field-label">姓名</text>
          <input class="tw-input" v-model="form.name" placeholder="你的名字" maxlength="20" />
        </view>

        <view class="tw-field">
          <text class="tw-field-label">年级</text>
          <picker mode="selector" :range="gradeOptions" :value="gradeIndex" @change="onGradeChange">
            <view class="tw-input picker">
              <text :class="{ ph: form.gradeLevel == null }">
                {{ form.gradeLevel == null ? '选择年级' : gradeOptions[gradeIndex] }}
              </text>
              <text class="arrow">›</text>
            </view>
          </picker>
        </view>

        <view class="tw-field">
          <text class="tw-field-label">教材版本</text>
          <input class="tw-input" v-model="form.textbookVersion" placeholder="如：人教版" maxlength="30" />
        </view>

        <view class="tw-field">
          <text class="tw-field-label">学校</text>
          <input class="tw-input" v-model="form.school" placeholder="你的学校" maxlength="40" />
        </view>

        <button class="tw-btn primary block save" :disabled="saving" @click="onSave">
          {{ saving ? '保存中…' : '保存画像' }}
        </button>
      </view>

      <!-- 只读账号信息 -->
      <view class="tw-panel">
        <view class="tw-panel-head">
          <view>
            <text class="tw-panel-title">账号</text>
            <text class="tw-panel-sub">由统一身份决定，不可自助修改</text>
          </view>
        </view>
        <view class="ro-row"><text class="ro-k">用户名</text><text class="ro-v">{{ twinStore.profile?.username || '—' }}</text></view>
        <view class="ro-row"><text class="ro-k">角色</text><text class="ro-v">{{ twinStore.profile?.role || '—' }}</text></view>
        <view class="ro-row"><text class="ro-k">孪生 ID</text><text class="ro-v tw-mono">{{ shortId }}</text></view>
      </view>

      <view class="tw-safe" />
    </template>
  </view>
</template>

<script>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useTwinStore } from '@/store/twin'
import { useKnowledgeStore } from '@/store/knowledge'
import AvatarTwin from '@/components/twin/AvatarTwin.vue'
import LoadingSkeleton from '@/components/ui/LoadingSkeleton.vue'

const GRADE_NAMES = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级', '七年级', '八年级', '九年级', '高一', '高二', '高三']

export default {
  name: 'TwinProfile',
  components: { AvatarTwin, LoadingSkeleton },
  setup() {
    const twinStore = useTwinStore()
    const knowledgeStore = useKnowledgeStore()
    const saving = ref(false)

    const form = reactive({ name: '', gradeLevel: null, textbookVersion: '', school: '' })

    const gradeOptions = GRADE_NAMES
    const gradeIndex = computed(() => {
      const g = Number(form.gradeLevel)
      return g >= 1 && g <= 12 ? g - 1 : 0
    })

    const worldName = computed(() => twinStore.world?.subjectName || '')
    const shortId = computed(() => (twinStore.profile?.id || '').slice(0, 8) || '—')

    // 用孪生身份回填表单
    function syncForm() {
      const p = twinStore.profile
      if (!p) return
      form.name = p.name || ''
      form.gradeLevel = p.gradeLevel ?? null
      form.textbookVersion = p.textbookVersion || ''
      form.school = p.school || ''
    }
    watch(() => twinStore.profile, syncForm)

    function onGradeChange(e) {
      form.gradeLevel = Number(e.detail.value) + 1
    }

    async function onSave() {
      if (saving.value) return
      saving.value = true
      const ok = await twinStore.saveProfile({
        name: form.name,
        gradeLevel: form.gradeLevel,
        textbookVersion: form.textbookVersion,
        school: form.school
      })
      saving.value = false
      uni.showToast({ title: ok ? '画像已更新' : '保存失败，请重试', icon: ok ? 'success' : 'none' })
    }

    async function load() {
      if (!twinStore.loaded) {
        await twinStore.loadOverview(knowledgeStore.currentSubject || 'math')
      }
      syncForm()
    }

    onMounted(load)

    return { twinStore, saving, form, gradeOptions, gradeIndex, worldName, shortId, onGradeChange, onSave }
  }
}
</script>

<style scoped>
.ident-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 26px 16px 22px;
  background: linear-gradient(180deg, #f2f8ef 0%, #ffffff 62%);
}
.ident-name { font-size: 20px; font-weight: 700; margin-top: 6px; }
.ident-tags { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
.ident-hint { font-size: 10px; color: #9caa93; margin-top: 2px; }

.picker { display: flex; align-items: center; justify-content: space-between; }
.picker .ph { color: #9caa93; }
.arrow { color: #b3c2a8; font-size: 18px; }

.save { margin-top: 20px; }

.ro-row {
  display: flex; justify-content: space-between;
  padding: 12px 0; border-bottom: 1px solid var(--twin-line);
}
.ro-row:last-child { border-bottom: none; }
.ro-k { font-size: 13px; color: var(--twin-sub); }
.ro-v { font-size: 13px; font-weight: 600; color: var(--twin-ink); }
</style>
