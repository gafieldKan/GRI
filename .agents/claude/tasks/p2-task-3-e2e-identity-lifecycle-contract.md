> ⚠️ STATUS: REWRITTEN IN PLACE (2026-10-10) —— 本文件已就地更新为校正版（增量整合 T1 e2e + T2 运营面 + 契约 spec）。

# P2-T3 任务卡（Claude）：身份全生命周期端到端契约 + `external_id ≡ users.id` 契约测试

**执行者**：Claude（架构师 / 验证者）
**依赖**：T1（`08bcb33`）+ T2（`p2-task-2b` 实现完成）就绪
**产出目录**：`.agents/claude/outputs/`、`services/api/src/modules/identity/`（仅测试文件）
**预估**：0.5 天

---

## 🎯 背景（务必先核实现实，勿照旧卡）

旧 `p2-task-3-e2e-identity-lifecycle-contract.md` 假设需从零整合 T1/T2 脚本。**实测校正（2026-10-10）**：
- T1 的 e2e 脚本 `.agents/codex/outputs/p2-task-1-verify.sh` 已存在且 **PASS=20 / FAIL=0**；
- `services/api/src/modules/identity/identity.contract.spec.ts` **尚未创建**；
- T2 完成后将新增运营管理面端点，T3 需把 T2 也纳入端到端覆盖。

**结论**：T3 = 在 T1 既有 e2e 基础上**增量整合 T2** + 新建**契约 spec**，而非重写。

---

## 📋 任务目标

1. **统一端到端脚本**：注册→登录→读自己档案→改密→新密登录→注销→再登录失败，**外加** T2 的运营面（role/status/列表 + 越权边界）。
2. **契约测试**（独立文件 `identity.contract.spec.ts`）：验证 `JWT.sub → req.auth.externalId → public.users.id → edu.students.user_id` 全链路一致，且 `external_id != sub`。
3. **越权/边界**：他人改密、他人注销、非运营调运营接口、运营改自己 role/status、缺 token / 坏 token。

---

## 📥 必读上下文（按顺序）

| 文件 | 用途 |
|------|------|
| `.agents/codex/outputs/p2-task-1-verify.sh` | T1 既有 e2e（**整合复用，勿重写**） |
| `.agents/codex/outputs/p2-task-2-verify.sh` | T2 新增 e2e（完成后并入） |
| `services/api/src/modules/identity/identity.service.ts` | `getProfileByExternalId` 契约实现 |
| `services/api/src/modules/identity/identity.controller.ts` | T2 后端点全集 |
| `services/api/src/auth/jwt-auth.middleware.ts` | `req.auth` 注入语义 |
| `services/auth-center/src/auth/auth.service.ts` | `register`/`login`/`changePassword`/`logout` |
| `docs/GRI_REWRITE_CONSTRUCTION_PLAN.md` §3.2 | 核心三表契约：`identities.external_id ≡ users.id ≡ students.user_id` |
| `.agents/claude/outputs/p2-task-2-contract.md` | T2 端点契约表（T3 直接引用） |

---

## 📦 产出物清单

| 文件 | 动作 |
|------|------|
| `.agents/claude/outputs/p2-task-3-e2e-identity-lifecycle.sh` | **统一端到端脚本**（T1 + T2 整合；或作为 T1 脚本的上层 wrapper，给出决策） |
| `services/api/src/modules/identity/identity.contract.spec.ts` | **契约测试**（独立 spec 文件）：external_id 链路 + sub≠externalId |
| `.agents/claude/outputs/p2-task-3-file-list.md` | 新增/修改文件清单 |
| `.agents/claude/outputs/p2-task-3-verify.sh` | 指向统一脚本的入口（或直接复用，说明） |

---

## ✅ 契约断言（硬性，逐条）

1. 注册新用户 → `public.users` 建行成功；auth-center `identities.external_id` = 该 `users.id`。
2. 登录拿 JWT → 解码：`payload.sub` = identity.id，`payload.externalId` = `users.id`，且 **`externalId != sub`**。
3. `GET /api/identity/me` 用该 token → 返回的 `user.id` == `externalId`。
4. 若用户为 student：`edu.students.user_id` == 同一 `externalId`（三表贯通）。
5. 随机伪造的 externalId 不能读到他人档案（403/404）。
6. **反例锚点**（防漂移）：`external_id` 不得等于 `sub`（防止退回“退化为 identity.id”的旧 bug）。

---

## ✅ 验收标准

1. `bash .agents/claude/outputs/p2-task-3-e2e-identity-lifecycle.sh` → **FAIL=0**；输出 `PASS=n FAIL=0 VERIFY_EXIT=0`。
2. `npx jest identity.contract.spec` → 全绿。
3. 脚本**幂等可重跑**（重复执行不因用户名冲突而 FAIL——用时间戳/uuid 后缀或前置清理）。
4. 基址取 `API_BASE=http://localhost:3008/api`、`AUTH_BASE=http://localhost:3004/auth`。
5. UUID 卫生：psql 取值必须 `head -n1 | tr -d`（吸取 T4 教训）。
6. 不修改任何生产代码（仅测试文件 + 脚本）。

---

## 📝 存放路径
```
.agents/claude/tasks/p2-task-3-e2e-identity-lifecycle-contract.md
```
> 注：本卡**取代**同路径旧卡（旧卡内容已被本版覆盖，见账本）。
