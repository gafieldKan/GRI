-- 由 @gri/codegen 生成，源自本体 DSL（单表继承）
-- 表：ontology_orders，判别列：order_type，差异化字段进 extra JSONB
--
-- P1 第五步「本体样板端到端打通」的落库样例（table: ontology_orders 显式覆盖，
-- 避开点餐既有 orders 表）。@gri/codegen 的「防生成器漂移」契约测试以本文件为准。
CREATE TABLE IF NOT EXISTS ontology_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_no VARCHAR(255) NOT NULL UNIQUE,
    status VARCHAR(255) NOT NULL,
    total_amount NUMERIC(14, 2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    order_type VARCHAR(32) NOT NULL,
    extra JSONB
);
CREATE INDEX IF NOT EXISTS idx_ontology_orders_order_type ON ontology_orders (order_type);
