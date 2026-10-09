> ❌ STATUS: VOID (2026-10-10) —— 与 curriculum 的 knowledge-graph/knowledge-map/learning-path 重叠且真源分裂（知识图谱归 curriculum）。作废，勿执行。

# T9 任务卡：`tuition` - 知识图谱 D3/Cytoscape 力导向图 + 掌握度颜色编码

**执行者**：Codex  
**依赖**：T5 完成（练习中心主链路就绪）  
**产出目录**：`services/api/src/modules/tuition/`  
**预估**：1 天

---

## 📋 任务目标

实现 **知识图谱** 可视化数据接口，支撑前端「知识图谱」Tab（D3/Cytoscape 渲染）：

1. **图数据接口**：`GET /api/tuition/knowledge-graph/:externalId` → 返回 `{nodes[], edges[]}`，含知识点层级、前置依赖、掌握度
2. **掌握度颜色编码**：每节点附带 `mastery ∈ [0,1]`，前端按红(0)→黄(0.5)→绿(1) 渲染
3. **交互查询**：`GET /api/tuition/knowledge-graph/:externalId/neighbors?kpId=xxx` → 返回邻居子图（前置/后继/同级）

---

## 📥 必读上下文（按顺序）

| 文件 | 用途 |
|------|------|
| `services/api/src/modules/tuition/tuition.controller.ts` | 现有端点风格，新增知识图谱端点 |
| `services/api/src/modules/tuition/tuition.service.ts` | 现有 `getPracticeStats` 聚合逻辑，复用知识点统计 |
| `services/api/src/modules/tuition/tuition.types.ts` | 需补 `KnowledgeGraphNode`、`KnowledgeGraphEdge`、`GraphQueryDto` |
| `packages/ontology/ontologies/k12/knowledge-map.yaml` | 知识图谱本体 DSL：`KnowledgeArea`、`KnowledgePoint`、`KnowledgeAreaPrerequisite` DAG |
| `services/api/src/modules/ontology/ontology.service.ts` | 本体引擎门面，可查 `KnowledgeAreaPrerequisite` 图 |

---

## 📦 产出物清单

| 文件 | 动作 |
|------|------|
| `services/api/src/modules/tuition/tuition.controller.ts` | 新增 2 个端点：`GET /knowledge-graph/:externalId`、`GET /knowledge-graph/:externalId/neighbors` |
| `services/api/src/modules/tuition/tuition.service.ts` | 新增 `getKnowledgeGraph`、`getKnowledgeGraphNeighbors`，聚合：本体 DAG + 学生掌握度统计 |
| `services/api/src/modules/tuition/tuition.types.ts` | 补全 `KnowledgeGraphNode{id,label,area,mastery,questionCount}`、`KnowledgeGraphEdge{source,target,type}` |
| `services/api/src/modules/tuition/tuition.service.spec.ts` | 新增 8+ 单测：图构建正确性、掌握度计算、邻居查询、空图/孤立节点处理 |
| `.agents/codex/outputs/p2-task-9-file-list.md` | 本任务新增/修改文件清单 |
| `.agents/codex/outputs/p2-task-9-verify.sh` | 自动化验收脚本（见下） |

---

## ✅ 验收标准（硬性）

1. **TypeScript 编译通过**：`npm run build` 0 error
2. **单测全绿**：`npm run test -- src/modules/tuition/tuition.service.spec.ts` 全部通过（目标 ≥ 50 tests 含原有）
3. **端到端验证脚本通过**：运行 `bash .agents/codex/outputs/p2-task-9-verify.sh` 输出 `全绿：PASS=X FAIL=0`
4. **图结构正确**：
   - 节点 = `edu.knowledge_points`（或本体 `KnowledgePoint`），含 `area` 分组
   - 边 = `KnowledgeAreaPrerequisite`（前置依赖）+ 隐式同级边（同 Area）
   - 无环（DAG 验证）
5. **掌握度计算**：`mastery = correct_attempts / total_attempts`（分母≥3 才计算，否则 `null` 灰色）
6. **性能**：全图 ≤ 500 节点，响应 ≤ 500ms（Redis 缓存 10min）

---

## 🧪 验收脚本 `task-9-verify.sh` 规范

```bash
#!/usr/bin/env bash
# T9 自动化验收：知识图谱数据接口
set -uo pipefail
API_BASE="${API_BASE:-http://localhost:3008/api}"

# 1. 学生完成若干练习 → 产生掌握度数据
# 2. GET /knowledge-graph/{externalId} → {nodes:[], edges:[]}
# 3. 校验：nodes.length > 0，每节点含 mastery(0-1 或 null)、area、questionCount
# 4. 校验：edges 来源于 KnowledgeAreaPrerequisite，无自环、无重复
# 5. 校验：DAG 无环（拓扑排序可行）
# 6. GET /knowledge-graph/{externalId}/neighbors?kpId=KP001 → 子图含前置/后继
# 7. 无掌握度数据的新生 → 所有节点 mastery=null
# 8. 越权：A token 查 B 图谱 → 403
```

---

## 🔐 关键实现细节

| 点 | 要求 |
|----|------|
| 本体数据源 | `ontology.knowledge_area_prerequisite` 表（codegen 生成），DAG 结构 |
| 掌握度聚合 | `tuitionService.getPracticeStats` 已按 KP 聚合正确率，直接复用 |
| 缓存键 | `kgraph:{externalId}:v{ontology_version}`，本体版本变更自动失效 |
| 节点 ID | 统一用 `kp:{code}` 格式，前端 Cytoscape 直接用 |
| 边类型 | `'prerequisite' \| 'same_area'`，前端不同样式渲染 |

---

## 📝 任务卡存放路径

```
.agents/codex/tasks/p2-task-9-knowledge-graph.md
```