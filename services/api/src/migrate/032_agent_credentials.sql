-- 032_agent_credentials.sql
-- 底座「凭据缝」：每用户（route_key = 'entity=<id>'）各持自己的大模型 api key。
--
-- 设计意图（B-1，契约 docs/AGENT_CREDENTIAL_SEAM.md）：
--   路由缝已支持每用户（agent.llm_routes.route_key = 'default' | 'kind=<kind>' | 'entity=<id>'），
--   本表补「凭据缝」——storage + 隔离。明文永不落库、永不回传：
--     只存 AES-256-GCM 密文 + 12 字节随机 IV + GCM authTag（BYTEA）；
--     hint 仅存「后 4 位」供 UI 掩码（如 ****1234），不是明文片段；
--     key_version 供 master key 轮换（旧密文重加密后递增）。
-- 反转声明：009_agent.sql 的「apiKey 永不入库」在此被**故意反转**为「存密文、不存明文」——
--   需求从"全局一个 env key"升级为"每用户各持一把"，env 单值无法承载 N 把 key。
--   反转不放松：agent.llm_routes 仍无 key 列（路由行可被运营读，凭据行独立、只写不读）。
-- FK 根不变：updated_by → public.users(id)（≡ req.auth.externalId）。
-- 幂等：IF NOT EXISTS；重复执行安全（迁移运行器另有 _api_migrations 记录表）。
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent.llm_credentials (
    route_key   VARCHAR(48) PRIMARY KEY REFERENCES agent.llm_routes(route_key) ON DELETE CASCADE,
    ciphertext  BYTEA       NOT NULL,                          -- AES-256-GCM 密文
    iv          BYTEA       NOT NULL,                          -- 12 字节随机 IV（每次写入重新生成）
    auth_tag    BYTEA       NOT NULL,                          -- GCM 认证标签（篡改即解密失败 → fail-fast）
    algo        VARCHAR(24) NOT NULL DEFAULT 'aes-256-gcm',
    key_version INT         NOT NULL DEFAULT 1,                -- master key 轮换代际
    hint        VARCHAR(16),                                   -- 仅「后 4 位」供 UI 掩码，非明文
    updated_by  UUID        REFERENCES public.users(id),       -- 审计：谁改的（不记明文）
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 审计/轮换扫描：按代际找待重加密行。
CREATE INDEX IF NOT EXISTS idx_agent_llm_credentials_key_version
    ON agent.llm_credentials (key_version);
