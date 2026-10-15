-- ============================================================================
-- GRI DDL 029：社会组织本体 ontology.organization*
--
-- 上游真源：packages/ontology/ontologies/organization.ontology.yaml
-- 生成方式：@gri/codegen 生成结构主体 + 人工审阅头注；禁绕过 YAML 手写结构 DDL
-- 语义：OrganizationType 为运营维护字典；Organization 可实例化且 parent_id 自引用；
--       OrgMember 是多归属关联表，user_id 语义引用 public.users.id。
-- 兼容：不改 tenant.organizations / tenant.organization_members 的遗留结构；
--       仅把既有组织与成员幂等镜像进 ontology 独立表。
-- 登记：由 run-migrations 在成功后写入 public._api_migrations
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 由 @gri/codegen 生成 —— organization.ontology.yaml
-- ---------------------------------------------------------------------------
-- 由 @gri/codegen 生成（普通 Object）
CREATE TABLE IF NOT EXISTS ontology.organization_type (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    sort_order INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_organization_type_sort ON ontology.organization_type (sort_order);

-- 由 @gri/codegen 生成（普通 Object）
CREATE TABLE IF NOT EXISTS ontology.organization (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    type_code VARCHAR(255) NOT NULL,
    code VARCHAR(255) UNIQUE,
    logo_url VARCHAR(255),
    description TEXT,
    status VARCHAR(255) DEFAULT 'active',
    parent_id UUID,
    meta JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES ontology.organization(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_organization_type_code ON ontology.organization (type_code);
CREATE INDEX IF NOT EXISTS idx_organization_status ON ontology.organization (status);

-- 由 @gri/codegen 生成（普通 Object）
CREATE TABLE IF NOT EXISTS ontology.org_member (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    user_id UUID NOT NULL,
    role VARCHAR(255) DEFAULT 'member',
    tags JSONB DEFAULT '[]'::jsonb,
    status VARCHAR(255) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (org_id, user_id),
    FOREIGN KEY (org_id) REFERENCES ontology.organization(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_org_member_user_status ON ontology.org_member (user_id, status);
CREATE INDEX IF NOT EXISTS idx_org_member_org_status ON ontology.org_member (org_id, status);

-- ---------------------------------------------------------------------------
-- 种子：组织类型字典（运营后台维护的独立本体）
-- ---------------------------------------------------------------------------
INSERT INTO ontology.organization_type (code, name, description, sort_order)
VALUES
    ('family', '家庭', '家庭成员与家庭关系', 10),
    ('school', '学校', '学校、学院与教育机构', 20),
    ('company', '单位', '企业、机关、事业单位等用人单位', 30),
    ('social-group', '社会团体', '社团、协会与其他社会组织', 40),
    ('department', '部门', '组织内部部门或团队', 50),
    ('community', '社区', '居住社区与社区组织', 60),
    ('other', '其他', '未归入既有类型的组织', 99)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order,
    updated_at = NOW();

-- ---------------------------------------------------------------------------
-- 回填：legacy tenant.organizations → ontology.organization
-- id 保持与 legacy 一致，使写路径可稳定映射；空字符串 code 归一为 NULL。
-- ---------------------------------------------------------------------------
INSERT INTO ontology.organization
    (id, name, type_code, code, logo_url, description, status, meta, created_at, updated_at)
SELECT o.id,
       o.name,
       o.type,
       NULLIF(code, ''),
       o.logo_url,
       o.description,
       COALESCE(o.status, 'active'),
       COALESCE(o.metadata, '{}'::jsonb),
       COALESCE(o.created_at, NOW()),
       COALESCE(o.updated_at, NOW())
  FROM tenant.organizations o
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    type_code = EXCLUDED.type_code,
    code = EXCLUDED.code,
    logo_url = EXCLUDED.logo_url,
    description = EXCLUDED.description,
    status = EXCLUDED.status,
    meta = EXCLUDED.meta,
    updated_at = NOW();

-- parent_id 单独回填：一次 INSERT 引用同一批新行，拆成第二段避免插入顺序敏感。
UPDATE ontology.organization o
   SET parent_id = legacy.parent_id,
       updated_at = NOW()
  FROM tenant.organizations legacy
 WHERE o.id = legacy.id
   AND o.parent_id IS DISTINCT FROM legacy.parent_id;

-- ---------------------------------------------------------------------------
-- 回填：legacy tenant.organization_members → ontology.org_member
-- status/role 暂沿用 legacy 简档；标签初始为空数组。
-- ---------------------------------------------------------------------------
INSERT INTO ontology.org_member
    (id, org_id, user_id, role, tags, status, created_at, updated_at)
SELECT m.id,
       m.organization_id,
       m.user_id,
       m.role,
       '[]'::jsonb,
       COALESCE(m.status, 'active'),
       COALESCE(m.created_at, NOW()),
       COALESCE(m.updated_at, NOW())
  FROM tenant.organization_members m
ON CONFLICT (org_id, user_id) DO UPDATE SET
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    updated_at = NOW();

COMMIT;
