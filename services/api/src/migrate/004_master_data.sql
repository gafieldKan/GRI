-- ============================================================================
-- GRI 重写 DDL 004：主数据（ontology schema）
--
-- 类型化引用主数据字典 —— 一个通用引用实体表，按 kind（关联本体 Object 名，如
-- Subject / Grade / AcademicTerm / MealCategory）+ label + code + 类型化 value(JSONB)。
-- 消费方（tuition 学科分类、food 餐别、前端下拉）统一读这里，避免各模块自造字典分歧。
-- 复用旧项目 master_data 表名，但抛弃旧 AdminTree/DAG 继承子系统（dated），改为
-- 干净的「kind 分类 + code 唯一 + value 类型化」形态，未来可把 kind 对其到 ontology Object。
-- ----------------------------------------------------------------------------
-- 注意：本表按 UNIQUE(kind, code) 幂等播种内置参考数据（ON CONFLICT DO NOTHING）。
-- 迁移会被记录表去重、只跑一次；若想本地重复，先 DELETE 相关行再手动跑 SQL。
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS ontology.master_data (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    kind        VARCHAR(50)  NOT NULL,          -- 关联本体 Object 名（如 'Subject'/'Grade'/'AcademicTerm'）
    label       TEXT         NOT NULL,          -- 展示名
    code        VARCHAR(100),                   -- 稳定编码（不与上面 kind 冲突）
    value       JSONB        DEFAULT '{}',      -- 类型化属性（经 ontology Object 约定，如 stage/order/year/semester）
    is_builtin  BOOLEAN      DEFAULT false,
    sort_order  INTEGER      DEFAULT 0,
    status      VARCHAR(20)  DEFAULT 'active',  -- 'active' | 'archived'
    created_at  TIMESTAMPTZ  DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  DEFAULT NOW(),
    UNIQUE (kind, code)
);
CREATE INDEX IF NOT EXISTS idx_mdata_kind ON ontology.master_data(kind);
CREATE INDEX IF NOT EXISTS idx_mdata_kind_status ON ontology.master_data(kind, status);

-- ----------------------------------------------------------------------------
-- 内置参考字典（幂等）。kind = 未来对齐的本体 Object 名。
-- ----------------------------------------------------------------------------
INSERT INTO ontology.master_data (kind, label, code, value, is_builtin, sort_order) VALUES
  -- 学科（tuition / 报名表单引用）
  ('Subject', '语文', 'CN',  '{"domain":"lang"}', true, 10),
  ('Subject', '数学', 'MATH','{"domain":"math"}', true, 20),
  ('Subject', '英语', 'EN',  '{"domain":"lang"}', true, 30),
  ('Subject', '物理', 'PHY', '{"domain":"science"}', true, 40),
  ('Subject', '化学', 'CHM', '{"domain":"science"}', true, 50),
  -- 学段
  ('SchoolStage', '小学', 'PRIMARY', '{"sort":1}', true, 10),
  ('SchoolStage', '初中', 'JUNIOR',  '{"sort":2}', true, 20),
  ('SchoolStage', '高中', 'SENIOR',  '{"sort":3}', true, 30),
  -- 年级（挂学段）
  ('Grade', '初一', 'G7', '{"stage":"JUNIOR","order":1}', true, 10),
  ('Grade', '初二', 'G8', '{"stage":"JUNIOR","order":2}', true, 20),
  ('Grade', '初三', 'G9', '{"stage":"JUNIOR","order":3}', true, 30),
  -- 学期
  ('AcademicTerm', '2026 春季', '2026SPRING', '{"year":2026,"semester":"spring"}', true, 10),
  ('AcademicTerm', '2026 秋季', '2026AUTUMN', '{"year":2026,"semester":"autumn"}', true, 20),
  -- 餐别（food 引用）
  ('MealCategory', '早餐', 'BREAKFAST', '{"sort":1}', true, 10),
  ('MealCategory', '午餐', 'LUNCH',     '{"sort":2}', true, 20),
  ('MealCategory', '晚餐', 'DINNER',    '{"sort":3}', true, 30)
ON CONFLICT (kind, code) DO NOTHING;

COMMIT;