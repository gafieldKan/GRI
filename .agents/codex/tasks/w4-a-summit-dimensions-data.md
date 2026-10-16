# W4-a：学科登顶 · 双维度数据面 —— 学科知识体系分支树（锚定权威）+ K12↔分支映射

> 执行者：Codex ｜ 波次：Persona World ｜ 依赖：无 ｜ 状态：待下达
> 依据：`docs/SUBJECT_SUMMIT_DESIGN.md`（设计 v3）＋ `docs/SUBJECT_SUMMIT_AUTHORITY.md`（中图法权威表）＋ `.agents/codex/tasks/w4a-branch-seed-spec.md`（种子规范）
> 定位：为登峰**双维度**（**学科知识全覆盖 / K12 阶段**）提供只读数据面。**不含 UI**（W4-b 做）。
> **用户两次修正已纳入**：① **无"峰外"表述**，学科纵深仍是学科组成部分；② 分支必须**全面且科学、有权威出处**，设计目标是**体现学科知识的延续性、最终达成分科体系分支顶峰**。

## 📥 承重事实（实测）

- `ontology.knowledge_area`(331)：领域→知识域→前沿两级树；root：MATH 4、CHN 6、BIO/CHEM/ENG/PHYS 5。
- `edu.knowledge_points`(2908+)：扁平；`code`=`math.g1.pep.ch01.s01.kp01`（人教版+年级+章+节）；subject 小写 chem/chn/eng/math/phys（**无 bio**）。
- `ontology.textbook`(26 人教版 `subj.gN.pep`)、`ontology.textbook_chapter`(622，MATH 515/PHYS 107)。
- 掌握度 `edu.mastery_snapshots`；登顶阈值 **≥80**；迁移当前 **030**；登记 `public._api_migrations`。
- codegen：`node packages/codegen/src/cli.js <yaml> --tracks sql`。

## 🔴 硬约束（违反即失败）

| # | 约束 |
|---|---|
| N1 | **按种子规范建 `ontology.knowledge_branch`**：自引用树；顶层 **53 峰**（MATH 10/PHYS 10/CHEM 8/BIO 9/CHN 9/ENG 7）；字段含 `clc`（**须可回溯 `docs/SUBJECT_SUMMIT_AUTHORITY.md`**，禁编造分类号）、`curriculum`、`k12_grade_min/max`。**`scope` 不再用 frontier/峰外语义。** |
| N2 | **映射两层、100% 落位、禁空**：① `ontology.textbook_chapter.branch_id`（622：关键词规则 + 例外表）② `ontology.knowledge_area.branch_id`（331）。幂等可重跑 + 落位率校验。 |
| N3 | 规则以规范表为基线，**须人工复核**；无法判定的章走**例外表显式指定**；禁止模糊匹配/默认兜底。 |
| N4 | **人教版核对**：`points.code` 的 `pep`+年级 与 `textbook`/`grade` 一致；`chapter_id` 与 code 章前缀一致；出**一致率 + 偏差清单**（**只报告不静默改**）。 |
| N5 | **延续性字段**：每分支的 `k12_grade_min/max` 由**实际落位数据推导**（该分支下最小值/最大年级），不允许手填。 |
| N6 | 掌握度同真源；阈值 ≥80 前后端一致；两维度各自聚合。 |
| N7 | 读端点（匿名出结构、登录叠加掌握度）；**无写端点**；身份 `externalId`；禁 `req.auth.roles`。 |
| N8 | 只新增不回归；`tsc` 0；全量 jest 记基线；结构变更必须 本体YAML→codegen→迁移（禁手写 DDL）；迁移 **031** 登记；**不 commit/不 checkout**；凭据零泄漏。 |

## 📦 产出物

1. 本体 `packages/ontology/ontologies/knowledge-branch.ontology.yaml` + codegen 一致。
2. 迁移 **031**：`knowledge_branch` 建树 + `textbook_chapter.branch_id` + `knowledge_area.branch_id`；登记。
3. 幂等种子：分支（53 + 峰顶/纵深子节点）+ 章映射(622) + 面积映射(331) + 例外表。
4. API：
   - `GET /api/curriculum/summit-branches?subject=`（**维度 A 学科知识全覆盖**）：峰列表 + 每峰节点树/知识点数/**顶峰** + 掌握度/登顶态 + `k12_grade_min/max`。
   - `GET /api/curriculum/summit-grades?subject=`（**维度 B K12**）：学段→年级→人教版册/章 + 知识点数/掌握度/登顶态 + 每册/章所属分支。
5. `.agents/codex/outputs/w4a-file-list.md`、`w4a-verify.sh`、`w4a-pep-audit.md`。

## ✅ 验收标准

1. `tsc` 0；全量 jest 不回归（记基线）；本体双校验 + codegen 一致；迁移 031 登记、可重跑。
2. `knowledge_branch` 顶层数正确：**MATH 10 / PHYS 10 / CHEM 8 / BIO 9 / CHN 9 / ENG 7**；每分支 `clc` 非空且可回溯权威表。
3. 落位率 **100%**：`ontology.textbook_chapter` 与 `ontology.knowledge_area` 的 `branch_id` 为空**均 = 0**；例外表明细可审。
4. `summit-branches?subject=MATH`（登录）：10 座峰 + 知识点数/掌握度/登顶态 + `k12_grade_min/max`；`subject=PHYS` → 10 峰。
5. `summit-grades?subject=MATH`：小/初/高 → G1–G12 + 人教版册/章 + 所属分支；匿名出结构、登录叠加。
6. `k12_grade_min/max` 由数据推导（如 `math.analysis` 应含 10–12；`math.opt 无` → NULL）。
7. 人教版核对报告：一致率 + 偏差清单；阈值 ≥80 一致；`verify.sh` 末行 `FAIL=0`；不 commit/不 checkout。

## 🧪 复验脚本要求
须覆盖：分支数/顶层数、clc 非空且可回溯、落位率 100%、两 API 匿名+登录、延续性字段推导正确、人教版报表存在、`FAIL=0`。
