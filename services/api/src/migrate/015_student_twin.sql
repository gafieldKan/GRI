-- 015_student_twin.sql
-- 学生数字孪生 —— 行为时间线（事件溯源，append-only）。
--
-- 设计意图（对齐人本论：人的第一视角 → 以人引出万物 → 由万物引出本体）：
--   孪生体 = 「人本体」的可执行运行时。身份/状态/记忆**不落新表**，一律复用既成真源：
--     · 身份 profile  → public.users + edu.students（identity 门面）
--     · 状态 state    → edu.*（答题/练习/错题）+ edu.mastery_snapshots（能力雷达）
--     · 记忆 memories → agent.memory（每生 AI 教师的跨会话记忆，即「人记得的事」）
--   本表只承载「经历」——每次学习行为的前后快照 + 差异，供时间线（行为与记忆）
--   与状态回放（replay）。结构对齐原型 PERSONA C1 的 events[]（before/after/diffs）。
--
-- 结构轨说明：本表先以裸 SQL 落位（「先垂直跑通」阶段）；S5 将回收进
--   packages/ontology/ontologies/student-twin.ontology.yaml（本体驱动，codegen 生成）。
--
-- 幂等：全部 IF NOT EXISTS + CREATE INDEX IF NOT EXISTS。
-- ----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS twin;

-- 行为时间线：一条 = 一次有意义的变更（登录/改画像/移动/学习行动/存记忆/改设置）。
-- FK 根不变：entity_id 一律 REFERENCES public.users(id)（≡ req.auth.externalId，每生一孪生）。
CREATE TABLE IF NOT EXISTS twin.event (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id  UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    kind       VARCHAR(32) NOT NULL,              -- system/session/profile/world/action/memory/settings
    title      VARCHAR(120) NOT NULL,
    text       TEXT,
    source     VARCHAR(60),                       -- 来源（用户操作/回填/AI 教师…）
    scene_id   VARCHAR(80),                       -- 所在 KnowledgeArea.code（登峰营地；可空）
    diffs      JSONB       NOT NULL DEFAULT '[]'::jsonb,  -- [{label,before,after}]
    before     JSONB,                             -- 变更前状态快照（可空）
    after      JSONB,                             -- 变更后状态快照（可空）
    at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_twin_event_entity_at ON twin.event (entity_id, at DESC);
