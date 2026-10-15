# W1 人本世界内核 — 交付清单

> 分支：`feat/stage-c-unified-auth-shell`（改动留在工作树，未 commit / 未 checkout）
> 任务：W1 人本世界内核 — 组织本体 + 生活场景本体 + 激活物化 + 读 API
> 结构真源：`packages/ontology/ontologies/organization.ontology.yaml`、`life-scene.ontology.yaml`
> 验收入口：`bash .agents/codex/outputs/w1-verify.sh`

## 1. 变更文件

### 新增

| 文件 | 说明 |
|---|---|
| `packages/ontology/ontologies/organization.ontology.yaml` | OrganizationType / Organization / OrgMember 本体；组织树是 Organization 的自引用关系属性，Person 只声明身份锚点 |
| `packages/ontology/ontologies/life-scene.ontology.yaml` | LifeScene / LifeIntent / SceneModuleLink 本体；只立人本世界，不含模块内容世界或学科登顶 |
| `services/api/src/migrate/029_organization.sql` | 由组织本体 codegen 生成结构主体；7 类组织类型种子、legacy organization/member 幂等镜像 |
| `services/api/src/migrate/030_life_scene.sql` | 由生活场景本体 codegen 生成结构主体；7 场景、7 意向、6 条场景/意向到模块的种子映射 |
| `services/api/src/modules/world/activation-context.service.ts` | 从 DB 组装 `{version, profile, orgs, permissions, twin}`；Redis get/set、TTL、invalidate + Pub/Sub，故障回源 |
| `services/api/src/modules/world/redis.module.ts` | `ioredis` 客户端与 `REDIS_CLIENT` 注入令牌；启动即连接，失败由上层降级 |
| `services/api/src/modules/world/world.controller.ts` | `GET /api/world`、`GET /api/context/me`、`GET /api/organizations/mine` |
| `services/api/src/modules/world/world.service.ts` | 读取生活场景、意向、模块映射与 `ontology.org_member` 多组织归属 |
| `services/api/src/modules/world/world.module.ts` | World 模块装配 |
| `services/api/src/modules/world/world.types.ts` | 人本世界、组织归属与激活上下文类型 |
| `services/api/src/modules/world/activation-context.service.spec.ts` | 构建、Redis 命中、坏缓存、Redis 故障降级、失效广播、版本稳定性 |
| `services/api/src/modules/world/redis.module.spec.ts` | Redis 客户端启动即连接，避免首个命令落入不可写流 |
| `services/api/src/modules/world/world.controller.spec.ts` | 三个读端点及缺少 externalId 的 403 契约 |
| `services/api/src/modules/world/world.service.spec.ts` | 世界组装与多组织映射契约 |
| `services/api/src/modules/identity/identity-core.module.ts` | 抽离纯身份能力，避免 Identity / Organization / World 模块成环 |
| `packages/codegen/tests/w1-persona-world.test.js` | W1 本体 schema+语义校验、codegen/迁移一致性、禁止 legacy ALTER、种子映射契约 |
| `.agents/codex/outputs/w1-file-list.md` | 本清单 |
| `.agents/codex/outputs/w1-verify.sh` | 自包含验收脚本 |

### 修改

