-- ============================================================================
-- GRI 重写 DDL 014：全学段知识版图层（K1–K12 知识图谱 · 登峰打卡）
--
-- 上游真源：packages/ontology/ontologies/k12-curriculum.ontology.yaml（schemaVersion 0.4.0）
-- 生成方式：@gri/codegen 混合模式生成新表两段 + 人工审阅补 CHECK/索引（照 013 先例）。
--   红线：本体驱动——结构变更先改 YAML → codegen 产出 → 审阅合并，禁止绕过 YAML 手写结构 DDL。
--
-- 新增两表（ontology schema 第八/九表）：
--   knowledge_area      学科知识版图节点（领域→知识域两级树；k12 落位 + frontier 峰外地带）
--   area_prerequisite   版图前置依赖（关联类，DAG 边；UNIQUE(from_area,to_area) 幂等锚点）
--
-- 更新机制（0.4.0 设计要点）：版图数据变更走 scripts/k12-curriculum/maps/<subject>.map.json
-- （人工审核后入 git）→ import.mjs 幂等灌库（code 锚点 + status 门禁）——本体可变、变更受控。
--
-- 覆盖比重口径：k12 节点数 / (k12 + frontier) 节点总数（版图节点粒度近似值，页面明示）。
--
-- 幂等：CREATE TABLE IF NOT EXISTS / ADD INDEX IF NOT EXISTS / DO $$ BEGIN…EXCEPTION…END。
-- ============================================================================

-- §1 knowledge_area（codegen 生成段 + 审阅）
CREATE TABLE IF NOT EXISTS ontology.knowledge_area (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    scope VARCHAR(255) NOT NULL,
    grade_level INTEGER,
    sort_order INTEGER,
    status VARCHAR(255) DEFAULT 'draft',
    subject_id UUID,
    parent_id UUID,
    FOREIGN KEY (subject_id) REFERENCES ontology.subject(id),
    FOREIGN KEY (parent_id) REFERENCES ontology.knowledge_area(id)
);

-- §1.1 状态机 CHECK（YAML stateMachine → 库同源；与 knowledge_points.status 同语义）
DO $$ BEGIN
  ALTER TABLE ontology.knowledge_area
    ADD CONSTRAINT chk_area_status CHECK (status IN ('draft','reviewed','published','archived'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- §1.2 scope 闭集 CHECK（k12=落位 / frontier=峰外未学地带；import 侧同闭集 fail-fast 门禁）
DO $$ BEGIN
  ALTER TABLE ontology.knowledge_area
    ADD CONSTRAINT chk_area_scope CHECK (scope IN ('k12','frontier'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- §1.3 查询索引（按学科拉全版图是图谱/比重/登峰页的第一路径）
CREATE INDEX IF NOT EXISTS idx_knowledge_area_subject ON ontology.knowledge_area (subject_id, scope);

-- §2 area_prerequisite（codegen 生成段 + 审阅）
CREATE TABLE IF NOT EXISTS ontology.area_prerequisite (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_area UUID,
    to_area UUID,
    UNIQUE (from_area, to_area),
    FOREIGN KEY (from_area) REFERENCES ontology.knowledge_area(id),
    FOREIGN KEY (to_area) REFERENCES ontology.knowledge_area(id)
);
