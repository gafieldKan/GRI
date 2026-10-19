# W5-a：学科登顶 v4 · 学习链数据面 —— 光脉传导的燃料（先修链推导 + 洞窟聚合只读接口）

> 执行者：**Codex** ｜ 波次：Persona World · v4 ｜ 依赖：W4-a（已 done_verified）｜ 状态：待下达（串行；W5-a 跑完并复验后才下达 W5-b）
> 依据：`docs/SUBJECT_SUMMIT_DESIGN_V4.md`（**设计 v4 · 黎明破晓 × 光脉传导**）＋ `docs/SUBJECT_SUMMIT_DESIGN.md`（v3 数据基线，不改）＋ `docs/SUBJECT_SUMMIT_AUTHORITY.md`
> 定位：为 v4 的**光脉传导（M2）**与**洞窟（M3）**提供**只读**数据面。**不含 UI**（W5-b 做）。
> **用户裁决（2026-10-19）**：色彩=黎明破晓；引入光脉传导；要求"更能体现学习过程、引导和帮助学习"。

## 📥 承重事实（实测）

- `edu.knowledge_points` **2908** 条：`grade_level` 覆盖 **2907**、`chapter_id` **2873**、`code`=`math.g1.pep.ch02.s01.kp03`（人教版+年级+章+节+kp 尾号）；`sort_order` 无此列→按 `code` 尾号 `kpNN` 排序。
- `edu.knowledge_points.prerequisites`（jsonb）**仅 22/2908 有值** → **光脉链不能只靠此字段**，须由**课程序列推导**。
- `ontology.textbook_chapter`：**两层**（163 顶层单元 `...ch01` / 459 子节 `...ch01.s01`）；有 `sort_order`、`parent_id`、`branch_id`（W4-a 已 100% 落位）。
- **洞窟粒度（用户 2026-10-19 裁决）**：**1 洞 = 1 节（459）**，**洞内展开到知识点**（2908 kp 为洞内层级，不直接铺山面）。→ 学习链图的**节点 = 节**（unit=节），节点内带 `kps[]`（挂该节的知识点）；无子节的章**降级为以章为洞**（兜底，须在审计报告说明覆盖）。
- `ontology.textbook` 26 册人教版（`subj.gN.pep`）；`ontology.knowledge_branch`（W4-a 建，53 顶层峰 + 纵深子节点，含 `clc`、`k12_grade_min/max`）。
- 掌握度 `edu.mastery_snapshots`（唯一真源；登顶阈值 **≥80**）；`edu.achievements` **当前 0 条**。
- 现有只读端点（**不得改签名**）：`/curriculum/summit-branches`、`/curriculum/summit-grades`、`/curriculum/knowledge-graph`、`/curriculum/knowledge-map`、`/curriculum/learning-path`。
- 迁移当前 **031** → 本卡 **032**；登记 `public._api_migrations`（run-migrations 自动写）。
- codegen：`node packages/codegen/src/cli.js <yaml> --tracks sql`。

## 🎯 本卡目标（数据面）

产出**只读**「学习链图」与「洞窟聚合」，供前端：
1. 沿链**传导光脉**（已掌握节点 → 其后继节点"可进"）；
2. 显示**晨雾退散**（哪些区域被点亮）；
3. **洞窟三态**（未进/进未掌握/掌握）；
4. 点洞探入时**一次拿全**洞内闭环所需（题目入口/错题/复习到期/下一步）。

## 🔴 硬约束（违反即失败）

