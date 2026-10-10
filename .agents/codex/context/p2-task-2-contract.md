# P2-T2 契约表 + 验收断言清单

> 配套主设计：`p2-task-2-identity-operator-authz-design.md`
> 用途：① Codex 实现规格（逐端点）；② Claude T3 e2e 断言来源。
> 前缀：全部挂 `/api`（`main.ts` `setGlobalPrefix('api')`）。

---

## 1. 端点契约表

### 1.1 `GET /api/identity` —— 运营用户列表

| 项 | 规格 |
|----|------|
| 鉴权 | `requireOperator`：`await org.assertSiteOperator(req.auth.externalId)`；非运营 → 403 |
| 白名单 | **否**（未登录 → 401，中间件兜底） |
| Query | `page?: number`（缺省 1，∈≥1）｜`pageSize?: number`（缺省 20，∈[1,100]）｜`role?: Role`｜`status?: UserStatus`｜`q?: string` |
| 缺省行为 | `page=1`、`pageSize=20`、`role` 不过滤、`status` 不过滤（**排除 deleted**）、`q` 不过滤 |
| 成功 200 | `{ items: User[], total: number, page: number, pageSize: number }` |
| 失败 | 401 无/坏 token｜403 非运营宿主 或 缺 externalId｜400 分页越界/闭集外 role\|status/非整型 |
| SQL 语义 | 缺省 `WHERE deleted_at IS NULL`；`status=deleted` 时含软删行；`q` → `username/email/name ILIKE %q%`；`ORDER BY created_at DESC, id`；`LIMIT/OFFSET`；COUNT 与 SELECT 同一 WHERE |

**`User` 返回字段**：`id, username, email, phone, name, avatar_url, role, status, created_at, updated_at, deleted_at`（`public.users` 列；该表无 password 列）。

### 1.2 `PATCH /api/identity/:id/role` —— 变更角色

| 项 | 规格 |
|----|------|
| 鉴权 | `requireOperator`；非运营 → 403；**改自己 → 403** |
| 白名单 | 否（401 兜底） |
| Param | `:id` = 目标 `external_id`(`public.users.id`)，`ParseUUIDPipe` → 非法 400 |
| Body | `{ role: Role }`，`Role ∈ consumer\|student\|merchant\|operator` |
| 成功 200 | 更新后的 `User` 单行 |
| 失败 | 400 非法/缺 role｜403 非运营 或 改自己｜404 目标不存在或已软删 |
| 副作用 | 仅 `UPDATE public.users SET role=$2, updated_at=NOW()`；**不**触 auth-center；**不**重签 JWT（§6.3） |

### 1.3 `PATCH /api/identity/:id/status` —— 变更状态

| 项 | 规格 |
|----|------|
| 鉴权 | `requireOperator`；非运营 → 403；**改自己 → 403** |
| 白名单 | 否（401 兜底） |
| Param | `:id` 同上（`ParseUUIDPipe`） |
| Body | `{ status: UserStatus }`，`UserStatus ∈ active\|suspended\|deleted` |
| 成功 200 | 更新后的 `User` 单行 |
| 失败 | 400 非法/缺 status｜403 非运营 或 改自己｜404 目标不存在或已软删｜502 auth-center 不可达 |
| 副作用 | `deleted`→停凭证+`status='deleted',deleted_at=NOW()`；`suspended`→停凭证+`status='suspended'`；`active`→启用凭证+`status='active'`（§5） |

### 1.4 `GET /api/identity/:id`（**修正**现存端点）

| 项 | 规格 |
|----|------|
| 鉴权 | 本人（`id === externalId`）恒允许；**他人 → `requireOperator`**（替换死代码 `READ_ANY_ELEVATED_ROLES`） |
| 失败 | 401｜403 读他人且非运营｜404 不存在或已删 |
| 语义变更 | 删除 `req.auth.roles` 特权分支与 `'merchant'` 角色代理；merchant 语义归数据归属（food） |

### 1.5 不变端点（回归保护）

| 端点 | 鉴权 | 备注 |
|------|------|------|
| `GET /api/identity/me` | 本人（`req.auth.externalId`） | 保持 |
| `PUT /api/identity/me` | 本人 + 服务层白名单 | 保持（role/status 不可自助改） |
| `DELETE /api/identity/me` | 本人（仅 `req.auth.externalId`） | 保持（软删+停凭证） |

---

## 2. 状态迁移表（`PATCH .../status`）

| from \ to | active | suspended | deleted |
|-----------|--------|-----------|---------|
| **active** | ✅ 幂等(启用凭证) | ✅ 停凭证→suspended | ✅ 停凭证→软删 |
| **suspended** | ✅ **启用凭证**→active | ✅ 幂等 | ✅ 停凭证→软删 |
| **deleted** | ❌ 404（终态，不复活） | ❌ 404 | ❌ 404（预检短路） |

> 未在上表出现的目标态一律 **404**（预检 `WHERE id=$1 AND deleted_at IS NULL` 为空）。

---

## 3. 错误码总表

| 码 | 触发 | 出处 |
|----|------|------|
| 400 | 非法 uuid；分页越界/非整型；role/status 闭集外或缺失 | `ParseUUIDPipe`/服务层校验 |
| 401 | 无 Bearer / 坏签名 / 过期（/api 非白名单强制鉴权） | `AuthRouterMiddleware` |
| 403 | 非运营（`assertSiteOperator` 抛）；缺 `externalId`；运营改自己 | 控制器 `requireOperator`/自身保护 |
| 404 | 目标不存在或已软删（预检短路）；重复置 deleted | 服务层预检 |
| 502 | auth-center 停用/启用不可达或非 2xx(≠404) | `disableAuthIdentity`/`enableAuthIdentity` |

