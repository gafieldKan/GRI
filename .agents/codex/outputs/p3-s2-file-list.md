# P3-S2 应用注册表 AppModule（后端）— 交付清单

> 分支：`feat/stage-c-unified-auth-shell`（改动留工作树，未 commit / 未 checkout）
> 依据：`.agents/codex/tasks/p3-s2-app-module-registry.md`

## 1. 变更文件

### 新增

| 文件 | 说明 |
|---|---|
| `packages/ontology/ontologies/app-module.ontology.yaml` | AppModule 本体真源；对象 `AppModule`、表 `ontology.app_module`、11 个字段与 `status + sort_order` 目录索引 |
| `services/api/src/migrate/023_app_module.sql` | codegen 结构主体 + 审阅头注 + 9 条幂等种子；`ON CONFLICT (code) DO UPDATE` |
| `services/api/src/modules/module-registry/module-registry.types.ts` | API 契约与数据库行类型 |
| `services/api/src/modules/module-registry/module-registry.service.ts` | 按 `externalId` 对应数据库角色过滤活跃模块，snake_case → camelCase |
| `services/api/src/modules/module-registry/module-registry.controller.ts` | `GET /api/modules` 登录门禁；身份只取 `req.auth.externalId` |
| `services/api/src/modules/module-registry/module-registry.module.ts` | 注册 controller/service，并导入 `IdentityModule` |
| `services/api/src/modules/module-registry/module-registry.service.spec.ts` | 角色过滤、字段映射、operator 角色查询测试 |
| `services/api/src/modules/module-registry/module-registry.controller.spec.ts` | externalId 契约、缺失身份、禁用 token roles 测试 |
| `.agents/codex/outputs/p3-s2-verify.sh` | P3-S2 全链路验收：静态契约 / 本体 + codegen / 迁移登记 / tsc / Jest / portal 构建 / 活体 HTTP |
| `.agents/codex/outputs/p3-s2-file-list.md` | 本清单 |

### 修改

| 文件 | 说明 |
|---|---|
| `services/api/src/app.module.ts` | 注册 `ModuleRegistryModule` |
| `services/api/src/auth/public-routes.spec.ts` | 固化 `GET /modules` 必须登录、不得进入公开白名单 |
| `apps/portal/src/api/index.js` | 新增 `listModules()`，请求 `GET /api/modules` |
| `apps/portal/src/pages/workbench/index.vue` | 与 `/api/identity/me` 并行加载服务端模块目录，移除本地常量依赖 |

### 删除

| 文件 | 说明 |
|---|---|
| `apps/portal/src/config/modules.js` | S1 本地目录已迁到后端注册表，删除以消除双真源 |

## 2. 本体与迁移

本体字段严格为：

`code / name / short / description / icon / entryUrl / category / allowedRoles / isCore / status / sortOrder`

生成链：

```bash
node packages/codegen/src/cli.js \
  packages/ontology/ontologies/app-module.ontology.yaml \
  --tracks sql
```

- schema 校验 + 语义校验通过。
- `023_app_module.sql` 的结构块由 `@gri/codegen` 产出，未手写结构 DDL。
- 验收脚本把 codegen 输出与迁移结构块做 byte-for-byte 对照，结果为一致。
- 迁移经 `npm run build` 后由 `node dist/migrate/run-migrations.js` 执行。
- `public._api_migrations` 已登记 `023_app_module.sql`；活跃模块 9 条。

### 9 条目录种子

| code | allowed_roles | is_core | entry_url | sort_order |
|---|---|---:|---|---:|
| `food` | consumer, student, merchant, operator | ✓ | `/food/` | 10 |
| `tutor` | student, operator | ✓ | `/tutor/` | 20 |
| `org-admin` | operator | ✓ | `/pages/console/index` | 30 |
| `ontology-stats` | operator | ✓ | `/pages/ontology-stats/index` | 40 |
| `identity` | operator | | 待接入 | 50 |
| `curriculum` | student, operator | | 待接入 | 60 |
| `dashboard` | merchant, operator | | 待接入 | 70 |
| `agent` | student, operator | | 待接入 | 80 |
| `twin` | student, operator | | 待接入 | 90 |

