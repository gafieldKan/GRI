# P2-T2 identity 运营管理面 —— 授权模型修正 + 角色/状态/列表设计（主交付）

> 执行者：Claude（架构师 / 决策者）｜日期：2026-10-10｜分支：`feat/stage-c-unified-auth-shell`
> 依赖：T1（注册/注销/改密契约，commit `08bcb33`）
> 下游：Codex 依本设计实现（实现卡 `p2-task-2-identity-operator-role-status-impl.md`）→ Claude 出 T3 e2e 契约
> 状态：**全条目均已决策，无「待定」**

---

## 0. 根因复述与设计目标

原 T2 卡的前提错误：用 `req.auth.roles` 判 Operator。**该字段架构恒空**——`auth-center` 签发 JWT 时 `roles: []` 硬编码（有意决策）。照原卡实现 → 运营判定恒 `false` → 端点物理不可达（与 T4 同一病根）。

**真实缺口（已核实）**：`identity.controller.ts` 现仅 4 端点（`:39` `me` / `:50` `:id` / `:64` `PUT me` / `:75` `DELETE me`），**确缺** role/status/list 三个运营端点；且 `:24` `READ_ANY_ELEVATED_ROLES` 是依赖空 roles 的**死代码**。

**设计目标**：
1. 补齐 role / status / list 三个运营端点；
2. 授权底座换成**唯一真源** `OrganizationService.assertSiteOperator(externalId)`；
3. 顺带修正 `GET /identity/:id` 死代码；
4. 全流程 fail-fast（DTO/服务层 + 库侧 CHECK），红线合规。

---

## 1. 关键现状事实（决策依据，先钉死）

| # | 事实 | 证据（文件:行） |
|---|------|------|
| F1 | JWT `roles` 恒空 `[]`，架构决策不可改 | `agent-admin.controller.ts:72` 注释；auth-center 签发处 |
| F2 | 真运营判定 = 根组织 `parent_id IS NULL` 的 owner\|admin 成员 | `organization.service.ts:685` `assertSiteOperator` |
| F3 | `assertSiteOperator(actorId)` 入参是 `externalId`（=`public.users.id`） | 上游调用点 `organization.controller.ts:91`、`agent-admin.controller.ts:29` |
| F4 | `OrganizationModule` 已 `exports:[OrganizationService]`；**不** import `IdentityModule`（无循环依赖风险） | `organization.module.ts:8`、`:5-9` |
| F5 | `IdentityModule` 当前仅 `controllers/providers/exports`，无 `imports` | `identity.module.ts:5-9` |
| F6 | `public.users.role` 类型 = `'consumer'\|'student'\|'merchant'\|'operator'`，**库侧无 CHECK** | `001_converge_foundation.sql:59`、`identity.types.ts:8` |
| F7 | `public.users.status` 受 `ck_users_status` 约束 = `IN ('active','deleted','suspended')` | `017_identity_register_contract.sql:51-54` |
| F8 | 登录/刷新/me **三处**均校验 `identity.status !== 'active'` → 停用凭证**确能**阻断登录 | `auth-center/src/auth/auth.service.ts:40,100,150` |
| F9 | auth-center 服务间面现有 `POST identities`、`DELETE identities/:externalId`（停用）、`GET lookup/:businessId`；**无「启用」** | `identity-admin.controller.ts:15,22,29,39` |
| F10 | api 侧**未引入 class-validator**（容器 `npm ci` 不含）→ DTO 用纯接口 + 服务层手工校验 | `auth/dto/register.dto.ts:1-7`、`auth.service.ts:119` `validateRegister` |
| F11 | 全局 `ValidationPipe({whitelist:true, transform:true})` 已开，但对未装饰接口=空操作 | `main.ts:16-21` |
| F12 | 现有 `GET /identity/:id` 防 IDOR 语义「本人 or 特权角色」是**死代码分支**（特权分支恒 false） | `identity.controller.ts:24,54` |
| F13 | 软删语义既有实现：`deleteProfile` = 先停凭证（失败→502）再软删 | `identity.service.ts:96-107`、`:110-128` |
| F14 | 运营管理面既有范式：控制器内 `await org.assertSiteOperator(actorId)` | `organization.controller.ts:91`、`agent-admin.controller.ts:29,82` |
| F15 | `food.service.ts:411` 有**私有等效**判定（返回 bool），注释自认「与 assertSiteOperator 等效」——**勿**复制到 identity | `food.service.ts:408-432` |

