# P2-T1 风险与回滚（Risk & Rollback）

> 配套：`p2-task-1-identity-register-contract-design.md`（主设计）、`p2-task-1-e2e-verification-spec.md`（验收）。
> 覆盖：部分失败补偿、幂等、安全、数据修复、回滚。

---

## 1. 风险登记册（Risk Register）

| # | 风险 | 触发 | 影响 | 概率 | 缓解（设计已含） |
|---|---|---|---|---|---|
| R1 | **孤儿 `public.users`**（step3 成功、step4 崩溃） | 注册中途进程/网络中断 | 该 username 被 UNIQUE 占用，后续注册被 409 阻断 | 中 | 补偿硬删（设计 §2.3）；step4 补偿失败时由**对账脚本**清理（§5）；注册「续跑自愈」（§2.4 step 4） |
| R2 | **孤儿 identity**（step4 已建、补偿删 users 后 identity 残留） | step4 网络超时但实已建成 → 补偿删了 users | identity.external_id 指向已删 users → 该身份登录后 `/identity/me` 404 | 低 | 对账脚本按「external_id 无对应 users」清理/再供给（§5） |
| R3 | **跨库不一致**（无单事务） | 双库任一挂 | users 与 identity 短暂不齐 | 中 | Saga 顺序固化（安全动作先行）；对账脚本周期校正 |
| R4 | **并发同 username 双注册** | 两请求同刻 | 双写 | 低 | `public.users` UNIQUE(username) + auth-center identities UNIQUE 双门禁；一个 201、一个 409 |
| R5 | **存量坏数据未修复** | 漏跑 backfill | 老用户登录后 `external_id` 仍落 `sub`，身份端点依旧失效 | 中 | backfill 脚本列为**必跑前置**（设计 §9）；E2E C 段可抽查老账号 |
| R6 | **注销未停用凭证**（只软删 profile） | 实现偷工 | 用户「注销」后仍可登录（安全洞） | 中 | E2E E2 断言「再登录 401」硬性拦截 |
| R7 | **登录/刷新未校验 status** | 遗漏 | 停用/注销身份仍可换 token | 中 | 设计 §5.4 强制 `status!=='active'` → 401；单测覆盖 |
| R8 | **改密未吊销 refresh** | 实现偷工 | 改密后旧设备仍可用 refresh 续命 | 低 | 设计 §4.1 step6；可选断言 |
| R9 | **客户端伪造 externalId** | 恶意注册体带 externalId | 越权（指向他人档案） | 中 | 公开面**永不接受** externalId（设计 §2.2）；G2 门禁用例 |
| R10 | **旧 `/auth/register` 外部调用方** | 仓库外直连 | 410 断链 | 低 | 需确认项（设计 §10.2）；仓库内三前端已覆盖 |
| R11 | **`domain` 类型扩展遗漏** | 改 `'core'` 未同步类型 | TS 编译失败（严格模式） | 低 | 落点清单 §8.1 已列 `identity.entity.ts` |
| R12 | **`public.users` UNIQUE 迁移撞存量重复行** | 库内已有重复 username | 迁移失败 | 低 | 017 迁移前加**预检/去重守卫**（§5） |
| R13 | **服务间令牌泄漏** | `SERVICE_TOKEN` 弱默认 | 攻击者直连 admin 面伪造身份 | 中 | 生产须注入强随机（现有 `${AUTH_SERVICE_TOKEN:-gri-service-token}` 为 dev 默认，**生产禁默认**）；admin 面仅内网/服务网格可达 |

---

## 2. 部分失败补偿（Compensation Matrix）

