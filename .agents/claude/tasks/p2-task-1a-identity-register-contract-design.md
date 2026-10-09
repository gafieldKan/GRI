# P2-T1a 任务卡（Claude）：注册链路身份契约设计

**执行者**：Claude（架构师 / 决策者）
**依赖**：无（可立即执行）
**产出目录**：`.agents/claude/outputs/`
**预估**：0.5 天
**下游**：Codex 依本设计实现 `p2-task-1`（实现卡）

---

## 🎯 背景（必读，问题已定位到根因）

`services/api` 的 `auth` 模块当前只是 **纯透传代理**：`POST /api/auth/register` 直接转发到 `auth-center:/auth/register`。
但实测（2026-10-09）发现**契约级缺陷**：

- `gri_auth.identities.external_id` 对**除 `testuser` 外的所有注册行均为 NULL**。
- `gri.public.users`（业务主键真源）**注册时根本不会创建行**。
- JWT 签发时 `external_id = payload.external_id ?? payload.sub` → 新注册用户登录后 `external_id` 落到 identity id，
  于是 `services/api` 全部身份端点（`/api/identity/me` 等按 `req.auth.externalId ≡ public.users.id` 定位）失效。

**结论**：这不是「补一个端点」能解决的，是**注册链路没有建立 `external_id ≡ public.users.id` 唯一映射**。
修法必须整体化：注册 = 在业务库建 `public.users` 行 → 把该 `uuid` 作为 `external_id` 写入 `auth.identities`。

---

## 📥 必读上下文（按顺序）

| 文件 | 用途 |
|------|------|
| `docs/GRI_REWRITE_TARGET_BLUEPRINT.md` §6 | 单一身份真源 + 角色档案模型、`external_id ≡ users.id` 唯一映射 |
| `docs/GRI_REWRITE_CONSTRUCTION_PLAN.md` §3.3 / §4（M1 行） | 迁移顺序；M1 验收 = 登录→JWT→按 externalId 读到明确档案 |
| `services/api/src/migrate/001_converge_foundation.sql` | `public.users` / `auth.identities` / `edu.students` 现行 DDL（注意 users 无 identity_id 列） |
| `services/auth-center/src/migrate/001_init_identity.sql` | auth-center 库（gri_auth）identities DDL（external_id VARCHAR(64)） |
| `services/auth-center/src/auth/auth.service.ts` | `login()` / `register()` / `meFromBearer()` 现状 |
| `services/auth-center/src/admin/identity-admin.service.ts` | **服务间面**：`X-Service-Token` + `timingSafeEqual` 既有模式（照此扩展） |
| `services/api/src/modules/auth/auth.controller.ts` | 现行透传代理 |
| `services/api/src/auth/jwt-auth.middleware.ts` + `packages/jwt-verifier/src/index.js` | `req.auth = { sub, externalId, ... }` 语义 |
| `services/api/src/config/config.ts` | `identity.serviceToken` / `AUTH_SERVICE_TOKEN` 已就绪 |
| `apps/web/src/api/auth.js` | 前端注册契约 `{username,email,password,name?}` → 需保持兼容 |

---

## 📦 产出物（硬性）

| 文件 | 内容 |
|------|------|
| `.agents/claude/outputs/p2-task-1-identity-register-contract-design.md` | **主交付**：下列 §设计要点 全部覆盖 |
| `.agents/claude/outputs/p2-task-1-e2e-verification-spec.md` | 端到端验收脚本的**规格**（步骤/断言/PASS 判据），供 Codex 落成 `.sh` |
| `.agents/claude/outputs/p2-task-1-risk-rollback.md` | 风险与回滚（部分失败补偿、幂等、安全） |

---

## 📐 设计要点（必须逐条给出明确决策，不得留白）

### 1. 注册编排（Orchestration）
- **顺序**：`services/api` 侧先建 `public.users`（`role` 默认值？给出决策）→ 拿 `uuid` → 以 `external_id = 该 uuid` 调 auth-center 建 identity。
- 明确：**为什么不能复用 auth-center 公开 `/auth/register` 并传 external_id**（安全：客户端可伪造 external_id → 越权）。
- **补偿（Compensation）**：identity 创建失败时如何回滚已建的 `public.users`（事务？显式删除？）；反之 users 建失败则不动 auth-center。
- **幂等**：重复注册/网络重试的语义（靠 `username/email/phone` UNIQUE？返回 409？）。

### 2. auth-center 需要新增的服务间写面
- 端点：`POST /auth/admin/identities`（`X-Service-Token` 保护），body 含 `{domain, username, email, phone, password, name, externalId}`，
  返回创建的 identity（脱敏 `password_hash`）。
- 复用既有 `IdentityAdminService.authorize()` 的 `timingSafeEqual` 模式；**不得**放宽为公开端点。
- 明确 `domain` 取值决策（注册用户默认 `'food'`？还是引入 `'core'`？——给出理由，考虑统一身份）。
- 是否需要对既有 `POST /auth/register` 做**弃用/内部转调**？给出决策。

### 3. 改密端点
- `POST /auth/password`（**需登录**，Bearer）→ body `{oldPassword, newPassword}`；校验旧密 → bcrypt 重哈希 → 更新。
- 复用 `meFromBearer()` 从 token 解析 identity（不给前端传 identityId，防越权）。

### 4. 注销端点
- `DELETE /api/identity/me`：`externalId` 取自 `req.auth`（防 IDOR），**只删自己**。
- 决策：**硬删 vs 软删**（`public.users.deleted_at`）；是否需同步删 auth-center identity（若需要 → 是否新增 admin delete 端点）。
- `edu.students` 是否依赖 FK 级联（现行 `ON DELETE CASCADE`）。

### 5. 契约表（给出精确表格）
| 端点 | 方法 | 鉴权 | 请求 | 成功码 | 失败码 |
|------|------|------|------|--------|--------|
| `/api/auth/register` | POST | 公开 | {username,email,phone?,password,name?} | 201 | 400/409 |
| `/api/auth/password` | POST | Bearer | {oldPassword,newPassword} | 200 | 400/401 |
| `/api/identity/me` | DELETE | Bearer | — | 200 | 401 |

### 6. 红线合规自证
- `external_id ≡ users.id` **仅此一处映射**：指明映射发生的唯一代码位置。
- fail-fast：哪几道门禁（DTO 校验 / DB UNIQUE / CHECK）。
- 点名使用的 GoF 模式（如：编排 = 门面/模板方法；补偿 = Saga/命令；代理 = Proxy）。

### 7. 验收脚本规格（写入 e2e-verification-spec.md）
必须覆盖：注册→登录（拿 token）→ 校验 `external_id != sub` 且 `external_id` 命中 `public.users.id` → 改密 → 新密登录 → 旧密失败 → 注销 → 再登录失败 → 公开路由断言（register 无 token 201/400；password/me 无 token 401）。给出 PASS/FAIL 判据与 `API_BASE`/`AUTH_BASE` 取值（docker compose 下 `API_BASE=http://localhost:3008/api`、`AUTH_BASE=http://localhost:3004/auth`）。

---

## ✅ 验收标准

1. 三份产出物齐备，主设计覆盖 §设计要点 全部 7 条且每条有**明确决策**（无「待定」）。
2. 契约表与前端 `apps/web/src/api/auth.js` 兼容（不得破坏既有调用形状）。
3. 明确指出实现落点文件（供 Codex 照做）。
4. 红线合规自证完整。

## 📝 存放路径
```
.agents/claude/tasks/p2-task-1a-identity-register-contract-design.md
```