---

## 2. §设计要点 1：授权底座（本卡核心决策）

### 2.1 决策：运营检定**唯一**走 `OrganizationService.assertSiteOperator(externalId)`

所有新运营端点（list / role / status）与修正后的 `GET /identity/:id` 读他人分支，**一律**：

```ts
await this.org.assertSiteOperator(actorId);   // actorId === req.auth.externalId
```

### 2.2 决策：**禁止**使用 `req.auth.roles` —— 理由（三条，必须写入交付）

1. **架构恒空**：`auth-center` 签发脚本把 `roles: []` 硬编码，是有意决策（`agent-admin.controller.ts:72` 注释明写「JWT roles 全空故前端无法自行推导」）。据此判定 ⇒ **恒 false**，路径物理跑不通。
2. **前端不可推导 / 不可信**：即便未来填 roles，前端可控的声明式权限易被伪造；运营身份是**服务端 DB 事实**，不能来自无状态令牌的自述。
3. **唯一真源在 DB 组织成员表**：运营 = 根组织（`tenant.organizations.parent_id IS NULL`）的 `owner|admin` 活跃成员（`tenant.organization_members`）。这是 M4 既定语义（`assertSiteOperator`），任何第二处判定都会造成真源分裂。

> 因此：`READ_ANY_ELEVATED_ROLES`（依赖 roles 的 Set）**整体删除**，不得保留为「兜底」。

### 2.3 决策：`IdentityModule` 最小接线 —— 仅加 `imports:[OrganizationModule]`

```ts
@Module({
  imports: [OrganizationModule],           // ← 唯一新增，注入 OrganizationService
  controllers: [IdentityController],
  providers: [IdentityService],
  exports: [IdentityService],
})
export class IdentityModule {}
```

- 无需 `forwardRef`：`OrganizationModule` 不 import `IdentityModule`（F4），单向依赖。
- `DatabaseModule` 已全局可用，`IdentityService` 的其它依赖不变。

### 2.4 决策：修正 `GET /identity/:id` 死代码

**现状**（`identity.controller.ts:54`）：`id !== own && !(a.roles ?? []).some(r => READ_ANY_ELEVATED_ROLES.has(r))` → 特权分支恒 false。

**修正为**：

```ts
const actorId = this.externalId(req);              // 缺 externalId → 403
if (id !== actorId) {
  await this.org.assertSiteOperator(actorId);      // 读他人 = 运营特权，唯一真源
}
return this.identityService.getProfileByExternalId(id);
```

- **读自己**：恒允许（IDOR 防护保持）。
- **读他人**：要求 `assertSiteOperator`；非运营 → 403。
- **merchant 语义迁移**：原 `READ_ANY_ELEVATED_ROLES` 里的 `'merchant'` 分支删除。商家读他人数据的正当性由**数据归属**承担（`food.service.ts` 的商家后台按 `restaurant.owner_id = externalId` 判定），**不在** identity 面用角色名代理。
- 常量 `READ_ANY_ELEVATED_ROLES` 与 `ReqAuth.roles` 字段**一并删除**（`ReqAuth` 仅留 `sub`, `externalId`）。

### 2.5 决策：actorId **只**取自 `req.auth.externalId`

- 运营/管理接口的 actor 身份**严禁**从 `body`/`query`/`param` 取（防伪造与 IDOR）。
- `param:id` 仅作**目标**（被操作者）标识，与 actor 无关。
- 落地：控制器私有 helper（对齐 `organization.controller.ts:44-47` 范式）：

```ts
private externalId(req: Request): string {
  const id = this.auth(req).externalId;
  if (!id) throw new ForbiddenException('缺少外部身份标识');
  return id;
}
private async requireOperator(req: Request): Promise<string> {
  const actorId = this.externalId(req);
  await this.org.assertSiteOperator(actorId);   // 非运营 → 403
  return actorId;
}
```

**门禁位置决策**：授权门（`requireOperator`）与自身保护（§5）放**控制器**，与 `organization.controller.ts:91`、`agent-admin.controller.ts:29` 两个既有管理面范式**一致**；取值校验与持久化放**服务层**（对齐 T1 `validateRegister`）。理由：授权是 HTTP 面策略（需 `req`），业务规则是被复用的服务契约，两者分层清晰、各自可单测。

---

