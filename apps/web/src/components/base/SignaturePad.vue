<template>
  <view class="signature-pad" :style="containerStyle">
    <canvas
      :id="canvasId"
      :canvas-id="canvasId"
      class="signature-canvas"
      :disable-scroll="true"
      @touchstart="handleTouchStart"
      @touchmove="handleTouchMove"
      @touchend="handleTouchEnd"
      @touchcancel="handleTouchEnd"
      @mousedown="handleMouseDown"
      @mousemove="handleMouseMove"
      @mouseup="handleMouseUp"
      @mouseleave="handleMouseUp"
    />
  </view>
</template>

<script>
/**
 * 电子签名板组件（uni-app 跨端版）
 *
 * 纯 Canvas 手写签名逻辑（二次贝塞尔曲线 + 速度自适应笔宽）——原 React 版组件
 * 已随低代码平台退役，本组件为该算法的 uni-app 独立实现并持续演进，
 * 改用 uni-app 的 <canvas> + uni.createCanvasContext，同时支持 H5 与微信小程序。
 *
 * 与 React 版差异：
 *  - 不依赖 window/PointerEvent（小程序无），使用 uni-app 触摸/鼠标事件
 *  - 尺寸用 rpx 逻辑宽度，通过 getSystemInfoSync 的 windowWidth 换算物理像素与缩放
 *  - 导出提供 toDataURL（H5）/ toTempFilePath（小程序）统一出口
 *
 * 事件：
 *  - @change(points) 每次落笔后触发，points 为归一化前的原始轨迹点
 *  - @begin / @end
 * 暴露方法（通过 ref）：clear / undo / isEmpty / exportImage / getStrokeCount
 */
