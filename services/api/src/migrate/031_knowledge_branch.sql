-- ============================================================================
-- GRI DDL 031：学科知识体系分支树（学科登顶维度 A + K12 映射）
--
-- 上游真源：
--   packages/ontology/ontologies/knowledge-branch.ontology.yaml（结构）
--   packages/ontology/ontologies/k12-curriculum.ontology.yaml（chapter/area 引用列）
--   docs/SUBJECT_SUMMIT_AUTHORITY.md（CLC 锚点白名单）
--   .agents/codex/tasks/w4a-branch-seed-spec.md（映射规则人工复核）
-- 生成方式：@gri/codegen 生成结构主体；映射由规则基线人工复核后固化为显式 VALUES。
-- 幂等：CREATE/ALTER IF NOT EXISTS + UPSERT + 全量重算 + 末尾断言。
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS ontology.knowledge_branch (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    clc VARCHAR(255) NOT NULL,
    curriculum VARCHAR(255),
    sort_order INTEGER,
    status VARCHAR(255) DEFAULT 'active',
    k12_grade_min INTEGER,
    k12_grade_max INTEGER,
    subject_id UUID,
    parent_id UUID,
    FOREIGN KEY (subject_id) REFERENCES ontology.subject(id),
    FOREIGN KEY (parent_id) REFERENCES ontology.knowledge_branch(id)
);
CREATE INDEX IF NOT EXISTS idx_knowledge_branch_subject_sort ON ontology.knowledge_branch (subject_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_knowledge_branch_parent ON ontology.knowledge_branch (parent_id);

-- k12-curriculum.ontology.yaml 0.5.0 的外键落位。已有表用生成结构的增量形态。
ALTER TABLE ontology.textbook_chapter ADD COLUMN IF NOT EXISTS branch_id UUID;
ALTER TABLE ontology.knowledge_area ADD COLUMN IF NOT EXISTS branch_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'fk_textbook_chapter_branch'
       AND conrelid = 'ontology.textbook_chapter'::regclass
  ) THEN
    ALTER TABLE ontology.textbook_chapter
      ADD CONSTRAINT fk_textbook_chapter_branch
      FOREIGN KEY (branch_id) REFERENCES ontology.knowledge_branch(id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'fk_knowledge_area_branch'
       AND conrelid = 'ontology.knowledge_area'::regclass
  ) THEN
    ALTER TABLE ontology.knowledge_area
      ADD CONSTRAINT fk_knowledge_area_branch
      FOREIGN KEY (branch_id) REFERENCES ontology.knowledge_branch(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_textbook_chapter_branch ON ontology.textbook_chapter (branch_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_area_branch ON ontology.knowledge_area (branch_id);

-- ---------------------------------------------------------------------------
-- 1. 分支树种子：53 顶层峰 + 4 个学科纵深子节点
--    parent_id 分两段写入，避免同语句自引用不可见问题。
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE w4a_branch_seed (
  code TEXT PRIMARY KEY,
  subject_code TEXT NOT NULL,
  parent_code TEXT,
  name TEXT NOT NULL,
  clc TEXT NOT NULL,
  curriculum TEXT,
  sort_order INTEGER NOT NULL,
  description TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO w4a_branch_seed (code, subject_code, parent_code, name, clc, curriculum, sort_order, description)
VALUES
    ('math.num', 'MATH', NULL, '数与算术', 'O12', '数与代数', '10', '数的认识、运算、比例与数量关系'),
    ('math.alg', 'MATH', NULL, '代数·方程·不等式', 'O15', '方程与不等式', '20', '代数式、方程、不等式与代数结构'),
    ('math.seq', 'MATH', NULL, '数列与级数', 'O15', '数列', '30', '数列、递推、级数与收敛'),
    ('math.logic', 'MATH', NULL, '数理逻辑与数学基础', 'O14', '推理与证明', '40', '集合、命题、量词、证明与数学基础'),
    ('math.combi', 'MATH', NULL, '计数与组合', 'O15', '计数与组合', '50', '计数原理、排列组合与组合结构'),
    ('math.analysis', 'MATH', NULL, '函数·极限·微积分', 'O17', '函数与微积分', '60', '函数、极限、微分、积分与级数'),
    ('math.geometry', 'MATH', NULL, '几何·解析几何·拓扑', 'O18', '图形与几何', '70', '平面、立体、解析几何、向量与拓扑'),
    ('math.prosta', 'MATH', NULL, '概率论与数理统计', 'O21', '统计与概率', '80', '概率模型、随机变量与统计推断'),
    ('math.or', 'MATH', NULL, '运筹与决策', 'O22; O23', '综合与实践', '90', '优化、策略、运筹与控制论'),
    ('math.comp', 'MATH', NULL, '计算数学与数值方法', 'O24', '综合与实践', '100', '算法、近似计算与数值分析'),
    ('math.apply', 'MATH', 'math.comp', '应用数学与数学建模', 'O29', '综合与实践', '110', '数学建模与跨学科应用（学科纵深节点）'),
    ('math.ds', 'MATH', 'math.analysis', '动力系统与学科纵深', 'O19', NULL, '120', '动力系统理论（纯学科纵深节点）'),
    ('math.classic', 'MATH', 'math.num', '古典数学·中国数学', 'O11; O119', NULL, '130', '古典数学与中国数学（纯学科纵深节点）'),
    ('phys.mech', 'PHYS', NULL, '力学', 'O3', '运动与相互作用', '10', '力、运动、能量、动量与机械系统'),
    ('phys.thermo', 'PHYS', NULL, '热学与物质分子运动论', 'O55', '热现象', '20', '热、内能、热力学与分子动理论'),
    ('phys.ac', 'PHYS', NULL, '声学', 'O42', '声现象', '30', '声、振动与波'),
    ('phys.opt', 'PHYS', NULL, '光学', 'O43', '光现象', '40', '光的传播、成像与波动光学'),
    ('phys.em', 'PHYS', NULL, '电磁学·电动力学', 'O44', '电与磁', '50', '电场、电路、磁场与电磁感应'),
    ('phys.atomol', 'PHYS', NULL, '分子·原子物理学', 'O56', '原子与分子', '60', '分子、原子结构与微观作用'),
    ('phys.nucle', 'PHYS', NULL, '原子核与高能物理学', 'O57', '原子核', '70', '原子核、射线、粒子与高能物理'),
    ('phys.condmat', 'PHYS', NULL, '凝聚态·固体·半导体物理', 'O46; O469; O47; O48', '材料与微观物理', '80', '凝聚态、固体与半导体'),
    ('phys.theo', 'PHYS', NULL, '理论物理', 'O41', '物理模型', '90', '理论模型、守恒、对称与场'),
    ('phys.app', 'PHYS', NULL, '应用物理·技术物理', 'O59', '能源与工程', '100', '技术物理、传感器与能源应用'),
    ('phys.exp', 'PHYS', 'phys.app', '物理实验与科学方法', 'O4-3', '实验探究', '110', '测量、实验、误差与科学方法（学科纵深节点）'),
    ('chem.basic', 'CHEM', NULL, '化学原理与方法', 'O6-0', '物质及其变化', '10', '物质分类、化学式、结构、化学键与守恒'),
    ('chem.inorg', 'CHEM', NULL, '无机化学', 'O61', '无机物', '20', '元素、单质与无机化合物'),
    ('chem.organic', 'CHEM', NULL, '有机化学', 'O62', '有机物', '30', '烃、官能团与有机反应'),
    ('chem.physchem', 'CHEM', NULL, '物理化学·理论化学', 'O64', '反应与平衡', '40', '反应速率、平衡、热力学与电化学'),
    ('chem.anal', 'CHEM', NULL, '分析化学', 'O65', '实验与定量分析', '50', '定量、分离、提纯与仪器分析'),
    ('chem.poly', 'CHEM', NULL, '高分子化学', 'O63', '材料化学', '60', '高分子结构、合成与性能'),
    ('chem.app', 'CHEM', NULL, '应用化学（材料·能源·环境）', 'O69', '化学与社会', '70', '材料、能源、环境与日常化学'),
    ('chem.exp', 'CHEM', NULL, '实验化学', 'O6-3', '实验探究', '80', '实验安全、仪器与基本操作'),
    ('bio.cellmol', 'BIO', NULL, '细胞与分子生物学', 'Q2; Q5; Q7', '细胞与分子', '10', '细胞结构、代谢、遗传信息与分子机制'),
    ('bio.gen', 'BIO', NULL, '遗传学与进化', 'Q3', '遗传与进化', '20', '遗传、变异、进化和系统发育'),
    ('bio.physio', 'BIO', NULL, '生理学（生物体的调节）', 'Q4', '人体与生命活动', '30', '生命活动的调节、稳态与健康'),
    ('bio.micro', 'BIO', NULL, '微生物学', 'Q93', '微生物', '40', '细菌、真菌、病毒与微生物作用'),
    ('bio.planta', 'BIO', NULL, '植物学', 'Q94', '植物', '50', '植物结构、生长、繁殖与分类'),
    ('bio.zoo', 'BIO', NULL, '动物学与动物行为', 'Q95; Q98', '动物', '60', '动物分类、行为与人类学'),
    ('bio.biotech', 'BIO', NULL, '生物工程学·生物技术', 'Q81', '生物技术', '70', '基因、细胞、发酵与合成生物技术'),
    ('bio.env', 'BIO', NULL, '环境生物学与生态学', '[Q89]', '生物与环境', '80', '生态、生物多样性、种群群落与可持续'),
    ('bio.method', 'BIO', NULL, '生物研究方法与技术', 'Q-3', '科学探究', '90', '观察、实验、变量控制与生物调查'),
    ('chn.lang', 'CHN', NULL, '汉语语言要素（语音·文字·词汇·语法）', 'H11; H12; H13', '语言文字积累与梳理', '10', '语音、文字、词汇、语法与标点'),
    ('chn.use', 'CHN', NULL, '语言运用与表达（写作·修辞·口语）', 'H14; H15', '表达与交流', '20', '口语、书面表达、写作、修辞与修改'),
    ('chn.classic', 'CHN', NULL, '文言与古代汉语', 'H109.2', '古代汉语', '30', '文言实词、虚词、句法与古代文化常识'),
    ('chn.read', 'CHN', NULL, '文学阅读与鉴赏', 'I0; I207', '阅读与鉴赏', '40', '文学理论、阅读策略与各体文本鉴赏'),
    ('chn.anclit', 'CHN', NULL, '中国古代文学', 'I206; I22; I24; I26', '中国古代文学', '50', '古代诗词、散文、小说与文学评论'),
    ('chn.modlit', 'CHN', NULL, '中国现当代文学', 'I206.6; I206.7', '中国现当代文学', '60', '现代与当代文学及文学史'),
    ('chn.forlit', 'CHN', NULL, '外国文学与文化', 'I1; I3/7; K892', '外国文学与文化', '70', '世界文学、各国文学与民俗文化'),
    ('chn.ling', 'CHN', NULL, '语言学与语言研究', 'H0', '语言研究', '80', '语言学、语义、语用与数字人文'),
    ('chn.inte', 'CHN', NULL, '综合性学习与跨学科', 'H1', '跨学科学习', '90', '综合性学习、项目化与跨学科实践（课标依据）'),
    ('eng.lang', 'ENG', NULL, '英语语言要素（语音·文字·词汇·语法）', 'H311; H312; H313; H314', '语言知识', '10', '语音、文字、词汇与语法'),
    ('eng.recept', 'ENG', NULL, '英语理解技能（听·读）', 'H319', '理解性技能', '20', '听力与阅读理解'),
    ('eng.product', 'ENG', NULL, '英语产出技能（说·写·译）', 'H315; H315.9', '表达性技能', '30', '口语、写作与翻译'),
    ('eng.lit', 'ENG', NULL, '英美文学', 'I3/7', '文学阅读', '40', '英语文学、诗歌、戏剧与小说'),
    ('eng.culture', 'ENG', NULL, '英语国家文化与社会', 'K892', '文化意识', '50', '英语国家社会、节日、习俗与文化'),
    ('eng.pedag', 'ENG', NULL, '英语教学与学习策略', 'H319', '学习策略', '60', '语言学习策略、测评与自主学习'),
    ('eng.comm', 'ENG', NULL, '跨文化交际与语用', 'H319.9', '语用与交际', '70', '会话、语用、话语分析与跨文化沟通');

INSERT INTO ontology.knowledge_branch
  (code, subject_id, parent_id, name, clc, curriculum, sort_order, status, description,
   k12_grade_min, k12_grade_max)
SELECT v.code, s.id, NULL, v.name, v.clc, v.curriculum, v.sort_order, 'active', v.description,
       NULL, NULL
  FROM w4a_branch_seed v
  JOIN ontology.subject s ON s.code = v.subject_code
ON CONFLICT (code) DO UPDATE SET
  subject_id = EXCLUDED.subject_id,
  parent_id = NULL,
  name = EXCLUDED.name,
  clc = EXCLUDED.clc,
  curriculum = EXCLUDED.curriculum,
  sort_order = EXCLUDED.sort_order,
  status = 'active',
  description = EXCLUDED.description,
  k12_grade_min = NULL,
  k12_grade_max = NULL;

UPDATE ontology.knowledge_branch b
   SET parent_id = p.id
  FROM w4a_branch_seed v
  JOIN ontology.knowledge_branch p
    ON p.code = v.parent_code
 WHERE b.code = v.code
   AND v.parent_code IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. 622 章映射：163 个根章显式指定；459 个子节点递归继承父章。
--    下列 VALUES 是规则基线人工复核后的落位表，不含模糊匹配或默认兜底。
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE w4a_chapter_branch_seed (
  chapter_code TEXT PRIMARY KEY,
  branch_code TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO w4a_chapter_branch_seed (chapter_code, branch_code)
VALUES
    ('math.g10b.pep.ch07', 'math.alg'),
    ('math.g11.pep.ch02', 'math.alg'),
    ('math.g11.pep.ch03', 'math.alg'),
    ('math.g5.pep.ch05', 'math.alg'),
    ('math.g7.pep.ch02', 'math.alg'),
    ('math.g7.pep.ch03', 'math.alg'),
    ('math.g7b.pep.ch08', 'math.alg'),
    ('math.g7b.pep.ch09', 'math.alg'),
    ('math.g8.pep.ch14', 'math.alg'),
    ('math.g8.pep.ch15', 'math.alg'),
    ('math.g8b.pep.ch16', 'math.alg'),
    ('math.g8b.pep.ch19', 'math.alg'),
    ('math.g9.pep.ch21', 'math.alg'),
    ('math.g9.pep.ch22', 'math.alg'),
    ('math.g9b.pep.ch26', 'math.alg'),
    ('math.g10.pep.ch02', 'math.analysis'),
    ('math.g10.pep.ch03', 'math.analysis'),
    ('math.g10.pep.ch04', 'math.analysis'),
    ('math.g10.pep.ch05', 'math.analysis'),
    ('math.g11b.pep.ch05', 'math.analysis'),
    ('math.g9b.pep.ch28', 'math.analysis'),
    ('math.g6b.pep.ch06', 'math.apply'),
    ('math.g12.pep.ch06', 'math.combi'),
    ('math.g2.pep.ch08', 'math.combi'),
    ('math.g3b.pep.ch08', 'math.combi'),
    ('math.g6b.pep.ch05', 'math.combi'),
    ('math.g1.pep.ch02', 'math.geometry'),
    ('math.g1.pep.ch04', 'math.geometry'),
    ('math.g10b.pep.ch06', 'math.geometry'),
    ('math.g10b.pep.ch08', 'math.geometry'),
    ('math.g11.pep.ch01', 'math.geometry'),
    ('math.g1b.pep.ch01', 'math.geometry'),
    ('math.g2.pep.ch01', 'math.geometry'),
    ('math.g2.pep.ch03', 'math.geometry'),
    ('math.g2.pep.ch05', 'math.geometry'),
    ('math.g2b.pep.ch03', 'math.geometry'),
    ('math.g3.pep.ch03', 'math.geometry'),
    ('math.g3.pep.ch07', 'math.geometry'),
    ('math.g3b.pep.ch01', 'math.geometry'),
    ('math.g3b.pep.ch05', 'math.geometry'),
    ('math.g4.pep.ch02', 'math.geometry'),
    ('math.g4.pep.ch03', 'math.geometry'),
    ('math.g4.pep.ch05', 'math.geometry'),
    ('math.g4b.pep.ch02', 'math.geometry'),
    ('math.g4b.pep.ch05', 'math.geometry'),
    ('math.g4b.pep.ch07', 'math.geometry'),
    ('math.g5.pep.ch02', 'math.geometry'),
    ('math.g5.pep.ch06', 'math.geometry'),
    ('math.g5b.pep.ch01', 'math.geometry'),
    ('math.g5b.pep.ch03', 'math.geometry'),
    ('math.g5b.pep.ch05', 'math.geometry'),
    ('math.g6.pep.ch02', 'math.geometry'),
    ('math.g6.pep.ch05', 'math.geometry'),
    ('math.g6b.pep.ch03', 'math.geometry'),
    ('math.g7.pep.ch04', 'math.geometry'),
    ('math.g7b.pep.ch05', 'math.geometry'),
    ('math.g7b.pep.ch07', 'math.geometry'),
    ('math.g8.pep.ch11', 'math.geometry'),
    ('math.g8.pep.ch12', 'math.geometry'),
    ('math.g8.pep.ch13', 'math.geometry'),
    ('math.g8b.pep.ch17', 'math.geometry'),
    ('math.g8b.pep.ch18', 'math.geometry'),
    ('math.g9.pep.ch23', 'math.geometry'),
    ('math.g9.pep.ch24', 'math.geometry'),
    ('math.g9b.pep.ch27', 'math.geometry'),
    ('math.g9b.pep.ch29', 'math.geometry'),
    ('math.g10.pep.ch01', 'math.logic'),
    ('math.g1b.pep.ch07', 'math.logic'),
    ('math.g2b.pep.ch08', 'math.logic'),
    ('math.g3.pep.ch09', 'math.logic'),
    ('math.g6.pep.ch08', 'math.logic'),
    ('math.g1.pep.ch01', 'math.num'),
    ('math.g1.pep.ch03', 'math.num'),
    ('math.g1.pep.ch05', 'math.num'),
    ('math.g1.pep.ch06', 'math.num'),
    ('math.g1.pep.ch07', 'math.num'),
    ('math.g1.pep.ch08', 'math.num'),
    ('math.g1b.pep.ch02', 'math.num'),
    ('math.g1b.pep.ch04', 'math.num'),
    ('math.g1b.pep.ch05', 'math.num'),
    ('math.g1b.pep.ch06', 'math.num'),
    ('math.g2.pep.ch02', 'math.num'),
    ('math.g2.pep.ch04', 'math.num'),
    ('math.g2.pep.ch06', 'math.num'),
    ('math.g2.pep.ch07', 'math.num'),
    ('math.g2b.pep.ch02', 'math.num'),
    ('math.g2b.pep.ch04', 'math.num'),
    ('math.g2b.pep.ch05', 'math.num'),
    ('math.g2b.pep.ch06', 'math.num'),
    ('math.g2b.pep.ch07', 'math.num'),
    ('math.g3.pep.ch01', 'math.num'),
    ('math.g3.pep.ch02', 'math.num'),
    ('math.g3.pep.ch04', 'math.num'),
    ('math.g3.pep.ch05', 'math.num'),
    ('math.g3.pep.ch06', 'math.num'),
    ('math.g3.pep.ch08', 'math.num'),
    ('math.g3b.pep.ch02', 'math.num'),
    ('math.g3b.pep.ch04', 'math.num'),
    ('math.g3b.pep.ch06', 'math.num'),
    ('math.g3b.pep.ch07', 'math.num'),
    ('math.g4.pep.ch01', 'math.num'),
    ('math.g4.pep.ch04', 'math.num'),
    ('math.g4.pep.ch06', 'math.num'),
    ('math.g4b.pep.ch01', 'math.num'),
    ('math.g4b.pep.ch03', 'math.num'),
    ('math.g4b.pep.ch04', 'math.num'),
    ('math.g4b.pep.ch06', 'math.num'),
    ('math.g5.pep.ch01', 'math.num'),
    ('math.g5.pep.ch03', 'math.num'),
    ('math.g5b.pep.ch02', 'math.num'),
    ('math.g5b.pep.ch04', 'math.num'),
    ('math.g5b.pep.ch06', 'math.num'),
    ('math.g6.pep.ch01', 'math.num'),
    ('math.g6.pep.ch03', 'math.num'),
    ('math.g6.pep.ch04', 'math.num'),
    ('math.g6.pep.ch06', 'math.num'),
    ('math.g6b.pep.ch01', 'math.num'),
    ('math.g6b.pep.ch02', 'math.num'),
    ('math.g6b.pep.ch04', 'math.num'),
    ('math.g7.pep.ch01', 'math.num'),
    ('math.g7b.pep.ch06', 'math.num'),
    ('math.g4.pep.ch08', 'math.or'),
    ('math.g4b.pep.ch09', 'math.or'),
    ('math.g5.pep.ch07', 'math.or'),
    ('math.g5b.pep.ch08', 'math.or'),
    ('math.g10b.pep.ch09', 'math.prosta'),
    ('math.g10b.pep.ch10', 'math.prosta'),
    ('math.g12.pep.ch07', 'math.prosta'),
    ('math.g12.pep.ch08', 'math.prosta'),
    ('math.g1b.pep.ch03', 'math.prosta'),
    ('math.g2b.pep.ch01', 'math.prosta'),
    ('math.g3b.pep.ch03', 'math.prosta'),
    ('math.g4.pep.ch07', 'math.prosta'),
    ('math.g4b.pep.ch08', 'math.prosta'),
    ('math.g5.pep.ch04', 'math.prosta'),
    ('math.g5b.pep.ch07', 'math.prosta'),
    ('math.g6.pep.ch07', 'math.prosta'),
    ('math.g7b.pep.ch10', 'math.prosta'),
    ('math.g8b.pep.ch20', 'math.prosta'),
    ('math.g9.pep.ch25', 'math.prosta'),
    ('math.g11b.pep.ch04', 'math.seq'),
    ('phys.g8.pep.ch02', 'phys.ac'),
    ('phys.g9.pep.ch22', 'phys.app'),
    ('phys.g9.pep.ch15', 'phys.em'),
    ('phys.g9.pep.ch16', 'phys.em'),
    ('phys.g9.pep.ch17', 'phys.em'),
    ('phys.g9.pep.ch18', 'phys.em'),
    ('phys.g9.pep.ch19', 'phys.em'),
    ('phys.g9.pep.ch20', 'phys.em'),
    ('phys.g9.pep.ch21', 'phys.em'),
    ('phys.g8.pep.ch01', 'phys.mech'),
    ('phys.g8.pep.ch06', 'phys.mech'),
    ('phys.g8b.pep.ch07', 'phys.mech'),
    ('phys.g8b.pep.ch08', 'phys.mech'),
    ('phys.g8b.pep.ch09', 'phys.mech'),
    ('phys.g8b.pep.ch10', 'phys.mech'),
    ('phys.g8b.pep.ch11', 'phys.mech'),
    ('phys.g8b.pep.ch12', 'phys.mech'),
    ('phys.g8.pep.ch04', 'phys.opt'),
    ('phys.g8.pep.ch05', 'phys.opt'),
    ('phys.g8.pep.ch03', 'phys.thermo'),
    ('phys.g9.pep.ch13', 'phys.thermo'),
    ('phys.g9.pep.ch14', 'phys.thermo');

UPDATE ontology.textbook_chapter SET branch_id = NULL;

WITH RECURSIVE mapped_chapters AS (
  SELECT c.id, b.id AS branch_id
    FROM w4a_chapter_branch_seed v
    JOIN ontology.textbook_chapter c ON c.code = v.chapter_code
    JOIN ontology.knowledge_branch b ON b.code = v.branch_code
  UNION ALL
  SELECT child.id, parent.branch_id
    FROM ontology.textbook_chapter child
    JOIN mapped_chapters parent ON child.parent_id = parent.id
)
UPDATE ontology.textbook_chapter c
   SET branch_id = mapped.branch_id
  FROM mapped_chapters mapped
 WHERE c.id = mapped.id;

-- ---------------------------------------------------------------------------
-- 3. 331 个知识域/领域显式映射（人工复核后的完整落位表）。
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE w4a_area_branch_seed (
  area_code TEXT PRIMARY KEY,
  branch_code TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO w4a_area_branch_seed (area_code, branch_code)
VALUES
    ('bio.map.a.02.08', 'bio.biotech'),
    ('bio.map.a.05.01', 'bio.biotech'),
    ('bio.map.a.05.02', 'bio.biotech'),
    ('bio.map.a.05.03', 'bio.biotech'),
    ('bio.map.a.05.04', 'bio.biotech'),
    ('bio.map.a.05.05', 'bio.biotech'),
    ('bio.map.a.05.06', 'bio.biotech'),
    ('bio.map.a.05.07', 'bio.biotech'),
    ('bio.map.f.05', 'bio.biotech'),
    ('bio.map.a.01.01', 'bio.cellmol'),
    ('bio.map.a.01.02', 'bio.cellmol'),
    ('bio.map.a.01.03', 'bio.cellmol'),
    ('bio.map.a.01.04', 'bio.cellmol'),
    ('bio.map.a.01.05', 'bio.cellmol'),
    ('bio.map.a.01.06', 'bio.cellmol'),
    ('bio.map.a.01.07', 'bio.cellmol'),
    ('bio.map.a.01.08', 'bio.cellmol'),
    ('bio.map.f.01', 'bio.cellmol'),
    ('bio.map.a.04.01', 'bio.env'),
    ('bio.map.a.04.02', 'bio.env'),
    ('bio.map.a.04.03', 'bio.env'),
    ('bio.map.a.04.04', 'bio.env'),
    ('bio.map.a.04.05', 'bio.env'),
    ('bio.map.a.04.06', 'bio.env'),
    ('bio.map.a.04.08', 'bio.env'),
    ('bio.map.a.04.09', 'bio.env'),
    ('bio.map.a.04.10', 'bio.env'),
    ('bio.map.a.04.11', 'bio.env'),
    ('bio.map.a.04.12', 'bio.env'),
    ('bio.map.a.04.15', 'bio.env'),
    ('bio.map.a.04.16', 'bio.env'),
    ('bio.map.a.04.17', 'bio.env'),
    ('bio.map.a.04.18', 'bio.env'),
    ('bio.map.a.04.19', 'bio.env'),
    ('bio.map.f.04', 'bio.env'),
    ('bio.map.a.02.01', 'bio.gen'),
    ('bio.map.a.02.02', 'bio.gen'),
    ('bio.map.a.02.03', 'bio.gen'),
    ('bio.map.a.02.04', 'bio.gen'),
    ('bio.map.a.02.05', 'bio.gen'),
    ('bio.map.a.02.06', 'bio.gen'),
    ('bio.map.a.02.07', 'bio.gen'),
    ('bio.map.a.02.09', 'bio.gen'),
    ('bio.map.a.02.10', 'bio.gen'),
    ('bio.map.a.04.07', 'bio.gen'),
    ('bio.map.f.02', 'bio.gen'),
    ('bio.map.a.01.11', 'bio.method'),
    ('bio.map.a.03.02', 'bio.physio'),
    ('bio.map.a.03.03', 'bio.physio'),
    ('bio.map.a.03.04', 'bio.physio'),
    ('bio.map.a.03.05', 'bio.physio'),
    ('bio.map.a.03.07', 'bio.physio'),
    ('bio.map.a.03.09', 'bio.physio'),
    ('bio.map.a.03.11', 'bio.physio'),
    ('bio.map.a.03.12', 'bio.physio'),
    ('bio.map.a.03.13', 'bio.physio'),
    ('bio.map.f.03', 'bio.physio'),
    ('bio.map.a.01.09', 'bio.planta'),
    ('bio.map.a.01.10', 'bio.planta'),
    ('bio.map.a.03.01', 'bio.planta'),
    ('bio.map.a.03.10', 'bio.planta'),
    ('bio.map.a.04.13', 'bio.planta'),
    ('bio.map.a.03.06', 'bio.zoo'),
    ('bio.map.a.03.08', 'bio.zoo'),
    ('bio.map.a.04.14', 'bio.zoo'),
    ('chem.map.a.04.02', 'chem.anal'),
    ('chem.map.a.04.03', 'chem.anal'),
    ('chem.map.a.04.04', 'chem.anal'),
    ('chem.map.a.04.05', 'chem.anal'),
    ('chem.map.a.05.01', 'chem.app'),
    ('chem.map.a.05.02', 'chem.app'),
    ('chem.map.a.05.03', 'chem.app'),
    ('chem.map.a.05.04', 'chem.app'),
    ('chem.map.a.05.05', 'chem.app'),
    ('chem.map.a.05.06', 'chem.app'),
    ('chem.map.a.05.07', 'chem.app'),
    ('chem.map.a.05.08', 'chem.app'),
    ('chem.map.a.05.09', 'chem.app'),
    ('chem.map.f.05', 'chem.app'),
    ('chem.map.a.01.01', 'chem.basic'),
    ('chem.map.a.01.02', 'chem.basic'),
    ('chem.map.a.01.03', 'chem.basic'),
    ('chem.map.a.01.04', 'chem.basic'),
    ('chem.map.a.01.05', 'chem.basic'),
    ('chem.map.a.01.06', 'chem.basic'),
    ('chem.map.a.01.07', 'chem.basic'),
    ('chem.map.a.01.08', 'chem.basic'),
    ('chem.map.a.02.01', 'chem.basic'),
    ('chem.map.a.02.02', 'chem.basic'),
    ('chem.map.f.01', 'chem.basic'),
    ('chem.map.a.04.01', 'chem.exp'),
    ('chem.map.a.04.06', 'chem.exp'),
    ('chem.map.a.04.07', 'chem.exp'),
    ('chem.map.f.04', 'chem.exp'),
    ('chem.map.a.03.01', 'chem.organic'),
    ('chem.map.a.03.02', 'chem.organic'),
    ('chem.map.a.03.03', 'chem.organic'),
    ('chem.map.a.03.04', 'chem.organic'),
    ('chem.map.a.03.05', 'chem.organic'),
    ('chem.map.a.03.06', 'chem.organic'),
    ('chem.map.a.03.07', 'chem.organic'),
    ('chem.map.a.03.08', 'chem.organic'),
    ('chem.map.f.03', 'chem.organic'),
    ('chem.map.a.01.09', 'chem.physchem'),
    ('chem.map.a.02.03', 'chem.physchem'),
    ('chem.map.a.02.04', 'chem.physchem'),
    ('chem.map.a.02.05', 'chem.physchem'),
    ('chem.map.a.02.06', 'chem.physchem'),
    ('chem.map.a.02.07', 'chem.physchem'),
    ('chem.map.a.02.08', 'chem.physchem'),
    ('chem.map.a.02.09', 'chem.physchem'),
    ('chem.map.f.02', 'chem.physchem'),
    ('chn.map.a.01.07', 'chn.anclit'),
    ('chn.map.a.02.05', 'chn.anclit'),
    ('chn.map.a.02.07', 'chn.anclit'),
    ('chn.map.a.04.02', 'chn.anclit'),
    ('chn.map.a.04.03', 'chn.anclit'),
    ('chn.map.a.01.06', 'chn.classic'),
    ('chn.map.a.02.06', 'chn.classic'),
    ('chn.map.a.02.08', 'chn.forlit'),
    ('chn.map.a.04.01', 'chn.forlit'),
    ('chn.map.a.04.04', 'chn.forlit'),
    ('chn.map.a.04.07', 'chn.forlit'),
    ('chn.map.f.04', 'chn.forlit'),
    ('chn.map.a.05.02', 'chn.inte'),
    ('chn.map.a.05.04', 'chn.inte'),
    ('chn.map.a.05.05', 'chn.inte'),
    ('chn.map.a.05.06', 'chn.inte'),
    ('chn.map.a.05.07', 'chn.inte'),
    ('chn.map.a.05.08', 'chn.inte'),
    ('chn.map.f.05', 'chn.inte'),
    ('chn.map.a.01.01', 'chn.lang'),
    ('chn.map.a.01.02', 'chn.lang'),
    ('chn.map.a.01.03', 'chn.lang'),
    ('chn.map.a.01.04', 'chn.lang'),
    ('chn.map.a.01.05', 'chn.lang'),
    ('chn.map.f.01', 'chn.lang'),
    ('chn.map.a.04.05', 'chn.ling'),
    ('chn.map.a.06.01', 'chn.ling'),
    ('chn.map.a.06.02', 'chn.ling'),
    ('chn.map.a.06.03', 'chn.ling'),
    ('chn.map.a.06.04', 'chn.ling'),
    ('chn.map.a.06.05', 'chn.ling'),
    ('chn.map.f.06', 'chn.ling'),
    ('chn.map.a.04.06', 'chn.modlit'),
    ('chn.map.a.02.01', 'chn.read'),
    ('chn.map.a.02.02', 'chn.read'),
    ('chn.map.a.02.03', 'chn.read'),
    ('chn.map.a.02.04', 'chn.read'),
    ('chn.map.a.02.09', 'chn.read'),
    ('chn.map.a.05.03', 'chn.read'),
    ('chn.map.f.02', 'chn.read'),
    ('chn.map.a.03.01', 'chn.use'),
    ('chn.map.a.03.02', 'chn.use'),
    ('chn.map.a.03.03', 'chn.use'),
    ('chn.map.a.03.04', 'chn.use'),
    ('chn.map.a.03.05', 'chn.use'),
    ('chn.map.a.03.06', 'chn.use'),
    ('chn.map.a.03.07', 'chn.use'),
    ('chn.map.a.03.08', 'chn.use'),
    ('chn.map.a.03.09', 'chn.use'),
    ('chn.map.a.05.01', 'chn.use'),
    ('chn.map.f.03', 'chn.use'),
    ('eng.map.a.01.13', 'eng.comm'),
    ('eng.map.a.01.15', 'eng.comm'),
    ('eng.map.a.04.10', 'eng.comm'),
    ('eng.map.a.05.05', 'eng.comm'),
    ('eng.map.f.05', 'eng.comm'),
    ('eng.map.a.04.07', 'eng.culture'),
    ('eng.map.a.04.08', 'eng.culture'),
    ('eng.map.a.04.09', 'eng.culture'),
    ('eng.map.a.01.01', 'eng.lang'),
    ('eng.map.a.01.02', 'eng.lang'),
    ('eng.map.a.01.03', 'eng.lang'),
    ('eng.map.a.01.04', 'eng.lang'),
    ('eng.map.a.01.05', 'eng.lang'),
    ('eng.map.a.01.06', 'eng.lang'),
    ('eng.map.a.01.07', 'eng.lang'),
    ('eng.map.a.01.08', 'eng.lang'),
    ('eng.map.a.01.09', 'eng.lang'),
    ('eng.map.a.01.10', 'eng.lang'),
    ('eng.map.a.01.16', 'eng.lang'),
    ('eng.map.a.01.17', 'eng.lang'),
    ('eng.map.a.01.18', 'eng.lang'),
    ('eng.map.f.01', 'eng.lang'),
    ('eng.map.a.04.01', 'eng.lit'),
    ('eng.map.a.04.02', 'eng.lit'),
    ('eng.map.a.04.03', 'eng.lit'),
    ('eng.map.a.04.04', 'eng.lit'),
    ('eng.map.a.04.05', 'eng.lit'),
    ('eng.map.a.04.06', 'eng.lit'),
    ('eng.map.a.04.11', 'eng.lit'),
    ('eng.map.f.04', 'eng.lit'),
    ('eng.map.a.01.11', 'eng.pedag'),
    ('eng.map.a.01.12', 'eng.pedag'),
    ('eng.map.a.01.14', 'eng.pedag'),
    ('eng.map.a.05.01', 'eng.pedag'),
    ('eng.map.a.05.02', 'eng.pedag'),
    ('eng.map.a.05.07', 'eng.pedag'),
    ('eng.map.a.03.01', 'eng.product'),
    ('eng.map.a.03.02', 'eng.product'),
    ('eng.map.a.03.03', 'eng.product'),
    ('eng.map.a.03.04', 'eng.product'),
    ('eng.map.a.03.05', 'eng.product'),
    ('eng.map.a.03.06', 'eng.product'),
    ('eng.map.a.03.07', 'eng.product'),
    ('eng.map.a.03.08', 'eng.product'),
    ('eng.map.a.03.09', 'eng.product'),
    ('eng.map.a.03.10', 'eng.product'),
    ('eng.map.a.03.11', 'eng.product'),
    ('eng.map.a.03.12', 'eng.product'),
    ('eng.map.a.05.03', 'eng.product'),
    ('eng.map.a.05.04', 'eng.product'),
    ('eng.map.a.05.06', 'eng.product'),
    ('eng.map.f.03', 'eng.product'),
    ('eng.map.a.02.01', 'eng.recept'),
    ('eng.map.a.02.02', 'eng.recept'),
    ('eng.map.a.02.03', 'eng.recept'),
    ('eng.map.a.02.04', 'eng.recept'),
    ('eng.map.a.02.05', 'eng.recept'),
    ('eng.map.a.02.06', 'eng.recept'),
    ('eng.map.a.02.07', 'eng.recept'),
    ('eng.map.a.02.08', 'eng.recept'),
    ('eng.map.a.02.09', 'eng.recept'),
    ('eng.map.a.02.10', 'eng.recept'),
    ('eng.map.a.02.11', 'eng.recept'),
    ('eng.map.a.02.12', 'eng.recept'),
    ('eng.map.f.02', 'eng.recept'),
    ('math.map.a.01.05', 'math.alg'),
    ('math.map.a.01.06', 'math.alg'),
    ('math.map.a.01.09', 'math.alg'),
    ('math.map.a.01.10', 'math.alg'),
    ('math.map.a.01.07', 'math.analysis'),
    ('math.map.a.01.11', 'math.analysis'),
    ('math.map.a.04.06', 'math.analysis'),
    ('math.map.a.04.07', 'math.analysis'),
    ('math.map.a.04.03', 'math.apply'),
    ('math.map.f.04', 'math.apply'),
    ('math.map.a.03.10', 'math.comp'),
    ('math.map.a.02.01', 'math.geometry'),
    ('math.map.a.02.02', 'math.geometry'),
    ('math.map.a.02.03', 'math.geometry'),
    ('math.map.a.02.04', 'math.geometry'),
    ('math.map.a.02.05', 'math.geometry'),
    ('math.map.a.02.06', 'math.geometry'),
    ('math.map.a.02.07', 'math.geometry'),
    ('math.map.a.02.08', 'math.geometry'),
    ('math.map.a.02.09', 'math.geometry'),
    ('math.map.a.02.10', 'math.geometry'),
    ('math.map.a.02.11', 'math.geometry'),
    ('math.map.a.02.14', 'math.geometry'),
    ('math.map.a.04.08', 'math.geometry'),
    ('math.map.f.02', 'math.geometry'),
    ('math.map.a.04.01', 'math.logic'),
    ('math.map.a.04.04', 'math.logic'),
    ('math.map.a.01.01', 'math.num'),
    ('math.map.a.01.02', 'math.num'),
    ('math.map.a.01.03', 'math.num'),
    ('math.map.a.01.04', 'math.num'),
    ('math.map.a.01.12', 'math.num'),
    ('math.map.a.01.13', 'math.num'),
    ('math.map.a.01.14', 'math.num'),
    ('math.map.a.01.15', 'math.num'),
    ('math.map.a.01.16', 'math.num'),
    ('math.map.a.01.18', 'math.num'),
    ('math.map.a.04.05', 'math.num'),
    ('math.map.f.01', 'math.num'),
    ('math.map.a.04.02', 'math.or'),
    ('math.map.a.03.01', 'math.prosta'),
    ('math.map.a.03.02', 'math.prosta'),
    ('math.map.a.03.03', 'math.prosta'),
    ('math.map.a.03.04', 'math.prosta'),
    ('math.map.a.03.05', 'math.prosta'),
    ('math.map.a.03.06', 'math.prosta'),
    ('math.map.a.03.07', 'math.prosta'),
    ('math.map.a.03.08', 'math.prosta'),
    ('math.map.a.03.09', 'math.prosta'),
    ('math.map.a.03.11', 'math.prosta'),
    ('math.map.a.03.12', 'math.prosta'),
    ('math.map.a.03.13', 'math.prosta'),
    ('math.map.f.03', 'math.prosta'),
    ('math.map.a.01.08', 'math.seq'),
    ('phys.map.a.01.06', 'phys.ac'),
    ('phys.map.a.04.01', 'phys.ac'),
    ('phys.map.a.04.02', 'phys.ac'),
    ('phys.map.a.04.09', 'phys.ac'),
    ('phys.map.a.05.01', 'phys.atomol'),
    ('phys.map.a.05.05', 'phys.condmat'),
    ('phys.map.a.03.01', 'phys.em'),
    ('phys.map.a.03.02', 'phys.em'),
    ('phys.map.a.03.03', 'phys.em'),
    ('phys.map.a.03.04', 'phys.em'),
    ('phys.map.a.03.05', 'phys.em'),
    ('phys.map.a.03.06', 'phys.em'),
    ('phys.map.a.03.07', 'phys.em'),
    ('phys.map.a.03.08', 'phys.em'),
    ('phys.map.a.03.09', 'phys.em'),
    ('phys.map.f.03', 'phys.em'),
    ('phys.map.a.01.01', 'phys.mech'),
    ('phys.map.a.01.02', 'phys.mech'),
    ('phys.map.a.01.03', 'phys.mech'),
    ('phys.map.a.01.04', 'phys.mech'),
    ('phys.map.a.01.05', 'phys.mech'),
    ('phys.map.a.01.07', 'phys.mech'),
    ('phys.map.a.01.08', 'phys.mech'),
    ('phys.map.a.01.09', 'phys.mech'),
    ('phys.map.a.01.10', 'phys.mech'),
    ('phys.map.a.01.11', 'phys.mech'),
    ('phys.map.a.01.12', 'phys.mech'),
    ('phys.map.f.01', 'phys.mech'),
    ('phys.map.a.05.04', 'phys.nucle'),
    ('phys.map.a.04.03', 'phys.opt'),
    ('phys.map.a.04.04', 'phys.opt'),
    ('phys.map.a.04.05', 'phys.opt'),
    ('phys.map.a.04.06', 'phys.opt'),
    ('phys.map.a.04.07', 'phys.opt'),
    ('phys.map.a.04.08', 'phys.opt'),
    ('phys.map.a.04.10', 'phys.opt'),
    ('phys.map.f.04', 'phys.opt'),
    ('phys.map.a.05.02', 'phys.theo'),
    ('phys.map.a.05.03', 'phys.theo'),
    ('phys.map.f.05', 'phys.theo'),
    ('phys.map.a.02.01', 'phys.thermo'),
    ('phys.map.a.02.02', 'phys.thermo'),
    ('phys.map.a.02.03', 'phys.thermo'),
    ('phys.map.a.02.04', 'phys.thermo'),
    ('phys.map.a.02.05', 'phys.thermo'),
    ('phys.map.a.02.06', 'phys.thermo'),
    ('phys.map.a.02.07', 'phys.thermo'),
    ('phys.map.a.02.08', 'phys.thermo'),
    ('phys.map.f.02', 'phys.thermo');

UPDATE ontology.knowledge_area SET branch_id = NULL;

UPDATE ontology.knowledge_area a
   SET branch_id = b.id
  FROM w4a_area_branch_seed v
  JOIN ontology.knowledge_branch b ON b.code = v.branch_code
 WHERE a.code = v.area_code
   AND a.subject_id = b.subject_id;

-- ---------------------------------------------------------------------------
-- 4. K12 延续性区间：由 branch 子树下已映射 knowledge_area.grade_level 推导。
--    无 K12 落位的纯学科纵深节点保持 NULL。
-- ---------------------------------------------------------------------------
WITH RECURSIVE branch_tree AS (
  SELECT b.id AS root_id, b.id AS branch_id
    FROM ontology.knowledge_branch b
  UNION ALL
  SELECT bt.root_id, child.id
    FROM branch_tree bt
    JOIN ontology.knowledge_branch child ON child.parent_id = bt.branch_id
),
grade_span AS (
  SELECT bt.root_id, MIN(a.grade_level)::int AS grade_min, MAX(a.grade_level)::int AS grade_max
    FROM branch_tree bt
    JOIN ontology.knowledge_area a ON a.branch_id = bt.branch_id
   WHERE a.grade_level BETWEEN 1 AND 12
   GROUP BY bt.root_id
)
UPDATE ontology.knowledge_branch b
   SET k12_grade_min = span.grade_min,
       k12_grade_max = span.grade_max
  FROM grade_span span
 WHERE b.id = span.root_id;

UPDATE ontology.knowledge_branch b
   SET k12_grade_min = NULL,
       k12_grade_max = NULL
 WHERE NOT EXISTS (
   WITH RECURSIVE branch_tree AS (
     SELECT b0.id AS branch_id
       FROM ontology.knowledge_branch b0
      WHERE b0.id = b.id
     UNION ALL
     SELECT child.id
       FROM branch_tree bt
       JOIN ontology.knowledge_branch child ON child.parent_id = bt.branch_id
   )
   SELECT 1
     FROM branch_tree bt
     JOIN ontology.knowledge_area a ON a.branch_id = bt.branch_id
    WHERE a.grade_level BETWEEN 1 AND 12
 );

-- ---------------------------------------------------------------------------
-- 5. 权威表和落位完整性断言（失败即回滚，不允许半落位提交）。
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  bad_count INTEGER;
  subject_spec RECORD;
BEGIN
  SELECT COUNT(*) INTO bad_count
    FROM ontology.knowledge_branch b
    LEFT JOIN LATERAL regexp_split_to_table(b.clc, '\s*;\s*') AS anchor(clc) ON TRUE
    LEFT JOIN (VALUES ('O11'), ('O119'), ('O12'), ('O14'), ('O15'), ('O17'), ('O18'), ('O19'), ('O21'), ('O22'), ('O23'), ('O24'), ('O29'), ('O3'), ('O4-3'), ('O41'), ('O42'), ('O43'), ('O44'), ('O46'), ('O469'), ('O47'), ('O48'), ('O55'), ('O56'), ('O57'), ('O59'), ('O6-0'), ('O6-3'), ('O61'), ('O62'), ('O63'), ('O64'), ('O65'), ('O69'), ('Q-3'), ('Q2'), ('Q3'), ('Q4'), ('Q5'), ('Q7'), ('Q81'), ('[Q89]'), ('Q93'), ('Q94'), ('Q95'), ('Q98'), ('H0'), ('H1'), ('H109.2'), ('H11'), ('H12'), ('H13'), ('H14'), ('H15'), ('I0'), ('I1'), ('I2'), ('I3/7'), ('I206'), ('I206.6'), ('I206.7'), ('I207'), ('I22'), ('I24'), ('I26'), ('H3'), ('H31'), ('H311'), ('H312'), ('H313'), ('H314'), ('H315'), ('H315.9'), ('H319'), ('H319.9'), ('K'), ('K892'))
      AS authority(clc) ON authority.clc = btrim(anchor.clc)
   WHERE b.clc IS NULL
      OR btrim(b.clc) = ''
      OR btrim(anchor.clc) = ''
      OR authority.clc IS NULL;
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'knowledge_branch: % CLC anchors are empty or not traceable', bad_count;
  END IF;

  FOR subject_spec IN
    SELECT * FROM (VALUES
      ('MATH', 10), ('PHYS', 10), ('CHEM', 8),
      ('BIO', 9), ('CHN', 9), ('ENG', 7)
    ) AS expected(subject_code, peak_count)
  LOOP
    SELECT COUNT(*) INTO bad_count
      FROM ontology.knowledge_branch b
      JOIN ontology.subject s ON s.id = b.subject_id
     WHERE s.code = subject_spec.subject_code
       AND b.parent_id IS NULL;
    IF bad_count <> subject_spec.peak_count THEN
      RAISE EXCEPTION 'knowledge_branch %: expected % peaks, got %',
        subject_spec.subject_code, subject_spec.peak_count, bad_count;
    END IF;
  END LOOP;

  SELECT COUNT(*) INTO bad_count
    FROM ontology.textbook_chapter
   WHERE branch_id IS NULL;
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'textbook_chapter: % rows without branch_id', bad_count;
  END IF;

  SELECT COUNT(*) INTO bad_count
    FROM ontology.knowledge_area
   WHERE branch_id IS NULL;
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'knowledge_area: % rows without branch_id', bad_count;
  END IF;

  IF (SELECT k12_grade_min FROM ontology.knowledge_branch WHERE code = 'math.analysis') <> 10
     OR (SELECT k12_grade_max FROM ontology.knowledge_branch WHERE code = 'math.analysis') <> 12 THEN
    RAISE EXCEPTION 'math.analysis K12 span must be derived as 10-12';
  END IF;
END $$;

COMMIT;
