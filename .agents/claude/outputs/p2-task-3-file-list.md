# P2-T3 文件清单（身份全生命周期端到端契约 + `external_id ≡ users.id` 契约测试）

分支：`feat/stage-c-unified-auth-shell`｜执行者：Claude（验证工程师）｜日期：2026-10-10

## 设计决策（作 T3 与旧卡差异说明）

| 决策 | 取值 | 理由 |
|------|------|------|
| 统一脚本形态 | **上层 orchestrator**（增量整合，非重写） | 既有 T1/T2 脚本已验证为绿（PASS=20 / PASS=88），按「积分器」模式复用：新 §T3 契约段 + `run_suite` 聚合两个既有套件。避免复制 T1/T2 逻辑造成双真源漂移。 |
| 契约测试实现层 | **进程内行为断言 + 跨包源码锚** | `@gri/jwt-verifier` 与 auth-center 是 ESM 包，services/api 的 Jest 跑 CJS（ts-jest），直接 import 会 `Cannot use import statement outside a module`（既有中间件 spec 因此 mock 掉 verifier）。跨包契约无法进程内 import，故：业务侧（IdentityService/Controller）用**真实代码行为断言**；签发/映射两个跨包表达式用**源码漂移锚**（表达式一旦被改写即红）。 |
| 入口 vs 主体 | `*-verify.sh` = 稳定入口别名，`exec` 统一主体 | 满足「入口或复用说明」；任何验证方只调入口即可拿到标准 `PASS=… FAIL=0 VERIFY_EXIT=…` 行。 |

## 新增文件（本卡全部改动——**未修改任何生产代码**）

| 文件 | 动作 | 说明 |
|------|------|------|
| `.agents/claude/outputs/p2-task-3-e2e-identity-lifecycle.sh` | 新增 | **统一端到端主体**：§0 预检 → §T3 全生命周期+契约锚（29 断言）→ `run_suite` 复用 T1（20）/T2（88）→ 聚合输出。幂等（§T3 用 `时间戳_RANDOM` 后缀；psql 取值 `head -n1 \| tr -d` 清洗；`ck_users_role` 预检）。 |
| `.agents/claude/outputs/p2-task-3-verify.sh` | 新增 | 稳定入口：`exec` 统一主体，保证标准输出行。 |
| `services/api/src/modules/identity/identity.contract.spec.ts` | 新增 | **契约 spec**（独立文件）：A 签发侧 / B 校验侧 / C 业务侧 / D 控制器链 / E 反例锚，共 18 用例，全绿。 |

> 未改动：`identity.service.ts`、`identity.controller.ts`、`identity.types.ts`、`public-routes.ts`、迁移 SQL、auth-center 任何文件。

## §T3 契约段 ↔ 任务卡 6 条硬性契约断言映射

| 任务卡断言 | T3 段断言（脚本输出标签） |
|------------|---------------------------|
| 1. 注册建 users 行；`identities.external_id == users.id` | `T3.1 public.users row persisted` + `T3.1 identities.external_id == users.id (cross-db)` |
| 2. JWT：`sub = identity.id`；`externalId = users.id`；`externalId != sub` | `T3.2 JWT.sub == identities.id` + `T3.2 JWT.external_id == public.users.id` + `T3.6 ANCHOR: external_id != sub` |
| 3. `GET /identity/me` → `user.id == externalId` | `T3.3 /me user.id == external_id` |
| 4. student 时 `edu.students.user_id == externalId`（三表贯通） | `T3.4 /me student.user_id == external_id` + `T3.4 three-table linkage: users.id == students.user_id` |
| 5. 伪造 externalId 读他人 → 403/404 | `T3.5 non-operator reads other's profile blocked (403)` + `…random externalId blocked (403)` + `T3.5 anonymous … blocked (401)` |
| 6. 反例锚：`external_id != sub` | `T3.6 ANCHOR: external_id != sub (未退化为 identity.id)` |

附加：`T3.2 JWT.roles stays []`（授权不依赖 roles 的架构锚）；`T3.3 /me` 缺/坏 token → 401；`T3.5 self profile … (sanity)`（证明 403 来自「他人」判定而非一律拒绝）。

## 契约 spec 用例 ↔ 全链路四段

| 段 | 用例 | 验证点 |
|----|------|--------|
| A 签发侧（auth-center 源码锚） | A1–A4 | `sub=identity.id`、`external_id=identity.externalId`、`roles:[]`、反例锚（不得写 `external_id: identity.id`） |
| B 校验侧（jwt-verifier 源码锚） | B1–B3 | `externalId: payload.external_id ?? payload.sub ?? null`、反例锚（不得直接取 `payload.sub`）、双路径都命中 |
| C 业务侧（真实 `IdentityService`） | C1–C3 | 同一 externalId 同键 thread 到 `public.users.id` 与 `edu.students.user_id`；非 student 不触达 students |
| D 控制器链（真实 `IdentityController`） | D1–D3 | `/me` 用 `req.auth.externalId`（非 sub）；externalId 缺失 → 403，不以 sub 兜底 |
| E 反例锚（模型，B 锚锁规则） | E1–E4 | `external_id===sub` / 缺失 → 判违约抛出；模型规则 == B 源码锚 |
| 辅助 | 1 | externalId 键查无 → 404 |

## 自检命令与结果

```sh
# 契约 spec（单跑）
cd services/api && npx jest identity.contract.spec   # → 1 suite / 18 tests 全绿
# 全量 api 回归 + 类型
cd services/api && npx jest                          # → 26 suites / 388 tests 全绿（原 370 + 18）
cd services/api && npx tsc --noEmit                  # → 0 errors
# 端到端（统一入口，幂等连跑两次）
bash .agents/claude/outputs/p2-task-3-verify.sh      # → PASS=137 FAIL=0 VERIFY_EXIT=0（连跑两次一致）
```

拆分计数：§T3 段 **29** + T1 **20** + T2 **88** = **137**；`FAIL=0`。

## 已知说明

- T2 脚本的 `G3` 会再执行一次 T1（回归保险），故 T1 实际被跑两次；聚合计数按「显式 20 + T2 内 1（G3 单条）」，无重复计数（G3 计 1 条，不展开 T1 的 20 条）。
- §T3 段的 403 断言对非运营读他人/随机 UUID 期望 `403`（控制器先鉴权后查存在性）；脚本以 `403|404` 容忍，兼容实现微调。
