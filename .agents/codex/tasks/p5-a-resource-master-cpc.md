# P5-A：资源主数据维度（UN CPC Ver.3.0）→ ontology.resource

> 执行者：Codex ｜ 波次：P5（资源主数据维度）｜ 依赖：C1 taxonomy API（已完成）｜ 状态：done_verified
> 依据：用户 `gateway-owner` 决定「用 **CPC** 做资源主数据类别划分」，仿照区域/行业做「资源」页签
> 定位：把 UN CPC 分类树做成一等本体维度（结构轨）+ 幂等主数据（数据轨），复用 C1 taxonomy 引擎暴露只读 API，Explorer 加第 3 页签。

## 🔴 硬约束

| # | 约束 |
|---|---|
| N1 | **本体驱动**：新写 `packages/ontology/ontologies/un-cpc.ontology.yaml` 声明 Object `Resource` → `@gri/codegen` → 迁移 **028**。**禁**手写结构 DDL。 |
| N2 | **资源主数据 = CPC**（UN 官方 5 层树）；本卡**只立分类主数据**，实例/数字孪生对象留后续切片（`twinActive` 仅作预留位）。 |
| N3 | **复用 C1 taxonomy 引擎**（kind：`region\|industry\|resource`），不新造引擎；返回既有 `TaxonomyNode` 形状。 |
| N4 | **读**端点匿名白名单；**写**端点沿用 `assertSiteOperator` 门禁 + 审计。身份取 `req.auth.externalId`；**禁** `req.auth.roles`。 |
| N5 | **幂等导入**：锚点 `code`；源 `scripts/reference-data/data/un-cpc.json`。 |
| N6 | 只新增；迁移 028 登记 `public._api_migrations`；先 `npm run build` 再 migrate。 |

## 📥 承重事实（实测）

- 数据源已入仓：`un-cpc.json`（**4586** 节点树，`parent = code[:-1]`，`code` 唯一锚点）、`cpc-rev3-structure.csv`（UNSD CPC Ver.3.0 原始结构）。
- 层级：section(10) / division(71) / group(327) / class(1301) / subclass(2877)；根 `parent=null`。
- 迁移当前到 **027**；记录表 `public._api_migrations`；codegen：`node packages/codegen/src/cli.js <yaml> --tracks sql`。
- 既有 taxonomy 引擎在 `services/api/src/modules/taxonomy/`（controller 用泛型 `:name`，读路由已在 `public-routes` 白名单）。

## 📦 产出物

- `packages/ontology/ontologies/un-cpc.ontology.yaml`（Object `Resource`：唯一 `code`、`name TEXT`、`level` 闭集、自引用 `parentId`、`sortOrder`、`status`(draft→active→archived 状态机)、`twinActive` 预留位）
- `services/api/src/migrate/028_un_cpc.sql`（codegen 结构主体 + 审阅头注；登记）
- `scripts/reference-data/import.mjs`（加 `un-cpc.json → ontology.resource` dataset）
- `services/api/src/modules/taxonomy/*`（扩 `resource` kind）
- `apps/explorer/index.html`（第 3 页签「资源」，切 `?dim=resource`）
- `.agents/codex/outputs/p5-a-file-list.md` + `p5-a-verify.sh`

## ✅ 验收标准

1. 本体 schema+语义双校验 OK；codegen 结构块与 028 一致；迁移 028 登记。
2. `tsc` 0 err；全量 jest **不回归**（基线 42/595）。
3. `GET /api/taxonomy/resource/{children,node,search,path,tree}` 只读匿名可用；未知节点→404、非法 id→400。
4. 写端点匿名→401 / 非 operator→403。
5. 导入幂等（跑两次计数不变）；DB `ontology.resource` 4586 行 / 4576 非根父链 / 0 悬空。
6. Explorer `?dim=resource` 渲染 CPC 原生树，控制台/页面异常 0。
