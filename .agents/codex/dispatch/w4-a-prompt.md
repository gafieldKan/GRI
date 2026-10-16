# W4-a 可下达提示词（粘贴给 Codex）

> 任务卡：`.agents/codex/tasks/w4-a-summit-dimensions-data.md` + **分支种子规范** `.agents/codex/tasks/w4a-branch-seed-spec.md`（两篇都要读）。工作树 `/home/ubantu/GRI`，分支 `feat/stage-c-unified-auth-shell`。

---

【任务】W4-a：建「学科体系分支树」+ K12↔分支映射 + 双维度读 API + 人教版核对。**不含 UI**（W4-b 做）。

■ 必读
1. `docs/SUBJECT_SUMMIT_DESIGN.md`（设计 v2；分支体系 §3 与映射策略 §4 是权威）
2. `.agents/codex/tasks/w4a-branch-seed-spec.md`（**可直接执行的种子清单：6 科 44 顶层分支 + 落位规则**）
3. `packages/ontology/ontologies/k12-curriculum.ontology.yaml`、`services/api/src/modules/curriculum/*`、`scripts/reference-data/import.mjs`

■ 现状（实测，勿再假设）
- `ontology.knowledge_area`(331)：领域→知识域→前沿两级树；scope k12(303)/frontier(28)；root：MATH 4、CHN 6、BIO/CHEM/ENG/PHYS 5。
- `edu.knowledge_points`(2908+)：**扁平**；code=`math.g1.pep.ch01.s01.kp01`（人教版+年级+章+节）；subject 小写 chem/chn/eng/math/phys（无 bio）。
- `ontology.textbook`(26，人教版 `subj.gN.pep`)、`ontology.textbook_chapter`(622，MATH 515/PHYS 107)。
- 掌握度 `edu.mastery_snapshots`；登顶阈值 **≥80**；迁移当前 **030**；登记 `public._api_migrations`。
- codegen：`node packages/codegen/src/cli.js <yaml> --tracks sql`

■ 硬约束（违反即失败）
N1 分支树按种子规范：`ontology.knowledge_branch` 自引用（subject_id/parent_id/name/code/sort_order/scope/status）；顶层 = 一座峰（MATH 9、CHN 7、ENG 6、PHYS 9、CHEM 7、BIO 6）；**峰外用 scope=frontier，不引入第 7 类抽象**。
N2 映射两层、**100% 落位、禁空**：① `textbook_chapter.branch_id`（622：关键词规则+例外表）② `knowledge_area.branch_id`（331：按规范表+例外表）。**幂等可重跑**，产出落位率校验。
N3 规则用规范表里的落位规则（可扩充），**须人工复核**，禁止模糊/随机匹配蒙混。
N4 人教版核对：points.code 的 `pep`+年级 与 textbook/grade 一致；chapter_id 与 code 章前缀一致；出**一致率+偏差清单**，**偏差只报告不静默改**。
N5 掌握度同真源；阈值 ≥80 前后端一致；维度 A/B 各自聚合。
N6 读端点（匿名出结构、登录叠加掌握度，照 knowledge-map 口径）；无写端点；身份 externalId；禁 req.auth.roles。
N7 只新增不回归；tsc 0；全量 jest 记基线；结构变更必须 本体YAML→codegen→迁移（**禁手写结构 DDL**）；迁移 **031** 登记；**不 commit/不 checkout**；凭据零泄漏。

■ 产出
1. 本体 `packages/ontology/ontologies/knowledge-branch.ontology.yaml` + codegen 一致（若需结构）。
2. 迁移 031：`knowledge_branch` 建树 + `textbook_chapter.branch_id` + `knowledge_area.branch_id`；登记 `public._api_migrations`。
3. 幂等种子：分支树（规范全量）+ 章映射(622) + 面积映射(331) + 例外表。
4. API：
   - `GET /api/curriculum/summit-branches?subject=`（维度A：峰列表 + 节点树/知识点数/顶峰 + 掌握度/登顶态 + 峰外）
   - `GET /api/curriculum/summit-grades?subject=`（维度B：学段→年级→人教版册/章 + 知识点数/掌握度/登顶态）
5. `.agents/codex/outputs/w4a-file-list.md`、`w4a-verify.sh`、`w4a-pep-audit.md`

■ 自检（verify.sh 末行须 FAIL=0）
- tsc 0；全量 jest 不回归（记基线）。
- 分支顶层数正确：MATH 9/CHN 7/ENG 6/PHYS 9/CHEM 7/BIO 6。
- 映射落位率 100%：`select count(*) from ontology.textbook_chapter where branch_id is null` = 0 且 `ontology.knowledge_area` 同 = 0。
- `summit-branches?subject=MATH`（登录）→ 9 座峰 + 知识点数/掌握度/登顶态 + 峰外；`subject=PHYS` → 9 峰。
- `summit-grades?subject=MATH` → 小/初/高 → G1–G12 + 人教版册/章 + 知识点数/掌握度；匿名出结构、登录叠加。
- 阈值与 knowledge-map 一致（≥80）；人教版核对报告在。
- 不 commit/不 checkout；凭据零泄漏。
