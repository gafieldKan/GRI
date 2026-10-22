# 提示词 · B-1（底座凭据缝：每用户独立大模型 / API Key）

> 用法：把下面 **```text 代码块内的全文**原样粘贴给 **Claude**（工作树 `/home/ubantu/GRI`，分支 `feat/stage-c-unified-auth-shell`）。**串行**——B-1 为 B 波首卡，无依赖。

```text
你是 GRI 的实现 agent（Claude）。工作树 /home/ubantu/GRI，分支 feat/stage-c-unified-auth-shell。

任务：B-1 —— 给 AI 底座加「凭据缝」，让每个用户（route_key = 'entity=<id>'）持有自己的大模型 api key。
先完整读这两份文件，再动手：
- 任务卡：.agents/claude/tasks/b1-credential-seam.md（约束 C1–C10 与验收标准，**逐条满足**）
- 契约灵魂：docs/AGENT_CREDENTIAL_SEAM.md（数据模型 / 底座契约 / 硬约束，以此为准）

⚠️ 本卡**故意反转**一条既有决策：项目现在写着「apiKey 永不入库」（见 009_agent.sql:59、model-router.js 的 resolve 返回 apiKey:***、agent-admin.controller.ts:49）。本卡要把它换成「**密钥入库存密文**（AES-256-GCM），明文永不落库、永不回传」。反转 ≠ 放松：只是"存一份密文"。

三件事的验收要点（简版）：
1. 新表 agent.llm_credentials（迁移 032，幂等）——ciphertext/iv/auth_tag 全 BYTEA；hint 仅存后 4 位；key_version 预留轮换；FK 到 agent.llm_routes(route_key)。
2. 底座新增 packages/agent-core/src/credential-store.js —— CredentialStore（get/set/remove/meta，全走注入的 query，DB 无关）+ makeCipher(masterKey)（node:crypto AES-256-GCM）；导出挂 index.js。**底座不读 env**（master key 由 Nest 读入后注入）。
3. ModelRouter.resolve() 合并凭据：entity=<id> key > default key > env LLM_API_KEY；加密失败/篡改 → fail-fast 抛错（**不得**静默回退 env）。

改动面：services/api/src/migrate/032_agent_credentials.sql（新）+ packages/agent-core/src/{credential-store.js（新）,index.js,model-router.js} + services/api/src/modules/agent/（装配 CredentialStore + admin 路由面支持 write-only api_key + GET 回掩码）+ .env.example（AGENT_CRED_MASTER_KEY 占位）。

硬约束（违反即失败）：
- C1 明文永不落库（只存密文+iv+authTag）；C2 明文永不回传（HTTP 只回 has_key+hint 后4位；日志/审计/错误零明文）。
- C3 master key 唯来源 env AGENT_CRED_MASTER_KEY（32 字节）；C4 底座源码不得出现 process.env（grep=0）。
- C5 PUT /api/agent/admin/routes 接受可选 api_key（**write-only**）；GET 不回 key 只回掩码。
- C7 改他人 entity=<id> 的 key 必须被既有 _guard(req) 拒绝；C8 解密失败 fail-fast。
- C9 未传 api_key 的既有行为**完全不变**（不回归既有 admin/E2E）。
- C10 不 commit / 不 checkout / 不 push；凭据零泄漏；tsc/build 通过。

对照现状（读代码确认，别猜）：agent-admin.controller.ts 的 _guard 是 site operator 守卫；storeFrom(query) 是底座唯一持久层接缝；009_agent.sql 是 agent 表真源。

产出 .agents/claude/outputs/b1-file-list.md 与 b1-verify.sh（覆盖 11 项：迁移幂等/密文往返/明文落库 grep=0/HTTP 只读掩码/越权拒绝/篡改 fail-fast/底座零 env/不回归/tsc/build/FAIL=0/凭据零泄漏；**末行 FAIL=0**）。完成后把文件清单 + verify.sh 关键输出贴回来，等独立复验。
```

> 完成后我（助手）独立复验：自跑你的 `b1-verify.sh` + 自建探针（密文往返 / 明文 grep / HTTP 只读掩码 / 越权 / 篡改 fail-fast）+ `tsc`，**不采信自述**。
