<template>
  <view class="app">
    <!-- ─── 侧栏 ─── -->
    <view class="sidebar" :class="{ 'mobile-open': sidebarOpen }">
      <view class="brand">
        <view class="brand-mark">
          <svg viewBox="0 0 30 30" aria-hidden="true"><path d="M7 7L23 11L12 24Z" stroke="white" fill="none" stroke-width="1.4"/><g fill="white"><circle cx="7" cy="7" r="3"/><circle cx="23" cy="11" r="3"/><circle cx="12" cy="24" r="3"/></g></svg>
        </view>
        <view class="brand-copy"><view class="brand-title">智学慧眼</view><view class="brand-en">KNOWLEDGE ATLAS</view></view>
      </view>
      <view class="nav-caption">学习空间</view>
      <view class="nav-list">
        <button
          v-for="n in navItems"
          :key="n.id"
          class="nav-button"
          :class="{ active: page === n.id }"
          @click="showPage(n.id)"
        >
          <Ico :n="n.icon" /><span>{{ n.label }}</span>
        </button>
      </view>
      <view class="sidebar-bottom">
        <view class="side-note">
          <b>让知识连成网络</b>从一个知识点出发，<br />发现它的来处与去向。<br />
          <button style="color:#a5b4fc;font-size:12px;padding:10px 0 0" @click="openHelp">使用指南</button>
        </view>
        <view class="local-label"><Ico n="info" /><text>学习记录保存在本机</text></view>
      </view>
    </view>

    <!-- ─── 主体 ─── -->
    <view class="shell">
      <view class="topbar">
        <button class="icon-btn mobile-menu" aria-label="打开导航" @click="sidebarOpen = !sidebarOpen"><Ico n="menu" /></button>
        <view class="breadcrumb"><span>学习空间</span><span>/</span><strong>{{ pageMeta[page][0] }}</strong></view>
        <view class="top-actions">
          <view class="searchbox">
            <Ico n="search" class="search-ico" />
            <input v-model="searchQuery" autocomplete="off" placeholder="搜索知识点、概念或公式…" />
            <span class="search-key">/</span>
            <view v-if="searchQuery" class="search-results">
              <button v-for="r in searchResults" :key="r.id" class="search-item" @click="selectNode(r.id, true)">
                <Ico :n="iconName(r.subject)" />
                <span>{{ r.name }}<small>{{ subjectName(r.subject) }} · {{ groupNameOf(r) }}</small></span>
              </button>
              <view v-if="!searchResults.length" class="search-empty">没有找到相关知识点。</view>
            </view>
          </view>
          <view class="avatar" title="当前浏览器的个人学习空间">学</view>
          <span class="profile-label">我的学习空间</span>
        </view>
      </view>

      <main class="main">
        <view class="page-head">
          <view>
            <view class="eyebrow">{{ pageMeta[page][1] }}</view>
            <h1>{{ pageMeta[page][0] }}</h1>
            <view class="page-desc">{{ pageMeta[page][2] }}</view>
          </view>
          <view class="page-actions">
            <template v-if="page === 'graph'">
              <button class="btn primary" @click="planSelected"><Ico n="route" />规划学习路径</button>
            </template>
            <template v-else-if="page === 'library'">
              <button class="btn" @click="exportGraph"><Ico n="download" />导出图谱</button>
            </template>
            <template v-else-if="page === 'dashboard'">
              <button class="btn primary" @click="showPage('graph')"><Ico n="graph" />探索知识</button>
            </template>
          </view>
        </view>

        <!-- 学科 + 年级 -->
        <view class="subject-bar" v-if="page !== 'dashboard'">
          <view class="subjects">
            <button
              v-for="s in subjectsList"
              :key="s.key"
              class="subject"
              :class="{ active: currentKey === s.key }"
              @click="subjectChange(s.key)"
            >
              <Ico :n="s.icon" />{{ s.name }}
            </button>
          </view>
          <select class="scope-select" :value="String(knowledgeStore.currentGrade)" @change="onGradeChange">
            <option v-for="g in gradeOptions" :key="g" :value="String(g)">G{{ g }}</option>
          </select>
        </view>

        <!-- ═══ 图谱 ═══ -->
        <view v-if="page === 'graph'" class="split">
          <section>
            <view class="graph-panel" :class="{ expanded }">
              <view class="graph-toolbar">
                <view class="graph-title"><Ico n="graph" />{{ currentSubjectName }}知识网络 <small>{{ visibleNodes.length }} 个知识点 · {{ drawnEdges.length }} 条关系</small></view>
                <view style="display:flex;align-items:center;gap:9px">
                  <view class="segmented">
                    <button :class="{ active: view === 'network' }" @click="view = 'network'">图谱</button>
                    <button :class="{ active: view === 'list' }" @click="view = 'list'">列表</button>
                  </view>
                  <button class="icon-btn" @click="expanded = !expanded"><Ico :n="expanded ? 'close' : 'expand'" /></button>
                </view>
              </view>

              <view v-if="view === 'network'" class="canvas">
                <view class="canvas-top">
                  <select class="tag" :value="chapter" @change="onChapterChange">
                    <option value="all">全部领域</option>
                    <option v-for="d in layout.domains" :key="d.id" :value="d.id">{{ d.name }}</option>
                  </select>
                  <button class="tag" :class="{ 'focus-badge': focus }" @click="toggleFocus">{{ focus ? '显示全部知识' : '只看当前关联' }}</button>
                </view>
                <svg class="graph-svg" :viewBox="viewBox" @wheel.prevent="onWheel" @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="endGesture" @pointerleave="endGesture">
                  <defs>
                    <marker id="arrow-pre" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="#afb6d6" /></marker>
                    <marker id="arrow-active" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="#8675d9" /></marker>
                  </defs>
                  <g :transform="worldTransform">
                    <g pointer-events="none">
                      <ellipse v-for="d in layout.domains" :key="d.id" :cx="d.x" :cy="d.y" :rx="d.rx" :ry="d.ry" :fill="domainColor(d.id).tint" opacity="0.5" />
                      <text v-for="d in layout.domains" :key="'t' + d.id" :x="d.x" :y="d.y - d.ry + 16" text-anchor="middle" :fill="domainColor(d.id).color" font-size="14" font-weight="500">{{ d.name }}</text>
                    </g>
                    <g v-for="e in drawnEdges" :key="e.source + e.target" class="graph-edge" :opacity="edgeOpacity(e)">
                      <path :d="edgePath(e)" fill="none" :stroke="edgeColor(e)" :stroke-width="isActiveEdge(e) ? 2 : 1.3" marker-end="url(#arrow-pre)" />
                    </g>
                    <g
                      v-for="n in placedNodes"
                      :key="n.id"
                      class="graph-node"
                      :class="{ selected: n.id === selectedId }"
                      :transform="`translate(${n.x} ${n.y})`"
                      @click="selectNode(n.id)"
                    >
                      <circle v-if="n.id === selectedId" r="56" fill="#eeeaff" opacity="0.65" />
                      <circle v-if="n.id === selectedId" r="49" fill="none" stroke="#d4cbff" stroke-width="1" />
                      <template v-if="masteryOf(n.id) > 0">
                        <circle :r="n.r + 5" fill="none" stroke="#e3e8f2" stroke-width="2" />
                        <circle :r="n.r + 5" fill="none" stroke="#27a28b" stroke-width="2" :stroke-dasharray="`${2 * Math.PI * (n.r + 5) * masteryOf(n.id) / 100} ${2 * Math.PI * (n.r + 5)}`" transform="rotate(-90)" />
                      </template>
                      <circle class="node-disc" :r="n.r" :fill="n.id === selectedId ? '#7b64d7' : domainColor(n.domainId).tint" :stroke="n.id === selectedId ? '#7b64d7' : domainColor(n.domainId).color" :stroke-opacity="n.id === selectedId ? 1 : 0.38" :stroke-width="n.id === selectedId ? 2 : 1.4" />
                      <text class="glyph" text-anchor="middle" dominant-baseline="central" :fill="n.id === selectedId ? 'white' : domainColor(n.domainId).color" :style="n.id === selectedId ? 'font-size:28px' : ''">{{ n.glyph }}</text>
                      <text class="node-name" text-anchor="middle" :y="n.r + 26">{{ n.name }}</text>
                    </g>
                  </g>
                </svg>
                <view class="canvas-help">点击知识点查看详情 · 拖动空白移动 · 滚轮缩放</view>
                <view class="canvas-control">
                  <button class="icon-btn" @click="zoomBy(0.85)"><Ico n="minus" /></button>
                  <span>{{ Math.round(zoom * 100) }}%</span>
                  <button class="icon-btn" @click="zoomBy(1.18)"><Ico n="plus" /></button>
                  <button class="icon-btn" @click="resetView"><Ico n="fit" /></button>
                </view>
              </view>

              <view v-else class="graph-list">
                <button v-for="n in visibleNodes" :key="n.id" class="knowledge-list-item" @click="selectNode(n.id)">
                  <span class="node-icon" :style="{ '--color': domainColor(n.domainId).color, '--tint': domainColor(n.domainId).tint }">{{ n.glyph }}</span>
                  <span><strong>{{ n.name }}</strong><small>{{ currentSubjectName }} · {{ groupNameOf(n) }}</small></span>
                  <span class="pill" :class="pillClass(n.id)">{{ status(n.id) }}</span>
                </button>
              </view>

              <view class="graph-footer">
                <span v-for="d in layout.domains.slice(0, 8)" :key="d.id" class="legend"><span class="legend-dot" :style="{ '--color': domainColor(d.id).color }" />{{ d.name }}</span>
                <view class="relation-checks">
                  <label><input type="checkbox" checked disabled />先修</label>
                  <label style="opacity:.45"><input type="checkbox" disabled />关联</label>
                  <label style="opacity:.45"><input type="checkbox" disabled />应用</label>
                </view>
              </view>
            </view>

            <view class="insight-strip">
              <view class="mini-stat"><view class="stat-icon"><Ico n="book" /></view><view><strong>{{ subjectStats.total }}</strong><small>个</small><p>学科知识点</p></view></view>
              <view class="mini-stat"><view class="stat-icon" style="background:#e9f7f3;color:#1f9e80"><Ico n="check" /></view><view><strong>{{ subjectStats.mastered }}</strong><small>/ {{ subjectStats.total }}</small><p>已掌握知识点</p></view></view>
              <view class="mini-stat"><view class="stat-icon" style="background:#fff5e7;color:#d99836"><Ico n="chart" /></view><view><strong>{{ subjectStats.coverage }}</strong><small>%</small><p>学习覆盖率</p></view></view>
            </view>
          </section>

          <aside>
            <section class="detail">
              <view class="detail-heading">
                <view class="detail-top">
                  <span class="detail-badge">{{ subjectName(selectedNode.subject) }} · {{ groupNameOf(selectedNode) }}</span>
                  <button class="icon-btn bookmark" :class="{ active: isBookmarked(selectedNode.id) }" @click="toggleBookmark(selectedNode)"><Ico n="bookmark" /></button>
                </view>
                <h2>{{ selectedNode.name }}</h2>
                <view class="detail-sub">核心知识点 · 建议学习 {{ minutesOf(selectedNode) }} 分钟</view>
              </view>
              <view class="detail-tabs">
                <button v-for="t in detailTabs" :key="t.key" :class="{ active: tab === t.key }" @click="switchTab(t.key)">{{ t.label }}</button>
              </view>
              <view class="detail-body">
                <!-- 知识讲解 -->
                <template v-if="tab === 'concept'">
                  <view class="section-label">概念理解</view>
                  <p>{{ selectedNode.description || '暂无简介。' }}</p>
                  <view v-if="selectedNode.formula" class="formula">{{ selectedNode.formula }}</view>
                  <view class="section-label">建议先学 <span style="font-weight:400;color:#9ba6b8;font-size:12px">{{ prereqList.length }} 个知识点</span></view>
                  <template v-if="prereqList.length">
                    <button v-for="p in prereqList" :key="p.id" class="relation-pill" @click="selectNode(p.id)">{{ p.name }}</button>
                  </template>
                  <span v-else class="empty-small">基础知识点，可以从这里开始。</span>
                  <view class="progress-block">
                    <view class="progress-label"><span>我的掌握度</span><strong>{{ masteryOf(selectedNode.id) }}%</strong></view>
                    <view class="progress-track"><view class="progress-fill" :style="{ width: masteryOf(selectedNode.id) + '%' }" /></view>
                    <view class="mastery-control">
                      <button v-for="m in masteryOptions" :key="m.v" :class="{ active: currentBucket === m.v }" @click="setMastery(selectedNode.id, m.v)">{{ m.label }}</button>
                    </view>
                  </view>
                  <view class="section-label">我的笔记</view>
                  <textarea class="note-input" v-model="noteDraft" placeholder="记下你的理解或疑问…" />
                  <button class="btn small" style="margin-top:8px" @click="saveNote(selectedNode.id)">保存笔记</button>
                </template>

                <!-- 知识关系 -->
                <template v-else-if="tab === 'relations'">
                  <view class="relation-group"><strong>先修知识 · {{ prereqList.length }}</strong>
                    <template v-if="prereqList.length"><button v-for="p in prereqList" :key="p.id" class="relation-pill" @click="selectNode(p.id)">{{ p.name }}</button></template>
                    <span v-else class="empty-small">暂无先修知识。</span>
                    <small>这些知识有助于理解当前知识点。</small>
                  </view>
                  <view class="relation-group"><strong>后续知识 · {{ dependentList.length }}</strong>
                    <template v-if="dependentList.length"><button v-for="p in dependentList" :key="p.id" class="relation-pill" @click="selectNode(p.id)">{{ p.name }}</button></template>
                    <span v-else class="empty-small">暂无后续知识。</span>
                  </view>
                  <view class="relation-group"><strong>同章关联 · {{ siblingList.length }}</strong>
                    <template v-if="siblingList.length"><button v-for="p in siblingList.slice(0, 12)" :key="p.id" class="relation-pill" @click="selectNode(p.id)">{{ p.name }}</button></template>
                    <span v-else class="empty-small">同章暂无其他知识点。</span>
                  </view>
                  <view class="relation-group"><strong>应用 / 跨学科</strong><span class="empty-small">暂无人工标注的「应用/跨学科」关系（现有数据仅含先修依赖）。</span></view>
                  <button class="btn primary full" style="margin-top:4px" @click="planSelected"><Ico n="route" />生成先修路径</button>
                </template>

                <!-- 随堂练习 -->
                <template v-else>
                  <template v-if="quizQuestion">
                    <span class="tag">基础理解 · 单选题</span>
                    <view class="question" style="margin-top:14px">{{ quizQuestion.content }}</view>
                    <button
                      v-for="(o, i) in quizOptions"
                      :key="i"
                      class="answer-option"
                      :class="{ picked: quizPicked === i, correct: quizFeedback && i === quizAnswerIndex, wrong: quizFeedback && quizPicked === i && i !== quizAnswerIndex }"
                      :disabled="quizFeedback"
                      @click="quizPicked = i"
                    >
                      <span class="answer-letter">{{ 'ABCD'[i] }}</span><span>{{ o }}</span>
                    </button>
                    <button v-if="!quizFeedback" class="btn primary full" style="margin-top:14px" :disabled="quizPicked === null" @click="submitQuiz">检查答案</button>
                    <template v-else>
                      <view class="answer-feedback">
                        <b :style="{ color: quizPicked === quizAnswerIndex ? '#19866e' : '#ce6c42' }">{{ quizPicked === quizAnswerIndex ? '回答正确，理解又前进了一步。' : '再看看这个知识点。' }}</b>
                        {{ quizQuestion.analysis || '' }}
                      </view>
                      <button class="btn full" style="margin-top:12px" @click="retryQuiz">重新练习</button>
                    </template>
                  </template>
                  <template v-else>
                    <view class="empty-state">
                      <Ico n="edit" />
                      <h3>{{ quizLoading ? '正在加载练习…' : '该知识点暂无选择题' }}</h3>
                      <p style="margin:0 0 12px">到练习中心按本知识点出题。</p>
                      <button class="btn primary" @click="practiceSelected">去练习中心</button>
                    </view>
                  </template>
                </template>
              </view>
            </section>
            <view class="tip-card"><b><Ico n="info" />知识点之间，藏着学习顺序</b><p>实线箭头表示建议的先修顺序。点击「规划学习路径」，查看基础知识链。</p></view>
          </aside>
        </view>

        <!-- ═══ 学习路径 ═══ -->
        <view v-else-if="page === 'path'" class="path-layout">
          <section class="card">
            <view class="section-head"><h2>选择一个学习目标</h2><span class="tag">基于先修关系</span></view>
            <view class="path-form">
              <view>
                <label class="field-label">我想学会</label>
                <select class="field" :value="pathGoalId" @change="onGoalChange">
                  <option v-for="n in allKps" :key="n.id" :value="n.id">{{ n.name }}</option>
                </select>
              </view>
              <button class="btn primary" @click="generatePath"><Ico n="route" />生成学习路径</button>
            </view>
            <template v-if="pathSteps.length">
              <view class="path-summary">
                <view><h3>抵达「{{ goalName }}」</h3><p>{{ pathSteps.length }} 个知识点 · {{ pathMastered }} 个已掌握 · {{ pathTodo }} 个待学习</p></view>
                <view style="text-align:right"><strong>{{ pathTodo * 10 }}<span style="font-size:12px;font-weight:400"> 分钟</span></strong><p>建议学习时长</p></view>
              </view>
              <ol class="steps">
                <li v-for="(s, i) in pathSteps" :key="s.id" class="step" :class="{ complete: masteryOf(s.id) >= 80 }">
                  <view class="step-number">{{ masteryOf(s.id) >= 80 ? '✓' : String(i + 1).padStart(2, '0') }}</view>
                  <view class="step-body" :class="{ 'step-goal': s.isGoal }">
                    <view>
                      <h3>{{ s.name }}<span v-if="s.isGoal" class="tag purple">目标</span></h3>
                      <p>G{{ s.gradeLevel || '-' }} · {{ s.chapterName || '未分章' }} · {{ status(s.id) }}</p>
                    </view>
                    <button class="btn small" :class="{ soft: masteryOf(s.id) < 80 }" @click="practiceById(s.id)">{{ masteryOf(s.id) >= 80 ? '复习' : '开始学习' }}</button>
                  </view>
                </li>
              </ol>
            </template>
            <view v-else-if="pathLoading" class="empty-state"><h3>正在计算先修路径…</h3></view>
            <view v-else class="dependency-legend"><Ico n="info" />输入或选择一个目标知识点，系统会追溯它的全部直接与间接先修知识，按建议顺序排列。</view>
          </section>
          <aside>
            <view class="card">
              <view class="section-head"><h2>为什么这样学？</h2><Ico n="graph" /></view>
              <view class="path-notes">
                <p>「<b>{{ goalName }}</b>」的直接先修知识是：</p>
                <template v-if="goalDirectPre.length"><p v-for="p in goalDirectPre" :key="p.id"><button class="relation-pill" @click="selectNode(p.id, true)">{{ p.name }}</button></p></template>
                <p v-else>这是一个基础知识点，无需先完成其他节点。</p>
                <p style="margin-top:18px">系统会继续向前追溯基础知识、合并重复节点，再安排到学习目标之前。</p>
                <p>绿色步骤表示当前掌握度已达 80%，可先复习再继续。</p>
              </view>
            </view>
            <view class="tip-card"><b><Ico n="target" />理解比完成更重要</b><p>时长用于安排学习节奏。练习结果只是参考，你可以按实际理解程度调整掌握度。</p></view>
          </aside>
        </view>

        <!-- ═══ 知识库 ═══ -->
        <view v-else-if="page === 'library'" class="card">
          <view class="library-tools">
            <input class="field" v-model="libraryQuery" placeholder="搜索当前学科知识…" />
            <select class="field" :value="libraryGroup" @change="libraryGroup = $event.target.value">
              <option value="all">全部领域</option>
              <option v-for="d in layout.domains" :key="d.id" :value="d.id">{{ d.name }}</option>
            </select>
            <select class="field" :value="libraryStatus" @change="libraryStatus = $event.target.value">
              <option value="all">全部状态</option>
              <option value="new">未开始</option>
              <option value="started">学习中</option>
              <option value="good">已掌握</option>
              <option value="saved">已收藏</option>
            </select>
          </view>
          <view class="table-wrap">
            <table class="table">
              <thead><tr><th>知识点</th><th>知识领域</th><th>先修 / 后续</th><th>掌握情况</th><th>操作</th></tr></thead>
              <tbody>
                <tr v-for="n in libraryRows" :key="n.id">
                  <td><button class="table-name" @click="selectNode(n.id, true)">{{ n.name }}</button><span v-if="isBookmarked(n.id)" style="color:#d59b39;margin-left:6px">★</span></td>
                  <td>{{ groupNameOf(n) }}</td>
                  <td>{{ prereqCount(n.id) }} / {{ dependentCount(n.id) }}</td>
                  <td><view class="table-progress"><view class="progress-track"><view class="progress-fill" :style="{ width: masteryOf(n.id) + '%' }" /></view><span style="font-size:12px">{{ masteryOf(n.id) }}%</span></view></td>
                  <td><button class="table-action" @click="selectNode(n.id, true)">查看</button></td>
                </tr>
                <tr v-if="!libraryRows.length"><td colspan="5"><view class="empty-state"><h3>没有匹配的知识点</h3>试试其他关键词或调整筛选条件。</view></td></tr>
              </tbody>
            </table>
          </view>
          <view class="library-total">{{ libraryRows.length }} 个知识点 · 数据来自 K12 课程体系；关系为先修依赖。</view>
        </view>

        <!-- ═══ 学习概览 ═══ -->
        <template v-else>
          <view class="dashboard-grid">
            <view class="card dash-stat"><small>已掌握知识</small><strong>{{ subjectStats.mastered }}</strong><p>共 {{ subjectStats.total }} 个知识点</p></view>
            <view class="card dash-stat"><small>学习覆盖率</small><strong>{{ subjectStats.coverage }}%</strong><p>已开始 {{ subjectStats.mastered + subjectStats.learning + subjectStats.weak }} 个</p></view>
            <view class="card dash-stat"><small>我的收藏</small><strong>{{ knowledgeStore.bookmarks.length }}</strong><p>个知识点已收藏</p></view>
            <view class="card dash-stat"><small>探索足迹</small><strong>{{ knowledgeStore.visits.length }}</strong><p>最近浏览记录</p></view>
          </view>
          <view class="dash-columns">
            <section class="card">
              <view class="section-head"><h2>学科掌握情况</h2><small>{{ currentSubjectName }} · 各年级数据按需加载</small></view>
              <view v-for="s in subjectsList" :key="s.key" class="subject-progress-row">
                <view class="subject-symbol">{{ s.symbol }}</view>
                <view class="subject-progress-info">
                  <div><button @click="subjectChange(s.key); showPage('graph')">{{ s.name }}</button><span>{{ s.key === currentKey ? subjectStats.mastered + '/' + subjectStats.total + ' 已掌握 · ' + subjectStats.avg + '%' : '点击查看' }}</span></div>
                  <view class="progress-track"><view class="progress-fill" :style="{ width: (s.key === currentKey ? subjectStats.avg : 0) + '%' }" /></view>
                </view>
              </view>
            </section>
            <section class="card">
              <view class="section-head"><h2>建议再巩固</h2><small>按掌握度</small></view>
              <template v-if="weakPoints.length"><view v-for="n in weakPoints" :key="n.id" class="recent-item"><button @click="selectNode(n.id, true)">{{ n.name }}</button><span>{{ subjectName(n.subject) }}</span></view></template>
              <view v-else class="empty-state"><Ico n="target" /><h3>还没有待巩固知识</h3>做几道练习，找到需要补齐的理解。</view>
            </section>
            <section class="card">
              <view class="section-head"><h2>最近探索</h2><small>当前浏览器记录</small></view>
              <template v-if="knowledgeStore.visits.length"><view v-for="v in knowledgeStore.visits.slice(0, 6)" :key="v.id" class="recent-item"><Ico n="time" /><button @click="selectNode(v.id, true)">{{ v.name }}</button><span>{{ fmtDate(v.at) }}</span></view></template>
              <view v-else class="empty-state"><Ico n="graph" /><h3>从一个知识点开始</h3>在图谱中打开知识点，这里会留下足迹。</view>
            </section>
            <section class="card">
              <view class="section-head"><h2>我的收藏</h2><small>{{ knowledgeStore.bookmarks.length }} 个知识点</small></view>
              <template v-if="knowledgeStore.bookmarkList.length"><view v-for="n in knowledgeStore.bookmarkList" :key="n.id" class="recent-item"><button @click="selectNode(n.id, true)">{{ n.name }}</button><span>{{ subjectName(n.subject) }}</span></view></template>
              <view v-else class="empty-state"><Ico n="bookmark" /><h3>留住想继续探索的知识</h3>点击知识卡片右上角的收藏按钮。</view>
            </section>
          </view>
        </template>

        <view class="footer"><span>智学慧眼 · 知识图谱</span><span>K1–K12 全学科 · 本体驱动</span></view>
      </main>
    </view>

    <!-- 帮助弹窗 -->
    <view v-if="helpOpen" class="modal-backdrop" @click.self="helpOpen = false">
      <section class="modal">
        <header class="modal-head"><h2>使用指南</h2><button class="icon-btn" @click="helpOpen = false"><Ico n="close" /></button></header>
        <view class="modal-body path-notes">
          <p><b>1. 探索知识网络</b><br />切换学科与年级，点击图谱中的知识点。拖动空白移动视角，滚轮缩放。点击「只看当前关联」聚焦邻近知识。</p>
          <p><b>2. 理解知识关系</b><br />先修关系表示建议的学习顺序，来自 K12 本体的先修依赖。它们不代表教材的唯一授课顺序。</p>
          <p><b>3. 沿着路径学习</b><br />选择目标，系统追溯全部先修知识，按顺序去重。已掌握的知识可复习后跳过。</p>
          <p><b>4. 留下学习记录</b><br />调整掌握度、写笔记、收藏。记录保存在当前浏览器；可在知识库导出备份。</p>
        </view>
        <footer class="modal-foot"><button class="btn primary" @click="helpOpen = false">开始探索</button></footer>
      </section>
    </view>
  </view>
