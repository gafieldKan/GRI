# 智学慧眼 (智学慧眼 AI Tutor) - 功能完善与优化计划

## 项目概况

**项目名称**: 智学慧眼 - AI 智能学情分析辅导系统
**技术栈**: Vue 3 + uni-app + Pinia + Express + PostgreSQL + WebSocket
**架构**: Monorepo (apps/web-ai-tutor, services/ai-tutor-backend, apps/mini-program-ai-tutor)

---

## 📊 当前功能完成度评估

### ✅ 已完成功能 (核心 MVP)

| 模块 | 前端页面 | 后端 API | 完成度 |
|------|---------|---------|--------|
| 首页仪表盘 | ✅ Index.vue | ✅ /api/analysis/report, /api/knowledge-points | 90% |
| AI 互动辅导 | ✅ WebChat.vue | ✅ /api/session, WebSocket | 85% |
| 学情报告 | ✅ Report.vue | ✅ /api/analysis/report | 80% |
| 拍照解题 | ✅ Camera.vue | ✅ /api/exam/upload, /api/exam/upload-batch | 75% |
| 知识图谱 | ✅ KnowledgeGraph.vue | ✅ /api/knowledge-points | 60% |
| 错题本 | ✅ WrongQuestions.vue | ✅ /api/wrong-question | 70% |
| 练习中心 | ✅ Practice.vue | ⚠️ 部分 API 缺失 | 50% |
| 知识点详情 | ✅ KnowledgeDetail.vue | ⚠️ 部分 API 缺失 | 40% |
| 个人中心 | ✅ Profile.vue | ⚠️ 部分 API 缺失 | 40% |
| 设置页面 | ✅ Settings.vue | ⚠️ 部分 API 缺失 | 30% |

### 🔴 后端缺失的 API 端点

| 端点 | 用途 | 优先级 |
|------|------|--------|
| `GET /api/questions` | 题库列表 (练习中心) | P0 |
| `POST /api/questions` | 生成题目 | P0 |
| `GET /api/questions/:id` | 题目详情 | P1 |
| `POST /api/practice/answer` | 提交练习答案 | P0 |
| `GET /api/practice/sr-queue/:studentId` | 间隔复习队列 | P1 |
| `GET /api/knowledge-graph` | 知识图谱数据 | P0 |
| `GET /api/user/:id/profile` | 用户档案 | P1 |
| `GET /api/user/:id/achievements` | 成就列表 | P1 |
| `GET /api/user/:id/stats` | 用户统计 | P1 |
| `POST /api/user/profile` | 更新档案 | P1 |
| `POST /api/user/preferences` | 更新偏好 | P2 |
| `GET /api/wrong-question/:studentId` | 错题列表 (已有) | - |
| `POST /api/wrong-question/:id/review` | 标记复习 | P1 |
| `POST /api/wrong-question/:id/retry` | 重试错题 | P1 |

---

## 🎯 优化目标与参考标杆

### 参考优秀产品
| 产品 | 优秀之处 | 借鉴方向 |
|------|---------|---------|
| **Khan Academy** | 掌握度追踪、技能树、个性化仪表盘 | 掌握度体系、知识图谱可视化 |
| **Duolingo** | 连续学习天数、XP 系统、排行榜、每日目标 | 游戏化激励、习惯养成 |
| **Quizlet/Anki** | 间隔重复算法 (SM-2)、主动回忆 | 间隔复习算法实现 |
| **Coursera/edX** | 学习进度追踪、证书体系 | 学习路径、成就系统 |
| **Notion/Obsidian** | 知识图谱、双向链接 | 知识图谱交互 |

---

## 📋 详细完善计划

### Phase 1: 后端 API 补全 (Week 1-2) ⚡ P0

