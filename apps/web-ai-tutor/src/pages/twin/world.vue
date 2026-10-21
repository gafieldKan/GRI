<template>
  <!--
    学习世界 · 登峰（W4-b）：学科登顶双维度。
    维度 A「学科知识体系」= 一科 N 座分支峰（各含中图法权威锚点与 K12 年级区间）；
    维度 B「K12 阶段」= 学段 → 年级 → 人教版册 → 章（每册/章反向标注所属体系分支）。
    两维度共用同一条「年级海拔轴」（同一海拔即同一年级），故可互相对照——这就是延续性。
    世界语言复用 W3 外壳与 --world-* 令牌 / w-* 几何类，画法一律取共享件 @gri/world-art。
  -->
  <WorldShell
    module-code="tutor"
    kicker="学习世界"
    title="学习世界 · 登峰"
    subtitle="一门学科不止一座山——学科知识体系是一列峰，K12 阶段是一条上山的路。切换维度，看同一门学问的两面。"
    app-home-url="/pages/index/index"
    app-home-label="回智学慧眼"
    :entering="entering"
    entry-from="人本世界"
    @entered="entering = false"
  >
    <!-- 世界顶栏右侧：当前所在 + 学科切换（模块自己的动作，留在世界顶栏里） -->
    <template #actions>
      <text class="tag green" data-here>
        <svg class="twin-ico sm"><use href="#i-pin" /></svg>当前：{{ hereText }}
      </text>
      <button class="tbtn" data-subject-toggle @click="showSubjectBar = !showSubjectBar">
        <svg class="twin-ico sm"><use href="#i-world" /></svg>切换学科
      </button>
    </template>

    <view class="twin-page">
      <!-- ── N1 维度切换（置顶；默认「学科知识体系」）── -->
      <view class="dim-switch" data-dim-toggle role="tablist" aria-label="登峰维度">
        <button
          v-for="d in DIMS"
          :key="d.code"
          class="dim-btn"
          :class="{ active: dim === d.code }"
          :data-dim="d.code"
          :data-dim-active="dim === d.code ? 'yes' : undefined"
          :aria-selected="dim === d.code ? 'true' : 'false'"
          role="tab"
          @click="switchDim(d.code)"
        >
          <text class="dim-name">{{ d.name }}</text>
          <text class="dim-sub">{{ d.sub }}</text>
        </button>
        <text class="dim-note">三个维度共用同一个世界——切换不丢当前学科与当前峰；「学科城区」里横是年级大道、纵是街区</text>
      </view>

      <!-- 学科切换条 -->
      <view class="subject-bar" v-if="showSubjectBar" data-subject-bar>
        <button
          v-for="s in knowledgeStore.subjectList"
          :key="s.id"
          class="s-tab"
          :class="{ active: isCurrentSubject(s) }"
          :data-subject="s.id"
          :data-subject-active="isCurrentSubject(s) ? 'yes' : undefined"
          @click="switchSubject(s.id)"
        >{{ s.icon }} {{ s.name }}</button>
      </view>

      <LoadingSkeleton v-if="knowledgeStore.loading || loadingSummit" />

      <EmptyState
        v-else-if="!peaks.length && !books.length"
        icon="🏔"
        title="该学科登峰版图尚未就绪"
        description="分支体系与人教版册由教研侧审核后灌库——换一门学科看看，或稍后再来"
      />

      <!-- 世界：地图 + 侧栏 -->
      <view v-else class="world-layout">
        <view class="col-main">
          <!-- ── N8 信息密度：首屏即可读到掌握度 / 登顶 / 我在此 / 经历 ── -->
          <view class="world-status">
            <view class="ws-cell" data-status="mastery">
              <text class="ws-label">掌握度</text>
              <text class="ws-value num" data-mastery>{{ masteryAvg }}<text class="ws-unit"> /100</text></text>
              <view class="ws-bar"><view class="ws-fill" :style="{ width: Math.min(100, masteryAvg) + '%' }" /></view>
            </view>
            <view class="ws-cell" data-status="ascent">
              <text class="ws-label">已登顶分支</text>
              <text class="ws-value num" data-ascent>{{ reachedCount }}<text class="ws-unit"> / {{ peaks.length }} 峰</text></text>
              <view class="ws-bar"><view class="ws-fill" :style="{ width: (peaks.length ? (reachedCount / peaks.length) * 100 : 0) + '%' }" /></view>
            </view>
            <view class="ws-cell" data-status="level">
              <text class="ws-label">经历等级</text>
              <text class="ws-value num" data-level>LV.{{ level }}<text class="ws-unit"> · {{ xp }} XP</text></text>
              <view class="ws-bar"><view class="ws-fill amber" :style="{ width: (xp % 1000) / 10 + '%' }" /></view>
            </view>
            <view class="ws-cell" data-status="here">
              <text class="ws-label">我在读</text>
              <text class="ws-value" data-grade>{{ gradeName(meGrade) }}<text class="ws-unit"> · {{ stageName(meGrade) }}</text></text>
              <view class="ws-bar"><view class="ws-fill" :style="{ width: ((meGrade - 1) / 11) * 100 + '%' }" /></view>
            </view>
          </view>

          <!-- ── v4 光脉读数（N9 信息密度：点亮 / 下一目标 / 光脉前沿 / 当前洞门）── -->
          <view v-if="dim === 'branches' && chainNodes.length" class="v4-strip" data-v4-strip>
            <view class="vs-item" data-v4="lit">
              <text class="vs-key">光脉点亮</text>
              <text class="vs-val num" data-lit-count>{{ chainProgress.lit }}<text class="vs-sub"> / {{ chainProgress.total }} 节</text></text>
              <text class="vs-note">微光 {{ chainProgress.half }} 节（够得着 · 尚未掌握）</text>
            </view>
            <view class="vs-item is-next" data-v4="next">
              <text class="vs-key">下一个最佳目标</text>
              <text class="vs-val" data-next-target>{{ nextHintText }}</text>
              <text class="vs-note">顺着光走 · 目标在呼吸</text>
            </view>
            <view class="vs-item" data-v4="frontier">
              <text class="vs-key">光脉前沿</text>
              <text class="vs-val" data-frontier>{{ gradeShort(revealGradeNum) }}<text class="vs-sub"> · 雾退到此</text></text>
              <text class="vs-note">晨雾只被相邻的光驱散</text>
            </view>
            <view class="vs-item" data-v4="door">
              <text class="vs-key">当前洞门</text>
              <text class="vs-val" data-door-word>{{ doorWord }}</text>
              <text class="vs-note">{{ activeGrade ? gradeShort(activeGrade.gradeNum) + ' · ' + activeGrade.total + ' 节' : '未选洞门' }}</text>
            </view>
          </view>

          <!-- ── 登峰地图（两维度同屏一张画布：同一条海拔轴）── -->
          <view class="map-panel">
            <view class="map-scroll">
              <view class="map-scene" :data-dim-current="dim">
                <svg
                  class="map-svg"
                  data-map
                  :viewBox="`0 0 ${MAPW} ${MAPH}`"
                  preserveAspectRatio="xMidYMid meet"
                  role="img"
                  :aria-label="mapAria"
                >
                  <defs>
                    <pattern id="grid" width="26" height="26" patternUnits="userSpaceOnUse">
                      <circle cx="2" cy="2" r="0.8" class="w-grid-dot" />
                    </pattern>
                    <!-- 天光四阶：与人本世界的天光同一组令牌（同一天空） -->
                    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" class="w-gg-sky-top" />
                      <stop offset="0.3" class="w-gg-sky-mid" />
                      <stop offset="0.7" class="w-gg-sky-low" />
                      <stop offset="1" class="w-gg-sky-haze" />
                    </linearGradient>
                    <radialGradient id="sunG" cx="0.5" cy="0.5">
                      <stop offset="0" class="w-gg-sun" stop-opacity="0.95" />
                      <stop offset="1" class="w-gg-sun" stop-opacity="0" />
                    </radialGradient>
                    <!-- v4 晨雾（M1）：上实下虚的黎明幕——雾退到「光脉前沿」为止 -->
                    <linearGradient id="fogVeil" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" class="w-gg-fog" stop-opacity="0.88" />
                      <stop offset="0.62" class="w-gg-fog" stop-opacity="0.84" />
                      <stop offset="1" class="w-gg-fog" stop-opacity="0" />
                    </linearGradient>
                    <!-- v4 曙光（M2/M3）：洞口亮灯时从洞里漫出的一团黎明 -->
                    <radialGradient id="dawnG" cx="0.5" cy="0.5">
                      <stop offset="0" class="w-gg-dawn" stop-opacity="0.8" />
                      <stop offset="1" class="w-gg-dawn" stop-opacity="0" />
                    </radialGradient>
                    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur stdDeviation="2.4" result="b" />
                      <feMerge>
                        <feMergeNode in="b" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>

                  <!-- 天空（渐变）+ 版图点阵：scaffold 的纯色天空让位给本页渐变 -->
                  <rect :width="MAPW" :height="MAPH" fill="url(#sky)" />
                  <rect :width="MAPW" :height="MAPH" fill="url(#grid)" opacity="0.13" />
                  <circle :cx="MAPW - 104" cy="112" r="86" fill="url(#sunG)" />

                  <!-- 世界底图（共享画法）：远山 / 云鸟 / 地景 / 年级海拔刻度 -->
                  <template v-for="(p, i) in scenePrims" :key="'sc' + i">
                    <polygon v-if="p.k === 'poly'" :class="p.c" :points="p.points" :opacity="p.o" :filter="p.f" />
                    <path
                      v-else-if="p.k === 'path'"
                      :class="p.c"
                      :d="p.d"
                      :opacity="p.o"
                      :stroke-width="p.w"
                      :stroke-dasharray="p.dash"
                      :filter="p.f"
                    />
                    <circle v-else-if="p.k === 'circle'" :class="p.c" :cx="p.cx" :cy="p.cy" :r="p.r" :opacity="p.o" />
                    <ellipse
                      v-else-if="p.k === 'ellipse'"
                      :class="p.c"
                      :cx="p.cx"
                      :cy="p.cy"
                      :rx="p.rx"
                      :ry="p.ry"
                      :opacity="p.o"
                    />
                    <rect
                      v-else
                      :class="p.c"
                      :x="p.x"
                      :y="p.y"
                      :width="p.w"
                      :height="p.h"
                      :rx="p.rx"
                      :opacity="p.o"
                    />
                  </template>

                  <!-- 海拔读数（刻度标签取共享真源 GRADE_TICKS） -->
                  <SvgText
                    v-for="tk in GRADE_TICKS"
                    :key="'ax' + tk.g"
                    x="66"
                    :y="tk.y + 3.5"
                    text-anchor="end"
                    font-size="11"
                    class="w-axis-label"
                  >{{ tk.short }}</SvgText>
                  <SvgText x="66" :y="SUMMIT.zenithY + 4" text-anchor="end" font-size="11" class="w-axis-label">纵深</SvgText>

                  <!-- 学段名（维度 B 的段带读数，两维度都画：它属于海拔轴本身） -->
                  <SvgText
                    v-for="sb in stageBands"
                    :key="'sn' + sb.code"
                    x="1188"
                    :y="sb.labelY"
                    text-anchor="end"
                    font-size="13"
                    class="w-axis-label"
                    :opacity="sb.has ? 1 : 0.45"
                  >{{ sb.name }}</SvgText>

                  <!-- 「我在这」年级海拔线 -->
                  <path class="w-me-line" :d="`M104 ${meY}H1188`" stroke-width="1.6" />
                  <SvgText x="1188" :y="meY - 7" text-anchor="end" font-size="11" class="w-me-label">
                    我在这 · {{ gradeShort(meGrade) }}
                  </SvgText>

                  <!-- 孪生人物（外层定位，内层浮动）：画法 = 共享原语 personMarker -->
                  <g v-if="mePos" :transform="`translate(${mePos.x} ${mePos.y}) scale(1.18)`" data-me>
                    <g class="climber-fig">
                      <template v-for="(p, i) in climberPrims" :key="'cp' + i">
                        <polygon v-if="p.k === 'poly'" :class="p.c" :points="p.points" :opacity="p.o" />
                        <path
                          v-else-if="p.k === 'path'"
                          :class="p.c"
                          :d="p.d"
                          :opacity="p.o"
                          :stroke-width="p.w"
                          :stroke-dasharray="p.dash"
                        />
                        <circle v-else-if="p.k === 'circle'" :class="p.c" :cx="p.cx" :cy="p.cy" :r="p.r" :opacity="p.o" />
                        <ellipse v-else :class="p.c" :cx="p.cx" :cy="p.cy" :rx="p.rx" :ry="p.ry" :opacity="p.o" />
                      </template>
                    </g>
                  </g>

                  <!-- 图注 -->
                  <SvgText :x="MAPW / 2" :y="MAPH - 8" text-anchor="middle" font-size="11" class="w-map-note">
                    {{ mapNote }}
                  </SvgText>
                </svg>

                <!-- 可动热点（唯一可点区域）：分支峰 / 纵深子分支 / 人教版册 -->
                <button
                  v-for="(h, i) in hotspots"
                  :key="h.key"
                  ref="hotButtons"
                  class="hot"
                  :class="[`hot-${h.state}`, { selected: isSelected(h), 'is-major': h.kind === 'peak' }]"
                  :style="{ left: h.left + '%', top: h.top + '%', '--d': ((i % 9) * 0.35) + 's' }"
                  :data-branch="h.kind === 'peak' ? h.code : undefined"
                  :data-branch-depth="h.kind === 'depth' ? h.code : undefined"
                  :data-book="h.kind === 'book' ? h.code : undefined"
                  :data-grade-door="h.kind === 'grade' ? h.code : undefined"
                  :data-door-state="h.kind === 'grade' ? h.state : undefined"
                  :data-hot-index="i"
                  :data-hot-state="h.state"
                  :aria-label="h.aria"
                  tabindex="0"
                  role="button"
                  @click="pickHot(h)"
                  @keydown="onHotKey($event, i)"
                >
                  <span class="hot-badge">
                    <span v-if="h.isHere" class="hot-ring" />
                    <svg v-if="h.state === 'summit'" class="hot-glyph" viewBox="0 0 24 24">
                      <path d="M7 21V3" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                      <path d="M7 4h10l-3 4 3 4H7Z" fill="currentColor" />
                    </svg>
                    <svg v-else-if="h.kind === 'book'" class="hot-glyph" viewBox="0 0 24 24">
                      <path d="M4 5h7v14H4Zm9 0h7v14h-7Z" fill="none" stroke="currentColor" stroke-width="1.8" />
                      <path d="M11 5v14" stroke="currentColor" stroke-width="1.8" />
                    </svg>
                    <svg v-else-if="h.kind === 'depth'" class="hot-glyph" viewBox="0 0 24 24">
                      <path d="M12 4 4 19h16Z" fill="none" stroke="currentColor" stroke-width="1.8" />
                      <path d="M12 4v15" stroke="currentColor" stroke-width="1.4" opacity="0.7" />
                    </svg>
                    <!-- v4 年级洞门：岩拱 + 洞腔（洞腔的色随三态走，即 N6③ 暗门/半亮/亮灯） -->
                    <svg v-else-if="h.kind === 'grade'" class="hot-glyph" viewBox="0 0 24 24">
                      <path d="M4.5 20v-8.4a7.5 7.5 0 0 1 15 0V20Z" fill="none" stroke="currentColor" stroke-width="1.8" />
                      <path d="M8.4 20v-7.6a3.6 3.6 0 0 1 7.2 0V20Z" fill="currentColor" opacity="0.85" />
                    </svg>
                    <svg v-else class="hot-glyph" viewBox="0 0 24 24">
                      <path d="M12 3 3 20h18Z" fill="currentColor" />
                      <path d="M12 9 8 20h8Z" class="w-glyph-cut" opacity="0.7" />
                    </svg>
                  </span>
                  <text class="hot-label" :class="labelClass(h)">{{ h.short }}</text>
                </button>

                <!-- v5 一间店 = 一节（只读热点：点它把这间的楼门带到楼前一条街上） -->
                <button
                  v-for="(s, i) in (dim === 'district' ? districtStorefronts : [])"
                  :key="'sf' + s.code"
                  class="hot shop-pin"
                  :class="`kp-${s.light}`"
                  :style="{ left: (s.x / MAPW) * 100 + '%', top: ((s.y - DISTRICT.blockH) / MAPH) * 100 + '%' }"
                  :data-storefront="s.code"
                  :data-storefront-state="s.light"
                  :data-storefront-index="i"
                  :aria-label="`节 ${s.name}，${doorStateWord(s.light)}，${s.kpCount} 个知识点，所属章 ${s.chapterName}，点它把这一间的楼门带到楼前`"
                  tabindex="0"
                  role="button"
                  @click="pickStorefront(s.code)"
                >
                  <span class="hot-badge">
                    <svg class="hot-glyph" viewBox="0 0 24 24">
                      <path d="M4 9.5 8 5h8l4 4.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
                      <path d="M5.5 9.5h13V20h-13Z" fill="none" stroke="currentColor" stroke-width="1.7" />
                      <path d="M10 20v-6h4v6" fill="none" stroke="currentColor" stroke-width="1.5" />
                    </svg>
                  </span>
                  <text class="hot-label">{{ s.name }}</text>
                </button>

                <!-- v5（W6-a）楼门 = 知识点洞口：楼前一条街，等距一排门，点门直达楼内书房（主 surface） -->
                <button
                  v-for="(d, i) in (dim === 'district' ? kpDoorPoints : [])"
                  :key="'kd' + d.code"
                  class="hot kp-door"
                  :class="`kp-${d.light}`"
                  :style="{ left: (d.x / MAPW) * 100 + '%', top: (d.y / MAPH) * 100 + '%' }"
                  :data-kp-door="d.code"
                  :data-kp-door-id="d.id || ''"
                  :data-kp-state="d.light"
                  :data-kp-index="i"
                  :aria-label="`知识点 ${d.name}，${doorStateWord(d.light)}，${d.id ? '可练' : '未落题'}，点门进楼走智学慧眼闭环`"
                  tabindex="0"
                  role="button"
                  @click="openKpDoor(d)"
                >
                  <span class="hot-badge">
                    <span v-if="d.light === 'lit'" class="hot-ring" />
                    <svg class="hot-glyph" viewBox="0 0 24 24">
                      <path d="M4 10.5 12 4l8 6.5V20h-5v-5H9v5H4Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" />
                    </svg>
                  </span>
                  <text class="hot-label">{{ d.name }}</text>
                </button>

                <!-- v5 大道里程碑（HTML 叠层：SVG <text> 在 uni H5 不渲染 → 走叠层，与刻度同源） -->
                <view
                  v-for="mk in (dim === 'district' ? avenueMarks : [])"
                  :key="'mk' + mk.g"
                  class="ave-mark"
                  :style="{ left: (mk.x / MAPW) * 100 + '%', top: (avenueY / MAPH) * 100 + '%' }"
                  :data-avenue-mark="mk.g"
                ><text class="ave-mark-text">{{ mk.short }}</text></view>

                <!-- v5 城区空态兜底（V5-N10 不造假楼）：这门学科的节/知识点还没收录 → 明说，不用美术填充 -->
                <view v-if="dim === 'district' && distinctBlocked" class="scene-empty" data-scene-empty :data-district-empty="distinctBlocked" role="status">
                  <text class="se-title">{{ distinctBlocked === 'nocode' ? '这门学科的楼门尚未收录' : '这一支的节洞数据还没取到' }}</text>
                  <text class="se-text">
                    {{ distinctBlocked === 'nocode'
                      ? '楼门是知识点洞口，靠知识点的唯一编码铺；这门学科的知识点还没有编码，城区不铺——不用假楼充数。'
                      : '城区只铺真实收录的节与知识点——先看上面那座峰，或切到「K12 阶段」维度。' }}
                  </text>
                  <button class="tbtn sm" data-empty-to-branches @click="switchDim('branches')">回到学科知识体系</button>
                </view>

                <!-- 维度 B 空态兜底（部分学科尚未发布人教版册；维度 A 对该学科仍是全覆盖的） -->
                <view v-if="dim === 'grades' && !books.length" class="scene-empty" data-scene-empty role="status">
                  <text class="se-title">该学科的 K12 册尚未收录</text>
                  <text class="se-text">学段台地已经铺开，但人教版册/章还没发布到这门学科——先看「学科知识体系」维度，它对学科知识是全覆盖的。</text>
                  <button class="tbtn sm" data-empty-to-branches @click="switchDim('branches')">回到学科知识体系</button>
                </view>
              </view>
            </view>

            <view class="map-legend">
              <!-- v5（W6-a）城区读数：城区也要有一眼的「已走多深」——与 v4 读数条同源同数
                   （chainProgress 由 lightStates 派生，和维度无关），只是换成街区的说法。
                   一条链上同一份真源，两个维度都读它，读数才不会打架（N5 诚实口径）。 -->
              <view v-if="dim === 'district' && chainNodes.length" class="ml-count" data-district-count>
                <text class="dc-item">已亮 <text class="num" data-lit-count>{{ chainProgress.lit }}</text> / {{ chainProgress.total }} 节</text>
                <text class="dc-item">半亮 {{ chainProgress.half }} 节（够得着 · 尚未掌握）</text>
                <text class="dc-item">光脉前沿 {{ gradeShort(revealGradeNum) }}</text>
              </view>
              <text class="ml-item"><text class="ml-dot is-here" />我在这（年级海拔）</text>
              <text class="ml-item"><text class="ml-dot is-summit" />已登顶（旗 / 雪冠）</text>
              <text class="ml-item"><text class="ml-swatch is-k12" />K12 在读段</text>
              <text class="ml-item"><text class="ml-swatch is-depth" />学科纵深段</text>
              <text v-if="dim === 'branches'" class="ml-item"><text class="ml-swatch is-fog" />晨雾（未明）</text>
              <text v-if="dim === 'branches'" class="ml-item"><text class="ml-swatch is-light" />光脉（已亮的路）</text>
              <text v-if="dim === 'branches'" class="ml-item"><text class="ml-dot is-door" />年级洞门（暗 / 半亮 / 亮灯）</text>
              <!-- v5（W6-a）城区图例：图的语义逐字可断言（诚实口径，见设计文档 §4） -->
              <template v-if="dim === 'district'">
                <text class="ml-item"><text class="ml-swatch is-road" />年级大道（横 = K12 阶段）</text>
                <text class="ml-item"><text class="ml-swatch is-shop" />一间店（= 一节）</text>
                <text class="ml-item"><text class="ml-dot is-door" />楼门（暗 / 半亮 / 亮灯）</text>
                <text class="ml-note" data-legend-order>路的先后是课程序列（先学后学的顺序），不是难度高低</text>
                <text class="ml-note" data-legend-half>半亮 = 有作答且未到 80，不是「会了一半」</text>
                <text class="ml-note" data-legend-basement>地下室是同一间店的岩洞探索室，走的是同一条闭环；楼上楼下不改变掌握度真源</text>
                <text class="ml-note">点楼门进楼 → 楼上书房（主）走智学慧眼闭环；也可去楼下岩洞看看</text>
              </template>
              <text class="ml-note">{{ dim === 'branches' ? '点一座峰 → 点峰上的年级洞门 → 进洞走闭环' : '点一册书 → 看它属于哪些体系分支' }}</text>
            </view>
          </view>

          <!-- ── v4 节洞带（M3 第一步）：点年级洞门 → 这一年级的节铺成一条山径 ── -->
          <view v-if="dim === 'branches' && activeGrade" class="band-panel" data-band>
            <view class="band-head">
              <view class="band-title">
                <text class="bt-main">{{ selectedPeakLayout ? selectedPeakLayout.peak.name : '' }} · {{ gradeShort(activeGrade.gradeNum) }} 洞带</text>
                <text class="bt-sub" data-band-sub>
                  {{ activeGrade.nodes[0] ? activeGrade.nodes[0].chapterName : '' }} 等 {{ activeGrade.total }} 节 · 已亮 {{ activeGrade.lit }} · 微光 {{ activeGrade.half }}
                </text>
              </view>
              <text class="band-door" :data-band-door="activeGrade.door">{{ doorStateWord(activeGrade.door) }}</text>
              <button class="tbtn ghost sm" data-band-close @click="closeBand">收起 ✕</button>
            </view>

            <view class="band-scroll" data-band-scroll>
              <view class="band-scene" :style="{ width: bandW + 'px', height: bandH + 'px' }">
                <svg
                  class="band-svg"
                  :viewBox="`0 0 ${bandW} ${bandH}`"
                  :width="bandW"
                  :height="bandH"
                  preserveAspectRatio="xMinYMid meet"
                  role="img"
                  :aria-label="`${gradeShort(activeGrade.gradeNum)} 节洞带：共 ${activeGrade.total} 节，已亮 ${activeGrade.lit} 节`"
                >
                  <template v-for="(p, i) in bandPrims" :key="'bp' + i">
                    <polygon v-if="p.k === 'poly'" :class="p.c" :points="p.points" :opacity="p.o" />
                    <path
                      v-else-if="p.k === 'path'"
                      :class="p.c"
                      :d="p.d"
                      :opacity="p.o"
                      :stroke-width="p.w"
                      :stroke-dasharray="p.dash"
                    />
                    <circle v-else-if="p.k === 'circle'" :class="p.c" :cx="p.cx" :cy="p.cy" :r="p.r" :opacity="p.o" />
                    <ellipse
                      v-else-if="p.k === 'ellipse'"
                      :class="p.c"
                      :cx="p.cx"
                      :cy="p.cy"
                      :rx="p.rx"
                      :ry="p.ry"
                      :opacity="p.o"
                    />
                    <rect v-else :class="p.c" :x="p.x" :y="p.y" :width="p.w" :height="p.h" :rx="p.rx" :opacity="p.o" />
                  </template>
                </svg>

                <!-- 洞位（HTML 叠层，与 SVG 同一坐标真源）：点了就进洞 -->
                <button
                  v-for="p in bandLayout.points"
                  :key="'bn' + p.node.code"
                  class="band-node"
                  :class="[`is-${p.node.light}`, { 'is-next': nextNode && nextNode.code === p.node.code }]"
                  :style="{ left: p.x + 'px', top: p.y + 'px' }"
                  :data-cave="p.node.code"
                  :data-cave-state="p.node.light"
                  :data-cave-next="nextNode && nextNode.code === p.node.code ? 'yes' : undefined"
                  :aria-label="`节 ${p.node.name}，${doorStateWord(p.node.light)}，${p.node.kps.length} 个知识点，所属章 ${p.node.chapterName}，回车进洞`"
                  @click="openCave(p.node)"
                >
                  <span class="bn-name">{{ p.node.name }}</span>
                  <span class="bn-sub">{{ p.node.kps.length }} 知识点 · {{ p.node.chapterName }}</span>
                </button>
              </view>
            </view>

            <view class="band-legend">
              <text class="bl-item"><text class="bl-line is-explicit" />显式前置</text>
              <text class="bl-item"><text class="bl-line is-seq" />课程序列</text>
              <text class="bl-item"><text class="bl-line is-soft" />引导路径（非精确前置，仅供引导）</text>
              <text class="bl-note">点一个洞 → 进洞走完智学慧眼闭环（讲解 → 练 → 判 → 错题/复习 → 掌握 ≥ 80），答对即点亮，光顺着链流向下一节</text>
            </view>
          </view>
        </view>

        <!-- 侧栏 -->
        <view class="col-side">
          <view class="side-card" data-legend>
            <text class="side-title">{{ dim === 'branches' ? '学科知识体系' : 'K12 阶段' }}</text>
            <!-- 维度 A：分支目录（全部 N 峰，一眼看全 + 逐个选） -->
            <view class="outline" v-if="dim === 'branches'">
              <button
                v-for="pl in peakLayout"
                :key="'ol' + pl.peak.code"
                class="ol-row"
                :class="{ on: isSelected({ kind: 'peak', code: pl.peak.code }) }"
                :data-outline-branch="pl.peak.code"
                @click="selectPeak(pl.peak.code)"
              >
                <text class="ol-name">{{ pl.peak.name }}</text>
                <text class="ol-sub">{{ k12Text(pl.peak) }}</text>
                <text class="ol-val">{{ pl.peak.clc }}</text>
              </button>
            </view>
            <!-- 维度 B：学段 → 年级 → 册（含反向分支标注） -->
            <view class="outline" v-else-if="books.length">
              <view v-for="st in gradesData.stages" :key="'ost' + st.code" class="ol-group">
                <text class="ol-group-title">{{ st.name }}</text>
                <button
                  v-for="bk in booksOfStage(st.code)"
                  :key="'ob' + bk.code"
                  class="ol-row"
                  :class="{ on: isSelected({ kind: 'book', code: bk.code }) }"
                  :data-outline-book="bk.code"
                  @click="selectBook(bk.code)"
                >
                  <text class="ol-name">{{ bk.gradeName }} · {{ bk.name }}</text>
                  <text class="ol-sub">{{ bk.branchNames }}</text>
                  <text class="ol-val">{{ bk.textbook.kpCount }}</text>
                </button>
              </view>
            </view>
            <text class="side-hint">同一海拔即同一年级——所以两维度能互相对照。</text>
          </view>

          <view class="side-card" data-authority>
            <text class="side-title">权威依据</text>
            <view class="auth-rows">
              <view class="auth-row">
                <text class="auth-key">学科体系</text>
                <text class="auth-val">《中国图书馆分类法》（第五版）中图法分类号</text>
              </view>
              <view class="auth-row">
                <text class="auth-key">K12 结构</text>
                <text class="auth-val">义务教育课程方案和课程标准（2022 年版）</text>
              </view>
              <view class="auth-row">
                <text class="auth-key">册 / 章</text>
                <text class="auth-val">人教版教科书（库内已发布册·章）</text>
              </view>
            </view>
            <text class="side-hint">每座峰的分类号逐条取自权威表，未收权威依据的一律标「课标」而非编号。</text>
          </view>

          <view class="side-card" v-if="twinStore.recentEvents.length" data-events>
            <view class="side-head">
              <text class="side-title">世界里的最近经历</text>
              <button class="tbtn ghost sm" @click="goMemory">全部 <svg class="twin-ico sm"><use href="#i-arrow" /></svg></button>
            </view>
            <view class="mini-events">
              <view v-for="ev in twinStore.recentEvents.slice(0, 4)" :key="ev.id" class="mini-event">
                <text class="me-icon"><svg class="twin-ico sm"><use href="#i-spark" /></svg></text>
                <view class="me-text">
                  <text class="me-title">{{ ev.title }}</text>
                  <text class="me-sub">{{ ev.source || '系统' }}</text>
                </view>
                <text class="me-time">{{ relTime(ev.at) }}</text>
              </view>
            </view>
          </view>

          <text class="world-notice">
            海拔刻度是年级（小一 → 高三），峰顶之上是学科纵深——两者同屏，即"这门学问从几年级学到什么程度"。
            掌握度来自答题记录，为近似值。
          </text>
        </view>
      </view>

      <!-- ── v4 洞内（M3）：平铺生活场景 + 智学慧眼闭环（复用能力，不重造）── -->
      <CaveScene
        :open="!!caveTarget"
        :node="caveTarget ? caveTarget.node : null"
        :kps="caveKps"
        :cave="caveTarget ? caveTarget.cave : null"
        :active-code="caveTarget ? caveTarget.kpCode : ''"
        :logged-in="isLoggedIn"
        :theme="caveTarget && caveTarget.fromDistrict ? 'study' : 'cave'"
        @close="closeCave"
        @lit="onCaveLit"
        @lit-kp="onCaveLitKp"
        @pick-kp="onPickCaveKp"
        @goto-review="gotoReview"
      />

      <view class="safe-area" />

      <!-- ── 详情面板（维度 A 的分支峰 / 维度 B 的册与章；三件事动作保留）── -->
      <view class="detail-mask" v-if="detail" @click="onMaskClick">
        <view class="detail-card" data-camp-detail data-branch-detail>
          <view class="detail-head">
            <text class="detail-title">{{ detail.title }}</text>
            <text class="tag" :class="detail.tagClass">{{ detail.tag }}</text>
            <text class="detail-close" @click="closeDetail">✕</text>
          </view>

          <!-- 权威锚点（可展示、不编造）：中图法分类号 / 课标主题 -->
          <view class="auth-chip" v-if="detail.clc" data-detail-clc>
            <text class="ac-key">中图法</text>
            <text class="ac-val">{{ detail.clc }}</text>
            <text class="ac-note">《中国图书馆分类法》（第五版）</text>
          </view>
          <view class="auth-chip soft" v-else-if="detail.curriculum" data-detail-clc>
            <text class="ac-key">课标</text>
            <text class="ac-val">{{ detail.curriculum }}</text>
            <text class="ac-note">未收中图法编号，标课标主题而非编造分类号</text>
          </view>

          <!-- 主信息：掌握度 -->
          <view class="hero-metric" v-if="detail.mastery != null">
            <view class="hm-head">
              <text class="hm-label">掌握度</text>
              <text class="hm-val num">{{ Math.round(detail.mastery) }}<text class="hm-pct">%</text></text>
            </view>
            <view class="hm-bar"><view class="hm-fill" :style="{ width: Math.min(100, detail.mastery) + '%' }" /></view>
            <text class="hm-note">{{ masteryWord(detail.mastery) }}（阈值 ≥ {{ threshold }} 为登顶 · 近似值）</text>
          </view>
          <text class="detail-desc" v-else>{{ detail.summitNote }}</text>

          <text class="detail-desc" v-if="detail.desc">{{ detail.desc }}</text>

          <!-- 延续性（本页的灵魂）：K12 段与学科纵深段同屏 -->
          <view class="conti" v-if="detail.gradeMin != null || detail.gradeMax != null">
            <text class="conti-label">延续性</text>
            <view class="conti-scale">
              <text class="cs-end">{{ gradeShort(detail.gradeMin || 1) }}</text>
              <view class="cs-track">
                <view class="cs-idle" :style="{ width: idlePct(detail) + '%' }" />
                <view class="cs-k12" :style="{ width: k12Pct(detail) + '%' }" />
                <view class="cs-depth" :style="{ width: depthPct(detail) + '%' }" />
                <view class="cs-me" :style="{ left: mePct + '%' }" />
              </view>
              <text class="cs-end">{{ gradeShort(detail.gradeMax || 1) }}</text>
            </view>
            <text class="conti-note">
              K12 承接 {{ k12Text({ k12GradeMin: detail.gradeMin, k12GradeMax: detail.gradeMax }) }}
              → 之后仍属该分支，向上进入学科纵深直至顶峰。
            </text>
          </view>
          <view class="conti" v-else>
            <text class="conti-label">延续性</text>
            <text class="conti-note">该分支不在 K12 阶段范围内——它是纯学科纵深节点（中图法 {{ detail.clc || '课标主题' }}），自峰顶之上直通学科之巅。</text>
          </view>

          <view class="detail-rows">
            <view class="detail-row" v-if="detail.gradeMin != null">
              <text class="row-key">K12 年级区间</text>
              <text class="row-val">{{ k12Text({ k12GradeMin: detail.gradeMin, k12GradeMax: detail.gradeMax }) }}（{{ detail.gradeMin }}–{{ detail.gradeMax }} 年级）</text>
            </view>
            <view class="detail-row" v-else>
              <text class="row-key">K12 年级区间</text>
              <text class="row-val">K12 之外 · 学科纵深</text>
            </view>
            <view class="detail-row" v-if="detail.kind === 'peak' && detail.children.length">
              <text class="row-key">纵深子分支</text>
              <text class="row-val">{{ detail.children.length }} 个（雾脊上的小白峰，可点入）</text>
            </view>
            <view class="detail-row" v-if="detail.kind === 'book'">
              <text class="row-key">所属学段</text>
              <text class="row-val">{{ detail.stageName }} · {{ detail.gradeName }}</text>
            </view>
            <view class="detail-row" v-if="detail.kind === 'chapter'">
              <text class="row-key">所属册</text>
              <text class="row-val">{{ detail.bookName }}</text>
            </view>
            <view class="detail-row" v-if="detail.kpCount != null">
              <text class="row-key">已入库知识点</text>
              <text class="row-val">{{ detail.kpCount }} 个</text>
            </view>
          </view>

          <!-- 反向对照：峰 ↔ 册（延续性的双向可验证） -->
          <view class="cross" v-if="detail.kind === 'peak' && relatedBooks.length">
            <text class="cross-label">承接它的 K12 册（人教版）</text>
            <view class="chip-row">
              <button
                v-for="bk in relatedBooks.slice(0, 8)"
                :key="'rb' + bk.code"
                class="chip"
                :data-cross-book="bk.code"
                @click="gotoBook(bk.code)"
              >{{ bk.gradeName }}{{ bk.name.replace(/^人教版(数学|物理|化学|生物学|语文|英语)/, '') }}</button>
            </view>
          </view>
          <view class="cross" v-if="detail.kind !== 'peak' && detail.branches.length">
            <text class="cross-label">所属体系分支（学科知识体系）</text>
            <view class="chip-row">
              <button
                v-for="b in detail.branches"
                :key="'cb' + b.code"
                class="chip green"
                :data-cross-branch="b.code"
                @click="gotoBranch(b.code)"
              >{{ b.name }}</button>
            </view>
          </view>

          <!-- 纵深子分支（维度 A 的峰才有） -->
          <view class="cross" v-if="detail.kind === 'peak' && detail.children.length">
            <text class="cross-label">纵深子分支（K12 之外）</text>
            <view class="chip-row">
              <button
                v-for="c in detail.children"
                :key="'cd' + c.code"
                class="chip"
                :data-cross-depth="c.code"
                @click="gotoBranch(c.code)"
              >{{ c.name }}<text class="chip-tag">{{ c.clc }}</text></button>
            </view>
          </view>

          <!-- 章（维度 B 的册才有） -->
          <view class="cross" v-if="detail.kind === 'book' && detail.chapters.length">
            <text class="cross-label">章（点开看归属分支）</text>
            <view class="camp-list">
              <view
                v-for="c in detail.chapters"
                :key="'ch' + c.code"
                class="camp-chip"
                :data-chapter="c.code"
                @click="selectChapter(detail.rawBook, c)"
              >
                <view class="camp-main">
                  <text class="camp-name">{{ c.name }}</text>
                  <text class="camp-sub">{{ c.branch ? c.branch.name : '未标注分支' }} · {{ c.kpCount }} 知识点</text>
                </view>
                <svg class="twin-ico sm"><use href="#i-arrow" /></svg>
              </view>
            </view>
          </view>

          <!-- 三件事（W3 保留：练一练 / 请教 AI 教师 / 知识图谱） -->
          <view class="action-list">
            <view class="action-item">
              <text class="ai-title">🏋 练一练</text>
              <text class="ai-desc">按这里开一次练习，答题记录会写入你的经历。</text>
              <button class="tbtn primary block" data-practice @click="practiceHere(detail.code)">开始练习 <svg class="twin-ico sm"><use href="#i-arrow" /></svg></button>
            </view>
            <view class="action-item">
              <text class="ai-title">💬 请教 AI 教师</text>
              <text class="ai-desc">就这个知识域向你的 AI 教师提问。</text>
              <button class="tbtn soft block" data-ask-teacher @click="askTeacher()">去求教 <svg class="twin-ico sm"><use href="#i-arrow" /></svg></button>
            </view>
            <view class="action-item">
              <text class="ai-title">🧠 知识图谱</text>
              <text class="ai-desc">展开该领域的知识点与前置关系。</text>
              <button class="tbtn block" data-graph @click="goGraph">展开图谱 <svg class="twin-ico sm"><use href="#i-arrow" /></svg></button>
            </view>
          </view>
        </view>
      </view>
    </view>
  </WorldShell>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount, h, defineComponent } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { useKnowledgeStore } from '@/store/knowledge'
