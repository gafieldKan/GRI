# W4-a：学科登顶 · 双维度数据面（学科知识分类多顶峰 / K12 学段年级）+ 人教版编排核对

> 执行者：Codex ｜ 波次：Persona World ｜ 依赖：无（curriculum 已就位）｜ 状态：待下达
> 依据：`docs/SUBJECT_SUMMIT_DESIGN.md`（W4 设计）+ 用户 2026-10-16 四点要求
> 定位：为登峰**双维度**提供**只读数据面**，并**核对 K12 年级是否依人教版编排**。**不含 UI**（W4-b 做）。

## 📥 承重事实（实测）

- `ontology.knowledge_area`(331)：`parent_id` 自引用两级树（**领域 → 知识域 → 前沿**）；`scope` ∈ {k12(303, `grade_level` 1–12), frontier(28, 无年级)}；`subject_id`。数学 root 领域 **4**（数与代数/图形与几何/统计与概率/综合与实践）；前沿节点如 抽象代数/实分析/复分析/拓扑学/微分几何/数值分析。
- `edu.knowledge_points` **2908**，`grade_level` G1–G12 已填。
- 本体 `k12-curriculum`：Subject/SchoolStage(小/初/高)/Grade(G1–G12)/Textbook(人教版…)/TextbookChapter/KnowledgePoint/KnowledgeArea + `area_prerequisite`。
- 现有 `GET /api/curriculum/knowledge-map?subject=`：`areas`(scope/grade/parent) + 前置边 + **按年级** kpCounts + 掌握度。`GET /api/curriculum/subjects`。
- 掌握度源：`edu.mastery_snapshots`（按 KP 关联）；登顶阈值 **≥80**（沿用）。
- 迁移当前 **030**；记录表 `public._api_migrations`；codegen `node packages/codegen/src/cli.js <yaml> --tracks sql`。

## 🔴 硬约束

| # | 约束 |
|---|---|
| N1 | **只读为主**：本卡**不改** `knowledge_area`/`knowledge_points` 的既有语义；如需新结构**必须**先写本体 YAML → codegen → 迁移（禁手写结构 DDL）。 |
| N2 | **维度 A 口径**：以**现有领域树**为分类（每学科 root 领域=一座峰；前沿节点作**顶峰候选**）。**分支目录可维护**（留口子：日后可登记更细科学分支），但**本卡不新建科学分支目录**。 |
| N3 | **维度 B 口径**：按 **学段(小/初/高) → 年级(G1–G12)** 组织；年级关联**以人教版教材编排为准**——**核对** `knowledge_area.grade_level` / `knowledge_points.grade_level` 与人教版 `Textbook/TextbookChapter` 一致性，**偏差要报告**（不静默改）。 |
| N4 | **掌握度用同一真源**（`mastery_snapshots`）；两维度按各自节点聚合；**登顶阈值 ≥80** 前后端一致。 |
| N5 | 读端点（匿名可出结构、登录叠加掌握度，照 `knowledge-map` 现行口径）；**写端点无**；身份取 `req.auth.externalId`；禁 `req.auth.roles`。 |
| N6 | 不回归；`tsc` 0；全量 jest 记基线不回归；只新增；迁移（若有）登记；**不 commit/不 checkout**；凭据零泄漏。 |

## 📦 产出物

- `GET /api/curriculum/summit-branches?subject=`（**维度 A**）：每学科的**分类分支=峰**列表 + 各分支的节点树/知识点数/**顶峰（终极点）** + 掌握度/登顶态。
- `GET /api/curriculum/summit-grades?subject=`（**维度 B**）：**学段 → 年级**结构 + 各年级知识点数/掌握度/登顶态 + **人教版标签**（如「人教版 七年级上」）。
- **人教版核对报告** `.agents/codex/outputs/w4a-pep-audit.md`：`knowledge_area`/`points` 的 `grade_level` 与人教版编排的**一致性核对**（一致率 / 偏差清单 / 建议）。
- `.agents/codex/outputs/w4a-file-list.md` + `w4a-verify.sh`。

## ✅ 验收标准

1. `tsc` 0；全量 jest 不回归（记基线）；本体（若有）双校验 + codegen 一致。
2. `summit-branches?subject=MATH`：返回 **4 座峰**（数与代数/图形与几何/统计与概率/综合与实践）+ 各自节点/顶峰 + 掌握度（登录）；其他学科分支数正确（CHN 6 / 其余 5）。
3. `summit-grades?subject=MATH`：返回 小/初/高 → G1–G12 + 各年级知识点数与掌握度；登录叠加、匿名出结构。
4. **人教版核对**：产出报告（一致率 + 偏差清单）；**若发现明显偏差**，报告中给出**数据轨修正建议**（不在本卡静默改）。
5. 登顶阈值与既有 `knowledge-map` 一致（≥80）。
6. `verify.sh` 末行 `FAIL=0`；不 commit/不 checkout；凭据零泄漏。
