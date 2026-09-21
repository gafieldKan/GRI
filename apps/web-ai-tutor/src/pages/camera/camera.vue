<template>
  <ErrorBoundary :showDetails="true" :logError="true">
    <view class="camera-container">
      <!-- 相机预览区域 -->
      <view class="camera-preview" v-if="!hasPhoto">
        <view class="camera-guide">
          <view class="guide-icon">📸</view>
          <text class="guide-text">拍照/上传题目</text>
          <text class="guide-hint">支持数学、物理、化学等理科题目</text>
        </view>

        <view class="camera-actions">
          <t-button
            theme="primary"
            size="large"
            shape="round"
            @click="takePhoto"
          >
            拍照
          </t-button>
          <t-button
            theme="default"
            size="large"
            shape="round"
            @click="chooseFromAlbum"
          >
            从相册选择
          </t-button>
        </view>
      </view>

      <!-- 已拍照预览 -->
      <view class="photo-preview" v-if="hasPhoto">
        <image
          :src="photoPath"
          mode="aspectFit"
          class="photo-image"
        ></image>

        <view class="photo-actions">
          <t-button
            theme="primary"
            size="large"
            @click="analyzePhoto"
          >
            开始诊断
          </t-button>
          <t-button
            theme="default"
            size="large"
            @click="retakePhoto"
          >
            重拍
          </t-button>
        </view>
      </view>

      <!-- 分析中状态 -->
      <t-dialog
        :visible="analyzing"
        title="AI 分析中"
        content="正在识别题目并分析知识点..."
        show-cancel-button="false"
      >
        <template #content>
          <view class="analyzing-content">
            <LoadingSkeleton variant="loading" />
            <text>正在识别题目内容...</text>
          </view>
        </template>
      </t-dialog>
    </view>

    <template #fallback>
      <EmptyState
        title="相机加载失败"
        description="无法初始化相机，请检查权限设置"
        icon="📸"
        :actions="[{ label: '重试', handler: () => location.reload() }]"
      />
    </template>
  </ErrorBoundary>
</template>

<script setup>
import { ref, computed } from 'vue'
import { uploadExamImage, saveExam, analyzeExam } from '../../api/index.js'
import { useUserStore } from '@/store/user'
import ErrorBoundary from '@/components/ErrorBoundary.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import LoadingSkeleton from '@/components/ui/LoadingSkeleton.vue'

const hasPhoto = ref(false)
const photoPath = ref('')
const analyzing = ref(false)

// 拍照
const takePhoto = async () => {
  try {
    const { tempFilePath } = await uni.chooseImage({
      count: 1,
      sourceType: ['camera']
    })
    photoPath.value = tempFilePath[0]
    hasPhoto.value = true
  } catch (error) {
    console.error('拍照失败:', error)
    uni.showToast({
      title: '拍照失败，请重试',
      icon: 'none'
    })
  }
}

// 从相册选择
const chooseFromAlbum = async () => {
  try {
    const { tempFilePath } = await uni.chooseImage({
      count: 1,
      sourceType: ['album']
    })
    photoPath.value = tempFilePath[0]
    hasPhoto.value = true
  } catch (error) {
    console.error('选择图片失败:', error)
    uni.showToast({
      title: '选择失败，请重试',
      icon: 'none'
    })
  }
}

// 将本地路径转为 Blob（用于 FormData 上传）
const pathToBlob = async (filePath) => {
  // web 端: uni.chooseImage 在 H5 下返回 base64 或 blobUrl
  // 如果已经是 blob URL，fetch 后转 Blob
  if (filePath.startsWith('blob:') || filePath.startsWith('data:')) {
    const response = await fetch(filePath)
    return await response.blob()
  }
  throw new Error('不支持的图片格式，请重试')
}

// 重拍
const retakePhoto = () => {
  hasPhoto.value = false
  photoPath.value = ''
}

// 开始分析
const analyzePhoto = async () => {
  if (!photoPath.value) return

  analyzing.value = true

  try {
    // 将本地路径转为 Blob，通过 FormData 上传
    const blob = await pathToBlob(photoPath.value)
    const result = await uploadExamImage(blob, 'math', '8')

    if (result.success && result.parsedQuestions) {
      await saveExam({
        studentId: useUserStore().studentId,
        subject: 'math',
        gradeLevel: '8',
        examType: 'photo',
        parsedQuestions: result.parsedQuestions,
        rawImages: [photoPath.value],
        ocrResult: result
      })

      uni.navigateTo({
        url: '/pages/chat/chat?from=camera&ocrResult=' + encodeURIComponent(JSON.stringify(result))
      })
    } else {
      uni.navigateTo({
        url: '/pages/chat/chat?from=camera&image=' + encodeURIComponent(photoPath.value)
      })
    }

    analyzing.value = false
  } catch (error) {
    console.error('分析失败:', error)
    analyzing.value = false
    uni.showToast({
      title: '分析失败，将手动输入题目',
      icon: 'none',
      duration: 2000
    })
    setTimeout(() => {
      uni.navigateTo({
        url: '/pages/chat/chat?from=camera&image=' + encodeURIComponent(photoPath.value)
      })
    }, 2000)
  }
}
</script>

<style scoped>
.camera-container {
  min-height: 100vh;
  background: #fff;
  padding: 20px;
}

/* 相机引导 */
.camera-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 80vh;
}

.camera-guide {
  text-align: center;
  margin-bottom: 40px;
}

.guide-icon {
  font-size: 64px;
  margin-bottom: 16px;
}

.guide-text {
  display: block;
  font-size: 20px;
  font-weight: 600;
  color: #333;
  margin-bottom: 8px;
}

.guide-hint {
  display: block;
  font-size: 14px;
  color: #999;
}

.camera-actions {
  display: flex;
  gap: 16px;
  margin-top: 24px;
}

/* 照片预览 */
.photo-preview {
  margin-top: 20px;
}

.photo-image {
  width: 100%;
  border-radius: 12px;
  margin-bottom: 24px;
}

.photo-actions {
  display: flex;
  gap: 12px;
}

/* 分析中 */
.analyzing-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 20px;
}
</style>
