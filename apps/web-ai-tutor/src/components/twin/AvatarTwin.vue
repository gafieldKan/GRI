<template>
  <view class="avatar-twin" :class="{ 'is-mapping': mode === 'mapping', 'is-tired': tired }" :style="wrapStyle">
    <!-- 有真实头像则用之；否则用程序化矢量人物（PERSONA 范式） -->
    <image v-if="avatarUrl" class="twin-img" :src="avatarUrl" mode="aspectFill" />
    <svg
      v-else
      class="twin-svg"
      viewBox="0 0 360 450"
      role="img"
      :aria-label="(name || '学习者') + '的数字人物形象'"
    >
      <defs>
        <linearGradient
          v-for="g in gradients"
          :key="g.id"
          :id="gid(g.id)"
          :x1="g.x1"
          :y1="g.y1"
          :x2="g.x2"
          :y2="g.y2"
        >
          <stop v-for="(s, i) in g.stops" :key="i" :offset="s.o" :stop-color="s.c" :stop-opacity="s.op" />
        </linearGradient>
        <radialGradient :id="gid('halo')">
          <stop stop-color="#c3d7a7" stop-opacity="0.32" />
          <stop offset="1" stop-color="#b5caa0" stop-opacity="0" />
        </radialGradient>
      </defs>

      <!-- 地面光环 -->
      <ellipse cx="180" cy="409" rx="105" ry="27" :fill="'url(#' + gid('halo') + ')'" />
      <ellipse cx="180" cy="412" rx="80" ry="18" fill="none" stroke="#b4ce9d" stroke-width="1" />
      <ellipse cx="180" cy="412" rx="110" ry="24" fill="none" stroke="#c6d8b4" stroke-width="0.8" stroke-dasharray="3 6" />
      <ellipse cx="180" cy="411" rx="53" ry="11" fill="#86a676" opacity="0.16" />

      <g class="breath">
        <g class="figure">
          <template v-for="(el, i) in figure" :key="i">
            <path
              v-if="el.tag === 'path'"
              :d="el.d"
              :fill="el.fill || 'none'"
              :stroke="el.stroke"
              :stroke-width="el.sw"
              :stroke-linecap="el.lc"
              :opacity="el.op"
            />
            <ellipse
              v-else-if="el.tag === 'ellipse'"
              :cx="el.cx"
              :cy="el.cy"
              :rx="el.rx"
              :ry="el.ry"
              :fill="el.fill"
              :opacity="el.op"
            />
          </template>
        </g>
        <g v-if="mode === 'mapping'" class="wireframe" fill="none" stroke="#448b60" stroke-width="1">
          <path :d="WIRE.body" />
          <ellipse cx="180" cy="101" rx="32" ry="44" />
          <path :d="WIRE.face" />
          <circle v-for="(p, i) in WIRE.pts" :key="i" :cx="p[0]" :cy="p[1]" r="3" fill="#73a775" />
        </g>
      </g>
    </svg>
  </view>
</template>

<script>
const OUTFIT = { sage: '#538875', indigo: '#7b78a1', sand: '#b29566', blue: '#5e8da6' }
const SKIN = { warm: '#d2aa88', light: '#e6c3a5', deep: '#ad7f60' }
const WIRE = {
  body:
    'm180 78 0 62m0 7 0 28m-45 15 45-19 44 19-44 65-45-65m0 0-25 114m114-114 25 113m-69-67-27 155m27-155 32 155m-61-62h51m-55-28h59m-76-139h110m-81 114h51',
  face: 'M149 96q31-14 62 0m-62 13q31 15 62 0m-62 7q31 21 62 0',
  pts: [
    [180, 78], [180, 140], [180, 172], [135, 190], [224, 190],
    [110, 302], [249, 303], [180, 255], [153, 397], [212, 397]
  ]
}

