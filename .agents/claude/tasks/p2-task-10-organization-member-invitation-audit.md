> ✅ STATUS: REWRITTEN (2026-10-10) —— 依据 `.agents/coordination/card-recon-2026-10-10.md §八` 重写。原卡**多处与实况不符**：① 引 `apps/portal/src/views/organization/`（**不存在**；portal 用 `pages/`，且**无组织页**）；② 称「Operator 判定用 `req.auth.roles`」——**正是恒空陷阱**，真实源 = `OrganizationService.assertSiteOperator`；③ 称「需从零建 12+ 端点」——**已存在 ~24 端点**；④ 表结构描述全错（`organizations` 无 `owner_id`；invitations 用 `token`/`status`；audit 用 `entity_type`/`changes`，**非分区表**）。
> 执行者：Claude ｜ 依赖：无（organization 基座已就绪）｜ 预估：0.5 天

# T10 任务卡：`organization` 模块 —— 邀请鉴权缺口 + 审计分页/筛选（增量补齐）

**执行者**：Claude
**依赖**：无（`organization` 模块 + `tenant.*` 表均已就绪）
**产出目录**：`services/api/src/modules/organization/`
**预估**：0.5 天

---

## 🎯 本卡定位（必须先读，防重蹈覆辙）

原卡把 T10 写成「从零建设组织/成员/角色/邀请/审计 + Portal 联调」，**但模块近乎完整**。实测对照：

| 原卡要求 | 现实 | 判定 |
|---|---|---|
| 组织 CRUD | ✅ 已有（`POST/GET/PUT/DELETE`，`:108/:47/:119/:124`） | **勿重建** |
| 成员管理 | ✅ 已有（`:131/:136/:145/:154`，含 `has-role`） | **勿重建** |
| 角色管理 | ✅ 已有（`:176/:181/:190` + `organization_roles` 表） | **勿重建** |
| 邀请流程 | 🟡 `create`(`:207`)/`cancel`(`:216`)/`accept`(`:225`) 已有；**但 `GET :id/invitations` 无鉴权门禁** | **补门禁（真缺口）** |
| 审计日志 | 🟡 `GET :id/audit` 已有，但**仅 `limit`，无分页/筛选/导出** | **补分页/筛选（真缺口）** |
| Portal 管理台联调 | ❌ **无组织页**（`apps/portal/src/pages/` 仅 console/login/ontology-stats） | **不在本卡**（另立前端卡） |

**本卡只做 2 件真缺口**：
1. **`GET :id/invitations` 补鉴权门禁** —— 当前裸调 `listInvitations(id)`，**无 `assertRole`**，任何登录用户可枚举任意组织邀请（安全缺口）。
2. **审计日志增强** —— `getAudit` 加分页（offset/cursor）、按 `action`/`entity_type`/`actor_id`/时间范围筛选。

（可选第 3 件，仅当实测缺失）：角色层级权限判定函数 `can(actorRole, action, targetRole?)`。

---

## 🔴 硬约束（违反即失败）

| # | 约束 |
|---|---|
| **N1** | **授权判定一律 `OrganizationService.assertSiteOperator(externalId)`（运营）或 `assertRole(actorId, orgId, ...)`（组织内）**。**严禁** `req.auth.roles`（恒空，架构决策）。 |
| **N2** | **禁引 `apps/portal/src/views/organization/`（不存在）**；前端联调不在本卡（portal 组织页本身缺失）。 |
| **N3** | **表结构以实测为准，勿按原卡臆测**：`tenant.organizations(id,name,code,short_name,description,logo_url,parent_id,parent_path,level,type,status,settings,metadata,created_at,updated_at)` —— **无 `owner_id` 列**；`tenant.organization_invitations(id,organization_id,email,role_id,inviter_id,status,token,expires_at,accepted_at,accepted_by,message,metadata,...)` —— **用 `token` 非 `code`**；`tenant.organization_audit_logs(id,organization_id,action,entity_type,entity_id,actor_id,actor_type,changes,ip_address,user_agent,created_at)` —— **非分区表**。 |
| **N4** | **不新建 module**；全改既有 `organization.controller.ts` / `organization.service.ts` / `organization.types.ts`。 |
| **N5** | **无 DB 迁移**（既有表够用；`idx_org_audit_*` 已在）。仅当必要才加迁移，且先 `npm run build` 再 `npm run migrate`。 |
| **N6** | **身份契约**：`req.auth.externalId`（`assertSiteOperator` 已内建根组织判定）。**禁止**硬编码。 |
| **N7** | **限作用域提交**：仅 `services/api/src/modules/organization/`（+ outputs）；**不得**裹挟在途改动。 |

