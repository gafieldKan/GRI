# P3-S2：应用注册表 AppModule（后端）

> 执行者：Codex ｜ 波次：P3 ｜ 依赖：**S1** ｜ 依据：`docs/SSO_PORTAL_PLUGIN_PLAN.md §3/§4/§8`
> 状态：待下达（**下达前按当时现实复核**）

## 🎯 本卡定位

把 S1 的**本地模块目录**搬到**后端注册表** `ontology.app_module`，并提供 `GET /api/modules`（**按登录人权限**返回可用插件）。S1 工作台改为消费该端点。

## 🔴 硬约束

| # | 约束 |
|---|---|
| N1 | **本体驱动**：新写 `packages/ontology/ontologies/app-module.ontology.yaml` → `@gri/codegen` → 迁移 **023**。**禁**手写结构 DDL。 |
| N2 | 授权走既有 `assertSiteOperator`/`assertRole`；身份取 `req.auth.externalId`。**禁** `req.auth.roles`。 |
| N3 | 只**新增**，不重建既有模块/表。 |
| N4 | 迁移编号 **023**，登记 `public._api_migrations`；跑迁移前先 `npm run build`（runner 读 `dist/migrate/*.sql`）。 |
| N5 | `ontology.app_module` 仅存**目录**；用户"选用"状态**不在本卡**（S3）。 |

## 📥 承重事实（实测）

- 迁移当前到 **022**；迁移器读 `dist/migrate/*.sql`，记录表 `public._api_migrations`。
- 角色闭集：`consumer|student|merchant|operator`；组织角色：`owner|admin|member`。
- codegen 用法：`node packages/codegen/src/cli.js <yaml> --tracks sql`。
- 既有 `ontology.master_data` 是**扁平字典**，不适合带 route/roles 的注册表 → 用**独立本体对象**。
- 全仓**无**既有插件/模块注册概念。

## 📦 产出物

| 文件 | 动作 |
|---|---|
| `packages/ontology/ontologies/app-module.ontology.yaml` | 新增（AppModule：code/name/short/description/icon/entry_url/category/allowed_roles/is_core/status/sort_order） |
| `services/api/src/migrate/023_app_module.sql` | 新增（codegen 产出 + 审阅头注） |
| 种子 | 9 模块（food/tutor/org-admin/ontology-stats/agent/twin/…） |
| `services/api/src/modules/module-registry/*`（controller/service/types/spec） | `GET /api/modules`（登录门禁，按角色过滤 `allowed_roles`；`is_core` 处理） |
| S1 工作台改造 | 从 `/api/modules` 取目录（替换本地常量） |
| `.agents/codex/outputs/p3-s2-file-list.md` + `p3-s2-verify.sh` | 产出 + 验收 |

## ✅ 验收标准

1. `tsc --noEmit` 0 err；模块 jest 绿；全量 jest **不回归**（记录基线）。
2. `GET /api/modules`：`consumer` 不见 `org-admin`；`operator` 全见；无 token → **401**。
3. 本体 schema+语义**双校验** OK；迁移登记 `_api_migrations`。
4. S1 工作台改为消费端点后行为一致。
5. `verify.sh` FAIL=0。
