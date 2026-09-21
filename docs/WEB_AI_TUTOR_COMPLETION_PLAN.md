# Web AI Tutor - Feature Completion & Optimization Plan

## Context
The **智学慧眼 (SmartLens AI Tutor)** is a web-based AI educational tutoring application built with Vue 3 + uni-app + Pinia + Ant Design. Current implementation has 4 tabBar pages but is missing several core features found in mature ed-tech platforms (Khan Academy, Duolingo, Coursera, Quizlet, etc.).

---

## 📋 Current Implementation Status

### ✅ Completed (TabBar Pages)
| Page | Status | Notes |
|------|--------|-------|
| `index` (首页) | ✅ Functional | Dashboard with stats, function cards, recommendations |
| `chat` (AI 辅导) | ✅ Complete | WebChat component with tabbar hover, teaching cards, suggestions |
| `report` (学情报告) | ✅ Fixed | Radar chart with Canvas 2D, stats, weakness analysis, suggestions |
| `camera` (拍照解题) | ✅ Basic | Photo capture, upload, OCR analysis flow |

### ⚠️ Partial / Incomplete
| Feature | Status | Gaps |
|---------|--------|------|
| Auth/Profile | Missing store | No user store in web-ai-tutor (exists in mini-program & web apps) |
| Knowledge Graph | Referenced but missing | TabBar icon in WebChat but no page |
| Wrong Questions | Referenced but missing | TabBar icon in WebChat but no page |
| Practice/Exercises | Referenced | goToPractice() navigates to chat |
| Settings | Missing | No settings page |

### ❌ Missing Pages (Should be tabBar or sub-pages)
1. **Knowledge Graph** (知识图谱) - Visual concept map
2. **Wrong Questions** (错题本) - Mistake collection with review
3. **Practice Center** (练习中心) - Spaced repetition, question bank
4. **Learning Plan** (学习计划) - Personalized curriculum
5. **Settings** (设置) - Preferences, notifications, account
6. **Profile** (个人中心) - Progress, achievements, streaks

---

## 🎯 Optimization Goals (Based on Mature Ed-Tech Designs)

### Design References
| Platform | Key Patterns to Adopt |
|----------|----------------------|
| **Khan Academy** | Mastery-based progress, skill tree, personalized dashboard |
| **Duolingo** | Streaks, XP, leagues, bite-sized lessons, spaced repetition |
| **Coursera/edX** | Course structure, progress rings, certificates |
| **Quizlet/Anki** | Spaced repetition, flashcard modes, study sets |
| **Notion/Obsidian** | Knowledge graph visualization, bidirectional links |

### Layout Principles
1. **Progressive Disclosure** - Show only what's relevant at each level
2. **Visual Hierarchy** - Clear primary/secondary/tertiary actions
3. **Feedback Loops** - Immediate feedback on every interaction
4. **Gamification** - Streaks, XP, levels, achievements (subtle)
5. **Accessibility** - WCAG AA, dark mode, reduced motion

---

## 📦 Implementation Plan

### Phase 1: Core Infrastructure (Week 1)

#### 1.1 Create Missing Pinia Stores
**Files to create:**
```
apps/web-ai-tutor/src/store/
├── user.js           # User profile, preferences, streak, XP
├── knowledge.js      # Subject tree, knowledge points, mastery
├── practice.js       # Question bank, spaced repetition state
├── settings.js       # App preferences, notifications, theme
└── report.js         # Report cache, analytics
```

**Key features for user.js:**
- Student profile (name, grade, subject, textbook version)
- Learning streak (days), XP, level
- Preferences (theme, notifications, sound, daily goal)
- Achievements/badges
- Study time tracking

#### 1.2 API Layer Completion
**File:** `apps/web-ai-tutor/src/api/index.js` - Add missing endpoints:
```javascript
// Knowledge Graph
export async function getKnowledgeGraph(subject, grade)
export async function getKnowledgePointDetail(id)

// Practice / Question Bank
export async function getQuestionBank(params)  // filters: subject, topic, difficulty
export async function submitPracticeAnswer(data)
export async function getSpacedRepetitionQueue(studentId)

// Wrong Questions
export async function getWrongQuestions(studentId, params)
export async function markQuestionReviewed(id)
export async function retryWrongQuestion(id)

// Learning Plan
export async function getLearningPlan(studentId)
export async function updateLearningPlan(data)

// Settings/Profile
export async function updateProfile(data)
export async function updatePreferences(data)
export async function getAchievements(studentId)
```

