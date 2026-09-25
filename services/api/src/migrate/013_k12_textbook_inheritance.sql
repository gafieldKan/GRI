-- ============================================================================
-- GRI 重写 DDL 013：K12 教材继承体系 + 012 防漂移对齐（结构先行 · 本体四特性）
--
-- 上游真源：packages/ontology/ontologies/k12-curriculum.ontology.yaml（schemaVersion 0.3.0）
-- 生成方式：@gri/codegen 混合模式生成（教材单表继承基表 + 六普通对象并存）+
--           人工审阅 ALTER（存量数据归一 + 012 文件 UNIQUE 漂移修复）。
--   红线：本体驱动——结构变更先改 YAML → codegen 产出 → 审阅合并，禁止绕过 YAML 手写结构 DDL。
--
-- 本体四特性落点（旧资产改造片 D）：
--   - 多态/继承：Textbook 抽象基类 + 六学科子类 → textbook_type 判别列 + extra JSONB（单表继承）
--   - 生命周期：textbook/textbook_chapter/status 三态机 draft→published→archived
--     （KnowledgePoint 状态机在 YAML 已扩 archived 终态，CHECK 见 §3）
--
-- 防漂移对齐（§2）：012 文件历史版对 Link 外键误加 UNIQUE（stage_id/textbook_id/
--   parent_id/from_kp/to_kp——cardinality: many 的 many:1 语义被写成 1:1）。
--   实机库经核对无此约束（import.mjs 建表路径正确），故 §2 仅修 012 文件本文档形态，
--   库侧无需 DROP（幂等：ADD/DROP IF EXISTS 均无害）。
--
-- 幂等：ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS / DO $$ BEGIN…EXCEPTION…END。
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. 教材单表继承：判别列 + extra JSONB（codegen 混合模式产出，索引名人工修正点号）
--    注：textbook 表已存在（012），CREATE TABLE IF NOT EXISTS 为 no-op，仅作文档锚点
-- ---------------------------------------------------------------------------

ALTER TABLE ontology.textbook ADD COLUMN IF NOT EXISTS textbook_type VARCHAR(32);
ALTER TABLE ontology.textbook ADD COLUMN IF NOT EXISTS extra JSONB;

-- 存量教材归一：按 subject_id 反查学科 code 填判别值（math.g7.pep → math）
UPDATE ontology.textbook t
   SET textbook_type = LOWER(s.code)
  FROM ontology.subject s
 WHERE t.subject_id = s.id
   AND (t.textbook_type IS NULL OR t.textbook_type = '');

-- 存量教材状态机归一：'active' → 'published'（012 旧默认值对齐新状态机词表）
UPDATE ontology.textbook SET status = 'published' WHERE status = 'active';
ALTER TABLE ontology.textbook ALTER COLUMN status SET DEFAULT 'draft';

-- 判别列补值后 NOT NULL 化（幂等：先 UPDATE 再 SET NOT NULL；新行由应用侧 import 保证带值）
-- 暂不强制 NOT NULL：import.mjs 升级前的旧写入路径无判别值，强制会把可恢复错误变硬故障。
-- CREATE INDEX 索引名带 schema 点号（idx_ontology.textbook_…）PG 语法不接受，人工修正：
CREATE INDEX IF NOT EXISTS idx_textbook_type ON ontology.textbook (textbook_type);

-- ---------------------------------------------------------------------------
-- 2. 章节生命周期列（YAML TextbookChapter.stateMachine 落位）
-- ---------------------------------------------------------------------------

ALTER TABLE ontology.textbook_chapter ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'published';

-- ---------------------------------------------------------------------------
-- 3. 状态机 CHECK 约束（YAML stateMachine 词表 → DB 硬门禁；fail-fast 的库侧延伸）
--    幂等：DO $$ 若约束已存在则跳过（PG 无 ADD CONSTRAINT IF NOT EXISTS）
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_textbook_status') THEN
    ALTER TABLE ontology.textbook ADD CONSTRAINT chk_textbook_status
      CHECK (status IN ('draft', 'published', 'archived'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_textbook_type') THEN
    ALTER TABLE ontology.textbook ADD CONSTRAINT chk_textbook_type
      CHECK (textbook_type IS NULL OR textbook_type IN ('math','chn','eng','phys','chem','bio'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_chapter_status') THEN
    ALTER TABLE ontology.textbook_chapter ADD CONSTRAINT chk_chapter_status
      CHECK (status IN ('draft', 'published', 'archived'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_kp_status') THEN
    ALTER TABLE edu.knowledge_points ADD CONSTRAINT chk_kp_status
      CHECK (status IN ('draft', 'reviewed', 'published', 'archived'));
  END IF;
END $$;

COMMIT;
