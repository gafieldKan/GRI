-- ============================================================================
-- GRI DDL 028：UN CPC Ver.3.0 资源分类主数据 ontology.resource
--
-- 上游真源：packages/ontology/ontologies/un-cpc.ontology.yaml
-- 生成方式：@gri/codegen 生成结构主体 + 人工审阅头注；禁绕过 YAML 手写结构 DDL
-- 语义：code 为唯一稳定锚点，parent_id 自引用构成 section→subclass 树
-- 生命周期：draft→active→archived；twinActive 仅作后续实例/孪生切片预留
-- 数据轨：scripts/reference-data/import.mjs（本迁移只建结构，不灌数据）
-- 登记：由 run-migrations 在成功后写入 public._api_migrations
-- ============================================================================

BEGIN;

-- 由 @gri/codegen 生成（普通 Object）
CREATE TABLE IF NOT EXISTS ontology.resource (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(255) NOT NULL UNIQUE,
    name TEXT NOT NULL,
    level VARCHAR(64) NOT NULL CHECK (level IN ('section', 'division', 'group', 'class', 'subclass')),
    sort_order INTEGER,
    status VARCHAR(64) DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived')),
    twin_active BOOLEAN DEFAULT FALSE,
    parent_id UUID,
    FOREIGN KEY (parent_id) REFERENCES ontology.resource(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_resource_level ON ontology.resource (level);
CREATE INDEX IF NOT EXISTS idx_resource_parent_id ON ontology.resource (parent_id);

COMMIT;
