# P2-T1 任务卡（Codex）：注册链路身份契约修复 + 注销 + 改密

**执行者**：Codex（实现专家）
**依赖**：`p2-task-1a` 设计文档（`.agents/claude/outputs/p2-task-1-identity-register-contract-design.md`，**必须严格照此实现**）
**产出目录**：`services/api/src/`、`services/auth-center/src/`、`.agents/codex/outputs/`
**预估**：1 天

> ⚠️ 本卡是**重写版**。上一版把注册当「透传代理」处理，导致 `external_id` 落空——已作废。
> 本版核心：**注册 = 业务库建 `public.users` 行 → 以其 uuid 作为 `external_id` 调入 auth-center**。

---

## 🎯 任务目标

1. **注册编排**（`POST /api/auth/register`）：`services/api` 先建 `public.users` → 拿 `uuid` → 调 auth-center 服务间写面建 identity（`external_id = uuid`）→ 失败补偿回滚 users。
2. **auth-center 服务间写面**：`POST /auth/admin/identities`（`X-Service-Token` 保护，复用既有 `timingSafeEqual` 模式）。
3. **改密**：`POST /auth/password`（需登录，`meFromBearer()` 解析身份）→ `services/api` 侧 `POST /api/auth/password` 透传。
4. **注销**：`DELETE /api/identity/me`（防 IDOR，`externalId` 取自 `req.auth`）→ `IdentityService.deleteProfile()` 事务级联删除。
5. **清理半成品**：上一轮已写入但**未实现**的失败单测（`deleteProfile`/`deleteMe`/`changePassword`）必须转绿——**禁止**删测试来「通过」。

---

## 📥 必读上下文（按顺序）

| 文件 | 用途 |
|------|------|
| `.agents/claude/outputs/p2-task-1-identity-register-contract-design.md` | **权威设计**，逐条实现 |
| `services/api/src/modules/auth/auth.controller.ts` | 现行透传代理（含已加的 `register()`） |
| `services/api/src/modules/identity/identity.service.ts` | 需新增 `deleteProfile()` |
| `services/api/src/modules/identity/identity.controller.ts` | 需新增 `@Delete('me')` |
| `services/api/src/auth/public-routes.ts` | 公开白名单（`/auth/register` 已加；确认 `/auth/password` **不进**白名单） |
| `services/api/src/modules/organization/organization.service.ts` | **api 调 auth-center 服务间面的既有范例**（`X-Service-Token`） |
| `services/api/src/config/config.ts` | `identity.serviceToken` / `AUTH_SERVICE_TOKEN` |
| `services/auth-center/src/admin/identity-admin.service.ts` | 服务间授权模式（照此扩展写面） |
| `services/auth-center/src/auth/auth.service.ts` | `register()` / `meFromBearer()`；新增 `changePassword()` |
| `services/auth-center/src/users/users.service.ts` | `create()`（支持 `externalId` 入参） |
| `services/auth-center/src/migrate/001_init_identity.sql` | gri_auth identities DDL |

---

## 📦 产出物清单

> 以下与**设计文档 §8「实现落点清单」逐条对齐**（设计为准；若有出入以设计为准并在最终消息说明）。

### auth-center（身份域）
| 文件 | 动作 |
|------|------|
| `src/users/identity.entity.ts` | `Domain` 类型扩为 `'food' \| 'tutor' \| 'core'` |
| `src/admin/identity-admin.service.ts` | 新增 `createIdentity(dto)`（bcrypt + UUID 校验 + 唯一预检→409）；`disableIdentityByExternalId(ext)`（status='disabled' + 吊销 refresh_tokens） |
| `src/admin/identity-admin.controller.ts` | 新增 `POST /auth/admin/identities`、`DELETE /auth/admin/identities/:externalId`（均 `authorize()` 前置） |
| `src/auth/auth.controller.ts` | 新增 `POST /auth/password`（Bearer）；旧 `register()` 改为 `throw new GoneException(...)`（`@deprecated`） |
| `src/auth/auth.service.ts` | 新增 `changePassword()`；`login()`/`refresh()` 增 `status!=='active'` → 401 |
| `src/auth/dto/auth.dto.ts` | 新增 `CreateIdentityDto`、`ChangePasswordDto`（class-validator） |

