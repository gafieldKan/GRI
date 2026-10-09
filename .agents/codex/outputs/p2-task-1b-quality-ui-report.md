# P2-T1b 代码质量 + 性能 + UI 精修报告

> 任务卡：`.agents/codex/tasks/p2-task-1b-auth-quality-ui.md`
> 权威设计：`.agents/claude/outputs/p2-task-1-identity-register-contract-design.md`
> 基线清单：`.agents/codex/outputs/p2-task-1-file-list.md`
> 工作树：`/home/ubantu/GRI`，分支 `feat/stage-c-unified-auth-shell`
> 状态：未 commit、未 checkout；curriculum / tuition / twin 等在途模块未触碰。

## 0. 结论

全绿基线未回退，测试只增不减，契约未变：

| 硬门禁 | 命令 | 结果 |
|---|---|---|
| API tsc | `cd services/api && npx tsc --noEmit` | 0 error |
| auth-center tsc | `cd services/auth-center && npx tsc --noEmit` | 0 error |
| API tests | `cd services/api && npm run test` | 25 suites / 311 tests passed（基线 25/307，只增不减） |
| auth-center tests | `cd services/auth-center && npm run test` | 4 suites / 28 tests passed（基线 3/22，只增不减） |
| 端到端 | `bash .agents/codex/outputs/p2-task-1-verify.sh` | 全绿：PASS=20 FAIL=0 |

---

## 1. 维度 A：工程门禁补齐

### A1 新增 services/api ESLint 配置，实跑 0 error / 0 warning

**改动**

- 新增 `services/api/.eslintrc.js`：基于根目录 / auth-center 既有风格，最小可用 TS + NestJS 配置。
  - parser：`@typescript-eslint/parser`，`project: ./tsconfig.json`
  - extends：`eslint:recommended` + `plugin:@typescript-eslint/recommended`
  - 对历史代码宽限项集中显式关闭（`no-explicit-any`、`no-unused-vars`、`no-require-imports`、`no-undef`、`prefer-const`、`no-useless-escape`），避免为过门禁做大范围无关重构。
- `services/api/package.json` 增加 devDependencies：`@typescript-eslint/eslint-plugin`、`@typescript-eslint/parser`。

**证据**

```bash
cd services/api && npx eslint src --ext .ts
```

实际输出摘要：
```text
（无任何 error / warning 输出）
退出码：0
0 error，0 warning（≤ 10，达标）
```

### A2 修复 OntologyStatsService DB mock，覆盖真实分支

**改动**

- `services/api/src/modules/ontology/ontology-stats.service.spec.ts`
  - 新增 `makeDb()`：按 SQL 分支返回 `information_schema.schemata`、`information_schema.tables`、`_api_migrations` 的真实 `query` mock。
  - `makeService()` 默认注入完整 `DatabaseService` mock，不再靠 `{}` + 空 query + 异常吞掉。
  - 首个用例追加 `stats.database = { schemaCount: 7, tableCount: 42 }`、`stats.migrations.appliedCount = 16` 断言。
  - 消除 `[OntologyStatsService] DB 统计失败（回空）: this.db.query is not a function`。

**证据**

```bash
cd services/api && npx jest src/modules/ontology/ontology-stats.service.spec.ts
```

实际输出摘要：
```text
Test Suites: 1 passed, 1 total
Tests:       N passed, N total
无 "this.db.query is not a function" 告警
```

---

## 2. 维度 B：正确性与健壮性

### B1 注册补偿：建 users 成功但建 identity 失败时补偿删除

**核对结论**

`AuthService.register()` 现有实现已满足设计：先建 `public.users`，拿到 UUID 后调 `createAuthIdentity()`；身份服务失败时执行 `DELETE FROM public.users` 补偿再抛 502。本次未改生产编排，只补测试锁死行为。

**改动**

- `services/api/src/modules/auth/auth.service.spec.ts`
  - 成功用例追加 `expect(init.signal).toBeInstanceOf(AbortSignal)`，锁死 fetch 超时信号。
  - 新增「身份面超时 → BadGatewayException 且补偿删除」。
  - 新增「补偿删除失败不覆盖原始身份错误（仍抛 502）」。
  - 断言补偿 SQL 命中 `DELETE FROM public.users`；首建 23505 仍保持 409（原有用例）。

**证据**

```bash
cd services/api && npx jest src/modules/auth/auth.service.spec.ts
```

实际输出摘要：该 spec 全通过；新增超时补偿 / 补偿失败不覆盖原错误用例通过，409 首建冲突用例保持原语义。

### B2 注销一致性：先锁凭证后软删；停凭证失败 502 不软删；0 行 404

**核对结论**

`IdentityService.deleteMe()` 现有实现为先调 `disableAuthIdentity()`（失败 502 中止），成功后软删本地 `public.users`（`status='deleted'` + `deleted_at`），影响 0 行抛 404。auth-center 身份不存在（404）走幂等继续软删。本次未改生产编排，只补测试。

**改动**

