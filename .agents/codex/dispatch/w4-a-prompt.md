# W4-a 可下达提示词（粘贴给 Codex）

> 必读（按序）：`docs/SUBJECT_SUMMIT_DESIGN.md`（设计 v3 权威）→ `docs/SUBJECT_SUMMIT_AUTHORITY.md`（中图法权威表）→ `.agents/codex/tasks/w4a-branch-seed-spec.md`（种子规范，直用）→ 任务卡 `.agents/codex/tasks/w4-a-summit-dimensions-data.md`。
> 工作树 `/home/ubantu/GRI`，分支 `feat/stage-c-unified-auth-shell`。

---

【任务】W4-a：建「学科知识体系分支树」（锚定中图法权威）+ K12↔分支映射 + 双维度读 API + 人教版核对。**不含 UI**（W4-b 做）。

■ 现状（实测，勿再假设）
- `ontology.knowledge_area`(331)：领域→知识域→前沿两级树；root：MATH 4、CHN 6、BIO/CHEM/ENG/PHYS 5。
- `edu.knowledge_points`(2908+)：扁平；code=`math.g1.pep.ch01.s01.kp01`（人教版+年级+章+节）；subject 小写 chem/chn/eng/math/phys（无 bio）。
- `ontology.textbook`(26 人教版 subj.gN.pep)；`ontology.textbook_chapter`(622，MATH 515/PHYS 107)。
- 掌握度 `edu.mastery_snapshots`；登顶阈值 **≥80**；迁移当前 **030**；登记 `public._api_migrations`。
- codegen：`node packages/codegen/src/cli.js <yaml> --tracks sql`

■ 硬约束（违反即失败）
N1 按种子规范建 `ontology.knowledge_branch` 自引用树；顶层 **53 峰**（MATH 10/PHYS 10/CHEM 8/BIO 9/CHN 9/ENG 7）；字段含 `clc`（须可回溯 docs/SUBJECT_SUMMIT_AUTHORITY.md，禁编造分类号）、`curriculum`、`k12_grade_min/max`。**scope 不使用 frontier/峰外语义**——学科纵深仍是学科组成部分。
N2 映射两层、**100% 落位禁空**：① `textbook_chapter.branch_id`（622：关键词规则+例外表）② `knowledge_area.branch_id`（331）。幂等可重跑 + 落位率校验。
N3 规则以规范表为基线，须人工复核；无法判定的章走**例外表显式指定**；禁止模糊匹配/默认兜底。
N4 人教版核对：points.code 的 pep+年级 与 textbook/grade 一致；chapter_id 与 code 章前缀一致；出一致率+偏差清单，**只报告不静默改**。
N5 `k12_grade_min/max` 由**实际落位数据推导**（该分支下 min/max 年级），不允许手填；学科纵深分支可 NULL。
N6 掌握度同真源；阈值 ≥80 前后端一致；两维度各自聚合。
N7 读端点（匿名出结构、登录叠加掌握度）；无写端点；身份 externalId；禁 req.auth.roles。
N8 只新增不回归；tsc 0；全量 jest 记基线；结构变更必须 本体YAML→codegen→迁移（禁手写 DDL）；迁移 **031** 登记；**不 commit/不 checkout**；凭据零泄漏。

■ 产出
1. 本体 `packages/ontology/ontologies/knowledge-branch.ontology.yaml` + codegen 一致。
2. 迁移 031：knowledge_branch 建树 + textbook_chapter.branch_id + knowledge_area.branch_id；登记 public._api_migrations。
3. 幂等种子：分支（53+纵深子节点）+ 章映射(622) + 面积映射(331) + 例外表。
4. API：
   - GET /api/curriculum/summit-branches?subject=（维度A 学科知识全覆盖：峰列表+节点树/知识点数/顶峰+掌握度/登顶态+k12_grade_min/max）
   - GET /api/curriculum/summit-grades?subject=（维度B K12：学段→年级→人教版册/章+知识点数/掌握度/登顶态+每册/章所属分支）
5. .agents/codex/outputs/w4a-file-list.md、w4a-verify.sh、w4a-pep-audit.md

■ 自检（verify.sh 末行须 FAIL=0）
- tsc 0；全量 jest 不回归（记基线）。
- 分支顶层数正确：MATH 10/PHYS 10/CHEM 8/BIO 9/CHN 9/ENG 7；每分支 clc 非空且可回溯权威表。
- 落位率 100%：`ontology.textbook_chapter` 与 `ontology.knowledge_area` 的 branch_id 为空均 = 0。
- summit-branches?subject=MATH（登录）→ 10 座峰 + 知识点数/掌握度/登顶态 + k12_grade_min/max；subject=PHYS → 10 峰。
- summit-grades?subject=MATH → 小/初/高 → G1–G12 + 人教版册/章 + 所属分支；匿名出结构、登录叠加。
- k12_grade_min/max 数据推导正确（如 math.analysis 应含 10–12；纯深积分分支为 NULL）。
- 阈值与 knowledge-map 一致（≥80）；人教版核对报告在。
- 不 commit/不 checkout；凭据零泄漏。
