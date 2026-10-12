# P3-S4 双维度挂接（模块可选声明区域/行业作用域）— 交付清单

> 分支：`feat/stage-c-unified-auth-shell`（改动留在工作树，未 commit / 未 checkout）
> 依据：`.agents/codex/tasks/p3-s4-dimension-binding.md`
> 依赖：P3-S2 的 `app_module` / `GET /api/modules`，P3-S3 的 `user_module` / 选用偏好

## 1. 变更文件

### 新增

| 文件 | 说明 |
|---|---|
| `services/api/src/migrate/025_module_dimension.sql` | 由 `app-module.ontology.yaml` 的 `ModuleRegion` / `ModuleIndustry` 生成两张真实 FK 关联表；保留 codegen 结构，附审阅头注 |
| `.agents/codex/outputs/p3-s4-verify.sh` | P3-S4 静态契约、本体/代码生成、迁移、类型、Jest、门户构建和实时 HTTP/DB 验收脚本 |
| `.agents/codex/outputs/p3-s4-file-list.md` | 本清单 |

### 修改

| 文件 | 说明 |
|---|---|
| `packages/ontology/ontologies/app-module.ontology.yaml` | 新增只读桥对象 `RegionDimensionRef` / `IndustryDimensionRef`，以及 `ModuleRegion` / `ModuleIndustry` 本体对象、真 FK link、复合唯一约束和索引 |
| `services/api/src/modules/module-registry/module-registry.types.ts` | 新增维度过滤、选择器选项、模块绑定及行映射契约 |
| `services/api/src/modules/module-registry/module-registry.module.ts` | 引入 `OrganizationModule`，为 bindings 的 operator 门禁提供 `assertSiteOperator` |
| `services/api/src/modules/module-registry/module-registry.controller.ts` | `GET /api/modules` 接收 region/industry；新增 `GET /api/modules/dimensions`、`GET/PUT /api/modules/:code/bindings`；身份只取 `req.auth.externalId` |
| `services/api/src/modules/module-registry/module-registry.service.ts` | 维度闭集解析、角色过滤后的可选作用域过滤、选择器闭集查询、绑定读取和事务整体替换 |
| `services/api/src/modules/module-registry/module-registry.controller.spec.ts` | 覆盖新 query 契约、operator 门禁、externalId 传递和不读取 token roles |
| `services/api/src/modules/module-registry/module-registry.service.spec.ts` | 覆盖 region/industry 闭集、AND 语义、未挂接默认可见、真实 FK 绑定读取、事务替换、非法输入回滚 |
| `apps/portal/src/api/index.js` | `listModules()` 支持 region/industry 参数；新增 `listModuleDimensions()` |
| `apps/portal/src/pages/workbench/index.vue` | 新增区域 / 行业选择器、全部清除、筛选请求竞态保护；保留 S3 勾选/取消与角色可见性 |

## 2. 本体与迁移

`app-module.ontology.yaml` 新增：

- `RegionDimensionRef` / `IndustryDimensionRef`
  - `abstract: true`
  - 分别映射既有 `ontology.region` / `ontology.industry`，只作为 codegen FK 目标，不生成建表 DDL。
- `ModuleRegion`
  - 表：`ontology.module_region`
  - 字段：`moduleId`、`regionId`，均为必填 UUID
  - 真 FK：`module_id -> ontology.app_module.id`、`region_id -> ontology.region.id`，均 `ON DELETE CASCADE`
  - 唯一约束：`[moduleId, regionId]`
- `ModuleIndustry`
  - 表：`ontology.module_industry`
  - 字段：`moduleId`、`industryId`，均为必填 UUID
  - 真 FK：`module_id -> ontology.app_module.id`、`industry_id -> ontology.industry.id`，均 `ON DELETE CASCADE`
  - 唯一约束：`[moduleId, industryId]`

生成链：

```bash
node packages/codegen/src/cli.js \
  packages/ontology/ontologies/app-module.ontology.yaml \
  --tracks sql
```

- 两张新表的结构块与 codegen 输出逐字节一致。
- `025_module_dimension.sql` 只新增 `ontology.module_region` / `ontology.module_industry`，不改既有 `region` / `industry` 表结构。
- 迁移编号为 025；先执行 `services/api npm run build`，再由 `node dist/migrate/run-migrations.js` 读取 `dist/migrate` 应用。
- `public._api_migrations` 已登记 `025_module_dimension.sql`。
- 物理库检查：两表列分别为 `id,module_id,region_id` 与 `id,module_id,industry_id`；共 4 个真实 FK、2 个复合唯一约束、0 个 JSON/JSONB 关联列。

## 3. API 契约

### `GET /api/modules?region=<nodeId>&industry=<code>`

