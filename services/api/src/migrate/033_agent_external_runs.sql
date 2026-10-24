-- 033_agent_external_runs.sql
-- B-4 外部 agent 反馈回路：一次外部 agent 运行 = 一行可查状态（external_runs）+ 一路事件流（external_events）。
--
-- 设计意图（契约 docs/AGENT_PUBLIC_CONTRACT.md §二/§三）：
--   把「接入」从「能跑完」升级为「可观测、可查询、可续接、可告警」。
--   每次委派（sync 与 async 统一）先建一行 running，跑完落终态（done/failed + summary/exit_code/timed_out/error_code/latency_ms）。
--   事件逐行落 external_events（kind ∈ started|tool_use|assistant_delta|result|error），供 SSE 增量下发与事后回看。
-- 反转/边界声明（C3 事件不落敏感面）：
--   external_events.data 只存 **child 派生内容**（文本/工具名/sessionId），**绝不**存 argv/prompt/密钥。
--   goal 文本按既有审计（agent.tool_runs.args）同级存 external_runs.goal（运营可读）；其保留期策略属 W3，不在本卡。
-- 所有权铁律：读侧一律按 entity_id（≡ req.auth.externalId ≡ public.users.id）隔离。
-- FK 根不变：entity_id → public.users(id)（与 009/032 同约定）。
-- 写入一律 best-effort（失败静默不阻断对话，与 agent.tool_runs 审计同格）。
-- 幂等：IF NOT EXISTS；重复执行安全（迁移运行器另有 _api_migrations 记录表）。
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent.external_runs (
    run_id      UUID        PRIMARY KEY,
    entity_id   UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    backend     TEXT,                                        -- 外部 agent 后端 id（claude-code/codex/openclaw/hermes…）
    goal        TEXT,                                        -- 委派目标（与 tool_runs.args 同级审计面）
    mode        TEXT        NOT NULL DEFAULT 'sync' CHECK (mode IN ('sync', 'async')),
    resume_key  TEXT,                                        -- 续接 id（session_id/thread_id），run 完成时落库
    status      TEXT        NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'failed')),
    error_code  TEXT,                                        -- failed 必带（TIMEOUT|NONZERO_EXIT|EMPTY_TEXT|BACKEND_NOT_FOUND|GOAL_MISSING|CWD_DENIED|REGISTRY_NOT_INJECTED|INTERRUPTED）
    summary     TEXT,                                        -- 成功摘要（终态文本）；失败时为 null
    exit_code   INT,
    timed_out   BOOLEAN     NOT NULL DEFAULT FALSE,
    latency_ms  INT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);

-- 查询面：本人最近 run（GET /api/v1/agent/delegate/runs，按 created_at desc）。
CREATE INDEX IF NOT EXISTS ix_external_runs_entity_created
    ON agent.external_runs (entity_id, created_at DESC);

-- 事件流：一次 run 的多条事件（run_id + id 单调递增，供 SSE 增量下发）。
CREATE TABLE IF NOT EXISTS agent.external_events (
    id         BIGSERIAL   PRIMARY KEY,
    run_id     UUID        NOT NULL REFERENCES agent.external_runs(run_id) ON DELETE CASCADE,
    kind       TEXT        NOT NULL,                         -- started|tool_use|assistant_delta|result|error
    data       JSONB,                                        -- 只存 child 派生内容（不含 argv/prompt/密钥）
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SSE 增量下发按 (run_id, id) 有序扫描。
CREATE INDEX IF NOT EXISTS ix_external_events_run_id
    ON agent.external_events (run_id, id);