### services/api（业务编排）
| 文件 | 动作 |
|------|------|
| `src/modules/auth/auth.controller.ts` | `register()` 改为**编排**（非透传）；新增 `@Post('password')` 代理（透传 Authorization） |
| `src/modules/auth/auth.service.ts` | 新增 `register(dto)` 编排 + `changePassword(bearer, body)` 代理 + 私有 `authCenterAdminFetch()`（`x-service-token`，范式抄 `organization.service.ts:41-51`） |
| `src/modules/auth/dto/register.dto.ts`（新建） | RegisterDto（class-validator：username@MinLength(3)、email@IsEmail、password@MinLength(8)） |
| `src/modules/auth/dto/change-password.dto.ts`（新建） | ChangePasswordDto |
| `src/modules/identity/identity.controller.ts` | 新增 `@Delete('me') deleteMe()`（`externalId` 取自 `req.auth`，防 IDOR） |
| `src/modules/identity/identity.service.ts` | 新增 `deleteProfile(externalId)`（**软删**：status='deleted'+deleted_at）；`getProfileByExternalId`/`updateProfile` 查询追加 `AND deleted_at IS NULL` |
| `src/modules/identity/identity.module.ts` | 若 service 需调 auth-center，注入 config（`identity` broker 已就绪 `config.ts:65-68`） |
| `src/auth/public-routes.ts` | **不动**：`/auth/register` 已在册保留；`/auth/password`、`/identity/me` **不**入白名单（自动 401 兜底） |
| `src/migrate/017_identity_register_contract.sql`（新建） | `public.users` 加 `UNIQUE(username/email/phone)` + `CHECK(status IN ('active','deleted','suspended'))` + `CHECK(char_length(username)>=3)` |
| `src/migrate/backfill-external-id.ts`（新建） | 跨库对账/回填（见设计 §9；同时连 `gri` + `gri_auth`，幂等） |

### 前端（注册目标改指统一入口）
| 文件 | 动作 |
|------|------|
| `apps/web/src/api/auth.js` | `register()` URL 从 `AUTH_BASE/register` 改指 `${VITE_API_BASE_URL}/api/auth/register`；**请求/响应形状不变**（登录仍走 auth-center `/auth/login`） |
| `packages/auth-client/src/endpoints.js` | `createEndpoints({authBase, apiBase})`：`register()` 用 `apiBase ?? authBase`；其余端点不变 |

### 通用
| 文件 | 动作 |
|------|------|
| `*.spec.ts`（对应上述） | 补齐/转绿单测（含 auth-center 新增面） |
| `.agents/codex/outputs/p2-task-1-file-list.md` | 新增/修改文件清单（排除 node_modules/dist） |
| `.agents/codex/outputs/p2-task-1-verify.sh` | 自动化验收脚本（按设计 `p2-task-1-e2e-verification-spec.md`） |

---

## ✅ 验收标准（硬性，全绿才算完成）

1. **TypeScript 编译通过**：`cd services/api && npx tsc --noEmit` → **exit 0，0 error**（当前有 10 个失败单测引用错误，必须清零）。
2. **单测全绿**：
   ```bash
   cd services/api && npm run test -- src/modules/auth src/modules/identity
   cd services/auth-center && npm run test
   ```
3. **端到端脚本通过**：`bash .agents/codex/outputs/p2-task-1-verify.sh` → `全绿：PASS=X FAIL=0`。
4. **容器构建通过**：`docker compose build api auth-center`。
5. **契约生效**：
   - `POST /api/auth/register` 无 token 可访问（201/400/409）。
   - 注册后 `gri_auth.identities.external_id` **非空**且命中 `gri.public.users.id`。
   - `POST /api/auth/password` 无 token → 401；带 token → 200/400。
   - `DELETE /api/identity/me` 无 token → 401；带 token → 200。

