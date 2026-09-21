# GRI 重写施工图 v1（最终方案）

> 状态：施工图 v1 | 日期：2026-09-14
> 上游：`docs/GRI_REWRITE_TARGET_BLUEPRINT.md`（先读蓝图再看本文档）
> 决策默认（蓝图 §6 建议方向，已按建议定案，如需调整在此改）：
> ① 业务后端 **Nest 化**（与 auth-center 同栈）② DB **单库多 schema** ③ auth-center **保留独立** ④ 重写 **渐进（先立垂直切片）**

---

## 1. 目标拓扑（一句话）

旧项目 2 业务后端 + 2~3 DB 域 → **1 业务后端（NestJS `services/api`）+ 1 身份服务（auth-center）+ 1 PostgreSQL（`gri` 库多 schema）+ Redis**。

```
gateway(nginx) ──┬─ /auth → auth-center(:3004)      [身份域，唯一签发 JWT]
                 ├─ /api  → services/api(:3002)      [唯一业务后端，NestJS]
                 └─ /     → portal / 三前端
                       services/api ── PG(gri) ── schema: auth.identities · public.users · edu.* · food.* · tenant.* · ontology.*
                                     └─ Redis
```

---

## 2. 单后端模块清单（`services/api/src/modules/`）

对齐 auth-center 的 Nest 模块风格（每模块 `*.module.ts` + `*.controller.ts` + `*.service.ts` + `*.entity.ts` + `*.dto.ts`）：

| 模块 | 职责 | 吸收自旧项目 |
|---|---|---|
| `identity/` | users + students 档案 CRUD（收敛后的单一实体） | backend `users` + ai-tutor `students` |
| `auth/` | `requireAuth` 中间件、JWKS 缓存、公开读白名单 | 两后端 `infra/auth` |
| `food/` | 餐厅/菜品/订单/支付/评价/优惠券 | backend `order/merchant/payment/farm/wholesale` |
| `tuition/` | 试卷识别、知识点、练习、计划、错题本、报告、WS | ai-tutor-backend 全量 + Agents |
| `tuition/agents/` | ExamScanner / Tutor / QuestionGenerator / Plan | ai-tutor-backend `agents/` |
| `organization/` | 组织/成员/角色/邀请（读公开、写登录） | backend `api/organization/` |
| `master-data/` | 主数据（接 `@gri/ontology-engine` 门面） | backend 主数据 + 本体底座 |
| `ontology/` | 本体四件套门面 | `@gri/ontology` + `@gri/ontology-engine` |
| `infra/` | db 池、redis、logger、error-handler、config | 两后端 infra（统一） |
| `bootstrap/` | 全局中间件链、路由注册、生命周期、WS 挂载 | `index.js` 两处 |

**关键**：`requireAuth` 全局挂 `app.use('/api', requireAuth)`（AI 学情的做法）+ 公开读白名单（点餐公开目录的做法），**一处定义、一处挂接**，消灭旧项目两后端各挂一套的重复。

---

## 3. 数据库收敛 DDL 方向（单库 `gri` 多 schema）

### 3.1 schema 划分
```
schema auth       — identities / refresh_tokens / _migrations   （身份域，auth-center 独占）
schema public     — users(人) / organizations / orders / payments / restaurants / dishes / ...
schema edu        — students(学习档案) / knowledge_points / questions / practice_sessions / ... （所有学情表）
schema tenant     — organization_members / roles / invitations / audit_logs
schema ontology   — master_data / rule_* / ontology_orders       （本体引擎管）
```

### 3.2 核心三表契约（领域收敛的根）
```sql
-- 身份域（auth-center 独占，签发 JWT 的 sub）
auth.identities(
  id uuid PRIMARY KEY,          -- 统一主体 id (= JWT sub)
  domain text, username text, email text, phone text,
  password_hash text, status text,
  external_id uuid NOT NULL     -- → public.users.id（业务主键，唯一映射点）
)

-- 人（业务写真，唯一业务主键）
public.users(
  id uuid PRIMARY KEY,          -- = identities.external_id，全库 FK 都指这里
  identity_id uuid REFERENCES auth.identities(id),
  name text, avatar_url text,
  role text                     -- 'student' | 'consumer' | 'merchant' | 'operator'
)

-- 学生学习档案（users 的 1:0..1 扩展，role=student 时存在）
edu.students(
  user_id uuid PRIMARY KEY REFERENCES public.users(id),   -- 不再独立主键
  grade int, parent_id uuid, textbook_version text, school text
)
```

