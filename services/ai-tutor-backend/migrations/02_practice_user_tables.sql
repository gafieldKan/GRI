-- 02_practice_user_tables.sql
-- 补充练习中心、间隔复习(SM-2)、用户偏好、提醒、成就等模块所依赖的表与列
-- 这些表/列此前仅通过零散的一次性脚本创建，首次全新部署时会缺失导致接口报错。
-- 迁移日期：2026-08-28

-- ============================================
-- 1. knowledge_points 扩展字段（题库/知识点详情页所需）
-- ============================================
ALTER TABLE knowledge_points
    ADD COLUMN IF NOT EXISTS formula TEXT,
    ADD COLUMN IF NOT EXISTS mastery DECIMAL(3,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS examples JSONB DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS common_mistakes JSONB DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS related_knowledge JSONB DEFAULT '[]';

-- ============================================
-- 2. 练习会话表 practice_sessions
-- ============================================
CREATE TABLE IF NOT EXISTS practice_sessions (
    id VARCHAR(64) PRIMARY KEY,
    student_id VARCHAR(64) NOT NULL,
    mode VARCHAR(32) NOT NULL,
    subject VARCHAR(32),
    topic_id VARCHAR(64),
    questions JSONB,
    answers JSONB,
    stats JSONB,
    duration INTEGER,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS practice_sessions_student_idx ON practice_sessions(student_id);
CREATE INDEX IF NOT EXISTS practice_sessions_completed_idx ON practice_sessions(completed_at);

-- ============================================
-- 3. 间隔复习队列 sr_queue（SM-2）
-- ============================================
CREATE TABLE IF NOT EXISTS sr_queue (
    student_id VARCHAR(64) NOT NULL,
    question_id VARCHAR(64) NOT NULL,
    last_reviewed TIMESTAMP,
    interval INTEGER DEFAULT 0,
    ease_factor FLOAT DEFAULT 2.5,
    repetitions INTEGER DEFAULT 0,
    next_review TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (student_id, question_id)
);

CREATE INDEX IF NOT EXISTS sr_queue_next_review_idx ON sr_queue(next_review);

-- ============================================
-- 4. 学习提醒表 reminders
-- ============================================
CREATE TABLE IF NOT EXISTS reminders (
    id VARCHAR(64) PRIMARY KEY,
    student_id VARCHAR(64) NOT NULL,
    plan_id VARCHAR(64),
    type VARCHAR(32) NOT NULL,
    time TIMESTAMP,
    message TEXT,
    sent BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS reminders_student_idx ON reminders(student_id);

-- ============================================
-- 5. 用户偏好表 user_preferences
-- ============================================
CREATE TABLE IF NOT EXISTS user_preferences (
    student_id VARCHAR(64) PRIMARY KEY,
    daily_goal INTEGER DEFAULT 15,
    reminder_time VARCHAR(8),
    preferred_subjects TEXT[],
    preferred_difficulty VARCHAR(20),
    auto_play_audio BOOLEAN DEFAULT TRUE,
    show_hints BOOLEAN DEFAULT TRUE,
    show_explanations BOOLEAN DEFAULT TRUE,
    push_enabled BOOLEAN DEFAULT TRUE,
    email_enabled BOOLEAN DEFAULT TRUE,
    streak_reminder BOOLEAN DEFAULT TRUE,
    weekly_report BOOLEAN DEFAULT TRUE,
    achievement_alerts BOOLEAN DEFAULT TRUE,
    quiet_hours_start VARCHAR(8),
    quiet_hours_end VARCHAR(8),
    sound_enabled BOOLEAN DEFAULT TRUE,
    sound_volume FLOAT DEFAULT 1.0,
    haptic_enabled BOOLEAN DEFAULT TRUE,
    analytics_enabled BOOLEAN DEFAULT TRUE,
    crash_reporting BOOLEAN DEFAULT TRUE,
    personalized_ads BOOLEAN DEFAULT FALSE,
    data_sync BOOLEAN DEFAULT TRUE,
    auto_login BOOLEAN DEFAULT FALSE,
    biometric_auth BOOLEAN DEFAULT FALSE,
    session_timeout INTEGER DEFAULT 30,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 6. 成就表 achievements
-- ============================================
CREATE TABLE IF NOT EXISTS achievements (
    id VARCHAR(64) PRIMARY KEY,
    student_id VARCHAR(64) NOT NULL,
    code VARCHAR(64) NOT NULL,
    name VARCHAR(100),
    description TEXT,
    unlocked_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (student_id, code)
);

CREATE INDEX IF NOT EXISTS achievements_student_idx ON achievements(student_id);

-- ============================================
-- 7. 物理/化学知识点种子数据
-- ============================================
INSERT INTO knowledge_points (id, name, subject, grade_level, description, prerequisites) VALUES
    ('phys_measurement', '测量与误差', 'phys', 8, '长度、时间、质量的测量与误差', '{}'),
    ('phys_sound', '声现象', 'phys', 8, '声音的产生、传播和特性', '{}'),
    ('phys_light_propagation', '光的直线传播', 'phys', 8, '光的直线传播、反射和折射', '{}'),
    ('phys_lens', '透镜及其应用', 'phys', 8, '凸透镜成像规律和应用', '{"phys_light_propagation"}'),
    ('phys_motion', '机械运动', 'phys', 8, '参照物、速度、匀速直线运动', '{"math_linear_function"}'),
    ('phys_density', '质量与密度', 'phys', 8, '质量和密度的概念与计算', '{"math_ratio"}'),
    ('phys_force', '力', 'phys', 9, '力的概念、重力、弹力、摩擦力', '{"phys_motion"}'),
    ('phys_newton_laws', '牛顿运动定律', 'phys', 9, '牛顿第一、二、三定律', '{"phys_force"}'),
    ('phys_pressure', '压强', 'phys', 9, '压强、液体压强、大气压强', '{"phys_force"}'),
    ('phys_buoyancy', '浮力', 'phys', 9, '阿基米德原理和浮沉条件', '{"phys_pressure","phys_density"}'),
    ('phys_work_energy', '功和机械能', 'phys', 9, '功、功率、动能和势能', '{"phys_force"}'),
    ('phys_simple_machine', '简单机械', 'phys', 9, '杠杆、滑轮、斜面', '{"phys_force"}'),
    ('phys_circuit_basic', '电路基础', 'phys', 9, '电流、电压、电阻和欧姆定律', '{"math_linear_equation"}'),
    ('phys_electric_power', '电功率', 'phys', 9, '电功和电功率的计算', '{"phys_circuit_basic"}'),
    ('chem_matter_properties', '物质的性质与变化', 'chem', 9, '物理变化和化学变化的区分', '{}'),
    ('chem_elements', '元素与元素符号', 'chem', 9, '常见元素的名称和符号', '{}'),
    ('chem_atom_structure', '原子结构', 'chem', 9, '原子的构成、核外电子排布', '{"chem_elements"}'),
    ('chem_chemical_formula', '化学式与化合价', 'chem', 9, '化学式的书写和化合价计算', '{"chem_elements"}'),
    ('chem_chemical_equation', '化学方程式', 'chem', 9, '化学方程式的书写和配平', '{"chem_chemical_formula"}'),
    ('chem_oxygen', '氧气', 'chem', 9, '氧气的性质和制法', '{"chem_chemical_equation"}'),
    ('chem_water', '水', 'chem', 9, '水的组成和净化', '{"chem_chemical_equation"}'),
    ('chem_solution', '溶液', 'chem', 9, '溶液、溶解度、溶质质量分数', '{"chem_water","math_percent"}'),
    ('chem_acid_base_salt', '酸碱盐', 'chem', 9, '常见的酸、碱、盐及其反应', '{"chem_chemical_equation"}')
ON CONFLICT (id) DO NOTHING;