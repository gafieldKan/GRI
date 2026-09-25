-- ============================================================================
-- GRI 重写 DDL 012：K12 课程本体（ontology schema 六表 + edu.knowledge_points 对齐）
--
-- 上游真源：packages/ontology/ontologies/k12-curriculum.ontology.yaml
-- 生成方式：@gri/codegen 生成六表主体（本文 §1）+ 人工审阅 ALTER（§2，对齐 YAML 新列）。
--   结构变更必须先改 YAML → codegen 产出 → 审阅合并（红线：本体驱动，禁止绕过 YAML 手写结构 DDL）。
-- 2026-09 漂移修复：历史版对 Link 外键（stage_id/textbook_id/parent_id/from_kp/to_kp）
--   误加 UNIQUE（many:1 写成 1:1）——与实机库核对后修正（实机库从未有此约束）。
--   教材继承体系（textbook_type 判别列 + extra + 状态机）见 013 迁移。
--
-- 物理落位（施工方案「物理落位决策」）：
--   - 六张新表落 ontology schema（施工图 §3.1「本体引擎管」）；跨 schema FK 单库内 PG 原生支持
--   - edu.knowledge_points 不动只加列（chapter_id/code/status）——37 片工具链零破坏
--   - edu.students 加 current_subject（我的页选科持久化）
--
-- 幂等：CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS。
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. 由 @gri/codegen 生成（普通 Object）—— k12-curriculum.ontology.yaml
--    （id 主键兜底 + Link→外键 §6.1 + 复合唯一；与 YAML 生成输出一致）
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ontology.subject (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255),
    sort_order INTEGER,
    status VARCHAR(255) DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS ontology.school_stage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    sort_order INTEGER,
    grade_id UUID,
    FOREIGN KEY (grade_id) REFERENCES ontology.grade(id)
);

CREATE TABLE IF NOT EXISTS ontology.grade (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    sort_order INTEGER,
    stage_id UUID,
    FOREIGN KEY (stage_id) REFERENCES ontology.school_stage(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ontology.textbook (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    version VARCHAR(255),
    publisher VARCHAR(255),
    status VARCHAR(255) DEFAULT 'active',
    subject_id UUID,
    grade_id UUID,
    FOREIGN KEY (subject_id) REFERENCES ontology.subject(id) ON DELETE CASCADE,
    FOREIGN KEY (grade_id) REFERENCES ontology.grade(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ontology.textbook_chapter (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    sort_order INTEGER,
    textbook_id UUID,
    parent_id UUID,
    FOREIGN KEY (textbook_id) REFERENCES ontology.textbook(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES ontology.textbook_chapter(id) ON DELETE CASCADE
);

-- edu.knowledge_points 声明子集（已存在则 no-op，作模型文档；
-- 完整列见 002/006 迁移——本表是 37 片工具链的数据真源，不动只加列）
CREATE TABLE IF NOT EXISTS edu.knowledge_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    subject VARCHAR(255),
    grade_level INTEGER,
    chapter_id UUID,
    FOREIGN KEY (chapter_id) REFERENCES ontology.textbook_chapter(id)
);

CREATE TABLE IF NOT EXISTS ontology.kp_prerequisite (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_kp UUID,
    to_kp UUID,
    UNIQUE (from_kp, to_kp),
    FOREIGN KEY (from_kp) REFERENCES edu.knowledge_points(id) ON DELETE CASCADE,
    FOREIGN KEY (to_kp) REFERENCES edu.knowledge_points(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- 2. 人工审阅 ALTER —— 对齐 YAML 新列（edu.knowledge_points 不动只加列）
-- ---------------------------------------------------------------------------

ALTER TABLE edu.knowledge_points ADD COLUMN IF NOT EXISTS chapter_id UUID
    REFERENCES ontology.textbook_chapter(id);
-- 注：chapter_id 列已在 §1 的声明子集中定义（对已存在表 no-op 时由本 ALTER 兜底补列）
ALTER TABLE edu.knowledge_points ADD COLUMN IF NOT EXISTS code VARCHAR(120);
ALTER TABLE edu.knowledge_points ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'published';
-- 存量行（一元二次方程）视为已用：本迁移不回填 status，列默认 'published' 对旧行即生效
CREATE UNIQUE INDEX IF NOT EXISTS idx_kp_code ON edu.knowledge_points (code);
CREATE INDEX IF NOT EXISTS idx_kp_chapter ON edu.knowledge_points (chapter_id);

ALTER TABLE edu.students ADD COLUMN IF NOT EXISTS current_subject VARCHAR(32) DEFAULT 'math';

-- ---------------------------------------------------------------------------
-- 3. 索引（课程体系查询主路径：按学科/年级列表）
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_ontology_grade_stage ON ontology.grade (stage_id);
CREATE INDEX IF NOT EXISTS idx_chapter_textbook ON ontology.textbook_chapter (textbook_id);
CREATE INDEX IF NOT EXISTS idx_kp_subject_grade ON edu.knowledge_points (subject, grade_level);

COMMIT;
