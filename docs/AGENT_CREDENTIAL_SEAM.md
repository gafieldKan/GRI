# 底座契约：凭据缝（每用户独立大模型 / API Key）

> 满足需求：「**业务 agent 要给每个用户单独配大模型和 api key，且这是底座提供的能力**」。
> 依据：`docs/AGENT_LAYERING.md` 五判据（加密原语=底座；master key=宿主注入）+ `docs/EXTERNAL_AGENT_HARNESS.md`。
> ⚠️ 本契约**故意反转**项目既有决策（见 §一）。

---

## 一、被反转的既有决策（必须先看清）

| 位置 | 现决策 | 反转后 |
|---|---|---|
| `services/api/src/migrate/009_agent.sql:59` | 注释「**apiKey 永不入库**，走 SecretRef/env」 | **密钥入库存密文**（AES-256-GCM），明文永不落库、永不回传 |
| `packages/agent-core/src/model-router.js:~44` | `resolve()` 返回 `apiKey: ***`（「运行凭据不随路由行存」） | resolve 合并**该 routeKey 的密文解密结果**；仍不回传明文给 HTTP 面 |
| `services/api/src/modules/agent/agent-admin.controller.ts:49` | 提示「**apiKey 不落库**」 | 改为「api_key 只写不读；列表仅回 `has_key`+掩码」 |

> 反转原因：需求从"全局一个 env key"升级为"**每用户各持自己的 key**"——env 单值无法承载 N 个用户的 N 把 key。
> **反转不等于放松**：明文仍永不落库、永不回读；只是"存一份密文"。

---

## 二、两条缝要分开（`AGENT_LAYERING.md` 的 V4 教训）

| 缝 | 现状 | 缺口 |
|---|---|---|
| **路由缝** | ✅ 已支持每用户：`route_key = 'entity=<id>'`（`model-router.js:9`） | 无 |
| **凭据缝** | ❌ `agent.llm_routes` **无 key 列**；无任何密钥表（`grep CREATE TABLE.*(secret\|vault\|keystore)` → 空） | **存储 + 隔离** |

---

## 三、数据模型（新增 `agent.llm_credentials`）

```sql
-- 032_agent_credentials.sql（下一个可用号：现最大 031）
CREATE TABLE IF NOT EXISTS agent.llm_credentials (
    route_key   VARCHAR(48) PRIMARY KEY REFERENCES agent.llm_routes(route_key) ON DELETE CASCADE,
    ciphertext  BYTEA       NOT NULL,          -- AES-256-GCM 密文
    iv          BYTEA       NOT NULL,          -- 12 字节随机 IV
    auth_tag    BYTEA       NOT NULL,          -- GCM 认证标签
    algo        VARCHAR(24) NOT NULL DEFAULT 'aes-256-gcm',
    key_version INT         NOT NULL DEFAULT 1,
    hint        VARCHAR(16),                   -- 仅存"后 4 位"供 UI 掩码（如 'wxyz'），非明文
    updated_by  UUID        REFERENCES public.users(id),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- **不**把 key 放进 `llm_routes`（路由行可被 admin 读；凭据行独立、只写不读）。
- `hint` 只留后 4 位供 UI 显示 `****wxyz`；**不是**明文片段存储。
- `key_version` 供将来 master key 轮换（旧密文可重加密）。

---

## 四、底座契约（`packages/agent-core/src/credential-store.js`，新增）

```js
/** 底座能力：加密原语（通用，换行业仍成立 → 属底座）。
 *  不持有 key 本身——key 由宿主注入（判据 3：底座不读 .env）。 */
export class CredentialStore {
  /** @param {{ cipher: {encrypt,decrypt}, query, masterKeyHint? }} deps */
  constructor({ cipher, query }) { this._cipher = cipher; this._query = query; }

  /** 读并解密某 routeKey 的 key；无 → null（调用方回退 env）。永不对外回明文。 */
  async get(routeKey) { /* SELECT → cipher.decrypt → 返回 {apiKey, keyVersion} */ }

  /** 写：加密后 upsert；返回 {ok, hint}（仅后 4 位）。 */
  async set(routeKey, plaintext, { updatedBy } = {}) { /* cipher.encrypt → UPSERT */ }

  async remove(routeKey) {}

  /** 只回元数据：{has_key, hint, updated_at}，永不含明文。 */
  async meta(routeKey) {}
}

/** 加密原语（node:crypto，AES-256-GCM）——底座自带，key 由宿主传。 */
export function makeCipher(masterKey /* 32 bytes */) {
  return {
    encrypt: (plaintext) => ({ ciphertext, iv, authTag }),   // randomBytes(12) IV
    decrypt: ({ ciphertext, iv, authTag }) => plaintext,
  };
}
```

### 合并进 `ModelRouter.resolve()`

```js
// 选到路由行后：
const cred = await this._credentials?.get(routeKey);     // 新增，可空
return {
  provider: row.provider || base.provider,
  model:    row.model    || base.model,
  baseUrl:  row.base_url || base.baseUrl,
  apiKey:   cred?.apiKey || base.apiKey,                 // ← 用户 key 优先，env 兜底
  source:   cred ? 'route+cred' : (row ? 'route' : 'env'),
};
```

**优先级**：`entity=<id>` 的 key > `default` 的 key > env `LLM_API_KEY`。

---

## 五、硬约束

| # | 约束 |
|---|---|
| C1 | **明文永不落库**：只存 AES-256-GCM 密文 + IV + authTag |
| C2 | **明文永不回传**：HTTP 面只回 `has_key` + `hint`（后 4 位）；日志/审计/错误信息**零明文** |
| C3 | **key 来源唯 env**：`AGENT_CRED_MASTER_KEY`（32 字节，`.env.example` 需新增条目）；**不落库、不入 git** |
| C4 | **底座不读 env**：master key 由宿主（Nest）读入后注入 `makeCipher`（判据 3） |
| C5 | **接口只写不读**：`PUT /api/agent/admin/routes` 接受 `api_key`（write-only）；`GET` 不回 key |
| C6 | **审计**：写 key 记 `updated_by` + 时间；不记明文 |
| C7 | **多租户隔离**：`route_key` 决定归属；越权改他人 `entity=<id>` 的 key 必须被 admin 守卫拒绝 |
| C8 | 解密失败（key_version 不符 / 篡改）→ **fail-fast** 抛错，**不得**静默回退 env（避免用错 key 产生假成功） |

---

## 六、实施卡（B-1，交 Claude 实现）

见 `.agents/claude/tasks/b1-credential-seam.md`；派发提示词 `.agents/claude/dispatch/b1-prompt.md`。

**验收**：`PASS=n FAIL=0`；真跑一次"写入某 entity key → resolve 取到该 key（解密正确）→ HTTP 面只回掩码"；明文 grep 落库表 = 0 命中；不 commit。