---

## 🧪 验收脚本规范（落成 `p2-task-1-verify.sh`）

```bash
#!/usr/bin/env bash
# P2-T1 自动化验收：注册编排 → 登录 → external_id 映射校验 → 改密 → 注销
set -uo pipefail
API_BASE="${API_BASE:-http://localhost:3008/api}"   # docker compose 宿主映射
AUTH_BASE="${AUTH_BASE:-http://localhost:3004/auth}"

# 1. 注册唯一新用户（时间戳后缀），期望 201
# 2. 登录拿 accessToken，期望 200
# 3. 【关键】断言 token 的 external_id != sub，且等于 public.users 中该 username 的 id
#    （可经 /api/identity/me 返回的 user.id 交叉验证）
# 4. GET /api/identity/me 带 token → 200，且返回本人档案
# 5. POST /api/auth/password 改密（旧密→新密）→ 200
# 6. 用新密登录 → 200；用旧密登录 → 401
# 7. DELETE /api/identity/me → 200
# 8. 再登录 → 401（账号已注销）
# 9. 公开路由断言：register 无 token 201/400；password/me 无 token 401
# 每步检查 HTTP 状态码，统计 PASS/FAIL，末尾打印「全绿：PASS=X FAIL=0」
```

> 依赖运行中的容器：`postgres`、`postgres-auth`、`auth-center`、`api`。脚本开头做可达性探测，不可达则明确报错。

---

## 🔐 关键实现细节（红线）

| 点 | 要求 |
|----|------|
| **唯一映射** | `external_id ≡ public.users.id` **只在一处**发生：`services/api` 注册编排里 `createBusinessUser()` 产出的 uuid 传给 auth-center。业务代码一律据 `req.auth.externalId` 定位，**禁止**客户端传 externalId |
| **补偿** | auth-center 建 identity 失败 → 删除刚建的 `public.users` 行（事务或显式），保持无孤儿 |
| **防越权** | `/auth/admin/identities` 必须 `X-Service-Token`（`timingSafeEqual`）；`/auth/password` 身份从 token 解析，**不接受** body 传 identityId |
| **防 IDOR** | `DELETE /api/identity/me` 的 externalId 取自 `req.auth`，只能删自己 |
| **deleteProfile = 软删** | ⚠️ **设计已改**：`UPDATE public.users SET status='deleted', deleted_at=NOW(), updated_at=NOW() WHERE id=$1`（**非硬删**）。理由：硬删 CASCADE 只在 `gri` 内、触达不到 `gri_auth.identities`，留孤儿身份安全洞 |
| **注销顺序（安全优先）** | `DELETE /api/identity/me`：先调 auth-center `DELETE /auth/admin/identities/:externalId` 停用凭证（失败则 502 中止，不动 users）；成功后再软删 users |
| **存量坏数据** | 既有 `gri_auth.identities.external_id IS NULL` 的行必须 backfill（设计 §9），否则老用户登录后 externalId 仍落 sub |
| **迁移 017 须实际生效** | 迁移运行器为显式 `run-migrations.ts`（非自动）——**必须实际执行 017** 并确认 `public.users` UNIQUE/CHECK 已建，不能只写文件 |
| **密码** | 仅 `bcryptjs`（禁 `bcrypt`）；`bcrypt.compare` 校验旧密，`bcrypt.hash(新密, 12)` 存储 |
| **白名单语义** | `register` 公开；`password`/`identity/me` 走强制鉴权（不在 `PUBLIC_ROUTES`） |
| **类型** | TS strict / `exactOptionalPropertyTypes` 通过；禁 `any` |

---

## 📝 存放路径
```
.agents/codex/tasks/p2-task-1-identity-register-delete-password.md
```
