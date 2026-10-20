# W5-a 学习链数据面 — 交付清单

> 分支：`feat/stage-c-unified-auth-shell`（改动留在工作树，未 commit / 未 checkout）
> 任务：W5-a 学科登顶 v4 只读数据面
> 结构决策：纯服务内派生，不新增 `ontology.learning_edge`，因此迁移 032 为 **N/A**
> 输出文件：本清单、`w5a-verify.sh`、`w5a-chain-audit.md`

## 1. 变更文件

### 新增

| 文件 | 说明 |
|---|---|
| `services/api/src/modules/curriculum/learning-chain.ts` | 纯函数推导器：`buildBranchChain`、`buildSoftEdges`、JSONB 显式前置精确解析；节点 = 节，无子节章降级 |
| `services/api/src/modules/curriculum/learning-chain.spec.ts` | 推导器单测：排序、章降级、显式优先、JSONB 精确匹配、soft 跨年级方向与 reason |
| `.agents/codex/outputs/w5a-verify.sh` | 自包含复验：类型检查、聚焦/全量 Jest、构建、真实 API、匿名隐私、登录掌握度、旧端点对拍、迁移 N/A |
| `.agents/codex/outputs/w5a-chain-audit.md` | `math.num` 边型统计、soft 占比、断链/乱序/原因证据、样例链与数据口径 |
| `.agents/codex/outputs/w5a-file-list.md` | 本交付清单 |

### 修改

| 文件 | 说明 |
|---|---|
| `services/api/src/modules/curriculum/curriculum.service.ts` | 新增受 `subject + branch/grade` 限定的数据切片加载、`learningChain` 派生与 `kpCave` 只读聚合；登录才叠加掌握度与个人闭环 |
| `services/api/src/modules/curriculum/curriculum.types.ts` | 新增学习链、洞窟、边、节内 KP 与个人聚合响应类型 |
| `services/api/src/modules/curriculum/curriculum.controller.ts` | 新增 `GET learning-chain`、`GET kp-cave`；身份仅取 `req.auth.externalId` |
| `services/api/src/auth/public-routes.ts` | 两条新 GET 加入 OptionalAuth 公开读白名单 |
| `services/api/src/auth/public-routes.spec.ts` | 覆盖新路由可匿名 GET，非 GET/子路径不放行 |
| `services/api/src/modules/curriculum/curriculum.service.spec.ts` | 覆盖限定条件、匿名隐私、登录掌握度、显式/seq/soft 边、洞窟聚合与非法 kpId |

## 2. 数据面契约

### `GET /api/curriculum/learning-chain?subject=&branch=&grade=`

- `subject` 必填，`branch` 或 `grade` 至少一个，否则 `400`。
- `nodes[]` 的学习单元为节；无子节的章降级为 `unit='chapter'`。
- 节点内 `kps[]` 按 `kpNN` 精确尾号排序。
- 边型：
  - `explicit`：canonical `ontology.kp_prerequisite` 优先，JSONB 仅接受可唯一精确解析的字符串引用。
  - `seq`：同年级内按「册 → 章 → 节 → kp」序列串联。
  - `soft`：同分支跨年级骨架邻点，reason 明确“引导性、非精确前置”。
- 匿名响应递归不含 `mastery` 键；登录按 `edu.mastery_snapshots`、阈值 `>=80` 输出 `dim|half|lit`。

### `GET /api/curriculum/kp-cave?kpId=`

- 只读返回知识点、三态、显式前置、公开题入口、下一节。
- 登录后额外返回 `mastery`、错题 due/items、到期复习 due/items、成就 count/items。
- 匿名递归不含 `mastery`，且不含个人聚合字段。

## 3. 未做与边界

- 不建表、不写迁移 032、不修改本体 YAML；理由是课程结构已能完整派生且个人状态已在 `edu.mastery_snapshots`。
- 不改既有 `summit-*`、`knowledge-*`、`learning-path` 响应契约。
- 不包含 W5-b UI，不重启现有 `gri-api` 容器。
- 不 commit / 不 checkout；用户对任务卡和 v4 设计文档的既有修改保持原样。