#### 1.1 题库与练习 API (services/ai-tutor-backend/src/modules/question/)
- [ ] `GET /api/questions` - 题库列表查询 (支持学科、知识点、难度筛选)
- [ ] `POST /api/question/generate` - AI 动态生成题目 (已有，需完善)
- [ ] `GET /api/questions/:id` - 题目详情
- [ ] `POST /api/practice/answer` - 提交练习答案，返回校验结果
- [ ] `GET /api/practice/sr-queue/:studentId` - SM-2 间隔复习队列

#### 1.2 知识图谱 API
- [ ] `GET /api/knowledge-graph` - 返回节点和边数据 (subject, gradeLevel 参数)
- [ ] `GET /api/knowledge-points` - 知识点列表 (已有，需补充图谱关系字段)

#### 1.3 用户与成就系统
- [ ] `GET /api/user/:id/profile` - 用户档案
- [ ] `PUT /api/user/profile` - 更新档案
- [ ] `GET /api/user/:id/achievements` - 成就列表
- [ ] `GET /api/user/:id/stats` - 学习统计 (总时长、题数、正确率趋势)

#### 1.3 错题本增强
- [ ] `POST /api/wrong-question/:id/review` - 标记复习
- [ ] `POST /api/wrong-question/:id/retry` - 重试错题

---

### Phase 2: 前端核心功能完善 (Week 2-3) ⚡ P0

#### 2.1 练习中心
- [x] 模式选择 (快速/专项/模考/复习/攻克)
- [ ] 题目渲染组件 (支持选择题、填空、简答)
- [ ] 答题交互 (选项选择、输入框、提交验证)
- [ ] 解析展示 (正确/错误反馈、解析展开)
- [ ] 进度条、计时器、题目导航
- [ ] 会话完成统计 (正确率、用时、XP 奖励)
- [ ] 历史记录页面

#### 2.2 错题本增强
- [x] 列表展示 (筛选、搜索)
- [ ] 复习模式 (卡片式、间隔重复)
- [ ] 掌握度滑块 (标记掌握/待复习)
- [ ] 批量操作 (全标掌握、导出)
- [ ] 错因标签编辑

#### 2.3 知识图谱增强
- [x] Canvas 力导向图谱渲染
- [x] 学科切换、缩放平移
- [ ] 节点详情面板 (定义、公式、例题、易错点、相关链接)
- [ ] 学习路径推荐 (基于掌握度 + 前置依赖)
- [ ] 掌握度颜色编码 (红/黄/绿/灰)

#### 2.4 知识点详情页
- [ ] 定义、核心公式 (KaTeX 渲染)
- [ ] 典型例题、易错点
- [ ] 相关知识点跳转
- [ ] 一键开始练习 / 加入错题本

---

### Phase 3: 用户体系与游戏化 (Week 3-4) 🎮 P1

#### 3.1 用户成长体系
- [ ] XP 经验值系统 (答题、连续天数、完美练习奖励)
- [ ] 等级系统 (Lv.1-50，每级 1000 XP)
- [ ] 连续学习天数 (Streak) + 补签卡
- [ ] 每日目标 (默认 15 分钟，可调)

#### 3.2 成就徽章系统
| 成就 | 解锁条件 | XP 奖励 |
|------|---------|--------|
| 初来乍到 | 完成第一节课 | 50 |
| 三天打鱼 | 连续学习 3 天 | 100 |
| 一周坚持 | 连续学习 7 天 | 200 |
| 月度坚持 | 连续学习 30 天 | 1000 |
| 初出茅庐 | 完成 10 道题 | 100 |
| 百炼成钢 | 完成 100 道题 | 500 |
| 题海无涯 | 完成 1000 道题 | 2000 |
| 良好掌握 | 整体掌握度 80% | 300 |
| 登峰造极 | 整体掌握度 95% | 1000 |
| 完美一课 | 单次练习全对 | 200 |

