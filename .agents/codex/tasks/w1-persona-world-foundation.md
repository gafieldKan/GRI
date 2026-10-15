# W1：人本世界内核 —— 组织本体 + 生活场景本体 + 激活物化(会话上下文) + 读 API

> 执行者：Codex ｜ 波次：Persona World（人本世界）｜ 依赖：无（孪生/注册表/SSO 已就位）｜ 状态：待下达
> 依据：`docs/PERSONA_WORLD_LANDING_PLAN.md`（v2.3）+ `docs/HUMAN_TWIN_PORTAL_PLAN.md`
> 定位：把「人 = 组织 + 生活场景」两样**本体化**，并把**人激活（登录）后的"人-组织上下文"物化进 Redis**，供各模块实时引用；对门户暴露读 API。**不含** UI（W2 做）。

## 📥 承重事实（实测，勿凭印象）

- 迁移当前到 **028**；记录表 `public._api_migrations`；codegen：`node packages/codegen/src/cli.js <yaml> --tracks sql`。
- 已有本体：`packages/ontology/ontologies/*.ontology.yaml`（含 `student-twin`：`User`(abstract) + `TwinEvent`→表 `twin.event`，kind 枚举 system/session/profile/world/action/memory/settings）。
- 组织现状：`tenant.organizations`（已含 `type`(school/department/other 等)、`parent_id`、`parent_path`、`level`、`settings`、`metadata`）；`tenant.organization_members`（`role`/`status`/`department`/`title`，10 行）；`tenant.organization_roles` **空表**。
- 模块注册表：`ontology.app_module`（9 行：food/tutor/org-admin/ontology-stats/identity/curriculum/dashboard/agent/twin；`allowed_roles` jsonb），`ontology.user_module`（选用），`ontology.module_region/industry`（维度限定）。
- Redis：`gri-redis` 可用（PONG），但 **`services/api` 未接 Redis**（无 `REDIS_*` env）→ 本卡新增。
- 权限样式：`assertSiteOperator`（根组织 owner/admin）/ `assertRole`；身份取 `req.auth.externalId`；**禁 `req.auth.roles`**。读路由白名单在 `services/api/src/auth/public-routes.ts`。

## 🔴 硬约束

| # | 约束 |
|---|---|
| N1 | **本体驱动**：`organization` / `life-scene` 两类**必须**先写 `packages/ontology/ontologies/*.ontology.yaml` → `@gri/codegen` → 迁移（029/030）。**禁手写结构 DDL**。 |
| N2 | **不改遗留表结构**：`tenant.organizations`/`organization_members` **不加列**；本体 `Organization`/`OrgMember` 用**独立表**（`ontology.organization`/`ontology.org_member`）**映射/引用**既有数据（seed 或导入回填），或按你判断做**只读视图**——但迁移里**不得 ALTER 遗留表**。 |
| N3 | **组织类型是独立本体** `OrganizationType`（运营后台维护；种子见下）；**组织是独立本体**、可实例化；**组织树**（parent）作为组织的**关系属性**（自引用），不是"组织孪生的本体"。 |
| N4 | **人本世界 = 生活主题场景闭集** `LifeScene` + `LifeIntent`(场景内意向) + `SceneModuleLink`(意向/场景↔模块)。**本卡只立"人本世界"**；模块内容世界（含学科登顶）不在本卡。 |
| N5 | **Redis = 缓存/物化视图，不是授权真源**：`ActivationContext` 从 DB 组装；组织/角色变更 → **写穿更新 + Pub/Sub 失效**；敏感写仍服务端校验。**不持久化**（可 TTL 滑动续期）。 |
| N6 | **组织角色+权限本期不做**（先 owner/admin/member 简档或沿用 legacy `role`）；**资质验证本期不做**（只做组织自建+类型维护的数据形态）。 |
| N7 | 只新增；迁移登记 `public._api_migrations`；先 `npm run build` 再 migrate；不 commit/不 checkout（改动留工作树）；**凭据零泄漏**（Redis 口令走 env，不入库不入日志）。 |

