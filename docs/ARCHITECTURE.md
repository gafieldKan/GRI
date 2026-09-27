# GRI Monorepo — 架构概览

**日期:** 2026-09-26 | **版本:** 3.0（重写后单后端架构）

> 建设原则（中心思想）：**以人为本——人的第一视角，以人引出万物，由万物引出本体。**
> 本文档描述重写后的现状架构（旧双后端/双库架构已退役，历史报告见 `docs/archive/`）。

---

## 服务边界（现状：单后端 + 单库多 schema + 统一网关）

```
                ┌─────────────────────────────────┐
                │        外部用户 / 客户端          │
                │  (浏览器, 微信小程序)              │
                └──────────────┬──────────────────┘
                               │ HTTPS
                    ┌──────────▼──────────┐
                    │  nginx 统一网关      │
                    │  /        → portal壳 │
                    │  /food/   → web 5174 │
                    │  /tutor/  → ai  5175 │
                    │  /portal/ → 管理台   │
                    │  /api/    → api 3002│
                    │  /auth/   → 认证中心│
                    └──────┬───────┬──────┘
                           │       │
              ┌────────────▼─┐   ┌─▼──────────────┐
              │ services/api │   │ auth-center    │
              │ 单后端全域API │   │ 身份域签发中心  │
              │ (Nest 风格)   │   │ (NestJS)       │
              │ Port: 3002   │   │ Port: 3004     │
              └──────┬───────┘   └──────┬─────────┘
                     │                  │
              ┌──────▼──────────┐  ┌────▼─────────┐
              │ PostgreSQL (gri)│  │ PG (gri_auth) │
              │ 单库多 schema   │  │ identities    │
              │ 47 表 / 6 schema│  │ Port: 5434    │
              │ Port: 5432     │  └──────────────┘
              └────────────────┘
```

**与旧架构的本质差异**（旧双后端已删）：
- 旧 `services/backend`(3002 订餐) + `services/ai-tutor-backend`(3003 AI) 两后端零跨服务调用、同一实体割裂 → **合并为一个 `services/api`**
- 旧 `gri_db.users` / `smartlens.students` 同一「人」三库三套 id → **单库 `gri` 多 schema + `auth.identities` 唯一身份真源 + `users` 业务写真**（`external_id` ≡ `users.id`）
- 旧 auth-center 无法容器化（bcrypt native）→ **bcryptjs 容器化**（3004）

## 端口分配

| 服务 | 端口 | 协议 |
|------|------|------|
| services/api | 3002 | HTTP（nginx `/api/` 转发） |
| services/auth-center | 3004 | HTTP（nginx `/auth/` 转发） |
| apps/web (dev) | 5174 | HTTP（nginx `/food/`） |
| apps/web-ai-tutor (dev) | 5175 | HTTP（nginx `/tutor/`） |
| apps/portal (dev) | 5176 | HTTP（nginx `/portal/`） |
| PostgreSQL (gri) | 5432 | TCP（单库 6 schema） |
| PostgreSQL (gri_auth) | 5434 | TCP |
| Redis | 6379 | TCP |

## 单库 gri 的 schema 划分（迁移 001–014）

| schema | 表数 | 职责 |
|---|---|---|
| public | 10 | users + food 订餐域（orders/餐厅/菜单/支付） |
| auth | 3 | 身份桥（服务间查询面） |
| edu | 15 | K12 学情（students 档案/questions/wrong/练习/计划/授课） |
| tenant | 6 | 组织域（organizations/members/roles/邀请/审计） |
| ontology | 9 | k12 课业真源（subject/school_stage/grade/textbook/chapter/kp/前置桥 + 版图 knowledge_area/area_prerequisite） |
| agent | 6 | 每生 AI 教师（llm_routes/sessions/messages/tool_runs/mcp） |

迁移管线：`src/migrate/*.sql`（001–014）由容器启动时 `run-migrations.js` 幂等应用（`_api_migrations` 跟踪）；其中 011/012/013/014 = 本体 DSL → codegen 生成 + 人工审阅。

## 单后端模块划分（`services/api/src/modules/`）

