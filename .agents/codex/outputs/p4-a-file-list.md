# P4-A 资源维度绑定与资源定位 API（ResourceDimension）— 交付清单

> 分支：`feat/stage-c-unified-auth-shell`（改动留在工作树，未 commit / 未 checkout）
> 依据：`.agents/codex/tasks/p4-a-resource-dimension.md`
> 结构真源：`packages/ontology/ontologies/resource-dimension.ontology.yaml`
> 迁移：`027_resource_dimension.sql`，已在 `public._api_migrations` 登记

## 1. 变更文件

### 新增

| 文件 | 说明 |
|---|---|
| `packages/ontology/ontologies/resource-dimension.ontology.yaml` | `ResourceDimension` 本体对象；独立关联表 `ontology.resource_dimension`；`resourceType + resourceId` 唯一；region/industry 真实可空 FK；枚举类型闭集 |
| `services/api/src/migrate/027_resource_dimension.sql` | codegen 结构 DDL + 审阅头注 + 两条开发种子绑定；不修改 restaurants/organizations 遗留表 |
| `services/api/src/modules/resource/resource.module.ts` | `ResourceModule`，挂载 `ResourceController`，导入 organization operator 服务 |
| `services/api/src/modules/resource/resource.types.ts` | 资源类型、过滤参数、维度输入和响应 DTO |
| `services/api/src/modules/resource/resource.service.ts` | 资源列表过滤、真实 FK 解析、事务 upsert、exists 校验和审计写入 |
| `services/api/src/modules/resource/resource.controller.ts` | `GET /api/resources` 与 `PUT /api/resources/:type/:id/dimension` |
| `services/api/src/modules/resource/resource.service.spec.ts` | 服务层过滤、AND 语义、400/404、事务和审计测试 |
| `services/api/src/modules/resource/resource.controller.spec.ts` | operator 门禁、externalId 取身份、403 语义测试 |
| `.agents/codex/outputs/p4-a-verify.sh` | 本体/codegen 一致性、静态契约、tsc/Jest/build 和活体 HTTP 验收脚本 |
| `.agents/codex/outputs/p4-a-file-list.md` | 本清单 |

### 修改

| 文件 | 说明 |
|---|---|
| `services/api/src/app.module.ts` | 根模块挂载 `ResourceModule` |
| `services/api/src/auth/public-routes.ts` | 只读白名单只放行 `GET /api/resources`；PUT 维度写入不入白名单 |
| `services/api/src/auth/public-routes.spec.ts` | 覆盖资源列表匿名读放行、维度写请求和未知形状拒绝 |

## 2. API 契约

### `GET /api/resources?region=<nodeId>&industry=<code>&type=`

- 只读关联表 `ontology.resource_dimension`，按需解析 `region.node_id` / `industry.code` 到真实 UUID。
- `region` 只接受 `ontology.region.level ∈ {country, province}`；`industry` 只接受 `ontology.industry.level = section`。
- `region` 与 `industry` 同时传入时使用 AND 语义；`type` 只允许 `restaurant` 或 `organization`。
- 返回 `{type, id, label, regionId, industryId}`；label 从 `public.restaurants` 或 `tenant.organizations` 解析。
- 未知/非法维度或类型 → `400`；未出现的资源不会伪造返回。

### `PUT /api/resources/:type/:id/dimension`

- 先用 `assertSiteOperator(req.auth.externalId)` 做 operator 门禁；身份不使用 `req.auth.roles`。
- 请求体可传 `regionId` 和/或 `industryId`；未传字段保持原绑定，显式 `null` 清除绑定。
- 资源不存在 → `404`；非法 type、UUID、层级外维度或空请求体 → `400`。
- 事务内 upsert `ontology.resource_dimension`，并写入 `ontology.dimension_change_log`。
- 审计的 `actor_id` 为 `req.auth.externalId`，`target_id` 为 `<type>:<uuid>`。

## 3. 数据与安全

- N1：结构来自 `resource-dimension.ontology.yaml`，codegen 生成块与 027 结构一致。
- N2：只新增 `ontology.resource_dimension`，不向 `public.restaurants` / `tenant.organizations` 加列。
- N3：`region_id` / `industry_id` 是真实可空 FK；粒度由 service 查询条件约束。
- N4：读端点进入公开白名单；写端点必须 operator；前端门禁不作为安全边界。
- N5：迁移 027 登记 `public._api_migrations`；没有新增其他结构迁移。
- 种子：示例 restaurant 绑定 `region=100000` + `industry=I`；示例 organization 绑定 `region=100000`。

## 4. 验证结果

```bash
node packages/codegen/src/cli.js packages/ontology/ontologies/resource-dimension.ontology.yaml --tracks sql
cd services/api && npx tsc --noEmit
cd services/api && npx jest src/modules/resource src/auth/public-routes.spec.ts --runInBand
cd services/api && npx jest --runInBand --colors=false
cd services/api && npm run build
bash .agents/codex/outputs/p4-a-verify.sh
```

- 本体 schema + 语义校验通过；codegen 结构块与 027 一致。
- `tsc`：0 errors。
- 聚焦 Jest：3 suites / 30 tests passed。
- 全量 Jest：40 suites / 39 passed / 1 known unrelated ESM suite failure；569 / 569 tests passed。
- 基线记录：P4-A 前为 38 suites / 37 passed / 557 tests，同样存在 `taxonomy.controller.spec.ts` 解析 `@gri/agent-core` ESM 的既有失败。
- `npm run build`：通过；027 产物进入 `services/api/dist/migrate/`。
- 活体 HTTP / 持久化：`region=100000` 种子命中、`industry=I` 命中、AND 语义、operator 200 + 落库 + 审计、非 operator 403、未登录 401、缺失资源 404、非法参数 400 均通过。

```text
全绿：PASS=89 FAIL=0 SKIP=0
```

## 5. 收尾与边界

- `git diff --check`：干净。
- 未 commit、未 checkout。
- 未打印或写入任何凭据；未新增用户/租户数据写入面。
- 明确不做：治理 UI（P4-B）、多租户隔离改造、遗留业务表结构修改。
