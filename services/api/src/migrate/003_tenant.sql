-- ============================================================================
-- GRI 重写 DDL 003：organization 域（tenant schema）
--
-- 对齐 001 单库地基，把旧 backend 的 organization_* 表收敛进 tenant schema，
-- 所有「人」列 FK 统一指向 public.users(id)（externalId ≡ users.id 唯一映射点）。
-- 域涵盖：组织/组织树/成员/角色与角色成员/邀请/审计日志。
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS tenant.organizations (
    id          UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255)     NOT NULL,
    code        VARCHAR(100),
    short_name  VARCHAR(100),
    description TEXT,
    logo_url    VARCHAR(512),
    parent_id   UUID             REFERENCES tenant.organizations(id) ON DELETE SET NULL,
    parent_path VARCHAR(1000)    DEFAULT '/',
    level       INTEGER          DEFAULT 1,
    type        VARCHAR(50)      NOT NULL,
    status      VARCHAR(50)      DEFAULT 'active',   -- 'active' | 'archived'
    settings    JSONB            DEFAULT '{}',
    metadata    JSONB            DEFAULT '{}',
    created_at  TIMESTAMPTZ      DEFAULT NOW(),
    updated_at  TIMESTAMPTZ      DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_org_parent_id ON tenant.organizations(parent_id);
CREATE INDEX IF NOT EXISTS idx_org_code ON tenant.organizations(code);

CREATE TABLE IF NOT EXISTS tenant.organization_members (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID            NOT NULL REFERENCES tenant.organizations(id) ON DELETE CASCADE,
    user_id         UUID            NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role            VARCHAR(100)    NOT NULL,        -- 'owner' | 'admin' | 'member' | 自定义角色 code
    status          VARCHAR(50)     DEFAULT 'active',
    department      VARCHAR(100),
    title           VARCHAR(100),
    employee_no     VARCHAR(50),
    metadata        JSONB           DEFAULT '{}',
    created_at      TIMESTAMPTZ     DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     DEFAULT NOW(),
    UNIQUE (organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON tenant.organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON tenant.organization_members(user_id);

CREATE TABLE IF NOT EXISTS tenant.organization_roles (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID         NOT NULL REFERENCES tenant.organizations(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    code            VARCHAR(50)  NOT NULL,
    description     TEXT,
    permissions     JSONB        DEFAULT '[]',
    is_system       BOOLEAN      DEFAULT false,
    sort_order      INTEGER      DEFAULT 0,
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  DEFAULT NOW(),
    UNIQUE (organization_id, code)
);
CREATE INDEX IF NOT EXISTS idx_org_roles_org ON tenant.organization_roles(organization_id);

CREATE TABLE IF NOT EXISTS tenant.organization_role_members (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id     UUID        NOT NULL REFERENCES tenant.organization_roles(id) ON DELETE CASCADE,
    user_id     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    granted_by  UUID        REFERENCES public.users(id),
    granted_at  TIMESTAMPTZ DEFAULT NOW(),
    expires_at  TIMESTAMPTZ,
    metadata    JSONB       DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (role_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_org_role_members_role ON tenant.organization_role_members(role_id);
CREATE INDEX IF NOT EXISTS idx_org_role_members_user ON tenant.organization_role_members(user_id);

CREATE TABLE IF NOT EXISTS tenant.organization_invitations (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID         NOT NULL REFERENCES tenant.organizations(id) ON DELETE CASCADE,
    email           VARCHAR(255) NOT NULL,
    role_id         UUID         REFERENCES tenant.organization_roles(id),
    inviter_id      UUID         NOT NULL REFERENCES public.users(id),
    status          VARCHAR(50)  DEFAULT 'pending',   -- pending|accepted|rejected|expired|cancelled
    token           VARCHAR(255) UNIQUE NOT NULL,
    expires_at      TIMESTAMPTZ  NOT NULL,
    accepted_at     TIMESTAMPTZ,
    accepted_by     UUID         REFERENCES public.users(id),
    message         TEXT,
    metadata        JSONB        DEFAULT '{}',
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_org_invites_org ON tenant.organization_invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_invites_token ON tenant.organization_invitations(token);
CREATE INDEX IF NOT EXISTS idx_org_invites_status ON tenant.organization_invitations(status);

CREATE TABLE IF NOT EXISTS tenant.organization_audit_logs (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID         NOT NULL REFERENCES tenant.organizations(id) ON DELETE CASCADE,
    action          VARCHAR(100) NOT NULL,
    entity_type     VARCHAR(50)  NOT NULL,   -- organization|member|role|invitation
    entity_id       UUID,
    actor_id        UUID         NOT NULL REFERENCES public.users(id),
    actor_type      VARCHAR(50)  DEFAULT 'user',
    changes         JSONB        DEFAULT '{}',
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_org_audit_org ON tenant.organization_audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_audit_actor ON tenant.organization_audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_org_audit_entity ON tenant.organization_audit_logs(entity_type, entity_id);

COMMIT;