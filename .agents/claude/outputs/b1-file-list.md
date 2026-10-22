# B-1 产出物清单 —— 底座凭据缝（每用户独立大模型 / API Key）

> 任务卡：`.agents/claude/tasks/b1-credential-seam.md` ｜ 契约：`docs/AGENT_CREDENTIAL_SEAM.md`
> 执行者：Claude ｜ 日期：2026-10-22 ｜ 分支：`feat/stage-c-unified-auth-shell`（未 commit / 未 checkout / 未 push）
> 自证结果：**`PASS=33 FAIL=0 VERIFY_EXIT=0`**（`bash .agents/claude/outputs/b1-verify.sh`）

---

## 一、任务卡「产出物」逐条落地

| # | 卡内产出物 | 实际文件 | 状态 |
|---|---|---|---|
| 1 | `services/api/src/migrate/032_agent_credentials.sql` | 同 | ✅ 新建（幂等 `IF NOT EXISTS` + key_version 索引） |
| 2 | `packages/agent-core/src/credential-store.js`（`CredentialStore` + `makeCipher`）+ `index.js` 导出 | 同 + `index.js` | ✅ 新建 + 导出挂接 |
| 3 | `packages/agent-core/src/model-router.js`：`resolve()` 合并凭据（可空注入） | 同 | ✅ 第三参 `credentials`（缺省 null → 行为与今日一致） |
| 4 | `services/api/src/modules/agent/`：装配 `CredentialStore`（注入 master key）+ admin 路由面 write-only `api_key` + `GET` 回掩码 | `agent-credentials.service.ts`（新）、`agent.module.ts`、`agent-admin.controller.ts`、`agent.service.ts` | ✅ |
| 5 | `.env.example`：`AGENT_CRED_MASTER_KEY=` 占位 | 同 | ✅（占位 + 用法/长度/轮换说明，无真值） |
| 6 | `.agents/claude/outputs/b1-file-list.md` + `b1-verify.sh` | 本文件 + `b1-verify.sh` | ✅ |

## 二、任务卡清单外的「额外必要改动」（均附理由）

| 文件 | 改动 | 为什么必要 |
|---|---|---|
| `packages/agent-core/index.d.ts` | 补 `CredentialStore` / `makeCipher` / `Cipher` / `CredentialReader` 声明；`ModelRouter` 构造第 3 参；`LlmConfig.source` 联合加 `'cred' \| 'route+cred'` | 该文件是包的类型契约唯一真源（`package.json` exports.types 指向它）。不补则 `services/api` 的 `npx tsc --noEmit` 报 TS2305/TS2554（实测），C10 无法通过 |
| `packages/agent-core/src/model-router.js` `set()` 的 SQL | `provider` 列改 `COALESCE($2,'nvidia')` / 冲突时 `COALESCE($2, agent.llm_routes.provider)` | **既有缺陷修复**：`provider` 是 `NOT NULL DEFAULT 'nvidia'`，旧 SQL 显式写 `NULL` → 「只改 model 不改 provider」（即验收 #2 的请求形状 `{route_key, api_key}`）必吃 `23502 not-null violation` → HTTP 500。实测复现于本卡 §5.1 首次跑（日志：`null value in column "provider"`）。不修则验收 #2 无法成立。语义零回归：未传 provider 时从「500 报错」变为「落默认/保留旧值」；model 等其余列仍维持原 `NULL` 覆盖语义不变 |
| `services/api/src/config/config.ts` | 新增 `AgentCredConfig { masterKey }` + `loadConfig().agentCred` | C3「master key 唯来源 env」需要宿主读取处；本仓 env 读取唯一装配点是 `loadConfig()`（`DatabaseService`/`LlmService` 同款）。底座侧仍零 env（见 §5.1 证据） |
| `docker-compose.yml` | api 服务 environment 增 `AGENT_CRED_MASTER_KEY: ${AGENT_CRED_MASTER_KEY:-}` | 默认空 = 凭据面关闭（零回归）；部署时经 `--env-file` 注入即启用。不改 `docker-compose.prod.yml`（卡内未列，且 `:?` 强制必填会破坏既有 prod 启动） |
| `packages/agent-core/tests/credential-store.test.js`（新） | 22 例：原语往返/随机 IV/篡改抛错、存储往返/hint/审计/短 key 全掩、router 合并优先级/篡改 fail-fast/表缺失回退 | 任务卡「验收标准」第 3/4/5/6/8 条的**可重复**证据；底座 `node --test` 是该项目对 agent-core 的既定验证方式 |
| `packages/agent-core/tests/model-router.test.js` | +1 例：未传 provider 不写 NULL（防 23502） | 锁住上表 `set()` 缺陷修复，防回归 |
| `services/api/src/modules/agent/agent-admin-routes.spec.ts`（新） | 10 例：HTTP 面只写不读/掩码/守卫先行/未配置主密钥拒收/凭据面关闭 + `parseMasterKey` 长度 fail-fast 且错误信息零泄漏 | 同上，验收 #2/#5/#7 的单元级证据；与既有 `agent-admin.controller.spec.ts` 分离，避免扰动既有 9 例 |

