-- GRI Auth Center 身份域 Schema（v1）
-- 独立库 gri_auth，统一主体身份（订餐密码账户 + AI 无密码学生）

-- 统一主体身份
CREATE TABLE IF NOT EXISTS identities (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    domain        VARCHAR(20)  NOT NULL,             -- 'food' | 'tutor'
    username      VARCHAR(100) UNIQUE,
    email         VARCHAR(255) UNIQUE,
    phone         VARCHAR(20)  UNIQUE,
    password_hash VARCHAR(255),                       -- bcrypt；学生可空
    name          VARCHAR(100),                       -- 学生姓名 / 用户昵称
    external_id   VARCHAR(64),                        -- 原域主键（订餐 users.id / AI students.id）
    status        VARCHAR(20)  DEFAULT 'active',
    created_at    TIMESTAMPTZ  DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  DEFAULT NOW()
);

-- 多身份关联（幂等迁移）：一个 identity 可对应多个原域账户（一人订餐 + 学生）
CREATE TABLE IF NOT EXISTS identity_links (
    identity_id  UUID REFERENCES identities(id) ON DELETE CASCADE,
    domain       VARCHAR(20) NOT NULL,
    external_id  VARCHAR(64) NOT NULL,
    PRIMARY KEY (domain, external_id)
);

-- refresh token（opaque，可吊销/轮转）
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identity_id UUID NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL,
    device      TEXT,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_identities_domain ON identities(domain);
CREATE INDEX IF NOT EXISTS idx_identities_external ON identities(domain, external_id);
CREATE INDEX IF NOT EXISTS idx_refresh_token_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_identity ON refresh_tokens(identity_id);