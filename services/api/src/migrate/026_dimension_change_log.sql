-- ============================================================================
-- GRI DDL 026：维度变更审计 ontology.dimension_change_log（append-only）
--
-- 用途：区域/行业维度的**运行时维护**（改名称/移动/归档…）一律入此审计表，可追溯。
-- 上游：P3-S5/P3-C 治理；真源仍为 ontology.region/industry，本表只记变更流水。
-- 幂等：CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS。
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS ontology.dimension_change_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dimension   VARCHAR(32)  NOT NULL,               -- 'region' | 'industry'
    target_id   VARCHAR(64)  NOT NULL,               -- region.node_id | industry.code
    op          VARCHAR(32)  NOT NULL,               -- update | move | archive | create
    before      JSONB        DEFAULT '{}',
    after       JSONB        DEFAULT '{}',
    actor_id    UUID,                                -- public.users.id（externalId）
    source      VARCHAR(32)  DEFAULT 'manual',       -- manual | ai_command
    created_at  TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dim_change_dim_target ON ontology.dimension_change_log (dimension, target_id);
CREATE INDEX IF NOT EXISTS idx_dim_change_created ON ontology.dimension_change_log (created_at DESC);

COMMIT;