## 三、实现要点（对应硬约束）

| 约束 | 落点 | 证据 |
|---|---|---|
| C1 明文永不落库 | `credential-store.js` `makeCipher.encrypt`（AES-256-GCM + `randomBytes(12)` IV + `getAuthTag()`）→ `CredentialStore.set` 只写 `ciphertext/iv/auth_tag`（BYTEA） | §4.1/§4.3 + §5.4a（`c=17 i=12 t=16 algo=aes-256-gcm`）、§5.4b（明文全列 grep=0） |
| C2 明文永不回传 | `meta()` 只回 `{has_key,hint,...}`；控制器 GET/PUT 响应只回 `has_key`+`hint`；解密失败错误信息只带 `route_key`（不含明文/密文） | §4.4 + §5.1/§5.2（响应体零明文）+ §6.3（日志零明文） |
| C3 master key 唯来源 env | `loadConfig().agentCred.masterKey` ← `AGENT_CRED_MASTER_KEY`；`.env.example` 占位；长度非法 → 启动即退 | §5.9（非法长度 rc=1）+ §6.4 |
| C4 底座不读 env | master key 由 `AgentCredentialsService`（Nest）读入 → `makeCipher` → 注入 `CredentialStore` | §3.1（`credential-store.js` 里 `process.env` 命中 **0**） |
| C5 只写不读 | `PUT /api/agent/admin/routes` 可选 `api_key`（write-only）；`GET` 回 `has_key`+`hint` | §5.1/§5.2 |
| C6 审计（不记明文） | 凭据行 `updated_by`=操作者 `externalId`、`updated_at=NOW()`（表默认） | §5.4a（`by=true at=true`）+ 单测 `sets[0].opts.updatedBy==='op-1'` |
| C7 多租户隔离 | 复用既有 `_guard`（`assertSiteOperator`）且**先于任何写入** | §5.3/§5.3b（非运营 PUT/GET → 403）+ 单测「守卫先行，0 写入」 |
| C8 解密失败 fail-fast | `CredentialStore.get` 对 algo/key_version 不符、GCM 校验失败一律抛错；`ModelRouter._credential` 只吞「表缺失(42P01)」，其余上抛 | §4.5 + §5.6（真库篡改 auth_tag → get/resolve 均抛错）+ 单测「篡改不静默回退 env」 |
| C9 接口兼容 | 未传 `api_key` → 完全不上凭据面；未注入 credentials → `resolve` 走原语义；`source` 仅在新增分支出现 `cred/route+cred` | §5.7（对拍：`success/applied/行读回` 一致、`has_key=false`）+ §5.8 + 单测「未注入 → source=route」 |
| C10 零泄漏/不 commit | 见 §五 | §6.1–§6.4；`git status` 无 commit/checkout |

### 合并优先级（契约 §四）
`ModelRouter.resolve(routeKey)` 依次取：**该 routeKey 的凭据 → `default` 凭据 → env**；`source` 取值 `'route+cred' | 'cred' | 'route' | 'env'`。空凭据注入时输出与改动前**逐字段一致**。

### 关键装配顺序（易踩坑）
`agent.llm_credentials.route_key` 有 FK → `agent.llm_routes(route_key)`，故控制器**必须先 `router.set()` 落路由行，再落凭据**；顺序反了会 FK 失败。

## 四、自检命令与结果（实测）

