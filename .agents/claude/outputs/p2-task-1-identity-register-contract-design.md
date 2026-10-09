# P2-T1 注册链路身份契约设计（主交付）

> 角色：GRI 架构师 / 决策者 · 执行日：2026-10-09 · 分支：`feat/stage-c-unified-auth-shell`
> 下游：Codex 依本设计实现 `p2-task-1`（实现卡）
> 红线锚点：**`external_id ≡ public.users.id`，全库仅一处映射**

---

## 0. 根因复述与设计目标

**实测缺陷（2026-10-09）**：

| 现象 | 位置 | 后果 |
|---|---|---|
| `gri_auth.identities.external_id` 除 `testuser` 外全为 `NULL` | `auth-center` `AuthService.register()` 建 identity 时不带 external_id | 无业务主键锚点 |
| `gri.public.users` 注册时**无行** | 注册只落 `auth.identities`；`public.users` 仅 seed/ETL/`ensurePublicUser` 自供给 | 业务库无「人」 |
| JWT `external_id` 退化为 `sub` | `packages/jwt-verifier/src/index.js:134` `payload.external_id ?? payload.sub` | `req.auth.externalId` = identity.id |
| `/api/identity/me`、`/api/identity/:id` 全部失效 | `identity.service` 以 `externalId` 当 `public.users.id` 查 | 404 / 403 |

**本质**：注册链路没有建立 `external_id ≡ public.users.id` 唯一映射。不是「补端点」，是**重建注册编排**。

**目标（本设计交付）**：
1. 注册 = **先在业务库建 `public.users`（拿 uuid）→ 以该 uuid 作 `external_id` 在 auth-center 建 identity**。
2. 同步补齐 **改密**、**注销** 两个身份变更端点，形成完整身份生命周期。
3. 全程 fail-fast + 补偿 + 幂等，不留半成品状态。

---

## 1. 关键现状事实（决策依据，先钉死）

这些是设计前**实测确认**的现状，直接决定了下述所有决策：

| 事实 | 证据 |
|---|---|
| **`public.users` 与 `identities` 在不同库** | `docker-compose.yml`: `api` → `DB_NAME=gri`(5432)；`auth-center` → `DB_NAME=gri_auth`(5434)。**跨库，无 DB 级 FK 可依赖** |
| `gri.auth.identities`（DDL001）的 FK 是**蓝图目标**，运行时未被 auth-center 读写 | auth-center 连 `gri_auth`；api `identity.service` 只读 `public.users`/`edu.students` |
| `public.users` **无 UNIQUE 约束** | `001_converge_foundation.sql:41-53`（username NOT NULL 但非 UNIQUE） |
| `gri_auth.identities` **有** UNIQUE(username/email/phone) | `auth-center/src/migrate/001_init_identity.sql:8-10` |
| auth-center 已有**服务间面** `X-Service-Token` + `timingSafeEqual` | `identity-admin.service.ts:19-25`；api 侧调用范式见 `organization.service.ts:41-73` |
| api 已有 **`public.users` 幂等自供给**范式 | `organization.service.ts:75-87` `ensurePublicUser` + `ON CONFLICT (id) DO NOTHING` |
| 前端注册**直连 auth-center** `/auth/register` | `apps/web/src/api/auth.js:17,72`（`AUTH_BASE='/auth'`）；`packages/auth-client/src/endpoints.js:42-44` |
| 前端 `apps/web/src/api/auth.js` 调用形状 | 入 `{username,email,password,name?}` → 出 `{code:201,data:null}` |
| `identity.controller.spec.ts` 已预置 `deleteProfile` mock | 说明注销能力早有预期，实现缺口 |

**决策基线**：本设计**面向双库现状**（auth-center 独占 `gri_auth`；api 独占 `gri`）。`external_id` 是**跨库 UUID 软引用**，一致性由**编排顺序 + 补偿 + 唯一约束**保证，**不依赖** DDL001 那条跨库 FK（它在 `gri` 内，运行时触达不到 `gri_auth`）。单库收敛（蓝图 §3）留作后续里程碑，本任务不迁移物理库。

