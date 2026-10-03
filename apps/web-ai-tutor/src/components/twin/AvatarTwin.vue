<template>
  <view class="avatar-twin" :style="wrapStyle">
    <image v-if="avatarUrl" class="twin-img" :src="avatarUrl" mode="aspectFill" />
    <view v-else class="twin-fallback" :style="fallbackStyle">
      <!-- 程序化 SVG 形象：以「人」为第一视角的数字孪生头像 -->
      <svg class="twin-svg" :viewBox="'0 0 100 100'">
        <circle cx="50" cy="50" r="48" :fill="accent + '1a'" />
        <circle cx="50" cy="38" r="16" :fill="accent" opacity="0.9" />
        <path d="M22 86 a28 28 0 0 1 56 0 Z" :fill="accent" opacity="0.75" />
      </svg>
      <text class="twin-initial">{{ initial }}</text>
    </view>
  </view>
</template>

<script>
export default {
  name: 'AvatarTwin',
  props: {
    name: { type: String, default: '' },
    avatarUrl: { type: String, default: '' },
    size: { type: Number, default: 72 },
    accent: { type: String, default: '#4a6cf7' }
  },
  computed: {
    initial() {
      const n = (this.name || '学习者').trim()
      return n ? n.slice(0, 1) : '学'
    },
    wrapStyle() {
      return { width: this.size + 'px', height: this.size + 'px' }
    },
    fallbackStyle() {
      return { width: this.size + 'px', height: this.size + 'px' }
    }
  }
}
</script>

<style scoped>
.avatar-twin {
  position: relative;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  box-shadow: 0 2px 10px rgba(74, 108, 247, 0.25);
}

.twin-img {
  width: 100%;
  height: 100%;
}

.twin-fallback {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
}

.twin-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.twin-initial {
  position: relative;
  z-index: 1;
  margin-top: 40%;
  font-size: 22px;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
}
</style>
