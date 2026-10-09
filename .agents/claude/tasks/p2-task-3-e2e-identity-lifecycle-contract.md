# T3 任务卡：端到端验收 - 注册→登录→改密→注销全链路 + `external_id ≡ users.id` 契约测试

**执行者**：Claude  
**依赖**：T1 + T2 完成  
**产出目录**：`.agents/claude/outputs/`、`services/api/src/modules/identity/`（仅测试文件）  
**预估**：0.5 天

---

## 📋 任务目标

编写并跑通**完整端到端验收脚本**，覆盖：
1. **注册→登录→改密→注销** 全生命周期闭环
2. **`external_id ≡ users.id` 契约**：验证 JWT `sub` → `externalId` → `public.users.id` → `edu.students.user_id` 全链路一致
3. **越权/边界场景**：他人注销、他人改密、Operator 跨域操作

---

## 📥 必读上下文（按顺序）

| 文件 | 用途 |
|------|------|
| `.agents/codex/outputs/p2-task-1-verify.sh` | T1 验收脚本，需整合复用 |
| `.agents/claude/outputs/p2-task-2-verify.sh` | T2 验收脚本，需整合复用 |
| `services/api/src/modules/identity/identity.service.ts` | `getProfileByExternalId` 契约实现 |
| `services/api/src/auth/jwt-auth.middleware.ts` | JWT 验证 → `req.auth.externalId` 注入逻辑 |
| `services/auth-center/src/auth/auth.service.ts` | `register`/`login`/`changePassword`/`logout` 实现 |
| `docs/GRI_REWRITE_CONSTRUCTION_PLAN.md` §3.2 | 核心三表契约：`identities.external_id ≡ users.id ≡ students.user_id` |

---

## 📦 产出物清单

| 文件 | 动作 |
|------|------|
| `.agents/claude/outputs/p2-task-3-e2e-identity-lifecycle.sh` | **统一端到端验收脚本**（整合 T1+T2+契约测试） |
| `services/api/src/modules/identity/identity.contract.spec.ts` | **契约测试**：`external_id` 链路验证（独立测试文件，非单测） |
| `.agents/claude/outputs/p2-task-3-file-list.md` | 本任务新增/修改文件清单 |
| `.agents/claude/outputs/p2-task-3-verify.sh` | 指向统一验收脚本的入口（或直接复用） |

---

## ✅ 验收标准（硬性）

1. **统一脚本全绿**：运行 `bash .agents/claude/outputs/p2-task-3-e2e-identity-lifecycle.sh` 输出 `全绿：PASS=X FAIL=0`
2. **契约测试通过**：`npm run test -- src/modules/identity/identity.contract.spec.ts` 全部通过
3. **覆盖场景完整**：
   - ✅ 注册新用户 → 登录拿 token → `GET /identity/me` 返回 `externalId` = `users.id`
   - ✅ `GET /tuition/practice/stats/{externalId}` 200（业务层按 externalId 取数）
   - ✅ 改密 → 用新密登录 → 旧密失效
   - ✅ 注销账号 → 再次登录 401/404 → `GET /identity/me` 404
   - ✅ 越权：用 A 的 token 删 B → 403；用 A 的 token 改 B 密码 → 403
   - ✅ Operator 跨域：Operator token 可删任意用户、改任意角色/状态
   - ✅ 双锚点防漂移：`orders` 表 FK 指向 `users.id`、 `k12` 管线 `user_id` 指向 `users.id`

---

## 🧪 统一验收脚本 `task-3-e2e-identity-lifecycle.sh` 规范

```bash
#!/usr/bin/env bash
# T3 统一端到端验收：身份域全生命周期 + external_id 契约
set -uo pipefail
API_BASE="${API_BASE:-http://localhost:3008/api}"
AUTH_BASE="${AUTH_BASE:-http://localhost:3004/auth}"

PASS=0; FAIL=0
check() { ... }  # 同 T1/T2

# === 场景 1：注册→登录→Me 契约 ===
# 1.1 POST /auth/register {username,password,email} → 201
# 1.2 POST /auth/login {username,password} → accessToken
# 1.3 GET /identity/me (Bearer token) → 200, body.externalId = users.id (UUID)
# 1.4 校验 externalId 格式为 UUID v4

# === 场景 2：业务层按 externalId 取数 ===
# 2.1 GET /tuition/practice/stats/{externalId} → 200
# 2.2 GET /food/orders/me → 200（空数组）

# === 场景 3：改密 ===
# 3.1 PUT /auth/password {oldPassword, newPassword} (Bearer) → 200
# 3.2 POST /auth/login {username, newPassword} → 200, 新 token
# 3.3 POST /auth/login {username, oldPassword} → 401

# === 场景 4：注销 ===
# 4.1 DELETE /identity/me (Bearer) → 200
# 4.2 POST /auth/login {username, newPassword} → 401/404
# 4.3 GET /identity/me (旧 token) → 401/404

# === 场景 5：越权保护 ===
# 5.1 注册用户 B
# 5.2 用 A token DELETE /identity/me → 200（删自己）
# 5.3 用 A token DELETE /identity/{B_id} → 403（或 404，防枚举）
# 5.4 用 A token PUT /auth/password {oldPassword, newPassword} 作用于 B → 403

# === 场景 6：Operator 跨域 ===
# 6.1 登录 Operator 拿 token
# 6.2 Operator DELETE /identity/{B_id} → 200
# 6.3 Operator PATCH /identity/{B_id}/role → merchant → 200
# 6.4 Operator PATCH /identity/{B_id}/status → suspended → 200

# === 场景 7：external_id 契约（双锚点）===
# 7.1 校验 orders 表 user_id FK → users.id
# 7.2 校验 k12 管线导入的 user_id → users.id
# 7.3 通过 SQL 直查：SELECT COUNT(*) FROM auth.identities i JOIN public.users u ON i.external_id = u.id WHERE i.id = u.id → 全等

# 汇总输出
```

---

## 🔐 关键实现细节

| 点 | 要求 |
|----|------|
| 契约测试文件 | `identity.contract.spec.ts` 使用 `@nestjs/testing` + 真实 DB（Testcontainers 或共享测试库），不 Mock DB |
| externalId 来源 | `req.auth.externalId` = JWT `external_id` claim = `identities.external_id` = `users.id` |
| 双锚点防漂移 | 验收时跑一条 SQL：`orders.user_id` 和 `k12` 导入表 `user_id` 均 FK 向 `public.users.id` |
| 幂等性 | 脚本可重复运行（注册用随机用户名、注销后清理） |

---

## 📝 任务卡存放路径

```
.agents/claude/tasks/p2-task-3-e2e-identity-lifecycle-contract.md
```