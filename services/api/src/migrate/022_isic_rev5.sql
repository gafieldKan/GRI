-- ============================================================================
-- GRI DDL 022：ISIC Rev.5 行业分类本体（ontology.industry 自引用树，「行业」主轴）
--
-- 上游真源：packages/ontology/ontologies/isic-rev5.ontology.yaml
-- 生成方式：@gri/codegen 生成主体（§1）+ 人工审阅头注（红线：本体驱动，禁绕过 YAML 手写结构 DDL）
-- 数据轨：scripts/reference-data/import.mjs 幂等灌库（结构轨/数据轨分离，照 k12-curriculum 惯例）
--
-- 层级（自引用树；832 节点实测）：
--   root(1)→system(1)→section(22 门类)→division(87 大类)→group(258 中类)→class(463 小类)
-- 锚点：code 全局唯一（实测 0 重复）→ 唯一灌库键。
--
-- 幂等：CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS。
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. 由 @gri/codegen 生成 —— isic-rev5.ontology.yaml（普通 Object + 自引用 Link）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ontology.industry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    short VARCHAR(255),
    en VARCHAR(255),
    level VARCHAR(64) NOT NULL,
    section VARCHAR(255),
    intro TEXT,
    includes TEXT,
    also TEXT,
    excludes TEXT,
    refs JSONB,
    updated BOOLEAN,
    sort_order INTEGER,
    status VARCHAR(255) DEFAULT 'active',
    parent_id UUID,
    FOREIGN KEY (parent_id) REFERENCES ontology.industry(id)
);
CREATE INDEX IF NOT EXISTS idx_industry_level ON ontology.industry (level);
CREATE INDEX IF NOT EXISTS idx_industry_parent ON ontology.industry (parent_id);
CREATE INDEX IF NOT EXISTS idx_industry_section ON ontology.industry (section);

COMMIT;
