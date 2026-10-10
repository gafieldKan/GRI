# P2-T2 风险与回滚

> 配套主设计：`p2-task-2-identity-operator-authz-design.md`
> 范围：identity 运营管理面（list / role / status）+ 授权底座替换 + 修正 `GET /:id` 死代码 + 迁移 019。

---

## 1. 风险登记（按严重度降序）

### R1 —— 提权面：运营端点暴露 PII + 角色/状态写权 🔴 高

| 项 | 内容 |
|----|------|
| 风险 | 三端点能枚举全量身份（email/phone）、改任意人 role/status。若授权门被绕过 → 全站提权/批量锁号。 |
| 缓解 | ① 唯一授权门 `assertSiteOperator`（根组织 owner\|admin），**不**信 `req.auth.roles`；② actorId **只**取 `req.auth.externalId`，禁 body/query；③ 端点**不**入 `public-routes.ts` → 未登录自动 401；④ 自身保护：运营**不能**改自己（§6.1），防自锁/自权；⑤ role/status 闭集 + 库侧 CHECK 双门禁。 |
| 残留 | 单运营可改任意他人 → 无「双人审批」。**接受**（当前仅一名根 owner，双人制衡超范围）；记为后续（审计 + 双人审批可选）。 |
| 验证 | 断言 A2/A4/A5/A6、B1/B2。 |

### R2 —— 跨库状态同步的最终一致性 🟠 中

| 项 | 内容 |
|----|------|
| 风险 | `status` 变更是「auth-center 远程调用 + 本库写」两段，无分布式事务。可能出现：凭证已停/启而业务行未改（或反之）。 |
| 缓解 | ① **预检先行**：先 `SELECT ... WHERE id=$1 AND deleted_at IS NULL`，不存在则 404 **在副作用前短路**；② **紧则先停**：`deleted/suspended` 先调 auth-center（失败→502）再写库 → 失败时**零部分写**；③ auth-center 停用/启用**幂等**（`UPDATE ... WHERE external_id=$1`，0 行当成功）；④ 残余窗口（预检后→写库前的进程崩溃）概率极低；运营可**重试**（幂等）或用 `active` 反向启用。 |
| 残留 | 无法 100% 原子。**接受**（无 2PC 基础设施；与 T1 `deleteProfile` 同策略，已验证 e2e）。 |
| 验证 | 断言 D2、D7（auth-center 未因 404 短路被调用）。 |

### R3 —— 授权底座替换：回归炸点 🟠 中

| 项 | 内容 |
|----|------|
| 风险 | 删 `READ_ANY_ELEVATED_ROLES` 会**改 `GET /:id` 既有语义**；现有 `identity.controller.spec.ts:52-89` 三例依赖旧死代码 → 若不改，测试**回归红**。 |
| 缓解 | ① 实现卡**必须同步重写**该三例（§8.3）；② 新增 C6/C7/C8 断言新语义（运营放行 / 非运营 403 / 本人豁免）；③ 跑 `npm run test:api` 全绿为准。 |
| 影响面 | 仅 identity 模块 + 其 spec；`ReqAuth.roles` 删除后若有别处引用 → tsc 报错暴露（grep 已确认仅本文件用）。 |
| 验证 | C6/C7/C8 + G2；`tsc --noEmit` 0 err。 |

### R4 —— 迁移 019（`ck_users_role`）🟡 低

| 项 | 内容 |
|----|------|
| 风险 | 加 CHECK 若库内已有越界 role → 迁移失败。 |
| 缓解 | 实测现值仅 `consumer`/`student`（均在闭集）→ 无越界；迁移**幂等**（`pg_constraint` 探测，对齐 017）；可选加「越界预检 RAISE」给出定位。 |
| 纪律 | **先 build 再 migrate**（SQL 经 nest-cli assets 拷到 `dist/migrate/`，runner 读 dist；未 build → 新 .sql 不在 dist → 永不执行，静默失效）。 |
| 回滚 | 见 §2.4（`DROP CONSTRAINT` 幂等）。 |
| 验证 | C5。 |

### R5 —— 分页/筛选 fail-fast 过严 🟡 低

| 项 | 内容 |
|----|------|
| 风险 | `pageSize>100`/`page<1` 现在 **400**（而非静默钳制）；若有旧客户端传 `page=0` → 报错。 |
| 缓解 | 这是**新**端点，无既有客户端；portal 运营页按契约实现。fail-fast 是本卡红线选择。 |
| 验证 | C4。 |

