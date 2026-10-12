# P3-C1：本体 Taxonomy/几何 API（区域·行业 Explorer 数据面）

> 执行者：Codex ｜ 波次：P3-C（Explorer 引擎化）｜ 依赖：无（数据表已就位）｜ 状态：待下达
> 依据：`docs/EXPLORER_ENGINE_C_PLAN.md` §3｜消费方：`apps/explorer/index.html`（当前读静态 `data/*.json`）

## 🎯 本卡定位

把 Explorer 首页的数据从**静态 JSON**（`apps/explorer/data/*.json`）改为**后端 API**，为后续"**资源定位** + **维度治理（S5/S6）**"铺路。只读端点，不写库。

## 🔴 硬约束

| # | 约束 |
|---|---|
| N1 | **数据真源** = `ontology.region`(7999) / `ontology.industry`(832)。**不复用**静态 JSON。 |
| N2 | 授权走既有门面；**读端点默认公开**（白名单），但不得泄露任何用户/租户数据。前端门禁不作安全边界。 |
| N3 | 只新增（模块 + 端点），不重建既有表/模块；**无 DB 迁移**（表已在）。 |
| N4 | **懒加载**：`region` 树 7999 节点，**禁**一次性返回整树；按 `parent` 取**直接子级**。 |
| N5 | 几何由 **`scripts/reference-data/data/`** 派生（国界 + 分国切片），静态 serve 或端点返回；单国切片按需加载。 |

## 📥 承重事实（实测）

- `ontology.region`：`node_id`(唯一锚点)/`code`/`name`/`short`/`english`/`level`/`iso2`/`iso3`/`center`/`parent_id`。层级：world→region→subregion→intermediate→country→province→admin1→city→district。
- `ontology.industry`：`code`(唯一)/`name`/`short`/`en`/`level`/`section`/`intro`/`includes`/`also`/`excludes`/`refs`/`updated`/`parent_id`。层级：root→system→section→division→group→class。
- 现有门户模块注册表在 `services/api/src/modules/module-registry/`（可作模块/端点样式参照）。
- 迁移已到 025（本卡**无新迁移**）。
- Explorer 前端当前读 `/explore/data/{regions,regions.geo,industry}.json`。

## 📦 产出物

- `services/api/src/modules/taxonomy/*`（controller/service/types/module/spec）
  - `GET /api/taxonomy/:name/children?parent=<id>` —— 直接子级（`name ∈ {region, industry}`）
  - `GET /api/taxonomy/:name/node/:id` —— 单节点明细
  - `GET /api/taxonomy/:name/search?q=&limit=` —— 名称/编码/英文搜索
  - `GET /api/taxonomy/:name/path/:id` —— 面包屑路径（祖先链）
- `GET /api/geo/regions/:countryId` —— 该国下级几何切片（FeatureCollection；源自派生数据）
- 前端 `apps/explorer/index.html` 改为消费上述 API（保留静态回退可选）
- `.agents/codex/outputs/p3-c1-file-list.md` + `p3-c1-verify.sh`

## ✅ 验收标准

1. `tsc --noEmit` 0 err；模块 jest 绿；全量 jest **不回归**（记录基线）。
2. `children` 懒加载：`region` 根 → 子级；`industry` 根 → 子级；未知 `name`/`id` → 404；非法 → 400。
3. `search`：中文名/编码/英文可命中。
4. `path`：返回根→目标的祖先链。
5. `/api/geo/regions/:countryId`：返回该国切片；无则该国 → 404/空。
6. Explorer 首页改用 API 后**行为与现状一致**（世界地图/下钻/treemap）。
7. `verify.sh` FAIL=0。

## 🚫 明确不做

- 不做写/维护端点（S5）；不做 AI 命令（S6）；不做鉴权改造。
