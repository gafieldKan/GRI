# 智学慧眼 SmartLens - AI 学情辅导系统

\*\*版本\*\*: v5.1  
**完成日期**: 2026 年 5 月 26 日  
**项目状态**: Phase 5 完成 - 答案校验功能完成

---

## 项目简介

智学慧眼 (SmartLens) 是一款基于 AI 的 K12 学情分析与互动辅导系统，采用苏格拉底式教学法，通过 11 状态 AI 状态机实现一对一互动讲解。

### 核心特性

- **AI 教学状态机**: 11 状态流转，基于苏格拉底式教学法
- **完整教学流程**: 诊断 → 分析 → 教学 → 测验 → 评估
- **答案自动校验**: 支持选择题和填空题的智能批改
- **实时通信**: WebSocket + HTTP 双模式
- **跨平台支持**: Uni-app 框架，支持微信小程序/H5/App
- **LaTeX 公式**: 支持数学公式渲染
- **容器化部署**: Docker + PostgreSQL

---

## 快速开始

### 环境要求

- Node.js >= 18
- PostgreSQL >= 14
- Docker (可选，用于数据库)

### 1. 安装依赖

```bash
# 根目录安装
cd /home/ubantu/GRI
npm install

# 后端服务安装
cd services/ai-tutor-backend
npm install
```

### 2. 配置环境变量

编辑 `services/ai-tutor-backend/.env` 文件：

```bash
# 服务端口
PORT=3002

# 数据库配置
DB_HOST=localhost
DB_PORT=5432
DB_NAME=smartlens
DB_USER=postgres
DB_PASSWORD=postgres

# NVIDIA API 配置（可选）
LLM_API_KEY=nvapi-xxx
LLM_API_URL=https://integrate.api.nvidia.com/v1/chat/completions
LLM_MODEL=nvidia/nemotron-3-super-120b-a12b
```

### 3. 初始化数据库

```bash
# 启动 PostgreSQL 容器
docker run --name gri-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:14

# 创建数据库
docker exec -i gri-postgres createdb -U postgres smartlens

# 执行初始化脚本
docker exec -i gri-postgres psql -U postgres -d smartlens -f src/db/init.sql
```

### 4. 启动服务

```bash
# 启动后端服务
cd services/ai-tutor-backend
node src/index.js

# 服务运行在 http://localhost:3002
```

### 5. 访问前端

打开浏览器访问测试页面：
```
file:///home/ubantu/GRI/apps/web-ai-tutor/test.html
file:///home/ubantu/GRI/apps/web-ai-tutor/test-full.html
```

---

## 功能模块

### 已完成功能

| 模块 | 状态 | 说明 |
|------|------|------|
| 题库数据 | ✅ 完成 | 32 道题目（诊断 9+ 教学 2+ 测验 14+ 原始 5） |
| AI 状态机 | ✅ 完成 | 11 状态流转 |
| 答案校验 | ✅ 完成 | 选择题/填空题自动批改 |
| 数据库集成 | ✅ 完成 | PostgreSQL + 连接池 |
| 前端聊天 | ✅ 完成 | 基础对话功能 |
| 测试页面 | ✅ 完成 | test.html / test-full.html |

### 待完成功能

| 优先级 | 功能 | 说明 |
|--------|------|------|
| P0 | AI 真实响应 | 调用 NVIDIA API 生成教学响应 |
| P0 | 教学讲解展示 | 前端显示教学卡片 |
| P1 | 知识图谱 | 可视化展示知识点掌握 |
| P1 | OCR 拍照 | 拍照搜题功能 |

---

## API 接口

### 健康检查
```bash
GET /health
```

### 创建会话
```bash
POST /api/session
Body: {"studentId": "s1", "knowledgePointId": "math_pythagorean"}
```

### 发送消息
```bash
POST /api/chat
Body: {"sessionId": "xxx", "message": "你好"}
```

### WebSocket 通信
```
ws://localhost:3002/ws
```

---

## 项目结构

```
GRI/
├── apps/
│   └── web-ai-tutor/        # 前端应用
│       ├── pages/chat/      # 聊天页面
│       ├── test.html        # 测试页面
│       └── test-full.html   # 完整流程测试
├── services/
│   └── ai-tutor-backend/    # 后端服务
│       ├── src/
│       │   ├── index.js     # 服务入口
│       │   ├── modules/     # 模块
│       │   │   ├── session/ # 会话模块
│       │   │   ├── ai/      # AI 模块
│       │   │   └── question/# 题目模块
│       │   └── db/          # 数据库
│       └── .env             # 环境变量
└── docs/
    └── ai-tutor/            # 项目文档
```

---

## 测试流程

### 1. 创建会话并触发诊断
```bash
curl -X POST http://localhost:3002/api/session \
  -H "Content-Type: application/json" \
  -d '{"studentId":"test","knowledgePointId":"math_pythagorean"}'
```

### 2. 发送消息开始学习
```bash
curl -X POST http://localhost:3002/api/chat \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"xxx","message":"你好"}'
```

### 3. 提交答案
```bash
curl -X POST http://localhost:3002/api/chat \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"xxx","message":"我选择 5"}'
```

---

## 技术栈

| 技术 | 版本 | 说明 |
|------|------|------|
| Node.js | 18+ | 运行环境 |
| Express | 4.x | Web 框架 |
| PostgreSQL | 14+ | 数据库 |
| Uni-app | 3.x | 前端框架 |
| Vue 3 | 3.x | 前端框架 |
| NVIDIA API | - | 大模型调用 |

---

## 相关文档

- [REMAINING_WORK.md](./REMAINING_WORK.md) - 待完成工作清单
- [FINAL_REPORT_v4.md](./FINAL_REPORT_v4.md) - Phase 4 报告
- [TEST_PLAN.md](./TEST_PLAN.md) - 测试计划
- [NVIDIA_API_CONFIG.md](./NVIDIA_API_CONFIG.md) - API 配置指南

---

**实施团队**: Claude Code  
**版本**: v5.0  
**最后更新**: 2026-05-26
