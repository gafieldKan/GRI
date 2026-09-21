# 智学慧眼 - AI 学情辅导后端服务

## 项目介绍

智学慧眼 (SmartLens) 后端服务，提供 AI 互动教学、学情分析、知识点追踪等核心功能。

## 技术栈

| 技术 | 说明 |
|------|------|
| Node.js | 运行时环境 |
| Express | Web 框架 |
| WebSocket | 实时通信 |
| PostgreSQL + pgvector | 数据存储与向量检索 |
| Anthropic API | 大模型调用 |

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env` 并填写配置：

```bash
PORT=3002
DB_HOST=localhost
DB_PORT=5432
DB_NAME=smartlens
DB_USER=admin
DB_PASSWORD=your_password
LLM_API_KEY=your_api_key
```

### 3. 初始化数据库

```bash
# 执行数据库迁移
node src/migrate.js init
```

### 4. 启动服务

```bash
# 开发模式
npm run dev

# 生产模式
npm start
```

## 目录结构

```
ai-tutor-backend/
├── src/
│   ├── index.js              # 应用入口
│   ├── migrate.js            # 数据库迁移脚本（执行 migrations/ 目录）
│   ├── db/                   # （已废弃，迁移统一由 migrations/ 管理）
│   ├── modules/
│   │   ├── session/          # 会话管理模块
│   │   │   └── SessionFSM.js # AI 教学状态机
│   │   ├── ai/               # AI 服务模块
│   │   │   └── AIService.js  # 大模型调用
│   │   ├── question/         # 题目服务模块
│   │   │   └── QuestionService.js
│   │   └── report/           # 学情报告模块
│   │       └── ReportService.js
│   └── config/               # 配置文件
├── test/                     # 测试文件
├── .env                      # 环境变量
└── package.json
```

## API 文档

### 健康检查
```
GET /health
```

### 创建会话
```
POST /api/session
Body: { "studentId": "s1", "knowledgePointId": "math_pythagorean" }
```

### 获取会话状态
```
GET /api/session/:sessionId
```

### WebSocket 通信
````
ws://localhost:3002/ws

发送消息格式:
{
  "sessionId": "session_xxx",
  "action": "SUBMIT_ANSWER",
  "payload": { "answer": "5" }
}
```

## 状态机流转

```
WAIT_START → DIAGNOSING → ANALYZING → TEACHING → INTERACTION
                                                   ↓
CHECK_UNDERSTAND ← INTERACTION ← TEACHING ← ANALYZING
    ↓
QUIZZING → EVAL_QUIZ → EXPAND (掌握)
           ↓
       REMEDIATE (未掌握)
```

## 开发规范

- 使用 ES Module 语法
- 遵循异步优先原则
- 所有 API 返回统一格式
- 错误处理完善

## 相关项目

- [智学慧眼前端](../apps/web-ai-tutor/) - Uni-app 前端应用
