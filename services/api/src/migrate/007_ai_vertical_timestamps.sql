-- 007_ai_vertical_timestamps.sql
-- 补齐 ETL(etl-converge-ai) 与运行期写入所依赖的审计时间戳列。
-- 006 对"旧表补列"只在 002/003 已建的 edu.* 上做了业务列，未补 created_at/updated_at；
-- 本迁移幂等：仅在缺失时 ADD COLUMN。对 006 新建的成组表（exams/analysis_reports/…）无需处理。
ALTER TABLE edu.knowledge_points  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE edu.knowledge_points  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE edu.wrong_questions  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE edu.wrong_questions  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE edu.learning_plans    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE edu.learning_plans    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE edu.questions         ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();