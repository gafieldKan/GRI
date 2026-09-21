# GRI — 多行业平台 Monorepo

> 订餐系统 + AI 智能辅导 + 低代码平台

[![License](https://img.shields.io/badge/license-ISC-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-20-green.svg)](https://nodejs.org/)

## 项目简介

GRI 是一个多行业平台 Monorepo，包含三大核心系统：

- **订餐系统** — 完整的点餐、支付、通知、多行业支持（餐饮/批发/物流/农业）
- **AI 智能辅导** — 苏格拉底式启发教学，11 状态 FSM 会话引擎，拍照搜题，学情报告
- **低代码平台** — 可视化页面搭建，FRP 内网穿透管理

## 目录结构

```
GRI/
├── apps/                          # 前端应用
│   ├── web/                       # 订餐 Web 端 (uni-app)
│   ├── web-ai-tutor/              # AI 辅导 H5 (uni-app)
│   ├── mini-program/              # 订餐微信小程序
│   └── mini-program-ai-tutor/     # AI 辅导微信小程序
├── services/                      # 后端服务
│   ├── backend/                   # 订餐后端 (Express, 端口 3002)
│   └── ai-tutor-backend/          # AI 辅导后端 (Express, 端口 3003)
├── packages/                      # 共享包
│   └── lowcode/                   # 低代码平台 (React + Ant Design)
├── tools/                         # 工具集
│   └── nat-proxy/                 # NAT 穿透代理 (frp + ngrok)
├── docs/                          # 项目文档
│   ├── ARCHITECTURE.md            # 架构概览
│   ├── TESTING.md                 # 测试指南
│   └── CICD.md                    # CI/CD 流水线
├── scripts/                       # 构建 & E2E 脚本
├── docker-compose.yml             # 全栈 Docker 编排
└── .github/workflows/             # CI 配置
```

## 快速开始

### 安装依赖

```bash
npm install
```

### 开发

```bash
# 启动后端服务
npm run dev              # 同时启动 backend (3002) + ai-tutor-backend (3003)

# 启动前端
npm run dev:web          # 订餐 Web (5174)
npm run dev:web-ai       # AI 辅导 H5 (5175)
npm run dev:mini-ai      # AI 辅导小程序

# Docker Compose 全栈 (含数据库)
docker compose up -d
```

### 测试

```bash
npm run test:backend     # 订餐后端
npm run test:ai-tutor    # AI 辅导后端
npm run test:web-ai      # AI 辅导 H5 前端
npm run test:mini-ai     # AI 辅导小程序
npm run test:all         # 全量测试
npm run test:e2e         # E2E 测试 (需 Docker)
```

### 构建

```bash
npm run build            # 构建所有
npm run build:web        # 订餐 Web
npm run build:web-ai     # AI 辅导 H5
npm run build:backend    # 订餐后端
```

## 服务端口

| 服务 | 端口 | 说明 |
|------|------|------|
| services/backend | 3002 | 订餐 API |
| services/ai-tutor-backend | 3003 | AI 辅导 API + WebSocket |
| apps/web (dev) | 5174 | 订餐 H5 开发服务器 |
| apps/web-ai-tutor (dev) | 5175 | AI 辅导 H5 开发服务器 |
| PostgreSQL (gri_db) | 5432 | 订餐数据库 |
| PostgreSQL (smartlens) | 5433 | AI 辅导数据库 |
| Redis | 6379 | 共享缓存 |

## 技术栈

**前端**
- Vue 3 + uni-app (订餐/AI 辅导)
- React 19 + Ant Design 6 (低代码平台)
- Pinia (状态管理)
- Vite 5

**后端**
- Node.js 20 + Express
- PostgreSQL 14/16 + pgvector
- Redis 7
- WebSocket (ws)

**AI/ML**
- NVIDIA Nemotron-3 LLM API
- SessionFSM (11 状态 Moore 状态机)

**工具链**
- npm workspaces (Monorepo)
- GitHub Actions (CI/CD)
- Docker Compose

## 文档

- [架构概览](./docs/ARCHITECTURE.md)
- [测试指南](./docs/TESTING.md)
- [CI/CD 流水线](./docs/CICD.md)

## 许可证

ISC