| 命令 | 结果 |
|---|---|
| `cd services/api && npx tsc --noEmit` | 退出码 0（无输出） |
| `cd services/api && npx jest` | **48 suites / 646 tests passed, 0 failed**（改动前 47 suites / 636；新增 `agent-admin-routes.spec.ts` 10 例） |
| `cd packages/agent-core && npm test`（`node --test`） | **62 passed / 0 failed**（新增凭据套件 22 例 + provider 缺陷 1 例；改动前 39） |
| `cd services/api && npm run build`（`nest build`） | 退出码 0；`dist/migrate/032_agent_credentials.sql`、`dist/modules/agent/agent-credentials.service.js` 均产出 |
| `node dist/migrate/run-migrations.js`（跑两次） | 首次 `applied 032_agent_credentials.sql`，二次 `skip`（幂等）；表结构见 §0.3 |
| `bash .agents/claude/outputs/b1-verify.sh` | **`PASS=33 FAIL=0 VERIFY_EXIT=0`**（§0 迁移幂等 → §6 零泄漏，共 33 项断言） |

**活体端到端说明**：§5 以 `PORT=3009 node dist/main.js` 直起**本卡源码**实例（注入一次性 32 字节 master key），对真库（`gri` @5432）+ 真 auth-center（3004）跑通：写入 `entity=<uuid>` 的 key → `resolve` 解密回原值 → 篡改后抛错 → 非运营 403 → 明文零落库零回传。用毕回收实例并清场（删测试 route 行，级联删凭据）。

## 五、凭据零泄漏

- 全程未打印/未写盘任何真实密钥；`AGENT_CRED_MASTER_KEY` 由 `openssl rand -base64 32` 现场生成，只存在于进程内存与容器/进程 env。
- `.env` / `.env.prod` **未改动**（仓库既有文件不含本卡条目）。
- `.env.example` 仅占位；`AGENT_CRED_MASTER_KEY=` 后无值。
- `git status`：仅上述文件被修改/新增，**无 commit / 无 checkout / 无 push**。
- 测试明文 `nvapi-TESTKEY1234` 仅见于 `*.spec.ts` / `*.test.js` 与验收脚本（fixture），生产源码命中 0（§6.1）。

## 六、残留与未决项

- **残留测试账号**：验收脚本 §5 需一个「非运营」身份，用固定用户名 `b1nonop`（`b1nonop@example.com`，密码 `password123`，dev 库）。首次运行创建，之后复用；本卡期间另有 2 个一次性 `b1nonop<ts>` 账号是修复过程中的中间产物，仍在 dev 库 `public.users`/`gri_auth.identities` 中（未清理：跨库删除涉及 FK 与自供给组织，风险大于收益，留待确认）。
- **❓ 需确认 1**：`tuition/agents/llm.service.ts` 与 `tutor-session-agent.ts` 也各自 `new ModelRouter(store)` 且只 resolve `'default'`。它们**不在本卡产出物范围**（卡内限 `services/api/src/modules/agent/`），故未注入凭据 —— 目前 `default` 凭据只对 agent 域生效。是否在 B 波后续卡把凭据注入统一到一处（例如提供 `AgentCredentialsService` 并被 tuition 复用）？
- **❓ 需确认 2**：master key **轮换**目前只到「按 `key_version` 拒解密（fail-fast）+ 表留代际列」的程度，未实现自动重加密（读旧版本 → 用新 key 重写）。是否要 B 波另开一张卡做轮换工具（双 key 读、单 key 写）？
- **❓ 需确认 3**：`GET /api/agent/admin/routes` 的 `routes[]` 每行**新增** `has_key` / `hint` 两字段（C5 要求 GET 回掩码）。既有字段语义与取值未变，但响应体确实变大 —— 若前端对响应做严格等值断言需同步。
- **容器镜像（已同步）**：`docker compose build api` 成功、`docker compose up -d --no-deps api` 已重建 `gri-api`（健康）。重建时**刻意不注入** `AGENT_CRED_MASTER_KEY`（避免把一次性密钥烘进环境 → 后续密文不可解），故容器当前 `credentialsEnabled:false`：`PUT` 带 `api_key` 会被**明确拒收**（`AGENT_CRED_MASTER_KEY 未配置…未写入任何变更`），不带 `api_key` 的既有路径实测与旧版一致（C9）。要启用容器侧凭据面：
  ```sh
  AGENT_CRED_MASTER_KEY="$(openssl rand -base64 32)" docker compose up -d --no-deps api   # 注意把该值稳定留存
  ```
  （本卡活体 E2E 走「源码直起 3009」路径，不依赖该开关。）