| 阶段 | 完成度 | 补偿/收敛动作 | 最终一致 |
|---|---|---|---|
| 注册 step2→3 失败 | users 未建 | 无（无需补偿） | ✅ 无残留 |
| 注册 step3 成功、step4 失败/超时 | users 建、identity 无/未知 | 硬删该 users 行（best-effort）；随后对账脚本兜底 | ✅（对账后） |
| 注销 step2 成功、step3 失败 | identity 停用、users 未软删 | **不补偿**（安全优先：锁死登录正确）；重试 DELETE 收敛 | ⚠️→✅（重试） |
| 注销 step2 失败 | 无动作 | 中止 502；数据零变更 | ✅ 无残留 |
| 改密 step5 成功、step6 失败 | 新密生效、旧 refresh 未吊销 | 重试改密；或等旧 refresh 自然过期（30d） | ⚠️（可接受） |

**设计取舍**：一致性动作**分「安全关键」与「非关键」**——安全关键（锁登录、验旧密）失败即**中止**（不给半成品）；非关键（软删 profile、吊销 refresh）允许**重试收敛**。

---

## 3. 幂等性检查表

| 操作 | 幂等键 | 重复调用结果 |
|---|---|---|
| 注册 | `username` / `email` / `phone` UNIQUE | 409；孤儿行「续跑自愈」不双写 |
| `POST /auth/admin/identities` | identities UNIQUE | 409（服务间面显式返回） |
| `DELETE /auth/admin/identities/:ext` | status 已是 disabled | 200（幂等接收者） |
| `POST /api/auth/password` | —（每次改密都是新状态） | 用新密再改一次即成功；用旧密→400 |
| `DELETE /api/identity/me` | `deleted_at` 已设 | 200（再删无害）；identity 已 disabled→admin 200 |
| backfill 脚本 | `external_id IS NULL` 过滤 | 二次跑 0 行变更 |

---

## 4. 安全清单（Security）

| 面 | 控制 | 证据 |
|---|---|---|
| 注册输入 | class-validator DTO（长度/邮箱/密码≥8） | 设计 §7.2 门禁① |
| externalId 注入 | **仅** `X-Service-Token` 服务间面；公开面拒绝 | §2.2 / §7.1 |
| 服务间面 | `timingSafeEqual` 时序安全比对 | `identity-admin.service.ts:19-25` |
| IDOR | `/identity/me`、`/identity/:id`、`/auth/password` 身份**取自 token**，不接受外部 id | §4.1 / §5.2 |
| 令牌管理 | 改密/注销**吊销 refresh_tokens**；注销**停用身份** | §4.1 / §5.2 |
| 密钥 | RS256 私钥仅 auth-center；api 经 JWKS/PEM 验签 | 既有 `@gri/jwt-verifier` |
| 服务令牌 | 生产**必须**注入强随机 `AUTH_SERVICE_TOKEN`（禁 dev 默认） | R13 |
| 密码存储 | bcrypt(12)，脱敏响应（**永不**回传 password_hash） | `identity-admin.service` |
| 时序攻击 | `timingSafeEqual` + 错误信息统一（不泄露账号存在性 vs 密码错） | 兼顾 |

**注意**：登录失败信息对「账号不存在」与「密码错」宜**统一**为 `Invalid credentials`（现状已如此，`auth.service.ts:35`），避免账号枚举——改密/停用路径保持同风格。

---

## 5. 存量数据修复与对账（Reconciliation）

### 5.1 前置守卫（迁移 017 前）
```sql
-- public.users 已有重复 username/email/phone → UNIQUE 迁移会失败，先探测并人工/脚本去重
SELECT username, count(*) FROM public.users GROUP BY username HAVING count(*)>1;
-- 同 email/phone（WHERE NOT NULL）同理
```

### 5.2 一次性 backfill（设计 §9）
`services/api/src/migrate/backfill-external-id.ts`：
- 连 `gri` + `gri_auth`（范式抄 `etl-converge.ts` 双连接）。
- `gri_auth.identities WHERE external_id IS NULL` → 建 `public.users`（role='consumer'）→ 回填 `external_id`。
- 幂等（`external_id` 非空跳过；username 冲突复用既有 users.id）。
- **运行顺序**：迁移 017 → backfill → 重启 api/auth-center。

