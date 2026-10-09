# GRI 项目共享上下文（供 Claude & Codex 共用）

> 更新时间：2026-10-07 | 版本：v1.0

---

## 🎯 项目核心定位

**GRI** = 以人为本的多行业平台 Monorepo
- **本体驱动架构**：本体 DSL (YAML) → OntologyEngine (OO引擎) → codegen → 迁移 SQL + TS 类型
- **三大业务域**：订餐（消费者）+ AI智能辅导（学生/教材）+ 组织管理台（成员/角色）
- **核心原则**：人的第一视角 → 以人引出万物 → 由万物引出本体

---

## 🏗️ 当前架构状态（重写收敛阶段）

| 组件 | 现状 | 目标 |
|------|------|------|
| 业务后端 | 双后端冻结只读（`services/backend` + `services/ai-tutor-backend`） | 单一 `services/api` (NestJS) |
| 数据库 | `gri_db` + `smartlens` + `gri_auth` 三库 | 单库 `gri` 多 schema + 独立 `gri_auth` |
| 身份域 | 两套不兼容模型 | `auth-center` 统一签发 RS256 JWT |
| 前端 | 3端 uni-app 已收敛 | 保持，仅 API 基址收敛 `/api` |
| 本体底座 | 四件套就绪 | 持续扩展学科版图 |

---

## 📁 关键目录结构

```
/home/ubantu/GRI/
├── apps/
│   ├── web/                    # 订餐 H5 (5174)
│   ├── web-ai-tutor/           # AI 辅导 H5 (5175) — 主要前端增强目标
│   ├── mini-program-ai-tutor/  # AI 辅导微信小程序
│   └── portal/                 # 组织管理台 H5 (5176)
├── services/
│   ├── api/                    # 🆕 单后端目标位置（待建设 M0-M5）
│   ├── auth-center/            # ✅ NestJS 签发中心（已就绪，需接入后端）
│   └── [backend/ ai-tutor-backend/]  # 🔒 冻结只读
├── packages/
│   ├── ontology/               # 本体 DSL 契约 + ontologies/*.yaml 真源
│   ├── ontology-engine/        # OO 引擎（extends/abstract/discriminator/stateMachine）
│   ├── codegen/                # generateSQL (混合模式) + generateTypeScript
│   ├── agent-core/             # AI 教师底座（16工具+状态机）
│   ├── auth-client/            # 前端统一认证客户端
│   └── jwt-verifier/           # JWT 公钥校验（两后端共用）
├── services/api (待建)          # 单后端模块：identity/food/tuition/organization/ontology/auth/infra
└── docs/                       # 单一事实源文档
```

---

## 📚 单一事实源文档（必读）

| 文档 | 用途 | 优先级 |
|------|------|--------|
| `docs/ARCHITECTURE.md` | 现状架构总览（单后端版） | **P0** |
| `docs/GRI_REWRITE_CONSTRUCTION_PLAN.md` | 施工图 M0-M5 里程碑 | **P0** |
| `docs/GRI_REWRITE_TARGET_BLUEPRINT.md` | 重写目标蓝图（为什么合并） | **P0** |
| `docs/GRI_LEGACY_RENOVATION_PLAN.md` | 旧资产改造记录（六片完成） | 参考 |
| `docs/P2_STAGE_B_AUTH_CENTER_DESIGN.md` | auth-center 详细设计 | **P0** |
| `docs/WEB_AI_TUTOR_COMPLETION_PLAN.md` | 前端功能完善计划 | **P1** |
| `docs/FEATURE_COMPLETION_PLAN.md` | 智学慧眼整体功能清单 | 参考 |
| `GRI_LIFECYCLE_MANAGEMENT.md` | 全生命周期管理看板 | **P0** |

---

## 🔴 红线规范（所有代码必须合规）

| 红线 | 核对方式 |
|------|----------|
| **本体驱动** | 所有结构变更 → YAML 真源 → codegen → 迁移 SQL |
| **OO 四特性** | 多态/继承/封装/生命周期在本体中体现 |
| **设计模式** | 有意识应用 GoF 23 种，验收点名模式与理由 |
| **fail-fast** | schema/语义两道门禁 + 库侧 CHECK + 双锚点防漂移 |
| **身份唯一真源** | `external_id ≡ users.id` 仅一处映射 |

---

## 🛠️ 技术栈基线

