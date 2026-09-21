-- ============================================================================
-- GRI 重写 DDL 006：AI 学情垂直（M5 AI vertical）
--
-- 把旧 smartlens 的 13 张学情表收敛进单库 gri 的 edu.* schema（学情域，
-- 001 §4 已规划），支撑 Nest tuition 模块复刻旧 ai-tutor-backend 的 ~40 路由 +
-- LLM 链路。对齐 001 唯一映射点：所有「人」列 → public.users(id)；
-- externalId ≡ users.id 是唯一身份入口（identity 一律 req.auth.externalId）。
--
-- 兼容策略（旧 PK 是 varchar：math_pythagorean / student_001 / exam_… / wrong_…）：
--   * 目标表保留 UUID PK，另加可空 legacy_id VARCHAR，运行时按 legacy 串解析。
--   * 通用映射表 public._etl_entity_map(entity, legacy_id, new_id) 泛化既有
--     _etl_student_map，供 ETL 幂等 + 业务运行时 legacy id → uuid 双重消费。
--
-- 幂等：全部 IF NOT EXISTS / ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS。
-- 排序：本文件先在 BEGIN 事务里建**新表**（含 edu.exams 先于引用它的表），再扩既有表
-- （wrong_questions.exam_id 引用 edu.exams 时它已存在）→ 避免事务内前向 FK 报错。
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. 通用实体映射表（ETL 幂等 + legacy id 运行时解析）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public._etl_entity_map (
    entity    VARCHAR(40) NOT NULL,          -- 'students'|'knowledge_points'|'questions'|'exams'|'learning_plans'|...
    legacy_id VARCHAR(128) NOT NULL,
    new_id    UUID         NOT NULL,
    PRIMARY KEY (entity, legacy_id)
);