</template>

<script>
import { ref, computed, watch, onMounted, h } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useKnowledgeStore } from '@/store/knowledge'
import { usePracticeStore } from '@/store/practice'
import { buildDomainLayout } from '@/utils/graphLayout.js'
import { getKpQuestions } from '@/api/index.js'
import { buildExportPayload, downloadJson } from '@/utils/knowledgeExport.js'

const ICONS = {
  graph: '<circle cx="5" cy="6" r="2.5"/><circle cx="18" cy="5" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M7.5 6L15.5 5M6 8.5L10.5 15.5M16.8 7.5L13.4 15.5"/>',
  route: '<circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 5h7a4 4 0 010 8H9a4 4 0 000 8h8"/>',
  book: '<path d="M12 6c-3-3-7-3-10-2v15c3-1 7-1 10 2 3-3 7-3 10-2V4c-3-1-7-1-10 2Z"/><path d="M12 6v15"/>',
  chart: '<path d="M4 3v18h17M9 16v-5M14 16V7M19 16v-9"/>',
  search: '<circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6"/>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4Z"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  fit: '<path d="M9 3H3v6M15 3h6v6M3 15v6h6M21 15v6h-6"/>',
  expand: '<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6"/>',
  edit: '<path d="m16 3 5 5-12 12-6 1 1-6Z"/><path d="m13 6 5 5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v.1"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  time: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>'
}
const Ico = {
  name: 'Ico',
  props: { n: { type: String, default: 'graph' } },
  render() {
    return h('svg', {
      class: 'icon',
      viewBox: '0 0 24 24',
      'aria-hidden': 'true',
      innerHTML: ICONS[this.n] || ICONS.graph
    })
  }
}

