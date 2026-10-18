# W4-a 学科知识体系分支树 — 交付清单

> 分支：`feat/stage-c-unified-auth-shell`（改动留在工作树，未 commit / 未 checkout）
> 任务：W4-a 学科知识体系分支树 + K12↔分支映射 + 双维度只读 API + 人教版核对
> 结构真源：`packages/ontology/ontologies/knowledge-branch.ontology.yaml`
> 权威锚点：`docs/SUBJECT_SUMMIT_AUTHORITY.md`
> 映射基线：`.agents/codex/tasks/w4a-branch-seed-spec.md`

## 1. 变更文件

### 新增

| 文件 | 说明 |
|---|---|
| `packages/ontology/ontologies/knowledge-branch.ontology.yaml` | `KnowledgeBranch` 本体：自引用 parent、学科引用、CLC/curriculum/K12 区间字段和查询索引 |
| `services/api/src/migrate/031_knowledge_branch.sql` | 031 结构+种子迁移：57 个分支、622 章映射、331 面积映射、年级区间推导、完整性断言和迁移登记 |
| `.agents/codex/outputs/w4a-verify.sh` | W4-a 完整复验：结构/codegen/tsc/全量 Jest/迁移幂等/数据不变量/匿名与登录 API/PEP 报告 |
| `.agents/codex/outputs/w4a-pep-audit.md` | 人教版 `pep`、年级、章节前缀核对报告；只报告偏差，不修改数据 |
| `.agents/codex/outputs/w4a-file-list.md` | 本交付清单 |

### 修改

| 文件 | 说明 |
|---|---|
| `packages/ontology/ontologies/k12-curriculum.ontology.yaml` | 0.5.0：`TextbookChapter` 和 `KnowledgeArea` 增加 `branchId` 真外键及索引 |
| `packages/codegen/tests/mixed-mode.test.js` | 增加 knowledge-branch 门禁、自引用 FK、章节/面积 branch 引用与索引回归 |
| `services/api/src/auth/public-routes.ts` | 两条 summit GET 只读路由加入 OptionalAuth 匿名白名单 |
| `services/api/src/auth/public-routes.spec.ts` | 断言 summit 双维度可匿名读，非 GET 不放行 |
| `services/api/src/modules/curriculum/curriculum.controller.ts` | 新增 `summit-branches`、`summit-grades` GET 控制器方法，身份只取 `externalId` |
| `services/api/src/modules/curriculum/curriculum.service.ts` | 两维度聚合查询：分支子树 KP/掌握度/登顶态、学段→年级→人教版册章及所属分支 |
| `services/api/src/modules/curriculum/curriculum.types.ts` | 新增分支树和 K12 维度响应/节点类型 |
| `services/api/src/modules/curriculum/curriculum.service.spec.ts` | 覆盖匿名结构、登录掌握度叠加、`>=80` 登顶态、学科不存在 |
| `docs/SUBJECT_SUMMIT_AUTHORITY.md` | 补入 H1/H31/I/K/K892 可回溯权威行，并收敛到可验证的 CLC 锚点 |
| `docs/SUBJECT_SUMMIT_DESIGN.md` | 与 v3 种子规范对齐：生物/语文 9 峰、英语各国文学 `I3/7`、取消“峰外”表述 |

## 2. 分支与映射

- `ontology.knowledge_branch`：57 节点 = 53 个顶层峰 + 4 个学科纵深子节点。
- 顶层峰分布：MATH 10、PHYS 10、CHEM 8、BIO 9、CHN 9、ENG 7。
- 每个分支 `clc` 非空；迁移和 verify 均校验其锚点可回溯 `docs/SUBJECT_SUMMIT_AUTHORITY.md`。
- `ontology.textbook_chapter.branch_id`：163 个根章以显式 `VALUES` 映射，递归继承覆盖 622 章。
- `ontology.knowledge_area.branch_id`：331 个面积节点逐条显式映射。
- 映射为人工复核后的显式表，不使用 `LIKE` / `ILIKE` / 默认兜底；迁移可重复执行。
- `k12_grade_min/max` 由分支子树下实际落位 areas 的 `grade_level` 递归推导；纯纵深节点保持 NULL。

## 3. API 契约

两条端点均为只读、匿名可访问；登录时按 `req.auth.externalId` 从 `edu.mastery_snapshots` 叠加掌握度，登顶阈值统一为 `>=80`。

| 方法 | 路径 | 返回 |
|---|---|---|
| GET | `/api/curriculum/summit-branches?subject=` | 学科、阈值、顶层峰列表；每节点含子树树、知识点数、掌握度/登顶态、`k12GradeMin/Max`、CLC/curriculum |
| GET | `/api/curriculum/summit-grades?subject=` | 学科、阈值、学段→年级→人教版册/章；每章含所属分支、知识点数、掌握度/登顶态 |

未新增写端点，未使用 `req.auth.roles`。匿名响应不泄露个人 `mastery` 字段。

## 4. 验证与核对

`bash .agents/codex/outputs/w4a-verify.sh` 覆盖：

- 本体/codegen 一致性、`tsc`、API build、codegen 测试、全量 API Jest 基线。
- 031 登记与直接重跑幂等。
- 53 峰分布、CLC 非空且可回溯、章节/面积 `branch_id` 零空、年级区间推导。
- 匿名与登录的 MATH/PHYS 分支 API、MATH 学段年级册章 API。
- 人教版核对：可核对 2873/2873 一致；35 条 `code`/`chapter_id` 空值在报告中单列，未静默修改。

## 5. 边界

- 不包含 W4-b UI。
- 未修改其他迁移或共享 `gri-api` 容器。
- 验证脚本临时创建的身份、掌握度数据和隔离 API 进程会在退出时清理；脚本不预置账号、密码或令牌。
- 本任务未 commit、未 checkout；凭据零泄漏。
