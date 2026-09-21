# GRI 重写目标蓝图：单一后端 + 收敛领域模型

> 状态：蓝图 v1（设计定稿） | 日期：2026-09-14
> 本文回答一个核心架构问题：**为什么会有两个后端？重写后应该只有一个。**

---

## 0. 结论先行

**「两个后端」是历史演进的遗留，不是架构必然。重写后 GRI 只有一个业务后端。**

旧项目存在三个并发 bug 级的架构问题，中间那个正是「两后端」：

| # | 问题 | 旧项目现状（2026-09-14 实测） | 重写目标 |
|---|---|---|---|
| 1 | **两业务后端** | `services/backend`(3002, 订餐) + `services/ai-tutor-backend`(3003, AI)，零跨服务调用，纯历史分叉 | **一个 `services/api`（或 `backend`）** |
| 2 | **两数据库域 + 同一实体割裂** | `gri_db.users`(uuid) 与 `smartlens.students`(varchar) 是同一个「人」的两个投影，靠 JWT `external_id` 跨域映射 | **一个库，`users` 单表 + `students` 作为 `users` 的角色/档案扩展** |
| 3 | **auth-center 无法容器化** | `bcrypt` native 编译在 alpine 失败，只能宿主机 `npm run start:prod` | 纯 JS `bcryptjs`（或预编译二进制层），CI/CD 可构建 |

---

## 1. 为什么旧项目会有两个后端（根因）

这是**两次独立开发叠加**的产物，不是刻意设计的微服务：

1. 先做了「订餐」→ 建了 `services/backend` + `gri_db`。
2. 后做了「AI 辅导」→ 另起 `services/ai-tutor-backend` + `smartlens`，各带 Dockerfile、package-lock、迁移。

**分拆换来了什么？** 实测：**无**。两个后端共享 `@gri/jwt-verifier` 但各自解释 `externalId`（一个映射 `users.id`，一个映射 `students.id`）、各自挂 `requireAuth`；无独立团队、无独立扩缩容、无独立发布节奏、无任何跨服务调用。**成本全是重复，收益为零**——这正是"概括能力判断合并"的证据。

**微服务的适用条件**（GRI 一条都不满足）：
- 独立团队自治 ❌（单团队）
- 独立数据所有权 ❌（`users`/`students` 本是同一实体，反被割裂）
- 独立扩缩容需求 ❌（同一批用户量、同一发布节奏）
- 独立故障域/异质技术栈 ❌（都是 Express + pg + redis + zod）

**结论**：这不是「合并两个后端」，而是「重写时根本不会产生两个」。你在旧项目里感受到的别扭（`synFromAuth` 拼写错、`req.user` 恒空、`x-user-id` opaque header、`ApiGenerator` 隐式生成路由、两库割裂），都是**分叉 + 腐化**的必然结果——重写就是推倒这层。

---

## 2. 目标架构（重写后）

```
外部用户 (浏览器 / 微信小程序 / 原生 App)
            │
   ┌────────▼────────┐
   │  nginx 网关      │  / → portal · /api → 业务后端 · /auth → 签发中心 · /ws
   └────────┬────────┘
            │
   ┌────────▼──────────────────────────┐
   │  services/api（唯一业务后端）      │  ← 单点，Express(或 Nest 化见 §6)
   │  · 订餐域 · AI 辅导域 · 组织/主数据│
   │  · 统一挂 requireAuth（一处边界）  │
   └────────┬──────────────┬───────────┘
            │              │
   ┌────────▼───────┐  ┌──▼───────────────┐
   │ services/      │  │ services/        │
   │ auth-center    │  │ (身份真源)        │
   │ NestJS 签发中心│  │  独立、只签发 JWT │
   └────────┬───────┘  └──────────────────┘
            │
   ┌────────▼────────────────────────┐
   │  PostgreSQL（单库 `gri`）        │  users + students(档案) + orders
   │  · schema 分域：auth / food /   │  + organizations + 学情表 + 本体表
   │    edu / tenant / ontology      │
   └─────────────────────────────────┘
   + Redis（缓存/会话共用）
```

**关键变化**：
- 业务后端从 **2 → 1**（`services/backend` 与 `services/ai-tutor-backend` 合成 `services/api`）。
- **DB 从 2+1 → 1**：`gri_db` + `smartlens`（+ 独立 `gri_auth` 身份库可选保留）收敛为单库，用 **schema 分区**（`auth` / `food` / `edu` / `tenant` / `ontology`）做逻辑隔离，而非物理分库。
- **`auth-center` 保留独立**：它是「身份签发」这一有界上下文，职责单一（签发/校验/刷新/登出/JWKS），独立是可辩护的（安全边界、独立密钥生命周期）。但业务后端**只有一个**。

---

## 3. 领域模型收敛（核心：users / students 合一）

这是重写最该根治、也最有前瞻价值的一处。旧模型：

```
gri_db.users(id uuid, username, email, phone, password_hash, ...)      ← 订餐消费者
smartlens.students(id varchar, name, grade, parent_id, textbook_version, school, ...) ← AI 学生
auth-center identities(id, domain, username, external_id, ...)         ← 身份域
```

**三者是同一个「人」**，却被拆成三个库三套 id，靠 JWT `external_id` 翻译。

**重写目标模型（单一身份真源 + 角色档案）**：

```
auth.identities          — 登录凭证域（唯一身份真源，auth-center 只管这张）
  id(uuid, 统一主体 id), domain, username, email, phone, password_hash, status

users(user_profile)      — 「人」的业务写真（业务库，外键引用 identity）
  id(uuid, 业务主键 = identities.external_id), identity_id, name, avatar,
  role: 'student' | 'consumer' | 'merchant' | 'operator', ...

students                 — 学习档案（users 的 1:0..1 扩展，仅 role=student 时存在）
  user_id(uuid, 主键 = users.id), grade, parent_id, textbook_version, school, ...
```

