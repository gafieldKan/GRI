# P2-T2a 任务卡（Claude）：identity 运营管理面 —— 授权模型修正 + 角色/状态/列表设计

**执行者**：Claude（架构师 / 决策者）
**依赖**：T1 完成（注册/注销/改密已就绪并提交 `08bcb33`）
**产出目录**：`.agents/claude/outputs/`
**预估**：0.5 天
**下游**：Codex 依本设计实现 `p2-task-2`（实现卡），Claude 再出 `p2-task-3`（e2e 契约）

---

## 🎯 背景（必读——本卡是**重写版**，原卡含致命前提错误）

原 `p2-task-2-identity-operator-role-status.md` 让用 `req.auth.roles` 判 Operator。**该字段在架构上恒为空数组**（`auth-center` 签发 JWT 时 `roles: []` 硬编码，是**有意的架构决策**，`agent-admin.controller.ts:72` 注释明写「守卫是 DB 角色，JWT roles 全空故前端无法自行推导」）。照原卡实现 → 运营判定恒 false → **路径物理上跑不通**（与 T4 同一病根）。

**实测校正（2026-10-10 核实）**：

| 事实 | 证据 |
|------|------|
| identity 模块当前**只有** `GET /me`、`GET /:id`、`PUT /me`、`DELETE /me` | `identity.controller.ts` |
| **无** role/status/list 端点 | 同上 |
| 真运营判定 = `OrganizationService.assertSiteOperator(actorId)` → 查根组织 `tenant.organizations`(parent_id IS NULL) + `tenant.organization_members` 角色 ∈ {owner,admin} | `organization.service.ts:685` |
| `assertSiteOperator` 以 `externalId`（=`public.users.id`）为 actorId 入参 | 同上游调用点 |
| 既有 `identity.controller.ts:24` 的 `READ_ANY_ELEVATED_ROLES`(req.auth.roles) 是**死代码**（恒 false） | T4 结论 |
| `public.users.role` 类型 = `'consumer'\|'student'\|'merchant'\|'operator'`；库内现值只有 `consumer`(31 active/7 deleted)、`student`(7 active) | `identity.types.ts` + 实测 SQL |
| `public.users.status` 受库侧 `ck_users_status` 约束 = `IN ('active','deleted','suspended')` | `017_identity_register_contract.sql:51` |
| `OrganizationModule` 已 `exports:[OrganizationService]`；`IdentityModule` **未 import 它** | 两个 module 文件 |
| `food.service.ts:408` 有**私有等效** `assertSiteOperator`(返回 bool) 可作对照 | `food.service.ts` |
| 软删已有 `identity.service.deleteProfile`（status='deleted'+deleted_at）；auth-center 有 `disableIdentityByExternalId`（置 disabled + 吊销 refresh） | `identity.service.ts:96`、`identity-admin.service.ts:96` |

**结论**：T2 目标真实（端点确实缺），但**必须换掉授权底座**：运营面一律走 `assertSiteOperator(externalId)`，禁止依赖 `req.auth.roles`。

---

## 📥 必读上下文（按顺序）

| 文件 | 用途 |
|------|------|
| `services/api/src/modules/identity/identity.controller.ts` | 现有 4 端点、`READ_ANY_ELEVATED_ROLES` 死代码、路由顺序 |
| `services/api/src/modules/identity/identity.service.ts` | `getProfileByExternalId`/`updateProfile`/`deleteProfile` 风格；软删语义 |
| `services/api/src/modules/identity/identity.types.ts` | `User.role/status` 类型，需补 `Role`/`UserStatus`/list DTO |
| `services/api/src/modules/identity/identity.module.ts` | 需 `imports:[OrganizationModule]` 才能注入 `OrganizationService` |
| `services/api/src/modules/organization/organization.service.ts`（`:685` `assertSiteOperator`、`:402` `hasRole`） | **权威运营判定**，直接复用 |
| `services/api/src/modules/organization/organization.controller.ts`（`:91` `externalId(req)` 用法） | 取 actorId 的既有范式 |
| `services/api/src/modules/agent/agent-admin.controller.ts` | 「管理面一律 `assertSiteOperator`」的既有实现范例 |
| `services/api/src/modules/food/food.service.ts:408` | 私有等效运营判定（对照，勿复制到 identity） |
| `services/api/src/auth/public-routes.ts` | 新端点**不入**白名单（自动 401 兜底） |
| `services/api/src/migrate/017_identity_register_contract.sql` | `ck_users_status` 允许值 |
| `services/auth-center/src/admin/identity-admin.service.ts:96` | `disableIdentityByExternalId`（状态同步用） |
| `services/api/src/modules/identity/identity.controller.spec.ts` | 现有测试风格 |

---

## 📦 产出物（硬性）

| 文件 | 内容 |
|------|------|
| `.agents/claude/outputs/p2-task-2-identity-operator-authz-design.md` | **主交付**，覆盖下方 §设计要点 全部条目且**逐条给明确决策（无「待定」）** |
| `.agents/claude/outputs/p2-task-2-contract.md` | 端到端契约表（端点/方法/鉴权/请求/成功码/失败码）+ 验收断言清单 |
| `.agents/claude/outputs/p2-task-2-risk-rollback.md` | 风险与回滚（提权面、状态同步失败补偿、并发） |