## 3. API 契约

`GET /api/modules`

- 默认强制鉴权；无 token → `401`。
- 身份取 `req.auth.externalId`，再经 `IdentityService.getProfileByExternalId()` 从数据库读取业务角色。
- 不读取 `req.auth.roles`。
- 只返回 `status = 'active'` 的模块。
- `allowed_roles` 为空数组表示所有登录角色可见；否则按当前数据库角色过滤。
- 排序为 `sort_order ASC NULLS LAST, code ASC`。
- 返回 camelCase：`entryUrl / allowedRoles / isCore / sortOrder`。

该端点是登录人的目录查询和普通内容裁剪，不含特权写/管理操作；因此没有调用 `assertSiteOperator/assertRole`。仓库既有的运营、组织级特权仍由这些服务门面强制，模块注册表没有另起一套授权实现。

## 4. S1 工作台接入

- `apps/portal/src/api/index.js` 新增 `listModules()`。
- 工作台使用 `Promise.all([/api/identity/me, /api/modules])` 加载身份和目录。
- 保留原有角色标签、核心标记、无入口提示和整页/内页跳转行为。
- 已删除 `apps/portal/src/config/modules.js`。

## 5. 验证结果

### 最终验收

```bash
GRI_API_BASE_URL=http://127.0.0.1:3010 \
  bash .agents/codex/outputs/p3-s2-verify.sh
```

```text
全绿：PASS=74 FAIL=0 SKIP=0
```

覆盖结果：

- 本体 schema + 语义双校验：通过。
- codegen 结构块与 `023_app_module.sql`：一致。
- API `npm run build`：通过；`dist/migrate/023_app_module.sql` 存在。
- `public._api_migrations` 登记 023：通过；活跃模块 9 条。
- `npx tsc --noEmit`：0 error。
- module-registry Jest：2 suites / 4 tests，全绿。
- API 全量 Jest：34 suites / 521 tests，全绿；开工基线 32 suites / 517 tests，无回归。
- `apps/portal npm run build:h5`：通过。
- 活体 HTTP：
  - 无 token → `401`
  - consumer → 200，只含 `food`，不含 `org-admin`
  - operator → 200，9 条全见，包含 `org-admin`
  - 临时账号已通过 `DELETE /api/identity/me` 清理

## 6. 硬约束对照

| # | 约束 | 落实 |
|---|---|---|
| N1 | 本体驱动，禁手写结构 DDL | `app-module.ontology.yaml` → `@gri/codegen` → `023_app_module.sql`；结构块已做 drift 对照 |
| N2 | 授权走既有门面；身份取 `req.auth.externalId`；禁 `req.auth.roles` | 身份只取 `externalId`；角色由数据库 `IdentityService` 读取；模块注册表无自造授权，也未读取 token roles |
| N3 | 只新增，不重建既有模块/表 | 新本体、新编号表、新 module；未改动既有业务表/模块 |
| N4 | 023 + `_api_migrations`；先 build 再迁移 | 编号 023；已登记；迁移 runner 读取构建后的 `dist/migrate` |
| N5 | 只做目录，不做用户选用 | `ontology.app_module` 仅存目录；无用户/模块选用表或接口 |

## 7. 明确不做

- 不做用户“选用”状态（S3）。
- 不做维度挂接（S4）。
- 不做微前端。
- 不新增管理员式模块 CRUD；本卡只提供登录人可用目录读取。

## 8. 收尾纪律

- 未 commit、未 checkout。
- 测试临时账号已删除。
- 验收脚本使用临时目录承载 token 响应，并在退出时清理；不打印凭据。