import { usePracticeStore } from '@/store/practice'
import { useTwinStore } from '@/store/twin'
import { useUserStore } from '@/store/user'
import { useAuthStore } from '@gri/auth-client'
import EmptyState from '@/components/ui/EmptyState.vue'
import LoadingSkeleton from '@/components/ui/LoadingSkeleton.vue'
import {
  getActivationContext,
  getSummitBranches,
  getSummitGrades,
  getLearningChain,
  getKpCave,
  getKnowledgePoints
} from '@/api/index.js'
import CaveScene from '@/components/world/CaveScene.vue'
// 世界语言共享件（W3/W4-b/W5-b）：外壳、人物画法、登峰世界的地形与峰/册/刻度画法、
// v4 的雾/光脉/洞窟画法都从同一份取——本页只做排布与状态，不另写一套画法。
import WorldShell from '@world-art/WorldShell.vue'
import {
  personMarker,
  summitScaffold,
  summitFlag,
  peakMassif,
  depthSpire,
  bookCamp,
  gradeY,
  SUMMIT,
  STAGE_SPANS,
  GRADE_TICKS,
  // v4（W5-b）黎明破晓 × 光脉传导：态推导 / 洞带排布 / 雾 / 光 / 洞，全为纯函数
  deriveLightState,
  gradeGroups,
  gradeDoorState,
  doorStateWord,
  lightProgress,
  caveTrailLayout,
  caveDoor,
  caveNode,
  caveEdge,
  fogBank,
  fogPuff,
  ridgeGlow,
  lightBeam,
  lightHint,
  edgeToneClass,
  edgeKindWord,
  CAVE_BAND,
  // v5（W6-a）学科城区：大道 / 一间店(=一节) / 楼间路 / 楼内书房生活场景 / 楼内暗门
  DISTRICT,
  gradeAvenue,
  storefront,
  roadSegment,
  lifeScene,
  basementHatch
} from '@world-art'

