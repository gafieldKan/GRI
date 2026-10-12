# P3-S3 用户插件选用（opt-in）— 交付清单

> 分支：`feat/stage-c-unified-auth-shell`（改动留在工作树，未 commit / 未 checkout）
> 依据：`.agents/codex/tasks/p3-s3-user-plugin-optin.md`
> 依赖：P3-S2 的 `ontology.app_module` 与 `GET /api/modules`

## 1. 变更文件

### 新增

| 文件 | 说明 |
|---|---|
| `services/api/src/migrate/024_user_module.sql` | 由 `app-module.ontology.yaml` 的 `UserModule` 生成 `ontology.user_module`；保留 codegen 结构，附审阅头注 |
| `.agents/codex/outputs/p3-s3-verify.sh` | P3-S3 全链路验收脚本 |
| `.agents/codex/outputs/p3-s3-file-list.md` | 本清单 |

### 修改

| 文件 | 说明 |
|---|---|
| `packages/ontology/ontologies/app-module.ontology.yaml` | 新增 `UserModule` 对象（`userId` / `moduleCode` / 唯一约束） |
| `services/api/src/modules/module-registry/module-registry.types.ts` | `AppModule.selected` 与 enable/disable 返回契约 |
| `services/api/src/modules/module-registry/module-registry.service.ts` | `GET` 左连接偏好并返回 `selected`；enable/disable 在同一 SQL CTE 内先校验角色可用性，再幂等写入/删除 |
| `services/api/src/modules/module-registry/module-registry.controller.ts` | 新增 `POST :code/enable`、`POST :code/disable`；身份只取 `req.auth.externalId` |
| `services/api/src/modules/module-registry/module-registry.service.spec.ts` | 覆盖越权 enable/disable 403、幂等写入/删除、`selected` 投影与角色过滤 |
| `services/api/src/modules/module-registry/module-registry.controller.spec.ts` | 覆盖 enable/disable 的 externalId 契约，不读取 token roles |
| `apps/portal/src/api/index.js` | 新增 `enableModule()` / `disableModule()` |
| `apps/portal/src/pages/workbench/index.vue` | 工作台主网格只展示核心或已选用模块；可选模块提供勾选/取消开关，失败回滚并提示 |

## 2. 本体与迁移

`app-module.ontology.yaml` 新增对象：

- `UserModule`
- 表：`ontology.user_module`
- 字段：`userId`（uuid，必填）、`moduleCode`（string，必填）
- 唯一约束：`[userId, moduleCode]`

生成链：

```bash
node packages/codegen/src/cli.js \
  packages/ontology/ontologies/app-module.ontology.yaml \
  --tracks sql
```

- `024_user_module.sql` 的结构块与 codegen 的 `user_module` 输出逐字节一致。
- 先执行 `services/api npm run build`，再由 `node dist/migrate/run-migrations.js` 应用迁移。
- `public._api_migrations` 已登记 `023_app_module.sql` 与 `024_user_module.sql`。
- `ontology.user_module` 与 `(user_id, module_code)` 唯一键均已实测存在。

## 3. API 契约

### `GET /api/modules`

- 保持登录门禁；无 token → `401`。
- 仍按 `externalId` 对应数据库角色的 `allowed_roles` 过滤。
- 新增返回字段 `selected: boolean`，来自当前登录人是否在 `ontology.user_module` 中有对应行。

### `POST /api/modules/:code/enable`

- 登录门禁；身份只取 `req.auth.externalId`。
- 只有 `status = 'active'` 且当前角色可用的模块才能选用。
- 不可用模块 → `403`，不写 `user_module`。
- 重复 enable → `200`，`ON CONFLICT ... DO NOTHING`，不重复写行。

### `POST /api/modules/:code/disable`

- 登录门禁；身份只取 `req.auth.externalId`。
- 仅删除当前身份的偏好行。
- 不可用模块 → `403`。
- 重复 disable → `200`，再次删除为 0 行。

选用状态只是偏好，不参与授权；模块可用性始终由角色过滤结果决定。

## 4. 工作台行为

- `visibleModules` = 核心模块 + 已选用可选模块。
- `optionalModules` = 当前角色可用但非核心的模块。
- 开关变更采用乐观更新；请求失败时恢复原状态并显示错误提示。
- 刷新工作台后重新调用 `GET /api/modules`，`selected` 状态随服务端结果更新。

## 5. 验证结果

最终验收命令：

```bash
GRI_ROOT=/home/ubantu/GRI \
AUTH_CENTER_URL=http://127.0.0.1:3004 \
DB_HOST=127.0.0.1 DB_PORT=5432 \
bash .agents/codex/outputs/p3-s3-verify.sh
```

最终输出：

```text
全绿：PASS=112 FAIL=0 SKIP=0
```

覆盖结果：

- 本体 schema + 语义双校验：通过。
- 023 / 024 结构块与 codegen：逐字节一致。
- `services/api npm run build`：通过；`dist/migrate/023_app_module.sql` 与 `024_user_module.sql` 均存在。
- `public._api_migrations`：023、024 均已登记；9 个模块活跃。
- `ontology.user_module` 与 `(user_id, module_code)` 唯一键：通过。
- `npx tsc --noEmit`：0 error。
- module-registry Jest：2 suites / 11 tests，全绿。
- API 全量 Jest：34 suites / 528 tests，全绿，无回归。
- `apps/portal npm run build:h5`：通过。
- 实时 HTTP：
  - 无 token `GET /api/modules` → `401`。
  - consumer 只看到 `food`，`selected=false`；enable `org-admin` → `403` 且零写入。
  - 临时账号提升为 student 后，enable `curriculum` → `200`；重复 enable → `200` 且恰好 1 行；刷新 `selected=true`。
  - disable `curriculum` → `200`；重复 disable → `200` 且零行；刷新 `selected=false`。
  - operator 看到全部 9 个模块，包括 `org-admin` 与 `identity`。
  - 临时账号已删除。

## 6. 硬约束对照

| # | 约束 | 落实 |
|---|---|---|
| N1 | 选用 ≠ 授权；越权 enable → 403 且不写行 | enable/disable 的 SQL CTE 先以 DB 角色校验可用性；实时验证 consumer enable `org-admin` 为 403 且零行 |
| N2 | 本体驱动，禁手写结构 DDL | `UserModule` → `@gri/codegen` → `024_user_module.sql`，并做结构块对照 |
| N3 | `externalId`、唯一约束、幂等 | 控制器只取 `req.auth.externalId`；`UNIQUE (user_id, module_code)`；enable/disable 重复调用实测 200 |
| N4 | 024，先 build 再 migrate | 编号 024；build 后 runner 读取 `dist/migrate`；登记 `public._api_migrations` |

## 7. 明确不做

- 不做维度挂接（S4）。
- 不做微前端。

## 8. 收尾纪律

- 未 commit、未 checkout。
- 测试临时账号已通过 API 删除。
- 验收脚本只在临时目录保存 token 响应，不打印凭据。
