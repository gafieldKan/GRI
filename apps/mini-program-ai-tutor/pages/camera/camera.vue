<template>
  <view class="camera-container">
    <!-- 相机预览区域 -->
    <view class="camera-preview" v-if="!hasPhoto">
      <view class="camera-guide">
        <view class="guide-icon">📸</view>
        <text class="guide-text">拍照/上传题目</text>
        <text class="guide-hint">支持数学、物理、化学等理科题目</text>
      </view>

      <view class="camera-actions">
        <button
          type="primary"
          class="camera-btn"
          @click="takePhoto"
        >
          拍照
        </button>
        <button
          type="default"
          class="camera-btn"
          @click="chooseFromAlbum"
        >
          从相册选择
        </button>
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
        <button
          type="primary"
          class="camera-btn"
          @click="analyzePhoto"
        >
          开始诊断
        </button>
        <button
          type="default"
          class="camera-btn"
          @click="retakePhoto"
        >
          重拍
        </button>
      </view>
    </view>

    <!-- 分析中状态 -->
    <uni-popup ref="analyzingPopup" type="center" :is-mask-click="false">
      <view class="analyzing-content">
        <view class="loading-spinner"></view>
        <text>正在识别题目内容...</text>
      </view>
    </uni-popup>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { uploadExamImage, saveExam } from '../../api/index.js'
import { useUserStore } from '../../store/user.js'

const hasPhoto = ref(false)
const photoPath = ref('')
const analyzing = ref(false)
const analyzingPopup = ref(null)

const setAnalyzing = (val) => {
  analyzing.value = val
  if (val) {
    analyzingPopup.value && analyzingPopup.value.open()
  } else {
    analyzingPopup.value && analyzingPopup.value.close()
  }
}

// 拍照（微信小程序通过 uni.chooseImage 调用 wx.chooseImage）
const takePhoto = async () => {
  try {
    const res = await uni.chooseImage({
      count: 1,
      sourceType: ['camera']
    })
    photoPath.value = res.tempFilePaths[0]
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
    const res = await uni.chooseImage({
      count: 1,
      sourceType: ['album']
    })
    photoPath.value = res.tempFilePaths[0]
    hasPhoto.value = true
  } catch (error) {
    console.error('选择图片失败:', error)
    uni.showToast({
      title: '选择失败，请重试',
      icon: 'none'
    })
  }
}

// 重拍
const retakePhoto = () => {
  hasPhoto.value = false
  photoPath.value = ''
}

// 开始分析 — 小程序中上传临时文件路径到后端
const analyzePhoto = async () => {
  if (!photoPath.value) return

  setAnalyzing(true)

  try {
    // 小程序上传图片（后端需要支持接收文件或 base64）
    const result = await uploadExamImage(photoPath.value, 'math', '8')

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
    setAnalyzing(false)
  } catch (error) {
    console.error('分析失败:', error)
    analyzing.value = false
    setAnalyzing(false)
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

.analyzing-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background: #fff;
  border-radius: 12px;
}

.camera-btn {
  flex: 1;
  border-radius: 9999px;
  font-size: 16px;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--color-primary-light, #e6f2ff);
  border-top-color: var(--color-primary, #1890ff);
  border-radius: 50%;
  animation: gari-spin 0.8s linear infinite;
}

@keyframes gari-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>