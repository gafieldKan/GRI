# W4-a 复验报告（助手独立复验，不采信自述）

> 复验人：总负责人（助手） ｜ 时间：2026-10-18 ｜ 被验对象：Codex W4-a 交付
> 结论：**通过（done_verified）**，全部门禁与独立抽查为真。

## 1. 独立复跑结果

| 门禁 | 结果 |
|---|---|
| `bash .agents/codex/outputs/w4a-verify.sh`（助手亲自跑） | **PASS=85 FAIL=0 SKIP=0** |
| services/api `tsc --noEmit` | 0 error |
| 全量 API Jest | **46 suites / 624 tests** 全绿（基线 619，+5 不回归） |
| codegen parity（本体结构块 vs 031 / K12 两 FK） | 一致 |
| 迁移 031 幂等（直接重跑） | 通过 |

## 2. 独立数据核验（绕开作者脚本，直查库）

| 项 | 期望 | 实测 |
|---|---|---|
| 分支总数 / 顶层 | 57 / 53 | **57 / 53** ✓ |
| 顶层峰按学科 | MATH10 PHYS10 CHEM8 BIO9 CHN9 ENG7 | **一致** ✓ |
| clc 空值 | 0 | **0** ✓ |
| 章落位空值 | 0 | **0** ✓ |
| 面积落位空值 | 0 | **0** ✓ |
| 031 登记 `_api_migrations` | 有 | **031_knowledge_branch.sql @ 2026-10-18** ✓ |
| **跨学科错挂**（章/面积的分支学科 ≠ 自身学科） | 0 | **0 / 0** ✓（作者脚本未覆盖，助手补验） |
| k12 区间 | 数据推导 | math.analysis=10-12；math.num=1-11；bio.env=1-12；math.ds=NULL ✓ |

## 3. 独立 API 冒烟（自起隔离实例 :3021）

- 匿名 `summit-branches?subject=MATH` → **10 峰**、threshold=80、**无 mastery 泄漏字段**（实测 `"mastery" in node === false`）；math.num clc=O12、kp=915。
- 匿名 `summit-grades?subject=MATH` → PRIMARY(G1-6)/JUNIOR(G7-9)/SENIOR(G10-12)；章节带所属分支。
- `subject=BIO` → 正常返回；`subject=nosuch` → **404**。
- 现网 3008 未部署该路由（401 未授权，非 404——因现网容器未含新路由），与「改动未部署」一致。

## 4. 代码与安全审读

- controller 身份取 `this.auth(req)?.externalId`；**未触碰 `req.auth.roles`** ✓。
- service 掌握度唯一真源 `edu.mastery_snapshots`；阈值 ≥80；匿名传 `userId=null` 且**不输出 mastery 字段** ✓。
- 白名单两条 GET 为 OptionalAuth 匿名只读；spec 断言非 GET 不放行 ✓。
- 迁移为显式 VALUES（**无 LIKE/ILIKE/默认兜底**）+ 断言门禁（CLC 白名单/峰数/落位率/math.analysis 区间），失败即回滚 ✓。

## 5. 作者脚本真实性

- `w4a-verify.sh` 85 项含真实 curl + 真实 DB + 隔离 API 注册/登录/掌握度写入；非空跑。助手另行独立抽查交叉印证。
- 无 skip 掩盖；无假绿。

## 6. 观察项（非阻塞，记入后续）

- BIO/CHEM 部分顶层峰事实偏少：`bio.micro`/`chem.inorg`/`chem.poly` 面积=0，`phys.app`/`phys.atomol` 等面积亦少。结构上峰在，但 W4-b 展示这些峰应先以结构呈现（后续可补面积或调整粒度）。
- `cheM`/`CHN`/`ENG` 无教材链路 → 无章映射（符合现状）；教师/研究者台账里已记。
- 遗留清理：旧验证实例（PORT=3018，3h+ 前）由助手本次终止；3056/3077 为 root 的 1.5 天前进程，非本次产物，不动。
- Codex 未 commit（合规）；由助手本次统一提交。
