# P2-T1b：在 Claude 成果上做「代码质量 + 性能 + UI」精修

> 前置：P2-T1 已实现并端到端验收通过（`p2-task-1-verify.sh` → PASS=20 FAIL=0）。
> 权威基线：`.agents/claude/outputs/p2-task-1-identity-register-contract-design.md`
> 变更清单：`.agents/codex/outputs/p2-task-1-file-list.md`
> 工作树 `/home/ubantu/GRI`，分支 `feat/stage-c-unified-auth-shell`。

## 角色与铁律

你是**精修工程师**，不是重写者。在 Claude 已验收的代码上做**增量增强**。

1. **全绿基线不可回退（硬门禁）**：改完后以下必须仍成立，否则视为失败：
   - `cd services/api && npx tsc --noEmit` → 0 error
   - `cd services/auth-center && npx tsc --noEmit` → 0 error
   - `cd services/api && npm run test` → 全通过（当前 25 suites / 307 tests，只增不减）
   - `cd services/auth-center && npm run test` → 全通过（当前 3 suites / 22 tests）
   - `bash .agents/codex/outputs/p2-task-1-verify.sh` → `全绿：PASS=20 FAIL=0`
2. **契约不变**：HTTP 状态码、JWT 声明（`external_id ≡ public.users.id`、`external_id ≠ sub`）、路由形状、错误码语义（400/409/502）不得改变。
3. **少而准**：只动本卡列出的维度相关文件；额外必要改动在最终消息说明理由。
4. **不 commit / 不 checkout**；不碰 curriculum/tuition/twin 等在途模块。
5. **凭据零泄漏**；`bcryptjs`（禁 native `bcrypt`）。
6. **自证**：逐条给出命令 + 实际输出摘要。无法决定的设计点用 `❓ 需确认：` 暂停。

## 任务维度（按优先级）

### 维度 A：工程门禁补齐（最高优先）
- **A1** `services/api` 缺 ESLint 配置 → 新建 `.eslintrc.js`（或对齐根包已有风格；先 `ls` 根目录与 `services/auth-center` 看是否已有可抄配置，若无则最小可用 TS+NestJS 配置）。目标：`npx eslint src --ext .ts` 可跑，0 error、warning ≤ 10。
- **A2** 修复测试环境告警 `[OntologyStatsService] DB 统计失败（回空）: this.db.query is not a function` —— 定位 `ontology-stats.service.spec.ts` 的 mock 形状，补齐 `DatabaseService` mock，使该 spec 覆盖真实分支（不是靠 try/catch 吞掉）。

### 维度 B：正确性与健壮性
- **B1 注册补偿**：核对 `AuthService.register()` 的失败补偿——「建 users 成功但建 identity 失败」时是否回滚 `public.users` 行？若无，补齐补偿（删除刚建的 users 行）并加测试。若首建即失败（23505）保持 409。
- **B2 注销一致性**：`deleteMe()` 调 `disableAuthIdentity()` + 软删本地行。核对「停凭证失败」是否 502 中止且**不**做本地软删（先锁凭证后删档语义）；「影响 0 行」是否 404。补边界测试（已部分存在，核对完整性）。
- **B3 改密**：核对 `changePassword()` 是否恒吊销全部 refresh token；旧密错误/新旧相同/无密码身份的状态码（400/401）是否与设计一致。
- **B4 性能**：`get/updateProfile` 的 `deleted_at IS NULL` 查询是否命中索引（017 是否建 `deleted_at` 部分索引；若无且合理则加）；避免重复 bcrypt；`createAuthIdentity()` 的 fetch 超时/错误处理。

### 维度 C：UI 打磨（后端契约不变前提下）
- **C1** `apps/web/src/pages/login/register.vue` + `apps/web/src/components/login/EmailLoginForm.vue`：注册/登录表单——错误提示（400/409 文案区分）、提交 loading 态、成功跳转、字段级校验反馈。**不改**请求端点形状。
- **C2** `apps/web-ai-tutor/src/pages/login/login.vue`：登录态与 `@gri/auth-client` 惰性单例对齐；刷新保持登录（H5 localStorage 兜底）验证。
- **C3** `apps/mini-program-ai-tutor/pages/login/*` + `store/auth.js`：小程序侧 `apiBase` 注入正确、登录态持久化、错误 toast。
- **C4** 视觉：`styles/tokens/themes/*`（若有 auth 相关 token）一致性；响应式；空态/加载态/错误态三态齐全。
- **UI 验收**：给出构建命令与本地可跑路径；若无法起容器浏览器验证，明确说明并以静态检查 + 单元测试作为证据。

## 产出物

| 动作 | 文件 |
|------|------|
| A | `services/api/.eslintrc.js` |
| M | `services/api/src/modules/ontology/*.spec.ts`（mock 修复） |
| M | `services/api/src/modules/auth/auth.service.ts`（补偿/超时） |
| M | `services/api/src/modules/identity/identity.service.ts`（索引/一致性） |
| M | 相应 `*.spec.ts`（新增用例） |
| M | `apps/web/src/pages/login/register.vue`、`components/login/EmailLoginForm.vue` |
| M | `apps/web-ai-tutor/src/pages/login/login.vue` |
| M | `apps/mini-program-ai-tutor/pages/login/*`、`store/auth.js` |
| A | `.agents/codex/outputs/p2-task-1b-quality-ui-report.md`（逐条：改动 + 命令 + 输出） |

## 验收标准（逐条给证据）

1. 维度 A 两项完成，ESLint 实跑 0 error、warning ≤ 10。
2. 维度 B 各条有测试佐证；无回归。
3. 维度 C 各前端可构建（给命令 + 结果）。
4. 全部硬门禁命令重跑仍绿（贴输出）。
5. 最终消息列出：改动文件、每条对应命令与输出摘要、`❓ 需确认：` 项。