## 3. §设计要点 2：端点契约（精确规格）

### 3.1 契约表

| 端点 | 方法 | 鉴权 | 请求 | 成功 200 | 失败 |
|------|------|------|------|----------|------|
| `/api/identity` | GET | `requireOperator`（根 org owner\|admin） | `?page&pageSize&role&status&q` | `{items:User[], total:number, page:number, pageSize:number}` | 401 未登录 / 403 非运营 / 400 参数非法 |
| `/api/identity/:id/role` | PATCH | `requireOperator` | `{role: Role}` | 更新后的 `User` 行 | 400 非法 role / 403 非运营或改自己 / 404 目标不存在(或已删) |
| `/api/identity/:id/status` | PATCH | `requireOperator` | `{status: UserStatus}` | 更新后的 `User` 行 | 400 非法 status / 403 非运营或改自己 / 404 目标不存在(或已删) / 502 auth-center 不可达 |

- 三端点**均不进** `public-routes.ts` 白名单 → 全局中间件强制 Bearer RS256，无/坏 token 一律 **401**（自动兜底，无需控制器处理）。
- `:id` 一律 `@Param('id', new ParseUUIDPipe())` → 非法 uuid → **400**（Nest 默认）。
- 成功返回体统一为**单行 `User`**（role/status 二端点）或**分页对象**（list）。

### 3.2 路由顺序铁律（防 `ParseUUIDPipe` 吞字面路径）

控制器内声明顺序**必须**为：

```
@Get('me')            ← 字面量，必须先于 :id
@Get()                ← list（根路径，无冲突）
@Get(':id')           ← 参数路由
@Put('me')
@Delete('me')
@Patch(':id/role')
@Patch(':id/status')
```

- `me` 等字面量路由**恒在** `:id` 之前（现状已如此，保持）。
- 新增 list 用**根** `@Get()`，不与任何字面量冲突。

### 3.3 分页与筛选语义

- `page`：缺省 `1`；提供时须为整数且 `≥1`，否则 **400**。
- `pageSize`：缺省 `20`；提供时须为整数且 `∈[1,100]`，否则 **400**。
- `role`：缺省不过滤；提供时须 ∈ §4 闭集，否则 **400**。
- `status`：缺省不过滤（即**排除 deleted**，见 §5.4 决策）；提供时须 ∈ §4 闭集，否则 **400**。
- `q`：缺省不过滤；非空时对 `username/email/name` 做 `ILIKE %q%`（参数化，防注入）。
- 排序：`ORDER BY created_at DESC, id`（稳定分页）。

---

## 4. §设计要点 3：取值与校验（fail-fast）

### 4.1 决策：闭集定义（单一真源，落 `identity.types.ts`）

```ts
export const USER_ROLES = ['consumer', 'student', 'merchant', 'operator'] as const;
export type Role = (typeof USER_ROLES)[number];

export const USER_STATUSES = ['active', 'suspended', 'deleted'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];
```

- 与卡内一致；`status` 闭集**严格对齐**库侧 `ck_users_status`（F7）。

### 4.2 决策：role 校验 = **服务层手工校验**（DTO 纯接口 + `USER_ROLES.includes`）

- **理由**：api 侧无 class-validator（F10），装饰器类会触发 `ValidationPipe` 加载 class-validator 而崩（T1 偏差①既定结论）。故沿用「纯接口 DTO + 服务层 `validateXxx`」范式（`auth.service.ts:119`）。
- 非法值 → `BadRequestException`（400），错误消息列明合法闭集。

### 4.3 决策：status 校验 = **DTO/服务层 + 库侧 CHECK 双层门禁**

- **第一层（应用）**：服务层 `USER_STATUSES.includes(status)` → 非法 400。
- **第二层（库）**：`ck_users_status`（F7，已存在）——即便应用层漏判，库侧 `CHECK` 兜底拒绝。

### 4.4 决策：新增库侧 role 门禁 `ck_users_role`（迁移 019）

**决策：是，补库侧 `CHECK`。**

- 现状：`role` **无**库侧约束（F6），而今 role 首次有**运营写路径**——按 fail-fast 红线（「库侧 CHECK」），必须补第二道门。
- 迁移文件：`services/api/src/migrate/019_identity_role_check.sql`，**幂等**写法（对齐 017 先例）：