---

## 2. §设计要点 1：注册编排（Orchestration）

### 2.1 决策:顺序 = 先 `public.users`，后 identity

```
POST /api/auth/register  {username, email?, phone?, password, name?}
        │  (公开端点，无需 token)
        ▼
┌─────────────────────────── services/api  AuthService.register() ───────────────────────────┐
│ 1. DTO 校验 + 归一化 (email→lowercase, 各 field trim)                                        │
│ 2. 预检 identity 是否已存在（auth-center admin lookup by username/email）→ 命中即 409        │
│ 3. INSERT public.users(username,email,phone,name, role='consumer', status='active')          │
│      ON CONFLICT(username/email/phone) → 见 2.4 幂等/自愈                                     │
│      RETURNING id  ─────────────────────────────► uuid (业务主键)                             │
│ 4. POST {AUTH_CENTER}/auth/admin/identities  (X-Service-Token)                               │
│      body = { domain:'core', username, email, phone, password, name, externalId: uuid } ◄── 唯一映射点
│      ├─ 201 → 完成                                                                            │
│      ├─ 409 → 补偿↓ ; throw Conflict(409)                                                    │
│      └─ 5xx/超时 → 补偿↓ ; throw BadGateway(502)                                             │
│ 5. 返回 201 { id, username, email, phone, name, role:'consumer', status:'active', createdAt } │
└──────────────────────────────────────────────────────────────────────────────────────────┘
   补偿 (Saga)：DELETE public.users WHERE id=:uuid（该行全新且无 FK 子行，硬删安全）
```

**为什么是这个顺序**：identity 必须先拿到 `external_id` 值才能建；而 `external_id` 的值只能由业务库产生（uuid）。故业务库先行。

### 2.2 决策：为什么**不能**复用 auth-center 公开 `/auth/register` 并传 external_id

**安全 — 客户端可伪造 `external_id` → 越权**。若公开注册允许调用方自带 `externalId`，攻击者可用**他人 `public.users.id`** 注册一个 identity，随后 JWT 的 `external_id` 指向受害者 → 直接读写受害者的档案/订单/学情。

**架构 — auth-center 不拥有业务库**：auth-center 只连 `gri_auth`，无法建 `public.users`，也无法验证一个 `external_id` 是否对应真实业务人。

**结论**：`external_id` 是**服务器侧可信注入**的字段，**只能经由 `X-Service-Token` 保护的服务间写面**由业务后端传入；公开面**永不接受** `externalId`。

### 2.3 决策：补偿（Compensation）

跨库无法用单事务（Saga 编排）：

| 失败点 | 动作 |
|---|---|
| step 3 失败（UNIQUE 冲突 / DB 错） | identity 尚未创建 → **无需补偿**，直接 409/500 |
| step 4 失败（identity 建失败） | **补偿**：`DELETE FROM public.users WHERE id=:uuid`（best-effort，吞异常但记日志）→ 再抛 409/502 |
| step 4 网络超时（结果未知） | 同上补偿删除；若 identity 实已建成 → 出现孤儿 identity（`external_id` 指向已删 users）→ 由 §7 对账脚本清理 |

**补偿为何用硬删而非软删**：被补偿的 `public.users` 行**创建于本请求内、尚无任何 FK 子行**（订单/学情/组织成员都没来得及挂），硬删干净且不触发 CASCADE 副作用，最安全。

### 2.4 决策：幂等 / 重试语义

- **天然重复注册**（账号已存在）→ **409 Conflict**。判据：`public.users` 命中 UNIQUE，**或** auth-center identity 已存在（step 2 预检）。
- **网络重试**（客户端超时重发）→ 同样 409，**不产生第二行**（UNIQUE 兜底）。
- **半成品自愈（关键）**：若 step 3 命中 UNIQUE，但按该行 `id` 查 auth-center **无对应 identity**（`byBusinessId` 返回 null）→ 判定为**上一次崩溃留下的孤儿 users 行**，**复用该 `id` 续跑 step 4**（密码用本次请求体）→ 201。用一个有界标记（每请求最多续跑一次）防抖。
  - 复用现有 `GET /auth/admin/identities/:businessId`（`identity-admin.service.ts:50`）判定，无需新端点。

