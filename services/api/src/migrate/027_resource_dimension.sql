-- ============================================================================
-- GRI DDL 027：业务资源维度绑定 ontology.resource_dimension
--
-- 上游真源：packages/ontology/ontologies/resource-dimension.ontology.yaml
-- 生成方式：@gri/codegen 生成结构主体 + 人工审阅头注；禁绕过 YAML 手写结构 DDL
-- 语义：resource_type + resource_id 唯一标识业务资源；region/industry 落真实 FK
-- 粒度闭集：region level ∈ {country, province}；industry level = section
-- 兼容：不改 public.restaurants / tenant.organizations，不存 JSON 维度快照
-- 登记：由 run-migrations 在成功后写入 public._api_migrations
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 由 @gri/codegen 生成 —— resource-dimension.ontology.yaml（ResourceDimension）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ontology.resource_dimension (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_type VARCHAR(64) NOT NULL,
    resource_id UUID NOT NULL,
    region_id UUID,
    industry_id UUID,
    UNIQUE (resource_type, resource_id),
    FOREIGN KEY (region_id) REFERENCES ontology.region(id) ON DELETE SET NULL,
    FOREIGN KEY (industry_id) REFERENCES ontology.industry(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_resource_dimension_type ON ontology.resource_dimension (resource_type);
CREATE INDEX IF NOT EXISTS idx_resource_dimension_region ON ontology.resource_dimension (region_id);
CREATE INDEX IF NOT EXISTS idx_resource_dimension_industry ON ontology.resource_dimension (industry_id);

-- ---------------------------------------------------------------------------
-- 示例绑定：使用既有 dev 资源 ID；维度按外部锚点解析为真实 FK。
-- 若目标库尚未导入 seed-dev，区域/行业解析不到时本段自然不插入。
-- ---------------------------------------------------------------------------
WITH region AS (
    SELECT id FROM ontology.region
     WHERE node_id = '100000' AND level = 'country'
),
industry AS (
    SELECT id FROM ontology.industry
     WHERE code = 'I' AND level = 'section'
)
INSERT INTO ontology.resource_dimension
    (resource_type, resource_id, region_id, industry_id)
SELECT 'restaurant', 'b0000000-0000-0000-0000-000000000001', r.id, i.id
  FROM region r CROSS JOIN industry i
ON CONFLICT (resource_type, resource_id)
DO UPDATE SET region_id = EXCLUDED.region_id,
              industry_id = EXCLUDED.industry_id;

WITH region AS (
    SELECT id FROM ontology.region
     WHERE node_id = '100000' AND level = 'country'
)
INSERT INTO ontology.resource_dimension
    (resource_type, resource_id, region_id, industry_id)
SELECT 'organization', '10000000-0000-0000-0000-000000000001', r.id, NULL
  FROM region r
ON CONFLICT (resource_type, resource_id)
DO UPDATE SET region_id = EXCLUDED.region_id,
              industry_id = EXCLUDED.industry_id;

COMMIT;
