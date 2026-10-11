-- 020_answer_records_session_fk.sql
-- P2-T5 会话级练习闭环：edu.answer_records.session_id 需落「练习会话」id（practice_sessions.id）。
-- 006 建表时 FK 误指向 edu.sessions（教学 FSM 会话，与练习会话不同域）；
-- 历史写入恒为 NULL（已核验 with_sid=0），无数据依赖，故安全重定向。
-- 本迁移为 N4 允许的「必要」例外：不重定向则 session_id 落库必触 FK 违约。
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'answer_records_session_id_fkey'
      AND conrelid = 'edu.answer_records'::regclass
  ) THEN
    ALTER TABLE edu.answer_records DROP CONSTRAINT answer_records_session_id_fkey;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'answer_records_session_id_fkey'
      AND conrelid = 'edu.answer_records'::regclass
  ) THEN
    ALTER TABLE edu.answer_records
      ADD CONSTRAINT answer_records_session_id_fkey
      FOREIGN KEY (session_id) REFERENCES edu.practice_sessions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 会话级进度/分析按 session_id 聚合，建索引（幂等）。
DO $$
BEGIN
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_answers_session ON edu.answer_records (session_id)';
END $$;
