# T11 任务卡：【已作废 / VOID】`master-data` + `ontology` 本体统计

**状态**：❌ **作废（VOID）—— 不执行。**
**作废日期**：2026-10-09
**作废依据**：代码实况核对（下方「实测证据」）。本卡原目标**已在仓库中实现**或**与现行架构决策冲突**，无可执行的剩余工作。

---

## 为什么作废（实测证据）

| 原卡要求 | 实测结果 | 判定 |
|---|---|---|
| 新增 `GET /api/ontology/stats` | **端点早已存在**：`services/api/src/modules/ontology/ontology.controller.ts` 的 `@Get('stats')`。返回四段聚合：`humanCentricPrinciple / ontologies / ontologyTotals / database / migrations / designPatterns / ooFeatures / realWorldMappings / devProcess`（远超原卡设想的 `{ontologies,objects,properties,enums,version}`）。带 token 实测返回完整数据。 | ❌ 重复建设 |
| `/stats` 加入公开读白名单 | 端点**故意不入白名单**。controller 注释原文：「登录即可看——不入白名单，默认强制鉴权」。 | ❌ 与设计意图相反 |
| 新增 `master-data` 模块 + `/dicts` 端点 | **模块不存在且已明确退役**。`app.module.ts` 原文：「master-data 门面已退役（前端零调用）：`ontology.master_data` 表降级为 k12 管线的 import 同源缓存，**不再有 API 面**」。 | ❌ 与架构决策直接矛盾 |
| `packages/ontology/version.json` 版本一致性 | **文件不存在**；`stats` 亦无 `version` 字段。 | ❌ 校验对象不存在 |
| 目录 `k12/*.yaml`、`food/*.yaml` | 实为**扁平 4 目录**：`database-orders / k12-curriculum / orders / student-twin`。 | ❌ 计数假设错误 |
| `ontologies:2, objects:47 …` | 原卡硬编码示例数字，与实际不符。 | ❌ |

---

## 现行落点（真实入口）

- **统计端点**：`GET /api/ontology/stats`（需登录）→ `OntologyStatsService.stats()`（`ontology-stats.service.ts`）。
- **本体真源**：`packages/ontology/ontologies/`（扁平 4 目录），由 `OntologyStatsService` 启动装载 + 缓存。
- **验证锚点**：portal「开发全流程统计」页（`apps/portal/src/api/index.js:146` 调 `/api/ontology/stats`）如实展示推演链。
- **主数据**：`ontology.master_data` 表仅供 k12 管线 import 同源缓存，**无 API 面**（有意为之）。

---

## 若将来确需「版本可见」（可选迷你跟进，非本卡）

仅当有人明确要报表带本体版本号时，才评估：
1. 是否新增 `packages/ontology/version.json`（或等价版本来源）；
2. 在 `OntologyStatsService.stats()` 组装结果里补 `version` 字段；
3. 同步更新 portal 展示 + 单测。

**当前无此需求 → 不做。**

---

## 📝 任务卡存放路径（保留作废记录，勿删）

```
.agents/codex/tasks/p2-task-11-ontology-stats-master-data.md
```
