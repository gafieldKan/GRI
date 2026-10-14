# P5-A 资源主数据维度（UN CPC Ver.3.0）— 交付清单

> 分支：`feat/stage-c-unified-auth-shell`（改动留在工作树，未 commit / 未 checkout）
> 任务：P5-A 资源主数据维度
> 结构真源：`packages/ontology/ontologies/un-cpc.ontology.yaml`
> 数据真源：`scripts/reference-data/data/un-cpc.json`
>
> 说明：本会话中 `.agents` 为只读挂载，无法写入要求路径；本文件暂放在仓库根目录，文件名保持不变。

## 1. 变更文件

### 新增

| 文件 | 说明 |
|---|---|
| `packages/ontology/ontologies/un-cpc.ontology.yaml` | UN CPC Ver.3.0 `Resource` 本体：唯一 `code`、自引用 `parentId`、`level` 闭集、`draft→active→archived` 状态机和 `twinActive` 预留位 |
| `services/api/src/migrate/028_un_cpc.sql` | 由本体 codegen 生成结构主体；建立 `ontology.resource`、自引用 FK、索引与枚举 CHECK，并登记 `public._api_migrations` |
| `packages/codegen/tests/constraints.test.js` | 约束回归：`dbCheck` 仅在显式开启时生成 CHECK；UN CPC 本体双重校验且生成 SQL 与 028 一致 |
| `scripts/reference-data/data/un-cpc.json` | UNSD CPC Ver.3.0 主数据源，4586 节点、10 根、code 唯一锚点 |
| `scripts/reference-data/data/cpc-rev3-structure.csv` | UNSD 原始结构文件，作为数据来源留档 |
| `p5-a-file-list.md` | 本清单 |
| `p5-a-verify.sh` | 静态、本体、codegen、tsc、全量 Jest、build、迁移、幂等导入、DB、DI/API 与 jsdom Explorer 冒烟 |

### 修改

| 文件 | 说明 |
|---|---|
| `packages/ontology/src/schema.js` | 增加可选 `dbCheck` 字段，允许本体显式声明 enum 落库 CHECK；默认关闭以保持既有 SQL 形态 |
| `packages/codegen/src/sql.js` | 按 `dbCheck` 生成 enum `CHECK (...)` 约束 |
| `scripts/reference-data/import.mjs` | 增加 `un-cpc.json → ontology.resource` 数据集，按 `code` upsert、按源 `parent` 回填 `parent_id`，幂等可重复执行 |
| `services/api/src/modules/taxonomy/taxonomy.types.ts` | `TaxonomyName` 扩为 `region \| industry \| resource`，新增 `ResourceTaxonomyRow` |
| `services/api/src/modules/taxonomy/taxonomy.service.ts` | 复用既有 taxonomy 引擎扩展 `resource` kind：children/node/search/path/tree 与写端点均走 `ontology.resource`，返回既有 `TaxonomyNode` 形状 |
| `services/api/src/modules/taxonomy/taxonomy.service.spec.ts` | 增加 resource children/search/path/tree、非法/未知节点断言 |
| `services/api/src/auth/public-routes.spec.ts` | 断言 resource 只读路由匿名白名单；resource 写路径不放行 |
| `apps/explorer/index.html` | 第 3 页签「资源」，切 `?dim=resource`；加载 `/api/taxonomy/resource/tree` 并渲染可展开 CPC 原生树与节点详情，保留区域/行业行为 |

## 2. 数据面

`ontology.resource` 只承载 CPC 分类主数据，不落实例对象或孪生对象：

- `code`：唯一稳定锚点，保留前导零，例如 `0 / 01 / 011 / 0111 / 01111`
- `parent_id`：自引用父节点；10 个 section 根节点为 `NULL`
- `level`：`section / division / group / class / subclass`
- `status`：`draft / active / archived`
- `twin_active`：后续实例/孪生切片的预留布尔位

导入后实测：`ontology.resource` 共 4586 行，code 去重后仍为 4586，根节点 10，非根父链回填 4576，悬空 parent 0。

## 3. API 契约

复用 `TaxonomyController` 既有契约，不新增 module：

| 端点 | 说明 |
|---|---|
| `GET /api/taxonomy/resource/children?parent=0` | 返回 CPC 根节点和直接子级；根子级为 division |
| `GET /api/taxonomy/resource/node/:id` | 返回分类节点详情 |
| `GET /api/taxonomy/resource/search?q=...&limit=...` | 按编码/名称搜索 |
| `GET /api/taxonomy/resource/path/:id` | 返回根到节点的祖先链 |
| `GET /api/taxonomy/resource/tree` | 返回全树及 `children` 索引 |

只读路由沿用 `public-routes.ts` 的 taxonomy GET 白名单，游客匿名可访问；`POST /api/taxonomy/resource/node`、`PATCH /api/taxonomy/resource/node/:id`、`POST .../move`、`POST .../archive` 与 `/api/taxonomy/command*` 继续由 `operator` 门禁和审计保护，不进入公开白名单。

## 4. 验证

```bash
bash p5-a-verify.sh
```

脚本要求末尾输出：

```text
全绿：PASS=<n> FAIL=0 SKIP=<n>
```

覆盖内容：

- 静态契约：本体字段、028 结构、导入 dataset、taxonomy resource 分支、公开只读路径、Explorer `?dim=resource`。
- `npm run test:ontology`、`npm run test:codegen`。
- `npx tsc --noEmit` 与 `npm run build --workspace=services/api`。
- 全量 `services/api` Jest：断言 42 个 suite 且测试数不少于 595；P5-A 新增 resource taxonomy 与公开路由断言后实测 598 tests。
- codegen 生成 SQL 与 `028_un_cpc.sql` 结构一致。
- 迁移 028 登记及重复导入幂等；DB 对 4586/4576/0 悬空做硬断言。
- 在现有 `gri-api` 容器内从构建产物启动临时 API，断言 Nest 启动日志、DI 构造和 `/health`。
- 在容器内对 resource children/node/search/path/tree、未知节点 404、非法 id 400、无 token 写请求 401 做 HTTP 冒烟。
- 用仓库既有 `jsdom` 执行 Explorer 资源页脚本，断言 3 个页签、资源页签 active、CPC 树与详情渲染、请求只走 `/api/taxonomy/resource/tree`、console/page error 为 0。

## 5. 边界

- 未改 auth/权限模型；只读白名单扩展通过既有 taxonomy 路由形状承接。
- 未新建 module、未新造 taxonomy 引擎。
- 未做 P5-B 三维绑定、实例对象或孪生对象落地。
- 未改微前端；Explorer 仍是同文档原生页签。
- 未 commit、未 checkout；验证过程不输出 token、service token、密码或 API key。