**语义**：
- **登录态** = `auth.identities`（auth-center 独占，签发 JWT 的 `sub`）。
- **业务主键** = `users.id`（= JWT `external_id`），所有业务表（订单/学情/组织成员）统一 `FOREIGN KEY → users.id`。
- **学生** 不再独立表级主键，而是 `users` 的高内聚扩展档。一个 `users` 行可以是消费者、也可以是学生（甚至二者兼具：家长订餐 + 家长孩子学情）。
- 这消灭了旧项目最别扭的「JWT external_id → users.id / students.id 分叉映射」——**只剩一处映射：`external_id` ≡ `users.id`**。

**迁移路径（重写时一次性收敛，不兼容旧项目）**：
1. 新 DB 建统一 schema：`auth.identities`、`public.users`、`edu.students`（`user_id` FK）。
2. 一次性 ETL：旧 `users`（uuid）→ 新 `users`（保留 uuid）；旧 `students`（varchar）→ 新 `edu.students`（`user_id` 回填关联到新 `users`，若无对应 user 则先造一个 `users` 行 + 一个 `auth.identities`）。
3. 删旧三库，业务后端只连单库。

---

## 4. 单一后端的模块划分（不再拆服务）

一个 `services/api` 内按**模块（module）**划分，不按服务（service）划分：

```
services/api/src/
├── modules/
│   ├── auth/          # 对接 auth-center（requireAuth 中间件、JWKS 缓存）
│   ├── identity/      # 用户/学生档案 CRUD（收敛后的 users + students）
│   ├── food/          # 餐厅/菜品/订单/支付
│   ├── tuition/       # 学情：试卷识别、知识点、练习、计划、错题本、报告
│   ├── organization/  # 组织/成员/角色/邀请（读公开、写登录）
│   ├── master-data/   # 主数据（尊本体引擎）
│   └── ontology/      # 本体四件套的门面（复用 P1 底座）
├── infra/             # db 池、redis、auth、error-handler、logger
└── bootstrap/         # 路由注册、中间件链、生命周期
```

- AI 的 Agent（ExamScanner/Tutor/QuestionGenerator/Plan）+ WebSocket + 上传/PDF 全部作为 `tuition` 模块的**子模块**，不再是独立服务。
- `requireAuth` 只在一处定义、一处挂接（全局 `app.use('/api', requireAuth)` + 白名单公开读），消灭「两个后端各自挂」的重复。
- 路由结构从此对齐领域，而不是对齐「历史上有几个服务」。

---

## 5. 主题/前端保持不变（已收敛的部分不动）

三前端（web / web-ai-tutor / mini-program-ai-tutor）**已经是 uni-app + 统一设计令牌 + `@gri/auth-client`**，阶段 C 已收敛，重写**不动前端骨架**，只将 api base 从「分后端」指向统一 `/api`：
- `services/api` 提供 `/api/*` 全家桶（订餐 + AI 都归它）。
- 前端无需关心「订餐 vs AI 是两个后端」——因为它们从来都该是一个。

`packages/` 底座（auth-client / jwt-verifier / ontology / ontology-engine / codegen）**全部保留**，它们是 P1/P2 已经打牢的资产。

---

## 6. 开放决策点（需用户拍板，不阻塞蓝图）

1. **业务后端技术栈**：沿用 Express（现有两后端都是 Express，合并成本低）vs 跟随 auth-center 走 NestJS（全仓统一 TS + Nest，前瞻性更好，但重写量更大）。**建议**：既然"全仓重写"，业务后端也 Nest 化，与 auth-center 同栈，建立单一 TS/Nest 基线（auth-center 已是第一个 TS 服务）。
2. **数据库物理收敛粒度**：单库单 schema vs 单库多 schema（`auth/food/edu/...`）。**建议**：单库多 schema（隔离清晰又不散物理库）。
3. **auth-center 是否继续独立进程**：**建议保留**（安全边界清晰，职责单一）。
4. **重写节奏**：一次到位全推倒 vs 按模块渐进迁移。**建议**：新骨架先立「identity + auth + 一个 vertical slice（如订餐下单）」端到端走通，再按模块填，**旧代码冻结只读**。

---

## 7. 与 P2 已落地工作的关系

P2 阶段 A/B/C 做的事**不是浪费**，它们是重写前的必要铺垫：
- 阶段 B（auth-center + @gri/jwt-verifier）：**这是重写后身份域的核心，直接复用**。
- 阶段 C（三前端统一登录态 + 刚才的两后端 requireAuth 挂接）：**验证了"统一登录态能跨域闭环"这一关键假设**——证明「一个身份真源、多个业务面」可行，重写时按同一契约铺开即可。
- 本轮摸出的 3 个部署缺口（bcrypt 构建、ai-tutor lock 漂移、AUTH_JWKS_URL）：**全在重写时随新骨架自然消失**（单一后端 + 单一锁 + 单一环境）。

换句话说：**旧项目上已经走到了"把所有端点收进统一鉴权"的极限，剩下的重复和腐化只能靠重写消除。**

---

## 8. 立即可以做的下一步（供选择，不自动执行）

- **A**：按 §6 的 4 个决策点出**最终重写方案**（含模块清单、schema DDL、迁移顺序、CI/CD），作为重写施工图。
- **B**：先只交付一份**领域模型收敛 DDL**（`auth.identities` / `users` / `edu.students` 三表 + `external_id` ≡ `users.id` 契约），作为重写的数据库地基。
- **C**：先冻结旧项目（把本轮 requireAuth 挂接的源码 commit，标记"旧项目终点"），再启动重写骨架。