```sql
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_users_role') THEN
    ALTER TABLE public.users ADD CONSTRAINT ck_users_role
      CHECK (role IN ('consumer','student','merchant','operator'));
  END IF;
END $$;
COMMIT;
```

- **前置安全**：库内现值仅 `consumer`/`student`（校正实测），均在闭集内 → 无回填风险。可加一段「越界值预检 RAISE」（可选，对齐 017 的显式预检风格）。
- **纪律**：改 SQL 后**先 build 再 migrate**（迁移 SQL 经 nest-cli assets 拷到 `dist/migrate/`，runner 读 dist）。
- **红线说明**：`public.users` 是手写「地基表」（DDL 001，非本体派生）；对其加 CHECK 沿用 017 对 `public.users` 加约束的先例，**不违反**「本体驱动」（该红线约束的是**业务对象表**的 YAML→codegen 链路）。
- **索引**：**不新增**。表规模小（实测 ~38 行），`role`/`status` 过滤走顺序扫描足够；分页 `ORDER BY created_at DESC` 亦无必要索引。

### 4.5 决策：分页越界 → **fail-fast 400**（非静默钳制）

- `page<1` / `pageSize<1` / `pageSize>100` / 非整数 → 400。
- 理由：运营面契约应显式（fail-fast 红线），静默钳制会掩盖调用方 bug。缺省值仅在**未提供**时套用。

---

## 5. §设计要点 4：状态语义

### 5.1 决策：状态 → auth-center 动作映射表

| 新 `status` | auth-center 动作 | 理由 |
|-------------|------------------|------|
| `deleted` | `disableIdentityByExternalId`（置 `disabled` + **吊销全部 refresh token**） | 与 T1 软删语义一致（F13）；不可逆（终态） |
| `suspended` | `disableIdentityByExternalId`（同上） | 停用即**立即阻断登录**（F8：login/refresh/me 三处校验 `status!=='active'`）；**可逆**（见 §5.2 启用能力） |
| `active` | `enableIdentityByExternalId`（置 `active`） | 恢复登录；`suspended→active` 的必要逆操作 |

### 5.2 决策：**包含** auth-center「启用」能力（否则状态机自毁）

- 问题：auth-center 现**无**「启用」（F9），而 `disable` 不可逆。若 `suspended` 停凭证却无恢复路径，则 `active` 永远修不好被挂起的账号 → 语义自毁，状态机不闭合。
- **决策：本卡包含**最小启用能力：
  - auth-center 新增服务间端点 `POST /auth/admin/identities/:externalId/enable`（`x-service-token` 保护，时序安全比对，复用 `authorize()`）；实现 `enableIdentityByExternalId`：`UPDATE identities SET status='active', updated_at=NOW() WHERE external_id=$1`（幂等；不存在=0 行，当成功）。
  - api 侧 `IdentityService` 新增私有 `enableAuthIdentity(externalId)`（对齐 `disableAuthIdentity` 的 fetch + `x-service-token` + 超时 + 错误映射）。
- 说明：启用**不**恢复 refresh token（已吊销的 refresh 不可复生）；用户重新登录即得新 token。这是正确的安全语义（挂起期间所有会话应作废）。

### 5.3 决策：`deleted` 联动 auth-center（**是**）+ 补偿/顺序

- **顺序（安全优先，对齐 T1 `deleteProfile`）**：
  1. **先预检目标**：`SELECT id FROM public.users WHERE id=$1 AND deleted_at IS NULL` → 不存在/已删 → **404**（在产生任何副作用前短路）；
  2. **调 auth-center 停凭证**：失败 → **502**（`BadGatewayException`），**DB 不动**；
  3. **再写库**：`UPDATE public.users SET status=$2, deleted_at=<NOW() only when deleted>, updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL`。
- **补偿策略**：auth-center 是远程调用，无法入 DB 事务。故用「预检先行 + 停用在写库之前」把不一致窗口压到最小；残余竞态（预检后→写库前）概率极低。若写库意外失败（rowCount=0），凭证已停 → 记录 error 日志并返回，运营可**重试**（停用幂等）或用 `active` 反向启用。
- **幂等**：对已 `deleted` 目标重复置 `deleted` → 404（预检短路，与 T1 `deleteProfile` 已删→404 一致）。

### 5.4 决策：`GET /api/identity` 缺省**排除** deleted