| # | 约束 |
|---|---|
| N1 | **先修链推导必须显式分边型**，输出边带 `kind`：`explicit`（来自 `prerequisites`，最高优先）/ `seq`（同节/同章内课程序列，强关联）/ `soft`（同分支跨年级近邻，**引导性，非数据断言**）。**禁止把 soft 声称为精确前置**。 |
| N2 | **宁可缺、不可编造**：无法确定的边**不生成**；每条边须带 `reason`（可读，如 `同节序列` / `同章 kp 序` / `显式前置 math_triangle`）。 |
| N3 | **骨干链（山径主线）**：同分支内按「年级 → 册 → 章 → 节 → kp 序」串联，构成自上而下连续主线（供"连续性"可视化）。**不得断链、不得乱序**。 |
| N4 | **只读、零写端点**；匿名可读（入 `public-routes.ts` 白名单），登录叠加 `mastery`；匿名 `userId=null` **不得输出 mastery 字段**。 |
| N5 | **不改**既有端点签名与返回契约（`summit-*`/`knowledge-*`/`learning-path` 全保留）。新端点独立。 |
| N6 | **本体驱动**：若需持久化链（如物化表 `ontology.learning_edge`），**先改 `packages/ontology/ontologies/*.yaml` → codegen → 迁移 032**；**禁手写结构 DDL**。若纯派生则可不建表（在 service 内计算）——**二选一，须在卡内产出说明理由**。 |
| N7 | 迁移 **032** 登记；先 `npm run build` 再 migrate；**幂等**（可重跑）；禁模糊匹配/默认兜底。 |
| N8 | 掌握度同真源、阈值 ≥80；权限边界 `assertSiteOperator`/`assertRole`（本卡无写端点），身份 `req.auth.externalId`；**禁 `req.auth.roles`**。 |
| N9 | 不回归：`tsc` 0；全量 jest 记基线（基线 624 tests，+新测不回归）；**不 commit / 不 checkout**；凭据零泄漏。 |
| N10 | 规模守卫：2908 kp / 53 峰下端点须**可接受响应**（分页或按分支/年级切分；**禁止一次全量 2908 节点的重载荷**——须按 `subject`+`branch` 或 `grade` 限定）。 |

## 📦 产出物

1. **（若持久化）**本体 `packages/ontology/ontologies/learning-chain.ontology.yaml` + codegen 一致 + 迁移 **032**（幂等、登记）；**（若纯派生）**在服务内推导 + 产出说明（N6 二选一）。
2. **推导器**（可测、纯函数优先）：
   - `buildBranchChain(branchId)`：骨干链 + seq/explicit 边；
   - `buildSoftEdges(...)`：跨年级软边（带 reason）；
   - 显式 `prerequisites` **最高优先**，覆盖推导边。
3. **只读端点**（新增，入白名单）：
   - `GET /api/curriculum/learning-chain?subject=&branch=&grade=` → `{ subject, branch, nodes:[{code,name,grade,chapter,chapterName,unit:'section'|'chapter',kps:[{code,name,mastery?,state}],mastery?,state:'dim'|'half'|'lit'}], edges:[{from,to,kind:'explicit'|'seq'|'soft',reason}], summary:{total,lit,next} }`
     > **统一口径**：**node = 节（洞）**；节内知识点在 `kps[]`；节掌握度 = 其下 kp 聚合。`unit='chapter'` 仅用于无子节的章降级。
   - `GET /api/curriculum/kp-cave?kpId=` → 洞内闭环聚合（掌握度/三态/前置边/题入口/错题due/复习due/下一节点/成就态），**只读**。
4. 单测（推导正确性 + 边型 + 匿名不泄露 mastery + 分页/限定）。
5. `.agents/codex/outputs/w5a-file-list.md`、`w5a-verify.sh`、`w5a-chain-audit.md`（边型统计、soft 占比、断链检查、样例链）。

## ✅ 验收标准

1. `tsc` 0；全量 jest 不回归（记基线）；本体双校验 + codegen 一致（若建表）；迁移 032 登记、可重跑（若建表）。
2. **骨干链**：任选分支（例 `math.num`）能出**自山脚到峰顶连续有序**的节点序列，**无断链**（审计报告给出断链=0 证据）。
3. **边型齐全且可解释**：含 explicit（≥22 条来源被消费）+ seq + soft；每条边有 `kind` 与 `reason`；soft 边在文档中**明确标注为引导性**。
4. `learning-chain?subject=MATH&branch=math.num`：返回节点/边/摘要；匿名**无 mastery 字段**、登录**有**；分页/限定生效（单次载荷可控，N10）。
5. `kp-cave?kpId=`：返回掌握度/三态/前置边/题入口/错题due/复习due/下一节点/成就态（**聚合只读**）。
6. **不回归**：既有端点签名与响应不变（对拍）。
7. `verify.sh` 末行 `FAIL=0`；不 commit/不 checkout；凭据零泄漏。

## 🧪 复验脚本要求
须覆盖：骨干链连续无断、边型统计（explicit/seq/soft）、`reason` 非空、匿名无 mastery、登录有 mastery、分页/限定、既有端点对拍不变、迁移幂等（若建表）、`FAIL=0`。