| 文件 | 说明 |
|---|---|
| `.env.example` | 增加 `REDIS_HOST/PORT/DB/PASSWORD` 示例，口令只走 env |
| `docker-compose.yml` | Redis 支持可选口令；api 注入 `REDIS_*`，Redis 不可用时仍允许 API 启动 |
| `docker-compose.prod.yml` | prod api 依赖 Redis，保持物化缓存拓扑 |
| `package-lock.json`、`services/api/package.json` | 引入 `ioredis` 运行时依赖 |
| `services/api/src/config/config.ts` | 增加 Redis 配置读取与默认值 |
| `services/api/src/app.module.ts` | 注册 `WorldModule` |
| `services/api/src/auth/public-routes.ts` | 将 `GET /world` 列入只读白名单；个人上下文端点保持鉴权 |
| `services/api/src/auth/public-routes.spec.ts` | 覆盖 world 匿名读、写方法不放行、个人端点鉴权 |
| `services/api/src/modules/identity/identity.module.ts` | 改用 `IdentityCoreModule` 导出身份能力 |
| `services/api/src/modules/organization/organization.module.ts` | 引入 World 模块以提供 mine 读视图 |
| `services/api/src/modules/organization/organization.controller.ts` | 增加字面量 `GET /api/organizations/mine`，置于 `:id` 之前 |
| `services/api/src/modules/organization/organization.service.ts` | 组织/成员写路径同步镜像到 ontology 表，并在提交后失效 Redis 物化；Redis 故障不回滚业务写 |
| `services/api/src/modules/organization/organization.controller.spec.ts` | 补充 mine 路由与既有组织契约测试 |
| `services/api/src/modules/organization/organization.service.spec.ts` | 补充 ontology 写穿/失效路径断言 |
| `services/api/src/modules/twin/twin.module.ts` | Twin 模块注入 WorldService |
| `services/api/src/modules/twin/twin.service.ts` | `GET /api/twin/me` 增加 `humanWorld.scenes`，并在兼容 `world.scenes` 中提供同一人本世界快照；原 subject/areas/stats 保留 |
| `services/api/src/modules/twin/twin.types.ts` | 增加 humanWorld 类型，TwinWorld 增加 scenes |
| `services/api/src/modules/twin/twin.service.spec.ts` | 断言人本世界与既有学科 world 语义并存 |

## 2. 数据与契约

- `ontology.organization_type`：7 行；`ontology.organization`：既有 4 组织幂等镜像；`ontology.org_member`：既有 10 条成员关系幂等镜像。
- `ontology.life_scene`：7 行；`ontology.life_intent`：7 行；`ontology.scene_module_link`：6 行。
- 模块映射：`dining → food`；`academy → tutor + curriculum + agent`；`work → org-admin + dashboard`；其余场景无 link，API 返回空 `modules`。
- `GET /api/world`：匿名只读 200，返回 7 个场景及意向/模块映射；无写端点。
- `GET /api/context/me`：登录 200，返回 `{version, profile, orgs, permissions, twin}`；Redis 命中 `ctx:user:<userId>`；组织成员写后版本变化。
- `GET /api/organizations/mine`：登录 200，返回当前人全部有效组织归属；匿名 401。
- `GET /api/twin/me`：新增 `humanWorld.scenes`，并保留 `world.subject/areas/stats` 的学科登顶语义。
- Redis 是缓存/物化视图，不是授权真源；不写入 DB 约束或授权判断。Redis 停止时 `/api/context/me` 从 DB 回源并返回 200。

## 3. 本工作树验证证据

以下结果来自本会话对当前工作树的实测：

- `npm run test:codegen`：7 个测试文件通过，0 fail。
- `npx tsc --noEmit`（`services/api`）：exit 0。
- `npm run build --workspace=services/api`：exit 0。
- `services/api` 全量 Jest：46 suites / 619 tests passed。
- DB 计数：organization_type=7、life_scene=7、life_intent=7、scene_module_link=6、ontology.organization=4、ontology.org_member=10；legacy organizations/members=4/10。
- 迁移登记：`029_organization.sql`、`030_life_scene.sql` 各 1 条。
- 实机 smoke：匿名 `/api/world` 200；个人端点匿名 401；登录上下文结构、Redis 键、组织创建后 version 变化、多组织、twin 人本世界、Redis 中断降级均通过。

`w1-verify.sh` 会重新执行上述静态、codegen、类型、构建、全量 Jest、迁移幂等、DB 和 HTTP 验收；本轮最终实跑结果为 `PASS=106 FAIL=0 SKIP=0`，最后一行严格为 `FAIL=0`。

## 4. 边界

- 未修改 `tenant.organizations` / `tenant.organization_members` 结构，未增加 legacy 列。
- 未实现组织角色/权限模型，只保留 owner/admin/member 简档和既有 legacy 行为。
- 未实现组织资质验证、模块内容世界或学科登顶。
- 未 commit、未 checkout；Redis 口令只通过环境变量注入，验证日志不输出 token、service token、密码或 Redis 口令。
