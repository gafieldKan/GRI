# 智学慧眼 - AI 智能学情分析与互动辅导系统

## 项目介绍

智学慧眼 (SmartLens) 是一款基于 AI 的 K12 学情分析与互动辅导系统，采用 Uni-app 跨平台框架开发，支持微信小程序、H5、App 多端运行。

## 核心功能

- **AI 互动辅导**: 苏格拉底式启发教学，一对一互动讲解
- **拍照搜题**: 拍照上传题目，AI 即时诊断
- **学情报告**: 动态追踪知识点掌握度，生成学习报告
- **知识图谱**: 可视化展示知识体系与薄弱环节

## 技术栈

| 技术 | 版本 | 说明 |
|------|------|------|
| Uni-app | v3 | 跨平台框架 |
| Vue | 3.4+ | 前端框架 |
| Pinia | 2.1+ | 状态管理 |
| TDesign | 1.6+ | UI 组件库 |
| KaTeX | 0.16+ | 公式渲染 |

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式 (微信小程序)
npm run dev:weixin

# 开发模式 (H5)
npm run dev:h5

# 生产构建 (微信小程序)
npm run build:weixin

# 生产构建 (H5)
npm run build:h5
```

## 目录结构

```
apps/web-ai-tutor/
├── pages/              # 页面
│   ├── index/          # 首页
│   ├── chat/           # AI 对话页
│   ├── report/         # 学情报告页
│   └── camera/         # 拍照页
├── components/         # 公共组件
│   └── MathInput.vue   # 数学公式输入器
├── store/              # Pinia 状态管理
├── utils/              # 工具函数
├── api/                # API 接口
├── static/             # 静态资源
├── App.vue             # 应用入口
├── main.js             # 入口文件
├── pages.json          # 页面配置
├── manifest.json       # 应用配置
└── vite.config.js      # Vite 配置
```

## 开发规范

- 使用 Vue 3 Composition API
- 使用 TypeScript (可选)
- 遵循 Uni-app 开发规范
- 遵循 ESLint 代码规范

## 相关链接

- [Uni-app 文档](https://uniapp.dcloud.net.cn/)
- [Vue 3 文档](https://vuejs.org/)
- [TDesign 文档](https://tdesign.tencent.com/)
- [KaTeX 文档](https://katex.org/)