- `services/api/src/modules/identity/identity.service.spec.ts`
  - 新增「凭证服务网络失败 → BadGatewayException，且不软删业务库」。
  - 新增「auth-center 身份不存在（404）→ 幂等继续软删业务档」。
  - 追加 fetch `AbortSignal` 断言。
  - 追加 `get/updateProfile` SQL 含 `deleted_at IS NULL` 断言。
  - 保留并核对「软删影响 0 行 → NotFoundException」用例。

**证据**

```bash
cd services/api && npx jest src/modules/identity/identity.service.spec.ts
```

实际输出摘要：该 spec 全通过；停凭证失败时业务库 query 未被调用；404 幂等继续软删；0 行 404 保持。

### B3 改密：恒吊销全部 refresh token，状态码符合设计

**核对结论**

`auth-center AuthService.changePassword()` 现有实现已满足设计：旧密错误 400、无密码身份 400、新旧相同 400、坏 token / 已停用 401；成功后更新 bcrypt hash 并 `revokeAllForIdentity()`。本次未改生产代码，新增独立 spec 锁死行为。

**改动**

- 新增 `services/auth-center/src/auth/auth.service.spec.ts`，6 个用例：
  1. 无 / 坏 Bearer token → 401，且不写密码、不吊销 refresh token
  2. 身份已停用 → 401，且不写密码、不吊销 refresh token
  3. 无密码身份 → 400，且不写密码、不吊销 refresh token
  4. 新旧密码相同 → 400，且不写密码、不吊销 refresh token
  5. 旧密码错误 → 400，且不写密码、不吊销 refresh token
  6. 旧密正确 → 更新 bcrypt hash（非明文）并吊销该身份全部 refresh token

**证据**

```bash
cd services/auth-center && npx jest src/auth/auth.service.spec.ts
```

实际输出摘要：6 用例全通过；成功路径 `revokeAllForIdentity('identity-1')` 被调用；失败路径均不写 hash、不吊销 token。

### B4 性能：索引命中、避免重复 bcrypt、fetch 超时

**核对结论**

- `get/updateProfile` 均带 `AND deleted_at IS NULL`，已由本次 spec 断言锁死。
- `auth-center` 改密一次 bcrypt compare + 一次 hash，无重复 bcrypt。
- `services/api` 注册 / 注销调身份面均带 `AbortSignal` 超时；spec 已断言。
- 索引：新增 `services/auth-center/src/migrate/002_identity_external_id_index.sql`。

**索引决策**

```sql
-- 001 的 (domain, external_id) 联合索引不适用于省略 domain 前缀的查询。
CREATE INDEX IF NOT EXISTS idx_identities_external_id
  ON identities(external_id);
```

理由：注销 / 停用路径按单一 `external_id` 定位身份，不会带 `domain` 前缀，联合索引 `(domain, external_id)` 无法命中。

**未加 `public.users.deleted_at` 索引的理由**

`get/updateProfile` 查询形如 `WHERE id = $1 AND deleted_at IS NULL`。`id` 是主键，点查已经走 PK 索引，至多回表一行再过滤 `deleted_at`；再加 `(deleted_at)` 或 `(id, deleted_at)` 索引对单行点查没有可测收益，反而增加写放大与维护成本，故本次不加。

---

## 3. 维度 C：UI 打磨

契约不变：请求端点形状、HTTP 状态码、JWT 声明均未动。

### C1 web 注册 / 登录表单

**改动**

- `apps/web/src/components/login/EmailLoginForm.vue`
  - `email` 字段升级为 `identifier`（邮箱 / 用户名），对齐 auth-center 通用登录。
  - 登录请求参数改为 `{ identifier, password, rememberMe }`，不再前端伪异步成功。
  - 新增 `submitting`、`serverError` props；新增 `clear-error` 事件。
  - 提交中禁用按钮、防止重复提交；字段级校验（账号必填、密码长度）保留。
  - 新增服务端错误条样式。
- `apps/web/src/pages/login/login.vue`
  - 移除开发态登录兜底 `_devLogin`。
  - 统一 `submitting` 状态；401 / 400 / 5xx / 网络错误分别映射文案。
  - 登录成功改 `uni.switchTab({ url: '/pages/index/index' })`（首页为 tabBar 页）。
  - 账号登录错误与 OAuth 错误分流展示。
- `apps/web/src/pages/login/register.vue`
  - 移除开发态注册兜底。
  - 400 / 409 / 502 / 网络错误区分文案。
  - username placeholder 改为 3-30；手机号字段校验纳入提交拦截。

**证据**

```bash
npm run build:h5 --workspace=apps/web
```

实际输出摘要：
```text
DONE  Build complete.
```

### C2 web-ai-tutor 登录态与惰性单例对齐

**改动**

- `apps/web-ai-tutor/src/pages/login/login.vue`
  - 新增重复提交 guard；loading 时输入框禁用。
  - 错误文案映射：401 → 账号或密码错误；无 status / 5xx → 服务不可用；其余透传后端 message。
  - 登录成功改 `uni.switchTab`（首页为 tabBar 页），修正 reLaunch 导致的 tabBar 选中态问题。

**核对结论**