---

## 📥 必读上下文（按序）

| 文件 | 用途 |
|---|---|
| `services/api/src/modules/organization/organization.controller.ts` | 全部端点 + `externalId(req)` 用法 |
| `services/api/src/modules/organization/organization.service.ts` | `listInvitations`(`:496`)/`createInvitation`(`:505`)/`acceptInvitation`(`:537`)/`getAudit`(`:630`)/`assertRole`/`assertSiteOperator`(`:685`) |
| `services/api/src/modules/organization/organization.types.ts` | 现有类型 |
| `services/api/src/modules/organization/organization.service.spec.ts` | 测试风格（已有 10KB） |
| `services/api/src/modules/organization/organization.controller.spec.ts` | Controller 测试风格 |
| `.agents/coordination/card-recon-2026-10-10.md §八` | 降级判定依据 |

---

## 📦 产出物清单

| 文件 | 动作 |
|---|---|
| `organization.controller.ts` | ① `GET :id/invitations` 补 `assertRole` 门禁（owner/admin）② `GET :id/audit` 增 `offset`/`action`/`entityType`/`actorId`/`from`/`to` 查询参数 |
| `organization.service.ts` | ① `listInvitations(actorId, orgId)` 加门禁 ② `getAudit` 增分页 + 筛选（参数化 SQL，防注入） |
| `organization.types.ts` | 补 `AuditQuery` / `AuditPage` / `InvitationListQuery`（纯接口） |
| `organization.service.spec.ts` | 新增 ≥ 10 单测（邀请门禁 403、审计分页/筛选、越权边界） |
| `organization.controller.spec.ts` | 更新对 `listInvitations` 新签名的测试 |
| `.agents/claude/outputs/p2-task-10-file-list.md` | 新增/修改清单 |
| `.agents/claude/outputs/p2-task-10-verify.sh` | 自动化验收脚本 |

---

## ✅ 验收标准（硬性）

1. `npx tsc --noEmit` → 0 error。
2. `npx jest src/modules/organization` 全绿；新增 ≥ 10 测试。
3. `npx jest`（全量）**不回归** —— 基线 **32 suites / 466 tests**。
4. `bash .agents/claude/outputs/p2-task-10-verify.sh` → `FAIL=0`。
5. **邀请门禁**：非该组织 owner/admin 用户 `GET :id/invitations` → **403**（修复前为 200 裸数据）。
6. **审计分页**：`GET :id/audit?limit=10&offset=10` 返回第二页；`?action=X` / `?entityType=Y` 正确过滤。
7. **参数化**：筛选值走 bind 参数，无 SQL 注入拼接。
8. **既有回归**：组织 CRUD/成员/角色端点行为不变。

---

## 🧪 验收脚本 `p2-task-10-verify.sh` 规范

```bash
#!/usr/bin/env bash
# T10 自动化验收：邀请鉴权门禁 + 审计分页/筛选
set -uo pipefail
API_BASE="${API_BASE:-http://localhost:3008/api}"
# 前置：operator 登录取 token（testuser=根 owner）；另备一个非成员 token
# 1. GET /organization/{orgId}/invitations（operator）→ 200 列表
# 2. GET /organization/{orgId}/invitations（非成员 token）→ 403  ← 本次修复点
# 3. GET /organization/{orgId}/audit?limit=5&offset=0  → 5 条
# 4. GET /organization/{orgId}/audit?limit=5&offset=5  → 下一页
# 5. GET /organization/{orgId}/audit?action=<已知action>  → 过滤生效
# 6. 回归：POST /organization → 201；GET /organization/{id}/members → 200
echo "全绿：PASS=$PASS FAIL=$FAIL"
```

---

## 📝 任务卡路径

```
.agents/claude/tasks/p2-task-10-organization-member-invitation-audit.md
```
