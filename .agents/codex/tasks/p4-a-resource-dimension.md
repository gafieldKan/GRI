# P4-A：维度挂业务对象 + 资源定位 API（ResourceDimension）

> 执行者：Codex ｜ 波次：P4（资源定位主线）｜ 依赖：无（维度表已就位）｜ 状态：待下达
> 依据：用户愿景「用 region × industry 定位资源」；`docs/SSO_PORTAL_PLUGIN_PLAN.md` 后续 §6/§7
> 定位：让「区域 × 行业」维度**从"看"变"用"**——把任意业务资源（商家/组织/…）挂到维度上，并能按维度检索。

## 🔴 硬约束

| # | 约束 |
|---|---|
| N1 | **本体驱动**：新写 `packages/ontology/ontologies/resource-dimension.ontology.yaml` 声明 `ResourceDimension` 对象 → `@gri/codegen` → 迁移 **027**。**禁**手写结构 DDL。 |
| N2 | **不改遗留表**：`public.restaurants` / `tenant.organizations` 等**不加列**；用**独立关联表** `ontology.resource_dimension` 挂接。 |
| N3 | 维度取真 FK：`region_id → ontology.region(id)`、`industry_id → ontology.industry(id)`（可空=未限定该维度）。粒度：region 用 `level ∈ {country,province}`、industry 用 `level=section`（与 S4 一致）。 |
| N4 | **写**端点走 `assertSiteOperator`（operator 门禁 + 审计复用 `ontology.dimension_change_log` 或注明）；**读**端点匿名/登录均可（目录类）。身份取 `req.auth.externalId`；禁 `req.auth.roles`。 |
| N5 | 只新增，不重建既有模块/表；迁移 027 登记 `public._api_migrations`；先 `npm run build` 再 migrate。 |

## 📥 承重事实（实测）

- 维度表：`ontology.region`(7999，锚点 `node_id`)、`ontology.industry`(832，锚点 `code`)。
- 候选资源：`public.restaurants(id uuid, name, ...)`、`tenant.organizations(id uuid, name, ...)`。**无** `Restaurant`/`Organization` 本体对象 → 用 `resource_type` 字符串区分（'restaurant'|'organization'）。
- 迁移当前到 **026**；记录表 `public._api_migrations`；codegen：`node packages/codegen/src/cli.js <yaml> --tracks sql`。
- 治理模块在 `services/api/src/modules/taxonomy/`（可作 operator 门禁/审计样式参照）。
- **无** `/api/resources` 端点。

## 📦 产出物

- `packages/ontology/ontologies/resource-dimension.ontology.yaml`（Object `ResourceDimension`：`resourceType`(enum string)、`resourceId`(uuid)、`regionId`(FK)、`industryId`(FK)；唯一 `[resourceType, resourceId]`）
- `services/api/src/migrate/027_resource_dimension.sql`（codegen + 审阅头注；登记）
- `services/api/src/modules/resource/*`：
  - `GET /api/resources?region=<nodeId>&industry=<code>&type=` —— 按维度过滤命中的资源（返回 `{type,id,label,regionId,industryId}`；label 由 restaurants/organizations 按 type 解析）
  - `PUT /api/resources/:type/:id/dimension`（operator）—— 设置某资源的 region/industry 绑定（写审计）
- 种子：绑定若干示例（如某 restaurant → region=100000 中国 + industry=I 住宿餐饮；根组织 → region=100000）
- `.agents/codex/outputs/p4-a-file-list.md` + `p4-a-verify.sh`

## ✅ 验收标准

1. 本体 schema+语义双校验 OK；codegen 结构块与 027 一致；迁移登记。
2. `tsc` 0 err；模块 jest 绿；全量 jest **不回归**（记录基线）。
3. `GET /api/resources?region=100000`：返回该区域绑定的资源；`?industry=I` 同理；两维同传 AND；未知维度→400。
4. `PUT .../dimension`：operator 200 + 落库 + 审计；非 operator 403。
5. 边界：非法 region/industry（粒度外）→400；资源不存在→404。
6. `verify.sh` FAIL=0（含活体 HTTP）。

## 🚫 明确不做

- 不改遗留业务表结构；不做全量资源治理 UI（P4-B）；不做多租户隔离。