---

## 📐 设计要点（每条必须给明确决策）

### 1. 授权底座（本卡核心决策）
- 决策：运营检定**统一** `await this.org.assertSiteOperator(externalId)`（`OrganizationModule` 注入）。**明确写出禁止使用 `req.auth.roles` 的理由**（架构恒空 + 前端不可推导 + 唯一真源在 DB 组织成员表）。
- 明确 `IdentityModule` 的最小接线改动（`imports:[OrganizationModule]`）。
- **顺带修正死代码**：`GET /identity/:id` 的 `READ_ANY_ELEVATED_ROLES`（req.auth.roles）改为真实判定——给出决策（建议：读他人档案要求 `assertSiteOperator` 或本人；merchant 语义改由「数据归属」承担，此处不再用 role）。
- 明确：运营接口**不得**把自身 externalId 之外的 actorId 从 body/query 取，**只能**取自 `req.auth.externalId`（防伪造）。

### 2. 端点契约（给出精确规格）
| 端点 | 方法 | 鉴权 | 请求 | 成功 | 失败 |
|------|------|------|------|------|------|
| `/api/identity` | GET | assertSiteOperator | `?page&pageSize&role&status&q` | 200 `{items,total,page,pageSize}` | 401/403/400 |
| `/api/identity/:id/role` | PATCH | assertSiteOperator | `{role}` | 200 | 400/403/404 |
| `/api/identity/:id/status` | PATCH | assertSiteOperator | `{status}` | 200 | 400/403/404 |

- **路由顺序铁律**：字面量路由（如未来的 `me` 类）必须在 `:id` 参数路由**之前**声明，避免被 `ParseUUIDPipe` 吞成 400。
- `:id` 用 `ParseUUIDPipe`；非法 uuid → 400。

### 3. 取值与校验（fail-fast）
- `role` ∈ `'consumer'|'student'|'merchant'|'operator'`；非法值 → 400（DTO 或手工校验，二选一并说明理由——参考 T1 偏差①：api 侧未声明 class-validator，全局 `ValidationPipe` 已开）。
- `status` ∈ `'active'|'suspended'|'deleted'`（**与库侧 `ck_users_status` 对齐**）；给出 DTO/DB 双层门禁。
- 分页 `page≥1`、`pageSize∈[1,100]`，默认值给出。

### 4. 状态语义（需明确决策）
- `status='deleted'`：是否同步调 auth-center `disableIdentityByExternalId`（停用凭证）？建议**是**（与 T1 软删语义一致），并写明补偿（auth-center 失败时事务/重试策略）。
- `status='suspended'`：是否也停用凭证？给出决策与理由。
- `status='active'`（恢复）：是否需要重新启用 auth-center identity？若 auth-center 无对应「启用」能力，明确本卡是否包含该能力（或标为后续）。
- 列表现已存在 `deleted_at` 软删——`GET /api/identity` 默认是否含 deleted？给出决策（建议默认排除，`status` 显式筛选才含）。

### 5. 自身保护与级联（决策）
- 运营**能否**改自己的 role/status（自降权/自锁）？给出决策（建议：禁止改自己的 role/status → 403，防自锁）。
- 角色从 `student` 改为非 student 时，`edu.students` 档案如何处置（保留/标记/级联）？给出决策。
- 改 role 是否影响已签发 JWT？明确「JWT roles 恒空，故无需重签」这一事实（避免误以为要重签）。

### 6. 红线合规自证
- fail-fast 门禁层级（DTO/服务层 + DB `ck_users_status`）。
- 点名 GoF 模式与理由（如：门面 Facade 复用 `assertSiteOperator`；策略/守卫 Strategy 做鉴权；模板方法统一列表查询）。
- 说明本卡**不**新增结构变更（若无迁移则明确「无需迁移」；若需索引则给 SQL 文件名与幂等写法 + 「改 SQL 先 build 再 migrate」纪律）。

### 7. 单测规格（≥9 例）
覆盖：role 变更（成功/非法值/不存在/权限不足/改自己）、status 变更（成功含 deleted 联动/非法值/权限不足）、列表（分页边界/role 过滤/status 过滤/空结果/getMe 语义）。给出每例的期望码与断言点。

### 8. 实现落点清单（供 Codex 照做）
逐个文件列出 `identity.controller.ts`/`identity.service.ts`/`identity.types.ts`/`identity.module.ts`/`identity.controller.spec.ts` 的动作，并标注「新增/修改」。

---

## ✅ 验收标准
1. 三份产出物齐备，§设计要点 8 条每条有**明确决策**（无「待定」）。
2. §1 明确写出「禁止 `req.auth.roles`」与 `assertSiteOperator` 复用接线。
3. 契约表可直接转成 Codex 实现与 T3 e2e。
4. 红线自证完整（含模式点名）。
5. 明确指出实现落点文件。

## 📝 存放路径
```
.agents/claude/tasks/p2-task-2a-identity-operator-authz-design.md
```