```
modules/
├── identity/       # 身份桥（/auth/admin/identities 服务间面）
├── food/           # 订餐门面（餐厅/菜单/订单/支付全生命周期）
├── tuition/        # AI 学情门面（题库/练习/考试/计划/报告）
├── curriculum/     # K12 课业目录门面（本体驱动，/api/curriculum/*）
├── ontology/       # 本体语义真源只读内省（+ /api/ontology/stats 开发全流程统计）
├── organization/   # 组织域（树/成员/角色/邀请/审计 + capability 运营探询）
├── dashboard/      # 数据大屏聚合（登录可见）
├── agent/          # 每生 AI 教师（16 工具 + 授课状态机 + 运营台）
database/           # pg Pool 单例（@Global）
auth/               # JWT 中间件（AuthRouter 策略分派 + 公开读白名单一处定义）
config/ migrate/ health/
```

**鉴权拓扑**（施工图 §2）：全局 `app.use('/api', requireAuth)` 默认强制 + `public-routes.ts` 白名单一处定义（游客匿名读仅限冷启动目录）；retired 端点语义 = 匿名 401 / 带 token 404。

## 本体驱动链路（packages 四件套）

```
@gri/ontology（DSL 契约 + ontologies/*.yaml 真源）
  → @gri/ontology-engine（OO 引擎：extends/abstract/discriminator/stateMachine/interfaces 内省）
    → @gri/codegen（generateSQL 混合模式：单表继承基表 + 普通对象并存；generateTypeScript）
      → services/api/src/migrate/*.sql（人工审阅合入）
        → @gri/agent-core（AI 教师底座消费课业真源：curriculum.lookup 等六工具）
```

三份本体真源：`orders.ontology.yaml`（订餐单表继承样板）、`database-orders.ontology.yaml`（落库防漂移锚点）、`k12-curriculum.ontology.yaml`（15 objects，Textbook 抽象基类 + 六学科子类 + 0.4.0 版图两对象）。

## 学科知识版图（0.4.0 版图层，K1–K12 全学段）

- **本体**：KnowledgeArea（领域→知识域两级树；scope k12|frontier，frontier=峰外未学地带）+ KnowledgeAreaPrerequisite（版图 DAG 边）——k12 本体 0.4.0 新增，迁移 014
- **数据真源**：`scripts/k12-curriculum/maps/<subject>.map.json`（六学科，人工审核后入 git）→ `import.mjs` 幂等灌库（code 锚点 + status 门禁 + 真源对齐：消失节点转 archived）
- **更新机制**：改 map json → 重跑 import → API/前端/AI 工具全直读 DB 自动跟随（运行时无缓存无硬编码）
- **研发侧 AI**：map-generate（LLM 整图草案）+ map-patch（缺口年级补口）+ map-translate（术语中文化）→ 人工审核门禁 → 入 git
- **API**：`GET /api/curriculum/knowledge-map?subject=`（领域树 + 前置 DAG + 覆盖比重；匿名出结构、登录叠加掌握度）
- **AI 工具**：map.explorer（第 16 个）——给学生讲「你在山的哪里/前方是什么/顶峰之外还有什么」
- **前端**：web-ai-tutor `pages/knowledge-map`（登峰视图：金字塔分层山体 + 打卡三态 + 云上远峰 + 营地详情）
- **比重口径（诚实方法论）**：覆盖比 = k12 节点 ÷ (k12 + frontier)，按版图节点粒度估算的近似值，页面明示

## 每生 AI 教师（agent-core + /api/agent）

- **一人一 Agent**：跨会话记忆（agent schema 六表），模型前台可切（llm_routes 表即改即生效，apiKey 恒 env 不入库）
- **授课状态机**：设案 → 讲解 → 例题 → 再练（状态存该生记忆，续课不绕 LLM）
- **16 数据工具**：question.lookup / curriculum.lookup / map.explorer / answer.grade / wrong.list / review.sequence / memory.recall-remember-forget / lesson.current-submit / progress.trend / diagnosis.state / plan.generate / lesson.record / plan.complete
- **LLM**：NVIDIA API（OpenAI 兼容，`nvapi-` 前缀门；非真 key 走本地降级）

## 跨模块依赖

| 服务 | 依赖 |
|------|------|
| services/api | PostgreSQL (gri) 多 schema；auth-center JWKS（RS256 公钥拉取） |
| services/auth-center | PostgreSQL (gri_auth)；RS256 密钥对（env 注入） |
| apps/web → /api/food | nginx 网关统一 Bearer |
| apps/web-ai-tutor → /api/agent, /api/tuition | 同上 |
| apps/portal → /api/organizations, /api/ontology/stats | 同上 |
| tools/nat-proxy | 独立工具（frp + ngrok），不依赖运行时 |
