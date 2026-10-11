# P2-T10 产出清单：organization 邀请鉴权缺口 + 审计分页/筛选（增量补齐）

- **任务卡**：`.agents/claude/tasks/p2-task-10-organization-member-invitation-audit.md`（REWRITTEN 版）
- **执行者**：Claude ｜ **分支**：`feat/stage-c-unified-auth-shell` ｜ **日期**：2026-10-11
- **性质**：**增量补齐**（模块既有 ~24 端点，未重建任何端点、未新建 module、无 DB 迁移）

---

## 1. 改动文件清单（N7：作用域仅 `services/api/src/modules/organization/` + outputs）

| # | 文件 | 动作 | 行数 | 说明 |
|---|---|---|---|---|
| 1 | `services/api/src/modules/organization/organization.service.ts` | 改 | +145/−56 | ① `listInvitations` 加门禁 + 筛选/分页 ② `getAudit` 重写（分页+筛选+total）③ 新增 3 个内部工具 |
| 2 | `services/api/src/modules/organization/organization.controller.ts` | 改 | +55/−12 | ① `GET :id/invitations` 传 `externalId` + 查询参数 ② `GET :id/audit` 接 6 个查询参数 ③ `intQuery` 解析助手 |
| 3 | `services/api/src/modules/organization/organization.types.ts` | 改 | +38 | 新增 `InvitationListQuery` / `AuditLogEntry` / `AuditQuery` / `AuditPage`（纯接口） |
| 4 | `services/api/src/modules/organization/organization.service.spec.ts` | 改 | +219/−6 | 新增 18 例（邀请门禁 7 + 审计分页/筛选 11），改写 2 例适配新签名 |
| 5 | `services/api/src/modules/organization/organization.controller.spec.ts` | 改 | +101/−13 | 新增 8 例（审计 4 + 邀请 4），改写 1 例适配新签名 |
| 6 | `.agents/claude/outputs/p2-task-10-verify.sh` | 新增 | 新文件 | 三段式验收脚本（jest / 离线 harness / 活体 E2E） |
| 7 | `.agents/claude/outputs/p2-task-10-file-list.md` | 新增 | 本文件 | 产出清单 |

`git status --short` 仅上述 6 处（5 改 + 2 新），**未裹挟在途改动**（N7 ✓）。

---

## 2. 两件真缺口：改前 / 改后

### ① 邀请清单鉴权缺口（安全）

```ts
// 改前（controller :202）：任何「登录用户」皆可枚举任意组织邀请
invitations(id) { return this.organizationService.listInvitations(id); }

// 改后
invitations(req, id, status?, limit?, offset?) {
  return this.organizationService.listInvitations(this.externalId(req), id, {...});
}
// service :512 —— fetchOrg 后 assertRole(actorId, orgId, { ownerOnly: false }) → 非 owner/admin 一律 403
```

- 门禁必须的**先于**数据查询：403 时**不产生任何** `FROM tenant.organization_invitations` 查询（有测试锚定）。
- 实测对照（活体）：operator(根 owner) → `200`；一次性非成员用户 → **`403 {"message":"你不是该组织成员"}`**（修复前为 200 裸数据）。
- 白名单复核：`src/auth/public-routes.ts:40` 只放行 `/organizations/<显式UUID>` 详情，`/:id/invitations` **不在**公开白名单 → 全局鉴权 + 本次组织级门禁双重覆盖。

### ② 审计日志分页/筛选（`service.ts:672`）

| 维度 | 改前 | 改后 |
|---|---|---|
| 分页 | 仅 `limit` | `limit`（默认 50，钳 1..200）+ `offset`（钳 0..1e6） |
| 筛选 | 无 | `action` / `entityType` / `actorId` / `from` / `to`（精确匹配 + 时间范围） |
| 总数 | 无 | `total`（过滤后 COUNT，与分页共用同一 WHERE/params 前缀 → 同口径） |
| 排序 | `created_at DESC` | `created_at DESC, id DESC`（补 tiebreaker → 分页稳定不跳行/重行） |
| 返回值 | 裸数组 | `AuditPage { rows, total, limit, offset }` |

**参数化**：所有筛选值一律 `$n` bind，SQL 文本零拼接（注入串实测仅作字面值：`?action=member.add' OR '1'='1` → `total=0`、无报错）。
**fail-fast**：`actorId` 非 UUID、`from`/`to` 非法时间 → **400**（否则 PG `uuid`/`timestamptz` 解析失败会崩 500）。
**向后兼容**：controller 响应仍是 `{ success, rows, ... }` —— Portal `apps/portal/src/pages/console/index.vue:306` 读 `r.rows` 不受影响；`limit` 语义由「返回行数」变为「页大小」（Portal 未消费该字段）。