**决策依据**：把 auth-center 的 credential 唯一性当「账号是否存在」的**权威判据**，`public.users` UNIQUE 作**第二道 DB 门禁**（防并发双写 + 防孤儿堆积）。

---

## 3. §设计要点 2：auth-center 新增服务间写面

### 3.1 决策：`POST /auth/admin/identities`（X-Service-Token 保护）

```
POST /auth/admin/identities
Header: X-Service-Token: <SERVICE_TOKEN>
Body:   { domain, username, email?, phone?, password, name?, externalId }
201 →   { success:true, identity:{ id, domain, username, email, phone, name, externalId, status, createdAt } }
                                                                    ▲ 脱敏：绝不含 password_hash
Idempotent: 同名/同 email/同 phone 已存在 → 409 { success:false, message }
```
- 实现落点：`services/auth-center/src/admin/identity-admin.service.ts` 新增 `createIdentity()`，
  复用既有 `authorize()`（`timingSafeEqual`，`identity-admin.service.ts:19-25`），**不得**放宽为公开端点。
- 内部：`bcrypt.hash(password, 12)`（与 `AuthService` 同 `BCRYPT_ROUNDS`）→ 调 `UsersService.create({domain,username,email,phone,passwordHash,name,externalId})`（该方法**已支持 externalId**，`users.service.ts:49-74`，无需改签名）。
- **强校验**：`externalId` 必填且须为 UUID 形态（服务端 regex），**不接受空**（这是根治 NULL external_id 的门禁）。

### 3.2 决策：`DELETE /auth/admin/identities/:externalId`（X-Service-Token 保护）

```
DELETE /auth/admin/identities/:externalId
Header: X-Service-Token
200 → { success:true }
```
- 语义：**软停用**（`status='disabled'`）+ **吊销该 identity 的全部 refresh_tokens**（`DELETE FROM refresh_tokens WHERE identity_id=...`，复用 `RefreshTokensService` 的 DB）。
- **按 `external_id` 定位**（不是 identity.id），与 api 侧 `req.auth.externalId` 同源，防 IDOR。
- 幂等：不存在或已 disabled → 仍 200（幂等接收者）。

### 3.3 决策：`domain` 取值 = **`'core'`**（引入中性身份域）

| 选项 | 结论 |
|---|---|
| `'food'`（沿用旧默认） | ❌ 语义误导——注册建的是**一个「人」的登录凭证**，不是「订餐域账户」；订餐/学情是**链接与角色**，不是身份域 |
| **`'core'`（中性域，采纳）** | ✅ 与蓝图「单一身份真源」一致：`identities` 是**域无关**的统一主体；跨域能力经 `auth.identity_links`（`domain='food'/'tutor', external_id=...`）挂接 |

- 落地：`services/auth-center/src/users/identity.entity.ts:1` `Domain` 类型扩为 `'food' | 'tutor' | 'core'`；DDL 注释同步（`VARCHAR(20)` 无需改列宽，纯值域扩展）。
- **存量行不动**：既有 `'food'`/`'tutor'` 保持**描述性**原值（无迁移），`domain` 在运行时**无等值判断**（已核：`grep domain === / ==` 零命中），仅作 JWT 声明透传，改值零风险。

### 3.4 决策：既有公开 `POST /auth/register` → **弃用为 410 Gone**