-- ---------------------------------------------------------------------------
-- 2. 新表：edu.exams（试卷）—— 先建，供后面 wrong_questions.exam_id 引用
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS edu.exams (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES public.users(id),
    subject         VARCHAR(50) NOT NULL,
    grade_level     VARCHAR(20),
    exam_date       TIMESTAMPTZ DEFAULT NOW(),
    exam_type       VARCHAR(32) DEFAULT 'manual',
    raw_images      JSONB,
    ocr_result      JSONB,
    parsed_questions JSONB,
    status          VARCHAR(20) DEFAULT 'pending',   -- 'pending'|'analyzed'|'failed'
    legacy_id       VARCHAR(128),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 3. 新表：edu.analysis_reports（学情分析报告）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS edu.analysis_reports (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id          UUID        REFERENCES edu.exams(id),
    user_id          UUID        NOT NULL REFERENCES public.users(id),
    knowledge_points JSONB,
    ability_dims     JSONB,
    error_attribution JSONB,
    peer_percentile  FLOAT,
    peer_avg_score   FLOAT,
    student_score    FLOAT,
    ai_suggestions   JSONB,
    weak_points      JSONB,
    strong_points    JSONB,
    legacy_id        VARCHAR(128),
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 4. 新表：edu.sessions（持久化教学会话 —— 替换旧内存 Map 的 SessionFSM）
--      phase + session_data JSONB 全量持久化 → 重启不丢、GET /sessions/:id 可由行重建。
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS edu.sessions (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID        NOT NULL REFERENCES public.users(id),
    knowledge_point_id UUID        REFERENCES edu.knowledge_points(id),
    phase              VARCHAR(32) NOT NULL DEFAULT 'welcome',
    status             VARCHAR(20) DEFAULT 'active',
    session_data       JSONB       NOT NULL DEFAULT '{}',
    legacy_id          VARCHAR(128),
    start_time         TIMESTAMPTZ DEFAULT NOW(),
    end_time           TIMESTAMPTZ,
    created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 5. 新表：edu.answer_records（答题记录 → practice/answer + user/stats）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS edu.answer_records (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID        NOT NULL REFERENCES public.users(id),
    question_id  UUID        REFERENCES edu.questions(id),
    session_id   UUID        REFERENCES edu.sessions(id),
    student_answer TEXT,
    is_correct   BOOLEAN,
    time_spent_ms INTEGER,
    legacy_id    VARCHAR(128),
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 6. 新表：edu.sr_queue（SM-2 间隔复习队列）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS edu.sr_queue (
    user_id      UUID NOT NULL REFERENCES public.users(id),
    question_id  UUID NOT NULL REFERENCES edu.questions(id),
    last_reviewed TIMESTAMPTZ,
    interval     INTEGER      DEFAULT 0,
    ease_factor  FLOAT        DEFAULT 2.5,
    repetitions  INTEGER      DEFAULT 0,
    next_review  TIMESTAMPTZ,
    updated_at   TIMESTAMPTZ  DEFAULT NOW(),
    PRIMARY KEY (user_id, question_id)
);

-- ---------------------------------------------------------------------------
-- 7. 新表：edu.reminders（学习提醒）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS edu.reminders (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES public.users(id),
    plan_id    UUID        REFERENCES edu.learning_plans(id),
    type       VARCHAR(32) NOT NULL,
    time       TIMESTAMPTZ,
    message    TEXT,
    sent       BOOLEAN     DEFAULT FALSE,
    sent_at    TIMESTAMPTZ,
    legacy_id  VARCHAR(128),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 8. 新表：edu.user_preferences（个人偏好；user_id 主键，缺省即默认）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS edu.user_preferences (
    user_id           UUID PRIMARY KEY REFERENCES public.users(id),
    daily_goal        INTEGER DEFAULT 15,
    reminder_time     VARCHAR(8),
    preferred_subjects TEXT[],
    preferred_difficulty VARCHAR(20),
    auto_play_audio   BOOLEAN DEFAULT TRUE,
    show_hints        BOOLEAN DEFAULT TRUE,
    show_explanations BOOLEAN DEFAULT TRUE,
    push_enabled      BOOLEAN DEFAULT TRUE,
    email_enabled     BOOLEAN DEFAULT TRUE,
    streak_reminder   BOOLEAN DEFAULT TRUE,
    weekly_report     BOOLEAN DEFAULT TRUE,
    achievement_alerts BOOLEAN DEFAULT TRUE,
    quiet_hours_start VARCHAR(8),
    quiet_hours_end   VARCHAR(8),
    sound_enabled     BOOLEAN DEFAULT TRUE,
    sound_volume      FLOAT   DEFAULT 1.0,
    haptic_enabled    BOOLEAN DEFAULT TRUE,
    analytics_enabled BOOLEAN DEFAULT TRUE,
    crash_reporting   BOOLEAN DEFAULT TRUE,
    personalized_ads  BOOLEAN DEFAULT FALSE,
    data_sync         BOOLEAN DEFAULT TRUE,
    auto_login        BOOLEAN DEFAULT FALSE,
    biometric_auth    BOOLEAN DEFAULT FALSE,
    session_timeout   INTEGER DEFAULT 30,
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 9. 新表：edu.achievements（成就）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS edu.achievements (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES public.users(id),
    code        VARCHAR(64) NOT NULL,
    name        VARCHAR(100),
    description TEXT,
    unlocked_at TIMESTAMPTZ,
    legacy_id   VARCHAR(128),
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (user_id, code)
);

-- ---------------------------------------------------------------------------
-- 10. 新表：edu.mastery_snapshots（知识点掌握度快照）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS edu.mastery_snapshots (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID        NOT NULL REFERENCES public.users(id),
    knowledge_point_id UUID        REFERENCES edu.knowledge_points(id),
    mastery_score      INTEGER,
    confidence_level   FLOAT,
    legacy_id          VARCHAR(128),
    calculated_at      TIMESTAMPTZ DEFAULT NOW(),
    created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 11. 扩表：edu.students
-- ---------------------------------------------------------------------------
ALTER TABLE edu.students ADD COLUMN IF NOT EXISTS legacy_id VARCHAR(64);

-- ---------------------------------------------------------------------------
-- 12. 扩表：edu.knowledge_points（补 AI 展示所需列）
-- ---------------------------------------------------------------------------
ALTER TABLE edu.knowledge_points ADD COLUMN IF NOT EXISTS subject          VARCHAR(32);
ALTER TABLE edu.knowledge_points ADD COLUMN IF NOT EXISTS grade_level      INTEGER;
ALTER TABLE edu.knowledge_points ADD COLUMN IF NOT EXISTS prerequisites    JSONB DEFAULT '[]';
ALTER TABLE edu.knowledge_points ADD COLUMN IF NOT EXISTS formula          TEXT;
ALTER TABLE edu.knowledge_points ADD COLUMN IF NOT EXISTS mastery          NUMERIC(3,2) DEFAULT 0;
ALTER TABLE edu.knowledge_points ADD COLUMN IF NOT EXISTS examples         JSONB DEFAULT '[]';
ALTER TABLE edu.knowledge_points ADD COLUMN IF NOT EXISTS common_mistakes  JSONB DEFAULT '[]';
ALTER TABLE edu.knowledge_points ADD COLUMN IF NOT EXISTS related_knowledge JSONB DEFAULT '[]';
ALTER TABLE edu.knowledge_points ADD COLUMN IF NOT EXISTS legacy_id        VARCHAR(64);

-- ---------------------------------------------------------------------------
-- 13. 扩表：edu.questions
-- ---------------------------------------------------------------------------
ALTER TABLE edu.questions ADD COLUMN IF NOT EXISTS content_latex TEXT;
ALTER TABLE edu.questions ADD COLUMN IF NOT EXISTS answer_latex  TEXT;
ALTER TABLE edu.questions ADD COLUMN IF NOT EXISTS explanation   TEXT;
ALTER TABLE edu.questions ADD COLUMN IF NOT EXISTS variant_of    UUID REFERENCES edu.questions(id);
ALTER TABLE edu.questions ADD COLUMN IF NOT EXISTS legacy_id     VARCHAR(64);

-- ---------------------------------------------------------------------------
-- 14. 统一 edu.wrong_questions：M3 写 user_id+question_id；AI 写 question_text
--     去规范行（question_id NULL 也合法，故放开 NOT NULL）。exam_id 引用 edu.exams
--     （本文件 2 已建该表，事务内此处安全）。
-- ---------------------------------------------------------------------------
ALTER TABLE edu.wrong_questions ALTER COLUMN question_id DROP NOT NULL;
ALTER TABLE edu.wrong_questions ADD COLUMN IF NOT EXISTS exam_id          UUID REFERENCES edu.exams(id);
ALTER TABLE edu.wrong_questions ADD COLUMN IF NOT EXISTS question_text    TEXT;
ALTER TABLE edu.wrong_questions ADD COLUMN IF NOT EXISTS question_type    VARCHAR(32);
ALTER TABLE edu.wrong_questions ADD COLUMN IF NOT EXISTS subject          VARCHAR(50);
ALTER TABLE edu.wrong_questions ADD COLUMN IF NOT EXISTS knowledge_point  VARCHAR(200);
ALTER TABLE edu.wrong_questions ADD COLUMN IF NOT EXISTS student_answer   TEXT;
ALTER TABLE edu.wrong_questions ADD COLUMN IF NOT EXISTS correct_answer   TEXT;
ALTER TABLE edu.wrong_questions ADD COLUMN IF NOT EXISTS error_type       VARCHAR(100);
ALTER TABLE edu.wrong_questions ADD COLUMN IF NOT EXISTS difficulty       FLOAT DEFAULT 0.5;
ALTER TABLE edu.wrong_questions ADD COLUMN IF NOT EXISTS mastery_level    VARCHAR(20);
ALTER TABLE edu.wrong_questions ADD COLUMN IF NOT EXISTS reviewed         BOOLEAN DEFAULT FALSE;
ALTER TABLE edu.wrong_questions ADD COLUMN IF NOT EXISTS mastered         BOOLEAN DEFAULT FALSE;
ALTER TABLE edu.wrong_questions ADD COLUMN IF NOT EXISTS review_count     INTEGER DEFAULT 0;
ALTER TABLE edu.wrong_questions ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMPTZ;
ALTER TABLE edu.wrong_questions ADD COLUMN IF NOT EXISTS legacy_id        VARCHAR(128);

-- ---------------------------------------------------------------------------
-- 15. 扩表：edu.learning_plans（补 AI 计划字段）
-- ---------------------------------------------------------------------------
ALTER TABLE edu.learning_plans ADD COLUMN IF NOT EXISTS plan_type       VARCHAR(20);
ALTER TABLE edu.learning_plans ADD COLUMN IF NOT EXISTS plan_period     VARCHAR(50);
ALTER TABLE edu.learning_plans ADD COLUMN IF NOT EXISTS plan_data       JSONB;
ALTER TABLE edu.learning_plans ADD COLUMN IF NOT EXISTS total_tasks     INTEGER;
ALTER TABLE edu.learning_plans ADD COLUMN IF NOT EXISTS completed_tasks INTEGER DEFAULT 0;
ALTER TABLE edu.learning_plans ADD COLUMN IF NOT EXISTS legacy_id       VARCHAR(128);

-- ---------------------------------------------------------------------------
-- 16. 扩表：edu.practice_sessions（补 AI 练习字段）
-- ---------------------------------------------------------------------------
ALTER TABLE edu.practice_sessions ADD COLUMN IF NOT EXISTS mode         VARCHAR(32);
ALTER TABLE edu.practice_sessions ADD COLUMN IF NOT EXISTS subject      VARCHAR(32);
ALTER TABLE edu.practice_sessions ADD COLUMN IF NOT EXISTS topic_id     UUID;
ALTER TABLE edu.practice_sessions ADD COLUMN IF NOT EXISTS questions    JSONB;
ALTER TABLE edu.practice_sessions ADD COLUMN IF NOT EXISTS answers      JSONB;
ALTER TABLE edu.practice_sessions ADD COLUMN IF NOT EXISTS stats        JSONB;
ALTER TABLE edu.practice_sessions ADD COLUMN IF NOT EXISTS duration     INTEGER;
ALTER TABLE edu.practice_sessions ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE edu.practice_sessions ADD COLUMN IF NOT EXISTS legacy_id    VARCHAR(128);

COMMIT;

-- ============================================================================
-- 索引：学情高频按 user_id（≡ externalId）检索，全部建索引（幂等）。
-- ============================================================================
DO $$
BEGIN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_kp_subject         ON edu.knowledge_points (subject)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_kp_legacy          ON edu.knowledge_points (legacy_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_questions_legacy   ON edu.questions (legacy_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_wq_legacy          ON edu.wrong_questions (legacy_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_plans_legacy       ON edu.learning_plans (legacy_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_exams_user         ON edu.exams (user_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_exams_legacy       ON edu.exams (legacy_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_reports_user       ON edu.analysis_reports (user_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_reports_exam       ON edu.analysis_reports (exam_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_sessions_user      ON edu.sessions (user_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_sessions_legacy    ON edu.sessions (legacy_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_answers_user       ON edu.answer_records (user_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_sr_next            ON edu.sr_queue (next_review)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_reminders_user     ON edu.reminders (user_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_achievements_user  ON edu.achievements (user_id)';
END $$;