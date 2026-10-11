-- ============================================================================
-- GRI DDL 021：UN 区域划分本体（ontology.region 自引用树，「地理」主轴）
--
-- 上游真源：packages/ontology/ontologies/un-regions.ontology.yaml
-- 生成方式：@gri/codegen 生成主体（§1）+ 人工审阅头注（红线：本体驱动，禁绕过 YAML 手写结构 DDL）
-- 数据轨：scripts/reference-data/import.mjs 幂等灌库（结构轨/数据轨分离，照 k12-curriculum 惯例）
--
-- 层级（自引用树，单一 parent 链；7999 节点实测）：
--   world(1)→region(5)→subregion(17)→intermediate(7)→country(248)→province(34)→admin1(4484)→city(333)→district(2870)
-- 锚点决策：源数字 id 全局唯一 → node_id 唯一锚点；code 存在 60 组重复（admin1 层瑕疵）→ 仅索引。
--
-- 幂等：CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS。
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. 由 @gri/codegen 生成 —— un-regions.ontology.yaml（普通 Object + 自引用 Link）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ontology.region (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id VARCHAR(255) NOT NULL UNIQUE,
    code VARCHAR(255),
    name VARCHAR(255) NOT NULL,
    short VARCHAR(255),
    english VARCHAR(255),
    level VARCHAR(64) NOT NULL,
    iso2 VARCHAR(255),
    iso3 VARCHAR(255),
    center JSONB,
    admin_type VARCHAR(255),
    alias VARCHAR(255),
    note TEXT,
    source VARCHAR(255),
    sort_order INTEGER,
    status VARCHAR(255) DEFAULT 'active',
    parent_id UUID,
    FOREIGN KEY (parent_id) REFERENCES ontology.region(id)
);
CREATE INDEX IF NOT EXISTS idx_region_level ON ontology.region (level);
CREATE INDEX IF NOT EXISTS idx_region_parent ON ontology.region (parent_id);
CREATE INDEX IF NOT EXISTS idx_region_code ON ontology.region (code);

COMMIT;
