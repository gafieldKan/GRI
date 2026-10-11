# P3-S5：维度维护（operator CRUD + 审计）

> 执行者：Codex ｜ 波次：P3 ｜ 依赖：**S2**（operator 门禁）｜ 状态：待下达（下达前复核）

## 🎯 本卡定位

operator 在**维度维护页**增/改名/换父/排序/归档 `region`/`industry` 节点；**每次变更入审计**（append-only）。

## 🔴 硬约束

| # | 约束 |
|---|---|
| N1 | 权限：写操作走 `assertSiteOperator`（根组织 owner|admin）；**禁** `req.auth.roles`。 |
| N2 | **完整性**：移动节点**防环**（不能移到自己后代下）；层级/编码规则校验（`level` 与父子关系一致）。 |
| N3 | 变更**一律入** `ontology.dimension_change_log`（dimension/target_node_id/op/before/after/actor_id/source/created_at）。 |
| N4 | 本体驱动：`DimensionChangeLog` 对象 → codegen → 迁移 **026**。 |
| N5 | 只改运行时库；**不**自动回写 `data/*.json`（真源同步为开放项）。 |

## 📥 承重事实

- `ontology.region`/`ontology.industry` 结构已建；现有 7999/832 节点。
- `tenant.organization_audit_logs` 有可参照的审计模式。

## 📦 产出物

- `services/api/src/migrate/026_dimension_change_log.sql`
- `GET/POST/PATCH/DELETE /api/regions` · `/api/industries`（写门禁）
- operator 维度维护页（portal）
- spec + `p3-s5-verify.sh`

## ✅ 验收标准

1. operator 增/改名/移动节点 → DB 生效 **+ 审计一条**。
2. 非 operator → **403**。
3. 防环：把 A 移到 A 的后代 → **400**。
4. 不回归；verify FAIL=0。