- **不内部转调**：auth-center 无法触达 `gri` 建 `public.users`，转调不可实现。
- **不保留可用**：它会**静默产出 external_id=NULL 的坏身份**（正是本 bug 源头），必须 fail-fast 关闭。
- 落地：`services/auth-center/src/auth/auth.controller.ts` 的 `register()` 改为
  `throw new GoneException('注册已迁移至 POST /api/auth/register（统一入口）')`，保留路由以给出**明确、可 grep 的**错误（410），并在 DTO/JSDoc 标注 `@deprecated`。
- 配套强制：前端注册**必须**改指向 `/api/auth/register`（见 §6 落点），否则 web 注册断链。

---

## 4. §设计要点 3：改密端点

### 4.1 决策：`POST /api/auth/password`（Bearer）→ 代理 auth-center `POST /auth/password`

哈希住在 `gri_auth`，api **不能**本地校验/写入 → **必须由 auth-center 执行**；api 侧作 Bearer-保护的**代理**（复用既有 proxy 范式，透传 `Authorization`），保证所有身份写操作经业务后端审计面。

```
POST /api/auth/password  (Bearer, 未入公开白名单 → 无 token 即 401)  { oldPassword, newPassword }
   → 代理（透传 Authorization）→ auth-center
POST /auth/password  (Bearer)
   1. identity = meFromBearer(bearer)  ← 复用 auth.service.ts:118；**不给前端传 identityId，防越权**
   2. identity == null 或 status!=='active' → 401
   3. 校验旧密：bcrypt.compare(old, hash)；明文惰性（非 `$2` 前缀）则等值比较 → 不符 400
   4. newPassword 策略：MinLength(8)，且 != oldPassword → 不符 400
   5. hash = bcrypt.hash(newPassword, 12) → updatePasswordHash
   6. **安全加固**：吊销该 identity 全部 refresh_tokens（改密即全端下线，强制重登）
   7. 200 { message:'Password updated' }
```
- 实现落点：`auth-center/src/auth/auth.controller.ts` 新增 `@Post('password')`；`auth.service.ts` 新增 `changePassword(bearer, old, new)`。
- 契约（§5）：`200`；失败 `400`（旧密错/新密不合规）、`401`（无/坏 token）。

---

## 5. §设计要点 4：注销端点

### 5.1 决策：`DELETE /api/identity/me` 采用**软删**（`public.users.deleted_at` + `status='deleted'`）

| 选项 | 结论 |
|---|---|
| **硬删（`DELETE`）** | ❌ **跨库孤儿身份安全洞**：硬删 `gri.public.users` 的 CASCADE **只在 `gri` 内**生效，**触达不到 `gri_auth.identities`** → 留存可登录的孤儿身份。且不可逆，合规擦除风险大 |
| **软删（采纳）** | ✅ `status='deleted', deleted_at=NOW()`；PII 留存可审计；不触发 CASCADE 不确定性 |

### 5.2 决策：**同步停用 auth-center identity**（新增 admin delete 端点，见 §3.2）

软删 `public.users` **不足以**终止登录 —— credential 在 `gri_auth`。故必须**先停用凭证**：

```
DELETE /api/identity/me  (Bearer; externalId 取自 req.auth.externalId, 防 IDOR — 只删自己)
   1. externalId = req.auth.externalId；缺 → 403
   2. DELETE {AUTH_CENTER}/auth/admin/identities/:externalId  (X-Service-Token)
        ├─ 200/404 → 继续（凭证已停用/本就不存在）
        └─ 5xx/超时 → **中止 502**，不动 public.users（凭证必须死透，宁可不删档）
   3. UPDATE public.users SET status='deleted', deleted_at=NOW(), updated_at=NOW() WHERE id=:externalId
   4. 200 { success:true }
```
**顺序理由**：安全关键动作（锁死登录）**先行**；profile 软删可重入幂等（再删无害）。若 step 3 失败而 step 2 已成功 → 用户已锁死、档案还在 → 重试即可收敛（安全优先，可接受短暂不一致）。

### 5.3 决策：`edu.students` **不依赖 FK 级联**