> 邀请侧同样补了 `status` 筛选 + `limit/offset`；**缺省无 `limit` 时不加 LIMIT 子句**，保持改造前「返回全部」行为，Portal 调用 `listInvitations(id)` 零改动（验收标准 #8 回归项）。

---

## 3. 硬约束核对

| # | 约束 | 落实 |
|---|---|---|
| N1 | 授权走 `assertRole`/`assertSiteOperator`，禁 `req.auth.roles` | 新增门禁调用 `this.assertRole(actorId, orgId, { ownerOnly: false })`；全程零 `roles` 读取 |
| N2 | 禁引 `apps/portal/src/views/organization/` | 未触碰任何前端文件；Portal 兼容性仅作「不改动」核对 |
| N3 | 表结构以实测为准 | 以 `src/migrate/003_tenant.sql:11/78/98` 实表为准：invitations 用 `token`/`status`、audit 有 `entity_type`/`changes`、**非分区表**；未引用 `owner_id` |
| N4 | 不新建 module | 仅改既有 controller/service/types |
| N5 | 无 DB 迁移 | **零迁移**；既有 `idx_org_audit_org/actor/entity` 覆盖筛选主路径 |
| N6 | 身份契约 `req.auth.externalId` | controller `externalId(req)`，无硬编码主体 |
| N7 | 限作用域提交 | 仅 `services/api/src/modules/organization/`（5 文件）+ `.agents/claude/outputs/`（2 文件） |

**设计模式**（红线要求点名）：`AuditQuery`/`InvitationListQuery` 作 Parameter Object 收敛查询参数；SQL 由「条件列表 + 参数列表」并行构建的 **Query Builder**（既有 `search()` 同款惯例）；参数校验用 **Guard Clause**（`requireUuid`/`requireDate` 前置抛错）；`clampInt` 作 **Fallback Default**。

---

## 4. 自检命令与结果（末尾重跑，均为最新）

| 命令 | 结果 |
|---|---|
| `cd services/api && npx tsc --noEmit` | **0 error**（exit 0） |
| `npx jest src/modules/organization` | **49 passed / 49**（2 suites 全绿） |
| `npx jest`（全量） | **32 suites / 517 tests passed, 0 failed**（基线实测 **32/493** → +24，不回归） |
| `bash .agents/claude/outputs/p2-task-10-verify.sh` | **PASS=47 FAIL=0 VERIFY_EXIT=0**（复跑 PASS=46 FAIL=0，幂等） |

新增测试 **26 例**（`git diff` 计数；改写 2 例），远超卡内「≥10 例」；模块测试 25 → 49。

### 验收脚本三段结构

- **§1 jest**：organization 模块 2 spec（≥40 例红线）。
- **§2 离线行为断言**（32 条）：ts-node 直驱 `OrganizationService` + 记录型假库，独立复核门禁/参数化/钳制/注入面/门禁先于查询。
- **§3 活体 E2E**（14 条）：`API_BASE=http://localhost:3008/api` + auth-center `3004`；operator=`testuser`（根 owner），非成员=一次性注册用户；覆盖 200/403/分页第二页/筛选/坏参 400/回归（members 200、POST organizations 201、建后删清场）。不可达时该段 SKIP 不计数。

### 活体部署

容器原为旧构建 → 已 `docker compose build api && docker compose up -d api` 重建（源码 `COPY` 方式，无迁移），`gri-api` 健康；E2E 直接打在容器上（非仅本地进程）。为排除「本地源码 ≠ 容器」歧义，另以 `PORT=3009 npx ts-node -T src/main.ts` 起同源实例对照，两者行为一致（§3 期间已回收）。

---

## 5. 未决项

- **❓ 需确认：** 门禁策略取「owner/admin」，与卡内一致。若产品上希望**组织内普通 member 也能看邀请进度**（自助邀请场景），需改 `assertRole(..., { ownerOnly: false })` 为「成员即可」——当前语义为「仅管理员」，请确认是否符合预期。
- **❓ 需确认：** 未做 **审计导出**（CSV/JSON 下载）。原卡提及「导出」，重写卡把范围收敛为「分页/筛选」，故未实现；如需要另立小卡（可复用同一 `AuditQuery`）。
- **❓ 需确认：** 审计 `total` 用独立 `COUNT(*)` 查询（一次请求两条 SQL）。若不希望多一次往返，可改 `COUNT(*) OVER ()` 窗口函数，但翻页越界页（空页）时 total 会丢失——现取确定性更优方案。
- **📌 提示（非阻塞）**：§3 首跑在审计行数 <2 时会经既有业务写（建/撤邀请）补 2 条审计以观测「第二页」；后续复跑自动复用既有数据。首跑产生的 cancelled 邀请已人工清理，审计行（append-only）保留。
- **📌 基线更正**：卡内写「基线 32 suites / 466 tests」，实测为 **32 / 493**（466 为该卡写作时的旧值）。本卡以实测基线为准，全量 517 全绿。
