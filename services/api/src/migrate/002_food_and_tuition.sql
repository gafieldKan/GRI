-- ============================================================================
-- GRI 重写 DDL 002：food（订餐域 public.*）+ tuition（学情域 edu.*）表
--
-- 对齐 001 单库地基，补齐 M2/M3 切片实际查询的表：
--   public.restaurants / dishes / orders / order_items
--   edu.knowledge_points / questions / wrong_questions / learning_plans / practice_sessions
--
-- FK 契约（001 §3.2 唯一映射点）：
--   * 所有「人」列 → public.users(id)；externalId ≡ users.id，写读唯一身份入口。
--   * 学情表不直接 FK edu.students.user_id 而指向 public.users(id)：
--     两者语义同键（students.user_id ≡ users.id），FK 到 users 更稳健——
--     无 students 行的非学生用户也可落学情数据，避免强制依赖 role=student。
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 订餐域（public schema —— 人 + 订餐默认域）
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.restaurants (
    id         UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    name       VARCHAR(150)     NOT NULL,
    address    VARCHAR(255)     NOT NULL,
    phone      VARCHAR(20),
    rating     NUMERIC(2,1)     DEFAULT 0,
    status     VARCHAR(20)      NOT NULL DEFAULT 'open',   -- 'open' | 'closed'
    created_at TIMESTAMPTZ      DEFAULT NOW(),
    updated_at TIMESTAMPTZ      DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.dishes (
    id            UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID             NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    name          VARCHAR(150)     NOT NULL,
    description   TEXT,
    price         NUMERIC(12,2)    NOT NULL,
    category      VARCHAR(50),
    image_url     VARCHAR(512),
    status        VARCHAR(20)      NOT NULL DEFAULT 'available',  -- 'available' | 'sold_out'
    created_at    TIMESTAMPTZ      DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.orders (
    id            UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID            NOT NULL REFERENCES public.users(id),
    restaurant_id UUID            NOT NULL REFERENCES public.restaurants(id),
    total_amount  NUMERIC(12,2)   NOT NULL,
    status        VARCHAR(20)     NOT NULL DEFAULT 'pending',   -- 'pending'|'paid'|'delivered'|'cancelled'
    created_at    TIMESTAMPTZ     DEFAULT NOW(),
    updated_at    TIMESTAMPTZ     DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.order_items (
    id       UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID           NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    dish_id  UUID           NOT NULL REFERENCES public.dishes(id),
    quantity INTEGER        NOT NULL CHECK (quantity >= 1),
    price    NUMERIC(12,2)  NOT NULL          -- 下单时锁定单价，服务端从库取，防客户端篡改
);

-- ---------------------------------------------------------------------------
-- 学情域（edu schema）
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS edu.knowledge_points (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(150) NOT NULL,
    description TEXT,
    level       VARCHAR(50),
    parent_id   UUID         REFERENCES edu.knowledge_points(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS edu.questions (
    id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    knowledge_point_id UUID         REFERENCES edu.knowledge_points(id),
    content            TEXT         NOT NULL,
    options            JSONB,                                -- 选择题选项 [{text,..}]
    answer             TEXT         NOT NULL,
    analysis           TEXT,
    difficulty         VARCHAR(20)  DEFAULT 'medium',        -- 'easy'|'medium'|'hard'
    type               VARCHAR(30)  DEFAULT 'multiple-choice',-- 'multiple-choice'|'short-answer'|'essay'
    created_at         TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS edu.wrong_questions (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID         NOT NULL REFERENCES public.users(id),
    question_id     UUID         NOT NULL REFERENCES edu.questions(id) ON DELETE CASCADE,
    wrong_count     INTEGER      NOT NULL DEFAULT 1,
    last_attempt_at TIMESTAMPTZ  DEFAULT NOW(),
    is_resolved     BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS edu.learning_plans (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID         NOT NULL REFERENCES public.users(id),
    title      VARCHAR(200) NOT NULL,
    start_date DATE,
    end_date   DATE,
    progress   NUMERIC(5,2) NOT NULL DEFAULT 0,
    status     VARCHAR(20)  NOT NULL DEFAULT 'active'   -- 'active'|'completed'|'archived'
);

CREATE TABLE IF NOT EXISTS edu.practice_sessions (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID         NOT NULL REFERENCES public.users(id),
    start_time TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    end_time   TIMESTAMPTZ,
    score      NUMERIC(5,2),
    status     VARCHAR(20)  NOT NULL DEFAULT 'in_progress'  -- 'in_progress'|'completed'
);

COMMIT;

-- 索引：鉴权/查询走 externalId(=users.id)，学情/订单按 user_id 高频检索，加索引。
DO $$
BEGIN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_orders_user        ON public.orders        (user_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_dishes_restaurant  ON public.dishes        (restaurant_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_wq_user            ON edu.wrong_questions  (user_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_questions_kp       ON edu.questions        (knowledge_point_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_plans_user         ON edu.learning_plans   (user_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_sessions_user      ON edu.practice_sessions(user_id)';
END $$;