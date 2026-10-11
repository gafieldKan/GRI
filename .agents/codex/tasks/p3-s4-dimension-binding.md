# P3-S4：双维度挂接 module_region / module_industry

> 执行者：Codex ｜ 波次：P3 ｜ 依赖：**S3** ｜ 状态：待下达（下达前复核 + 确认粒度）

## 🎯 本卡定位

模块**可选声明作用域**（在哪些区域/行业可见可用）；门户加「区域 × 行业」选择器，选定后按上下文过滤插件。

> ⚠️ 纠正：**不是**"把每个模块都挂到维度下"（范畴错误）。默认**不挂**=全维度可见；挂接是**可选限定**。

## 🔴 硬约束

| # | 约束 |
|---|---|
| N1 | 维度关联用**真 FK**（本体 link → 外键），**不用 JSON 字段**。 |
| N2 | **粒度闭集**（防组合爆炸）：`region` 挂 `level ∈ {country, province}`；`industry` 挂 `level = section`。**在卡内写死闭集**（若需调整，先改本卡）。 |
| N3 | **不改**既有 `ontology.region`/`ontology.industry` 表结构（只新增关联表）。 |
| N4 | 本体驱动：`ModuleRegion`/`ModuleIndustry` 对象 → codegen → 迁移 **025**。 |
| N5 | 未挂接的模块在任意维度下**仍可见**（默认全可见）。 |

## 📥 承重事实

- `ontology.region`（node_id/code/level/parent_id；7999 节点）；`ontology.industry`（code/level/section/parent_id；832 节点）。
- 两棵树可复用现有钻取（S1 工作台可加选择器）。

## 📦 产出物

- 本体 + `services/api/src/migrate/025_module_dimension.sql`
- `GET /api/modules?region=<nodeId>&industry=<code>` 过滤
- `GET/PUT /api/modules/:code/bindings`（operator）
- 门户「区域×行业」选择器 UI + 过滤
- spec + `p3-s4-verify.sh`

## ✅ 验收标准

1. 未挂接模块：任意维度下可见。
2. 挂了作用域的模块：仅在其命中维度可见。
3. 选择器能选区域/行业节点并驱动过滤。
4. 不回归；verify FAIL=0。
