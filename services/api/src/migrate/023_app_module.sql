-- ============================================================================
-- GRI DDL 023：应用注册表 ontology.app_module（统一工作台模块目录）
--
-- 上游真源：packages/ontology/ontologies/app-module.ontology.yaml
-- 生成方式：@gri/codegen 生成结构主体 + 人工审阅头注；禁绕过 YAML 手写结构 DDL
-- 目录状态：本体仅存模块目录；用户选用状态由后续 S3 独立对象承接
-- 幂等：结构 IF NOT EXISTS；种子按 code 冲突更新
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. 由 @gri/codegen 生成 —— app-module.ontology.yaml（普通 Object）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ontology.app_module (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    short VARCHAR(255),
    description TEXT,
    icon VARCHAR(255),
    entry_url VARCHAR(255) NOT NULL,
    category VARCHAR(64) NOT NULL,
    allowed_roles JSONB NOT NULL,
    is_core BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(255) DEFAULT 'active',
    sort_order INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_app_module_status_sort ON ontology.app_module (status, sort_order);

-- ---------------------------------------------------------------------------
-- 2. 目录种子 —— 与 S1 的 9 个模块对齐（原本地目录已由本卡迁至后端）
-- ---------------------------------------------------------------------------
INSERT INTO ontology.app_module
    (code, name, short, description, icon, entry_url, category, allowed_roles, is_core, status, sort_order)
VALUES
    ('food', '订餐平台', '订餐', '浏览餐厅、菜品并完成订餐', '餐', '/food/', 'business', '["consumer","student","merchant","operator"]'::jsonb, TRUE, 'active', 10),
    ('tutor', '智学慧眼', '智学', 'AI 学习辅导与学情诊断', '学', '/tutor/', 'business', '["student","operator"]'::jsonb, TRUE, 'active', 20),
    ('org-admin', '组织管理台', '组织', '组织、成员与权限管理', '组', '/pages/console/index', 'admin', '["operator"]'::jsonb, TRUE, 'active', 30),
    ('ontology-stats', '开发全流程统计', '统计', '本体、数据库、迁移与开发过程统计', '统', '/pages/ontology-stats/index', 'tool', '["operator"]'::jsonb, TRUE, 'active', 40),
    ('identity', '身份中心', '身份', '身份与账号管理入口', '身', '', 'admin', '["operator"]'::jsonb, FALSE, 'active', 50),
    ('curriculum', '课程与学情', '课程', '课程体系与学习情况', '课', '', 'business', '["student","operator"]'::jsonb, FALSE, 'active', 60),
    ('dashboard', '经营看板', '看板', '经营数据分析入口', '经', '', 'business', '["merchant","operator"]'::jsonb, FALSE, 'active', 70),
    ('agent', 'AI 教师', 'AI 教师', '智能教学与答疑入口', '智', '', 'business', '["student","operator"]'::jsonb, FALSE, 'active', 80),
    ('twin', '学习孪生', '孪生', '学习过程与能力画像入口', '孪', '', 'business', '["student","operator"]'::jsonb, FALSE, 'active', 90)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    short = EXCLUDED.short,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon,
    entry_url = EXCLUDED.entry_url,
    category = EXCLUDED.category,
    allowed_roles = EXCLUDED.allowed_roles,
    is_core = EXCLUDED.is_core,
    status = EXCLUDED.status,
    sort_order = EXCLUDED.sort_order;

COMMIT;
