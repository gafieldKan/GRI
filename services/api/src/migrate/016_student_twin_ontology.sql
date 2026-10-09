-- 016_student_twin_ontology.sql
-- 学生数字孪生 —— 结构回收进本体 YAML（@gri/codegen 生成，勿手改）。
--
-- 本文件由 packages/ontology/ontologies/student-twin.ontology.yaml 生成（S5 形式化）：
--   015 先以裸 SQL 垂直跑通 twin.event；本片把结构真源回收进 YAML，由 codegen 产出本迁移。
-- 与 015 结构等价（全部 IF NOT EXISTS）：老库上为幂等 no-op；新库由本文件建表。
-- 防漂移：packages/codegen/tests/twin.test.js 以孪生锚点锁 YAML ↔ 生成 SQL ↔ 迁移一致。
--
-- 结构变更只改 YAML，重跑：
--   node packages/codegen/src/cli.js packages/ontology/ontologies/student-twin.ontology.yaml \
--     --tracks sql --out-dir <dir>
-- ----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS twin;

-- 由 @gri/codegen 生成（普通 Object）
CREATE TABLE IF NOT EXISTS twin.event (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    text TEXT,
    source VARCHAR(255),
    scene_id VARCHAR(255),
    diffs JSONB DEFAULT '[]'::jsonb,
    before JSONB,
    after JSONB,
    at TIMESTAMPTZ DEFAULT NOW(),
    entity_id UUID NOT NULL,
    FOREIGN KEY (entity_id) REFERENCES public.users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_twin_event_entity_at ON twin.event (entity_id, at DESC);