- 缺省：`WHERE deleted_at IS NULL`。
- 显式 `?status=deleted` → 含已软删行（去掉该默认条件，改按 `status='deleted'` 过滤）。
- 理由：运营主列表不应被注销账号淹没；软删行按需显式查看。

### 5.5 决策：不允许经 status 端点「复活」已删账号

- `status` 端点对 `deleted_at IS NOT NULL` 的目标 → **404**（预检短路）。
- 理由：注销是终态（跨库凭证已停、refresh 已吊销）；复活需单独的、显式的重建流程（不在本卡）。

---

## 6. §设计要点 5：自身保护与级联

### 6.1 决策：运营**不得**改自己的 role/status → **403**

- 控制器在 `requireOperator` 通过后追加：`if (targetId === actorId) throw new ForbiddenException('不得变更自己的角色或状态')`。
- 理由：防**自锁**（把自己 suspend/deleted → 失去唯一的运营入口）与**自提权/降权**歧义；运营之间的变更由**另一名**运营执行，天然双人制衡。

### 6.2 决策：`student → 非 student` —— `edu.students` 档案**保留，不级联**

- 仅改 `public.users.role`；`edu.students` 行**保留**（1:0..1 扩展，FK 仍在）。
- 理由：① 以人为本——学习数据（twin/作答/错题）不得因角色标签变化而丢失；② 双向可逆——若 role 改回 `student`，原档案仍在；③ 无破坏性级联，回滚成本为零。
- 读侧影响：`getProfileByExternalId` 仅当 `role==='student'` 才聚合 students（`identity.service.ts:44`）——故非 student 时**不再返回** student 扩展，但底层行保留。

### 6.3 决策：改 role **不影响**已签发 JWT，**无需重签**

- 事实：JWT `roles` 恒空（F1），业务真源是 DB；运营判定实时查库（`assertSiteOperator`）。故改 `public.users.role` 后：**已签发 token 无需吊销/重签**，下一请求即按新 role 生效（若该 role 参与后续业务判定）。
- 明确写入，**避免**误以为要触发 token 轮转（当前架构无 role→claim 投影链路）。

---

## 7. §设计要点 6：红线合规自证

### 7.1 fail-fast 门禁层级

| 层级 | 门禁 | 落点 |
|------|------|------|
| L1 路由/参数 | `ParseUUIDPipe`（非法 uuid→400）、分页/闭集校验（→400） | 控制器 + 服务层 |
| L2 授权 | `assertSiteOperator`（→403）、自身保护（→403） | 控制器 |
| L3 服务层语义 | `USER_ROLES/USER_STATUSES.includes`（→400）、目标预检（→404） | 服务层 |
| L4 库侧 | `ck_users_status`（已存在）+ **新增 `ck_users_role`**（迁移 019） | PG CHECK |
| L5 跨库安全 | 停用在写库**之前**（失败→502，无部分写） | 服务层编排 |

### 7.2 GoF 设计模式（点名 + 理由）

| 模式 | 应用 | 理由 |
|------|------|------|
| **Facade（门面）** | 复用 `OrganizationService.assertSiteOperator` 作**唯一授权门面** | 把「根组织 owner\|admin」的复杂判定（两表 JOIN + 角色比较）封装为单一方法；identity 面**不重造**（对比 `food.service.ts:411` 的私有副本——那是反面教材，本卡明确不复制） |
| **Strategy（策略）** | `USER_ROLES`/`USER_STATUSES` 闭集 + `status→auth-center 动作`映射 | 把「合法值集合」与「状态迁移行为」参数化为可替换策略；新增状态只需扩表，不改判定骨架 |
| **Template Method（模板方法）** | `listUsers` 的分页/筛选查询骨架 | 固定「解析参数→组装 WHERE→COUNT→分页 SELECT→组装返回」骨架，`role/status/q` 为可变步骤；保证计数与取数**同一套 WHERE**（防分页错位） |
| **Proxy/Guard（保护代理）** | 控制器 `requireOperator(req)` 前置守卫 | 在业务方法前统一拦截未授权调用，业务代码零授权噪声（与既有 `_guard` 同构） |

### 7.3 结构变更声明

- **唯一结构变更**：迁移 `019_identity_role_check.sql`（新增库侧 `ck_users_role`，幂等，见 §4.4）。
- **无** YAML→codegen 变更（`public.users` 为地基表，非本体派生对象）。
- **无**索引新增。
- **纪律**：改 SQL → **先 build 再 migrate**（`dist/migrate/` 由 nest-cli assets 拷贝）。