- 采用软删 → **不触发 `DELETE`** → `edu.students.user_id ... ON DELETE CASCADE`（`001_converge_foundation.sql:102`）在此路径**不生效**（保留作为**硬删/合规擦除**路径的兜底，本任务不启用）。
- 软删后 student 扩展档保持原位；可见性由 `public.users.status` 派生（`identity.service` 需把 `deleted_at IS NOT NULL` 行视为不存在，见 §6）。

### 5.4 决策：登录/刷新入口必须拒绝非 active

- `auth-center` `AuthService.login()`（`auth.service.ts:28`）与 `refresh()`（:85）**新增 `status !== 'active'` → 401**（当前无此校验，是停用生效的前提）。
- api `identity.service.getProfileByExternalId()` / `updateProfile()` 的 `SELECT ... WHERE id=$1` **追加 `AND deleted_at IS NULL`** → 已注销者即便持未过期 access token（≤900s）也读不到档案（返回 404）。

---

## 6. §设计要点 5：契约表（精确）

| 端点 | 方法 | 鉴权 | 请求 | 成功码 | 失败码 | 归属 |
|---|---|---|---|---|---|---|
| `/api/auth/register` | POST | 公开 | `{username, email?, phone?, password, name?}` | **201** `{id,username,email,phone,name,role,status,createdAt}` | **400**（DTO）/ **409**（已存在）/ **502**（auth-center 不可达，已补偿） | api 编排 |
| `/api/auth/password` | POST | Bearer | `{oldPassword, newPassword}` | **200** `{message}` | **400**（旧密错/新密不合规）/ **401**（无/坏 token） | api 代理 → auth-center |
| `/api/identity/me` | DELETE | Bearer | — | **200** `{success:true}` | **401**（无/坏 token）/ **403**（无 externalId）/ **502**（停用凭证失败） | api |
| `/auth/admin/identities` | POST | `X-Service-Token` | `{domain,username,email?,phone?,password,name?,externalId}` | 201 `{success,identity}`（无 password_hash） | 401（令牌错）/ 400（DTO）/ 409（已存在） | auth-center（服务间） |
| `/auth/admin/identities/:externalId` | DELETE | `X-Service-Token` | — | 200 `{success:true}` | 401 | auth-center（服务间） |
| `/auth/password` | POST | Bearer | `{oldPassword,newPassword}` | 200 `{message}` | 400 / 401 | auth-center |
| `/auth/register`（旧） | POST | 公开 | 任意 | — | **410 Gone**（弃用） | auth-center（墓碑） |

**前端兼容自证（`apps/web/src/api/auth.js`）**：
- 请求形状 `{username, email, password, name?}` **不变**（`phone?` 为**新增可选**，旧调用不传也通过）。
- 响应形状 `{code:201, data:null}` **不变**（`register()` 归一化映射保持）。
- **唯一改动 = URL**：`request('/register')`（→ `/auth/register`）改为打到统一入口 `/api/auth/register`（保留 `{code,data}` 归一化）。**不破坏既有调用形状**，仅换后端目标。

---

## 7. §设计要点 6：红线合规自证

### 7.1 身份唯一真源：`external_id ≡ users.id` —— **全库仅一处映射**

| 角色 | 唯一位置 | 说明 |
|---|---|---|
| **写入点（唯一）** | `services/api/src/modules/auth/auth.service.ts :: register()` 第 4 步 | `externalId = <step 3 返回的 public.users.id>`，交给 auth-center 服务间面落库。**运行时全库再无第二处**把 users.id 写进 `identities.external_id` |
| **读取点** | `packages/jwt-verifier/src/index.js:134`（`externalId = payload.external_id`）+ `identity.service` 以之为 `users.id` 查询 | **纯投影**（不比较、不转换、不再映射） |
| **禁止** | auth-center 公开面 | 公开注册已 410，**永不接受**外部传入的 `externalId`；仅 `X-Service-Token` 面可信注入 |

> `etl-converge.ts` / backfill 脚本对 `external_id` 的写入属**历史数据一次性迁移**，非运行时映射路径，不计入「第二处映射」。

