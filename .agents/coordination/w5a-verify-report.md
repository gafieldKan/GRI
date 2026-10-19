# W5-a 独立复验报告（编排者，不采信自述）

> 对象：W5-a 学习链数据面（Codex 产出，改动全在工作树，HEAD 未动 = `ba9e07a`）
> 复验人：OpenClaw 助手（架构师 + 独立复验者）
> 结论：**done_verified**（无阻塞缺陷；2 条非阻塞观察项，已转 W5-b 约束）

## 1. 复验方式（独立，非采信作者脚本）

| # | 手段 | 结果 |
|---|---|---|
| 1 | 亲自执行作者脚本 `.agents/codex/outputs/w5a-verify.sh` | **PASS=45 FAIL=0 SKIP=0**；全量 Jest **47 suites / 636 tests**（基线 624，+12 不回归）；tsc 0 |
| 2 | 自起**全新 API 实例**（:3111，独立于作者脚本端口）打真实 DB，匿名/边界探针 | 见 §2 |
| 3 | 直调 `CurriculumService`（绕 HTTP，绕过 controller 装饰）验证登录叠加层 | 见 §3 |
| 4 | DB 直查对拍：KP 数 / canonical 前置 / 分支归属 / 自环 / JSONB | 见 §4 |
| 5 | 代码审读：身份、隐私、边分型、自我环过滤、绑定条件、白名单 | 见 §5 |
| 6 | 卫生：HEAD 未动 / 无水印凭据 / diff 纯新增 | 见 §6 |

## 2. 我的 HTTP 探针（自起实例 :3111）

| 用例 | 期望 | 实测 |
|---|---|---|
| 匿名 `learning-chain?subject=MATH&branch=math.num` | 200 | **200** |
| 匿名 `learning-chain?subject=MATH&grade=G1` | 200，仅 G1 | **200**，nodes=40，grades 仅 `G1` |
| 无界 `?subject=MATH`（无 branch/grade） | 400 | **400** |
| `subject=NOSUCH` | 404 | **404** |
| `grade=99` | 400 | **400** |
| 匿名 `kp-cave?kpId=<真实>` | 200，仅公开字段 | **200**，keys=[kp,state,prerequisites,questions,next] |
| `kp-cave` 未知 UUID | 404 | **404** |
| `kp-cave` 非 UUID | 404 | **404** |

**我的统计**（与作者脚本同值，独立算出）：

```
nodes=144  kps=915  edges=1456
kinds={explicit:1058, seq:392, soft:6}   soft 占比 0.41%
summary={total:144, lit:0, next:"math.g1.pep.ch01.s01"}
adjacentBreak=0   gradeBackward=0   duplicates=0
badState=0  emptyReason=0  softBad=0  masteryLeak=false
units=["section"]
```

## 3. 登录叠加（直调 service，uid `a000…0001`）

- `learningChain` 带 `userId`：`hasMastery=true`，`litNodes=1 / halfNodes=2 / litKps=4`，`summary.lit=1`（与 DB 11 条快照中落在 math.num 的结果一致）。
- `kpCave(math.g10.pep.ch01.s01.kp05, uid)`：`mastery=100, state="lit"`，含 `wrongQuestions/reviews/achievements`，`reviews.due=1`（DB sr_queue 有到期行）。
- **同一 kpId 匿名**：keys 无 mastery / 无三个个人字段 → **隐私无泄漏**。

## 4. DB 对拍（关键承重数字）

| 项 | 复验值 | 与作者断言 |
|---|---|---|
| `edu.knowledge_points` 总数 | **2908** | 一致 |
| `ontology.kp_prerequisite` 总数 | **3377** | 一致（**远超** JSONB 22 → 链的燃料充足） |
| JSONB 非空行 | **22** | 一致 |
| canonical 自环 | **2**（`phys.g8b.pep.ch11.s03.kp04/kp05`） | 已被 `edge.from !== edge.to` 过滤，未入链 |
| `edu.mastery_snapshots` | 11 | 一致 |
| `edu.achievements` | 0 | 一致 |
| `math.num` published KP（DB 直查） | **915** | **= 链中 kps 915（完全对齐）** |
| `ontology.learning_edge` | 不存在 | 与"纯派生/迁移 032 N/A"一致 |

**canonical 方向**（SQL 直查样例）：`from_kp=学习者 / to_kp=前置`；API 输出已反转为 `前置 → 学习者`。例：`认识上下方向 → 用上下前后描述两个物体的相对位置`（explicit）。

**JSONB 精确匹配口径**：`resolveJsonbPrerequisites` 只接受**唯一命中**（`matches.length === 1`）的字符串引用，且**拒绝模糊匹配**（无 LIKE/ILIKE/默认兜底）。作者据此声明 17 个可解析引用目标均无 `code/chapter_id` → 不进节级链，只在 `kp-cave` 显式返回。**认可此口径为诚实边界**（不谎称消费 22 条）。

## 5. 代码审读要点（全部通过）

- 身份：`req.auth.externalId`，**未触碰 `req.auth.roles`**（grep 0 命中）。
- 掌握度唯一真源 `edu.mastery_snapshots`、阈值 `>=80`；匿名**递归**无 mastery 键（两种深度都递归扫过）。
- 端点强制 `subject` + (`branch` 或 `grade`) 至少一个，否则 400；grade 限定 `G1–G12`，越界 400。
- 边分型：`explicit`（canonical > JSONB 唯一命中，优先级正确）/ `seq`（**仅同一年级**，不跨年级编造硬顺序）/ `soft`（**仅同分支跨年级邻点**，reason 固定含「引导」+「非精确前置」）→ **不误导，兑现设计红线**。
- 洞窟：`next` = 链中下一节，`firstKp` 给洞内首个知识点；登录才叠加错题/复习/成就，`due` 用窗口计数**不受 LIMIT 20 截断**。
- 白名单：两条新 GET 走 OptionalAuth 匿名只读；`public-routes.spec.ts` 覆盖「匿名可 GET / 非 GET 不放行 / 子路径不放行」。
- diff **纯新增**：6 文件 `780 insertions(+), 2 deletions(-)`，唯一删除行是 controller/service 的 import 行调整 → **未改动既有 summit/knowledge/learning-path 契约**。

## 6. 卫生

- HEAD 仍 `ba9e07a`，未 commit / 未 checkout（作者合规）。
- 作者 verify.sh 内 `DB_PASSWORD=:-postgres` 是**本地开发容器默认值**（容器 env 即 postgres），非真实凭据泄漏；无 env 文件进 diff；产出物无密钥字样。

## 7. 非阻塞观察项（转 W5-b 约束）

1. **未知分支返回 `200 + nodes:0`**（非 404）。读面带语义上可接受，但 W5-b **必须**做空态兜底（卡 N8 已要求），并把「分支无链」纳入首屏兜底测试。
2. 3 条 mastery 快照指向 `code IS NULL` 的 legacy KP → 永不出现在链上（数据事实，非缺陷）。`kp-cave` 仍可为这些 kpId 返回显式前置（作者已用真实 legacy KP 断言 JSONB 路径可达）。

## 8. 结论

W5-a **done_verified**。数据面成立：链=节（459 级）、kps 洞内展开、三类边（explicit/seq/soft）分型诚实、掌握度隐私分层正确、老端点零回归、测试 +12。

**下一步**：由用户下达 `.agents/claude/dispatch/w5-b-prompt.md`（W5-b UI）。