const knowledgeStore = useKnowledgeStore()
const practiceStore = usePracticeStore()
const twinStore = useTwinStore()
const userStore = useUserStore()
const auth = useAuthStore()
auth.restore()

/**
 * SVG 文本（uni-app H5 会把模板里的 `<text>` 编译成 `uni-text`，而 `uni-text` 落在
 * SVG 命名空间里是个未知元素——不渲染、量出来 0×0，海拔读数会整片消失）。
 * 海拔刻度、学段名、纵深、「我在这」、图注因此改走这个组件：
 * render 函数里 `h('text')` 由 Vue 按父级命名空间建元素，出来的是真 SVG text。
 */
const SvgText = defineComponent({
  name: 'SvgText',
  inheritAttrs: false,
  setup(_, { attrs, slots }) {
    return () => h('text', attrs, slots.default ? slots.default() : '')
  }
})

const MAPW = SUMMIT.w
const MAPH = SUMMIT.h
const BASE_Y = SUMMIT.groundTopY
const PEAKS_X0 = 168
const PEAKS_X1 = 1116
const BOOKS_X0 = 200
const BOOKS_X1 = 1100

/** 从人本世界走来（门户「学习」意向带 `?from=world`）→ 承接开场过场，过关式不中断（N5）。 */
const entering = ref(false)
onLoad((options) => {
  entering.value = options && options.from === 'world'
})

// ── N1 维度 ───────────────────────────────────────────────────────────────
const DIMS = [
  { code: 'branches', name: '学科知识体系', sub: '学科全覆盖 · 一科 N 座峰' },
  { code: 'grades', name: 'K12 阶段', sub: '学段 · 年级 · 人教版册' },
  // v5（W6-a）学科城区：把「双体系」拆成横纵两个正交方向——横 = 年级大道（K12），
  // 纵 = 街区（学科完整体系）；楼门 = 知识点洞口（§3 粒度裁决）。
  { code: 'district', name: '学科城区', sub: '逛一座会长大的城 · 楼门即知识点' }
]
const dim = ref('branches')
/** 跨维度保留的「当前峰」：切到维度 B 再切回来，仍站在同一座峰上（N1 不丢状态）。 */
const keptBranch = ref(null)

// ── 学科 ─────────────────────────────────────────────────────────────────
const showSubjectBar = ref(true)

/**
 * 学科条的当前项：学科码有两制——课程注册表给的是 `MATH`，页面默认态是 `math`，
 * 后端两者都收（实测两接口两制同源）。故按码归一比较，否则学科条永远不亮。
 */
function isCurrentSubject(s) {
  return String(s?.id || '').toLowerCase() === String(knowledgeStore.currentSubject || '').toLowerCase()
}

// ── 世界里的「我」 ────────────────────────────────────────────────────────
const activation = ref(null)
const selfProfile = computed(() => {
  const p = activation.value && activation.value.profile
  if (p) return p
  const u = auth.user || {}
  return { id: u.externalId || u.id || '', name: u.name || u.username || userStore.name, role: u.role || 'student' }
})
const climberPrims = computed(() => personMarker(selfProfile.value))
async function loadSelf() {
  activation.value = await getActivationContext()
}

// ── 年级工具（与共享件同口径：GRADE_TICKS 是标签真源，这里只做文本） ──────
const GRADE_NAMES = {
  1: '一年级', 2: '二年级', 3: '三年级', 4: '四年级', 5: '五年级', 6: '六年级',
  7: '七年级', 8: '八年级', 9: '九年级', 10: '高一', 11: '高二', 12: '高三'
}
const gradeName = (g) => GRADE_NAMES[g] ?? `G${g}`
const gradeShort = (g) => (GRADE_TICKS.find((t) => t.g === Number(g))?.short ?? `G${g}`)
function stageName(g) {
  const gg = Number(g) || 0
  return STAGE_SPANS.find((s) => gg >= s.min && gg <= s.max)?.name ?? 'K12'
}
const gradeOf = (code) => {
  const n = Number(String(code || '').replace(/[^0-9]/g, ''))
  return n >= 1 && n <= 12 ? n : 1
}
const clampGrade = (g) => Math.max(1, Math.min(12, Number(g) || 1))
const gradeX = (g) => BOOKS_X0 + ((clampGrade(g) - 1) / 11) * (BOOKS_X1 - BOOKS_X0)

/** 我在读的年级：取个人学情，缺省按初一（与 Twin 默认口径一致）。 */
const meGrade = computed(() => clampGrade(knowledgeStore.currentGrade || 7))
const meY = computed(() => gradeY(meGrade.value))
/** 「我在这」在延续性刻度上的位置（百分数）。 */
const mePct = computed(() => ((meGrade.value - 1) / 11) * 100)

