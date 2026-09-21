-- 010_agent_diagnosis.sql —— AI 教师数据驱动会诊地基
-- 让 edu.mastery_snapshots 从「ETL 只灌一次的死表」变成「每 生每 KP 一行」的运行时掌握度模型：
-- AI 教师经 diagnosis.state 工具读作答/错题算掌握度后，UPSERT 到这张表，agent 端无需再自建掌握度模型。
CREATE UNIQUE INDEX IF NOT EXISTS uq_mastery_snapshots_user_kp
  ON edu.mastery_snapshots (user_id, knowledge_point_id);