- 登录门禁；无 token → `401`。
- 先按 `req.auth.externalId` 对应的数据库业务角色执行原有 `allowed_roles` 过滤。
- `region` 只接受 `level in ('country', 'province')` 的有效节点。
- `industry` 只接受 `level = 'section'` 的有效编码。
- 非法或未知维度 → `400`。
- 同时传入两个维度时采用 AND 语义。
- 未挂接某维度时，该模块在该维度下默认可见；挂接后只有命中作用域才可见。

### `GET /api/modules/dimensions`

- 返回门户选择器可用的区域 / 行业闭集。
- 区域仅 `country|province`；行业仅 `section`。

### `GET /api/modules/:code/bindings`

- 先执行 `assertSiteOperator(req.auth.externalId)`。
- 非 operator → `403`。
- 返回模块的 `regionNodeIds` / `industryCodes`，值来自真实关联表。

### `PUT /api/modules/:code/bindings`

- 先执行 `assertSiteOperator(req.auth.externalId)`。
- 非 operator → `403`，不写关联行。
- 事务内整体替换两个维度的绑定；空数组表示清除该维度限定。
- 绑定值必须命中粒度闭集；非法值 → `400` 并回滚，旧绑定不变。

## 4. 门户行为

- 工作台加载时并行获取身份与维度闭集，再请求当前登录人的模块目录。
- 区域 / 行业选择器变更后立即调用 `GET /api/modules` 并驱动列表过滤。
- 请求带单调 `moduleRequestId`，避免快速切换时旧响应覆盖新筛选。
- 提供「全部」清除两个维度。
- 继续保留 S3 的核心 / 已选用可见规则和可选模块勾选 / 取消行为。

## 5. 验证结果

最终验收命令：

```bash
GRI_ROOT=/home/ubantu/GRI \
AUTH_CENTER_URL=http://127.0.0.1:3004 \
DB_HOST=127.0.0.1 DB_PORT=5432 \
bash .agents/codex/outputs/p3-s4-verify.sh
```

最终输出：

```text
全绿：PASS=118 FAIL=0 SKIP=0
```

覆盖结果：

- 本体 schema + 语义双校验：通过。
- `025` 两张表的 DDL 与 codegen 输出逐字节一致。
- `services/api npm run build`：通过；`dist/migrate/025_module_dimension.sql` 存在。
- 迁移 runner：通过；`public._api_migrations` 已登记 025，9 个模块仍在。
- 物理 schema：4 个真 FK、2 个复合唯一约束、0 个 JSON 关联列。
- `npx tsc --noEmit`：0 error。
- module-registry Jest：2 suites / 24 tests，全绿。
- API 全量 Jest：34 suites / 541 tests，全绿；S3 基线为 34 suites / 528 tests，无回归。
- `apps/portal npm run build:h5`：通过。
- 实时 HTTP / DB：
  - 无 token `GET /api/modules` → `401`。
  - consumer 仍只看到 `food`。
  - 非 operator GET/PUT bindings → `403`，关联行不变。
  - operator 看到全部 9 个模块，可读取 / 替换 `food` 绑定。
  - 清除绑定后，`food` 在任意有效维度下可见。
  - 挂接后，命中 `region × industry` 可见；任一维度不命中即隐藏。
  - 未挂接控制模块 `agent` 在非命中维度下仍可见。
  - 非闭集 region/industry 查询和 PUT 均返回 `400`；非法 PUT 回滚且旧绑定保留。
  - 原始 `food` 绑定已恢复；临时账号与偏好行已清理。

## 6. 硬约束对照

| # | 约束 | 落实 |
|---|---|---|
| N1 | 真 FK，不用 JSON | 本体 link 生成 4 个真实外键；物理检查确认关联表 0 个 JSON/JSONB 列 |
| N2 | 粒度闭集 | region 仅 `country|province`；industry 仅 `section`；查询与 PUT 均拒绝闭集外输入 |
| N3 | 不改既有维度表 | 025 只新增 `module_region` / `module_industry`，既不 ALTER 也不重建 `region` / `industry` |
| N4 | 本体驱动，迁移 025 | `ModuleRegion` / `ModuleIndustry` → `@gri/codegen` → `025_module_dimension.sql`，并做逐字节结构对照 |
| N5 | 未挂接默认全可见 | `NOT EXISTS` 未挂接分支 + 实时 `agent` 可见性验证 |

额外授权约束：

- bindings 读写走 `assertSiteOperator(req.auth.externalId)`。
- 身份取 `req.auth.externalId`，不读取 `req.auth.roles`。
- 仅新增模块注册表相关表与接口，不重建既有模块 / 表。

## 7. 明确不做

- 不做维度写维护（S5）。
- 不做微前端。

## 8. 收尾纪律

- 未 commit、未 checkout。
- 验收脚本临时创建的账号已删除，绑定快照已恢复。
- 未在工作树写入或打印真实凭据；脚本只在临时目录保存临时响应。