function masteryWord(m) {
  if (m >= 80) return '已登顶'
  if (m >= 60) return '接近峰顶'
  if (m >= 40) return '半山'
  if (m >= 15) return '初上路'
  return '尚在山脚'
}
function relTime(iso) {
  if (!iso) return ''
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小时前`
  return `${Math.floor(hr / 24)} 天前`
}
function k12Text(p) {
  const a = p?.k12GradeMin
  const b = p?.k12GradeMax
  if (a == null && b == null) return 'K12 之外'
  if (a != null && b != null && a === b) return gradeShort(a)
  return `${gradeShort(a ?? 1)}–${gradeShort(b ?? 12)}`
}

// ── 数据（只取 W4-a 两个读面）──────────────────────────────────────────────
const branchesData = ref({ subject: null, threshold: 80, peaks: [] })
const gradesData = ref({ subject: null, threshold: 80, stages: [] })
const loadingSummit = ref(false)
const peaks = computed(() => branchesData.value.peaks || [])
const threshold = computed(() => branchesData.value.threshold ?? 80)
const reachedCount = computed(() => peaks.value.filter((p) => p.reached).length)
const masteryAvg = computed(() => twinStore.mastery.avg || 0)
const level = computed(() => userStore.level || Math.floor((twinStore.progress.totalAnswered || 0) / 50) + 1)
const xp = computed(() => userStore.xp || twinStore.progress.correctCount || 0)

async function loadSummit(subj) {
  loadingSummit.value = true
  try {
    const s = subj || knowledgeStore.currentSubject
    // 学科码有两制（store 兜底清单是小写 math/phys，注册表是大写 MATH/PHYS）；
    // summit 读面只认注册表码，故先按原样取，取不到再按大写码补一次（两制同源，不另造真源）。
    let b = await getSummitBranches(s)
    let g = await getSummitGrades(s)
    const empty = !(b && Array.isArray(b.peaks) && b.peaks.length) && !(g && Array.isArray(g.stages) && g.stages.length)
    const up = String(s || '').toUpperCase()
    if (empty && up && up !== s) {
      b = await getSummitBranches(up)
      g = await getSummitGrades(up)
    }
    branchesData.value = b && Array.isArray(b.peaks) ? b : { subject: null, threshold: 80, peaks: [] }
    gradesData.value = g && Array.isArray(g.stages) ? g : { subject: null, threshold: 80, stages: [] }
  } finally {
    loadingSummit.value = false
  }
}

// ── 维度 A 排布：一科 N 座峰，沿同一条海拔轴展开 ──────────────────────────
// 排序 = 延续性读法：K12 起始年级早的靠左；起始相同则终止年级低的靠左。
const sortedPeaks = computed(() =>
  [...peaks.value].sort((a, b) => {
    const ka = a.k12GradeMin ?? 99
    const kb = b.k12GradeMin ?? 99
    if (ka !== kb) return ka - kb
    const ma = a.k12GradeMax ?? 99
    const mb = b.k12GradeMax ?? 99
    if (ma !== mb) return ma - mb
    return String(a.code).localeCompare(String(b.code))
  })
)

function trailD(pts) {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
}

const peakLayout = computed(() => {
  const list = sortedPeaks.value
  const n = list.length
  if (!n) return []
  const span = n > 1 ? (PEAKS_X1 - PEAKS_X0) / (n - 1) : 0
  const x0 = n > 1 ? PEAKS_X0 : (PEAKS_X0 + PEAKS_X1) / 2
  const halfW = n > 1 ? Math.max(36, Math.min(74, span * 0.7)) : 80
  return list.map((peak, i) => {
    const x = Math.round(x0 + span * i)
    const depthOnly = peak.k12GradeMax == null
    // 峰顶落在该分支 K12 终止年级的海拔上——峰有多高，就是它 K12 学到多高。
    const apexY = depthOnly ? 176 : gradeY(peak.k12GradeMax)
    const massif = peakMassif(x, apexY, BASE_Y, halfW, {
      k12Min: peak.k12GradeMin,
      k12Max: peak.k12GradeMax,
      reached: !!peak.reached,
      depth: depthOnly,
      // 相邻峰错开一档色：一列峰有节奏，重叠时也分得开（同一套世界语言，只换档）
      alt: i % 2 === 1
    })
    // 峰顶之上仍是该分支：K12 之外的一段学科纵深（纯纵深峰直通学科之巅）。
    // 纵深段取等长（88）——它表示「越出 K12 之后的纵深」这同一件事，长短应一致。
    const spireTop = depthOnly ? SUMMIT.zenithY : Math.max(SUMMIT.zenithY + 14, apexY - 72)
    const spire = depthSpire(x, apexY, spireTop, halfW * (depthOnly ? 0.28 : 0.2))
    const children = (peak.children || []).map((c, j) => {
      const m = peak.children.length
      const cx = Math.round(x + (j - (m - 1) / 2) * 26)
      const cy = Math.round(spireTop + 16)
      return {
        peak: c,
        x: cx,
        y: cy,
        prims: [
          { k: 'path', c: 'w-band-depth-edge', d: `M${cx} ${cy + 8}V${cy - 10}`, w: 1.2 },
          { k: 'poly', c: 'w-peak-snow', points: `${cx - 5},${cy - 10} ${cx},${cy - 21} ${cx + 5},${cy - 10}` }
        ]
      }
    })
    const flags = peak.reached ? summitFlag(x, apexY - 4, 0.8) : []
    return {
      peak,
      x,
      apexY,
      halfW,
      depthOnly,
      massif,
      spire,
      children,
      flags,
      trailPrims: [
        { k: 'path', c: 'w-trail', d: trailD(massif.trail), w: 6, o: 0.4 },
        { k: 'path', c: 'w-trail-dash', d: trailD(massif.trail), w: 1.3, dash: '3 7', o: 0.8 }
      ]
    }
  })
})

/**
 * 当前峰：由 `nav.branch` 决定，而**与 nav.kind 无关**——关掉详情面板、切到维度 B、
 * 点开某一册，map 上的人仍站在最后选中的那座峰上（N1「不丢当前峰」的另一半）。
 */
const selectedPeakCode = computed(() => {
  const b = nav.value.branch
  return b && peakLayout.value.some((pl) => pl.peak.code === b) ? b : null
})
const selectedPeakLayout = computed(() => peakLayout.value.find((pl) => pl.peak.code === selectedPeakCode.value) || null)

/** 选中峰上「我已走过的路」：山脚 → 我的年级海拔（其余仍为虚线作业）。 */
const climbedD = computed(() => {
  const pl = selectedPeakLayout.value
  if (!pl) return ''
  const pts = pl.massif.trail.filter((p) => p.y >= meY.value)
  if (!pts.length) return ''
  let end = pts[pts.length - 1]
  // 在海拔线上补一个插值点，让轨迹正好停在「我在这」
  const next = pl.massif.trail.find((p) => p.y < meY.value)
  if (next) {
    const t = (end.y - meY.value) / (end.y - next.y || 1)
    end = { x: end.x + (next.x - end.x) * t, y: meY.value }
  }
  return trailD([...pts, end])
})

// ═══════════════════════════════════════════════════════════════════════════
// v4（W5-b）黎明破晓 × 光脉传导
//   M1 晨雾即未知：未走到的一段罩在黎明的雾里，只有山脚（K12 起点）与走过的路可见；
//   M2 光脉传导（魂）：答对 → 该节点亮 → 光顺链流向其后继（未明 → 微光）→ 雾退、山脊露出；
//   M3 洞窟即闭环：点洞 → 洞内平铺场景 → 走完智学慧眼闭环（讲解→练→判→错题/复习→掌握≥80）→ 出洞亮灯。
// 数据**只**来自 W5-a 两个读面（learning-chain / kp-cave）与既有 curriculum 读面；
// 「微光」是端上纯函数推导（deriveLightState），不臆造掌握度（半亮只代表够得着，不等于已掌握）。
// ═══════════════════════════════════════════════════════════════════════════
const chainData = ref({ subject: null, branch: null, nodes: [], edges: [], summary: { total: 0, lit: 0, next: null } })
const loadingChain = ref(false)
const chainNodes = computed(() => chainData.value.nodes || [])
const chainSummary = computed(() => chainData.value.summary || { total: 0, lit: 0, next: null })
/** 洞内闭环要 kpId（uuid），而链上给的是 kp code —— code→id 由既有点表读面按年级补齐并缓存。 */
const kpIdByCode = ref({})
const kpIdsLoaded = {}
const bandGrade = ref(null)
const caveTarget = ref(null)
const caveLoading = ref(false)
/** 已取到链的分支（同一分支不重复取；onShow / 出洞亮灯时显式 force 重取）。 */
let chainBranchLoaded = null

/**
 * 边在 W5-a 真源里是 **kp 级**的（from/to 都是 kp code），而洞带画在「节」这一层，
 * 故把 kp 边收成节边：同一对节取最强的一类（显式前置 > 课程序列 > 引导路径），
 * 避免同一对节叠出三条线、也避免把「引导」画得比「显式」还重（N5）。
 */
const EDGE_RANK = { explicit: 0, seq: 1, soft: 2 }
const nodeEdges = computed(() => {
  const kpToNode = new Map()
  for (const n of chainNodes.value) for (const kp of n.kps || []) kpToNode.set(kp.code, n.code)
  const byPair = new Map()
  for (const e of chainData.value.edges || []) {
    const from = kpToNode.get(e.from)
    const to = kpToNode.get(e.to)
    if (!from || !to || from === to) continue
    const key = from + '@@' + to
    const cur = byPair.get(key)
    if (!cur || EDGE_RANK[e.kind] < EDGE_RANK[cur.kind]) byPair.set(key, { from, to, kind: e.kind, reason: e.reason })
  }
  return [...byPair.values()]
})

/**
 * N5 引导去向：soft 边实测**全部跨年级**（这本书学完接下一本，如「小六末 → 初一初」），
 * 而节带一次只铺一个年级 —— 光靠带内边画不出来，引导路径会在世界里整个消失。
 * 故在带内给「有引导去向」的节画一条去向桩（最淡虚线的旁支 + 端点小点）：
 * 「引导」真的可见，且明摆着弱于显式/课程序列（虚线 + 最淡一档 + 图例注记「非精确前置，仅供引导」）。
 */
const softOut = computed(() => {
  const kpToNode = new Map()
  for (const n of chainNodes.value) for (const kp of n.kps || []) kpToNode.set(kp.code, n.code)
  const m = new Map()
  for (const e of chainData.value.edges || []) {
    if (e.kind !== 'soft') continue
    const from = kpToNode.get(e.from)
    const to = kpToNode.get(e.to)
    if (!from || !to || from === to) continue
    if (!m.has(from)) m.set(from, [])
    m.get(from).push(to)
  }
  return m
})

/** M2 光脉传导：已亮的节把「相邻未明」照成微光（雾只被相邻的光驱散，N6①）。 */
const lightStates = computed(() => deriveLightState(chainNodes.value, nodeEdges.value))
const chainProgress = computed(() => lightProgress(lightStates.value))
const chainReady = computed(() => (dim.value === 'branches' || dim.value === 'district') && chainNodes.value.length > 0)
function stateOf(code) {
  return lightStates.value[code] || 'dim'
}
/**
 * 知识点自己的三态。
 * **不能图省事调 `stateOf(k.code)`**：`lightStates` 是 `deriveLightState(chainNodes, …)` 的产物，
 * 只按**节 code**建键（chainNodes 一项就是一节）。拿 KP code 去查必然落空 →
 * 一律回 `'dim'` → 楼门把「有作答未到 80」的知识点画成从没碰过（实测复现：
 * street 门 kp01=dim，同一盏灯进楼=half/mastery 50，两个面互相打脸）。
 * 真源是 learning-chain 每个 kp 自带的 `mastery`（≥80 亮 / 有值即半亮，含 0）与 `state`，
 * 口径与后端 stateFor() 逐字对齐：`mastery == null ? 'dim' : mastery >= 80 ? 'lit' : 'half'`。
 * CaveScene.kpSeeds 判的是同一件事，两边必须是同一个口径（否则又是一处「两个面互相打脸」）。
 */
function kpLightOf(kp) {
  if (!kp) return 'dim'
  const m = kp.mastery == null ? null : Number(kp.mastery)
  if (m == null) return kp.state || 'dim'
  return m >= 80 ? 'lit' : 'half'
}
function edgeKindBetween(from, to) {
  const hit = nodeEdges.value.find((e) => e.from === from && e.to === to)
  return hit ? hit.kind : 'seq'
}

/** N11：一次只铺一个年级的洞带（同年级节数 ≤ 40；整支几百节靠按年级分段 + 横向滚动保持流畅）。 */
const gradeList = computed(() =>
  gradeGroups(chainNodes.value).map((g) => {
    const states = {}
    for (const n of g.nodes) states[n.code] = stateOf(n.code)
    const vals = Object.values(states)
    return {
      grade: g.grade,
      gradeNum: gradeOf(g.grade),
      nodes: g.nodes,
      states,
      door: gradeDoorState(states),
      lit: vals.filter((s) => s === 'lit').length,
      half: vals.filter((s) => s === 'half').length,
      total: vals.length
    }
  })
)
const activeGrade = computed(() => {
  const want = bandGrade.value || (gradeList.value[0] ? gradeList.value[0].grade : null)
  return gradeList.value.find((g) => g.grade === want) || null
})
/** 洞带上的节（附有效态）：→ 洞位三态。 */
const bandNodes = computed(() => (activeGrade.value ? activeGrade.value.nodes : []).map((n) => ({ ...n, light: stateOf(n.code) })))
const bandLayout = computed(() => caveTrailLayout(bandNodes.value))
const bandPos = computed(() => {
  const m = new Map()
  for (const p of bandLayout.value.points) m.set(p.node.code, p)
  return m
})
const bandEdges = computed(() =>
  nodeEdges.value
    .filter((e) => bandPos.value.has(e.from) && bandPos.value.has(e.to))
    .map((e) => ({ ...e, a: bandPos.value.get(e.from), b: bandPos.value.get(e.to) }))
)

// ═══════════════════════════════════════════════════════════════════════════
// v5（W6-a）学科城区：把「登顶」换成「逛一座会长大的城」
//   · 横 = 年级大道（K12 体系的物理化）：路面横切，里程碑落在 GRADY_TICKS 同源的年级刻度上；
//   · 纵 = 街区（学科完整体系）：一车道 = 一个分支峰（P1 只铺选中分支这一条）；
//   · 一间店 = 一节（同 band 的粒度，但**不再用「洞」的名字**）；
//   · 楼门 = 知识点洞口（§3 粒度裁决）：点门进楼 → 楼内书房（主）跑同一条智学慧眼闭环，
//     岩洞降为楼内可选地下室，**掌握度真源不变**（edu.mastery_snapshots ≥ 80）。
// 几何一律复用 @world-art 的城区画法（DISTRICT / gradeAvenue / storefront / roadSegment /
// lifeScene / basementHatch）与既有常量（caveTrailLayout / CAVE_BAND.nodeW），本页不写几何。
// 城区**长在同一块土地上**——复用 SCAFFOLD 已画的厚土台原与年级海拔格线，不另起地貌。
// ═══════════════════════════════════════════════════════════════════════════

/** 大道里程碑：x 取 gradeX 同一真源（不新建刻度表），标签由页面 HTML 叠层给出。 */
const avenueMarks = computed(() =>
  GRADE_TICKS.map((tk) => ({ g: tk.g, x: gradeX(tk.g), short: tk.short }))
)
/** 大道铺在厚土台原的顶面上（= 山脚地面同一条线），与海拔格线同一片地面。 */
const avenueY = SUMMIT.groundTopY
const streetX0 = BOOKS_X0
const streetX1 = BOOKS_X1
const avenuePrims = computed(() => {
  if (dim.value !== 'district') return []
  return gradeAvenue(streetX0, streetX1, avenueY, avenueMarks.value)
})

/** 城区在铺的节点 = 当前分支链上、当前年级前后各 2 个年级（同 N11：一次只铺一小段）。 */
const districtStorefronts = computed(() => {
  if (dim.value !== 'district' || !chainReady.value) return []
  const want = activeGrade.value ? activeGrade.value.gradeNum : (gradeList.value[0] ? gradeList.value[0].gradeNum : 1)
  const slotW = DISTRICT.buildingW + DISTRICT.roadW
  return chainNodes.value
    .map((n) => ({ ...n, light: stateOf(n.code), gradeNum: gradeOf(n.grade) }))
    .filter((n) => Math.abs(n.gradeNum - want) <= 2)
    .map((n, i) => {
      const x = Math.round(streetX0 + 40 + i * slotW)
      return {
        code: n.code,
        name: n.name,
        chapterName: n.chapterName,
        light: n.light,
        kpCount: (n.kps || []).length,
        x,
        y: avenueY,
        prims: storefront(x, avenueY, DISTRICT.buildingW, DISTRICT.blockH, n.light)
      }
    })
})
/** 楼间路 = 前置链的物理化（v4 的「edge」搬到「路上」）：相邻店之间一段路。
 *  **未学的店之间仍画一条连续的路**，只是灯没亮——这正是"连续性可见"（用户诉求①）。 */
const districtRoads = computed(() => {
  if (dim.value !== 'district') return []
  const list = districtStorefronts.value
  const out = []
  for (let i = 1; i < list.length; i += 1) {
    const kind = edgeKindBetween(list[i - 1].code, list[i].code)
    const a = { x: list[i - 1].x + DISTRICT.buildingW / 2, y: list[i - 1].y + 4 }
    const b = { x: list[i].x - DISTRICT.buildingW / 2, y: list[i].y + 4 }
    out.push({ ...roadSegment(a, b, kind), kind, from: list[i - 1].code, to: list[i].code })
  }
  return out
})

/** 城区当前把哪一间店的楼门带到楼前一条街上（点店面即换；null = 自动挑未亮那间）。 */
const districtPick = ref(null)

/** 章内知识点路径（楼前一条街）：点一间店 → 楼前一排门。复用 caveTrailLayout 同常量
 *  → 相邻间距 == CAVE_BAND.nodeW（验收判据 kp_path_contiguous）。 */
const districtKpNode = computed(() => {
  if (dim.value !== 'district') return null
  const want = activeGrade.value ? activeGrade.value.gradeNum : null
  const inWindow = chainNodes.value
    .map((n) => ({ ...n, light: stateOf(n.code), gradeNum: gradeOf(n.grade) }))
    .filter((x) => Math.abs(x.gradeNum - want) <= 2)
  const picked = districtPick.value && inWindow.find((x) => x.code === districtPick.value)
  // 默认挑「还没全亮」的那一间（一进去就站在要上课的地方）；全亮了就挑第一间
  const node = picked || inWindow.find((x) => x.light !== 'lit') || inWindow[0]
  return node ? node.code : null
})
const districtKpRows = computed(() => {
  if (dim.value !== 'district' || !districtKpNode.value) return []
  const picked = chainNodes.value.find((n) => n.code === districtKpNode.value)
  if (!picked) return []
  // `...k` 必须带上：kpLightOf 读的是 chain 自带的 mastery/state，摊掉就没有真源了
  return (picked.kps || []).map((k) => ({ ...k, light: kpLightOf(k), id: kpIdByCode.value[k.code] }))
})
const kpPathLayout = computed(() => (districtKpRows.value.length ? caveTrailLayout(districtKpRows.value) : { w: 0, h: CAVE_BAND.h, points: [] }))
/** KP 门的落点（SVG 坐标）：排在选中店正前的一条街上，与大道同向、等间距。 */
const kpDoorPoints = computed(() => {
  if (dim.value !== 'district') return []
  const layout = kpPathLayout.value
  if (!layout.points.length) return []
  const anchor = districtStorefronts.value.find((s) => s.code === districtKpNode.value) || districtStorefronts.value[0]
  // 门排以该店为中心向两侧展开，避免越出大道左右端
  const cx = anchor ? anchor.x : Math.round((streetX0 + streetX1) / 2)
  const span = layout.w - CAVE_BAND.padX * 2
  const left = Math.max(streetX0 + 8, Math.min(streetX1 - 8 - span, cx - span / 2))
  const baseY = avenueY + 40
  return layout.points.map((p) => ({
    code: p.node.code,
    id: p.node.id,
    name: p.node.name,
    light: p.node.light,
    x: Math.round(left + (p.x - CAVE_BAND.padX)),
    y: Math.round(baseY + (p.y - CAVE_BAND.yMid))
  }))
})
/** 楼前一条街的路（KP 之间的序列）：未学的门之间仍是连续一条路。 */
const kpPathPrims = computed(() => {
  if (dim.value !== 'district') return []
  const pts = kpDoorPoints.value
  const out = []
  for (let i = 1; i < pts.length; i += 1) {
    const kind = edgeKindBetween(pts[i - 1].code, pts[i].code)
    const a = { x: pts[i - 1].x, y: pts[i - 1].y + 6 }
    const b = { x: pts[i].x, y: pts[i].y + 6 }
    out.push(...Object.values(roadSegment(a, b, kind)))
  }
  return out
})

/** 城区空态判据（V5-N10 不造假楼）：
 *  - null       ：能铺（链上有节）
 *  - 'nocode'   ：这门学科的节/知识点没有唯一编码 → 楼门铺不出来，明确告知（不铺假楼）
 *  - 'empty'    ：链本身没有节
 */
const distinctBlocked = computed(() => {
  if (dim.value !== 'district') return null
  if (!chainNodes.value.length) return 'empty'
  const kps = chainNodes.value.flatMap((n) => n.kps || [])
  if (!kps.length) return 'empty'
  const withCode = kps.filter((k) => k && k.code)
  if (!withCode.length) return 'nocode'
  return null
})

/** 点一间店（= 一节）：把这一间的楼门带到楼前一条街上（不直接进楼，先看清这一间有哪些门）。 */
function pickStorefront(code) {
  districtPick.value = code
  const node = chainNodes.value.find((n) => n.code === code)
  if (!node) return
  // 这一间的门要能点开：确保该年级的 code→id 在（同 ensureKpIds 读面）
  ensureKpIds(gradeOf(node.grade))
}

/** 城区有效但还没有选中峰（直进城区 / 切学科后）→ 落到第一个峰：城区要有链才能铺。
 *  非 immediate：`peakLayout` 是下方 const computed，immediate 会踩 TDZ。 */
/**
 * 城区有效但还没有选中峰（直进城区 / 切学科后）→ 落到第一个峰：城区要有链才能铺。
 *
 * 为什么数据源只取 `nav.branch` / `peakLayout.length`，**不取 selectedPeakCode**：
 * 用数组源 watch 订阅一个 computed（selectedPeakCode）会让那个 computed 被包进
 * watch 自己的 effect，渲染期无人再追踪它 → 它的值冻结在 setup 期的那一次（null），
 * 于是 `chainNodes / v4 读数条 / gradeDoors` 全都不渲染，链也永不再取（实测复现过）。
 * 改成只读底层 ref，watch 的 effect 不触及链上任何 computed。
 * 同样不用 immediate：`peakLayout` 是下方 const computed，immediate 会踩 TDZ。
 */
watch([dim, () => nav.value.branch, () => peakLayout.value.length], () => {
  if (dim.value !== 'district') return
  const b = nav.value.branch
  if (b && peakLayout.value.some((pl) => pl.peak.code === b)) return
  const first = peakLayout.value[0]
  if (first) selectPeak(first.peak.code)
})

/** 下一个最佳目标（N6②）：W5-a summary.next 是节 code。 */
const nextNode = computed(() => chainNodes.value.find((n) => n.code === chainSummary.value.next) || null)

/** 洞带绘制（一整条渲染链，几何一次算完；动画全在 CSS，不逐帧重建 DOM —— N11）。 */
const bandPrims = computed(() => {
  const out = []
  const pts = bandLayout.value.points
  if (pts.length > 1) {
    const d = trailD(pts)
    out.push({ k: 'path', c: 'w-trail', d, w: 7, o: 0.32 })
    out.push({ k: 'path', c: 'w-trail-dash', d, w: 1.2, dash: '3 9', o: 0.7 })
  }
  for (const e of bandEdges.value) {
    const { wide, core } = caveEdge(e.a, e.b, e.kind)
    out.push(wide, core)
  }
  // N5：跨年级的「引导去向」画成带内旁支（最淡虚线 + 端点小点），并有图例注记——不是必修前置
  for (const p of pts) {
    if (!softOut.value.has(p.node.code)) continue
    const dy = p.y < CAVE_BAND.yMid ? 24 : -24 // 往两排之间的空档去，不压到下一排的洞位
    const x2 = p.x + 34
    const y2 = p.y + dy
    const { wide, core } = caveEdge({ x: p.x, y: p.y }, { x: x2, y: y2 }, 'soft')
    out.push(wide, core)
    out.push({ k: 'circle', c: 'w-edge-soft', cx: x2, cy: y2, r: 2.6, o: 0.75 })
  }
  // M2：上一节已亮 → 这一段被光脉照亮（只沿课程序列向前流，不跳节）
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1]
    const b = pts[i]
    if (a.node.light !== 'lit') continue
    const kind = edgeKindBetween(a.node.code, b.node.code)
    out.push(...lightBeam(`M${a.x} ${a.y}L${b.x} ${b.y}`, { w: kind === 'soft' ? 2 : 3 }))
  }
  for (const p of pts) out.push(...caveNode(p.x, p.y, 1, p.node.light))
  return out
})
const bandW = computed(() => bandLayout.value.w)
const bandH = computed(() => bandLayout.value.h)

// ── M1 晨雾：雾退到「光脉前沿」之上，走过的路永远看得见 ──────────────────
/** K12 起点：链上最早的年级；链未就绪时退回该分支的 K12 起学年级。 */
const baseGradeNum = computed(() => {
  const nums = chainNodes.value.map((n) => gradeOf(n.grade))
  if (nums.length) return Math.min(...nums)
  const pl = selectedPeakLayout.value
  return pl && pl.peak.k12GradeMin != null ? clampGrade(pl.peak.k12GradeMin) : 1
})
/** 光脉前沿：已亮或微光所在的最靠上的年级（雾退到它之上）——雾只被相邻的光驱散。 */
const revealGradeNum = computed(() => {
  let top = baseGradeNum.value
  for (const g of gradeList.value) {
    if (Object.values(g.states).some((s) => s !== 'dim')) top = Math.max(top, g.gradeNum)
  }
  return top
})
const fogFrontierY = computed(() => (revealGradeNum.value >= 12 ? 0 : gradeY(revealGradeNum.value + 1)))
const fogActive = computed(() => dim.value === 'branches' && fogFrontierY.value > 12)

/** 雾层：整层黎明幕（上实下虚）+ 前沿雾带 + 雾中山脊轮廓微光（「山还在，只是还没亮」）。 */
const fogPrims = computed(() => {
  if (!fogActive.value) return []
  const fy = fogFrontierY.value
  const out = [{ k: 'rect', c: 'w-fog-veil', x: 104, y: 0, w: 1084, h: fy, o: 1, f: 'url(#fogVeil)' }]
  out.push(...fogBank(fy, 118, 1174, 30))
  const pl = selectedPeakLayout.value
  if (pl) {
    const veil = pl.massif.trail.filter((p) => p.y <= fy)
    if (veil.length > 1) out.push(...ridgeGlow(trailD(veil), 1.3))
    spawnPuffs(out, pl.x, fy)
  } else {
    for (const pl2 of peakLayout.value) spawnPuffs(out, pl2.x, fy)
  }
  return out
})
function spawnPuffs(out, x, fy) {
  for (let i = 0; i < 3; i += 1) {
    out.push(...fogPuff(x + (i - 1) * 46, fy - 18 - i * 22, 1 + i * 0.16, i === 2 ? 'far' : 'near'))
  }
}

/** 雾之上的东西：走过的路（M1）与光脉（M2）——已走过的、已点亮的，雾压不住。 */
const overFogPrims = computed(() => {
  if (dim.value !== 'branches') return []
  const out = []
  if (climbedD.value) out.push({ k: 'path', c: 'w-climb', d: climbedD.value, w: 3.4, f: 'url(#glow)', o: 0.95 })
  const pl = selectedPeakLayout.value
  if (!pl || !chainReady.value) return out
  // 光脉：沿选中峰的登山径，从山脚亮到「光脉前沿」所在的海拔
  const yLit = gradeY(revealGradeNum.value)
  const litPts = pl.massif.trail.filter((p) => p.y >= yLit)
  if (litPts.length > 1) out.push(...lightBeam(trailD(litPts), { w: 4 }))
  // 下一个最佳目标：往上一段的路口呼吸提示（N6②）
  if (revealGradeNum.value < 12) {
    const yA = gradeY(revealGradeNum.value)
    const yB = gradeY(Math.min(12, revealGradeNum.value + 1))
    const hintPts = pl.massif.trail.filter((p) => p.y >= yB && p.y <= yA)
    if (hintPts.length > 1) out.push(...lightHint(trailD(hintPts), 2.4))
  }
  return out
})

/** 选中峰上的年级洞门（N6③ 三态：暗门 / 半亮 / 亮灯）：开在每条线上该年级的海拔处。 */
const gradeDoors = computed(() => {
  const pl = selectedPeakLayout.value
  if (dim.value !== 'branches' || !pl || !chainReady.value) return []
  return gradeList.value.map((g) => {
    const yWant = gradeY(g.gradeNum)
    const at = pl.massif.trail.reduce((best, p) => (Math.abs(p.y - yWant) < Math.abs(best.y - yWant) ? p : best), pl.massif.trail[0])
    const x = Math.round(at.x)
    const y = Math.round(at.y)
    return { ...g, x, y, prims: caveDoor(x, y, 0.82, g.door) }
  })
})

/** 洞门/洞带的健康读数：整体进度（N9 信息密度；口径 = 节点亮占比，非掌握度）。 */
const doorWord = computed(() => doorStateWord(activeGrade.value ? activeGrade.value.door : 'dim'))
const nextHintText = computed(() => {
  const n = nextNode.value
  if (!chainNodes.value.length) return '待取学习链'
  if (!n) return '本支已全部点亮'
  const g = gradeOf(n.grade)
  return `${n.name}（${gradeShort(g)}）`
})

// ── M3 洞内闭环：kpId 补齐 + kp-cave 聚合 + 走完回写 ──────────────────────
async function ensureKpIds(gradeNum) {
  const subj = knowledgeStore.currentSubject || 'math'
  const key = `${subj}#${gradeNum}`
  if (kpIdsLoaded[key]) return
  kpIdsLoaded[key] = true
  const rows = await getKnowledgePoints({ subject: subj, gradeLevel: gradeNum })
  const next = { ...kpIdByCode.value }
  if (Array.isArray(rows)) for (const r of rows) if (r && r.code && r.id) next[r.code] = r.id
  kpIdByCode.value = next
}

