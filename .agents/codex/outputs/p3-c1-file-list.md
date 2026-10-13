# P3-C1 本体 Taxonomy / 几何 API（区域·行业 Explorer 数据面）— 交付清单

> 分支：`feat/stage-c-unified-auth-shell`（改动留在工作树，未 commit / 未 checkout）
> 依据：`.agents/codex/tasks/p3-c1-taxonomy-api.md`
> 数据真源：`ontology.region`(7999) / `ontology.industry`(832)；无 DB 迁移

## 1. 变更文件

### 新增

| 文件 | 说明 |
|---|---|
| `services/api/src/modules/taxonomy/taxonomy.module.ts` | `TaxonomyModule`：注册 `TaxonomyController` / `GeoController` 与两个 service，向根模块导出 |
| `services/api/src/modules/taxonomy/taxonomy.types.ts` | `TaxonomyName`（`region` / `industry`）、节点 DTO、children / path 响应契约 |
| `services/api/src/modules/taxonomy/taxonomy.service.ts` | 直查 `ontology.region` / `ontology.industry`：直接子级、单节点、名称/编码/英文搜索、递归祖先链；`region` 锚点 `node_id`，`industry` 锚点 `code` |
| `services/api/src/modules/taxonomy/taxonomy.controller.ts` | `GET /api/taxonomy/:name/{children,node/:id,search,path/:id}` |
| `services/api/src/modules/taxonomy/geo.types.ts` | GeoJSON `FeatureCollection` 与切片响应契约 |
| `services/api/src/modules/taxonomy/geo.service.ts` | 由 `scripts/reference-data/data/un-regions.geo.json`（世界国界）与 `un-regions-maps.geo.json`（分国切片）按需读取、缓存并返回 `FeatureCollection` |
| `services/api/src/modules/taxonomy/geo.controller.ts` | `GET /api/geo/regions/:countryId`（另含 `GET /api/geo/regions/world` 供 Explorer 世界图层） |
| `services/api/src/modules/taxonomy/taxonomy.controller.spec.ts` | 契约测试：参数传递、未知 name / id / 非法输入边界 |
| `services/api/src/modules/taxonomy/taxonomy.service.spec.ts` | 服务测试：懒加载直接子级、中文/编码/英文搜索、祖先链、404/400 语义 |
| `services/api/src/modules/taxonomy/geo.controller.spec.ts` | 几何端点契约测试 |
| `services/api/src/modules/taxonomy/geo.service.spec.ts` | 几何服务测试：派生数据读取、切片缺失、缓存行为 |
| `.agents/codex/outputs/p3-c1-verify.sh` | P3-C1 静态契约、tsc / Jest / build 门禁与活体匿名 HTTP 验收脚本 |
| `.agents/codex/outputs/p3-c1-file-list.md` | 本清单 |

### 修改

| 文件 | 说明 |
|---|---|
| `services/api/src/app.module.ts` | 根模块 import `TaxonomyModule` |
| `services/api/src/auth/public-routes.ts` | 只读白名单新增 taxonomy children/node/search/path 与 geo regions 形状；写方法与未知形状不入白名单 |
| `services/api/src/auth/public-routes.spec.ts` | 覆盖 taxonomy / geo 匿名只读放行及写请求拒绝 |
| `apps/explorer/index.html` | 由静态 `data/*.json` 改消费 taxonomy / geo API；区域树懒加载、单国切片按需加载、行业 treemap、请求竞态保护 |
| `.dockerignore` | 例外放行两个 GeoJSON 运行时数据文件进镜像上下文 |
| `services/api/Dockerfile` | 运行时镜像 COPY 两个 GeoJSON 到 `/app/scripts/reference-data/data/`，保证几何端点可用 |

## 2. API 契约

### `GET /api/taxonomy/:name/children?parent=<id>`

- `name ∈ {region, industry}`；非法 name → `404`。
- `region` 按 `parent_id` 取直接子级，返回 `parent` + `children`；根为 `node_id=9999999`（联合国，world）。
- `industry` 按 `parent_id` 取直接子级；根为 `code=UN`，子级 `ISIC Rev.5`。
- `parent` 缺省返回根级直接子级；未知 parent → `404`；非法 parent → `400`。
- 只返回直接子级，不展开整棵树（N4）。

