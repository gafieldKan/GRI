# W4-a 可下达提示词（粘贴给 Codex）

> 任务卡：`.agents/codex/tasks/w4-a-summit-dimensions-data.md`（先读）。工作树 `/home/ubantu/GRI`，分支 `feat/stage-c-unified-auth-shell`。

---

【任务】W4-a：学科登顶双维度**数据面**（学科知识分类多顶峰 / K12 学段年级）+ 人教版编排核对。**不含 UI**（W4-b 做）。

■ 必读
1. `docs/SUBJECT_SUMMIT_DESIGN.md`（W4 设计）+ 任务卡。
2. `services/api/src/modules/curriculum/*`（现有 `knowledge-map`/`knowledge-graph`/`subjects` 口径）。
3. `packages/ontology/ontologies/k12-curriculum.ontology.yaml`（Subject/SchoolStage/Grade/Textbook/TextbookChapter/KnowledgeArea…）。
4. `services/api/src/migrate/*`（迁移范式+登记）、`scripts/reference-data/import.mjs`（数据轨范式）。

■ 现状（实测）
- `ontology.knowledge_area`(331)：parent_id 两级树（领域→知识域→前沿）；scope k12(303,grade 1–12)/frontier(28)；数学 root 领域 **4**（数与代数/图形与几何/统计与概率/综合与实践）；前沿节点 抽象代数/实分析/复分析/拓扑学/微分几何/数值分析。
- `edu.knowledge_points` **2908**，grade_level G1–G12 已填；掌握度 `edu.mastery_snapshots`；登顶阈值 **≥80**。
- 迁移到 **030**。

■ 硬约束（违反即失败）
N1 只读为主；新结构必须 本体YAML→codegen→迁移（禁手写 DDL）。
N2 维度 A 以**现有领域树**为分类（每学科 root 领域=一座峰；前沿节点作顶峰候选）；**不新建科学分支目录**（留"可维护"口子）。
N3 维度 B 按 学段→年级；年级关联**以人教版编排为准**——核对 `knowledge_area`/`points` 的 grade 与人教版 `Textbook/Chapter` 一致性，**偏差报告、不静默改**。
N4 掌握度同一真源；登顶阈值 ≥80 前后端一致。
N5 读端点（匿名出结构、登录叠加掌握度，照 knowledge-map 口径）；写端点无；身份取 externalId。
N6 不回归；tsc 0；全量 jest 记基线；只新增；迁移登记；不 commit/不 checkout；凭据零泄漏。

■ 产出
1. `GET /api/curriculum/summit-branches?subject=`（维度 A：峰列表 + 节点树/知识点数/顶峰 + 掌握度/登顶态）
2. `GET /api/curriculum/summit-grades?subject=`（维度 B：学段→年级 + 知识点数/掌握度/登顶态 + 人教版标签）
3. `.agents/codex/outputs/w4a-pep-audit.md`（人教版一致性核对：一致率 / 偏差清单 / 数据轨修正建议）
4. `.agents/codex/outputs/w4a-file-list.md` + `w4a-verify.sh`

■ 自检
- tsc 0；全量 jest 不回归（记基线）。
- `summit-branches?subject=MATH` → **4 座峰** + 顶峰 + 掌握度（登录）；CHN 6 / 其余 5。
- `summit-grades?subject=MATH` → 小/初/高 → G1–G12 + 知识点数/掌握度；匿名出结构。
- 人教版核对报告产出（一致率+偏差清单）。
- 阈值与 knowledge-map 一致（≥80）。
- verify.sh 末行 FAIL=0；凭据零泄漏。
