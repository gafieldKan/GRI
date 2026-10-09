# P2-T2b 任务卡（Codex）：identity 运营管理面实现 —— 角色/状态变更 + 列表查询

**执行者**：Codex（实现专家）
**依赖**：`p2-task-2a` 设计文档（`.agents/claude/outputs/p2-task-2-identity-operator-authz-design.md`，**必须严格照此实现**）
**产出目录**：`services/api/src/modules/identity/`、`.agents/codex/outputs/`
**预估**：0.5 天

> ⚠️ 本卡是**重写版**。原卡让用 `req.auth.roles` 判 Operator —— 该字段架构恒空（`roles:[]` 硬编码，已在 `agent-admin.controller.ts:72` 注释佐证），照原卡实现**路径物理上跑不通**。
> 本版核心：**运营判定一律走 `OrganizationService.assertSiteOperator(externalId)`（DB 组织角色真源），禁止依赖 `req.auth.roles`。**

---

## 🎯 任务目标

为 `identity` 模块补 **仅运营可调用** 的管理接口：

1. **角色变更**：`PATCH /api/identity/:id/role` → `{ role }`（`consumer|student|merchant|operator`）
2. **状态变更**：`PATCH /api/identity/:id/status` → `{ status }`（`active|suspended|deleted`，与库侧 `ck_users_status` 对齐）
3. **列表查询**：`GET /api/identity` → 分页 + role 筛选 + status 筛选 + 关键词
4. **顺带修正死代码**：`GET /api/identity/:id` 现有 `READ_ANY_ELEVATED_ROLES`（依赖恒空的 `req.auth.roles`）→ 改为设计文档指定的真实判定。

---

## 🔴 授权铁律（不得违反）

- 运营检定**唯一**方式：`await this.organizationService.assertSiteOperator(actorExternalId)`。
- `actorExternalId` **只能**取自 `req.auth.externalId`（**禁止**从 body/query/param 取 actorId）。
- **禁止**使用 `req.auth.roles` 做任何授权判断（架构恒空）。
- 新端点**不进** `public-routes.ts` 白名单（自动 401 兜底）。
- **禁止**改 `auth-center` 去注入 roles（那是故意的架构决策）。

---

## 📥 必读上下文（按顺序）

| 文件 | 用途 |
|------|------|
| `.agents/claude/outputs/p2-task-2-identity-operator-authz-design.md` | **权威设计**，逐条实现 |
| `services/api/src/modules/identity/identity.controller.ts` | 现有 4 端点 + `READ_ANY_ELEVATED_ROLES` 死代码 + 路由顺序 |
| `services/api/src/modules/identity/identity.service.ts` | `getProfileByExternalId`/`updateProfile`/`deleteProfile` 风格、软删语义 |
| `services/api/src/modules/identity/identity.types.ts` | 补 `Role`/`UserStatus`/list DTO/result 类型 |
| `services/api/src/modules/identity/identity.module.ts` | **需 `imports:[OrganizationModule]`** 才能注入 `OrganizationService` |
| `services/api/src/modules/organization/organization.service.ts:685` | `assertSiteOperator(actorId)` 实现 |
| `services/api/src/modules/organization/organization.controller.ts:91` | 取 `externalId(req)` 既有范式 |
| `services/api/src/modules/agent/agent-admin.controller.ts` | 「管理面一律 assertSiteOperator」范例 |
| `services/api/src/auth/public-routes.ts` | **不动** |
| `services/api/src/migrate/017_identity_register_contract.sql:51` | `ck_users_status` 允许值 |
| `services/auth-center/src/admin/identity-admin.service.ts:96` | `disableIdentityByExternalId`（deleted 联动用，若设计采纳） |
| `services/api/src/modules/identity/identity.controller.spec.ts` | 现有测试风格 |

---

## 📦 产出物清单（与设计文档 §8 实现落点逐条对齐；有出入以设计为准）

| 文件 | 动作 |
|------|------|
| `src/modules/identity/identity.module.ts` | `imports:[OrganizationModule]`（注入 OrganizationService） |
| `src/modules/identity/identity.controller.ts` | 新增 `GET /`、`PATCH /:id/role`、`PATCH /:id/status`；修正 `GET /:id` 死代码判定；字面量路由在 `:id` 之前 |
| `src/modules/identity/identity.service.ts` | 新增 `changeRole(id, role)`、`changeStatus(id, status)`、`listUsers(query)`；deleted 联动 auth-center（若设计采纳） |
| `src/modules/identity/identity.types.ts` | 补 `Role`、`UserStatus`、`ListUsersQuery`、`ListUsersResult` |
| `src/modules/identity/identity.controller.spec.ts` | 新增 ≥9 单测（见设计 §7） |
| `.agents/codex/outputs/p2-task-2-file-list.md` | 新增/修改文件清单 |
| `.agents/codex/outputs/p2-task-2-verify.sh` | 自动化验收脚本（见下） |

> 若有迁移：文件名 `src/migrate/019_identity_operator_mgmt.sql`（幂等 `IF NOT EXISTS`/`DO $$`），并严守 **「改 SQL → 先 npm run build → 再 npm run migrate」**。若设计判定无需迁移，明确在 file-list 写明「无迁移」。

---

## ✅ 验收标准（硬性）

1. `npm run build`（tsc）**0 error**；`npm run lint` **0 error，warning ≤ 10**。
2. 新增单测**全部通过**，且**禁止删测试通过**；总套件数不低于基线。
3. 运营接口实测：非运营 token → **403**；无 token → **401**；运营 token → 200。
4. `PATCH status=deleted` 后：`public.users.status='deleted'` 且（若设计采纳）auth-center identity `status='disabled'` + refresh 全吊销。
5. `PATCH role` 非法值 → 400；不存在 id → 404；改自己 → 按设计（建议 403）。
6. `GET /api/identity` 分页/筛选语义与设计一致；默认排除软删（若设计如此）。
7. **e2e 脚本 `p2-task-2-verify.sh` 全绿**（PASS≥N，FAIL=0），覆盖：鉴权三态、role 变更、status 变更与联动、列表分页筛选、越权/边界。

---

## 🧪 verify.sh 要点

- 基址：`API_BASE=${API_BASE:-http://localhost:3008/api}`、`AUTH_BASE=${AUTH_BASE:-http://localhost:3004/auth}`（docker compose 正确值）。
- 凭据：`TEST_IDENTIFIER=testuser` / `TEST_PASSWORD=test1234`（testuser = 根组织 owner，天然满足 `assertSiteOperator`）。
- 需**构造非运营用户**（普通 consumer 注册）验证 403；无 token 验证 401。
- **UUID 卫生**（吸取 T4 教训）：psql 取 UUID 必须 `head -n1 | tr -d` 清洗，勿把 `INSERT 0 1` 标签粘进变量。
- 输出统一 `PASS=n FAIL=m VERIFY_EXIT=0/1`。

---

## 📝 存放路径
```
.agents/codex/tasks/p2-task-2-identity-operator-role-status-impl.md
```

> 注：本卡同时**取代**旧卡 `.agents/codex/tasks/p2-task-2-identity-operator-role-status.md`（旧卡作废，见账本）。
