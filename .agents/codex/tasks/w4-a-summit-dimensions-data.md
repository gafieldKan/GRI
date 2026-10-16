# W4-a：学科登顶 · 双维度数据面 —— 学科体系分支树 + K12↔分支映射 + 人教版核对

> 执行者：Codex ｜ 波次：Persona World ｜ 依赖：无（curriculum 已就位）｜ 状态：待下达
> 依据：`docs/SUBJECT_SUMMIT_DESIGN.md`（**设计 v2**：分支体系由助手掌权，见 §3/§4）+ 用户 2026-10-16 22:26 修正
> 定位：为登峰**双维度**（学科体系 / K12 体系）提供只读数据面。**不含 UI**（W4-b 做）。

## 📥 承重事实（实测，勿再假设）

- `ontology.knowledge_area`(331)：领域→知识域→前沿两级树（`parent_id` 自引用）；`scope`=k12(303)/frontier(28)；`grade_level` 1–12。**root 领域**：MATH 4（数与代数/图形与几何/统计与概率/综合与实践）、CHN 6、BIO/CHEM/ENG/PHYS 5。
- `edu.knowledge_points`(2908+)：**扁平**（`parent_id` 全空）；`code` = `math.g1.pep.ch01.s01.kp01` → **人教版(pep)+年级+章+节**；`subject` 小写（chem/chn/eng/math/phys，**无 bio**）。
- `ontology.textbook`(26)：`code=subj.gN.pep`（人民教育出版社）；`subject_id`+`grade_id`。`ontology.textbook_chapter`(622)：`code=subj.gN.pep.ch01[.s01]`、`textbook_id`；**MATH 515 / PHYS 107**。
- 掌握度：`edu.mastery_snapshots`（按 KP）；**登顶阈值 ≥80**；迁移当前 **030**；登记表 `public._api_migrations`；codegen `node packages/codegen/src/cli.js <yaml> --tracks sql`。
- 既有读面：`GET /api/curriculum/knowledge-map?subject=`（areas+前置边+按年级 kpCounts+掌握度）、`/api/curriculum/subjects`。

## 🔴 硬约束（违反即失败）

| # | 约束 |
|---|---|
| N1 | **学科体系分支树（§3）是种子规范**：`ontology.knowledge_branch` 自引用树（`subject_id`/`parent_id`/`name`/`code`/`description`/`sort_order`/`status`）+ 顶层 5–9 分支/科；**峰外(frontier)**用 `scope` 标记，**不得新增第 7 类抽象**。 |
| N2 | **映射两层、100% 落位、禁空**：① `ontology.textbook_chapter.branch_id`（622 章：关键词规则 + 例外表）② `ontology.knowledge_area.branch_id`（331 域：按 §3 表 + 例外表）。映射须**幂等、可重跑**，产出**落位率 100%** 校验。 |
| N3 | **章节规则示例（可自行扩充，须人审）**：章名含「机械运动/力/压强/浮力/功」→ PHYS.mech；「溶液/酸碱盐/氧气/金属」→ CHEM.inorg；「分数/小数/整数/近似/估算」→ MATH.num；「函数/导数/指数/对数」→ MATH.ana；「圆/直线/椭圆」→ MATH.anageo。**不得**用随机/模糊匹配蒙混。 |
| N4 | **人教版核对报告**：`points.code` 内 `pep`+年级须与 `textbook`/`grade` 一致；`chapter_id` 与 point code 章前缀须一致；产出**一致率 + 偏差清单**，**偏差报告不静默改**。 |
| N5 | 掌握度同真源（`mastery_snapshots`）；阈值 ≥80 前后端一致；维度 A/B 各自聚合。 |
| N6 | 读端点（匿名出结构、登录叠加掌握度，照 `knowledge-map` 口径）；**写端点无**；身份 `req.auth.externalId`；禁 `req.auth.roles`。 |
| N7 | 只新增不回归；`tsc` 0；全量 jest 记基线；结构变更必须 本体YAML→codegen→迁移（**禁手写结构 DDL**）；迁移登记；**不 commit/不 checkout**；凭据零泄漏。 |

## 📦 产出物

1. 本体 `packages/ontology/ontologies/knowledge-branch.ontology.yaml` + codegen 一致（若分支需结构）。
2. 迁移：`expert knowledge_branch 建树` + `textbook_chapter.branch_id` + `knowledge_area.branch_id`（**新 migration 号 031**，登记 `public._api_migrations`）。
3. 种子脚本（幂等）：分支树（§3 全量）+ 章映射（622）+ 面积映射（331）+ 例外表。
4. API：
   - `GET /api/curriculum/summit-branches?subject=`（**维度 A 学科体系**）：峰列表 + 每峰节点树/知识点数/**顶峰（终极点）** + 掌握度/登顶态 + 峰外延伸。
   - `GET /api/curriculum/summit-grades?subject=`（**维度 B K12 体系**）：学段→年级→人教版册/章 + 知识点数/掌握度/登顶态。
5. `.agents/codex/outputs/w4a-file-list.md`、`w4a-verify.sh`、`w4a-pep-audit.md`（人教版核对）。

## ✅ 验收标准

1. `tsc` 0；全量 jest 不回归（记基线）；本体（若有）双校验 + codegen 一致；迁移 031 登记、可重跑。
2. `expert knowledge_branch` 行数：MATH 9 顶层、CHN 7、ENG 6、BIO 6、PHYS 9、CHEM 7（含峰外子节点）；**每科 root 分支数正确**。
3. 映射落位率 **100%**：`select count(*) ... where branch_id is null` 对 `textbook_chapter` 与 `knowledge_area` **均 = 0**。
4. `summit-branches?subject=MATH`（登录）：9 座峰 + 各自知识点数/掌握度/登顶态 + 峰外；`subject=PHYS` → 9 峰。
5. `summit-grades?subject=MATH`：小/初/高 → G1–G12 + 人教版册/章 + 知识点数/掌握度；匿名出结构、登录叠加。
6. 人教版核对报告：一致率 + 偏差清单（若有偏差，附**数据轨修正建议**）。
7. 阈值 ≥80 与 `knowledge-map` 一致；`verify.sh` 末行 `FAIL=0`；不 commit/不 checkout；凭据零泄漏。

## 🧪 复验脚本要求（w4a-verify.sh）
须覆盖：分支树行数/顶层数、映射落位率 100%、两 API 匿名+登录、阈值一致性、人教版核对报表存在、`FAIL=0`。
