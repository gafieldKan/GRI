# GRI Monorepo — 架构概览

**日期:** 2026-07-16 | **版本:** 2.0

---

## 服务边界

```
                    ┌─────────────────────────────────┐
                    │        外部用户 / 客户端          │
                    │  (浏览器, 微信小程序, 原生 App)    │
                    └──────────────┬──────────────────┘
                                   │
           ┌───────────────────────┼───────────────────────┐
           │                       │                       │
    ┌──────▼──────┐         ┌──────▼──────┐         ┌──────▼──────┐
    │  apps/web   │         │ apps/web-   │         │ apps/mini-  │
    │  (uni-app)  │         │  ai-tutor   │         │  program-   │
    │  点餐 H5    │         │  (uni-app)  │         │  ai-tutor   │
    │  Port: 5174 │         │  AI辅导 H5  │         │  (uni-app)  │
    └──────┬──────┘         │  Port: 5175 │         │  AI辅导小程序│
           │               └──────┬──────┘         └──────┬──────┘
           │                      │                       │
    ┌──────▼──────────────────────▼───────────────────────▼──────┐
    │                      API Gateway / Nginx (可选)            │
    └──────┬──────────────────────────────────┬─────────────────┘
           │                                  │
    ┌──────▼──────┐                    ┌──────▼──────┐
    │ services/   │                    │ services/   │
    │  backend    │                    │  ai-tutor-  │
    │  (Express)  │                    │   backend   │
    │  Port: 3002 │                    │  (Express)  │
    │             │                    │  Port: 3003 │
    │  DDD 架构   │                    │  DDD 架构   │
    └──┬────┬─────┘                    └──┬────┬─────┘
       │    │                             │    │
       │    │    ┌─────────────────────┐  │    │
       │    └────┤  Redis 7 (共享缓存)  ├──┘    │
       │         └─────────────────────┘       │
       │                                       │
  ┌────▼────┐                          ┌───────▼──────┐
  │  PG 14  │                          │ PG 16 +      │
  │  gri_db │                          │ pgvector     │
  │  订餐数据│                          │ smartlens    │
  └─────────┘                          │ AI辅导向量数据│
                                       └──────────────┘
```

## 端口分配

| 服务 | 端口 | 协议 |
|------|------|------|
| services/backend | 3002 | HTTP + WebSocket |
| services/ai-tutor-backend | 3003 | HTTP + WebSocket |
| apps/web (Vite) | 5174 | HTTP |
| apps/web-ai-tutor (Vite) | 5175 | HTTP |
| PostgreSQL (gri_db) | 5432 | TCP |
| PostgreSQL (smartlens) | 5433 | TCP |
| Redis | 6379 | TCP |

## DDD 架构模式

两个后端服务均采用领域驱动设计 (DDD) 模式：

```
src/
├── domain/           # 领域模型 (实体, 值对象, 聚合根)
├── services/         # 领域服务 (业务逻辑)
├── api/              # 应用层 (路由, 控制器)
├── infra/            # 基础设施层 (数据库, 缓存, 外部 API)
├── modules/          # 模块 (FSM, AI, Question, Report)
└── agents/           # AI Agent (智能体)
```

### Backend (订餐) 分层

```
src/
├── domain/           # Order, PaymentInfo 等领域模型
├── services/         # OrderService, PaymentService, FeeCalculationService
│   └── notification/ # 通知服务 (SMS, Email, Push)
├── api/
│   ├── routes/       # 路由注册
│   ├── merchant/     # 商户管理
│   ├── organization/ # 组织管理
│   └── payment/      # 支付控制器
├── infra/
│   ├── db.js         # PostgreSQL (kysely)
│   ├── redis.js      # Redis
│   └── repository/   # Repository 实现
├── core/             # 核心框架
│   ├── model/        # BaseModel, Role, User
│   ├── service/      # RuleService, ResourceRegistry
│   ├── rule/         # RuleEngine, RuleTypes
│   └── repository/   # BaseRepository
└── industries/       # 行业模块
    ├── C56_Restaurant/   # 餐饮业
    ├── G46_Wholesale/    # 批发业
    └── ...
```

### AI Tutor Backend 分层

```
src/
├── modules/
│   ├── session/      # SessionFSM (11 状态 Moore 状态机)
│   ├── ai/           # AIService (LLM API 集成)
│   ├── question/     # QuestionService (题库管理)
│   └── report/       # ReportService (学情报告生成)
└── agents/
    ├── TutorAgent.js         # 苏格拉底式教学智能体
    ├── ExamScannerAgent.js   # 试卷扫描智能体
    ├── QuestionGeneratorAgent.js  # 出题智能体
    └── PlanAgent.js          # 学习计划智能体
```

## SessionFSM 状态机

AI 辅导系统的核心是 11 状态 Moore 有限状态机：

```
WAIT_START → DIAGNOSING → ANALYZING → TEACHING
                                         │
                              ┌──────────┼──────────┐
                              │          │          │
                          QUIZZING   INTERACTION  EXPAND
                              │          │          │
                          EVAL_QUIZ      │          │
                              │          │          │
                    ┌─────────┴──────────┴──────────┘
                    │
              REMEDIATING ←→ MASTERED → COMPLETED
```

## 数据流

### 订餐流程
```
用户 → Web/Mini → API Routes → OrderService → OrderRepository → PostgreSQL
                         │
                    PaymentService → WeChatPay/Alipay
                         │
                    NotificationService → SMS/Email/Push
```

### AI 辅导流程
```
用户 → Web/Mini → SessionFSM → AIService → NVIDIA API (LLM)
                    │               │
              QuestionService  ReportService
                    │               │
              PostgreSQL      PostgreSQL
              (题库)          (学情记录)
```

## 跨模块依赖

| 服务 | 依赖 |
|------|------|
| services/backend | PostgreSQL 14 (gri_db), Redis 7 |
| services/ai-tutor-backend | PostgreSQL 16 + pgvector (smartlens), Redis 7, NVIDIA LLM API |
| apps/web | services/backend (3002) |
| apps/web-ai-tutor | services/ai-tutor-backend (3003) |
| apps/mini-program-ai-tutor | services/ai-tutor-backend (3003) |
| packages/lowcode | 独立部署，内嵌 FRP/ngrok 管理插件 |
| tools/nat-proxy | 独立工具，用于内网穿透 |