/** 洞内展开的知识点（HTML 标签与 CAVE 组件共用；未落题的知识点标 dim 且不可练）。 */
const caveKps = computed(() => {
  const t = caveTarget.value
  if (!t) return []
  return (t.node.kps || []).map((k) => ({
    code: k.code,
    name: k.name,
    state: kpLightOf(k),
    mastery: k.mastery,
    id: kpIdByCode.value[k.code]
  }))
})

/** 登录态：洞内闭环走个人作答与错题/复习，故只有登录后才开课；匿名进洞只出场景与说明。 */
const isLoggedIn = computed(() => !!(auth && auth.accessToken))

/** 洞内换一个知识点灯位：重新取这一点的 kp-cave 聚合（错题/复习/下一节都跟着换）。 */
async function onPickCaveKp(code) {
  const t = caveTarget.value
  if (!t || !code) return
  const id = kpIdByCode.value[code]
  const cave = id ? await getKpCave(id) : null
  caveTarget.value = { ...t, kpCode: code, cave: cave || null }
}

async function openGradeDoor(grade) {
  bandGrade.value = grade
  const g = gradeList.value.find((x) => x.grade === grade)
  if (g) await ensureKpIds(g.gradeNum)
}

async function openCave(node) {
  if (!node || caveLoading.value) return
  const kps = node.kps || []
  // 洞里跑的是知识点级闭环：优先取这一节「还没亮」的第一个知识点（都亮了就取第一个，允许再练）
  // 判亮没亮必须用知识点自己的三态（kpLightOf）——用 stateOf(k.code) 会永远拿到 'dim'，
  // 「优先没亮的」就退化成「永远第一个」，而那一个可能早亮着，进去只能看「你已经掌握」。
  const pick = kps.find((k) => kpLightOf(k) !== 'lit') || kps[0]
  if (!pick) return
  caveLoading.value = true
  try {
    await ensureKpIds(gradeOf(node.grade))
    const id = kpIdByCode.value[pick.code]
    const cave = id ? await getKpCave(id) : null
    caveTarget.value = { node, kpCode: pick.code, cave: cave || null }
  } finally {
    caveLoading.value = false
  }
}

/**
 * v5（W6-a）点楼门（= 知识点洞口）进楼：≤2 步进洞的第一步（比 v4 少两层）。
 * 楼门与节洞带的差别只在「入口是谁」：v4 是「点年级洞门 → 节洞带 → 点节进洞」，
 * v5 是「点楼门 → 直接进楼」——楼内跑**同一条**智学慧眼闭环（同一个 CaveScene）。
 */
async function openKpDoor(d) {
  if (!d || caveLoading.value) return
  const node = chainNodes.value.find((n) => (n.kps || []).some((k) => k.code === d.code))
  if (!node) return
  caveLoading.value = true
  try {
    await ensureKpIds(gradeOf(node.grade))
    const id = kpIdByCode.value[d.code]
    const cave = id ? await getKpCave(id) : null
    // kpCode 指向被点的那个知识点：楼内一进门就落在这扇门上
    caveTarget.value = { node, kpCode: d.code, cave: cave || null, fromDistrict: true }
  } finally {
    caveLoading.value = false
  }
}

/** 出洞亮灯：强制重取链（真源回落），让这一节与它的后继在新数据上重新推导光脉与雾界。 */
const caveLitAny = ref(false)
function onCaveLitKp() {
  caveLitAny.value = true
}
async function onCaveLit() {
  caveLitAny.value = false // 这一拍已经重取过，closeCave 不必再取一次
  await loadChain(selectedPeakCode.value, true)
  uni.showToast({ title: '洞口亮灯 · 光脉向前', icon: 'none' })
}

/**
 * 关洞。若本次进洞点亮过灯位（哪怕没走完「亮灯出洞」、从「先出洞」离开），
 * 也必须回落一次真源——否则世界停在旧读数上，M2 的「光自动向前传导」就断了。
 */
async function closeCave() {
  const need = caveLitAny.value
  caveTarget.value = null
  caveLitAny.value = false
  if (need) await loadChain(selectedPeakCode.value, true)
}

/**
 * 闭环出口（V5-N7：六环节一个不删，本卡只增 plan / supervise 两个）。
 * 两个既有缺口在此补齐：`plan` 落到已注册却从未被登峰页接过的学习计划页；
 * `supervise` 落同一页的监督视角（该页已有计划类型 tab + 执行进度 + 日历）。
 * 说明：家长视角报告面 `GET /api/tuition/plans/parent-report/:studentId`（api 封装
 * `getParentReport`）**后端已就绪但前端无页面**，故不在此凭空造一个入口——诚实告知，
 * 由 P3 单独评估是否补家长报告页（不造假楼 / V5-N10）。二者同源于 edu.learning_plans。
 */
function gotoReview(kind) {
  caveTarget.value = null
  if (kind === 'wrong') uni.navigateTo({ url: '/pages/wrong-questions/index' })
  else if (kind === 'plan') uni.navigateTo({ url: '/pages/learning-plan/index' })
  else if (kind === 'supervise') uni.navigateTo({ url: '/pages/learning-plan/index?view=supervise' })
  else uni.switchTab({ url: '/pages/practice/index' })
}

async function loadChain(branch, force = false) {
  const b = branch || selectedPeakCode.value
  if (!b) return
  if (!force && b === chainBranchLoaded && chainNodes.value.length) return
  loadingChain.value = true
  try {
    const subj = knowledgeStore.currentSubject || 'math'
    let data = await getLearningChain(subj, b, null)
    if (!(data.nodes || []).length && String(subj).toUpperCase() !== subj) {
      data = await getLearningChain(String(subj).toUpperCase(), b, null)
    }
    chainData.value = data && Array.isArray(data.nodes) ? data : { subject: null, branch: b, nodes: [], edges: [], summary: { total: 0, lit: 0, next: null } }
    chainBranchLoaded = b
  } finally {
    loadingChain.value = false
  }
  // 洞带默认落在「光脉前沿」（或第一个年级）：一进来就站在光到过的地方。
  //
  // 但**城区窗口不能跟着前沿跳**：从楼门进楼、答完出洞会重取链，此时 revealGradeNum 因刚点亮而前移，
  // 这里若照旧把窗口落到新前沿，用户刚才踩的那间店就被挤出窗口——「楼门→书房→出洞」走完回来，
  // 眼前这条街换了位置（实测复现：76 间店 → 68 间，目标那间不见了）。
  // 故只要 districtPick 还在（正在看/刚出洞的那一间），窗口就优先钉在它的年级上。
  if (districtPick.value) {
    const keep = chainNodes.value.find((n) => n.code === districtPick.value)
    if (keep) {
      const g = gradeList.value.find((x) => x.grade === keep.grade)
      if (g) bandGrade.value = g.grade
    }
  }
  if (!gradeList.value.some((g) => g.grade === bandGrade.value)) {
    const front = gradeList.value.find((g) => g.gradeNum === revealGradeNum.value) || gradeList.value[0]
    bandGrade.value = front ? front.grade : null
  }
  lightToastArmed = true
}

// ── 维度 B 排布：学段台地 + 人教版册营地 ─────────────────────────────────
const stageBands = computed(() => {
  const have = new Set((gradesData.value.stages || []).map((s) => s.code))
  return STAGE_SPANS.map((sp, i) => {
    const yBot = gradeY(sp.min)
    const yTop = gradeY(sp.max)
    return {
      code: sp.code,
      name: sp.name,
      has: have.has(sp.code),
      labelY: Math.round((yBot + yTop) / 2) + 4,
      prim: {
        k: 'poly',
        c: `w-stage-${i + 1}`,
        points: `104,${yBot} 1188,${yBot} 1188,${yTop} 104,${yTop}`,
        o: have.has(sp.code) ? 0.5 : 0.2
      }
    }
  })
})