### 7.2 fail-fast 门禁（四道）

1. **DTO 校验（服务边界）**：api `RegisterDto`（class-validator：`username @MinLength(3)`、`email @IsEmail`、`password @MinLength(8)`）；auth-center `CreateIdentityDto` / `ChangePasswordDto`。**必须建 DTO 类**才能激活 `ValidationPipe`（现 `@Body() dto` 为裸对象，不受 `whitelist` 约束）。
2. **服务间令牌（内部门）**：`X-Service-Token` + `timingSafeEqual`（`identity-admin.service.ts:19-25`）。
3. **DB UNIQUE（库门禁）**：`public.users` **新增** `UNIQUE(username)`、`UNIQUE(email)`、`UNIQUE(phone)`（NULL 可多行，PG 语义）；`gri_auth.identities` 既有 UNIQUE 复用。
4. **库侧 CHECK（库门禁）**：`public.users` 新增 `CHECK (status IN ('active','deleted','suspended'))`、`CHECK (char_length(username) >= 3)`；`auth.identities.external_id`（蓝图目标）`NOT NULL`。

### 7.3 GoF 设计模式（点名 + 理由）

| 模式 | 落点 | 理由 |
|---|---|---|
| **Facade（门面）** | `AuthService.register()`（编排 users + auth-center 两个子系统） | 对前端暴露单一简洁入口，屏蔽双库/双服务编排复杂度 |
| **Proxy（代理）** | `AuthController` 的 login/refresh/password 透传 | 与既有 auth 透传范式一致（`auth.controller.ts`），集中鉴权审计 |
| **Saga（编排式补偿；命令 + 撤销）** | `register()` 的 compensation `DELETE public.users` | 跨库不可用单事务，用「可撤销命令」保证最终一致 |
| **Idempotent Receiver（幂等接收者）** | `ON CONFLICT`、admin create 409、admin delete 幂等 200 | 网络重试/重复注册不产生第二份状态 |
| **Template Method（模板方法）** | （可选增强）把 step2→5 抽 `registerTemplate`，供未来 tutor 域注册复用 | 编排骨架固定，域差异下移 |

---

## 8. 实现落点清单（供 Codex 照做）

### 8.1 `services/auth-center/`（身份域）
| 文件 | 改动 |
|---|---|
| `src/users/identity.entity.ts` | `Domain` 扩为 `'food'|'tutor'|'core'` |
| `src/admin/identity-admin.service.ts` | 新增 `createIdentity(dto)`（bcrypt + UUID 校验 + 唯一预检 → 409）、`disableIdentityByExternalId(ext)`（status 停用 + 吊销 refresh_tokens） |
| `src/admin/identity-admin.controller.ts` | 新增 `@Post('identities')`、`@Delete('identities/:externalId')`（均 `authorize()` 前置） |
| `src/auth/auth.controller.ts` | 新增 `@Post('password')`；`register()` 改 `throw new GoneException(...)`（`@deprecated`） |
| `src/auth/auth.service.ts` | 新增 `changePassword()`；`login()`/`refresh()` 增 `status!=='active'` → 401 |
| `src/auth/dto/auth.dto.ts` | 新增 `CreateIdentityDto`、`ChangePasswordDto`（class-validator） |