### R6 —— 自身保护导致「无运营可用」🟡 低

| 项 | 内容 |
|----|------|
| 风险 | 若系统只有一名运营（根 owner），自身保护使其**无法**停用/删除自己 → 该能力实际不可达。 |
| 缓解 | 设计的**预期**行为（防自锁）：注销/降权自己应走**他人**操作或专门的退场流程。软删自己仍有 `DELETE /api/identity/me`（T1）。 |
| 验证 | B1/B2。 |

### R7 —— 语义漂移：`suspended` 停凭证的认知差 🔵 提示

| 项 | 内容 |
|----|------|
| 风险 | 有人以为 `suspended` 仅置业务标记、不影响登录；实际**停凭证即登出**（F8）。 |
| 缓解 | 设计 §5.1/§5.2 明写；补 `enable` 使恢复闭环；文档 + 契约表状态迁移表显式列出。 |
| 验证 | D4/D5。 |

---

## 2. 回滚策略（按层）

### 2.1 代码回滚（首选）

- 全部改动在**单分支** `feat/stage-c-unified-auth-shell`、**单提交**（实现卡要求）。
- 回滚 = `git revert <impl-commit>` → 恢复「无 list/role/status 端点、`GET /:id` 旧语义」。
- **无数据破坏性**：端点删除不影响既有数据；`UPDATE identity.controller.spec.ts` 一并 revert。

### 2.2 迁移 019 回滚

- 前向幂等已给；反向（若必须）：

```sql
BEGIN;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS ck_users_role;
COMMIT;
```

- 说明：`DROP ... IF EXISTS` 幂等；删约束**不**影响既有数据（仅取消库侧门禁）。回滚后 role 校验降级为**仅应用层**。

### 2.3 运行时熔断（不部署也可用）

- 若新端点线上异常：因**未入白名单 + 未接前端入口**，普通请求路径**零**触达；可直接不暴露 portal 入口 → 影响面≈0。
- 授权门异常（`assertSiteOperator` 抛非预期）→ 表现为 403（fail-closed，**安全方向**：宁可拒绝不误放）。

### 2.4 数据回滚（若误改）

- 误改 role：`UPDATE public.users SET role='<原值>' WHERE id=...`（记审计；注意 `ck_users_role` 仍约束合法值）。
- 误 suspend：`PATCH .../status {active}` → 经 `enable` 恢复凭证。
- 误 delete：**不可经本卡端点复活**（§5.5，404）。复活需专门的跨库重建流程（auth-center 重建 identity + 清 `deleted_at`）——记为**后续卡**（本卡不含）。

---

## 3. 上线前置检查（Codex/验证方）

- [ ] `cd services/api && npm run build && npm run migrate`（**先 build**）→ `019` 已应用且 `ck_users_role` 存在。
- [ ] `cd services/auth-center && npm run build && npm run migrate`（enable 端点就绪，无迁移改动则确认无漂移）。
- [ ] `npm run tsc`（api）×0 err。
- [ ] `npm run test:api` 全绿（含重写后的 identity specs）。
- [ ] `cd services/auth-center && npm test` 全绿（enable 用例）。
- [ ] T3 冒烟脚本 `p2-task-2-verify.sh` PASS/FAIL 达标（基线 T1=20，新增 T2 断言集）。
- [ ] `public-routes.ts` 无 `/identity` 新增（G1）。
- [ ] 回归：T1 `p2-task-1-verify.sh` 仍 PASS=20（G3）。

---

## 4. 未决 / 移交

| # | 事项 | 归属 |
|---|------|------|
| H1 | 运营操作**审计日志**（who changed whom's role/status when）——本卡未含（`tenant.organization_audit_logs` 仅覆盖组织域；identity 面无审计表）。建议 T2b 或独立卡。 | 后续 |
| H2 | **删除账号复活**流程（跨库重建 identity + 清软删） | 后续 |
| H3 | `suspended` 的**期限/自动恢复**（临时封禁）与登录提示区分 | 后续 |
| H4 | 双人审批（防单运营独断） | 后续（视运营规模） |
| H5 | `suspended/deleted` 与 auth-center 状态的**对账**巡检（一致性守护） | 后续 |
