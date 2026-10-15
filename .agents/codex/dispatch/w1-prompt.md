# W1 可下达提示词（粘贴给 Codex）

> 任务卡：`.agents/codex/tasks/w1-persona-world-foundation.md`（先读）。工作树 `/home/ubantu/GRI`，分支 `feat/stage-c-unified-auth-shell`。

---

【任务】W1：人本世界内核 —— 组织本体 + 生活场景本体 + 激活物化(Redis 会话上下文) + 读 API。

■ 必读
1. `docs/PERSONA_WORLD_LANDING_PLAN.md`（v2.3）+ `docs/HUMAN_TWIN_PORTAL_PLAN.md`。
2. `packages/ontology/ontologies/student-twin.ontology.yaml`（本体→孪生范式；`User` abstract + `TwinEvent`→`twin.event`）。
3. `packages/codegen/src/cli.js` + `services/api/src/migrate/027|028*.sql`（迁移范式 + 登记）；`scripts/reference-data/import.mjs`（幂等种子/回填范式）。
4. `services/api/src/auth/public-routes.ts`（读白名单）、`modules/module-registry/*`（注册表范式）、`modules/organization/organization.service.ts`（`assertSiteOperator` 范式）。

■ 现状（实测，勿凭印象）
- 迁移到 **028**。组织：`tenant.organizations`(含 type/parent_id/level/settings)、`organization_members`(role/status/department/title, 10 行)、`organization_roles`(**空表**)。注册表：`ontology.app_module`(9 行) + `user_module` 选用。
- Redis `gri-redis` 通，但 **api 未接 Redis**（无 REDIS env）。
- `ontology.resource`/`region`/`industry`/`un-cpc` 等既有维度本体可作本体写法参照。

■ 硬约束（违反即失败）
N1 本体驱动：`organization` / `life-scene` **先写 YAML → codegen → 迁移 029/030**。禁手写结构 DDL。
N2 **不改遗留表**：`tenant.organizations`/`organization_members` **不加列**；本体用**独立表**（`ontology.organization`/`ontology.org_member`）并**幂等回填**既有 4 组织；迁移里禁 ALTER 遗留表。
N3 `OrganizationType`（独立本体，运营台维护）；`Organization`（独立本体，可实例化）；**组织树 child→parent 自引用**作为组织的"关系属性"。
N4 人本世界 = `LifeScene` + `LifeIntent` + `SceneModuleLink`（闭集见卡）；**只立"人本世界"**，模块内容世界/学科登顶不在本卡。
N5 **Redis=缓存/物化视图，不是授权真源**：`ActivationContext` 从 DB 组装；变更**写穿 + Pub/Sub 失效**；敏感写仍服务端校验；**不持久化**（可 TTL 滑动续期）。Redis 不可用**必须降级回源 DB**（不 500）。
N6 **组织角色/权限本期不做**（先用 legacy `role` 或 owner/admin/member 简档）；**资质验证本期不做**。
N7 只新增；迁移登记 `_api_migrations`；先 `npm run build` 再 migrate；不 commit/不 checkout；**凭据零泄漏**（Redis 口令走 env，不入库不入日志）。

■ 产出
1. `packages/ontology/ontologies/organization.ontology.yaml`（OrganizationType / Organization / OrgMember）
2. `packages/ontology/ontologies/life-scene.ontology.yaml`（LifeScene / LifeIntent / SceneModuleLink）
3. 迁移 `029_organization.sql` / `030_life_scene.sql`（codegen + 头注 + 登记）+ 幂等种子
4. `services/api/src/modules/world/*`：RedisModule + ActivationContextService(build/get/invalidate) + `GET /api/context/me` / `GET /api/world` / `GET /api/organizations/mine`
5. `GET /api/twin/me` 增 `world` 段 = 人本世界场景（不改 subject 语义）
6. `REDIS_*` env（compose api 服务 + env 示例）
7. `.agents/codex/outputs/w1-file-list.md` + `w1-verify.sh`

■ 种子（写死）
- OrganizationType：family 家庭 / school 学校 / company 单位 / social-group 社会团体 / department 部门 / community 社区 / other 其他
- LifeScene(7)：home 居所 · dining 餐饮 · academy 学习 · work 工作 · social 社交 · travel 出行·旅游 · wellness 健康（theme 用 衣/食/住/行/工作/生活/旅游）
- SceneModuleLink：dining→food；academy→tutor(+curriculum+agent)；work→org-admin(+dashboard)；其余"建设中"（无 link）

■ 自检
- 本体双校验 OK；codegen 与 029/030 一致；`tsc` 0；全量 jest 不回归（记基线）。
- 种子：organization_type=7、life_scene=7；organization 回填既有 4 组织**幂等**（跑两次不变）。
- 登录后 `/api/context/me` → `{version,profile,orgs[],permissions,twin}`；重复命中 Redis（`redis-cli KEYS 'ctx:user:*'`）；成员变更→version 变。
- `/api/world` 7 场景 + 意向 + 模块映射；匿名只读 200；写端点无。
- `/api/organizations/mine` 多归属；非登录 401。
- **Redis 停掉**（`docker stop gri-redis`）后 `/api/context/me` 仍 200（降级）；恢复。
- `verify.sh` 末行 `FAIL=0`；凭据零泄漏。