---

## 4. 验收断言清单（供 T3 e2e / 单测）

### 4.1 授权（红线核心）

- [ ] A1 `GET /api/identity` 无 token → **401**（未入白名单）。
- [ ] A2 普通用户（非根组织 owner\|admin）token → **403**，且响应不含任何用户数据。
- [ ] A3 运营 token → **200**。
- [ ] A4 断言**全程不依赖 `req.auth.roles`**：构造 `roles:[]`（或任意值）时判定结果**只**由 DB 组织成员决定。
- [ ] A5 `PATCH :id/role` 与 `:id/status` 非运营 → **403**（改前校验，无副作用）。
- [ ] A6 actorId 只取自 `req.auth.externalId`：请求 body/query 注入伪造 `externalId`/`actorId` **不**改变 actor（伪造无效）。
- [ ] A7 `GET /api/identity/:id` 读他人非运营 → **403**；读自己 → **200**（不查 org）；读他人且运营 → **200**。

### 4.2 自身保护

- [ ] B1 运营改**自己** role → **403**。
- [ ] B2 运营改**自己** status → **403**（防自锁）。
- [ ] B3 运营改**他人** role → **200**。

### 4.3 取值校验（fail-fast）

- [ ] C1 role 缺省 → 400；`role='superadmin'` → **400**。
- [ ] C2 status 缺省 → 400；`status='banned'` → **400**。
- [ ] C3 `:id` 非 uuid（如 `abc`）→ **400**。
- [ ] C4 `GET /api/identity?pageSize=101` → **400**；`page=0` → **400**；`pageSize=abc` → **400**。
- [ ] C5 库侧 `ck_users_role` 生效：直接 `UPDATE public.users SET role='x'` → PG **CHECK 违约**（红线双门禁，可单测库或用迁移验证）。

### 4.4 状态联动 + 补偿

- [ ] D1 `status=deleted` → 目标 `public.users.status='deleted'` 且 `deleted_at NOT NULL`；auth-center `identities.status='disabled'` 且 refresh token 清空。
- [ ] D2 `status=deleted` 时 auth-center 不可达 → **502**，且 `public.users` **未被修改**（无部分写）。
- [ ] D3 `status=suspended` → `public.users.status='suspended'`，`deleted_at IS NULL`；auth-center `identities.status='disabled'`。
- [ ] D4 `suspended` 用户尝试登录 → **拒绝**（auth-center login 校验 `status!=='active'`，F8）。
- [ ] D5 `status=active`（从 suspended 恢复）→ auth-center `identities.status='active'`；恢复后登录**成功**。
- [ ] D6 对 `deleted` 目标再置任意 status → **404**（不复活）。
- [ ] D7 对不存在 id → **404**（预检短路，auth-center **未**被调用）。

### 4.5 列表

- [ ] E1 缺省 `GET /api/identity` **不含** deleted 行。
- [ ] E2 `?status=deleted` → 含 deleted 行。
- [ ] E3 `?role=student` → 全部行 `role==='student'`。
- [ ] E4 `?q=<片段>` → 命中 username/email/name 之一。
- [ ] E5 分页：`total` 与 `items.length` 满足 `items.length ≤ pageSize`；翻页无重叠/遗漏（`ORDER BY created_at DESC, id` 稳定）。
- [ ] E6 空结果（`q=_____nomatch`）→ `{items:[], total:0}`，**200**。

### 4.6 级联 / JWT（无副作用断言）

- [ ] F1 `student → merchant` 后 `edu.students` 行**仍存在**（不级联删）。
- [ ] F2 改 role 后，**已签发** token 仍可用（无需重签），且凭新 role 参与后续业务判定。
- [ ] F3 `PUT /api/identity/me` 仍**不能**改 role/status（既有白名单回归）。

### 4.7 白名单 / 回归

- [ ] G1 `public-routes.ts` **无**新增 `/identity` 规则（三端点未放开）。
- [ ] G2 `GET /api/identity/me` 路由未被 `@Get()`/`:id` 吞掉（`me` 声明在 `:id` 前）。
- [ ] G3 既有 T1 e2e（`.agents/codex/outputs/p2-task-1-verify.sh`，PASS=20）**全绿不回归**。

---

## 5. 示例报文

### 5.1 列表 200
```json
{
  "items": [
    { "id": "uuid", "username": "alice", "email": "a@x.com", "phone": null,
      "name": "Alice", "avatar_url": null, "role": "student", "status": "active",
      "created_at": "2026-10-01T00:00:00.000Z", "updated_at": "2026-10-01T00:00:00.000Z",
      "deleted_at": null }
  ],
  "total": 1, "page": 1, "pageSize": 20
}
```

### 5.2 变更角色 200
```json
{ "id": "uuid", "username": "alice", "role": "merchant", "status": "active", "...": "..." }
```

### 5.3 失败样例
```json
{ "statusCode": 403, "message": "仅组织管理员可执行此操作" }
{ "statusCode": 400, "message": "role 必须是 consumer|student|merchant|operator 之一" }
{ "statusCode": 404, "message": "目标用户不存在或已注销" }
{ "statusCode": 502, "message": "身份服务不可达" }
```

---

## 6. 冒烟脚本要点（T3 可据此扩展 `.agents/codex/outputs/p2-task-2-verify.sh`）

1. 取运营 token（根组织 owner，如 `testuser`）与一名普通用户 token。
2. 逐条打 §4 断言（A/B/C/D/E/F/G），失败打印 `method path → got/expect`。
3. 计数 `PASS=/FAIL=`，非零退出码即红。基线：T1 脚本 PASS=20。