const books = computed(() => {
  const out = []
  for (const st of gradesData.value.stages || []) {
    for (const gr of st.grades || []) {
      const g = gradeOf(gr.code)
      const list = gr.textbooks || []
      list.forEach((t, j) => {
        const x = Math.round(gradeX(g) + (list.length > 1 ? (j - (list.length - 1) / 2) * 46 : 0))
        const y = Math.round(gradeY(g) - 14)
        out.push({
          code: t.code,
          name: t.name,
          grade: g,
          gradeName: gradeName(g),
          stageCode: st.code,
          stageName: st.name,
          textbook: t,
          branches: t.branches || [],
          branchNames: (t.branches || []).map((b) => b.name).join(' / '),
          chapters: t.chapters || [],
          x,
          y,
          prims: bookCamp(x, y, list.length > 2 ? 0.82 : 1)
        })
      })
    }
  }
  return out
})

function booksOfStage(stageCode) {
  return books.value.filter((b) => b.stageCode === stageCode)
}

/** 反向对照：某座峰承接了哪些 K12 册。 */
const booksByBranch = computed(() => {
  const map = {}
  for (const bk of books.value) {
    for (const b of bk.branches) {
      if (!map[b.code]) map[b.code] = []
      map[b.code].push(bk)
    }
  }
  return map
})
const relatedBooks = computed(() => {
  const code = nav.value.kind === 'book' ? nav.value.peakOf : nav.value.branch
  if (!code) return []
  return (nav.value.kind === 'peak' ? booksByBranch.value[code] : []) || []
})

// ── 场景几何（一条渲染链：全部 primitive 按层序平铺）──────────────────────
// 底图把「纯色天空」让位给本页渐变（sky:false），其余天光/远山/云鸟/地景/海拔刻度照旧。
const SCAFFOLD = summitScaffold({ sky: false })

const scenePrims = computed(() => {
  const out = [...SCAFFOLD]
  if (dim.value === 'grades') for (const sb of stageBands.value) out.push(sb.prim)
  // v5（W6-a）学科城区：层序即语义——先路（大道与楼间路）→ 再楼（一间店）→ 最后楼前一条街的门
  if (dim.value === 'district') {
    for (const p of avenuePrims.value) out.push(p)
    for (const r of districtRoads.value) { out.push(r.wide); out.push(r.core) }
    for (const s of districtStorefronts.value) for (const p of s.prims) out.push(p)
    for (const p of kpPathPrims.value) out.push(p)
  }
  if (dim.value === 'branches') {
    for (const pl of peakLayout.value) {
      for (const p of pl.spire) out.push(p)
      for (const p of pl.massif.prims) out.push(p)
      for (const p of pl.trailPrims) out.push(p)
      for (const p of pl.flags) out.push(p)
      for (const c of pl.children) for (const p of c.prims) out.push(p)
    }
  } else {
    for (const bk of books.value) for (const p of bk.prims) out.push(p)
  }
  // v4 渲染序（层序即语义）：群山 → 晨雾（M1，罩住未明）→ 年级洞门（M3，雾里也找得到）
  // → 走过/已亮的路（M1/M2，雾压不住）。
  for (const p of fogPrims.value) out.push(p)
  for (const gd of gradeDoors.value) for (const p of gd.prims) out.push(p)
  for (const p of overFogPrims.value) out.push(p)
  return out
})

/** 人物落点：维度 A 站在选中峰的登山径上（我的年级海拔处）；维度 B 站在我的年级列上。 */
const mePos = computed(() => {
  if (dim.value === 'branches') {
    const pl = selectedPeakLayout.value
    if (!pl) return null
    const cand = pl.massif.trail.reduce(
      (best, p) => (Math.abs(p.y - meY.value) < Math.abs(best.y - meY.value) ? p : best),
      pl.massif.trail[0]
    )
    return { x: Math.round(cand.x), y: Math.round(cand.y) - 2 }
  }
  return { x: Math.round(gradeX(meGrade.value)), y: meY.value - 2 }
})

// ── 热点（HTML 叠层，与 SVG 同一坐标真源）─────────────────────────────────
const nav = ref({ kind: null, code: null, branch: null, peakOf: null })

function peakState(p) {
  if (p.reached) return 'summit'
  return p.mastery != null && p.mastery > 0 ? 'climb' : 'idle'
}

const hotspots = computed(() => {
  const out = []
  if (dim.value === 'branches') {
    peakLayout.value.forEach((pl, i) => {
      const p = pl.peak
      out.push({
        key: 'pk' + p.code,
        kind: 'peak',
        code: p.code,
        branch: p.code,
        name: p.name,
        short: p.name,
        left: (pl.x / MAPW) * 100,
        // 峰名标在峰顶；相邻峰错开半格，密集时名字不叠在一起（位置仍指向该峰峰顶）
        top: (pl.apexY / MAPH) * 100 + (i % 2 === 1 ? 3.4 : 0),
        state: peakState(p),
        isHere: selectedPeakCode.value === p.code,
        aria: `学科分支峰 ${p.name}，中图法 ${p.clc}，K12 承接 ${k12Text(p)}，${p.reached ? '已登顶' : '未登顶'}`
      })
      for (const c of pl.children) {
        out.push({
          key: 'dp' + c.peak.code,
          kind: 'depth',
          code: c.peak.code,
          branch: p.code,
          name: c.peak.name,
          short: c.peak.name,
          left: (c.x / MAPW) * 100,
          top: (c.y / MAPH) * 100,
          state: 'depth',
          isHere: false,
          aria: `学科纵深子分支 ${c.peak.name}，中图法 ${c.peak.clc}，不在 K12 阶段范围内`
        })
      }
    })
    // v4：选中峰上的年级洞门（点进去展开这一年级的节洞带 → 洞内闭环）
    for (const gd of gradeDoors.value) {
      out.push({
        key: 'gd' + gd.grade,
        kind: 'grade',
        code: gd.grade,
        branch: selectedPeakCode.value,
        name: `${gradeShort(gd.gradeNum)} 年级洞门`,
        short: `${gradeShort(gd.gradeNum)} · ${gd.total} 节`,
        left: (gd.x / MAPW) * 100,
        top: (gd.y / MAPH) * 100,
        state: gd.door,
        isHere: nav.value.kind === 'grade' && nav.value.code === gd.grade,
        aria: `${gradeShort(gd.gradeNum)} 年级洞门，${doorStateWord(gd.door)}，共 ${gd.total} 节，已亮 ${gd.lit} 节`
      })
    }
    return out
  }
  for (const bk of books.value) {
    out.push({
      key: 'bk' + bk.code,
      kind: 'book',
      code: bk.code,
      branch: null,
      name: bk.name,
      short: `${gradeShort(bk.grade)} · ${bk.name.replace(/^人教版/, '')}`,
      left: (bk.x / MAPW) * 100,
      top: ((bk.y - 34) / MAPH) * 100,
      state: bk.textbook.reached ? 'summit' : 'climb',
      isHere: nav.value.kind === 'book' && nav.value.code === bk.code,
      aria: `人教版册 ${bk.name}，${gradeName(bk.grade)}，关联体系分支 ${bk.branchNames || '未标注'}`
    })
  }
  return out
})

const labelClass = (h) => ({
  'is-short': h.kind === 'book' || h.kind === 'depth' || h.kind === 'grade',
  'is-full': h.isHere || (nav.value.code === h.code)
})

function isSelected(h) {
  if (!nav.value.kind) return false
  return nav.value.kind === h.kind && nav.value.code === h.code
}
function onHotKey(event, index) {
  const { key } = event
  const n = hotspots.value.length
  if (!n) return
  if (key === 'Enter' || key === ' ') {
    event.preventDefault()
    pickHot(hotspots.value[index])
  } else if (key === 'ArrowRight' || key === 'ArrowDown') {
    event.preventDefault()
    focusHot((index + 1) % n)
  } else if (key === 'ArrowLeft' || key === 'ArrowUp') {
    event.preventDefault()
    focusHot((index + n - 1) % n)
  } else if (key === 'Home') {
    event.preventDefault()
    focusHot(0)
  } else if (key === 'End') {
    event.preventDefault()
    focusHot(n - 1)
  }
}
const focusedIndex = ref(-1)
const hotButtons = ref([])
/**
 * 把键盘焦点移到第 i 个热点（顺序键 Home/End/←→ 用）。
 * 坑：uni-app H5 把 `<button>` 编成组件，模板 ref 拿到的是**组件实例**而非真节点，
 * 直接 `.focus()` 会静默失败；真节点在实例的 `$el` 上，再兜一层 DOM 查询（按 data-hot-index）。
 */
function focusHot(i) {
  const n = hotspots.value.length
  if (!n) return
  focusedIndex.value = ((i % n) + n) % n
  let el = hotButtons.value[focusedIndex.value]
  if (el && el.$el) el = el.$el
  if (el && typeof el.focus === 'function') { el.focus(); return }
  const node = document.querySelector('[data-hot-index="' + focusedIndex.value + '"]')
  if (node && typeof node.focus === 'function') node.focus()
}

// ── 选中与详情 ───────────────────────────────────────────────────────────
function pickHot(h) {
  if (h.kind === 'grade') {
    pickGradeDoor(h.code)
    return
  }
  if (h.kind === 'peak' || h.kind === 'depth') selectPeak(h.branch, h.kind === 'depth' ? h.code : null)
  else selectBook(h.code)
}

/**
 * 点年级洞门（≤2 步进洞的第一步）：展开这一年级的节洞带，并把视野带到洞带。
 * nav 只标「当前洞门」，不换峰——「我在这」仍钉在同一座峰上（N1 不丢当前峰）。
 */
