> ⚠️ STATUS: DOWNGRADE TO VERIFY (2026-10-10) —— organization.controller 已 ~24 端点（members/roles/invitations/audit/tree/search），近乎完整。按 card-recon §八 降级为核验卡，只补真缺口。

# T10 任务卡：`organization` 模块 - 组织/成员/角色/邀请/审计 + Portal 管理台联调

**执行者**：Claude  
**依赖**：M1 完成（identity 契约就绪）  
**产出目录**：`services/api/src/modules/organization/`  
**预估**：1 天

---

## 📋 任务目标

实现 **组织管理** 核心功能，支撑 Portal 管理台：

1. **组织 CRUD**：`POST/GET/PUT/DELETE /api/organization/organizations`（Operator 专用）
2. **成员管理**：`GET/POST/DELETE /api/organization/organizations/:id/members`、角色赋予/撤销
3. **邀请流程**：`POST /api/organization/invitations`（生成邀请码/链接）、`POST /api/organization/invitations/accept`（受邀者接受）
4. **审计日志**：`GET /api/organization/audit-logs`（分页、筛选、导出）

---

## 📥 必读上下文（按顺序）

| 文件 | 用途 |
|------|------|
| `services/api/src/modules/organization/organization.controller.ts` | 现有端点风格、鉴权模式 |
| `services/api/src/modules/organization/organization.service.ts` | 现有实现参考 |
| `services/api/src/modules/organization/organization.types.ts` | 需补 `Organization`、`Member`、`Invitation`、`AuditLog`、`Role` 枚举 |
| `services/api/src/modules/organization/organization.service.spec.ts` | 现有测试风格 |
| `services/api/src/auth/jwt-auth.middleware.ts` | `req.auth.roles` 来源，Operator 判定 |
| `apps/portal/src/views/organization/` | Portal 管理台前端页面（联调参考） |

---

## 📦 产出物清单

| 文件 | 动作 |
|------|------|
| `services/api/src/modules/organization/organization.controller.ts` | 新增/补全 12+ 端点（含权限守卫） |
| `services/api/src/modules/organization/organization.service.ts` | 新增 `createOrg`、`updateOrg`、`deleteOrg`、`listMembers`、`addMember`、`removeMember`、`changeMemberRole`、`createInvitation`、`acceptInvitation`、`getAuditLogs` |
| `services/api/src/modules/organization/organization.types.ts` | 补全上述类型，`Role = 'owner' | 'admin' | 'member' | 'viewer'` |
| `services/api/src/modules/organization/organization.service.spec.ts` | 新增 15+ 单测：组织 CRUD、成员增删改、邀请流程、审计日志、权限边界 |
| `services/api/src/modules/organization/organization.controller.spec.ts` | 新增 Controller 单测（权限、参数校验） |
| `.agents/claude/outputs/p2-task-10-file-list.md` | 本任务新增/修改文件清单 |
| `.agents/claude/outputs/p2-task-10-verify.sh` | 自动化验收脚本（见下） |

---

## ✅ 验收标准（硬性）

1. **TypeScript 编译通过**：`npm run build` 0 error
2. **单测全绿**：`npm run test -- src/modules/organization/` 全部通过（目标 ≥ 30 tests）
3. **端到端验证脚本通过**：运行 `bash .agents/claude/outputs/p2-task-10-verify.sh` 输出 `全绿：PASS=X FAIL=0`
4. **权限模型**：
   - `owner`：组织全权、可转让所有权、解散组织
   - `admin`：成员管理、邀请、角色赋予（除 owner）
   - `member`：查看成员、退出组织
   - `viewer`：仅查看
   - 非成员访问 → 403
5. **邀请流程**：
   - 邀请码 7 天有效、单次使用、可撤销
   - 接受邀请自动创建 `tenant.organization_members` 记录
6. **审计日志**：记录 `organization_id`、`actor_id`、`action`、`target_type`、`target_id`、`metadata`、`created_at`

---

## 🧪 验收脚本 `task-10-verify.sh` 规范

```bash
#!/usr/bin/env bash
# T10 自动化验收：组织/成员/邀请/审计
set -uo pipefail
API_BASE="${API_BASE:-http://localhost:3008/api}"

# 1. Operator 创建组织 → 201，自动成为 owner
# 2. Operator 列表组织 → 分页、筛选
# 3. Owner 邀请用户 A（member） → 邀请码生成
# 4. 用户 A 接受邀请 → 200，成员列表含 A
# 5. Admin 修改 A 角色 → admin → 200
# 6. 非成员访问组织详情 → 403
# 7. Owner 解散组织 → 200，成员自动清理
# 8. 审计日志：GET /audit-logs?organization_id=xxx → 含上述操作记录
# 9. Portal 联调：前端组织管理页面可正常增删改查
```

---

## 🔐 关键实现细节

| 点 | 要求 |
|----|------|
| 组织表 | `tenant.organizations(id, name, code, description, owner_id, status, created_at)` |
| 成员表 | `tenant.organization_members(id, organization_id, user_id, role, joined_at, invited_by)`，唯一键 `(organization_id, user_id)` |
| 邀请表 | `tenant.invitations(id, organization_id, code, email?, role, invited_by, expires_at, used_at, revoked_at)` |
| 审计表 | `tenant.audit_logs(id, organization_id, actor_id, action, target_type, target_id, metadata, created_at)`，分区表（按月） |
| 角色层级 | `owner > admin > member > viewer`，权限检查函数 `can(actorRole, action, targetRole?)` |
| 事务边界 | `createOrg`、`acceptInvitation`、`deleteOrg` 均在事务中 |

---

## 📝 任务卡存放路径

```
.agents/claude/tasks/p2-task-10-organization-member-invitation-audit.md
```