#### 3.3 个人中心页面
- [ ] 头像、等级、XP 进度环
- [ ] 连续学习卡片 (火焰动画)
- [ ] 统计卡片网格 (总时长、题数、正确率、掌握知识点)
- [ ] 能力雷达图 (五维能力)
- [ ] 成就网格 (已解锁/未解锁、进度)
- [ ] GitHub 风格学习热力图 (365 天)
- [ ] 最近活动流

#### 3.4 设置页面
- [ ] 账号管理、自动登录、生物识别
- [ ] 主题 (浅色/深色/跟随系统)、字体大小、紧凑模式
- [ ] 每日目标、偏好学科、题目难度
- [ ] 推送/邮件通知、免打扰时段
- [ ] 音效/触觉反馈、数据导出、清除缓存
- [ ] 危险区 (重置设置、注销账号)

---

### Phase 4: AI 教学质量提升 (Week 4-5) 🤖 P1

#### 4.1 提示词工程优化
- [ ] 统一教学响应格式 (phase/action/suggestedResponse JSON)
- [ ] 状态机驱动的单次 LLM 调用 (generateTeachingResponse)
- [ ] 意图识别 (answer/skip_diagnosis/understood/confused)
- [ ] 苏格拉底式提示词模板优化

#### 4.2 教学模式增强
- [ ] 诊断阶段 (自适应难度、早停机制)
- [ ] 教学阶段 (概念解释 → 例题 → 确认理解)
- [ ] 测验阶段 (自适应难度、即时反馈)
- [ ] 补救教学 (错因分析 → 重新讲解 → 变式题)
- [ ] 多轮对话上下文管理 (滑动窗口 + 摘要)

#### 4.3 答案校验增强
- [ ] 选择题/多选题精确匹配
- [ ] 数值题近似值判断 (1% 容差)
- [ ] 数学表达式等价性判断 (LaTeX 标准化)
- [ ] 文本答案关键词/语义匹配

---

### Phase 5: 知识图谱与推荐系统 (Week 5-6) 🧠 P1

#### 5.1 知识图谱构建
- [ ] 知识点节点 (ID、名称、学科、年级、章节、难度)
- [ ] 前置依赖边 (prerequisite_of)
- [ ] 相关性边 (related_to、similar_to)
- [ ] 掌握度传播算法 (前置节点掌握 → 后置节点解锁)

#### 5.2 智能推荐引擎
- [ ] 基于掌握度的弱点推荐 (Top-K)
- [ ] 基于间隔重复的复习队列 (SM-2 算法)
- [ ] 基于学习路径的下一步推荐 (前置依赖已满足)
- [ ] 新知识点解锁提醒 (前置条件满足时推送)

#### 5.3 学习路径可视化
- [ ] 技能树 / 学习地图 (类 Khan Academy)
- [ ] 当前位置、下一步推荐、旁路学习
- [ ] 进度预估 (完成某知识点预计时长)

---

### Phase 6: 技术债务与性能优化 (Week 6-7) ⚙️ P2

#### 6.1 前端优化
- [ ] 路由懒加载 (defineAsyncComponent)
- [ ] 组件库按需引入 (unplugin-vue-components)
- [ ] 图片懒加载、虚拟列表 (长列表)
- [ ] Service Worker 离线缓存 (PWA)
- [ ] 首屏加载优化 (关键 CSS 内联、预加载关键资源)

#### 6.2 后端优化
- [ ] 数据库索引优化 (常用查询字段)
- [ ] Redis 缓存 (热点知识点、用户会话、题目缓存)
- [ ] 数据库连接池优化
- [ ] API 响应压缩
- [ ] 请求限流、熔断

#### 6.3 代码质量
- [ ] ESLint + Prettier 统一配置
- [ ] TypeScript 严格模式迁移
- [ ] 单元测试覆盖率 > 70% (Vitest)
- [ ] E2E 测试 (Playwright)
- [ ] CI/CD 流水线

---

### Phase 7: 多端适配与发布 (Week 7-8) 📱 P2

