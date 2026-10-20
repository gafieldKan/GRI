# W5-a 学习链数据审计

> 审计日期：2026-10-19
> 范围：`GET /api/curriculum/learning-chain?subject=MATH&branch=math.num`
> 真源：`edu.knowledge_points`、`ontology.*` 课程结构、`ontology.kp_prerequisite`、`edu.mastery_snapshots`

## 1. 纯派生决策

本卡采用**纯服务内派生**，没有创建 `ontology.learning_edge`，没有修改本体 YAML，也没有创建迁移 032。

理由：

- 课程结构已完整保存在两层 `ontology.textbook_chapter`、`ontology.textbook`、`ontology.grade` 与 `edu.knowledge_points.code` 中，骨干顺序可以稳定推导。
- canonical 显式前置保存在 `ontology.kp_prerequisite`；个人掌握度保存在 `edu.mastery_snapshots`。新增物化边表不会增加新真源，只会引入双写和失效风险。
- 当前数据量按 `subject + branch/grade` 切分后可直接计算；端点禁止无界请求，避免 2,908 KP 全量载荷。
- 迁移 032 与迁移幂等性因此为 **N/A**。验证脚本会断言 `ontology.learning_edge` 不存在。

## 2. 权威口径

| 数据项 | 实测 |
|---|---:|
| `edu.knowledge_points` | 2,908 |
| `ontology.kp_prerequisite` | 3,377 |
| `edu.knowledge_points.prerequisites` 非空 JSONB 行 | 22 |
| JSONB 字符串引用 | 25 |
| JSONB 可唯一精确匹配 `legacy_id` 或 `code` 的引用 | 17 |
| 上述匹配目标同时具备 `code` 与 `chapter_id` | 0 |
| `edu.mastery_snapshots` | 11 |
| `edu.achievements` | 0 |

显式前置方向以 canonical 表为准：`from_kp = 学习者`，`to_kp = 前置`。API 输出反转为 `前置 -> 学习者`。

JSONB 采用无模糊匹配的精确字符串比较，仅在引用能唯一命中同一受限数据源时生成边。当前 `math.num` 可用数据中，17 个可全局解析的 JSONB 目标均没有 `code` / `chapter_id`，因此不能进入节级课程链；这里不声称 22 条 JSONB 全被 `learning-chain` 消费。它们仍可在 `kp-cave?kpId=` 中作为该 legacy KP 的显式前置被精确返回，验证脚本会取一个真实 legacy KP 断言这一点。`math.num` 课程链的显式边来自 3,377 条 canonical 前置。

## 3. `math.num` 边型统计

| 指标 | 结果 |
|---|---:|
| 节点（节） | 144 |
| 知识点 | 915 |
| 边总数 | 1,456 |
| `explicit` | 1,058 |
| `seq` | 392 |
| `soft` | 6 |
| soft 占比 | 0.41% |
| `reason` 缺失 | 0 |
| 相邻节点断链 | 0 |
| 非法 soft 方向 | 0 |
| 年级顺序倒退 | 0 |
| 匿名 `mastery` 键 | 0 |

说明：

- `explicit` 为最高优先。同端点的 `seq` 不重复生成。
- `seq` 只在同一年级内按「册 → 章 → 节 → `kpNN`」串联，不跨年级编造硬顺序。
- `soft` 仅连接同分支相邻年级的骨架邻点，reason 固定包含“引导性”和“非精确前置”。它是视觉传导提示，不是课程前置断言。

## 4. 连续性与顺序证据

对 `math.num` 的每个相邻节点检查“前一节末 KP → 后一节首 KP”必须存在一条边，求得断链数为 **0**。

- 首节点：`math.g1.pep.ch01.s01`
- 末节点：`math.g7b.pep.ch06.s03`
- 年级序列：`G1 → G2 → G3 → G4 → G5 → G6 → G7`
- 节点内 KP 按 `kpNN` 尾号升序，重复节点/知识点为 0。
- 匿名 response 的所有节点/知识点均为 `dim`，且递归不存在 `mastery` 键。

样例链：

```text
math_quadratic_function -> math_linear_function              (explicit)
math_pythagorean -> math_triangle, math_square_root          (explicit)
math.g1.pep.ch01.s01.kpNN -> math.g1.pep.ch01.s02.kp01       (seq / 同年级课程序列)
G1 末节末 KP -> G2 首节首 KP                                  (soft / 引导性非精确前置)
```

最后两类边的具体 code 会随数据版本变化；审计脚本按真实 response 动态确认方向和 reason，不硬编码错误来源。

## 5. 章降级覆盖

节点规则是：有子节的章以子节为节点，章本身不再重复承载该章 KP；没有子节但有 KP 的章降级为 `unit='chapter'`。

当前实库：

- 有 KP 且无子节的根章：0。
- 有 KP 的子节：2,873。

因此当前 `math.num` 和有 KP 的规则型课程数据不会触发章降级。该兜底路径由 `learning-chain.spec.ts` 使用“无父章的第三章”单测覆盖，不能把“实测未触发”说成“路径未实现”。

## 6. 掌握度与洞窟

- 掌握度唯一真源：`edu.mastery_snapshots`；`>=80` 为 `lit`，低于 80 为 `half`，无数据为 `dim`。
- 匿名：`learning-chain` 与 `kp-cave` 均无 `mastery`；洞窟无 `wrongQuestions` / `reviews` / `achievements`。
- 登录：chain 在节点与 KP 层输出 mastery；洞窟输出知识点 mastery、错题 due/items、复习 due/items、成就 count/items。
- 错题与复习的 `due` 由窗口计数返回真实总数，不受 `LIMIT 20` 的 items 截断影响。

## 7. 验证结论

`bash .agents/codex/outputs/w5a-verify.sh` 覆盖：

- TypeScript、聚焦 Jest、全量 Jest 基线、API build。
- 真实 API 的有界 `math.num`、`grade=G1`、无界请求 `400`、匿名 `kp-cave`。
- 边型齐全、reason 非空、soft 方向与文案、相邻断链为 0、匿名递归无 mastery。
- 登录 service 直调具有 mastery 与个人洞窟聚合。
- 既有 `summit-branches` / `summit-grades` 与旧容器的响应字节对拍。
- 迁移 032 / `ontology.learning_edge` 为 N/A。

脚本末行严格输出 `FAIL=0`。
