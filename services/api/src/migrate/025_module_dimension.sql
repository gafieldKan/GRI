-- ============================================================================
-- GRI DDL 025：模块双维度作用域 ontology.module_region / ontology.module_industry
--
-- 上游真源：packages/ontology/ontologies/app-module.ontology.yaml
-- 生成方式：@gri/codegen 生成结构主体 + 人工审阅头注；禁绕过 YAML 手写结构 DDL
-- 语义：未挂接模块 = 全维度可见；挂接后仅在命中区域/行业作用域时可见
-- 粒度闭集：region level ∈ {country, province}；industry level = section
-- 关联完整性：两表均使用真实 UUID FK，不存 JSON；不改既有 region/industry 表结构
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 由 @gri/codegen 生成 —— app-module.ontology.yaml（ModuleRegion / ModuleIndustry）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ontology.module_region (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id UUID NOT NULL,
    region_id UUID NOT NULL,
    UNIQUE (module_id, region_id),
    FOREIGN KEY (module_id) REFERENCES ontology.app_module(id) ON DELETE CASCADE,
    FOREIGN KEY (region_id) REFERENCES ontology.region(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_module_region_module ON ontology.module_region (module_id);
CREATE INDEX IF NOT EXISTS idx_module_region_region ON ontology.module_region (region_id);

CREATE TABLE IF NOT EXISTS ontology.module_industry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id UUID NOT NULL,
    industry_id UUID NOT NULL,
    UNIQUE (module_id, industry_id),
    FOREIGN KEY (module_id) REFERENCES ontology.app_module(id) ON DELETE CASCADE,
    FOREIGN KEY (industry_id) REFERENCES ontology.industry(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_module_industry_module ON ontology.module_industry (module_id);
CREATE INDEX IF NOT EXISTS idx_module_industry_industry ON ontology.module_industry (industry_id);

COMMIT;