## 📦 产出物

1. `packages/ontology/ontologies/organization.ontology.yaml`：
   - `OrganizationType`（独立本体：`code`/`name`/`description`/`order`；运营后台维护）
   - `Organization`（独立本体，可实例化：`name`/`typeCode`(→OrganizationType)/`code`/`logoUrl`/`description`/`status`/自引用 `parentId`(组织树=关系属性)/`meta`)
   - `OrgMember`（`Person`↔`Organization` 多对多：`orgId`/`userId`/`role`/`tags`/`status`）
2. `packages/ontology/ontologies/life-scene.ontology.yaml`：
   - `LifeScene`（人本世界场景闭集：`code`/`name`/`en`/`theme`(衣·食·住·行·工作·生活·旅游)/`icon`/`posX`/`posY`/`order`/`status`)
   - `LifeIntent`（场景内意向：`sceneCode`/`code`/`label`/`desc`/`order`）
   - `SceneModuleLink`（`sceneCode`/`intentCode?` → `moduleCode`；`requiresOptIn`）
3. 迁移 `029_organization.sql`、`030_life_scene.sql`（codegen 主体 + 审阅头注 + 登记）+ **种子**（下）。
4. **种子**：
   - `OrganizationType`：family(家庭)/school(学校)/company(单位)/social-group(社会团体)/department(部门)/community(社区)/other(其他)
   - `LifeScene`（7）：home 居所 · dining 餐饮 · academy 学习 · work 工作 · social 社交 · travel 出行·旅游 · wellness 健康
   - `LifeIntent` + `SceneModuleLink`：dining→food；academy→tutor(+curriculum+agent)；work→org-admin(+dashboard)；其余"建设中"（无 link）
5. `services/api/src/modules/world/*`（新模块）：
   - `RedisModule`/`ActivationContextService`：`build(userId)`（组装 profile+orgs[](role/tags)+permissions(占位)+twin 快照）、`get(userId)`、`invalidate(userId)`（写穿 + Pub/Sub）
   - `GET /api/context/me`（登录人激活上下文；未登录 401）
   - `GET /api/world`（人本世界：scenes + intents + scene↔module link；匿名或登录可读）
   - `GET /api/organizations/mine`（我的组织：id/name/type/role/tags；登录）
6. 扩展 `GET /api/twin/me`：新增 `world` 段 = 人本世界场景（不改既有 subject 世界语义）。
7. `REDIS_*` env（`docker-compose.yml` api 服务）+ `.env.example`。
8. `.agents/codex/outputs/w1-file-list.md` + `w1-verify.sh`。

## ✅ 验收标准

1. 本体 schema+语义双校验 OK；codegen 结构块与 029/030 一致；迁移登记。
2. `tsc` 0；全量 jest **不回归**（记录基线）。
3. 种子落库：`ontology.organization_type`=7、`ontology.life_scene`=7、`SceneModuleLink` 覆盖 dining/academy/work；`ontology.organization` 回填既有 4 组织（幂等，跑两次计数不变）。
4. **激活物化**：登录后 `GET /api/context/me` 返回 `{version, profile, orgs[], permissions, twin}`；重复调用命中 Redis（redis-cli 可见 `ctx:user:*`）；组织成员变更 → 版本号变（写穿/失效生效）。
5. `GET /api/world` 返回 7 场景 + 意向 + 模块映射；匿名只读放行（`public-routes`），写端点无。
6. `GET /api/organizations/mine` 返回当前人组织（多归属）；非登录 401。
7. Redis 不可用时**降级**：`/api/context/me` 回源 DB 仍可返回（不 500）。
8. `verify.sh` 末行 `FAIL=0`；不 commit/不 checkout；token/service token/密码零泄漏。
