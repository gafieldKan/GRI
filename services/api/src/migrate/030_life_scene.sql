-- ============================================================================
-- GRI DDL 030：人本世界本体 ontology.life_*
--
-- 上游真源：packages/ontology/ontologies/life-scene.ontology.yaml
-- 生成方式：@gri/codegen 生成结构主体 + 人工审阅头注；禁绕过 YAML 手写结构 DDL
-- 语义：LifeScene 是生活主题场景闭集；LifeIntent 表达场景内意向；
--       SceneModuleLink 把场景/意向语义映射到 ontology.app_module.code。
-- 边界：本迁移只立人本世界，不建模块内容世界或学科版图。
-- 登记：由 run-migrations 在成功后写入 public._api_migrations
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 由 @gri/codegen 生成 —— life-scene.ontology.yaml
-- ---------------------------------------------------------------------------
-- 由 @gri/codegen 生成（普通 Object）
CREATE TABLE IF NOT EXISTS ontology.life_scene (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    en VARCHAR(255),
    theme VARCHAR(255) NOT NULL,
    icon VARCHAR(255),
    pos_x NUMERIC(14, 2),
    pos_y NUMERIC(14, 2),
    sort_order INTEGER NOT NULL,
    status VARCHAR(255) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_life_scene_status_sort ON ontology.life_scene (status, sort_order);

-- 由 @gri/codegen 生成（普通 Object）
CREATE TABLE IF NOT EXISTS ontology.life_intent (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scene_code VARCHAR(255) NOT NULL,
    code VARCHAR(255) NOT NULL,
    label VARCHAR(255) NOT NULL,
    description TEXT,
    sort_order INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (scene_code, code)
);
CREATE INDEX IF NOT EXISTS idx_life_intent_scene_sort ON ontology.life_intent (scene_code, sort_order);

-- 由 @gri/codegen 生成（普通 Object）
CREATE TABLE IF NOT EXISTS ontology.scene_module_link (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scene_code VARCHAR(255) NOT NULL,
    intent_code VARCHAR(255),
    module_code VARCHAR(255) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    requires_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (scene_code, intent_code, module_code)
);
CREATE INDEX IF NOT EXISTS idx_scene_module_link_scene ON ontology.scene_module_link (scene_code, sort_order);
CREATE INDEX IF NOT EXISTS idx_scene_module_link_module ON ontology.scene_module_link (module_code);

-- ---------------------------------------------------------------------------
-- 种子：生活主题场景（闭集）
-- ---------------------------------------------------------------------------
INSERT INTO ontology.life_scene
    (code, name, en, theme, icon, pos_x, pos_y, sort_order, status)
VALUES
    ('home', '居所', 'home', '住', 'house', 18, 28, 10, 'active'),
    ('dining', '餐饮', 'dining', '食', 'utensils', 34, 22, 20, 'active'),
    ('academy', '学习', 'academy', '生活', 'book-open', 52, 18, 30, 'active'),
    ('work', '工作', 'work', '工作', 'briefcase', 70, 30, 40, 'active'),
    ('social', '社交', 'social', '生活', 'users', 42, 52, 50, 'active'),
    ('travel', '出行·旅游', 'travel', '行·旅游', 'map', 64, 58, 60, 'active'),
    ('wellness', '健康', 'wellness', '生活', 'heart-pulse', 82, 48, 70, 'active')
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    en = EXCLUDED.en,
    theme = EXCLUDED.theme,
    icon = EXCLUDED.icon,
    pos_x = EXCLUDED.pos_x,
    pos_y = EXCLUDED.pos_y,
    sort_order = EXCLUDED.sort_order,
    status = EXCLUDED.status,
    updated_at = NOW();

-- ---------------------------------------------------------------------------
-- 种子：场景内意向。无链接的场景保留意向，API 以空 modules 表达“建设中”。
-- ---------------------------------------------------------------------------
INSERT INTO ontology.life_intent
    (scene_code, code, label, description, sort_order)
VALUES
    ('home', 'settle', '安顿生活', '管理居所与日常安排', 10),
    ('dining', 'hungry', '我想吃饭', '找餐厅、点餐或安排饮食', 10),
    ('academy', 'learn', '我想学习', '进入课程、练习与 AI 辅导', 10),
    ('work', 'work', '处理工作', '进入组织工作台与经营视图', 10),
    ('social', 'connect', '联系他人', '发起社交与关系互动', 10),
    ('travel', 'go', '我想出门', '规划出行与旅行', 10),
    ('wellness', 'recover', '照顾健康', '关注身体与身心状态', 10)
ON CONFLICT (scene_code, code) DO UPDATE SET
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order,
    updated_at = NOW();

-- ---------------------------------------------------------------------------
-- 种子：意向 → 模块映射。模块编码语义引用 ontology.app_module.code；
-- 未列出意向即为“建设中”（无 link）。
-- ---------------------------------------------------------------------------
INSERT INTO ontology.scene_module_link
    (scene_code, intent_code, module_code, sort_order, requires_opt_in)
VALUES
    ('dining', 'hungry', 'food', 10, FALSE),
    ('academy', 'learn', 'tutor', 10, FALSE),
    ('academy', 'learn', 'curriculum', 20, FALSE),
    ('academy', 'learn', 'agent', 30, TRUE),
    ('work', 'work', 'org-admin', 10, TRUE),
    ('work', 'work', 'dashboard', 20, TRUE)
ON CONFLICT (scene_code, intent_code, module_code) DO UPDATE SET
    sort_order = EXCLUDED.sort_order,
    requires_opt_in = EXCLUDED.requires_opt_in,
    updated_at = NOW();

COMMIT;
