> ⚠️ STATUS: SUPERSEDED (2026-10-10) —— 本卡含致命前提错误（用恒空的 req.auth.roles 判 Operator）。已被 p2-task-2a(设计) + p2-task-2-identity-operator-role-status-impl(实现) 取代。保留供追溯，勿执行。

# T2 任务卡：`identity` 模块 - Operator 角色/状态变更接口 + 单测补齐

**执行者**：Claude  
**依赖**：T1 完成（注册/注销/改密已就绪）  
**产出目录**：`services/api/src/modules/identity/`  
**预估**：0.5 天

---

## 📋 任务目标

为 `identity` 模块新增 **仅 Operator 可调用** 的管理接口：
1. **角色变更**：`PATCH /api/identity/:id/role` → `{ role: 'student'|'consumer'|'merchant'|'operator' }`
2. **状态变更**：`PATCH /api/identity/:id/status` → `{ status: 'active'|'suspended'|'deleted' }`
3. **批量查询**：`GET /api/identity` → 支持分页、角色筛选、状态筛选（Operator 专用）

---

## 📥 必读上下文（按顺序）

| 文件 | 用途 |
|------|------|
| `services/api/src/modules/identity/identity.controller.ts` | 现有 `getMe`/`getById`/`updateMe`/`deleteMe` 风格 |
| `services/api/src/modules/identity/identity.service.ts` | 需新增 `changeRole()`、`changeStatus()`、`listUsers()` |
| `services/api/src/modules/identity/identity.types.ts` | 类型定义，需补 `Role`、`UserStatus` 枚举 |
| `services/api/src/auth/public-routes.ts` | 确认新端点**不加入**白名单（需鉴权） |
| `services/api/src/auth/jwt-auth.middleware.ts` | `req.auth.roles` 来源，Operator 判定逻辑 |
| `services/api/src/modules/identity/identity.controller.spec.ts` | 现有测试风格参考 |

---

## 📦 产出物清单

| 文件 | 动作 |
|------|------|
| `services/api/src/modules/identity/identity.controller.ts` | 新增 3 个端点（含 `@UseGuards(RolesGuard)` 或内联角色校验） |
| `services/api/src/modules/identity/identity.service.ts` | 新增 `changeRole(id, role)`、`changeStatus(id, status)`、`listUsers(query)` |
| `services/api/src/modules/identity/identity.types.ts` | 补全 `Role`、`UserStatus`、`ListUsersQueryDto`、`ListUsersResult` |
| `services/api/src/modules/identity/identity.controller.spec.ts` | 新增 9+ 单测：角色/状态变更（权限、非法值、不存在、级联学生档案处理）、列表查询（分页、筛选） |
| `.agents/claude/outputs/p2-task-2-file-list.md` | 本任务新增/修改文件清单 |
| `.agents/claude/outputs/p2-task-2-verify.sh` | 自动化验收脚本（见下） |

---

## ✅ 验收标准（硬性）

1. **TypeScript 编译通过**：`npm run build` 0 error
2. **单测全绿**：`npm run test -- src/modules/identity/` 全部通过（目标 ≥ 20 tests）
3. **端到端验证脚本通过**：运行 `bash .agents/claude/outputs/p2-task-2-verify.sh` 输出 `全绿：PASS=X FAIL=0`
4. **权限校验生效**：
   - 非 Operator 调用 `/role` `/status` `/identity` → 403
   - Operator 调用 → 200，数据库落位
5. **数据一致性**：
   - `role: 'student' → 'consumer'` 时，`edu.students` 行保留但不再通过 `getMe` 返回
   - `status: 'deleted'` 等同于软删除，`getMe`/`getById` 返回 404

---

## 🧪 验收脚本 `task-2-verify.sh` 规范

```bash
#!/usr/bin/env bash
# T2 自动化验收：Operator 角色/状态/列表
set -uo pipefail
API_BASE="${API_BASE:-http://localhost:3008/api}"

# 1. 创建测试用户 A（普通 student）
# 2. 登录 Operator 账号拿 token
# 3. Operator 调用 PATCH /identity/{A}/role → merchant → 200
# 4. 普通用户调用同接口 → 403
# 5. Operator 调用 PATCH /identity/{A}/status → suspended → 200
# 6. 被 suspended 用户登录 → 401/403（auth-center 拦截或业务层拦截）
# 7. Operator 调用 GET /identity?role=merchant&page=1&size=10 → 列表含 A
# 8. 非 Operator 调用 GET /identity → 403
```

---

## 🔐 关键实现细节

| 点 | 要求 |
|----|------|
| 角色枚举 | `'student' \| 'consumer' \| 'merchant' \| 'operator'` 与 `public.users.role` CHECK 约束一致 |
| 状态枚举 | `'active' \| 'suspended' \| 'deleted'`，`deleted` 视为软删除 |
| 权限校验 | 复用 `READ_ANY_ELEVATED_ROLES = new Set(['operator', 'merchant'])` 或新建 `RolesGuard` |
| 级联影响 | `role` 从 `student` 变更时，`edu.students` 保留（历史档案），但 `getMe` 不再返回 `student` 字段 |
| 列表查询 | 支持 `page`、`size`、`role`、`status`、`keyword(username/name/email/phone)`，返回 `{ items, total, page, size }` |

---

## 📝 任务卡存放路径

```
.agents/claude/tasks/p2-task-2-identity-operator-role-status.md
```