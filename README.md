# GRI — 以人为本的多行业平台 Monorepo

> 人的第一视角，以人引出万物，由万物引出本体 —— 订餐 + AI 智能辅导 + 组织管理

[![License](https://img.shields.io/badge/license-ISC-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-20-green.svg)](https://nodejs.org/)

## 建设原则（中心思想）

**以人为本：人的第一视角。有人的意识才有万物，以人引出万物，由万物引出本体，才使用本体论，以及后面的对象、模式等。**

| 推演链 | GRI 落点 |
|---|---|
| **人**（第一视角） | `auth.identities` 唯一身份真源 + `users`「人」的业务写真；每生独立 AI 教师（一人一 Agent） |
| **以人引出万物** | 订餐（消费者）、K12 学习（学生/教材）、组织协作（成员/角色） |
| **由万物引出本体** | 本体真源 YAML（orders / k12-curriculum）——现实事物的概念结构 |
| **本体 → 对象** | 本体 DSL → OntologyEngine（OO 引擎）→ codegen 生成迁移 SQL/TS 类型 |
| **对象 → 模式** | GoF 23 设计模式有意识应用（门面/工厂/单例/策略/模板方法/状态/观察者/责任链/适配器/组合） |

## 项目简介

GRI 是一个多行业平台 Monorepo（单一后端 + 单库多 schema，本体驱动）：

- **订餐系统** — 完整的点餐、支付、通知、多行业支持（餐饮/批发/物流/农业）
- **AI 智能辅导** — 每生独立 AI 教师，苏格拉底式启发教学，拍照搜题，学情报告
- **组织管理台** — 组织树 / 成员 / 角色 / 邀请 / 审计（portal）
- **本体底座** — 本体 DSL + OO 引擎 + codegen + AI Agent 底座（四个共享包）

## 目录结构

```
GRI/
├── apps/                          # 前端应用 (uni-app)
│   ├── web/                       # 订餐 H5 (端口 5174)
│   ├── web-ai-tutor/              # AI 辅导 H5 (端口 5175)
│   ├── mini-program-ai-tutor/     # AI 辅导微信小程序
│   └── portal/                    # 组织管理台 H5 (端口 5176)
├── services/                      # 后端服务
│   ├── api/                       # 单后端 (Nest 风格, 端口 3002) —— 全域 API
│   └── auth-center/               # 认证中心 (NestJS, 端口 3004)
├── packages/                      # 共享包
│   ├── ontology/                  # 本体 DSL (zod 契约 + ontologies/*.yaml 真源)
│   ├── ontology-engine/           # 本体 OO 引擎 (继承/多态/接口/状态机)
│   ├── codegen/                   # YAML → SQL/TS 确定性生成器 (防漂移)
│   ├── agent-core/                # 浓缩 AI Agent 底座 (工具/记忆/模型路由)
│   ├── jwt-verifier/              # RS256 JWT 校验 (Express/Nest 中间件)
│   └── auth-client/               # 前端鉴权客户端
├── tools/                         # 工具集
│   └── nat-proxy/                 # NAT 穿透代理 (frp + ngrok)
├── docs/                          # 项目文档 (现役方案 + archive/ 历史归档)
├── scripts/                       # 构建脚本 + k12-curriculum 数据管线
├── nginx/                         # 统一网关 (TLS + 路由)
├── styles/                        # 共享设计 tokens (令牌唯一真源)
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
# 启动后端（单后端 Nest 风格）
npm run dev:api            # services/api (3002)

# 启动前端
npm run dev:web            # 订餐 H5 (5174)
npm run dev:web-ai         # AI 辅导 H5 (5175)
npm run dev:mini-ai        # AI 辅导小程序 (mp-weixin)
# portal 经 docker compose 运行（bind-mount dev server, 5176）

# Docker Compose 全栈（含数据库/网关/认证中心）
docker compose up -d
```

### 测试

```bash
npm run test               # services/api jest（全域 API）
npm run test:web-ai        # AI 辅导 H5 前端 (vitest)
npm run test:mini-ai       # AI 辅导小程序 (vitest)
npm run test:ontology      # 本体 DSL 门禁 (node --test)
npm run test:ontology-engine  # 本体 OO 引擎 (node --test)
npm run test:codegen       # SQL/TS 生成器防漂移 (node --test)
npm run test:all           # 全量前端 + packages 测试
npm run test:e2e           # E2E 测试 (需 Docker)
```

### 构建

```bash
npm run build:web          # 订餐 H5
npm run build:web-ai      # AI 辅导 H5
npm run build:portal       # 组织管理台 H5
npm run build:all-h5       # 三 H5 全量
npm run build              # 全 workspaces
```

## 服务端口

| 服务 | 端口 | 说明 |
|------|------|------|
| services/api | 3002 | 单后端全域 API（Nest 风格，nginx `/api/` 转发） |
| services/auth-center | 3004 | 认证中心（NestJS，nginx `/auth/` 转发） |
| apps/web (dev) | 5174 | 订餐 H5 开发服务器 |
| apps/web-ai-tutor (dev) | 5175 | AI 辅导 H5 开发服务器 |
| apps/portal (dev) | 5176 | 组织管理台 H5 开发服务器 |
| PostgreSQL (gri) | 5432 | 单库多 schema（public/auth/edu/tenant/ontology/agent） |
| PostgreSQL (gri_auth) | 5434 | 身份域签发中心库 |
| Redis | 6379 | 共享缓存 |

## 技术栈

**前端**
- Vue 3 + uni-app（订餐 / AI 辅导 / portal，H5 + 微信小程序）
- Pinia（状态管理）+ @gri/auth-client（统一登录态）
- Vite 5（共享设计 tokens，`styles/` 令牌唯一真源）

**后端**
- Node.js 20 + Nest 风格单后端（`services/api`，10 模块）
- NestJS 认证中心（`services/auth-center`，RS256 JWT 签发）
- PostgreSQL 14 单库多 schema（迁移 001–014，`_api_migrations` 跟踪）
- nginx 统一网关（TLS + 路由 + 静态产物）

**AI/Agent**
- @gri/agent-core（工具注册表 / 跨会话记忆 / 模型路由）
- NVIDIA LLM API（`nvapi-` 前缀门，OpenAI 兼容）
- 每生独立 AI 教师：授课状态机（设案→讲解→例题→再练）+ 六数据工具

**本体驱动**
- @gri/ontology DSL（zod 契约 + 语义门禁）→ @gri/ontology-engine（继承/多态/状态机内省）
- → @gri/codegen（YAML → SQL/TS 确定性生成，双防漂移锚点 orders + k12）
- 开发全流程统计：`/api/ontology/stats` + portal 展示页

**工具链**
- npm workspaces (Monorepo)
- GitHub Actions (CI/CD)
- Docker Compose (+ `docker-compose.prod.yml` 生产 overlay)

## 文档

- [重写蓝图](./docs/GRI_REWRITE_TARGET_BLUEPRINT.md) — 为什么只有一个后端
- [重写施工图](./docs/GRI_REWRITE_CONSTRUCTION_PLAN.md) — 单库多 schema + 切片节奏
- [旧资产改造定稿](./docs/GRI_LEGACY_RENOVATION_PLAN.md) — 建设原则 + 基本底线 + 六片执行
- [测试指南](./docs/TESTING.md) / [CI/CD 流水线](./docs/CICD.md)
- 历史报告 → `docs/archive/`（21 篇，架构已退役仅存档）

## 许可证

ISC
