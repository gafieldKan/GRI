-- ============================================================================
-- GRI DDL 024：用户插件选用 ontology.user_module
--
-- 上游真源：packages/ontology/ontologies/app-module.ontology.yaml
-- 生成方式：@gri/codegen 生成结构主体 + 人工审阅头注；禁绕过 YAML 手写结构 DDL
-- 语义：行存在代表已选用；只记偏好，不参与模块授权；可用性仍由 app_module 角色过滤决定
-- 唯一性：(user_id, module_code) 唯一，enable/disable 由服务层幂等执行
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 由 @gri/codegen 生成 —— app-module.ontology.yaml（普通 Object）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ontology.user_module (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    module_code VARCHAR(255) NOT NULL,
    UNIQUE (user_id, module_code)
);

COMMIT;
