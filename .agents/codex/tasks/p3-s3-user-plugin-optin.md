# P3-S3：用户插件选用 UserModule（opt-in）

> 执行者：Codex ｜ 波次：P3 ｜ 依赖：**S2** ｜ 状态：待下达（下达前复核）

## 🎯 本卡定位

用户在工作台**选用/取消**插件（"可选插件方式选用"）。工作台只显示**已选用**（+ 核心常驻）；刷新保持。

## 🔴 硬约束

| # | 约束 |
|---|---|
| N1 | **选用 ≠ 授权**：`user_module` 只记**偏好**；可用性仍由 `GET /api/modules` 的角色过滤决定——**越权插件不可被 enable**（403）。 |
| N2 | **本体驱动**：`app-module.ontology.yaml` 增 `UserModule` 对象 → codegen → 迁移 **024**。 |
| N3 | 身份取 `req.auth.externalId`；`(user_id, module_code)` **唯一**，enable/disable **幂等**。 |
| N4 | 迁移编号 **024**；先 build 再 migrate。 |

## 📥 承重事实

- S2 已提供 `ontology.app_module` + `GET /api/modules`（角色过滤）。
- 登录人 = `public.users.id`（= JWT externalId）。

## 📦 产出物

- `packages/ontology/ontologies/app-module.ontology.yaml`（+UserModule）
- `services/api/src/migrate/024_user_module.sql`
- `POST /api/modules/:code/enable` · `/disable`（登录门禁；校验该模块对该角色**可用**）
- `GET /api/modules` 增 `selected` 字段
- 工作台勾选/取消 UI
- spec + `p3-s3-verify.sh`

## ✅ 验收标准

1. 勾选/取消 → 刷新工作台随之变化。
2. 对**不可用**模块 enable → **403**（且不写行）。
3. 幂等：重复 enable 不报错不重复。
4. 不回归；verify FAIL=0。
