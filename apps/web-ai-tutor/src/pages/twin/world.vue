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
        <text class="dim-note">两个维度共用同一条年级海拔轴——切换不丢当前学科与当前峰</text>
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
                    <svg v-else class="hot-glyph" viewBox="0 0 24 24">
                      <path d="M12 3 3 20h18Z" fill="currentColor" />
                      <path d="M12 9 8 20h8Z" class="w-glyph-cut" opacity="0.7" />
                    </svg>
                  </span>
                  <text class="hot-label" :class="labelClass(h)">{{ h.short }}</text>
                </button>

                <!-- 维度 B 空态兜底（部分学科尚未发布人教版册；维度 A 对该学科仍是全覆盖的） -->
                <view v-if="dim === 'grades' && !books.length" class="scene-empty" data-scene-empty role="status">
                  <text class="se-title">该学科的 K12 册尚未收录</text>
                  <text class="se-text">学段台地已经铺开，但人教版册/章还没发布到这门学科——先看「学科知识体系」维度，它对学科知识是全覆盖的。</text>
                  <button class="tbtn sm" data-empty-to-branches @click="switchDim('branches')">回到学科知识体系</button>
                </view>
              </view>
            </view>

            <view class="map-legend">
              <text class="ml-item"><text class="ml-dot is-here" />我在这（年级海拔）</text>
              <text class="ml-item"><text class="ml-dot is-summit" />已登顶（旗 / 雪冠）</text>
              <text class="ml-item"><text class="ml-swatch is-k12" />K12 在读段</text>
              <text class="ml-item"><text class="ml-swatch is-depth" />学科纵深段</text>
              <text class="ml-note">{{ dim === 'branches' ? '点一座峰 → 看它的延续性与三件事' : '点一册书 → 看它属于哪些体系分支' }}</text>
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
import { ref, computed, watch, onMounted, onBeforeUnmount, h, defineComponent } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { useKnowledgeStore } from '@/store/knowledge'
import { usePracticeStore } from '@/store/practice'
import { useTwinStore } from '@/store/twin'
import { useUserStore } from '@/store/user'
import { useAuthStore } from '@gri/auth-client'
import EmptyState from '@/components/ui/EmptyState.vue'
import LoadingSkeleton from '@/components/ui/LoadingSkeleton.vue'
import { getActivationContext, getSummitBranches, getSummitGrades } from '@/api/index.js'
// 世界语言共享件（W3/W4-b）：外壳、人物画法、登峰世界的地形与峰/册/刻度画法都从同一份取——
// 峰、营地、海拔刻度一律出自 @gri/world-art，本页只做排布与状态，不另写一套画法。
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
  GRADE_TICKS
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
  { code: 'grades', name: 'K12 阶段', sub: '学段 · 年级 · 人教版册' }
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
  if (dim.value === 'branches') {
    // 先画「我走过的路」再画山体，让高亮压在路基层之上、山体之下
    if (climbedD.value) out.push({ k: 'path', c: 'w-climb', d: climbedD.value, w: 3.4, f: 'url(#glow)', o: 0.95 })
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
  'is-short': h.kind === 'book' || h.kind === 'depth',
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
  if (h.kind === 'peak' || h.kind === 'depth') selectPeak(h.branch, h.kind === 'depth' ? h.code : null)
  else selectBook(h.code)
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
const mapNote = computed(() =>
  dim.value === 'branches'
    ? `山脚 = 该分支 K12 起点 · 峰顶 = K12 终点 · 峰顶之上 = 学科纵深（共 ${peaks.value.length} 座峰）`
    : `营地 = 人教版册（共 ${books.value.length} 册）· 纵向是年级，横向是册与章`
)

// ── 切换 ─────────────────────────────────────────────────────────────────
function switchDim(code) {
  if (dim.value === code) return
  detailFor.value = null
  dim.value = code
  // N1：切维度不丢当前学科，也不丢当前峰——回到维度 A 时仍站在原来那座峰上。
  if (code === 'grades') {
    nav.value = { kind: null, code: null, branch: keptBranch.value || null, peakOf: null }
  } else {
    const code0 = keptBranch.value
    const hit = code0 && peakLayout.value.some((pl) => pl.peak.code === code0)
    nav.value = hit ? { kind: 'peak', code: code0, branch: code0, peakOf: null } : { kind: null, code: null, branch: null, peakOf: null }
  }
}

function switchSubject(subj) {
  knowledgeStore.setSubject(subj)
  nav.value = { kind: null, code: null, branch: null, peakOf: null }
  detailFor.value = null
  keptBranch.value = null
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
// 切维度后重建焦点（热点集合变了）
watch(dim, () => {
  focusedIndex.value = -1
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
  nav.value = { ...nav.value, branch: next }
})

onMounted(async () => {
  await knowledgeStore.loadCatalog()
  await loadSelf()
  await Promise.all([loadMap(), loadSummit()])
  if (!twinStore.loaded) twinStore.loadOverview(knowledgeStore.currentSubject || 'math')
})

onShow(() => {
  loadSummit()
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
}

@media (prefers-reduced-motion: reduce) {
  .hot-badge, .hot-ring, .climber-fig { animation: none !important; }
}
</style>