export default {
  name: 'AvatarTwin',
  props: {
    name: { type: String, default: '' },
    avatarUrl: { type: String, default: '' },
    // 尺寸：不传则自适应容器宽度（推荐在卡片内使用）
    size: { type: Number, default: 0 },
    // 模拟状态：精力（< 30 呈疲惫神态）——对应原型 energy
    energy: { type: Number, default: 76 },
    mode: { type: String, default: 'person' }, // person | mapping
    outfit: { type: String, default: '' },      // sage | indigo | sand | blue
    skin: { type: String, default: '' },        // warm | light | deep
    hair: { type: String, default: '' }         // short | long
  },
  data() {
    return { WIRE, serial: Math.random().toString(36).slice(2, 8) }
  },
  computed: {
    // 未显式指定外观时，由姓名确定性地派生（同一人物形象始终如一）
    look() {
      const h = this.hash(this.name || '学习者')
      const ok = Object.keys(OUTFIT)
      const sk = Object.keys(SKIN)
      return {
        outfit: OUTFIT[this.outfit] ? this.outfit : ok[h % ok.length],
        skin: SKIN[this.skin] ? this.skin : sk[(h >> 3) % sk.length],
        hair: this.hair === 'short' || this.hair === 'long' ? this.hair : (h % 2 ? 'long' : 'short')
      }
    },
    long() {
      return this.look.hair === 'long'
    },
    tired() {
      return Number(this.energy) < 30
    },
    o() {
      return OUTFIT[this.look.outfit]
    },
    sk() {
      return SKIN[this.look.skin]
    },
    gradients() {
      return [
        { id: 'skin', x1: 0, y1: 0, x2: 1, y2: 0.4, stops: [{ o: 0, c: this.sk }, { o: 0.55, c: this.sk }, { o: 1, c: '#a3775e' }] },
        { id: 'coat', x1: 0, y1: 0, x2: 1, y2: 0.8, stops: [{ o: 0, c: '#eaf0e6' }, { o: 0.5, c: '#dce6d8' }, { o: 1, c: '#b9cbb7' }] },
        { id: 'sleeve', x1: 0, y1: 0, x2: 1, y2: 0.2, stops: [{ o: 0, c: '#c8d8c0' }, { o: 0.55, c: '#e5eede' }, { o: 1, c: '#b3c8ab' }] },
        { id: 'pants', x1: 0, y1: 0, x2: 1, y2: 0, stops: [{ o: 0, c: '#64746c' }, { o: 0.45, c: '#859185' }, { o: 1, c: '#53685c' }] },
        { id: 'hair', x1: 0, y1: 0, x2: 1, y2: 0.5, stops: [{ o: 0, c: '#3d473d' }, { o: 0.5, c: '#4b5145' }, { o: 1, c: '#222e27' }] }
      ]
    },
    figure() {
      const skin = 'url(#' + this.gid('skin') + ')'
      const hair = 'url(#' + this.gid('hair') + ')'
      const coat = 'url(#' + this.gid('coat') + ')'
      const sleeve = 'url(#' + this.gid('sleeve') + ')'
      const pants = 'url(#' + this.gid('pants') + ')'
      const o = this.o
      const out = []
      if (this.long) out.push({ tag: 'path', d: 'M144 97q-20 41-5 94l80-4q13-50-9-90Z', fill: hair })
      out.push(
        { tag: 'path', d: 'M148 259 145 331l-3 66q13 9 30 2l8-68 6-63Z', fill: pants },
        { tag: 'path', d: 'm180 266 4 67 8 65q13 8 30 0l-9-65-1-70Z', fill: pants },
        { tag: 'path', d: 'M143 390q10 5 28 2l1 15q-4 7-18 7h-28q-9-4-4-11Z', fill: '#e1e7d9' },
        { tag: 'path', d: 'M123 407q20 4 49-1l-1 8h-46Z', fill: '#a3b59b' },
        { tag: 'path', d: 'M194 392q11 4 26-1l15 13q7 11-5 12h-35q-8-3-5-9Z', fill: '#e3e8dc' },
        { tag: 'path', d: 'M190 408q25 6 45 0v8h-41Z', fill: '#a4b69d' },
        { tag: 'path', d: 'M146 164q-20 2-27 23l-17 103 22 8 21-73Z', fill: sleeve },
        { tag: 'path', d: 'M213 164q23 5 26 24l17 102-22 8-22-69Z', fill: sleeve },
        { tag: 'path', d: 'M107 287q-8 10-5 26l6 9q8 8 17-1l4-17-7-14Z', fill: skin },
        { tag: 'path', d: 'M235 289q-5 15 1 31 8 12 18 2l4-13-4-21Z', fill: skin },
        { tag: 'path', d: 'M142 165q33-16 71 0l6 89-3 30q-41 9-75 0l-4-30Z', fill: coat },
        { tag: 'path', d: 'M139 180q-4 41 4 101l9 2-4-98Z', fill: o, op: 0.8 },
        { tag: 'path', d: 'M212 182q10 45 3 99l-7 3 3-98Z', fill: o, op: 0.65 },
        { tag: 'path', d: 'M161 160q2-15 1-31h33v31l-16 14Z', fill: skin },
        { tag: 'path', d: 'm155 162 25 18 26-18 5 14-19 20h-27l-19-20Z', fill: '#d2dfc8' },
        { tag: 'path', d: 'm155 162 24 19 26-19-11 30h-27Z', fill: o, op: 0.9 },
        { tag: 'path', d: 'M179 190v79', stroke: '#a7bfa0', sw: 1.5 },
        { tag: 'path', d: 'M149 272h60', stroke: '#b0c5a6', sw: 1 },
        { tag: 'path', d: 'm156 229 20 6v23l-21-5Z', fill: o, op: 0.25 },
        { tag: 'path', d: 'm188 235 18-6 1 24-19 5Z', fill: o, op: 0.18 },
        { tag: 'path', d: 'm201 207-6 10-5-10Z', fill: o },
        { tag: 'path', d: 'M151 175 148 213m62-37 2 37', stroke: '#f8faf3', sw: 1.2, op: 0.6 },
        // 耳
        { tag: 'ellipse', cx: 147, cy: 109, rx: 7, ry: 11, fill: this.sk },
        { tag: 'ellipse', cx: 212, cy: 109, rx: 7, ry: 11, fill: '#ad7d60' },
        { tag: 'path', d: 'M148 90q0-43 34-42 31 2 31 43v24q-6 31-32 36-28-5-33-35Z', fill: skin },
        { tag: 'path', d: 'M144 100q-8-27 6-46 13-20 40-10 28 6 28 39l-7 21-7-28q-21 10-37 0l-8 10-6 20Z', fill: hair },
        { tag: 'path', d: 'M154 69q20-19 49-7', stroke: '#68705e', sw: 2, op: 0.6 },
        { tag: 'path', d: 'M156 100q8-5 16-1m15 0q8-5 14 0', stroke: '#61523f', sw: 2, lc: 'round' }
      )
      // 眼（疲惫时眯眼）
      if (this.tired) {
        out.push({ tag: 'path', d: 'm158 111 12 1m19 0 11-1', stroke: '#3d4337', sw: 2 })
      } else {
        out.push(
          { tag: 'ellipse', cx: 164, cy: 109, rx: 2.5, ry: 3, fill: '#354037' },
          { tag: 'ellipse', cx: 194, cy: 109, rx: 2.5, ry: 3, fill: '#354037' }
        )
      }
      out.push(
        { tag: 'path', d: 'M179 109l-3 13 6 1', stroke: '#ab7757', sw: 1.3 },
        { tag: 'path', d: 'M168 132q11 ' + (this.tired ? 1 : 5) + ' 22 0', stroke: '#865c49', sw: 1.8, lc: 'round' },
        { tag: 'ellipse', cx: 159, cy: 123, rx: 7, ry: 4, fill: '#c08470', op: 0.23 },
        { tag: 'ellipse', cx: 198, cy: 123, rx: 7, ry: 4, fill: '#c08470', op: 0.19 }
      )
      if (this.long) out.push({ tag: 'path', d: 'M146 81q-9 21-2 86l9-2 3-65-1-20Zm64 0 1 86 9-2q9-53-1-76Z', fill: hair })
      return out
    },
    wrapStyle() {
      return this.size ? { width: this.size + 'px' } : { width: '100%' }
    }
  },
  methods: {
    gid(n) {
      return 'av' + this.serial + '-' + n
    },
    hash(str) {
      let h = 0
      for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) >>> 0
      return h
    }
  }
}
</script>

<style scoped>
.avatar-twin {
  position: relative;
  display: block;
}

.twin-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 14px;
}

.twin-svg {
  display: block;
  width: 100%;
  height: auto;
}

/* 呼吸：胸口轻微起伏（原点对准人物重心） */
.avatar-svg .breath,
.breath {
  transform-origin: 180px 270px;
  animation: twin-breathing 5s ease-in-out infinite;
}

.wireframe {
  opacity: 0;
  transition: opacity 0.25s ease;
}

.is-mapping .wireframe {
  opacity: 0.55;
}

.is-mapping .figure {
  opacity: 0.5;
}

@keyframes twin-breathing {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-3px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .breath {
    animation: none !important;
  }
}
</style>
