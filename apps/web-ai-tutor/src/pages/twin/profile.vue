<template>
  <view class="page">
    <scroll-view class="main" scroll-y="true">
      <LoadingSkeleton v-if="twinStore.loading && !twinStore.loaded" variant="card" :rows="4" />

      <template v-else>
        <!-- 身份卡 -->
        <view class="ident-card">
          <AvatarTwin :name="twinStore.displayName" :avatar-url="twinStore.avatarUrl" :size="84" />
          <text class="ident-name">{{ twinStore.displayName }}</text>
          <text class="ident-sub">{{ twinStore.gradeName || '未设置年级' }} · {{ worldName || '学科' }}</text>
          <text class="ident-hint">身份 · 始终如一（稳定属性）</text>
        </view>

        <!-- 可编辑资料 -->
        <view class="card">
          <PageHeader title="编辑资料" subtitle="保存即记入你的经历" />

          <view class="field">
            <text class="field-label">姓名</text>
            <input class="field-input" v-model="form.name" placeholder="你的名字" maxlength="20" />
          </view>

          <view class="field">
            <text class="field-label">年级</text>
            <picker mode="selector" :range="gradeOptions" :value="gradeIndex" @change="onGradeChange">
              <view class="field-picker">
                <text :class="{ placeholder: form.gradeLevel == null }">
                  {{ form.gradeLevel == null ? '选择年级' : gradeOptions[gradeIndex] }}
                </text>
                <text class="arrow">›</text>
              </view>
            </picker>
          </view>

          <view class="field">
            <text class="field-label">教材版本</text>
            <input class="field-input" v-model="form.textbookVersion" placeholder="如：人教版" maxlength="30" />
          </view>

          <view class="field">
            <text class="field-label">学校</text>
            <input class="field-input" v-model="form.school" placeholder="你的学校" maxlength="40" />
          </view>

          <button class="save-btn" :disabled="saving" @click="onSave">
            {{ saving ? '保存中…' : '保存画像' }}
          </button>
        </view>

        <!-- 只读账号信息 -->
        <view class="card">
          <PageHeader title="账号" subtitle="由统一身份决定，不可自助修改" />
          <view class="ro-row"><text class="ro-k">用户名</text><text class="ro-v">{{ twinStore.profile?.username || '—' }}</text></view>
          <view class="ro-row"><text class="ro-k">角色</text><text class="ro-v">{{ twinStore.profile?.role || '—' }}</text></view>
          <view class="ro-row"><text class="ro-k">孪生 ID</text><text class="ro-v mono">{{ shortId }}</text></view>
        </view>

        <view class="safe-area" />
      </template>
    </scroll-view>
  </view>
</template>

<script>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useTwinStore } from '@/store/twin'
import { useKnowledgeStore } from '@/store/knowledge'
import AvatarTwin from '@/components/twin/AvatarTwin.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import LoadingSkeleton from '@/components/ui/LoadingSkeleton.vue'

const GRADE_NAMES = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级', '七年级', '八年级', '九年级', '高一', '高二', '高三']

export default {
  name: 'TwinProfile',
  components: { AvatarTwin, PageHeader, LoadingSkeleton },
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
.page {
  min-height: 100vh;
  background: var(--color-bg-primary, #f7f8fa);
}

.main {
  flex: 1;
}

/* 身份卡 */
.ident-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  background: linear-gradient(135deg, #4a6cf7 0%, #3b5bd9 100%);
  padding: 28px 16px 24px;
  border-radius: 0 0 24px 24px;
  margin-bottom: 16px;
}

.ident-name {
  font-size: 20px;
  font-weight: 700;
  color: #fff;
  margin-top: 6px;
}

.ident-sub {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.9);
}

.ident-hint {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.7);
  margin-top: 4px;
}

/* 卡片 */
.card {
  margin: 0 16px 16px;
  background: #fff;
  border-radius: 16px;
  padding: 4px 16px 16px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  border: 1px solid var(--color-border, #e8e8f0);
}

.field {
  margin-top: 14px;
}

.field-label {
  display: block;
  font-size: 13px;
  color: var(--color-text-secondary, #666);
  margin-bottom: 6px;
}

.field-input,
.field-picker {
  width: 100%;
  height: 42px;
  line-height: 42px;
  padding: 0 12px;
  font-size: 14px;
  color: var(--color-text-primary, #1a1a2e);
  background: var(--color-bg-secondary, #f5f6fa);
  border-radius: 10px;
  box-sizing: border-box;
}

.field-picker {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.field-picker .placeholder {
  color: #aaa;
}

.arrow {
  color: #bbb;
  font-size: 18px;
}

.save-btn {
  margin-top: 20px;
  background: #4a6cf7;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  border-radius: 12px;
  border: none;
}

.save-btn[disabled] {
  opacity: 0.6;
}

/* 只读行 */
.ro-row {
  display: flex;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid var(--color-border, #f0f0f5);
}

.ro-row:last-child {
  border-bottom: none;
}

.ro-k {
  font-size: 13px;
  color: var(--color-text-secondary, #666);
}

.ro-v {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary, #1a1a2e);
}

.mono {
  font-family: monospace;
}

.safe-area {
  height: 40px;
}

@media (prefers-color-scheme: dark) {
  .page {
    background: var(--color-bg-primary, #1a1a2e);
  }

  .card {
    background: var(--color-bg-card, #252542);
    border-color: var(--color-border, #3d3d5c);
  }

  .field-input,
  .field-picker {
    background: #1f1f38;
  }
}
</style>