#### 1.3 Shared UI Component Library
**Create:** `apps/web-ai-tutor/src/components/ui/`
```
├── PageHeader.vue          # Consistent page headers with actions
├── EmptyState.vue          # Illustrated empty states
├── LoadingSkeleton.vue     # Content placeholders
├── ProgressRing.vue        # Circular progress (mastery, streak)
├── StatCard.vue            # KPI cards (reusable)
├── Chip.vue                # Tags, badges, filters
├── Toast/Notification.vue  # Unified toast system
├── Modal.vue               # Accessible modal wrapper
├── Tabs.vue                # Tab navigation
└── Avatar.vue              # User/subject avatars
```

---

### Phase 2: Missing TabBar Pages (Week 1-2)

#### 2.1 Knowledge Graph Page (`pages/knowledge-graph/`)
**Design:** Interactive concept map (like Khan Academy skill tree / Obsidian graph)
- **Tech:** D3.js force-directed graph or Cytoscape.js
- **Features:**
  - Nodes = knowledge points, edges = prerequisites
  - Color-coded by mastery (red→yellow→green)
  - Click node → show detail panel (definition, formula, practice)
  - Zoom/pan, search, filter by subject
  - "Learning Path" highlight (next recommended topics)

**Route:** `/pages/knowledge-graph/index` (add to tabBar)

#### 2.2 Wrong Questions Page (`pages/wrong-questions/`)
**Design:** Mistake collection with spaced repetition review (like Anki/Quizlet)
- **Tabs:** All | To Review | Mastered
- **Features:**
  - Card view: question preview, error type, date, mastery %
  - Swipe actions: Review, Mark Mastered, Delete
  - Review mode: show question → reveal answer → rate confidence
  - Spaced repetition scheduling (SM-2 algorithm)
  - Stats: total mistakes, review streak, mastery trend

**Route:** `/pages/wrong-questions/index` (add to tabBar)

#### 2.3 Practice Center Page (`pages/practice/`)
**Design:** Adaptive practice with multiple modes (like Khan Academy exercises)
- **Modes:**
  - **Quick Practice** - 5-10 random questions
  - **Topic Drill** - Focus on specific knowledge point
  - **Mock Exam** - Timed, mixed topics
  - **Spaced Repetition** - Due for review cards
- **Features:**
  - Real-time feedback with explanations
  - Hint system (progressive disclosure)
  - Progress tracking per topic
  - XP rewards, streak counter

**Route:** `/pages/practice/index` (add to tabBar)

---

### Phase 3: Sub-Pages & Deep Features (Week 2-3)

#### 3.1 Learning Plan Page (`pages/plan/`)
- Weekly/monthly goal setting
- Adaptive schedule based on performance
- Milestone tracking

#### 3.2 Knowledge Point Detail Page (`pages/knowledge-detail/`)
- Deep dive: definition, formula, examples, common mistakes
- Related concepts graph
- Practice questions for this specific point
- "Teach me" → opens AI chat with context

#### 3.3 Settings Page (`pages/settings/`)
**Sections:**
- **Account** - Profile, password, linked accounts
- **Learning** - Daily goal, reminder time, subjects, difficulty
- **Appearance** - Theme (light/dark/auto), font size, reduced motion
- **Notifications** - Push, email, streak reminders, weekly report
- **Data** - Export, clear cache, delete account
- **About** - Version, privacy, terms, feedback

#### 3.4 Profile/Progress Page (`pages/profile/`)
- **Header:** Avatar, name, level, XP bar, streak
- **Tabs:** Overview | Progress | Achievements | History
- **Visualizations:** 
  - Weekly activity heatmap (GitHub-style)
  - Mastery radar chart
  - Study time trend
  - Topic mastery breakdown

---

### Phase 4: Layout & UX Optimization (Week 3)

