-- ============================================================================
-- GRI 重写 DDL 001：单库 gri 多 schema 地基
--
-- 目标（施工图 §3）：把旧项目 2 业务库（gri_db 订餐 + smartlens AI）+ 1 身份库
-- （gri_auth）收敛为 **单库 gri，多 schema 分区**：
--   auth     — 身份域（原 gri_auth，由 auth-center 独占）
--   public   — 人 + 订餐域（原 gri_db）
--   edu      — 学情域（原 smartlens）
--   tenant   — 组织/成员/角色/邀请（原 backend organization 摘要）
--   ontology — 本体引擎主数据（原 gri_db master_data/rule_*）
--
-- 核心根治点（蓝图 §3.2）：users / students 合一。
--   旧 gri_db.users(id uuid) 与 smartlens.students(id varchar) 是同一「人」的两个
--   投影，靠 auth.identities.external_id(varchar) 跨域翻译。收敛后：
--     auth.identities.external_id  ===  public.users.id  （唯一映射点，UUID 类型）
--     edu.students.user_id          ===  public.users.id  （学习档案扩展，不再独立主键）
--   所有业务表（订单/学情/组织）外键统一指向 public.users.id。
--
-- 执行前提：已在目标 PG 实例创建 `gri` 库，并以超级用户连接。
--   本脚本用 `CREATE SCHEMA ... AUTHORIZATION` + `gen_random_uuid()`（需 pgcrypto 或 PG13+ 内置）。
--   PG 15+ 内置 gen_random_uuid()，本仓库旧库为 PG 14/16，故不显式依赖扩展。
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. schema 分区
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS public;      -- 已存在则跳过；保留为「人 + 订餐」默认域
CREATE SCHEMA IF NOT EXISTS edu;
CREATE SCHEMA IF NOT EXISTS tenant;
CREATE SCHEMA IF NOT EXISTS ontology;

-- ---------------------------------------------------------------------------
-- 2. 人（public.users）—— 唯一业务主键，全库 FK 都指这里
--     列：承接旧 gri_db.users（去掉 password_hash，它归 auth.identities 管）
--     + role 标识『consumer/student/merchant/operator』（一人可多角色）
--     必须先于 auth.identities 创建：identities.external_id 的 FK 指向本表 id。
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),   -- 业务主键（全库 FK 目标）
    username      VARCHAR(100) NOT NULL,
    email         VARCHAR(255),
    phone         VARCHAR(20),
    name          VARCHAR(100),
    avatar_url    VARCHAR(512),
    role          VARCHAR(32)  NOT NULL DEFAULT 'consumer',     -- 'consumer'|'student'|'merchant'|'operator'
    status        VARCHAR(20)  DEFAULT 'active',
    created_at    TIMESTAMPTZ  DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  DEFAULT NOW(),
    deleted_at    TIMESTAMPTZ
);
-- 登录凭证在 auth.identities 里；identity.external_id 回指本表 id。

-- ---------------------------------------------------------------------------
-- 3. 身份域（auth schema）—— 承接 gri_auth 的 identities / identity_links / refresh_tokens
--     与 auth-center/migrate/001_init_identity.sql 对齐，但把 external_id 从
--     VARCHAR(64) 收紧为 UUID 类型，指向 public.users.id（唯一映射点）。
-- ---------------------------------------------------------------------------

-- 统一主体身份（唯一身份真源，auth-center 独占读写）
CREATE TABLE IF NOT EXISTS auth.identities (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),   -- 统一主体 id（= JWT sub）
    domain        VARCHAR(20)  NOT NULL,                        -- 'food' | 'tutor'
    username      VARCHAR(100) UNIQUE,
    email         VARCHAR(255) UNIQUE,
    phone         VARCHAR(20)  UNIQUE,
    password_hash VARCHAR(255),                                  -- bcrypt；学生可空
    name          VARCHAR(100),
    external_id   UUID NOT NULL,                                 -- → public.users.id（业务主键）
    status        VARCHAR(20)  DEFAULT 'active',
    created_at    TIMESTAMPTZ  DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  DEFAULT NOW(),
    CONSTRAINT fk_identities_user FOREIGN KEY (external_id)
        REFERENCES public.users(id) ON DELETE CASCADE
);

-- 多身份链接（幂等）：一个 identity 可关联多个原域账户（一人订餐 + 学生）
CREATE TABLE IF NOT EXISTS auth.identity_links (
    identity_id  UUID NOT NULL REFERENCES auth.identities(id) ON DELETE CASCADE,
    domain       VARCHAR(20) NOT NULL,
    external_id  UUID NOT NULL,
    PRIMARY KEY (domain, external_id)
);

-- refresh token（opaque，可吊销/轮转）
CREATE TABLE IF NOT EXISTS auth.refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identity_id UUID NOT NULL REFERENCES auth.identities(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL,
    device      TEXT,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 4. 学生学习档案（edu.students）—— users 的 1:0..1 扩展，仅 role='student' 存在
--     根治：不再有独立 varchar 主键 student_001，主键直接是 user_id。
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS edu.students (
    user_id          UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    name             VARCHAR(100),
    grade            INTEGER,
    parent_id        UUID REFERENCES public.users(id),          -- 家长（也可是 users）
    avatar_url       VARCHAR(512),
    textbook_version VARCHAR(100),
    school           VARCHAR(255),
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

COMMIT;

-- ============================================================================
-- 备注：
--   - 本文件是「地基」三表（auth.identities → public.users → edu.students）+ schema 分区。
--   - 后续 002_ 起再建 food.*（orders/restaurants/dishes/payments）FK 指向 public.users.id，
--     以及 edu.* 学情表 FK 指向 edu.students.user_id，tenant.* 组织表，ontology.* 主数据表。
--   - ETL 回填脚本（varchar student_id → uuid user_id）在 src/migrate/etl-converge.ts。
-- ============================================================================