**消灭的旧问题**：旧 `gri_db.users.id(uuid)` vs `smartlens.students.id(varchar)` 两套主键 → 收敛后 `external_id ≡ users.id`，**只有一处映射**，`requireAuth` 挂接后 `req.auth.externalId` 直接就是 `users.id`，无分叉。

### 3.3 迁移顺序（一次性 ETL，不兼容旧项目）
1. 建 `gri` 单库 + 5 个 schema。
2. 建核心表（identities → users → edu.students → food.* → tenant.* → edu.* 学情 → ontology.*）。
3. ETL：旧 `users`(uuid) → 新 `public.users`(保留 uuid)；旧 `students`(varchar) → 新 `edu.students`，`user_id` 回填关联；无对应用户则先造 `public.users` + `auth.identities`。
4. 旧订单/组织/学情表 FK 全部重指向 `public.users.id`。
5. 校验：`external_id` 与 `users.id` 一一对应；删旧三库。

---

## 4. 迁移顺序（重写节奏，渐进 + 旧代码冻结只读）

按「先立垂直切片，再铺模块」：

| 阶段 | 动作 | 产物 |
|---|---|---|
| **M0 骨架** | 建 `services/api` Nest 骨架（复制 auth-center 的 tsconfig/Nest 基线）；接 `@gri/jwt-verifier`；`app.use('/api', requireAuth)` 全局挂；单库 schema 建表 | 能起、能鉴权、连单库的空后端 |
| **M1 身份切片** | `identity` 模块：users/students 档案 CRUD + `external_id ≡ users.id` 契约 | 登录→拿 JWT→按 externalId 读到自己档案，端到端闭环 |
| **M2 订餐切片** | `food` 模块：餐厅/菜品(公开读)/订单(写登录)/支付 | 订餐主链路走通 |
| **M3 学情切片** | `tuition` 模块：试卷识别→分析→出题→计划→错题本 + WS | AI 主观链路走通 |
| **M4 组织/主数据** | `organization` + `master-data` + `ontology` 门面 | 主数据/组织权限收敛 |
| **M5 收尾** | 前端 api base 收敛到统一 `/api`；下掉旧两后端；CI/CD + 容器化（bcryptjs） | 旧项目退役，新 GRI 上线 |

**每阶段验收**：独立可跑、有单测（auth-center 已有 `*.spec.ts` 先例）、端到端走通一种用户旅程。

**旧项目处理**：本表 M0~M5 期间，旧 `backend` / `ai-tutor-backend` **冻结只读**，只做 bug 修复不做新功能；M5 一次性下线。

---

## 5. CI/CD 与容器化（顺带根治旧项目 3 个部署缺口）

- **bcrypt native 构建失败** → 换 `bcryptjs`（纯 JS），auth-center 与业务后端统一，镜像 `alpine` 可构建。
- **ai-tutor lock 漂移** → 单一业务后端 + monorepo 根 lock 管理，删除子目录独立 lock，杜绝 `npm ci` 失配。
- **AUTH_JWKS_URL 缺失** → 统一在 `services/api` 与 auth-center 的环境注入，nginx 网关按服务名路由。

---

## 6. 立即可执行的下一步（按序，供选择）

1. **M0 骨架**：新建 `services/api`（NestJS），复制 auth-center 基线，接 jwt-verifier + 单库 schema 迁移。这是重写的第一个 commit。
2. **DDL 落地**：先写 §3.2 的三表 + schema 建表脚本，作为数据库地基（比 M0 更小、更聚焦）。
3. **旧项目冻结标记**：在旧 backend/ai-tutor README 或 docs 标注「已冻结，重写见服务施工图」。

**建议先做 2（DDL）再 1（M0）**：数据库是重写的根，先把「identity/users/students 合一 + external_id ≡ users.id」的地基沉下来，再起服务骨架。