#### 4.1 Home Page Redesign (`pages/index/index.vue`)
**Current:** Basic cards with stats
**Target (Khan Academy/Duolingo style):**
```
┌─────────────────────────────────────┐
│  Header: Streak 🔥 14  XP ⭐ 1,240   │
│  ┌───────────────────────────────┐  │
│  │  Continue Learning            │  │
│  │  ████████░░ 80%  勾股定理应用   │  │
│  │  Next: 三角函数基础            │  │
│  └───────────────────────────────┘  │
│  ┌─────────┬─────────┬─────────┐   │
│  │ 练习    │ 错题复习 │ 学情报告 │   │
│  │ ▶ 开始  │ ▶ 3待复习 │ ▶ 查看  │   │
│  └─────────┴─────────┴─────────┘   │
│  ┌───────────────────────────────┐  │
│  │ Recommended for You           │  │
│  │ [Card] [Card] [Card] [Card]   │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

#### 4.2 Chat Page Enhancements
- **Conversation History Sidebar** (collapsible) - list past sessions
- **Context Pills** - Current topic, difficulty, mode
- **Keyboard Shortcuts** - Enter to send, / for commands
- **Message Actions** - Copy, regenerate, rate, save to notes

#### 4.3 Global Layout Improvements
- **Consistent Spacing System** - 4px base unit
- **Color Token System** - Semantic colors (primary, success, warning, danger, neutral)
- **Typography Scale** - Consistent heading/body sizes
- **Animation Library** - Page transitions, micro-interactions
- **Loading States** - Skeletons for all async content
- **Error Boundaries** - Graceful degradation

---

### Phase 5: Advanced Features (Week 4+)

#### 5.1 Gamification System
- **XP & Levels** - Every action awards XP
- **Daily Streak** - Consecutive days, streak freeze
- **Achievements** - First lesson, 100 questions, 7-day streak, etc.
- **Leaderboards** - Weekly (friends/class), global (optional)

#### 5.2 Offline Support
- Service Worker for caching
- IndexedDB for question bank
- Background sync for answers

#### 5.3 Accessibility
- ARIA labels on all interactive elements
- Keyboard navigation
- Screen reader announcements for live regions
- High contrast mode
- Reduced motion preferences

#### 5.4 Performance
- Code splitting by route
- Virtual scrolling for long lists
- Image optimization (WebP, lazy load)
- Bundle analysis & optimization

---

## 📁 File Structure (Target)

```
apps/web-ai-tutor/
├── src/
│   ├── api/
│   │   ├── index.js           # Main exports (updated)
│   │   ├── knowledge.js       # Knowledge graph endpoints
│   │   ├── practice.js        # Practice endpoints
│   │   ├── wrong-questions.js # Wrong questions endpoints
│   │   ├── plan.js            # Learning plan endpoints
│   │   └── user.js            # Profile/achievements endpoints
│   ├── components/
│   │   ├── ui/                # Shared UI components (NEW)
│   │   ├── knowledge-graph/   # Graph visualization (NEW)
│   │   ├── practice/          # Practice modes (NEW)
│   │   ├── wrong-questions/   # Mistake cards, review (NEW)
│   │   ├── teaching/          # TeachingCard, BaseTeachingCard
│   │   └── layout/            # PageHeader, TabBar, Sidebar
│   ├── pages/
│   │   ├── index/             # Home (redesigned)
│   │   ├── chat/              # Chat (enhanced)
│   │   ├── report/            # Report (done)
│   │   ├── camera/            # Camera (done)
│   │   ├── knowledge-graph/   # NEW - tabBar
│   │   ├── wrong-questions/   # NEW - tabBar
│   │   ├── practice/          # NEW - tabBar
│   │   ├── plan/              # NEW
│   │   ├── knowledge-detail/  # NEW
│   │   ├── settings/          # NEW
│   │   └── profile/           # NEW
│   ├── store/
│   │   ├── session.js         # Done
│   │   ├── user.js            # NEW
│   │   ├── knowledge.js       # NEW
│   │   ├── practice.js        # NEW
│   │   ├── wrong-questions.js # NEW
│   │   ├── settings.js        # NEW
│   │   └── report.js          # NEW
│   ├── styles/
│   │   ├── tokens.css         # Design tokens (NEW)
│   │   ├── globals.css        # Global styles
│   │   └── components.css     # Component styles
│   ├── utils/
│   │   ├── spaced-repetition.js # SM-2 algorithm (NEW)
│   │   ├── gamification.js    # XP, levels, achievements (NEW)
│   │   └── katex-helper.js    # Existing
│   └── composables/           # Vue 3 composables (NEW)
│       ├── useAuth.js
│       ├── useTheme.js
│       ├── useStreak.js
│       └── useKeyboard.js
├── pages.json                 # Updated tabBar + new pages
└── package.json               # Add D3/Cytoscape if needed
```

---

## 🔑 Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| **Canvas 2D for radar** | Native, no deps, works H5 + mini-program |
| **D3.js for knowledge graph** | Industry standard, force-directed layouts |
| **SM-2 for spaced repetition** | Proven algorithm, simple implementation |
| **Pinia + persist plugin** | Vue 3 native, SSR-ready, devtools |
| **Ant Design Vue** | Enterprise-grade, accessible, consistent |
| **KaTeX for math** | Fast, no runtime deps, server-side ready |
| **uni-app for cross-platform** | Single codebase for H5 + WeChat mini-program |

---

## ✅ Acceptance Criteria

### Phase 1-2 (Must Have)
- [ ] All 7 tabBar pages functional
- [ ] User store with profile, streak, XP
- [ ] Knowledge graph renders & interactive
- [ ] Wrong questions review mode works
- [ ] Practice center with 3+ modes
- [ ] Settings page with all sections
- [ ] Build passes without errors

### Phase 3-4 (Should Have)
- [ ] Home page redesigned with progress focus
- [ ] Consistent design system (tokens, components)
- [ ] Dark mode fully implemented
- [ ] Loading skeletons everywhere
- [ ] Error boundaries on all pages

### Phase 5 (Nice to Have)
- [ ] Gamification (XP, achievements, streak)
- [ ] Offline support
- [ ] Full accessibility audit
- [ ] Performance budget met (<3s FCP)

---

## 📅 Suggested Sprint Breakdown

| Sprint | Focus | Deliverables |
|--------|-------|--------------|
| 1 | Infrastructure + Knowledge Graph | Stores, API, Graph page |
| 2 | Wrong Questions + Practice | Review mode, 3 practice modes |
| 3 | Plan + Settings + Profile | Sub-pages, settings, profile |
| 4 | Home Redesign + Polish | Dashboard, design system, a11y |
| 5 | Gamification + Advanced | XP, achievements, offline, perf |

---

## 🎨 Design Token Reference (to create in `tokens.css`)

```css
:root {
  /* Colors */
  --color-primary: #4a6cf7;
  --color-primary-hover: #3b5bd9;
  --color-primary-light: rgba(74, 108, 247, 0.1);
  
  --color-success: #52c41a;
  --color-warning: #faad14;
  --color-error: #ff4d4f;
  --color-info: #1890ff;
  
  --color-bg-primary: #f7f8fa;
  --color-bg-card: #ffffff;
  --color-bg-elevated: #ffffff;
  
  --color-text-primary: #1a1a2e;
  --color-text-secondary: #59596b;
  --color-text-tertiary: #9999a6;
  --color-text-inverse: #ffffff;
  
  --color-border: #e8e8f0;
  --color-border-light: #f0f0f5;
  
  /* Spacing (4px base) */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px;
  --space-4: 16px; --space-5: 20px; --space-6: 24px;
  --space-8: 32px; --space-10: 40px; --space-12: 48px;
  
  /* Typography */
  --font-size-xs: 11px; --font-size-sm: 13px;
  --font-size-base: 15px; --font-size-lg: 17px;
  --font-size-xl: 20px; --font-size-2xl: 24px;
  --font-size-3xl: 32px;
  
  --font-weight-normal: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;
  
  /* Radius */
  --radius-sm: 6px; --radius-md: 10px; --radius-lg: 16px;
  --radius-xl: 24px; --radius-full: 9999px;
  
  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.04);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.08);
  --shadow-lg: 0 8px 24px rgba(0,0,0,0.1);
  
  /* Transitions */
  --transition-fast: 150ms ease;
  --transition-base: 250ms ease;
  --transition-slow: 350ms ease;
  
  /* Z-index */
  --z-dropdown: 100; --z-sticky: 200;
  --z-modal: 300; --z-toast: 400;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  :root {
    --color-bg-primary: #1a1a2e;
    --color-bg-card: #252542;
    --color-bg-elevated: #2d2d4a;
    --color-text-primary: #e8e8f0;
    --color-text-secondary: #a8a8c0;
    --color-border: #3d3d5c;
    --color-border-light: #33334d;
  }
}
```

---

*Generated: 2026-08-14 | Project: GRI Monorepo | App: web-ai-tutor*