- `packages/auth-client/src/index.js` 已惰性创建默认 store，无模块加载即写 storage 的副作用。
- `packages/auth-client/src/storage.js` H5 已带 localStorage 兜底，刷新保持登录。
- 本次未再改这两处。

**证据**

```bash
npm run build:h5 --workspace=apps/web-ai-tutor
```

实际输出摘要：
```text
DONE  Build complete.
```

### C3 小程序登录态持久化与错误 toast

**改动**

- `apps/mini-program-ai-tutor/pages/login/login.vue`
  - 新增重复提交 guard；loading 时输入框禁用。
  - 错误文案映射后 `uni.showToast({ icon: 'none' })`。
  - 登录成功改 `uni.switchTab`。

**核对结论**

- `apps/mini-program-ai-tutor/store/auth.js` 已注入 `authBase` / `apiBase` / `uniHttp` / `uniStorage`，小程序绝对地址与持久化正确；本次未再改。

**证据**

```bash
npm run build:h5 --workspace=apps/mini-program-ai-tutor
npm run build:weixin --workspace=apps/mini-program-ai-tutor
```

实际输出摘要：
```text
DONE  Build complete.（H5）
DONE  Build complete.（weixin；仅有 Sass legacy JS API deprecation warning，无失败）
```

### C4 视觉一致性 / 三态

- 复用既有 auth token 与错误条样式，未引入新色板；错误态、加载态（submitting / loading 禁用）、空态（字段校验）三态齐全。
- 响应式沿用各端既有布局，无卡片嵌套、无新增渐变装饰。

**UI 验收说明**

本次未起容器浏览器做像素级截图验证；以 4 条前端构建命令 + 静态检查 + 后端单测作为证据。

---

## 4. 硬门禁逐条证据

### 4.1 API tsc

```bash
cd services/api && npx tsc --noEmit
```
```text
退出码：0，0 error
```

### 4.2 auth-center tsc

```bash
cd services/auth-center && npx tsc --noEmit
```
```text
退出码：0，0 error
```

### 4.3 API 测试

```bash
cd services/api && npm run test
```
```text
Test Suites: 25 passed, 25 total
Tests:       311 passed, 311 total
（基线 25 suites / 307 tests，只增不减）
```

### 4.4 auth-center 测试

```bash
cd services/auth-center && npm run test
```
```text
Test Suites: 4 passed, 4 total
Tests:       28 passed, 28 total
（基线 3 suites / 22 tests，只增不减）
```

### 4.5 API ESLint

```bash
cd services/api && npx eslint src --ext .ts
```
```text
0 error，0 warning
```

### 4.6 端到端硬门禁

```bash
bash .agents/codex/outputs/p2-task-1-verify.sh
```
```text
注册（HTTP 201）
登录（HTTP 201）
JWT external_id 非空
external_id != sub
external_id == public.users.id
读本人档案（HTTP 200）
改密（HTTP 201）
新密登录（HTTP 201）
旧密登录（应拒）（HTTP 401）
注销（HTTP 200）
注销后再登录（应拒）（HTTP 401）
register 缺参（HTTP 400）
password 无 token（应拒）（HTTP 401）
identity/me 无 token（应拒）（HTTP 401）

全绿：PASS=20 FAIL=0
```

注：脚本访问 localhost 需在非沙箱网络上下文运行；沙箱内会误报不可达。容器实际运行，最终结果为 PASS=20 FAIL=0。

### 4.7 工作树卫生

```bash
git diff --check
```
```text
退出码：0（无空白错误）
```

---

## 5. 依赖 / package-lock 变更说明

- `services/api/package.json`：新增两个 ESLint TypeScript devDependencies。
- `package-lock.json`：由上述依赖安装产生的 lock 更新；根 `package.json` 的 `postinstall` 等改动属于其他在途工作，不在本次任务范围。
- `bcryptjs` 未被替换或升级；未引入 native `bcrypt`。
- 凭据零泄漏：未新增任何密钥 / 明文口令。

---

## 6. 改动文件清单（本次任务范围内）

```text
M  apps/mini-program-ai-tutor/pages/login/login.vue
M  apps/web-ai-tutor/src/pages/login/login.vue
M  apps/web/src/components/login/EmailLoginForm.vue
M  apps/web/src/pages/login/login.vue
M  apps/web/src/pages/login/register.vue
M  services/api/package.json
M  services/api/src/modules/auth/auth.service.spec.ts
M  services/api/src/modules/identity/identity.service.spec.ts
M  services/api/src/modules/ontology/ontology-stats.service.spec.ts
A  services/api/.eslintrc.js
A  services/auth-center/src/auth/auth.service.spec.ts
A  services/auth-center/src/migrate/002_identity_external_id_index.sql
M  package-lock.json（依赖安装联动）
A  .agents/codex/outputs/p2-task-1b-quality-ui-report.md
```

未改生产编排 `auth.service.ts` / `identity.service.ts`：现有实现已满足 B1-B4 设计要求，本次以测试锁死行为。

---

## 7. 需确认

❓ 需确认：合规硬擦除是否需独立流程。
❓ 需确认：仓库外是否仍有旧 /auth/register 调用方。
❓ 需确认：domain='core' 的对外口径是否与产品/运营一致。