function pickGradeDoor(grade) {
  nav.value = { kind: 'grade', code: grade, branch: selectedPeakCode.value, peakOf: null }
  detailFor.value = null
  openGradeDoor(grade)
  if (typeof document !== 'undefined') {
    nextTick(() => {
      const el = document.querySelector('[data-band]')
      if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }
}

/** 关掉节洞带（回到「群山 → 一座峰」的宏观骨架）。 */
function closeBand() {
  bandGrade.value = null
  caveTarget.value = null
  if (nav.value.kind === 'grade') nav.value = { kind: null, code: null, branch: keptBranch.value, peakOf: null }
}

function selectPeak(code, depthCode) {
  const pl = peakLayout.value.find((x) => x.peak.code === code)
  if (!pl) return
  // 纯纵深节点：详情展开子分支本身，但「我在这」仍钉在它的父峰上（不换山）
  if (depthCode && (pl.peak.children || []).some((x) => x.code === depthCode)) {
    nav.value = { kind: 'depth', code: depthCode, branch: code, peakOf: null }
    keptBranch.value = code
    return
  }
  nav.value = { kind: 'peak', code, branch: code, peakOf: null }
  keptBranch.value = code
}

function selectBook(code) {
  const bk = books.value.find((b) => b.code === code)
  if (!bk) return
  nav.value = { kind: 'book', code, branch: bk.branches[0]?.code || null, peakOf: null }
}

function selectChapter(book, ch) {
  detailFor.value = { kind: 'chapter', book, ch }
}

/** 章的临时详情（列表里点开，不改变地图选中态）。 */
const detailFor = ref(null)

function closeDetail() {
  detailFor.value = null
  nav.value = { kind: null, code: null, branch: keptBranch.value, peakOf: null }
}

/**
 * 点遮罩空白处才关面板。
 * 坑：`@click.stop` 裸用在 uni-app H5 会被编译成空处理器（modifier 丢掉），卡内一点就把面板关了；
 * 故不论事件修饰符，直接按 target === currentTarget 判定「点的是不是遮罩本身」。
 */
function onMaskClick(event) {
  if (event.target === event.currentTarget) closeDetail()
}

/** 反向跳转：从册/章跳到体系分支（维度 A），或从峰跳到册（维度 B）。 */
function gotoBranch(code) {
  detailFor.value = null
  if (dim.value !== 'branches') dim.value = 'branches'
  // 纵深子分支：定位到它的父峰并在详情里展开子分支
  const parent = peakLayout.value.find((pl) => (pl.peak.children || []).some((c) => c.code === code))
  if (parent) selectPeak(parent.peak.code, parent.peak.code === code ? null : code)
  else selectPeak(code)
}
function gotoBook(code) {
  detailFor.value = null
  dim.value = 'grades'
  selectBook(code)
}

// ── 详情（由 nav / detailFor 派生，只读、不编造）─────────────────────────
const detail = computed(() => {
  if (detailFor.value?.kind === 'chapter') {
    const { book, ch } = detailFor.value
    // 章的延续性看它**归属的体系分支峰**在 K12 里的区间（不是册的年级）：
    // 册的年级只说明这章被哪一册收录，分支的 k12 区间才是「承接」的真源；
    // 该分支若为纯纵深（无 k12 区间）才落 else 文案。
    const branchPeak = ch.branch ? peaks.value.find((p) => p.code === ch.branch.code) : null
    return {
      kind: 'chapter',
      code: ch.code,
      title: ch.name,
      tag: '章',
      tagClass: 'green',
      clc: null,
      curriculum: ch.branch?.name || null,
      mastery: ch.mastery != null ? ch.mastery : null,
      summitNote: '该章暂无你的作答记录——练一练后这里会出现掌握度。',
      desc: '',
      gradeMin: branchPeak ? branchPeak.k12GradeMin : null,
      gradeMax: branchPeak ? branchPeak.k12GradeMax : null,
      kpCount: ch.kpCount,
      children: [],
      chapters: [],
      branches: ch.branch ? [ch.branch] : [],
      bookName: book ? book.name : '',
      stageName: book ? book.stageName : '',
      gradeName: book ? book.gradeName : ''
    }
  }
  if (nav.value.kind === 'book') {
    const bk = books.value.find((b) => b.code === nav.value.code)
    if (!bk) return null
    const t = bk.textbook
    return {
      kind: 'book',
      code: bk.code,
      title: t.name,
      tag: '人教版册',
      tagClass: 'green',
      clc: null,
      curriculum: bk.branches[0]?.name || null,
      mastery: t.mastery != null ? t.mastery : null,
      summitNote: '这一册暂无你的作答记录——练一练后这里会出现掌握度。',
      desc: '',
      gradeMin: bk.grade,
      gradeMax: bk.grade,
      kpCount: t.kpCount,
      children: [],
      chapters: bk.chapters,
      branches: bk.branches,
      bookName: bk.name,
      stageName: bk.stageName,
      gradeName: bk.gradeName,
      // 原始册（含 grade / gradeName / name / stageName）：章详情的「所属册」要取它，
      // 派生的详情对象字段名不同（title/bookName），别把派生对象当册传下去。
      rawBook: bk
    }
  }
  if (nav.value.kind === 'depth') {
    const host = peakLayout.value.find((pl) => (pl.peak.children || []).some((c) => c.code === nav.value.code))
    const c = host ? host.peak.children.find((x) => x.code === nav.value.code) : null
    if (!c) return null
    return {
      kind: 'depth',
      code: c.code,
      title: c.name,
      tag: '学科纵深',
      tagClass: '',
      clc: c.clc,
      curriculum: c.curriculum,
      mastery: c.mastery != null ? c.mastery : null,
      summitNote: '纯学科纵深节点——不在 K12 阶段范围内，故无 K12 承接。',
      desc: c.description || '',
      gradeMin: null,
      gradeMax: null,
      kpCount: c.kpCount,
      children: [],
      chapters: [],
      branches: [],
      bookName: '',
      stageName: '',
      gradeName: ''
    }
  }
  if (nav.value.kind === 'peak') {
    const pl = peakLayout.value.find((x) => x.peak.code === nav.value.code)
    if (!pl) return null
    const p = pl.peak
    return {
      kind: 'peak',
      code: p.code,
      title: p.name,
      tag: '学科分支峰',
      tagClass: 'green',
      clc: p.clc,
      curriculum: p.curriculum,
      mastery: p.mastery != null ? p.mastery : null,
      summitNote: `尚未开始——掌握度到 ${threshold.value} 即为这座峰登顶。`,
      desc: p.description || '',
      gradeMin: p.k12GradeMin,
      gradeMax: p.k12GradeMax,
      kpCount: p.kpCount,
      children: p.children || [],
      chapters: [],
      branches: [],
      bookName: '',
      stageName: '',
      gradeName: ''
    }
  }
  return null
})

function idlePct(d) {
  if (d.gradeMin == null) return 0
  return Math.max(0, ((d.gradeMin - 1) / 12) * 100)
}
function k12Pct(d) {
  if (d.gradeMin == null || d.gradeMax == null) return 0
  return Math.max(2, ((d.gradeMax - d.gradeMin + 1) / 12) * 100)
}
function depthPct(d) {
  if (d.gradeMax == null) return 100
  return Math.max(2, 100 - idlePct(d) - k12Pct(d))
}

const hereText = computed(() => {
  if (detail.value) return detail.value.title
  return `${knowledgeStore.subjectInfo?.name || '学科'} · ${gradeName(meGrade.value)}`
})

const mapAria = computed(() =>
  dim.value === 'branches'
    ? `学科知识体系登峰图：${peaks.value.length} 座分支峰沿年级海拔轴排布，当前 ${knowledgeStore.subjectInfo?.name || '学科'}`
    : `K12 阶段登峰图：学段→年级→人教版册，共 ${books.value.length} 册`
)
const mapNote = computed(() => {
  if (dim.value === 'district') {
    return chainReady.value
      ? `横 = 年级大道（K12）· 纵 = 街区（学科）· 楼门 = 知识点洞口（本窗 ${districtStorefronts.value.length} 间店 / ${kpDoorPoints.value.length} 扇门）`
      : '城区要等链取到才铺——不造假楼'
  }
  return dim.value === 'branches'
    ? chainReady.value
      ? `晨雾罩住未走到的一段 · 光脉已到 ${gradeShort(revealGradeNum.value)} · 走过与点亮的看得见（共 ${peaks.value.length} 座峰）`
      : `山脚 = 该分支 K12 起点 · 峰顶 = K12 终点 · 峰顶之上 = 学科纵深（共 ${peaks.value.length} 座峰）`
    : `营地 = 人教版册（共 ${books.value.length} 册）· 纵向是年级，横向是册与章`
})

// ── 切换 ─────────────────────────────────────────────────────────────────
function switchDim(code) {
  if (dim.value === code) return
  detailFor.value = null
  // v4：切维度收起洞带与洞内（洞是「学科知识体系」维度里的事）
  bandGrade.value = null
  caveTarget.value = null
  dim.value = code
  // N1：切维度不丢当前学科，也不丢当前峰——回到维度 A 时仍站在原来那座峰上。
  if (code === 'grades') {
    nav.value = { kind: null, code: null, branch: keptBranch.value || null, peakOf: null }
  } else {
    const code0 = keptBranch.value
    const hit = code0 && peakLayout.value.some((pl) => pl.peak.code === code0)
    nav.value = hit ? { kind: 'peak', code: code0, branch: code0, peakOf: null } : { kind: null, code: null, branch: null, peakOf: null }
    // 城区与学科峰共用同一条链：切进来即取（异地缓存命中时不重复取）。
    if (hit) loadChain(code0)
  }
  // v5：城区一进来就补当前窗口的 kpId（楼门是知识点洞口，"code→id" 不补则点不开门）
  if (code === 'district') nextTick(() => refreshWindowKpIds())
}

/** 城区当前窗口（前后各 2 个年级）的 code→id 补齐：与 ensureKpIds 同一读面，按需取。 */
async function refreshWindowKpIds() {
  if (dim.value !== 'district' || !chainReady.value) return
  const want = activeGrade.value ? activeGrade.value.gradeNum : (gradeList.value[0] ? gradeList.value[0].gradeNum : 1)
  const grades = new Set()
  for (const n of chainNodes.value) {
    const gn = gradeOf(n.grade)
    if (Math.abs(gn - want) <= 2) grades.add(gn)
  }
  for (const gn of grades) await ensureKpIds(gn)
}

function switchSubject(subj) {
  knowledgeStore.setSubject(subj)
  nav.value = { kind: null, code: null, branch: null, peakOf: null }
  detailFor.value = null
  keptBranch.value = null
  bandGrade.value = null
  caveTarget.value = null
  chainBranchLoaded = null
  loadMap(subj)
  loadSummit(subj)
}

function practiceHere(code) {
  practiceStore.startSession('topic', { subject: knowledgeStore.currentSubject, topicId: code })
  closeDetail()
  uni.switchTab({ url: '/pages/practice/index' })
}
function askTeacher() {
  detailFor.value = null
  uni.switchTab({ url: '/pages/chat/chat' })
}
function goGraph() {
  detailFor.value = null
  uni.switchTab({ url: '/pages/knowledge-graph/index' })
}
function goMemory() {
  uni.navigateTo({ url: '/pages/twin/memory' })
}

async function loadMap(subj) {
  await knowledgeStore.loadKnowledgeMap(subj || knowledgeStore.currentSubject)
}

// 掌握度跨越里程碑时给一次正反馈
watch(masteryAvg, (nv, ov) => {
  if (!(nv > ov)) return
  const hit = [25, 50, 75, 90].find((m) => ov < m && nv >= m)
  if (hit) uni.showToast({ title: `掌握度突破 ${hit}%！`, icon: 'none' })
})
// 切维度后重建焦点（热点集合变了）；洞带/洞内只属于「学科知识体系」维度
watch(dim, (d) => {
  focusedIndex.value = -1
  if (d !== 'branches') {
    bandGrade.value = null
    caveTarget.value = null
  }
})
// 峰集合就绪/换学科后：保证「我在这」永远钉在一座实际上存在的峰上（默认第一座）。
watch(peakLayout, (list) => {
  if (!list.length) return
  const cur = nav.value.branch
  if (cur && list.some((pl) => pl.peak.code === cur)) return
  const next = keptBranch.value && list.some((pl) => pl.peak.code === keptBranch.value)
    ? keptBranch.value
    : list[0].peak.code
  keptBranch.value = next
  nav.value = { kind: null, code: null, branch: next, peakOf: null }
  bandGrade.value = null
  caveTarget.value = null
})
// v4：换峰 → 取这一支的学习链（光脉/雾/洞门都从它来）
watch(selectedPeakCode, (code) => {
  bandGrade.value = null
  caveTarget.value = null
  if (code && dim.value === 'branches') loadChain(code)
})
// 光脉前沿抬升（雾退）时，给一次「雾散了一程」的正反馈（首帧取链不算推进，故先武装再报）
let lightToastArmed = false
watch(revealGradeNum, (nv, ov) => {
  if (!lightToastArmed || !ov || nv <= ov) return
  uni.showToast({ title: `光脉推进到 ${gradeShort(nv)} · 雾退一程`, icon: 'none' })
})

onMounted(async () => {
  await knowledgeStore.loadCatalog()
  await loadSelf()
  await Promise.all([loadMap(), loadSummit()])
  await nextTick()
  if (selectedPeakCode.value) await loadChain(selectedPeakCode.value)
  if (!twinStore.loaded) twinStore.loadOverview(knowledgeStore.currentSubject || 'math')
})

onShow(() => {
  loadSummit()
  if (selectedPeakCode.value) loadChain(selectedPeakCode.value, true)
  twinStore.loadOverview(knowledgeStore.currentSubject || 'math')
})

onBeforeUnmount(() => {
  focusedIndex.value = -1
})
</script>

<style scoped>
/* 世界面（页面内层）：颜色一律取世界令牌 —— 与人本世界同一套色（N1） */
.twin-page {
  color: var(--color-text-primary);
  padding-bottom: 40px;
  box-sizing: border-box;
}
.num { font-variant-numeric: tabular-nums; }

/* 布局：桌面双栏，移动单栏 */
.world-layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; }
@media (min-width: 940px) {
  .world-layout { grid-template-columns: minmax(0, 1fr) 300px; }
}
.col-main { min-width: 0; }
.col-side { display: flex; flex-direction: column; gap: 14px; min-width: 0; }

/* ── N1 维度切换（置顶）── */
.dim-switch {
  display: grid; grid-template-columns: 1fr 1fr; gap: 10px; align-items: stretch;
  padding: 8px; margin-bottom: 14px;
  background: var(--world-panel); border: 1px solid var(--world-node-border);
  border-radius: 16px; box-shadow: var(--shadow-card);
}
.dim-btn {
  display: flex; flex-direction: column; gap: 3px; align-items: flex-start;
  padding: 11px 14px; border-radius: 12px; margin: 0; line-height: 1.3;
  background: transparent; border: 1px solid transparent; text-align: left;
  transition: background 0.22s ease, border-color 0.22s ease;
}
.dim-btn::after { border: none; }
.dim-name { font-size: 14px; font-weight: 650; color: var(--world-node-sub); }
.dim-sub { font-size: 10px; color: var(--world-node-sub); opacity: 0.75; }
.dim-btn.active {
  background: var(--color-primary-light);
  border-color: var(--world-node-on-bg);
}
.dim-btn.active .dim-name { color: var(--world-node-on-bg); }
.dim-btn.active .dim-sub { color: var(--world-node-on-bg); opacity: 0.85; }
.dim-btn:focus-visible { outline: 2px solid var(--world-node-on-bg); outline-offset: 2px; }
.dim-note {
  grid-column: 1 / -1; font-size: 10px; color: var(--world-node-sub);
  padding: 0 6px; line-height: 1.7;
}

.subject-bar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.s-tab {
  border: 1px solid var(--world-node-border); background: var(--world-node-bg); border-radius: 999px;
  padding: 7px 14px; font-size: 12px; color: var(--world-node-text);
}
.s-tab.active { background: var(--world-node-on-bg); color: var(--world-node-on-text); border-color: var(--world-node-on-bg); }

/* 世界状态（N8：掌握度 / 登顶 / 经历 / 我在读） */
.world-status { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 16px; }
@media (min-width: 720px) { .world-status { grid-template-columns: repeat(4, 1fr); } }
.ws-cell {
  background: var(--world-panel); border: 1px solid var(--world-node-border); border-radius: 12px; padding: 13px 15px;
  box-shadow: var(--shadow-card);
}
.ws-label { display: block; font-size: 10px; color: var(--world-node-sub); }
.ws-value { display: block; font-size: 18px; font-weight: 650; margin-top: 4px; color: var(--world-node-text); }
.ws-unit { font-size: 11px; color: var(--world-node-sub); font-weight: 400; }
.ws-bar { height: 4px; margin-top: 8px; border-radius: 4px; background: var(--world-ring-track); overflow: hidden; }
.ws-fill { height: 100%; border-radius: 4px; background: var(--world-node-on-bg); transition: width 0.5s ease; }
.ws-fill.amber { background: var(--world-ring-learning); }

/* ── 登峰地图 ── */
.map-panel {
  background: var(--world-panel);
  border: 1px solid var(--world-node-border);
  border-radius: 16px;
  box-shadow: var(--shadow-card);
  overflow: hidden;
}
/* 窄屏：横向可滚，保证 12 级海拔刻度不被压扁 */
.map-scroll { width: 100%; overflow-x: auto; overflow-y: hidden; }
.map-scene { position: relative; width: 100%; min-width: 560px; aspect-ratio: 1200 / 820; }
.map-svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }

.map-legend {
  display: flex; flex-wrap: wrap; align-items: center; gap: 14px;
  padding: 11px 16px; border-top: 1px solid var(--world-node-border);
  background: var(--world-node-bg);
}

/* 空态兜底（覆盖在地图上，不遮住海拔轴读数） */
.scene-empty {
  position: absolute; left: 50%; bottom: 34px; transform: translateX(-50%);
  z-index: 7; width: max-content; max-width: min(420px, 78%);
  display: flex; flex-direction: column; gap: 7px; align-items: flex-start;
  padding: 15px 17px; border-radius: 14px;
  background: var(--world-panel); border: 1px dashed var(--world-node-border);
  box-shadow: var(--shadow-card);
}
.se-title { font-size: 13px; font-weight: 650; color: var(--world-node-text); }
.se-text { font-size: 11px; color: var(--world-node-sub); line-height: 1.8; }
.scene-empty .tbtn { margin-top: 3px; }
.ml-item { display: inline-flex; align-items: center; gap: 6px; font-size: 10px; color: var(--world-node-sub); }
.ml-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
.ml-dot.is-here { background: var(--world-marker); box-shadow: 0 0 0 3px var(--world-portrait-ring); }
.ml-dot.is-summit { background: var(--world-ring-mastered); }
.ml-swatch { width: 16px; height: 9px; border-radius: 3px; flex-shrink: 0; }
.ml-swatch.is-k12 { background: var(--world-band-k12); }
.ml-swatch.is-depth { background: var(--world-band-depth); }
.ml-note { margin-left: auto; font-size: 10px; color: var(--world-node-sub); }

/* v5（W6-a）城区读数：排在图例最前，独占一行（后面的 .ml-note 是 margin-left:auto，
   不换行的话会被挤到同一行右侧，读数就看不见了）。用 vs-* 同一族读数样式，
   不新开一套数字字号，让两个维度的一眼读数「同一种字」。 */
.ml-count {
  flex: 1 0 100%; display: flex; flex-wrap: wrap; align-items: center; gap: 14px;
  font-size: 10px; color: var(--world-node-text);
}
.ml-count .num { font-variant-numeric: tabular-nums; font-weight: 700; color: var(--world-node-lit); }

/* 热点（维度 A 的峰/纵深节点 + 维度 B 的册） */
.hot {
  position: absolute; transform: translate(-50%, -50%); z-index: 3;
  display: flex; flex-direction: column; align-items: center;
  padding: 0; margin: 0; background: transparent; border: none; overflow: visible; line-height: 1;
}
.hot::after { border: none; }
.hot-badge {
  position: relative; display: flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; border-radius: 50%;
  background: var(--world-node-bg);
  border: 1.5px solid var(--world-node-border);
  box-shadow: var(--world-node-shadow);
  will-change: transform;
  animation: hot-bob 5s ease-in-out infinite;
  animation-delay: var(--d, 0s);
  transition: transform 0.18s ease, background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}
.hot-glyph { width: 13px; height: 13px; color: var(--world-leaf-4); }
.hot-idle .hot-badge { border-color: var(--world-terrace-line); }
.hot-idle .hot-glyph { color: var(--world-node-sub); }
.hot-climb .hot-badge { background: var(--world-terrace-current); border-color: var(--world-node-on-bg); }
.hot-climb .hot-glyph { color: var(--world-node-on-bg); }
.hot-summit .hot-badge { border-color: var(--world-ring-mastered); box-shadow: 0 0 0 3px var(--world-portrait-ring), var(--world-node-shadow); }
.hot-summit .hot-glyph { color: var(--world-ring-mastered); }
.hot-depth .hot-badge { border-style: dashed; border-color: var(--world-band-depth-edge); }
.hot-depth .hot-glyph { color: var(--world-accent-cool); }
.hot.is-major .hot-badge { width: 28px; height: 28px; }
.hot.is-major .hot-glyph { width: 15px; height: 15px; }

/* ── v5（W6-a）一间店（= 一节）：屋顶形徽标，点它换楼前那排门 ── */
.shop-pin .hot-badge { width: 24px; height: 24px; border-radius: 5px; }
.shop-pin .hot-glyph { width: 12px; height: 12px; }

/* ── v5（W6-a）楼门（= 知识点洞口）：一排等距门，视觉同「门」不同「点」。三态与洞门三态同语义 ──
   定宽（不给 label 撑开）——门要「一排等距」，盒子一窄一宽就不成排了；label 自己截断。 */
.kp-door { width: 92px; }
.kp-door .hot-badge {
  width: 22px; height: 22px; border-radius: 4px 4px 9px 9px;
  border-width: 1.4px;
}
.kp-door .hot-glyph { width: 11px; height: 11px; }
.kp-lit .hot-badge { background: var(--world-storefront-lit); border-color: var(--world-node-lit); }
.kp-lit .hot-glyph { color: var(--world-node-text); }
.kp-half .hot-badge { background: var(--world-node-halo-half); border-color: var(--world-node-half); }
.kp-dim .hot-badge { border-style: dashed; border-color: var(--world-terrace-line); background: var(--world-node-bg); }
.kp-dim .hot-glyph { color: var(--world-node-sub); }
.kp-door .hot-label {
  max-width: 92px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* —— v5 大道里程碑（HTML 叠层；真源 = avenueMarks ← gradeX）—— */
.ave-mark { position: absolute; z-index: 2; transform: translate(-50%, -50%); }
.ave-mark-text {
  display: block; font-size: 9px; line-height: 1; color: var(--world-node-text);
  background: var(--world-node-bg); border: 1px solid var(--world-node-border);
  border-radius: 999px; padding: 2px 6px; white-space: nowrap;
}
.ml-swatch.is-road { background: var(--world-road); border: 1px solid var(--world-road-edge); }
.ml-swatch.is-shop { background: var(--world-storefront-top); border: 1px solid var(--world-storefront-right); }

.hot:hover .hot-badge { transform: translateY(-3px) scale(1.06); border-color: var(--world-ring-mastered); }
.hot:active .hot-badge { transform: scale(0.9); }
.hot:focus-visible { outline: 2px solid var(--world-node-on-bg); outline-offset: 2px; }
.hot.selected { z-index: 6; }
.hot.selected .hot-badge {
  background: var(--world-node-on-bg); border-color: var(--world-node-on-bg);
  box-shadow: 0 0 0 4px var(--world-node-border), var(--world-node-shadow);
  animation: hot-bob 5s ease-in-out infinite, sel-pulse 1.6s ease-in-out infinite;
}
.hot.selected .hot-glyph { color: var(--world-node-on-text); }
.hot-ring {
  position: absolute; inset: -5px; border-radius: 50%;
  border: 1.5px solid var(--world-node-on-bg);
  animation: hot-pulse 2.4s ease-out infinite;
}
.hot-label {
  margin-top: 3px; max-width: 104px; padding: 2px 6px;
  font-size: 9px; color: var(--world-node-text);
  background: var(--world-node-bg);
  border: 1px solid var(--world-node-border); border-radius: 5px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  box-shadow: var(--world-node-shadow);
}
.hot-label.is-short { font-size: 8px; opacity: 0.85; padding: 1px 5px; max-width: 92px; }
.hot-label.is-full { font-size: 9px; opacity: 1; }

@keyframes hot-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2.5px); } }
@keyframes hot-pulse { 0% { transform: scale(0.85); opacity: 0.7; } 100% { transform: scale(1.7); opacity: 0; } }
@keyframes sel-pulse {
  0%, 100% { box-shadow: 0 0 0 4px var(--world-node-border), var(--world-node-shadow); }
  50% { box-shadow: 0 0 0 7px var(--world-portrait-ring-2), var(--world-node-shadow); }
}