### `GET /api/taxonomy/:name/node/:id`

- 返回单节点明细（含 `id`、`name`、`level`、`parentId`、`hasChildren`、`childCount` 等）。
- 未知 id → `404`；非法 id → `400`。

### `GET /api/taxonomy/:name/search?q=&limit=`

- 名称 / 编码 / 英文模糊命中，支持中文（URL 编码）与英文。
- `q` 为空 → `400`；`limit` 非正、越界或非数字 → `400`。

### `GET /api/taxonomy/:name/path/:id`

- 返回根 → 目标的祖先链 `nodes`。
- 未知 id → `404`；非法 id → `400`。

### `GET /api/geo/regions/:countryId`

- 返回该国下级几何切片 `FeatureCollection`。
- 数据派生自 `scripts/reference-data/data/un-regions.geo.json` + `un-regions-maps.geo.json`（N5）。
- 无该切片 → `404`；非法 countryId → `400`。
- `GET /api/geo/regions/world` 返回 248 国世界图层，供 Explorer 根视图使用。

## 3. 公开只读与安全边界

- taxonomy / geo 的 GET 只读形状进入匿名白名单；写方法与未知形状保持鉴权拦截。
- 端点只读本体与 `scripts/reference-data/data/` 几何，不查询用户、租户或会话数据。
- 前端门禁不作为安全边界；安全由服务端路由白名单与 service 校验承担。

## 4. Explorer 行为

- 区域视图：根节点 + 世界图层来自 API；点国家后请求 `/api/geo/regions/:id` 加载单国切片并下钻。
- 区域树：按 parent 懒加载直接子级，`+` 展开、`−` 收起，`返回上级` 回到父级。
- 行业视图：根 → system → section 单链自动展开，section 级以 treemap 呈现并支持下钻。
- 请求竞态：tree / geo 请求带维度与序号校验，快速切换标签不会被旧响应覆盖。
- 保留节点缓存与就地合并，重复展开不重复请求。

## 5. 验证结果

### 门禁

```bash
cd services/api && npx tsc --noEmit                      # 0 err
cd services/api && npx jest src/modules/taxonomy src/auth/public-routes.spec.ts --runInBand
cd services/api && npx jest --runInBand                  # 38 suites / 560 tests pass（基线 34 / 541）
cd services/api && npm run build --workspace=gri-api     # pass
```

### 验收脚本

```bash
bash .agents/codex/outputs/p3-c1-verify.sh
```

```text
全绿：PASS=60 FAIL=0 SKIP=0
```

覆盖：

- 静态契约：模块文件、根模块挂载、公开路由形状、真源表名、懒加载 / 祖先链 SQL、几何派生文件、Explorer 不再引用静态 tree 数据。
- 构建门禁：tsc、taxonomy 聚焦 Jest、全量 Jest、api build。
- 活体匿名 API：区域/行业根与直接子级、单节点、中文/编码/英文搜索、祖先链、未知 name/id → 404、非法 → 400、世界图层 248 国、单国切片、写请求仍 401。

### 浏览器级 E2E（agent-browser，`https://localhost/explore/`）

- 区域视图：区域树懒加载（联合国 6 → 亚洲 5 → 东亚/东南亚/中亚/南亚/西亚），世界图层 248 国渲染正常，无 console error。
- 点选中国：请求 `/api/geo/regions/100000`，渲染 34 个省级下级，`返回上级` 可用。
- 行业视图：`联合国 → ISIC Rev.5` 单链自动展开，treemap 显示下级规模，点入后渲染 22 个 section，无 console error。
- 快速区域/行业标签切换：最终状态与当前标签一致，无旧响应覆盖、无 console error。

### 收尾

- `git diff --check` 干净；未 commit、未 checkout。
- 无 DB 迁移；未新增或改写 `services/api/src/migrate/`。
- 未打印或写入任何凭据；未新增用户/租户数据读写端点。

## 6. 明确不做

- 不做写 / 维护端点（S5）、AI 命令（S6）、鉴权改造。