export default {
  name: 'SignaturePad',
  props: {
    canvasId: { type: String, default: 'signature-pad' },
    height: { type: [Number, String], default: 240 },
    penColor: { type: String, default: '#000000' },
    minPenWidth: { type: Number, default: 1 },
    maxPenWidth: { type: Number, default: 4 },
    backgroundColor: { type: String, default: '#ffffff' },
    velocityFilterWeight: { type: Number, default: 0.7 }
  },
  data() {
    return {
      // 绘图上下文（H5 为 CanvasRenderingContext2D；小程序为 uni canvas context）
      ctx: null,
      isDrawing: false,
      points: [],
      lastPoint: null,
      lastVelocity: 0,
      // 像素尺寸（初始化后注入）
      pxWidth: 0,
      pxHeight: 0,
      scale: 1
    }
  },
  computed: {
    containerStyle() {
      // number 视为 rpx 逻辑高度；string 则原样透传（如 '120px'）。
      // H5 下 rpx 不会在运行时被转换（inline style），必须换算成 px，
      // 否则容器无高度、画布塌陷为 0 撑不开签字框。
      let hpx
      if (typeof this.height === 'number') {
        // #ifdef H5
        const w = (typeof window !== 'undefined' && window.screen) ? window.screen.width : 375
        hpx = (this.height * w / 750) + 'px'
        // #endif
        // #ifndef H5
        hpx = this.height + 'rpx'
        // #endif
      } else {
        hpx = this.height
      }
      return `height: ${hpx};`
    }
  },
  mounted() {
    this.$nextTick(() => this._init())
  },
  beforeUnmount() {
    this.ctx = null
  },
  methods: {
    _init() {
      this._measure().then(() => {
        // #ifdef H5
        this.ctx = this._createH5Context()
        // #endif
        // #ifndef H5
        this.ctx = uni.createCanvasContext(this.canvasId, this)
        // #endif
        if (this.ctx) {
          this.ctx.lineCap = 'round'
          this.ctx.lineJoin = 'round'
          this.ctx.strokeStyle = this.penColor
          this.ctx.fillStyle = this.penColor
        }
        this._clearScreen()
      })
    },

    /**
     * H5 下取真实 2D 上下文（同步 + 高清屏缩放）。
     * uni-app H5 的 <canvas> 即真实 DOM canvas，直接 querySelector 取出原生节点，
     * 同步 getContext('2d') 即可，避免 selectorQuery 异步回调导致的 ctx 为空。
     */
    _createH5Context() {
      // #ifdef H5
      const el = this._getH5CanvasEl()
      if (el && typeof el.getContext === 'function') {
        const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1
        const cssW = el.clientWidth || this.pxWidth || 300
        const cssH = el.clientHeight || this.pxHeight || 150
        el.width = cssW * dpr
        el.height = cssH * dpr
        const ctx = el.getContext('2d')
        if (ctx) {
          ctx.scale(dpr, dpr)
          // 坐标换算基准按 CSS 像素，与 _measure 的 pxWidth/pxHeight 一致
          this.pxWidth = cssW
          this.pxHeight = cssH
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
          return ctx
        }
      }
      return null
      // #endif
      // #ifndef H5
      return null
      // #endif
    },

    /**
     * H5 下定位真实的 <canvas> 原生节点。
     * uni-app H5 会把 <canvas> 编译为 <uni-canvas> 自定义元素包裹，
     * id 可能落在 wrapper 上而非内层原生 canvas，故需向下查找真正的 canvas 标签。
     */
    _getH5CanvasEl() {
      // #ifdef H5
      const root = this.$el || (typeof document !== 'undefined' ? document : null)
      if (!root || typeof root.querySelector !== 'function') return null
      // 先按 id 找（可能是原生 canvas 或其 wrapper）
      const byId = root.querySelector('#' + this.canvasId)
      if (byId && typeof byId.getContext === 'function') return byId
      // wrapper 场景：取其内部第一个原生 canvas
      if (byId && typeof byId.querySelector === 'function') {
        const inner = byId.querySelector('canvas')
        if (inner && typeof inner.getContext === 'function') return inner
      }
      // 兜底：取组件内第一个原生 canvas
      const any = root.querySelector('canvas')
      if (any && typeof any.getContext === 'function') return any
      return null
      // #endif
      // #ifndef H5
      return null
      // #endif
    },

    _measure() {
      return new Promise((resolve) => {
        const query = uni.createSelectorQuery().in(this)
        query.select('#' + this.canvasId).boundingClientRect((rect) => {
          if (rect) {
            this.pxWidth = rect.width
            this.pxHeight = rect.height
          } else {
            this.pxWidth = 300
            this.pxHeight = 150
          }
          this.scale = 1
          resolve()
        }).exec()
      })
    },

    _clearScreen() {
      if (!this.ctx) return
      if (typeof this.ctx.clearRect === 'function') {
        this.ctx.clearRect(0, 0, this.pxWidth, this.pxHeight)
        if (this.backgroundColor !== 'transparent') {
          this.ctx.fillStyle = this.backgroundColor
          this.ctx.fillRect(0, 0, this.pxWidth, this.pxHeight)
        }
        // #ifdef H5
        this.ctx.draw && this.ctx.draw()
        // #endif
      } else {
        // 小程序 uni canvas context
        this.ctx.clearRect(0, 0, this.pxWidth, this.pxHeight)
        if (this.backgroundColor !== 'transparent') {
          this.ctx.setFillStyle(this.backgroundColor)
          this.ctx.fillRect(0, 0, this.pxWidth, this.pxHeight)
        }
        this.ctx.draw()
      }
    },

    _getPos(e) {
      // 触屏事件（小程序/移动端）
      const touch = e.touches && e.touches.length > 0
        ? e.touches[0]
        : (e.changedTouches && e.changedTouches.length > 0 ? e.changedTouches[0] : null)
      if (touch) {
        // 小程序触屏的 x/y 已是画布相对坐标；H5 需减去画布偏移
        const off = this._getCanvasOffset()
        return { x: (touch.clientX ?? touch.x) - off.x, y: (touch.clientY ?? touch.y) - off.y, time: Date.now(), offset: off }
      }
      // H5 鼠标事件：clientX/clientY 是视口坐标，需转画布相对坐标
      if (e.clientX !== undefined) {
        const off = this._getCanvasOffset()
        return { x: e.clientX - off.x, y: e.clientY - off.y, time: Date.now(), offset: off }
      }
      return null
    },

    /** 获取画布相对视口的偏移（H5 用于坐标换算；小程序触屏无 clientX/Y 时返回 0） */
    _getCanvasOffset() {
      // #ifdef H5
      const el = this._getH5CanvasEl()
      if (el && typeof el.getBoundingClientRect === 'function') {
        const rect = el.getBoundingClientRect()
        return { x: rect.left, y: rect.top }
      }
      // #endif
      return { x: 0, y: 0 }
    },

    handleTouchStart(e) { this._start(this._getPos(e)) },
    handleMouseDown(e) {
      // #ifdef H5
      this._start(this._getPos(e))
      // #endif
    },

    _start(pos) {
      if (!pos) return
      // 懒初始化兜底：若 mounted 时上下文尚未就绪（uni-canvas 异步渲染），
      // 首次落笔前重新测量并创建 H5 上下文，避免 ctx 为空导致无法签字。
      if (!this.ctx) {
        this._init()
      }
      this.isDrawing = true
      this.points = []
      this.lastPoint = pos
      this.points.push(pos)
      this.$emit('begin', pos)
    },

    handleTouchMove(e) { this._move(this._getPos(e)) },
    handleMouseMove(e) {
      // #ifdef H5
      if (!this.isDrawing) return
      this._move(this._getPos(e))
      // #endif
    },

    _move(pos) {
      if (!this.isDrawing || !pos) return
      this.points.push(pos)
      this._drawCurve(this.lastPoint, pos)
      this.lastPoint = pos
      this.$emit('change', this.points.slice())
    },

    handleTouchEnd(e) { this._end(this._getPos(e)) },
    handleMouseUp(e) {
      // #ifdef H5
      if (!this.isDrawing) return
      this._end(this._getPos(e))
      // #endif
    },

    _end(pos) {
      if (!this.isDrawing) return
      this.isDrawing = false
      if (pos) {
        this.points.push(pos)
      }
      this.$emit('end', this.points.slice())
    },

    /**
     * 二次贝塞尔曲线绘制（速度自适应笔宽，逻辑与原组件一致）
     */
    _drawCurve(start, end) {
      if (!this.ctx) return
      const isH5 = typeof this.ctx.quadraticCurveTo === 'function'

      const distance = Math.sqrt(
        Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2)
      )
      const time = end.time - start.time
      const velocity = time > 0 ? distance / time : 0
      const smoothedVelocity = this.lastVelocity * this.velocityFilterWeight +
        velocity * (1 - this.velocityFilterWeight)
      const penWidth = this._calculatePenWidth(smoothedVelocity)

      if (isH5) {
        this.ctx.beginPath()
        this.ctx.moveTo(start.x, start.y)
        const cx = (start.x + end.x) / 2
        const cy = (start.y + end.y) / 2
        this.ctx.quadraticCurveTo(cx, cy, end.x, end.y)
        this.ctx.lineWidth = penWidth
        this.ctx.strokeStyle = this.penColor
        this.ctx.stroke()
      } else {
        // 小程序 canvas context
        this.ctx.setStrokeStyle(this.penColor)
        this.ctx.setLineWidth(penWidth)
        this.ctx.setLineCap('round')
        this.ctx.setLineJoin('round')
        this.ctx.beginPath()
        this.ctx.moveTo(start.x, start.y)
        const cx = (start.x + end.x) / 2
        const cy = (start.y + end.y) / 2
        this.ctx.quadraticCurveTo(cx, cy, end.x, end.y)
        this.ctx.stroke()
        this.ctx.draw(true)
      }

      this.lastVelocity = smoothedVelocity
    },

    _calculatePenWidth(velocity) {
      const maxVelocity = 10
      const minVelocity = 0.5
      const normalized = Math.max(0, Math.min(1,
        (velocity - minVelocity) / (maxVelocity - minVelocity)
      ))
      return this.maxPenWidth - (this.maxPenWidth - this.minPenWidth) * normalized
    },

    /** 清空 */
    clear() {
      this.points = []
      this.lastPoint = null
      this.lastVelocity = 0
      this._clearScreen()
    },

    /** 撤销最后一笔 */
    undo() {
      if (this.points.length === 0) return false
      const idx = this._findLastStrokeStart()
      this.points = this.points.slice(0, idx)
      this._redraw()
      return true
    },

    _findLastStrokeStart() {
      if (this.points.length < 2) return 0
      const threshold = 200
      for (let i = this.points.length - 1; i > 0; i--) {
        if (this.points[i].time - this.points[i - 1].time > threshold) {
          return i
        }
      }
      return 0
    },

    _groupStrokes() {
      const strokes = []
      if (!this.points.length) return strokes
      let current = [this.points[0]]
      const threshold = 200
      for (let i = 1; i < this.points.length; i++) {
        const diff = this.points[i].time - this.points[i - 1].time
        if (diff > threshold) {
          strokes.push(current)
          current = [this.points[i]]
        } else {
          current.push(this.points[i])
        }
      }
      if (current.length > 0) strokes.push(current)
      return strokes
    },

    _redraw() {
      this._clearScreen()
      if (this.points.length < 2) return
      const strokes = this._groupStrokes()
      strokes.forEach((stroke) => {
        for (let i = 1; i < stroke.length; i++) {
          this._drawCurve(stroke[i - 1], stroke[i])
        }
      })
    },

    /** 是否为空 */
    isEmpty() {
      return this.points.length === 0
    },

    /** 笔画数 */
    getStrokeCount() {
      return this._groupStrokes().length
    },

    /** 导出图片：返回 Promise<string>，H5 为 base64 dataURL，小程序为临时文件路径 */
    exportImage() {
      return new Promise((resolve) => {
        const that = this
        // #ifdef H5
        if (this.ctx && typeof this.ctx.canvas !== 'undefined' && this.ctx.canvas) {
          resolve(this.ctx.canvas.toDataURL('image/png'))
          return
        }
        // #endif
        uni.canvasToTempFilePath({
          canvasId: this.canvasId,
          // #ifndef H5
          success: (res) => resolve(res.tempFilePath),
          // #endif
          // #ifdef H5
          success: (res) => resolve(res.tempFilePath),
          // #endif
          fail: () => resolve(null)
        }, this)
      })
    }
  }
}
</script>

<style scoped>
.signature-pad {
  width: 100%;
  display: flex;
  flex-direction: column;
}

.signature-canvas {
  width: 100%;
  height: 100%;
  background-color: #ffffff;
  border: 1rpx solid #ddd;
  border-radius: 8rpx;
}
</style>