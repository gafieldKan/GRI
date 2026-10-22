# B-1：底座凭据缝 —— 每用户独立大模型 / API Key（加密存储 + 隔离）

> 执行者：**Claude** ｜ 波次：AI 产品化 · B ｜ 依赖：无（B-1 为 B 波首卡）｜ 状态：待下达（串行）
> 依据：`docs/AGENT_CREDENTIAL_SEAM.md`（**本卡灵魂文件**，契约与硬约束以此为准）｜ `docs/AGENT_LAYERING.md`（分层判据）
> 定位：**给底座加"凭据缝"**——让每个用户（`entity=<id>`）持有自己的大模型 api key；路由缝已在，本卡只补**存储 + 隔离**。

## 📥 承重事实（实测，非推测）

- 路由缝已支持每用户：`packages/agent-core/src/model-router.js` routeKey 约定 `'default' | 'kind=<kind>' | 'entity=<entityId>'`；`resolve(routeKey)` 每轮读库。
- **表无 key 列**：`services/api/src/migrate/009_agent.sql:50` `agent.llm_routes` 仅 `route_key/provider/model/multimodal_model/base_url/enabled`。
- **既有决策是"key 不入库"**（本卡**故意反转**，见契约 §一）：`009_agent.sql:59` 注释「apiKey 永不入库」；`model-router.js` `resolve()` 返回 `apiKey: ***`；`agent-admin.controller.ts:49` 提示「apiKey 不落库」。
- **无任何密钥表/加密实现**：`grep -rlnE "CREATE TABLE.*(secret|vault|keystore|credential)" services/api/src/migrate/*.sql` → 空；仓库现仅有 `randomBytes`/`createHmac`/`createHash` 用法，**无 AES/cipher**。
- 迁移号：现最大 `031_knowledge_branch.sql` → 本卡新增 `032_agent_credentials.sql`。
- `api` 是**烘焙镜像**：改源码须 rebuild（见 `.agents/shared-context.md`）。
- 底座抽象：`packages/agent-core/src/store.js` `storeFrom(query)` 是唯一持久层接缝（传输/DB 无关）。

## 🎯 本卡目标（三条）

1. **新增凭据表** `agent.llm_credentials`（AES-256-GCM 密文；明文永不落库）。
2. **底座新增 `CredentialStore` + `makeCipher`**（`packages/agent-core/src/credential-store.js`，导出挂 `index.js`）；master key **由宿主注入**，底座不读 env。
3. **`ModelRouter.resolve()` 合并凭据**：`entity=<id>` key > `default` key > env；HTTP 面**只写不读** key。

## 🔴 硬约束（违反即失败）

| # | 约束 |
|---|---|
| C1 | 明文**永不落库**：只存 `ciphertext/iv/auth_tag`（`BYTEA`），算法 `aes-256-gcm` |
| C2 | 明文**永不回传**：HTTP 面只回 `{has_key, hint}`（hint = 后 4 位）；日志/审计/错误**零明文** |
| C3 | master key 唯来源 env `AGENT_CRED_MASTER_KEY`（32 字节）；`.env.example` 新增条目（占位，无真值） |
| C4 | **底座不读 env**：Nest 端读入 master key 后 `makeCipher` 注入 `CredentialStore`（判据 3） |
| C5 | 写入面：`PUT /api/agent/admin/routes` 接受可选 `api_key`（**write-only**）；`GET` 不回 key，只回掩码 |
| C6 | 审计：记录 `updated_by` + `updated_at`；**不记明文** |
| C7 | 多租户隔离：改他人 `entity=<id>` 的 key 必须被既有 admin 守卫拒绝（复用 `_guard`） |
| C8 | 解密失败（篡改/key_version 不符）→ **fail-fast 抛错**，**不得**静默回退 env |
| C9 | **接口兼容**：未传 `api_key` 时行为与今日**完全一致**（路由行照旧）——不回归既有 admin/E2E |
| C10 | 不 commit / 不 checkout / 不 push；凭据零泄漏；`build`（tsc）通过 |

## 📦 产出物

1. `services/api/src/migrate/032_agent_credentials.sql`（新表，幂等 `IF NOT EXISTS`）。
2. `packages/agent-core/src/credential-store.js`（`CredentialStore` + `makeCipher`）；`packages/agent-core/src/index.js` 增导出。
3. `packages/agent-core/src/model-router.js`：`resolve()` 合并凭据（可空注入，保持向后兼容）。
4. `services/api/src/modules/agent/`：装配 `CredentialStore`（注入 master key）+ admin 路由面支持 write-only `api_key` + `GET` 回掩码。
5. `.env.example`：`AGENT_CRED_MASTER_KEY=` 占位。
6. `.agents/claude/outputs/b1-file-list.md` + `.agents/claude/outputs/b1-verify.sh`。

## ✅ 验收标准

1. **C1**：写一把 key → `SELECT ciphertext,iv,auth_tag FROM agent.llm_credentials` 非空；且 `grep` 明文于该表所有列 = **0 命中**。
2. **C2/C5**：`PUT /api/agent/admin/routes {route_key:'entity=<uuid>', api_key:'nvapi-TESTKEY1234'}` → 成功；再 `GET` 只回 `has_key:true` + `hint:'1234'`（或等价掩码），**响应体不含** `nvapi-TESTKEY1234`。
3. **C3/C4**：master key 仅从 env 读；底座源码 `grep -n process.env packages/agent-core/src/credential-store.js` = **0**。
4. **合并**：`ModelRouter.resolve('entity=<uuid>')` 返回的 `apiKey` == 写入值（解密正确，往返一致）。
5. **C7**：非运营身份 `PUT` 他人 `entity=<id>` key → 被拒（4xx）。
6. **C8**：篡改 `auth_tag` 后 `resolve` 抛错（不静默回退）。
7. **C9**：不传 `api_key` 的既有 `PUT`/`GET` 行为对拍旧版一致。
8. **C10**：tsc/build 通过；`verify.sh` 末行 `FAIL=0`；不 commit / 不 checkout；凭据零泄漏。

## 🧪 复验脚本要求

`b1-verify.sh` 须覆盖：① 迁移幂等（跑两次不报错）；② 密文往返（写→读解密 == 原值）；③ 明文落库 grep = 0；④ HTTP 写只读不回明文（掩码）；⑤ 非运营越权改 key 被拒；⑥ 篡改 fail-fast；⑦ 底座零 env 依赖；⑧ 不回归（无 key 路径对拍）；⑨ tsc/build；⑩ 末行 `FAIL=0`；⑪ 凭据零泄漏 grep。

## 🔗 关键实现细节

- 加密：`node:crypto` `createCipheriv('aes-256-gcm', masterKey, randomBytes(12))`；`authTag` 取 `cipher.getAuthTag()`。
- `hint` 仅存**后 4 位**（`plaintext.slice(-4)`），**不**存前缀。
- `CredentialStore` 的 `get/set/remove/meta` 全走注入的 `query`（`storeFrom` 同款 `QueryFn`），保持 DB 无关。
- `ModelRouter` 构造增可选 `credentials`；缺省 undefined → 行为与今日一致（C9）。
- master key 长度校验：非 32 字节 → 启动 fail-fast（防配置错）。
- 既有守卫复用 `agent-admin.controller.ts` 的 `_guard(req)`（site operator）。

## 📂 任务卡路径

`.agents/claude/tasks/b1-credential-seam.md`
