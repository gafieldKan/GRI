-- 009_agent.sql
-- 浓缩 AI Agent 底座表（@gri/agent-core 的持久层，与 edu.* 共库，不新开 schema）。
-- 设计意图（仿 OpenClaw：泛化推理环 + manifest-first + provider catalog + 一切能力即插件）：
--   agent.entities   每生（entity=public.users.id）一个独立 agent 行——"每生独立 AI 教师"。
--   agent.sessions   每轮/每次教学的会话，state JSONB 持久化 agent 内存态（开机不丢）。
--   agent.memory     按 entityId 隔离的跨会话持久记忆（家庭/偏好/掌握度/进度）。
--   agent.llm_routes 前台可配大模型路由（provider/model 切换；apiKey 永不入库，走 SecretRef/env）。
--   agent.mcp_servers v0 仅占位接线位（MCP client 排 v1+）。
--   agent.tool_runs  工具调用审计/可观测（哪个 agent 在哪个会话调了哪个工具、耗时）。
-- FK 根不变：entity_id 一律 REFERENCES public.users(id)（≡ req.auth.externalId）。
-- 幂等：全部 IF NOT EXISTS + CREATE INDEX IF NOT EXISTS。
-- ----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS agent;

-- 1. 每个实体的独立 agent（每生一行；kind 预留 student/dev/ops 等后续消费方）
CREATE TABLE IF NOT EXISTS agent.entities (
    entity_id  UUID PRIMARY KEY REFERENCES public.users(id),
    kind       VARCHAR(32)  NOT NULL DEFAULT 'student',
    name       VARCHAR(64),
    status     VARCHAR(16)  NOT NULL DEFAULT 'active',
    config     JSONB        NOT NULL DEFAULT '{}'::jsonb,   -- persona/system prompt 覆盖、默认路由等
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 2. 独立 agent 会话（每学生一次授课 = 一个 agent 会话；state 持久化循环内存态）
CREATE TABLE IF NOT EXISTS agent.sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id  UUID NOT NULL REFERENCES public.users(id),
    phase      VARCHAR(32)  NOT NULL DEFAULT 'welcome',
    status     VARCHAR(16)  NOT NULL DEFAULT 'active',
    state      JSONB        NOT NULL DEFAULT '{}'::jsonb,   -- roles 历史 / 诊断/测验进度 / 掌握度
    start_time TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    end_time   TIMESTAMPTZ,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_entity ON agent.sessions (entity_id, created_at DESC);

-- 3. 跨会话持久记忆（按 entityId 隔离；strength 供遗忘曲线，为 SM-2/偏好/掌握度预留）
CREATE TABLE IF NOT EXISTS agent.memory (
    entity_id  UUID NOT NULL REFERENCES public.users(id),
    fact_key   VARCHAR(96) NOT NULL,
    value      JSONB       NOT NULL,
    strength   FLOAT       NOT NULL DEFAULT 1.0,   -- 遗忘曲线强度
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (entity_id, fact_key)
);

-- 4. 前台可配大模型路由（provider/model 切换写表立即生效；apiKey 永不落表）
CREATE TABLE IF NOT EXISTS agent.llm_routes (
    route_key        VARCHAR(48) PRIMARY KEY,              -- 'default' / 'student=<id>' / 'kind=student'
    provider         VARCHAR(32)  NOT NULL DEFAULT 'nvidia',
    model            VARCHAR(96),
    multimodal_model VARCHAR(96),
    base_url         VARCHAR(255),
    enabled          BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
-- 缺省路由由 env 兜底（见 model-router.ts），此处不硬插行；admin 通过 API 增改覆盖。

-- 5. MCP server 配置表（v0 接线位占位：桥接外部 MCP 工具为 Tool，排 v1+ 启用）
CREATE TABLE IF NOT EXISTS agent.mcp_servers (
    name       VARCHAR(64) PRIMARY KEY,
    transport  VARCHAR(16)  NOT NULL DEFAULT 'stdio',        -- stdio / http / sse
    url        VARCHAR(255),
    config     JSONB        NOT NULL DEFAULT '{}'::jsonb,
    enabled    BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 6. 工具调用审计/可观测
CREATE TABLE IF NOT EXISTS agent.tool_runs (
    id         BIGSERIAL PRIMARY KEY,
    session_id UUID REFERENCES agent.sessions(session_id),
    entity_id  UUID REFERENCES public.users(id),
    tool_name  VARCHAR(64)   NOT NULL,
    args       JSONB         NOT NULL DEFAULT '{}'::jsonb,
    result     JSONB,
    latency_ms INT,
    created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_tool_runs_entity ON agent.tool_runs (entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_tool_runs_session ON agent.tool_runs (session_id);