### 8.2 `services/api/`（业务编排）
| 文件 | 改动 |
|---|---|
| `src/modules/auth/auth.controller.ts` | `register()` 改为**编排**（非透传）；新增 `@Post('password')` 代理（透传 Authorization） |
| `src/modules/auth/auth.service.ts` | 新增 `register(dto)` 编排 + `changePassword(bearer, body)` 代理 + 私有 `authCenterAdminFetch()`（`x-service-token`，范式抄 `organization.service.ts:41-51`） |
| `src/modules/auth/dto/*.ts` | **新建** `register.dto.ts`、`change-password.dto.ts`（class-validator） |
| `src/modules/identity/identity.controller.ts` | 新增 `@Delete('me')`（`externalId` 取自 `req.auth`） |
| `src/modules/identity/identity.service.ts` | 新增 `deleteProfile(externalId)`（软删）；`getProfileByExternalId`/`updateProfile` 查询追加 `AND deleted_at IS NULL` |
| `src/modules/identity/identity.module.ts` | 若 service 需调 auth-center，注入 config（`identity` broker 已就绪 `config.ts:65-68`） |
| `src/auth/public-routes.ts` | **不动**（`/auth/password`、`/identity/me` 均**不**入白名单 → 自动 401 兜底）；`/auth/register` 已在白名单，保留 |
| `src/migrate/017_identity_register_contract.sql` | **新建**：`public.users` 加 UNIQUE(username/email/phone) + CHECK(status/username) |
| `src/migrate/backfill-external-id.ts` | **新建**：跨库对账/回填（见 §9） |

### 8.3 前端
| 文件 | 改动 |
|---|---|
| `apps/web/src/api/auth.js` | `register()` 的 URL 从 `AUTH_BASE/register` 改指 `${VITE_API_BASE_URL}/api/auth/register`；**请求/响应形状不变** |
| `packages/auth-client/src/endpoints.js` | `createEndpoints({ authBase, apiBase })`：`register()` 用 `apiBase ?? authBase`；登录/刷新/登出/me 仍走 `authBase`（**登录仍直连 auth-center `/auth/login` 不变**） |

---

## 9. 存量数据修复（backfill，Codex 一并实现）

**必须**修复既有坏数据，否则老用户登录后 `external_id` 仍落 `sub`：

`services/api/src/migrate/backfill-external-id.ts`（范式抄 `etl-converge.ts`，**同时连 `gri` + `gri_auth`**）：
```
FOR each identity IN gri_auth.identities WHERE external_id IS NULL:
  uuid = gen_random_uuid()
  INSERT INTO gri.public.users(id=uuid, username, email, phone, name, role='consumer', status='active')
  UPDATE gri_auth.identities SET external_id=uuid WHERE id=identity.id
幂等：external_id 非空即跳过；username 冲突时复用既有 public.users.id
```
运行时机：**迁移 017 之后、服务重启前一次性执行**（幂等，可重复跑）。属历史迁移，不改运行时映射。

---

## 10. ❓ 需确认（仅此 3 项，其余均已自行决策）

1. **❓ 需确认：合规硬擦除（GDPR/《个保法》删除权）是否需要**独立流程。
   → 本设计交付「软删 + 停用凭证」（可逆、可审计）。若业务/法务要求**不可恢复的物理擦除**，需另立流程（`public.users` + `edu.students` + `gri_auth.identities` 三库硬删 + 审计留痕）。
2. **❓ 需确认：旧 `/auth/register` 是否有**仓库外**调用方**（第三方/遗留脚本）。
   → 本设计**决定弃用为 410 Gone**。若存在外部直连方，需先发通知给迁移窗口（否则其调用立即 410）。仓库内三前端已覆盖改动，无外部调用方则 410 无痛。
3. **❓ 需确认：`domain='core'` 的对外口径**是否与产品/运营一致（涉及 JWT `domain` 声明语义）。
   → 本设计**决定引入 `core`**（中性域，合统一身份）。运行时零等值依赖，技术无风险；若产品坚持「订餐用户 domain 恒为 food」，改回 1 行常量即可。

---

## 11. 验收标准（AC，对齐任务卡）

1. ✅ 三份产出齐备；§设计要点 1–7 全覆盖，每条**明确决策、无「待定」**。
2. ✅ 契约表（§6）与 `apps/web/src/api/auth.js` **形状兼容**（请求/响应不变，仅 URL 改指）。
3. ✅ 实现落点文件逐条列出（§8，含 api / auth-center / 前端 / 迁移）。
4. ✅ 红线自证完整（§7：唯一映射点 / 四道门禁 / GoF 5 模式）。
5. ✅ 存量坏数据修复路径明确（§9）。
