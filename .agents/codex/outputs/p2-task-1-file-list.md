# P2-T1 变更文件清单（注册链路身份契约 + 注销 + 改密）

> 对应任务卡：`.agents/codex/tasks/p2-task-1-identity-register-delete-password.md`
> 权威设计：`.agents/claude/outputs/p2-task-1-identity-register-contract-design.md`
> 排除：`node_modules/`、`dist/`。`M`=修改，`A`=新增。

## auth-center（身份域）

| 动作 | 文件 |
|------|------|
| M | `services/auth-center/src/users/identity.entity.ts` — `Domain` 扩为 `'food' \| 'tutor' \| 'core'` |
| M | `services/auth-center/src/auth/dto/auth.dto.ts` — 新增 `CreateIdentityDto`（externalId `@Matches(UUID)`）、`ChangePasswordDto`；旧 `RegisterDto` 标 `@deprecated` |
| M | `services/auth-center/src/auth/refresh-tokens.service.ts` — 新增 `revokeAllForIdentity()` |
| M | `services/auth-center/src/admin/identity-admin.service.ts` — 新增 `createIdentity(dto)`（唯一预检→409 + bcrypt(12)）、`disableIdentityByExternalId(ext)`（status='disabled' + 吊销 refresh） |
| M | `services/auth-center/src/admin/identity-admin.controller.ts` — 新增 `POST /auth/admin/identities`、`DELETE /auth/admin/identities/:externalId`（`authorize()` 前置） |
| M | `services/auth-center/src/auth/auth.service.ts` — 新增 `changePassword()`；`login()`/`refresh()` 增 `status!=='active'`→401 |
| M | `services/auth-center/src/auth/auth.controller.ts` — 新增 `POST /auth/password`（Bearer）；旧 `register()` 改 `GoneException(410)` |
| M | `services/auth-center/src/admin/identity-admin.service.spec.ts` — 补 `createIdentity`/`disableIdentityByExternalId` 用例 |
| M | `services/auth-center/src/admin/identity-admin.controller.spec.ts` — 补 create/disable 控制器用例 |

## services/api（业务编排）

| 动作 | 文件 |
|------|------|
| A | `services/api/src/modules/auth/auth.controller.ts` — `register()` 改**编排**（非透传）；新增 `@Post('password')` 代理（透传 Authorization） |
| A | `services/api/src/modules/auth/auth.service.ts` — `register(dto)` 编排（建 users→uuid→建身份→失败补偿）+ 私有 `createAuthIdentity()`（`x-service-token`） |
| A | `services/api/src/modules/auth/auth.module.ts` |
| A | `services/api/src/modules/auth/dto/register.dto.ts` — 纯接口 DTO（见「偏差」） |
| A | `services/api/src/modules/auth/dto/change-password.dto.ts` — 纯接口 DTO |
| A | `services/api/src/modules/auth/auth.service.spec.ts` — 编排/补偿/校验用例 |
| M | `services/api/src/modules/auth/auth.controller.spec.ts` — register 从「透传」改「编排」断言 |
| M | `services/api/src/modules/identity/identity.service.ts` — 新增 `deleteProfile()`（**软删**）+ `disableAuthIdentity()`；`get/updateProfile` 追加 `AND deleted_at IS NULL` |
| M | `services/api/src/modules/identity/identity.service.spec.ts` — `deleteProfile` 断言由**硬删**改**软删**（+ mock fetch） |
| M | `services/api/src/modules/identity/identity.controller.ts` — 新增 `@Delete('me') deleteMe()`（externalId 取自 `req.auth`，防 IDOR） |
| A | `services/api/src/modules/identity/identity.controller.spec.ts` — deleteMe 用例 |
| A | `services/api/src/migrate/017_identity_register_contract.sql` — `public.users` UNIQUE/CHECK + 去重预检 |
| A | `services/api/src/migrate/backfill-external-id.ts` — 跨库存量回填（幂等，`DRY_RUN=1` 支持） |

## 前端（注册改指统一入口）

| 动作 | 文件 |
|------|------|
| M | `apps/web/src/api/auth.js` — `register()` 改 `POST ${VITE_API_BASE_URL}/api/auth/register`（形状不变） |
| M | `packages/auth-client/src/endpoints.js` — `createEndpoints({authBase, apiBase})`，`register()` 走 `apiBase` |
| M | `packages/auth-client/src/store.js` — `createAuthStore` 透传 `apiBase` |
| M | `packages/auth-client/tests/store.test.js` — register mock 改指 `/api/auth/register` |
| M | `apps/mini-program-ai-tutor/store/auth.js` — 实例化补 `apiBase`（小程序需绝对地址） |

## 产出物

| 动作 | 文件 |
|------|------|
| A | `.agents/codex/outputs/p2-task-1-file-list.md`（本文件） |
| A | `.agents/codex/outputs/p2-task-1-verify.sh` — 自动化验收脚本 |

---

## ⚠️ 与任务卡的偏差（以设计为准）

1. **DTO 用纯接口 + 手工校验，非 class-validator 装饰器**。
   `class-validator` 未在 `services/api/package.json` 声明（仅在根 `node_modules` 经其他 workspace 提升存在）。依赖提升不可靠（`npm ci --workspace=gri-api` 不保证装入），故 `register.dto.ts`/`change-password.dto.ts` 用普通 TS 接口（metatype=Object，`ValidationPipe` 自动跳过），校验下沉到 `AuthService.validateRegister()`。契约不变（400/409 语义一致）。

2. **`POST /api/auth/password` 由控制器通用 `proxy()` 透传**（未在 `AuthService` 另立 `changePassword`）。
   设计与卡第 17 条均要求 api 侧透传；控制器已有 `proxy()` 通用透传（透传 Authorization + Set-Cookie + 状态码），复用更少代码。

3. **`deleteProfile` 软删（非硬删）**。
   `identity.service.spec.ts` 原先编码的是**硬删事务**，与设计 §「软删」冲突。经核对任务卡 §「deleteProfile = 软删 · 设计已改」与设计文档，两处权威源一致要求软删，故**改写**该 spec 为软删断言（未删测试，是纠正过时断言）。