const SUBJECT_META = {
  math: { icon: 'graph', symbol: 'ƒ', name: '数学' },
  phys: { icon: 'target', symbol: 'F', name: '物理' },
  chem: { icon: 'graph', symbol: 'H₂', name: '化学' },
  bio: { icon: 'graph', symbol: 'DNA', name: '生物' },
  chn: { icon: 'book', symbol: '文', name: '语文' },
  eng: { icon: 'book', symbol: 'A', name: '英语' }
}
const PALETTE = [
  { color: '#4f46e5', tint: '#eef0ff' },
  { color: '#2da897', tint: '#eaf8f5' },
  { color: '#d98220', tint: '#fff6e7' },
  { color: '#7861d6', tint: '#f1edff' },
  { color: '#4982d7', tint: '#edf4ff' },
  { color: '#d95f8a', tint: '#fdeef4' },
  { color: '#5b9b3f', tint: '#eef8e9' },
  { color: '#c96a3f', tint: '#fdf0ea' }
]

export default {
  name: 'KnowledgeGraph',
  components: { Ico },
  setup() {
    const knowledgeStore = useKnowledgeStore()
    const practiceStore = usePracticeStore()

    const pageMeta = {
      graph: ['知识图谱', 'KNOWLEDGE EXPLORER', '从知识的连接中，找到你的学习方向。'],
      path: ['学习路径', 'LEARNING PATHWAYS', '先补齐基础，再抵达目标知识。'],
      library: ['知识库', 'KNOWLEDGE LIBRARY', '整理概念与关系，构建自己的知识网络。'],
      dashboard: ['学习概览', 'MY LEARNING', '看见每一次理解，也看见下一步方向。']
    }
    const navItems = [
      { id: 'graph', icon: 'graph', label: '知识图谱' },
      { id: 'path', icon: 'route', label: '学习路径' },
      { id: 'library', icon: 'book', label: '知识库' },
      { id: 'dashboard', icon: 'chart', label: '学习概览' }
    ]
    const detailTabs = [
      { key: 'concept', label: '知识讲解' },
      { key: 'relations', label: '知识关系' },
      { key: 'quiz', label: '随堂练习' }
    ]
    const masteryOptions = [
      { v: 0, label: '未开始' },
      { v: 40, label: '学习中' },
      { v: 80, label: '基本掌握' },
      { v: 100, label: '熟练' }
    ]

    // ── state ──
    const page = ref('graph')
    const sidebarOpen = ref(false)
    const selectedId = ref('')
    const tab = ref('concept')
    const view = ref('network')
    const focus = ref(false)
    const chapter = ref('all')
    const expanded = ref(false)
    const searchQuery = ref('')
    const noteDraft = ref('')
    const helpOpen = ref(false)
    const zoom = ref(1)
    const panX = ref(0)
    const panY = ref(0)
    const quizQuestion = ref(null)
    const quizLoading = ref(false)
    const quizPicked = ref(null)
    const quizFeedback = ref(false)
    const pathGoalId = ref('')
    const libraryQuery = ref('')
    const libraryGroup = ref('all')
    const libraryStatus = ref('all')

    // ── 学科 ──
    const subjectsList = computed(() =>
      knowledgeStore.subjectList.map((s) => {
        const key = String(s.id || s.code || '').toLowerCase()
        const meta = SUBJECT_META[key] || { icon: 'book', symbol: '•', name: s.name }
        return { key, code: s.id || s.code, name: meta.name || s.name, icon: meta.icon, symbol: meta.symbol }
      })
    )
    const currentKey = computed(() => String(knowledgeStore.currentSubject || 'math').toLowerCase())
    const currentSubjectName = computed(() => subjectsList.value.find((s) => s.key === currentKey.value)?.name || '数学')
    const gradeOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    function onGradeChange(e) { knowledgeStore.setGrade(Number(e.target.value)); selectedId.value = ''; pathGoalId.value = ''; knowledgeStore.clearLearningPath() }
    function subjectName(sub) { const k = String(sub || '').toLowerCase(); return SUBJECT_META[k]?.name || k }
    function iconName(sub) { const k = String(sub || '').toLowerCase(); return SUBJECT_META[k]?.icon || 'book' }

    // ── 章节树 → 领域（根章节） ──
    const chapterCtx = computed(() => {
      const chs = new Map(knowledgeStore.graphData.nodes.filter((n) => n.type === 'chapter').map((n) => [n.id, n]))
      const cache = new Map()
      function rootOf(id) {
        if (!id) return null
        if (cache.has(id)) return cache.get(id)
        const c = chs.get(id)
        if (!c) { cache.set(id, null); return null }
        const r = c.parentId ? rootOf(c.parentId) : c.id
        cache.set(id, r)
        return r
      }
      return { nameOf: (id) => chs.get(id)?.name || '', rootOf }
    })
    function groupOf(kp) {
      const cid = kp.chapterId || kp.chapter_id
      const root = chapterCtx.value.rootOf(cid)
      const name = root ? chapterCtx.value.nameOf(root) : (kp.chapter_name || kp.chapterName || '未分领域')
      return { id: root || cid || '__none__', name }
    }
    function groupNameOf(kp) { return kp ? groupOf(kp).name : '' }

    // ── 知识点 & 边 ──
    const allKps = computed(() => knowledgeStore.graphData.nodes.filter((n) => n.type === 'knowledge-point'))
    const preEdges = computed(() =>
      knowledgeStore.graphData.edges.filter((e) => e.relation === 'prerequisite-of')
    )

    // ── 布局 ──
    const layout = computed(() => buildDomainLayout(allKps.value, preEdges.value, groupOf))
    const domainIndex = computed(() => {
      const m = new Map()
      layout.value.domains.forEach((d, i) => m.set(d.id, i))
      return m
    })
    function domainColor(id) { return PALETTE[(domainIndex.value.get(id) || 0) % PALETTE.length] }

    const placedMap = computed(() => new Map(layout.value.nodes.map((n) => [n.id, n])))
    const selectedIdResolved = computed(() => {
      if (selectedId.value && placedMap.value.has(selectedId.value)) return selectedId.value
      return layout.value.nodes[0]?.id || ''
    })
    const selectedNode = computed(() => {
      const id = selectedIdResolved.value
      return placedMap.value.get(id) || knowledgeStore.knowledgePoints.find((p) => p.id === id) || { id: '', name: '', description: '' }
    })

    const neighborIds = computed(() => {
      const id = selectedIdResolved.value
      const set = new Set(id ? [id] : [])
      preEdges.value.forEach((e) => { if (e.source === id) set.add(e.target); else if (e.target === id) set.add(e.source) })
      return set
    })
    const visibleNodes = computed(() => {
      let list = layout.value.nodes
      if (chapter.value !== 'all') list = list.filter((n) => n.domainId === chapter.value)
      if (focus.value) list = list.filter((n) => neighborIds.value.has(n.id))
      return list
    })
    const placedNodes = computed(() => visibleNodes.value)
    const drawnEdges = computed(() => {
      const ids = new Set(visibleNodes.value.map((n) => n.id))
      return preEdges.value.filter((e) => ids.has(e.source) && ids.has(e.target))
    })

    // ── SVG 变换 & 边几何 ──
    const viewBox = computed(() => {
      const b = layout.value.bounds
      return `${b.minX} ${b.minY} ${b.width} ${b.height}`
    })
    const center = computed(() => {
      const b = layout.value.bounds
      return { x: b.minX + b.width / 2, y: b.minY + b.height / 2 }
    })
    const worldTransform = computed(() => {
      const c = center.value
      return `translate(${panX.value} ${panY.value}) translate(${c.x} ${c.y}) scale(${zoom.value}) translate(${-c.x} ${-c.y})`
    })
    function posOf(id) {
      return placedMap.value.get(id) || { x: center.value.x, y: center.value.y, r: 10 }
    }
    function edgePath(e) {
      const p = posOf(e.source)
      const q = posOf(e.target)
      const dx = q.x - p.x
      const dy = q.y - p.y
      const d = Math.hypot(dx, dy) || 1
      const r1 = p.r + 6
      const r2 = q.r + 10
      const sx = p.x + (dx / d) * r1
      const sy = p.y + (dy / d) * r1
      const ex = q.x - (dx / d) * r2
      const ey = q.y - (dy / d) * r2
      const cx = (sx + ex) / 2 - (dy / d) * 14
      const cy = (sy + ey) / 2 + (dx / d) * 14
      return `M${sx},${sy} Q${cx},${cy} ${ex},${ey}`
    }
    const selectedGraphId = computed(() => selectedId.value || selectedIdResolved.value)
    function isActiveEdge(e) { return e.source === selectedGraphId.value || e.target === selectedGraphId.value }
    function edgeColor(e) { return isActiveEdge(e) ? '#9785dc' : '#bac5d5' }
    function edgeOpacity(e) { return isActiveEdge(e) ? 0.85 : 0.4 }

    // ── 掌握度 / 状态 ──
    function masteryOf(id) { return Math.round((knowledgeStore.masteryMap[id] || 0) * 100) }
    function status(id) { return masteryOf(id) >= 80 ? '已掌握' : masteryOf(id) > 0 ? '学习中' : '未开始' }
    function pillClass(id) { return masteryOf(id) >= 80 ? 'good' : masteryOf(id) > 0 ? 'weak' : '' }
    const currentBucket = computed(() => {
      const m = masteryOf(selectedNode.value.id)
      if (m >= 100) return 100
      if (m >= 80) return 80
      if (m >= 40) return 40
      return 0
    })
    function setMastery(id, v) { knowledgeStore.updateMastery(id, v / 100) }
    function minutesOf() { return 10 }

    // ── 关系 ──
    function nodesByIds(ids) {
      const byId = new Map(allKps.value.map((n) => [n.id, n]))
      return ids.map((id) => byId.get(id)).filter(Boolean)
    }
    const prereqList = computed(() => nodesByIds(preEdges.value.filter((e) => e.target === selectedNode.value.id).map((e) => e.source)))
    const dependentList = computed(() => nodesByIds(preEdges.value.filter((e) => e.source === selectedNode.value.id).map((e) => e.target)))
    const siblingList = computed(() => {
      const cur = selectedNode.value
      const gid = groupOf(cur).id
      return layout.value.nodes.filter((n) => n.id !== cur.id && n.domainId === gid)
    })
    function prereqCount(id) { return preEdges.value.filter((e) => e.target === id).length }
    function dependentCount(id) { return preEdges.value.filter((e) => e.source === id).length }

    // ── 选择 / 记录 ──
    function selectNode(id, fromSearch = false) {
      const node = allKps.value.find((n) => n.id === id) || knowledgeStore.knowledgePoints.find((p) => p.id === id)
      if (!node) return
      selectedId.value = id
      tab.value = 'concept'
      quizQuestion.value = null
      quizFeedback.value = false
      quizPicked.value = null
      knowledgeStore.recordVisit(node)
      noteDraft.value = knowledgeStore.getNote(id)
      if (fromSearch) { page.value = 'graph'; chapter.value = 'all'; focus.value = false; resetView() }
      searchQuery.value = ''
    }
    function switchTab(k) {
      tab.value = k
      if (k === 'quiz') loadQuiz(selectedNode.value.id)
    }
    function toggleBookmark(node) { knowledgeStore.toggleBookmark(node) }
    function isBookmarked(id) { return knowledgeStore.isBookmarked(id) }
    function saveNote(id) { knowledgeStore.setNote(id, noteDraft.value); uni.showToast({ title: '笔记已保存', icon: 'none' }) }

    // ── 练习 ──
    const quizOptions = computed(() => Array.isArray(quizQuestion.value?.options) ? quizQuestion.value.options : [])
    const quizAnswerIndex = computed(() => {
      const ans = String(quizQuestion.value?.answer || '').trim()
      if (/^[A-Z]$/.test(ans)) return ans.charCodeAt(0) - 65
      const i = quizOptions.value.findIndex((o) => String(o) === ans)
      return i
    })
    async function loadQuiz(id) {
      quizLoading.value = true
      quizQuestion.value = null
      quizPicked.value = null
      quizFeedback.value = false
      const list = await getKpQuestions(id, 5)
      quizQuestion.value = Array.isArray(list) && list.length ? list[0] : null
      quizLoading.value = false
    }
    function submitQuiz() { if (quizPicked.value !== null) quizFeedback.value = true }
    function retryQuiz() { quizPicked.value = null; quizFeedback.value = false }
    function practiceById(id) {
      practiceStore.setTopic(id)
      practiceStore.startSession('topic', { subject: knowledgeStore.currentSubject })
      uni.navigateTo({ url: '/pages/practice/index' })
    }
    function practiceSelected() { practiceById(selectedNode.value.id) }

    // ── 交互 & 视图 ──
    let gesture = null
    function onWheel(e) {
      const f = e.deltaY < 0 ? 1.08 : 0.93
      zoom.value = Math.min(2.4, Math.max(0.45, zoom.value * f))
    }
    function onPointerDown(e) { if (e.target.closest && e.target.closest('.graph-node')) return; gesture = { x: e.clientX, y: e.clientY, px: panX.value, py: panY.value } }
    function onPointerMove(e) { if (!gesture) return; panX.value = gesture.px + (e.clientX - gesture.x); panY.value = gesture.py + (e.clientY - gesture.y) }
    function endGesture() { gesture = null }
    function zoomBy(f) { zoom.value = Math.min(2.4, Math.max(0.45, zoom.value * f)) }
    function resetView() { zoom.value = 1; panX.value = 0; panY.value = 0 }
    function toggleFocus() { focus.value = !focus.value }
    function onChapterChange(e) { chapter.value = e.target.value; focus.value = false }
    function showPage(id) { page.value = id; expanded.value = false; sidebarOpen.value = false; quizFeedback.value = false; quizPicked.value = null }
    function subjectChange(key) {
      if (key === currentKey.value) return
      const s = subjectsList.value.find((x) => x.key === key)
      selectedId.value = ''
      chapter.value = 'all'
      focus.value = false
      resetView()
      pathGoalId.value = ''
      knowledgeStore.clearLearningPath()
      knowledgeStore.setSubject(s?.code || key.toUpperCase())
    }
    function openHelp() { helpOpen.value = true }

    // ── 搜索 ──
    const searchResults = computed(() => {
      const q = searchQuery.value.trim().toLowerCase()
      if (!q) return []
      return knowledgeStore.knowledgePoints.filter((p) => (p.name + ' ' + (p.description || '')).toLowerCase().includes(q)).slice(0, 9)
    })

    // ── 路径 ──
    const goalName = computed(() => {
      const g = allKps.value.find((n) => n.id === pathGoalId.value)
      return g?.name || knowledgeStore.pathSteps.find((s) => s.isGoal)?.name || '目标'
    })
    const pathSteps = computed(() => knowledgeStore.pathSteps)
    const pathLoading = computed(() => knowledgeStore.pathLoading)
    const pathMastered = computed(() => pathSteps.value.filter((s) => masteryOf(s.id) >= 80).length)
    const pathTodo = computed(() => pathSteps.value.length - pathMastered.value)
    const goalDirectPre = computed(() => nodesByIds(preEdges.value.filter((e) => e.target === pathGoalId.value).map((e) => e.source)))
    function onGoalChange(e) { pathGoalId.value = e.target.value; knowledgeStore.clearLearningPath() }
    function generatePath() { if (pathGoalId.value) knowledgeStore.loadLearningPath(pathGoalId.value) }
    function planSelected() { pathGoalId.value = selectedNode.value.id; knowledgeStore.clearLearningPath(); showPage('path'); generatePath() }

    // ── 知识库 ──
    const libraryRows = computed(() => {
      const q = libraryQuery.value.trim().toLowerCase()
      return allKps.value.filter((n) => {
        if (libraryGroup.value !== 'all' && groupOf(n).id !== libraryGroup.value) return false
        if (q && !(n.name + ' ' + (n.description || '')).toLowerCase().includes(q)) return false
        if (libraryStatus.value === 'saved') return isBookmarked(n.id)
        if (libraryStatus.value === 'good') return masteryOf(n.id) >= 80
        if (libraryStatus.value === 'started') return masteryOf(n.id) > 0 && masteryOf(n.id) < 80
        if (libraryStatus.value === 'new') return masteryOf(n.id) === 0
        return true
      })
    })
    function exportGraph() { downloadJson(buildExportPayload(knowledgeStore)); uni.showToast({ title: '已导出', icon: 'none' }) }

    // ── 概览 ──
    const subjectStats = computed(() => knowledgeStore.subjectMasteryStats)
    const weakPoints = computed(() => knowledgeStore.weakPoints)
    function fmtDate(ts) { if (!ts) return ''; const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()}` }

    // ── 存储标签 ──
    const storageLabel = computed(() => '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' + ICONS.info + '</svg>学习记录保存在本机')

    // ── 初始化 ──
    async function load() {
      await knowledgeStore.loadCatalog()
      await knowledgeStore.loadKnowledgePoints()
      await knowledgeStore.loadKnowledgeGraph()
    }
    onMounted(load)
    onShow(() => { if (!knowledgeStore.graphData.nodes.length) load() })

    // 选中清空笔记草稿
    watch(selectedIdResolved, (id) => { noteDraft.value = id ? knowledgeStore.getNote(id) : '' })

    return {
      knowledgeStore,
      Ico,
      pageMeta,
      navItems,
      detailTabs,
      masteryOptions,
      page,
      sidebarOpen,
      selectedId,
      tab,
      view,
      focus,
      chapter,
      expanded,
      searchQuery,
      searchResults,
      noteDraft,
      helpOpen,
      zoom,
      panX,
      panY,
      quizQuestion,
      quizLoading,
      quizPicked,
      quizFeedback,
      quizOptions,
      quizAnswerIndex,
      pathGoalId,
      libraryQuery,
      libraryGroup,
      libraryStatus,
      subjectsList,
      currentKey,
      currentSubjectName,
      gradeOptions,
      onGradeChange,
      subjectName,
      iconName,
      allKps,
      layout,
      domainColor,
      selectedNode,
      placedNodes,
      visibleNodes,
      drawnEdges,
      viewBox,
      worldTransform,
      edgePath,
      edgeColor,
      edgeOpacity,
      isActiveEdge,
      masteryOf,
      status,
      pillClass,
      currentBucket,
      setMastery,
      minutesOf,
      prereqList,
      dependentList,
      siblingList,
      prereqCount,
      dependentCount,
      groupNameOf,
      selectNode,
      switchTab,
      toggleBookmark,
      isBookmarked,
      saveNote,
      loadQuiz,
      submitQuiz,
      retryQuiz,
      practiceById,
      practiceSelected,
      onWheel,
      onPointerDown,
      onPointerMove,
      endGesture,
      zoomBy,
      resetView,
      toggleFocus,
      onChapterChange,
      showPage,
      subjectChange,
      openHelp,
      goalName,
      pathSteps,
      pathLoading,
      pathMastered,
      pathTodo,
      goalDirectPre,
      onGoalChange,
      generatePath,
      planSelected,
      libraryRows,
      exportGraph,
      subjectStats,
      weakPoints,
      fmtDate,
      storageLabel
    }
  }
}
</script>

<style scoped>
.app{--nav:#111827;--bg:#f4f6fb;--paper:#fff;--line:#e7ebf3;--text:#1d2840;--muted:#6d7890;--blue:#4f46e5;--blue-bg:#eef0ff;--green:#169b80;--orange:#d98220;--radius:16px;--shadow:0 4px 24px #14244a05}*{box-sizing:border-box}.app{margin:0;background:var(--bg);color:var(--text);font-family:Inter,"PingFang SC","Microsoft YaHei",system-ui,sans-serif;font-size:16px;line-height:1.6}.app{display:flex;min-height:100vh}
button,input,select,textarea{font:inherit}button{cursor:pointer}button:disabled{opacity:.45;cursor:not-allowed}button{border:0;background:none;color:inherit}input,select,textarea{outline:none}input:focus,select:focus,textarea:focus{border-color:var(--blue)!important;box-shadow:0 0 0 3px #4f46e51a}button svg,svg.icon{width:19px;height:19px;flex-shrink:0;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}a{color:var(--blue)}.sidebar{width:204px;background:var(--nav);color:#a6b0c3;flex-shrink:0;padding:30px 18px 20px;position:fixed;inset:0 auto 0 0;display:flex;flex-direction:column;z-index:30}.brand{display:flex;align-items:center;gap:11px;color:white;padding:0 10px 32px}.brand-mark{background:var(--blue);height:38px;width:38px;display:grid;place-items:center;border-radius:11px;flex-shrink:0}.brand-mark svg{width:26px;height:26px}.brand-title{font-size:25px;font-weight:750;line-height:1.1;letter-spacing:2px}.brand-en{font-size:10px;letter-spacing:1.8px;color:#8e9bbb;margin-top:6px}.nav-caption{font-size:12px;padding:0 15px;margin:16px 0 10px;letter-spacing:1.4px;color:#65738d}.nav-button{width:100%;display:flex;align-items:center;gap:12px;padding:12px 15px;border-radius:9px;margin-bottom:6px;text-align:left;font-size:14px}.nav-button:hover{background:#ffffff09;color:#fff}.nav-button.active{color:white;background:#4f46e5;box-shadow:0 6px 15px #0002}.sidebar-bottom{margin-top:auto;padding-top:30px}.side-note{border:1px solid #ffffff13;background:#ffffff04;border-radius:12px;padding:15px;font-size:12px;line-height:1.8}.side-note b{display:block;color:#d7dded;font-size:14px;margin-bottom:5px}.local-label{font-size:12px;padding:20px 8px 0;color:#718098;display:flex;gap:6px;align-items:center}.shell{margin-left:204px;min-width:0;width:calc(100% - 204px)}.topbar{height:78px;background:#fff;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;padding:0 32px;gap:24px}.breadcrumb{font-size:14px;color:#9099ad;display:flex;gap:12px;align-items:center;white-space:nowrap}.breadcrumb strong{font-weight:500;color:#3d4861}.top-actions{display:flex;gap:18px;align-items:center}.searchbox{position:relative;width:300px}.searchbox input{width:100%;border:1px solid var(--line);background:#f8f9fc;border-radius:9px;height:40px;padding:0 42px 0 38px;font-size:14px}.searchbox>.icon,.searchbox .search-ico{position:absolute;left:12px;top:10px;color:#9aa4b5}.search-key{position:absolute;right:12px;top:9px;font-size:12px;color:#9099ad;border:1px solid #dde2eb;border-radius:4px;padding:0 4px}.search-results{position:absolute;top:47px;right:0;width:360px;background:white;border:1px solid var(--line);border-radius:12px;box-shadow:0 12px 45px #15213a25;z-index:50;max-height:420px;overflow:auto;padding:6px}.search-item{display:flex;width:100%;text-align:left;padding:11px;border-radius:8px;gap:10px;align-items:center}.search-item:hover{background:var(--blue-bg)}.search-item small{color:var(--muted);display:block;font-size:12px}.search-empty{padding:20px;font-size:14px;color:var(--muted)}.avatar{background:#eaf0ff;color:#565ed9;height:35px;width:35px;border-radius:50%;display:grid;place-items:center;font-weight:650;font-size:14px}.profile-label{font-size:14px;color:#5a657d}.main{padding:28px 30px 30px;max-width:1800px;margin:auto;width:100%}.page-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:24px}.eyebrow{font-size:11px;letter-spacing:1.6px;color:#8a95aa;margin-bottom:4px}.page-head h1{font-size:27px;line-height:1.4;margin:0;font-weight:720;letter-spacing:-.6px}.page-desc{color:var(--muted);font-size:14px;margin-top:6px}.page-actions{display:flex;gap:9px;align-items:center;flex-shrink:0;padding-top:10px}.btn{border:1px solid var(--line);padding:9px 15px;background:#fff;border-radius:8px;font-size:14px;display:inline-flex;align-items:center;justify-content:center;gap:8px;line-height:1.5;white-space:nowrap;transition:background .15s}.btn:hover{background:#f4f5fa}.btn.primary{background:var(--blue);color:white;border-color:var(--blue);box-shadow:0 3px 8px #4f46e518}.btn.primary:hover{background:#4338ca}.btn.soft{background:var(--blue-bg);color:var(--blue);border-color:#dfe2ff}.btn.small{padding:6px 11px;font-size:13px}.btn.full{width:100%}.icon-btn{height:34px;width:34px;display:grid;place-items:center;border:1px solid var(--line);border-radius:8px;background:#fff}.icon-btn:hover{background:var(--blue-bg);color:var(--blue)}.subject-bar{display:flex;gap:22px;align-items:center;margin-bottom:20px}.subjects{display:flex;gap:5px}.subject{padding:8px 16px;border:1px solid transparent;border-radius:8px;color:#748098;font-size:14px;display:flex;align-items:center;gap:8px}.subject.active{color:var(--blue);background:white;border-color:#dcdff5;box-shadow:0 2px 4px #1d284004}.subject svg{height:17px;width:17px}.scope-select{margin-left:auto;border:1px solid var(--line);border-radius:8px;padding:7px 10px;background:#fff;color:#5a657d;font-size:13px}.split{display:grid;grid-template-columns:minmax(0,1fr) 316px;gap:20px;align-items:start}.graph-panel{background:white;border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;box-shadow:var(--shadow)}.graph-toolbar{min-height:60px;display:flex;gap:12px;align-items:center;justify-content:space-between;padding:12px 18px;border-bottom:1px solid var(--line)}.graph-title{font-size:15px;font-weight:650;display:flex;align-items:center;gap:9px}.graph-title small{font-size:12px;color:var(--muted);font-weight:400}.segmented{display:flex;gap:3px;background:#f2f4f9;border-radius:7px;padding:3px}.segmented button{font-size:12px;padding:5px 10px;border-radius:5px;color:#748098}.segmented .active{background:white;box-shadow:0 1px 4px #1323430c;color:var(--text)}.canvas{height:560px;position:relative;overflow:hidden;background-color:#fcfdff;background-image:radial-gradient(#dbe2ef .8px,transparent .8px);background-size:20px 20px;touch-action:none}.graph-svg{width:100%;height:100%;display:block;user-select:none;cursor:grab}.graph-node{cursor:pointer}.graph-node:hover .node-disc{stroke-width:3}.node-name{fill:#43506a;font-size:14px;font-weight:500;pointer-events:none}.graph-node.selected .node-name{fill:var(--blue);font-weight:700}.glyph{font-size:21px;font-weight:600;pointer-events:none}.graph-edge{pointer-events:none}.canvas-top{position:absolute;left:18px;top:14px;z-index:2;display:flex;gap:7px}.tag{border:1px solid #e2e6f0;background:#ffffffd9;border-radius:6px;font-size:12px;color:#6e7890;padding:3px 8px;display:inline-flex;align-items:center;gap:5px}.tag.purple{color:#6c55c0;border-color:#e7dcff;background:#f7f3ff}.canvas-help{position:absolute;left:18px;bottom:15px;font-size:12px;color:#9aa3b7;pointer-events:none}.canvas-control{position:absolute;right:14px;bottom:15px;display:flex;gap:5px;align-items:center;z-index:2}.canvas-control>span{font-size:12px;color:#8b95a8;width:38px;text-align:center}.graph-footer{padding:13px 18px;display:flex;align-items:center;gap:16px;border-top:1px solid var(--line);flex-wrap:wrap}.legend{display:flex;align-items:center;gap:6px;color:#778298;font-size:12px}.legend-dot{width:8px;height:8px;border-radius:50%;background:var(--color)}.relation-checks{margin-left:auto;display:flex;gap:12px}.relation-checks label{display:flex;align-items:center;gap:4px;font-size:12px;color:#78849a;cursor:pointer}.relation-checks input{accent-color:var(--blue);width:13px;height:13px}.insight-strip{display:grid;grid-template-columns:repeat(3,1fr);margin-top:16px;gap:12px}.mini-stat{padding:14px 16px;background:white;border:1px solid var(--line);border-radius:12px;display:flex;gap:12px;align-items:center}.stat-icon{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:var(--blue-bg);color:var(--blue);flex-shrink:0}.stat-icon svg{width:18px;height:18px}.mini-stat strong{font-size:20px;font-weight:650;margin-right:4px}.mini-stat small{font-size:12px;color:#8893a7}.mini-stat p{margin:0;font-size:12px;color:var(--muted)}.detail{background:white;border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden}.detail-heading{padding:22px 22px 0}.detail-top{display:flex;align-items:center;justify-content:space-between}.detail-badge{color:var(--blue);font-size:12px;background:var(--blue-bg);padding:4px 8px;border-radius:5px}.bookmark{color:#9da6b8}.bookmark.active{color:var(--orange);background:#fff8e9}.detail h2{font-size:24px;line-height:1.4;margin:13px 0 4px}.detail-sub{font-size:12px;color:#8893a7}.detail-tabs{display:flex;margin:18px 22px 0;border-bottom:1px solid var(--line);gap:23px}.detail-tabs button{font-size:14px;color:#8891a6;padding:0 0 10px;border-bottom:2px solid transparent;position:relative;top:1px}.detail-tabs button.active{color:var(--blue);border-bottom-color:var(--blue)}.detail-body{padding:18px 22px 22px}.detail-body p{font-size:14px;color:#67738a;line-height:1.8;margin:8px 0 15px}.section-label{font-size:13px;font-weight:650;color:#48566e;display:flex;align-items:center;justify-content:space-between;margin:16px 0 9px}.section-label:first-child{margin-top:0}.formula{background:#f6f7ff;border:1px solid #e8eafe;border-radius:10px;padding:17px 10px;text-align:center;font-family:Georgia,"Times New Roman",serif;color:#5359b8;font-size:25px;line-height:1.4;margin:12px 0}.relation-pill{font-size:12px;color:#6676ba;background:#f2f4fb;border-radius:5px;padding:4px 8px;display:inline-flex;margin:0 4px 5px 0}.relation-pill:hover{background:#e6e9ff}.progress-block{border-top:1px solid var(--line);margin-top:17px;padding-top:15px}.progress-label{display:flex;justify-content:space-between;font-size:13px;color:#718099}.progress-label strong{color:var(--blue);font-weight:600}.progress-track{height:6px;border-radius:9px;background:#edf0f8;overflow:hidden;margin-top:8px}.progress-fill{height:100%;background:var(--blue);border-radius:9px}.mastery-control{display:flex;gap:5px;margin:12px 0 16px}.mastery-control button{font-size:12px;background:#f6f7fa;border-radius:6px;padding:5px 7px;flex:1;color:#8791a6}.mastery-control button.active{color:var(--blue);background:var(--blue-bg)}.detail-body .empty-small{font-size:13px;color:#8d97ab}.tip-card{margin-top:16px;background:#ecf2fd;border:1px solid #dce5f6;border-radius:12px;padding:15px 18px;color:#566689;font-size:13px;line-height:1.7}.tip-card b{color:#405074;display:flex;align-items:center;gap:7px;margin-bottom:5px;font-size:13px}.tip-card p{margin:0}.relation-group{padding:12px;border:1px solid var(--line);border-radius:9px;margin-bottom:12px}.relation-group>strong{font-size:13px;display:block;margin-bottom:9px}.relation-group small{font-size:12px;color:var(--muted);display:block;margin-top:6px}.question{font-size:15px;line-height:1.7;margin-bottom:14px}.answer-option{display:flex;align-items:flex-start;gap:9px;border:1px solid var(--line);padding:10px 12px;border-radius:8px;font-size:14px;width:100%;text-align:left;margin:8px 0;color:#627087}.answer-option:hover,.answer-option.picked{border-color:#abaefa;background:#f5f5ff;color:var(--blue)}.answer-option.correct{border-color:#50b89e;background:#eefaf6;color:#16765f}.answer-option.wrong{border-color:#e9aa98;background:#fff2ef;color:#bd5636}.answer-letter{height:23px;min-width:23px;background:#f0f2f8;border-radius:5px;display:grid;place-items:center;font-size:12px}.answer-feedback{font-size:13px;line-height:1.8;background:#f4f6fb;border-radius:8px;padding:12px;margin-top:14px;color:#65738a}.answer-feedback b{display:block;margin-bottom:3px}.note-input{width:100%;padding:10px;border:1px solid var(--line);border-radius:8px;resize:vertical;font-size:14px;min-height:85px;line-height:1.7}.graph-list{height:560px;overflow:auto;padding:12px 18px}.knowledge-list-item{padding:13px 9px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:13px;width:100%;text-align:left}.knowledge-list-item:hover{background:#f7f8ff}.node-icon{width:39px;height:39px;border-radius:10px;background:var(--tint);color:var(--color);display:grid;place-items:center;font-size:20px;font-family:Georgia,serif}.knowledge-list-item strong{display:block;font-size:14px;font-weight:600}.knowledge-list-item small{font-size:12px;color:var(--muted)}.knowledge-list-item>.pill{margin-left:auto}.pill{padding:3px 8px;background:#f2f4f9;color:#8090a4;border-radius:5px;font-size:12px;white-space:nowrap}.pill.good{background:#edf8f5;color:var(--green)}.pill.weak{background:#fff4e5;color:#ce841d}.card{background:#fff;border:1px solid var(--line);border-radius:var(--radius);padding:23px;box-shadow:var(--shadow)}.section-head{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:20px}.section-head h2{font-size:17px;margin:0;font-weight:650}.section-head small{color:var(--muted);font-size:13px}.path-layout{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(260px,1fr);gap:20px}.field-label{font-size:13px;color:#788499;display:block;margin-bottom:7px}.field{padding:9px 12px;width:100%;height:43px;border:1px solid #e0e5ee;border-radius:8px;background:#fff;color:#40506a;font-size:14px}.path-form{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end}.path-summary{background:#f5f6ff;border:1px solid #e6e8ff;border-radius:12px;padding:18px;display:flex;align-items:center;justify-content:space-between;margin:20px 0 24px}.path-summary h3{margin:0;font-size:17px}.path-summary p{font-size:13px;color:#7c85a2;margin:4px 0 0}.path-summary strong{color:var(--blue);font-size:22px}.steps{padding:0;list-style:none;margin:0}.step{position:relative;display:flex;gap:16px;padding-bottom:22px}.step:before{content:"";position:absolute;left:17px;top:33px;height:calc(100% - 26px);width:1px;background:#dde2f3}.step:last-child:before{display:none}.step-number{width:35px;height:35px;flex-shrink:0;display:grid;place-items:center;border-radius:50%;border:1px solid #dfe2fc;background:#f5f6ff;color:var(--blue);font-size:13px;z-index:1}.step.complete .step-number{color:var(--green);background:#effaf6;border-color:#d6ece3}.step-body{flex:1;border:1px solid var(--line);border-radius:10px;padding:14px 16px;display:flex;justify-content:space-between;gap:12px;align-items:center}.step-body h3{font-size:15px;margin:0}.step-body p{font-size:12px;color:var(--muted);margin:4px 0 0}.step-goal{border-color:#bbbcfc;background:#f8f8ff}.path-notes{font-size:14px;color:#728098;line-height:1.8}.path-notes p{margin:9px 0}.path-notes b{color:#4e5d79}.dependency-legend{display:flex;gap:12px;font-size:12px;color:#8590a5;margin-top:16px;align-items:center}.library-tools{display:flex;gap:10px;align-items:center;margin-bottom:20px;flex-wrap:wrap}.library-tools input{max-width:340px}.library-tools select{width:150px}.table-wrap{overflow-x:auto}.table{width:100%;border-collapse:collapse;font-size:14px;white-space:nowrap}.table th{text-align:left;color:#8792a5;font-weight:500;background:#f7f8fb;padding:13px 16px;border-bottom:1px solid var(--line);font-size:12px}.table td{border-bottom:1px solid var(--line);padding:15px 16px;color:#75819a}.table td:first-child{color:var(--text);font-weight:550;max-width:260px;white-space:normal}.table-name{font-weight:600;color:#33415b}.table-name:hover{color:var(--blue)}.table tbody tr:hover{background:#fbfcff}.table-action{color:var(--blue);font-size:13px;padding:4px 6px}.table-progress{display:flex;gap:8px;align-items:center}.table-progress .progress-track{width:64px;height:4px;margin:0}.library-total{font-size:12px;color:var(--muted);margin-top:18px}.dashboard-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:20px}.dash-stat{padding:21px 23px}.dash-stat small{font-size:13px;color:var(--muted)}.dash-stat strong{display:block;font-size:31px;line-height:1.6;font-weight:650;margin-top:5px}.dash-stat p{margin:0;font-size:12px;color:#9aa4b6}.dash-columns{display:grid;grid-template-columns:1.2fr 1fr;gap:20px}.subject-progress-row{display:flex;gap:15px;align-items:center;margin:24px 0}.subject-progress-row:first-child{margin-top:0}.subject-symbol{width:38px;height:38px;border-radius:10px;background:#eef0ff;display:grid;place-items:center;color:#6972bd;font-size:19px}.subject-progress-info{flex:1}.subject-progress-info>div{display:flex;justify-content:space-between;gap:8px;font-size:14px}.subject-progress-info span{font-size:12px;color:#93a0b2}.subject-progress-info .progress-track{margin-top:9px}.recent-item{display:flex;align-items:center;gap:12px;padding:13px 0;border-bottom:1px solid var(--line);font-size:14px}.recent-item span{color:#94a0b2;font-size:12px;margin-left:auto}.empty-state{padding:36px 15px;text-align:center;color:#8c96aa;font-size:14px}.empty-state svg{width:32px;height:32px;margin-bottom:10px;color:#a2abbd}.empty-state h3{margin:0 0 7px;color:#5d6a83;font-size:16px}.footer{font-size:11px;color:#9da7b9;margin-top:26px;display:flex;justify-content:space-between;gap:12px}.modal-backdrop{position:fixed;inset:0;background:#10193266;backdrop-filter:blur(3px);z-index:100;display:flex;align-items:center;justify-content:center;padding:24px}.modal{width:580px;max-height:90vh;overflow:auto;background:#fff;border-radius:17px;box-shadow:0 25px 80px #0003}.modal-head{padding:22px 26px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center}.modal-head h2{margin:0;font-size:20px}.modal-body{padding:22px 26px}.modal-foot{padding:15px 26px;border-top:1px solid var(--line);display:flex;gap:10px;justify-content:flex-end}.focus-badge{pointer-events:auto;cursor:pointer;background:#eef0ff;color:var(--blue);border-color:#d6dafa}.graph-panel.expanded{position:fixed;inset:25px;z-index:80;display:flex;flex-direction:column;box-shadow:0 0 0 50px #111b3c66;background:#fff}.graph-panel.expanded .canvas,.graph-panel.expanded .graph-list{flex:1;height:auto;min-height:0}.mobile-menu{display:none}
@media(max-width:980px){.sidebar{width:76px;align-items:center;padding:24px 9px}.brand-copy,.nav-caption,.nav-button span,.side-note,.local-label{display:none}.nav-button{width:48px;padding:14px;justify-content:center}.shell{margin-left:76px;width:calc(100% - 76px)}.split{grid-template-columns:minmax(0,1fr)}.dashboard-grid{grid-template-columns:repeat(2,1fr)}.dash-columns{grid-template-columns:1fr}}
@media(max-width:760px){.sidebar{width:0;transform:translateX(-100%);overflow:hidden}.sidebar.mobile-open{width:204px;transform:none}.sidebar.mobile-open .brand-copy,.sidebar.mobile-open .nav-caption,.sidebar.mobile-open .nav-button span,.sidebar.mobile-open .side-note{display:block}.shell{margin-left:0;width:100%}.mobile-menu{display:grid}.breadcrumb{display:none}.topbar{padding:0 16px}.main{padding:20px 14px}.page-head{display:block}.page-actions{padding-top:14px}.subject-bar{overflow-x:auto}.split,.path-layout{grid-template-columns:1fr}.canvas{height:480px}.graph-list{height:480px}.dashboard-grid{gap:10px}.card{padding:18px}}
</style>
