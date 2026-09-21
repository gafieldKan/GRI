-- 008_unique_wrong_question.sql
-- 错题入账需 ON CONFLICT (user_id, question_id) 去重增量（M3/AI 双消费方共用一行）。
-- Postgres 无 ADD CONSTRAINT IF NOT EXISTS → 用 DO 块按名字幂等。
-- 因 question_id 允许 NULL，AI 去规范化行（question_id NULL + question_text）不受唯一约束影响（NULL!=NULL），可多条并存。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_wrong_questions_user_question'
      AND conrelid = 'edu.wrong_questions'::regclass
  ) THEN
    ALTER TABLE edu.wrong_questions
      ADD CONSTRAINT uq_wrong_questions_user_question UNIQUE (user_id, question_id);
  END IF;
END $$;