---

## 8. §设计要点 7：单测规格（≥9 例，实际 15 例）

> 分层：控制器 spec 覆盖**授权/自身保护/参数透传**；服务 spec 覆盖**校验/持久化/auth-center 联动**。

### 8.1 `identity.controller.spec.ts`（授权面）

| # | 用例 | 期望 | 断言点 |
|---|------|------|--------|
| C1 | `list`：非运营 → 403 | `ForbiddenException` | `org.assertSiteOperator` 被调、`identityService.listUsers` **未**被调 |
| C2 | `list`：运营 → 委托服务 | 分页对象 | `assertSiteOperator(actorId)` 调用参数 = `req.auth.externalId`；服务收到原始 query |
| C3 | `list`：`externalId` 缺失 → 403 | `ForbiddenException` | 短路，不调 org/service |
| C4 | `updateRole`：改自己 → 403 | `ForbiddenException` | `id === actorId` 时抛错，服务未调 |
| C5 | `updateStatus`：改自己 → 403 | `ForbiddenException` | 同上 |
| C6 | `getById`：读他人且非运营 → 403 | `ForbiddenException` | 替换死代码；`roles:['operator']` **不再**放行（旧行为作废） |
| C7 | `getById`：读他人且运营 → 成功 | 档案 | `assertSiteOperator` 调用 |
| C8 | `getById`：读自己 → 成功，**不**调 org | 档案 | `assertSiteOperator` **未**被调（本人豁免） |
| C9 | `actorId` 只取 `req.auth.externalId` | — | 即使 `body/query` 带 `actorId`/`externalId`，服务侧收到的 actor 仍是 `req.auth.externalId` |

### 8.2 `identity.service.spec.ts`（业务面）

| # | 用例 | 期望 | 断言点 |
|---|------|------|--------|
| S1 | `updateRole` 合法 → 更新并返回 | 新 role 行 | `UPDATE ... SET role=$2` ; 返回 `RETURNING *` 行 |
| S2 | `updateRole` 非法值 (`'superadmin'`) → 400 | `BadRequestException` | **未**发 UPDATE |
| S3 | `updateRole` 目标不存在/已删 → 404 | `NotFoundException` | 预检 SELECT 返回空 → 短路 |
| S4 | `updateStatus('deleted')` 合法 → 停凭证 + 软删 | row | 先 fetch auth-center（DELETE）→ 后 `UPDATE ... status='deleted', deleted_at=NOW()`；顺序断言 |
| S5 | `updateStatus('deleted')` auth-center 失败 → 502 | `BadGatewayException` | **未**发 UPDATE（无部分写） |
| S6 | `updateStatus('suspended')` → 停凭证 + 置 suspended | row | auth-center DELETE 被调；`deleted_at` **不**置（NULL） |
| S7 | `updateStatus('active')`（恢复） → 启用凭证 + 置 active | row | auth-center **enable（POST …/enable）** 被调 |
| S8 | `updateStatus` 非法值 (`'banned'`) → 400 | `BadRequestException` | 闭集外；未发 UPDATE |
| S9 | `listUsers` 分页边界：`pageSize=101` → 400 | `BadRequestException` | 越界 fail-fast |
| S10 | `listUsers` 默认值：无参数 | `page=1,pageSize=20` | SQL `LIMIT 20 OFFSET 0` |
| S11 | `listUsers` role 过滤 | 仅匹配行 | WHERE 含 `role = $n`，参数化 |
| S12 | `listUsers` status 过滤 + 缺省排除 deleted | — | 缺省 WHERE 含 `deleted_at IS NULL`；`status='deleted'` 时含 deleted |
| S13 | `listUsers` 空结果 | `{items:[],total:0}` | 不抛错 |

### 8.3 现有测试的处置（**必须**修，否则回归红）

- `identity.controller.spec.ts` 现 `getById` 三例（`:52-89`）依赖 `roles` 死代码语义 → **重写**：删「`roles:['operator']` 放行」例，改断言「运营（mock `assertSiteOperator` 通过）放行 / 非运营 403」。
- `getMe`/`updateMe`/`deleteMe` 既有用例保持；`mockReq` 的 `roles` 字段可删（`ReqAuth` 不再含 roles）。

---

## 9. §设计要点 8：实现落点清单（供 Codex 照做）