| 层级 | 技术 | 版本/约束 |
|------|------|-----------|
| 后端框架 | NestJS | 11.x，TypeScript 5.9，严格模式 |
| 数据库 | PostgreSQL | 16，单库多 schema，pg Pool |
| 缓存 | Redis | 7.x |
| 认证 | RS256 JWT | `@gri/jwt-verifier` + auth-center JWKS |
| 前端框架 | Vue 3 + uni-app | Composition API，Pinia |
| UI 组件 | Vant 4 (移动端) | 待选型确认 |
| 数学公式 | KaTeX | 同构渲染 |
| 图谱可视化 | D3.js / Cytoscape.js | 待选型确认 |
| 间隔重复 | SM-2 算法 | 前端本地 + 后端同步 |

---

## 🔐 认证拓扑（关键）

```
auth-center (3004) ── RS256 私钥签发 ──► JWKS 公开端点
       │
       ├─► services/api (3002) ── @gri/jwt-verifier 校验 ──► requireAuth Guard
       ├─► services/backend (冻结)   ── 需接入公钥校验中间件
       └─► services/ai-tutor-backend (冻结) ── 需接入公钥校验中间件
```

**JWT Claims 结构**：
```json
{
  "sub": "<统一主体UUID = identities.id>",
  "domain": "food|tutor",
  "externalId": "<users.id = identities.external_id>",
  "roles": [],
  "iat": 123, "exp": 456, "iss": "gri-auth-center"
}
```

---

## 📦 现有参考实现（Codex 必须遵循的模式）

### auth-center 模块结构（标准）
```
services/auth-center/src/
├── main.ts                      # bootstrap
├── app.module.ts
├── config/config.ts             # 环境配置类
├── auth/
│   ├── auth.controller.ts       # /auth/login, /refresh, /logout, /me, /jwks
│   ├── auth.service.ts          # 密码校验+签发+惰性升级
│   ├── jwt-issuer.service.ts    # RS256 sign/verify/JWKS (jsonwebtoken)
│   ├── refresh-tokens.service.ts
│   └── auth.module.ts
├── users/
│   ├── identity.entity.ts       # 统一身份表映射
│   ├── users.service.ts
│   └── users.module.ts
├── database/
│   ├── database.service.ts      # pg Pool 单例
│   └── database.module.ts
├── migrate/
│   ├── 001_init_identity.sql
│   ├── run-migrations.ts        # 幂等迁移运行器
│   └── seed-from-legacy.ts      # 旧数据迁移
└── infra/                       # logger, error-handler, redis
```

### 代码风格约束
- **TypeScript 严格模式**：`strict: true`、`noImplicitAny: true`、`exactOptionalPropertyTypes: true`
- **ESLint**：`@typescript-eslint` + `prettier`，0 error
- **测试**：Jest，单测覆盖 ≥ 70%，`*.spec.ts` 与源文件同目录
- **命名**：PascalCase 类/接口，camelCase 变量/函数，kebab-case 文件/目录
- **导入**：路径别名 `@/*` → `src/*`，相对导入仅同模块内

---

## 🚀 运行/验证命令

```bash
# 根目录
cd /home/ubantu/GRI

# 全栈测试
npm run test              # 全仓测试
npm run test:api          # 仅后端
npm run test:codegen      # codegen 确定性测试

# TypeScript 检查
npm run tsc               # 全仓 tsc --noEmit

# Lint
npm run lint              # ESLint

# 容器构建
docker compose build      # 所有服务
docker compose build api  # 单服务

# 数据库迁移（api 服务内）
cd services/api
npm run migrate           # 幂等应用 001-016
npm run migrate:status    # 查看已应用迁移
# ⚠️ 新增迁移后必须「先 build 再 migrate」：迁移 SQL 经 nest-cli assets 拷到 dist/migrate/，
#    runner 读的是 dist；未 build 则新 .sql 不在 dist、runner 永不执行。
#    auth-center 同理：cd services/auth-center && npm run build && npm run migrate

# 本体代码生成
cd packages/codegen
npm run generate          # YAML → SQL + TS
npm run test              # 验证生成产物

# K12 课程数据导入
cd scripts/k12-curriculum
npm run import            # maps/*.map.json → PG (幂等)

# 前端开发
cd apps/web-ai-tutor
npm run dev               # 5175
npm run build             # 生产构建
```