#### 7.1 微信小程序适配
- [ ] Canvas 2D 兼容性适配 (知识图谱、雷达图)
- [ ] WebSocket → 微信 SocketTask 适配
- [ ] 文件上传 (chooseImage → uploadFile)
- [ ] 本地存储同步 (uni.setStorageSync)

#### 7.2 H5 部署优化
- [ ] 静态资源 CDN 加速
- [ ] Gzip/Brotli 压缩
- [ ] 首屏骨架屏
- [ ] SEO 元数据、Open Graph

#### 7.3 监控与运维
- [ ] 前端错误监控
- [ ] API 响应时间监控
- [ ] 业务指标看板 (DAU、留存、完成率)
- [ ] 错误告警

---

## 📅 里程碑时间表

| 周次 | 里程碑 | 交付物 |
|------|--------|--------|
| Week 1-2 | **后端 API 补全** | 所有 P0 API 可用，Swagger 文档完整 |
| Week 2-3 | **前端核心功能** | 练习中心、错题本、知识图谱、知识点详情可用 |
| Week 3-4 | **用户体系与游戏化** | XP/等级/成就/设置/个人中心完整可用 |
| Week 4-5 | **AI 教学质量** | 单次 LLM 调用、意图识别、苏格拉底式教学 |
| Week 5-6 | **知识图谱+推荐** | 技能树、智能推荐、学习路径可视化 |
| Week 6-7 | **技术债务清理** | TS 迁移、测试覆盖、CI/CD |
| Week 7-8 | **多端发布** | H5 + 小程序双端发布，监控上线 |

---

## 🛠 技术选型确认

| 层级 | 技术选型 | 备注 |
|------|---------|------|
| 前端框架 | Vue 3 + Composition API | uni-app 跨端 |
| 状态管理 | Pinia + pinia-plugin-persistedstate | 持久化到 uni.storage |
| UI 组件 | 自研组件库 + Ant Design Vue (H5) | 组件库在 `/src/components/ui/` |
| 图表/图谱 | Canvas 2D (原生) + KaTeX | 无重型图表库依赖 |
| 数学公式 | KaTeX | 服务端/客户端同构渲染 |
| 后端框架 | Express + TypeScript (可选迁移) | 当前 JS，建议 TS 迁移 |
| 数据库 | PostgreSQL + pg | 连接池 pg.Pool |
| AI 模型 | NVIDIA Nemotron / StepFun / OpenAI 兼容 | 统一 OpenAI 兼容接口 |
| 实时通信 | WebSocket (ws) + HTTP 轮询降级 | 微信小程序用 SocketTask |
| 缓存 | Redis (可选) / 内存 Map | 热点数据、会话存储 |
| 部署 | Docker + Docker Compose | 统一容器化部署 |

---

## 📝 立即行动项 (本周)

1. **补全后端练习题 API** - `GET/POST /api/questions`, `POST /api/practice/answer`, `GET /api/practice/sr-queue`
2. **补全知识图谱 API** - `GET /api/knowledge-graph` 返回节点/边数据
3. **前端练习中心页面联调** - 完成答题流程、解析展示
4. **知识图谱后端数据生成脚本** - 从知识点表生成图谱 JSON
5. **修复当前报错** - CalendarHeatmap computed 导入、BaseTeachingCard Ant Design 组件替换
6. **API 错误处理统一** - 统一返回格式、错误码、前端错误边界

---

## 📌 备注

- 所有 API 设计遵循 RESTful 规范，统一返回格式：`{ success: boolean, data?: any, error?: string }`
- 前后端约定：学生 ID 默认 `student_001`，后续接入真实用户系统
- AI 模型优先使用 NVIDIA Nemotron / StepFun，支持 OpenAI 兼容格式
- 数学公式统一使用 KaTeX 渲染，前后端同构
- 间隔重复算法采用 SM-2 简化版，前端本地计算 + 后端同步

---

*文档版本: v1.0 | 更新日期: 2025-08-15 | 负责人: AI 助手*