| 文件 | 动作 | 具体 |
|------|------|------|
| `services/api/src/modules/identity/identity.types.ts` | **修改** | 新增 `USER_ROLES`/`Role`、`USER_STATUSES`/`UserStatus`；新增 `ChangeRoleDto`/`ChangeStatusDto`/`ListUsersQuery`/`UserListResult`（纯接口）；`User.status` 由 `string` 收敛为 `UserStatus`（`?:`） |
| `services/api/src/modules/identity/identity.module.ts` | **修改** | `imports: [OrganizationModule]`（+ import） |
| `services/api/src/modules/identity/identity.service.ts` | **修改** | 新增 `listUsers(query)`、`updateRole(targetId, role)`、`updateStatus(targetId, status)`；新增私有 `enableAuthIdentity(externalId)`；私有 `validateRole`/`validateStatus`/`normalizePaging`；复用 `disableAuthIdentity` |
| `services/api/src/modules/identity/identity.controller.ts` | **修改** | 注入 `OrganizationService`；删 `READ_ANY_ELEVATED_ROLES` 与 `ReqAuth.roles`；加 `externalId(req)`/`requireOperator(req)` helper；修正 `getById` 死代码；新增 `@Get()` list、`@Patch(':id/role')`、`@Patch(':id/status')`（注意 §3.2 顺序） |
| `services/api/src/modules/identity/identity.controller.spec.ts` | **修改** | 重写 `getById` 三例；新增 C1–C9；provider 补 `OrganizationService` mock |
| `services/api/src/modules/identity/identity.service.spec.ts` | **修改** | 新增 S1–S13；auth-center fetch 用 jest mock（`global.fetch`） |
| `services/api/src/migrate/019_identity_role_check.sql` | **新增** | 幂等 `ck_users_role`（§4.4） |
| `services/auth-center/src/admin/identity-admin.service.ts` | **修改** | 新增 `enableIdentityByExternalId(externalId)`（置 `active`，幂等） |
| `services/auth-center/src/admin/identity-admin.controller.ts` | **修改** | 新增 `@Post('identities/:externalId/enable')`（`x-service-token` 保护） |
| `services/auth-center/src/admin/identity-admin.controller.spec.ts` | **修改** | 补 enable 端点用例 |

**契约/白名单**：`services/api/src/auth/public-routes.ts` —— **不动**（三端点不加入，自动 401 兜底）。

**迁移纪律**（写入实现卡）：`019_*.sql` 改完 → `cd services/api && npm run build && npm run migrate`（先 build 再 migrate）。

---

## 10. ❓ 需确认（仅 2 项，其余均已自行决策）

- **❓ 需确认 1**：`suspended` 是否**停用 auth-center 凭证**。
  - 本设计决策 = **停用**（真实阻断登录，F8 佐证）+ **包含启用能力**（§5.2）使 `active` 可恢复。
  - 备选 = 停用但不含启用能力（更强阻断、但状态机不闭合，「恢复」标为后续卡）。
  - 若你希望**压缩 T2 范围**（不动 auth-center），可改选备选；但这会让 `suspended→active` 成为空操作，需在 T2b 补。**默认按本设计（含启用能力）。**

- **❓ 需确认 2**：是否接受**新增迁移 019**（库侧 `ck_users_role`）。
  - 本设计决策 = **新增**（fail-fast 红线要求库侧第二道门，且 role 首次有写路径）。
  - 若你倾向「本卡零迁移」，可降级为「仅应用层闭集校验」，但**弱化** fail-fast 自证（role 无库侧兜底）。**默认按本设计（新增 019）。**

---

## 11. 验收标准对齐（对齐任务卡 §验收标准）

| AC | 状态 |
|----|------|
| 1. 三份产出物齐备，8 条设计要点均明确决策（无「待定」） | ✅ 本文件 §2–§9 逐条决策 |
| 2. §1 明确「禁止 `req.auth.roles`」+ `assertSiteOperator` 接线 | ✅ §2.1–§2.3 |
| 3. 契约表可直接转 Codex 实现与 T3 e2e | ✅ §3 + `p2-task-2-contract.md` |
| 4. 红线自证完整（含模式点名） | ✅ §7（Facade/Strategy/Template Method/Proxy） |
| 5. 明确实现落点文件 | ✅ §9 |
| 附加：风险与回滚 | ✅ `p2-task-2-risk-rollback.md` |