### 5.3 对账脚本（周期性，可选）
```
孤儿 users：public.users 中，gri_auth.identities 无 external_id=该 id 的行 且 created_at 较久 → 清理或标注
孤儿 identity：gri_auth.identities.external_id 无对应 public.users → 停用该 identity（防指向空档案）
```
建议：先**只读报告**（不自动删），人工确认后再执行清理（以人为本，避免误删真实用户）。

---

## 6. 回滚策略（Rollback）

**分层回滚，按爆炸半径从小到大**：

| 层 | 回滚动作 | 影响 |
|---|---|---|
| **前端** | `apps/web/src/api/auth.js` / `auth-client` register 指向**回退**到 `/auth/register` | 立即恢复旧行为，但**旧行为即 bug 态**（external_id=NULL）→ 仅作**紧急止血**，非解决 |
| **api 端点** | `AuthController.register()` 回退为既有透传；`DELETE /identity/me`、`POST /auth/password` 摘除路由 | 注册回退到 bug 态；改密/注销不可用 |
| **auth-center** | `register()` 恢复可写（撤销 410）；admin 新端点保留（向后兼容，无害） | — |
| **数据库（⚠️ 谨慎）** | 017 的 UNIQUE/CHECK 可 `DROP CONSTRAINT` 回退；**backfill 不可逆**（已回填 external_id 无法安全还原为 NULL） | backfill 回退会**重新制造 bug**，**不建议**回滚 |
| **全量** | `git revert <merge-commit>` + `docker compose up -d --build api auth-center` | 回到改动前；backfill 数据**保留**（孤立但无害） |

**回滚纪律**：
1. **backfill 视为单向**（forward-only）。回滚代码**不**回滚数据——回填的 external_id 是正确的，回退它只会复活 bug。
2. **迁移 017 回滚**仅在有数据完整性事故时执行，且需先确认无依赖新约束的业务逻辑。
3. **灰度建议**：先在 dev compose 全量验证（E2E 全绿）→ 再推生产；生产上线后**先跑 backfill 再切前端**，避免窗口期新注册仍落坏值。

---

## 7. 部署顺序（Deploy Runbook）

```
1. [db]  应用迁移 017（UNIQUE/CHECK）—— 先跑 §5.1 守卫
2. [db]  运行 backfill-external-id.ts（幂等，修存量）
3. [svc] 构建并重启 auth-center（新 admin 面向后兼容；register→410）
4. [svc] 构建并重启 api（新编排 register/password/delete）
5. [smoke] 跑 E2E 规格全绿（p2-task-1-e2e-verification-spec.md）
6. [web] 前端 register 指向 /api/auth/register 上线
7. [verify] 生产抽查：新注册用户 external_id != sub 且 /identity/me 200
```
**顺序理由**：服务间面（auth-center admin）**先于**依赖它的 api 就绪；410 在 api 编排就绪、前端切换**之后**才真正对外体现（旧直连路径已无调用方）。

---

## 8. 观测与告警（Observability）

| 指标 | 用途 |
|---|---|
| 注册成功率 / 409 / 502 计数 | 及时发现编排/补偿异常 |
| `external_id IS NULL` 的 identities 新增计数 | ★ 本 bug 的**直接回归信号**，≥1 即告警 |
| 补偿删除计数（register compensation） | R1/R2 频率 |
| `/auth/password` 400 率 | 误操作 or 攻击探测 |

建议：注册编排里对「补偿被触发」`logger.warn`；对「step4 后 identity.external_id 为空」（不该发生）`logger.error`。

---

## 9. 未决项回链

本文件对应主设计 §10 的 3 项 `❓ 需确认`，均**不阻塞**实现：
- 合规硬擦除 → 决定 R6/§5.3 是否需扩展为物理删除流程。
- 旧 `/auth/register` 外部调用方 → 决定 410 的上线窗口。
- `domain='core'` → 决定 R11（类型扩展）是否落地为 `core` 或回退 `food`（1 行常量）。
