# 智学慧眼 - AI 智能学情分析与互动辅导系统（微信小程序版）

## 项目简介

基于 uni-app 的微信小程序，提供 AI 驱动的苏格拉底式启发教学、拍照搜题、学情报告等功能。

## 启动与开发

```bash
# 安装依赖
npm install

# 微信小程序开发模式
npm run dev:weixin

# H5 开发模式（浏览器预览）
npm run dev:h5

# 微信小程序构建
npm run build:weixin

# 运行测试
npm run test:run
```

## 目录结构

```
mini-program-ai-tutor/
├── api/                  # API 接口层（uni.request 封装）
│   └── index.js          # 会话、报告、题库、错题、WebSocket API
├── components/           # 公共组件
│   ├── KnowledgeGraph.vue  # 知识点图谱
│   ├── MathInput.vue     # 数学输入（公式工具栏）
│   └── TeachingCard.vue  # 教学卡片（定义/公式/示例/易错点）
├── pages/                # 页面
│   ├── index/            # 首页（功能入口 + 学习概览）
│   ├── chat/             # AI 互动辅导（聊天 + 题目作答）
│   ├── report/           # 学情报告（学习统计 + 薄弱点）
│   └── camera/           # 拍照搜题（uni.chooseImage）
├── store/                # Pinia 状态管理
│   ├── session.js        # 会话状态（FSM + WebSocket）
│   ├── report.js         # 学情报告（掌握度统计）
│   └── user.js           # 用户档案
├── utils/                # 工具函数
│   ├── katex-helper.js   # 数学公式处理（小程序版）
│   └── ws-client.js      # WebSocket 客户端（uni.connectSocket）
├── static/               # 静态资源（tabbar 图标等）
├── tests/                # 测试文件
├── App.vue               # 根组件
├── main.js               # 入口文件
├── pages.json            # 页面配置 + tabbar
├── manifest.json         # 应用配置（微信权限等）
├── project.config.json   # 微信开发者工具配置
├── app.json              # 小程序组件注册
└── package.json          # 依赖 + 脚本
```

## 小程序专属适配

### 网络请求
- 使用 `uni.request` 替代浏览器的 `fetch`
- 生产环境需配置 HTTPS 接口地址

### WebSocket
- 使用 `uni.connectSocket` (封装了 `wx.connectSocket`)
- 提供自动重连、心跳保活、消息队列

### LaTeX 数学公式
- 小程序不支持 Katex 客户端渲染（依赖 DOM API）
- 方案：将公式标记为 `<span class="math-inline" data-latex="...">` 
- 后续可通过后端 API 将 LaTeX 渲染为 SVG/图片

### UI 组件库
- 使用 `tdesign-miniprogram` (npm 包方式)
- 组件通过 `app.json` 的 `usingComponents` 注册

### 包体积控制
- 构建时排除 node_modules（通过 project.config.json）
- tdesign-miniprogram 按需引入特定组件
- Katex 不引入（使用标记方案替代）

## 后端依赖

需要启动 `services/ai-tutor-backend` (端口 3003)，提供以下 API:
- `/api/session` — 创建学习会话
- `/api/session/:id/message` — 发送消息
- `/api/analysis/report/:studentId` — 学情报告
- `/api/exam/upload` — 拍照上传
- `/api/question/list` — 题库列表
- `/api/wrong-question/list` — 错题列表

## Tabbar 图标

需要在 `static/tabbar/` 放置以下 40x40px PNG 图标:
- `home.png` / `home-active.png` — 首页
- `chat.png` / `chat-active.png` — AI 辅导
- `report.png` / `report-active.png` — 学情
- `camera.png` / `camera-active.png` — 拍照