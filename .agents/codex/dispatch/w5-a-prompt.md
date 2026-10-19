# W5-a 可下达提示词（粘贴给 Codex，**W4-a 已复验通过，可下达**）

> 任务卡：`.agents/codex/tasks/w5-a-learning-chain-data.md`（先读）。工作树 `/home/ubantu/GRI`，分支 `feat/stage-c-unified-auth-shell`。W4-a 已 done_verified（commit 172f8bb）、W4-b 已 done_verified（commit 5914892）。

---

【任务】W5-a：为学科登顶 **v4（黎明破晓 × 光脉传导）** 提供**只读数据面** —— 由课程序列推导「学习链图」（节点 + 分型边）+ 「洞窟聚合」端点。**不含 UI**。

■ 必读
1. `docs/SUBJECT_SUMMIT_DESIGN_V4.md`（**设计 v4，本卡灵魂**）+ `docs/SUBJECT_SUMMIT_DESIGN.md`（v3 数据基线，不改）+ `docs/SUBJECT_SUMMIT_AUTHORITY.md` + 任务卡。
2. 现有只读面（**不得改签名**）：`services/api/src/modules/curriculum/curriculum.controller.ts` / `.service.ts`（`summit-branches`/`summit-grades`/`knowledge-graph`/`learning-path` 契约）。
3. 迁移机制 `services/api/src/migrate/run-migrations.ts` + 最近迁移 `031_knowledge_branch.sql`（写法/幂等/登记范式）；codegen `node packages/codegen/src/cli.js <yaml> --tracks sql`。
4. 本体 `packages/ontology/ontologies/*.yaml`（结构变更须先改 YAML）。

■ 承重事实（实测，直用于实现）
- `edu.knowledge_points` **2908**：`grade_level` 覆盖 2907、`chapter_id` 2873、`code`=`math.g1.pep.ch02.s01.kp03`（无 sort_order，按 code 尾号 `kpNN` 排）。
- `prerequisites`（jsonb）**仅 22/2908** → 链**必须由课程序列推导**，显式前置最高优先。
- `ontology.textbook_chapter` 两层（163 单元 / 459 节），有 `sort_order`/`parent_id`/`branch_id`；`ontology.textbook` 26 册；`ontology.knowledge_branch`（W4-a：53 峰 + 纵深，含 `clc`、`k12_grade_min/max`）。
- 掌握度 `edu.mastery_snapshots`（唯一真源，阈值 **≥80**）；`edu.achievements` **0 条**。
- 迁移当前 **031 → 本卡 032**；登记 `public._api_migrations`。

■ 硬约束（违反即失败）
N1 边**分型**：`explicit`（prerequisites，最高优先）/ `seq`（同节/同章课程序列）/ `soft`（同分支跨年级近邻，**引导性、非数据断言**）。每条边带 `kind`+`reason`。
N2 **宁可缺、不可编造**：不确定的边不生成。
N3 **骨干链**：同分支内按「年级→册→章→节→kp 序」串联成连续主线，**不断链、不乱序**。
N4 **只读、零写端点**；匿名可读（入 `public-routes.ts` 白名单），登录叠加 `mastery`；**匿名 `userId=null` 不得输出 mastery 字段**。
N5 **不改**既有端点签名/响应；新端点独立。
N6 **本体驱动**：若持久化链（如 `ontology.learning_edge`）→ 先改 YAML→codegen→迁移 032；**禁手写 DDL**；若纯派生则在 service 内算并**产出说明理由**（二选一）。
N7 迁移 032 登记；先 `npm run build` 再 migrate；**幂等**；禁模糊匹配/默认兜底。
N8 掌握度同真源、阈值一致；身份 `req.auth.externalId`；**禁 `req.auth.roles`**。
N9 不回归：`tsc` 0；全量 jest 记基线（基线 624 tests）；**不 commit/不 checkout**；凭据零泄漏。
N10 **规模守卫**：2908 kp 下端点须按 `subject`+`branch`（或 `grade`）限定，**禁止一次全量重载荷**。

■ 产出
1. （若建表）本体 YAML + codegen 一致 + 迁移 032（幂等登记）；（若纯派生）推导器 + 说明。
2. 推导器（纯函数优先、可测）：`buildBranchChain` + `buildSoftEdges`；显式前置最高优先。
3. 端点：
   - `GET /api/curriculum/learning-chain?subject=&branch=&grade=` → `{subject,branch,nodes[{code,name,grade,chapter,chapterName,mastery?,state:'dim'|'half'|'lit'}],edges[{from,to,kind,reason}],summary{total,lit,next}}`
   - `GET /api/curriculum/kp-cave?kpId=` → 洞内闭环聚合（掌握度/三态/前置边/题入口/错题due/复习due/下一节点/成就态），**只读**。
4. 单测（推导正确性/边型/匿名不泄露/分页限定）。
5. `.agents/codex/outputs/w5a-file-list.md` + `w5a-verify.sh` + `w5a-chain-audit.md`（边型统计/soft 占比/断链=0 证据/样例链）。

■ 自检（末行须 `FAIL=0`）
`tsc` 0 · jest 不回归 · 骨干链连续无断 · 边型统计合理 · `reason` 非空 · 匿名无 mastery/登录有 · 既有端点对拍不变 · 迁移幂等 · `FAIL=0` · 不 commit/不 checkout · 凭据零泄漏。