/* ═══════════════════════════════════════════════════════════════════════════
   v4（W5-b）黎明破晓 × 光脉传导：光脉读数 / 晨雾图注 / 洞门三态 / 节洞带
   颜色一律取世界令牌（零裸色，N2）；动效一律 CSS（不逐帧重建 DOM，N11）。
   ═══════════════════════════════════════════════════════════════════════════ */

/* —— 光脉读数（N9 信息密度；口径诚实：点亮 ≠ 掌握度）—— */
.v4-strip {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 16px;
}
@media (min-width: 720px) { .v4-strip { grid-template-columns: repeat(4, 1fr); } }
.vs-item {
  display: flex; flex-direction: column; gap: 3px;
  padding: 12px 15px; border-radius: 12px;
  background: var(--world-panel); border: 1px solid var(--world-node-border);
  box-shadow: var(--shadow-card);
}
.vs-key { font-size: 10px; color: var(--world-node-sub); }
.vs-val { font-size: 15px; font-weight: 650; color: var(--world-node-text); line-height: 1.5; }
.vs-sub { font-size: 11px; font-weight: 400; color: var(--world-node-sub); }
.vs-note { font-size: 10px; color: var(--world-node-sub); opacity: 0.85; line-height: 1.6; }
/* N6② 下一个最佳目标：呼吸提示（不是必须，只是「顺光走的那一段」） */
.vs-item.is-next {
  border-color: var(--world-edge-explicit);
  background: var(--world-cave-glow-half);
  animation: band-breathe 3.2s ease-in-out infinite;
}
@keyframes band-breathe {
  0%, 100% { box-shadow: var(--shadow-card); }
  50% { box-shadow: 0 0 0 3px var(--world-cave-glow-lit), var(--shadow-card); }
}

/* —— 图注新增项（雾 / 光脉 / 洞门）—— */
.ml-swatch.is-fog { background: var(--world-fog-near); border: 1px solid var(--world-node-border); }
.ml-swatch.is-light { background: var(--world-light-trail); }
.ml-dot.is-door { background: var(--world-cave-inner-half); box-shadow: 0 0 0 3px var(--world-cave-glow-half); }

/* —— 年级洞门三态（N6③ 暗门 / 半亮 / 亮灯）：与节洞位同一套三态语义 —— */
.hot-dim .hot-badge { border-style: dashed; border-color: var(--world-cave-step); background: var(--world-node-bg); }
.hot-dim .hot-glyph { color: var(--world-cave-inner-dim); }
.hot-half .hot-badge { background: var(--world-cave-glow-half); border-color: var(--world-node-half); }
.hot-half .hot-glyph { color: var(--world-band-start); }
.hot-lit .hot-badge {
  background: var(--world-cave-glow-lit); border-color: var(--world-node-lit);
  box-shadow: 0 0 0 3px var(--world-cave-glow-lit), var(--world-node-shadow);
}
.hot-lit .hot-glyph { color: var(--world-node-on-bg); }

/* —— 节洞带（M3 第一步：一节的洞位与节间的边）—— */
.band-panel {
  margin-top: 16px; background: var(--world-panel);
  border: 1px solid var(--world-node-border); border-radius: 16px;
  box-shadow: var(--shadow-card); overflow: hidden;
}
.band-head {
  display: flex; flex-wrap: wrap; align-items: center; gap: 10px;
  padding: 13px 16px; border-bottom: 1px solid var(--world-node-border);
}
.band-title { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.bt-main { font-size: 14px; font-weight: 650; color: var(--world-node-text); }
.bt-sub { font-size: 10px; color: var(--world-node-sub); line-height: 1.6; }
.band-door {
  font-size: 11px; padding: 3px 10px; border-radius: 999px; white-space: nowrap;
  background: var(--world-node-bg); color: var(--world-node-sub); border: 1px solid var(--world-node-border);
}
.band-door[data-band-door="lit"] { background: var(--world-cave-glow-lit); color: var(--world-node-text); border-color: var(--world-node-lit); }
.band-door[data-band-door="half"] { background: var(--world-cave-glow-half); border-color: var(--world-node-half); }

.band-scroll { width: 100%; overflow-x: auto; overflow-y: hidden; padding: 6px 0; }
.band-scene { position: relative; }
.band-svg { position: absolute; inset: 0; display: block; }

/* 洞位（HTML 叠层）：名字在洞位下方，三态随有效态走 */
.band-node {
  position: absolute; transform: translate(-50%, 26px); z-index: 3;
  display: flex; flex-direction: column; gap: 1px; align-items: center;
  width: 124px; padding: 4px 6px; margin: 0; line-height: 1.3;
  background: var(--world-node-bg); border: 1px solid var(--world-node-border);
  border-radius: 9px; box-shadow: var(--world-node-shadow);
}
.band-node::after { border: none; }
.bn-name { font-size: 10px; font-weight: 600; color: var(--world-node-text); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bn-sub { font-size: 8px; color: var(--world-node-sub); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.band-node.is-lit { border-color: var(--world-node-lit); background: var(--world-cave-glow-lit); }
.band-node.is-half { border-color: var(--world-node-half); }
.band-node:hover { transform: translate(-50%, 24px); border-color: var(--world-ring-mastered); }
.band-node:focus-visible { outline: 2px solid var(--world-node-on-bg); outline-offset: 2px; }
/* N6② 下一目标：呼吸，不闪烁 */
.band-node.is-next { border-color: var(--world-node-lit); animation: band-next 2.4s ease-in-out infinite; }
@keyframes band-next {
  0%, 100% { box-shadow: var(--world-node-shadow); }
  50% { box-shadow: 0 0 0 4px var(--world-node-halo-lit), var(--world-node-shadow); }
}

.band-legend {
  display: flex; flex-wrap: wrap; align-items: center; gap: 14px;
  padding: 11px 16px; border-top: 1px solid var(--world-node-border);
  background: var(--world-node-bg);
}
.bl-item { display: inline-flex; align-items: center; gap: 6px; font-size: 10px; color: var(--world-node-sub); }
.bl-line { width: 22px; height: 0; border-top-width: 2px; border-top-style: solid; flex-shrink: 0; }
.bl-line.is-explicit { border-top-color: var(--world-edge-explicit); }
.bl-line.is-seq { border-top-color: var(--world-edge-seq); }
.bl-line.is-soft { border-top-style: dashed; border-top-color: var(--world-edge-soft); }
.bl-note { flex: 1 1 100%; font-size: 10px; color: var(--world-node-sub); line-height: 1.7; }

/* 风景动效 */
.climber-fig { will-change: transform; animation: climber-bob 3.2s ease-in-out infinite; }
@keyframes climber-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }

/* ── 侧栏 ── */
.side-card {
  background: var(--world-panel); border: 1px solid var(--world-node-border);
  border-radius: 14px; padding: 16px; box-shadow: var(--shadow-card);
}
.side-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
.side-title { display: block; font-size: 13px; font-weight: 650; color: var(--world-node-text); }
.side-head .side-title { margin: 0; }
.side-hint { display: block; font-size: 10px; color: var(--world-node-sub); margin-top: 10px; line-height: 1.7; }

.outline { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; max-height: 420px; overflow-y: auto; }
.ol-group { display: flex; flex-direction: column; gap: 6px; }
.ol-group-title {
  display: block; font-size: 10px; font-weight: 650; color: var(--world-node-sub);
  margin: 8px 0 2px; letter-spacing: 0.04em;
}
.ol-row {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 8px; align-items: center;
  padding: 7px 10px; border-radius: 9px; margin: 0; text-align: left; line-height: 1.35;
  background: transparent; border: 1px solid transparent;
}
.ol-row::after { border: none; }
.ol-row.on { background: var(--color-primary-light); border-color: var(--world-node-on-bg); }
.ol-name { font-size: 12px; color: var(--world-node-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ol-sub { grid-column: 1 / -1; font-size: 10px; color: var(--world-node-sub); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ol-val { grid-row: 1; grid-column: 2; font-size: 10px; color: var(--world-node-sub); font-variant-numeric: tabular-nums; }
.ol-row.on .ol-val { color: var(--world-node-on-bg); }

.auth-rows { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
.auth-row { display: flex; flex-direction: column; gap: 2px; }
.auth-key { font-size: 10px; color: var(--world-node-sub); }
.auth-val { font-size: 11px; color: var(--world-node-text); line-height: 1.6; }

.mini-events { display: flex; flex-direction: column; gap: 12px; }
.mini-event { display: flex; gap: 11px; align-items: center; }
.me-icon {
  display: flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; background: var(--color-primary-light); border-radius: 9px; color: var(--color-primary); flex-shrink: 0;
}
.me-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.me-title { font-size: 12px; font-weight: 550; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--world-node-text); }
.me-sub { font-size: 10px; color: var(--world-node-sub); }
.me-time { font-size: 10px; color: var(--world-node-sub); white-space: nowrap; }
.world-notice { font-size: 10px; color: var(--world-node-sub); line-height: 1.9; padding: 0 4px; }

/* 通用按钮（与 W3 同款） */
.tag {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11px; padding: 3px 8px; border-radius: 5px;
  background: var(--world-node-bg); color: var(--world-node-sub); white-space: nowrap;
}
.tag.green { background: var(--color-primary-light); color: var(--color-primary); }
.tbtn {
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  border: 1px solid var(--world-node-border); border-radius: 9px;
  padding: 9px 14px; background: var(--world-node-bg);
  color: var(--world-node-text); font-size: 12px; font-weight: 550;
}
.tbtn.primary { background: var(--world-node-on-bg); color: var(--world-node-on-text); border-color: var(--world-node-on-bg); }
.tbtn.soft { background: var(--color-primary-light); border-color: transparent; color: var(--color-primary); }
.tbtn.ghost { background: transparent; border-color: transparent; padding: 6px 9px; }
.tbtn.sm { padding: 6px 10px; font-size: 12px; }
.tbtn.block { width: 100%; margin-top: 8px; }

/* ── 详情 ── */
.detail-mask {
  position: fixed; inset: 0; background: var(--world-scrim);
  display: flex; align-items: flex-end; justify-content: center; z-index: var(--z-modal);
}
.detail-card {
  width: 100%; max-width: 560px; max-height: 82vh; overflow-y: auto;
  padding: 20px 20px 28px; background: var(--world-panel);
  border-radius: 22px 22px 0 0; box-sizing: border-box;
}
.detail-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.detail-title { font-size: 19px; font-weight: 650; flex: 1; color: var(--world-node-text); }
.detail-close { font-size: 18px; color: var(--world-node-sub); padding: 4px 8px; }
.detail-desc { display: block; font-size: 12px; color: var(--world-node-sub); line-height: 1.9; margin-bottom: 12px; }

/* 权威锚点 */
.auth-chip {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 7px;
  padding: 10px 13px; margin-bottom: 12px; border-radius: 11px;
  background: var(--world-node-bg); border: 1px solid var(--world-node-border);
}
.auth-chip.soft { border-style: dashed; }
.ac-key { font-size: 10px; color: var(--world-node-sub); }
.ac-val { font-size: 14px; font-weight: 700; color: var(--world-node-on-bg); font-variant-numeric: tabular-nums; }
.ac-note { flex: 1 1 100%; font-size: 10px; color: var(--world-node-sub); }

.hero-metric { padding: 14px 16px; background: var(--world-node-bg); border: 1px solid var(--world-node-border); border-radius: 13px; margin-bottom: 14px; }
.hm-head { display: flex; align-items: baseline; justify-content: space-between; }
.hm-label { font-size: 12px; color: var(--world-node-sub); }
.hm-val { font-size: 26px; font-weight: 700; color: var(--world-node-on-bg); }
.hm-pct { font-size: 13px; font-weight: 500; margin-left: 1px; }
.hm-bar { height: 8px; margin-top: 8px; border-radius: 8px; background: var(--world-ring-track); overflow: hidden; }
.hm-fill { height: 100%; border-radius: 8px; background: linear-gradient(90deg, var(--world-ring-mastered), var(--world-leaf-3)); transition: width 0.5s ease; }
.hm-note { display: block; font-size: 10px; color: var(--world-node-sub); margin-top: 7px; }

/* 延续性刻度（本页灵魂：同一海拔即同一年级） */
.conti { padding: 13px 14px; margin-bottom: 14px; border-radius: 12px; background: var(--world-node-bg); border: 1px solid var(--world-node-border); }
.conti-label { display: block; font-size: 10px; color: var(--world-node-sub); margin-bottom: 9px; }
.conti-scale { display: flex; align-items: center; gap: 8px; }
.cs-end { font-size: 10px; color: var(--world-node-sub); white-space: nowrap; }
.cs-track { position: relative; flex: 1; height: 12px; border-radius: 6px; overflow: visible; display: flex; background: var(--world-ring-track); }
.cs-idle { height: 100%; border-radius: 6px 0 0 6px; background: var(--world-band-idle); }
.cs-k12 { height: 100%; background: var(--world-band-k12); }
.cs-depth { height: 100%; border-radius: 0 6px 6px 0; background: var(--world-band-depth); }
.cs-me { position: absolute; top: -4px; bottom: -4px; width: 2px; border-radius: 2px; background: var(--world-marker); }
.conti-note { display: block; font-size: 11px; color: var(--world-node-sub); line-height: 1.8; margin-top: 10px; }

.detail-rows { display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; }
.detail-row { display: flex; gap: 12px; font-size: 12px; }
.row-key { flex-shrink: 0; width: 96px; color: var(--world-node-sub); }
.row-val { flex: 1; color: var(--world-node-text); }

/* 反向对照（峰 ↔ 册） */
.cross { margin-bottom: 16px; }
.cross-label { display: block; font-size: 10px; color: var(--world-node-sub); margin-bottom: 8px; }
.chip-row { display: flex; flex-wrap: wrap; gap: 7px; }
.chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 6px 11px; border-radius: 999px; margin: 0; font-size: 11px;
  background: var(--world-node-bg); border: 1px solid var(--world-node-border); color: var(--world-node-text);
}
.chip::after { border: none; }
.chip.green { background: var(--color-primary-light); border-color: transparent; color: var(--color-primary); }
.chip-tag { font-size: 9px; color: var(--world-node-sub); }

.camp-list { display: flex; flex-direction: column; gap: 8px; }
.camp-chip {
  display: flex; align-items: center; gap: 10px;
  padding: 11px 14px; border-radius: 11px;
  background: var(--world-node-bg); border: 1px solid var(--world-node-border);
}
.camp-main { flex: 1; min-width: 0; }
.camp-name { display: block; font-size: 13px; font-weight: 550; color: var(--world-node-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.camp-sub { display: block; font-size: 10px; color: var(--world-node-sub); margin-top: 3px; }
.camp-chip .twin-ico { color: var(--world-node-sub); }

.action-list { display: flex; flex-direction: column; gap: 12px; }
.action-item { background: var(--world-node-bg); border: 1px solid var(--world-node-border); border-radius: 11px; padding: 14px; }
.ai-title { display: block; font-size: 13px; font-weight: 600; color: var(--world-node-text); }
.ai-desc { display: block; font-size: 11px; color: var(--world-node-sub); margin: 6px 0 0; line-height: 1.7; }

.safe-area { height: 30px; }

@media (max-width: 420px) {
  .ws-cell { padding: 11px 12px; }
  .ws-value { font-size: 16px; }
  .hot-badge { width: 20px; height: 20px; }
  .hot-glyph { width: 11px; height: 11px; }
  .hot-label { font-size: 8px; max-width: 78px; }
  .dim-name { font-size: 13px; }
  .dim-sub { font-size: 9px; }
  .vs-item { padding: 10px 12px; }
  .vs-val { font-size: 13px; }
  .band-node { width: 108px; }
}

@media (prefers-reduced-motion: reduce) {
  .hot-badge, .hot-ring, .climber-fig,
  .vs-item.is-next, .band-node.is-next { animation: none !important; }
}
</style>
